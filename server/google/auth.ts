// Google OAuth for an installed app: authorization code + PKCE, loopback redirect to this server.
// Minimal scope « calendar.app.created »: the Cockpit only sees the calendars it created itself.
import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.ts";
import { readJson, writeJsonAtomic } from "../core/safe-write.ts";
import { googleFile } from "./files.ts";

const SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const redirectUri = () => `http://localhost:${config().server.port}/api/google/callback`;

interface OAuthClient {
  client_id: string;
  client_secret: string;
}

function oauthClient(): OAuthClient {
  const file = readJson<{ installed?: OAuthClient; web?: OAuthClient }>(googleFile.client());
  const client = file?.installed ?? file?.web;
  if (!client) throw new Error(`Fichier client Google absent : ${googleFile.client()}`);
  return client;
}

const base64Url = (buffer: Buffer) => buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const pending = new Map<string, { verifier: string; at: number }>();
const PENDING_TTL_MS = 10 * 60_000;

export function authorizationUrl(): string {
  const verifier = base64Url(randomBytes(48));
  const state = base64Url(randomBytes(18));
  pending.set(state, { verifier, at: Date.now() });
  const params = new URLSearchParams({
    client_id: oauthClient().client_id,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: base64Url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

let accessToken: { value: string; expiresAt: number } | null = null;

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  return { ok: response.ok, json };
}

/** Exchanges the code received on the redirect for a refresh token (stored in 0600). */
export async function completeAuthorization(code: string, state: string): Promise<void> {
  const request = pending.get(state);
  pending.delete(state);
  if (!request || Date.now() - request.at > PENDING_TTL_MS)
    throw new Error("Demande de connexion inconnue ou expirée : recommence depuis le Cockpit.");
  const { client_id, client_secret } = oauthClient();
  const { ok, json } = await tokenRequest({
    code,
    client_id,
    client_secret,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
    code_verifier: request.verifier,
  });
  if (!ok || !json.refresh_token) throw new Error(json.error_description ?? json.error ?? "Pas de jeton de rafraîchissement reçu");
  await writeJsonAtomic(googleFile.token(), { refresh_token: json.refresh_token, obtainedAt: new Date().toISOString() });
  accessToken = { value: json.access_token!, expiresAt: Date.now() + (json.expires_in ?? 3000) * 1000 };
}

/** Valid access token (refreshed one minute before expiry). */
export async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < accessToken.expiresAt - 60_000) return accessToken.value;
  const stored = readJson<{ refresh_token: string }>(googleFile.token());
  if (!stored) throw new Error("Google pas connecté");
  const { client_id, client_secret } = oauthClient();
  const { ok, json } = await tokenRequest({ client_id, client_secret, refresh_token: stored.refresh_token, grant_type: "refresh_token" });
  if (!ok || !json.access_token)
    throw new Error(`Jeton Google refusé (${json.error_description ?? json.error ?? "erreur"}) : reconnecte Google depuis le Cockpit.`);
  accessToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3000) * 1000 };
  return accessToken.value;
}

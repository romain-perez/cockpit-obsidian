import assert from "node:assert/strict";
import { test } from "node:test";
import { pickHyprlandInstance, type HyprlandInstance } from "../server/desktop.ts";

const instance = (signature: string, started: number, alive = true): HyprlandInstance => ({ signature, alive, started });

test("Hyprland : garde l'instance héritée si elle tourne encore", () => {
  assert.equal(pickHyprlandInstance("a", [instance("a", 1), instance("b", 2)]), "a");
});

test("Hyprland : service lancé avant Hyprland (pas de variable) → instance en cours", () => {
  assert.equal(pickHyprlandInstance(undefined, [instance("a", 1)]), "a");
});

test("Hyprland : instance héritée arrêtée → la plus récente encore en vie", () => {
  assert.equal(pickHyprlandInstance("old", [instance("old", 1, false), instance("b", 5), instance("c", 9)]), "c");
});

test("Hyprland : aucune instance en vie → rien", () => {
  assert.equal(pickHyprlandInstance("a", [instance("a", 1, false)]), null);
  assert.equal(pickHyprlandInstance(undefined, []), null);
});

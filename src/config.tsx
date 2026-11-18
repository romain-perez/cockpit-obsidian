// Public configuration of the server (vault name, file names, optional features), shared by every component.
import { createContext, useContext } from "react";
import type { PublicConfig } from "../shared/types.ts";

export const ConfigContext = createContext<PublicConfig | null>(null);

export function useConfig(): PublicConfig {
  const config = useContext(ConfigContext);
  if (!config) throw new Error("useConfig() outside of <ConfigContext.Provider>");
  return config;
}

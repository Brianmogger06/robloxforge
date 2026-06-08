import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RgbColor { r: number; g: number; b: number }

export interface Config {
  port: number;
  projectRoot: string;
  enableBlindspotPlugin: boolean;
  autoWaypoint: boolean;
  rejectDefaultMaterials: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
  palette?: Record<string, RgbColor>;
}

const DEFAULTS: Config = {
  port: 44755,
  projectRoot: "",
  enableBlindspotPlugin: false,
  autoWaypoint: true,
  rejectDefaultMaterials: true,
  logLevel: "info",
};

export function loadConfig(): Config {
  const configPath = resolve(__dirname, "../robloxforge.config.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) } as Config;
  } catch {
    return { ...DEFAULTS };
  }
}

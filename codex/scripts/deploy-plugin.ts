import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const LOCALAPPDATA = process.env["LOCALAPPDATA"];
if (!LOCALAPPDATA) {
  console.error("LOCALAPPDATA is not set. This script must run on Windows.");
  process.exit(1);
}

const src = join(__dirname, "..", "plugin", "RobloxForgePlugin.luau");
const pluginsDir = join(LOCALAPPDATA, "Roblox", "Plugins");
const dst = join(pluginsDir, "RobloxForgePlugin.luau");

if (!existsSync(pluginsDir)) {
  mkdirSync(pluginsDir, { recursive: true });
}

copyFileSync(src, dst);
console.log(`[deploy] Plugin deployed → ${dst}`);

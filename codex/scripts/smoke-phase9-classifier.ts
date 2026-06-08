import { classifyStyle, classifyRoom, suggestProps, recognizeEnvironment } from "../src/build/classifiers.js";
import { STYLE_PRESETS } from "../src/build/style_engine.js";
import { ROOM_PRESETS } from "../src/build/semantic_rooms.js";
import * as path from "path";
import * as fs from "fs";

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else       { console.error(`  ✗ ${label}`); fail++; }
}

console.log("=== Phase 9: Reference Intelligence ===");

// ── Static logic tests (no image file needed) ─────────────────────────────────

// Verify all style preset names are valid StyleNames
const { listStyles } = await import("../src/build/style_engine.js");
const styleNames = listStyles().map(s => s.name);
assert("listStyles returns 8 styles",    styleNames.length === 8);
assert("listStyles includes prison",     styleNames.includes("prison"));
assert("listStyles includes sci-fi",     styleNames.includes("sci-fi"));
assert("listStyles includes hospital",   styleNames.includes("hospital"));

// Verify all room presets are covered
const roomKinds = Object.keys(ROOM_PRESETS);
assert("ROOM_PRESETS has hallway",   roomKinds.includes("hallway"));
assert("ROOM_PRESETS has cafeteria", roomKinds.includes("cafeteria"));
assert("ROOM_PRESETS has yard",      roomKinds.includes("yard"));
assert("ROOM_PRESETS has lab",       roomKinds.includes("lab"));

// Verify STYLE_PRESETS propTags exist and are arrays
for (const [sname, preset] of Object.entries(STYLE_PRESETS)) {
  assert(`STYLE_PRESETS.${sname}.propTags is array`, Array.isArray(preset.propTags));
}

// ── Image-based tests using a real fixture PNG ─────────────────────────────────

// Create a tiny grey test image fixture using sharp raw buffer
import sharp from "sharp";

const fixturesDir = path.join(process.cwd(), "scripts", "fixtures");
if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });

// grey_room: very grey, low brightness → should lean prison/industrial
const greyImagePath  = path.join(fixturesDir, "grey_room.png");
// bright_warm: high brightness, warm tones → should lean school/residential
const warmImagePath  = path.join(fixturesDir, "warm_bright.png");

async function makeGreyPng(fpath: string, r: number, g: number, b: number) {
  if (fs.existsSync(fpath)) return;
  const w = 64, h = 64;
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { buf[i*3] = r; buf[i*3+1] = g; buf[i*3+2] = b; }
  await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toFile(fpath);
}

await makeGreyPng(greyImagePath, 90, 90, 90);   // grey
await makeGreyPng(warmImagePath, 220, 180, 100); // warm/bright

// classify_style on grey image
const greyStyle = await classifyStyle(greyImagePath);
assert("classifyStyle returns style field",      typeof greyStyle.style === "string");
assert("classifyStyle returns confidence 0–1",   greyStyle.confidence >= 0 && greyStyle.confidence <= 1);
assert("classifyStyle returns scores object",    typeof greyStyle.scores === "object" && greyStyle.scores !== null);
assert("classifyStyle grey → prison or industrial",
  greyStyle.style === "prison" || greyStyle.style === "industrial");

// classify_style on warm image
const warmStyle = await classifyStyle(warmImagePath);
assert("classifyStyle warm → school/residential/hospital",
  ["school","residential","hospital","office"].includes(warmStyle.style));

// classify_room on grey image
const greyRoom = await classifyRoom(greyImagePath);
assert("classifyRoom returns kind field",        typeof greyRoom.kind === "string");
assert("classifyRoom returns confidence 0–1",    greyRoom.confidence >= 0 && greyRoom.confidence <= 1);
assert("classifyRoom grey → cell_block/hallway/security",
  ["cell_block","hallway","security"].includes(greyRoom.kind));

// suggest_props
const props = await suggestProps(greyImagePath);
assert("suggestProps returns propTags array",    Array.isArray(props.propTags));
assert("suggestProps returns basis string",      typeof props.basis === "string");
assert("suggestProps basis includes style=",     props.basis.includes("style="));
assert("suggestProps basis includes room=",      props.basis.includes("room="));

// recognize_environment (full bundle)
const env = await recognizeEnvironment(greyImagePath);
assert("recognizeEnvironment.style is string",   typeof env.style === "string");
assert("recognizeEnvironment.styleConfidence ok",env.styleConfidence >= 0 && env.styleConfidence <= 1);
assert("recognizeEnvironment.rooms is array",    Array.isArray(env.rooms) && env.rooms.length > 0);
assert("recognizeEnvironment.propTags is array", Array.isArray(env.propTags));
assert("recognizeEnvironment.palette.dominant is hex",
  /^#[0-9a-f]{6}$/.test(env.palette.dominant));
assert("recognizeEnvironment.palette.accent is hex",
  /^#[0-9a-f]{6}$/.test(env.palette.accent));

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

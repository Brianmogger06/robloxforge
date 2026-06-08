import { setSessionStyle, getSessionStyle, listStyles, applyStyleToRoomArgs } from "../src/build/style_engine.js";

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else       { console.error(`  ✗ ${label}`); fail++; }
}

console.log("=== Phase 3: Style Engine ===");

// listStyles covers all 8 presets
const styles = listStyles();
assert("8 style presets exist", styles.length === 8);
assert("all presets have propTags", styles.every(s => Array.isArray(s.propTags)));
assert("all presets have materials", styles.every(s => s.materials.wall && s.materials.floor));

// setSessionStyle / getSessionStyle
const prison = setSessionStyle("prison", "testA");
assert("prison style name", prison.name === "prison");
assert("prison wall material is Concrete", prison.materials.wall === "Concrete");
assert("getSessionStyle returns prison", getSessionStyle("testA")?.name === "prison");

const school = setSessionStyle("school", "testB");
assert("session isolation: testB is school", getSessionStyle("testB")?.name === "school");
assert("session isolation: testA still prison", getSessionStyle("testA")?.name === "prison");

// applyStyleToRoomArgs fills missing materials
const baseArgs = { name: "myRoom", sizeXZ: { x: 20, z: 20 } };
const styled = applyStyleToRoomArgs(baseArgs, prison);
assert("prison injects wall=Concrete",  styled.wallMaterial  === "Concrete");
assert("prison injects floor=Concrete", styled.floorMaterial === "Concrete");

// existing values are not overridden
const withOverride = applyStyleToRoomArgs({ ...baseArgs, wallMaterial: "Metal" }, prison);
assert("explicit wallMaterial not overridden", withOverride.wallMaterial === "Metal");

// roomKind defaults: cell_block should get 'Concrete' from prison.roomDefaults
const cellBlock = applyStyleToRoomArgs(baseArgs, prison, "cell_block");
assert("cell_block room default material applied", cellBlock.floorMaterial === "Concrete");

// unknown style throws
let threw = false;
try { setSessionStyle("unicorn" as any); } catch { threw = true; }
assert("unknown style throws", threw);

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

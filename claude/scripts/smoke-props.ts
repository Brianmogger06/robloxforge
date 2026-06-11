// Smoke: prop assembly library + plan expansion + tag-driven contents.
import { PROP_ASSEMBLIES, getAssembly, listPropTags, expandPlans, contentsFromTags } from "../src/build/props.js";
import { planRoomContents, type RoomContent } from "../src/build/composition.js";
import { ROOM_PRESETS } from "../src/build/semantic_rooms.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean): void {
  if (cond) { pass++; } else { fail++; console.error(`FAIL: ${label}`); }
}

// 1. Every assembly: parts within footprint bounds (small tolerance), positive sizes
const TOL = 0.35;
for (const [tag, asm] of Object.entries(PROP_ASSEMBLIES)) {
  check(`${tag}: has parts`, asm.parts.length >= 1);
  check(`${tag}: positive footprint`, asm.footprint.x > 0 && asm.footprint.y > 0 && asm.footprint.z > 0);
  for (const part of asm.parts) {
    check(`${tag}/${part.name}: positive size`, part.size.x > 0 && part.size.y > 0 && part.size.z > 0);
    const xOk = Math.abs(part.offset.x) + part.size.x / 2 <= asm.footprint.x / 2 + TOL;
    const zOk = Math.abs(part.offset.z) + part.size.z / 2 <= asm.footprint.z / 2 + TOL;
    const yOk = part.offset.y + part.size.y / 2 <= asm.footprint.y + TOL && part.offset.y - part.size.y / 2 >= -TOL;
    check(`${tag}/${part.name}: within footprint`, xOk && zOk && yOk);
  }
}

// 2. Every semantic room preset propTag resolves to an assembly OR is a known wall feature
const coveredTags = new Set(listPropTags());
for (const preset of Object.values(ROOM_PRESETS)) {
  for (const tag of preset.propTags) {
    check(`preset ${preset.kind}: tag '${tag}' has assembly`, coveredTags.has(tag));
  }
}

// 3. expandPlans: tagged plan expands into world-positioned sub-parts
const room = { floorPosition: { x: 0, y: 0, z: 0 }, sizeXZ: { x: 40, z: 40 } };
const contents: RoomContent[] = [
  { kind: "focal", size: getAssembly("bunk_bed")!.footprint, tag: "bunk_bed" },
  { kind: "prop", size: getAssembly("chair")!.footprint, tag: "chair" },
  { kind: "prop", size: { x: 2, y: 2, z: 2 } }, // untagged legacy box
];
const plans = planRoomContents(room, contents);
check("plans carry tags", plans.filter(p => p.tag).length === 2);

const expanded = expandPlans(plans);
const bunkParts = expanded.filter(p => p.name?.startsWith("bunk_bed"));
check(`bunk_bed expands to ${getAssembly("bunk_bed")!.parts.length} parts (got ${bunkParts.length})`,
  bunkParts.length === getAssembly("bunk_bed")!.parts.length);
check("untagged passes through", expanded.some(p => !p.tag && p.size.x === 2 && p.size.y === 2));

// sub-part world positions: bottom of lowest part ≈ floor Y
const bunkPlan = plans.find(p => p.tag === "bunk_bed")!;
const bunkBottom = Math.min(...bunkParts.map(p => p.cframe[1] - p.size.y / 2));
check(`bunk bottom at floor (got ${bunkBottom.toFixed(2)})`, Math.abs(bunkBottom - 0) < 0.5);
const bunkCenterX = bunkPlan.cframe[0];
check("sub-parts centered on plan X", bunkParts.every(p => Math.abs(p.cframe[0] - bunkCenterX) <= getAssembly("bunk_bed")!.footprint.x / 2 + TOL));

// 4. rejected plans don't expand
const tiny = { floorPosition: { x: 0, y: 0, z: 0 }, sizeXZ: { x: 4, z: 4 } };
const rejectedPlans = planRoomContents(tiny, [{ kind: "prop", size: { x: 2, y: 2, z: 2 }, tag: "chair" }]);
const rejectedExpanded = expandPlans(rejectedPlans);
check("rejected plans pass through unexpanded", rejectedExpanded.every(p => p.rejected !== undefined));

// 5. transparency carried on glass sub-parts
const mirrorPlans = expandPlans(planRoomContents(room, [{ kind: "fixture", size: getAssembly("mirror")!.footprint, tag: "mirror" }]));
check("mirror glass has transparency", mirrorPlans.some(p => p.transparency !== undefined && p.transparency > 0));

// 6. contentsFromTags: repeatable scales with area, focal doesn't
const small = contentsFromTags(["table", "bunk_bed"], 200);
const large = contentsFromTags(["table", "bunk_bed"], 3000);
const tablesSmall = small.filter(c => c.tag === "table").length;
const tablesLarge = large.filter(c => c.tag === "table").length;
check(`repeatable scales (${tablesSmall} → ${tablesLarge})`, tablesLarge > tablesSmall);
check("focal stays single", large.filter(c => c.tag === "bunk_bed").length === 1);
check("unknown tags skipped", contentsFromTags(["nonexistent_tag"], 1000).length === 0);
check("copies get unique names", new Set(large.map(c => c.name)).size === large.length);

console.log(`\nsmoke-props: ${pass} passed, ${fail} failed (${listPropTags().length} assemblies)`);
if (fail > 0) process.exit(1);

import { planRoomContents } from '../src/build/composition.js';
import { SCALE } from '../src/build/scale.js';

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else       { console.error(`  FAIL  ${label}`); fail++; }
}

const room = { floorPosition: { x: 0, y: 0, z: 0 }, sizeXZ: { x: 40, z: 40 } };

// 1 focal + 4 props
const contents = [
  { kind: 'prop'  as const, size: { x: 2, y: 2, z: 2 } },
  { kind: 'focal' as const, size: { x: 6, y: 4, z: 6 } },
  { kind: 'prop'  as const, size: { x: 2, y: 2, z: 2 } },
  { kind: 'prop'  as const, size: { x: 2, y: 2, z: 2 } },
  { kind: 'prop'  as const, size: { x: 2, y: 2, z: 2 } },
];

const plans = planRoomContents(room, contents);

// Focal should be first in output (sorted to front), at center
const focal = plans.find((_, i) => contents[1].kind === 'focal' && i === 0);
assert('focal is first plan', plans[0] !== undefined);
assert('focal at room center X=0', plans[0].cframe[0] === 0);
assert('focal at room center Z=0', plans[0].cframe[2] === 0);

// All non-rejected positions should be grid-aligned (divisible by SCALE.tile)
const tile = SCALE.tile;
let allGridAligned = true;
for (const p of plans) {
  if (p.rejected) continue;
  if (p.cframe[0] % tile !== 0 || p.cframe[2] % tile !== 0) {
    allGridAligned = false;
    break;
  }
}
assert('all placed positions grid-aligned', allGridAligned);

// No two placed items should overlap
const placed = plans.filter(p => !p.rejected);
let noOverlaps = true;
for (let i = 0; i < placed.length; i++) {
  for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j];
    const aMin = { x: a.cframe[0] - a.size.x/2, y: a.cframe[1] - a.size.y/2, z: a.cframe[2] - a.size.z/2 };
    const aMax = { x: a.cframe[0] + a.size.x/2, y: a.cframe[1] + a.size.y/2, z: a.cframe[2] + a.size.z/2 };
    const bMin = { x: b.cframe[0] - b.size.x/2, y: b.cframe[1] - b.size.y/2, z: b.cframe[2] - b.size.z/2 };
    const bMax = { x: b.cframe[0] + b.size.x/2, y: b.cframe[1] + b.size.y/2, z: b.cframe[2] + b.size.z/2 };
    if (aMin.x < bMax.x && aMax.x > bMin.x && aMin.z < bMax.z && aMax.z > bMin.z) {
      noOverlaps = false;
      break;
    }
  }
}
assert('no placed items overlap', noOverlaps);
assert('all 5 items planned', plans.length === 5);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

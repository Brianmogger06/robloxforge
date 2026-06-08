/**
 * B4 smoke test — verifies the clearance-tracking contract for build_composite.
 *
 * B4 root cause: build_composite was calling getByPath to recover just-created parts
 * for the collision list, which could fail or return a wrong instance. The fix tracks
 * {center, size} directly from partArgs (no round-trip needed).
 *
 * We verify the TS-side contract here using placement.ts primitives (the same math
 * the Luau fix uses). Actual Luau execution is verified by manual Studio smoke test
 * described at the bottom.
 */
import { expandBounds, boxesOverlap } from '../src/build/placement.js';

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else       { console.error(`  FAIL  ${label}`); fail++; }
}

// Simulate the placedBounds tracking logic: given a list of part specs,
// replicate what the Luau build_composite now does — track bounds from args,
// check collisions inline, record rejections.

interface PartSpec {
  position: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
}

interface PlacementResult {
  index: number;
  placed: boolean;
  reason?: string;
}

function simulateComposite(parts: PartSpec[]): PlacementResult[] {
  const placedBounds: Array<{ min: {x:number,y:number,z:number}, max: {x:number,y:number,z:number} }> = [];
  const results: PlacementResult[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const aabb = expandBounds(part.position, part.size);

    let collides = false;
    for (const existing of placedBounds) {
      if (boxesOverlap(aabb, existing)) { collides = true; break; }
    }

    if (collides) {
      results.push({ index: i, placed: false, reason: 'clearance' });
    } else {
      placedBounds.push(aabb);
      results.push({ index: i, placed: true });
    }
  }

  return results;
}

// --- Test 1: non-overlapping parts — all placed
const nonOverlapping = simulateComposite([
  { position: { x: 0, y: 0, z: 0 },  size: { x: 4, y: 4, z: 4 } },
  { position: { x: 8, y: 0, z: 0 },  size: { x: 4, y: 4, z: 4 } },
  { position: { x: 0, y: 0, z: 8 },  size: { x: 4, y: 4, z: 4 } },
]);
assert('non-overlapping parts: all placed', nonOverlapping.every(r => r.placed));

// --- Test 2: two parts at same position — second rejected
const samePos = simulateComposite([
  { position: { x: 0, y: 0, z: 0 }, size: { x: 4, y: 4, z: 4 } },
  { position: { x: 0, y: 0, z: 0 }, size: { x: 4, y: 4, z: 4 } },
]);
assert('same-position parts: first placed', samePos[0].placed);
assert('same-position parts: second rejected with clearance', !samePos[1].placed && samePos[1].reason === 'clearance');

// --- Test 3: partially overlapping parts — second rejected
const partialOverlap = simulateComposite([
  { position: { x: 0, y: 0, z: 0 }, size: { x: 4, y: 4, z: 4 } },
  { position: { x: 2, y: 0, z: 0 }, size: { x: 4, y: 4, z: 4 } }, // overlaps by 2 studs
]);
assert('partial overlap: first placed', partialOverlap[0].placed);
assert('partial overlap: second rejected', !partialOverlap[1].placed);

// --- Test 4: touching but not overlapping — both placed
// AABB overlap is strict (<, >), so touching faces (min == max) don't collide
const touching = simulateComposite([
  { position: { x: 0, y: 0, z: 0 }, size: { x: 4, y: 4, z: 4 } }, // max.x = 2
  { position: { x: 4, y: 0, z: 0 }, size: { x: 4, y: 4, z: 4 } }, // min.x = 2
]);
assert('touching faces: both placed (strict inequality)', touching.every(r => r.placed));

// --- Test 5: third part collides only with second — correct tracking
const chainCollision = simulateComposite([
  { position: { x: 0,  y: 0, z: 0 }, size: { x: 4, y: 4, z: 4 } },
  { position: { x: 8,  y: 0, z: 0 }, size: { x: 4, y: 4, z: 4 } },
  { position: { x: 9,  y: 0, z: 0 }, size: { x: 4, y: 4, z: 4 } }, // overlaps part 2
]);
assert('chain collision: parts 1+2 placed', chainCollision[0].placed && chainCollision[1].placed);
assert('chain collision: part 3 rejected', !chainCollision[2].placed);

// --- Test 6: single part — always placed
const singlePart = simulateComposite([
  { position: { x: 0, y: 0, z: 0 }, size: { x: 4, y: 4, z: 4 } },
]);
assert('single part: placed', singlePart[0].placed);

// --- Test 7: empty composite — no results
const emptyComposite = simulateComposite([]);
assert('empty composite: zero results', emptyComposite.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`
Manual Studio verification for B4:
  1. Call build_composite({ parentPath:"Workspace", parts:[
       { name:"A", position:{x:0,y:2,z:0}, size:{x:4,y:4,z:4}, color:"#ff0000" },
       { name:"B", position:{x:0,y:2,z:0}, size:{x:4,y:4,z:4}, color:"#0000ff" }
     ]})
     → Response should include rejected:[{index:1, reason:"clearance"}]
     → Only part A should appear in Workspace

  2. Call build_composite with parts spaced 8 studs apart:
     → All parts placed, no rejections
`);
process.exit(fail > 0 ? 1 : 0);

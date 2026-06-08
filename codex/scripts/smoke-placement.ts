import { snapScalar, snapV3, expandBounds, boxesOverlap } from '../src/build/placement.js';

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else       { console.error(`  FAIL  ${label}`); fail++; }
}

// snapScalar
assert('snap 0 → 0',           snapScalar(0, 4) === 0);
assert('snap 3.7 → 4',         snapScalar(3.7, 4) === 4);
assert('snap 2.0 → 4',         snapScalar(2.0, 4) === 4);  // halfway rounds up
assert('snap 2.1 → 4',         snapScalar(2.1, 4) === 4);
assert('snap -1.9 → 0',        snapScalar(-1.9, 4) === 0);
assert('snap -2.1 → -4',       snapScalar(-2.1, 4) === -4);
assert('snap idempotent 4 → 4', snapScalar(snapScalar(3.7, 4), 4) === 4);
assert('tile=0 returns n',      snapScalar(3.7, 0) === 3.7);

// snapV3 axis selection
const snapped = snapV3({ x: 3.7, y: 1.1, z: 5.9 }, { tile: 4, axes: ['x', 'z'] });
assert('snapV3 x snapped',      snapped.x === 4);
assert('snapV3 y untouched',    snapped.y === 1.1);
assert('snapV3 z snapped',      snapped.z === 4);  // 5.9/4=1.475, rounds to 1*4=4

// boxesOverlap
const a = expandBounds({ x: 0, y: 0, z: 0 }, { x: 4, y: 4, z: 4 });
const b = expandBounds({ x: 4, y: 0, z: 0 }, { x: 4, y: 4, z: 4 });  // touching face
const c = expandBounds({ x: 3, y: 0, z: 0 }, { x: 4, y: 4, z: 4 });  // 1-stud penetration
const d = expandBounds({ x: 0, y: 8, z: 0 }, { x: 4, y: 4, z: 4 });  // above, no touch

assert('touching faces do not collide', !boxesOverlap(a, b));
assert('1-stud penetration collides',    boxesOverlap(a, c));
assert('separated boxes do not collide', !boxesOverlap(a, d));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

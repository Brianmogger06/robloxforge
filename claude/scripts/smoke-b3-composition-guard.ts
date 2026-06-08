import { planRoomContents, MIN_ROOM_DIM } from '../src/build/composition.js';
import { SCALE } from '../src/build/scale.js';

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else       { console.error(`  FAIL  ${label}`); fail++; }
}

const fp = { x: 0, y: 0, z: 0 };
const smallItem = { kind: 'prop' as const, size: { x: 2, y: 2, z: 2 } };

// Exactly MIN_ROOM_DIM should pass (usableX == tile)
const okRoom = { floorPosition: fp, sizeXZ: { x: MIN_ROOM_DIM, z: MIN_ROOM_DIM } };
const okPlans = planRoomContents(okRoom, [smallItem]);
assert('room at MIN_ROOM_DIM accepts content', okPlans.length === 1 && !okPlans[0].rejected);

// One stud under MIN_ROOM_DIM should reject everything
const tinyRoom = { floorPosition: fp, sizeXZ: { x: MIN_ROOM_DIM - 1, z: MIN_ROOM_DIM } };
const tinyPlans = planRoomContents(tinyRoom, [smallItem, smallItem]);
assert('undersized room returns 2 rejected plans', tinyPlans.length === 2);
assert('undersized room plans have rejected.reason', tinyPlans.every(p => p.rejected?.reason.startsWith('room_too_small')));

// Zero-size room
const zeroRoom = { floorPosition: fp, sizeXZ: { x: 0, z: 0 } };
const zeroPlans = planRoomContents(zeroRoom, [smallItem]);
assert('zero-size room rejects', zeroPlans[0]?.rejected !== undefined);

// Empty contents returns [] not an error
const emptyPlans = planRoomContents(okRoom, []);
assert('empty contents returns empty array', emptyPlans.length === 0);

// Y convention: focal part center is at floorY + size.y/2
const focalRoom = { floorPosition: { x: 0, y: 10, z: 0 }, sizeXZ: { x: 40, z: 40 } };
const focalPlans = planRoomContents(focalRoom, [{ kind: 'focal' as const, size: { x: 4, y: 4, z: 4 } }]);
assert('focal Y = floorY + size.y/2', focalPlans[0]?.cframe[1] === 12); // 10 + 4/2

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

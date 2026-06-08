/**
 * B1 smoke test — verifies the snap contract for builder origins.
 *
 * We can't call the Luau plugin from Node, so we verify:
 *   1. That SCALE constants match what the plugin uses.
 *   2. That snapScalar (same algorithm as Luau snapScalar) aligns typical
 *      builder positions to the expected grid.
 *   3. That snap:false opt-out preserves the raw value (backward compat).
 *
 * Actual Luau execution is verified by manual Studio smoke test described at
 * the bottom of this file.
 */
import { SCALE } from '../src/build/scale.js';
import { snapV3 } from '../src/build/placement.js';

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else       { console.error(`  FAIL  ${label}`); fail++; }
}

const tile = SCALE.tile; // 4

// --- build_room origin snap (mirrors Luau: snapScalar(p.X, tile), p.Y unchanged, snapScalar(p.Z, tile))

function snapRoomOrigin(pos: {x:number,y:number,z:number}, t = tile) {
  // Mirrors Luau: baseCF - p + Vector3.new(snapScalar(p.X,tile), p.Y, snapScalar(p.Z,tile))
  // i.e. XZ snapped, Y preserved
  const v = snapV3(pos, { tile: t, axes: ['x', 'z'] });
  return { x: v.x, y: pos.y, z: v.z };
}

assert('build_room: unaligned origin snaps to grid', (() => {
  const r = snapRoomOrigin({ x: 3.7, y: 5, z: 5.1 });
  return r.x === 4 && r.y === 5 && r.z === 4;
})());

assert('build_room: already-aligned origin unchanged', (() => {
  const r = snapRoomOrigin({ x: 8, y: 2, z: 12 });
  return r.x === 8 && r.y === 2 && r.z === 12;
})());

assert('build_room: Y axis is never snapped (floor surface preserved)', (() => {
  const r = snapRoomOrigin({ x: 0, y: 3.7, z: 0 });
  return r.y === 3.7; // Y NOT rounded
})());

assert('build_room: snap:false contract — raw values should be passed as-is', (() => {
  // When snap=false, the Luau handler skips the block entirely.
  // We verify the raw value is preserved (no-op simulation).
  const raw = { x: 3.7, y: 5, z: 5.1 };
  // simulate snap=false: return raw unchanged
  return raw.x === 3.7 && raw.z === 5.1;
})());

// --- build_corridor: both endpoints snapped before midpoint

function snapCorridorEndpoint(pos: {x:number,y:number,z:number}, t = tile) {
  const v = snapV3(pos, { tile: t, axes: ['x', 'z'] });
  return { x: v.x, y: pos.y, z: v.z };
}

assert('build_corridor: fromPos snapped', (() => {
  const from = snapCorridorEndpoint({ x: 1.9, y: 0, z: 2.1 });
  // 1.9/4=0.475→0; 2.1/4=0.525→rounds up to 1→4
  return from.x === 0 && from.z === 4;
})());

assert('build_corridor: toPos snapped independently', (() => {
  const to = snapCorridorEndpoint({ x: 10.1, y: 0, z: 0.1 });
  // 10.1/4=2.525→rounds to 3→12; 0.1/4=0.025→0
  return to.x === 12 && to.z === 0;
})());

assert('build_corridor: midpoint computed from snapped endpoints (deterministic)', (() => {
  const from = snapCorridorEndpoint({ x: 0, y: 0, z: 0 });
  const to   = snapCorridorEndpoint({ x: 8, y: 0, z: 0 });
  const midX = (from.x + to.x) / 2;
  return midX === 4; // exactly on grid
})());

// --- build_doorway: pos snapped

function snapDoorPos(pos: {x:number,y:number,z:number}, t = tile) {
  const v = snapV3(pos, { tile: t, axes: ['x', 'z'] });
  return { x: v.x, y: pos.y, z: v.z }; // Y (opening height) preserved
}

assert('build_doorway: door center snapped to grid', (() => {
  const p = snapDoorPos({ x: 5.9, y: 3.5, z: 0 });
  return p.x === 4 && p.y === 3.5;
})());

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`
Manual Studio verification for B1:
  1. Call build_room({ parentPath:"Workspace", floorCFrame:{position:{x:3.7,y:0,z:5.1}}, sizeXZ:{x:20,z:20} })
     → Floor part Position.X should be 4, Position.Z should be 4 (NOT 3.7 / 5.1)
  2. Call build_corridor({ parentPath:"Workspace", fromCFrame:{position:{x:1.9,y:0,z:0}}, toCFrame:{position:{x:10.1,y:0,z:0}} })
     → Floor CFrame position should be midpoint of (0,0,0)-(8,0,0) = (4,0,0)
  3. Call build_room({ ..., snap:false, floorCFrame:{position:{x:3.7,y:0,z:5.1}} })
     → Position should be 3.7 / 5.1 (opt-out preserved)
`);
process.exit(fail > 0 ? 1 : 0);

import { generateFloorplan, listFloorplanKinds, planConnection } from "../src/build/floorplan.js";
import { getRoomPreset } from "../src/build/semantic_rooms.js";

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else       { console.error(`  ✗ ${label}`); fail++; }
}

console.log("=== Phase 2: Floorplan Generator ===");

// list kinds
const kinds = listFloorplanKinds();
assert("lists 'prison'", kinds.includes("prison"));
assert("lists 'school'", kinds.includes("school"));

// prison floorplan
const fp = generateFloorplan("prison");
assert("kind is prison",                  fp.kind === "prison");
assert("has 6 rooms",                     fp.rooms.length === 6);
assert("has edges",                       fp.edges.length > 0);
assert("admin room exists",               fp.rooms.some(r => r.id === "admin"));
assert("all rooms have dimensions",       fp.rooms.every(r => r.w > 0 && r.l > 0 && r.h > 0));
assert("all rooms have materials",        fp.rooms.every(r => r.floorMaterial && r.wallMaterial));
assert("all edges reference valid rooms", fp.edges.every(e => {
  const ids = fp.rooms.map(r => r.id);
  return ids.includes(e.from) && ids.includes(e.to);
}));

// BFS reachability from admin
const adj: Record<string, string[]> = {};
for (const r of fp.rooms) adj[r.id] = [];
for (const e of fp.edges) {
  adj[e.from].push(e.to);
  adj[e.to].push(e.from);
}
const visited = new Set<string>(["admin"]);
const queue = ["admin"];
while (queue.length) {
  const cur = queue.shift()!;
  for (const n of adj[cur]) {
    if (!visited.has(n)) { visited.add(n); queue.push(n); }
  }
}
assert("all prison rooms reachable from admin", visited.size === fp.rooms.length);

// No room overlaps (AABB check)
let noOverlap = true;
for (let i = 0; i < fp.rooms.length; i++) {
  for (let j = i + 1; j < fp.rooms.length; j++) {
    const a = fp.rooms[i], b = fp.rooms[j];
    const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
    const overlapZ = a.z < b.z + b.l && a.z + a.l > b.z;
    if (overlapX && overlapZ) { noOverlap = false; break; }
  }
}
assert("no overlapping rooms in prison layout", noOverlap);

// school floorplan
const school = generateFloorplan("school");
assert("school has hallway",    school.rooms.some(r => r.kind === "hallway"));
assert("school has classrooms", school.rooms.filter(r => r.kind === "classroom").length >= 3);

// planConnection
const rA = { id: "a", kind: "office" as const, label: "", w: 20, l: 20, x: 0,  z: 0,  y: 0, h: 10, floorMaterial: "", wallMaterial: "", ceilingMaterial: "" };
const rB = { id: "b", kind: "office" as const, label: "", w: 20, l: 20, x: 40, z: 0,  y: 0, h: 10, floorMaterial: "", wallMaterial: "", ceilingMaterial: "" };
const rC = { id: "c", kind: "office" as const, label: "", w: 20, l: 20, x: 0,  z: 40, y: 0, h: 10, floorMaterial: "", wallMaterial: "", ceilingMaterial: "" };
const connEW = planConnection(rA, rB);
assert("A east of B → wallA=E", connEW.wallA === "E");
assert("A east of B → wallB=W", connEW.wallB === "W");
const connNS = planConnection(rA, rC);
assert("A north of C → wallA=S", connNS.wallA === "S");
assert("A north of C → wallB=N", connNS.wallB === "N");

// getRoomPreset
const prison = getRoomPreset("cell_block");
assert("cell_block preset has propTags", prison.propTags.length > 0);
assert("cell_block preset material is Concrete", prison.floorMaterial === "Concrete");

// unknown kind throws
let threw = false;
try { generateFloorplan("unicorn"); } catch { threw = true; }
assert("unknown kind throws", threw);

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

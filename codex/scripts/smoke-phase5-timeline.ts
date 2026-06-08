import { createTimeline, validateTimeline } from "../src/build/timeline.js";

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else       { console.error(`  ✗ ${label}`); fail++; }
}

console.log("=== Phase 5: Timeline ===");

const events = [
  { time: 3, kind: "vfx"    as const, tool: "create_smoke",  args: { parent: "Workspace.Door" }, label: "smoke" },
  { time: 0, kind: "tween"  as const, tool: "animate_door",  args: { target: "Workspace.Door" }, label: "open" },
  { time: 5, kind: "ui"     as const, tool: "screen_flash",  args: { color: "#FF0000" }, label: "flash" },
  { time: 1, kind: "vfx"    as const, tool: "create_sparks", args: { parent: "Workspace.Door" }, label: "sparks" },
];

const tl = createTimeline("intro", events);

assert("events sorted by time",              tl.events[0].time === 0);
assert("second event at t=1",                tl.events[1].time === 1);
assert("duration equals last event time",    tl.duration === 5);
assert("name preserved",                     tl.name === "intro");
assert("all 4 events present",               tl.events.length === 4);

// validate
const v = validateTimeline(tl);
assert("valid timeline passes",              v.valid === true);
assert("no errors on valid timeline",        v.errors.length === 0);

// negative time causes error
const badTl = createTimeline("bad", [
  { time: -1, kind: "tween" as const, tool: "animate_door", args: {}, label: "bad" },
]);
const bv = validateTimeline(badTl);
assert("negative time flagged",              !bv.valid);
assert("error message contains 'negative'", bv.errors.some(e => e.includes("negative")));

// empty events
const empty = createTimeline("empty", []);
assert("empty timeline has duration 0",      empty.duration === 0);
assert("empty timeline is valid",            validateTimeline(empty).valid);

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

import { writeSnapshot, diffSnapshots, listSnapshots } from "../src/tools/project_intel.js";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import os from "os";

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else       { console.error(`  ✗ ${label}`); fail++; }
}

console.log("=== Phase 1: Project Intelligence (server-side) ===");

// Use a temp dir for snapshot tests
const tmpRoot = join(os.tmpdir(), `robloxforge-test-${Date.now()}`);
mkdirSync(join(tmpRoot, "memory", "snapshots"), { recursive: true });

// writeSnapshot round-trip
const snapshotData = { pluginTimestamp: 1000, instanceTotal: 150, scriptCount: 5, partCount: 100, modelCount: 10 };
const pathA = writeSnapshot(tmpRoot, snapshotData, "before");
assert("snapshot file written with label", pathA.includes("before"));
assert("snapshot path includes timestamp", /\d{13}/.test(pathA));

// Write a second snapshot with different data
const snapshotData2 = { pluginTimestamp: 2000, instanceTotal: 200, scriptCount: 8, partCount: 140, modelCount: 15 };
const pathB = writeSnapshot(tmpRoot, snapshotData2, "after");

// diffSnapshots
const diff = diffSnapshots(pathA, pathB) as { diff: Record<string, { before: number; after: number; delta: number }> };
assert("diff instanceTotal delta = +50",  diff.diff.instanceTotal.delta === 50);
assert("diff scriptCount delta = +3",     diff.diff.scriptCount.delta   === 3);
assert("diff partCount delta = +40",      diff.diff.partCount.delta     === 40);
assert("diff modelCount delta = +5",      diff.diff.modelCount.delta    === 5);
assert("diff before/after preserved",     diff.diff.partCount.before === 100 && diff.diff.partCount.after === 140);

// listSnapshots
const listing = listSnapshots(tmpRoot) as { snapshots: { filename: string; path: string }[]; count: number };
assert("listSnapshots finds 2 files",       listing.count === 2);
assert("listSnapshots sorted newest first", listing.snapshots[0].filename > listing.snapshots[1].filename);

// listSnapshots on empty dir
const emptyRoot = join(os.tmpdir(), `rf-empty-${Date.now()}`);
mkdirSync(join(emptyRoot, "memory", "snapshots"), { recursive: true });
const emptyListing = listSnapshots(emptyRoot) as { count: number };
assert("empty snapshot dir returns count 0", emptyListing.count === 0);

// Cleanup
rmSync(tmpRoot, { recursive: true, force: true });
rmSync(emptyRoot, { recursive: true, force: true });

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

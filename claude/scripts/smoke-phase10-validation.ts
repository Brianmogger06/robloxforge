import { planAutoFix, buildIterationAdr, type ValidationReport, type IterationResult } from "../src/build/validation.js";

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else       { console.error(`  ✗ ${label}`); fail++; }
}

console.log("=== Phase 10: Autonomous Validation & Repair ===");

// ── planAutoFix ───────────────────────────────────────────────────────────────

const cleanReport: ValidationReport = {
  valid: true, partCount: 10,
  overlaps: [], floating: [], badScale: [], warnings: [], errors: [],
};
const cleanPlan = planAutoFix(cleanReport);
assert("clean report → 0 actions",        cleanPlan.actions.length === 0);
assert("clean report summary mentions clean", cleanPlan.summary.toLowerCase().includes("clean"));

const dirtyReport: ValidationReport = {
  valid: false, partCount: 20,
  overlaps: [{ a: "Workspace.Room.WallA", b: "Workspace.Room.WallB" }],
  floating: ["Workspace.Prop.Chair"],
  badScale: [{ path: "Workspace.Tiny", size: { x: 0.001, y: 1, z: 1 } }],
  warnings: ["low part count"], errors: [],
};
const dirtyPlan = planAutoFix(dirtyReport, "Workspace");
assert("dirty report → 3 actions",         dirtyPlan.actions.length === 3);
assert("floating → anchor action",         dirtyPlan.actions.some(a => a.kind === "anchor" && a.target === "Workspace.Prop.Chair"));
assert("badScale → scale action",          dirtyPlan.actions.some(a => a.kind === "scale" && a.target === "Workspace.Tiny"));
assert("overlap → move action",            dirtyPlan.actions.some(a => a.kind === "move"));
assert("anchor action has Anchored prop",  dirtyPlan.actions.find(a => a.kind === "anchor")?.args?.["Anchored"] === true);
assert("scale action clamps to 0.1",       (dirtyPlan.actions.find(a => a.kind === "scale")?.args?.["Size"] as { x: number })?.x === 0.1);
assert("dirty plan summary mentions fixes", dirtyPlan.summary.includes("3 fix"));

// ── buildIterationAdr ─────────────────────────────────────────────────────────

const iterations: IterationResult[] = [
  { iteration: 1, buildReport: dirtyReport, gameReport: cleanReport, fixPlan: dirtyPlan, clean: false },
  { iteration: 2, buildReport: cleanReport, gameReport: cleanReport, fixPlan: cleanPlan, clean: true  },
];
const adr = buildIterationAdr(iterations);
assert("ADR contains iteration count",   adr.includes("Iterations: 2"));
assert("ADR marks final state CLEAN",    adr.includes("CLEAN"));
assert("ADR lists per-iteration rows",   adr.includes("Iter 1") && adr.includes("Iter 2"));
assert("ADR mentions overlaps/floating", adr.includes("overlaps=") && adr.includes("floating="));

// ── Edge cases ────────────────────────────────────────────────────────────────

const emptyAdr = buildIterationAdr([]);
assert("empty iterations → fallback string", emptyAdr.length > 0);

const overlapOnly: ValidationReport = {
  valid: false, overlaps: [{ a: "A", b: "B" }, { a: "C", b: "D" }],
  floating: [], badScale: [], warnings: [], errors: [],
};
const overlapPlan = planAutoFix(overlapOnly);
assert("overlap-only → 2 move actions",  overlapPlan.actions.length === 2);
assert("all actions are move kind",       overlapPlan.actions.every(a => a.kind === "move"));

const floatOnly: ValidationReport = {
  valid: false, overlaps: [], floating: ["Workspace.X", "Workspace.Y", "Workspace.Z"],
  badScale: [], warnings: [], errors: [],
};
const floatPlan = planAutoFix(floatOnly);
assert("3 floating → 3 anchor actions", floatPlan.actions.length === 3);
assert("all anchor actions include Anchored:true",
  floatPlan.actions.every(a => a.args?.["Anchored"] === true));

// ── Scale clamping ────────────────────────────────────────────────────────────

const extremeScale: ValidationReport = {
  valid: false, overlaps: [], floating: [],
  badScale: [{ path: "Workspace.Huge", size: { x: 9999, y: 9999, z: 9999 } }],
  warnings: [], errors: [],
};
const extremePlan = planAutoFix(extremeScale);
const scaledSize = extremePlan.actions[0]?.args?.["Size"] as { x: number; y: number; z: number };
assert("oversize x clamped to 2048", scaledSize?.x === 2048);
assert("oversize y clamped to 2048", scaledSize?.y === 2048);
assert("oversize z clamped to 2048", scaledSize?.z === 2048);

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

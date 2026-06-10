// Smoke: facade layer — coverage, def generation, call resolution.
import { TOOL_DEFS } from "../src/tools/core.js";
import {
  FACADE_GROUPS, STANDALONE_TOOLS,
  buildFacadeDefs, isFacadeGroup, resolveFacade, resolveBatchCmd,
} from "../src/tools/facade.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean): void {
  if (cond) { pass++; } else { fail++; console.error(`FAIL: ${label}`); }
}

// 1. Coverage: buildFacadeDefs throws on drift; succeeding = full coverage.
const defs = buildFacadeDefs(TOOL_DEFS as never);
check("buildFacadeDefs runs (full coverage, no dupes)", defs.length > 0);

// 2. Exposed count = standalone + groups
const expected = STANDALONE_TOOLS.size + Object.keys(FACADE_GROUPS).length;
check(`exposes exactly ${expected} tools (got ${defs.length})`, defs.length === expected);

// 3. Every action maps to a real internal tool
const internalNames = new Set((TOOL_DEFS as Array<{ name: string }>).map(d => d.name));
for (const [group, g] of Object.entries(FACADE_GROUPS)) {
  for (const [action, internal] of Object.entries(g.actions)) {
    check(`${group}.${action} → ${internal} exists`, internalNames.has(internal));
  }
}

// 4. Every internal tool (minus standalone) is reachable through exactly one action
const mapped = new Set<string>();
for (const g of Object.values(FACADE_GROUPS)) for (const t of Object.values(g.actions)) mapped.add(t);
for (const name of internalNames) {
  if (STANDALONE_TOOLS.has(name)) continue;
  check(`internal '${name}' reachable via facade`, mapped.has(name));
}

// 5. Group defs have action enum matching actions
for (const def of defs) {
  if (STANDALONE_TOOLS.has(def.name)) continue;
  const props = def.inputSchema.properties as Record<string, { enum?: string[] }>;
  const enumActions = props["action"]?.enum ?? [];
  const expectedActions = Object.keys(FACADE_GROUPS[def.name].actions);
  check(`${def.name} enum matches actions`, JSON.stringify(enumActions) === JSON.stringify(expectedActions));
  check(`${def.name} description lists all actions`, expectedActions.every(a => def.description.includes(`- ${a}(`)));
}

// 6. resolveFacade: flat args
const r1 = resolveFacade("forge_vfx", { action: "fire", target: "Workspace.Torch" });
check("resolveFacade flat → create_fire", !("error" in r1) && r1.name === "create_fire" && r1.args["target"] === "Workspace.Torch");

// 7. resolveFacade: nested params
const r2 = resolveFacade("forge_build", { action: "room", params: { name: "Cell", width: 16 } });
check("resolveFacade nested → build_room", !("error" in r2) && r2.name === "build_room" && r2.args["width"] === 16);

// 8. flat overrides nested; action never leaks; _sessionId preserved
const r3 = resolveFacade("forge_ui", { action: "hud", params: { theme: "a" }, theme: "b", _sessionId: "s1" });
check("flat overrides nested", !("error" in r3) && r3.args["theme"] === "b");
check("action stripped", !("error" in r3) && !("action" in r3.args));
check("_sessionId preserved", !("error" in r3) && r3.args["_sessionId"] === "s1");

// 9. unknown action errors with valid list
const r4 = resolveFacade("forge_npc", { action: "fly" });
check("unknown action → error listing actions", "error" in r4 && r4.error.includes("patrol"));

// 10. missing action errors
const r5 = resolveFacade("forge_anim", {});
check("missing action → error", "error" in r5);

// 11. resolveBatchCmd forms
const b1 = resolveBatchCmd("forge_build.room", { name: "A" });
check("batch 'group.action' form", !("error" in b1) && b1.name === "build_room");
const b2 = resolveBatchCmd("forge_vfx", { action: "smoke", target: "X" });
check("batch group+action-in-args form", !("error" in b2) && b2.name === "create_smoke");
const b3 = resolveBatchCmd("create_part", { name: "P" });
check("batch internal passthrough", !("error" in b3) && b3.name === "create_part");
const b4 = resolveBatchCmd("nope.nope", {});
check("batch unknown dotted → error", "error" in b4);

// 12. isFacadeGroup
check("isFacadeGroup true", isFacadeGroup("forge_project"));
check("isFacadeGroup false for internal", !isFacadeGroup("create_part"));

// 13. context size sanity: facade defs JSON should be far smaller than internal defs JSON
const facadeBytes = JSON.stringify(defs).length;
const internalBytes = JSON.stringify(TOOL_DEFS).length;
check(`facade defs smaller than internal (${facadeBytes} vs ${internalBytes})`, facadeBytes < internalBytes * 0.6);

console.log(`\nsmoke-facade: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

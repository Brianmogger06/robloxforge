import { patrolBehavior, guardBehavior, chaseBehavior, interactBehavior, validateBehaviorTree, generateBehaviorScript } from "../src/build/npc_behaviors.js";

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else       { console.error(`  ✗ ${label}`); fail++; }
}

console.log("=== Phase 7: NPC Behaviors ===");

// patrolBehavior
const waypoints = [{ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }, { x: 20, y: 0, z: 20 }];
const patrol = patrolBehavior(waypoints);
assert("patrol name is Patrol",           patrol.name === "Patrol");
assert("patrol root kind is repeat",      patrol.root.kind === "repeat");
assert("patrol has 3 moveTo children",    patrol.root.children![0].children!.length === 3);
assert("patrol is valid BT",             validateBehaviorTree(patrol).valid);

// guardBehavior
const guard = guardBehavior({ x: 10, y: 0, z: 10 }, 30);
assert("guard name is Guard",             guard.name === "Guard");
assert("guard root kind is selector",     guard.root.kind === "selector");
assert("guard is valid BT",              validateBehaviorTree(guard).valid);

// chaseBehavior
const chase = chaseBehavior(25, 60);
assert("chase name is Chase",             chase.name === "Chase");
assert("chase has condition node",        JSON.stringify(chase).includes("canSeePlayer"));
assert("chase is valid BT",              validateBehaviorTree(chase).valid);

// interactBehavior
const interact = interactBehavior("Talk to Guard", ["Hello!", "What do you want?"]);
assert("interact has showDialog action",  JSON.stringify(interact).includes("showDialog"));
assert("interact dialogLines preserved",  JSON.stringify(interact).includes("Hello!"));
assert("interact is valid BT",           validateBehaviorTree(interact).valid);

// validation catches bad BT
const badBt = { npcId: "", name: "Bad", root: { kind: "action" as const, name: "" } };
const bv = validateBehaviorTree(badBt);
assert("empty name flagged",              !bv.valid);

// generateBehaviorScript
const script = generateBehaviorScript(patrol);
assert("script contains --!strict",     script.includes("--!strict"));
assert("script contains BT_DATA",       script.includes("BT_DATA"));
assert("script contains PathfindingService", script.includes("PathfindingService"));

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

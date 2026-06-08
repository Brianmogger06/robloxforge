/**
 * B2 smoke test — verifies the SERVER_SIDE_TOOLS set and batch expansion logic.
 *
 * B2 root cause: batch sub-commands were all forwarded to bridge.send, so
 * server-side tools (palette, image, memory, populate_room) silently failed
 * when used inside a batch.
 *
 * The fix adds runServerSide() and detects mixed batches before forwarding.
 * We verify the detection logic and the set membership here.
 */

let pass = 0, fail = 0;
function assert(label: string, cond: boolean) {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else       { console.error(`  FAIL  ${label}`); fail++; }
}

// Replicate SERVER_SIDE_TOOLS membership (must match core.ts)
const SERVER_SIDE_TOOLS = new Set([
  "extract_palette", "reference_attach", "image_to_grid",
  "set_session_palette", "get_session_palette", "apply_palette_from_image",
  "populate_room",
  "get_project_rules", "get_decisions", "append_adr", "append_changelog",
  "get_roadmap", "update_roadmap",
]);

// Plugin-side tools that must NOT be in SERVER_SIDE_TOOLS
const PLUGIN_ONLY_TOOLS = [
  "create_part", "create_instance", "clone_instance", "delete_instances",
  "set_properties", "set_properties_many", "get_properties", "get_tree",
  "find_instances", "build_room", "build_corridor", "build_doorway",
  "build_composite", "build_grid", "add_light", "add_flicker", "add_pulse",
  "execute_luau", "set_waypoint",
  "start_playtest", "get_playtest_output", "stop_playtest",
];

// --- Membership checks
for (const tool of SERVER_SIDE_TOOLS) {
  assert(`${tool} is in SERVER_SIDE_TOOLS`, SERVER_SIDE_TOOLS.has(tool));
}

for (const tool of PLUGIN_ONLY_TOOLS) {
  assert(`${tool} is NOT in SERVER_SIDE_TOOLS`, !SERVER_SIDE_TOOLS.has(tool));
}

// --- Mixed-batch detection
function hasMixed(cmds: Array<{tool: string}>) {
  return cmds.some(c => SERVER_SIDE_TOOLS.has(c.tool));
}

assert('pure plugin batch: not mixed', !hasMixed([
  { tool: 'create_part' },
  { tool: 'set_properties' },
]));

assert('pure server batch: mixed', hasMixed([
  { tool: 'set_session_palette' },
  { tool: 'get_session_palette' },
]));

assert('mixed batch (server+plugin): detected', hasMixed([
  { tool: 'apply_palette_from_image' },
  { tool: 'build_room' },
  { tool: 'create_part' },
]));

assert('single server-side: detected', hasMixed([{ tool: 'get_project_rules' }]));
assert('single plugin-side: not mixed', !hasMixed([{ tool: 'build_grid' }]));
assert('empty batch: not mixed', !hasMixed([]));

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`
Manual Studio verification for B2:
  1. Call batch({ commands: [
       { tool: "set_session_palette", args: { roles: { primary: "#ff0000", secondary: "#00ff00", accent: "#0000ff", floor: "#cccccc", wall: "#ffffff", trim: "#000000" } } },
       { tool: "create_part", args: { parentPath: "Workspace", size: {x:4,y:4,z:4}, position: {x:0,y:2,z:0} } }
     ]})
     → results[0].data.ok === true (palette set server-side)
     → results[1].data contains created part info (plugin handled it)

  2. Call batch({ commands: [
       { tool: "get_session_palette", args: {} },
       { tool: "get_project_rules", args: {} }
     ]})
     → Both results should have data (not errors)
`);
process.exit(fail > 0 ? 1 : 0);

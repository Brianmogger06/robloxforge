# RobloxForge MCP

> The first autonomous AI agent for Roblox Studio — build entire games through conversation.

Made by **Efe** ([@efefefe435-ux](https://github.com/efefefe435-ux))

---

## What is RobloxForge?

RobloxForge is a **Model Context Protocol (MCP) server** that connects AI coding assistants
(Claude Code, OpenAI Codex CLI, or any MCP-compatible agent) directly to a live Roblox Studio
session. The agent calls structured tools — not raw Lua scripts — to read, build, animate,
and validate a Roblox game in real time.

A single prompt like *"Create a Prison Tycoon game"* triggers a fully automated pipeline:
generate a floorplan, build every room with style-matched materials, populate props, wire
currency and upgrade systems, spawn NPC guards with patrol behaviour, add VFX, generate a
HUD, and self-validate before playtesting — all without the developer touching Studio manually.

---

## Why is RobloxForge better than every other Roblox Studio MCP?

Most Roblox AI tools do one thing: send a `loadstring()` snippet to Studio and hope it
runs. RobloxForge takes a fundamentally different approach across every layer.

### 1. 50+ typed tools instead of one escape-hatch

Every operation — building rooms, animating doors, generating quest systems, validating
builds — has its own typed MCP tool with a JSON schema. The agent never guesses syntax.
Errors are caught at the schema level before they reach Studio.

### 2. Full project intelligence

The agent can *read* your project, not just write to it:

- `analyze_project` returns part counts, script counts, RemoteEvent inventory, and warnings
  in a single call.
- `get_script_source` reads any Script or ModuleScript from the live DataModel.
- `dependency_graph` maps `require()` / `:FireServer` chains across all scripts.
- `diff_snapshot` compares two saved project states to see exactly what changed.

No other Roblox MCP can tell you what is already in the game before it starts building.

### 3. Style engine — one command, consistent aesthetics

`set_session_style "prison"` seeds materials, lighting, palette roles, and prop tags for
the entire session. Every subsequent `build_room`, `create_particle`, or `create_hud`
call automatically pulls from that style. Switch to `"hospital"` and the next build looks
completely different — zero manual property editing.

Eight built-in presets: `prison`, `industrial`, `hospital`, `school`, `military`,
`sci-fi`, `office`, `residential`.

### 4. Semantic floorplan generation

`generate_floorplan { kind: "prison" }` outputs a geometrically valid room graph:
non-overlapping AABB rooms, BFS-reachable from the entrance, SCALE-aligned dimensions,
door placements on shared walls. Feed it straight into `build_structure` and the entire
building appears in Studio in seconds.

### 5. Gameplay system codegen — production-quality Luau

`create_currency_system`, `create_quest_system`, `create_round_system`, and three more
generators emit `--!strict` Luau ModuleScripts with DataStore persistence, RemoteEvent
wiring, and a uniform `{ init, get, set }` API. Every script passes the Luau type checker
out of the box. Other tools give you a snippet; RobloxForge gives you a module you can
actually ship.

### 6. Image → environment intelligence

Point `recognize_environment` at any reference screenshot and get back a style preset,
a room kind, a prop tag list, and a dominant+accent colour palette — all derived from
pixel-level heuristics (saturation, brightness, warmth, coolness, greenness) via the
`sharp` image library. No external vision API needed.

### 7. Autonomous validation loop

`autonomous_iterate` runs a full Plan → Build → Validate → Fix → Validate cycle
automatically. It detects overlapping parts, floating props, and invalid scale, applies
fixes, and keeps iterating until the build is clean or `maxIterations` is reached.
At the end it writes an Architecture Decision Record summarising every change.

### 8. Session isolation

Multiple AI clients can connect simultaneously without palette or style state leaking
between sessions. Every piece of mutable state is keyed by `sessionId`.

### 9. Protocol version handshake

The plugin rejects commands from a mismatched server version with a clear error message.
No silent failures from deploying a new server against an old plugin.

### 10. Works with Claude Code and Codex CLI

The `claude/` and `codex/` directories in this repo are drop-in ready. Claude Code reads
`.claude/` configuration; Codex CLI reads `AGENTS.md` and `~/.codex/config.toml`.
Same MCP server, same 50+ tools, same plugin — just plug into whichever agent you prefer.

---

## Repository layout

```
robloxforge/
├── claude/          Claude Code–ready copy of the MCP server
│   ├── src/         TypeScript source
│   │   ├── server.ts
│   │   ├── tools/   (core.ts, images.ts, memory.ts, project_intel.ts)
│   │   ├── build/   (floorplan, style_engine, classifiers, validation, …)
│   │   └── transport/httpBridge.ts
│   ├── plugin/      RobloxForgePlugin.luau  ← install in Studio
│   ├── scripts/     smoke tests + deploy-plugin.ts
│   └── package.json
│
└── codex/           OpenAI Codex CLI–ready copy (identical code + AGENTS.md)
    └── AGENTS.md    Codex agent instructions and tool catalogue
```

---

## Quick start (Claude Code)

```bash
cd robloxforge/claude
npm install
npm run build

# Deploy the plugin to Studio
npm run deploy:plugin

# Add to your Claude Code MCP config (~/.claude/mcp_servers.json or .claude/settings.json)
# {
#   "mcpServers": {
#     "robloxforge": {
#       "command": "node",
#       "args": ["C:/Users/Efe/Desktop/robloxforge/claude/dist/server.js"]
#     }
#   }
# }
```

Open Roblox Studio. The plugin starts polling automatically when Studio loads.
Ask Claude: *"Build a prison"* — and watch it go.

---

## Quick start (Codex CLI)

```bash
cd robloxforge/codex
npm install
npm run build
```

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.robloxforge]
command = "node"
args    = ["C:/Users/Efe/Desktop/robloxforge/codex/dist/server.js"]
```

---

## Tool reference

| Category | Tools |
|---|---|
| Project intel | `analyze_project`, `get_project_tree`, `find_scripts`, `get_script_source`, `dependency_graph`, `create_snapshot`, `diff_snapshot` |
| Build | `generate_floorplan`, `build_building`, `build_structure`, `build_room`, `build_corridor`, `connect_rooms` |
| Style | `set_session_style`, `get_session_style`, `list_styles`, `apply_style_to_palette` |
| VFX | `create_particle`, `create_fire`, `create_smoke`, `create_rain`, `create_snow`, `camera_shake`, `screen_flash` |
| Animation | `animate_door`, `animate_elevator`, `animate_npc`, `create_cutscene`, `create_timeline` |
| UI | `create_hud`, `create_menu`, `create_shop_ui`, `create_tycoon_ui`, `create_inventory_ui` |
| NPC | `create_npc`, `patrol_behavior`, `chase_behavior`, `guard_behavior`, `create_behavior_tree` |
| Gameplay | `create_currency_system`, `create_upgrade_system`, `create_quest_system`, `create_round_system`, `create_progression_system` |
| Image intel | `recognize_environment`, `classify_style`, `classify_room`, `suggest_props` |
| Validation | `validate_build`, `validate_game`, `auto_fix`, `autonomous_iterate` |
| Memory | `append_adr`, `append_changelog`, `get_roadmap`, `get_decisions` |

---

## Requirements

- Node.js 18+
- Roblox Studio (Windows)
- Claude Code CLI **or** OpenAI Codex CLI

---

## License

MIT

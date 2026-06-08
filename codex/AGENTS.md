# RobloxForge MCP — Codex Agent Instructions

## What this project is

RobloxForge is a Model Context Protocol (MCP) server that gives AI agents direct,
structured access to Roblox Studio. Instead of writing raw Luau scripts by hand,
the agent calls typed tools that build rooms, animate doors, generate gameplay
systems, classify images, and validate the entire game — all without leaving the
conversation.

## How to connect this server to Codex CLI

Add the following block to your `~/.codex/config.toml`:

```toml
[mcp_servers.robloxforge]
command = "node"
args    = ["C:/Users/Efe/Desktop/robloxforge/codex/dist/server.js"]
env     = { "ROBLOXFORGE_ROOT" = "C:/Users/Efe/Desktop/robloxforge/codex" }
```

Then build once:

```bash
cd C:/Users/Efe/Desktop/robloxforge/codex
npm install
npm run build
```

Open Roblox Studio, make sure the plugin (`plugin/RobloxForgePlugin.luau`) is
installed in `%LOCALAPPDATA%\Roblox\Plugins\`, and start a session.

## Working conventions for the agent

- **Never use `execute_luau`** for tasks that have a dedicated tool. Every Phase 1–10
  tool exists precisely to avoid ad-hoc Luau scripts.
- Always check `get_session_style` before building — if a style is set, room
  materials are applied automatically.
- For large builds use `build_building` → `populate_room` → `validate_build` in
  sequence.
- Gameplay systems (`create_currency_system`, etc.) are injected as ModuleScripts
  into `ServerStorage` by default. Reference them with `require()` from your
  game scripts.
- Call `autonomous_iterate` at the end of any significant build to catch overlaps
  and floating parts before playtesting.

## Tool categories

| Category | Key tools |
|---|---|
| Project intel | `analyze_project`, `get_project_tree`, `find_scripts`, `get_script_source` |
| Build | `build_building`, `build_room`, `build_corridor`, `populate_room` |
| Style | `set_session_style`, `list_styles`, `apply_style_to_palette` |
| VFX | `create_particle`, `create_fire`, `create_smoke`, `create_rain` |
| Animation | `animate_door`, `animate_elevator`, `create_cutscene` |
| UI | `create_hud`, `create_shop_ui`, `create_tycoon_ui` |
| NPC | `create_npc`, `patrol_behavior`, `chase_behavior` |
| Gameplay | `create_currency_system`, `create_round_system`, `create_progression_system` |
| Image intel | `recognize_environment`, `classify_style`, `suggest_props` |
| Validation | `validate_build`, `auto_fix`, `autonomous_iterate` |
| Memory | `append_adr`, `append_changelog`, `get_roadmap` |

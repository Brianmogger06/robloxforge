// Facade layer: groups ~105 internal tools into 12 namespaced tools, each
// invoked as { action, params }. The plugin protocol is untouched — this only
// changes what the MCP client sees. execute_luau and batch stay standalone.

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface FacadeGroup {
  summary: string;
  /** action name → internal tool name */
  actions: Record<string, string>;
}

export const STANDALONE_TOOLS = new Set(["execute_luau", "batch"]);

export const FACADE_GROUPS: Record<string, FacadeGroup> = {
  forge_instance: {
    summary: "Instance CRUD in the live DataModel: create, edit, query, delete, clone parts and instances.",
    actions: {
      create_part:         "create_part",
      create_instance:     "create_instance",
      set_properties:      "set_properties",
      set_properties_many: "set_properties_many",
      delete:              "delete_instances",
      clone:               "clone_instance",
      find:                "find_instances",
      get_tree:            "get_tree",
      get_properties:      "get_properties",
      set_waypoint:        "set_waypoint",
      save_place:          "try_save_place",
    },
  },
  forge_build: {
    summary: "Procedural construction: rooms, corridors, doorways, composites, grids, floorplans, whole buildings.",
    actions: {
      room:           "build_room",
      corridor:       "build_corridor",
      doorway:        "build_doorway",
      composite:      "build_composite",
      grid:           "build_grid",
      populate_room:  "populate_room",
      floorplan:      "generate_floorplan",
      building_kinds: "list_building_kinds",
      structure:      "build_structure",
      building:       "build_building",
      connect_rooms:  "connect_rooms",
      room_presets:   "list_room_presets",
    },
  },
  forge_style: {
    summary: "Session style & palette: architectural style presets, color palettes, palette extraction from images.",
    actions: {
      set_style:          "set_session_style",
      get_style:          "get_session_style",
      list_styles:        "list_styles",
      style_to_palette:   "apply_style_to_palette",
      set_palette:        "set_session_palette",
      get_palette:        "get_session_palette",
      palette_from_image: "apply_palette_from_image",
      extract_palette:    "extract_palette",
      attach_reference:   "reference_attach",
      image_to_grid:      "image_to_grid",
    },
  },
  forge_vfx: {
    summary: "Visual effects: particles, fire, smoke, weather, lights, flicker/pulse, camera shake, screen flash.",
    actions: {
      particle:     "create_particle",
      fire:         "create_fire",
      smoke:        "create_smoke",
      sparks:       "create_sparks",
      explosion:    "create_explosion_vfx",
      rain:         "create_rain",
      snow:         "create_snow",
      camera_shake: "camera_shake",
      screen_flash: "screen_flash",
      light:        "add_light",
      flicker:      "add_flicker",
      pulse:        "add_pulse",
    },
  },
  forge_anim: {
    summary: "Animation: keyframe sequences, door/elevator tweens, NPC animation presets, cutscenes, timelines.",
    actions: {
      animation: "create_animation",
      door:      "animate_door",
      elevator:  "animate_elevator",
      npc:       "animate_npc",
      cutscene:  "create_cutscene",
      timeline:  "create_timeline",
    },
  },
  forge_ui: {
    summary: "UI generation: HUDs, menus, inventory/shop/tycoon screens, custom layout trees, theming, analysis.",
    actions: {
      custom:    "create_ui",
      hud:       "create_hud",
      menu:      "create_menu",
      inventory: "create_inventory_ui",
      shop:      "create_shop_ui",
      tycoon:    "create_tycoon_ui",
      theme:     "apply_ui_theme",
      analyze:   "analyze_ui",
    },
  },
  forge_npc: {
    summary: "NPCs: rig creation and behavior trees (patrol, guard, chase, interact presets).",
    actions: {
      create:        "create_npc",
      behavior_tree: "create_behavior_tree",
      patrol:        "patrol_behavior",
      guard:         "guard_behavior",
      chase:         "chase_behavior",
      interact:      "interact_behavior",
    },
  },
  forge_gameplay: {
    summary: "Gameplay system generators: DataStore-backed currency, upgrades, quests, rounds, objectives, progression.",
    actions: {
      currency:    "create_currency_system",
      upgrade:     "create_upgrade_system",
      quest:       "create_quest_system",
      round:       "create_round_system",
      objective:   "create_objective_system",
      progression: "create_progression_system",
    },
  },
  forge_project: {
    summary: "Project intelligence: read-only analysis of the open place — tree, stats, scripts, remotes, snapshots.",
    actions: {
      tree:             "get_project_tree",
      stats:            "get_workspace_stats",
      find_models:      "find_models",
      find_parts:       "find_parts",
      find_scripts:     "find_scripts",
      script_source:    "get_script_source",
      search_scripts:   "search_scripts",
      remote_events:    "find_remote_events",
      remote_functions: "find_remote_functions",
      dependency_graph: "dependency_graph",
      analyze:          "analyze_project",
      snapshot:         "create_snapshot",
      diff_snapshot:    "diff_snapshot",
      list_snapshots:   "list_snapshots",
      analyze_self:     "analyze_self",
    },
  },
  forge_validate: {
    summary: "Validation & repair: geometry/game checks, auto-fix, playtest control, console output, autonomous iterate loop.",
    actions: {
      build:           "validate_build",
      game:            "validate_game",
      auto_fix:        "auto_fix",
      playtest:        "run_playtest",
      iterate:         "autonomous_iterate",
      start_playtest:  "start_playtest",
      playtest_output: "get_playtest_output",
      stop_playtest:   "stop_playtest",
      console_output:  "get_console_output",
    },
  },
  forge_vision: {
    summary: "Reference-image intelligence: classify style/room, suggest props, full environment recognition.",
    actions: {
      style:       "classify_style",
      room:        "classify_room",
      props:       "suggest_props",
      environment: "recognize_environment",
    },
  },
  forge_memory: {
    summary: "Project memory: rules, decision records (ADRs), changelog, roadmap.",
    actions: {
      rules:          "get_project_rules",
      decisions:      "get_decisions",
      adr:            "append_adr",
      changelog:      "append_changelog",
      get_roadmap:    "get_roadmap",
      update_roadmap: "update_roadmap",
    },
  },
};

// ─── Def generation ───────────────────────────────────────────────────────────

function firstSentence(s: string, cap = 110): string {
  const idx = s.indexOf(". ");
  let out = idx > 0 ? s.slice(0, idx + 1) : s;
  if (out.length > cap) out = out.slice(0, cap - 1) + "…";
  return out;
}

function paramSignature(def: ToolDef): string {
  const props = Object.keys(def.inputSchema.properties ?? {});
  const required = new Set(def.inputSchema.required ?? []);
  const sig = props.map(p => (required.has(p) ? p + "*" : p));
  return sig.length > 8 ? sig.slice(0, 8).join(", ") + ", …" : sig.join(", ");
}

/** Throws if any internal tool is unmapped or mapped twice — catches drift when tools are added. */
function validateCoverage(internal: ToolDef[]): void {
  const mapped = new Map<string, string>();
  for (const [group, g] of Object.entries(FACADE_GROUPS)) {
    for (const internalName of Object.values(g.actions)) {
      const prev = mapped.get(internalName);
      if (prev) throw new Error(`[facade] '${internalName}' mapped in both '${prev}' and '${group}'`);
      mapped.set(internalName, group);
    }
  }
  for (const def of internal) {
    if (STANDALONE_TOOLS.has(def.name)) continue;
    if (!mapped.has(def.name)) throw new Error(`[facade] internal tool '${def.name}' is not mapped to any group`);
  }
  for (const name of mapped.keys()) {
    if (!internal.some(d => d.name === name)) throw new Error(`[facade] group action maps to unknown internal tool '${name}'`);
  }
}

export function buildFacadeDefs(internal: ToolDef[]): ToolDef[] {
  validateCoverage(internal);
  const byName = new Map(internal.map(d => [d.name, d]));
  const defs: ToolDef[] = [];

  for (const name of STANDALONE_TOOLS) {
    const def = byName.get(name);
    if (def) defs.push(def);
  }

  for (const [groupName, g] of Object.entries(FACADE_GROUPS)) {
    const lines = Object.entries(g.actions).map(([action, internalName]) => {
      const def = byName.get(internalName)!;
      return `- ${action}(${paramSignature(def)}): ${firstSentence(def.description)}`;
    });
    defs.push({
      name: groupName,
      description: `${g.summary} Invoke with {action, params} (params may also be passed flat). * = required.\nActions:\n${lines.join("\n")}`,
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: Object.keys(g.actions), description: "Operation to perform." },
          params: { type: "object", description: "Action-specific parameters — see the action list in this tool's description." },
        },
        required: ["action"],
      },
    });
  }
  return defs;
}

// ─── Call resolution ──────────────────────────────────────────────────────────

export function isFacadeGroup(name: string): boolean {
  return name in FACADE_GROUPS;
}

export type FacadeResolution = { name: string; args: Record<string, unknown> } | { error: string };

/** Resolve a facade call { action, params?, ...flat } to the internal tool + args. */
export function resolveFacade(group: string, args: Record<string, unknown>): FacadeResolution {
  const g = FACADE_GROUPS[group];
  if (!g) return { error: `Unknown tool group '${group}'` };
  const action = args["action"];
  if (typeof action !== "string" || !(action in g.actions)) {
    return { error: `${group}: unknown or missing action '${String(action)}'. Valid actions: ${Object.keys(g.actions).join(", ")}` };
  }
  const { action: _a, params, ...rest } = args;
  const merged = { ...((params as Record<string, unknown>) ?? {}), ...rest };
  return { name: g.actions[action], args: merged };
}

/**
 * Resolve a batch sub-command tool reference. Accepts:
 *  - internal names ("create_part")
 *  - "group.action" ("forge_vfx.fire")
 *  - group name with action in args ({ tool: "forge_vfx", args: { action: "fire", ... } })
 */
export function resolveBatchCmd(tool: string, args: Record<string, unknown>): FacadeResolution {
  if (tool.includes(".")) {
    const [group, action] = tool.split(".", 2);
    if (isFacadeGroup(group)) return resolveFacade(group, { ...args, action });
    return { error: `Unknown tool '${tool}'` };
  }
  if (isFacadeGroup(tool)) return resolveFacade(tool, args);
  return { name: tool, args };
}

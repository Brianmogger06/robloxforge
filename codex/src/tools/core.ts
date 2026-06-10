import { type Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { type HttpBridge, type CommandResult } from "../transport/httpBridge.js";
import { type Config, type RgbColor } from "../config.js";
import { extractPalette, referenceAttach, imageToGrid, paletteToRoles } from "./images.js";
import { getProjectRules, getDecisions, appendAdr, appendChangelog, getRoadmap, updateRoadmap } from "./memory.js";
import { analyzeSelf, writeSnapshot, diffSnapshots, listSnapshots } from "./project_intel.js";
import { generateFloorplan, listFloorplanKinds, planConnection } from "../build/floorplan.js";
import { getRoomPreset } from "../build/semantic_rooms.js";
import { setSessionStyle, getSessionStyle, listStyles, applyStyleToRoomArgs } from "../build/style_engine.js";
import { createTimeline, validateTimeline } from "../build/timeline.js";
import { getUiPreset, validateUiLayout, type PresetName } from "../build/ui_presets.js";
import { patrolBehavior, guardBehavior, chaseBehavior, interactBehavior, validateBehaviorTree, generateBehaviorScript } from "../build/npc_behaviors.js";
import { generateCurrencySystem, generateUpgradeSystem, generateQuestSystem, generateRoundSystem, generateObjectiveSystem, generateProgressionSystem } from "../build/gameplay/index.js";
import { classifyStyle, classifyRoom, suggestProps, recognizeEnvironment } from "../build/classifiers.js";
import { planAutoFix, buildIterationAdr, type ValidationReport } from "../build/validation.js";
import { SCALE } from "../build/scale.js";
import { type PaletteRole, getSessionColor, setSessionPalette, getSessionPalette, clearSessionPalette } from "../build/palette_session.js";
import { planRoomContents, MIN_ROOM_DIM, type RoomContent, type RoomSpec } from "../build/composition.js";
import { buildFacadeDefs, isFacadeGroup, resolveFacade, resolveBatchCmd } from "./facade.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_MATERIALS = new Set(["SmoothPlastic", "Plastic"]);

function fmt(result: CommandResult, tool: string) {
  if (!result.ok) {
    return {
      content: [{ type: "text" as const, text: `[${tool}] Error: ${result.error ?? "unknown"}` }],
      isError: true,
    };
  }
  const text =
    result.data == null
      ? "(no return value)"
      : typeof result.data === "string"
      ? result.data
      : JSON.stringify(result.data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

function checkMaterial(args: Record<string, unknown>, config: Config): string | null {
  const m = args["material"] as string | undefined;
  if (!m || (args["allowDefaultMaterial"] as boolean | undefined)) return null;
  if (config.rejectDefaultMaterials && DEFAULT_MATERIALS.has(m))
    return `Material '${m}' is a Roblox default. Use Concrete, Metal, CorrodedMetal, etc. Pass allowDefaultMaterial:true to override.`;
  return null;
}

/** Resolve a palette name or pass through an already-resolved color value. */
function resolveColor(
  color: RgbColor | string | undefined,
  config: Config,
  role?: string,
  sessionId = "default"
): RgbColor | string | undefined {
  if (typeof color === "string" && config.palette) {
    const hit = config.palette[color];
    if (hit) return hit;
  }
  // Fall back to session palette if color is missing or unresolved
  if ((color === undefined || color === null) && role) {
    const sessionColor = getSessionColor(role as Parameters<typeof getSessionColor>[0], sessionId);
    if (sessionColor) return sessionColor;
  }
  return color;
}

/** Walk args recursively and resolve any `color` / `floorColor` / `wallColor` / `ceilingColor` keys. */
function resolveColors(args: Record<string, unknown>, config: Config, sessionId = "default"): Record<string, unknown> {
  if (!config.palette) return args;
  const COLOR_KEYS = new Set(["color", "floorColor", "wallColor", "ceilingColor", "lightColor"]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (COLOR_KEYS.has(k) && (typeof v === "string" || (typeof v === "object" && v !== null))) {
      out[k] = resolveColor(v as RgbColor | string, config, undefined, sessionId);
    } else if (k === "commands" && Array.isArray(v)) {
      out[k] = v.map((cmd) =>
        typeof cmd === "object" && cmd !== null && "args" in cmd
          ? { ...(cmd as object), args: resolveColors((cmd as { args: Record<string, unknown> }).args, config, sessionId) }
          : cmd
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const TOOL_DEFS = [
  // ── Escape-hatch ──────────────────────────────────────────────────────────
  {
    name: "execute_luau",
    description: "Execute arbitrary Luau code in Roblox Studio edit context. Use `return` to get values back.",
    inputSchema: {
      type: "object" as const,
      properties: { code: { type: "string" } },
      required: ["code"],
    },
  },
  // ── CRUD ──────────────────────────────────────────────────────────────────
  {
    name: "create_part",
    description: "Create an anchored Part. Defaults: Anchored=true, Reflectance=0. Returns path + read-back.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        parent: { type: "string" },
        size: { type: "object" },
        position: { type: "object" },
        material: { type: "string" },
        color: { description: "{ r,g,b } 0-255, hex '#rrggbb', or palette name" },
        transparency: { type: "number" },
        anchored: { type: "boolean" },
        canCollide: { type: "boolean" },
        reflectance: { type: "number" },
        castShadow: { type: "boolean" },
        allowDefaultMaterial: { type: "boolean" },
        snap: { type: "boolean", description: `Snap position to world grid (default true, tile=${SCALE.tile} studs). Pass false to place at exact coordinates.` },
        tile: { type: "number", description: `Grid tile size in studs (default ${SCALE.tile})` },
      },
      required: ["parent"],
    },
  },
  {
    name: "create_instance",
    description: "Create any Roblox Instance by className (Folder, Model, Script, etc.).",
    inputSchema: {
      type: "object" as const,
      properties: {
        className: { type: "string" },
        parent: { type: "string" },
        props: { type: "object" },
        snap: { type: "boolean", description: `Snap Position to world grid (default true, tile=${SCALE.tile} studs)` },
        tile: { type: "number", description: `Grid tile size in studs (default ${SCALE.tile})` },
      },
      required: ["className", "parent"],
    },
  },
  {
    name: "set_properties",
    description: "Set multiple properties on a single instance. Returns read-back of changed properties.",
    inputSchema: {
      type: "object" as const,
      properties: {
        target: { type: "string" },
        props: { type: "object" },
      },
      required: ["target", "props"],
    },
  },
  {
    name: "set_properties_many",
    description: "Set properties on multiple instances in one call.",
    inputSchema: {
      type: "object" as const,
      properties: {
        targets: { type: "array", items: { type: "object" } },
      },
      required: ["targets"],
    },
  },
  {
    name: "delete_instances",
    description: "Delete instances by path. Sets a ChangeHistory waypoint before deletion.",
    inputSchema: {
      type: "object" as const,
      properties: {
        paths: { type: "array", items: { type: "string" } },
      },
      required: ["paths"],
    },
  },
  {
    name: "clone_instance",
    description: "Clone an instance N times with optional per-clone position offset.",
    inputSchema: {
      type: "object" as const,
      properties: {
        source: { type: "string" },
        parent: { type: "string" },
        count: { type: "number" },
        offset: { type: "object" },
        snap: { type: "boolean", description: `Snap each clone's position to world grid (default true, tile=${SCALE.tile} studs)` },
        tile: { type: "number", description: `Grid tile size in studs (default ${SCALE.tile})` },
      },
      required: ["source", "parent"],
    },
  },
  {
    name: "find_instances",
    description: "Search for instances by className, namePattern, or CollectionService tag.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent: { type: "string" },
        className: { type: "string" },
        namePattern: { type: "string" },
        tag: { type: "string" },
      },
    },
  },
  {
    name: "get_tree",
    description: "Dump instance hierarchy from a root. Returns names, classNames, paths.",
    inputSchema: {
      type: "object" as const,
      properties: {
        root: { type: "string" },
        depth: { type: "number" },
      },
    },
  },
  {
    name: "get_properties",
    description: "Read properties of an instance. Omit keys for the common set.",
    inputSchema: {
      type: "object" as const,
      properties: {
        target: { type: "string" },
        keys: { type: "array", items: { type: "string" } },
      },
      required: ["target"],
    },
  },
  // ── Persistence ───────────────────────────────────────────────────────────
  {
    name: "set_waypoint",
    description: "Set a ChangeHistoryService waypoint (Ctrl+Z recovery point).",
    inputSchema: {
      type: "object" as const,
      properties: { label: { type: "string" } },
      required: ["label"],
    },
  },
  {
    name: "try_save_place",
    description: "Attempt to save. Always returns saved=false — Studio has no programmatic save API. Instructs user to press Ctrl+S.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  // ── Console ───────────────────────────────────────────────────────────────
  {
    name: "get_console_output",
    description: "Read Studio Output messages captured since plugin start.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sinceMarker: { type: "number" },
        levelFilter: { type: "string", enum: ["print", "warn", "error"] },
      },
    },
  },
  // ── Batch ─────────────────────────────────────────────────────────────────
  {
    name: "batch",
    description: "Execute multiple tool calls in one round-trip. Each command is pcall-isolated. Returns array of per-command results.",
    inputSchema: {
      type: "object" as const,
      properties: {
        commands: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tool: { type: "string" },
              args: { type: "object" },
            },
            required: ["tool"],
          },
        },
      },
      required: ["commands"],
    },
  },
  // ── High-level building ───────────────────────────────────────────────────
  {
    name: "build_room",
    description:
      "Build a complete room: floor + 4 walls + ceiling + optional doorway openings. " +
      "Returns model path, all part paths, and doorway world positions. " +
      "Doorways split the wall into segments to create walkable openings.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        parentPath: { type: "string" },
        floorCFrame: {
          type: "object",
          description: "{ position: {x,y,z}, rotation?: {x,y,z} in degrees }",
        },
        sizeXZ: { type: "object", description: "{ x, z } interior dimensions" },
        ceilingHeight: { type: "number", description: `Interior ceiling height (default ${SCALE.ceiling} studs)` },
        wallThickness: { type: "number", description: `Wall slab thickness (default ${SCALE.wallThickness} studs)` },
        floorMaterial: { type: "string" },
        wallMaterial: { type: "string" },
        ceilingMaterial: { type: "string" },
        floorColor: {},
        wallColor: {},
        ceilingColor: {},
        doorways: {
          type: "array",
          items: {
            type: "object",
            description: `{ wall: 'N'|'S'|'E'|'W', width (default ${SCALE.door.width}), height (default ${SCALE.door.height}), offset? (from wall center) }`,
          },
        },
        snap: { type: "boolean", description: `Snap room origin to world grid (default true, tile=${SCALE.tile} studs)` },
        tile: { type: "number", description: `Grid tile size in studs (default ${SCALE.tile})` },
        clearance: { type: "boolean", description: "Check child placement for overlaps and report rejected parts (default true)" },
      },
      required: ["parentPath"],
    },
  },
  {
    name: "build_corridor",
    description: "Build a straight corridor between two points: floor + ceiling + 2 side walls.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        parentPath: { type: "string" },
        fromCFrame: { type: "object", description: "{ position: {x,y,z} }" },
        toCFrame: { type: "object", description: "{ position: {x,y,z} }" },
        width: { type: "number", description: `Interior width (default ${SCALE.door.width * 2} studs)` },
        height: { type: "number", description: `Interior height (default ${SCALE.ceiling} studs)` },
        wallThickness: { type: "number", description: `Wall slab thickness (default ${SCALE.wallThickness} studs)` },
        floorMaterial: { type: "string" },
        wallMaterial: { type: "string" },
        floorColor: {},
        wallColor: {},
        snap: { type: "boolean", description: `Snap endpoints to world grid (default true, tile=${SCALE.tile} studs)` },
        tile: { type: "number", description: `Grid tile size in studs (default ${SCALE.tile})` },
      },
      required: ["parentPath", "fromCFrame", "toCFrame"],
    },
  },
  {
    name: "build_doorway",
    description: "Add door frame (jambs + lintel) at a given world position. The opening itself must already exist (from build_room doorways).",
    inputSchema: {
      type: "object" as const,
      properties: {
        parentPath: { type: "string", description: "Parent Model or Workspace path for frame parts" },
        position: { type: "object", description: "{ x, y, z } center of door opening" },
        width: { type: "number", description: `Opening width (default ${SCALE.door.width} studs)` },
        height: { type: "number", description: `Opening height (default ${SCALE.door.height} studs)` },
        frameDepth: { type: "number", description: `Depth of jambs/lintel (default ${SCALE.wallThickness} studs)` },
        facingAxis: { type: "string", enum: ["X", "Z"], description: "Wall faces X or Z axis (default Z)" },
        snap: { type: "boolean", description: `Snap door position to world grid (default true, tile=${SCALE.tile} studs)` },
        tile: { type: "number", description: `Grid tile size in studs (default ${SCALE.tile})` },
      },
      required: ["parentPath", "position"],
    },
  },
  {
    name: "build_composite",
    description: "Build a multi-part object (machinery, shelving, console) as one Model. Optionally welds all parts to the primary.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        parentPath: { type: "string" },
        parts: { type: "array", items: { type: "object" }, description: "Array of create_part args (omit parent)" },
        primaryPartIndex: { type: "number", description: "1-based index of primary part (default 1)" },
        weld: { type: "boolean", description: "Weld all parts to primary (default false)" },
        snap: { type: "boolean", description: `Snap each part's position to world grid (default true, tile=${SCALE.tile} studs)` },
        tile: { type: "number", description: `Grid tile size in studs (default ${SCALE.tile})` },
        clearance: { type: "boolean", description: "Check parts for mutual overlap and report rejected entries (default true)" },
      },
      required: ["parentPath", "parts"],
    },
  },
  {
    name: "build_grid",
    description: `Place a template part in a rows×cols grid with spacing. Great for pillars, lockers, shelving. Default tile=${SCALE.tile} studs.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        template: { type: "object", description: "create_part args (omit parent/position — position is the grid origin)" },
        rows: { type: "number" },
        cols: { type: "number" },
        spacing: { type: "object", description: "{ x, z } spacing between cells" },
        parentPath: { type: "string" },
        origin: { type: "object", description: "{ x, y, z } grid origin (default {0,0,0})" },
        jitter: { type: "number", description: "DEPRECATED — ignored. Grid positions are now deterministic and snap-aligned." },
        snap: { type: "boolean", description: `Snap grid origin to world grid (default true, tile=${SCALE.tile} studs)` },
        tile: { type: "number", description: `Grid tile size in studs (default ${SCALE.tile})` },
      },
      required: ["parentPath", "template", "rows", "cols", "spacing"],
    },
  },
  // ── Composition ───────────────────────────────────────────────────────────
  {
    name: "populate_room",
    description:
      `Place a set of objects inside an existing room with structured composition: ` +
      `focal hero in center, ${SCALE.humanScale}-stud perimeter walkway, props on ${SCALE.tile}-stud grid. ` +
      `Requires the room model path and interior size.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        roomModelPath: { type: "string", description: "Path to the room Model (from build_room)" },
        floorCFrame: {
          type: "object",
          description:
            "{ position: {x,y,z} } — Y must be the TOP SURFACE of the floor slab " +
            "(the same floorCFrame.position.y you passed to build_room). " +
            "Parts will sit on top of this Y; passing the floor model center instead of the surface will sink furniture into the floor.",
        },
        sizeXZ: { type: "object", description: `{ x, z } interior dimensions (match build_room sizeXZ). Minimum ${MIN_ROOM_DIM}×${MIN_ROOM_DIM} studs or all contents are rejected.` },
        contents: {
          type: "array",
          items: {
            type: "object",
            description: `{ kind: 'focal'|'prop'|'fixture', size: {x,y,z}, preferredZone?: 'center'|'perimeter'|'corner', color?, material?, name? }`,
          },
        },
        tile: { type: "number", description: `Grid tile size (default ${SCALE.tile})` },
        clearance: { type: "boolean", description: "Reject overlapping placements (default true)" },
      },
      required: ["roomModelPath", "floorCFrame", "sizeXZ", "contents"],
    },
  },
  // ── Session palette ───────────────────────────────────────────────────────
  {
    name: "set_session_palette",
    description:
      "Set the active session palette so subsequent build calls inherit colors automatically. " +
      "Use after extract_palette or supply colors directly. Roles: primary, secondary, accent, floor, wall, trim.",
    inputSchema: {
      type: "object" as const,
      properties: {
        roles: {
          type: "object",
          description: "Map of role → hex color string. Keys: primary, secondary, accent, floor, wall, trim.",
        },
        source: { type: "string", description: "Optional label for traceability (e.g. reference image path)" },
      },
      required: ["roles"],
    },
  },
  {
    name: "get_session_palette",
    description: "Read the current session palette (set via set_session_palette or apply_palette_from_image).",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "apply_palette_from_image",
    description:
      "Extract dominant colors from an image and set them as the session palette in one step. " +
      "Maps the top-N colors to roles (primary, secondary, accent, floor, wall, trim) by population. " +
      "Subsequent build calls inherit these colors automatically.",
    inputSchema: {
      type: "object" as const,
      properties: {
        imagePathOrBase64: { type: "string", description: "Absolute file path or base64/data-URI" },
        count: { type: "number", description: "Colors to extract before role mapping (default 6)" },
      },
      required: ["imagePathOrBase64"],
    },
  },
  // ── Playtest ──────────────────────────────────────────────────────────────
  {
    name: "start_playtest",
    description:
      "Begin a playtest run (via TestService:Run()). Records a log marker. " +
      "If auto-start fails, instructs user to press F5. Always returns a marker for get_playtest_output.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_playtest_output",
    description: "Poll Studio Output logs captured since start_playtest (or a custom marker). Returns isRunMode flag.",
    inputSchema: {
      type: "object" as const,
      properties: {
        since: { type: "number", description: "os.clock() marker from start_playtest or previous call" },
        levelFilter: { type: "string", enum: ["print", "warn", "error"] },
      },
    },
  },
  {
    name: "stop_playtest",
    description: "Stop the playtest (TestService:Stop()). Returns all logs since start_playtest.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  // ── Image helpers (server-side, no plugin round-trip) ─────────────────────
  {
    name: "extract_palette",
    description:
      "Extract dominant colors from an image using k-means++ clustering. " +
      "Returns up to `count` colors with hex, rgb, and population. " +
      "Accepts a file path or base64/data-URI string.",
    inputSchema: {
      type: "object" as const,
      properties: {
        imagePathOrBase64: { type: "string", description: "Absolute file path or base64/data-URI" },
        count: { type: "number", description: "Number of colors to extract (default 6)" },
      },
      required: ["imagePathOrBase64"],
    },
  },
  {
    name: "reference_attach",
    description: "Save a reference image to the project's references/ folder with a label for traceability.",
    inputSchema: {
      type: "object" as const,
      properties: {
        imagePathOrBase64: { type: "string" },
        label: { type: "string", description: "Filename label (alphanumeric + - _)" },
      },
      required: ["imagePathOrBase64", "label"],
    },
  },
  {
    name: "image_to_grid",
    description:
      "EXPERIMENTAL: Downsample an image to a coarse occupancy grid (1=filled/dark, 0=empty/light). " +
      "Useful for seeding room layouts from top-down sketches. Review output before building.",
    inputSchema: {
      type: "object" as const,
      properties: {
        imagePathOrBase64: { type: "string" },
        gridW: { type: "number", description: "Grid columns" },
        gridH: { type: "number", description: "Grid rows" },
        threshold: { type: "number", description: "Luminance threshold 0-255 (default 128). Below = filled." },
      },
      required: ["imagePathOrBase64", "gridW", "gridH"],
    },
  },
  // ── Lighting ──────────────────────────────────────────────────────────────
  {
    name: "add_light",
    description: "Add a Point, Spot, or Surface light to a part.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parentPart: { type: "string" },
        type: { type: "string", enum: ["Point", "Spot", "Surface"] },
        brightness: { type: "number" },
        range: { type: "number" },
        color: {},
        angle: { type: "number", description: "SpotLight only" },
        shadows: { type: "boolean" },
      },
      required: ["parentPart"],
    },
  },
  {
    name: "add_flicker",
    description: "Attach a flicker LocalScript to a light. Randomly varies Brightness.",
    inputSchema: {
      type: "object" as const,
      properties: {
        lightPath: { type: "string" },
        minBrightness: { type: "number" },
        maxBrightness: { type: "number" },
        intervalRange: { type: "object", description: "{ min, max } seconds between flicker steps" },
      },
      required: ["lightPath"],
    },
  },
  {
    name: "add_pulse",
    description: "Attach a smooth pulse TweenService script to a light or Neon part.",
    inputSchema: {
      type: "object" as const,
      properties: {
        lightOrNeonPath: { type: "string" },
        minB: { type: "number" },
        maxB: { type: "number" },
        period: { type: "number", description: "Full cycle duration in seconds" },
      },
      required: ["lightOrNeonPath"],
    },
  },
  // ── Memory layer (server-side, Phase 5) ──────────────────────────────────────
  {
    name: "get_project_rules",
    description: "Read critical rules and design pillars from the project's CLAUDE.md. Returns key sections as text.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_decisions",
    description: "Read architecture decision records from memory/decisions.md. Optionally filter by keyword.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filter: { type: "string", description: "Keyword to filter ADR titles (optional)" },
      },
    },
  },
  {
    name: "append_adr",
    description: "Append a new Architecture Decision Record to memory/decisions.md. Auto-numbers the ADR.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Short decision title" },
        body: { type: "string", description: "Markdown body: context, decision, consequences" },
        id: { type: "string", description: "Override ADR id (e.g. ADR-007). Auto-numbered if omitted." },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "append_changelog",
    description: "Insert a dated entry under the ## CHANGELOG section in CLAUDE.md (creates the section if missing).",
    inputSchema: {
      type: "object" as const,
      properties: {
        heading: { type: "string", description: "Short heading for this changelog entry" },
        body: { type: "string", description: "Markdown body describing what changed" },
      },
      required: ["heading", "body"],
    },
  },
  {
    name: "get_roadmap",
    description: "Read the project roadmap from memory/roadmap.md.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "update_roadmap",
    description: "Overwrite memory/roadmap.md with new content. Provide full markdown.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "Full markdown content for roadmap.md" },
      },
      required: ["content"],
    },
  },
  // ── Phase 1: Project Intelligence ────────────────────────────────────────
  {
    name: "get_project_tree",
    description: "Dump instance hierarchy from a root with optional ClassName filter. More powerful than get_tree.",
    inputSchema: {
      type: "object" as const,
      properties: {
        root: { type: "string", description: "Dot-path root (default: Workspace)" },
        depth: { type: "number", description: "Max depth (default: 4)" },
        className: { type: "string", description: "Filter children to this ClassName" },
      },
    },
  },
  {
    name: "get_workspace_stats",
    description: "Return total instance count and top-20 ClassNames by count.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "find_models",
    description: "Find all Model instances, optionally filtered by name pattern or parent.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent: { type: "string" },
        namePattern: { type: "string" },
      },
    },
  },
  {
    name: "find_parts",
    description: "Find all BasePart descendants (Part, MeshPart, UnionOperation, etc.).",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent: { type: "string", description: "Dot-path root (default: Workspace)" },
        namePattern: { type: "string" },
      },
    },
  },
  {
    name: "find_scripts",
    description: "Find Script, LocalScript, and ModuleScript instances in the game.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent: { type: "string" },
        className: { type: "string", description: "Script | LocalScript | ModuleScript" },
        namePattern: { type: "string" },
      },
    },
  },
  {
    name: "get_script_source",
    description: "Read the .Source property of a Script or ModuleScript.",
    inputSchema: {
      type: "object" as const,
      properties: {
        target: { type: "string", description: "Dot-path to the script instance" },
        maxLength: { type: "number", description: "Max chars to return (default: 8000)" },
      },
      required: ["target"],
    },
  },
  {
    name: "search_scripts",
    description: "Regex search across all script .Source properties. Returns matching file paths and line numbers.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Lua pattern to search for" },
        parent: { type: "string" },
        maxResults: { type: "number", description: "Max script files to return (default: 50)" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "find_remote_events",
    description: "Find all RemoteEvent instances in the game.",
    inputSchema: {
      type: "object" as const,
      properties: { parent: { type: "string" }, namePattern: { type: "string" } },
    },
  },
  {
    name: "find_remote_functions",
    description: "Find all RemoteFunction instances in the game.",
    inputSchema: {
      type: "object" as const,
      properties: { parent: { type: "string" }, namePattern: { type: "string" } },
    },
  },
  {
    name: "dependency_graph",
    description: "Walk all scripts and extract a script→RemoteEvent→script dependency graph.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "analyze_project",
    description: "One-call project summary: script count, part count, remote event count, services used, warnings.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_snapshot",
    description: "Serialize current project state to memory/snapshots/<timestamp>.json for later diffing.",
    inputSchema: {
      type: "object" as const,
      properties: {
        label: { type: "string", description: "Optional label for the snapshot filename" },
      },
    },
  },
  {
    name: "diff_snapshot",
    description: "Compare two snapshot files and return delta for part/script/model/instance counts.",
    inputSchema: {
      type: "object" as const,
      properties: {
        snapshotA: { type: "string", description: "Absolute path to the before snapshot" },
        snapshotB: { type: "string", description: "Absolute path to the after snapshot" },
      },
      required: ["snapshotA", "snapshotB"],
    },
  },
  {
    name: "list_snapshots",
    description: "List the 20 most recent snapshots stored in memory/snapshots/.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "analyze_self",
    description: "Read graphify-out/graph.json and return MCP server's own architecture: community map, god nodes, edge count.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  // ── Phase 2: Build Intelligence 2.0 ──────────────────────────────────────
  {
    name: "generate_floorplan",
    description: "Generate a room+connection graph for a building kind (prison, school, …). Returns rooms with positions and edges.",
    inputSchema: {
      type: "object" as const,
      properties: {
        kind: { type: "string", description: "Building type: prison | school" },
      },
      required: ["kind"],
    },
  },
  {
    name: "list_building_kinds",
    description: "List available building kinds for generate_floorplan.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "build_structure",
    description: "Build all rooms and corridors from a floorplan JSON returned by generate_floorplan.",
    inputSchema: {
      type: "object" as const,
      properties: {
        floorplan: { type: "object", description: "Floorplan JSON from generate_floorplan" },
        parentPath: { type: "string", description: "Parent model path (default: Workspace)" },
        yOffset: { type: "number", description: "Y offset for floor origin (default: 0)" },
      },
      required: ["floorplan"],
    },
  },
  {
    name: "build_building",
    description: "One-shot: generate floorplan for the given kind then build it in Studio.",
    inputSchema: {
      type: "object" as const,
      properties: {
        kind: { type: "string", description: "Building type: prison | school" },
        parentPath: { type: "string" },
        yOffset: { type: "number" },
      },
      required: ["kind"],
    },
  },
  {
    name: "connect_rooms",
    description: "Plan door/corridor connections between two rooms. Returns which wall of each room faces the other.",
    inputSchema: {
      type: "object" as const,
      properties: {
        roomA: { type: "object", description: "{ id, x, z, w, l } room A spec" },
        roomB: { type: "object", description: "{ id, x, z, w, l } room B spec" },
      },
      required: ["roomA", "roomB"],
    },
  },
  {
    name: "list_room_presets",
    description: "List all available semantic room presets with default sizes and material suggestions.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  // ── Phase 3: Style Engine ─────────────────────────────────────────────────
  {
    name: "set_session_style",
    description: "Activate a named style preset for this session. Influences materials, palette, lighting, and prop suggestions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        style: { type: "string", description: "Style name: prison | hospital | school | industrial | sci-fi | military | office | residential" },
      },
      required: ["style"],
    },
  },
  {
    name: "get_session_style",
    description: "Return the currently active style preset for this session.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "list_styles",
    description: "List all built-in style presets with their material and palette definitions.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "apply_style_to_palette",
    description: "Push the active style's palette roles into the session palette so color resolution picks them up.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  // ── Phase 4: VFX Intelligence ─────────────────────────────────────────────
  {
    name: "create_particle",
    description: "Create a ParticleEmitter on a part with configurable rate, lifetime, speed, color, texture.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent: { type: "string" }, name: { type: "string" },
        rate: { type: "number" }, lifetime: { type: "number" }, speed: { type: "number" },
        size: { type: "number" }, color: {}, texture: { type: "string" },
        lightEmission: { type: "number" }, spread: { type: "number" }, enabled: { type: "boolean" },
      },
    },
  },
  {
    name: "create_fire",
    description: "Attach a Fire effect to a part.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent: { type: "string" }, name: { type: "string" },
        color: {}, secondaryColor: {}, heat: { type: "number" }, size: { type: "number" },
      },
    },
  },
  {
    name: "create_smoke",
    description: "Attach a Smoke effect to a part.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent: { type: "string" }, name: { type: "string" },
        color: {}, opacity: { type: "number" }, riseVelocity: { type: "number" }, size: { type: "number" },
      },
    },
  },
  {
    name: "create_sparks",
    description: "Attach a Sparkles effect to a part.",
    inputSchema: {
      type: "object" as const,
      properties: { parent: { type: "string" }, name: { type: "string" }, color: {} },
    },
  },
  {
    name: "create_explosion_vfx",
    description: "Emit a burst particle explosion on a part.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent: { type: "string" }, name: { type: "string" },
        radius: { type: "number" }, speed: { type: "number" }, count: { type: "number" },
      },
    },
  },
  {
    name: "create_rain",
    description: "Attach a rain particle system to the current camera.",
    inputSchema: {
      type: "object" as const,
      properties: { rate: { type: "number" }, speed: { type: "number" } },
    },
  },
  {
    name: "create_snow",
    description: "Attach a snow particle system to the current camera.",
    inputSchema: {
      type: "object" as const,
      properties: { rate: { type: "number" }, speed: { type: "number" } },
    },
  },
  {
    name: "camera_shake",
    description: "Inject a LocalScript that shakes the camera for a duration.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent: { type: "string" }, duration: { type: "number" },
        amplitude: { type: "number" }, frequency: { type: "number" },
      },
    },
  },
  {
    name: "screen_flash",
    description: "Inject a LocalScript that flashes the screen with a color then fades out.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent: { type: "string" }, color: { type: "string" }, duration: { type: "number" },
      },
    },
  },
  // ── Phase 5: Animation Intelligence ──────────────────────────────────────
  {
    name: "create_animation",
    description: "Build a KeyframeSequence from a list of {time, partName, position?, rotation?} keyframes and store it in ServerStorage.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string" }, parent: { type: "string" }, loop: { type: "boolean" },
        keyframes: { type: "array", items: { type: "object" } },
      },
    },
  },
  {
    name: "animate_door",
    description: "Inject a ProximityPrompt + TweenService LocalScript onto a door part so players can open/close it.",
    inputSchema: {
      type: "object" as const,
      properties: {
        target: { type: "string", description: "Dot-path to the door part" },
        openAngle: { type: "number", description: "Rotation angle in degrees (default 90)" },
        duration:  { type: "number", description: "Tween duration in seconds (default 0.5)" },
      },
      required: ["target"],
    },
  },
  {
    name: "animate_elevator",
    description: "Inject a ProximityPrompt + TweenService LocalScript to move an elevator between two floor positions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        target:   { type: "string", description: "Dot-path to the elevator platform part" },
        floorA:   { type: "object", description: "{ x, y, z } bottom floor position" },
        floorB:   { type: "object", description: "{ x, y, z } top floor position" },
        duration: { type: "number", description: "Travel time in seconds (default 2)" },
      },
      required: ["target"],
    },
  },
  {
    name: "animate_npc",
    description: "Load and play an animation preset on an NPC's Animator.",
    inputSchema: {
      type: "object" as const,
      properties: {
        target:      { type: "string", description: "Dot-path to the NPC Model" },
        preset:      { type: "string", description: "idle | walk | run | jump | fall" },
        animationId: { type: "string", description: "Override animation asset ID" },
      },
      required: ["target"],
    },
  },
  {
    name: "create_cutscene",
    description: "Generate a LocalScript that moves the camera through a list of {time, position, rotation} beats.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent: { type: "string" },
        beats: {
          type: "array",
          description: "Array of {time, position:{x,y,z}, rotation:{x,y,z}} camera keyframes",
          items: { type: "object" },
        },
      },
    },
  },
  {
    name: "create_timeline",
    description: "Compose and validate a timeline of tween/VFX/UI events ordered by time. Returns sorted event list.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name:   { type: "string" },
        events: { type: "array", items: { type: "object" }, description: "Array of {time, kind, tool, args, label?}" },
      },
      required: ["name", "events"],
    },
  },
  // ── Phase 6: UI Intelligence ──────────────────────────────────────────────
  {
    name: "create_ui",
    description: "Build a ScreenGui from a layout tree of nodes (Frame, TextLabel, TextButton, ImageLabel, etc.).",
    inputSchema: {
      type: "object" as const,
      properties: {
        name:           { type: "string" },
        parent:         { type: "string", description: "Dot-path to PlayerGui or StarterGui (default: StarterGui)" },
        layout:         { type: "object", description: "Root UiNode layout tree" },
        displayOrder:   { type: "number" },
        resetOnSpawn:   { type: "boolean" },
      },
      required: ["layout"],
    },
  },
  {
    name: "create_hud",
    description: "Generate and build a HUD ScreenGui with a health bar and player name.",
    inputSchema: {
      type: "object" as const,
      properties: { parent: { type: "string" }, playerName: { type: "string" } },
    },
  },
  {
    name: "create_menu",
    description: "Generate and build a main menu ScreenGui with title and configurable buttons.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent: { type: "string" }, title: { type: "string" },
        buttons: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "create_inventory_ui",
    description: "Generate and build a 9-slot inventory bar ScreenGui.",
    inputSchema: {
      type: "object" as const,
      properties: { parent: { type: "string" } },
    },
  },
  {
    name: "create_shop_ui",
    description: "Generate and build a shop ScreenGui with configurable items.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent: { type: "string" },
        items: { type: "array", items: { type: "object", description: "{ name, price }" } },
      },
    },
  },
  {
    name: "create_tycoon_ui",
    description: "Generate and build a tycoon money display HUD.",
    inputSchema: {
      type: "object" as const,
      properties: { parent: { type: "string" }, moneyLabel: { type: "string" } },
    },
  },
  {
    name: "apply_ui_theme",
    description: "Apply the active session style's palette to a ScreenGui (recolor background and text elements).",
    inputSchema: {
      type: "object" as const,
      properties: { target: { type: "string", description: "Dot-path to ScreenGui" } },
    },
  },
  {
    name: "analyze_ui",
    description: "Walk all ScreenGui instances and return their structure.",
    inputSchema: {
      type: "object" as const,
      properties: { parent: { type: "string" } },
    },
  },
  // ── Phase 7: NPC Intelligence ─────────────────────────────────────────────
  {
    name: "create_npc",
    description: "Instantiate a minimal NPC Model with Humanoid, Animator, and optional ProximityPrompt.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name:       { type: "string" },
        parent:     { type: "string" },
        position:   { type: "object", description: "{ x, y, z }" },
        walkSpeed:  { type: "number" },
        maxHealth:  { type: "number" },
        interactive:{ type: "boolean" },
        promptText: { type: "string" },
      },
    },
  },
  {
    name: "create_behavior_tree",
    description: "Store a behavior-tree JSON and inject a ModuleScript + runner into an NPC.",
    inputSchema: {
      type: "object" as const,
      properties: {
        target:       { type: "string", description: "Dot-path to NPC Model" },
        behaviorTree: { type: "object", description: "BehaviorTree JSON from patrol_behavior / guard_behavior etc." },
      },
      required: ["target", "behaviorTree"],
    },
  },
  {
    name: "patrol_behavior",
    description: "Generate a patrol BehaviorTree that loops through a list of waypoints.",
    inputSchema: {
      type: "object" as const,
      properties: {
        waypoints: { type: "array", items: { type: "object" }, description: "Array of {x,y,z} positions" },
      },
      required: ["waypoints"],
    },
  },
  {
    name: "guard_behavior",
    description: "Generate a guard BehaviorTree: chase players in range, return to post otherwise.",
    inputSchema: {
      type: "object" as const,
      properties: {
        postPosition: { type: "object", description: "{ x, y, z } home position" },
        alertRadius:  { type: "number", description: "Detection radius in studs (default 20)" },
      },
      required: ["postPosition"],
    },
  },
  {
    name: "chase_behavior",
    description: "Generate a chase BehaviorTree: pursue and attack the nearest player.",
    inputSchema: {
      type: "object" as const,
      properties: {
        chaseSpeed:   { type: "number", description: "NPC run speed (default 20)" },
        giveUpRadius: { type: "number", description: "Give-up distance in studs (default 50)" },
      },
    },
  },
  {
    name: "interact_behavior",
    description: "Generate an interact BehaviorTree: show a ProximityPrompt and play dialog lines.",
    inputSchema: {
      type: "object" as const,
      properties: {
        promptText:  { type: "string" },
        dialogLines: { type: "array", items: { type: "string" } },
      },
    },
  },
  // ── Phase 8: Gameplay Systems ─────────────────────────────────────────────
  {
    name: "create_currency_system",
    description: "Generate and inject a DataStore-backed currency ModuleScript into ServerStorage.",
    inputSchema: {
      type: "object" as const,
      properties: {
        currencyName: { type: "string", description: "e.g. Coins, Cash (default: Coins)" },
        startAmount:  { type: "number", description: "Starting amount for new players (default: 0)" },
        parent:       { type: "string" },
      },
    },
  },
  {
    name: "create_upgrade_system",
    description: "Generate and inject an upgrade tier ModuleScript.",
    inputSchema: {
      type: "object" as const,
      properties: {
        upgrades:     { type: "array", items: { type: "object" }, description: "Array of {id, name, cost, maxLevel}" },
        currencyName: { type: "string" },
        parent:       { type: "string" },
      },
    },
  },
  {
    name: "create_quest_system",
    description: "Generate and inject a quest registry ModuleScript.",
    inputSchema: {
      type: "object" as const,
      properties: {
        quests: { type: "array", items: { type: "object" }, description: "Array of {id, name, description, goal}" },
        parent: { type: "string" },
      },
    },
  },
  {
    name: "create_round_system",
    description: "Generate and inject a round loop ModuleScript (Intermission → InRound → Postgame).",
    inputSchema: {
      type: "object" as const,
      properties: {
        intermissionDuration: { type: "number" },
        roundDuration:        { type: "number" },
        minPlayers:           { type: "number" },
        parent:               { type: "string" },
      },
    },
  },
  {
    name: "create_objective_system",
    description: "Generate and inject an objective tracking ModuleScript.",
    inputSchema: {
      type: "object" as const,
      properties: {
        objectives: { type: "array", items: { type: "object" }, description: "Array of {id, description, questId?}" },
        parent:     { type: "string" },
      },
    },
  },
  {
    name: "create_progression_system",
    description: "Generate and inject an XP/level progression ModuleScript.",
    inputSchema: {
      type: "object" as const,
      properties: {
        xpPerLevel: { type: "number" },
        maxLevel:   { type: "number" },
        parent:     { type: "string" },
      },
    },
  },
  // ── Phase 9: Reference Intelligence ──────────────────────────────────────
  {
    name: "classify_style",
    description: "Heuristic image → style preset classifier (prison, hospital, school, etc.).",
    inputSchema: {
      type: "object" as const,
      properties: { imagePath: { type: "string" } },
      required: ["imagePath"],
    },
  },
  {
    name: "classify_room",
    description: "Heuristic image → room kind classifier (hallway, cafeteria, lab, etc.).",
    inputSchema: {
      type: "object" as const,
      properties: { imagePath: { type: "string" } },
      required: ["imagePath"],
    },
  },
  {
    name: "suggest_props",
    description: "Derive prop tags from an image by combining style + room classifiers.",
    inputSchema: {
      type: "object" as const,
      properties: { imagePath: { type: "string" } },
      required: ["imagePath"],
    },
  },
  {
    name: "recognize_environment",
    description: "Full image analysis: style, room kinds, prop tags, and dominant+accent palette.",
    inputSchema: {
      type: "object" as const,
      properties: { imagePath: { type: "string" } },
      required: ["imagePath"],
    },
  },
  // ── Phase 10: Autonomous Validation & Repair ──────────────────────────────
  {
    name: "validate_build",
    description: "Check a workspace subtree for overlapping parts, floating parts, and invalid scale.",
    inputSchema: {
      type: "object" as const,
      properties: { parent: { type: "string", description: "Workspace path to validate (default: Workspace)" } },
    },
  },
  {
    name: "validate_game",
    description: "High-level game validation: script count, model count, part count, RemoteEvents, warnings.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "auto_fix",
    description: "Plan and apply fixes from a validate_build report (anchor floaters, clamp bad scale, move overlaps).",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent:  { type: "string" },
        dryRun:  { type: "boolean", description: "If true, return fix plan without applying (default false)" },
      },
    },
  },
  {
    name: "run_playtest",
    description: "Start playtest, wait for output, then stop. Returns captured console output.",
    inputSchema: {
      type: "object" as const,
      properties: { waitSeconds: { type: "number", description: "Seconds to wait before stopping (default 5)" } },
    },
  },
  {
    name: "autonomous_iterate",
    description: "Run Plan→Build→Validate→Fix→Validate loop up to maxIterations or until clean.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent:        { type: "string" },
        maxIterations: { type: "number" },
        writeAdr:      { type: "boolean", description: "Append an ADR summarizing results (default true)" },
      },
    },
  },
];

// ─── Registration ─────────────────────────────────────────────────────────────

const SERVER_SIDE_TOOLS = new Set([
  "extract_palette", "reference_attach", "image_to_grid",
  "set_session_palette", "get_session_palette", "apply_palette_from_image",
  "populate_room",
  "get_project_rules", "get_decisions", "append_adr", "append_changelog",
  "get_roadmap", "update_roadmap",
  // Phase 1: project intel (hybrid + pure-TS)
  "create_snapshot", "diff_snapshot", "list_snapshots", "analyze_self",
  // Phase 2: build intelligence
  "generate_floorplan", "list_building_kinds", "connect_rooms", "list_room_presets",
  "build_structure", "build_building",
  // Phase 3: style engine
  "set_session_style", "get_session_style", "list_styles", "apply_style_to_palette",
  // Phase 5: animation (timeline is server-side; rest are plugin-side)
  "create_timeline",
  // Phase 6: UI Intelligence (presets are server-side planners; create_ui dispatches to plugin)
  "create_menu", "create_hud", "create_inventory_ui", "create_shop_ui", "create_tycoon_ui", "apply_ui_theme",
  // Phase 7: NPC Intelligence
  "create_behavior_tree", "patrol_behavior", "guard_behavior", "chase_behavior", "interact_behavior",
  // Phase 8: Gameplay Systems
  "create_currency_system", "create_upgrade_system", "create_quest_system",
  "create_round_system", "create_objective_system", "create_progression_system",
  // Phase 9: Reference Intelligence
  "classify_style", "classify_room", "suggest_props", "recognize_environment",
  // Phase 10: Autonomous Validation & Repair
  "auto_fix", "autonomous_iterate",
]);

export function registerCoreTools(server: Server, bridge: HttpBridge, config: Config): void {
  const facadeDefs = buildFacadeDefs(TOOL_DEFS);
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: facadeDefs }));

  const runServerSide = async (toolName: string, toolArgs: Record<string, unknown>, sessionId = "default"): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> => {
    const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
    const er = (msg: string) => ({ content: [{ type: "text" as const, text: msg }], isError: true as const });
    if (toolName === "extract_palette") {
      try {
        return ok(await extractPalette(toolArgs["imagePathOrBase64"] as string, (toolArgs["count"] as number | undefined) ?? 6));
      } catch (e) { return er(`extract_palette error: ${String(e)}`); }
    }
    if (toolName === "reference_attach") {
      try {
        return ok(referenceAttach(toolArgs["imagePathOrBase64"] as string, toolArgs["label"] as string, config.projectRoot));
      } catch (e) { return er(`reference_attach error: ${String(e)}`); }
    }
    if (toolName === "image_to_grid") {
      try {
        return ok(await imageToGrid(toolArgs["imagePathOrBase64"] as string, toolArgs["gridW"] as number, toolArgs["gridH"] as number, (toolArgs["threshold"] as number | undefined) ?? 128));
      } catch (e) { return er(`image_to_grid error: ${String(e)}`); }
    }
    if (toolName === "set_session_palette") {
      setSessionPalette({ roles: toolArgs["roles"] as Record<PaletteRole, string>, source: toolArgs["source"] as string | undefined }, sessionId);
      return ok({ ok: true, roles: toolArgs["roles"] });
    }
    if (toolName === "get_session_palette") { return ok(getSessionPalette(sessionId)); }
    if (toolName === "apply_palette_from_image") {
      try {
        const entries = await extractPalette(toolArgs["imagePathOrBase64"] as string, (toolArgs["count"] as number | undefined) ?? 6);
        const roles = paletteToRoles(entries);
        setSessionPalette({ roles, source: toolArgs["imagePathOrBase64"] as string }, sessionId);
        return ok({ ok: true, roles, palette: entries });
      } catch (e) { return er(`apply_palette_from_image error: ${String(e)}`); }
    }
    if (toolName === "populate_room") {
      try {
        const fc = (toolArgs["floorCFrame"] ?? {}) as Record<string, unknown>;
        const fcPos = (fc["position"] ?? fc) as Record<string, number>;
        const room: RoomSpec = {
          floorPosition: { x: Number(fcPos["x"] ?? 0), y: Number(fcPos["y"] ?? 0), z: Number(fcPos["z"] ?? 0) },
          sizeXZ: toolArgs["sizeXZ"] as { x: number; z: number },
        };
        const plans = planRoomContents(room, toolArgs["contents"] as RoomContent[], (toolArgs["tile"] as number | undefined) ?? SCALE.tile);
        return fmt(await bridge.send("populate_room", { roomModelPath: toolArgs["roomModelPath"], plans }), "populate_room");
      } catch (e) { return er(`populate_room error: ${String(e)}`); }
    }
    // Phase 1: project intel (hybrid/pure-TS)
    if (toolName === "create_snapshot") {
      try {
        const raw = await bridge.send("create_snapshot", {});
        if (!raw.ok) return er(`create_snapshot plugin error: ${raw.error ?? "unknown"}`);
        const filepath = writeSnapshot(config.projectRoot, raw.data, toolArgs["label"] as string | undefined);
        return ok({ path: filepath, ...(raw.data as object) });
      } catch (e) { return er(`create_snapshot error: ${String(e)}`); }
    }
    if (toolName === "diff_snapshot") {
      try {
        return ok(diffSnapshots(toolArgs["snapshotA"] as string, toolArgs["snapshotB"] as string));
      } catch (e) { return er(`diff_snapshot error: ${String(e)}`); }
    }
    if (toolName === "list_snapshots") {
      return ok(listSnapshots(config.projectRoot));
    }
    if (toolName === "analyze_self") {
      try { return ok(analyzeSelf()); }
      catch (e) { return er(`analyze_self error: ${String(e)}`); }
    }
    // Phase 2: Build Intelligence 2.0
    if (toolName === "generate_floorplan") {
      try { return ok(generateFloorplan(toolArgs["kind"] as string)); }
      catch (e) { return er(`generate_floorplan: ${String(e)}`); }
    }
    if (toolName === "list_building_kinds") {
      return ok({ kinds: listFloorplanKinds() });
    }
    if (toolName === "list_room_presets") {
      const { ROOM_PRESETS } = await import("../build/semantic_rooms.js");
      return ok(Object.values(ROOM_PRESETS).map(p => ({
        kind: p.kind, label: p.label, w: p.w, l: p.l, h: p.h,
        floorMaterial: p.floorMaterial, wallMaterial: p.wallMaterial,
        propTags: p.propTags, description: p.description,
      })));
    }
    if (toolName === "connect_rooms") {
      try {
        const rA = toolArgs["roomA"] as { id: string; x: number; z: number; w: number; l: number; h?: number; y?: number };
        const rB = toolArgs["roomB"] as { id: string; x: number; z: number; w: number; l: number; h?: number; y?: number };
        const conn = planConnection({ ...rA, kind: "corridor" as const, label: "", y: rA.y ?? 0, h: rA.h ?? 10, floorMaterial: "", wallMaterial: "", ceilingMaterial: "" }, { ...rB, kind: "corridor" as const, label: "", y: rB.y ?? 0, h: rB.h ?? 10, floorMaterial: "", wallMaterial: "", ceilingMaterial: "" });
        return ok({ roomA: rA.id, wallA: conn.wallA, roomB: rB.id, wallB: conn.wallB });
      } catch (e) { return er(`connect_rooms: ${String(e)}`); }
    }
    if (toolName === "build_structure" || toolName === "build_building") {
      try {
        let fp = toolArgs["floorplan"] as ReturnType<typeof generateFloorplan> | undefined;
        if (toolName === "build_building") {
          fp = generateFloorplan(toolArgs["kind"] as string);
        }
        if (!fp) return er("build_structure: floorplan is required");
        const parentPath = (toolArgs["parentPath"] as string | undefined) ?? "Workspace";
        const yOffset    = (toolArgs["yOffset"]    as number | undefined) ?? 0;
        const built: string[] = [];

        // Build each room
        for (const r of fp.rooms) {
          const activeStyle = getSessionStyle(sessionId);
          let baseRoom: Record<string, unknown> = {
            name: r.id,
            parentPath,
            floorCFrame: { position: { x: r.x, y: yOffset, z: r.z } },
            sizeXZ: { x: r.w, z: r.l },
            ceilingHeight: r.h,
            floorMaterial:   r.floorMaterial,
            wallMaterial:    r.wallMaterial,
            ceilingMaterial: r.ceilingMaterial,
            doorways: [] as Array<{ wall: string; width: number; height: number }>,
          };
          if (activeStyle) baseRoom = applyStyleToRoomArgs(baseRoom, activeStyle, r.kind);
          const roomArgs = baseRoom;

          // Add doorway openings for each edge touching this room
          for (const e of fp.edges) {
            if (e.kind !== "door") continue;
            const other = e.from === r.id ? fp.rooms.find(x => x.id === e.to)
                        : e.to   === r.id ? fp.rooms.find(x => x.id === e.from)
                        : undefined;
            if (!other) continue;
            const conn = planConnection(r, other);
            const wall = e.from === r.id ? conn.wallA : conn.wallB;
            (roomArgs["doorways"] as Array<{ wall: string; width: number; height: number }>).push({
              wall, width: SCALE.door.width, height: SCALE.door.height,
            });
          }

          const result = await bridge.send("build_room", roomArgs);
          if (result.ok) built.push(r.id);
        }

        return ok({ kind: fp.kind, roomsBuilt: built.length, rooms: built, floorplan: fp });
      } catch (e) { return er(`${toolName}: ${String(e)}`); }
    }
    // Phase 8: Gameplay Systems (TS code generators → inject ModuleScript via plugin)
    const GAMEPLAY_GENERATORS: Record<string, () => { name: string; source: string; description: string }> = {
      create_currency_system: () => generateCurrencySystem({
        currencyName: toolArgs["currencyName"] as string | undefined,
        startAmount:  toolArgs["startAmount"]  as number | undefined,
      }),
      create_upgrade_system: () => generateUpgradeSystem({
        upgrades:     toolArgs["upgrades"]     as Array<{ id: string; name: string; cost: number; maxLevel: number }> | undefined,
        currencyName: toolArgs["currencyName"] as string | undefined,
      }),
      create_quest_system: () => generateQuestSystem({
        quests: toolArgs["quests"] as Array<{ id: string; name: string; description: string; goal: number }> | undefined,
      }),
      create_round_system: () => generateRoundSystem({
        intermissionDuration: toolArgs["intermissionDuration"] as number | undefined,
        roundDuration:        toolArgs["roundDuration"]        as number | undefined,
        minPlayers:           toolArgs["minPlayers"]           as number | undefined,
      }),
      create_objective_system: () => generateObjectiveSystem({
        objectives: toolArgs["objectives"] as Array<{ id: string; description: string; questId?: string }> | undefined,
      }),
      create_progression_system: () => generateProgressionSystem({
        xpPerLevel: toolArgs["xpPerLevel"] as number | undefined,
        maxLevel:   toolArgs["maxLevel"]   as number | undefined,
      }),
    };
    if (toolName in GAMEPLAY_GENERATORS) {
      try {
        const mod = GAMEPLAY_GENERATORS[toolName]!();
        const parentPath = (toolArgs["parent"] as string | undefined) ?? "ServerStorage";
        const result = await bridge.send("create_instance", {
          className: "ModuleScript",
          parent: parentPath,
          properties: { Name: mod.name, Source: mod.source },
        });
        if (!result.ok) return er(`${toolName} inject failed: ${result.error ?? "unknown"}`);
        return ok({ name: mod.name, description: mod.description, path: (result.data as { path?: string })?.path });
      } catch (e) { return er(`${toolName}: ${String(e)}`); }
    }
    // Phase 7: NPC behaviors (TS generators + hybrid inject)
    if (toolName === "patrol_behavior")   return ok(patrolBehavior(toolArgs["waypoints"] as Array<{x:number;y:number;z:number}>));
    if (toolName === "guard_behavior")    return ok(guardBehavior(toolArgs["postPosition"] as {x:number;y:number;z:number}, toolArgs["alertRadius"] as number | undefined));
    if (toolName === "chase_behavior")    return ok(chaseBehavior(toolArgs["chaseSpeed"] as number | undefined, toolArgs["giveUpRadius"] as number | undefined));
    if (toolName === "interact_behavior") return ok(interactBehavior(toolArgs["promptText"] as string | undefined, toolArgs["dialogLines"] as string[] | undefined));
    if (toolName === "create_behavior_tree") {
      try {
        const bt = toolArgs["behaviorTree"] as Parameters<typeof validateBehaviorTree>[0];
        const v = validateBehaviorTree(bt);
        if (!v.valid) return er(`Behavior tree invalid:\n${v.errors.join("\n")}`);
        const src = generateBehaviorScript(bt);
        return fmt(await bridge.send("inject_behavior_script", { target: toolArgs["target"], source: src }), "create_behavior_tree");
      } catch (e) { return er(`create_behavior_tree: ${String(e)}`); }
    }
    // Phase 6: UI presets (TS layout generators → dispatch create_ui to plugin)
    const UI_PRESET_MAP: Record<string, PresetName> = {
      create_hud: "hud", create_menu: "menu", create_inventory_ui: "inventory",
      create_shop_ui: "shop", create_tycoon_ui: "tycoon",
    };
    if (toolName in UI_PRESET_MAP) {
      try {
        const layout = getUiPreset(UI_PRESET_MAP[toolName]!, toolArgs);
        const errors = validateUiLayout(layout);
        if (errors.length) return er(`UI layout validation failed:\n${errors.join("\n")}`);
        return fmt(await bridge.send("create_ui", {
          name: `RF_${UI_PRESET_MAP[toolName]}`,
          parent: toolArgs["parent"],
          layout,
        }), toolName);
      } catch (e) { return er(`${toolName}: ${String(e)}`); }
    }
    if (toolName === "apply_ui_theme") {
      const style = getSessionStyle(sessionId);
      if (!style) return er("No active style. Call set_session_style first.");
      return ok({ ok: true, note: "Theme info ready. Use create_ui with backgroundColor from style palette.", palette: style.paletteRoles });
    }
    // Phase 5: Timeline (server-side scheduler)
    if (toolName === "create_timeline") {
      try {
        const tl = createTimeline(
          toolArgs["name"] as string,
          toolArgs["events"] as Parameters<typeof createTimeline>[1]
        );
        const validation = validateTimeline(tl);
        return ok({ ...tl, validation });
      } catch (e) { return er(`create_timeline: ${String(e)}`); }
    }
    // Phase 3: Style Engine
    if (toolName === "set_session_style") {
      try {
        const preset = setSessionStyle(toolArgs["style"] as import("../build/style_engine.js").StyleName, sessionId);
        return ok({ ok: true, style: preset.name, label: preset.label, materials: preset.materials, propTags: preset.propTags });
      } catch (e) { return er(`set_session_style: ${String(e)}`); }
    }
    if (toolName === "get_session_style") {
      const s = getSessionStyle(sessionId);
      return ok(s ?? null);
    }
    if (toolName === "list_styles") {
      return ok(listStyles().map(s => ({ name: s.name, label: s.label, materials: s.materials, propTags: s.propTags })));
    }
    if (toolName === "apply_style_to_palette") {
      const s = getSessionStyle(sessionId);
      if (!s) return er("No active style. Call set_session_style first.");
      setSessionPalette({ roles: s.paletteRoles as Record<PaletteRole, string>, source: `style:${s.name}` }, sessionId);
      return ok({ ok: true, style: s.name, rolesApplied: s.paletteRoles });
    }
    // Phase 9: Reference Intelligence (image classifiers)
    if (toolName === "classify_style") {
      try { return ok(await classifyStyle(toolArgs["imagePath"] as string)); }
      catch (e) { return er(`classify_style: ${String(e)}`); }
    }
    if (toolName === "classify_room") {
      try { return ok(await classifyRoom(toolArgs["imagePath"] as string)); }
      catch (e) { return er(`classify_room: ${String(e)}`); }
    }
    if (toolName === "suggest_props") {
      try { return ok(await suggestProps(toolArgs["imagePath"] as string)); }
      catch (e) { return er(`suggest_props: ${String(e)}`); }
    }
    if (toolName === "recognize_environment") {
      try { return ok(await recognizeEnvironment(toolArgs["imagePath"] as string)); }
      catch (e) { return er(`recognize_environment: ${String(e)}`); }
    }
    // Phase 10: Autonomous Validation & Repair
    if (toolName === "validate_build" || toolName === "validate_game") {
      return fmt(await bridge.send(toolName, { parent: toolArgs["parent"] ?? "Workspace" }), toolName);
    }
    if (toolName === "auto_fix") {
      try {
        const parent = (toolArgs["parent"] as string | undefined) ?? "Workspace";
        const dryRun = (toolArgs["dryRun"] as boolean | undefined) ?? false;
        const raw = await bridge.send("validate_build", { parent });
        if (!raw.ok) return er(`auto_fix: validate_build failed: ${raw.error ?? "unknown"}`);
        const report = raw.data as ValidationReport;
        const plan = planAutoFix(report, parent);
        if (dryRun) return ok({ dryRun: true, report, plan });
        // Apply fix actions
        const applied: string[] = [];
        for (const action of plan.actions) {
          let fixResult: Awaited<ReturnType<typeof bridge.send>>;
          if (action.kind === "anchor" || action.kind === "scale") {
            fixResult = await bridge.send("set_properties", { target: action.target, props: action.args ?? {} });
          } else if (action.kind === "move") {
            const offsetY = (action.args?.["offsetY"] as number | undefined) ?? 0.5;
            fixResult = await bridge.send("execute_luau", {
              code: `local p=game:GetService("Workspace"):FindFirstChild("${action.target.replace(/"/g, '\\"')}",true); if p then p.CFrame = p.CFrame * CFrame.new(0,${offsetY},0) end; return "moved"`,
            });
          } else {
            fixResult = { id: "", ok: true };
          }
          if (fixResult.ok) applied.push(`${action.kind}:${action.target}`);
        }
        return ok({ report, plan, applied, summary: plan.summary });
      } catch (e) { return er(`auto_fix: ${String(e)}`); }
    }
    if (toolName === "run_playtest") {
      try {
        const waitSecs = (toolArgs["waitSeconds"] as number | undefined) ?? 5;
        await bridge.send("start_playtest", {});
        await new Promise(r => setTimeout(r, waitSecs * 1000));
        const output = await bridge.send("get_playtest_output", {});
        await bridge.send("stop_playtest", {});
        return ok({ output: output.data, waited: waitSecs });
      } catch (e) { return er(`run_playtest: ${String(e)}`); }
    }
    if (toolName === "autonomous_iterate") {
      try {
        const parent        = (toolArgs["parent"]        as string  | undefined) ?? "Workspace";
        const maxIterations = (toolArgs["maxIterations"] as number  | undefined) ?? 3;
        const writeAdr      = (toolArgs["writeAdr"]      as boolean | undefined) ?? true;
        const results: import("../build/validation.js").IterationResult[] = [];

        for (let i = 1; i <= maxIterations; i++) {
          const buildRaw = await bridge.send("validate_build", { parent });
          const gameRaw  = await bridge.send("validate_game",  {});
          const buildReport = (buildRaw.ok ? buildRaw.data : { valid: false, overlaps: [], floating: [], badScale: [], warnings: [], errors: [`plugin error: ${buildRaw.error}`] }) as ValidationReport;
          const gameReport  = (gameRaw.ok  ? gameRaw.data  : { valid: false, overlaps: [], floating: [], badScale: [], warnings: [], errors: [`plugin error: ${gameRaw.error}`]  }) as ValidationReport;
          const fixPlan = planAutoFix(buildReport, parent);
          const clean   = buildReport.valid && gameReport.valid;
          results.push({ iteration: i, buildReport, gameReport, fixPlan, clean });
          if (clean) break;
          // Apply fixes
          for (const action of fixPlan.actions) {
            if (action.kind === "anchor" || action.kind === "scale") {
              await bridge.send("set_properties", { target: action.target, props: action.args ?? {} });
            }
          }
        }

        let adrPath: string | undefined;
        if (writeAdr) {
          const adrBody = buildIterationAdr(results);
          const adrResult = appendAdr(config.projectRoot, "Autonomous Iteration", adrBody);
          adrPath = typeof adrResult === "string" ? adrResult : (adrResult as { path?: string })?.path;
        }
        return ok({ iterations: results.length, clean: results[results.length - 1]?.clean, results, adrPath });
      } catch (e) { return er(`autonomous_iterate: ${String(e)}`); }
    }
    // Memory tools
    try {
      let result: unknown;
      const root = config.projectRoot;
      if (toolName === "get_project_rules") { result = getProjectRules(root); }
      else if (toolName === "get_decisions") { result = getDecisions(root, toolArgs["filter"] as string | undefined); }
      else if (toolName === "append_adr") { result = appendAdr(root, toolArgs["title"] as string, toolArgs["body"] as string, toolArgs["id"] as string | undefined); }
      else if (toolName === "append_changelog") { result = appendChangelog(root, toolArgs["heading"] as string, toolArgs["body"] as string); }
      else if (toolName === "get_roadmap") { result = getRoadmap(root); }
      else if (toolName === "update_roadmap") { result = updateRoadmap(root, toolArgs["content"] as string); }
      const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: "text" as const, text }] };
    } catch (e) { return er(`${toolName} error: ${String(e)}`); }
  };

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    let name = request.params.name;
    let rawArgs = (request.params.arguments ?? {}) as Record<string, unknown>;

    // Facade resolution: grouped tools ({action, params}) → internal tool + flat args.
    // Direct internal names still work, so batch sub-commands and old clients keep functioning.
    if (isFacadeGroup(name)) {
      const resolved = resolveFacade(name, rawArgs);
      if ("error" in resolved) return { content: [{ type: "text" as const, text: resolved.error }], isError: true };
      name = resolved.name;
      rawArgs = resolved.args;
    }
    if (name === "batch") {
      const cmds = (rawArgs["commands"] as Array<{ tool: string; args?: Record<string, unknown> }>) ?? [];
      for (const cmd of cmds) {
        const resolved = resolveBatchCmd(cmd.tool, cmd.args ?? {});
        if ("error" in resolved) return { content: [{ type: "text" as const, text: `[batch] ${resolved.error}` }], isError: true };
        cmd.tool = resolved.name;
        cmd.args = resolved.args;
      }
    }

    const sessionId = (rawArgs["_sessionId"] as string | undefined) ?? "default";
    const args = resolveColors(rawArgs, config, sessionId);

    // Material check for tools that create parts
    const matCheckTools = new Set(["create_part", "build_room", "build_corridor", "build_composite", "build_grid"]);
    if (matCheckTools.has(name)) {
      const err = checkMaterial(args, config);
      if (err) return { content: [{ type: "text" as const, text: err }], isError: true };
    }

    // Batch: validate sub-command materials too
    if (name === "batch") {
      const cmds = (args["commands"] as Array<{ tool: string; args: Record<string, unknown> }>) ?? [];
      for (const cmd of cmds) {
        if (matCheckTools.has(cmd.tool)) {
          const err = checkMaterial(cmd.args ?? {}, config);
          if (err)
            return {
              content: [{ type: "text" as const, text: `[batch/${cmd.tool}] ${err}` }],
              isError: true,
            };
        }
      }
      // B2: Mixed-batch — execute server-side sub-commands inline
      if (cmds.some(c => SERVER_SIDE_TOOLS.has(c.tool))) {
        const results: Array<{ index: number; tool: string; data: unknown; error?: string }> = [];
        for (let i = 0; i < cmds.length; i++) {
          const cmd = cmds[i];
          if (SERVER_SIDE_TOOLS.has(cmd.tool)) {
            const r = await runServerSide(cmd.tool, cmd.args ?? {}, sessionId);
            const text = r.content[0]?.text ?? "";
            let data: unknown;
            try { data = JSON.parse(text); } catch { data = text; }
            results.push(r.isError ? { index: i, tool: cmd.tool, data: null, error: text } : { index: i, tool: cmd.tool, data });
          } else {
            results.push({ index: i, tool: cmd.tool, data: await bridge.send(cmd.tool, cmd.args ?? {}) });
          }
        }
        return { content: [{ type: "text" as const, text: JSON.stringify({ results }, null, 2) }] };
      }
    }

    // ── Playtest (plugin-side) ───────────────────────────────────────────────
    if (name === "start_playtest" || name === "get_playtest_output" || name === "stop_playtest") {
      return fmt(await bridge.send(name, args), name);
    }

    // ── Server-side tools ─────────────────────────────────────────────────────
    if (SERVER_SIDE_TOOLS.has(name)) return await runServerSide(name, args, sessionId);

    // ── Jitter deprecation warning ──────────────────────────────────────────────
    if (name === "build_grid" && args["jitter"] !== undefined) {
      console.warn("[robloxforge] build_grid.jitter is deprecated and ignored — grid positions are now deterministic");
    }

    return fmt(await bridge.send(name, args), name);
  });
}

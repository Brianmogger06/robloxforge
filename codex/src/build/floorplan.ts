import { SCALE } from "./scale.js";
import { getRoomPreset, type RoomKind } from "./semantic_rooms.js";

export type EdgeKind = "door" | "corridor";
export type WallSide = "N" | "S" | "E" | "W";

export interface FloorplanRoom {
  id: string;
  kind: RoomKind;
  label: string;
  /** Interior dimensions in studs */
  w: number;
  l: number;
  h: number;
  /** World-space floor origin (bottom-left corner) */
  x: number;
  y: number;
  z: number;
  floorMaterial: string;
  wallMaterial: string;
  ceilingMaterial: string;
}

export interface FloorplanEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface Floorplan {
  kind: string;
  rooms: FloorplanRoom[];
  edges: FloorplanEdge[];
}

// ─── Preset layouts ───────────────────────────────────────────────────────────

const GAP = SCALE.tile * 2; // 8-stud gap between rooms (for outer walls + corridor)

function room(id: string, kind: RoomKind, x: number, z: number, overrides?: Partial<FloorplanRoom>): FloorplanRoom {
  const p = getRoomPreset(kind);
  return {
    id, kind, label: p.label,
    w: p.w, l: p.l, h: p.h,
    x, y: 0, z,
    floorMaterial: p.floorMaterial,
    wallMaterial:  p.wallMaterial,
    ceilingMaterial: p.ceilingMaterial,
    ...overrides,
  };
}

function edge(from: string, to: string, kind: EdgeKind = "door"): FloorplanEdge {
  return { from, to, kind };
}

const LAYOUTS: Record<string, () => Floorplan> = {
  prison: () => {
    const adminW = 40, adminL = 40;
    const cafW = 60, cafL = 40;
    const secW = 20, secL = 20;
    const cbW = 80, cbL = 24;
    const yardW = 100, yardL = 60;

    const adminX = 0,  adminZ = 0;
    const cafX   = adminW + GAP;
    const secX   = 0,  secZ  = adminL + GAP;
    const cbAX   = secW + GAP, cbAZ = adminL + GAP;
    const cbBX   = secW + GAP, cbBZ = cbAZ + cbL + GAP;
    const yardX  = 0,  yardZ = secZ + secL + GAP + cbL + GAP;

    return {
      kind: "prison",
      rooms: [
        room("admin",        "admin",      adminX, adminZ),
        room("cafeteria",    "cafeteria",  cafX,   adminZ),
        room("security",     "security",   secX,   secZ),
        room("cell_block_a", "cell_block", cbAX,   cbAZ),
        room("cell_block_b", "cell_block", cbBX,   cbBZ),
        room("yard",         "yard",       yardX,  yardZ, { w: yardW, l: yardL }),
      ],
      edges: [
        edge("admin",        "cafeteria",    "door"),
        edge("admin",        "security",     "door"),
        edge("security",     "cell_block_a", "door"),
        edge("cell_block_a", "cell_block_b", "corridor"),
        edge("security",     "yard",         "corridor"),
      ],
    };
  },

  school: () => {
    const hallW = 4 * SCALE.tile, hallL = 32 * SCALE.tile;
    const classW = 10 * SCALE.tile, classL = 8 * SCALE.tile;
    const offW = 6 * SCALE.tile, offL = 6 * SCALE.tile;
    const cafW = 15 * SCALE.tile, cafL = 10 * SCALE.tile;
    const bathW = 4 * SCALE.tile, bathL = 4 * SCALE.tile;

    return {
      kind: "school",
      rooms: [
        room("hallway",      "hallway",   0, 0, { w: hallW, l: hallL }),
        room("classroom_1",  "classroom", hallW + GAP, 0,                        { w: classW, l: classL }),
        room("classroom_2",  "classroom", hallW + GAP, classL + GAP,             { w: classW, l: classL }),
        room("classroom_3",  "classroom", hallW + GAP, (classL + GAP) * 2,      { w: classW, l: classL }),
        room("office",       "office",    -(offW + GAP), 0),
        room("cafeteria",    "cafeteria", -(cafW + GAP), offL + GAP, { w: cafW, l: cafL }),
        room("bathroom",     "bathroom",  -(bathW + GAP), offL + cafL + GAP * 2, { w: bathW, l: bathL }),
      ],
      edges: [
        edge("hallway",     "classroom_1", "door"),
        edge("hallway",     "classroom_2", "door"),
        edge("hallway",     "classroom_3", "door"),
        edge("hallway",     "office",      "door"),
        edge("office",      "cafeteria",   "door"),
        edge("cafeteria",   "bathroom",    "corridor"),
      ],
    };
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateFloorplan(kind: string): Floorplan {
  const factory = LAYOUTS[kind.toLowerCase()];
  if (!factory) throw new Error(`Unknown building kind '${kind}'. Available: ${Object.keys(LAYOUTS).join(", ")}`);
  return factory();
}

export function listFloorplanKinds(): string[] {
  return Object.keys(LAYOUTS);
}

// ─── connect_rooms helper ─────────────────────────────────────────────────────

export interface DoorPlan {
  roomId: string;
  wall: WallSide;
  offset: number;
}

/** Given two room specs, determine which wall of each room faces the other. */
export function planConnection(a: FloorplanRoom, b: FloorplanRoom): { wallA: WallSide; wallB: WallSide } {
  const aCenterX = a.x + a.w / 2, aCenterZ = a.z + a.l / 2;
  const bCenterX = b.x + b.w / 2, bCenterZ = b.z + b.l / 2;
  const dx = bCenterX - aCenterX;
  const dz = bCenterZ - aCenterZ;

  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx > 0 ? { wallA: "E", wallB: "W" } : { wallA: "W", wallB: "E" };
  } else {
    return dz > 0 ? { wallA: "S", wallB: "N" } : { wallA: "N", wallB: "S" };
  }
}

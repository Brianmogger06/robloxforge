import { SCALE } from "./scale.js";

export type RoomKind =
  | "admin" | "cafeteria" | "security" | "cell_block" | "yard"
  | "classroom" | "hallway" | "office" | "bathroom" | "gymnasium"
  | "reception" | "lab" | "storage" | "server_room" | "corridor";

export interface RoomPreset {
  kind: RoomKind;
  label: string;
  /** Default interior dimensions in studs */
  w: number;
  l: number;
  h: number;
  floorMaterial: string;
  wallMaterial: string;
  ceilingMaterial: string;
  propTags: string[];
  description: string;
}

const T = SCALE.tile;   // 4 studs
const C = SCALE.ceiling; // 10 studs

export const ROOM_PRESETS: Record<RoomKind, RoomPreset> = {
  admin: {
    kind: "admin", label: "Administration",
    w: 10 * T, l: 10 * T, h: C,
    floorMaterial: "Wood", wallMaterial: "SmoothPlastic", ceilingMaterial: "SmoothPlastic",
    propTags: ["desk", "chair", "filing_cabinet", "computer"],
    description: "Main administrative office",
  },
  cafeteria: {
    kind: "cafeteria", label: "Cafeteria",
    w: 15 * T, l: 10 * T, h: C,
    floorMaterial: "Concrete", wallMaterial: "Concrete", ceilingMaterial: "SmoothPlastic",
    propTags: ["table", "bench", "food_counter", "tray"],
    description: "Large eating area with tables and benches",
  },
  security: {
    kind: "security", label: "Security Room",
    w: 5 * T, l: 5 * T, h: C,
    floorMaterial: "Metal", wallMaterial: "Concrete", ceilingMaterial: "SmoothPlastic",
    propTags: ["monitor", "control_panel", "door_control"],
    description: "Central security monitoring station",
  },
  cell_block: {
    kind: "cell_block", label: "Cell Block",
    w: 20 * T, l: 6 * T, h: C,
    floorMaterial: "Concrete", wallMaterial: "Concrete", ceilingMaterial: "Concrete",
    propTags: ["bunk_bed", "toilet", "barred_window", "cell_door"],
    description: "Row of prison cells",
  },
  yard: {
    kind: "yard", label: "Yard",
    w: 25 * T, l: 15 * T, h: C * 2,
    floorMaterial: "Grass", wallMaterial: "Concrete", ceilingMaterial: "SmoothPlastic",
    propTags: ["bench", "fence", "basketball_hoop"],
    description: "Open outdoor yard area",
  },
  classroom: {
    kind: "classroom", label: "Classroom",
    w: 10 * T, l: 8 * T, h: C,
    floorMaterial: "Wood", wallMaterial: "SmoothPlastic", ceilingMaterial: "SmoothPlastic",
    propTags: ["desk", "chair", "whiteboard", "teacher_desk"],
    description: "Standard classroom with desks and whiteboard",
  },
  hallway: {
    kind: "hallway", label: "Hallway",
    w: 4 * T, l: 20 * T, h: C,
    floorMaterial: "Concrete", wallMaterial: "SmoothPlastic", ceilingMaterial: "SmoothPlastic",
    propTags: ["locker"],
    description: "Connecting hallway",
  },
  office: {
    kind: "office", label: "Office",
    w: 6 * T, l: 6 * T, h: C,
    floorMaterial: "Wood", wallMaterial: "SmoothPlastic", ceilingMaterial: "SmoothPlastic",
    propTags: ["desk", "chair", "computer", "bookshelf"],
    description: "Individual office space",
  },
  bathroom: {
    kind: "bathroom", label: "Bathroom",
    w: 4 * T, l: 4 * T, h: C,
    floorMaterial: "Concrete", wallMaterial: "Concrete", ceilingMaterial: "SmoothPlastic",
    propTags: ["toilet", "sink", "mirror"],
    description: "Bathroom with stalls",
  },
  gymnasium: {
    kind: "gymnasium", label: "Gymnasium",
    w: 20 * T, l: 25 * T, h: C * 2,
    floorMaterial: "Wood", wallMaterial: "SmoothPlastic", ceilingMaterial: "SmoothPlastic",
    propTags: ["basketball_hoop", "bleacher", "mat"],
    description: "Large gymnasium for sports",
  },
  reception: {
    kind: "reception", label: "Reception",
    w: 8 * T, l: 5 * T, h: C,
    floorMaterial: "Marble", wallMaterial: "SmoothPlastic", ceilingMaterial: "SmoothPlastic",
    propTags: ["reception_desk", "waiting_chair", "plant"],
    description: "Entrance reception area",
  },
  lab: {
    kind: "lab", label: "Laboratory",
    w: 10 * T, l: 8 * T, h: C,
    floorMaterial: "Concrete", wallMaterial: "SmoothPlastic", ceilingMaterial: "SmoothPlastic",
    propTags: ["lab_bench", "computer", "equipment"],
    description: "Science or research laboratory",
  },
  storage: {
    kind: "storage", label: "Storage Room",
    w: 5 * T, l: 5 * T, h: C,
    floorMaterial: "Concrete", wallMaterial: "Concrete", ceilingMaterial: "Concrete",
    propTags: ["shelf", "crate", "box"],
    description: "Storage and utility room",
  },
  server_room: {
    kind: "server_room", label: "Server Room",
    w: 6 * T, l: 6 * T, h: C,
    floorMaterial: "Metal", wallMaterial: "Metal", ceilingMaterial: "Metal",
    propTags: ["server_rack", "cable", "cooling_unit"],
    description: "IT server room",
  },
  corridor: {
    kind: "corridor", label: "Corridor",
    w: 4 * T, l: 16 * T, h: C,
    floorMaterial: "Concrete", wallMaterial: "Concrete", ceilingMaterial: "SmoothPlastic",
    propTags: [],
    description: "Connecting corridor",
  },
};

export function getRoomPreset(kind: RoomKind): RoomPreset {
  return ROOM_PRESETS[kind] ?? ROOM_PRESETS["corridor"];
}

import type { PaletteRole } from "./palette_session.js";

export type StyleName =
  | "industrial" | "hospital" | "school" | "prison"
  | "sci-fi" | "military" | "office" | "residential";

export interface StylePreset {
  name: StyleName;
  label: string;
  materials: {
    wall: string; floor: string; trim: string; accent: string;
    ceiling: string;
  };
  paletteRoles: Partial<Record<PaletteRole, string>>;
  lighting: { ambient: string; brightness: number; colorShift: string };
  propTags: string[];
  roomDefaults: Record<string, { material: string; lightLevel: number }>;
}

export const STYLE_PRESETS: Record<StyleName, StylePreset> = {
  prison: {
    name: "prison", label: "Prison",
    materials: { wall: "Concrete", floor: "Concrete", trim: "Metal", accent: "CorrodedMetal", ceiling: "Concrete" },
    paletteRoles: { wall: "#8A8A7A", floor: "#6B6B5F", trim: "#4A4A4A", accent: "#C8B560", primary: "#2B2B25" },
    lighting: { ambient: "#4A4A4A", brightness: 0.6, colorShift: "#8888AA" },
    propTags: ["bunk_bed", "metal_door", "barred_window", "toilet", "cell_door", "guard_post", "cctv"],
    roomDefaults: {
      cell_block: { material: "Concrete", lightLevel: 0.4 },
      yard:       { material: "Grass",    lightLevel: 1.0 },
      security:   { material: "Metal",    lightLevel: 0.8 },
    },
  },
  hospital: {
    name: "hospital", label: "Hospital",
    materials: { wall: "SmoothPlastic", floor: "Marble", trim: "SmoothPlastic", accent: "Neon", ceiling: "SmoothPlastic" },
    paletteRoles: { wall: "#F0F0F0", floor: "#E8E8E8", trim: "#4488CC", accent: "#CC4444", primary: "#FFFFFF" },
    lighting: { ambient: "#FFFFFF", brightness: 1.0, colorShift: "#FFFFFF" },
    propTags: ["hospital_bed", "iv_stand", "medical_cart", "monitor", "sink"],
    roomDefaults: {
      reception: { material: "Marble",        lightLevel: 1.0 },
      lab:       { material: "SmoothPlastic",  lightLevel: 0.9 },
    },
  },
  school: {
    name: "school", label: "School",
    materials: { wall: "SmoothPlastic", floor: "Wood", trim: "SmoothPlastic", accent: "SmoothPlastic", ceiling: "SmoothPlastic" },
    paletteRoles: { wall: "#E8D8C0", floor: "#B87840", trim: "#4488CC", accent: "#CC8844", primary: "#F5ECD5" },
    lighting: { ambient: "#FFFFFF", brightness: 0.9, colorShift: "#FFFFEE" },
    propTags: ["desk", "chair", "whiteboard", "locker", "bookshelf"],
    roomDefaults: {
      classroom: { material: "Wood",         lightLevel: 0.9 },
      hallway:   { material: "Concrete",     lightLevel: 0.8 },
      gymnasium: { material: "Wood",         lightLevel: 1.0 },
    },
  },
  industrial: {
    name: "industrial", label: "Industrial",
    materials: { wall: "Metal", floor: "Concrete", trim: "CorrodedMetal", accent: "Neon", ceiling: "Metal" },
    paletteRoles: { wall: "#5A5A5A", floor: "#4A4A4A", trim: "#888888", accent: "#FF6600", primary: "#333333" },
    lighting: { ambient: "#333333", brightness: 0.5, colorShift: "#FFAA44" },
    propTags: ["pipe", "machine", "crate", "forklift", "barrel", "catwalk"],
    roomDefaults: {
      storage:     { material: "Metal",    lightLevel: 0.5 },
      server_room: { material: "Metal",    lightLevel: 0.7 },
    },
  },
  "sci-fi": {
    name: "sci-fi", label: "Sci-Fi",
    materials: { wall: "Metal", floor: "Metal", trim: "Neon", accent: "Neon", ceiling: "Metal" },
    paletteRoles: { wall: "#1A2A3A", floor: "#0A1A2A", trim: "#00CCFF", accent: "#FF00CC", primary: "#0A0A1A" },
    lighting: { ambient: "#001133", brightness: 0.4, colorShift: "#0044FF" },
    propTags: ["hologram", "energy_barrier", "computer_panel", "tube", "drone_pad"],
    roomDefaults: {
      lab:        { material: "Metal",       lightLevel: 0.6 },
      corridor:   { material: "Metal",       lightLevel: 0.5 },
    },
  },
  military: {
    name: "military", label: "Military",
    materials: { wall: "Concrete", floor: "Concrete", trim: "Metal", accent: "Metal", ceiling: "Concrete" },
    paletteRoles: { wall: "#5C6B3C", floor: "#4A5530", trim: "#8A8A6A", accent: "#CC9900", primary: "#3A4428" },
    lighting: { ambient: "#445533", brightness: 0.6, colorShift: "#88AA44" },
    propTags: ["sandbag", "weapon_rack", "military_crate", "radio", "map_table", "bunk_bed"],
    roomDefaults: {
      storage:   { material: "Concrete",  lightLevel: 0.5 },
      office:    { material: "Concrete",  lightLevel: 0.7 },
    },
  },
  office: {
    name: "office", label: "Modern Office",
    materials: { wall: "SmoothPlastic", floor: "Wood", trim: "SmoothPlastic", accent: "Glass", ceiling: "SmoothPlastic" },
    paletteRoles: { wall: "#F5F5F5", floor: "#9A7050", trim: "#CCCCCC", accent: "#4488CC", primary: "#FAFAFA" },
    lighting: { ambient: "#FFFFFF", brightness: 1.0, colorShift: "#FFFFFF" },
    propTags: ["desk", "chair", "computer", "whiteboard", "plant", "coffee_machine"],
    roomDefaults: {
      office:    { material: "Wood",         lightLevel: 1.0 },
      reception: { material: "Marble",       lightLevel: 1.0 },
    },
  },
  residential: {
    name: "residential", label: "Residential",
    materials: { wall: "SmoothPlastic", floor: "Wood", trim: "SmoothPlastic", accent: "SmoothPlastic", ceiling: "SmoothPlastic" },
    paletteRoles: { wall: "#F0E8D8", floor: "#C0904A", trim: "#E0D0B8", accent: "#8A6040", primary: "#FAF0E0" },
    lighting: { ambient: "#FFEECC", brightness: 0.8, colorShift: "#FFEEAA" },
    propTags: ["sofa", "tv", "bed", "kitchen_counter", "plant", "bookshelf"],
    roomDefaults: {},
  },
};

// ─── Session style state ──────────────────────────────────────────────────────

const sessionStyles = new Map<string, StylePreset>();

export function setSessionStyle(name: StyleName, sessionId = "default"): StylePreset {
  const preset = STYLE_PRESETS[name];
  if (!preset) throw new Error(`Unknown style '${name}'. Available: ${Object.keys(STYLE_PRESETS).join(", ")}`);
  sessionStyles.set(sessionId, preset);
  return preset;
}

export function getSessionStyle(sessionId = "default"): StylePreset | undefined {
  return sessionStyles.get(sessionId);
}

export function clearSessionStyle(sessionId = "default"): void {
  sessionStyles.delete(sessionId);
}

export function listStyles(): StylePreset[] {
  return Object.values(STYLE_PRESETS);
}

/** Apply style to a set of args that have floorMaterial / wallMaterial / ceilingMaterial fields. */
export function applyStyleToRoomArgs(
  args: Record<string, unknown>,
  style: StylePreset,
  roomKind?: string
): Record<string, unknown> {
  const defaults = roomKind ? (style.roomDefaults[roomKind] ?? {}) : {} as { material?: string };
  const defMat = (defaults as { material?: string }).material;
  return {
    ...args,
    floorMaterial:   (args["floorMaterial"]   as string | undefined) ?? defMat ?? style.materials.floor,
    wallMaterial:    (args["wallMaterial"]    as string | undefined) ?? defMat ?? style.materials.wall,
    ceilingMaterial: (args["ceilingMaterial"] as string | undefined) ?? style.materials.ceiling,
  };
}

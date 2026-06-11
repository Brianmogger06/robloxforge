// Prop assembly library: maps prop tags (bunk_bed, desk, locker, …) to multi-part
// furniture assemblies so populate_room produces recognizable objects instead of
// single gray boxes. Origin convention: bottom-center of the footprint.
// All offsets are axis-aligned (no rotation) — placement stays AABB-safe.

import { type Vec3 } from "./placement.js";
import { type PlacementPlan } from "./composition.js";

export interface PropPart {
  name: string;
  /** Center offset from assembly origin (bottom-center of footprint). */
  offset: Vec3;
  size: Vec3;
  color?: string;
  material?: string;
  transparency?: number;
}

export interface PropAssembly {
  /** Bounding box used for grid placement & collision. */
  footprint: Vec3;
  kind: "focal" | "prop" | "fixture";
  /** Repeatable props get multiple copies in large rooms (tables, chairs, lockers…). */
  repeatable?: boolean;
  parts: PropPart[];
}

// Palette
const WOOD = "#8a6a48", WOOD_D = "#6e5439", METAL = "#9aa0a8", METAL_D = "#5a5e66";
const DARK = "#3e4248", WHITE = "#e8eae9", STEEL = "#b8bcc4", FABRIC = "#4a607a";
const GREEN = "#4a7a4e", ORANGE = "#d4742a", SCREEN = "#22303a", GLASS = "#b0d0e0";
const NEON_G = "#78f082", RED_F = "#8a3a3a", PAPER = "#d8d4c8";

function p(name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number,
           color?: string, material?: string, transparency?: number): PropPart {
  return { name, offset: { x, y, z }, size: { x: sx, y: sy, z: sz }, color, material, transparency };
}

export const PROP_ASSEMBLIES: Record<string, PropAssembly> = {
  chair: {
    footprint: { x: 2, y: 3.4, z: 2 }, kind: "prop", repeatable: true,
    parts: [
      p("Seat",  0, 1.5, 0,      1.6, 0.3, 1.6, WOOD, "Wood"),
      p("Back",  0, 2.5, -0.7,   1.6, 1.8, 0.25, WOOD, "Wood"),
      p("LegFL", -0.65, 0.675, 0.65, 0.25, 1.35, 0.25, WOOD_D, "Wood"),
      p("LegFR",  0.65, 0.675, 0.65, 0.25, 1.35, 0.25, WOOD_D, "Wood"),
      p("LegBL", -0.65, 0.675, -0.65, 0.25, 1.35, 0.25, WOOD_D, "Wood"),
      p("LegBR",  0.65, 0.675, -0.65, 0.25, 1.35, 0.25, WOOD_D, "Wood"),
    ],
  },
  waiting_chair: {
    footprint: { x: 2, y: 3.2, z: 2 }, kind: "prop", repeatable: true,
    parts: [
      p("Seat",  0, 1.5, 0,    1.8, 0.25, 1.8, FABRIC, "Fabric"),
      p("Back",  0, 2.4, -0.8, 1.8, 1.6, 0.2, FABRIC, "Fabric"),
      p("FrameL", -0.8, 0.75, 0, 0.15, 1.5, 1.6, METAL, "Metal"),
      p("FrameR",  0.8, 0.75, 0, 0.15, 1.5, 1.6, METAL, "Metal"),
    ],
  },
  desk: {
    footprint: { x: 6, y: 2.7, z: 3 }, kind: "prop", repeatable: true,
    parts: [
      p("Top",     0, 2.55, 0,   6, 0.3, 3, WOOD, "Wood"),
      p("PanelL", -2.7, 1.2, 0,  0.3, 2.4, 2.8, WOOD_D, "Wood"),
      p("PanelR",  2.7, 1.2, 0,  0.3, 2.4, 2.8, WOOD_D, "Wood"),
      p("Modesty", 0, 1.6, -1.2, 5.4, 1.6, 0.2, WOOD_D, "Wood"),
    ],
  },
  teacher_desk: {
    footprint: { x: 7, y: 2.8, z: 3.5 }, kind: "focal",
    parts: [
      p("Top",     0, 2.65, 0,    7, 0.3, 3.5, WOOD_D, "Wood"),
      p("PanelL", -3.2, 1.25, 0,  0.35, 2.5, 3.3, WOOD_D, "Wood"),
      p("PanelR",  3.2, 1.25, 0,  0.35, 2.5, 3.3, WOOD_D, "Wood"),
      p("Drawers", 2.0, 1.25, 0,  2.0, 2.5, 3.0, WOOD, "Wood"),
      p("Modesty", -0.6, 1.7, -1.5, 4.6, 1.9, 0.2, WOOD_D, "Wood"),
    ],
  },
  table: {
    footprint: { x: 6, y: 2.7, z: 4 }, kind: "prop", repeatable: true,
    parts: [
      p("Top",   0, 2.55, 0,    6, 0.3, 4, WOOD, "Wood"),
      p("LegFL", -2.6, 1.2, 1.6, 0.3, 2.4, 0.3, WOOD_D, "Wood"),
      p("LegFR",  2.6, 1.2, 1.6, 0.3, 2.4, 0.3, WOOD_D, "Wood"),
      p("LegBL", -2.6, 1.2, -1.6, 0.3, 2.4, 0.3, WOOD_D, "Wood"),
      p("LegBR",  2.6, 1.2, -1.6, 0.3, 2.4, 0.3, WOOD_D, "Wood"),
    ],
  },
  map_table: {
    footprint: { x: 7, y: 2.9, z: 5 }, kind: "focal",
    parts: [
      p("Top",   0, 2.55, 0,  7, 0.3, 5, METAL_D, "Metal"),
      p("Map",   0, 2.75, 0,  6.2, 0.1, 4.2, GREEN, "SmoothPlastic"),
      p("LegFL", -3.1, 1.2, 2.1, 0.4, 2.4, 0.4, DARK, "Metal"),
      p("LegFR",  3.1, 1.2, 2.1, 0.4, 2.4, 0.4, DARK, "Metal"),
      p("LegBL", -3.1, 1.2, -2.1, 0.4, 2.4, 0.4, DARK, "Metal"),
      p("LegBR",  3.1, 1.2, -2.1, 0.4, 2.4, 0.4, DARK, "Metal"),
    ],
  },
  bench: {
    footprint: { x: 6, y: 1.5, z: 1.8 }, kind: "prop", repeatable: true,
    parts: [
      p("Seat",  0, 1.35, 0,  6, 0.3, 1.5, WOOD, "WoodPlanks"),
      p("LegL", -2.5, 0.6, 0, 0.4, 1.2, 1.3, METAL_D, "Metal"),
      p("LegR",  2.5, 0.6, 0, 0.4, 1.2, 1.3, METAL_D, "Metal"),
    ],
  },
  bunk_bed: {
    footprint: { x: 7, y: 6.6, z: 3.4 }, kind: "focal",
    parts: [
      p("PostFL", -3.3, 3.25, 1.55,  0.4, 6.5, 0.4, METAL_D, "Metal"),
      p("PostFR",  3.3, 3.25, 1.55,  0.4, 6.5, 0.4, METAL_D, "Metal"),
      p("PostBL", -3.3, 3.25, -1.55, 0.4, 6.5, 0.4, METAL_D, "Metal"),
      p("PostBR",  3.3, 3.25, -1.55, 0.4, 6.5, 0.4, METAL_D, "Metal"),
      p("FrameLow",  0, 1.4, 0,  6.8, 0.35, 3.2, METAL_D, "Metal"),
      p("FrameHigh", 0, 4.1, 0,  6.8, 0.35, 3.2, METAL_D, "Metal"),
      p("MattressLow",  0, 1.85, 0,  6.4, 0.55, 2.9, WHITE, "Fabric"),
      p("MattressHigh", 0, 4.55, 0,  6.4, 0.55, 2.9, WHITE, "Fabric"),
      p("PillowLow",  -2.6, 2.25, 0,  1.1, 0.35, 2.2, PAPER, "Fabric"),
      p("PillowHigh", -2.6, 4.95, 0,  1.1, 0.35, 2.2, PAPER, "Fabric"),
      p("Ladder", 3.5, 2.6, 0.9, 0.15, 5.2, 1.0, METAL, "Metal"),
    ],
  },
  bed: {
    footprint: { x: 7, y: 3.2, z: 4 }, kind: "focal",
    parts: [
      p("Frame",    0, 0.8, 0,    7, 0.7, 4, WOOD_D, "Wood"),
      p("Mattress", 0.3, 1.5, 0,  6.2, 0.7, 3.6, WHITE, "Fabric"),
      p("Pillow",  -2.5, 2.05, 0, 1.3, 0.4, 2.8, PAPER, "Fabric"),
      p("Blanket",  1.2, 1.95, 0, 4.2, 0.25, 3.6, FABRIC, "Fabric"),
      p("Headboard", -3.4, 1.6, 0, 0.3, 3.2, 4, WOOD_D, "Wood"),
    ],
  },
  hospital_bed: {
    footprint: { x: 7, y: 3.4, z: 3.6 }, kind: "focal", repeatable: true,
    parts: [
      p("Frame",    0, 1.0, 0,   6.8, 0.4, 3.4, STEEL, "Metal"),
      p("Mattress", 0, 1.6, 0,   6.4, 0.6, 3.0, WHITE, "Fabric"),
      p("Pillow",  -2.4, 2.1, 0, 1.2, 0.35, 2.4, WHITE, "Fabric"),
      p("RailL",    0, 2.3, 1.6, 4.5, 0.7, 0.15, STEEL, "Metal"),
      p("RailR",    0, 2.3, -1.6, 4.5, 0.7, 0.15, STEEL, "Metal"),
      p("LegA", -2.9, 0.4, 0, 0.3, 0.8, 3.0, METAL_D, "Metal"),
      p("LegB",  2.9, 0.4, 0, 0.3, 0.8, 3.0, METAL_D, "Metal"),
    ],
  },
  toilet: {
    footprint: { x: 2, y: 3.2, z: 2.6 }, kind: "fixture",
    parts: [
      p("Base", 0, 0.6, 0.2,   1.3, 1.2, 1.5, WHITE, "SmoothPlastic"),
      p("Bowl", 0, 1.35, 0.2,  1.6, 0.35, 1.8, WHITE, "SmoothPlastic"),
      p("Tank", 0, 1.9, -0.95, 1.7, 1.5, 0.6, WHITE, "SmoothPlastic"),
      p("Lid",  0, 2.7, -0.95, 1.7, 0.15, 0.6, WHITE, "SmoothPlastic"),
    ],
  },
  sink: {
    footprint: { x: 2, y: 3.2, z: 2 }, kind: "fixture",
    parts: [
      p("Pedestal", 0, 1.1, 0,    0.8, 2.2, 0.8, WHITE, "SmoothPlastic"),
      p("Basin",    0, 2.4, 0,    1.9, 0.5, 1.7, WHITE, "SmoothPlastic"),
      p("Faucet",   0, 2.9, -0.6, 0.2, 0.5, 0.6, STEEL, "Metal"),
    ],
  },
  mirror: {
    footprint: { x: 2.6, y: 5, z: 0.8 }, kind: "fixture",
    parts: [
      p("Base",  0, 0.2, 0,   1.6, 0.4, 0.8, METAL_D, "Metal"),
      p("Pole",  0, 2.0, 0,   0.2, 3.6, 0.2, METAL_D, "Metal"),
      p("Frame", 0, 3.6, 0,   2.5, 2.8, 0.18, METAL_D, "Metal"),
      p("Glass", 0, 3.6, 0.1, 2.2, 2.5, 0.06, GLASS, "Glass", 0.15),
    ],
  },
  locker: {
    footprint: { x: 2.2, y: 6.6, z: 2.2 }, kind: "prop", repeatable: true,
    parts: [
      p("Body",   0, 3.25, 0,     2.0, 6.5, 2.0, METAL_D, "Metal"),
      p("Door",   0, 3.25, 1.02,  1.7, 6.1, 0.12, METAL, "Metal"),
      p("Handle", 0.6, 3.4, 1.12, 0.15, 0.6, 0.1, DARK, "Metal"),
      p("VentTop", 0, 5.4, 1.1,   1.2, 0.18, 0.06, DARK, "Metal"),
      p("VentMid", 0, 5.0, 1.1,   1.2, 0.18, 0.06, DARK, "Metal"),
    ],
  },
  shelf: {
    footprint: { x: 4.2, y: 6.2, z: 2 }, kind: "prop", repeatable: true,
    parts: [
      p("SideL", -1.95, 3.0, 0, 0.3, 6.0, 1.8, METAL_D, "Metal"),
      p("SideR",  1.95, 3.0, 0, 0.3, 6.0, 1.8, METAL_D, "Metal"),
      p("Shelf1", 0, 1.0, 0,  3.6, 0.2, 1.8, METAL, "Metal"),
      p("Shelf2", 0, 2.6, 0,  3.6, 0.2, 1.8, METAL, "Metal"),
      p("Shelf3", 0, 4.2, 0,  3.6, 0.2, 1.8, METAL, "Metal"),
      p("Shelf4", 0, 5.8, 0,  3.6, 0.2, 1.8, METAL, "Metal"),
    ],
  },
  bookshelf: {
    footprint: { x: 4.2, y: 6.4, z: 1.8 }, kind: "prop", repeatable: true,
    parts: [
      p("SideL", -1.95, 3.1, 0, 0.3, 6.2, 1.6, WOOD_D, "Wood"),
      p("SideR",  1.95, 3.1, 0, 0.3, 6.2, 1.6, WOOD_D, "Wood"),
      p("Back",   0, 3.1, -0.72, 3.6, 6.2, 0.15, WOOD_D, "Wood"),
      p("Shelf1", 0, 1.2, 0,  3.6, 0.2, 1.6, WOOD, "Wood"),
      p("Shelf2", 0, 3.0, 0,  3.6, 0.2, 1.6, WOOD, "Wood"),
      p("Shelf3", 0, 4.8, 0,  3.6, 0.2, 1.6, WOOD, "Wood"),
      p("Books1", 0, 2.1, 0,  3.2, 1.6, 1.2, "#7a4a3a", "SmoothPlastic"),
      p("Books2", -0.6, 3.9, 0, 2.0, 1.5, 1.2, "#3a5a7a", "SmoothPlastic"),
      p("Books3", 0.3, 5.6, 0, 2.6, 1.4, 1.2, "#5a6a3a", "SmoothPlastic"),
    ],
  },
  filing_cabinet: {
    footprint: { x: 2, y: 4.8, z: 2.2 }, kind: "prop", repeatable: true,
    parts: [
      p("Body",    0, 2.3, 0,    1.8, 4.6, 2.0, METAL, "Metal"),
      p("Drawer1", 0, 3.8, 1.02, 1.5, 1.2, 0.1, METAL_D, "Metal"),
      p("Drawer2", 0, 2.3, 1.02, 1.5, 1.2, 0.1, METAL_D, "Metal"),
      p("Drawer3", 0, 0.8, 1.02, 1.5, 1.2, 0.1, METAL_D, "Metal"),
      p("Handle1", 0, 3.8, 1.1,  0.7, 0.12, 0.08, DARK, "Metal"),
      p("Handle2", 0, 2.3, 1.1,  0.7, 0.12, 0.08, DARK, "Metal"),
      p("Handle3", 0, 0.8, 1.1,  0.7, 0.12, 0.08, DARK, "Metal"),
    ],
  },
  computer: {
    footprint: { x: 2.4, y: 4.2, z: 2 }, kind: "prop", repeatable: true,
    parts: [
      p("Tower",   -0.7, 1.1, 0,   0.8, 2.2, 1.8, DARK, "SmoothPlastic"),
      p("Stand",    0.5, 2.3, 0,   0.3, 0.5, 0.3, METAL_D, "Metal"),
      p("StandBase", 0.5, 2.1, 0,  1.0, 0.12, 0.8, METAL_D, "Metal"),
      p("Screen",   0.5, 3.3, 0,   1.9, 1.5, 0.15, SCREEN, "Glass"),
      p("Keyboard", 0.5, 2.12, 0.8, 1.5, 0.1, 0.5, METAL_D, "SmoothPlastic"),
    ],
  },
  monitor: {
    footprint: { x: 3.6, y: 5.6, z: 1 }, kind: "prop", repeatable: true,
    parts: [
      p("Base",    0, 0.25, 0,  2.4, 0.5, 1.0, METAL_D, "Metal"),
      p("Pole",    0, 1.8, 0,   0.3, 2.6, 0.3, METAL_D, "Metal"),
      p("ScreenA", -0.85, 4.0, 0, 1.6, 1.2, 0.15, SCREEN, "Glass"),
      p("ScreenB",  0.85, 4.0, 0, 1.6, 1.2, 0.15, SCREEN, "Glass"),
      p("ScreenC", -0.85, 5.0, 0, 1.6, 0.9, 0.15, "#2a4a3a", "Glass"),
      p("ScreenD",  0.85, 5.0, 0, 1.6, 0.9, 0.15, "#3a3a4a", "Glass"),
    ],
  },
  tv: {
    footprint: { x: 5.2, y: 4.6, z: 1.4 }, kind: "prop",
    parts: [
      p("Cabinet", 0, 0.75, 0,   5.0, 1.5, 1.3, WOOD_D, "Wood"),
      p("Panel",   0, 3.0, 0,    4.6, 2.6, 0.2, DARK, "SmoothPlastic"),
      p("Screen",  0, 3.0, 0.12, 4.2, 2.2, 0.05, SCREEN, "Glass"),
    ],
  },
  whiteboard: {
    footprint: { x: 5.4, y: 5.6, z: 1.6 }, kind: "fixture",
    parts: [
      p("LegL",  -2.4, 2.2, 0, 0.25, 4.4, 1.4, METAL_D, "Metal"),
      p("LegR",   2.4, 2.2, 0, 0.25, 4.4, 1.4, METAL_D, "Metal"),
      p("Board",  0, 3.6, 0,   5.0, 3.2, 0.18, WHITE, "SmoothPlastic"),
      p("Tray",   0, 1.95, 0.2, 4.6, 0.15, 0.4, METAL, "Metal"),
    ],
  },
  sofa: {
    footprint: { x: 6.5, y: 3, z: 2.8 }, kind: "prop",
    parts: [
      p("Base",  0, 0.9, 0.2,  6.2, 1.1, 2.2, FABRIC, "Fabric"),
      p("Back",  0, 1.9, -1.0, 6.2, 1.9, 0.6, FABRIC, "Fabric"),
      p("ArmL", -2.9, 1.5, 0.2, 0.5, 1.6, 2.2, FABRIC, "Fabric"),
      p("ArmR",  2.9, 1.5, 0.2, 0.5, 1.6, 2.2, FABRIC, "Fabric"),
      p("CushionL", -1.5, 1.6, 0.3, 2.7, 0.4, 2.0, "#5a708a", "Fabric"),
      p("CushionR",  1.5, 1.6, 0.3, 2.7, 0.4, 2.0, "#5a708a", "Fabric"),
    ],
  },
  plant: {
    footprint: { x: 2.4, y: 5, z: 2.4 }, kind: "prop", repeatable: true,
    parts: [
      p("Pot",     0, 0.6, 0, 1.4, 1.2, 1.4, "#9a5a3a", "SmoothPlastic"),
      p("Trunk",   0, 1.9, 0, 0.3, 1.4, 0.3, WOOD_D, "Wood"),
      p("Foliage", 0, 3.6, 0, 2.2, 2.4, 2.2, GREEN, "Grass"),
      p("FoliageTop", 0, 4.6, 0, 1.4, 0.8, 1.4, "#5a8a5e", "Grass"),
    ],
  },
  crate: {
    footprint: { x: 3, y: 3, z: 3 }, kind: "prop", repeatable: true,
    parts: [
      p("Box",    0, 1.5, 0,    3, 3, 3, WOOD, "WoodPlanks"),
      p("BandH",  0, 1.5, 1.52, 3.05, 0.4, 0.06, WOOD_D, "Wood"),
      p("BandV",  0, 1.5, -1.52, 3.05, 0.4, 0.06, WOOD_D, "Wood"),
    ],
  },
  military_crate: {
    footprint: { x: 3.6, y: 2.4, z: 2.4 }, kind: "prop", repeatable: true,
    parts: [
      p("Box", 0, 1.2, 0, 3.6, 2.4, 2.4, "#4a5a3a", "Metal"),
      p("Lid", 0, 2.35, 0, 3.7, 0.18, 2.5, "#3a4a2e", "Metal"),
      p("LatchL", -1.2, 1.4, 1.22, 0.4, 0.6, 0.08, DARK, "Metal"),
      p("LatchR",  1.2, 1.4, 1.22, 0.4, 0.6, 0.08, DARK, "Metal"),
    ],
  },
  barrel: {
    footprint: { x: 2.2, y: 3.2, z: 2.2 }, kind: "prop", repeatable: true,
    parts: [
      p("Body",   0, 1.6, 0,  2.0, 3.2, 2.0, "#5a6a7a", "Metal"),
      p("RimTop", 0, 3.05, 0, 2.15, 0.2, 2.15, METAL_D, "Metal"),
      p("RimBot", 0, 0.15, 0, 2.15, 0.2, 2.15, METAL_D, "Metal"),
      p("RimMid", 0, 1.6, 0,  2.15, 0.2, 2.15, METAL_D, "Metal"),
    ],
  },
  box: {
    footprint: { x: 2, y: 2, z: 2 }, kind: "prop", repeatable: true,
    parts: [
      p("Box", 0, 1, 0, 2, 2, 2, "#a8946a", "SmoothPlastic"),
      p("Tape", 0, 2.02, 0, 2.05, 0.05, 0.5, PAPER, "SmoothPlastic"),
    ],
  },
  food_counter: {
    footprint: { x: 9, y: 4.6, z: 3.2 }, kind: "focal",
    parts: [
      p("Base",  0, 1.5, 0,    8.6, 3.0, 2.8, METAL, "Metal"),
      p("Top",   0, 3.15, 0,   9.0, 0.3, 3.2, STEEL, "Metal"),
      p("Guard", 0, 4.1, 0.6,  8.4, 1.2, 0.1, GLASS, "Glass", 0.4),
      p("Rail",  0, 2.6, 1.7,  8.6, 0.12, 0.5, STEEL, "Metal"),
      p("TrayA", -2.5, 3.4, -0.4, 1.8, 0.3, 1.4, "#7a8a6a", "SmoothPlastic"),
      p("TrayB",  0.2, 3.4, -0.4, 1.8, 0.3, 1.4, "#8a6a5a", "SmoothPlastic"),
      p("TrayC",  2.8, 3.4, -0.4, 1.8, 0.3, 1.4, "#6a7a8a", "SmoothPlastic"),
    ],
  },
  kitchen_counter: {
    footprint: { x: 8, y: 3.5, z: 3 }, kind: "prop",
    parts: [
      p("Base", 0, 1.5, 0,  7.6, 3.0, 2.7, WHITE, "SmoothPlastic"),
      p("Top",  0, 3.15, 0, 8.0, 0.3, 3.0, METAL_D, "Granite"),
      p("SinkBasin", 2.2, 3.2, 0, 1.8, 0.25, 1.6, STEEL, "Metal"),
      p("Stove", -2.2, 3.32, 0, 2.4, 0.08, 2.0, DARK, "Metal"),
    ],
  },
  tray: {
    footprint: { x: 1.8, y: 0.5, z: 1.4 }, kind: "prop", repeatable: true,
    parts: [p("Tray", 0, 0.15, 0, 1.8, 0.25, 1.4, "#8a6a5a", "SmoothPlastic")],
  },
  reception_desk: {
    footprint: { x: 9, y: 4, z: 3.5 }, kind: "focal",
    parts: [
      p("Front",   0, 1.9, 1.45,  8.8, 3.8, 0.5, WOOD_D, "Wood"),
      p("Top",     0, 2.6, 0,     8.6, 0.3, 2.6, WOOD, "Wood"),
      p("Counter", 0, 3.85, 1.45, 9.0, 0.3, 0.9, "#a08458", "Wood"),
      p("PanelL", -4.2, 1.3, 0,   0.4, 2.6, 2.6, WOOD_D, "Wood"),
      p("PanelR",  4.2, 1.3, 0,   0.4, 2.6, 2.6, WOOD_D, "Wood"),
    ],
  },
  control_panel: {
    footprint: { x: 4.5, y: 4.2, z: 2.6 }, kind: "focal",
    parts: [
      p("Base",   0, 1.25, 0,    4.2, 2.5, 2.2, METAL_D, "Metal"),
      p("Deck",   0, 2.65, 0.3,  4.2, 0.3, 1.6, DARK, "Metal"),
      p("Bank",   0, 3.4, -0.7,  4.2, 1.6, 0.5, DARK, "Metal"),
      p("ScreenA", -1.1, 3.4, -0.42, 1.5, 1.1, 0.06, SCREEN, "Glass"),
      p("ScreenB",  1.1, 3.4, -0.42, 1.5, 1.1, 0.06, "#2a3a4a", "Glass"),
      p("BtnR", -1.6, 2.85, 0.5, 0.3, 0.12, 0.3, RED_F, "Neon"),
      p("BtnG", -1.1, 2.85, 0.5, 0.3, 0.12, 0.3, NEON_G, "Neon"),
      p("BtnY", -0.6, 2.85, 0.5, 0.3, 0.12, 0.3, "#d4b42a", "Neon"),
    ],
  },
  door_control: {
    footprint: { x: 2, y: 4.5, z: 1 }, kind: "fixture",
    parts: [
      p("Post",  0, 2.0, 0,    0.5, 4.0, 0.5, METAL_D, "Metal"),
      p("Panel", 0, 3.8, 0.2,  1.6, 1.4, 0.3, DARK, "Metal"),
      p("BtnG",  -0.35, 3.8, 0.4, 0.4, 0.4, 0.1, NEON_G, "Neon"),
      p("BtnR",   0.35, 3.8, 0.4, 0.4, 0.4, 0.1, RED_F, "Neon"),
    ],
  },
  server_rack: {
    footprint: { x: 3.2, y: 7.2, z: 2.8 }, kind: "prop", repeatable: true,
    parts: [
      p("Cabinet", 0, 3.5, 0,    3.0, 7.0, 2.6, DARK, "Metal"),
      p("Face",    0, 3.5, 1.32, 2.6, 6.4, 0.08, "#2e3238", "Metal"),
      p("Led1", -0.8, 5.8, 1.4,  0.5, 0.1, 0.05, NEON_G, "Neon"),
      p("Led2",  0.6, 5.0, 1.4,  0.5, 0.1, 0.05, NEON_G, "Neon"),
      p("Led3", -0.5, 4.2, 1.4,  0.5, 0.1, 0.05, "#d4b42a", "Neon"),
      p("Led4",  0.8, 3.0, 1.4,  0.5, 0.1, 0.05, NEON_G, "Neon"),
      p("Led5", -0.7, 2.0, 1.4,  0.5, 0.1, 0.05, RED_F, "Neon"),
    ],
  },
  lab_bench: {
    footprint: { x: 7.5, y: 3.3, z: 3.2 }, kind: "prop", repeatable: true,
    parts: [
      p("Cabinet", 0, 1.35, 0,  7.0, 2.7, 2.9, WHITE, "SmoothPlastic"),
      p("Top",     0, 2.85, 0,  7.5, 0.3, 3.2, "#3a3e44", "Granite"),
      p("Shelf",   0, 3.2, -1.2, 6.5, 0.15, 0.7, STEEL, "Metal"),
      p("FlaskA", -2.0, 3.3, 0.3, 0.5, 0.7, 0.5, "#6ab4d4", "Glass", 0.3),
      p("FlaskB",  1.4, 3.25, -0.2, 0.4, 0.6, 0.4, "#9a6ad4", "Glass", 0.3),
    ],
  },
  basketball_hoop: {
    footprint: { x: 4, y: 10, z: 2.5 }, kind: "fixture",
    parts: [
      p("Base",      0, 0.4, -0.8, 2.5, 0.8, 1.5, DARK, "Metal"),
      p("Pole",      0, 4.5, -0.8, 0.4, 8.2, 0.4, METAL_D, "Metal"),
      p("Backboard", 0, 8.4, 0,    3.8, 2.6, 0.2, WHITE, "SmoothPlastic"),
      p("Rim",       0, 7.4, 0.85, 1.5, 0.15, 1.5, ORANGE, "Metal"),
    ],
  },
  bleacher: {
    footprint: { x: 9, y: 4, z: 5.5 }, kind: "prop", repeatable: true,
    parts: [
      p("Row1", 0, 0.7, 1.8,   9, 0.35, 1.7, METAL, "Metal"),
      p("Row2", 0, 1.8, 0,     9, 0.35, 1.7, METAL, "Metal"),
      p("Row3", 0, 2.9, -1.8,  9, 0.35, 1.7, METAL, "Metal"),
      p("Riser1", 0, 0.35, 1.0, 9, 0.7, 0.15, METAL_D, "Metal"),
      p("Riser2", 0, 1.0, -0.85, 9, 1.6, 0.15, METAL_D, "Metal"),
      p("Riser3", 0, 1.55, -2.6, 9, 2.7, 0.15, METAL_D, "Metal"),
    ],
  },
  mat: {
    footprint: { x: 5, y: 0.5, z: 7 }, kind: "prop", repeatable: true,
    parts: [p("Mat", 0, 0.2, 0, 5, 0.4, 7, "#3a6ea8", "SmoothPlastic")],
  },
  fence: {
    footprint: { x: 7, y: 5.5, z: 0.8 }, kind: "fixture", repeatable: true,
    parts: [
      p("PostL", -3.3, 2.6, 0, 0.4, 5.2, 0.4, METAL_D, "Metal"),
      p("PostR",  3.3, 2.6, 0, 0.4, 5.2, 0.4, METAL_D, "Metal"),
      p("Mesh",   0, 2.8, 0,   6.6, 4.4, 0.1, METAL, "DiamondPlate", 0.35),
      p("RailTop", 0, 5.1, 0,  7.0, 0.25, 0.25, METAL_D, "Metal"),
    ],
  },
  weapon_rack: {
    footprint: { x: 4.5, y: 6, z: 1.4 }, kind: "prop",
    parts: [
      p("Back",   0, 3.0, -0.5,  4.3, 5.8, 0.25, WOOD_D, "Wood"),
      p("Base",   0, 0.35, 0,    4.3, 0.7, 1.2, WOOD_D, "Wood"),
      p("RifleA", -1.4, 3.0, -0.2, 0.35, 4.0, 0.25, DARK, "Metal"),
      p("RifleB",  0,   3.0, -0.2, 0.35, 4.0, 0.25, DARK, "Metal"),
      p("RifleC",  1.4, 3.0, -0.2, 0.35, 4.0, 0.25, DARK, "Metal"),
      p("RailMid", 0, 4.2, -0.3,  4.3, 0.2, 0.3, WOOD, "Wood"),
    ],
  },
  cell_door: {
    footprint: { x: 4.4, y: 7.4, z: 0.6 }, kind: "fixture",
    parts: [
      p("FrameL", -2.05, 3.6, 0, 0.3, 7.2, 0.5, METAL_D, "Metal"),
      p("FrameR",  2.05, 3.6, 0, 0.3, 7.2, 0.5, METAL_D, "Metal"),
      p("FrameT",  0, 7.25, 0,   4.4, 0.3, 0.5, METAL_D, "Metal"),
      p("Bar1", -1.4, 3.55, 0, 0.22, 6.9, 0.22, METAL, "Metal"),
      p("Bar2", -0.7, 3.55, 0, 0.22, 6.9, 0.22, METAL, "Metal"),
      p("Bar3",  0,   3.55, 0, 0.22, 6.9, 0.22, METAL, "Metal"),
      p("Bar4",  0.7, 3.55, 0, 0.22, 6.9, 0.22, METAL, "Metal"),
      p("Bar5",  1.4, 3.55, 0, 0.22, 6.9, 0.22, METAL, "Metal"),
      p("CrossBar", 0, 4.4, 0,  3.8, 0.25, 0.25, METAL_D, "Metal"),
    ],
  },
  barred_window: {
    footprint: { x: 3.4, y: 3.6, z: 0.5 }, kind: "fixture",
    parts: [
      p("Frame",  0, 1.8, 0, 3.4, 3.6, 0.3, METAL_D, "Metal"),
      p("Glass",  0, 1.8, 0, 3.0, 3.2, 0.1, GLASS, "Glass", 0.5),
      p("Bar1", -1.0, 1.8, 0.18, 0.18, 3.2, 0.12, METAL_D, "Metal"),
      p("Bar2",  0,   1.8, 0.18, 0.18, 3.2, 0.12, METAL_D, "Metal"),
      p("Bar3",  1.0, 1.8, 0.18, 0.18, 3.2, 0.12, METAL_D, "Metal"),
    ],
  },
  guard_post: {
    footprint: { x: 6, y: 9, z: 6 }, kind: "focal",
    parts: [
      p("PostFL", -2.8, 4.0, 2.8,  0.5, 8.0, 0.5, METAL_D, "Metal"),
      p("PostFR",  2.8, 4.0, 2.8,  0.5, 8.0, 0.5, METAL_D, "Metal"),
      p("PostBL", -2.8, 4.0, -2.8, 0.5, 8.0, 0.5, METAL_D, "Metal"),
      p("PostBR",  2.8, 4.0, -2.8, 0.5, 8.0, 0.5, METAL_D, "Metal"),
      p("Roof",    0, 8.25, 0,     6.4, 0.5, 6.4, METAL_D, "Metal"),
      p("WallN",   0, 1.5, -2.8,   5.6, 3.0, 0.3, "#6a7282", "Metal"),
      p("WallS",   0, 1.5,  2.8,   5.6, 3.0, 0.3, "#6a7282", "Metal"),
      p("WallE",   2.8, 1.5, 0,    0.3, 3.0, 5.6, "#6a7282", "Metal"),
      p("WallW",  -2.8, 1.5, 0,    0.3, 3.0, 5.6, "#6a7282", "Metal"),
      p("GlassN",  0, 4.6, -2.8,   5.6, 3.0, 0.12, GLASS, "Glass", 0.45),
      p("GlassS",  0, 4.6,  2.8,   5.6, 3.0, 0.12, GLASS, "Glass", 0.45),
    ],
  },
  cctv: {
    footprint: { x: 1.4, y: 6.5, z: 2.6 }, kind: "fixture", repeatable: true,
    parts: [
      p("Pole",   0, 2.9, 0,    0.3, 5.8, 0.3, METAL_D, "Metal"),
      p("Head",   0, 6.0, 0.4,  0.9, 0.7, 1.3, DARK, "Metal"),
      p("Lens",   0, 6.0, 1.1,  0.5, 0.4, 0.1, SCREEN, "Glass"),
      p("Led",    0, 6.3, 1.05, 0.12, 0.12, 0.06, RED_F, "Neon"),
    ],
  },
  coffee_machine: {
    footprint: { x: 2.2, y: 3.4, z: 1.8 }, kind: "prop",
    parts: [
      p("Body",   0, 1.7, -0.3, 2.0, 3.4, 1.2, DARK, "SmoothPlastic"),
      p("Spout",  0, 2.2, 0.4,  0.4, 0.3, 0.5, METAL_D, "Metal"),
      p("Tray",   0, 0.9, 0.45, 1.4, 0.12, 0.9, METAL, "Metal"),
      p("Panel",  0, 2.9, 0.32, 1.2, 0.8, 0.06, SCREEN, "Glass"),
    ],
  },
  sandbag: {
    footprint: { x: 5, y: 2.6, z: 2 }, kind: "prop", repeatable: true,
    parts: [
      p("Row1", 0, 0.5, 0,    5.0, 1.0, 2.0, "#8a7a5a", "Fabric"),
      p("Row2", 0, 1.5, 0,    4.2, 1.0, 1.7, "#9a8a6a", "Fabric"),
      p("Row3", 0, 2.3, 0,    3.2, 0.7, 1.5, "#8a7a5a", "Fabric"),
    ],
  },
  medical_cart: {
    footprint: { x: 2.6, y: 3.2, z: 1.8 }, kind: "prop", repeatable: true,
    parts: [
      p("Body",    0, 1.7, 0,   2.4, 2.4, 1.6, WHITE, "SmoothPlastic"),
      p("Top",     0, 3.0, 0,   2.6, 0.2, 1.8, STEEL, "Metal"),
      p("Drawer1", 0, 2.3, 0.82, 2.0, 0.7, 0.06, "#d44a4a", "SmoothPlastic"),
      p("Drawer2", 0, 1.4, 0.82, 2.0, 0.7, 0.06, STEEL, "SmoothPlastic"),
      p("WheelA", -1.0, 0.25, 0.6, 0.4, 0.5, 0.4, DARK, "SmoothPlastic"),
      p("WheelB",  1.0, 0.25, 0.6, 0.4, 0.5, 0.4, DARK, "SmoothPlastic"),
      p("WheelC", -1.0, 0.25, -0.6, 0.4, 0.5, 0.4, DARK, "SmoothPlastic"),
      p("WheelD",  1.0, 0.25, -0.6, 0.4, 0.5, 0.4, DARK, "SmoothPlastic"),
    ],
  },
  equipment: {
    footprint: { x: 3.2, y: 4.4, z: 2.4 }, kind: "prop", repeatable: true,
    parts: [
      p("Body",   0, 1.9, 0,    3.0, 3.8, 2.2, WHITE, "SmoothPlastic"),
      p("Screen", 0, 3.0, 1.12, 1.8, 1.2, 0.06, SCREEN, "Glass"),
      p("Dial",  -0.9, 1.6, 1.12, 0.5, 0.5, 0.08, METAL_D, "Metal"),
      p("Led",    0.9, 1.6, 1.12, 0.3, 0.15, 0.06, NEON_G, "Neon"),
      p("Vent",   0, 4.1, 0,    2.4, 0.4, 1.8, METAL_D, "Metal"),
    ],
  },
  cable: {
    footprint: { x: 4, y: 0.8, z: 1.2 }, kind: "prop", repeatable: true,
    parts: [
      p("TrayBase", 0, 0.25, 0, 4.0, 0.15, 1.0, METAL_D, "Metal"),
      p("CableA",   0, 0.45, -0.25, 3.8, 0.2, 0.2, "#d4b42a", "SmoothPlastic"),
      p("CableB",   0, 0.45,  0.05, 3.8, 0.2, 0.2, "#3a6ea8", "SmoothPlastic"),
      p("CableC",   0, 0.45,  0.35, 3.8, 0.2, 0.2, RED_F, "SmoothPlastic"),
    ],
  },
  cooling_unit: {
    footprint: { x: 3.5, y: 6.5, z: 2.8 }, kind: "prop", repeatable: true,
    parts: [
      p("Body",   0, 3.2, 0,    3.3, 6.4, 2.6, WHITE, "Metal"),
      p("GrillT", 0, 5.4, 1.32, 2.6, 1.4, 0.08, METAL_D, "DiamondPlate"),
      p("GrillB", 0, 1.4, 1.32, 2.6, 1.4, 0.08, METAL_D, "DiamondPlate"),
      p("Panel",  0, 3.4, 1.32, 1.6, 0.8, 0.06, SCREEN, "Glass"),
      p("Pipe",   1.4, 6.0, -0.8, 0.4, 1.2, 0.4, STEEL, "Metal"),
    ],
  },
  iv_stand: {
    footprint: { x: 1.6, y: 6.6, z: 1.6 }, kind: "prop", repeatable: true,
    parts: [
      p("Base", 0, 0.15, 0,   1.6, 0.3, 1.6, METAL_D, "Metal"),
      p("Pole", 0, 3.2, 0,    0.18, 6.0, 0.18, STEEL, "Metal"),
      p("Hook", 0.4, 6.25, 0, 0.9, 0.15, 0.15, STEEL, "Metal"),
      p("Bag",  0.7, 5.6, 0,  0.6, 1.1, 0.3, "#c8dce8", "Glass", 0.3),
    ],
  },
};

/** All known prop tags. */
export function listPropTags(): string[] {
  return Object.keys(PROP_ASSEMBLIES);
}

export function getAssembly(tag: string): PropAssembly | undefined {
  return PROP_ASSEMBLIES[tag];
}

/**
 * Expand placed plans into per-part sub-plans. Plans with a known `tag` become
 * one plan per assembly part (world-positioned). Untagged / rejected / unknown-tag
 * plans pass through unchanged, so legacy single-box contents keep working.
 */
export function expandPlans(plans: PlacementPlan[]): PlacementPlan[] {
  const out: PlacementPlan[] = [];
  for (const plan of plans) {
    const asm = plan.tag ? PROP_ASSEMBLIES[plan.tag] : undefined;
    if (!asm || plan.rejected) { out.push(plan); continue; }
    const [cx, cy, cz] = plan.cframe;
    const bottomY = cy - plan.size.y / 2;
    const baseName = plan.name ?? plan.tag ?? "Prop";
    for (const part of asm.parts) {
      out.push({
        cframe: [cx + part.offset.x, bottomY + part.offset.y, cz + part.offset.z],
        size: part.size,
        color: part.color ?? plan.color,
        material: part.material ?? plan.material,
        name: `${baseName}_${part.name}`,
        ...(part.transparency !== undefined ? { transparency: part.transparency } : {}),
      });
    }
  }
  return out;
}

/**
 * Build RoomContent-shaped entries for a list of prop tags, with copy counts
 * scaled to room area for repeatable assemblies. Unknown tags are skipped
 * (better no prop than a gray mystery box).
 */
export function contentsFromTags(
  tags: string[],
  roomArea: number
): Array<{ kind: "focal" | "prop" | "fixture"; size: Vec3; tag: string; name?: string }> {
  const out: Array<{ kind: "focal" | "prop" | "fixture"; size: Vec3; tag: string; name?: string }> = [];
  for (const tag of tags) {
    const asm = PROP_ASSEMBLIES[tag];
    if (!asm) continue;
    const footArea = asm.footprint.x * asm.footprint.z;
    const copies = asm.repeatable
      ? Math.max(1, Math.min(8, Math.floor(roomArea / Math.max(footArea * 10, 40))))
      : 1;
    for (let i = 0; i < copies; i++) {
      out.push({ kind: asm.kind, size: asm.footprint, tag, name: copies > 1 ? `${tag}_${i + 1}` : tag });
    }
  }
  return out;
}

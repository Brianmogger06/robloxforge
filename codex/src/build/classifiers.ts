import sharp from "sharp";
import type { StyleName } from "./style_engine.js";
import type { RoomKind } from "./semantic_rooms.js";

interface RgbPixel { r: number; g: number; b: number }

// ─── Image analysis helpers ───────────────────────────────────────────────────

async function samplePixels(imagePath: string, samples = 1000): Promise<RgbPixel[]> {
  const { data, info } = await sharp(imagePath)
    .resize(64, 64, { fit: "cover" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: RgbPixel[] = [];
  const step = Math.max(1, Math.floor((info.width * info.height) / samples));
  const channels = info.channels;

  for (let i = 0; i < data.length; i += channels * step) {
    pixels.push({ r: data[i]!, g: data[i + 1]!, b: data[i + 2]! });
  }
  return pixels;
}

function avgColor(pixels: RgbPixel[]): RgbPixel {
  const sum = pixels.reduce((a, p) => ({ r: a.r + p.r, g: a.g + p.g, b: a.b + p.b }), { r: 0, g: 0, b: 0 });
  const n = pixels.length || 1;
  return { r: sum.r / n, g: sum.g / n, b: sum.b / n };
}

function saturation({ r, g, b }: RgbPixel): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  return max === 0 ? 0 : (max - min) / max;
}

function brightness({ r, g, b }: RgbPixel): number {
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
}

/** Grey-ness: how close to neutral grey (low chroma) */
function greyness(p: RgbPixel): number {
  return 1 - saturation(p);
}

/** How "warm" (red/orange) the image is — 0–1 */
function warmth({ r, g, b }: RgbPixel): number {
  return (r - Math.min(g, b)) / 255;
}

/** How "cool" (blue/cyan) */
function coolness({ r, g, b }: RgbPixel): number {
  return (b - Math.min(r, g)) / 255;
}

/** Greenness */
function greenness({ r, g, b }: RgbPixel): number {
  return (g - Math.max(r, b)) / 255;
}

// ─── Style classification ─────────────────────────────────────────────────────

export interface StyleClassification {
  style: StyleName;
  confidence: number;
  scores: Record<StyleName, number>;
}

export async function classifyStyle(imagePath: string): Promise<StyleClassification> {
  const pixels = await samplePixels(imagePath);
  const avg = avgColor(pixels);
  const avgSat   = pixels.reduce((a, p) => a + saturation(p), 0)  / pixels.length;
  const avgBri   = pixels.reduce((a, p) => a + brightness(p), 0)  / pixels.length;
  const avgGrey  = pixels.reduce((a, p) => a + greyness(p), 0)    / pixels.length;
  const avgWarm  = pixels.reduce((a, p) => a + warmth(p), 0)      / pixels.length;
  const avgCool  = pixels.reduce((a, p) => a + coolness(p), 0)    / pixels.length;
  const avgGreen = pixels.reduce((a, p) => a + greenness(p), 0)   / pixels.length;

  // Heuristic score per style (higher = more likely)
  const scores: Record<StyleName, number> = {
    prison:      avgGrey * 0.8 + (1 - avgBri) * 0.4 + (1 - avgSat) * 0.3,
    industrial:  avgGrey * 0.6 + (1 - avgBri) * 0.6 + avgWarm * 0.2,
    hospital:    avgBri  * 0.7 + avgGrey * 0.5 + (1 - avgWarm) * 0.3,
    school:      avgBri  * 0.5 + avgWarm * 0.4 + avgSat * 0.3,
    military:    avgGreen * 0.6 + avgGrey * 0.4 + (1 - avgBri) * 0.3,
    "sci-fi":    avgCool * 0.7 + (1 - avgBri) * 0.4 + avgSat * 0.3,
    office:      avgBri  * 0.6 + (1 - avgSat) * 0.4 + (1 - avgWarm) * 0.2,
    residential: avgWarm * 0.5 + avgBri * 0.4 + avgSat * 0.2,
  };

  const sorted = (Object.entries(scores) as [StyleName, number][])
    .sort((a, b) => b[1] - a[1]);
  const best = sorted[0]!;
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;

  return {
    style: best[0],
    confidence: Math.round((best[1] / total) * 100) / 100,
    scores: Object.fromEntries(sorted.map(([k, v]) => [k, Math.round(v * 100) / 100])) as Record<StyleName, number>,
  };
}

// ─── Room classification ──────────────────────────────────────────────────────

export interface RoomClassification {
  kind: RoomKind;
  confidence: number;
}

export async function classifyRoom(imagePath: string): Promise<RoomClassification> {
  const pixels = await samplePixels(imagePath);
  const avgBri  = pixels.reduce((a, p) => a + brightness(p), 0) / pixels.length;
  const avgSat  = pixels.reduce((a, p) => a + saturation(p), 0) / pixels.length;
  const avgGrey = pixels.reduce((a, p) => a + greyness(p), 0)   / pixels.length;

  // Very rough heuristics based on dominant color properties
  const scores: Partial<Record<RoomKind, number>> = {
    hallway:     avgGrey * 0.6 + (1 - avgBri) * 0.3,
    cafeteria:   avgBri  * 0.5 + avgSat * 0.4,
    office:      avgBri  * 0.6 + (1 - avgSat) * 0.4,
    classroom:   avgBri  * 0.5 + avgSat * 0.3,
    cell_block:  avgGrey * 0.7 + (1 - avgBri) * 0.5,
    yard:        (pixels.reduce((a, p) => a + greenness(p), 0) / pixels.length) * 0.8 + avgBri * 0.3,
    security:    avgGrey * 0.5 + (1 - avgBri) * 0.4,
    lab:         avgBri  * 0.4 + (1 - avgSat) * 0.5,
  };

  const sorted = (Object.entries(scores) as [RoomKind, number][]).sort((a, b) => b[1] - a[1]);
  const best = sorted[0] ?? (["hallway", 0] as [RoomKind, number]);

  return { kind: best[0], confidence: Math.min(1, Math.round(best[1] * 100) / 100) };
}

// ─── Prop suggestions ─────────────────────────────────────────────────────────

export async function suggestProps(imagePath: string): Promise<{ propTags: string[]; basis: string }> {
  const style = await classifyStyle(imagePath);
  const room  = await classifyRoom(imagePath);

  const { STYLE_PRESETS } = await import("./style_engine.js");
  const { ROOM_PRESETS }  = await import("./semantic_rooms.js");

  const styleTags = STYLE_PRESETS[style.style]?.propTags ?? [];
  const roomTags  = ROOM_PRESETS[room.kind]?.propTags ?? [];

  // Union, deduplicated
  const all = [...new Set([...styleTags, ...roomTags])];

  return {
    propTags: all,
    basis: `style=${style.style}(${style.confidence}), room=${room.kind}(${room.confidence})`,
  };
}

// ─── Full environment recognition ─────────────────────────────────────────────

export interface EnvironmentRecognition {
  style: StyleName;
  styleConfidence: number;
  rooms: RoomKind[];
  propTags: string[];
  palette: { dominant: string; accent: string };
}

export async function recognizeEnvironment(imagePath: string): Promise<EnvironmentRecognition> {
  const [styleResult, roomResult, propResult] = await Promise.all([
    classifyStyle(imagePath),
    classifyRoom(imagePath),
    suggestProps(imagePath),
  ]);

  // Extract dominant + accent color
  const pixels  = await samplePixels(imagePath, 200);
  const avg     = avgColor(pixels);
  const dominant = `#${[avg.r, avg.g, avg.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

  // Accent = most saturated pixel bucket
  const mostSat = pixels.reduce((best, p) => saturation(p) > saturation(best) ? p : best, pixels[0]!);
  const accent  = `#${[mostSat.r, mostSat.g, mostSat.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

  return {
    style: styleResult.style,
    styleConfidence: styleResult.confidence,
    rooms: [roomResult.kind],
    propTags: propResult.propTags,
    palette: { dominant, accent },
  };
}

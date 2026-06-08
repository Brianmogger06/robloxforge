import sharp from "sharp";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve, extname, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RgbColor { r: number; g: number; b: number }
export interface PaletteEntry { hex: string; rgb: RgbColor; population: number }

// ─── Image loading ────────────────────────────────────────────────────────────

function loadImageBuffer(imagePathOrBase64: string): Buffer {
  if (imagePathOrBase64.startsWith("data:")) {
    const b64 = imagePathOrBase64.split(",")[1] ?? "";
    return Buffer.from(b64, "base64");
  }
  // Heuristic: if no path separators and long string → raw base64
  if (!imagePathOrBase64.includes("/") && !imagePathOrBase64.includes("\\") && imagePathOrBase64.length > 200) {
    return Buffer.from(imagePathOrBase64, "base64");
  }
  return readFileSync(imagePathOrBase64);
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function colorDist(a: RgbColor, b: RgbColor): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

// ─── k-means++ clustering ─────────────────────────────────────────────────────

function kMeans(pixels: RgbColor[], k: number, iterations = 12): PaletteEntry[] {
  if (pixels.length === 0) return [];
  k = Math.min(k, pixels.length);

  // k-means++ init: pick spread-out initial centroids
  const centroids: RgbColor[] = [{ ...pixels[0] }];
  while (centroids.length < k) {
    let best: RgbColor = pixels[0];
    let bestDist = -Infinity;
    for (const p of pixels) {
      const minD = Math.min(...centroids.map((c) => colorDist(p, c)));
      if (minD > bestDist) { bestDist = minD; best = p; }
    }
    centroids.push({ ...best });
  }

  // Iterate
  for (let iter = 0; iter < iterations; iter++) {
    const sums: { r: number; g: number; b: number; n: number }[] = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (const p of pixels) {
      let minD = Infinity, minI = 0;
      for (let i = 0; i < k; i++) {
        const d = colorDist(p, centroids[i]);
        if (d < minD) { minD = d; minI = i; }
      }
      sums[minI].r += p.r; sums[minI].g += p.g; sums[minI].b += p.b; sums[minI].n++;
    }
    for (let i = 0; i < k; i++) {
      if (sums[i].n > 0) {
        centroids[i] = {
          r: Math.round(sums[i].r / sums[i].n),
          g: Math.round(sums[i].g / sums[i].n),
          b: Math.round(sums[i].b / sums[i].n),
        };
      }
    }
  }

  // Final assignment for population count
  const pops = new Array<number>(k).fill(0);
  for (const p of pixels) {
    let minD = Infinity, minI = 0;
    for (let i = 0; i < k; i++) {
      const d = colorDist(p, centroids[i]);
      if (d < minD) { minD = d; minI = i; }
    }
    pops[minI]++;
  }

  return centroids
    .map((c, i) => ({ hex: rgbToHex(c.r, c.g, c.b), rgb: c, population: pops[i] }))
    .filter((e) => e.population > 0)
    .sort((a, b) => b.population - a.population);
}

// ─── extract_palette ──────────────────────────────────────────────────────────

export async function extractPalette(
  imagePathOrBase64: string,
  count: number = 6
): Promise<PaletteEntry[]> {
  const buf = loadImageBuffer(imagePathOrBase64);

  // Resize to thumbnail for speed; raw RGBA output
  const { data, info } = await sharp(buf)
    .resize(120, 120, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Sample every 4th pixel to keep clustering fast
  const pixels: RgbColor[] = [];
  const stride = info.channels; // 4 (RGBA)
  for (let i = 0; i < data.length; i += stride * 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a > 128) pixels.push({ r, g, b }); // skip transparent
  }

  return kMeans(pixels, count);
}

// ─── reference_attach ─────────────────────────────────────────────────────────

export function referenceAttach(
  imagePathOrBase64: string,
  label: string,
  projectRoot: string
): { savedPath: string } {
  const refDir = projectRoot
    ? resolve(projectRoot, "references")
    : resolve(__dirname, "../../references");

  mkdirSync(refDir, { recursive: true });

  let ext = ".png";
  let buf: Buffer;

  if (imagePathOrBase64.startsWith("data:")) {
    const match = imagePathOrBase64.match(/^data:image\/(\w+);base64,/);
    if (match) ext = "." + match[1];
    const b64 = imagePathOrBase64.split(",")[1] ?? "";
    buf = Buffer.from(b64, "base64");
  } else if (!imagePathOrBase64.includes("/") && !imagePathOrBase64.includes("\\") && imagePathOrBase64.length > 200) {
    buf = Buffer.from(imagePathOrBase64, "base64");
  } else {
    buf = readFileSync(imagePathOrBase64);
    ext = extname(imagePathOrBase64) || ".png";
  }

  const savedPath = resolve(refDir, `${label.replace(/[^a-zA-Z0-9_-]/g, "_")}${ext}`);
  writeFileSync(savedPath, buf);
  return { savedPath };
}

// ─── image_to_grid (stretch) ─────────────────────────────────────────────────

export async function imageToGrid(
  imagePathOrBase64: string,
  gridW: number,
  gridH: number,
  threshold: number = 128
): Promise<{ grid: number[][]; width: number; height: number; note: string }> {
  const buf = loadImageBuffer(imagePathOrBase64);

  const { data, info } = await sharp(buf)
    .resize(gridW, gridH, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const grid: number[][] = [];
  for (let row = 0; row < info.height; row++) {
    const rowArr: number[] = [];
    for (let col = 0; col < info.width; col++) {
      const lum = data[row * info.width + col];
      rowArr.push(lum < threshold ? 1 : 0); // dark=filled(wall), light=empty(floor)
    }
    grid.push(rowArr);
  }

  return {
    grid,
    width: info.width,
    height: info.height,
    note: "EXPERIMENTAL: dark pixels = 1 (wall/filled), light pixels = 0 (floor/empty). Review before building.",
  };
}

// ─── paletteToRoles ───────────────────────────────────────────────────────────

const ROLE_ORDER = ["primary", "secondary", "accent", "floor", "wall", "trim"] as const;
type PaletteRole = typeof ROLE_ORDER[number];

/** Map top-N palette entries (sorted by population) to named roles. */
export function paletteToRoles(entries: PaletteEntry[]): Partial<Record<PaletteRole, string>> {
  const sorted = [...entries].sort((a, b) => b.population - a.population);
  const roles: Partial<Record<PaletteRole, string>> = {};
  for (let i = 0; i < Math.min(sorted.length, ROLE_ORDER.length); i++) {
    roles[ROLE_ORDER[i]] = sorted[i].hex;
  }
  return roles;
}

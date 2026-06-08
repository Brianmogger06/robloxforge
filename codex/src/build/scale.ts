export const SCALE = {
  tile: 4,
  ceiling: 10,
  wallThickness: 0.5,
  humanScale: 5,
  door: { width: 4, height: 7 },
} as const;

export type ScaleKey = keyof typeof SCALE;

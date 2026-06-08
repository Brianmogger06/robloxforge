export interface Vec3 { x: number; y: number; z: number; }
export interface AABB { min: Vec3; max: Vec3; }
export interface SnapOpts { tile: number; axes?: ('x' | 'y' | 'z')[]; }

export function snapScalar(n: number, tile: number): number {
  if (tile <= 0) return n;
  return Math.round(n / tile) * tile;
}

export function snapV3(v: Vec3, opts: SnapOpts): Vec3 {
  const axes = opts.axes ?? ['x', 'y', 'z'];
  return {
    x: axes.includes('x') ? snapScalar(v.x, opts.tile) : v.x,
    y: axes.includes('y') ? snapScalar(v.y, opts.tile) : v.y,
    z: axes.includes('z') ? snapScalar(v.z, opts.tile) : v.z,
  };
}

export function expandBounds(center: Vec3, size: Vec3): AABB {
  return {
    min: { x: center.x - size.x / 2, y: center.y - size.y / 2, z: center.z - size.z / 2 },
    max: { x: center.x + size.x / 2, y: center.y + size.y / 2, z: center.z + size.z / 2 },
  };
}

// Returns true only when boxes penetrate (touching edges do not collide).
export function boxesOverlap(a: AABB, b: AABB): boolean {
  return (
    a.min.x < b.max.x && a.max.x > b.min.x &&
    a.min.y < b.max.y && a.max.y > b.min.y &&
    a.min.z < b.max.z && a.max.z > b.min.z
  );
}

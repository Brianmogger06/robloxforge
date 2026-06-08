import { SCALE } from "./scale.js";
import { type Vec3, type AABB, snapV3, expandBounds, boxesOverlap } from "./placement.js";

export interface RoomContent {
  kind: 'focal' | 'prop' | 'fixture';
  size: Vec3;
  name?: string;
  preferredZone?: 'center' | 'perimeter' | 'corner';
  color?: string;
  material?: string;
}

export interface PlacementPlan {
  /** First 3 floats are position x,y,z; format is simple [x,y,z] for plugin simplicity. */
  cframe: [number, number, number];
  size: Vec3;
  color: string;
  material: string;
  name?: string;
  rejected?: { reason: string };
}

export interface RoomSpec {
  /**
   * World-space Y = top surface of the floor slab (the Y that build_room's floorCFrame.position.y
   * represents). Parts placed by planRoomContents will have their bottom face at this Y.
   * Passing the raw floorCFrame.position.y from build_room is correct.
   */
  floorPosition: Vec3;
  /** Interior XZ dimensions (same as build_room sizeXZ). */
  sizeXZ: { x: number; z: number };
}

/** Minimum usable dimension: perimeter walkway on each side plus one grid cell. */
export const MIN_ROOM_DIM = SCALE.humanScale * 2 + SCALE.tile;

/**
 * Compute structured placement positions for a list of contents inside a room.
 *
 * Algorithm:
 * 1. Focal item → placed at room center (snapped).
 * 2. A humanScale-wide walkway is reserved around the perimeter.
 * 3. Remaining items fill the grid within the usable zone, skipping occupied cells.
 *
 * Y convention: room.floorPosition.y must be the TOP SURFACE of the floor slab —
 * i.e. the Y passed as floorCFrame.position.y to build_room. Parts will sit on top
 * of this surface (partBottom = floorPosition.y, partCenter = floorPosition.y + size.y/2).
 *
 * Returns all contents as rejected if the room is too small to fit even a single tile
 * inside the perimeter walkway zone.
 */
export function planRoomContents(
  room: RoomSpec,
  contents: RoomContent[],
  tile: number = SCALE.tile
): PlacementPlan[] {
  const { floorPosition, sizeXZ } = room;
  const usableX = sizeXZ.x - SCALE.humanScale * 2;
  const usableZ = sizeXZ.z - SCALE.humanScale * 2;

  // Guard: room must have at least one tile of usable space in each axis.
  if (usableX < tile || usableZ < tile) {
    const reason = `room_too_small (needs ≥${MIN_ROOM_DIM}×${MIN_ROOM_DIM} studs, got ${sizeXZ.x}×${sizeXZ.z})`;
    return (contents ?? []).map(item => ({
      cframe: [floorPosition.x, floorPosition.y + item.size.y / 2, floorPosition.z] as [number, number, number],
      size: item.size,
      color: item.color ?? '#808080',
      material: item.material ?? 'Concrete',
      name: item.name,
      rejected: { reason },
    }));
  }

  // Guard: empty contents is a no-op, not an error.
  if (!contents || contents.length === 0) return [];

  const floorY = floorPosition.y;

  // Sort: focal first, then fixture, then prop
  const sorted = [...contents].sort((a, b) => {
    const rank = (k: RoomContent['kind']) => k === 'focal' ? 0 : k === 'fixture' ? 1 : 2;
    return rank(a.kind) - rank(b.kind);
  });

  const placed: AABB[] = [];
  const plans: PlacementPlan[] = [];

  for (const item of sorted) {
    const partY = floorY + item.size.y / 2;

    if (item.kind === 'focal') {
      // Always at center, snapped
      const pos = snapV3({ x: floorPosition.x, y: partY, z: floorPosition.z }, { tile, axes: ['x', 'z'] });
      const aabb = expandBounds(pos, item.size);
      placed.push(aabb);
      plans.push({
        cframe: [pos.x, pos.y, pos.z],
        size: item.size,
        color: item.color ?? '#c8a464',
        material: item.material ?? 'SmoothPlastic',
        name: item.name,
      });
      continue;
    }

    // For props/fixtures: scan grid cells within usable zone
    const halfX = usableX / 2;
    const halfZ = usableZ / 2;
    let placed_this = false;

    outer:
    for (let gz = -halfZ; gz <= halfZ; gz += tile) {
      for (let gx = -halfX; gx <= halfX; gx += tile) {
        const candidateRaw: Vec3 = {
          x: floorPosition.x + gx,
          y: partY,
          z: floorPosition.z + gz,
        };
        const candidate = snapV3(candidateRaw, { tile, axes: ['x', 'z'] });
        const aabb = expandBounds(candidate, item.size);

        // Check against all already-placed items
        let collides = false;
        for (const existing of placed) {
          if (boxesOverlap(aabb, existing)) { collides = true; break; }
        }
        if (!collides) {
          placed.push(aabb);
          plans.push({
            cframe: [candidate.x, candidate.y, candidate.z],
            size: item.size,
            color: item.color ?? '#808080',
            material: item.material ?? 'Concrete',
            name: item.name,
          });
          placed_this = true;
          break outer;
        }
      }
    }

    if (!placed_this) {
      plans.push({
        cframe: [floorPosition.x, partY, floorPosition.z],
        size: item.size,
        color: item.color ?? '#808080',
        material: item.material ?? 'Concrete',
        name: item.name,
        rejected: { reason: 'no_space' },
      });
    }
  }

  return plans;
}

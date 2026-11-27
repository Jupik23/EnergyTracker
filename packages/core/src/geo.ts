/**
 * Offline "which zone am I in?" — point-in-polygon over the simplified region
 * outlines in data/regions.json (built by scripts/build-regions.mjs).
 * Runs entirely on the device: GPS coordinates are never sent anywhere.
 */

export interface Region {
  /** Zone id, e.g. "pl", "se3". */
  z: string;
  /** Country code. */
  c: string;
  /** Region or country name (Polish where Natural Earth has it). */
  n: string;
  /** Bounding box [minLon, minLat, maxLon, maxLat] of the outer rings. */
  b: [number, number, number, number];
  /** Polygons → rings → flat [lon, lat, lon, lat, …]. First ring is the outline, the rest are holes. */
  p: number[][][];
}

export interface RegionSet {
  source: string;
  regions: Region[];
}

export interface RegionMatch {
  zone: string;
  country: string;
  region: string;
  /** False when the point was outside every outline and the nearest region was used (coast, lakes, border). */
  exact: boolean;
}

/** Even-odd ray casting over a flat ring. */
function inRing(ring: number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i]!;
    const yi = ring[i + 1]!;
    const xj = ring[j]!;
    const yj = ring[j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(rings: number[][], x: number, y: number): boolean {
  if (!inRing(rings[0]!, x, y)) return false;
  return !rings.slice(1).some((hole) => inRing(hole, x, y));
}

/** Rough distance in km from a point to a ring's vertices (good enough for a ~2 km-simplified outline). */
function distanceToRegion(r: Region, lon: number, lat: number): number {
  const kx = 111 * Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (const poly of r.p) {
    const ring = poly[0]!;
    for (let i = 0; i < ring.length; i += 2) {
      const d = Math.hypot((ring[i]! - lon) * kx, (ring[i + 1]! - lat) * 111);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Points up to this far outside every outline (a beach, a lake, a simplified coast) still snap to the nearest region. */
const MAX_SNAP_KM = 25;

export function findRegion(set: RegionSet, lon: number, lat: number): RegionMatch | null {
  for (const r of set.regions) {
    const [x0, y0, x1, y1] = r.b;
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    if (r.p.some((poly) => inPolygon(poly, lon, lat))) {
      return { zone: r.z, country: r.c, region: r.n, exact: true };
    }
  }
  let nearest: Region | null = null;
  let best = MAX_SNAP_KM;
  for (const r of set.regions) {
    const [x0, y0, x1, y1] = r.b;
    // cheap reject: more than ~0.5° outside the bbox
    if (lon < x0 - 0.5 || lon > x1 + 0.5 || lat < y0 - 0.5 || lat > y1 + 0.5) continue;
    const d = distanceToRegion(r, lon, lat);
    if (d < best) {
      best = d;
      nearest = r;
    }
  }
  return nearest ? { zone: nearest.z, country: nearest.c, region: nearest.n, exact: false } : null;
}

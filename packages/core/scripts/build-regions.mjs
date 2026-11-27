/**
 * Builds packages/core/data/regions.json — simplified region outlines tagged
 * with the bidding zone they belong to, used to find the zone for a GPS
 * position on the device (coordinates never leave the phone).
 *
 * Sources: Natural Earth (public domain) — 1:10m admin-1 regions for countries
 * where the region matters (split bidding zones SE/NO/DK/IT, and PL
 * voivodeships for the grid operator), 1:50m country outlines elsewhere.
 *   NE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
 *   curl -L -o admin1.geojson $NE/ne_10m_admin_1_states_provinces.geojson
 *   curl -L -o admin0.geojson $NE/ne_50m_admin_0_countries.geojson
 *   node packages/core/scripts/build-regions.mjs admin1.geojson admin0.geojson
 *
 * Zone assignment for split countries is by whole region (län, fylke, region,
 * regione). Real bidding-zone borders do not follow them exactly, so places
 * near a border can land in the neighbouring zone — the app lets users fix it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COUNTRIES = 'PL AT BE BG HR CZ DK EE FI FR GR ES NL IE LT LV DE NO PT RO RS SK SI CH SE HU IT'.split(
  ' ',
);
/** Countries described by admin-1 regions; all others by their outline only. */
const BY_REGION = new Set(['PL', 'SE', 'NO', 'DK', 'IT']);

const BY_ISO = {
  // Sweden (län)
  'SE-BD': 'se1',
  'SE-AC': 'se2',
  'SE-Z': 'se2',
  'SE-Y': 'se2',
  'SE-M': 'se4',
  'SE-K': 'se4',
  'SE-G': 'se4',
  'SE-N': 'se4',
  'SE-H': 'se4',
  // Norway (pre-2020 fylker in Natural Earth)
  'NO-01': 'no1',
  'NO-02': 'no1',
  'NO-03': 'no1',
  'NO-04': 'no1',
  'NO-05': 'no1',
  'NO-06': 'no1',
  'NO-07': 'no1',
  'NO-08': 'no2',
  'NO-09': 'no2',
  'NO-10': 'no2',
  'NO-11': 'no2',
  'NO-12': 'no5',
  'NO-14': 'no5',
  'NO-15': 'no3',
  'NO-16': 'no3',
  'NO-17': 'no3',
  'NO-18': 'no4',
  'NO-19': 'no4',
  'NO-20': 'no4',
  // Denmark (regions)
  'DK-81': 'dk1',
  'DK-82': 'dk1',
  'DK-83': 'dk1',
  'DK-84': 'dk2',
  'DK-85': 'dk2',
};
const SE_DEFAULT = 'se3';

const IT_BY_REGION = {
  "Valle d'Aosta": 'it-north',
  Piemonte: 'it-north',
  Lombardia: 'it-north',
  'Trentino-Alto Adige': 'it-north',
  Veneto: 'it-north',
  'Friuli-Venezia Giulia': 'it-north',
  Liguria: 'it-north',
  'Emilia-Romagna': 'it-north',
  Toscana: 'it-centre-north',
  Umbria: 'it-centre-north',
  Marche: 'it-centre-north',
  Lazio: 'it-centre-south',
  Abruzzo: 'it-centre-south',
  Campania: 'it-centre-south',
  Molise: 'it-centre-south',
  Apulia: 'it-south',
  Basilicata: 'it-south',
  Calabria: 'it-calabria',
  Sicily: 'it-sicily',
  Sardegna: 'it-sardinia',
};

/** Overseas territories and islands outside the mainland markets (Canaries, Azores, Madeira, Svalbard…). */
function outsideMarket(p) {
  return p.longitude < -11 || p.latitude < 35 || p.latitude > 72;
}

function zoneFor(p) {
  const cc = p.iso_a2;
  if (cc === 'IT') return IT_BY_REGION[p.region] ?? null;
  if (cc === 'SE') return BY_ISO[p.iso_3166_2] ?? SE_DEFAULT;
  if (cc === 'NO' || cc === 'DK') return BY_ISO[p.iso_3166_2] ?? null;
  return cc.toLowerCase();
}

// --- geometry -------------------------------------------------------------

const TOLERANCE = 0.02; // degrees, ~2 km
const round = (x) => Math.round(x * 1000) / 1000;

function perpDist(p, a, b) {
  const [x, y] = p;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** Iterative Douglas-Peucker. */
function simplify(points, tol) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(points[i], points[s], points[e]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(a / 2);
}

function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

// --- build ----------------------------------------------------------------

const [admin1Path, admin0Path] = process.argv.slice(2);
if (!admin1Path || !admin0Path) {
  console.error('usage: node build-regions.mjs <admin1.geojson> <admin0.geojson>');
  process.exit(1);
}
const regions = [];
const skipped = [];

function addRegion(cc, zone, name, geometry) {
  const polys = [];
  for (const poly of polygonsOf(geometry)) {
    const rings = poly
      .map((ring) => simplify(ring, TOLERANCE).map(([x, y]) => [round(x), round(y)]))
      .filter((ring) => ring.length >= 4 && ringArea(ring) > 1e-4);
    // Drop overseas parts of country outlines (e.g. French Guiana inside France's MultiPolygon).
    if (rings.length && !outsideMarket({ longitude: rings[0][0][0], latitude: rings[0][0][1] })) {
      polys.push(rings.map((ring) => ring.flat()));
    }
  }
  if (!polys.length) return;
  const xs = polys.flatMap((poly) => poly[0].filter((_, i) => i % 2 === 0));
  const ys = polys.flatMap((poly) => poly[0].filter((_, i) => i % 2 === 1));
  regions.push({
    z: zone,
    c: cc.toLowerCase(),
    n: name,
    b: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    p: polys,
  });
}

for (const f of JSON.parse(readFileSync(admin1Path, 'utf8')).features) {
  const p = f.properties;
  if (!BY_REGION.has(p.iso_a2)) continue;
  if (outsideMarket(p)) {
    skipped.push(`${p.iso_3166_2} ${p.name}`);
    continue;
  }
  const zone = zoneFor(p);
  if (!zone) {
    skipped.push(`${p.iso_3166_2} ${p.name} (no zone)`);
    continue;
  }
  addRegion(p.iso_a2, zone, p.name_pl || p.name, f.geometry);
}

for (const f of JSON.parse(readFileSync(admin0Path, 'utf8')).features) {
  const p = f.properties;
  const cc = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2;
  if (!COUNTRIES.includes(cc) || BY_REGION.has(cc)) continue;
  addRegion(cc, cc.toLowerCase(), p.NAME_PL || p.NAME, f.geometry);
}

const missing = COUNTRIES.filter((cc) => !regions.some((r) => r.c === cc.toLowerCase()));
if (missing.length) throw new Error(`no geometry for: ${missing.join(', ')}`);

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'regions.json');
const json = JSON.stringify({
  source: 'Natural Earth (public domain): 1:10m admin-1 for PL/SE/NO/DK/IT, 1:50m countries; simplified',
  regions,
});
writeFileSync(out, json + '\n');
console.log(`${regions.length} regions, ${(json.length / 1024).toFixed(0)} KB -> ${out}`);
console.log(`skipped: ${skipped.join('; ')}`);

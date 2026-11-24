// Solara Bay's bones. buildCity(seed) walks the street grid once, fills the blocks with buildings,
// parks, plazas and a car park, plants the waterfront, and returns a read-only model: the street
// lines, the lots, the solids, the trees and props, and the queries the simulation asks of it
// (may a body of this radius stand here? is this road? where is the next street?). Painting lives
// in cityscape.js; the rules live elsewhere. This module knows geometry only.
import { PLACES, QUARTERS, ROAD, COAST, TINTS, WORLD } from './config.js';
import { clamp, overlapRects, rand, randInt, pick, seeded } from './util.js';

/** Collision cells. A body tests only the solids listed in the cells its footprint covers. */
const CELL = 128;

/** Blocks left open as parks and plazas, keyed "col,row" and chosen by hand so jobs have space. */
const PARK_BLOCKS = new Set(['3,4', '4,4', '1,5', '7,4', '5,7', '2,7']);
const PLAZA_BLOCKS = new Set(['4,2', '3,1']);

/** Which quarter a block belongs to, read off its grid position. */
function quarterOf(col, row) {
  if (col >= 6 && row <= 3) return 'beach';
  if (col >= 6) return 'harbour';
  if (col >= 2 && col <= 5 && row <= 3) return 'downtown';
  if (col >= 2 && col <= 5 && row <= 5) return 'midtown';
  if (col <= 1) return 'oldtown';
  return 'suburbs';
}

/** A roof tone a shade darker than its wall, so a flat top still reads as a solid. */
function roofOf(hex) {
  const v = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((v >> 16) & 255) - 32);
  const g = Math.max(0, ((v >> 8) & 255) - 28);
  const b = Math.max(0, (v & 255) - 20);
  return `rgb(${r},${g},${b})`;
}

export function buildCity(seed) {
  const random = seeded(seed);

  // --- The ten centre lines, one array used for both axes.
  const lines = [];
  for (let i = 0; i < ROAD.count; i += 1) lines.push(ROAD.first + i * ROAD.step);

  const roads = {
    xs: lines.slice(),
    ys: lines.slice(),
    half: ROAD.half,
    ringHalf: ROAD.ringHalf,
    lane: ROAD.lane,
    walk: ROAD.walk,
  };

  const blocks = [];
  const buildings = [];
  const trees = [];
  const props = [];
  const lamps = [];

  const lastLine = lines[ROAD.count - 1];
  const beach = { x: lastLine + ROAD.half, y: 0, w: COAST.water - (lastLine + ROAD.half), h: WORLD };
  const sea = { x: COAST.water, y: 0, w: WORLD - COAST.water, h: WORLD };
  const pier = { x: COAST.water - 10, y: 1592, w: 168, h: 58 };

  // --- Cutting one block into lots: either a row of two or three strips, or a two-by-two.
  function lotsOf(block) {
    const gap = 12;
    const lots = [];
    if (random() < 0.5) {
      const count = randInt(random, 2, 3);
      const width = (block.w - gap * (count + 1)) / count;
      for (let i = 0; i < count; i += 1) {
        lots.push({
          x: block.x + gap + i * (width + gap),
          y: block.y + gap,
          w: width,
          h: block.h - gap * 2,
        });
      }
    } else {
      const rows = randInt(random, 1, 2);
      const width = (block.w - gap * 3) / 2;
      const height = (block.h - gap * (rows + 1)) / rows;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < 2; c += 1) {
          lots.push({
            x: block.x + gap + c * (width + gap),
            y: block.y + gap + r * (height + gap),
            w: width,
            h: height,
          });
        }
      }
    }
    return lots;
  }

  function fillBuilt(block) {
    const tall = block.quarter === 'downtown';
    const low = block.quarter === 'beach' || block.quarter === 'suburbs';
    const tints = TINTS[block.quarter] ?? TINTS.midtown;
    const lots = lotsOf(block);
    for (const lot of lots) {
      // One lot in six stays empty: a yard, a gap, a courtyard. The gaps are what make a block of
      // roofs look like a city instead of a poured slab.
      if (lots.length > 1 && random() < 0.16) continue;
      const inset = rand(random, 3, 14);
      const lean = rand(random, -6, 6);
      const w = lot.w - inset * 2 - Math.max(0, lean);
      const h = lot.h - inset * 2 - Math.max(0, -lean);
      if (w < 26 || h < 26) continue;
      const wall = pick(random, tints);
      const floors = tall ? randInt(random, 4, 9) : low ? randInt(random, 1, 2) : randInt(random, 2, 4);
      const b = {
        x: lot.x + inset + Math.max(0, -lean),
        y: lot.y + inset + Math.max(0, lean),
        w,
        h,
        solid: true,
        floors,
        wall,
        roof: roofOf(wall),
        quarter: block.quarter,
        awning: random() < 0.44 ? pick(random, ['#d2603f', '#3f8fa8', '#c8a851', '#5f8a5c']) : null,
        clutter: random(),
        windows: random(),
      };
      block.buildings.push(b);
      buildings.push(b);
    }
  }

  function plantPark(block) {
    for (let i = 0; i < 15; i += 1) {
      trees.push({
        x: rand(random, block.x + 22, block.x + block.w - 22),
        y: rand(random, block.y + 22, block.y + block.h - 22),
        r: rand(random, 10, 17),
        palm: false,
        tilt: random(),
      });
    }
    props.push({ x: block.x + block.w * 0.18, y: block.y + block.h * 0.56, w: block.w * 0.34, h: block.h * 0.28, kind: 'pond' });
    props.push({ x: block.x + block.w * 0.64, y: block.y + block.h * 0.2, w: 36, h: 36, kind: 'bandstand' });
  }

  function layPlaza(block) {
    props.push({ x: block.x + 10, y: block.y + 10, w: block.w - 20, h: block.h - 20, kind: 'plaza' });
    props.push({ x: block.x + block.w / 2 - 18, y: block.y + block.h / 2 - 18, w: 36, h: 36, kind: 'fountain' });
    for (let i = 0; i < 4; i += 1) {
      trees.push({
        x: block.x + (i % 2 === 0 ? 32 : block.w - 32),
        y: block.y + (i < 2 ? 32 : block.h - 32),
        r: 12,
        palm: true,
        tilt: random(),
      });
    }
  }

  function paveCarPark(block) {
    props.push({ x: block.x, y: block.y, w: block.w, h: block.h, kind: 'parking' });
    const hut = { x: block.x + block.w - 48, y: block.y + 12, w: 34, h: 27 };
    props.push({ ...hut, kind: 'hut' });
    buildings.push({
      ...hut,
      solid: true,
      low: true,
      floors: 1,
      wall: '#f0f0e2',
      roof: '#d8d0b8',
      quarter: block.quarter,
      clutter: 0,
      windows: 0.2,
    });
  }

  // --- Every block between four street lines.
  for (let col = 0; col < ROAD.count - 1; col += 1) {
    for (let row = 0; row < ROAD.count - 1; row += 1) {
      const x = lines[col] + ROAD.half + ROAD.walk;
      const y = lines[row] + ROAD.half + ROAD.walk;
      const w = ROAD.step - (ROAD.half + ROAD.walk) * 2;
      const h = ROAD.step - (ROAD.half + ROAD.walk) * 2;
      const key = `${col},${row}`;
      const quarter = quarterOf(col, row);
      let kind = 'built';
      if (PARK_BLOCKS.has(key)) kind = 'park';
      else if (PLAZA_BLOCKS.has(key)) kind = 'plaza';
      else if (quarter === 'beach' && col === 8) kind = 'lot';
      const block = { x, y, w, h, col, row, quarter, kind, buildings: [] };
      blocks.push(block);
      if (kind === 'built') fillBuilt(block);
      else if (kind === 'park') plantPark(block);
      else if (kind === 'plaza') layPlaza(block);
      else paveCarPark(block);
    }
  }

  // --- The waterfront: palms on the sand, kiosks along a boardwalk, one pier out over the bay.
  for (let i = 0; i < 44; i += 1) {
    trees.push({
      x: rand(random, beach.x + 12, COAST.water - 26),
      y: rand(random, 44, WORLD - 44),
      r: rand(random, 9, 15),
      palm: true,
      tilt: random(),
    });
  }
  for (let i = 0; i < 11; i += 1) {
    const kx = rand(random, beach.x + 44, COAST.water - 74);
    const ky = 130 + (i * (WORLD - 260)) / 11 + rand(random, -18, 18);
    props.push({ x: kx, y: ky, w: 34, h: 24, kind: 'kiosk' });
    buildings.push({
      x: kx,
      y: ky,
      w: 34,
      h: 24,
      solid: true,
      low: true,
      floors: 1,
      wall: '#e8b876',
      roof: '#c98b52',
      quarter: 'beach',
      clutter: 0.1,
      windows: 0.3,
    });
  }
  props.push({ ...pier, kind: 'pier' });

  // --- A lamp head at every junction, and a line of them down the beach road.
  for (const lx of lines) {
    for (const ly of lines) lamps.push({ x: lx + ROAD.half + 9, y: ly + ROAD.half + 9 });
  }
  for (let i = 0; i < 10; i += 1) lamps.push({ x: beach.x + 40, y: 200 + i * 380 });

  // --- The collision index: solids bucketed by cell so a query touches a handful of boxes.
  const solids = buildings.filter((b) => b.solid !== false);
  const cells = new Map();
  const cellKey = (cx, cy) => cx * 8191 + cy;
  for (const solid of solids) {
    const cx0 = Math.floor(solid.x / CELL);
    const cx1 = Math.floor((solid.x + solid.w) / CELL);
    const cy0 = Math.floor(solid.y / CELL);
    const cy1 = Math.floor((solid.y + solid.h) / CELL);
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cy = cy0; cy <= cy1; cy += 1) {
        const key = cellKey(cx, cy);
        let bucket = cells.get(key);
        if (!bucket) cells.set(key, (bucket = []));
        bucket.push(solid);
      }
    }
  }

  function solidsAround(x, y, r) {
    const found = [];
    const cx0 = Math.floor((x - r) / CELL);
    const cx1 = Math.floor((x + r) / CELL);
    const cy0 = Math.floor((y - r) / CELL);
    const cy1 = Math.floor((y + r) / CELL);
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cy = cy0; cy <= cy1; cy += 1) {
        const bucket = cells.get(cellKey(cx, cy));
        if (!bucket) continue;
        for (const solid of bucket) if (!found.includes(solid)) found.push(solid);
      }
    }
    return found;
  }

  /** On asphalt? `pad` widens the carriageway, which is how the pavement test works. */
  function isRoad(x, y, pad = 0) {
    for (const line of lines) {
      if (Math.abs(x - line) <= ROAD.half + pad) return true;
      if (Math.abs(y - line) <= ROAD.half + pad) return true;
    }
    return false;
  }

  function isPavement(x, y) {
    return !isRoad(x, y) && isRoad(x, y, ROAD.walk + ROAD.half);
  }

  /** True when a body of radius r is on the pier planks rather than out over open water. */
  function onPier(x, y, r = 0) {
    return x > pier.x - r && x < pier.x + pier.w + r && y > pier.y - r && y < pier.y + pier.h + r;
  }

  /** May a body of radius r stand here? On land or the pier, inside the map, clear of walls. */
  function isClear(x, y, r) {
    if (x - r < 4 || y - r < 4 || x + r > WORLD - 4 || y + r > WORLD - 4) return false;
    if (x + r > COAST.water) {
      const plank = y > pier.y && y < pier.y + pier.h;
      if (!plank) return false;
    }
    for (const solid of solidsAround(x, y, r)) {
      if (overlapRects({ x: x - r, y: y - r, w: r * 2, h: r * 2 }, solid)) return false;
    }
    return true;
  }

  /** A random point on a street, optionally at least `awayFrom` pixels from (fromX, fromY). */
  function roadPoint(awayFrom, fromX, fromY) {
    const inner = lines.slice(1, -1);
    for (let tries = 0; tries < 90; tries += 1) {
      const across = random() < 0.5;
      const line = pick(random, inner);
      const along = rand(random, ROAD.step * 0.5, WORLD - ROAD.step);
      const x = across ? along : line;
      const y = across ? line : along;
      if (awayFrom && Math.hypot(x - fromX, y - fromY) < awayFrom) continue;
      return { x, y };
    }
    const line = pick(random, inner);
    return { x: line, y: rand(random, ROAD.step, WORLD - ROAD.step) };
  }

  /** The nearest street line and which way it runs: how a spawned car is snapped onto a road. */
  function nearestStreet(x, y) {
    let best = { runs: 'x', line: lines[0], gap: Infinity };
    for (const line of lines) {
      const gap = Math.abs(x - line);
      if (gap < best.gap) best = { runs: 'x', line, gap };
    }
    for (const line of lines) {
      const gap = Math.abs(y - line);
      if (gap < best.gap) best = { runs: 'y', line, gap };
    }
    return best;
  }

  function quarterAt(x, y) {
    if (x > beach.x) return 'beach';
    const col = clamp(Math.floor((x - ROAD.first) / ROAD.step), 0, ROAD.count - 2);
    const row = clamp(Math.floor((y - ROAD.first) / ROAD.step), 0, ROAD.count - 2);
    return quarterOf(col, row);
  }

  function quarterNameAt(x, y) {
    return QUARTERS[quarterAt(x, y)] ?? QUARTERS.downtown;
  }

  /**
   * A standable point a short way from a target: tried in rings outward, preferring pavement or
   * asphalt. Spawns and markers go through this so nothing ever lands inside a wall.
   */
  function standNear(x, y, radius = 11, from = 70, to = 210) {
    for (let ring = from; ring <= to; ring += 14) {
      for (let i = 0; i < 18; i += 1) {
        const angle = (i / 18) * Math.PI * 2 + 0.3;
        const px = x + Math.cos(angle) * ring;
        const py = y + Math.sin(angle) * ring;
        if (!isClear(px, py, radius)) continue;
        if (isPavement(px, py) || isRoad(px, py)) return { x: px, y: py };
      }
    }
    return null;
  }

  /**
   * The pavement outside a landmark: the street-facing kerb nearest the building closest to the
   * named place. Jobs, fares and map markers all sit on one of these, so a marker is always on a
   * surface a body can actually stand on.
   */
  function addressOf(key) {
    const target = PLACES[key] ?? PLACES.garage;
    let nearest = null;
    let best = Infinity;
    for (const b of buildings) {
      if (b.low) continue;
      const d = (b.x + b.w / 2 - target.x) ** 2 + (b.y + b.h / 2 - target.y) ** 2;
      if (d < best) {
        best = d;
        nearest = b;
      }
    }
    if (!nearest) return { x: target.x, y: target.y, name: target.name };

    const cx = nearest.x + nearest.w / 2;
    const cy = nearest.y + nearest.h / 2;
    const street = nearestStreet(cx, cy);
    const kerb = ROAD.half + 20;
    let x = cx;
    let y = cy;
    if (street.runs === 'x') x = street.line + (cx >= street.line ? kerb : -kerb);
    else y = street.line + (cy >= street.line ? kerb : -kerb);
    if (!isClear(x, y, 12)) {
      const spot = standNear(x, y, 12, 26, 150) ?? standNear(cx, cy, 12, 60, 240);
      if (spot) return { x: spot.x, y: spot.y, name: target.name };
    }
    return { x, y, name: target.name };
  }

  const landmarks = Object.entries(PLACES).map(([key, value]) => ({ key, ...value }));

  return {
    seed,
    size: WORLD,
    roads,
    lines,
    blocks,
    buildings,
    solids,
    trees,
    props,
    lamps,
    sea,
    beach,
    pier,
    waterline: COAST.water,
    onPier,
    landmarks,
    solidsAround,
    isRoad,
    isPavement,
    isClear,
    roadPoint,
    nearestStreet,
    quarterAt,
    quarterNameAt,
    addressOf,
    standNear,
    overlapRects,
  };
}

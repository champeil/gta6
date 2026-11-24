// The painter for the city. Sea, foam and sand; the road grid with kerbs, dashes, junction crowns
// and zebra crossings; open blocks as grass, plaza stone or tarmac bays; buildings as a cast shadow,
// two standing walls, a roof with rooftop furniture and a shopfront; palms; then the three night
// passes — the blue wash, the sodium pools under each lamp, and the lit windows blooming outward.
// Every mark is a canvas path, and every pass culls to the camera rectangle.
import { COLORS, FONT, QUARTERS, ROAD } from './config.js';
import { lighten } from './util.js';
import { lampsOn, lightFor } from './sky.js';

function inView(object, view, pad = 0) {
  const w = object.w ?? 0;
  const h = object.h ?? 0;
  return (
    object.x < view.x + view.w + pad &&
    object.x + w > view.x - pad &&
    object.y < view.y + view.h + pad &&
    object.y + h > view.y - pad
  );
}

function pointInView(object, view, pad) {
  return object.x > view.x - pad && object.x < view.x + view.w + pad && object.y > view.y - pad && object.y < view.y + view.h + pad;
}

/** A street's half width: the two outer lines are the wider ring road. */
function halfOf(city, line, axis) {
  const lines = axis === 'x' ? city.roads.xs : city.roads.ys;
  return line === lines[0] || line === lines[lines.length - 1] ? city.roads.ringHalf : ROAD.half;
}

/** The ground east of the last street: sand, the wet edge, the bay and the pier deck. */
function paintShore(ctx, view, city, hour) {
  ctx.fillStyle = COLORS.walkway;
  ctx.fillRect(view.x, view.y, view.w, view.h);

  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(city.beach.x, view.y, Math.max(0, city.waterline - city.beach.x), view.h);

  // Wet sand fading into foam, so the shore is an edge and not a cut.
  const wet = ctx.createLinearGradient(city.waterline - 30, 0, city.waterline + 4, 0);
  wet.addColorStop(0, COLORS.sandWet);
  wet.addColorStop(1, COLORS.foam);
  ctx.fillStyle = wet;
  ctx.fillRect(city.waterline - 30, view.y, 34, view.h);

  const bay = ctx.createLinearGradient(city.waterline, 0, city.size, 0);
  bay.addColorStop(0, COLORS.sea);
  bay.addColorStop(0.4, COLORS.seaDeep);
  bay.addColorStop(1, '#15607a');
  ctx.fillStyle = bay;
  ctx.fillRect(city.waterline, view.y, city.size - city.waterline, view.h);

  // Slow swell lines, phase-shifted by the clock so the water is never a flat sheet.
  ctx.strokeStyle = 'rgba(232, 250, 247, 0.2)';
  ctx.lineWidth = 2;
  const from = Math.floor(view.y / 64) * 64;
  for (let y = from; y < view.y + view.h + 64; y += 64) {
    const drift = Math.sin(y * 0.013 + hour * 0.9) * 24;
    ctx.beginPath();
    ctx.moveTo(city.waterline + 24 + drift, y);
    ctx.lineTo(view.x + view.w, y + 10);
    ctx.stroke();
  }

  // The pier: a shadow, planks, posts.
  if (inView(city.pier, view, 120)) {
    ctx.fillStyle = 'rgba(16, 36, 46, 0.28)';
    ctx.fillRect(city.pier.x + 4, city.pier.y + 10, city.pier.w, city.pier.h);
    ctx.fillStyle = '#b59a70';
    ctx.fillRect(city.pier.x, city.pier.y, city.pier.w, city.pier.h);
    ctx.strokeStyle = 'rgba(72, 54, 36, 0.38)';
    ctx.lineWidth = 1;
    for (let x = city.pier.x + 8; x < city.pier.x + city.pier.w; x += 15) {
      ctx.beginPath();
      ctx.moveTo(x, city.pier.y);
      ctx.lineTo(x, city.pier.y + city.pier.h);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(60, 44, 28, 0.5)';
    for (let x = city.pier.x + 4; x < city.pier.x + city.pier.w; x += 46) ctx.fillRect(x, city.pier.y - 3, 5, 5);
  }
}

/** What a block is, painted flat: lawn with mown stripes and paths, plaza stone, or parking bays. */
function paintBlocks(ctx, view, city) {
  for (const block of city.blocks) {
    if (!inView(block, view)) continue;
    if (block.kind === 'park') {
      ctx.fillStyle = COLORS.grass;
      ctx.fillRect(block.x, block.y, block.w, block.h);
      ctx.fillStyle = COLORS.grassStripe;
      let band = 0;
      for (let y = block.y; y < block.y + block.h; y += 28, band += 1) {
        if (band % 2 === 0) ctx.fillRect(block.x, y, block.w, 14);
      }
      ctx.strokeStyle = COLORS.path;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(block.x, block.y + block.h / 2);
      ctx.lineTo(block.x + block.w, block.y + block.h / 2);
      ctx.moveTo(block.x + block.w / 2, block.y);
      ctx.lineTo(block.x + block.w / 2, block.y + block.h);
      ctx.stroke();
      continue;
    }
    if (block.kind === 'plaza') {
      ctx.fillStyle = COLORS.plaza;
      ctx.fillRect(block.x, block.y, block.w, block.h);
      ctx.strokeStyle = 'rgba(148, 132, 110, 0.45)';
      ctx.lineWidth = 1;
      for (let x = block.x; x < block.x + block.w; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, block.y);
        ctx.lineTo(x, block.y + block.h);
        ctx.stroke();
      }
      continue;
    }
    if (block.kind === 'lot') {
      ctx.fillStyle = '#9b9b96';
      ctx.fillRect(block.x, block.y, block.w, block.h);
      ctx.strokeStyle = 'rgba(242, 240, 226, 0.62)';
      ctx.lineWidth = 2;
      for (let bay = 0; bay < 8; bay += 1) {
        const x = block.x + 22 + bay * 30;
        if (x > block.x + block.w - 56) break;
        ctx.beginPath();
        ctx.moveTo(x, block.y + 28);
        ctx.lineTo(x, block.y + 96);
        ctx.stroke();
      }
      continue;
    }
    ctx.fillStyle = block.quarter === 'suburbs' || block.quarter === 'beach' ? '#cbbfa6' : '#c2b6a0';
    ctx.fillRect(block.x, block.y, block.w, block.h);
  }
}

/** Asphalt, kerbs, centre dashes, junction boxes, crossings and kerb ticks: the street layer. */
function paintStreets(ctx, view, city) {
  // Asphalt, one axis at a time.
  for (const axis of ['x', 'y']) {
    const lines = axis === 'x' ? city.roads.xs : city.roads.ys;
    ctx.fillStyle = COLORS.asphalt;
    for (const line of lines) {
      const half = halfOf(city, line, axis);
      if (axis === 'x') {
        if (line + half < view.x || line - half > view.x + view.w) continue;
        ctx.fillRect(line - half, view.y, half * 2, view.h);
      } else {
        if (line + half < view.y || line - half > view.y + view.h) continue;
        ctx.fillRect(view.x, line - half, view.w, half * 2);
      }
    }
  }

  // Kerbs.
  ctx.strokeStyle = COLORS.kerb;
  ctx.lineWidth = 3;
  for (const axis of ['x', 'y']) {
    const lines = axis === 'x' ? city.roads.xs : city.roads.ys;
    for (const line of lines) {
      const half = halfOf(city, line, axis);
      ctx.beginPath();
      if (axis === 'x') {
        if (line + half < view.x || line - half > view.x + view.w) continue;
        ctx.moveTo(line - half, view.y);
        ctx.lineTo(line - half, view.y + view.h);
        ctx.moveTo(line + half, view.y);
        ctx.lineTo(line + half, view.y + view.h);
      } else {
        if (line + half < view.y || line - half > view.y + view.h) continue;
        ctx.moveTo(view.x, line - half);
        ctx.lineTo(view.x + view.w, line - half);
        ctx.moveTo(view.x, line + half);
        ctx.lineTo(view.x + view.w, line + half);
      }
      ctx.stroke();
    }
  }

  // Dashed centre lines.
  ctx.strokeStyle = COLORS.dash;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([15, 21]);
  for (const axis of ['x', 'y']) {
    const lines = axis === 'x' ? city.roads.xs : city.roads.ys;
    for (const line of lines) {
      const half = halfOf(city, line, axis);
      ctx.beginPath();
      if (axis === 'x') {
        if (line < view.x - half || line > view.x + view.w + half) continue;
        ctx.moveTo(line, view.y);
        ctx.lineTo(line, view.y + view.h);
      } else {
        if (line < view.y - half || line > view.y + view.h + half) continue;
        ctx.moveTo(view.x, line);
        ctx.lineTo(view.x + view.w, line);
      }
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // Junction crown: a faint lighter square at every crossing, which reads as an X from above.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
  for (const rx of city.roads.xs) {
    if (Math.abs(rx - view.x - view.w / 2) > view.w) continue;
    for (const ry of city.roads.ys) {
      if (Math.abs(ry - view.y - view.h / 2) > view.h) continue;
      ctx.fillRect(rx - ROAD.half, ry - ROAD.half, ROAD.half * 2, ROAD.half * 2);
    }
  }

  // Zebra crossings on all four approaches to a junction.
  ctx.fillStyle = 'rgba(245, 239, 220, 0.6)';
  for (const rx of city.roads.xs) {
    if (rx < view.x - 100 || rx > view.x + view.w + 100) continue;
    for (const ry of city.roads.ys) {
      if (ry < view.y - 100 || ry > view.y + view.h + 100) continue;
      for (let i = 0; i < 7; i += 1) {
        const off = -ROAD.half + 5 + i * 11;
        ctx.fillRect(rx + off, ry - ROAD.half - 13, 7, 12);
        ctx.fillRect(rx + off, ry + ROAD.half + 1, 7, 12);
        ctx.fillRect(rx - ROAD.half - 13, ry + off, 12, 7);
        ctx.fillRect(rx + ROAD.half + 1, ry + off, 12, 7);
      }
    }
  }

  // Kerb ticks, so a long kerb is not a ruler line.
  ctx.strokeStyle = 'rgba(118, 110, 98, 0.28)';
  ctx.lineWidth = 1.5;
  const tickFrom = Math.floor(view.y / 36) * 36;
  ctx.beginPath();
  for (const line of city.roads.xs) {
    const half = halfOf(city, line, 'x');
    if (line + half < view.x || line - half > view.x + view.w) continue;
    for (let y = tickFrom; y < view.y + view.h; y += 36) {
      ctx.moveTo(line - half - 6, y);
      ctx.lineTo(line - half + 2, y);
      ctx.moveTo(line + half - 2, y);
      ctx.lineTo(line + half + 6, y);
    }
  }
  ctx.stroke();
}

/** Ponds, fountains, bandstands and bay hatching: block furniture painted on the ground. */
function paintProps(ctx, view, city) {
  for (const prop of city.props) {
    if (!inView(prop, view, 20)) continue;
    const cx = prop.x + prop.w / 2;
    const cy = prop.y + prop.h / 2;
    if (prop.kind === 'pond') {
      ctx.fillStyle = '#4d8d9f';
      ctx.beginPath();
      ctx.ellipse(cx, cy, prop.w / 2, prop.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(232, 250, 246, 0.38)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (prop.kind === 'fountain') {
      ctx.fillStyle = '#d1d9dc';
      ctx.beginPath();
      ctx.arc(cx, cy, prop.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7ec3d7';
      ctx.beginPath();
      ctx.arc(cx, cy, prop.w / 2 - 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (prop.kind === 'bandstand') {
      ctx.fillStyle = '#e7ddc7';
      ctx.beginPath();
      ctx.arc(cx, cy, prop.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b7a787';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(150, 132, 100, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - prop.w / 2 + 4, cy);
      ctx.lineTo(cx + prop.w / 2 - 4, cy);
      ctx.stroke();
    }
  }
}

/**
 * One building, seen from above: the cast shadow, two standing walls, a shaded roof, a stair hut,
 * a water tank and vent, a shopfront band on the street side, and the window dots that come on
 * after dark.
 */
function paintBuilding(ctx, b, lit) {
  const lift = Math.min(15, (b.floors ?? 3) * 1.9);
  const { x, y, w, h } = b;

  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(x + lift * 0.85, y + lift * 0.95, w, h);

  ctx.fillStyle = lighten(b.wall, -0.44);
  ctx.fillRect(x + lift * 0.55, y + h, w, lift * 0.65);
  ctx.fillRect(x + w, y + lift * 0.35, lift * 0.55, h);

  const roof = ctx.createLinearGradient(x, y, x + w, y + h);
  roof.addColorStop(0, lighten(b.wall, 0.13));
  roof.addColorStop(0.55, b.wall);
  roof.addColorStop(1, lighten(b.wall, -0.15));
  ctx.fillStyle = roof;
  ctx.fillRect(x, y, w, h);

  // A sunlit north and west lip, a shadowed south and east one: the light has a direction.
  ctx.strokeStyle = lighten(b.wall, 0.3);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();
  ctx.strokeStyle = lighten(b.wall, -0.46);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + w, y + 1);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + 1, y + h);
  ctx.stroke();

  // Rooftop furniture: a stair hut in one corner, a vent, a water tank on the bigger roofs.
  if (w > 48 && h > 42) {
    const hutW = Math.min(30, w * 0.27);
    const hutH = Math.min(22, h * 0.25);
    const hx = x + w * 0.13;
    const hy = y + h * 0.15;
    ctx.fillStyle = lighten(b.roof, -0.3);
    ctx.fillRect(hx + 3, hy + 3, hutW, hutH);
    ctx.fillStyle = lighten(b.roof, -0.08);
    ctx.fillRect(hx, hy, hutW, hutH);
    ctx.strokeStyle = lighten(b.roof, 0.24);
    ctx.lineWidth = 1;
    ctx.strokeRect(hx + 0.5, hy + 0.5, hutW - 1, hutH - 1);
  }
  const clutter = b.clutter ?? 0.5;
  if (clutter > 0.56 && w > 62 && h > 54) {
    const tx = x + w * 0.69;
    const ty = y + h * 0.63;
    const tr = Math.min(12, w * 0.12);
    ctx.fillStyle = 'rgba(20, 16, 12, 0.2)';
    ctx.beginPath();
    ctx.arc(tx + 3, ty + 3, tr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lighten(b.roof, -0.06);
    ctx.beginPath();
    ctx.arc(tx, ty, tr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = lighten(b.roof, 0.26);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx - tr * 0.48, ty);
    ctx.lineTo(tx + tr * 0.48, ty);
    ctx.stroke();
  }
  if (clutter > 0.3 && w > 54) {
    ctx.fillStyle = lighten(b.roof, -0.26);
    ctx.fillRect(x + w * 0.42, y + h * 0.34, 12, 9);
    ctx.fillStyle = lighten(b.roof, -0.04);
    ctx.fillRect(x + w * 0.42, y + h * 0.34, 12, 3);
  }

  // The shopfront band along the street side of a low block.
  if ((b.floors ?? 3) <= 4 && w > 54 && h > 48) {
    const bandY = y + h - 12;
    ctx.fillStyle = 'rgba(38, 48, 60, 0.5)';
    ctx.fillRect(x + 5, bandY, w - 10, 8);
    ctx.fillStyle = lit ? 'rgba(255, 214, 140, 0.72)' : 'rgba(176, 205, 223, 0.5)';
    for (let gx = x + 8; gx < x + w - 12; gx += 14) ctx.fillRect(gx, bandY + 2, 8, 4);
    if (b.awning) {
      ctx.fillStyle = b.awning;
      ctx.fillRect(x + 2, y + h - 4, w - 4, 5);
    }
  }

  // Window dots along the parapet; warm after dark.
  const seedValue = b.windows ?? 0.5;
  ctx.fillStyle = lit ? 'rgba(255, 219, 142, 0.86)' : 'rgba(44, 56, 72, 0.32)';
  for (let wx = x + 6; wx < x + w - 5; wx += 11) {
    if (seedValue > 0.3) ctx.fillRect(wx, y + 5, 5, 4);
    if (seedValue > 0.55) ctx.fillRect(wx, y + h - 9, 5, 4);
  }
  for (let wy = y + 6; wy < y + h - 5; wy += 11) {
    if (seedValue > 0.42) ctx.fillRect(x + 5, wy, 4, 5);
    if (seedValue > 0.62) ctx.fillRect(x + w - 9, wy, 4, 5);
  }
}

function paintTrees(ctx, view, city) {
  for (const tree of city.trees) {
    if (!pointInView(tree, view, 44)) continue;
    ctx.fillStyle = COLORS.shadow;
    ctx.beginPath();
    ctx.ellipse(tree.x + 5, tree.y + 7, tree.r * 1.05, tree.r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    if (tree.palm) {
      ctx.strokeStyle = '#3e7a39';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2 + (tree.tilt ?? 0) * 6.28;
        ctx.beginPath();
        ctx.moveTo(tree.x, tree.y);
        ctx.quadraticCurveTo(
          tree.x + Math.cos(angle) * tree.r,
          tree.y + Math.sin(angle) * tree.r,
          tree.x + Math.cos(angle) * tree.r * 1.7,
          tree.y + Math.sin(angle) * tree.r * 1.3,
        );
        ctx.stroke();
      }
      ctx.fillStyle = '#4f9147';
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#3e7a39';
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#569b48';
      ctx.beginPath();
      ctx.arc(tree.x - tree.r * 0.22, tree.y - tree.r * 0.25, tree.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Neighbourhood names stencilled faintly on the ground, on every third block. */
function paintQuarterNames(ctx, view, city) {
  ctx.textAlign = 'center';
  ctx.font = `700 19px ${FONT}`;
  ctx.fillStyle = 'rgba(76, 64, 50, 0.28)';
  for (const block of city.blocks) {
    if (block.col % 3 !== 1 || block.row % 3 !== 1) continue;
    if (!inView(block, view)) continue;
    ctx.fillText(QUARTERS[block.quarter] ?? '', block.x + block.w / 2, block.y - 9);
  }
  ctx.textAlign = 'left';
}

/** The whole city, one call; the caller has already set the world transform. */
export function paintCityscape(ctx, view, city, hour) {
  const lit = lampsOn(hour);
  paintShore(ctx, view, city, hour);
  paintBlocks(ctx, view, city);
  paintStreets(ctx, view, city);
  paintProps(ctx, view, city);
  for (const b of city.buildings) {
    if (!inView(b, view, 64)) continue;
    paintBuilding(ctx, b, lit);
  }
  paintTrees(ctx, view, city);
  paintQuarterNames(ctx, view, city);
}

/** Night, pass one: the indigo wash over the world, with the warm dusk shoulder on top. */
export function paintNightWash(ctx, view, hour) {
  const light = lightFor(hour);
  if (light.night <= 0.02) return;
  ctx.fillStyle = `rgba(12, 18, 46, ${0.62 * light.night})`;
  ctx.fillRect(view.x, view.y, view.w, view.h);
  if (light.warm > 0.02) {
    ctx.fillStyle = `rgba(255, 138, 74, ${0.14 * light.warm})`;
    ctx.fillRect(view.x, view.y, view.w, view.h);
  }
}

/** Night, pass two: a sodium pool on the pavement under every lamp head. */
export function paintLampPools(ctx, view, city, hour) {
  const light = lightFor(hour);
  if (!light.lit) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const lamp of city.lamps) {
    if (!pointInView(lamp, view, 130)) continue;
    const reach = 132;
    const pool = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, reach);
    pool.addColorStop(0, `rgba(255, 206, 126, ${0.5 * light.night})`);
    pool.addColorStop(0.45, `rgba(255, 186, 104, ${0.2 * light.night})`);
    pool.addColorStop(1, 'rgba(255, 176, 96, 0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, reach, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 234, 178, ${0.86 * light.night})`;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Night, pass three: lit windows blooming and spilling, and a halo round each lamp head. */
export function paintWindowBloom(ctx, view, city, hour) {
  const light = lightFor(hour);
  if (!light.lit) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of city.buildings) {
    if (!inView(b, view)) continue;
    const seedValue = b.windows ?? 0.5;
    if (seedValue <= 0.45) continue;
    ctx.fillStyle = `rgba(255, 214, 138, ${0.32 * light.night})`;
    for (let x = b.x + 6; x < b.x + b.w - 5; x += 11) {
      if (seedValue > 0.3) ctx.fillRect(x, b.y + 5, 5, 4);
      if (seedValue > 0.55) ctx.fillRect(x, b.y + b.h - 9, 5, 4);
    }
    for (let y = b.y + 6; y < b.y + b.h - 5; y += 11) {
      if (seedValue > 0.42) ctx.fillRect(b.x + 5, y, 4, 5);
      if (seedValue > 0.62) ctx.fillRect(b.x + b.w - 9, y, 4, 5);
    }
    if ((b.floors ?? 3) <= 3) {
      const spill = ctx.createLinearGradient(0, b.y + b.h, 0, b.y + b.h + 26);
      spill.addColorStop(0, `rgba(255, 206, 130, ${0.15 * light.night})`);
      spill.addColorStop(1, 'rgba(255, 200, 120, 0)');
      ctx.fillStyle = spill;
      ctx.fillRect(b.x + 4, b.y + b.h, b.w - 8, 26);
    }
  }
  for (const lamp of city.lamps) {
    if (!pointInView(lamp, view, 60)) continue;
    const halo = ctx.createRadialGradient(lamp.x, lamp.y, 1, lamp.x, lamp.y, 42);
    halo.addColorStop(0, `rgba(255, 232, 176, ${0.28 * light.night})`);
    halo.addColorStop(1, 'rgba(255, 220, 150, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

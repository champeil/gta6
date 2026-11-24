// The minimap: a rounded square in the corner that shows the streets, the water, the blocks and a
// blip for everything worth walking to, with the hero as an arrow at its centre. It draws from the
// same city model as the world, scaled down, and it never rotates — north is up, so the arrow turns.
import { COLORS, ROAD } from './config.js';
import { roundRect } from './util.js';

/** How many world pixels one minimap pixel covers. */
const SCALE = 0.055;
const SIZE = 186;

/** The minimap holds no state beyond its scale; the factory lets game.js keep a handle. */
export function createMinimap() {
  return { scale: SCALE, size: SIZE };
}

export function paintMinimap(ctx, game) {
  const { canvas, player, city } = game;
  const x0 = 22;
  const y0 = canvas.height - SIZE - 138;
  const cx = x0 + SIZE / 2;
  const cy = y0 + SIZE / 2;
  const halfWorld = (SIZE / 2) / SCALE;

  ctx.save();
  roundRect(ctx, x0, y0, SIZE, SIZE, 12);
  ctx.clip();

  ctx.fillStyle = '#1b2733';
  ctx.fillRect(x0, y0, SIZE, SIZE);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(SCALE, SCALE);
  ctx.translate(-player.x, -player.y);

  // Sand and water on the east.
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(city.beach.x, player.y - halfWorld, Math.max(0, city.waterline - city.beach.x), halfWorld * 2);
  ctx.fillStyle = '#1d6f86';
  ctx.fillRect(city.waterline, player.y - halfWorld, city.size - city.waterline, halfWorld * 2);

  // Blocks as pale rectangles.
  ctx.fillStyle = 'rgba(206, 192, 164, 0.5)';
  for (const block of city.blocks) {
    if (Math.abs(block.x - player.x) > halfWorld + block.w || Math.abs(block.y - player.y) > halfWorld + block.h) continue;
    ctx.fillRect(block.x, block.y, block.w, block.h);
  }

  // Streets.
  ctx.fillStyle = 'rgba(38, 44, 52, 0.85)';
  for (const line of city.roads.xs) {
    if (Math.abs(line - player.x) > halfWorld + 80) continue;
    ctx.fillRect(line - ROAD.half, player.y - halfWorld, ROAD.half * 2, halfWorld * 2);
  }
  for (const line of city.roads.ys) {
    if (Math.abs(line - player.y) > halfWorld + 80) continue;
    ctx.fillRect(player.x - halfWorld, line - ROAD.half, halfWorld * 2, ROAD.half * 2);
  }

  ctx.restore();

  // --- Blips. Drawn in screen space so their size stays readable.
  const toScreen = (wx, wy) => ({
    x: cx + (wx - player.x) * SCALE,
    y: cy + (wy - player.y) * SCALE,
  });
  const edge = (point) => ({
    x: Math.max(x0 + 9, Math.min(x0 + SIZE - 9, point.x)),
    y: Math.max(y0 + 9, Math.min(y0 + SIZE - 9, point.y)),
  });

  for (const marker of game.activeMarkers()) {
    const point = edge(toScreen(marker.x, marker.y));
    let colour = '#ffd66b';
    if (marker.kind === 'fare') colour = '#78dcff';
    else if (marker.kind === 'package') colour = '#c08c4e';
    else if (marker.kind === 'goal') colour = '#ff8c78';
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(point.x, point.y, marker.kind === 'job' ? 5 : 3.6, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const car of game.police.cars) {
    const point = toScreen(car.x, car.y);
    if (point.x < x0 || point.x > x0 + SIZE || point.y < y0 || point.y > y0 + SIZE) continue;
    ctx.fillStyle = Math.sin(game.clock * 9) > 0 ? COLORS.sirenB : COLORS.sirenA;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // The hero: a cream arrow that turns with him.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(player.car ? player.car.angle : player.angle);
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.moveTo(7.5, 0);
  ctx.lineTo(-5, 5);
  ctx.lineTo(-2.5, 0);
  ctx.lineTo(-5, -5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 16, 12, 0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // North mark.
  ctx.font = '700 9px "Consolas", monospace';
  ctx.fillStyle = 'rgba(246, 239, 225, 0.55)';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, y0 + 13);

  ctx.restore();

  // Frame, and a hairline highlight so it sits on the scene rather than in it.
  ctx.strokeStyle = 'rgba(255, 240, 210, 0.22)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x0 + 0.5, y0 + 0.5, SIZE - 1, SIZE - 1, 12);
  ctx.stroke();
}

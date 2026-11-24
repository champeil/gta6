// The three cards that are not the game: the title, the pause sheet and the full map. All three are
// painted over the running city, so the world is always visible behind them and the title's slow
// pan is the same city the player is about to walk into.
import { CITY_NAME, COLORS, FONT, HERO_NAME, MONO, QUARTERS } from './config.js';
import { roundRect, cashText, timeText } from './util.js';

/** A dimmed backdrop with a soft vignette, so a card reads over a busy street. */
function backdrop(ctx, w, h, strength = 0.62) {
  ctx.fillStyle = `rgba(6, 10, 16, ${strength})`;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, h * 0.42, h * 0.1, w / 2, h * 0.42, h * 0.95);
  glow.addColorStop(0, 'rgba(255, 178, 108, 0.12)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

/** The wordmark: the city name in wide letter-spaced caps over a rule. */
function wordmark(ctx, x, y, size) {
  ctx.textAlign = 'center';
  ctx.font = `700 ${size}px ${FONT}`;
  const text = CITY_NAME.toUpperCase();
  const track = size * 0.22;
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + track * (text.length - 1);
  let cx = x - total / 2;
  ctx.fillStyle = COLORS.ink;
  ctx.shadowColor = 'rgba(255, 150, 80, 0.45)';
  ctx.shadowBlur = 26;
  for (let i = 0; i < text.length; i += 1) {
    ctx.textAlign = 'left';
    ctx.fillText(text[i], cx, y);
    cx += widths[i] + track;
  }
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 214, 107, 0.55)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - total / 2, y + 16);
  ctx.lineTo(x + total / 2, y + 16);
  ctx.stroke();
  ctx.textAlign = 'center';
}

function paintTitle(ctx, game) {
  const { canvas } = game;
  const w = canvas.width;
  const h = canvas.height;
  backdrop(ctx, w, h, 0.42);

  wordmark(ctx, w / 2, h * 0.34, 76);

  ctx.textAlign = 'center';
  ctx.font = `500 17px ${FONT}`;
  ctx.fillStyle = 'rgba(246, 239, 225, 0.8)';
  ctx.fillText('Seven jobs, two fixers, one sun-bleached bay.', w / 2, h * 0.34 + 56);

  // The start prompt, breathing so it is obviously live.
  const pulse = 0.62 + Math.sin(game.clock * 2.6) * 0.22;
  ctx.font = `700 20px ${MONO}`;
  ctx.fillStyle = `rgba(255, 214, 107, ${pulse})`;
  ctx.fillText('PRESS ENTER', w / 2, h * 0.62);

  ctx.font = `500 13px ${FONT}`;
  ctx.fillStyle = 'rgba(246, 239, 225, 0.6)';
  ctx.fillText('WASD walk · Shift run · E enter a car · click to shoot · M map · F5 save · F9 load', w / 2, h * 0.62 + 30);

  if (game.hasSave?.()) {
    ctx.font = `600 12px ${MONO}`;
    ctx.fillStyle = 'rgba(140, 224, 122, 0.8)';
    ctx.fillText('a save file is waiting — press F9 at the title to load it', w / 2, h * 0.62 + 56);
  }

  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = 'rgba(246, 239, 225, 0.34)';
  ctx.fillText('an original game, drawn entirely with canvas paths', w / 2, h - 28);
  ctx.textAlign = 'left';
}

function paintPause(ctx, game) {
  const { canvas, player, state } = game;
  const w = canvas.width;
  const h = canvas.height;
  backdrop(ctx, w, h, 0.66);

  const cardW = 520;
  const cardH = 320;
  const x = (w - cardW) / 2;
  const y = (h - cardH) / 2;
  ctx.fillStyle = 'rgba(14, 19, 28, 0.9)';
  roundRect(ctx, x, y, cardW, cardH, 16);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelEdge;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = `700 30px ${FONT}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText('PAUSED', w / 2, y + 58);

  ctx.font = `600 13px ${MONO}`;
  ctx.fillStyle = 'rgba(246, 239, 225, 0.6)';
  ctx.fillText(`${HERO_NAME.toUpperCase()} · ${timeText(state.hour)} · ${game.city.quarterNameAt(player.x, player.y)}`, w / 2, y + 84);

  const rows = [
    ['Wallet', cashText(player.cash ?? 0)],
    ['Vitals', `${Math.round(player.health)} / ${player.maxHealth}`],
    ['Jobs done', `${game.missions.state.done.size} of ${game.missions.STORY.length}`],
    ['Fares run', String(game.missions.state.sideFares)],
    ['Parcels', String(game.missions.state.packages)],
    ['Busted / wasted', `${state.arrests} / ${state.deaths}`],
  ];
  ctx.font = `500 15px ${FONT}`;
  let ry = y + 128;
  for (const [label, value] of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(246, 239, 225, 0.55)';
    ctx.fillText(label, x + 56, ry);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(value, x + cardW - 56, ry);
    ry += 26;
  }

  ctx.textAlign = 'center';
  ctx.font = `600 12px ${MONO}`;
  ctx.fillStyle = 'rgba(255, 214, 107, 0.8)';
  ctx.fillText('P resume · M map · F5 save · F9 load', w / 2, y + cardH - 26);
  ctx.textAlign = 'left';
}

/** The full map: the whole grid, the bay, the quarters and every marker, on one sheet. */
function paintMap(ctx, game) {
  const { canvas, player, city } = game;
  const w = canvas.width;
  const h = canvas.height;
  backdrop(ctx, w, h, 0.78);

  const pad = 66;
  const side = Math.min(w - pad * 2, h - pad * 2 - 40);
  const x0 = (w - side) / 2;
  const y0 = (h - side) / 2 + 8;
  const scale = side / city.size;

  ctx.fillStyle = '#111a24';
  roundRect(ctx, x0 - 8, y0 - 8, side + 16, side + 16, 12);
  ctx.fill();

  ctx.save();
  roundRect(ctx, x0, y0, side, side, 8);
  ctx.clip();

  ctx.fillStyle = '#16222e';
  ctx.fillRect(x0, y0, side, side);

  // Sand and bay.
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(x0 + city.beach.x * scale, y0, Math.max(0, (city.waterline - city.beach.x) * scale), side);
  ctx.fillStyle = '#1d6f86';
  ctx.fillRect(x0 + city.waterline * scale, y0, side - city.waterline * scale, side);

  // Blocks.
  ctx.fillStyle = 'rgba(198, 184, 156, 0.32)';
  for (const block of city.blocks) {
    ctx.fillRect(x0 + block.x * scale, y0 + block.y * scale, block.w * scale, block.h * scale);
  }

  // Streets.
  ctx.fillStyle = 'rgba(232, 226, 210, 0.4)';
  for (const line of city.roads.xs) {
    ctx.fillRect(x0 + (line - ROAD_HALF) * scale, y0, ROAD_HALF * 2 * scale, side);
  }
  for (const line of city.roads.ys) {
    ctx.fillRect(x0, y0 + (line - ROAD_HALF) * scale, side, ROAD_HALF * 2 * scale);
  }

  // Quarter names, in the middle of each third of the grid.
  ctx.textAlign = 'center';
  ctx.font = `700 11px ${MONO}`;
  ctx.fillStyle = 'rgba(246, 239, 225, 0.45)';
  const third = side / 3;
  const labels = [
    [0.5, 0.18, 'oldtown'],
    [1.5, 0.18, 'downtown'],
    [2.5, 0.18, 'beach'],
    [0.5, 1.5, 'suburbs'],
    [1.5, 1.5, 'midtown'],
    [2.5, 1.5, 'harbour'],
  ];
  for (const [qx, qy, key] of labels) {
    ctx.fillText(QUARTERS[key].toUpperCase(), x0 + third * qx, y0 + third * qy);
  }

  // Markers.
  for (const marker of game.activeMarkers()) {
    let colour = '#ffd66b';
    if (marker.kind === 'fare') colour = '#78dcff';
    else if (marker.kind === 'package') colour = '#c08c4e';
    else if (marker.kind === 'goal') colour = '#ff8c78';
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x0 + marker.x * scale, y0 + marker.y * scale, marker.kind === 'job' ? 5.5 : 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Police.
  for (const car of game.police.cars) {
    ctx.fillStyle = Math.sin(game.clock * 9) > 0 ? COLORS.sirenB : COLORS.sirenA;
    ctx.beginPath();
    ctx.arc(x0 + car.x * scale, y0 + car.y * scale, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // The hero.
  ctx.save();
  ctx.translate(x0 + player.x * scale, y0 + player.y * scale);
  ctx.rotate(player.car ? player.car.angle : player.angle);
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-5.5, 5.5);
  ctx.lineTo(-2.5, 0);
  ctx.lineTo(-5.5, -5.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();

  ctx.strokeStyle = 'rgba(255, 240, 210, 0.2)';
  ctx.lineWidth = 1;
  roundRect(ctx, x0, y0, side, side, 8);
  ctx.stroke();

  // A legend under the sheet.
  ctx.textAlign = 'center';
  ctx.font = `600 11px ${MONO}`;
  const items = [
    ['#ffd66b', 'job door'],
    ['#78dcff', 'fare'],
    ['#c08c4e', 'parcel'],
    ['#ff8c78', 'objective'],
    ['#ec4040', 'police'],
  ];
  let lx = w / 2 - 232;
  for (const [colour, label] of items) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(lx, y0 + side + 26, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(246, 239, 225, 0.6)';
    ctx.textAlign = 'left';
    ctx.fillText(label, lx + 10, y0 + side + 30);
    lx += 96;
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 214, 107, 0.7)';
  ctx.fillText('M or Esc to close', w / 2, y0 + side + 52);
  ctx.textAlign = 'left';
}

const ROAD_HALF = 44;

/** The card dispatcher render.js calls. */
export function paintMenus(ctx, game, which) {
  if (which === 'title') paintTitle(ctx, game);
  else if (which === 'pause') paintPause(ctx, game);
  else if (which === 'map') paintMap(ctx, game);
}

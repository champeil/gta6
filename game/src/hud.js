// The screen furniture: money, the two meters, the gun and its rounds, the stars, the clock and the
// quarter name, the current objective, the radio chatter and the toasts. Every plate is the same
// rounded panel, so the HUD reads as one instrument rather than a pile of boxes.
import { COLORS, FONT, GUNS, MONO } from './config.js';
import { roundRect, cashText, timeText } from './util.js';
import { dayPhaseName } from './sky.js';

function plate(ctx, x, y, w, h, alpha = 0.76) {
  ctx.fillStyle = `rgba(12, 16, 24, ${alpha})`;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelEdge;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Five stars, filled to the wanted level, with a slow blink while the heat is live. */
function paintStars(ctx, x, y, stars, time) {
  for (let i = 0; i < 5; i += 1) {
    const on = i < stars;
    const px = x + i * 26;
    ctx.save();
    ctx.translate(px, y);
    ctx.beginPath();
    for (let p = 0; p < 10; p += 1) {
      const angle = (Math.PI / 5) * p - Math.PI / 2;
      const reach = p % 2 === 0 ? 10.5 : 4.6;
      const px2 = Math.cos(angle) * reach;
      const py2 = Math.sin(angle) * reach;
      if (p === 0) ctx.moveTo(px2, py2);
      else ctx.lineTo(px2, py2);
    }
    ctx.closePath();
    if (on) {
      const blink = 0.78 + Math.sin(time * 5 + i) * 0.22;
      ctx.fillStyle = `rgba(255, 211, 77, ${blink})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(80, 52, 8, 0.8)';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 240, 210, 0.22)';
    }
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

/** A horizontal meter with a label, a value and a colour. */
function meter(ctx, x, y, w, value, max, colour, label) {
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, x, y, w, 9, 4.5);
  ctx.fill();
  const ratio = Math.max(0, Math.min(1, value / max));
  if (ratio > 0) {
    ctx.fillStyle = colour;
    roundRect(ctx, x, y, Math.max(5, w * ratio), 9, 4.5);
    ctx.fill();
  }
  ctx.font = `600 10px ${MONO}`;
  ctx.fillStyle = 'rgba(246, 239, 225, 0.55)';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 1, y - 5);
}

/** The HUD keeps almost no state of its own: it reads the game every frame. The factory exists so
 * game.js can hold a handle and a future HUD could cache textures. */
export function createHud() {
  return { plates: 0 };
}

export function paintHud(ctx, game) {
  const { canvas, player, state, missions, police } = game;
  const time = game.clock;
  const W = canvas.width;

  // --- Wallet, top right.
  ctx.textAlign = 'right';
  ctx.font = `700 30px ${MONO}`;
  ctx.fillStyle = COLORS.cash;
  ctx.fillText(cashText(player.cash ?? 0), W - 26, 46);
  ctx.font = `600 11px ${MONO}`;
  ctx.fillStyle = 'rgba(246, 239, 225, 0.5)';
  ctx.fillText('WALLET', W - 26, 62);

  // --- Clock and quarter, under the wallet.
  ctx.font = `700 18px ${MONO}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(timeText(state.hour), W - 26, 92);
  ctx.font = `500 12px ${FONT}`;
  ctx.fillStyle = 'rgba(246, 239, 225, 0.62)';
  ctx.fillText(`${game.city.quarterNameAt(player.x, player.y)} · ${dayPhaseName(state.hour)}`, W - 26, 110);

  // --- Stars.
  if (state.wanted > 0) {
    paintStars(ctx, W - 152, 140, state.wanted, time);
  }

  // --- Health and armour, bottom left, above the minimap.
  plate(ctx, 22, canvas.height - 118, 232, 62, 0.72);
  meter(ctx, 36, canvas.height - 92, 200, player.health, player.maxHealth, COLORS.health, 'VITALS');
  if (player.armour > 0) {
    meter(ctx, 36, canvas.height - 70, 200, player.armour, 100, COLORS.armour, 'ARMOUR');
  }

  // --- Gun and rounds, bottom right.
  const gun = GUNS[player.gun] ?? GUNS.fists;
  const rounds = player.gun === 'fists' ? '—' : String(player.ammo[player.gun] ?? 0);
  plate(ctx, W - 214, canvas.height - 118, 192, 62, 0.72);
  ctx.textAlign = 'left';
  ctx.font = `700 20px ${FONT}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(gun.label, W - 198, canvas.height - 90);
  ctx.font = `700 26px ${MONO}`;
  ctx.fillStyle = (player.ammo[player.gun] ?? 0) > 0 || player.gun === 'fists' ? COLORS.gold : COLORS.health;
  ctx.textAlign = 'right';
  ctx.fillText(rounds, W - 38, canvas.height - 86);
  ctx.font = `500 10px ${MONO}`;
  ctx.fillStyle = 'rgba(246, 239, 225, 0.45)';
  ctx.fillText('ROUNDS', W - 38, canvas.height - 70);
  ctx.textAlign = 'left';
  ctx.font = `500 10px ${MONO}`;
  ctx.fillStyle = 'rgba(246, 239, 225, 0.4)';
  ctx.fillText('1-4 select · E enter · M map', W - 198, canvas.height - 66);

  // --- Objective, top left: a plate with a small gold bar and the line of the job.
  const objective = missions.objectiveLabel();
  ctx.font = `600 14px ${FONT}`;
  const width = Math.min(560, ctx.measureText(objective).width + 46);
  plate(ctx, 22, 22, width, 46, 0.7);
  ctx.fillStyle = COLORS.gold;
  roundRect(ctx, 34, 36, 4, 18, 2);
  ctx.fill();
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(objective, 48, 51);

  // A small progress line under it when a job is live.
  if (missions.state.active) {
    const job = missions.state.active;
    const at = missions.state.step;
    ctx.font = `600 10px ${MONO}`;
    ctx.fillStyle = 'rgba(246, 239, 225, 0.45)';
    ctx.fillText(`${job.title.toUpperCase()} · STEP ${at + 1}/${job.steps.length}`, 48, 66);
  }

  // --- Radio chatter: the dispatcher, three lines at most, fading out.
  ctx.textAlign = 'right';
  let ry = 168;
  for (const line of police.radio) {
    ctx.font = `600 12px ${FONT}`;
    const alpha = Math.min(1, line.life / 1.2);
    ctx.fillStyle = `rgba(143, 182, 232, ${0.85 * alpha})`;
    ctx.fillText(line.text, W - 26, ry);
    ry += 18;
  }

  // --- Toasts, bottom centre.
  ctx.textAlign = 'center';
  let ty = canvas.height - 150;
  for (let i = game.toasts.length - 1; i >= 0; i -= 1) {
    const toast = game.toasts[i];
    const alpha = Math.min(1, toast.life / 0.8);
    ctx.font = `600 14px ${FONT}`;
    const tw = ctx.measureText(toast.text).width + 34;
    ctx.fillStyle = `rgba(12, 16, 24, ${0.72 * alpha})`;
    roundRect(ctx, canvas.width / 2 - tw / 2, ty - 18, tw, 30, 8);
    ctx.fill();
    ctx.fillStyle = `rgba(246, 239, 225, ${alpha})`;
    ctx.fillText(toast.text, canvas.width / 2, ty + 2);
    ty -= 38;
  }

  // --- Save note and the pause hint.
  if (state.saveNote) {
    ctx.textAlign = 'center';
    ctx.font = `600 12px ${MONO}`;
    ctx.fillStyle = 'rgba(140, 224, 122, 0.9)';
    ctx.fillText(state.saveNote, canvas.width / 2, 96);
  }

  // --- Arrest progress: a thin ring of red under the hero while an officer has hold of him.
  if (police.state.busted > 0.05) {
    const ratio = Math.min(1, police.state.busted / 1.1);
    const cx = player.x;
    const cy = player.y;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, -game.view.x, -game.view.y);
    ctx.strokeStyle = 'rgba(236, 64, 64, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.textAlign = 'left';
}

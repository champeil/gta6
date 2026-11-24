// The camera's painter. Everything in the world is drawn in world coordinates, in a fixed order —
// ground, road scars, night wash, lamps, markers, cars, people, bullets, particles — and then the
// screen is put back into pixels for the HUD, the minimap and whatever card is up. Cars, people and
// effects are painted from small parts of their own state; this file owns the shapes and the light.
import { COLORS, FONT, GUNS, ROAD } from './config.js';
import { paintCityscape, paintLampPools, paintNightWash, paintWindowBloom } from './cityscape.js';
import { carCorners } from './vehicles.js';
import { lightFor } from './sky.js';
import { roundRect } from './util.js';
import { paintHud } from './hud.js';
import { paintMinimap } from './minimap.js';
import { paintMenus } from './menus.js';

/** A drop shadow under anything round, offset the way the sun leans. */
function blob(ctx, x, y, rx, ry, alpha = 0.22) {
  ctx.fillStyle = `rgba(18, 13, 8, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x + rx * 0.22, y + ry * 0.5, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A person seen from above: shadow, shoulders, head, and the gun if there is one. */
function paintPerson(ctx, person, options = {}) {
  const dead = person.dead || person.down > 0;
  const r = person.radius ?? 10;
  blob(ctx, person.x, person.y, r * 1.05, r * 0.85, dead ? 0.12 : 0.24);

  ctx.save();
  ctx.translate(person.x, person.y);
  ctx.rotate(person.angle + Math.PI / 2);
  if (dead) {
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = options.shirt ?? '#7a6f62';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.15, r * 0.72, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = options.skin ?? '#d9b08c';
    ctx.beginPath();
    ctx.arc(r * 0.75, r * 0.2, r * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Shoulders and torso.
  ctx.fillStyle = options.shirt ?? '#d9705a';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.98, r * 0.74, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(24, 18, 12, 0.32)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Arms: a small swing from the stride, or a raised aim.
  const swing = Math.sin(person.phase ?? 0) * (person.speed > 4 ? 0.5 : 0.12);
  ctx.strokeStyle = options.skin ?? '#d9b08c';
  ctx.lineWidth = r * 0.36;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.62, -r * 0.1);
  ctx.lineTo(-r * 0.72, -r * 0.5 + swing * r * 0.4);
  ctx.moveTo(r * 0.62, -r * 0.1);
  ctx.lineTo(r * 0.72, -r * 0.5 - swing * r * 0.4);
  ctx.stroke();

  // Head, hair, and a cap for the police.
  ctx.fillStyle = options.skin ?? '#d9b08c';
  ctx.beginPath();
  ctx.arc(0, -r * 0.22, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = options.hair ?? '#2b2118';
  ctx.beginPath();
  ctx.arc(0, -r * 0.32, r * 0.46, Math.PI * 0.98, Math.PI * 2.02);
  ctx.fill();

  if (options.cap) {
    ctx.fillStyle = options.cap;
    ctx.beginPath();
    ctx.arc(0, -r * 0.3, r * 0.48, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-r * 0.46, -r * 0.36, r * 0.92, r * 0.16);
    ctx.fillStyle = '#f2d15c';
    ctx.beginPath();
    ctx.arc(0, -r * 0.52, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // A pistol, if the hands are full.
  if (options.gun && options.gun !== 'fists') {
    ctx.fillStyle = '#2a2c30';
    ctx.fillRect(-1.6, -r * 1.15, 3.2, r * 0.62);
    ctx.fillStyle = '#43464c';
    ctx.fillRect(-1.6, -r * 1.15, 3.2, r * 0.2);
  }
  ctx.restore();

  if (person.hurt > 0) {
    ctx.fillStyle = `rgba(200, 40, 40, ${0.35 * person.hurt})`;
    ctx.beginPath();
    ctx.arc(person.x, person.y, r * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A car from above: shadow, shell, cabin, bonnet crease, wheels, lights, and a police livery. */
function paintCar(ctx, car, hour) {
  const light = lightFor(hour);
  const hl = car.spec.length / 2;
  const hw = car.spec.width / 2;
  const corners = carCorners(car);

  blob(ctx, car.x, car.y, hl * 0.95, hw * 1.25, 0.26);

  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  // Wheels first, poking out of the shell.
  ctx.fillStyle = '#1d1e21';
  for (const side of [-1, 1]) {
    for (const along of [-hl * 0.55, hl * 0.55]) {
      ctx.fillRect(along - hl * 0.14, side * hw - 2.6, hl * 0.28, 5.2);
    }
  }

  // Shell.
  const paint = car.wrecked ? '#3b3a37' : car.paint;
  const grad = ctx.createLinearGradient(0, -hw, 0, hw);
  grad.addColorStop(0, paint);
  grad.addColorStop(0.45, paint);
  grad.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = grad;
  roundRect(ctx, -hl, -hw, hl * 2, hw * 2, Math.min(9, hw * 0.7));
  ctx.fill();
  ctx.strokeStyle = 'rgba(16, 14, 12, 0.55)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  if (car.spec.cruiser) {
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-hl * 0.34, -hw, hl * 0.68, hw * 2);
    ctx.fillStyle = '#f0e9d8';
    ctx.fillRect(-hl * 0.92, -hw * 0.42, hl * 0.5, hw * 0.84);
    ctx.fillRect(hl * 0.42, -hw * 0.42, hl * 0.5, hw * 0.84);
  }
  if (car.spec.cab) {
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-hl * 0.14, -hw * 0.92, hl * 0.34, hw * 1.84);
    ctx.fillStyle = '#f4e3a8';
    ctx.fillRect(-hl * 0.72, -4, hl * 0.16, 8);
  }

  // Cabin glass and the windscreen.
  ctx.fillStyle = 'rgba(24, 38, 52, 0.72)';
  roundRect(ctx, -hl * 0.34, -hw * 0.72, hl * 0.62, hw * 1.44, 3.5);
  ctx.fill();
  ctx.fillStyle = 'rgba(150, 200, 220, 0.35)';
  roundRect(ctx, -hl * 0.28, -hw * 0.66, hl * 0.5, hw * 0.5, 3);
  ctx.fill();

  // A crease down the bonnet and boot, so the shell is not a lozenge.
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-hl * 0.86, 0);
  ctx.lineTo(hl * 0.86, 0);
  ctx.stroke();

  // Lights: red at the back, cream at the front; headlight cones after dark.
  ctx.fillStyle = car.wrecked ? '#4a3b32' : '#f6e7bd';
  ctx.fillRect(hl - 3, -hw + 3, 3, 5);
  ctx.fillRect(hl - 3, hw - 8, 3, 5);
  ctx.fillStyle = car.wrecked ? '#4a2b28' : '#b8392f';
  ctx.fillRect(-hl, -hw + 3, 2.5, 5);
  ctx.fillRect(-hl, hw - 8, 2.5, 5);

  if (car.wrecked) {
    ctx.fillStyle = 'rgba(20, 16, 14, 0.5)';
    roundRect(ctx, -hl * 0.5, -hw * 0.7, hl, hw * 1.4, 4);
    ctx.fill();
  }
  ctx.restore();

  // Siren: two lamps swapping colour, with a glow around the roof.
  if (car.siren && !car.wrecked) {
    car.sirenPhase += 0.16;
    const red = Math.sin(car.sirenPhase) > 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(car.x, car.y, 2, car.x, car.y, 62);
    glow.addColorStop(0, red ? 'rgba(236, 64, 64, 0.45)' : 'rgba(75, 123, 255, 0.45)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(car.x, car.y, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = red ? COLORS.sirenB : COLORS.sirenA;
    ctx.beginPath();
    ctx.arc(car.x, car.y, 4.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Headlight cones in the dark, and a red tail pool.
  if (light.lit && !car.wrecked) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    for (const side of [-1, 1]) {
      const ox = car.x + cos * hl * 0.9 - sin * side * hw * 0.62;
      const oy = car.y + sin * hl * 0.9 + cos * side * hw * 0.62;
      const cone = ctx.createRadialGradient(ox, oy, 3, ox, oy, 132);
      cone.addColorStop(0, `rgba(255, 236, 178, ${0.34 * light.night})`);
      cone.addColorStop(1, 'rgba(255, 230, 170, 0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.arc(ox, oy, 132, car.angle - 0.42, car.angle + 0.42);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  void corners;
}

/** Tyre marks, blood pools and wrecks: the layer of scars under everything that moves. */
function paintMarks(ctx, marks) {
  for (const mark of marks) {
    const fade = Math.min(1, mark.life / 3);
    if (mark.kind === 'skid') {
      ctx.strokeStyle = `rgba(24, 22, 20, ${0.4 * fade})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(mark.x, mark.y);
      ctx.lineTo(mark.x2 ?? mark.x, mark.y2 ?? mark.y);
      ctx.stroke();
    } else if (mark.kind === 'blood') {
      ctx.fillStyle = `rgba(96, 22, 22, ${0.42 * fade})`;
      ctx.beginPath();
      ctx.ellipse(mark.x, mark.y, 13, 9, mark.tilt ?? 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (mark.kind === 'wreck') {
      ctx.fillStyle = `rgba(28, 24, 20, ${0.4 * fade})`;
      ctx.beginPath();
      ctx.ellipse(mark.x, mark.y, 22, 15, mark.tilt ?? 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The pulsing ring under a mission door, a pickup, a fare or a job car. */
function paintMarker(ctx, marker, time, colour) {
  const pulse = 0.55 + Math.sin(time * 3.4) * 0.2;
  const radius = marker.radius ?? 30;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(marker.x, marker.y, 4, marker.x, marker.y, radius);
  glow.addColorStop(0, colour.replace('ALPHA', String(0.3 * pulse)));
  glow.addColorStop(1, colour.replace('ALPHA', '0'));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = colour.replace('ALPHA', String(0.8 * pulse));
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, radius * 0.62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = colour.replace('ALPHA', '0.9');
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, 5.5, 0, Math.PI * 2);
  ctx.fill();
}

/** A parcel: a cardboard box with a taped lid and a soft halo. */
function paintPackage(ctx, pack, time) {
  const lift = Math.sin(time * 2.2 + pack.bob) * 2;
  ctx.save();
  ctx.translate(pack.x, pack.y + lift);
  ctx.rotate(Math.sin(time * 1.1 + pack.bob) * 0.12);
  ctx.fillStyle = 'rgba(20, 14, 8, 0.25)';
  ctx.fillRect(-7, -3 + 4, 16, 10);
  ctx.fillStyle = '#c08c4e';
  ctx.fillRect(-8, -7, 16, 14);
  ctx.fillStyle = '#d8a866';
  ctx.fillRect(-8, -7, 16, 4);
  ctx.strokeStyle = 'rgba(88, 58, 26, 0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-8, -7, 16, 14);
  ctx.fillStyle = 'rgba(244, 232, 200, 0.85)';
  ctx.fillRect(-1.6, -7, 3.2, 14);
  ctx.restore();
}

/** A shell casing or a tracer: one thin bright line along the bullet's own heading. */
function paintBullets(ctx, bullets) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = COLORS.tracer;
  ctx.lineWidth = 2;
  for (const bullet of bullets) {
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(bullet.x, bullet.y);
    ctx.lineTo(bullet.x - bullet.vx * 0.012, bullet.y - bullet.vy * 0.012);
    ctx.stroke();
  }
  ctx.restore();
}

/** Muzzle flashes, sparks, blood, smoke, fire, rings: whatever combat.js has queued. */
function paintParticles(ctx, parts) {
  for (const part of parts) {
    const life = Math.max(0, part.life / part.max);
    ctx.save();
    if (part.kind === 'flash') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = life;
      ctx.fillStyle = part.color;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size * (0.6 + (1 - life) * 0.7), 0, Math.PI * 2);
      ctx.fill();
    } else if (part.kind === 'spark' || part.kind === 'fire' || part.kind === 'dot') {
      ctx.globalAlpha = part.fade ? life : 1;
      ctx.fillStyle = part.color;
      ctx.beginPath();
      ctx.arc(part.x, part.y, Math.max(0.6, part.size * (part.fade ? life : 1)), 0, Math.PI * 2);
      ctx.fill();
    } else if (part.kind === 'puff') {
      ctx.globalAlpha = life * 0.6;
      ctx.fillStyle = part.color;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (part.kind === 'ring') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = life * 0.8;
      ctx.strokeStyle = part.color;
      ctx.lineWidth = 3 * life + 1;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** The whole frame: world, then screen furniture. */
export function paintFrame(game) {
  const { ctx, canvas, camera, view, state } = game;
  const hour = state.hour;
  const time = game.clock;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.seaDeep;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // The camera shakes by drawing the world a few pixels off, never by moving the hero.
  const shakeX = camera.shake > 0 ? (Math.random() - 0.5) * camera.shake : 0;
  const shakeY = camera.shake > 0 ? (Math.random() - 0.5) * camera.shake : 0;
  ctx.setTransform(1, 0, 0, 1, -view.x + shakeX, -view.y + shakeY);

  paintCityscape(ctx, view, game.city, hour);
  paintMarks(ctx, game.marks);
  paintNightWash(ctx, view, hour);
  paintLampPools(ctx, view, game.city, hour);
  paintWindowBloom(ctx, view, game.city, hour);

  // Markers under the traffic so they never cover a car.
  if (game.state.screen === 'play' || game.state.screen === 'map') {
    for (const marker of game.activeMarkers()) {
      if (marker.kind === 'package') continue;
      const colour = marker.kind === 'job' ? 'rgba(255, 214, 107, ALPHA)' : marker.kind === 'fare' ? 'rgba(120, 220, 255, ALPHA)' : 'rgba(255, 140, 120, ALPHA)';
      paintMarker(ctx, marker, time, colour);
    }
    const door = game.missions.startMarker();
    if (door) paintMarker(ctx, door, time, 'rgba(255, 214, 107, ALPHA)');
  }
  for (const pack of game.missions.packages) paintPackage(ctx, pack, time);
  for (const pickup of game.missions.state.pickups) {
    if (!pickup.taken) paintMarker(ctx, { x: pickup.x, y: pickup.y, radius: 22 }, time, 'rgba(180, 255, 180, ALPHA)');
  }

  for (const car of game.allCars()) paintCar(ctx, car, hour);

  for (const ped of game.peds) {
    paintPerson(ctx, ped, { shirt: ped.shirt, skin: ped.skin, hair: ped.hair, gun: ped.kind === 'thug' ? ped.gun : null });
  }
  for (const cop of game.police.officers) {
    paintPerson(ctx, cop, { shirt: '#2f4a72', skin: '#e0b48c', hair: '#232830', cap: '#1d2f4d', gun: cop.gun });
  }
  for (const target of game.missions.state.targets) {
    if (target.kind === 'rival') paintPerson(ctx, target, { shirt: '#3f3a44', skin: '#c9a07a', hair: '#181818', gun: target.gun });
  }

  if (!game.player.car) {
    paintPerson(ctx, game.player, { shirt: '#e7dcc6', skin: '#e2b48c', hair: '#2a2118', gun: game.player.gun });
    // A small aim line, so the crosshair has something in the world to agree with.
    if (game.player.gun !== 'fists') {
      ctx.strokeStyle = 'rgba(255, 240, 200, 0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(game.player.x, game.player.y);
      ctx.lineTo(game.player.x + Math.cos(game.player.angle) * 90, game.player.y + Math.sin(game.player.angle) * 90);
      ctx.stroke();
    }
  }

  if (game.combat) {
    paintBullets(ctx, game.combat.bullets);
    paintParticles(ctx, game.combat.parts);
  }

  // Screen-space from here on.
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (game.player.hurtFlash > 0) {
    const hurt = game.player.hurtFlash;
    const wash = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.22, canvas.width / 2, canvas.height / 2, canvas.height * 0.78);
    wash.addColorStop(0, 'rgba(150, 20, 20, 0)');
    wash.addColorStop(1, `rgba(150, 20, 20, ${0.5 * hurt})`);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (state.screen === 'title') {
    paintMenus(ctx, game, 'title');
    return;
  }

  paintHud(ctx, game);
  paintMinimap(ctx, game);
  if (state.screen === 'pause') paintMenus(ctx, game, 'pause');
  if (state.screen === 'map') paintMenus(ctx, game, 'map');

  if (state.fade > 0) {
    ctx.fillStyle = `rgba(6, 8, 12, ${state.fade})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (state.bigText) {
    const life = state.bigText.life;
    ctx.save();
    ctx.globalAlpha = Math.min(1, life * 1.6);
    ctx.textAlign = 'center';
    ctx.font = `700 64px ${FONT}`;
    ctx.fillStyle = state.bigText.title === 'WASTED' ? '#e0574f' : state.bigText.title === 'BUSTED' ? '#8fb6e8' : COLORS.gold;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 18;
    ctx.fillText(state.bigText.title, canvas.width / 2, canvas.height / 2 - 18);
    ctx.font = `500 22px ${FONT}`;
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(state.bigText.sub ?? '', canvas.width / 2, canvas.height / 2 + 26);
    ctx.restore();
  }
  void ROAD;
  void GUNS;
}

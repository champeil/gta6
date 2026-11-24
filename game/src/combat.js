// Bullets, fists and the debris they leave. A shot is a short-lived point that steps forward in
// small increments, so it cannot tunnel through a wall or a body; it asks the game what it hit and
// hands the damage over. Everything visual here is a particle list the renderer walks: muzzle
// flashes, sparks off metal, blood, smoke, blast rings and flying debris.
import { GUNS } from './config.js';
import { clamp, dist } from './util.js';

const MAX_PARTS = 420;

export function createCombat(game) {
  const bullets = [];
  const parts = [];

  function add(part) {
    if (parts.length >= MAX_PARTS) parts.shift();
    parts.push({ life: part.life ?? 0.5, max: part.life ?? 0.5, ...part });
  }

  // --- The particle verbs other modules call.
  const effects = {
    muzzle(x, y, angle) {
      add({ kind: 'flash', x, y, angle: angle ?? 0, life: 0.07, size: 15, color: '#ffe9a8' });
      for (let i = 0; i < 3; i += 1) {
        add({
          kind: 'spark',
          x,
          y,
          vx: Math.cos((angle ?? 0) + (Math.random() - 0.5) * 0.7) * 220,
          vy: Math.sin((angle ?? 0) + (Math.random() - 0.5) * 0.7) * 220,
          life: 0.14,
          size: 1.8,
          color: '#ffd66b',
        });
      }
    },
    spark(x, y, count = 5) {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 90 + Math.random() * 200;
        add({
          kind: 'spark',
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.2 + Math.random() * 0.2,
          size: 1.4 + Math.random() * 1.6,
          color: i % 3 === 0 ? '#fff4cf' : '#ffc766',
        });
      }
    },
    blood(x, y, count = 5) {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * 110;
        add({
          kind: 'dot',
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.5 + Math.random() * 0.4,
          size: 1.6 + Math.random() * 2.2,
          color: '#8e2323',
          fade: true,
        });
      }
    },
    smoke(x, y, dark = false) {
      add({
        kind: 'puff',
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 24,
        vy: -18 - Math.random() * 26,
        life: 0.7 + Math.random() * 0.6,
        size: 9 + Math.random() * 9,
        color: dark ? '#2a2a28' : '#6f6f6a',
        fade: true,
      });
    },
    boom(x, y) {
      add({ kind: 'ring', x, y, life: 0.5, size: 10, grow: 130, color: '#ffd08a' });
      for (let i = 0; i < 16; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 260;
        add({
          kind: 'fire',
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.3 + Math.random() * 0.45,
          size: 4 + Math.random() * 7,
          color: i % 2 ? '#ffb15a' : '#ff7a3c',
          fade: true,
        });
      }
      for (let i = 0; i < 8; i += 1) {
        add({
          kind: 'puff',
          x,
          y,
          vx: (Math.random() - 0.5) * 80,
          vy: (Math.random() - 0.5) * 80,
          life: 0.9 + Math.random() * 0.7,
          size: 14 + Math.random() * 14,
          color: '#3a3733',
          fade: true,
        });
      }
      game.shake(7);
    },
  };

  /** A bullet leaving (x, y). `owner` is 'player', 'police' or 'thug'. */
  function shoot({ x, y, angle, damage, speed, range, owner = 'player', from = null }) {
    bullets.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage,
      owner,
      from,
      travelled: 0,
      range,
      angle,
      alive: true,
    });
    effects.muzzle(x, y, angle);
  }

  /** The hero pulls a trigger. A shotgun fans its pellets; fists swing instead. */
  function playerShoot(player, kind, angle) {
    const gun = GUNS[kind] ?? GUNS.pistol;
    if (kind === 'fists') {
      melee(player, angle, gun);
      return;
    }
    for (let i = 0; i < (gun.pellets || 1); i += 1) {
      const spread = (Math.random() - 0.5) * gun.spread;
      shoot({
        x: player.x + Math.cos(angle) * 15,
        y: player.y + Math.sin(angle) * 15,
        angle: angle + spread,
        damage: gun.damage,
        speed: gun.speed,
        range: gun.range,
        owner: 'player',
        from: player,
      });
    }
    game.shake(kind === 'shotgun' ? 3 : 1.2);
  }

  /** A fist: hit the nearest body inside the reach and the arc. */
  function melee(player, angle, gun) {
    let best = null;
    let bestGap = gun.range + 12;
    for (const body of game.bodiesNear(player.x, player.y, gun.range + 12)) {
      if (body === player) continue;
      if (body.health !== undefined && body.health <= 0) continue;
      const gap = dist(player.x, player.y, body.x, body.y);
      if (gap > bestGap) continue;
      const bearing = Math.atan2(body.y - player.y, body.x - player.x);
      const off = Math.abs(((bearing - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (off > 0.9) continue;
      bestGap = gap;
      best = body;
    }
    if (best) {
      game.damageBody(best, gun.damage, { shooter: 'player' });
      game.audio.sfx.punch();
      effects.spark(best.x, best.y, 3);
    }
  }

  /** A car or a barrel going up: everything round it takes a knock. */
  function blast(x, y, radius, damage) {
    effects.boom(x, y);
    game.audio.sfx.boom();
    for (const body of game.bodiesNear(x, y, radius)) {
      const gap = dist(body.x, body.y, x, y);
      if (gap > radius) continue;
      const falloff = 1 - gap / radius;
      game.damageBody(body, damage * falloff, { shooter: 'player' });
    }
    for (const car of game.allCars()) {
      const gap = dist(car.x, car.y, x, y);
      if (gap > radius * 1.5) continue;
      game.damageCar(car, damage * (1 - gap / (radius * 1.5)) * 1.4, false);
    }
  }

  /** Step every bullet; step and age every particle. */
  function update(dt) {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const bullet = bullets[i];
      const travel = Math.hypot(bullet.vx, bullet.vy) * dt;
      const steps = Math.max(1, Math.ceil(travel / 9));
      let dead = false;
      for (let s = 0; s < steps && !dead; s += 1) {
        bullet.x += (bullet.vx * dt) / steps;
        bullet.y += (bullet.vy * dt) / steps;
        bullet.travelled += travel / steps;

        if (game.hitsWall(bullet.x, bullet.y)) {
          effects.spark(bullet.x, bullet.y, 3);
          dead = true;
          break;
        }
        const car = game.carAt(bullet.x, bullet.y, 4);
        if (car && car !== bullet.from) {
          game.damageCar(car, bullet.damage, bullet.owner === 'player');
          effects.spark(bullet.x, bullet.y, 4);
          dead = true;
          break;
        }
        const body = game.bodyAt(bullet.x, bullet.y, bullet.owner, bullet.from);
        if (body) {
          game.damageBody(body, bullet.damage, { shooter: bullet.owner, from: bullet.from });
          dead = true;
          break;
        }
        if (bullet.travelled > bullet.range) dead = true;
      }
      if (dead) bullets.splice(i, 1);
    }

    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const part = parts[i];
      part.life -= dt;
      if (part.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      if (part.vx) part.x += part.vx * dt;
      if (part.vy) part.y += part.vy * dt;
      if (part.kind === 'spark' || part.kind === 'fire') {
        part.vx *= 1 - 3.4 * dt;
        part.vy *= 1 - 3.4 * dt;
      }
      if (part.kind === 'puff') {
        part.vx *= 1 - 0.9 * dt;
        part.vy *= 1 - 0.9 * dt;
        part.size += 16 * dt;
      }
      if (part.kind === 'ring') part.size += (part.grow ?? 100) * dt;
      if (part.kind === 'dot' && part.vx) {
        part.vx *= 1 - 6 * dt;
        part.vy *= 1 - 6 * dt;
      }
    }
  }

  function clear() {
    bullets.length = 0;
    parts.length = 0;
  }

  /** How many live rounds are in the air: the HUD uses it for a small "in combat" tell. */
  function liveBullets() {
    return bullets.length;
  }

  return {
    bullets,
    parts,
    effects,
    // Pass-through verbs, so a caller holding the combat module (cars, police, rivals) can ask for
    // a spark or a puff without also holding effects.
    spark: effects.spark,
    smoke: effects.smoke,
    boom: effects.boom,
    blood: effects.blood,
    muzzle: effects.muzzle,
    shoot,
    playerShoot,
    melee,
    blast,
    update,
    clear,
    liveBullets,
    clamp,
  };
}

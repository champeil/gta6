// Everyone on foot who is not Nico or a cop: the people going about their day, and the crews who
// work for the people Nico is about to upset. One actor record covers both; the `kind` decides which
// brain runs. Pedestrians stroll the pavements, step aside, and scatter at the first shot. Crews hold
// a spot, close on a target and fire. Both bleed, both fall, and both are painted by render.js.
import { GUNS } from './config.js';
import { clamp, dist, rand, randInt, pick, seeded, angleDelta, eject } from './util.js';

const SHIRTS = ['#d9705a', '#4f7fa8', '#e5c46a', '#7fae7a', '#b5799e', '#5e6b78', '#e8e0cf', '#c98a4e', '#6f8fb5'];
const SKINS = ['#f0c9a0', '#dfae82', '#b9825a', '#8d5a3b', '#6a4128', '#efd3b4'];
const HAIRS = ['#2b2118', '#4a3320', '#8a5a2b', '#1c1c20', '#6f6a63', '#c9a56a'];

let actorSerial = 0;

/**
 * A person. `kind` is 'ped' or 'thug'; `gun` is a key into GUNS or 'fists'. The brain fields are
 * `state` and `goal`; `home` is where a pedestrian wanders around and where a thug was posted.
 */
export function createActor(kind, x, y, options = {}) {
  const random = options.random ?? seeded(actorSerial * 7919 + 13);
  const id = (actorSerial += 1);
  const health = options.health ?? (kind === 'thug' ? 80 : 46);
  return {
    id,
    kind,
    x,
    y,
    radius: 10,
    angle: rand(random, -Math.PI, Math.PI),
    health,
    maxHealth: health,
    speed: 0,
    state: kind === 'thug' ? 'guard' : 'walk',
    goal: null,
    home: { x, y },
    gun: options.gun ?? (kind === 'thug' ? 'pistol' : 'fists'),
    cooldown: 0,
    burst: 0,
    panic: 0,
    hurt: 0,
    phase: rand(random, 0, 6.28),
    dead: false,
    deadAt: 0,
    lastHitBy: null,
    shirt: options.shirt ?? pick(random, SHIRTS),
    skin: options.skin ?? pick(random, SKINS),
    hair: options.hair ?? pick(random, HAIRS),
    stride: rand(random, 0.85, 1.2),
    held: options.held ?? null,
    aggro: options.aggro ?? 320,
    aimAt: null,
  };
}

/** A crowd: so many people spread over pavements near the hero, so many in each quarter. */
export function spawnCrowd(city, count, random, around) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    let x = 0;
    let y = 0;
    let placed = false;
    for (let tries = 0; tries < 40; tries += 1) {
      if (around && i % 3 !== 2) {
        x = around.x + rand(random, -760, 760);
        y = around.y + rand(random, -760, 760);
      } else {
        const point = city.roadPoint(0, 0, 0);
        x = point.x + rand(random, -70, 70);
        y = point.y + rand(random, -70, 70);
      }
      if (city.isClear(x, y, 11) && city.isPavement(x, y)) {
        placed = true;
        break;
      }
    }
    if (!placed) continue;
    const actor = createActor('ped', x, y, { random });
    actor.goal = wanderGoal(city, actor, random);
    out.push(actor);
  }
  return out;
}

/** A street crew: `count` armed people around a post, all facing roughly the same way. */
export function spawnCrew(city, post, count, random, gun = 'pistol') {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    let x = post.x;
    let y = post.y;
    for (let tries = 0; tries < 30; tries += 1) {
      const tx = post.x + rand(random, -74, 74);
      const ty = post.y + rand(random, -74, 74);
      if (city.isClear(tx, ty, 11)) {
        x = tx;
        y = ty;
        break;
      }
    }
    const actor = createActor('thug', x, y, { random, gun, aggro: 400 });
    actor.home = { x: post.x, y: post.y };
    actor.angle = rand(random, -Math.PI, Math.PI);
    out.push(actor);
  }
  return out;
}

/** Somewhere to walk to: a pavement point a short way off, biased along the street. */
function wanderGoal(city, actor, random) {
  for (let tries = 0; tries < 14; tries += 1) {
    const angle = rand(random, -Math.PI, Math.PI);
    const reach = rand(random, 90, 300);
    const x = actor.x + Math.cos(angle) * reach;
    const y = actor.y + Math.sin(angle) * reach;
    if (city.isClear(x, y, 10) && city.isPavement(x, y)) return { x, y };
  }
  return { x: actor.x + rand(random, -60, 60), y: actor.y + rand(random, -60, 60) };
}

/** Walk `actor` toward a point, turning to face the way it goes. Returns true on arrival. */
function stepToward(actor, goal, pace, dt, city) {
  const dx = goal.x - actor.x;
  const dy = goal.y - actor.y;
  const gap = Math.hypot(dx, dy);
  if (gap < 6) return true;
  const wanted = Math.atan2(dy, dx);
  const turn = angleDelta(actor.angle, wanted);
  actor.angle += clamp(turn, -9 * dt, 9 * dt);
  const speed = pace * clamp(1 - Math.abs(turn) / 2.4, 0.2, 1);
  actor.x += (dx / gap) * speed * dt;
  actor.y += (dy / gap) * speed * dt;
  actor.speed = speed;
  actor.phase += dt * (4.6 + speed * 0.022) * actor.stride;
  if (city) {
    for (const solid of city.solidsAround(actor.x, actor.y, actor.radius)) eject(actor, solid);
  }
  return false;
}

/** Everyone runs from a point for a while: the crowd's answer to a gunshot or a burning car. */
export function panicCrowd(actors, x, y, radius, now) {
  for (const actor of actors) {
    if (actor.kind !== 'ped' || actor.dead) continue;
    if (dist(actor.x, actor.y, x, y) > radius) continue;
    actor.state = 'flee';
    actor.panic = 5.5;
    actor.fleeFrom = { x, y };
    actor.goal = null;
  }
}

/**
 * One actor's tick. `ctx` carries { city, player, actors, effects, cars, now, hurt, shoot }. The
 * `hurt` callback is how a bullet or a fist reaches the hero; `shoot` spawns a bullet.
 */
export function updateActor(actor, dt, ctx) {
  const { city, player, now } = ctx;
  actor.cooldown = Math.max(0, actor.cooldown - dt);
  actor.hurt = Math.max(0, actor.hurt - dt * 2.6);

  if (actor.dead) {
    actor.speed = 0;
    return;
  }

  if (actor.kind === 'ped') updatePed(actor, dt, ctx);
  else updateThug(actor, dt, ctx);

  if (city) {
    for (const solid of city.solidsAround(actor.x, actor.y, actor.radius)) eject(actor, solid);
    actor.x = clamp(actor.x, 10, city.size - 10);
    actor.y = clamp(actor.y, 10, city.size - 10);
  }
  if (actor.panic > 0) actor.panic = Math.max(0, actor.panic - dt);
  void player;
  void now;
}

function updatePed(actor, dt, ctx) {
  const { city, random } = ctx;
  if (actor.state === 'flee' && actor.panic > 0 && actor.fleeFrom) {
    const away = Math.atan2(actor.y - actor.fleeFrom.y, actor.x - actor.fleeFrom.x);
    const goal = {
      x: actor.x + Math.cos(away + Math.sin(actor.phase * 0.7) * 0.4) * 90,
      y: actor.y + Math.sin(away + Math.sin(actor.phase * 0.7) * 0.4) * 90,
    };
    if (!city || city.isClear(goal.x, goal.y, 10)) stepToward(actor, goal, 176, dt, city);
    else {
      actor.angle += dt * 3;
      stepToward(actor, { x: actor.x + Math.cos(actor.angle) * 40, y: actor.y + Math.sin(actor.angle) * 40 }, 150, dt, city);
    }
    if (actor.panic <= 0) {
      actor.state = 'walk';
      actor.goal = city ? wanderGoal(city, actor, random ?? seeded(actor.id)) : null;
    }
    return;
  }

  if (!actor.goal) {
    actor.goal = city ? wanderGoal(city, actor, random ?? seeded(actor.id + Math.floor(ctx.now ?? 0))) : null;
    if (!actor.goal) return;
  }
  const arrived = stepToward(actor, actor.goal, 62 * actor.stride, dt, city);
  // A short pause at each corner reads as waiting for the lights.
  if (arrived) {
    actor.goal = null;
    actor.speed = 0;
  }
}

function updateThug(actor, dt, ctx) {
  const { player, city, effects, now } = ctx;
  if (!player || player.dead) return;
  const gap = dist(actor.x, actor.y, player.x, player.y);
  if (gap > actor.aggro + 200 && actor.state !== 'chase') {
    // Back to the post, watching the street.
    if (dist(actor.x, actor.y, actor.home.x, actor.home.y) > 34) {
      stepToward(actor, actor.home, 74, dt, city);
    } else {
      actor.angle += Math.sin((now ?? 0) * 0.6 + actor.phase) * dt * 0.7;
      actor.speed = 0;
    }
    return;
  }

  const wanted = Math.atan2(player.y - actor.y, player.x - actor.x);
  const turn = angleDelta(actor.angle, wanted);
  actor.angle += clamp(turn, -7 * dt, 7 * dt);
  actor.aimAt = { x: player.x, y: player.y };

  const gun = GUNS[actor.gun] ?? GUNS.pistol;
  const preferred = gun.range * 0.55;
  if (gap > preferred * 1.15) {
    // Close the distance, but not in a straight suicidal line: sidestep a little.
    const side = Math.sin((now ?? 0) * 0.9 + actor.phase) * 0.55;
    const goal = {
      x: player.x + Math.cos(wanted + Math.PI + side) * preferred,
      y: player.y + Math.sin(wanted + Math.PI + side) * preferred,
    };
    stepToward(actor, goal, 122, dt, city);
  } else if (gap < preferred * 0.5) {
    stepToward(actor, { x: actor.x - Math.cos(wanted) * 50, y: actor.y - Math.sin(wanted) * 50 }, 92, dt, city);
  } else {
    actor.speed = 0;
    actor.phase += dt * 2;
  }

  const lined = Math.abs(turn) < 0.3;
  if (lined && gap < gun.range && actor.cooldown <= 0) {
    actor.cooldown = gun.cooldown * (actor.gun === 'smg' ? 3.2 : 1.9);
    actor.burst = actor.gun === 'smg' ? 4 : 1;
    const spread = (ctx.random ?? seeded(actor.id))() - 0.5;
    if (ctx.shoot) {
      ctx.shoot({
        x: actor.x + Math.cos(actor.angle) * 16,
        y: actor.y + Math.sin(actor.angle) * 16,
        angle: actor.angle + spread * 0.24,
        damage: gun.damage * 0.62,
        speed: gun.speed,
        range: gun.range,
        from: actor,
        friendly: false,
      });
    }
    if (effects) effects.muzzle(actor.x + Math.cos(actor.angle) * 18, actor.y + Math.sin(actor.angle) * 18);
  }
}

/** A bullet, a fist or a car reaches an actor. Returns true if this was the killing blow. */
export function hurtActor(actor, amount, from, now, effects) {
  if (actor.dead) return false;
  actor.health -= amount;
  actor.hurt = 1;
  actor.lastHitBy = from ?? null;
  if (actor.kind === 'ped') {
    actor.state = 'flee';
    actor.panic = 6;
    actor.fleeFrom = from && typeof from.x === 'number' ? { x: from.x, y: from.y } : { x: actor.x + 1, y: actor.y };
  } else {
    actor.state = 'chase';
  }
  if (actor.health <= 0) {
    actor.health = 0;
    actor.dead = true;
    actor.deadAt = now ?? 0;
    if (effects) effects.blood(actor.x, actor.y, 8);
    return true;
  }
  if (effects) effects.blood(actor.x, actor.y, 4);
  return false;
}

/** Does a bullet at (x, y) with radius r hit this actor? */
export function actorHit(actor, x, y, r) {
  if (actor.dead) return false;
  const reach = actor.radius + r;
  return (actor.x - x) ** 2 + (actor.y - y) ** 2 < reach * reach;
}

/** Drop the dead after they have lain a while, so the streets do not fill with bodies. */
export function clearBodies(actors, now, linger = 26) {
  for (let i = actors.length - 1; i >= 0; i -= 1) {
    const actor = actors[i];
    if (actor.dead && now - actor.deadAt > linger) actors.splice(i, 1);
  }
}

/** Nearest living actor to a point, within reach: who a punch lands on. */
export function nearestActor(actors, x, y, reach) {
  let best = null;
  let bestGap = reach;
  for (const actor of actors) {
    if (actor.dead) continue;
    const gap = dist(actor.x, actor.y, x, y);
    if (gap < bestGap) {
      bestGap = gap;
      best = actor;
    }
  }
  return best;
}

/** Everyone still standing within a radius: how a mission counts a crew down. */
export function livingIn(actors, x, y, radius) {
  let count = 0;
  for (const actor of actors) {
    if (actor.dead) continue;
    if (dist(actor.x, actor.y, x, y) <= radius) count += 1;
  }
  return count;
}

export { randInt };

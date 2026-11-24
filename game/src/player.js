// Nico Vela on foot: walking, running, aiming, the gun in his hand, health and armour, and the
// small matter of getting in and out of cars. This module moves a body and answers questions about
// it; it does not draw him (render.js does) and does not decide what he should be doing (game.js and
// missions.js do).
import { ON_FOOT, GUNS } from './config.js';
import { clamp, eject, dist, angleDelta, steerAngle } from './util.js';

export function createPlayer(x, y) {
  return {
    x,
    y,
    radius: ON_FOOT.radius,
    angle: -Math.PI / 2,
    health: ON_FOOT.health,
    maxHealth: ON_FOOT.health,
    armour: 0,
    speed: 0,
    moving: false,
    running: false,
    gun: 'fists',
    ammo: { pistol: 0, smg: 0, shotgun: 0 },
    cooldown: 0,
    meleeSwing: 0,
    car: null,
    seatAt: 0,
    dead: false,
    arrested: false,
    respawnAt: 0,
    hurtFlash: 0,
    hitAt: 0,
    lastDamageFrom: null,
    stepPhase: 0,
    recoil: 0,
  };
}

/** Is the hero holding something that fires bullets? */
export function armed(player) {
  return player.gun !== 'fists' && (player.ammo[player.gun] ?? 0) > 0;
}

/** Put a gun in his hands, with ammo. Called by pickups and by the job scripts. */
export function giveGun(player, kind, rounds) {
  if (!GUNS[kind] || kind === 'fists') return;
  player.gun = kind;
  player.ammo[kind] = Math.min(240, (player.ammo[kind] ?? 0) + rounds);
}

/**
 * Move the hero. `controls` is { moveX, moveY, run, aimX, aimY, fire, enter } — already normalised
 * by input.js. Returns the events the caller should react to: a shot fired, a punch thrown, a door
 * opened, a step taken.
 */
export function updatePlayer(player, controls, dt, ctx) {
  const events = { shot: null, punch: null, enter: false, footstep: false };
  player.cooldown = Math.max(0, player.cooldown - dt);
  player.meleeSwing = Math.max(0, player.meleeSwing - dt * 4);
  player.hurtFlash = Math.max(0, player.hurtFlash - dt * 2.4);
  player.recoil = Math.max(0, player.recoil - dt * 6);

  if (player.dead || player.arrested) {
    player.moving = false;
    player.speed = 0;
    return events;
  }

  const dx = controls.moveX;
  const dy = controls.moveY;
  const mag = Math.hypot(dx, dy);
  const wantsRun = !!controls.run && !controls.aim;
  const pace = wantsRun ? ON_FOOT.run : ON_FOOT.walk;

  if (mag > 0.08) {
    const nx = dx / mag;
    const ny = dy / mag;
    player.x += nx * pace * dt;
    player.y += ny * pace * dt;
    player.speed = pace;
    player.moving = true;
    player.running = wantsRun;
    player.stepPhase += dt * (wantsRun ? 13 : 8);
    if (player.stepPhase > 3.2) {
      player.stepPhase -= 3.2;
      events.footstep = wantsRun;
    }
    if (!controls.aim) player.angle = Math.atan2(ny, nx);
  } else {
    player.moving = false;
    player.running = false;
    player.speed = 0;
  }

  if (controls.aim) {
    const aim = Math.atan2(controls.aimY - player.y, controls.aimX - player.x);
    player.angle = steerAngle(player.angle, aim, 14 * dt);
  }

  if (ctx.city) {
    for (const solid of ctx.city.solidsAround(player.x, player.y, player.radius)) eject(player, solid);
    player.x = clamp(player.x, 8, ctx.city.size - 8);
    player.y = clamp(player.y, 8, ctx.city.size - 8);
  }

  if (controls.fire && player.cooldown <= 0) {
    if (armed(player)) {
      const gun = GUNS[player.gun];
      player.ammo[player.gun] -= 1;
      player.cooldown = gun.cooldown;
      player.recoil = 1;
      events.shot = { kind: player.gun, angle: player.angle, x: player.x, y: player.y, gun };
      if (player.ammo[player.gun] <= 0 && !hasAnyAmmo(player)) player.gun = 'fists';
    } else {
      player.cooldown = ON_FOOT.punchCooldown;
      player.meleeSwing = 1;
      events.punch = { angle: player.angle, reach: ON_FOOT.punchReach, damage: ON_FOOT.punchDamage };
    }
  }

  if (controls.enter) events.enter = true;
  return events;
}

export function hasAnyAmmo(player) {
  return Object.values(player.ammo).some((n) => n > 0);
}

/**
 * Damage. Armour eats the first half; a body at zero is down and the caller decides what happens
 * next (clinic, arrest, mission fail). Returns true when the hero has just gone down.
 */
export function hurtPlayer(player, amount, from, now) {
  if (player.dead) return false;
  const plate = Math.min(player.armour, amount * 0.55);
  player.armour -= plate;
  player.health -= amount - plate;
  player.hurtFlash = 1;
  player.hitAt = now;
  player.lastDamageFrom = from ?? null;
  if (player.health <= 0) {
    player.health = 0;
    player.dead = true;
    player.car = null;
    return true;
  }
  return false;
}

export function healPlayer(player, amount) {
  player.health = clamp(player.health + amount, 0, player.maxHealth);
}

export function revivePlayer(player, x, y) {
  player.x = x;
  player.y = y;
  player.health = player.maxHealth;
  player.armour = 0;
  player.dead = false;
  player.arrested = false;
  player.car = null;
  player.speed = 0;
  player.gun = 'fists';
  player.ammo = { pistol: 0, smg: 0, shotgun: 0 };
  player.hurtFlash = 0;
}

/** A car door: find the nearest shell within reach whose door the hero could open. */
export function carWithin(player, cars, reach = 34) {
  let best = null;
  let bestGap = reach + 60;
  for (const car of cars) {
    if (car.wrecked) continue;
    const gap = dist(car.x, car.y, player.x, player.y);
    if (gap < car.spec.length * 0.5 + reach && gap < bestGap) {
      bestGap = gap;
      best = car;
    }
  }
  return best;
}

/** Put the hero behind the wheel. */
export function enterCar(player, car, now) {
  player.car = car;
  player.seatAt = now;
  car.driver = 'player';
  car.role = 'player';
  car.ai = null;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
}

/** Step out, on the driver's side, into a clear spot if there is one. */
export function exitCar(player, car, city, now) {
  const side = car.angle + Math.PI / 2;
  const reach = car.spec.width * 0.5 + 16;
  const tries = [side, side + Math.PI, car.angle + Math.PI, car.angle];
  let x = car.x + Math.cos(side) * reach;
  let y = car.y + Math.sin(side) * reach;
  for (const angle of tries) {
    const tx = car.x + Math.cos(angle) * reach;
    const ty = car.y + Math.sin(angle) * reach;
    if (!city || city.isClear(tx, ty, ON_FOOT.radius)) {
      x = tx;
      y = ty;
      break;
    }
  }
  player.x = x;
  player.y = y;
  player.car = null;
  car.driver = null;
  if (car.role === 'player') car.role = 'parked';
  player.angle = car.angle;
  player.seatAt = now;
}

/** The angle from the hero to a point, for aiming at whatever the mouse is over. */
export function aimAngle(player, x, y) {
  return Math.atan2(y - player.y, x - player.x);
}

/** How far the hero is from a point, for marker and objective tests. */
export function distanceTo(player, x, y) {
  return dist(player.x, player.y, x, y);
}

export function facingDelta(player, x, y) {
  return Math.abs(angleDelta(player.angle, Math.atan2(y - player.y, x - player.x)));
}

// Cars: the shells, the handling, the shoving and the damage. A car is a rounded box with a heading,
// a signed speed and a little sideways slide; it is driven either by the hero (controls arrive from
// input), by a civilian (traffic.js picks a lane) or by an officer (police.js picks a quarry). This
// module owns the physics, the wall and car-to-car collisions, the health and the wreck, and the
// shared steering helper every AI uses. It paints nothing.
import { CAR_CLASSES, COLORS } from './config.js';
import { clamp, dist, steerAngle, angleDelta } from './util.js';

/** Body paints, drawn from in order so a street never looks like a fleet. */
const PAINTS = ['#c9553f', '#e0b352', '#3f7fa8', '#e8e2d4', '#4b5a68', '#7fa86a', '#b56b8f', '#d98a4a', '#2f3b4a'];

let carSerial = 0;

export function specOf(kind) {
  return CAR_CLASSES[kind] ?? CAR_CLASSES.sedan;
}

/**
 * A car. `paint` may be given; otherwise one is picked from the palette by the serial, which keeps
 * the stills stable without a random source. Police cars always come in the livery colours.
 */
export function createCar(kind, x, y, angle, options = {}) {
  const spec = specOf(kind);
  const serial = (carSerial += 1);
  const health = options.health ?? spec.toughness;
  return {
    id: serial,
    kind,
    spec,
    x,
    y,
    angle,
    speed: 0,
    steer: 0,
    health,
    maxHealth: health,
    paint: options.paint ?? (spec.cruiser ? '#e8e9ea' : PAINTS[serial % PAINTS.length]),
    driver: null,
    role: options.role ?? 'parked',
    ai: null,
    siren: !!spec.cruiser,
    sirenPhase: serial * 0.7,
    wrecked: false,
    fire: 0,
    stuck: 0,
    lastHitBy: null,
    enteredAt: 0,
    honk: 0,
  };
}

/** The three circles that stand in for the shell when it hits a wall or another car. */
export function carCircles(car) {
  const halfLength = car.spec.length / 2;
  const r = car.spec.width * 0.62;
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  const out = [];
  for (const along of [-halfLength * 0.56, 0, halfLength * 0.56]) {
    out.push({ x: car.x + cos * along, y: car.y + sin * along, radius: r });
  }
  return out;
}

/** The four corners, for painting the shell and for a cheap point-in-car test. */
export function carCorners(car) {
  const hl = car.spec.length / 2;
  const hw = car.spec.width / 2;
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  const out = [];
  for (const [lx, ly] of [
    [hl, hw],
    [hl, -hw],
    [-hl, -hw],
    [-hl, hw],
  ]) {
    out.push({ x: car.x + cos * lx - sin * ly, y: car.y + sin * lx + cos * ly });
  }
  return out;
}

/**
 * Steering for an AI: how far off the target, which side, and how hard to brake for the corner.
 * Returns a control block { throttle, brake, steer } that `drive` accepts, same as the hero's.
 */
export function steerTo(car, tx, ty, options = {}) {
  const gap = dist(car.x, car.y, tx, ty);
  const wanted = Math.atan2(ty - car.y, tx - car.x);
  const error = angleDelta(car.angle, wanted);
  const slow = options.slow ?? 0.55;
  const creep = options.creep ?? 26;
  let throttle = 1;
  let brake = 0;
  if (gap < creep) {
    throttle = 0;
    brake = 0.6;
  } else if (Math.abs(error) > 0.9) {
    throttle = 0.28;
    brake = 0;
  } else if (Math.abs(error) > 0.42) {
    throttle = 0.62;
  }
  if (options.brakeFor && gap < options.brakeFor) brake = clamp(1 - gap / options.brakeFor, 0, 1);
  if (options.urgent) throttle = Math.max(throttle, 0.9);
  return {
    throttle,
    brake,
    steer: clamp(-error * 2.1, -1, 1),
    gap,
    error,
    speedScale: slow,
  };
}

/** Turn a control block into motion: throttle, brake, reverse, handbrake-free arcade handling. */
export function drive(car, controls, dt, city, cars, effects) {
  const spec = car.spec;
  if (car.wrecked) {
    car.speed *= 1 - 2.2 * dt;
  } else {
    const throttle = clamp(controls.throttle ?? 0, 0, 1);
    const brake = clamp(controls.brake ?? 0, 0, 1);
    const steer = clamp(controls.steer ?? 0, -1, 1);

    if (throttle > 0) {
      const headroom = 1 - Math.max(0, car.speed) / spec.top;
      car.speed += spec.accel * throttle * Math.max(0.08, headroom) * dt;
    }
    if (brake > 0) {
      if (car.speed > 4) car.speed -= spec.accel * 1.5 * brake * dt;
      else car.speed -= spec.accel * 0.62 * brake * dt;
    }
    if (throttle === 0 && brake === 0) car.speed *= 1 - 1.05 * dt;

    // A reversing car steers the other way, as it should.
    const authority = clamp(Math.abs(car.speed) / 46, 0, 1) * (1 - Math.abs(car.speed) / (spec.top * 2.6));
    car.steer += (steer - car.steer) * clamp(dt * 8.5, 0, 1);
    car.angle += car.steer * spec.turn * authority * dt * Math.sign(car.speed || 1);

    car.speed = clamp(car.speed, -spec.reverse, spec.top);
    if (car.speed < 0 && car.speed > -2 && brake === 0) car.speed = 0;
  }

  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  car.x += cos * car.speed * dt;
  car.y += sin * car.speed * dt;

  // The body's own forward motion, plus a little slip the grip value allows: this is what makes a
  // sports car feel loose on a corner and a van feel planted.
  const slip = (1 - spec.grip) * 0.06 * car.speed * car.steer;
  car.x += -sin * slip * dt;
  car.y += cos * slip * dt;

  if (city) collideWalls(car, city, effects);
  if (cars) collideCars(car, cars, effects);
  if (car.fire > 0) {
    car.fire -= dt;
    if (effects) effects.smoke(car.x, car.y, true);
  }
}

/** Push the shell out of any building it has entered, and take a knock for the speed lost. */
export function collideWalls(car, city, effects) {
  let hit = false;
  for (const circle of carCircles(car)) {
    for (const solid of city.solidsAround(circle.x, circle.y, circle.radius)) {
      const nearX = clamp(circle.x, solid.x, solid.x + solid.w);
      const nearY = clamp(circle.y, solid.y, solid.y + solid.h);
      const dx = circle.x - nearX;
      const dy = circle.y - nearY;
      const d2 = dx * dx + dy * dy;
      if (d2 > circle.radius * circle.radius) continue;
      const d = Math.sqrt(d2) || 0.001;
      const push = circle.radius - d;
      const nx = dx / d;
      const ny = dy / d;
      car.x += nx * push;
      car.y += ny * push;
      hit = true;
    }
  }
  if (hit) {
    const impact = Math.abs(car.speed);
    if (impact > 30) {
      damageCar(car, impact * 0.1, effects);
      if (effects) effects.spark(car.x + Math.cos(car.angle) * 18, car.y + Math.sin(car.angle) * 18, 4);
    }
    car.speed *= -0.16;
  }
}

/** Circle-on-circle between cars, weighted by mass, with the paint traded for a little speed. */
export function collideCars(car, cars, effects) {
  const mine = carCircles(car);
  for (const other of cars) {
    if (other === car) continue;
    if (Math.abs(other.x - car.x) > 90 || Math.abs(other.y - car.y) > 90) continue;
    const theirs = carCircles(other);
    for (const a of mine) {
      for (const b of theirs) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        const reach = a.radius + b.radius;
        if (d2 > reach * reach || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const push = (reach - d) * 0.5;
        const myMass = car.spec.mass;
        const theirMass = other.spec.mass;
        const total = myMass + theirMass;
        car.x += nx * push * (theirMass / total) * 1.4;
        car.y += ny * push * (theirMass / total) * 1.4;
        other.x -= nx * push * (myMass / total) * 1.4;
        other.y -= ny * push * (myMass / total) * 1.4;
        const closing = Math.abs(car.speed - other.speed);
        if (closing > 60) {
          damageCar(car, closing * 0.05, effects);
          damageCar(other, closing * 0.05, effects);
          if (effects) effects.spark((a.x + b.x) / 2, (a.y + b.y) / 2, 5);
        }
        car.speed *= 0.86;
        other.speed *= 0.9;
      }
    }
  }
}

export function damageCar(car, amount, effects) {
  if (car.wrecked) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.wrecked = true;
    car.fire = 3.2;
    car.siren = false;
    if (effects) effects.boom(car.x, car.y);
  }
}

/** The driver's door: you must be alongside the shell and slow on your feet to get in. */
export function doorOpen(car, x, y, reach = 40) {
  if (car.wrecked) return false;
  return dist(car.x, car.y, x, y) < car.spec.length * 0.5 + reach;
}

/** Parked cars along the kerb: a lane offset to the right, facing the way traffic would flow. */
export function kerbPose(city, x, y) {
  const street = city.nearestStreet(x, y);
  if (street.runs === 'x') {
    return { x: street.line + (street.line % 2 === 0 ? 0 : 0), y, angle: 0 };
  }
  return { x, y: street.line, angle: Math.PI / 2 };
}

export function carColor(car) {
  return car.wrecked ? COLORS.smoke : car.paint;
}

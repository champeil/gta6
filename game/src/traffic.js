// Civilian traffic and the cars left at the kerb. A traffic car holds a street, a direction and a
// lane; every frame it steers for a point ahead, turns at junctions now and then, brakes for the
// hero and for whatever is directly in front, and takes a knock if it misjudges. Parked cars are
// created once along kerbs and only get up if somebody steals them.
import { PARKED_MIX, ROAD, TRAFFIC_MIX } from './config.js';
import { createCar, drive, steerTo, specOf } from './vehicles.js';
import { clamp, dist, pickWeighted, rand, randInt } from './util.js';

/** Where a car sits in its lane: right-hand traffic, so the offset flips with the direction. */
function lanePose(axis, line, dir, along) {
  if (axis === 'x') {
    return { x: along, y: line + ROAD.lane * dir, angle: dir > 0 ? 0 : Math.PI };
  }
  return { x: line - ROAD.lane * dir, y: along, angle: dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
}

function laneAlong(axis, x, y) {
  return axis === 'x' ? x : y;
}

export function createTraffic(city, random, options = {}) {
  const count = options.count ?? 16;
  const parkedCount = options.parked ?? 46;
  const cars = [];
  const parked = [];

  function routeFor(axis, line, dir, along) {
    return { axis, line, dir, along, turnCool: rand(random, 0, 1.2), lane: ROAD.lane };
  }

  /** A car dropped onto a street with a heading that matches its lane. */
  function placeOnStreet(car, axis, line, dir, along) {
    const pose = lanePose(axis, line, dir, along);
    car.x = pose.x;
    car.y = pose.y;
    car.angle = pose.angle;
    car.speed = 0;
    car.route = routeFor(axis, line, dir, along);
    car.home = { x: car.x, y: car.y, angle: car.angle };
  }

  function reset() {
    cars.length = 0;
    parked.length = 0;
    const lines = city.lines.slice(1, -1);

    for (let i = 0; i < count; i += 1) {
      const axis = random() < 0.5 ? 'x' : 'y';
      const line = lines[randInt(random, 0, lines.length - 1)];
      const dir = random() < 0.5 ? 1 : -1;
      const along = rand(random, ROAD.step, city.size - ROAD.step);
      const kind = pickWeighted(random, TRAFFIC_MIX);
      const car = createCar(kind, 0, 0, 0, { role: 'traffic' });
      placeOnStreet(car, axis, line, dir, along);
      car.driver = 'ai';
      car.ai = { patience: rand(random, 1, 3) };
      cars.push(car);
    }

    // Kerb parking: walk the grid, drop a car just inside the kerb on alternating sides.
    for (let i = 0; i < parkedCount; i += 1) {
      const axis = random() < 0.5 ? 'x' : 'y';
      const line = lines[randInt(random, 0, lines.length - 1)];
      const side = random() < 0.5 ? 1 : -1;
      const along = rand(random, ROAD.step * 0.6, city.size - ROAD.step * 0.6);
      const kind = pickWeighted(random, PARKED_MIX);
      const car = createCar(kind, 0, 0, 0, { role: 'parked' });
      if (axis === 'x') {
        car.x = along;
        car.y = line + (ROAD.half - 13) * side;
        car.angle = side > 0 ? Math.PI : 0;
      } else {
        car.y = along;
        car.x = line + (ROAD.half - 13) * side;
        car.angle = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      car.home = { x: car.x, y: car.y, angle: car.angle };
      car.parked = true;
      parked.push(car);
    }
  }

  /** The next point to steer for, a car length or two down the current street. */
  function aimPoint(car) {
    const route = car.route;
    const along = laneAlong(route.axis, car.x, car.y);
    const ahead = along + route.dir * 210;
    return lanePose(route.axis, route.line, route.dir, ahead);
  }

  /** At a junction, now and then, turn onto the crossing street. */
  function maybeTurn(car) {
    const route = car.route;
    if (route.turnCool > 0) return;
    const crossings = route.axis === 'x' ? city.roads.ys : city.roads.xs;
    const along = laneAlong(route.axis, car.x, car.y);
    for (const cross of crossings) {
      if (Math.abs(along - cross) > 26) continue;
      if (random() > 0.45) {
        route.turnCool = 0.9;
        return;
      }
      const newAxis = route.axis === 'x' ? 'y' : 'x';
      const newDir = random() < 0.5 ? 1 : -1;
      // Put the car in the new street's lane at the crossing, facing the new direction.
      const pose = lanePose(newAxis, cross, newDir, newAxis === 'x' ? car.x : car.y);
      car.x = pose.x;
      car.y = pose.y;
      car.angle = pose.angle;
      car.speed *= 0.7;
      car.route = routeFor(newAxis, cross, newDir, newAxis === 'x' ? car.x : car.y);
      route.turnCool = 1.4;
      return;
    }
  }

  /** Something directly ahead in this lane: brake rather than plough through it. */
  function obstructionAhead(car, game) {
    const reach = 74;
    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    const noseX = car.x + cos * (car.spec.length * 0.6);
    const noseY = car.y + sin * (car.spec.length * 0.6);
    if (game.player && !game.player.car) {
      const gap = dist(noseX, noseY, game.player.x, game.player.y);
      if (gap < reach && Math.abs(((Math.atan2(game.player.y - car.y, game.player.x - car.x) - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.7) {
        return true;
      }
    }
    for (const other of game.traffic.cars) {
      if (other === car) continue;
      if (dist(noseX, noseY, other.x, other.y) < reach) {
        const bearing = Math.atan2(other.y - car.y, other.x - car.x);
        const off = Math.abs(((bearing - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (off < 0.6) return true;
      }
    }
    return false;
  }

  function update(dt, game) {
    const all = game.allCars();
    for (const car of cars) {
      if (car.wrecked) {
        car.speed *= 1 - 2 * dt;
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
        continue;
      }
      if (car.driver === 'player') continue;
      const route = car.route;
      if (route) {
        route.turnCool = Math.max(0, route.turnCool - dt);
        route.along = laneAlong(route.axis, car.x, car.y);
      }
      const aim = aimPoint(car);
      const blocked = obstructionAhead(car, game);
      const controls = steerTo(car, aim.x, aim.y, { creep: 26 });
      if (blocked) {
        controls.throttle = 0;
        controls.brake = 1;
      }
      // Keep to a civil pace and never reverse out of trouble into the hero's bumper.
      if (controls.throttle > 0) controls.throttle *= 0.72;
      drive(car, controls, dt, game.city, all, game.combat);
      maybeTurn(car);
      car.honk = Math.max(0, car.honk - dt);
    }

    // A parked car that got nudged eases back to its kerb, so the street stays believable.
    for (const car of parked) {
      if (car.driver || car.wrecked || !car.home) continue;
      const gap = dist(car.x, car.y, car.home.x, car.home.y);
      if (gap < 1.5) continue;
      car.x += (car.home.x - car.x) * clamp(dt * 1.6, 0, 1);
      car.y += (car.home.y - car.y) * clamp(dt * 1.6, 0, 1);
      car.angle += (car.home.angle - car.angle) * clamp(dt * 1.6, 0, 1);
    }
  }

  /** The traffic car nearest a point, for a scripted scene or a job's chase. */
  function nearest(x, y, reach = 400) {
    let best = null;
    let bestGap = reach;
    for (const car of cars) {
      const gap = dist(car.x, car.y, x, y);
      if (gap < bestGap) {
        bestGap = gap;
        best = car;
      }
    }
    return best;
  }

  reset();

  return { cars, parked, update, reset, nearest, specOf };
}

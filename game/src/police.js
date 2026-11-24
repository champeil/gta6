// The Bay Police Department: a heat meter, the stars it earns, the cruisers that hunt and the
// officers who get out and run. Heat climbs with every crime, and only cools when nobody has seen
// the hero for a while. At one star a single cruiser comes looking; at five the whole shift does.
// Officers close, shout, and cuff — being stood next to one for a moment on foot is an arrest.
import { COPS, HEAT, POLICE_TALK } from './config.js';
import { createCar, drive, steerTo } from './vehicles.js';
import { clamp, dist, rand, seeded, angleDelta } from './util.js';

/** One officer: mostly a body with a badge, a pistol after the second star. */
function createOfficer(x, y, gun, random) {
  return {
    kind: 'cop',
    x,
    y,
    radius: 10,
    angle: rand(random, -Math.PI, Math.PI),
    health: 90,
    maxHealth: 90,
    speed: 0,
    gun,
    cooldown: rand(random, 0.3, 1.1),
    phase: rand(random, 0, 6.28),
    hurt: 0,
    down: 0,
    state: 'chase',
    car: null,
    shout: 0,
  };
}

export function createPolice(city, random) {
  const state = {
    heat: 0,
    stars: 0,
    lastCrime: -99,
    unseen: 0,
    busted: 0,
    nextSpawn: 0,
  };
  const cars = [];
  const officers = [];
  const radio = [];
  let serial = 0;

  function starsFor(heat) {
    let stars = 0;
    for (let i = 1; i < HEAT.at.length; i += 1) if (heat >= HEAT.at[i]) stars = i;
    return clamp(stars, 0, HEAT.max);
  }

  function getStars() {
    return state.stars;
  }

  function say(text) {
    radio.push({ text, life: 4.2 });
    if (radio.length > 3) radio.shift();
  }

  /** A crime. `amount` heat, and the meter starts its quiet countdown again. */
  function addHeat(amount, player) {
    if (!amount) return;
    state.heat = Math.min(HEAT.at[HEAT.max] + 40, state.heat + amount);
    state.lastCrime = state.clock ?? 0;
    state.unseen = 0;
    const next = starsFor(state.heat);
    if (next > state.stars) {
      state.stars = next;
      say(POLICE_TALK[Math.min(POLICE_TALK.length - 1, next - 1)] ?? 'All units, we have a situation.');
      state.nextSpawn = 0;
    } else {
      state.stars = next;
    }
    void player;
  }

  function clear() {
    state.heat = 0;
    state.stars = 0;
    state.unseen = 0;
    state.nextSpawn = 0;
    for (const car of cars) car.role = 'parked';
    cars.length = 0;
    officers.length = 0;
    radio.length = 0;
  }

  /** A cruiser, on a street a little way off, pointed at the hero. */
  function spawnCruiser(player, index) {
    const angle = rand(random, 0, Math.PI * 2);
    const gap = rand(random, COPS.spawnMin, COPS.spawnMax);
    let x = player.x + Math.cos(angle) * gap;
    let y = player.y + Math.sin(angle) * gap;
    x = clamp(x, 90, city.size - 90);
    y = clamp(y, 90, city.size - 90);
    const street = city.nearestStreet(x, y);
    if (street.runs === 'x') {
      x = clamp(x, 60, city.size - 60);
      y = street.line;
    } else {
      x = street.line;
      y = clamp(y, 60, city.size - 60);
    }
    const car = createCar('police', x, y, Math.atan2(player.y - y, player.x - x), { role: 'police' });
    car.driver = 'ai';
    car.ai = { index, deploy: 0, ram: 0 };
    car.siren = true;
    car.sirenPhase = index * 0.4;
    cars.push(car);
    return car;
  }

  /** Send officers out of a cruiser that has stopped near the hero. */
  function deploy(car, player, wanted) {
    const gun = wanted >= 3 ? 'pistol' : 'fists';
    const seat = Math.atan2(player.y - car.y, player.x - car.x);
    for (let i = 0; i < 2; i += 1) {
      const off = seat + (i === 0 ? 0.9 : -0.9);
      const x = car.x + Math.cos(off) * 22;
      const y = car.y + Math.sin(off) * 22;
      if (!city.isClear(x, y, 10)) continue;
      const officer = createOfficer(x, y, gun, random);
      officer.car = car;
      officers.push(officer);
    }
    car.ai.deploy = 26;
    say('Units on foot, take him down.');
  }

  function update(dt, game) {
    const player = game.player;
    state.clock = game.clock;
    state.stars = starsFor(state.heat);
    state.nextSpawn = Math.max(0, state.nextSpawn - dt);

    for (let i = radio.length - 1; i >= 0; i -= 1) {
      radio[i].life -= dt;
      if (radio[i].life <= 0) radio.splice(i, 1);
    }

    if (state.stars === 0) {
      state.heat = Math.max(0, state.heat - dt * HEAT.cool * 2.2);
      if (state.heat === 0) state.unseen = 0;
      for (let i = cars.length - 1; i >= 0; i -= 1) {
        const car = cars[i];
        car.siren = false;
        if (dist(car.x, car.y, player.x, player.y) > 1400) cars.splice(i, 1);
      }
      for (let i = officers.length - 1; i >= 0; i -= 1) {
        if (dist(officers[i].x, officers[i].y, player.x, player.y) > 1200) officers.splice(i, 1);
      }
      return;
    }

    // Sight: is any unit within the sight radius, or is the hero making noise in a car?
    let seen = false;
    const loud = player.car && Math.abs(player.car.speed) > 60;
    for (const car of cars) {
      if (dist(car.x, car.y, player.x, player.y) < COPS.sight * 1.6) {
        seen = true;
        break;
      }
    }
    if (!seen) {
      for (const officer of officers) {
        if (!officer.down && dist(officer.x, officer.y, player.x, player.y) < COPS.sight) {
          seen = true;
          break;
        }
      }
    }
    if (seen || loud) state.unseen = 0;
    else state.unseen += dt;

    if (state.unseen > HEAT.quiet) state.heat = Math.max(0, state.heat - dt * HEAT.cool);
    state.stars = starsFor(state.heat);

    // Reinforcements: one cruiser per star, up to the cap, drip-fed.
    const wanted = state.stars;
    const wantCars = Math.min(COPS.maxCars, wanted * COPS.perStar);
    if (cars.length < wantCars && state.nextSpawn <= 0) {
      spawnCruiser(player, serial++);
      state.nextSpawn = wanted >= 4 ? 1.4 : 2.6;
    }

    const all = game.allCars();

    for (const car of cars) {
      // A cruiser added from outside (a shot scene, a job) may arrive without an AI record.
      if (!car.ai) car.ai = { index: (serial += 1), deploy: 0, ram: 0 };
      if (car.wrecked) {
        car.ai.deploy = 3;
        continue;
      }
      const gap = dist(car.x, car.y, player.x, player.y);
      const lead = player.car ? player.car.speed * 0.35 : 0;
      const tx = player.x + Math.cos(player.angle) * lead;
      const ty = player.y + Math.sin(player.angle) * lead;

      // Block the road ahead of the hero instead of following his bumper, and close in at speed.
      let aimX = tx;
      let aimY = ty;
      if (gap > 220) {
        const bearing = Math.atan2(ty - car.y, tx - car.x);
        aimX = car.x + Math.cos(bearing) * 260;
        aimY = car.y + Math.sin(bearing) * 260;
      }
      const controls = steerTo(car, aimX, aimY, { creep: 20, urgent: gap < 420 });
      if (gap < 90 && Math.abs(car.speed) > 60) {
        controls.throttle = 1;
        controls.steer *= 0.6;
        car.ai.ram = 0.6;
      }
      if (car.ai.deploy > 0) {
        car.ai.deploy = Math.max(0, car.ai.deploy - dt);
        controls.throttle = 0;
        controls.brake = 1;
      }
      car.siren = true;
      drive(car, controls, dt, city, all, game.combat);

      // Bump the hero's car: it costs him a little paint and a lot of nerve.
      if (player.car && gap < 60 && Math.abs(car.speed) > 40) {
        game.damagePlayer(2.5);
        game.shake(3);
      }

      if (gap < 74 && Math.abs(car.speed) < 90 && car.ai.deploy <= 0 && wanted >= 2 && officers.length < wanted * 2 + 2) {
        deploy(car, player, wanted);
      }
    }

    for (let i = officers.length - 1; i >= 0; i -= 1) {
      const officer = officers[i];
      officer.hurt = Math.max(0, officer.hurt - dt * 2.4);
      if (officer.down > 0) {
        officer.down -= dt;
        if (officer.down <= 0) officers.splice(i, 1);
        continue;
      }
      const gap = dist(officer.x, officer.y, player.x, player.y);
      if (gap > 1000) {
        officers.splice(i, 1);
        continue;
      }
      officer.cooldown = Math.max(0, officer.cooldown - dt);
      const wantedAngle = Math.atan2(player.y - officer.y, player.x - officer.x);
      officer.angle += clamp(angleDelta(officer.angle, wantedAngle), -8 * dt, 8 * dt);

      const arrestNow = gap < COPS.arrestRange && !player.car && !player.dead;
      if (arrestNow) {
        officer.state = 'arrest';
        state.busted += dt;
        officer.shout = 0.4;
        if (state.busted >= COPS.arrestSeconds) {
          state.busted = 0;
          game.onBusted();
          return;
        }
      } else {
        officer.state = 'chase';
        state.busted = Math.max(0, state.busted - dt * 1.6);
        const pace = 176 + wanted * 6;
        const closeTo = officer.gun === 'fists' ? 26 : 96;
        if (gap > closeTo + 12) {
          const side = Math.sin(game.clock * 1.1 + officer.phase) * 0.4;
          const goalX = player.x + Math.cos(wantedAngle + Math.PI + side) * closeTo;
          const goalY = player.y + Math.sin(wantedAngle + Math.PI + side) * closeTo;
          const dx = goalX - officer.x;
          const dy = goalY - officer.y;
          const len = Math.hypot(dx, dy) || 1;
          officer.x += (dx / len) * pace * dt;
          officer.y += (dy / len) * pace * dt;
          officer.speed = pace;
          officer.phase += dt * 7;
        } else {
          officer.speed = 0;
        }
        if (officer.gun !== 'fists' && gap < 300 && officer.cooldown <= 0 && Math.abs(angleDelta(officer.angle, wantedAngle)) < 0.36) {
          officer.cooldown = 1.5 + random() * 0.7;
          const spread = (random() - 0.5) * 0.2;
          game.combat.shoot({
            x: officer.x + Math.cos(officer.angle) * 14,
            y: officer.y + Math.sin(officer.angle) * 14,
            angle: officer.angle + spread,
            damage: 9,
            speed: 1400,
            range: 520,
            from: 'police',
            owner: officer,
          });
        }
      }
      for (const solid of city.solidsAround(officer.x, officer.y, 10)) {
        const nx = clamp(officer.x, solid.x, solid.x + solid.w);
        const ny = clamp(officer.y, solid.y, solid.y + solid.h);
        const dx = officer.x - nx;
        const dy = officer.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 > 100) continue;
        const d = Math.sqrt(d2) || 0.001;
        officer.x += (dx / d) * (10 - d);
        officer.y += (dy / d) * (10 - d);
      }
    }

    if (state.heat <= 0) state.heat = 0;
  }

  /** The nearest cruiser, for a scripted chase or the shot scenes. */
  function nearestCar(x, y) {
    let best = null;
    let bestGap = Infinity;
    for (const car of cars) {
      const gap = dist(car.x, car.y, x, y);
      if (gap < bestGap) {
        bestGap = gap;
        best = car;
      }
    }
    return best;
  }

  return {
    cars,
    officers,
    radio,
    state,
    getStars,
    addHeat,
    clear,
    update,
    nearestCar,
    say,
    random,
    seeded,
  };
}

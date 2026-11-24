// Solara Bay's rulebook: one object that owns the world, the hero and a single frame of play. Input
// comes in here and leaves as consequences — a step, a gear change, a hot casing, a pair of cuffs —
// and the other modules are asked what they know rather than told what to do. Nothing below touches
// a canvas; render.js is the only module that paints.
import { GUNS, PRICES, ROAD, SAVE_KEY, STEP } from './config.js';
import { buildCity } from './world.js';
import { armed, carWithin, createPlayer, enterCar, exitCar, hurtPlayer, revivePlayer, updatePlayer } from './player.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createInput } from './input.js';
import { paintFrame } from './render.js';
import { clearBodies, panicCrowd, spawnCrowd, updateActor, hurtActor } from './actors.js';
import { createCar, damageCar as wreckCar, drive, specOf } from './vehicles.js';
import { clamp, dist, dropAt, moveToward, seeded } from './util.js';
import { advanceHour, lightFor } from './sky.js';

/** Walkers the city keeps alive near the hero. */
const WALKERS = 30;
/** How far a walker may wander before it gets recycled. */
const WALKER_REACH = 1500;

export function createGame(canvas, options = {}) {
  const seed = options.seed ?? 20261124;
  const rng = seeded(seed);
  const city = buildCity(seed);
  const hero = createPlayer(city.size * 0.22, city.size * 0.38);
  const audio = createAudio();
  const hud = createHud();
  const minimap = createMinimap();
  const input = createInput(canvas);
  const traffic = createTraffic(city, rng, { count: 16, parked: 44 });
  const police = createPolice(city, rng);
  const missions = createMissions(city, rng);

  const meta = {
    screen: 'title',
    hour: 10.5,
    wanted: 0,
    fade: 0,
    bigText: null,
    saveNote: '',
    saveNoteLife: 0,
    deaths: 0,
    arrests: 0,
    packages: 0,
    shot: options.shot ?? null,
    seed,
    cars: [],
  };

  const eye = { x: hero.x, y: hero.y, shake: 0 };
  const viewport = { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const walkers = [];
  const notes = [];
  const stains = [];
  let time = 0;
  let respawnIn = 0;
  let driftT = 0;
  let atDoor = false;
  let combat = null;

  const ctx = canvas.getContext('2d', { alpha: false });

  // ---------------------------------------------------------------- small verbs

  function toast(text) {
    notes.push({ text, life: 3.2 });
    if (notes.length > 4) notes.shift();
  }

  function shake(amount) {
    eye.shake = Math.max(eye.shake, amount);
  }

  /** Every car in the world in one list: traffic, kerbside, cruisers, job props, the hero's own. */
  function allCars() {
    const list = traffic.cars.slice();
    for (const car of traffic.parked) list.push(car);
    for (const car of police.cars) list.push(car);
    for (const target of missions.state.targets) if (target.spec) list.push(target);
    if (hero.car && !list.includes(hero.car)) list.push(hero.car);
    return list;
  }

  /** Register a car the world did not start with: a job's waiting ride, a shot scene's prop. */
  function addCar(car) {
    if (!traffic.parked.includes(car) && !traffic.cars.includes(car)) traffic.parked.push(car);
    meta.cars = traffic.cars.concat(traffic.parked);
    return car;
  }

  /** Every body within reach of a point: the hero, walkers, officers, rivals. */
  function bodiesNear(x, y, reach) {
    const list = [];
    if (!hero.car && !hero.dead && dist(hero.x, hero.y, x, y) < reach + 20) list.push(hero);
    for (const ped of walkers) if (!ped.dead && dist(ped.x, ped.y, x, y) < reach + 20) list.push(ped);
    for (const cop of police.officers) if (cop.down <= 0 && dist(cop.x, cop.y, x, y) < reach + 20) list.push(cop);
    for (const rival of missions.state.targets) {
      if (rival.kind !== 'rival') continue;
      if (!rival.dead && dist(rival.x, rival.y, x, y) < reach + 20) list.push(rival);
    }
    return list;
  }

  /** The body a bullet at (x, y) has reached. `owner` fired it; `from` is skipped. */
  function bodyAt(x, y, owner, from) {
    let pick = null;
    let closest = 20;
    const weigh = (body) => {
      if (body === from) return;
      const gap = dist(x, y, body.x, body.y);
      if (gap < (body.radius ?? 9) + 5 && gap < closest) {
        closest = gap;
        pick = body;
      }
    };
    if (owner !== 'player' && !hero.car && !hero.dead) weigh(hero);
    if (owner === 'player' || owner === 'police') {
      for (const ped of walkers) if (!ped.dead) weigh(ped);
      for (const rival of missions.state.targets) {
        if (rival.kind === 'rival' && !rival.dead) weigh(rival);
      }
    }
    if (owner !== 'police') {
      for (const cop of police.officers) if (cop.down <= 0) weigh(cop);
    }
    return pick;
  }

  /** Does a point land inside a wall, or out past the shoreline? Bullets stop at both. */
  function hitsWall(x, y) {
    for (const solid of city.solidsAround(x, y, 3)) {
      if (x > solid.x && x < solid.x + solid.w && y > solid.y && y < solid.y + solid.h) return true;
    }
    if (city.onPier(x, y, 6)) return false;
    return x > city.waterline || x < 0 || y < 0 || y > city.size;
  }

  /**
   * The car a bullet at (x, y) struck. The shape tested is the car's own rectangle rotated onto its
   * heading and grown by the bullet's radius — a plain circle would claim the air beside a long car
   * and swallow shots that visibly clear it.
   */
  function carAt(x, y, radius) {
    for (const car of allCars()) {
      if (Math.abs(car.x - x) > 60 || Math.abs(car.y - y) > 60) continue;
      const cos = Math.cos(-car.angle);
      const sin = Math.sin(-car.angle);
      const dx = x - car.x;
      const dy = y - car.y;
      const along = dx * cos - dy * sin;
      const across = dx * sin + dy * cos;
      if (Math.abs(along) <= car.spec.length / 2 + radius && Math.abs(across) <= car.spec.width / 2 + radius) {
        return car;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- damage

  function damagePlayer(amount) {
    if (meta.screen !== 'play' || respawnIn > 0 || hero.dead) return;
    const down = hurtPlayer(hero, amount, null, time);
    audio.sfx.hurt();
    shake(2.4);
    if (down) {
      meta.deaths += 1;
      meta.bigText = { title: 'WASTED', sub: `The clinic will take $${PRICES.clinic}.`, life: 1 };
      respawnIn = 2.8;
      missions.fail(game, 'you were killed');
    }
  }

  function damageCar(car, amount, byPlayer) {
    if (!car || car.wrecked) return;
    const wasSound = car.wrecked;
    wreckCar(car, amount, combat);
    if (!wasSound && car.wrecked) {
      stains.push({ x: car.x, y: car.y, life: 16, kind: 'wreck', tilt: car.angle });
      audio.sfx.crash();
      if (combat) combat.blast(car.x, car.y, 46, 24);
    }
    if (byPlayer) police.addHeat(9, hero);
    if (car === hero.car) damagePlayer(amount * 0.28);
  }

  function damageBody(body, amount, info = {}) {
    if (!body) return;
    if (body === hero) {
      damagePlayer(amount);
      return;
    }
    if (body.spec) {
      damageCar(body, amount, info.shooter === 'player');
      return;
    }
    if (body.kind === 'cop') {
      body.health -= amount;
      body.hurt = 1;
      if (body.health <= 0) {
        body.health = 0;
        body.down = 14;
        stains.push({ x: body.x, y: body.y, life: 14, kind: 'blood', tilt: body.angle });
        police.addHeat(18, hero);
        panicCrowd(walkers, body.x, body.y, 260, time);
      }
      return;
    }
    const killed = hurtActor(body, amount, info.from ?? (info.shooter === 'player' ? hero : null), time, combat);
    if (killed && body.kind === 'ped') {
      stains.push({ x: body.x, y: body.y, life: 14, kind: 'blood', tilt: body.angle });
      police.addHeat(7, hero);
      panicCrowd(walkers, body.x, body.y, 300, time);
    }
    if (killed && body.kind === 'rival') {
      stains.push({ x: body.x, y: body.y, life: 14, kind: 'blood', tilt: body.angle });
      police.addHeat(5, hero);
    }
  }

  // ---------------------------------------------------------------- the law

  function onBusted() {
    if (meta.screen !== 'play' || respawnIn > 0) return;
    meta.arrests += 1;
    hero.health = Math.max(34, hero.health);
    hero.armour = 0;
    hero.car = null;
    police.clear();
    meta.wanted = 0;
    const precinct = city.addressOf('precinct');
    hero.x = precinct.x;
    hero.y = precinct.y + 42;
    hero.angle = Math.PI / 2;
    meta.bigText = { title: 'BUSTED', sub: `$${PRICES.impound} in impound, at the precinct door.`, life: 1 };
    missions.fail(game, 'you were arrested');
    audio.sfx.fail();
    if (hero.cash > 0) hero.cash = Math.max(0, hero.cash - PRICES.impound);
  }

  // ---------------------------------------------------------------- cars and doors

  /** Step into the nearest ride, or out of the one the hero is already in. */
  function tryEnterCar() {
    if (hero.car) {
      exitCar(hero, hero.car, city, time);
      audio.sfx.door();
      return true;
    }
    const car = carWithin(hero, allCars(), 34);
    if (!car) {
      toast('Nothing to drive here');
      return false;
    }
    if (car.spec.cruiser && meta.wanted > 0) {
      toast('Not with them watching');
      return false;
    }
    if (car.spec.cruiser) police.addHeat(30, hero);
    else if (car.role !== 'player' && car.role !== 'job') police.addHeat(Math.abs(car.speed) > 40 ? 15 : 5, hero);
    enterCar(hero, car, time);
    car.parked = false;
    meta.wanted = police.getStars();
    audio.sfx.door();
    return true;
  }

  function exitCarNow() {
    if (!hero.car) return false;
    exitCar(hero, hero.car, city, time);
    audio.sfx.door();
    return true;
  }

  /** The side-job harness and the shot scenes need a car under the hero, at once. */
  function spawnPlayerCar(kind, x, y, heading = 0) {
    const car = createCar(kind, x, y, heading, { role: 'player', paint: kind === 'taxi' ? '#e8b73a' : undefined });
    car.speed = 0;
    addCar(car);
    enterCar(hero, car, time);
    car.parked = false;
    return car;
  }

  /** A car nobody owns: a scene prop or a job's spare ride. */
  function spawnCar(kind, x, y, heading = 0) {
    const car = createCar(kind, x, y, heading, { role: 'parked' });
    addCar(car);
    return car;
  }

  // ---------------------------------------------------------------- weapons

  function selectWeapon(slot) {
    const order = ['fists', 'pistol', 'smg', 'shotgun'];
    const kind = order[slot];
    if (!kind) return;
    if (kind !== 'fists' && (hero.ammo[kind] ?? 0) <= 0) {
      toast(`No ${GUNS[kind].label} rounds`);
      return;
    }
    hero.gun = kind;
    audio.sfx.click();
  }

  function weaponLabel() {
    return GUNS[hero.gun]?.label ?? 'Fists';
  }

  // ---------------------------------------------------------------- saving

  function saveGame() {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          version: 2,
          at: new Date().toISOString(),
          hero: {
            x: hero.x,
            y: hero.y,
            health: hero.health,
            armour: hero.armour,
            cash: hero.cash,
            gun: hero.gun,
            ammo: hero.ammo,
          },
          hour: meta.hour,
          done: [...missions.state.done],
          sideFares: missions.state.sideFares,
          packages: missions.state.packages,
          story: missions.state.active?.id ?? null,
        }),
      );
      meta.saveNote = 'Saved';
      meta.saveNoteLife = 2.2;
      audio.sfx.click();
      return true;
    } catch {
      meta.saveNote = 'Could not save';
      meta.saveNoteLife = 2.2;
      return false;
    }
  }

  function hasSave() {
    try {
      return Boolean(localStorage.getItem(SAVE_KEY));
    } catch {
      return false;
    }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        toast('No save yet');
        return false;
      }
      const data = JSON.parse(raw);
      const saved = data.hero ?? {};
      if (hero.car) exitCar(hero, hero.car, city, time);
      revivePlayer(hero, Number(saved.x) || hero.x, Number(saved.y) || hero.y);
      hero.health = Number(saved.health) || 100;
      hero.armour = Number(saved.armour) || 0;
      hero.cash = Number(saved.cash) || PRICES.start;
      if (GUNS[saved.gun]) hero.gun = saved.gun;
      if (saved.ammo) hero.ammo = { ...hero.ammo, ...saved.ammo };
      meta.hour = Number(data.hour) || 10.5;
      missions.reset();
      for (const id of data.done ?? []) missions.state.done.add(id);
      missions.state.sideFares = Number(data.sideFares) || 0;
      missions.state.packages = Number(data.packages) || 0;
      meta.packages = missions.state.packages;
      police.clear();
      meta.wanted = 0;
      if (data.story) {
        const index = missions.STORY.findIndex((job) => job.id === data.story);
        if (index >= 0) missions.start(index, game);
      }
      meta.screen = 'play';
      eye.x = hero.x;
      eye.y = hero.y;
      meta.saveNote = 'Loaded';
      meta.saveNoteLife = 2;
      return true;
    } catch {
      toast('Save file is unreadable');
      return false;
    }
  }

  // ---------------------------------------------------------------- the opening

  function placePlayer(x, y, angle = -Math.PI / 2) {
    hero.x = x;
    hero.y = y;
    hero.angle = angle;
    eye.x = x;
    eye.y = y;
  }

  /**
   * A car at the kerb of the street nearest a point, `along` pixels up or down that kerb — so the
   * opening car sits beside the hero's door instead of on top of it.
   */
  function kerbCar(kind, x, y, paint, along = 60) {
    const street = city.nearestStreet(x, y);
    const line = street.line + ROAD.half - 16;
    const car = createCar(kind, x, y, 0, { role: 'parked', paint: paint ?? undefined });
    if (street.runs === 'x') {
      car.y = line;
      car.x = x + along;
      car.angle = along >= 0 ? 0 : Math.PI;
    } else {
      car.x = line;
      car.y = y + along;
      car.angle = along >= 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    car.parked = true;
    car.home = { x: car.x, y: car.y, angle: car.angle };
    addCar(car);
    return car;
  }

  function resetWorld() {
    traffic.reset();
    police.clear();
    if (combat) combat.clear();
    missions.reset();
    walkers.length = 0;
    stains.length = 0;
    notes.length = 0;
    time = 0;
    respawnIn = 0;
    atDoor = false;

    // The opening: the hero on the pavement outside the Vela Garage, a sedan at the kerb beside him
    // and a Sun Cab one street over. Walking onto the garage door opens the first job, so the start
    // is a real approach rather than a spawn on top of the trigger.
    const garage = city.addressOf('garage');
    const door = missions.startMarker();
    const anchor = door ?? garage;
    // Stand clear of the door radius, on ground a body fits on: the first job must be walked up to.
    const spawn = city.standNear(anchor.x, anchor.y, 11, 78, 170) ?? anchor;
    placePlayer(spawn.x, spawn.y, Math.atan2(anchor.y - spawn.y, anchor.x - spawn.x));
    kerbCar('sedan', garage.x, garage.y, '#3f6f9e', 96);
    kerbCar('taxi', garage.x, garage.y, '#e8b73a', -150);
    hero.health = hero.maxHealth;
    hero.armour = 0;
    hero.cash = PRICES.start;
    hero.gun = 'fists';
    hero.ammo = { pistol: 30, smg: 0, shotgun: 0 };
    hero.dead = false;
    hero.arrested = false;

    meta.wanted = 0;
    meta.hour = 10.5;
    meta.deaths = 0;
    meta.arrests = 0;
    meta.packages = 0;
    meta.fade = 0;
    meta.bigText = null;
    meta.saveNote = '';
    meta.saveNoteLife = 0;

    for (const ped of spawnCrowd(city, WALKERS, rng, hero)) walkers.push(ped);
    meta.cars = traffic.cars.concat(traffic.parked);
  }

  // ---------------------------------------------------------------- camera and markers

  function updateCamera(dt) {
    const lead = hero.car ? Math.min(90, hero.car.speed * 0.12) : 0;
    const tx = hero.x + (hero.car ? Math.cos(hero.car.angle) * lead : 0);
    const ty = hero.y + (hero.car ? Math.sin(hero.car.angle) * lead : 0);
    eye.x = moveToward(eye.x, tx, Math.abs(tx - eye.x) * 5 + 460, dt);
    eye.y = moveToward(eye.y, ty, Math.abs(ty - eye.y) * 5 + 460, dt);
    const halfW = viewport.w / 2;
    const halfH = viewport.h / 2;
    eye.x = clamp(eye.x, halfW - 60, Math.max(halfW, city.size - halfW + 60));
    eye.y = clamp(eye.y, halfH - 60, Math.max(halfH, city.size - halfH + 60));
    eye.shake = Math.max(0, eye.shake - dt * 22);
  }

  /** Everything worth a blip: parcels, job pickups, the objective, the door, the fare, cruisers. */
  function activeMarkers() {
    const list = [];
    for (const pack of missions.packages) list.push({ x: pack.x, y: pack.y, kind: 'package' });
    for (const pickup of missions.state.pickups) {
      if (!pickup.taken) list.push({ x: pickup.x, y: pickup.y, kind: 'goal', radius: 22 });
    }
    for (const target of missions.state.targets) {
      if (target.spec) {
        if (!target.wrecked) list.push({ x: target.x, y: target.y, kind: 'goal' });
      } else if (!target.dead && (target.health ?? 0) > 0) {
        list.push({ x: target.x, y: target.y, kind: 'goal' });
      }
    }
    if (missions.state.active && missions.state.marker) {
      const marker = missions.state.marker;
      list.push({ x: marker.x, y: marker.y, kind: 'goal', radius: marker.radius });
    }
    const door = missions.startMarker();
    if (door) list.push({ x: door.x, y: door.y, kind: 'job', radius: door.radius });
    const fare = missions.getFare();
    if (fare) {
      list.push(
        fare.state === 'pickup'
          ? { x: fare.x, y: fare.y, kind: 'fare', radius: 26 }
          : { x: fare.dropX, y: fare.dropY, kind: 'fare', radius: 30 },
      );
    }
    return list;
  }

  /** Walking onto the job door opens the job; stepping off and back opens it again. */
  function checkJobDoor() {
    if (missions.state.active) {
      atDoor = false;
      return;
    }
    const door = missions.startMarker();
    if (!door) return;
    const inside = dist(hero.x, hero.y, door.x, door.y) <= door.radius;
    const arrived = inside && !atDoor;
    atDoor = inside;
    if (!arrived) return;
    const job = missions.nextJob();
    if (!job) return;
    missions.start(missions.STORY.indexOf(job), game);
  }

  // ---------------------------------------------------------------- the frame

  function update(dt) {
    time += dt;
    meta.hour = advanceHour(meta.hour, dt);

    if (meta.saveNoteLife > 0) {
      meta.saveNoteLife = Math.max(0, meta.saveNoteLife - dt);
      if (meta.saveNoteLife === 0) meta.saveNote = '';
    }
    for (let i = notes.length - 1; i >= 0; i -= 1) {
      notes[i].life -= dt;
      if (notes[i].life <= 0) dropAt(notes, i);
    }
    if (meta.bigText) {
      meta.bigText.life = Math.max(0, meta.bigText.life - dt * 0.4);
      if (meta.bigText.life === 0) meta.bigText = null;
    }
    for (let i = stains.length - 1; i >= 0; i -= 1) {
      stains[i].life -= dt;
      if (stains[i].life <= 0) dropAt(stains, i);
    }

    if (meta.screen !== 'play') {
      // The city carries on behind the cards.
      traffic.update(dt, game);
      for (const ped of walkers) updateActor(ped, dt, actorCtx);
      updateCamera(dt);
      return;
    }

    if (respawnIn > 0) {
      respawnIn -= dt;
      meta.fade = clamp(1 - respawnIn / 2.8, 0, 0.94);
      if (respawnIn <= 0) {
        meta.fade = 0;
        const clinic = city.addressOf('hospital');
        revivePlayer(hero, clinic.x, clinic.y + 40);
        hero.cash = Math.max(0, hero.cash - PRICES.clinic);
        police.clear();
        meta.wanted = 0;
        toast(`Patched up at the clinic: -$${PRICES.clinic}`);
      }
      return;
    }

    const axis = input.axis();
    const aimX = viewport.x + (input.pointer.x / canvas.width) * viewport.w;
    const aimY = viewport.y + (input.pointer.y / canvas.height) * viewport.h;
    const aiming = input.pointer.down || armed(hero);

    if (hero.car) {
      const car = hero.car;
      drive(
        car,
        {
          throttle: car.wrecked ? 0 : Math.max(0, -axis.y),
          brake: input.isDown('Space') ? 1 : Math.max(0, axis.y),
          steer: axis.x,
        },
        dt,
        city,
        allCars(),
        combat,
      );
      hero.x = car.x;
      hero.y = car.y;
      hero.angle = car.angle;
      hero.moving = Math.abs(car.speed) > 8;

      // Running somebody down: a crime, a mess, and a slow-down.
      if (Math.abs(car.speed) > 90) {
        for (const body of bodiesNear(car.x, car.y, 30)) {
          if (dist(car.x, car.y, body.x, body.y) > car.spec.length * 0.5 + (body.radius ?? 9)) continue;
          damageBody(body, Math.abs(car.speed) * 0.22, { shooter: 'player' });
          car.speed *= 0.88;
          shake(4);
        }
      }

      // Firing out of the window: the muzzle follows the pointer.
      if (input.pointer.down && hero.cooldown <= 0 && armed(hero)) {
        const gun = GUNS[hero.gun];
        hero.ammo[hero.gun] -= 1;
        hero.cooldown = gun.cooldown;
        const angle = Math.atan2(aimY - hero.y, aimX - hero.x);
        for (let i = 0; i < (gun.pellets || 1); i += 1) {
          combat.shoot({
            x: hero.x + Math.cos(angle) * 20,
            y: hero.y + Math.sin(angle) * 20,
            angle: angle + (Math.random() - 0.5) * gun.spread,
            damage: gun.damage,
            speed: gun.speed,
            range: gun.range,
            owner: 'player',
            from: hero,
          });
        }
        audio.sfx.shot(hero.gun);
        police.addHeat(5, hero);
      }
    } else {
      const events = updatePlayer(
        hero,
        {
          moveX: axis.x,
          moveY: axis.y,
          run: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
          aim: aiming,
          aimX,
          aimY,
          fire: input.pointer.down || input.isDown('Space'),
          enter: false,
        },
        dt,
        { city },
      );

      if (events.footstep) audio.sfx.step();
      if (events.shot) {
        const gun = events.shot.gun;
        for (let i = 0; i < (gun.pellets || 1); i += 1) {
          combat.shoot({
            x: events.shot.x + Math.cos(events.shot.angle) * 15,
            y: events.shot.y + Math.sin(events.shot.angle) * 15,
            angle: events.shot.angle + (Math.random() - 0.5) * gun.spread,
            damage: gun.damage,
            speed: gun.speed,
            range: gun.range,
            owner: 'player',
            from: hero,
          });
        }
        audio.sfx.shot(events.shot.kind);
        shake(events.shot.kind === 'shotgun' ? 3 : 1.2);
        police.addHeat(4, hero);
      }
      if (events.punch) {
        combat.melee(hero, events.punch.angle, GUNS.fists);
        audio.sfx.punch();
      }
      if (input.take('KeyE')) tryEnterCar();
    }

    if (input.take('Digit1')) selectWeapon(0);
    if (input.take('Digit2')) selectWeapon(1);
    if (input.take('Digit3')) selectWeapon(2);
    if (input.take('Digit4')) selectWeapon(3);
    if (hero.car && input.take('KeyE')) tryEnterCar();

    traffic.update(dt, game);
    police.update(dt, game);
    missions.update(dt, game);
    combat.update(dt);
    meta.wanted = police.getStars();

    for (const ped of walkers) updateActor(ped, dt, actorCtx);
    for (const rival of missions.state.targets) {
      if (rival.kind === 'rival') updateActor(rival, dt, actorCtx);
    }
    clearBodies(walkers, time);

    // Recycle walkers that drifted away, then top the crowd back up.
    for (let i = walkers.length - 1; i >= 0; i -= 1) {
      if (dist(walkers[i].x, walkers[i].y, hero.x, hero.y) > WALKER_REACH) dropAt(walkers, i);
    }
    if (walkers.length < WALKERS) {
      for (const ped of spawnCrowd(city, 2, rng, hero)) walkers.push(ped);
    }

    checkJobDoor();
    updateCamera(dt);
    meta.cars = traffic.cars.concat(traffic.parked);
    meta.packages = missions.state.packages;
  }

  /** The context every walker and rival is handed each tick. */
  const actorCtx = {
    city,
    get player() {
      return hero;
    },
    get now() {
      return time;
    },
    random: rng,
    effects: null,
    shoot: (shot) => {
      combat.shoot({ ...shot, owner: shot.owner ?? 'thug' });
      audio.sfx.shot('pistol');
    },
    hurt: (amount) => damagePlayer(amount),
  };

  /** The title card's slow drift, so the opening frame is a moving city. */
  function titleDrift(dt) {
    driftT += dt;
    eye.x = city.size * 0.42 + Math.sin(driftT * 0.07) * 300;
    eye.y = city.size * 0.46 + Math.cos(driftT * 0.05) * 240;
    meta.hour = 18.1 + Math.sin(driftT * 0.03) * 0.5;
  }

  function setScreen(screen) {
    const wasTitle = meta.screen === 'title';
    meta.screen = screen;
    if (wasTitle && screen === 'play') meta.hour = 10.5;
    if (screen === 'play') audio.unlock();
    audio.sfx.click();
  }

  /** One frame: global keys, then the simulation, then the painters. */
  function frame(dt) {
    const step = Math.min(dt, 1 / 30);

    if (input.take('Enter') && meta.screen === 'title') setScreen('play');
    if (input.take('KeyP') || input.take('Escape')) {
      if (meta.screen === 'play') setScreen('pause');
      else if (meta.screen === 'pause' || meta.screen === 'map') setScreen('play');
    }
    if (input.take('KeyM')) {
      if (meta.screen === 'play') setScreen('map');
      else if (meta.screen === 'map') setScreen('play');
    }
    if (input.take('F5')) saveGame();
    if (input.take('F9')) loadGame();
    if (input.take('KeyR') && respawnIn > 0) respawnIn = Math.min(respawnIn, 0.05);
    if (input.take('KeyN')) audio.toggle();

    if (meta.screen === 'title') titleDrift(step);
    update(step);

    viewport.w = canvas.width;
    viewport.h = canvas.height;
    viewport.x = eye.x - viewport.w / 2;
    viewport.y = eye.y - viewport.h / 2;

    paintFrame(game);
    input.endFrame();
  }

  // ---------------------------------------------------------------- the handle

  const game = {
    canvas,
    ctx,
    city,
    player: hero,
    state: meta,
    camera: eye,
    view: viewport,
    input,
    audio,
    police,
    traffic,
    missions,
    hud,
    minimap,
    peds: walkers,
    pedestrians: { people: walkers },
    toasts: notes,
    marks: stains,
    seed,
    random: rng,
    spawnCar,
    spawnPlayerCar,
    addCar,
    tryEnterCar,
    exitCar: exitCarNow,
    weaponLabel,
    selectWeapon,
    saveGame,
    loadGame,
    hasSave,
    damageBody,
    damageCar,
    damagePlayer,
    onBusted,
    bodiesNear,
    bodyAt,
    hitsWall,
    carAt,
    allCars,
    activeMarkers,
    toast,
    shake,
    setScreen,
    frame,
    update,
    resetWorld,
    specOf,
    step: STEP,
  };
  Object.defineProperty(game, 'clock', { get: () => time, enumerable: true });
  Object.defineProperty(game, 'lampsOn', { get: () => lightFor(meta.hour).lit, enumerable: true });
  Object.defineProperty(game, 'combat', { get: () => combat, enumerable: true });

  combat = createCombat(game);
  actorCtx.effects = combat.effects;

  resetWorld();
  // The city is placed before the first frame, so the title card opens on a full street.
  for (let i = 0; i < 40; i += 1) update(1 / 60);
  meta.screen = 'title';
  eye.x = hero.x;
  eye.y = hero.y;

  return game;
}

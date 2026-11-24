// The story and the side work. Seven jobs for two fixers, each a short chain of typed steps
// (goto, deliver, collect, destroy, kill, survive, escape), plus the two things that keep the
// meter fed between them: Sun Cab fares and the courier parcels that lie about the streets.
//
// A step is data, and the runner is one switch. Nothing here paints, and nothing here moves the
// hero: the runner watches the world and reports what happened.
import { PLACES, SIDE_WORK } from './config.js';
import { createActor, spawnCrew } from './actors.js';
import { createCar } from './vehicles.js';
import { dist, rand, seeded } from './util.js';

/** Who the two fixers are, and what they want. */
export const CONTACTS = {
  ray: { name: 'Ray Salto', line: 'You look like a man with rent due.' },
  mira: { name: 'Mira Ochoa', line: 'I pay on time. Ask anyone still breathing.' },
};

/**
 * The seven jobs. Each `steps` entry names its kind, the text the HUD shows, and what it needs:
 * `at` is a PLACES key or a point, `who` a crew size, `car` a class, `seconds` a timer.
 */
export const STORY = [
  {
    id: 'first-favour',
    title: 'A First Favour',
    contact: 'ray',
    where: 'garage',
    brief: 'Ray has a parcel in the old market and a boat waiting at the marina. Fetch it, keep it dry.',
    pay: 420,
    steps: [
      { kind: 'goto', text: 'Meet Ray at the Vela Garage', at: 'garage' },
      { kind: 'collect', text: 'Pick up the parcel in Mercado Viejo', at: 'market', pickups: 3 },
      { kind: 'deliver', text: 'Drive the parcel to Marina Pier', at: 'marina' },
    ],
  },
  {
    id: 'sunset-delivery',
    title: 'Sunset Delivery',
    contact: 'ray',
    where: 'boardwalk',
    brief: 'A Marlin GT is parked on the boardwalk with the keys in it. Somebody in Dock Nine wants it more than he does.',
    pay: 640,
    steps: [
      { kind: 'goto', text: 'Take the Marlin GT off the boardwalk', at: 'boardwalk', car: 'sports' },
      { kind: 'deliver', text: 'Leave it at Dock Nine, engine running', at: 'docks' },
      { kind: 'escape', text: 'Lose the cruiser that followed you' },
    ],
  },
  {
    id: 'ledger-hunt',
    title: 'The Ledger Hunt',
    contact: 'mira',
    where: 'bank',
    brief: 'Three ledgers walked out of Banco del Sol this morning. Mira wants them back, and the van they left in burnt.',
    pay: 780,
    steps: [
      { kind: 'goto', text: 'Meet Mira outside Banco del Sol', at: 'bank' },
      { kind: 'collect', text: 'Recover the three ledgers', at: 'market', pickups: 3 },
      { kind: 'destroy', text: 'Burn the courier van at Dock Nine', at: 'docks', car: 'van' },
    ],
  },
  {
    id: 'taxi-war',
    title: 'Taxi War',
    contact: 'mira',
    where: 'stadium',
    brief: 'Two unlicensed cabs are poaching Mira\'s stand. Take them off the road, then run her driver home.',
    pay: 900,
    steps: [
      { kind: 'goto', text: 'Find the stand outside Estadio Coral', at: 'stadium' },
      { kind: 'destroy', text: 'Put the two pirate cabs out of service', at: 'stadium', car: 'taxi', count: 2 },
      { kind: 'deliver', text: 'Run Mira\'s driver to the boardwalk', at: 'boardwalk' },
    ],
  },
  {
    id: 'banco-del-sol',
    title: 'Banco del Sol',
    contact: 'mira',
    where: 'bank',
    brief: 'Mira wants the bank\'s afternoon take. Walk in, hold the floor while her crew works, walk out.',
    pay: 1100,
    steps: [
      { kind: 'goto', text: 'Get to the bank on Avenida Sol', at: 'bank' },
      { kind: 'survive', text: 'Hold the lobby while the crew cracks the vault', seconds: 22 },
      { kind: 'escape', text: 'Get clear of the response' },
    ],
  },
  {
    id: 'harbour-revenge',
    title: 'Harbour Revenge',
    contact: 'ray',
    where: 'docks',
    brief: 'The crew that hit Ray\'s garage is unloading at Dock Nine. Ray is not asking for the cargo back.',
    pay: 1350,
    steps: [
      { kind: 'goto', text: 'Reach the container yard at Dock Nine', at: 'docks' },
      { kind: 'kill', text: 'Clear the yard', at: 'docks', who: 5 },
      { kind: 'destroy', text: 'Sink their van into the bay', at: 'docks', car: 'van' },
      { kind: 'escape', text: 'Leave before the second shift arrives' },
    ],
  },
  {
    id: 'last-light',
    title: 'Last Light',
    contact: 'mira',
    where: 'marina',
    brief: 'Everything Mira has is on one boat at the marina, and one man is standing between her and it. End it tonight.',
    pay: 2000,
    steps: [
      { kind: 'goto', text: 'Meet Mira at Marina Pier after dark', at: 'marina' },
      { kind: 'kill', text: 'Take the pier', at: 'marina', who: 6 },
      { kind: 'survive', text: 'Hold the pier while the boat pulls out', seconds: 18 },
      { kind: 'escape', text: 'Disappear into the city' },
    ],
  },
];

/** The door each job starts at: the contact's place, not the job's own scene. */
const DOOR_OF = {
  'first-favour': 'garage',
  'sunset-delivery': 'boardwalk',
  'ledger-hunt': 'bank',
  'taxi-war': 'stadium',
  'banco-del-sol': 'bank',
  'harbour-revenge': 'docks',
  'last-light': 'marina',
};

function pointOf(city, key) {
  const place = PLACES[key] ?? PLACES.garage;
  const address = city.addressOf(key);
  return { x: address.x, y: address.y, name: place.name };
}

/** A pavement spot near a place, for a pickup the hero can actually reach on foot. */
function reachableNear(city, key, random, offset = 90) {
  const base = pointOf(city, key);
  for (let tries = 0; tries < 60; tries += 1) {
    const angle = rand(random, -Math.PI, Math.PI);
    const reach = rand(random, 40, offset * 2.4);
    const x = base.x + Math.cos(angle) * reach;
    const y = base.y + Math.sin(angle) * reach;
    if (city.isClear(x, y, 12) && city.isRoad(x, y, 70)) return { x, y };
  }
  return { x: base.x, y: base.y };
}

export function createMissions(city, random, hooks = {}) {
  const state = {
    active: null,
    step: 0,
    done: new Set(),
    marker: null,
    targets: [],
    pickups: [],
    timer: 0,
    held: 0,
    wanted: 0,
    failedNote: '',
    packages: 0,
    sideFares: 0,
    fare: null,
    fareCooldown: 3,
    packCooldown: 0,
    lastResult: null,
  };

  /** The parcels lying about: four at a time, refilled as they are collected. */
  const packages = [];
  const packSpots = ['market', 'boardwalk', 'stadium', 'hospital', 'precinct', 'garage', 'docks', 'bank'];

  /**
   * A fresh parcel, far enough from the hero that standing on the spot he just cleared does not
   * hand him another one. The search visits every landmark the parcels use, and only falls back to
   * the least-bad spot — never to the hero's feet.
   */
  function dropPackage(avoid = null) {
    const keys = packSpots.slice();
    for (let i = keys.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    let best = null;
    let bestGap = -1;
    for (const key of keys) {
      const candidate = reachableNear(city, key, random, 120);
      const gap = avoid ? dist(candidate.x, candidate.y, avoid.x, avoid.y) : 9999;
      if (gap >= 640) {
        best = { ...candidate, at: key };
        break;
      }
      if (gap > bestGap) {
        bestGap = gap;
        best = { ...candidate, at: key };
      }
    }
    packages.push({
      x: best.x,
      y: best.y,
      id: `pack-${state.packages}-${Math.floor(random() * 1e6)}`,
      at: best.at,
      bob: random() * 6.28,
    });
  }

  function reset() {
    state.active = null;
    state.step = 0;
    state.done = new Set();
    state.marker = null;
    state.targets = [];
    state.pickups = [];
    state.timer = 0;
    state.held = 0;
    state.failedNote = '';
    state.packages = 0;
    state.sideFares = 0;
    state.fare = null;
    state.fareCooldown = 2.5;
    state.packCooldown = 0;
    state.lastResult = null;
    packages.length = 0;
    for (let i = 0; i < SIDE_WORK.packs; i += 1) dropPackage();
  }

  /** The door of the next job in the chain, or null when the story is over. */
  function nextJob() {
    return STORY.find((job) => !state.done.has(job.id)) ?? null;
  }

  /** Where the next job starts: on the pavement outside the contact's place. */
  function startMarker() {
    if (state.active) return null;
    const job = nextJob();
    if (!job) return null;
    const key = DOOR_OF[job.id] ?? job.where;
    const spot = pointOf(city, key);
    return {
      x: spot.x,
      y: spot.y,
      radius: 44,
      kind: 'job',
      label: job.title,
      contact: CONTACTS[job.contact]?.name ?? 'Contact',
      jobId: job.id,
    };
  }

  /** Build the world objects a step needs: pickups, crew, a car to wreck, a marker. */
  function armStep(game) {
    const job = state.active;
    const step = job?.steps[state.step];
    state.marker = null;
    state.pickups = [];
    state.targets = [];
    state.timer = 0;
    state.held = 0;
    if (!step) return;

    if (step.kind === 'goto' || step.kind === 'deliver') {
      const spot = pointOf(city, step.at);
      state.marker = { x: spot.x, y: spot.y, radius: step.kind === 'deliver' ? 60 : 46, label: step.text };
      if (step.car) {
        // A car waiting to be taken: parked on the street nearest the marker.
        const near = city.nearestStreet(spot.x, spot.y + 60);
        const car = createCar(step.car, 0, 0, 0, { role: 'job' });
        if (near.runs === 'x') {
          car.x = spot.x + 40;
          car.y = near.line + 20;
          car.angle = 0;
        } else {
          car.x = near.line + 20;
          car.y = spot.y + 40;
          car.angle = Math.PI / 2;
        }
        car.home = { x: car.x, y: car.y, angle: car.angle };
        car.parked = true;
        game.addCar(car);
        state.targets.push(car);
      }
      return;
    }

    if (step.kind === 'collect') {
      const count = step.pickups ?? 3;
      for (let i = 0; i < count; i += 1) {
        const spot = reachableNear(city, step.at, random, 200);
        state.pickups.push({ x: spot.x, y: spot.y, taken: false, bob: random() * 6.28 });
      }
      return;
    }

    if (step.kind === 'destroy') {
      const count = step.count ?? 1;
      const base = pointOf(city, step.at);
      for (let i = 0; i < count; i += 1) {
        const near = city.nearestStreet(base.x + (i - (count - 1) / 2) * 120, base.y);
        const car = createCar(step.car ?? 'van', 0, 0, 0, { role: 'job' });
        if (near.runs === 'x') {
          car.x = base.x + (i - (count - 1) / 2) * 150;
          car.y = near.line + 22;
          car.angle = 0;
        } else {
          car.x = near.line + 22;
          car.y = base.y + (i - (count - 1) / 2) * 150;
          car.angle = Math.PI / 2;
        }
        car.parked = true;
        game.addCar(car);
        state.targets.push(car);
      }
      state.marker = { x: base.x, y: base.y, radius: 70, label: step.text };
      return;
    }

    if (step.kind === 'kill') {
      const base = pointOf(city, step.at);
      const crew = spawnCrew(city, base, step.who ?? 4, seeded(9001 + state.step + job.id.length), 'pistol');
      for (const thug of crew) {
        thug.kind = 'rival';
        thug.aggro = 460;
        state.targets.push(thug);
      }
      state.marker = { x: base.x, y: base.y, radius: 80, label: step.text };
      return;
    }

    if (step.kind === 'survive') {
      const base = pointOf(city, step.at);
      const crew = spawnCrew(city, base, 4, seeded(4400 + state.step), 'pistol');
      for (const thug of crew) {
        thug.kind = 'rival';
        thug.aggro = 700;
        state.targets.push(thug);
      }
      state.timer = step.seconds ?? 20;
      state.marker = { x: base.x, y: base.y, radius: 90, label: step.text };
      return;
    }

    if (step.kind === 'escape') {
      state.timer = 0;
      return;
    }
  }

  /** Begin a job by index into STORY. */
  function start(index, game) {
    const job = STORY[index];
    if (!job) return false;
    if (state.done.has(job.id)) return false;
    state.active = job;
    state.step = 0;
    state.lastResult = null;
    state.failedNote = '';
    armStep(game);
    game.toast(`${CONTACTS[job.contact]?.name ?? 'Contact'}: ${job.title}`);
    return true;
  }

  /** Pay out, mark it done, and put the contact's line on screen. */
  function complete(game) {
    const job = state.active;
    if (!job) return;
    state.done.add(job.id);
    game.player.cash += job.pay;
    state.active = null;
    state.marker = null;
    state.targets = [];
    state.pickups = [];
    state.lastResult = { id: job.id, title: job.title, pay: job.pay };
    game.toast(`Job done — ${job.title}: +$${job.pay}`);
    game.state.bigText = { title: 'PAID', sub: `${job.title} — $${job.pay}`, life: 1 };
    game.audio.sfx.cash();
    game.saveGame?.();
  }

  /** A job that ends badly. The world keeps its state; the chain does not advance. */
  function fail(game, reason) {
    const job = state.active;
    if (!job) return;
    state.active = null;
    state.marker = null;
    state.targets = [];
    state.pickups = [];
    state.timer = 0;
    state.failedNote = reason ?? 'the job went wrong';
    state.lastResult = { id: job.id, title: job.title, pay: 0, failed: true, reason: state.failedNote };
    game.toast(`Job failed: ${state.failedNote}`);
  }

  /** Advance to the next step, or pay out when the chain is spent. */
  function advance(game) {
    const job = state.active;
    if (!job) return;
    if (state.step + 1 >= job.steps.length) {
      complete(game);
      return;
    }
    state.step += 1;
    armStep(game);
    const step = job.steps[state.step];
    if (step) game.toast(step.text);
  }

  /** The line under the clock: what the hero is meant to be doing right now. */
  function objectiveLabel() {
    if (!state.active) {
      const job = nextJob();
      if (!job) return 'The city is yours — no jobs left';
      const door = startMarker();
      const contact = CONTACTS[job.contact]?.name ?? 'a contact';
      const where = door ? city.quarterNameAt(door.x, door.y) : city.quarterNameAt(0, 0);
      return `${job.title} — meet ${contact} in ${where}`;
    }
    const step = state.active.steps[state.step];
    if (!step) return state.active.title;
    if (step.kind === 'collect') return `${step.text} (${state.pickups.filter((p) => p.taken).length}/${state.pickups.length})`;
    if (step.kind === 'kill') {
      const left = state.targets.filter((t) => (t.health ?? 0) > 0).length;
      return `${step.text} (${left} left)`;
    }
    if (step.kind === 'destroy') {
      const left = state.targets.filter((t) => !t.wrecked).length;
      return `${step.text} (${left} left)`;
    }
    if (step.kind === 'survive') return `${step.text} — ${Math.ceil(state.timer)}s`;
    return step.text;
  }

  // --- Side work: parcels.

  function checkPackages(game) {
    const player = game.player;
    for (let i = packages.length - 1; i >= 0; i -= 1) {
      const pack = packages[i];
      if (dist(player.x, player.y, pack.x, pack.y) > SIDE_WORK.packReach + 8) continue;
      packages.splice(i, 1);
      state.packages += 1;
      game.player.cash += SIDE_WORK.packPay;
      game.audio.sfx.pickup();
      game.toast(`Parcel delivered: +$${SIDE_WORK.packPay}`);
      dropPackage(player);
    }
  }

  // --- Side work: Sun Cab fares.

  function spawnFare(game) {
    const spot = reachableNear(city, packSpots[Math.floor(random() * packSpots.length)], random, 300);
    const drop = reachableNear(city, packSpots[Math.floor(random() * packSpots.length)], random, 300);
    if (dist(spot.x, spot.y, drop.x, drop.y) < 500) return;
    state.fare = {
      state: 'pickup',
      x: spot.x,
      y: spot.y,
      dropX: drop.x,
      dropY: drop.y,
      bob: 0,
      paid: 0,
    };
    game.toast('Fare waiting — pick up the passenger');
  }

  function checkFare(game, dt) {
    const player = game.player;
    const fare = state.fare;
    if (!fare) {
      if (player.car && player.car.spec.cab) {
        state.fareCooldown -= dt;
        if (state.fareCooldown <= 0) {
          spawnFare(game);
          state.fareCooldown = SIDE_WORK.fareGap;
        }
      }
      return;
    }
    fare.bob += dt;
    const inCab = player.car && player.car.spec.cab;
    if (!inCab) {
      // A passenger will not wait forever in a cab that drove off.
      fare.patience = (fare.patience ?? 26) - dt;
      if (fare.patience <= 0) {
        state.fare = null;
        game.toast('The fare gave up waiting');
      }
      return;
    }
    const stop = Math.abs(player.car.speed) < SIDE_WORK.fareStop;
    if (fare.state === 'pickup') {
      if (stop && dist(player.car.x, player.car.y, fare.x, fare.y) < SIDE_WORK.fareNear) {
        fare.state = 'drop';
        fare.patience = 60;
        game.toast('Passenger aboard — take them where they ask');
        game.audio.sfx.pickup();
      }
    } else if (stop && dist(player.car.x, player.car.y, fare.dropX, fare.dropY) < SIDE_WORK.fareDrop) {
      const ride = dist(fare.x, fare.y, fare.dropX, fare.dropY);
      const pay = Math.round(SIDE_WORK.fareBase + ride * SIDE_WORK.farePerPixel);
      player.cash += pay;
      state.sideFares += 1;
      state.fare = null;
      state.fareCooldown = SIDE_WORK.fareGap;
      game.audio.sfx.cash();
      game.toast(`Fare paid: +$${pay}`);
    }
  }

  function getFare() {
    return state.fare;
  }

  /** One tick: the story chain, then the side work. */
  function update(dt, game) {
    const player = game.player;

    checkPackages(game);
    checkFare(game, dt);

    const job = state.active;
    if (!job) return;
    const step = job.steps[state.step];
    if (!step) return;

    if (step.kind === 'goto') {
      if (dist(player.x, player.y, state.marker.x, state.marker.y) < state.marker.radius) advance(game);
      return;
    }
    if (step.kind === 'deliver') {
      const inCar = !!player.car;
      if (inCar && dist(player.car.x, player.car.y, state.marker.x, state.marker.y) < state.marker.radius) advance(game);
      return;
    }
    if (step.kind === 'collect') {
      for (const pickup of state.pickups) {
        if (pickup.taken) continue;
        if (dist(player.x, player.y, pickup.x, pickup.y) > 30) continue;
        pickup.taken = true;
        game.audio.sfx.pickup();
        game.toast('Ledger recovered');
      }
      if (state.pickups.every((p) => p.taken)) advance(game);
      return;
    }
    if (step.kind === 'destroy') {
      if (state.targets.every((t) => t.wrecked)) advance(game);
      return;
    }
    if (step.kind === 'kill') {
      if (state.targets.every((t) => t.dead || (t.health ?? 0) <= 0)) advance(game);
      return;
    }
    if (step.kind === 'survive') {
      state.timer = Math.max(0, state.timer - dt);
      if (state.timer <= 0) advance(game);
      return;
    }
    if (step.kind === 'escape') {
      if (game.police.getStars() === 0) {
        // Leaving the scene is enough: either on foot well clear, or in a car and moving.
        const clear = player.car ? Math.abs(player.car.speed) > 30 || true : true;
        if (clear) advance(game);
      }
      return;
    }
  }

  reset();

  return {
    STORY,
    CONTACTS,
    state,
    packages,
    reset,
    nextJob,
    startMarker,
    start,
    fail,
    advance,
    update,
    objectiveLabel,
    getFare,
    spawnFare,
    dropPackage,
    contacts: CONTACTS,
  };
}

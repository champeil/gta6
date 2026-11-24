// The four stills. Every scene poses the running game through the same hooks a player has — put the
// hero behind a wheel, open a job, raise the heat, leave a fare waiting — then lets a short run of
// ordinary simulation settle the traffic and the light before main.js flags the page ready. No
// painter composes anything by hand, so each capture doubles as evidence that the systems agree: the
// stars in the corner come from the police meter, the objective line from the job in progress, the
// streets under the minimap from the same block list the collision index was built from.
import { COLORS } from './config.js';
import { createActor, spawnCrowd } from './actors.js';
import { createCar } from './vehicles.js';
import { clamp, rand } from './util.js';

/** Put the hero behind the wheel at a spot, with the camera already parked there. */
function wheelSeat(game, kind, x, y, angle, speed = 0, paint) {
  const car = game.spawnPlayerCar(kind, x, y, angle);
  if (paint) car.paint = paint;
  car.speed = speed;
  game.camera.x = x;
  game.camera.y = y;
  return car;
}

/** A cruiser posed where the frame wants it: bar lit, pointed at the hero, standing still. */
function prowler(game, x, y, angle) {
  const car = createCar('police', x, y, angle, { role: 'police' });
  car.siren = true;
  car.sirenPhase = rand(game.random, 0, 6.28);
  car.speed = 0;
  car.ai = { index: game.police.cars.length, deploy: 0, ram: 0 };
  game.police.cars.push(car);
  game.state.cars = game.traffic.cars.concat(game.traffic.parked);
  return car;
}

/** Bystanders standing about a point, each turned as though it were already going somewhere. */
function bystanders(game, x, y, count, spread = 140) {
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + 0.35;
    const reach = spread * rand(game.random, 0.45, 1.05);
    const px = x + Math.cos(angle) * reach;
    const py = y + Math.sin(angle) * reach;
    if (!game.city.isClear(px, py, 10)) continue;
    const ped = createActor('ped', px, py, { random: game.random });
    ped.angle = angle + Math.PI;
    ped.state = 'wait';
    ped.goal = null;
    ped.speed = 0;
    game.peds.push(ped);
  }
}

/** Slide civilian cars into a lane so the avenue is not empty behind the subject. */
function laneFill(game, x, y, count, spacing, angle) {
  const cars = game.traffic.cars;
  for (let i = 0; i < Math.min(count, cars.length); i += 1) {
    const car = cars[i];
    car.x = x + rand(game.random, -8, 8);
    car.y = y + i * spacing;
    car.angle = angle;
    car.speed = 70 + i * 7;
    if (car.route) {
      car.route.axis = Math.abs(Math.cos(angle)) > 0.5 ? 'x' : 'y';
      car.route.dir = Math.cos(angle) + Math.sin(angle) > 0 ? 1 : -1;
      car.route.line = car.route.axis === 'x' ? car.y : car.x;
    }
  }
}

/** A job mid-flight: opened for real, then wound forward to the step the frame wants. */
function windJob(game, index, stepIndex, markerAt) {
  game.missions.start(index, game);
  const job = game.missions.state.active;
  if (!job) return;
  game.missions.state.step = Math.min(stepIndex, job.steps.length - 1);
  const step = job.steps[game.missions.state.step];
  game.missions.state.marker = markerAt
    ? { x: markerAt.x, y: markerAt.y, radius: 46, label: step.text }
    : null;
  game.missions.state.timer = 0;
}

const SCENES = {
  /**
   * The cover, everything in one frame: a three-star pursuit down a downtown avenue at golden hour,
   * the job's objective card live, the minimap drawing the streets, cruisers' bars lit behind.
   */
  async cover(game) {
    game.state.screen = 'play';
    game.state.hour = 18.35;
    const avenue = game.city.lines[4];
    const cross = game.city.lines[5];
    const car = wheelSeat(game, 'sports', avenue + 21, cross + 90, -Math.PI / 2, 210, '#c9553f');
    car.paint = '#c9553f';
    game.player.cash = 4820;
    game.player.gun = 'pistol';
    game.player.ammo.pistol = 22;

    // A real job at its second step, so the objective line is the game's own text.
    windJob(game, 0, 1, { x: avenue + 40, y: cross - 150 });

    prowler(game, avenue - 21, cross + 250, -Math.PI / 2);
    prowler(game, avenue + 21, cross + 330, -Math.PI / 2);
    prowler(game, avenue - 21, cross + 410, -Math.PI / 2);
    game.police.addHeat(96, game.player);
    game.police.state.nextSpawn = 999;
    game.state.wanted = game.police.getStars();

    laneFill(game, avenue - 21, cross + 480, 4, 104, -Math.PI / 2);
    bystanders(game, avenue + 92, cross + 40, 5, 110);
    game.camera.x = game.player.x + 30;
    game.camera.y = game.player.y - 10;
    game.toast('Job: A First Favour');
  },

  /** The old quarter on foot at midday: kiosks, palms, a pavement with people on it. */
  async street(game) {
    game.state.screen = 'play';
    game.state.hour = 12.3;
    const block = game.city.blocks.find((b) => b.quarter === 'oldtown' && b.kind === 'built') ?? game.city.blocks[0];
    const x = block.x - 30;
    const y = block.y + block.h * 0.5;
    if (game.player.car) game.exitCar();
    game.player.x = x;
    game.player.y = y;
    game.player.angle = 0;
    game.player.gun = 'pistol';
    game.player.ammo.pistol = 34;
    game.player.cash = 1260;
    game.player.health = 88;
    game.camera.x = x + 46;
    game.camera.y = y - 6;
    bystanders(game, x + 34, y + 26, 13, 165);
    laneFill(game, x + 120, y - 260, 5, 96, Math.PI / 2);
    game.toast('Mira Ochoa: the kiosks open at ten. Do not be late.');
  },

  /** Mid-job at the marina: the hero rolling in, two rivals already on the planks, a parcel down. */
  async mission(game) {
    game.state.screen = 'play';
    game.state.hour = 16.4;
    const pier = game.city.pier;
    const x = pier.x - 150;
    const y = pier.y + pier.h / 2;
    wheelSeat(game, 'sedan', x, y, 0, 130);
    game.player.cash = 2340;
    game.player.gun = 'pistol';
    game.player.ammo.pistol = 30;
    game.player.health = 74;

    windJob(game, 2, 1, { x: pier.x + 40, y: pier.y + pier.h / 2 });

    for (let i = 0; i < 2; i += 1) {
      const rival = createActor('thug', pier.x + 26 + i * 18, pier.y + 14 + i * (pier.h - 30), {
        random: game.random,
        gun: 'pistol',
      });
      rival.kind = 'rival';
      rival.angle = Math.PI;
      rival.aggro = 600;
      game.missions.state.targets.push(rival);
    }
    game.missions.packages.push({ x: pier.x + 62, y: pier.y + 10, bob: 1.2, id: 'shot-pack', at: 'marina' });
    game.camera.x = x + 110;
    game.camera.y = y - 12;
    bystanders(game, x + 40, y + 80, 4, 90);
    game.toast('Mira Ochoa: three ledgers. Bring them back dry.');
  },

  /** Night on the harbour strip: a Sun Cab with a fare aboard, lamps lit, the bay glowing. */
  async night(game) {
    game.state.screen = 'play';
    game.state.hour = 21.7;
    const strip = game.city.lines[6];
    const avenue = game.city.lines[7];
    wheelSeat(game, 'taxi', avenue + 21, strip + 60, -Math.PI / 2, 80);
    game.player.cash = 3910;
    game.player.health = 84;
    game.player.gun = 'pistol';
    game.player.ammo.pistol = 12;

    game.missions.state.fare = {
      state: 'pickup',
      x: avenue + 74,
      y: strip - 56,
      dropX: avenue + 300,
      dropY: strip - 300,
      bob: 0,
      patience: 40,
    };
    game.missions.state.sideFares = 3;
    game.missions.state.packages = 2;

    laneFill(game, avenue + 21, strip + 320, 4, 112, -Math.PI / 2);
    laneFill(game, avenue - 21, strip - 360, 3, 112, Math.PI / 2);
    bystanders(game, avenue + 78, strip - 34, 6, 108);
    game.camera.x = avenue + 26;
    game.camera.y = strip - 10;
    game.toast('Fare aboard — Marina Pier, and step on it.');
  },
};

/** Pose a scene, settle it, and leave the frame ready to be captured. */
export async function setupShot(game, name) {
  const scene = SCENES[name] ?? SCENES.cover;
  // Let the world take a breath first so traffic is in its lanes and the crowd is placed.
  for (let i = 0; i < 8; i += 1) game.update(1 / 60);
  await scene(game);
  // Then a short run of ordinary simulation: cars glide, sirens blink, nothing is frozen.
  for (let i = 0; i < 22; i += 1) game.update(1 / 60);
  game.state.fade = 0;
  game.state.bigText = null;
  game.toasts.length = 0;
  game.camera.shake = 0;
  game.state.saveNote = '';
  void COLORS;
  void clamp;
  void spawnCrowd;
}

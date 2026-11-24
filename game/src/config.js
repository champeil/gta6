// Solara Bay's tuning sheet. Every number the simulation obeys is written once, here: the step,
// the street grid, the hero's legs and lungs, the four guns, the six car classes, the heat ladder
// the police climb, the prices the city charges, the side-work rates and the palette every painter
// shares. Modules import what they need and keep only layout numbers of their own, so the whole
// game can be rebalanced from this one file.

/** Fixed simulation step: 60 updates a second, whatever the display does. */
export const STEP = 1 / 60;

/** The names the title card, the HUD and the dialogue speak. */
export const CITY_NAME = 'Solara Bay';
export const HERO_NAME = 'Nico Vela';

/** The map is a square this many pixels wide; the bay takes its eastern rim. */
export const WORLD = 4400;

/**
 * The street grid. Ten lines on each axis, evenly spaced: `first` is the first centreline, `step`
 * the pitch, `half` half a normal carriageway (the two outer lines are the wider ring road), `lane`
 * how far a car keeps from the centre, `walk` the pavement strip between kerb and buildings.
 */
export const ROAD = {
  count: 10,
  first: 180,
  step: 380,
  half: 44,
  ringHalf: 62,
  lane: 21,
  walk: 34,
};

/** The beach band runs from the last street to the waterline at `water`. */
export const COAST = { sand: 3662, water: 3860 };

/** A compressed day: this many real seconds per 24 hours, starting at this hour. */
export const DAY = { length: 240, start: 10.5 };

/** On foot: body size, paces, health, and the punch the hero throws with bare hands. */
export const ON_FOOT = {
  radius: 11,
  walk: 132,
  run: 212,
  health: 100,
  punchDamage: 26,
  punchCooldown: 0.4,
  punchReach: 38,
  punchArc: 1.5,
  shield: 2,
};

/** The guns. More than one `pellet` is a shotgun; `spread` is in radians; `speed` px/second. */
export const GUNS = {
  fists: { label: 'Fists', damage: 26, cooldown: 0.4, range: 38, spread: 0.4, pellets: 0, speed: 0 },
  pistol: { label: 'Pistol', damage: 34, cooldown: 0.24, range: 560, spread: 0.045, pellets: 1, speed: 1500 },
  smg: { label: 'SMG', damage: 21, cooldown: 0.09, range: 520, spread: 0.09, pellets: 1, speed: 1500 },
  shotgun: { label: 'Shotgun', damage: 19, cooldown: 0.82, range: 320, spread: 0.23, pellets: 6, speed: 1200 },
};

/**
 * Car classes, in world pixels per second (a block is about 300 px). `turn` is radians per second
 * at full lock, `grip` how fast sideways slide dies (1 is glued, 0.78 slides), `mass` who wins a
 * shove, `toughness` how much gunfire and kerb the shell takes.
 */
export const CAR_CLASSES = {
  sedan: { label: 'Vela Sedan', length: 46, width: 22, accel: 430, top: 252, reverse: 112, turn: 2.5, grip: 0.86, mass: 1.0, toughness: 180 },
  taxi: { label: 'Sun Cab', length: 48, width: 23, accel: 402, top: 238, reverse: 106, turn: 2.4, grip: 0.84, mass: 1.05, toughness: 174, cab: true },
  van: { label: 'Cargo Van', length: 58, width: 27, accel: 326, top: 202, reverse: 92, turn: 2.0, grip: 0.9, mass: 1.6, toughness: 268 },
  sports: { label: 'Marlin GT', length: 44, width: 21, accel: 566, top: 358, reverse: 122, turn: 2.9, grip: 0.78, mass: 0.8, toughness: 124 },
  police: { label: 'Bay Police', length: 49, width: 23, accel: 474, top: 226, reverse: 122, turn: 2.8, grip: 0.85, mass: 1.1, toughness: 226, cruiser: true },
  pickup: { label: 'Ranchero', length: 52, width: 25, accel: 384, top: 228, reverse: 102, turn: 2.3, grip: 0.8, mass: 1.3, toughness: 214 },
};

/** Which class sits at a kerb: [class, weight] pairs. */
export const PARKED_MIX = [
  ['sedan', 32],
  ['taxi', 14],
  ['van', 9],
  ['sports', 13],
  ['pickup', 16],
];

/** Which class is being driven: mostly ordinary cars, a few cabs and vans. */
export const TRAFFIC_MIX = [
  ['sedan', 46],
  ['taxi', 18],
  ['van', 13],
  ['sports', 10],
  ['pickup', 13],
];

/** Heat needed per star, the ceiling, and how a quiet getaway cools the meter. */
export const HEAT = {
  at: [0, 12, 32, 62, 100, 150],
  max: 5,
  quiet: 9,
  cool: 5,
};

/** Police pressure per star: cruisers, spawn distance, arrest reach and how well they shoot. */
export const COPS = {
  perStar: 1,
  maxCars: 5,
  spawnMin: 700,
  spawnMax: 1100,
  arrestRange: 34,
  arrestSeconds: 1.1,
  sight: 560,
  alongside: 110,
  aim: [0, 0.2, 0.3, 0.38, 0.45, 0.52],
};

/** What the dispatcher says when the meter crosses a star. */
export const POLICE_TALK = [
  'All units, a report of a disturbance. Have a look.',
  'Suspect on the move. Units, close in.',
  'He is armed. Take care and take him down.',
  'Every unit in the quarter, converge. Now.',
  'This is the watch commander: shut the bridge. Nobody leaves.',
];

/** The opening wallet and the two bills the city hands out. */
export const PRICES = { start: 120, clinic: 150, impound: 250 };

/** Side work: Sun Cab fares and the courier parcels lying about the streets. */
export const SIDE_WORK = {
  fareNear: 44,
  fareDrop: 56,
  fareStop: 46,
  fareGap: 2.5,
  fareBase: 85,
  farePerPixel: 0.055,
  packs: 4,
  packReach: 28,
  packPay: 130,
};

/**
 * The palette: sun-bleached coral, cream and turquoise by day; indigo and sodium at night. Every
 * painter reads its colours from here, which is what keeps the city one picture.
 */
export const COLORS = {
  asphalt: '#43474f',
  asphaltEdge: '#35383f',
  kerb: '#b8b1a1',
  walkway: '#d7ccb4',
  dash: '#f1e5be',
  sand: '#efd9a3',
  sandWet: '#dfc68e',
  sea: '#2f9fb4',
  seaDeep: '#1d7b94',
  foam: '#c3eae3',
  grass: '#6aa257',
  grassStripe: 'rgba(97, 152, 79, 0.5)',
  path: '#c9b894',
  plaza: '#d9cbb0',
  shadow: 'rgba(26, 19, 12, 0.2)',
  lamp: 'rgba(255, 212, 138, 0.55)',
  panel: 'rgba(14, 18, 27, 0.76)',
  panelEdge: 'rgba(255, 240, 210, 0.16)',
  ink: '#f6efe1',
  gold: '#ffd66b',
  cash: '#8ce07a',
  health: '#e0574f',
  armour: '#5aa9e6',
  star: '#ffd34d',
  sirenA: '#4b7bff',
  sirenB: '#ec4040',
  tracer: '#ffe9a8',
  blood: '#a92b2b',
  smoke: '#4a4a48',
  fire: '#ff9a4a',
  water: '#1e7d96',
};

/** Per-district roof tints, so neighbourhoods read apart at a glance. */
export const TINTS = {
  downtown: ['#8fb4cf', '#a9c7dc', '#7d9fb9', '#c7dbe6'],
  midtown: ['#d8c39c', '#c9ae8a', '#e0cba8', '#bfae90'],
  oldtown: ['#e3a077', '#e8c07a', '#cf8f86', '#8fc4b2'],
  harbour: ['#9aa0a8', '#b0a08a', '#8b969d', '#a8a294'],
  suburbs: ['#e6d9bd', '#dcc0a8', '#cfd0b4', '#e0c8b0'],
  beach: ['#e8dcc0', '#f0d8b8', '#d8d8c0', '#e8c8a0'],
};

/** What the locals call each quarter; the map, the HUD and the job log use these. */
export const QUARTERS = {
  downtown: 'Solara Centro',
  midtown: 'Avenida Sol',
  oldtown: 'Barrio Viejo',
  harbour: 'Puerto Marisol',
  suburbs: 'Colinas Sur',
  beach: 'Playa Dorada',
};

/** Fixed addresses that jobs, fares and the map name. */
export const PLACES = {
  marina: { x: 3600, y: 1800, name: 'Marina Pier' },
  hospital: { x: 900, y: 3150, name: 'Clínica Sol' },
  precinct: { x: 2400, y: 450, name: 'Bay Precinct' },
  garage: { x: 600, y: 1650, name: 'Vela Garage' },
  boardwalk: { x: 3450, y: 3150, name: 'Boardwalk' },
  bank: { x: 1950, y: 1350, name: 'Banco del Sol' },
  docks: { x: 3150, y: 1350, name: 'Dock Nine' },
  stadium: { x: 1050, y: 2250, name: 'Estadio Coral' },
  market: { x: 2650, y: 2100, name: 'Mercado Viejo' },
};

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
export const MONO = '"Consolas", "DejaVu Sans Mono", monospace';

/** Browser storage key for the save file. */
export const SAVE_KEY = 'solara-bay.save.v1';

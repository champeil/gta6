// Boot. Sizes the canvas, builds the game, and runs a fixed-step loop with a catch-up cap so a tab
// that was in the background does not fast-forward the city. It also serves the four `?shot=`
// scenes (posed, drawn, then flagged ready for the capture script) and hangs the debug handle on
// window for the smoke tests.
import { createGame } from './game.js';
import { setupShot } from './shots.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || 20261124;
const scene = params.get('shot');

/** Fill the window at device resolution, capped so a huge monitor is not a huge simulation. */
function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(640, Math.floor(window.innerWidth * ratio));
  canvas.height = Math.max(400, Math.floor(window.innerHeight * ratio));
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}

resize();

const game = createGame(canvas, { seed, shot: scene });
window.__game = game;

window.addEventListener('resize', () => {
  resize();
  game.camera.x = Math.min(game.camera.x, game.city.size);
});

/** A one-line aria-live status, so the page reports itself to tests and to screen readers. */
let spoken = '';
function announce(text) {
  if (!status || text === spoken) return;
  spoken = text;
  status.textContent = text;
}

const FIXED = 1 / 60;
const MAX_STEPS = 4;
let previous = performance.now();
let accumulator = 0;
let frames = 0;
let window_ = 0;
let fps = 60;

function tick(now) {
  const raw = (now - previous) / 1000;
  previous = now;
  const elapsed = Math.min(raw, 0.25);
  accumulator += elapsed;

  let steps = 0;
  while (accumulator >= FIXED && steps < MAX_STEPS) {
    game.frame(FIXED);
    accumulator -= FIXED;
    steps += 1;
  }
  if (steps === MAX_STEPS) accumulator = 0;

  frames += 1;
  window_ += elapsed;
  if (window_ >= 0.5) {
    fps = Math.round(frames / window_);
    frames = 0;
    window_ = 0;
    announce(
      `${game.state.screen} · ${fps} fps · ${Math.round(game.player.x)},${Math.round(game.player.y)} · stars ${game.state.wanted}`,
    );
  }
  game.fps = fps;
  requestAnimationFrame(tick);
}

if (scene) {
  setupShot(game, scene).then(() => {
    for (let i = 0; i < 4; i += 1) game.frame(FIXED);
    window.__shotReady = true;
    window.__gameState = {
      scene,
      seed,
      hour: Number(game.state.hour.toFixed(2)),
      cash: Math.round(game.player.cash),
      stars: game.state.wanted,
      objective: game.missions.objectiveLabel(),
      job: game.missions.state.active?.title ?? null,
      traffic: game.traffic.cars.length,
      peds: game.peds.length,
      policeCars: game.police.cars.length,
      hasSave: game.hasSave(),
    };
    announce(`shot ${scene} ready`);
  });
} else {
  requestAnimationFrame(tick);
}

// Audio needs a gesture before it may start; the first press or click unlocks it.
window.addEventListener('keydown', () => game.audio.unlock(), { once: true });
window.addEventListener('pointerdown', () => game.audio.unlock(), { once: true });

// The clock and the light. One compressed day sets how dark the city is, whether the sodium lamps
// and the headlights are on, and how warm the evening wash reads. The renderer asks lightFor() once
// a frame; the HUD and the menus ask dayPhaseName() for a word. Nothing here paints anything.
import { DAY } from './config.js';
import { clamp } from './util.js';

/** The sun is up between these two hours; the darkness ramp is built around them. */
const DAWN_HOUR = 6.2;
const DUSK_HOUR = 18.9;

export function wrapHour(hour) {
  return ((hour % 24) + 24) % 24;
}

/** Advance the clock by dt seconds of play. */
export function advanceHour(hour, dt) {
  return (hour + (dt / DAY.length) * 24) % 24;
}

/**
 * The light at an hour. `night` runs 0 (full day) to about 0.9 (deep night); `warm` is the shoulder
 * around sunrise and sunset; `lit` says whether lamps and headlights are wanted.
 */
export function lightFor(hour) {
  const h = wrapHour(hour);
  const height = Math.sin(((h - DAWN_HOUR) / (DUSK_HOUR - DAWN_HOUR)) * Math.PI);
  const night = clamp((0.08 - height) / 0.5, 0, 1) * 0.9;
  const evening = clamp(1 - Math.abs(h - DUSK_HOUR) / 1.9, 0, 1);
  const morning = clamp(1 - Math.abs(h - DAWN_HOUR) / 1.7, 0, 1);
  return {
    night,
    warm: Math.max(evening, morning * 0.72),
    lit: night > 0.3,
    isNight: night > 0.45,
  };
}

export function lampsOn(hour) {
  return lightFor(hour).lit;
}

/** 0 at midnight, 1 at the next midnight: where the sun sits on a dial. */
export function dial(hour) {
  return wrapHour(hour) / 24;
}

/** A word for the hour, used on the title card and beside the clock. */
export function dayPhaseName(hour) {
  const h = wrapHour(hour);
  if (h < 5) return 'late night';
  if (h < 8) return 'early morning';
  if (h < 12) return 'morning';
  if (h < 15) return 'midday';
  if (h < 18) return 'afternoon';
  if (h < 21) return 'sunset';
  return 'night';
}

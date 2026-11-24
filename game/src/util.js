// Small maths and formatting, shared by everybody. Nothing in here knows a rule of the game: it is
// clamps, eased followers, distances, angle wrapping, circle-versus-box ejection, a seeded random
// source, the money and clock formatters, and the rounded-rect path the plates are built from. Any
// module may import it, and none of them can create a cycle through it.

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Walk `current` toward `target` by at most `rate * dt`; the camera and the menus use this. */
export function moveToward(current, target, rate, dt) {
  const gap = target - current;
  const step = rate * dt;
  if (Math.abs(gap) <= step) return target;
  return current + Math.sign(gap) * step;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** The signed angle from `from` to `to`, folded into -pi..pi. */
export function angleDelta(from, to) {
  let gap = (to - from) % (Math.PI * 2);
  if (gap > Math.PI) gap -= Math.PI * 2;
  if (gap < -Math.PI) gap += Math.PI * 2;
  return gap;
}

/** Turn `from` toward `to`, never further than `step` radians in one call. */
export function steerAngle(from, to, step) {
  const gap = angleDelta(from, to);
  if (Math.abs(gap) <= step) return to;
  return from + Math.sign(gap) * step;
}

export function circleInRect(cx, cy, radius, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  return dist2(cx, cy, nx, ny) < radius * radius;
}

export function overlapRects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function insideRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/**
 * Shove a round body { x, y, radius } out of a box along the shortest route, returning whether it
 * touched. Walkers, officers, rivals and cars all call this once per solid they overlap.
 */
export function eject(body, rect) {
  const nearX = clamp(body.x, rect.x, rect.x + rect.w);
  const nearY = clamp(body.y, rect.y, rect.y + rect.h);
  const dx = body.x - nearX;
  const dy = body.y - nearY;
  const d2 = dx * dx + dy * dy;
  if (d2 > body.radius * body.radius) return false;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    const shove = body.radius - d;
    body.x += (dx / d) * shove;
    body.y += (dy / d) * shove;
    return true;
  }
  // Dead centre: leave by whichever face is closest.
  const west = body.x - rect.x;
  const east = rect.x + rect.w - body.x;
  const north = body.y - rect.y;
  const south = rect.y + rect.h - body.y;
  const least = Math.min(west, east, north, south);
  if (least === west) body.x = rect.x - body.radius;
  else if (least === east) body.x = rect.x + rect.w + body.radius;
  else if (least === north) body.y = rect.y - body.radius;
  else body.y = rect.y + rect.h + body.radius;
  return true;
}

/** mulberry32: one seed lays out the same city, the same traffic and the same stills every visit. */
export function seeded(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rand(random, low, high) {
  return low + random() * (high - low);
}

export function randInt(random, low, high) {
  return Math.floor(low + random() * (high - low + 1));
}

export function pick(random, list) {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/** Draw from [[value, weight], ...]; the weights need not add up to anything in particular. */
export function pickWeighted(random, pairs) {
  let total = 0;
  for (const pair of pairs) total += pair[1];
  let roll = random() * total;
  for (const pair of pairs) {
    roll -= pair[1];
    if (roll <= 0) return pair[0];
  }
  return pairs[pairs.length - 1][0];
}

export function cashText(amount) {
  return '$' + Math.max(0, Math.round(amount)).toLocaleString('en-US');
}

export function timeText(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Delete one entry without keeping the order; every list here is a bag, not a queue. */
export function dropAt(list, index) {
  const last = list.length - 1;
  if (index !== last) list[index] = list[last];
  list.pop();
}

/** A rounded rectangle path: the HUD plates, the menu cards and the car shells all use it. */
export function roundRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Push a #rrggbb colour toward white (positive) or black (negative) by a ratio in -1..1. */
export function lighten(hex, amount) {
  const safe = hex.startsWith('#') ? hex : '#888888';
  const value = parseInt(safe.slice(1), 16);
  const channel = (part) =>
    Math.round(clamp(amount < 0 ? part * (1 + amount) : part + (255 - part) * amount, 0, 255));
  return `rgb(${channel((value >> 16) & 255)},${channel((value >> 8) & 255)},${channel(value & 255)})`;
}

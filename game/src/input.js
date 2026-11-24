// Keyboard and pointer, read once a frame. The keyboard is polled through a held-set plus a
// "pressed this frame" set that `endFrame` clears; the pointer is tracked in canvas pixels so the
// aim maths never has to think about CSS scaling. Nothing here decides what a key means.
export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const pointer = { x: canvas.width / 2, y: canvas.height / 2, down: false, clicked: false, moved: false };

  const swallow = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab',
    'F5', 'F9', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
  ]);

  function onKeyDown(event) {
    if (swallow.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    pressed.add(event.code);
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onBlur() {
    held.clear();
    pointer.down = false;
  }

  function localPoint(event) {
    const box = canvas.getBoundingClientRect();
    const sx = canvas.width / (box.width || canvas.width);
    const sy = canvas.height / (box.height || canvas.height);
    return {
      x: (event.clientX - box.left) * sx,
      y: (event.clientY - box.top) * sy,
    };
  }

  function onPointerMove(event) {
    const point = localPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.moved = true;
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const point = localPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.down = true;
    pointer.clicked = true;
    canvas.focus?.();
  }

  function onPointerUp() {
    pointer.down = false;
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.setAttribute('tabindex', '0');

  return {
    pointer,

    /** Was this key pressed since the last frame? Consumes the press. */
    take(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },

    isDown(code) {
      return held.has(code);
    },

    /** The movement stick, normalised to at most length one: WASD or the arrows. */
    axis() {
      let x = 0;
      let y = 0;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      if (held.has('KeyW') || held.has('ArrowUp')) y -= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y += 1;
      const mag = Math.hypot(x, y);
      if (mag > 1) {
        x /= mag;
        y /= mag;
      }
      return { x, y };
    },

    endFrame() {
      pressed.clear();
      pointer.clicked = false;
      pointer.moved = false;
    },

    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}

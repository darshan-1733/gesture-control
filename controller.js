// Turns recognised gestures into actions, with a cooldown per gesture.
// Pure logic: the page supplies the clock and the action callbacks.

export const DEFAULT_MAP = {
  "Thumbs Up": { action: "volumeUp", label: "Volume up", cooldownMs: 200 },
  "Fist": { action: "volumeDown", label: "Volume down", cooldownMs: 200 },
  "Peace": { action: "nextSlide", label: "Next slide", cooldownMs: 1000 },
  "Pointing": { action: "prevSlide", label: "Previous slide", cooldownMs: 1000 },
  // Open Palm is intentionally unmapped: it is the neutral "rest" gesture.
};

export class GestureController {
  constructor(handlers, map = DEFAULT_MAP, now = () => performance.now()) {
    this.handlers = handlers;
    this.map = map;
    this.now = now;
    this.lastFired = new Map();
  }

  /** Run the action mapped to `gesture` unless it is unmapped or still cooling down. */
  trigger(gesture) {
    const spec = this.map[gesture];
    if (!spec) return null;
    const t = this.now();
    const last = this.lastFired.get(gesture);
    if (last !== undefined && t - last < spec.cooldownMs) return null;
    const handler = this.handlers[spec.action];
    if (typeof handler !== "function") return null;
    handler();
    this.lastFired.set(gesture, t);
    return spec;
  }
}

/** Slide deck state: clamps at both ends. */
export class Deck {
  constructor(count) { this.count = count; this.index = 0; }
  next() { this.index = Math.min(this.index + 1, this.count - 1); return this.index; }
  prev() { this.index = Math.max(this.index - 1, 0); return this.index; }
}

/** Volume as an integer 0-100, in steps of 5, clamped. */
export function stepVolume(volume, delta) {
  return Math.max(0, Math.min(100, Math.round((volume + delta) / 5) * 5));
}

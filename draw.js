// Air drawing: turns the pointing finger into pen strokes. Pure logic, tested in Node.
//
//   Pointing    draw with the index fingertip
//   Fist/other  lift the pen (nothing is drawn)
//   Peace       switch to the next colour (once each time the gesture starts)
//   Open Palm   hold for 1 second to clear the canvas
//   Thumbs Up   save the picture (once each time the gesture starts)

export const COLORS = ["#5eead4", "#fbbf24", "#f87171", "#a78bfa", "#ffffff"];

export class AirPen {
  constructor({ alpha = 0.45, clearHoldMs = 1000, colorCooldownMs = 500, saveCooldownMs = 1500 } = {}) {
    this.alpha = alpha;                     // 0..1, lower = smoother but laggier lines
    this.clearHoldMs = clearHoldMs;
    this.colorCooldownMs = colorCooldownMs;
    this.saveCooldownMs = saveCooldownMs;
    this.colorIndex = 0;
    this.reset();
  }

  reset() {
    this.pos = null;
    this.lastGesture = null;
    this.openSince = null;
    this.clearedThisHold = false;
    this.lastColor = -Infinity;
    this.lastSave = -Infinity;
  }

  get color() { return COLORS[this.colorIndex]; }

  /**
   * gesture: smoothed gesture name; tip: {x, y} in 0..1 as the user sees it (mirrored), or null;
   * t: time in ms. Returns { segment, events } where segment is {from, to, color} or null,
   * and events is a list of "color" | "clear" | "save".
   */
  update(gesture, tip, t) {
    const events = [];
    let segment = null;

    if (gesture === "Pointing" && tip) {
      if (this.pos) {
        const to = {
          x: this.pos.x + this.alpha * (tip.x - this.pos.x),
          y: this.pos.y + this.alpha * (tip.y - this.pos.y),
        };
        segment = { from: { ...this.pos }, to, color: this.color };
        this.pos = to;
      } else {
        this.pos = { x: tip.x, y: tip.y };
      }
    } else {
      this.pos = null;
    }

    if (gesture !== this.lastGesture) {
      if (gesture === "Peace" && t - this.lastColor >= this.colorCooldownMs) {
        this.colorIndex = (this.colorIndex + 1) % COLORS.length;
        this.lastColor = t;
        events.push("color");
      }
      if (gesture === "Thumbs Up" && t - this.lastSave >= this.saveCooldownMs) {
        this.lastSave = t;
        events.push("save");
      }
    }

    if (gesture === "Open Palm") {
      if (this.openSince === null) this.openSince = t;
      else if (!this.clearedThisHold && t - this.openSince >= this.clearHoldMs) {
        this.clearedThisHold = true;
        events.push("clear");
      }
    } else {
      this.openSince = null;
      this.clearedThisHold = false;
    }

    this.lastGesture = gesture;
    return { segment, events };
  }

  /** 0..1 progress of the hold-to-clear gesture, for drawing a progress ring. */
  clearProgress(t) {
    if (this.openSince === null || this.clearedThisHold) return 0;
    return Math.min(1, (t - this.openSince) / this.clearHoldMs);
  }
}

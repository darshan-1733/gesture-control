// Gesture classification: a direct port of gesture_control/rules.py (same thresholds).
// Pure functions, no browser APIs, so they can be unit-tested in Node.

export const GESTURES = ["Open Palm", "Fist", "Thumbs Up", "Peace", "Pointing"];
export const NO_HAND = "No Hand";
export const UNKNOWN = "Unknown";

// MediaPipe hand landmark indices
const WRIST = 0;
const THUMB_IP = 3, THUMB_TIP = 4;
const INDEX_MCP = 5, INDEX_PIP = 6, INDEX_TIP = 8;
const MIDDLE_MCP = 9, MIDDLE_PIP = 10, MIDDLE_TIP = 12;
const RING_PIP = 14, RING_TIP = 16;
const PINKY_MCP = 17, PINKY_PIP = 18, PINKY_TIP = 20;

const FINGER_JOINTS = [
  [INDEX_TIP, INDEX_PIP],
  [MIDDLE_TIP, MIDDLE_PIP],
  [RING_TIP, RING_PIP],
  [PINKY_TIP, PINKY_PIP],
];

export const THUMB_RATIO = 1.10;      // thumb tip vs IP joint, measured from the pinky base
export const FINGER_RATIO = 1.05;     // fingertip vs PIP joint, measured from the wrist
export const THUMB_UP_MARGIN = 0.15;  // thumb tip must be this many hand-sizes above the index knuckle

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const handSize = (p) => dist(p[WRIST], p[MIDDLE_MCP]);

/** [thumb, index, middle, ring, pinky] -> true when the finger is extended. */
export function fingerStates(p) {
  const wrist = p[WRIST];
  const thumb = dist(p[THUMB_TIP], p[PINKY_MCP]) > dist(p[THUMB_IP], p[PINKY_MCP]) * THUMB_RATIO;
  const fingers = FINGER_JOINTS.map(([tip, pip]) => dist(p[tip], wrist) > dist(p[pip], wrist) * FINGER_RATIO);
  return [thumb, ...fingers];
}

/** Classify 21 landmarks ({x, y} each, image-relative) into a gesture name. */
export function classify(p) {
  const [thumb, index, middle, ring, pinky] = fingerStates(p);
  const othersFolded = !(index || middle || ring || pinky);

  if (thumb && index && middle && ring && pinky) return "Open Palm";

  if (othersFolded) {
    const raised = p[THUMB_TIP].y < p[INDEX_MCP].y - THUMB_UP_MARGIN * handSize(p);
    return thumb && raised ? "Thumbs Up" : "Fist";
  }
  if (index && middle && !ring && !pinky) return "Peace";
  if (index && !middle && !ring && !pinky) return "Pointing";
  return UNKNOWN;
}

/** Majority vote over the last `window` labels, so one noisy frame cannot flip the result. */
export class MajorityVoteSmoother {
  constructor(window = 7) {
    if (window < 1) throw new RangeError("window must be >= 1");
    this.window = window;
    this.buffer = [];
  }
  update(label) {
    this.buffer.push(label);
    if (this.buffer.length > this.window) this.buffer.shift();
    const counts = new Map();
    let best = label, bestCount = 0;
    for (const item of this.buffer) {
      const n = (counts.get(item) || 0) + 1;
      counts.set(item, n);
      if (n > bestCount) { best = item; bestCount = n; }
    }
    return best;
  }
  reset() { this.buffer = []; }
}

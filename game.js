// Rock-Paper-Scissors with your hand. Pure logic, tested in Node.
//
//   Fist = Rock     Open Palm = Paper     Peace = Scissors
//
// A round: countdown 3, 2, 1, then "Shoot!". The game watches your gesture for a short
// window after "Shoot!" and uses the one you held most. The computer's move is chosen when
// the round starts, so it can never react to yours.

export const MOVES = { "Fist": "Rock", "Open Palm": "Paper", "Peace": "Scissors" };
export const CPU_MOVES = ["Rock", "Paper", "Scissors"];
const BEATS = { Rock: "Scissors", Paper: "Rock", Scissors: "Paper" };

/** Outcome from the player's point of view: "win", "lose" or "draw". */
export function judge(player, cpu) {
  if (player === cpu) return "draw";
  return BEATS[player] === cpu ? "win" : "lose";
}

export class RpsGame {
  constructor({ rng = Math.random, stepMs = 800, steps = 3, sampleMs = 600 } = {}) {
    this.rng = rng;
    this.stepMs = stepMs;
    this.steps = steps;
    this.sampleMs = sampleMs;
    this.score = { win: 0, lose: 0, draw: 0 };
    this.phase = "idle";        // idle | countdown | shoot | result
    this.count = 0;
    this.player = null;
    this.cpu = null;
    this.result = null;         // "win" | "lose" | "draw" | "none" (no valid move seen)
    this.rounds = 0;
    this._t0 = 0;
    this._tShoot = 0;
    this._samples = [];
    this._cpuPick = null;
  }

  get busy() { return this.phase === "countdown" || this.phase === "shoot"; }

  /** Start a round. Returns false if one is already running. */
  start(t) {
    if (this.busy) return false;
    this.phase = "countdown";
    this._t0 = t;
    this.count = this.steps;
    this.player = null;
    this.cpu = null;
    this.result = null;
    this._cpuPick = CPU_MOVES[Math.min(2, Math.floor(this.rng() * 3))];
    return true;
  }

  /** Call every frame with the current time and gesture. Returns "resolved" when a round ends. */
  tick(t, gesture) {
    if (this.phase === "countdown") {
      const elapsed = t - this._t0;
      if (elapsed >= this.steps * this.stepMs) {
        this.phase = "shoot";
        this._tShoot = t;
        this._samples = [];
        this.count = 0;
      } else {
        this.count = this.steps - Math.floor(elapsed / this.stepMs);
      }
    }
    if (this.phase === "shoot") {
      this._samples.push(gesture);
      if (t - this._tShoot >= this.sampleMs) return this._resolve();
    }
    return null;
  }

  _resolve() {
    const counts = new Map();
    let best = null, bestCount = 0;
    for (const g of this._samples) {
      if (!(g in MOVES)) continue;
      const n = (counts.get(g) || 0) + 1;
      counts.set(g, n);
      if (n >= bestCount) { best = g; bestCount = n; }   // ties go to the most recent
    }
    this.phase = "result";
    this.rounds += 1;
    if (best === null) {
      this.result = "none";
      return "resolved";
    }
    this.player = MOVES[best];
    this.cpu = this._cpuPick;
    this.result = judge(this.player, this.cpu);
    this.score[this.result] += 1;
    return "resolved";
  }

  resetScore() {
    this.score = { win: 0, lose: 0, draw: 0 };
    this.rounds = 0;
    this.phase = "idle";
    this.player = this.cpu = this.result = null;
  }
}

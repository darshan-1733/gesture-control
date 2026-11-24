import { GESTURES, NO_HAND, UNKNOWN, classify, MajorityVoteSmoother } from "./gestures.js";
import { GestureController, Deck, DEFAULT_MAP, stepVolume } from "./controller.js";
import { AirPen, COLORS } from "./draw.js";
import { RpsGame, MOVES } from "./game.js";

// MediaPipe is loaded on demand so the page itself still works if the CDN is unreachable.
const MP_VERSION = "0.10.14";
const MP_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_LOCAL = "models/hand_landmarker.task"; // optional: drop the model here to run fully offline
const MODEL_REMOTE = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const $ = (id) => document.getElementById(id);
const el = {
  video: $("video"), overlay: $("overlay"), hud: $("hud"), gesture: $("gesture"), fps: $("fps"),
  toast: $("toast"), placeholder: $("placeholder"), error: $("error"), start: $("start"), stop: $("stop"),
  control: $("control"), controlState: $("control-state"),
  slides: $("slides"), dots: $("dots"), count: $("count"), prev: $("prev"), next: $("next"),
  meter: $("meter"), fill: $("fill"), volNum: $("vol-num"), volUp: $("vol-up"), volDown: $("vol-down"),
  tone: $("tone"), file: $("file"), player: $("player"), guideBody: $("guide-body"),
  // version 2: modes
  modeTabs: [...document.querySelectorAll(".mode")], hint: $("hint"), guide: $("guide"),
  panelControl: $("panel-control"), panelDraw: $("panel-draw"), panelGame: $("panel-game"),
  paper: $("paper"), paperEmpty: $("paper-empty"), swatch: $("swatch"), swatchName: $("swatch-name"),
  paperColor: $("paper-color"), paperClear: $("paper-clear"), paperSave: $("paper-save"),
  gWin: $("g-win"), gDraw: $("g-draw"), gLose: $("g-lose"), gCall: $("g-call"), gVs: $("g-vs"),
  gPlay: $("g-play"), gReset: $("g-reset"), gSeen: $("g-seen"),
};

/* ---------------------------------------------------------------- slides */
const SLIDES = [
  { kicker: "Project", title: "Touchless control with hand gestures", body: "<p>A webcam, MediaPipe and a few lines of geometry. No gloves, no sensors, no server.</p>" },
  { kicker: "Pipeline", title: "From pixels to actions", body: "<ul><li>Camera frame</li><li>21 hand landmarks</li><li>Finger pattern to gesture</li><li>Smoothing and cooldown</li><li>Slide or volume action</li></ul>" },
  { kicker: "Gestures", title: "Five gestures, five jobs", body: "<ul><li>Peace: next slide</li><li>Pointing: previous slide</li><li>Thumbs Up and Fist: volume</li><li>Open Palm: rest</li></ul>" },
  { kicker: "Privacy", title: "Your video stays on your device", body: "<p>Detection runs inside this tab. Frames are never uploaded or stored.</p>" },
];
const deck = new Deck(SLIDES.length);

function buildDeck() {
  el.slides.innerHTML = SLIDES.map((s, i) =>
    `<article class="slide${i === 0 ? " active" : ""}" aria-label="Slide ${i + 1} of ${SLIDES.length}"><span class="kicker">${s.kicker}</span><h3>${s.title}</h3>${s.body}</article>`).join("");
  el.dots.innerHTML = SLIDES.map((_, i) => `<span class="dot${i === 0 ? " on" : ""}"></span>`).join("");
  renderDeck();
}
function renderDeck() {
  [...el.slides.children].forEach((s, i) => s.classList.toggle("active", i === deck.index));
  [...el.dots.children].forEach((d, i) => d.classList.toggle("on", i === deck.index));
  el.count.textContent = `${deck.index + 1} / ${deck.count}`;
  el.prev.disabled = deck.index === 0;
  el.next.disabled = deck.index === deck.count - 1;
}

/* ---------------------------------------------------------------- volume */
let volume = 50;
let audioCtx = null, toneGain = null, toneOscs = [], toneOn = false;

function applyVolume() {
  el.fill.style.width = `${volume}%`;
  el.volNum.textContent = String(volume);
  el.meter.setAttribute("aria-valuenow", String(volume));
  el.player.volume = volume / 100;
  if (toneGain) toneGain.gain.setTargetAtTime((volume / 100) * 0.25, audioCtx.currentTime, 0.02);
  el.fill.classList.add("fired");
  clearTimeout(applyVolume.t);
  applyVolume.t = setTimeout(() => el.fill.classList.remove("fired"), 250);
}
function toggleTone() {
  if (!toneOn) {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    toneGain = audioCtx.createGain();
    toneGain.gain.value = (volume / 100) * 0.25;
    toneGain.connect(audioCtx.destination);
    toneOscs = [220, 277.18, 329.63].map((f) => { // A minor-ish pad
      const o = audioCtx.createOscillator(); o.type = "sine"; o.frequency.value = f; o.connect(toneGain); o.start(); return o;
    });
    audioCtx.resume();
    toneOn = true; el.tone.textContent = "Stop test tone";
  } else {
    toneOscs.forEach((o) => o.stop()); toneOscs = []; toneGain.disconnect(); toneGain = null;
    toneOn = false; el.tone.textContent = "Play test tone";
  }
}

/* ---------------------------------------------------------------- actions */
let toastTimer = 0;
function flash(text) {
  el.toast.textContent = `→ ${text}`;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 900);
}
const handlers = {
  nextSlide: () => { deck.next(); renderDeck(); },
  prevSlide: () => { deck.prev(); renderDeck(); },
  volumeUp: () => { volume = stepVolume(volume, 5); applyVolume(); },
  volumeDown: () => { volume = stepVolume(volume, -5); applyVolume(); },
};
const controller = new GestureController(handlers);

/* ---------------------------------------------------------------- guide table */
const HOW = {
  "Open Palm": "All five fingers spread, palm to the camera",
  "Fist": "All fingers closed",
  "Thumbs Up": "Fist with the thumb pointing up",
  "Peace": "Index and middle fingers up",
  "Pointing": "Only the index finger up",
};
function buildGuide() {
  el.guideBody.innerHTML = GESTURES.map((g) => {
    const spec = DEFAULT_MAP[g];
    const action = spec ? spec.label : '<span class="none">None (rest)</span>';
    const tryBtn = spec ? `<button class="btn" type="button" data-try="${g}">Try</button>` : "";
    return `<tr data-g="${g}"><td>${g}</td><td>${HOW[g]}</td><td>${action}</td><td class="act">${tryBtn}</td></tr>`;
  }).join("");
  el.guideBody.addEventListener("click", (e) => {
    const b = e.target.closest("[data-try]");
    if (!b) return;
    const spec = DEFAULT_MAP[b.dataset.try];
    handlers[spec.action]();
  });
}
function highlightRow(gesture) {
  for (const row of el.guideBody.children) row.classList.toggle("live", row.dataset.g === gesture);
}

/* ---------------------------------------------------------------- modes */
const COLOR_NAMES = ["Teal", "Amber", "Red", "Violet", "White"];
const HINTS = {
  control: "Turn control on, then hold a gesture for about half a second. Use <b>Open Palm</b> to rest without triggering anything.",
  draw: "Point with one finger to draw. A fist lifts the pen. Peace changes colour, a held open palm clears, thumbs up saves.",
  game: "Press Play round. After the countdown, show <b>Fist</b> (rock), <b>Open Palm</b> (paper) or <b>Peace</b> (scissors).",
};
const pen = new AirPen();
const game = new RpsGame();
const paper = el.paper.getContext("2d");
let mode = "control";
let paperUsed = false;

function setText(node, text) { if (node.textContent !== text) node.textContent = text; }

function setMode(next) {
  mode = next;
  for (const b of el.modeTabs) {
    const on = b.dataset.mode === next;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", String(on));
  }
  el.panelControl.hidden = next !== "control";
  el.panelDraw.hidden = next !== "draw";
  el.panelGame.hidden = next !== "game";
  el.guide.hidden = next !== "control";
  el.hint.innerHTML = HINTS[next];
  pen.reset();
  smoother.reset();
  if (game.busy) game.phase = "idle";
  if (next !== "control") { el.control.checked = false; setControl(false); }
  syncAvailability();
  renderGame(NO_HAND);
}

/** Enable or disable controls that need a running camera or the Control mode. */
function syncAvailability() {
  el.control.disabled = !stream || mode !== "control";
  el.gPlay.disabled = !stream;
}

/* ---- air draw */
function updateSwatch() {
  el.swatch.style.background = pen.color;
  setText(el.swatchName, COLOR_NAMES[pen.colorIndex]);
}
function nextColor() {
  pen.colorIndex = (pen.colorIndex + 1) % COLORS.length;
  updateSwatch();
}
function markPaperUsed() {
  if (paperUsed) return;
  paperUsed = true;
  el.paperEmpty.hidden = true;
}
function clearPaper() {
  paper.clearRect(0, 0, el.paper.width, el.paper.height);
  paperUsed = false;
  el.paperEmpty.hidden = false;
}
function savePaper() {
  const out = document.createElement("canvas");
  out.width = el.paper.width; out.height = el.paper.height;
  const o = out.getContext("2d");
  o.fillStyle = "#0f1519"; o.fillRect(0, 0, out.width, out.height);
  o.drawImage(el.paper, 0, 0);
  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "air-drawing.png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
function drawPenCursor(points, label, t) {
  if (!points) return;
  const w = el.overlay.width, h = el.overlay.height, tip = points[8];
  ctx.beginPath();
  ctx.arc(tip.x * w, tip.y * h, label === "Pointing" ? 9 : 13, 0, Math.PI * 2);
  ctx.lineWidth = 3; ctx.strokeStyle = pen.color; ctx.fillStyle = pen.color;
  if (label === "Pointing") ctx.fill(); else ctx.stroke();
  const progress = pen.clearProgress(t);
  if (progress > 0) { // ring that fills while an open palm is held to clear
    const c = points[9];
    ctx.beginPath();
    ctx.arc(c.x * w, c.y * h, 34, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.lineWidth = 6; ctx.strokeStyle = "#fbbf24"; ctx.stroke();
  }
}
function handleDraw(label, points, t) {
  const tip = points ? { x: 1 - points[8].x, y: points[8].y } : null; // mirrored, as the user sees it
  const { segment, events } = pen.update(label, tip, t);
  if (segment) {
    const W = el.paper.width, H = el.paper.height;
    paper.strokeStyle = segment.color; paper.lineWidth = 6; paper.lineCap = "round"; paper.lineJoin = "round";
    paper.beginPath();
    paper.moveTo(segment.from.x * W, segment.from.y * H);
    paper.lineTo(segment.to.x * W, segment.to.y * H);
    paper.stroke();
    markPaperUsed();
  }
  for (const ev of events) {
    if (ev === "color") { updateSwatch(); flash(`Colour: ${COLOR_NAMES[pen.colorIndex]}`); }
    else if (ev === "clear") { clearPaper(); flash("Cleared"); }
    else if (ev === "save") { savePaper(); flash("Saved"); }
  }
  drawPenCursor(points, label, t);
}

/* ---- rock paper scissors */
function renderGame(label) {
  setText(el.gWin, String(game.score.win));
  setText(el.gDraw, String(game.score.draw));
  setText(el.gLose, String(game.score.lose));

  let call = "Ready?", cls = "", vs = "Press Play round, then show your move when it says Shoot.";
  if (game.phase === "countdown") { call = String(game.count); vs = "Get your hand ready."; }
  else if (game.phase === "shoot") { call = "Shoot!"; cls = "go"; vs = "Hold your move."; }
  else if (game.phase === "result") {
    if (game.result === "none") { call = "No move seen"; vs = "Show Fist, Open Palm or Peace right after the countdown."; }
    else {
      call = game.result === "win" ? "You win" : game.result === "lose" ? "Computer wins" : "Draw";
      cls = game.result === "draw" ? "" : game.result;
      vs = `You: ${game.player}. Computer: ${game.cpu}.`;
    }
  }
  setText(el.gCall, call);
  el.gCall.className = `call ${cls}`.trim();
  setText(el.gVs, vs);
  setText(el.gSeen, stream ? (MOVES[label] ? `You are showing: ${MOVES[label]}` : "Show your hand") : "Start the camera to play");
}
function handleGame(label, t) {
  if (game.busy) game.tick(t, label);
  renderGame(label);
}

/* ---------------------------------------------------------------- camera + detection */
let stream = null, landmarker = null, rafId = 0, connections = [];
let controlOn = false, lastVideoTime = -1, fps = 0, lastFrame = performance.now();
const smoother = new MajorityVoteSmoother(7);
const ctx = el.overlay.getContext("2d");

function showError(message) { el.error.textContent = message; el.error.hidden = false; }

async function modelUrl() {
  try { const r = await fetch(MODEL_LOCAL, { method: "HEAD" }); if (r.ok) return MODEL_LOCAL; } catch { /* use remote */ }
  return MODEL_REMOTE;
}

async function createLandmarker() {
  const { HandLandmarker, FilesetResolver } = await import(MP_MODULE);
  connections = HandLandmarker.HAND_CONNECTIONS;
  const vision = await FilesetResolver.forVisionTasks(MP_WASM);
  const modelAssetPath = await modelUrl();
  const options = (delegate) => ({
    baseOptions: { modelAssetPath, delegate },
    runningMode: "VIDEO", numHands: 1,
    minHandDetectionConfidence: 0.7, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6,
  });
  try { return await HandLandmarker.createFromOptions(vision, options("GPU")); }
  catch { return await HandLandmarker.createFromOptions(vision, options("CPU")); }
}

async function startCamera() {
  el.error.hidden = true;
  el.start.disabled = true; el.start.textContent = "Starting…";
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot access the camera. Open the page over https:// or on localhost.");
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false });
    el.video.srcObject = stream;
    await el.video.play();
    el.start.textContent = "Loading hand model…";
    try {
      landmarker = landmarker || await createLandmarker();
    } catch (loadErr) {
      console.error(loadErr);
      throw new Error("The hand-detection model could not be loaded. Check your internet connection and try again, or put hand_landmarker.task in the models folder to run offline.");
    }
  } catch (err) {
    stopCamera();
    const name = err && err.name;
    if (name === "NotAllowedError") showError("Camera permission was denied. Allow camera access in the address bar, then try again.");
    else if (name === "NotFoundError") showError("No camera was found on this device.");
    else if (name === "NotReadableError") showError("The camera is in use by another app. Close it and try again.");
    else showError(`Could not start: ${err && err.message ? err.message : err}`);
    return;
  }
  el.overlay.width = el.video.videoWidth || 640;
  el.overlay.height = el.video.videoHeight || 480;
  el.placeholder.hidden = true; el.hud.hidden = false; el.stop.hidden = false;
  el.start.disabled = false; el.start.textContent = "Start camera";
  syncAvailability();
  renderGame(NO_HAND);
  lastVideoTime = -1;
  loop();
}

function stopCamera() {
  cancelAnimationFrame(rafId);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null; el.video.srcObject = null;
  ctx.clearRect(0, 0, el.overlay.width, el.overlay.height);
  smoother.reset(); highlightRow(null);
  el.placeholder.hidden = false; el.hud.hidden = true; el.stop.hidden = true;
  el.start.disabled = false; el.start.textContent = "Start camera";
  el.control.checked = false; setControl(false);
  pen.reset();
  if (game.busy) game.phase = "idle";
  syncAvailability();
  renderGame(NO_HAND);
}

function drawHand(points) {
  const w = el.overlay.width, h = el.overlay.height;
  ctx.clearRect(0, 0, w, h);
  if (!points) return;
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(94, 234, 212, 0.9)"; ctx.lineCap = "round";
  for (const c of connections) {
    const a = points[c.start], b = points[c.end];
    ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  for (const p of points) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2); ctx.fill(); }
}

function loop() {
  rafId = requestAnimationFrame(loop);
  if (!landmarker || el.video.readyState < 2 || el.video.currentTime === lastVideoTime) return;
  lastVideoTime = el.video.currentTime;

  const now = performance.now();
  const result = landmarker.detectForVideo(el.video, now);
  const points = result.landmarks && result.landmarks[0];
  drawHand(points);

  let label = NO_HAND;
  if (points) label = smoother.update(classify(points));
  else smoother.reset();

  el.gesture.textContent = label;
  el.gesture.classList.toggle("idle", label === NO_HAND || label === UNKNOWN);
  highlightRow(GESTURES.includes(label) ? label : null);

  if (mode === "control") {
    if (controlOn) {
      const fired = controller.trigger(label);
      if (fired) flash(fired.label);
    }
  } else if (mode === "draw") {
    handleDraw(label, points, now);
  } else if (mode === "game") {
    handleGame(label, now);
  }

  fps = fps ? fps * 0.9 + (1000 / Math.max(now - lastFrame, 1)) * 0.1 : 1000 / Math.max(now - lastFrame, 1);
  lastFrame = now;
  el.fps.textContent = `${Math.round(fps)} FPS`;
}

function setControl(on) {
  controlOn = on;
  el.controlState.textContent = on ? "on" : "off";
}

/* ---------------------------------------------------------------- wiring */
el.start.addEventListener("click", startCamera);
el.stop.addEventListener("click", stopCamera);
el.control.addEventListener("change", () => setControl(el.control.checked));
el.prev.addEventListener("click", handlers.prevSlide);
el.next.addEventListener("click", handlers.nextSlide);
el.volUp.addEventListener("click", handlers.volumeUp);
el.volDown.addEventListener("click", handlers.volumeDown);
el.tone.addEventListener("click", toggleTone);
el.file.addEventListener("change", () => {
  const f = el.file.files && el.file.files[0];
  if (!f) return;
  el.player.src = URL.createObjectURL(f);
  el.player.play().catch(() => { /* needs a click first on some browsers; the click that chose the file counts */ });
});
document.addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === "ArrowRight") handlers.nextSlide();
  else if (e.key === "ArrowLeft") handlers.prevSlide();
  else if (e.key === "ArrowUp") handlers.volumeUp();
  else if (e.key === "ArrowDown") handlers.volumeDown();
});
window.addEventListener("pagehide", () => { if (stream) stopCamera(); });

for (const b of el.modeTabs) b.addEventListener("click", () => setMode(b.dataset.mode));
el.paperColor.addEventListener("click", nextColor);
el.paperClear.addEventListener("click", clearPaper);
el.paperSave.addEventListener("click", savePaper);
el.gPlay.addEventListener("click", () => { if (stream && game.start(performance.now())) renderGame(NO_HAND); });
el.gReset.addEventListener("click", () => { game.resetScore(); renderGame(NO_HAND); });

buildDeck();
buildGuide();
applyVolume();
el.fill.classList.remove("fired");
updateSwatch();
setMode("control");

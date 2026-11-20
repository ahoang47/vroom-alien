import { TARGET_TAKEDOWNS, START_TIME, TIME_BONUS, SCORE_TAKEDOWN, SCORE_BONUS } from './config.js';
import { createTrack } from './track.js';
import { createSimulation } from './sim.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createView } from './render.js';
import { selfTest } from './stack.js';
import { buildGarage, facesForward } from './art.js';
import { readPad } from './controls.js';

const keys = new Set();

const game = {
  mode: 'menu',
  timer: START_TIME,
  takedowns: 0,
  bonus: 0,
  score: 0,
  slow: 0,
  shake: 0,
  dieT: 0,
  reason: '',
  won: false,
  chain: 0,
  chainT: 0,
};

const DEBUGS = [
  null,
  { turn: 0, squash: 1, spacing: 1, label: 'squash 1, turn 0, spacing 1' },
  { turn: 0, squash: 0.75, spacing: 1, label: 'squash 0.75' },
  { turn: Math.PI / 2, squash: 0.75, spacing: 1, label: 'turn 90, squash 0.75' },
  { turn: 0, squash: 1, spacing: 0, label: 'spacing 0, squash 1 (flat)' },
  { turn: 0, squash: 1, spacing: 2, label: 'spacing 2' },
];

let debugIndex = 0;

const canvas = document.getElementById('view');
const bootError = document.getElementById('boot-error');
const debugEl = document.getElementById('debug');

function showBoot(message) {
  bootError.hidden = false;
  bootError.textContent = message;
  console.error(message);
}

const stackChecks = selfTest();
if (!stackChecks.ok) {
  const msg = stackChecks.checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`).join('; ');
  showBoot(`Sprite stack checks failed. ${msg}`);
}
const garage = buildGarage();
if (!facesForward(garage.player) || garage.rivals.some((s) => !facesForward(s)) || garage.traffic.some((s) => !facesForward(s))) {
  showBoot('Car art is facing the wrong way on the slice sheet.');
}

const track = createTrack();
const audio = createAudio();
const hud = createHud(track);
const sim = createSimulation(track);

let view;
try {
  view = createView(canvas, track);
  view.warm(sim.player.x, sim.player.z);
  view.resize();
} catch (err) {
  showBoot(err && err.message ? err.message : 'The freeway failed to start.');
}

const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const resultsEl = document.getElementById('results');
const resTitle = document.getElementById('res-title');
const resDeck = document.getElementById('res-deck');
const resStats = document.getElementById('res-stats');

function inputState() {
  return { mode: game.mode, ...readPad(keys) };
}

function toggleFullscreen() {
  const root = document.documentElement;
  if (!document.fullscreenElement) {
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (req) req.call(root).catch(() => {});
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) exit.call(document).catch(() => {});
  }
}

function resultCopy() {
  if (game.won && game.reason === 'time') {
    return {
      title: 'Event cleared',
      deck: 'Road Rage target met. You rode the clock out and kept the bonus.',
    };
  }
  if (game.won) {
    return {
      title: 'Event cleared',
      deck: 'Road Rage target met. The bonus run ended when the car gave out.',
    };
  }
  if (game.reason === 'time') {
    return {
      title: 'Time up',
      deck: 'The clock died before Road Rage was finished.',
    };
  }
  if (game.reason === 'headon') {
    return {
      title: 'Head-on',
      deck: 'Nose-to-nose with traffic. The car is scrap, and the target was still open.',
    };
  }
  return {
    title: 'Wrecked',
    deck: 'The car is totaled. Road Rage needed more takedowns than the hull had left.',
  };
}

function show(el, on) {
  el.classList.toggle('hidden', !on);
}

function updateDebug() {
  const spec = DEBUGS[debugIndex];
  if (!spec) {
    debugEl.classList.add('hidden');
    debugEl.textContent = '';
    return;
  }
  const lines = stackChecks.checks.map((c) => `${c.pass ? 'ok' : 'FAIL'}  ${c.name}`);
  debugEl.textContent = `${spec.label}\n${lines.join('\n')}`;
  debugEl.classList.remove('hidden');
}

function showMenu() {
  game.mode = 'menu';
  sim.reset();
  hud.setVisible(false);
  show(menuEl, true);
  show(pauseEl, false);
  show(resultsEl, false);
}

function startGame() {
  audio.unlock();
  audio.ui();
  sim.reset();
  game.mode = 'play';
  game.timer = START_TIME;
  game.takedowns = 0;
  game.bonus = 0;
  game.score = 0;
  game.slow = 0;
  game.shake = 0;
  game.dieT = 0;
  game.reason = '';
  game.won = false;
  game.chain = 0;
  game.chainT = 0;
  hud.setVisible(true);
  show(menuEl, false);
  show(pauseEl, false);
  show(resultsEl, false);
  if (view) view.warm(sim.player.x, sim.player.z);
}

function pauseGame() {
  if (game.mode !== 'play') return;
  game.mode = 'pause';
  show(pauseEl, true);
}

function resumeGame() {
  if (game.mode !== 'pause') return;
  audio.ui();
  game.mode = 'play';
  show(pauseEl, false);
}

function finish(reason) {
  if (game.mode !== 'play') return;
  game.reason = reason;
  game.won = game.takedowns >= TARGET_TAKEDOWNS;
  game.mode = 'dying';
  if (reason === 'time') {
    game.dieT = 0.85;
    hud.callout(game.won ? 'TIME UP' : 'TIME UP');
    return;
  }
  game.dieT = 1.5;
  game.slow = 0.7;
  game.shake = Math.max(game.shake, 1);
  sim.wreckPlayer();
  audio.crash();
  hud.flash('crash');
  hud.callout(reason === 'headon' ? 'HEAD-ON' : 'WRECKED');
}

function openResults() {
  game.mode = 'over';
  const copy = resultCopy();
  resTitle.textContent = copy.title;
  resTitle.classList.toggle('win', game.won);
  resTitle.classList.toggle('lose', !game.won);
  resDeck.textContent = copy.deck;
  const bonusLine = game.bonus > 0 ? `<div><span>Bonus takedowns</span><b>${game.bonus}</b></div>` : '';
  resStats.innerHTML = `
    <div><span>Takedowns</span><b>${game.takedowns} / ${TARGET_TAKEDOWNS}</b></div>
    ${bonusLine}
    <div><span>Score</span><b>${game.score.toLocaleString('en-US')}</b></div>
  `;
  hud.setVisible(false);
  show(resultsEl, true);
}

const hooks = {
  takedown(how) {
    if (game.mode !== 'play') return;
    const before = game.takedowns;
    game.takedowns += 1;
    if (before < TARGET_TAKEDOWNS) {
      game.timer += TIME_BONUS;
      game.score += SCORE_TAKEDOWN;
      hud.plus();
    } else {
      game.bonus += 1;
      game.score += SCORE_BONUS;
    }
    const now = performance.now() / 1000;
    if (now - game.chainT < 1.15) game.chain += 1;
    else game.chain = 1;
    game.chainT = now;
    const labels = ['TAKEDOWN', 'DOUBLE TAKEDOWN', 'TRIPLE TAKEDOWN', 'RAMPAGE'];
    hud.callout(labels[Math.min(game.chain, labels.length) - 1]);
    hud.flash('down');
    audio.takedown();
    game.slow = Math.max(game.slow, 0.48);
    game.shake = Math.max(game.shake, how === 'smash' ? 0.45 : 0.7);
    void how;
  },
  bump() {
    if (game.mode !== 'play') return;
    audio.bump();
    game.shake = Math.max(game.shake, 0.18);
  },
  wall() {
    if (game.mode !== 'play') return;
    audio.wall();
    game.shake = Math.max(game.shake, 0.4);
  },
  hit() {
    if (game.mode !== 'play') return;
    game.shake = Math.max(game.shake, 0.28);
  },
  crash(reason) {
    finish(reason);
  },
};

let last = performance.now();

function frame(now) {
  if (!view) return;
  let realDt = (now - last) / 1000;
  last = now;
  if (realDt > 0.05) realDt = 0.05;
  if (!(realDt > 0)) realDt = 0;

  if (game.slow > 0) game.slow -= realDt;
  const timeScale = game.mode === 'pause' || game.mode === 'over' ? 0 : game.slow > 0 ? 0.33 : 1;
  const simDt = realDt * timeScale;

  if (game.mode === 'play') {
    game.timer -= realDt;
    if (game.timer <= 0) {
      game.timer = 0;
      finish('time');
    }
  }

  if (simDt > 0 && game.mode !== 'over') {
    sim.update(simDt, inputState(), hooks);
  }

  if (game.mode === 'dying') {
    game.dieT -= realDt;
    if (game.dieT <= 0) openResults();
  }

  const activeAudio = game.mode === 'play' || game.mode === 'menu' || game.mode === 'dying';
  audio.update(sim.player.speed, sim.player.boosting, activeAudio && game.mode !== 'pause');

  if (game.mode === 'play' || game.mode === 'pause' || game.mode === 'dying') {
    hud.update({
      timer: game.timer,
      takedowns: game.takedowns,
      score: game.score,
      speed: sim.player.speed,
      boost: sim.player.boost,
      boosting: sim.player.boosting,
      health: Math.max(0, sim.player.health),
      maxHealth: sim.player.maxHealth,
      cars: sim.cars,
      player: sim.player,
    }, realDt);
  }

  view.draw(sim, game, realDt || 0.016, DEBUGS[debugIndex]);
  requestAnimationFrame(frame);
}

let manual = performance.now();

window.__rage = {
  get mode() { return game.mode; },
  get speed() { return sim.player.speed; },
  get takedowns() { return game.takedowns; },
  get health() { return sim.player.health; },
  get timer() { return game.timer; },
  get score() { return game.score; },
  get frameMs() { return view ? view.frameMs : 0; },
  selfTest: () => selfTest(),
  pump(frames, step = 1000 / 60) {
    for (let i = 0; i < frames; i++) {
      manual += step;
      frame(manual);
    }
  },
  game,
  sim,
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'F8') {
    e.preventDefault();
    debugIndex = (debugIndex + 1) % DEBUGS.length;
    updateDebug();
    return;
  }
  if (e.code === 'Space' || e.code === 'Escape' || e.code === 'KeyF' || e.code.startsWith('Arrow')) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyF') toggleFullscreen();
  if (e.code === 'Escape') {
    if (game.mode === 'play') pauseGame();
    else if (game.mode === 'pause') resumeGame();
    else if (game.mode === 'over') showMenu();
  } else if (e.code === 'Enter') {
    if (game.mode === 'menu' || game.mode === 'over') startGame();
  }
  if (game.mode === 'menu' || game.mode === 'play') audio.unlock();
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    keys.clear();
    if (game.mode === 'play') pauseGame();
  }
});

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('resume-btn').addEventListener('click', resumeGame);
document.getElementById('quit-btn').addEventListener('click', () => {
  audio.ui();
  showMenu();
});
document.getElementById('retry-btn').addEventListener('click', startGame);
document.getElementById('menu-btn').addEventListener('click', () => {
  audio.ui();
  showMenu();
});

window.addEventListener('resize', () => {
  if (view) view.resize();
});

if (view) requestAnimationFrame(frame);

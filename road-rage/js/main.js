import * as THREE from 'three';
import { TARGET_TAKEDOWNS, START_TIME, TIME_BONUS, SCORE_TAKEDOWN, SCORE_BONUS } from './config.js';
import { createTrack, queryTrack } from './track.js';
import { buildWorld } from './world.js';
import { createSimulation } from './vehicles.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { ROAD_HALF } from './config.js';

const keys = new Set();

const game = {
  mode: 'menu', // menu | play | pause | dying | over
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

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setClearColor(0xd5db8c, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd5db8c);
scene.fog = new THREE.Fog(0xd5db8c, 42, 230);

const camera = new THREE.PerspectiveCamera(68, 1, 0.12, 520);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xe7efb4, 0x3d452c, 1.25));
const sun = new THREE.DirectionalLight(0xfff4d2, 1.35);
sun.position.set(-70, 110, 40);
scene.add(sun);

const speedLines = new THREE.Group();
const lineMat = new THREE.MeshBasicMaterial({ color: 0xf3f0d2, transparent: true, opacity: 0 });
for (let i = 0; i < 16; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 2.2 + (i % 3)), lineMat);
  const ang = (i / 16) * Math.PI * 2;
  const rad = 1.15 + (i % 4) * 0.28;
  m.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.62, -4.2 - (i % 5) * 0.15);
  speedLines.add(m);
}
camera.add(speedLines);

const track = createTrack();
buildWorld(scene, track);
const audio = createAudio();
const hud = createHud(track);

const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const resultsEl = document.getElementById('results');
const resTitle = document.getElementById('res-title');
const resDeck = document.getElementById('res-deck');
const resStats = document.getElementById('res-stats');

let camSnap = true;
const look = new THREE.Vector3();
const lookSmooth = new THREE.Vector3();
const desired = new THREE.Vector3();

function inputState() {
  const steer = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  return {
    mode: game.mode,
    throttle: keys.has('KeyW'),
    brake: keys.has('KeyS'),
    steer,
    boost: keys.has('Space'),
  };
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

function showMenu() {
  game.mode = 'menu';
  sim.reset();
  camSnap = true;
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
  camSnap = true;
  hud.setVisible(true);
  show(menuEl, false);
  show(pauseEl, false);
  show(resultsEl, false);
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

const sim = createSimulation(scene, track);

function resize() {
  const w = window.innerWidth;
  const h = Math.max(1, window.innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const pr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
}

function updateCamera(dt) {
  const player = sim.player;
  const yaw = player.yaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  // Close rear-three-quarter. The follow rate stays high so speed doesn't
  // leave the car sitting on the horizon.
  const back = 5.6;
  const up = 2.15;
  const shoulder = -2.15;
  const steerOff = (player.steerVisual || 0) * 0.55;
  desired.set(
    player.x - fx * back + rx * (shoulder + steerOff),
    player.y + up,
    player.z - fz * back + rz * (shoulder + steerOff),
  );
  const k = camSnap ? 1 : 1 - Math.exp(-26 * dt);
  camera.position.lerp(desired, k);
  const q = queryTrack(track, camera.position.x, camera.position.z);
  if (q.dist < ROAD_HALF + 4 && camera.position.y < q.y + 1.4) {
    camera.position.y = q.y + 1.4;
  }
  look.set(player.x + fx * 7.5, player.y + 0.95, player.z + fz * 7.5);
  if (camSnap) lookSmooth.copy(look);
  else lookSmooth.lerp(look, 1 - Math.exp(-20 * dt));
  camera.up.set(0, 1, 0);
  camera.lookAt(lookSmooth);
  const roll = Math.max(-0.12, Math.min(0.12, -player.slip * 0.01 - (player.steerVisual || 0) * 0.04));
  camera.rotateZ(roll);
  if (game.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * game.shake * 0.7;
    camera.position.y += (Math.random() - 0.5) * game.shake * 0.45;
    game.shake = Math.max(0, game.shake - dt * 1.8);
  }
  const sp = Math.abs(player.speed);
  const targetFov = player.boosting ? 84 : 66 + Math.min(sp, 72) * 0.18;
  camera.fov += (targetFov - camera.fov) * (camSnap ? 1 : 0.12);
  camera.updateProjectionMatrix();
  lineMat.opacity = player.boosting ? 0.28 : Math.max(0, (sp - 40) / 160);
  camSnap = false;
}

let last = performance.now();

function frame(now) {
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

  updateCamera(realDt || 0.016);
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

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Escape') e.preventDefault();
  keys.add(e.code);
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

window.addEventListener('resize', resize);
resize();

window.__rage = {
  get mode() { return game.mode; },
  get speed() { return sim.player.speed; },
  get takedowns() { return game.takedowns; },
  get health() { return sim.player.health; },
  get timer() { return game.timer; },
  get score() { return game.score; },
  game,
  sim,
  camera,
};

const bootError = document.getElementById('boot-error');
try {
  if (!renderer.getContext()) throw new Error('WebGL is unavailable in this browser.');
  requestAnimationFrame(frame);
} catch (err) {
  bootError.hidden = false;
  bootError.textContent = err && err.message ? err.message : 'The freeway failed to start.';
}

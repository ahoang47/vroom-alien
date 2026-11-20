import { TARGET_TAKEDOWNS } from './config.js';

function formatTime(t) {
  const s = Math.max(0, Math.ceil(t - 1e-4));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function createHud(track) {
  const hud = document.getElementById('hud');
  const timerEl = document.getElementById('timer');
  const takeEl = document.getElementById('takedowns');
  const bonusEl = document.getElementById('bonus-flag');
  const scoreEl = document.getElementById('score');
  const speedEl = document.getElementById('speed');
  const boostFill = document.getElementById('boost-fill');
  const boostNum = document.getElementById('boost-num');
  const dmgFill = document.getElementById('damage-fill');
  const dmgNum = document.getElementById('damage-num');
  const dmgTrack = document.getElementById('damage-track');
  const boostTrack = document.getElementById('boost-track');
  const calloutEl = document.getElementById('callout');
  const plusEl = document.getElementById('plus');
  const flashEl = document.getElementById('flash');
  const hurtEl = document.getElementById('hurt');
  const canvas = document.getElementById('minimap');
  const ctx = canvas.getContext('2d');

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of track.pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const pad = 18;
  const sx = (canvas.width - pad * 2) / (maxX - minX || 1);
  const sy = (canvas.height - pad * 2) / (maxZ - minZ || 1);
  const scale = Math.min(sx, sy);
  const ox = (canvas.width - (maxX - minX) * scale) / 2;
  const oy = (canvas.height - (maxZ - minZ) * scale) / 2;
  const project = (x, z) => [ox + (x - minX) * scale, oy + (z - minZ) * scale];

  const road = new Path2D();
  track.pts.forEach((p, i) => {
    const [x, y] = project(p.x, p.z);
    if (i === 0) road.moveTo(x, y);
    else road.lineTo(x, y);
  });
  road.closePath();

  let plusTimer = 0;
  let calloutTimer = 0;

  function showCallout(text) {
    calloutEl.textContent = text;
    calloutEl.classList.remove('show');
    // Restart the CSS animation.
    void calloutEl.offsetWidth;
    calloutEl.classList.add('show');
    calloutTimer = 0.85;
  }

  function drawMap(cars, player) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(16, 20, 10, 0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(214, 210, 170, 0.35)';
    ctx.lineWidth = 14;
    ctx.stroke(road);
    ctx.strokeStyle = 'rgba(244, 241, 214, 0.95)';
    ctx.lineWidth = 3;
    ctx.stroke(road);

    for (const car of cars) {
      if (car === player) continue;
      const [x, y] = project(car.x, car.z);
      ctx.fillStyle = car.kind === 'rival' ? '#e23b32' : 'rgba(214, 210, 170, 0.8)';
      ctx.fillRect(x - (car.kind === 'rival' ? 2.5 : 1.5), y - (car.kind === 'rival' ? 2.5 : 1.5), car.kind === 'rival' ? 5 : 3, car.kind === 'rival' ? 5 : 3);
    }

    const [px, py] = project(player.x, player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(player.yaw), Math.cos(player.yaw)));
    ctx.fillStyle = '#f4f1d6';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return {
    setVisible(on) {
      hud.classList.toggle('hidden', !on);
    },
    callout: showCallout,
    plus() {
      plusEl.textContent = '+10s';
      plusEl.classList.remove('show');
      void plusEl.offsetWidth;
      plusEl.classList.add('show');
      plusTimer = 0.9;
    },
    flash(kind) {
      flashEl.style.background = kind === 'crash' ? '#fff6ea' : '#ffb0a4';
      flashEl.style.opacity = kind === 'crash' ? '0.92' : '0.5';
      setTimeout(() => {
        flashEl.style.opacity = '0';
      }, 40);
    },
    update(snap, dt) {
      timerEl.textContent = formatTime(snap.timer);
      timerEl.classList.toggle('low', snap.timer <= 10 && snap.timer > 0);
      const over = snap.takedowns > TARGET_TAKEDOWNS;
      takeEl.textContent = `${snap.takedowns} / ${TARGET_TAKEDOWNS}`;
      bonusEl.classList.toggle('hidden', !over && snap.takedowns < TARGET_TAKEDOWNS);
      scoreEl.textContent = snap.score.toLocaleString('en-US');
      speedEl.textContent = String(Math.round(Math.abs(snap.speed) * 3.2));
      const boostPct = Math.round(snap.boost);
      boostFill.style.width = `${boostPct}%`;
      boostNum.textContent = `${boostPct}`;
      boostTrack.classList.toggle('hot', snap.boosting);
      const dmg = Math.round((1 - snap.health / snap.maxHealth) * 100);
      dmgFill.style.width = `${Math.max(0, Math.min(100, dmg))}%`;
      dmgNum.textContent = `${Math.max(0, dmg)}%`;
      dmgTrack.classList.toggle('crit', dmg >= 70);
      hurtEl.style.opacity = String(Math.max(0, (dmg - 40) / 70));
      if (plusTimer > 0) plusTimer -= dt;
      if (calloutTimer > 0) {
        calloutTimer -= dt;
        if (calloutTimer <= 0) calloutEl.classList.remove('show');
      }
      drawMap(snap.cars, snap.player);
    },
  };
}

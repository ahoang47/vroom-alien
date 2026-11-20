import { TARGET_TAKEDOWNS } from './config.js';

function formatTime(t) {
  const s = Math.max(0, Math.ceil(t - 1e-4));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function createHud(_track) {
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
    ctx.fillStyle = 'rgba(16, 20, 10, 0.72)';
    ctx.fillRect(0, 0, w, h);
    const x = Math.round(w * 0.5);
    ctx.strokeStyle = 'rgba(214, 210, 170, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, 18);
    ctx.lineTo(x, h - 10);
    ctx.stroke();
    const origin = Math.round(h * 0.72);
    const scale = (h * 0.58) / 36;
    const yOf = (along) => origin - (along - player.along) * scale;
    for (const car of cars) {
      if (car === player || car.wrecked) continue;
      const y = yOf(car.along);
      if (y < 16 || y > h - 8) continue;
      const rival = car.kind === 'rival';
      ctx.fillStyle = rival ? '#e23b32' : 'rgba(214, 210, 170, 0.85)';
      const s = rival ? 6 : 3;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.fillStyle = '#f4f1d6';
    ctx.beginPath();
    ctx.moveTo(x, origin - 8);
    ctx.lineTo(x + 6, origin + 6);
    ctx.lineTo(x - 6, origin + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d6d2aa';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${(player.along / 1000).toFixed(1)}`, x, 13);
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

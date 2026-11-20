// A turns the car left and D turns it right. Positive yaw is a left turn:
// facing +Z, the driver's left is +X. The 3D build mapped D onto that yaw.
import { createTrack } from '../js/track.js';
import { createSimulation } from '../js/sim.js';
import { readPad } from '../js/controls.js';

const hooks = {
  takedown() {},
  bump() {},
  wall() {},
  hit() {},
  crash() {},
};

function heading(yaw) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

// Left of the nose. At yaw 0 (facing +Z) this is +X.
function driverLeft(yaw) {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

function leftDot(yaw0, yaw1) {
  const h0 = heading(yaw0);
  const h1 = heading(yaw1);
  const left = driverLeft(yaw0);
  return (h1.x - h0.x) * left.x + (h1.z - h0.z) * left.z;
}

function fresh() {
  const sim = createSimulation(createTrack());
  sim.reset();
  sim.player.speed = 36;
  sim.player.slip = 0;
  sim.player.boost = 8;
  sim.player.drifting = false;
  return sim;
}

function drive(sim, pad, seconds) {
  const steps = Math.max(1, Math.round(seconds / (1 / 60)));
  for (let i = 0; i < steps; i++) {
    sim.update(1 / 60, { mode: 'play', ...pad }, hooks);
  }
}

let failed = 0;
function check(name, pass, detail) {
  console.log(`${pass ? 'ok' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failed++;
}

const a = readPad(new Set(['KeyA']));
const d = readPad(new Set(['KeyD']));
const q = readPad(new Set(['KeyQ', 'KeyW']));
const e = readPad(new Set(['KeyE', 'KeyW']));
check('A is a left command and D is a right command', a.steer > 0 && d.steer < 0 && a.steer === -d.steer, `A ${a.steer} D ${d.steer}`);
check('Q drifts left and E drifts right', q.drift > 0 && e.drift < 0 && q.drift === -e.drift, `Q ${q.drift} E ${e.drift}`);

{
  const sim = fresh();
  const yaw0 = sim.player.yaw;
  drive(sim, { ...a, throttle: true, brake: false, boost: false, drift: 0 }, 0.25);
  const dot = leftDot(yaw0, sim.player.yaw);
  check('holding A turns the nose left', dot > 0.02 && !sim.player.wrecked, `dot ${dot.toFixed(3)} yaw ${sim.player.yaw.toFixed(3)} wrecked ${sim.player.wrecked}`);
}
{
  const sim = fresh();
  const yaw0 = sim.player.yaw;
  drive(sim, { ...d, throttle: true, brake: false, boost: false, drift: 0 }, 0.25);
  const dot = leftDot(yaw0, sim.player.yaw);
  check('holding D turns the nose right', dot < -0.02 && !sim.player.wrecked, `dot ${dot.toFixed(3)} yaw ${sim.player.yaw.toFixed(3)} wrecked ${sim.player.wrecked}`);
}
{
  const sim = fresh();
  const yaw0 = sim.player.yaw;
  const boost0 = sim.player.boost;
  drive(sim, { throttle: true, brake: false, steer: 0, boost: false, drift: 1 }, 0.4);
  const dot = leftDot(yaw0, sim.player.yaw);
  const smoked = sim.smoke.some((p) => p.life > 0);
  check(
    'Q drift yaws left, kicks the rear out, fills boost, and leaves marks',
    dot > 0.05 && sim.player.slip < -3 && sim.player.boost > boost0 + 4 && sim.skids.length > 4 && smoked,
    `dot ${dot.toFixed(3)} slip ${sim.player.slip.toFixed(2)} boost ${sim.player.boost.toFixed(1)} skids ${sim.skids.length} smoke ${smoked}`,
  );
}
{
  const sim = fresh();
  const yaw0 = sim.player.yaw;
  drive(sim, { throttle: true, brake: false, steer: 0, boost: false, drift: -1 }, 0.4);
  const dot = leftDot(yaw0, sim.player.yaw);
  check(
    'E drift yaws right and kicks the rear the other way',
    dot < -0.05 && sim.player.slip > 3,
    `dot ${dot.toFixed(3)} slip ${sim.player.slip.toFixed(2)}`,
  );
}

if (failed) {
  console.error(`${failed} drive check(s) failed`);
  process.exit(1);
}
console.log('drive checks passed');

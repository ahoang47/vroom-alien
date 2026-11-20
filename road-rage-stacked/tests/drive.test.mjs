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

function directionChanges(series) {
  let changes = 0;
  let prev = 0;
  for (let i = 1; i < series.length; i++) {
    const d = series[i] - series[i - 1];
    if (Math.abs(d) < 1e-4) continue;
    const s = Math.sign(d);
    if (prev && s !== prev) changes++;
    prev = s;
  }
  return changes;
}

function yawSeries(steer, seconds) {
  const sim = fresh();
  sim.player.yawRate = 0;
  sim.player.steerCmd = 0;
  const rates = [];
  const steps = Math.round(seconds / (1 / 60));
  for (let i = 0; i < steps; i++) {
    sim.update(1 / 60, { mode: 'play', throttle: true, brake: false, steer, drift: 0, boost: false }, hooks);
    rates.push(sim.player.yawRate);
  }
  return { sim, rates };
}

{
  const held = yawSeries(1, 0.9);
  const peak = Math.max(...held.rates);
  const released = [];
  for (let i = 0; i < 54; i++) {
    held.sim.update(1 / 60, { mode: 'play', throttle: true, brake: false, steer: 0, drift: 0, boost: false }, hooks);
    released.push(held.sim.player.yawRate);
  }
  const overshoot = Math.min(...released);
  check(
    'steering ramps in and settles without oscillation or overshoot',
    directionChanges(held.rates) <= 1 && directionChanges(released) <= 1 && overshoot > -Math.max(0.02, peak * 0.05) && Math.abs(released[released.length - 1]) < 0.05,
    `hold turns ${directionChanges(held.rates)} release turns ${directionChanges(released)} overshoot ${overshoot.toFixed(3)} end ${released[released.length - 1].toFixed(3)} peak ${peak.toFixed(3)}`,
  );
}
{
  const sim = fresh();
  drive(sim, { throttle: true, brake: false, steer: 0, drift: 0, boost: false }, 2);
  const near = sim.rivals.filter((r) => !r.wrecked && Math.abs(r.along - sim.player.along) < 26);
  check('two rivals stay nearby', near.length >= 2, `near ${near.length}`);
}
{
  const sim = fresh();
  const steps = 20 * 60;
  let close = 0;
  for (let i = 0; i < steps; i++) {
    sim.player.boost = 100;
    sim.update(1 / 60, { mode: 'play', throttle: true, brake: false, steer: 0, drift: 0, boost: true }, hooks);
    const near = sim.rivals.filter((r) => !r.wrecked && Math.abs(r.along - sim.player.along) < 30);
    if (near.length >= 2) close++;
  }
  const frac = close / steps;
  check('full boost for 20s keeps two rivals inside 30 m', frac >= 0.8, `${(frac * 100).toFixed(1)}% of frames`);
}

if (failed) {
  console.error(`${failed} drive check(s) failed`);
  process.exit(1);
}
console.log('drive checks passed');

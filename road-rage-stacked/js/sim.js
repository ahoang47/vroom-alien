// Road Rage simulation. Same handling, traffic, and takedown rules as the
// three.js build. Meshes are gone; the view reads these fields and draws stacks.
import { PLAYER_HEALTH, PLAYER_START_BOOST } from './config.js';
import { BODY } from './art.js';
import { queryTrack, sampleAt, alongDelta, wrapAlong } from './track.js';
import { clamp, wrapAngle } from './util.js';

const LANES = [
  { offset: -8.0, dir: -1 },
  { offset: -2.7, dir: -1 },
  { offset: 2.7, dir: 1 },
  { offset: 8.0, dir: 1 },
];

function localVelocity(car) {
  if (car.wrecked) return { x: car.wx, z: car.wz };
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  const rx = Math.cos(car.yaw);
  const rz = -Math.sin(car.yaw);
  return {
    x: fx * car.speed + rx * car.slip,
    z: fz * car.speed + rz * car.slip,
  };
}

function applyYaw(car, dyaw) {
  if (!dyaw) return;
  const v = localVelocity(car);
  car.yaw = wrapAngle(car.yaw + dyaw);
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  const rx = Math.cos(car.yaw);
  const rz = -Math.sin(car.yaw);
  car.speed = v.x * fx + v.z * fz;
  car.slip = v.x * rx + v.z * rz;
}

function addWorldVel(car, dvx, dvz) {
  if (car.wrecked) {
    car.wx += dvx;
    car.wz += dvz;
    return;
  }
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  const rx = Math.cos(car.yaw);
  const rz = -Math.sin(car.yaw);
  car.speed += dvx * fx + dvz * fz;
  car.slip += dvx * rx + dvz * rz;
}

function spheres(car) {
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  const len = car.bodyLength || 4.4;
  const o = Math.min(2.7, len * 0.33);
  const r = Math.min(1.35, 0.62 + len * 0.06);
  return [
    { x: car.x + fx * o, z: car.z + fz * o, r },
    { x: car.x - fx * o, z: car.z - fz * o, r },
  ];
}

function makeCar(kind) {
  return {
    kind,
    sedan: kind === 'traffic',
    paintId: 0,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    slip: 0,
    wx: 0,
    wz: 0,
    vy: 0,
    spin: 0,
    health: kind === 'player' ? PLAYER_HEALTH : 100,
    maxHealth: kind === 'player' ? PLAYER_HEALTH : 100,
    boost: kind === 'player' ? PLAYER_START_BOOST : 0,
    boosting: false,
    braking: false,
    drifting: false,
    drift: 0,
    wrecked: false,
    down: false,
    wreckT: 0,
    stun: 0,
    invuln: 0,
    lastHit: -10,
    along: 0,
    lateral: 0,
    slope: 0,
    bob: 0,
    tumble: 0,
    steerVisual: 0,
    cruise: 30,
    lane: 0,
    dir: 1,
    preferLat: 3,
    seed: 0,
    slot: 0,
    mass: kind === 'player' ? 1.4 : kind === 'rival' ? 1.15 : 0.85,
    phase: 0,
    steerCmd: 0,
    yawRate: 0,
    bodyRoll: 0,
    bodyLength: kind === 'player' ? BODY.player : 4.6,
  };
}

export function createSimulation(track) {
  let simTime = 0;
  let scoring = false;

  const player = makeCar('player');

  const rivals = [0, 1, 2, 3, 4].map((i) => {
    const car = makeCar('rival');
    car.slot = i;
    car.paintId = i;
    car.bodyLength = BODY.rivals[i];
    car.seed = i * 1.7 + 0.4;
    car.preferLat = [-6.2, 6.4, -2.2, 2.8, -4.4][i];
    car.cruise = 34 + i * 0.6;
    car.boost = 80;
    return car;
  });

  const traffic = [];
  const perLane = 3;
  let colorI = 0;
  for (const lane of LANES) {
    for (let i = 0; i < perLane; i++) {
      const car = makeCar('traffic');
      car.paintId = colorI % BODY.traffic.length;
      car.bodyLength = BODY.traffic[car.paintId];
      colorI++;
      car.lane = lane.offset;
      car.dir = lane.dir;
      car.cruise = lane.dir > 0 ? 18 + (i % 5) * 1.5 : 30 + (i % 5) * 1.4;
      car.phase = i;
      traffic.push(car);
    }
  }

  const cars = [player, ...rivals, ...traffic];

  const skids = [];
  const smoke = [];
  const lastWheel = [null, null];
  for (let i = 0; i < 40; i++) {
    smoke.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
  }

  function rearWheels(car) {
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    const rx = Math.cos(car.yaw);
    const rz = -Math.sin(car.yaw);
    const back = 1.55;
    const wide = 0.72;
    return [
      { x: car.x - fx * back + rx * wide, z: car.z - fz * back + rz * wide },
      { x: car.x - fx * back - rx * wide, z: car.z - fz * back - rz * wide },
    ];
  }

  function spawnSmoke(x, y, z, side) {
    let slot = null;
    for (const m of smoke) {
      if (m.life <= 0) { slot = m; break; }
    }
    if (!slot) return;
    const j = Math.sin(simTime * 37 + side) * 0.35;
    slot.x = x + j;
    slot.y = y + 0.35;
    slot.z = z;
    slot.vx = j * 1.4;
    slot.vy = 1.4;
    slot.vz = Math.cos(simTime * 29 + side) * 0.35;
    slot.life = 0.55;
  }

  const shards = [];
  for (let i = 0; i < 36; i++) {
    shards.push({
      life: 0,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rot: 0,
      paintId: i % 2,
    });
  }

  function burst(x, y, z, n) {
    let spawned = 0;
    for (const m of shards) {
      if (m.life > 0) continue;
      m.x = x;
      m.y = y + 0.7;
      m.z = z;
      m.vx = (Math.random() - 0.5) * 14;
      m.vy = 3 + Math.random() * 8;
      m.vz = (Math.random() - 0.5) * 14;
      m.life = 0.45 + Math.random() * 0.45;
      m.rot = Math.atan2(m.vx, m.vz);
      spawned++;
      if (spawned >= n) break;
    }
  }

  function spawn(car, along, lateral, dir, speed) {
    const s = sampleAt(track, along);
    car.x = s.x + s.rx * lateral;
    car.y = s.y;
    car.z = s.z + s.rz * lateral;
    car.yaw = Math.atan2(s.tx, s.tz);
    if (dir < 0) car.yaw = wrapAngle(car.yaw + Math.PI);
    car.speed = speed;
    car.slip = 0;
    car.wx = 0;
    car.wz = 0;
    car.vy = 0;
    car.spin = 0;
    car.along = wrapAlong(track, along);
    car.lateral = lateral;
    car.slope = s.slope;
    car.wrecked = false;
    car.down = false;
    car.wreckT = 0;
    car.tumble = 0;
    car.bob = 0;
    car.steerCmd = 0;
    car.yawRate = 0;
    car.bodyRoll = 0;
  }

  function separateFromOthers(car) {
    for (let n = 0; n < 4; n++) {
      let hit = false;
      for (const o of cars) {
        if (o === car || o.wrecked) continue;
        const dx = car.x - o.x;
        const dz = car.z - o.z;
        if (dx * dx + dz * dz < 20) {
          spawn(car, car.along + 16, car.lane || car.lateral, car.dir, car.speed);
          hit = true;
          break;
        }
      }
      if (!hit) break;
    }
  }

  let aheadQuiet = 0;

  function reset() {
    simTime = 0;
    aheadQuiet = 0;
    const start = 80;
    spawn(player, start, 3.1, 1, 30);
    player.health = PLAYER_HEALTH;
    player.boost = PLAYER_START_BOOST;
    player.boosting = false;
    player.braking = false;
    player.stun = 0;
    player.invuln = 0;
    player.lastHit = -10;
    const rivalOffsets = [8, 16, -7, 24, -13];
    rivals.forEach((car, i) => {
      spawn(car, start + rivalOffsets[i], car.preferLat, 1, 31 + (i % 3));
      car.health = 100;
      car.boost = 80;
      car.invuln = 0.4;
      car.stun = 0;
      car.lastHit = -10;
      separateFromOthers(car);
    });
    traffic.forEach((car) => {
      const gap = 18 + car.phase * 24 + (car.dir < 0 ? 8 : 0);
      spawn(car, start + gap, car.lane, car.dir, car.cruise);
      car.health = 100;
      separateFromOthers(car);
    });
    for (const m of shards) m.life = 0;
    skids.length = 0;
    lastWheel[0] = null;
    lastWheel[1] = null;
    for (const m of smoke) m.life = 0;
    player.drifting = false;
    player.drift = 0;
  }

  function steerToward(car, aimX, aimZ, dt, maxRate) {
    const desired = Math.atan2(aimX - car.x, aimZ - car.z);
    let d = wrapAngle(desired - car.yaw);
    const max = maxRate * dt;
    d = clamp(d, -max, max);
    applyYaw(car, d);
  }

  function dodge(car, q, desiredLat) {
    let lat = desiredLat;
    for (const t of traffic) {
      if (t.wrecked) continue;
      const d = alongDelta(track, q.along, t.along);
      const ahead = car.dir < 0 ? d < 0 && d > -24 : d > 0 && d < 24;
      if (!ahead) continue;
      if (Math.abs(t.lateral - q.lateral) > 2.4) continue;
      const away = Math.sign(car.preferLat - t.lateral || car.lane - t.lateral || 1);
      lat += away * (t.dir !== car.dir ? 3.1 : 1.5);
    }
    const half = q.half || 11.2;
    return clamp(lat, -half + 2.2, half - 2.2);
  }

  function updateRival(car, dt) {
    if (car.wrecked) return;
    if (car.invuln > 0) car.invuln -= dt;
    if (car.stun > 0) car.stun -= dt;
    const q = queryTrack(track, car.x, car.z);
    const gap = alongDelta(track, q.along, player.along);
    // Positive gap: this rival is behind the player. Past ~60 m, drop them
    // back in ahead of the camera instead of letting boost leave them behind.
    if (car.invuln <= 0 && (gap > 60 || gap < -90)) {
      spawnAhead(car, car.slot % 3);
      return;
    }
    let desiredLat = car.preferLat;
    let target = player.speed;
    car.boosting = false;
    if (gap > 4) {
      target = player.speed + 12 + Math.min(22, gap * 0.85);
      if (car.boost > 4) {
        car.boosting = true;
        car.boost = Math.max(0, car.boost - 12 * dt);
        target += 6;
      }
    } else if (gap < -6) {
      // Ahead of the player: run a little slower so they can be caught.
      target = Math.max(22, player.speed - 5);
      car.boost = Math.min(100, car.boost + 10 * dt);
    } else {
      target = player.speed + 2;
      car.boost = Math.min(100, car.boost + 8 * dt);
    }
    target = clamp(target, 22, 92);
    if (gap > -6 && gap < 16 && car.invuln <= 0) {
      const dive = Math.sin(simTime * 1.15 + car.seed) > 0.05;
      if (dive) desiredLat = player.lateral;
    }
    desiredLat = dodge(car, q, desiredLat);
    const look = sampleAt(track, q.along + 14);
    steerToward(car, look.x + look.rx * desiredLat, look.z + look.rz * desiredLat, dt, car.stun > 0 ? 0.45 : 1.7);
    const accel = gap > 8 ? 42 : 28;
    car.speed += clamp(target - car.speed, -30, accel) * dt;
    const grip = car.stun > 0 ? 0.5 : 8;
    car.slip *= Math.exp(-grip * dt);
  }

  function spawnAhead(car, index) {
    // Just past the top of the overhead view (~19 m of road is on screen).
    const along = player.along + 23 + index * 5;
    spawn(car, along, car.preferLat, 1, Math.max(24, player.speed - 5));
    car.health = car.maxHealth;
    car.boost = 70;
    car.invuln = 0.6;
    car.stun = 0;
    car.boosting = false;
    separateFromOthers(car);
  }

  function keepRivalsClose(dt) {
    if (!scoring || player.wrecked) return;
    const live = rivals.filter((c) => !c.wrecked && !c.down);
    const gaps = live.map((car) => ({ car, gap: player.along - car.along }));
    const ahead = gaps.filter((g) => g.gap < -4 && g.gap > -70);
    if (ahead.length === 0) aheadQuiet += dt;
    else aheadQuiet = 0;
    const lead = gaps.length ? Math.min(...gaps.map((g) => g.gap)) : 999;
    const fighting = gaps.filter((g) => g.gap > -30 && g.gap < 30);
    const tooFar = lead > 60;
    const lonely = aheadQuiet >= 3;
    if (!tooFar && !lonely && fighting.length >= 2) return;
    const pool = gaps
      .filter((g) => g.gap > 2 || g.gap < -40)
      .sort((a, b) => b.gap - a.gap);
    let need = 2 - Math.min(fighting.length, ahead.length);
    if (tooFar || lonely) need = Math.max(need, 2);
    if (fighting.length < 2) need = Math.max(need, 2 - fighting.length);
    let placed = 0;
    for (const item of pool) {
      if (placed >= need) break;
      spawnAhead(item.car, placed);
      placed++;
    }
    if (placed > 0) aheadQuiet = 0;
  }

  function updateTraffic(car, dt) {
    if (car.wrecked) return;
    const q = queryTrack(track, car.x, car.z);
    const gap = q.along - player.along;
    const lost = car.dir > 0 ? gap < -36 || gap > 95 : gap < -24 || gap > 85;
    if (lost) {
      respawnTraffic(car);
      return;
    }
    const look = sampleAt(track, q.along + car.dir * 14);
    const aimX = look.x + look.rx * car.lane;
    const aimZ = look.z + look.rz * car.lane;
    steerToward(car, aimX, aimZ, dt, 2.2);
    car.speed += clamp(car.cruise - car.speed, -18, 12) * dt;
    car.slip *= Math.exp(-8 * dt);
    const latErr = car.lane - q.lateral;
    addWorldVel(car, q.rx * latErr * 4 * dt, q.rz * latErr * 4 * dt);
  }

  function drivePlayer(car, dt, input) {
    if (car.stun > 0) car.stun -= dt;
    const steer = clamp(input.steer || 0, -1, 1);
    const drift = clamp(input.drift || 0, -1, 1);
    const throttle = input.throttle ? 1 : 0;
    const brake = input.brake ? 1 : 0;
    const reverse = car.speed < -1 ? -1 : 1;
    const sp = Math.abs(car.speed);
    // The wheel comes in at a limited rate, so a jab does not snap the nose.
    const cmdRate = 3.4;
    car.steerCmd += clamp(steer - car.steerCmd, -cmdRate * dt, cmdRate * dt);

    const drifting = drift !== 0 && sp > 8 && !brake;
    car.drifting = drifting;
    car.drift = drifting ? drift : 0;
    // More lock at low speed, less as the car gets quick. Drifts stay loose.
    let maxRate = (0.62 + 7 / (sp + 8)) * (drifting ? 1.65 : 1);
    if (car.stun > 0) maxRate *= 0.7;
    let target = car.steerCmd * reverse * maxRate;
    if (drifting) target += drift * reverse * 1.45;
    const rateAccel = drifting ? 6 : 8;
    car.yawRate += clamp(target - car.yawRate, -rateAccel * dt, rateAccel * dt);
    // Positive steer yaws toward the driver's left (A). D is the opposite.
    applyYaw(car, car.yawRate * dt);

    if (drifting) {
      car.slip += -drift * reverse * 14 * dt;
      car.slip *= Math.exp(-1.15 * dt);
      car.slip = clamp(car.slip, -28, 28);
      if (!input.boost) car.boost = Math.min(100, car.boost + 24 * dt);
    } else {
      const load = clamp(-car.yawRate * Math.min(sp, 36) * 0.09, -3.5, 3.5);
      const k = 1 - Math.exp(-14 * dt);
      car.slip += (load - car.slip) * k;
    }

    const rollTarget = car.steerCmd * Math.min(1, sp / 16) * 0.42;
    car.bodyRoll += (rollTarget - car.bodyRoll) * (1 - Math.exp(-8 * dt));

    const boosting = !!(input.boost && !brake && car.boost > 0.5 && (throttle || car.speed > 8));
    car.boosting = boosting;
    let accel = 0;
    if (throttle) accel += boosting ? 48 : 28;
    if (brake) accel += car.speed > 1 ? -52 : -20;
    car.speed += accel * dt;
    car.speed -= car.speed * (boosting ? 0.16 : 0.38) * dt;
    car.speed -= Math.abs(car.yawRate) * sp * 0.012 * dt;
    const max = boosting ? 68 : 46;
    if (car.speed > max) car.speed = max;
    if (car.speed < -16) car.speed = -16;
    if (boosting) car.boost = Math.max(0, car.boost - 28 * dt);
    if (car.boost <= 0) car.boosting = false;
    car.steerVisual = car.steerCmd;
  }

  function coast(car, dt) {
    car.boosting = false;
    car.drifting = false;
    car.drift = 0;
    car.steerVisual = 0;
    car.speed -= car.speed * 0.45 * dt;
    car.slip *= Math.exp(-4 * dt);
    if (car.stun > 0) car.stun -= dt;
  }

  function driveAttract(car, dt) {
    car.boosting = false;
    car.drifting = false;
    car.drift = 0;
    const q = queryTrack(track, car.x, car.z);
    const look = sampleAt(track, q.along + 18);
    const lat = 3.3;
    steerToward(car, look.x + look.rx * lat, look.z + look.rz * lat, dt, 1.7);
    car.speed += clamp(34 - car.speed, -20, 18) * dt;
    car.slip *= Math.exp(-6 * dt);
    car.steerVisual = clamp(wrapAngle(Math.atan2(look.x - car.x, look.z - car.z) - car.yaw) * 2, -1, 1);
  }

  function integrate(car, dt) {
    if (car.wrecked) {
      car.vy -= 27 * dt;
      car.y += car.vy * dt;
      car.x += car.wx * dt;
      car.z += car.wz * dt;
      car.yaw += car.spin * dt;
      car.wx *= Math.exp(-0.45 * dt);
      car.wz *= Math.exp(-0.45 * dt);
      car.spin *= Math.exp(-0.5 * dt);
      return;
    }
    const v = localVelocity(car);
    car.x += v.x * dt;
    car.z += v.z * dt;
  }

  function beginWreck(car, vy, spin) {
    if (car.wrecked) return;
    const v = localVelocity(car);
    car.wrecked = true;
    car.wx = v.x;
    car.wz = v.z;
    car.vy = vy;
    car.spin = spin;
  }

  function takedown(car, how, hooks) {
    if (car.down || car.invuln > 0) return;
    car.down = true;
    car.health = 0;
    beginWreck(car, Math.max(car.vy, 9), (Math.random() < 0.5 ? -1 : 1) * 8);
    car.wreckT = 1.85;
    burst(car.x, car.y, car.z, 8);
    if (scoring) hooks.takedown(how);
  }

  function scrap(car) {
    if (car.down) return;
    car.down = true;
    car.health = 0;
    beginWreck(car, 5, (Math.random() < 0.5 ? -1 : 1) * 5);
    car.wreckT = 1.1;
  }

  function launchTraffic(car, impact) {
    if (car.wrecked) return;
    beginWreck(
      car,
      8 + Math.min(impact, 36) * 0.24,
      (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 5),
    );
    car.wx *= 1.25;
    car.wz *= 1.25;
    car.wreckT = 2.35;
    car.down = true;
    burst(car.x, car.y, car.z, 5);
  }

  function wallHit(car, outward, hooks) {
    if (car.kind === 'player') {
      if (!scoring) return;
      const dmg = Math.max(0, outward - 8) * 0.62;
      if (dmg <= 0) return;
      car.health -= dmg;
      car.bob = Math.min(0.3, dmg * 0.01);
      hooks.wall(dmg);
      if (car.health <= 0) hooks.crash('wreck');
      return;
    }
    if (car.kind !== 'rival' || car.down) return;
    const recent = simTime - car.lastHit < 2.7;
    car.health -= outward * (recent ? 3.6 : 0.8);
    if (!scoring) {
      if (car.health <= 0) scrap(car);
      return;
    }
    if (car.invuln <= 0 && recent && (outward > 8 || car.health <= 0)) takedown(car, 'wall', hooks);
    else if (car.health <= 0) scrap(car);
  }

  function groundAndBarrier(car, hooks) {
    const q = queryTrack(track, car.x, car.z);
    car.along = q.along;
    car.lateral = q.lateral;
    car.slope = q.slope;
    if (car.wrecked) {
      if (car.y < q.y) {
        car.y = q.y;
        if (car.vy < 0) car.vy *= -0.22;
        car.wx *= 0.72;
        car.wz *= 0.72;
      }
      return;
    }
    car.y = q.y;
    const limit = (q.half || 11.2) - 1.15;
    if (Math.abs(q.lateral) <= limit) return;
    const sign = Math.sign(q.lateral);
    const push = Math.abs(q.lateral) - limit;
    car.x -= q.rx * sign * push;
    car.z -= q.rz * sign * push;
    car.lateral = sign * limit;
    const v = localVelocity(car);
    const outward = (v.x * q.rx + v.z * q.rz) * sign;
    if (outward > 0.4) {
      addWorldVel(car, -q.rx * sign * outward * 1.5, -q.rz * sign * outward * 1.5);
      if (outward > 6) wallHit(car, outward, hooks);
    }
  }

  function pairStyle(a, b) {
    const key = [a.kind, b.kind].sort().join('-');
    if (key === 'player-traffic') return { e: 0.55, exag: 1.75 };
    if (key === 'player-rival') return { e: 0.3, exag: 1.12 };
    if (key === 'rival-traffic') return { e: 0.32, exag: 1.35 };
    if (key === 'rival-rival') return { e: 0.16, exag: 0.6 };
    return { e: 0.06, exag: 0.35 };
  }

  function resolvePhysics(a, b) {
    const dx0 = b.x - a.x;
    const dz0 = b.z - a.z;
    if (dx0 * dx0 + dz0 * dz0 > 80) return null;
    const as = spheres(a);
    const bs = spheres(b);
    let best = null;
    for (const p of as) {
      for (const q of bs) {
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const dist = Math.hypot(dx, dz) || 0.0001;
        const overlap = p.r + q.r - dist;
        if (overlap > 0 && (!best || overlap > best.overlap)) {
          best = { overlap, nx: dx / dist, nz: dz / dist };
        }
      }
    }
    if (!best) return null;
    const { e, exag } = pairStyle(a, b);
    const tm = a.mass + b.mass;
    const push = Math.min(best.overlap, 0.85);
    a.x -= best.nx * push * (b.mass / tm);
    a.z -= best.nz * push * (b.mass / tm);
    b.x += best.nx * push * (a.mass / tm);
    b.z += best.nz * push * (a.mass / tm);
    const va = localVelocity(a);
    const vb = localVelocity(b);
    const rvn = (vb.x - va.x) * best.nx + (vb.z - va.z) * best.nz;
    const impact = rvn < 0 ? -rvn : 0;
    if (rvn < 0) {
      const j = -(1 + e) * rvn / (1 / a.mass + 1 / b.mass);
      const ix = j * best.nx * exag;
      const iz = j * best.nz * exag;
      addWorldVel(a, -ix / a.mass, -iz / a.mass);
      addWorldVel(b, ix / b.mass, iz / b.mass);
    }
    return { nx: best.nx, nz: best.nz, impact };
  }

  function flip(col) {
    return { nx: -col.nx, nz: -col.nz, impact: col.impact };
  }

  function handlePlayerTraffic(col, trafficCar, hooks) {
    const pfx = Math.sin(player.yaw);
    const pfz = Math.cos(player.yaw);
    const tfx = Math.sin(trafficCar.yaw);
    const tfz = Math.cos(trafficCar.yaw);
    const facing = pfx * tfx + pfz * tfz;
    const front = pfx * col.nx + pfz * col.nz;
    const headOn = facing < -0.45 && front > 0.62 && col.impact > 12;
    if (headOn && scoring) {
      launchTraffic(trafficCar, col.impact);
      hooks.crash('headon');
      return;
    }
    launchTraffic(trafficCar, col.impact);
    if (!scoring || col.impact < 2) return;
    const gain = clamp(14 + col.impact * 0.7, 14, 32);
    player.boost = Math.min(100, player.boost + gain);
    player.bob = Math.min(0.22, col.impact * 0.008);
    hooks.bump(gain);
  }

  function handlePlayerRival(col, rival, hooks) {
    if (rival.invuln > 0 || rival.down) return;
    rival.lastHit = simTime;
    rival.stun = Math.min(0.8, 0.28 + col.impact * 0.022);
    player.stun = Math.min(0.16, player.stun + col.impact * 0.005);
    player.speed *= 1 - clamp(col.impact * 0.008, 0, 0.18);
    const side = Math.cos(player.yaw) * col.nx + -Math.sin(player.yaw) * col.nz;
    rival.yaw += clamp(col.impact, 0, 22) * 0.012 * Math.sign(side || 1);
    rival.health -= col.impact * 3;
    rival.bob = Math.min(0.2, col.impact * 0.008);
    player.bob = Math.min(0.16, col.impact * 0.006);
    if (!scoring) {
      if (rival.health <= 0) scrap(rival);
      return;
    }
    player.health -= col.impact * 0.16;
    hooks.hit(col.impact);
    if (rival.health <= 0) takedown(rival, 'smash', hooks);
    if (player.health <= 0) hooks.crash('wreck');
  }

  function handleRivalTraffic(col, rival, trafficCar, hooks) {
    const recent = simTime - rival.lastHit < 2.7 && rival.invuln <= 0 && !rival.down;
    if (col.impact > 8 || (recent && col.impact > 3.5)) launchTraffic(trafficCar, col.impact);
    if (!scoring || !recent) return;
    if (col.impact > 5) takedown(rival, 'traffic', hooks);
  }

  function applyContact(a, b, col, hooks) {
    if (a.kind === 'player' && b.kind === 'traffic') handlePlayerTraffic(col, b, hooks);
    else if (b.kind === 'player' && a.kind === 'traffic') handlePlayerTraffic(flip(col), a, hooks);
    else if (a.kind === 'player' && b.kind === 'rival') handlePlayerRival(col, b, hooks);
    else if (b.kind === 'player' && a.kind === 'rival') handlePlayerRival(flip(col), a, hooks);
    else if (a.kind === 'rival' && b.kind === 'traffic') handleRivalTraffic(col, a, b, hooks);
    else if (b.kind === 'rival' && a.kind === 'traffic') handleRivalTraffic(flip(col), b, a, hooks);
  }

  function collideAll(hooks) {
    const contacts = [];
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (a.wrecked) continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (b.wrecked) continue;
        const col = resolvePhysics(a, b);
        if (col && col.impact > 0.5) contacts.push({ a, b, col });
      }
    }
    for (const c of contacts) {
      const rival = c.a.kind === 'rival' ? c.a : c.b.kind === 'rival' ? c.b : null;
      const other = rival === c.a ? c.b : c.a;
      if (rival && other && other.kind === 'player') rival.lastHit = simTime;
    }
    for (const c of contacts) applyContact(c.a, c.b, c.col, hooks);
  }

  function respawnRival(car) {
    const someoneAhead = rivals.some((r) => r !== car && !r.wrecked && !r.down && player.along - r.along < -4);
    if (!someoneAhead) {
      spawnAhead(car, car.slot % 3);
    } else {
      spawn(car, player.along - 16, car.preferLat, 1, Math.max(28, player.speed * 0.98));
      car.health = car.maxHealth;
      car.boost = 80;
      car.invuln = 1.1;
      car.stun = 0;
      car.boosting = true;
      separateFromOthers(car);
    }
    car.lastHit = -10;
  }

  function respawnTraffic(car) {
    const ahead = player.along + 22 + Math.random() * 48;
    spawn(car, ahead, car.lane, car.dir, car.cruise);
    car.health = car.maxHealth;
    separateFromOthers(car);
  }

  function update(dt, input, hooks) {
    scoring = input.mode === 'play';
    const steps = 4;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      simTime += h;
      if (player.wrecked) {
        // still integrates below
      } else if (input.mode === 'menu') driveAttract(player, h);
      else if (input.mode === 'play') drivePlayer(player, h, input);
      else coast(player, h);

      for (const car of rivals) updateRival(car, h);
      for (const car of traffic) updateTraffic(car, h);
      for (const car of cars) integrate(car, h);
      collideAll(hooks);
      for (const car of cars) groundAndBarrier(car, hooks);
      for (const car of cars) {
        if (!car.wrecked || car.kind === 'player') continue;
        car.wreckT -= h;
        if (car.wreckT > 0) continue;
        if (car.kind === 'rival') respawnRival(car);
        else respawnTraffic(car);
      }
    }

    const braking = input.mode === 'play' && !!input.brake;
    for (const car of cars) {
      if (car.wrecked) car.tumble += dt * (car.kind === 'traffic' ? 3.2 : 1.6);
      car.bob *= Math.exp(-6 * dt);
      car.braking = braking && car === player;
    }

    const sliding = input.mode === 'play' && !player.wrecked && (player.drifting || Math.abs(player.slip) > 11) && Math.abs(player.speed) > 8;
    if (sliding) {
      const wheels = rearWheels(player);
      for (let i = 0; i < 2; i++) {
        const prev = lastWheel[i];
        const w = wheels[i];
        if (prev) {
          const dx = w.x - prev.x;
          const dz = w.z - prev.z;
          if (dx * dx + dz * dz < 16) {
            skids.push({
              x: prev.x, z: prev.z, y: player.y,
              x2: w.x, z2: w.z, y2: player.y,
              life: 1.4,
            });
            if (skids.length > 240) skids.shift();
          }
        }
        lastWheel[i] = { x: w.x, z: w.z };
        spawnSmoke(w.x, player.y, w.z, i);
      }
    } else {
      lastWheel[0] = null;
      lastWheel[1] = null;
    }
    for (let i = skids.length - 1; i >= 0; i--) {
      skids[i].life -= dt;
      if (skids[i].life <= 0) skids.splice(i, 1);
    }
    for (const m of smoke) {
      if (m.life <= 0) continue;
      m.life -= dt;
      m.y += m.vy * dt;
      m.x += m.vx * dt;
      m.z += m.vz * dt;
      if (m.life <= 0) m.life = 0;
    }
    keepRivalsClose(dt);

    for (const m of shards) {
      if (m.life <= 0) continue;
      m.life -= dt;
      m.vy -= 20 * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.z += m.vz * dt;
      m.rot += dt * 6;
      if (m.life <= 0) m.life = 0;
    }
  }

  function wreckPlayer() {
    if (player.wrecked) return;
    beginWreck(player, 7, (Math.random() < 0.5 ? -1 : 1) * 7);
    player.health = 0;
    player.boosting = false;
    burst(player.x, player.y, player.z, 12);
  }

  reset();

  return {
    player,
    rivals,
    traffic,
    cars,
    shards,
    skids,
    smoke,
    reset,
    update,
    wreckPlayer,
    getTime: () => simTime,
  };
}

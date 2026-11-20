import * as THREE from 'three';
import { ROAD_HALF, PLAYER_HEALTH, PLAYER_START_BOOST } from './config.js';
import { queryTrack, sampleAt, alongDelta, wrapAlong } from './track.js';
import { paintTexture, shadowTexture } from './textures.js';
import { clamp, wrapAngle } from './util.js';

// Two spheres along the chassis stand in for a box. Good enough for shunts,
// and the normal tells a nose hit from a sideswipe.

const LANES = [
  { offset: -8.0, dir: -1 },
  { offset: -2.7, dir: -1 },
  { offset: 2.7, dir: 1 },
  { offset: 8.0, dir: 1 },
];

const RIVAL_PAINTS = [
  [0x11, '#2f6fbe', '#e8eef2'],
  [0x22, '#1b1b1b', '#e2c04a'],
  [0x33, '#2f8f4e', '#102016'],
  [0x44, '#f2f2f2', '#d23b32'],
  [0x55, '#6a3d8a', '#7ee0d0'],
];

const TRAFFIC_COLORS = [0xd9d3c2, 0x8e97a3, 0xc6b15c, 0x5e6772, 0xb7c2ae, 0x3c4450];

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
  const o = car.sedan ? 1.05 : 1.18;
  const r = 1.0;
  return [
    { x: car.x + fx * o, z: car.z + fz * o, r },
    { x: car.x - fx * o, z: car.z - fz * o, r },
  ];
}

function createCarMesh(spec) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';

  const paint = spec.paint
    ? new THREE.MeshLambertMaterial({ map: spec.paint, flatShading: true })
    : new THREE.MeshLambertMaterial({ color: spec.color, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1d16, flatShading: true });
  const glass = new THREE.MeshLambertMaterial({ color: 0x23281c, flatShading: true });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x8a241e });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4 });
  const accent = new THREE.MeshLambertMaterial({ color: spec.accent || 0xd24a3c, flatShading: true });

  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.sedan ? 1.95 : 2.02, spec.sedan ? 0.62 : 0.55, spec.sedan ? 4.15 : 4.35), paint);
  body.position.y = spec.sedan ? 0.58 : 0.52;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(spec.sedan ? 1.75 : 1.62, spec.sedan ? 0.62 : 0.48, spec.sedan ? 2.05 : 1.65),
    glass,
  );
  cabin.position.set(0, spec.sedan ? 1.12 : 1.0, spec.sedan ? -0.15 : -0.28);
  group.add(cabin);

  if (!spec.sedan) {
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.16, 1.35), paint);
    hood.position.set(0, 0.86, 1.15);
    hood.rotation.x = -0.14;
    group.add(hood);
    const strutGeo = new THREE.BoxGeometry(0.08, 0.32, 0.08);
    const s1 = new THREE.Mesh(strutGeo, accent);
    const s2 = new THREE.Mesh(strutGeo, accent);
    s1.position.set(-0.62, 1.05, -1.95);
    s2.position.set(0.62, 1.05, -1.95);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.08, 0.42), accent);
    wing.position.set(0, 1.22, -1.98);
    group.add(s1, s2, wing);
  }

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.18), paint);
  bumper.position.set(0, 0.42, spec.sedan ? 2.1 : 2.2);
  group.add(bumper);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 7);
  const spins = [];
  const fronts = [];
  const xW = spec.sedan ? 0.98 : 1.02;
  const zW = spec.sedan ? 1.25 : 1.35;
  for (const [x, z, front] of [[-xW, zW, true], [xW, zW, true], [-xW, -zW, false], [xW, -zW, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.36, z);
    const spin = new THREE.Group();
    const mesh = new THREE.Mesh(wheelGeo, dark);
    mesh.rotation.z = Math.PI / 2;
    spin.add(mesh);
    pivot.add(spin);
    group.add(pivot);
    spins.push(spin);
    if (front) fronts.push(pivot);
  }

  const lamp = new THREE.BoxGeometry(0.32, 0.14, 0.08);
  const nose = spec.sedan ? 2.12 : 2.22;
  const tailZ = spec.sedan ? -2.1 : -2.2;
  const h1 = new THREE.Mesh(lamp, headMat);
  const h2 = new THREE.Mesh(lamp, headMat);
  h1.position.set(-0.62, 0.58, nose);
  h2.position.set(0.62, 0.58, nose);
  const t1 = new THREE.Mesh(lamp, tailMat);
  const t2 = new THREE.Mesh(lamp, tailMat);
  t1.position.set(-0.64, 0.58, tailZ);
  t2.position.set(0.64, 0.58, tailZ);
  group.add(h1, h2, t1, t2);

  const scraps = [];
  const scrapGeo = new THREE.BoxGeometry(0.28, 0.12, 0.22);
  const scrapMat = new THREE.MeshLambertMaterial({ color: 0x241c16, flatShading: true });
  const scrapPos = [[0.7, 0.7, 1.6], [-0.85, 0.55, -1.4], [0.2, 0.9, 0.4]];
  for (const p of scrapPos) {
    const s = new THREE.Mesh(scrapGeo, scrapMat);
    s.position.set(p[0], p[1], p[2]);
    s.visible = false;
    group.add(s);
    scraps.push(s);
  }

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(spec.sedan ? 2.6 : 2.8, spec.sedan ? 4.6 : 5),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.08;
  shadow.renderOrder = 2;
  group.add(shadow);

  group.userData.parts = { spins, fronts, tailMat, paint, scraps, shadow };
  return group;
}

function makeCar(kind, mesh) {
  const car = {
    kind,
    sedan: kind === 'traffic',
    mesh,
    parts: mesh.userData.parts,
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
    drift: 0,
    driftGrip: 1,
    cruise: 30,
    lane: 0,
    dir: 1,
    preferLat: 3,
    seed: 0,
    slot: 0,
    mass: kind === 'player' ? 1.4 : kind === 'rival' ? 1 : 0.72,
    baseColor: mesh.userData.parts.paint.color.clone(),
  };
  return car;
}

export function createSimulation(scene, track) {
  let simTime = 0;
  let scoring = false;

  const playerMesh = createCarMesh({
    paint: paintTexture(0xBEEF, '#d7c09a', '#d6453c'),
    accent: 0xd6453c,
    sedan: false,
  });
  scene.add(playerMesh);
  const player = makeCar('player', playerMesh);

  const boostLight = new THREE.PointLight(0xff6a2a, 0, 10, 2);
  boostLight.position.set(0, 0.7, -2.15);
  playerMesh.add(boostLight);

  const rivals = RIVAL_PAINTS.map((spec, i) => {
    const mesh = createCarMesh({
      paint: paintTexture(spec[0], spec[1], spec[2]),
      accent: new THREE.Color(spec[2]).getHex(),
      sedan: false,
    });
    scene.add(mesh);
    const car = makeCar('rival', mesh);
    car.slot = i;
    car.seed = i * 1.7 + 0.4;
    car.preferLat = [-2.2, 6.4, -6.2, 4.2, 0.4][i];
    car.cruise = 34 + i * 1.1;
    return car;
  });

  const traffic = [];
  const perLane = clamp(Math.round(track.length / 88), 8, 12);
  let colorI = 0;
  for (const lane of LANES) {
    for (let i = 0; i < perLane; i++) {
      const mesh = createCarMesh({
        color: TRAFFIC_COLORS[colorI % TRAFFIC_COLORS.length],
        accent: 0x333333,
        sedan: true,
      });
      colorI++;
      scene.add(mesh);
      const car = makeCar('traffic', mesh);
      car.lane = lane.offset;
      car.dir = lane.dir;
      car.cruise = lane.dir > 0 ? 17 + (i % 5) * 1.7 : 30 + (i % 5) * 1.5;
      car.phase = (i + 0.5 * LANES.indexOf(lane)) / perLane;
      traffic.push(car);
    }
  }

  const cars = [player, ...rivals, ...traffic];

  const shardGeo = new THREE.BoxGeometry(0.22, 0.12, 0.22);
  const shardMats = [
    new THREE.MeshLambertMaterial({ color: 0xd6453c, flatShading: true }),
    new THREE.MeshLambertMaterial({ color: 0x2a2418, flatShading: true }),
  ];
  const shards = [];
  for (let i = 0; i < 36; i++) {
    const m = new THREE.Mesh(shardGeo, shardMats[i % 2]);
    m.visible = false;
    m.userData.life = 0;
    scene.add(m);
    shards.push(m);
  }

  const skidGeo = new THREE.PlaneGeometry(0.34, 0.9);
  const skids = [];
  for (let i = 0; i < 70; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x171910,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const m = new THREE.Mesh(skidGeo, mat);
    m.rotation.order = 'YXZ';
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.renderOrder = 2;
    m.userData.life = 0;
    scene.add(m);
    skids.push(m);
  }
  let skidCursor = 0;
  let skidAcc = 0;

  const smokeCanvas = document.createElement('canvas');
  smokeCanvas.width = 32;
  smokeCanvas.height = 32;
  {
    const g = smokeCanvas.getContext('2d');
    const grd = g.createRadialGradient(16, 16, 1, 16, 16, 16);
    grd.addColorStop(0, 'rgba(226, 222, 196, 0.65)');
    grd.addColorStop(1, 'rgba(226, 222, 196, 0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
  }
  const smokeTex = new THREE.CanvasTexture(smokeCanvas);
  smokeTex.colorSpace = THREE.SRGBColorSpace;
  const smokeGeo = new THREE.PlaneGeometry(1, 1);
  const smokes = [];
  for (let i = 0; i < 28; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: smokeTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const m = new THREE.Mesh(smokeGeo, mat);
    m.visible = false;
    m.renderOrder = 3;
    m.userData.life = 0;
    scene.add(m);
    smokes.push(m);
  }
  let smokeCursor = 0;

  function dropSkid(x, y, z, yaw) {
    const m = skids[skidCursor % skids.length];
    skidCursor += 1;
    m.visible = true;
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.userData.life = 1.6;
    m.userData.max = 1.6;
    m.material.opacity = 0.55;
  }

  function puff(x, y, z) {
    const m = smokes[smokeCursor % smokes.length];
    smokeCursor += 1;
    m.visible = true;
    m.position.set(x, y, z);
    m.scale.setScalar(0.45 + Math.random() * 0.25);
    m.userData.life = 0.55;
    m.userData.max = 0.55;
    m.userData.vx = (Math.random() - 0.5) * 1.4;
    m.userData.vy = 1.6 + Math.random() * 1.2;
    m.userData.vz = (Math.random() - 0.5) * 1.4;
    m.material.opacity = 0.55;
  }

  function burst(x, y, z, n) {
    let spawned = 0;
    for (const m of shards) {
      if (m.userData.life > 0) continue;
      m.visible = true;
      m.position.set(x, y + 0.7, z);
      m.userData.vx = (Math.random() - 0.5) * 14;
      m.userData.vy = 3 + Math.random() * 8;
      m.userData.vz = (Math.random() - 0.5) * 14;
      m.userData.life = 0.45 + Math.random() * 0.45;
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

  function reset() {
    simTime = 0;
    const start = track.length * 0.12;
    spawn(player, start, 3.1, 1, 30);
    player.health = PLAYER_HEALTH;
    player.boost = PLAYER_START_BOOST;
    player.boosting = false;
    player.drift = 0;
    player.driftGrip = 1;
    player.stun = 0;
    player.invuln = 0;
    player.lastHit = -10;
    const rivalOffsets = [18, 38, 60, -26, -48];
    rivals.forEach((car, i) => {
      spawn(car, start + rivalOffsets[i], car.preferLat, 1, 32 + (i % 3));
      car.health = 100;
      car.invuln = 0.4;
      car.stun = 0;
      car.lastHit = -10;
      separateFromOthers(car);
    });
    const spacing = track.length / perLane;
    traffic.forEach((car) => {
      const along = start + car.phase * track.length;
      // Keep the grid off the player's nose.
      const shifted = car.dir > 0 ? along + spacing * 0.45 : along + spacing * 0.15;
      spawn(car, shifted, car.lane, car.dir, car.cruise);
      car.health = 100;
      separateFromOthers(car);
    });
    for (const m of shards) {
      m.visible = false;
      m.userData.life = 0;
    }
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
    return clamp(lat, -ROAD_HALF + 2.2, ROAD_HALF - 2.2);
  }

  function updateRival(car, dt) {
    if (car.wrecked) return;
    if (car.invuln > 0) car.invuln -= dt;
    if (car.stun > 0) car.stun -= dt;
    const q = queryTrack(track, car.x, car.z);
    const delta = alongDelta(track, q.along, player.along);
    if (car.invuln <= 0 && (delta > 100 || delta < -120)) {
      spawn(car, player.along - 32 - car.slot * 8, car.preferLat, 1, car.cruise);
      car.health = car.maxHealth;
      car.invuln = 1.1;
      car.stun = 0;
      return;
    }
    let desiredLat = car.preferLat;
    let target = car.cruise;
    if (delta > 16) target += 9;
    if (delta < -28) target -= 8;
    target = clamp(target, 24, 50);
    if (Math.abs(delta) < 18 && car.invuln <= 0) {
      const dive = Math.sin(simTime * 1.15 + car.seed) > 0.15;
      if (dive) desiredLat = player.lateral;
    }
    desiredLat = dodge(car, q, desiredLat);
    const look = sampleAt(track, q.along + 16);
    steerToward(car, look.x + look.rx * desiredLat, look.z + look.rz * desiredLat, dt, car.stun > 0 ? 0.45 : 1.6);
    car.speed += clamp(target - car.speed, -26, 22) * dt;
    const grip = car.stun > 0 ? 0.5 : 5.4;
    car.slip *= Math.exp(-grip * dt);
  }

  function updateTraffic(car, dt) {
    if (car.wrecked) return;
    const q = queryTrack(track, car.x, car.z);
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
    const driftIn = clamp(input.drift || 0, -1, 1);
    const throttle = input.throttle ? 1 : 0;
    const brake = input.brake ? 1 : 0;
    const reverse = car.speed < -1 ? -1 : 1;
    const sp = Math.abs(car.speed);
    // Drift only while moving forward. Positive drift yaws toward screen-left (Q).
    const drifting = driftIn !== 0 && car.speed > 10 && !brake;
    let authority = 1.8 * Math.min(1, 0.4 + sp / 14) / (1 + sp / 110);
    if (car.stun > 0) authority *= 0.62;
    applyYaw(car, steer * reverse * authority * dt);
    if (drifting) {
      // Kick the nose into the slide. The old forward speed becomes sideways
      // slip, so the rear steps out and the car travels at an angle.
      applyYaw(car, driftIn * 1.35 * dt);
      car.slip += -driftIn * 18 * dt;
      car.speed -= 6 * Math.abs(driftIn) * dt;
      car.boost = Math.min(100, car.boost + 24 * Math.abs(driftIn) * dt);
    }

    const boosting = !!(input.boost && !brake && car.boost > 0.5 && (throttle || car.speed > 8));
    car.boosting = boosting;
    let accel = 0;
    if (throttle) accel += boosting ? 50 : 30;
    if (brake) accel += car.speed > 1 ? -56 : -22;
    car.speed += accel * dt;
    car.speed -= car.speed * (boosting ? 0.16 : 0.42) * dt;
    const max = boosting ? 70 : 46;
    if (car.speed > max) car.speed = max;
    if (car.speed < -16) car.speed = -16;
    // Grip eases back in after a drift instead of snapping.
    const gripTarget = drifting ? 0.16 : 1;
    const gripBlend = 1 - Math.exp(-(drifting ? 9 : 3.4) * dt);
    car.driftGrip += (gripTarget - car.driftGrip) * gripBlend;
    const grip = (boosting ? 1.35 : 4.8) * (car.stun > 0 ? 0.4 : 1) * car.driftGrip;
    car.slip *= Math.exp(-grip * dt);
    car.slip = clamp(car.slip, -36, 36);
    if (boosting) car.boost = Math.max(0, car.boost - 28 * dt);
    if (car.boost <= 0) car.boosting = false;
    car.steerVisual = steer;
    car.drift = drifting ? driftIn : 0;
  }

  function coast(car, dt) {
    car.boosting = false;
    car.steerVisual = 0;
    car.drift = 0;
    car.speed -= car.speed * 0.45 * dt;
    car.slip *= Math.exp(-4 * dt);
    if (car.stun > 0) car.stun -= dt;
  }

  function driveAttract(car, dt) {
    car.boosting = false;
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
    // Extra kick on top of the impulse so traffic leaves the lane theatrically.
    car.wx *= 1.25;
    car.wz *= 1.25;
    car.wreckT = 2.35;
    car.down = true;
    burst(car.x, car.y, car.z, 5);
  }

  function wallHit(car, outward, hooks) {
    if (car.kind === 'player') {
      if (!scoring) return;
      const dmg = Math.max(0, outward - 8) * 1.7;
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
    const limit = ROAD_HALF - 1.15;
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
    // Traffic gets a hotter bounce than a rival. The launch afterward
    // (pop, spin, extra speed) is what sells the exaggerated bump.
    if (key === 'player-traffic') return { e: 0.55, exag: 1.75 };
    if (key === 'player-rival') return { e: 0.3, exag: 1.12 };
    if (key === 'rival-traffic') return { e: 0.32, exag: 1.35 };
    if (key === 'rival-rival') return { e: 0.16, exag: 0.6 };
    return { e: 0.06, exag: 0.35 };
  }

  // Traffic's cartoon launch is applied in launchTraffic (vertical pop + speed
  // scale). The impulse itself stays weighty so a sideswipe doesn't feel like
  // a spring. Rivals use a similar restitution with less of that pop.
  function resolvePhysics(a, b) {
    const dx0 = b.x - a.x;
    const dz0 = b.z - a.z;
    if (dx0 * dx0 + dz0 * dz0 > 36) return null;
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
    // Speed has already been changed by the impulse, so the closing speed is
    // `impact`, not player.speed. A corner clip fails `front` and stays a bump.
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
    player.health -= col.impact * 0.42;
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
    // Mark shoves before we score traffic takedowns, so a same-frame
    // player hit still counts as "you caused this".
    for (const c of contacts) {
      const rival = c.a.kind === 'rival' ? c.a : c.b.kind === 'rival' ? c.b : null;
      const other = rival === c.a ? c.b : c.a;
      if (rival && other && other.kind === 'player') rival.lastHit = simTime;
    }
    for (const c of contacts) applyContact(c.a, c.b, c.col, hooks);
  }

  function respawnRival(car) {
    spawn(car, player.along - 34 - car.slot * 9, car.preferLat, 1, car.cruise);
    car.health = car.maxHealth;
    car.invuln = 1.25;
    car.stun = 0;
    car.lastHit = -10;
    separateFromOthers(car);
  }

  function respawnTraffic(car) {
    const ahead = player.along + 90 + Math.random() * track.length * 0.4;
    spawn(car, ahead, car.lane, car.dir, car.cruise);
    car.health = car.maxHealth;
    separateFromOthers(car);
  }

  function updateMesh(car, dt, braking) {
    const g = car.mesh;
    g.position.set(car.x, car.y + (car.wrecked ? 0 : car.bob), car.z);
    g.rotation.y = car.yaw;
    if (car.wrecked) {
      car.tumble += dt * (car.kind === 'traffic' ? 3.2 : 1.6);
      g.rotation.x = car.tumble;
      g.rotation.z = Math.sin(car.tumble * 0.8) * 0.7;
    } else {
      const pitch = -car.slope - clamp(car.speed * 0.0016, -0.05, 0.05) - (car.boosting ? 0.035 : 0);
      const roll = clamp(-car.slip * 0.02 - (car.drift || 0) * 0.12, -0.32, 0.32);
      g.rotation.x = pitch;
      g.rotation.z = roll;
    }
    const dmg = 1 - clamp(car.health / car.maxHealth, 0, 1);
    const shade = 1 - dmg * 0.7;
    car.parts.paint.color.copy(car.baseColor).multiplyScalar(shade);
    car.parts.scraps.forEach((s, i) => {
      s.visible = dmg > (i + 1) * 0.28;
    });
    car.parts.shadow.visible = !car.wrecked || (car.y - (queryTrack(track, car.x, car.z).y)) < 1.2;
    const spinning = car.wrecked ? Math.hypot(car.wx, car.wz) : car.speed;
    for (const spin of car.parts.spins) spin.rotation.x -= spinning * dt * 0.55;
    for (const front of car.parts.fronts) front.rotation.y = (car.steerVisual || 0) * 0.32;
    if (car.kind === 'player') {
      car.parts.tailMat.color.setHex(braking ? 0xff3a30 : 0x8a241e);
    }
    car.bob *= Math.exp(-6 * dt);
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
    for (const car of cars) updateMesh(car, dt, braking && car === player);
    boostLight.intensity = player.boosting ? 5 : 0;

    if (player.drift && !player.wrecked) {
      skidAcc += dt;
      const fx = Math.sin(player.yaw);
      const fz = Math.cos(player.yaw);
      const rx = Math.cos(player.yaw);
      const rz = -Math.sin(player.yaw);
      if (skidAcc > 0.045) {
        skidAcc = 0;
        for (const side of [-1, 1]) {
          dropSkid(
            player.x - fx * 1.35 + rx * side * 0.92,
            player.y + 0.07,
            player.z - fz * 1.35 + rz * side * 0.92,
            player.yaw,
          );
        }
      }
      if (Math.random() < dt * 28) {
        const side = Math.random() < 0.5 ? -1 : 1;
        puff(
          player.x - fx * 1.45 + rx * side * 0.7,
          player.y + 0.35,
          player.z - fz * 1.45 + rz * side * 0.7,
        );
      }
    } else {
      skidAcc = 0;
    }

    for (const m of skids) {
      if (m.userData.life <= 0) continue;
      m.userData.life -= dt;
      m.material.opacity = 0.5 * Math.max(0, m.userData.life / m.userData.max);
      if (m.userData.life <= 0) m.visible = false;
    }
    for (const m of smokes) {
      if (m.userData.life <= 0) continue;
      m.userData.life -= dt;
      m.position.x += m.userData.vx * dt;
      m.position.y += m.userData.vy * dt;
      m.position.z += m.userData.vz * dt;
      m.scale.multiplyScalar(1 + dt * 1.4);
      m.material.opacity = 0.5 * Math.max(0, m.userData.life / m.userData.max);
      m.rotation.y = player.yaw;
      if (m.userData.life <= 0) m.visible = false;
    }

    for (const m of shards) {
      if (m.userData.life <= 0) continue;
      m.userData.life -= dt;
      m.userData.vy -= 20 * dt;
      m.position.x += m.userData.vx * dt;
      m.position.y += m.userData.vy * dt;
      m.position.z += m.userData.vz * dt;
      m.rotation.x += dt * 6;
      m.rotation.y += dt * 4;
      if (m.userData.life <= 0) m.visible = false;
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
    reset,
    update,
    wreckPlayer,
    burst,
  };
}

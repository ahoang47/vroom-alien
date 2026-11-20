import * as THREE from 'three';
import { ROAD_HALF } from './config.js';
import { sampleAt, queryTrack } from './track.js';
import { mulberry32 } from './util.js';
import {
  asphaltTexture,
  chevronTexture,
  windowTexture,
  signTexture,
} from './textures.js';

function pushFace(pos, norm, col, idx, verts, normal, color) {
  const base = pos.length / 3;
  for (let i = 0; i < 4; i++) {
    pos.push(verts[i][0], verts[i][1], verts[i][2]);
    norm.push(normal[0], normal[1], normal[2]);
    col.push(color[0], color[1], color[2]);
  }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// Axis-aligned box centered at (cx, cy, cz) with half extents.
function pushBox(pos, norm, col, idx, cx, cy, cz, hx, hy, hz, color) {
  const faces = [
    { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
    { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
    { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  ];
  for (const f of faces) {
    const verts = f.v.map((v) => [
      cx + v[0] * hx,
      cy + v[1] * hy,
      cz + v[2] * hz,
    ]);
    pushFace(pos, norm, col, idx, verts, f.n, color);
  }
}

// Box defined by a center and three half-axis vectors.
function pushOriented(pos, norm, col, idx, center, ax, ay, az, color) {
  const axes = [ax, ay, az];
  const signs = [
    { axis: 2, sign: 1, corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { axis: 2, sign: -1, corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { axis: 0, sign: 1, corners: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
    { axis: 0, sign: -1, corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { axis: 1, sign: 1, corners: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
    { axis: 1, sign: -1, corners: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  ];
  for (const f of signs) {
    const nraw = axes[f.axis];
    const nl = Math.hypot(nraw[0], nraw[1], nraw[2]) || 1;
    const normal = [nraw[0] / nl * f.sign, nraw[1] / nl * f.sign, nraw[2] / nl * f.sign];
    const verts = f.corners.map((c) => [
      center[0] + ax[0] * c[0] + ay[0] * c[1] + az[0] * c[2],
      center[1] + ax[1] * c[0] + ay[1] * c[1] + az[1] * c[2],
      center[2] + ax[2] * c[0] + ay[2] * c[1] + az[2] * c[2],
    ]);
    pushFace(pos, norm, col, idx, verts, normal, color);
  }
}

function solidMesh(pos, norm, col, idx) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return new THREE.Mesh(geo, mat);
}

function barrierSegment(pos, norm, col, idx, a, b, side, height, yLift, color, lateral, thick) {
  const mx = (a.x + b.x) * 0.5 + a.rx * side * lateral;
  const my = (a.y + b.y) * 0.5 + yLift;
  const mz = (a.z + b.z) * 0.5 + a.rz * side * lateral;
  const ax = [(b.x - a.x) * 0.56, (b.y - a.y) * 0.56, (b.z - a.z) * 0.56];
  const ay = [0, height * 0.5, 0];
  const az = [a.rx * side * thick * 0.5, 0, a.rz * side * thick * 0.5];
  pushOriented(pos, norm, col, idx, [mx, my, mz], ax, ay, az, color);
}

export function buildWorld(scene, track) {
  const rand = mulberry32(0x51A7);
  const pts = track.pts;
  const n = pts.length;

  // --- road ---
  const rPos = [];
  const rUv = [];
  const rIdx = [];
  const rings = n + 1;
  for (let i = 0; i < rings; i++) {
    const p = pts[i % n];
    const along = i === n ? track.length : p.along;
    const rx = i === n ? pts[0].rx : p.rx;
    const rz = i === n ? pts[0].rz : p.rz;
    const y = p.y + 0.02;
    rPos.push(p.x - rx * ROAD_HALF, y, p.z - rz * ROAD_HALF);
    rPos.push(p.x + rx * ROAD_HALF, y, p.z + rz * ROAD_HALF);
    const v = along * 0.045;
    rUv.push(0, v, 1, v);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    rIdx.push(a, c, b, b, c, d);
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(rUv, 2));
  roadGeo.setIndex(rIdx);
  roadGeo.computeVertexNormals();
  const roadMat = new THREE.MeshLambertMaterial({
    map: asphaltTexture(),
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.renderOrder = 1;
  scene.add(road);

  // --- concrete: barriers, deck skirt, piers ---
  const cPos = [];
  const cNorm = [];
  const cCol = [];
  const cIdx = [];
  const barrier = [0.62, 0.66, 0.5];
  const barrierTop = [0.78, 0.8, 0.62];
  const skirtCol = [0.48, 0.52, 0.38];
  const pierCol = [0.55, 0.58, 0.46];

  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (const side of [-1, 1]) {
      barrierSegment(cPos, cNorm, cCol, cIdx, a, b, side, 1.7, 0.88, barrier, ROAD_HALF + 0.2, 0.62);
      barrierSegment(cPos, cNorm, cCol, cIdx, a, b, side, 0.18, 1.78, barrierTop, ROAD_HALF + 0.2, 0.74);
      barrierSegment(cPos, cNorm, cCol, cIdx, a, b, side, 2.4, -1.15, skirtCol, ROAD_HALF - 0.15, 1.15);
    }
    if (i % 11 === 0) {
      for (const side of [-1, 1]) {
        const px = a.x + a.rx * side * (ROAD_HALF + 0.3);
        const pz = a.z + a.rz * side * (ROAD_HALF + 0.3);
        const ph = Math.max(0.4, a.y * 0.5);
        pushBox(cPos, cNorm, cCol, cIdx, px, ph, pz, 0.55, ph, 0.55, pierCol);
      }
    }
  }
  scene.add(solidMesh(cPos, cNorm, cCol, cIdx));

  // --- chevrons on the right-hand wall ---
  const chevMat = new THREE.MeshLambertMaterial({
    map: chevronTexture(),
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const chevGeo = new THREE.PlaneGeometry(8.5, 1.15);
  for (const t of [0.16, 0.33, 0.51, 0.68, 0.86]) {
    const p = sampleAt(track, track.length * t);
    const mesh = new THREE.Mesh(chevGeo, chevMat);
    mesh.position.set(
      p.x + p.rx * (ROAD_HALF + 0.58),
      p.y + 0.72,
      p.z + p.rz * (ROAD_HALF + 0.58),
    );
    mesh.rotation.y = Math.atan2(-p.rx, -p.rz);
    scene.add(mesh);
  }

  // --- crossing overpasses ---
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x4a5140, flatShading: true });
  const railMat = new THREE.MeshLambertMaterial({ color: 0x8e9478, flatShading: true });
  for (const t of [0.2, 0.48, 0.74]) {
    const p = sampleAt(track, track.length * t);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(46, 1.15, 9), deckMat);
    deck.position.set(p.x, p.y + 8.15, p.z);
    // Long axis of the box is local X. Swing that axis onto the road's right vector
    // so the deck crosses the freeway instead of running along it.
    deck.rotation.y = Math.atan2(-p.rz, p.rx);
    scene.add(deck);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(46, 0.7, 0.45), railMat);
      rail.position.set(p.x + p.tx * s * 4.4, p.y + 8.95, p.z + p.tz * s * 4.4);
      rail.rotation.y = deck.rotation.y;
      scene.add(rail);
      const column = new THREE.Mesh(new THREE.BoxGeometry(1.1, p.y + 8, 1.1), railMat);
      const cy = (p.y + 8) * 0.5;
      column.position.set(p.x + p.rx * s * 18, cy, p.z + p.rz * s * 18);
      scene.add(column);
    }
    const sign = new THREE.Mesh(chevGeo, chevMat);
    sign.position.set(p.x + p.tx * 4.7, p.y + 7.35, p.z + p.tz * 4.7);
    sign.rotation.y = Math.atan2(p.tx, p.tz);
    scene.add(sign);
  }

  // --- gantries ---
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6d7460, flatShading: true });
  const signs = ['ROAD RAGE', 'MAYHEM', 'KEEP LOW', 'I-85'];
  signs.forEach((text, i) => {
    const p = sampleAt(track, track.length * (0.08 + i * 0.22));
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.4, 0.35), postMat);
      post.position.set(
        p.x + p.rx * s * (ROAD_HALF + 0.15),
        p.y + 2.2,
        p.z + p.rz * s * (ROAD_HALF + 0.15),
      );
      scene.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 1.2, 0.28, 0.28), postMat);
    beam.position.set(p.x, p.y + 4.35, p.z);
    beam.rotation.y = Math.atan2(-p.rz, p.rx);
    scene.add(beam);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 2.15),
      new THREE.MeshLambertMaterial({ map: signTexture(text), flatShading: true, side: THREE.DoubleSide }),
    );
    board.position.set(p.x, p.y + 3.55, p.z);
    board.rotation.y = Math.atan2(-p.tx, -p.tz);
    scene.add(board);
  });

  // --- city blocks ---
  const bPos = [];
  const bNorm = [];
  const bCol = [];
  const bIdx = [];
  const wPos = [];
  const wNorm = [];
  const wUv = [];
  const wIdx = [];
  const palette = [
    [0.55, 0.6, 0.46],
    [0.46, 0.51, 0.4],
    [0.62, 0.64, 0.5],
    [0.4, 0.45, 0.34],
    [0.68, 0.7, 0.55],
  ];

  function pushWindow(origin, ax, ay) {
    const base = wPos.length / 3;
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const cr = [
      ax[1] * ay[2] - ax[2] * ay[1],
      ax[2] * ay[0] - ax[0] * ay[2],
      ax[0] * ay[1] - ax[1] * ay[0],
    ];
    const cl = Math.hypot(cr[0], cr[1], cr[2]) || 1;
    const repeats = Math.max(1, Math.hypot(ay[0], ay[1], ay[2]) / 7);
    for (const [u, v] of corners) {
      wPos.push(origin[0] + ax[0] * u + ay[0] * v, origin[1] + ax[1] * u + ay[1] * v, origin[2] + ax[2] * u + ay[2] * v);
      wNorm.push(cr[0] / cl, cr[1] / cl, cr[2] / cl);
      wUv.push(u * 2, v * repeats);
    }
    wIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    // back face
    const base2 = wPos.length / 3;
    for (const [u, v] of [[1, 0], [0, 0], [0, 1], [1, 1]]) {
      wPos.push(origin[0] + ax[0] * u + ay[0] * v, origin[1] + ax[1] * u + ay[1] * v, origin[2] + ax[2] * u + ay[2] * v);
      wNorm.push(-cr[0] / cl, -cr[1] / cl, -cr[2] / cl);
      wUv.push(u * 2, v * repeats);
    }
    wIdx.push(base2, base2 + 1, base2 + 2, base2, base2 + 2, base2 + 3);
  }

  for (let gx = -6; gx <= 6; gx++) {
    for (let gz = -5; gz <= 5; gz++) {
      const jitterX = (rand() - 0.5) * 10;
      const jitterZ = (rand() - 0.5) * 10;
      const x = gx * 42 + jitterX;
      const z = gz * 38 + jitterZ;
      const hw = 5 + rand() * 7;
      const hd = 5 + rand() * 7;
      const q = queryTrack(track, x, z);
      if (q.dist < ROAD_HALF + Math.max(hw, hd) + 6) continue;
      const height = 8 + rand() * rand() * 62;
      const color = palette[(rand() * palette.length) | 0];
      pushBox(bPos, bNorm, bCol, bIdx, x, height * 0.5, z, hw, height * 0.5, hd, color);
      if (rand() > 0.55) {
        const hh = 2 + rand() * 8;
        pushBox(
          bPos, bNorm, bCol, bIdx,
          x, height + hh * 0.5, z,
          hw * 0.55, hh * 0.5, hd * 0.55,
          palette[(rand() * palette.length) | 0],
        );
      }
      // Two window faces, nudged out so they don't z-fight the walls.
      pushWindow(
        [x - hw - 0.05, 1.2, z - hd * 0.72],
        [0, 0, hd * 1.44],
        [0, height - 2, 0],
      );
      pushWindow(
        [x - hw * 0.72, 1.2, z + hd + 0.05],
        [hw * 1.44, 0, 0],
        [0, height - 2, 0],
      );
    }
  }
  scene.add(solidMesh(bPos, bNorm, bCol, bIdx));

  const wGeo = new THREE.BufferGeometry();
  wGeo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
  wGeo.setAttribute('normal', new THREE.Float32BufferAttribute(wNorm, 3));
  wGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wUv, 2));
  wGeo.setIndex(wIdx);
  const windows = new THREE.Mesh(
    wGeo,
    new THREE.MeshLambertMaterial({ map: windowTexture(), flatShading: true, side: THREE.DoubleSide }),
  );
  scene.add(windows);

  // --- ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshLambertMaterial({ color: 0xa7b072 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  // A couple of far elevated ramps so the skyline isn't only boxes.
  const rampMat = new THREE.MeshLambertMaterial({ color: 0x8b9174, flatShading: true });
  for (const spec of [
    { x: -40, z: 180, len: 90, rot: 0.4, y: 16 },
    { x: 70, z: -190, len: 110, rot: -0.3, y: 18 },
  ]) {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(spec.len, 2.2, 8), rampMat);
    ramp.position.set(spec.x, spec.y, spec.z);
    ramp.rotation.y = spec.rot;
    scene.add(ramp);
  }
}

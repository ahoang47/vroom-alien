// Static freeway dressing. Stacks that never turn are rasterized once (or the
// first time they scroll on screen) and then blitted as plain sprites.
import { ROAD_HALF } from './config.js';
import { PX, SQUASH, SPACING, HEIGHT_PX } from './display.js';
import { sampleAt, queryTrack } from './track.js';
import { mulberry32, clamp } from './util.js';
import { rasterStack, quantizeTurn, turnFromYaw } from './stack.js';
import {
  buildGarage,
  makeBarrier,
  makeBuildingSheet,
  makeColumn,
  makeDeckSheet,
} from './art.js';

const PALETTE = [
  [140, 153, 117, 255],
  [117, 130, 102, 255],
  [158, 163, 128, 255],
  [102, 115, 87, 255],
  [173, 179, 140, 255],
];

function cached(map, key, build) {
  let sprite = map.get(key);
  if (!sprite) {
    sprite = build();
    map.set(key, sprite);
  }
  return sprite;
}

export function buildWorld(track) {
  const garage = buildGarage();
  const pts = track.pts;
  const n = pts.length;
  const statics = [];
  const roads = [];
  const barrierCache = new Map();
  const columnCache = new Map();

  function add(x, y, z, sprite, layer, margin) {
    statics.push({
      x, y, z, sprite, layer, margin,
      build: null,
    });
  }

  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    roads.push({ a, b, layer: 0.12 });
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) continue;
    const yaw = Math.atan2(dx, dz);
    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    const mz = (a.z + b.z) * 0.5;
    const lengthPx = clamp(Math.round(len * PX), 4, 80);
    const thickPx = Math.max(5, Math.round(0.9 * PX));
    for (const side of [-1, 1]) {
      const chevron = side > 0;
      const q = quantizeTurn(turnFromYaw(yaw));
      const key = `${lengthPx}:${thickPx}:${chevron ? 1 : 0}:${q.bucket}`;
      const sprite = cached(barrierCache, key, () => rasterStack(
        makeBarrier(lengthPx, thickPx, chevron),
        q.turn,
        SQUASH,
        SPACING,
      ));
      const lateral = side * (ROAD_HALF + 0.2);
      add(
        mx + a.rx * lateral,
        my,
        mz + a.rz * lateral,
        sprite,
        0.22,
        Math.ceil(lengthPx * 0.6) + 12,
      );
    }
  }

  const lampCache = new Map();
  for (let i = 0; i < n; i += 8) {
    const p = pts[i];
    const yaw = Math.atan2(p.tx, p.tz);
    for (const side of [-1, 1]) {
      const q = quantizeTurn(turnFromYaw(yaw) + (side < 0 ? Math.PI : 0));
      const sprite = cached(lampCache, q.bucket, () => rasterStack(garage.lamp, q.turn, SQUASH, SPACING));
      const lateral = side * (ROAD_HALF + 1.45);
      add(p.x + p.rx * lateral, p.y, p.z + p.rz * lateral, sprite, 0.28, 24);
    }
  }

  const pierColor = [132, 140, 112, 255];
  const pierTop = [186, 190, 156, 255];
  for (let i = 0; i < n; i += 11) {
    const p = pts[i];
    const count = clamp(Math.round(p.y * HEIGHT_PX) + 1, 8, 72);
    const sprite = cached(columnCache, `pier:${count}`, () => rasterStack(
      makeColumn(7, count, pierColor, pierTop),
      0,
      SQUASH,
      SPACING,
    ));
    for (const side of [-1, 1]) {
      const lateral = side * (ROAD_HALF + 0.15);
      add(p.x + p.rx * lateral, 0, p.z + p.rz * lateral, sprite, 0.04, 20);
    }
  }

  const deckW = Math.round(7 * PX);
  const deckL = Math.round(30 * PX);
  const deckSheet = makeDeckSheet(deckW, deckL);
  for (const t of [0.2, 0.48, 0.74]) {
    const p = sampleAt(track, track.length * t);
    const q = quantizeTurn(turnFromYaw(Math.atan2(p.rx, p.rz)));
    const deck = rasterStack(deckSheet, q.turn, SQUASH, SPACING);
    add(p.x, p.y + 8, p.z, deck, 0.36, Math.ceil(deckL * 0.6));
    const rise = clamp(Math.round((p.y + 8) * HEIGHT_PX) + 1, 10, 80);
    const column = cached(columnCache, `over:${rise}`, () => rasterStack(
      makeColumn(8, rise, [150, 156, 126, 255], [190, 194, 160, 255]),
      0,
      SQUASH,
      SPACING,
    ));
    for (const side of [-1, 1]) {
      add(p.x + p.rx * side * 16, 0, p.z + p.rz * side * 16, column, 0.06, 24);
    }
  }

  const rand = mulberry32(0x51A7);
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
      const colorI = (rand() * PALETTE.length) | 0;
      let tower = false;
      if (rand() > 0.55) {
        rand();
        rand();
        tower = true;
      }
      if (q.dist > 42) continue;
      const spec = {
        sliceW: clamp(Math.round(hw * 2 * PX), 14, 96),
        sliceH: clamp(Math.round(hd * 2 * PX), 14, 96),
        count: clamp(Math.round(height * 1.15), 14, 52),
        wall: PALETTE[colorI],
        roof: PALETTE[(colorI + 2) % PALETTE.length],
        tower,
      };
      statics.push({
        x,
        y: 0,
        z,
        sprite: null,
        layer: 0.02,
        margin: 200,
        build: () => rasterStack(makeBuildingSheet(spec), 0, SQUASH, SPACING),
      });
    }
  }

  return { statics, roads, garage };
}

// Scenery streams in along the endless freeway. Stacks that never change
// facing are rasterized once and then blitted as plain sprites.
import { PX, SQUASH, SPACING, HEIGHT_PX } from './display.js';
import { sampleAt } from './track.js';
import { clamp } from './util.js';
import { rasterStack, quantizeTurn, turnFromYaw } from './stack.js';
import {
  buildGarage,
  makeBarrier,
  makeBuildingSheet,
  makeColumn,
  makeDeckSheet,
} from './art.js';

const CHUNK = 40;
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

export function createWorld(track) {
  const garage = buildGarage();
  const chunks = new Map();
  const barrierCache = new Map();
  const lampCache = new Map();
  const tree = rasterStack(garage.tree, 0, SQUASH, SPACING);
  const columnCache = new Map();
  const deckSheet = makeDeckSheet(Math.round(8 * PX), Math.round(28 * PX));

  function add(list, x, y, z, sprite, layer, margin, build) {
    list.push({ x, y, z, sprite, layer, margin, build: build || null });
  }

  function buildChunk(index) {
    const s0 = index * CHUNK;
    const roads = [];
    const statics = [];
    const step = 8;
    for (let s = s0; s < s0 + CHUNK; s += step) {
      const a = sampleAt(track, s);
      const b = sampleAt(track, s + step);
      roads.push({ a, b, layer: 0.12 });
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = Math.atan2(a.tx, a.tz);
      const q = quantizeTurn(turnFromYaw(yaw));
      const lengthPx = clamp(Math.round(len * PX), 4, 80);
      const thickPx = Math.max(5, Math.round(0.85 * PX));
      const mx = (a.x + b.x) * 0.5;
      const mz = (a.z + b.z) * 0.5;
      for (const side of [-1, 1]) {
        const chevron = side > 0;
        const key = `${lengthPx}:${thickPx}:${chevron ? 1 : 0}:${q.bucket}`;
        const sprite = cached(barrierCache, key, () => rasterStack(
          makeBarrier(lengthPx, thickPx, chevron),
          q.turn,
          SQUASH,
          SPACING,
        ));
        const lateral = side * (a.half + 0.35);
        add(statics, mx + a.rx * lateral, (a.y + b.y) * 0.5, mz + a.rz * lateral, sprite, 0.22, Math.ceil(lengthPx * 0.6) + 8);
      }
    }

    const lampAt = sampleAt(track, s0 + CHUNK * 0.5);
    const lampYaw = Math.atan2(lampAt.tx, lampAt.tz);
    for (const side of [-1, 1]) {
      const q = quantizeTurn(turnFromYaw(lampYaw + (side < 0 ? Math.PI : 0)));
      const sprite = cached(lampCache, q.bucket, () => rasterStack(garage.lamp, q.turn, SQUASH, SPACING));
      const lateral = side * (lampAt.half + 2.4);
      add(statics, lampAt.x + lampAt.rx * lateral, lampAt.y, lampAt.z + lampAt.rz * lateral, sprite, 0.28, 20);
    }

    const pierCount = clamp(Math.round(lampAt.y * HEIGHT_PX) + 1, 8, 72);
    const pier = cached(columnCache, `pier:${pierCount}`, () => rasterStack(
      makeColumn(7, pierCount, [132, 140, 112, 255], [186, 190, 156, 255]),
      0,
      SQUASH,
      SPACING,
    ));
    for (const side of [-1, 1]) {
      const lateral = side * (lampAt.half + 0.15);
      add(statics, lampAt.x + lampAt.rx * lateral, 0, lampAt.z + lampAt.rz * lateral, pier, 0.04, 20);
    }

    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const p = sampleAt(track, s0 + 8 + k * 16 + (side < 0 ? 4 : 0));
        const lateral = side * (p.half + 4.5 + (index + k) % 3);
        add(statics, p.x + p.rx * lateral, 0, p.z + p.rz * lateral, tree, 0.2, 16);
      }
    }

    if (index % 2 === 0) {
      const side = index % 4 === 0 ? 1 : -1;
      const p = sampleAt(track, s0 + 18);
      const hw = 4 + (index % 3) * 1.4;
      const hd = 4 + ((index >> 1) % 3) * 1.2;
      const height = 6 + (index % 5) * 1.6;
      const colorI = Math.abs(index) % PALETTE.length;
      const spec = {
        sliceW: clamp(Math.round(hw * 2 * PX), 14, 48),
        sliceH: clamp(Math.round(hd * 2 * PX), 14, 48),
        count: clamp(Math.round(height * 0.7), 6, 12),
        wall: PALETTE[colorI],
        roof: PALETTE[(colorI + 2) % PALETTE.length],
        tower: index % 6 === 0,
      };
      const lateral = side * (p.half + hw + 6);
      add(statics, p.x + p.rx * lateral, 0, p.z + p.rz * lateral, null, 0.16, 48, () => rasterStack(
        makeBuildingSheet(spec),
        0,
        SQUASH,
        SPACING,
      ));
    }

    const period = 700;
    const mark = 180;
    for (let s = s0; s < s0 + CHUNK; s += 1) {
      const u = ((s % period) + period) % period;
      if (Math.abs(u - mark) > 0.5) continue;
      const p = sampleAt(track, s);
      const q = quantizeTurn(turnFromYaw(Math.atan2(p.rx, p.rz)));
      const deck = rasterStack(deckSheet, q.turn, SQUASH, SPACING);
      add(statics, p.x, p.y + 8, p.z, deck, 0.36, 80);
      const rise = clamp(Math.round((p.y + 8) * HEIGHT_PX) + 1, 10, 80);
      const column = cached(columnCache, `over:${rise}`, () => rasterStack(
        makeColumn(8, rise, [150, 156, 126, 255], [190, 194, 160, 255]),
        0,
        SQUASH,
        SPACING,
      ));
      for (const side of [-1, 1]) {
        add(statics, p.x + p.rx * side * (p.half + 1.2), 0, p.z + p.rz * side * (p.half + 1.2), column, 0.08, 20);
      }
      break;
    }

    return { roads, statics };
  }

  function ensure(along) {
    const a = Math.floor((along - 40) / CHUNK);
    const b = Math.floor((along + 80) / CHUNK);
    for (let i = a; i <= b; i++) {
      if (!chunks.has(i)) chunks.set(i, buildChunk(i));
    }
    for (const key of chunks.keys()) {
      if (key < a - 1 || key > b + 1) chunks.delete(key);
    }
  }

  function collect() {
    const statics = [];
    const roads = [];
    for (const chunk of chunks.values()) {
      for (let i = 0; i < chunk.roads.length; i++) roads.push(chunk.roads[i]);
      for (let i = 0; i < chunk.statics.length; i++) statics.push(chunk.statics[i]);
    }
    return { statics, roads };
  }

  return { garage, ensure, collect };
}

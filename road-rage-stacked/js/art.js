// Procedural slice sheets. Flat fills only. The outline is added once to the
// finished stack, not baked into these slices, so diagonals stay clean.
// Every sheet faces down: nose and front at high y, tail at low y.
// One pixel is one eighth of a metre (see PX). Length, width, height, and
// wheelbase follow published figures for the cars named in the README.

import { PX } from './display.js';
import { createSheet, fillRect, plot } from './stack.js';

export const TAIL = 1;
export const HEAD = 2;

const GLASS = [28, 36, 26, 255];
const WHEEL = [24, 22, 18, 255];
const HUB = [78, 74, 62, 255];
const HEAD_COLOR = [255, 236, 186, 255];
const TAIL_COLOR = [148, 34, 30, 255];
const UNDER = [32, 28, 22, 255];

function css(hex) {
  const n = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

function darker(color, mul) {
  return [(color[0] * mul) | 0, (color[1] * mul) | 0, (color[2] * mul) | 0, 255];
}

function lerpKeys(keys, u) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const span = keys[i][0] - keys[i - 1][0] || 1;
      const t = (u - keys[i - 1][0]) / span;
      return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * t;
    }
  }
  return keys[keys.length - 1][1];
}

// u runs from the tail (0) to the nose (1). plan is the half-width, 0 to 1.
// deck is how high the body metal goes. roof is the cabin, box, or wing.
// A gap between deck and roof is glass. bedKeep draws only the outer rails.
function makeVehicle(model, paint) {
  const sliceW = Math.max(8, Math.round(model.width * PX));
  const sliceH = Math.max(16, Math.round(model.length * PX));
  const count = Math.max(5, Math.round(model.height * 4.2));
  const sheet = createSheet(sliceW, sliceH, count);
  const body = paint.body;
  const accent = paint.accent;
  const bumper = darker(body, 0.72);
  const roofColor = darker(body, 0.82);
  const rearOver = model.length - model.frontOverhang - model.wheelbase;
  const rearU = rearOver / model.length;
  const frontU = (rearOver + model.wheelbase) / model.length;
  const cx = (sliceW - 1) / 2;

  for (let z = 0; z < count; z++) {
    const t = count === 1 ? 0 : z / (count - 1);
    for (let y = 0; y < sliceH; y++) {
      const u = sliceH === 1 ? 0 : y / (sliceH - 1);
      const half = lerpKeys(model.plan, u);
      for (let x = 0; x < sliceW; x++) {
        const dx = Math.abs(x - cx) / (sliceW * 0.5);
        if (dx > half) continue;
        const deck = lerpKeys(model.deck, u);
        const roof = lerpKeys(model.roof, u);
        const bed = model.bed && u >= model.bed[0] && u <= model.bed[1] && dx < 0.62;
        const nearAxle = Math.abs(u - rearU) < 0.045 || Math.abs(u - frontU) < 0.045;
        if (t < 0.2 && nearAxle && dx > 0.62) {
          plot(sheet, z, x, y, dx > 0.82 ? WHEEL : HUB);
          continue;
        }
        if (bed && t > 0.22) continue;
        if (t <= deck) {
          let color = body;
          if (u < 0.06 || u > 0.94) color = bumper;
          if (paint.camo && ((x * 3 + y) % 11 < 3) && t > 0.22 && t < 0.7) color = accent;
          if (!paint.camo && paint.stripe && Math.abs(x - cx) <= 0.8 && t > 0.25 && t < deck) color = accent;
          plot(sheet, z, x, y, color);
          continue;
        }
        if (roof > deck + 0.05 && t <= roof && dx < half * 0.78) {
          const glass = t < roof - 0.12;
          plot(sheet, z, x, y, glass ? GLASS : roofColor);
          continue;
        }
        if (model.wing && u >= model.wing[0] && u <= model.wing[1] && t > 0.78 && t < 0.96 && dx <= half) {
          plot(sheet, z, x, y, accent);
        }
      }
    }
    if (t > 0.32 && t < 0.58) {
      const yNose = sliceH - 3;
      const yTail = 1;
      const inset = Math.max(2, Math.round(sliceW * 0.22));
      const lampW = Math.max(2, Math.round(sliceW * 0.16));
      fillRect(sheet, z, inset, yNose, lampW, 2, HEAD_COLOR, HEAD);
      fillRect(sheet, z, sliceW - inset - lampW, yNose, lampW, 2, HEAD_COLOR, HEAD);
      if (model.tail === 'tri') {
        fillRect(sheet, z, inset, yTail, 2, 2, TAIL_COLOR, TAIL);
        fillRect(sheet, z, Math.round(cx) - 1, yTail, 2, 2, TAIL_COLOR, TAIL);
        fillRect(sheet, z, sliceW - inset - 2, yTail, 2, 2, TAIL_COLOR, TAIL);
      } else {
        fillRect(sheet, z, inset, yTail, lampW, 2, TAIL_COLOR, TAIL);
        fillRect(sheet, z, sliceW - inset - lampW, yTail, lampW, 2, TAIL_COLOR, TAIL);
      }
    }
  }
  return sheet;
}

// Published length / width / height / wheelbase, in metres.
// plan and the height keys are sampled from the tail (0) to the nose (1).
const COUPE = {
  name: 'Coupe',
  basedOn: 'Porsche 911 Carrera (992)',
  length: 4.519, width: 1.852, height: 1.298, wheelbase: 2.45, frontOverhang: 0.97,
  plan: [[0, 0.7], [0.12, 0.98], [0.34, 1], [0.55, 0.9], [0.78, 0.72], [1, 0.4]],
  deck: [[0, 0.55], [0.2, 0.5], [0.7, 0.48], [1, 0.4]],
  roof: [[0, 0.5], [0.28, 0.5], [0.36, 0.98], [0.6, 0.96], [0.68, 0.48], [1, 0.4]],
  wing: [0.02, 0.14],
};
const WIDE = {
  name: 'Wide coupe',
  basedOn: 'Nissan GT-R (R35)',
  length: 4.71, width: 1.895, height: 1.37, wheelbase: 2.78, frontOverhang: 1.0,
  plan: [[0, 0.9], [0.15, 1], [0.7, 0.98], [0.88, 0.9], [1, 0.78]],
  deck: [[0, 0.58], [0.7, 0.5], [1, 0.46]],
  roof: [[0, 0.55], [0.28, 0.52], [0.36, 0.98], [0.62, 0.96], [0.7, 0.48], [1, 0.46]],
  wing: [0.0, 0.12],
};
const MUSCLE = {
  name: 'Muscle',
  basedOn: 'Dodge Challenger',
  length: 5.027, width: 1.923, height: 1.46, wheelbase: 2.946, frontOverhang: 1.12,
  plan: [[0, 0.82], [0.2, 0.96], [0.55, 0.98], [0.85, 0.8], [1, 0.62]],
  deck: [[0, 0.46], [0.25, 0.44], [0.55, 0.5], [1, 0.42]],
  roof: [[0, 0.44], [0.16, 0.44], [0.22, 0.96], [0.48, 0.94], [0.56, 0.48], [1, 0.42]],
  tail: 'bar',
};
const ROTARY = {
  name: 'Rotary coupe',
  basedOn: 'Mazda RX-7 (FD)',
  length: 4.285, width: 1.76, height: 1.23, wheelbase: 2.425, frontOverhang: 0.93,
  plan: [[0, 0.55], [0.16, 0.92], [0.4, 1], [0.7, 0.86], [0.9, 0.6], [1, 0.36]],
  deck: [[0, 0.52], [0.3, 0.46], [1, 0.4]],
  roof: [[0, 0.48], [0.3, 0.46], [0.4, 0.98], [0.64, 0.96], [0.72, 0.42], [1, 0.4]],
  wing: [0.02, 0.12],
};
const FASTBACK = {
  name: 'Fastback',
  basedOn: 'Ford Mustang fastback (S550)',
  length: 4.788, width: 1.916, height: 1.381, wheelbase: 2.72, frontOverhang: 1.06,
  plan: [[0, 0.78], [0.18, 0.96], [0.5, 0.98], [0.82, 0.78], [1, 0.55]],
  deck: [[0, 0.5], [0.35, 0.46], [1, 0.42]],
  roof: [[0, 0.55], [0.18, 0.62], [0.28, 0.96], [0.52, 0.9], [0.64, 0.5], [1, 0.42]],
  tail: 'tri',
};
const LIFTBACK = {
  name: 'Liftback',
  basedOn: 'Toyota Supra (A90)',
  length: 4.379, width: 1.854, height: 1.292, wheelbase: 2.47, frontOverhang: 1.02,
  plan: [[0, 0.72], [0.14, 0.96], [0.4, 1], [0.62, 0.9], [0.84, 0.66], [1, 0.38]],
  deck: [[0, 0.55], [0.25, 0.48], [1, 0.4]],
  roof: [[0, 0.5], [0.28, 0.48], [0.38, 0.98], [0.58, 0.94], [0.68, 0.46], [1, 0.4]],
  wing: [0.0, 0.1],
};
const SEDAN = {
  name: 'Sedan',
  basedOn: 'Toyota Camry',
  length: 4.885, width: 1.84, height: 1.445, wheelbase: 2.825, frontOverhang: 0.96,
  plan: [[0, 0.78], [0.1, 0.94], [0.8, 0.94], [1, 0.7]],
  deck: [[0, 0.42], [0.3, 0.4], [0.62, 0.46], [1, 0.4]],
  roof: [[0, 0.4], [0.22, 0.4], [0.3, 0.96], [0.62, 0.94], [0.7, 0.44], [1, 0.4]],
};
const HATCH = {
  name: 'Hatchback',
  basedOn: 'Volkswagen Golf',
  length: 4.284, width: 1.789, height: 1.456, wheelbase: 2.636, frontOverhang: 0.89,
  plan: [[0, 0.86], [0.12, 0.98], [0.75, 0.94], [1, 0.66]],
  deck: [[0, 0.48], [0.55, 0.46], [1, 0.4]],
  roof: [[0, 0.9], [0.08, 0.9], [0.16, 0.98], [0.58, 0.96], [0.68, 0.46], [1, 0.4]],
};
const PICKUP = {
  name: 'Pickup',
  basedOn: 'Ford F-150 SuperCrew',
  length: 5.885, width: 2.029, height: 1.961, wheelbase: 3.683, frontOverhang: 0.96,
  plan: [[0, 0.9], [0.08, 1], [0.85, 0.96], [1, 0.72]],
  deck: [[0, 0.34], [0.45, 0.34], [0.5, 0.5], [1, 0.42]],
  roof: [[0, 0.3], [0.4, 0.3], [0.46, 0.92], [0.68, 0.9], [0.74, 0.46], [1, 0.4]],
  bed: [0.02, 0.44],
};
const VAN = {
  name: 'Van',
  basedOn: 'Mercedes-Benz Sprinter',
  length: 5.932, width: 2.02, height: 2.62, wheelbase: 3.665, frontOverhang: 0.86,
  plan: [[0, 0.94], [0.06, 1], [0.86, 1], [1, 0.7]],
  deck: [[0, 0.55], [0.82, 0.55], [1, 0.4]],
  roof: [[0, 1], [0.78, 1], [0.88, 0.7], [1, 0.42]],
};
const BOX = {
  name: 'Box truck',
  basedOn: 'a cab-over box truck (Isuzu N-series proportions)',
  length: 7.4, width: 2.4, height: 3.2, wheelbase: 3.4, frontOverhang: 1.15,
  plan: [[0, 0.98], [0.7, 1], [0.78, 0.82], [1, 0.78]],
  deck: [[0, 0.42], [0.68, 0.42], [0.74, 0.55], [1, 0.48]],
  roof: [[0, 1], [0.7, 1], [0.76, 0.72], [0.82, 0.9], [0.96, 0.7], [1, 0.48]],
};

export const BODY = {
  player: COUPE.length,
  rivals: [WIDE.length, MUSCLE.length, ROTARY.length, FASTBACK.length, LIFTBACK.length],
  traffic: [SEDAN.length, HATCH.length, PICKUP.length, VAN.length, BOX.length],
};

const RIVAL_MODELS = [WIDE, MUSCLE, ROTARY, FASTBACK, LIFTBACK];
const TRAFFIC_MODELS = [SEDAN, HATCH, PICKUP, VAN, BOX];

export function facesForward(sheet) {
  let nose = 0;
  let noseN = 0;
  let tail = 0;
  let tailN = 0;
  for (let z = 0; z < sheet.count; z++) {
    for (let y = 0; y < sheet.sliceH; y++) {
      for (let x = 0; x < sheet.sliceW; x++) {
        const m = sheet.mask[(z * sheet.sliceH + y) * sheet.sliceW + x];
        if (m === HEAD) {
          nose += y;
          noseN++;
        } else if (m === TAIL) {
          tail += y;
          tailN++;
        }
      }
    }
  }
  return noseN > 0 && tailN > 0 && nose / noseN > tail / tailN + 4;
}

export function makeBarrier(lengthPx, thickPx, chevron) {
  const count = 7;
  const sheet = createSheet(thickPx, lengthPx, count);
  const body = [150, 158, 122, 255];
  const cap = [214, 214, 176, 255];
  const edge = [92, 100, 74, 255];
  const red = [210, 74, 60, 255];
  const cream = [244, 241, 228, 255];
  for (let z = 0; z < count; z++) {
    const top = z >= count - 2;
    for (let y = 0; y < lengthPx; y++) {
      for (let x = 0; x < thickPx; x++) {
        let color = top ? cap : body;
        if (!top && (x === 0 || x === thickPx - 1)) color = edge;
        if (chevron && x >= thickPx - 2 && !top) {
          color = (Math.floor(y / 3) % 2 === 0) ? red : cream;
        }
        plot(sheet, z, x, y, color);
      }
    }
  }
  return sheet;
}

export function makeTree() {
  const sheet = createSheet(9, 9, 8);
  const trunk = [96, 68, 42, 255];
  const leaf = [54, 88, 44, 255];
  const top = [156, 176, 86, 255];
  for (let z = 0; z < 8; z++) {
    if (z < 3) fillRect(sheet, z, 3, 3, 3, 3, trunk);
    else {
      const inset = z > 6 ? 2 : z > 5 ? 1 : 0;
      fillRect(sheet, z, inset, inset, 9 - inset * 2, 9 - inset * 2, z > 6 ? top : leaf);
    }
  }
  return sheet;
}

export function makeLamp() {
  const sheet = createSheet(11, 11, 16);
  const pole = [96, 102, 80, 255];
  const head = [214, 206, 160, 255];
  const glow = [255, 244, 200, 255];
  for (let z = 0; z < 16; z++) {
    fillRect(sheet, z, 4, 4, 3, 3, pole);
    if (z >= 12) fillRect(sheet, z, 1, 4, 6, 2, pole);
    if (z >= 14) {
      fillRect(sheet, z, 0, 3, 3, 4, head);
      fillRect(sheet, z, 1, 4, 2, 2, glow);
    }
  }
  return sheet;
}

export function makeColumn(size, count, color, top) {
  const sheet = createSheet(size, size, count);
  const edge = darker(color, 0.78);
  for (let z = 0; z < count; z++) {
    const c = z >= count - 1 ? top : color;
    fillRect(sheet, z, 0, 0, size, size, c);
    if (z < count - 1) {
      for (let i = 0; i < size; i++) {
        plot(sheet, z, i, 0, edge);
        plot(sheet, z, i, size - 1, edge);
        plot(sheet, z, 0, i, edge);
        plot(sheet, z, size - 1, i, edge);
      }
    }
  }
  return sheet;
}

// Deck crosses the freeway. Local +Y is the long axis, local +X the width.
export function makeDeckSheet(sliceW, sliceH) {
  const count = 6;
  const sheet = createSheet(sliceW, sliceH, count);
  const concrete = [116, 124, 98, 255];
  const asphalt = [62, 68, 52, 255];
  const rail = [168, 174, 142, 255];
  const red = [210, 74, 60, 255];
  const cream = [244, 241, 228, 255];
  for (let z = 0; z < count; z++) {
    if (z < 3) {
      fillRect(sheet, z, 0, 0, sliceW, sliceH, concrete);
      for (let y = 0; y < sliceH; y++) {
        const stripe = (Math.floor(y / 4) % 2 === 0) ? red : cream;
        plot(sheet, z, sliceW - 1, y, stripe);
        plot(sheet, z, sliceW - 2, y, stripe);
      }
    } else if (z < 5) {
      fillRect(sheet, z, 0, 0, sliceW, sliceH, asphalt);
      fillRect(sheet, z, 0, 0, 3, sliceH, rail);
      fillRect(sheet, z, sliceW - 3, 0, 3, sliceH, rail);
    } else {
      fillRect(sheet, z, 0, 0, 3, sliceH, rail);
      fillRect(sheet, z, sliceW - 3, 0, 3, sliceH, rail);
    }
  }
  return sheet;
}

const WIN_LIT = [239, 230, 176, 255];
const WIN_DARK = [36, 44, 32, 255];

export function makeBuildingSheet(spec) {
  const { sliceW, sliceH, count, wall, roof, tower } = spec;
  const sheet = createSheet(sliceW, sliceH, count);
  const insetAt = tower ? Math.floor(count * 0.7) : count;
  for (let z = 0; z < count; z++) {
    const roofing = z >= count - 2 || (tower && z === insetAt);
    let x0 = 0;
    let y0 = 0;
    let x1 = sliceW;
    let y1 = sliceH;
    if (tower && z >= insetAt) {
      const mx = Math.max(2, Math.floor(sliceW * 0.22));
      const my = Math.max(2, Math.floor(sliceH * 0.22));
      x0 = mx;
      y0 = my;
      x1 = sliceW - mx;
      y1 = sliceH - my;
      if (x1 - x0 < 4 || y1 - y0 < 4) {
        x0 = 0;
        y0 = 0;
        x1 = sliceW;
        y1 = sliceH;
      }
    }
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const edge = x < x0 + 2 || y < y0 + 2 || x >= x1 - 2 || y >= y1 - 2;
        let color = wall;
        if (roofing) color = roof;
        else if (edge) {
          const cell = (x - x0) % 6 < 4 && (y - y0) % 7 < 5;
          const lit = ((x * 3 + y * 5 + z * 2) % 13) < 5;
          color = cell ? (lit ? WIN_LIT : WIN_DARK) : wall;
        }
        plot(sheet, z, x, y, color);
      }
    }
  }
  return sheet;
}

function makeFlame() {
  const sheet = createSheet(7, 12, 4);
  const hot = [255, 236, 186, 255];
  const mid = [255, 150, 48, 255];
  const low = [214, 69, 40, 255];
  for (let z = 0; z < 4; z++) {
    const grow = z < 2 ? 0 : 1;
    fillRect(sheet, z, 2 - grow, 7, 3 + grow * 2, 5, low);
    fillRect(sheet, z, 2, 3, 3, 5, mid);
    fillRect(sheet, z, 3, 0, 1, 4, hot);
  }
  return sheet;
}

function makeShard(color) {
  const sheet = createSheet(3, 3, 2);
  fillRect(sheet, 0, 0, 0, 3, 3, color);
  fillRect(sheet, 1, 1, 0, 1, 2, [255, 236, 200, 255]);
  return sheet;
}

export function buildGarage() {
  const rivalPaint = [
    ['#2f6fbe', '#e8eef2'],
    ['#1b1b1b', '#e2c04a'],
    ['#2f8f4e', '#102016'],
    ['#f4f1e4', '#d23b32'],
    ['#6a3d8a', '#7ee0d0'],
  ];
  const trafficPaint = [0xd9d3c2, 0x8e97a3, 0xc6b15c, 0x5e6772, 0xb7c2ae];
  return {
    player: makeVehicle(COUPE, { body: css('#d7c09a'), accent: css('#d6453c'), camo: true }),
    rivals: RIVAL_MODELS.map((model, i) => makeVehicle(model, {
      body: css(rivalPaint[i][0]),
      accent: css(rivalPaint[i][1]),
      stripe: true,
    })),
    traffic: TRAFFIC_MODELS.map((model, i) => makeVehicle(model, {
      body: css(trafficPaint[i]),
      accent: darker(css(trafficPaint[i]), 0.7),
      stripe: false,
    })),
    lamp: makeLamp(),
    tree: makeTree(),
    flame: makeFlame(),
    shards: [makeShard(css('#d6453c')), makeShard(css('#2a2418'))],
  };
}

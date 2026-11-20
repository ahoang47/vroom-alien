// Procedural slice sheets. Flat fills only. The outline is added once to the
// finished stack, not baked into these slices, so diagonals stay clean.
// Every sheet faces down: nose and front at high y, tail at low y.

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

function wheel(sheet, z, x, y) {
  fillRect(sheet, z, x, y, 3, 5, WHEEL);
  fillRect(sheet, z, x + 1, y + 1, 1, 3, HUB);
}

function lights(sheet, z, yNose, yTail) {
  fillRect(sheet, z, 4, yNose, 2, 2, HEAD_COLOR, HEAD);
  fillRect(sheet, z, sheet.sliceW - 6, yNose, 2, 2, HEAD_COLOR, HEAD);
  fillRect(sheet, z, 4, yTail, 2, 2, TAIL_COLOR, TAIL);
  fillRect(sheet, z, sheet.sliceW - 6, yTail, 2, 2, TAIL_COLOR, TAIL);
}

// Sports car, 17 x 33, 12 slices. Nose at the bottom of the sheet.
function makeSports({ body, accent, camo }) {
  const sheet = createSheet(17, 33, 12);
  const bumper = darker(body, 0.72);
  for (let z = 0; z < 12; z++) {
    if (z <= 2) {
      wheel(sheet, z, 0, 6);
      wheel(sheet, z, 14, 6);
      wheel(sheet, z, 0, 21);
      wheel(sheet, z, 14, 21);
      fillRect(sheet, z, 3, 7, 11, 18, UNDER);
    }
    if (z >= 2 && z <= 8) {
      fillRect(sheet, z, 3, 3, 11, 25, body);
      fillRect(sheet, z, 4, 28, 9, 2, body);
      fillRect(sheet, z, 5, 30, 7, 2, body);
      fillRect(sheet, z, 4, 1, 9, 2, bumper);
      fillRect(sheet, z, 2, 18, 1, 8, darker(body, 0.8));
      fillRect(sheet, z, 14, 18, 1, 8, darker(body, 0.8));
    }
    if (z >= 4 && z <= 7 && camo) {
      fillRect(sheet, z, 3, 8, 5, 4, accent);
      fillRect(sheet, z, 9, 14, 5, 5, accent);
      fillRect(sheet, z, 4, 22, 4, 3, accent);
      fillRect(sheet, z, 10, 24, 3, 3, accent);
    }
    if (z >= 4 && z <= 7 && !camo) {
      fillRect(sheet, z, 7, 4, 3, 24, accent);
    }
    if (z >= 5 && z <= 8) lights(sheet, z, 29, 2);
    if (z >= 8 && z <= 10) {
      fillRect(sheet, z, 4, 7, 9, 10, GLASS);
      fillRect(sheet, z, 7, 8, 3, 8, darker(GLASS, 0.7));
    }
    if (z >= 8 && z <= 9) {
      fillRect(sheet, z, 2, 12, 2, 2, body);
      fillRect(sheet, z, 13, 12, 2, 2, body);
    }
    if (z >= 9 && z <= 10) {
      fillRect(sheet, z, 3, 3, 2, 2, accent);
      fillRect(sheet, z, 12, 3, 2, 2, accent);
    }
    if (z >= 10) fillRect(sheet, z, 2, 1, 13, 2, accent);
  }
  return sheet;
}

// Boxier two-box sedan for traffic. 15 x 29, 9 slices.
function makeSedan(body) {
  const sheet = createSheet(15, 29, 9);
  const bumper = darker(body, 0.7);
  const roof = darker(body, 0.85);
  for (let z = 0; z < 9; z++) {
    if (z <= 2) {
      wheel(sheet, z, 0, 5);
      wheel(sheet, z, 12, 5);
      wheel(sheet, z, 0, 19);
      wheel(sheet, z, 12, 19);
      fillRect(sheet, z, 3, 6, 9, 16, UNDER);
    }
    if (z >= 2 && z <= 6) {
      fillRect(sheet, z, 2, 2, 11, 24, body);
      fillRect(sheet, z, 3, 26, 9, 2, body);
      fillRect(sheet, z, 3, 1, 9, 2, bumper);
    }
    if (z >= 4 && z <= 6) {
      fillRect(sheet, z, 3, 25, 2, 2, HEAD_COLOR, HEAD);
      fillRect(sheet, z, 10, 25, 2, 2, HEAD_COLOR, HEAD);
      fillRect(sheet, z, 3, 2, 2, 2, TAIL_COLOR, TAIL);
      fillRect(sheet, z, 10, 2, 2, 2, TAIL_COLOR, TAIL);
    }
    if (z >= 5 && z <= 8) {
      fillRect(sheet, z, 3, 6, 9, 12, GLASS);
      fillRect(sheet, z, 6, 7, 3, 10, darker(GLASS, 0.75));
    }
    if (z === 8) fillRect(sheet, z, 4, 7, 7, 9, roof);
  }
  return sheet;
}

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
  const rivals = [
    ['#2f6fbe', '#e8eef2'],
    ['#1b1b1b', '#e2c04a'],
    ['#2f8f4e', '#102016'],
    ['#f2f2f2', '#d23b32'],
    ['#6a3d8a', '#7ee0d0'],
  ].map(([body, accent]) => makeSports({ body: css(body), accent: css(accent), camo: false }));
  const traffic = [0xd9d3c2, 0x8e97a3, 0xc6b15c, 0x5e6772, 0xb7c2ae, 0x3c4450].map((body) => makeSedan(css(body)));
  return {
    player: makeSports({ body: css('#d7c09a'), accent: css('#d6453c'), camo: true }),
    rivals,
    traffic,
    lamp: makeLamp(),
    flame: makeFlame(),
    shards: [makeShard(css('#d6453c')), makeShard(css('#2a2418'))],
  };
}

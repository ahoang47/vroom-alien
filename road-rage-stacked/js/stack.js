// Sprite stacking. A sheet is one row of equal slices, ground slice on the left.
// Slice 0 is drawn first; each next slice is lifted by round(z * spacing) screen
// pixels. Every slice is rotated by the same angle, then squashed vertically.
// The sheet's art faces down (+y). Positions are whole pixels.

const LITTLE = (() => {
  const u8 = new Uint8Array(4);
  const u32 = new Uint32Array(u8.buffer);
  u32[0] = 0x01020304;
  return u8[0] === 4;
})();

export const OUTLINE = [20, 16, 12, 255];

export function packRGBA(r, g, b, a = 255) {
  const R = r & 255;
  const G = g & 255;
  const B = b & 255;
  const A = a & 255;
  if (LITTLE) return ((A << 24) | (B << 16) | (G << 8) | R) >>> 0;
  return ((R << 24) | (G << 16) | (B << 8) | A) >>> 0;
}

export function createBuffer(width, height) {
  const buffer = new ArrayBuffer(width * height * 4);
  return {
    width,
    height,
    data: new Uint8ClampedArray(buffer),
    u32: new Uint32Array(buffer),
  };
}

export function createSheet(sliceW, sliceH, count) {
  const width = sliceW * count;
  const height = sliceH;
  const buffer = new ArrayBuffer(width * height * 4);
  return {
    width,
    height,
    count,
    sliceW,
    sliceH,
    data: new Uint8ClampedArray(buffer),
    u32: new Uint32Array(buffer),
    mask: new Uint8Array(sliceW * sliceH * count),
  };
}

export function plot(sheet, z, x, y, color, maskValue = 0) {
  if (x < 0 || y < 0 || x >= sheet.sliceW || y >= sheet.sliceH) return;
  if (z < 0 || z >= sheet.count) return;
  const si = (y * sheet.width + z * sheet.sliceW + x) * 4;
  sheet.data[si] = color[0];
  sheet.data[si + 1] = color[1];
  sheet.data[si + 2] = color[2];
  sheet.data[si + 3] = color.length > 3 ? color[3] : 255;
  sheet.mask[(z * sheet.sliceH + y) * sheet.sliceW + x] = maskValue;
}

export function fillRect(sheet, z, x, y, w, h, color, maskValue = 0) {
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) plot(sheet, z, x + xx, y + yy, color, maskValue);
  }
}

// Screen heading: +x right, +y down. The sheet faces +y when turn is 0.
export function turnFromHeading(hx, hy) {
  return Math.atan2(hy, hx) - Math.PI / 2;
}

// World yaw: forward is (sin yaw, cos yaw). turnFromYaw treats world +Z as screen +Y.
// Always pass the heading, never the velocity, so reversing does not spin the nose around.
export function turnFromYaw(yaw) {
  return turnFromHeading(Math.sin(yaw), Math.cos(yaw));
}

// Overhead camera: world +Z is screen up, and a slice sheet faces screen down at turn 0.
export function screenTurn(yaw) {
  return turnFromYaw(yaw + Math.PI);
}

const TAU = Math.PI * 2;
const TURN_BUCKETS = 256;

// Nearest-neighbor rotation already steps. Quantizing keeps a cache key stable.
export function quantizeTurn(turn) {
  let t = turn % TAU;
  if (t < 0) t += TAU;
  const bucket = Math.round((t / TAU) * TURN_BUCKETS) % TURN_BUCKETS;
  return { bucket, turn: (bucket / TURN_BUCKETS) * TAU };
}

function sampleColor(sheet, z, srcX, srcY, opts) {
  const si = (srcY * sheet.width + z * sheet.sliceW + srcX) * 4;
  const a = sheet.data[si + 3];
  if (a === 0) return 0;
  let r = sheet.data[si];
  let g = sheet.data[si + 1];
  let b = sheet.data[si + 2];
  if (opts) {
    const m = sheet.mask[(z * sheet.sliceH + srcY) * sheet.sliceW + srcX];
    if (m === 1 && opts.brake) {
      r = 255; g = 54; b = 40;
    } else if (m === 2 && opts.boost) {
      r = 255; g = 248; b = 214;
    } else if (m === 0 && opts.shade != null && opts.shade !== 1) {
      r = (r * opts.shade) | 0;
      g = (g * opts.shade) | 0;
      b = (b * opts.shade) | 0;
    }
    if (opts.scrap && m === 0 && ((srcX * 17 + srcY * 13 + z * 5) & 15) < opts.scrap) {
      r = 36; g = 30; b = 24;
    }
  }
  return packRGBA(r, g, b, a);
}

// Draw one stack. `pos` is where the object's center touches the ground.
export function drawStack(dest, sheet, pos, turn = 0, squash = 0.75, spacing = 1, opts = null) {
  const sliceW = sheet.sliceW;
  const sliceH = sheet.sliceH;
  const count = sheet.count;
  const ox = -Math.floor(sliceW / 2);
  const oy = -Math.floor(sliceH / 2);
  const px = Math.round(pos.x);
  const py = Math.round(pos.y);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const invSquash = squash === 0 ? 0 : 1 / squash;
  const axis = sin === 0 && cos === 1;
  const plain = !opts || (
    (!opts.brake && !opts.boost && !opts.scrap) &&
    (opts.shade == null || opts.shade === 1)
  );
  const dw = dest.width;
  const dh = dest.height;
  const du = dest.u32;

  for (let z = 0; z < count; z++) {
    const lift = Math.round(z * spacing);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const corners = [
      [ox, oy],
      [ox + sliceW, oy],
      [ox + sliceW, oy + sliceH],
      [ox, oy + sliceH],
    ];
    for (let i = 0; i < 4; i++) {
      const lx = corners[i][0];
      const ly = corners[i][1];
      const rx = axis ? lx : lx * cos - ly * sin;
      const ry = (axis ? ly : lx * sin + ly * cos) * squash - lift;
      const x = rx + px;
      const y = ry + py;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    let x0 = Math.floor(minX) - 1;
    let y0 = Math.floor(minY) - 1;
    let x1 = Math.ceil(maxX) + 1;
    let y1 = Math.ceil(maxY) + 1;
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 >= dw) x1 = dw - 1;
    if (y1 >= dh) y1 = dh - 1;

    const srcBase = z * sliceW;
    for (let dy = y0; dy <= y1; dy++) {
      const sy0 = (dy + 0.5 - py + lift) * invSquash;
      const row = dy * dw;
      for (let dx = x0; dx <= x1; dx++) {
        const sx = dx + 0.5 - px;
        let lx;
        let ly;
        if (axis) {
          lx = sx;
          ly = sy0;
        } else {
          const sy = sy0;
          lx = sx * cos + sy * sin;
          ly = -sx * sin + sy * cos;
        }
        const srcX = Math.floor(lx - ox);
        const srcY = Math.floor(ly - oy);
        if (srcX < 0 || srcY < 0 || srcX >= sliceW || srcY >= sliceH) continue;
        const si = (srcY * sheet.width + srcBase + srcX) * 4;
        if (sheet.data[si + 3] === 0) continue;
        const packed = plain ? sheet.u32[si >> 2] : sampleColor(sheet, z, srcX, srcY, opts);
        if (packed !== 0) du[row + dx] = packed;
      }
    }
  }
}

export function outlineBuffer(dest, color = OUTLINE) {
  const w = dest.width;
  const h = dest.height;
  const data = dest.data;
  const n = w * h;
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3];
  const packed = packRGBA(color[0], color[1], color[2], 255);
  const u32 = dest.u32;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      if (alpha[i]) continue;
      const left = x > 0 && alpha[i - 1];
      const right = x + 1 < w && alpha[i + 1];
      const up = y > 0 && alpha[i - w];
      const down = y + 1 < h && alpha[i + w];
      if (left || right || up || down) u32[i] = packed;
    }
  }
}

// Raster a stack once. Static scenery keeps the returned sprite and never
// restacks. `ax`/`ay` is the ground point inside the sprite.
export function rasterStack(sheet, turn = 0, squash = 0.75, spacing = 1, opts = null) {
  const sliceW = sheet.sliceW;
  const sliceH = sheet.sliceH;
  const count = sheet.count;
  const ox = -Math.floor(sliceW / 2);
  const oy = -Math.floor(sliceH / 2);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let z = 0; z < count; z++) {
    const lift = Math.round(z * spacing);
    const corners = [
      [ox, oy],
      [ox + sliceW, oy],
      [ox + sliceW, oy + sliceH],
      [ox, oy + sliceH],
    ];
    for (let i = 0; i < 4; i++) {
      const lx = corners[i][0];
      const ly = corners[i][1];
      const rx = lx * cos - ly * sin;
      const ry = (lx * sin + ly * cos) * squash - lift;
      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    }
  }
  const pad = 3;
  const x0 = Math.floor(minX) - pad;
  const y0 = Math.floor(minY) - pad;
  const x1 = Math.ceil(maxX) + pad;
  const y1 = Math.ceil(maxY) + pad;
  const width = Math.max(1, x1 - x0 + 1);
  const height = Math.max(1, y1 - y0 + 1);
  const dest = createBuffer(width, height);
  drawStack(dest, sheet, { x: -x0, y: -y0 }, turn, squash, spacing, opts);
  if (!opts || opts.outline !== false) outlineBuffer(dest, (opts && opts.outline) || OUTLINE);
  return { width, height, data: dest.data, u32: dest.u32, ax: -x0, ay: -y0 };
}

export function blit(dest, sprite, gx, gy) {
  const sw = sprite.width;
  const sh = sprite.height;
  const dw = dest.width;
  const dh = dest.height;
  let srcX0 = 0;
  let srcY0 = 0;
  let dstX = gx - sprite.ax;
  let dstY = gy - sprite.ay;
  let copyW = sw;
  let copyH = sh;
  if (dstX < 0) {
    srcX0 = -dstX;
    copyW += dstX;
    dstX = 0;
  }
  if (dstY < 0) {
    srcY0 = -dstY;
    copyH += dstY;
    dstY = 0;
  }
  if (dstX + copyW > dw) copyW = dw - dstX;
  if (dstY + copyH > dh) copyH = dh - dstY;
  if (copyW <= 0 || copyH <= 0) return;
  const su = sprite.u32;
  const du = dest.u32;
  const sd = sprite.data;
  for (let y = 0; y < copyH; y++) {
    const srow = (srcY0 + y) * sw + srcX0;
    const drow = (dstY + y) * dw + dstX;
    const sByte = srow * 4;
    for (let x = 0; x < copyW; x++) {
      if (sd[sByte + x * 4 + 3] === 0) continue;
      du[drow + x] = su[srow + x];
    }
  }
}

function opaqueBounds(dest) {
  const { width, height, data } = dest;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { w: 0, h: 0, minX: 0, minY: 0, maxX: -1, maxY: -1 };
  return { w: maxX - minX + 1, h: maxY - minY + 1, minX, minY, maxX, maxY };
}

function handPaste(dest, sheet, pos) {
  const { sliceW, sliceH, count } = sheet;
  const ox = -Math.floor(sliceW / 2);
  const oy = -Math.floor(sliceH / 2);
  const px = Math.round(pos.x);
  const py = Math.round(pos.y);
  for (let z = 0; z < count; z++) {
    for (let y = 0; y < sliceH; y++) {
      for (let x = 0; x < sliceW; x++) {
        const si = (y * sheet.width + z * sliceW + x) * 4;
        if (sheet.data[si + 3] === 0) continue;
        const dx = px + ox + x;
        const dy = py + oy + y - z;
        if (dx < 0 || dy < 0 || dx >= dest.width || dy >= dest.height) continue;
        dest.u32[dy * dest.width + dx] = sheet.u32[si >> 2];
      }
    }
  }
}

function firstDiff(a, b) {
  const n = Math.min(a.data.length, b.data.length);
  for (let i = 0; i < n; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) {
      const p = i >> 2;
      return `pixel ${p % a.width},${(p / a.width) | 0}`;
    }
  }
  if (a.width !== b.width || a.height !== b.height) return 'size';
  return '';
}

function fillSolid(sheet, z, color) {
  fillRect(sheet, z, 0, 0, sheet.sliceW, sheet.sliceH, color);
}

function centroid(dest, r, g, b) {
  let x = 0;
  let y = 0;
  let n = 0;
  const { width, height, data } = dest;
  for (let yy = 0; yy < height; yy++) {
    for (let xx = 0; xx < width; xx++) {
      const i = (yy * width + xx) * 4;
      if (data[i] === r && data[i + 1] === g && data[i + 2] === b && data[i + 3] !== 0) {
        x += xx;
        y += yy;
        n++;
      }
    }
  }
  if (!n) return null;
  return { x: x / n, y: y / n, n };
}

export function selfTest() {
  const checks = [];
  function check(name, pass, detail) {
    checks.push({ name, pass: !!pass, detail: detail || '' });
  }

  // Pack round-trip.
  {
    const buf = createBuffer(1, 1);
    buf.u32[0] = packRGBA(10, 20, 30, 255);
    check(
      'pixel packing',
      buf.data[0] === 10 && buf.data[1] === 20 && buf.data[2] === 30 && buf.data[3] === 255,
      `got ${buf.data[0]},${buf.data[1]},${buf.data[2]},${buf.data[3]}`,
    );
  }

  // Hand paste: squash 1, turn 0, spacing 1 matches slicing the sheet by hand.
  {
    const sheet = createSheet(9, 13, 5);
    let seed = 0x1234567;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let z = 0; z < 5; z++) {
      for (let y = 0; y < 13; y++) {
        for (let x = 0; x < 9; x++) {
          if (rnd() < 0.35) continue;
          plot(sheet, z, x, y, [(rnd() * 200 + 20) | 0, (rnd() * 200 + 20) | 0, (rnd() * 180) | 0, 255]);
        }
      }
    }
    const pos = { x: 30.2, y: 28.7 };
    const a = createBuffer(70, 70);
    const b = createBuffer(70, 70);
    drawStack(a, sheet, pos, 0, 1, 1);
    handPaste(b, sheet, pos);
    const diff = firstDiff(a, b);
    check('squash 1 turn 0 matches hand-pasted slices', diff === '', diff);
  }

  // Whole-pixel positions: fractional pos rounds before drawing.
  {
    const sheet = createSheet(7, 9, 3);
    for (let z = 0; z < 3; z++) {
      for (let y = 0; y < 9; y++) {
        for (let x = 0; x < 7; x++) {
          if ((x + y + z) % 3 === 0) continue;
          plot(sheet, z, x, y, [20 + z * 40, 80 + x * 10, 40 + y * 8, 255]);
        }
      }
    }
    const a = createBuffer(50, 50);
    const b = createBuffer(50, 50);
    drawStack(a, sheet, { x: 10.4, y: 20.6 }, 0, 1, 1);
    drawStack(b, sheet, { x: 10, y: 21 }, 0, 1, 1);
    check('fractional positions round to whole pixels', firstDiff(a, b) === '', firstDiff(a, b));
  }

  // Size, squash, spacing, and a quarter turn. Fully opaque so the bounds are the sprite.
  {
    const sliceW = 8;
    const sliceH = 14;
    const count = 6;
    const sheet = createSheet(sliceW, sliceH, count);
    for (let z = 0; z < count; z++) fillSolid(sheet, z, [220, 180, 60, 255]);
    const tall = createBuffer(80, 80);
    const flat = createBuffer(80, 80);
    const squashed = createBuffer(80, 80);
    const wide = createBuffer(80, 80);
    const spaced = createBuffer(80, 80);
    const pos = { x: 40, y: 40 };
    drawStack(tall, sheet, pos, 0, 1, 1);
    drawStack(squashed, sheet, pos, 0, 0.75, 1);
    drawStack(wide, sheet, pos, Math.PI / 2, 1, 1);
    drawStack(spaced, sheet, pos, 0, 1, 2);
    const bt = opaqueBounds(tall);
    const bs = opaqueBounds(squashed);
    const bw = opaqueBounds(wide);
    const bp = opaqueBounds(spaced);
    check(
      'squash 1 turn 0 is slice-wide and slice-tall plus lifts',
      bt.w === sliceW && bt.h === sliceH + count - 1,
      `got ${bt.w}x${bt.h}, expected ${sliceW}x${sliceH + count - 1}`,
    );
    check('squash 0.75 is shorter than squash 1', bs.h < bt.h, `${bs.h} vs ${bt.h}`);
    check(
      'turned 90 degrees, width equals the slice height',
      Math.abs(bw.w - sliceH) <= 1,
      `width ${bw.w}, slice height ${sliceH}`,
    );
    check('spacing 2 is taller than spacing 1', bp.h > bt.h, `${bp.h} vs ${bt.h}`);

    // Spacing 0, squash 1: every slice in the same place, top slice over the rest.
    const top = createSheet(sliceW, sliceH, 3);
    fillSolid(top, 0, [200, 40, 40, 255]);
    fillSolid(top, 1, [40, 180, 60, 255]);
    fillSolid(top, 2, [40, 80, 200, 255]);
    drawStack(flat, top, pos, 0, 1, 0);
    const bf = opaqueBounds(flat);
    let mismatch = 0;
    let seen = 0;
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 80; x++) {
        const i = (y * 80 + x) * 4;
        if (flat.data[i + 3] === 0) continue;
        seen++;
        if (flat.data[i] !== 40 || flat.data[i + 1] !== 80 || flat.data[i + 2] !== 200) mismatch++;
      }
    }
    check(
      'spacing 0 squash 1 draws flat, top slice over the rest',
      bf.h === sliceH && bf.w === sliceW && mismatch === 0 && seen === sliceW * sliceH,
      `bounds ${bf.w}x${bf.h}, bad ${mismatch}, covered ${seen}`,
    );

    // Where the top slice is transparent, the slice under it shows.
    const hole = createSheet(6, 5, 3);
    fillSolid(hole, 0, [200, 40, 40, 255]);
    fillSolid(hole, 1, [40, 180, 60, 255]);
    fillRect(hole, 2, 0, 0, 3, 5, [40, 80, 200, 255]);
    const holeBuf = createBuffer(30, 30);
    drawStack(holeBuf, hole, { x: 15, y: 15 }, 0, 1, 0);
    const ox = 15 - Math.floor(6 / 2);
    const oy = 15 - Math.floor(5 / 2);
    let holeOk = true;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 6; x++) {
        const i = ((oy + y) * 30 + (ox + x)) * 4;
        const blue = x < 3;
        const er = blue ? 40 : 40;
        const eg = blue ? 80 : 180;
        const eb = blue ? 200 : 60;
        if (holeBuf.data[i] !== er || holeBuf.data[i + 1] !== eg || holeBuf.data[i + 2] !== eb) holeOk = false;
      }
    }
    check('spacing 0 keeps lower slices where the top is empty', holeOk, '');
  }

  // Driving in a circle: the nose points along the heading, including when speed would be negative.
  {
    const sheet = createSheet(11, 21, 4);
    const body = [240, 210, 70, 255];
    const nose = [255, 32, 160, 255];
    const tail = [32, 220, 120, 255];
    for (let z = 0; z < 4; z++) fillRect(sheet, z, 3, 2, 5, 17, body);
    const zTop = 3;
    for (let y = 1; y <= 3; y++) fillRect(sheet, zTop, 4, y, 3, 1, tail);
    for (let y = 17; y <= 19; y++) fillRect(sheet, zTop, 4, y, 3, 1, nose);
    let worst = 1;
    let worstAt = 0;
    let missing = false;
    for (let step = 0; step < 24; step++) {
      const theta = (step / 24) * Math.PI * 2;
      const hx = Math.cos(theta);
      const hy = Math.sin(theta);
      // Motion around the circle follows the heading. Reverse is checked separately.
      const turn = turnFromHeading(hx, hy);
      const buf = createBuffer(90, 90);
      drawStack(buf, sheet, { x: 45, y: 45 }, turn, 1, 1);
      const nc = centroid(buf, 255, 32, 160);
      const tc = centroid(buf, 32, 220, 120);
      if (!nc || !tc) {
        missing = true;
        break;
      }
      const dx = nc.x - tc.x;
      const dy = nc.y - tc.y;
      const len = Math.hypot(dx, dy) || 1;
      const dot = (dx / len) * hx + (dy / len) * hy;
      if (dot < worst) {
        worst = dot;
        worstAt = step;
      }
    }
    check(
      'front faces the direction of motion around a circle',
      !missing && worst > 0.9,
      missing ? 'marker pixels missing' : `worst dot ${worst.toFixed(3)} at step ${worstAt}`,
    );

    const yaw = 0.8;
    const headingTurn = turnFromYaw(yaw);
    const flipped = turnFromHeading(-Math.sin(yaw), -Math.cos(yaw));
    check(
      'reversing keeps the heading instead of flipping the nose',
      Math.abs(Math.atan2(Math.sin(headingTurn - flipped), Math.cos(headingTurn - flipped))) > 2,
      `heading ${headingTurn.toFixed(3)} flipped ${flipped.toFixed(3)}`,
    );
  }

  // Outline the finished stack once: no per-slice stripe through the body.
  {
    const sheet = createSheet(10, 8, 5);
    for (let z = 0; z < 5; z++) fillSolid(sheet, z, [220, 190, 90, 255]);
    const sprite = rasterStack(sheet, 0, 1, 1);
    let outlineCount = 0;
    let interiorBad = 0;
    let interior = 0;
    const w = sprite.width;
    const h = sprite.height;
    const data = sprite.data;
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const o = i * 4;
        const isOutline = data[o] === OUTLINE[0] && data[o + 1] === OUTLINE[1] && data[o + 2] === OUTLINE[2] && data[o + 3] === 255;
        if (isOutline) outlineCount++;
        if (!alpha[i]) continue;
        const enclosed = x > 0 && x + 1 < w && y > 0 && y + 1 < h &&
          alpha[i - 1] && alpha[i + 1] && alpha[i - w] && alpha[i + w];
        if (!enclosed) continue;
        interior++;
        if (isOutline) interiorBad++;
      }
    }
    // A column through the middle should stay body color. An outline pixel with
    // body on both sides would be a per-slice stripe. The outer border does not count.
    let stripes = 0;
    const mid = sprite.ax;
    if (mid > 0 && mid < w - 1) {
      let state = 'before';
      let gapHadOutline = false;
      for (let y = 0; y < h; y++) {
        const o = (y * w + mid) * 4;
        const body = data[o] === 220 && data[o + 1] === 190 && data[o + 2] === 90;
        if (body) {
          if (state === 'gap' && gapHadOutline) stripes++;
          state = 'body';
          gapHadOutline = false;
        } else if (state === 'body' || state === 'gap') {
          state = 'gap';
          if (data[o + 3] !== 0 && data[o] === OUTLINE[0]) gapHadOutline = true;
        }
      }
    }
    check(
      'outline wraps the finished stack once',
      outlineCount > 0 && interior > 0 && interiorBad === 0 && stripes === 0,
      `outline ${outlineCount}, interior ${interior}, speckle ${interiorBad}, stripes ${stripes}`,
    );
  }

  const failed = checks.filter((c) => !c.pass);
  return { ok: failed.length === 0, checks };
}

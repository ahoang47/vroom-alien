import { ROAD_HALF } from './config.js';

// Closed elevated freeway. Positions are pre-sampled so AI, collision, and
// the minimap all share one centerline.

const SAMPLES = 220;

function centerAt(t) {
  const a = t * Math.PI * 2;
  const x = Math.cos(a) * 162 + Math.cos(a * 2 + 0.55) * 30 + Math.sin(a * 3) * 8;
  const z = Math.sin(a) * 108 + Math.sin(a * 2 + 0.3) * 16;
  const y = 11 + Math.sin(a * 2) * 4.6 + Math.cos(a * 3 + 0.5) * 1.4;
  return { x, y, z };
}

export function createTrack() {
  const raw = [];
  for (let i = 0; i < SAMPLES; i++) raw.push(centerAt(i / SAMPLES));

  const pts = [];
  let along = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const p = raw[i];
    const n = raw[(i + 1) % SAMPLES];
    if (i > 0) along += Math.hypot(p.x - raw[i - 1].x, p.y - raw[i - 1].y, p.z - raw[i - 1].z);
    let tx = n.x - p.x;
    let tz = n.z - p.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    // Right-hand normal in the XZ plane. Positive lateral is to the right of travel.
    const rx = tz;
    const rz = -tx;
    const horiz = Math.hypot(n.x - p.x, n.z - p.z) || 1;
    const slope = Math.atan2(n.y - p.y, horiz);
    pts.push({ x: p.x, y: p.y, z: p.z, tx, tz, rx, rz, slope, along });
  }

  let length = along;
  const last = raw[SAMPLES - 1];
  const first = raw[0];
  length += Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z);

  return { pts, length, half: ROAD_HALF };
}

export function wrapAlong(track, distance) {
  const L = track.length;
  return ((distance % L) + L) % L;
}

// Signed distance along the circuit from `from` to `to`.
// Positive means `to` is ahead of `from` (the short way).
export function alongDelta(track, from, to) {
  const L = track.length;
  let d = to - from;
  d = ((d % L) + L) % L;
  if (d > L * 0.5) d -= L;
  return d;
}

function lerpSample(a, b, u, along, endAlong) {
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
    tx: a.tx,
    tz: a.tz,
    rx: a.rx,
    rz: a.rz,
    slope: a.slope,
    along,
    lateral: 0,
    dist: 0,
    segEnd: endAlong,
  };
}

export function sampleAt(track, distance) {
  const L = track.length;
  const d = wrapAlong(track, distance);
  const pts = track.pts;
  const n = pts.length;
  const last = pts[n - 1];
  if (d >= last.along) {
    const span = L - last.along || 1;
    const u = (d - last.along) / span;
    return lerpSample(last, pts[0], u, d, L);
  }
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].along <= d) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const span = b.along - a.along || 1;
  const u = (d - a.along) / span;
  return lerpSample(a, b, u, d, b.along);
}

// Closest point on the centerline to a world XZ position.
export function queryTrack(track, x, z) {
  const pts = track.pts;
  const n = pts.length;
  const L = track.length;
  let best = Infinity;
  let bestI = 0;
  let bestU = 0;

  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1;
    let u = ((x - a.x) * abx + (z - a.z) * abz) / len2;
    if (u < 0) u = 0;
    else if (u > 1) u = 1;
    const px = a.x + abx * u;
    const pz = a.z + abz * u;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < best) {
      best = d2;
      bestI = i;
      bestU = u;
    }
  }

  const a = pts[bestI];
  const b = pts[(bestI + 1) % n];
  const px = a.x + (b.x - a.x) * bestU;
  const py = a.y + (b.y - a.y) * bestU;
  const pz = a.z + (b.z - a.z) * bestU;
  const segEnd = bestI === n - 1 ? L : b.along;
  const along = a.along + (segEnd - a.along) * bestU;
  const lateral = (x - px) * a.rx + (z - pz) * a.rz;
  return {
    x: px,
    y: py,
    z: pz,
    tx: a.tx,
    tz: a.tz,
    rx: a.rx,
    rz: a.rz,
    slope: a.slope,
    along,
    lateral,
    dist: Math.sqrt(best),
  };
}

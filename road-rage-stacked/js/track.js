import { ROAD_HALF } from './config.js';

// Endless freeway. Distance runs along world +Z, which the camera draws
// straight up the screen. Curves and lane-changes shift X. Merges widen
// the asphalt. Elevation stays flat so the view stays overhead.

function fadeIn(s) {
  if (s < 200) return 0;
  if (s > 280) return 1;
  const t = (s - 200) / 80;
  return t * t * (3 - 2 * t);
}

function curveX(s) {
  const env = fadeIn(s);
  const wave = Math.sin(s * 0.011) * 26 + Math.sin(s * 0.0042 + 0.7) * 38 + Math.sin(s * 0.029) * 5;
  return env * (wave + laneShift(s));
}

// A lateral slide of the centerline: the lanes move under the car, then back.
function laneShift(s) {
  const period = 620;
  const u = ((s % period) + period) % period;
  const ramp = (a, b) => {
    if (u <= a) return 0;
    if (u >= b) return 1;
    const t = (u - a) / (b - a);
    return t * t * (3 - 2 * t);
  };
  return (ramp(90, 150) - ramp(230, 300)) * 5.2;
}

export function roadHalf(distance) {
  const period = 460;
  const u = ((distance % period) + period) % period;
  let widen = 0;
  if (u > 40 && u < 170) {
    const t = u < 75 ? (u - 40) / 35 : u > 135 ? (170 - u) / 35 : 1;
    const k = Math.max(0, Math.min(1, t));
    widen = k * k * (3 - 2 * k) * 4.4;
  }
  return ROAD_HALF + widen;
}

function deckY(s) {
  return 11 + Math.sin(s * 0.007) * 2.2;
}

function pose(s) {
  const ds = 0.8;
  const x0 = curveX(s - ds);
  const x1 = curveX(s + ds);
  const y0 = deckY(s - ds);
  const y1 = deckY(s + ds);
  let tx = x1 - x0;
  let tz = ds * 2;
  const horiz = Math.hypot(tx, tz) || 1;
  tx /= horiz;
  tz /= horiz;
  return {
    x: curveX(s),
    y: deckY(s),
    z: s,
    tx,
    tz,
    rx: tz,
    rz: -tx,
    slope: Math.atan2(y1 - y0, horiz),
    along: s,
    half: roadHalf(s),
    lateral: 0,
    dist: 0,
  };
}

export function createTrack() {
  return { endless: true, length: 100000, half: ROAD_HALF };
}

export function wrapAlong(_track, distance) {
  return distance;
}

// Positive when `to` is ahead of `from`.
export function alongDelta(_track, from, to) {
  return to - from;
}

export function sampleAt(_track, distance) {
  return pose(distance);
}

export function queryTrack(track, x, z) {
  let best = Infinity;
  let bestS = z;
  for (let i = -10; i <= 10; i++) {
    const t = z + i * 4;
    const p = pose(t);
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < best) {
      best = d;
      bestS = t;
    }
  }
  for (let i = -6; i <= 6; i++) {
    const t = bestS + i * 0.75;
    const p = pose(t);
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < best) {
      best = d;
      bestS = t;
    }
  }
  const p = pose(bestS);
  const lateral = (x - p.x) * p.rx + (z - p.z) * p.rz;
  return {
    ...p,
    lateral,
    dist: Math.sqrt(best),
  };
}

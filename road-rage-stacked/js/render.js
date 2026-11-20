import { VIEW_W, VIEW_H, PX, SQUASH, SPACING, HEIGHT_PX, LEAD } from './display.js';
import { blit, createBuffer, createSheet, fillRect, packRGBA, quantizeTurn, rasterStack, turnFromYaw } from './stack.js';
import { createWorld } from './world.js';
import { clamp } from './util.js';

const HAZE = packRGBA(213, 219, 140, 255);
const ASPHALT = [58, 64, 50];
const SHOULDER = [230, 215, 162];
const LANE = [232, 226, 196];
const CENTER = [214, 177, 90];
const SKIRT = [84, 90, 68];
const SOLE = [64, 70, 50];
const SPEED = packRGBA(236, 230, 196, 255);

function makePuffSheet() {
  const sheet = createSheet(5, 5, 2);
  const body = [176, 174, 148, 255];
  const top = [214, 210, 184, 255];
  fillRect(sheet, 0, 1, 1, 3, 3, body);
  fillRect(sheet, 0, 0, 2, 5, 1, body);
  fillRect(sheet, 1, 2, 0, 1, 3, top);
  return sheet;
}

function fillPolygon(dest, pts, color) {
  const packed = packRGBA(color[0], color[1], color[2], 255);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const y = pts[i].y;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const y0 = Math.max(0, Math.ceil(minY));
  const y1 = Math.min(dest.height - 1, Math.floor(maxY));
  const w = dest.width;
  const u32 = dest.u32;
  const n = pts.length;
  for (let y = y0; y <= y1; y++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const ay = a.y;
      const by = b.y;
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        const t = (y - ay) / (by - ay);
        const x = a.x + (b.x - a.x) * t;
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
    if (hi < lo) continue;
    let x0 = Math.ceil(lo);
    let x1 = Math.floor(hi);
    if (x0 < 0) x0 = 0;
    if (x1 >= w) x1 = w - 1;
    const row = y * w;
    for (let x = x0; x <= x1; x++) u32[row + x] = packed;
  }
}

function offscreen(pts, m) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return maxX < -m || maxY < -m || minX > VIEW_W + m || minY > VIEW_H + m;
}

function stampLine(dest, x0, y0, x1, y1, packed) {
  let x = x0 | 0;
  let y = y0 | 0;
  const xEnd = x1 | 0;
  const yEnd = y1 | 0;
  const dx = Math.abs(xEnd - x);
  const dy = Math.abs(yEnd - y);
  const sx = x < xEnd ? 1 : -1;
  const sy = y < yEnd ? 1 : -1;
  let err = dx - dy;
  const w = dest.width;
  const h = dest.height;
  const u32 = dest.u32;
  for (let n = 0; n < 64; n++) {
    if (x >= 0 && y >= 0 && x < w && y < h) u32[y * w + x] = packed;
    if (x === xEnd && y === yEnd) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

export function createView(canvas, track) {
  const world = createWorld(track);
  const { garage } = world;
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas is unavailable in this browser.');
  ctx.imageSmoothingEnabled = false;
  const image = ctx.createImageData(VIEW_W, VIEW_H);
  const frame = createBuffer(VIEW_W, VIEW_H);
  const carCache = new Map();
  const flameCache = new Map();
  const puff = rasterStack(makePuffSheet(), 0, SQUASH, SPACING, { outline: false });
  const shardSprites = garage.shards.map((sheet) => {
    const frames = [];
    for (let i = 0; i < 16; i++) frames.push(rasterStack(sheet, (i / 16) * Math.PI * 2, SQUASH, SPACING));
    return frames;
  });
  const debugCache = new Map();
  const list = [];
  const cam = { x: 0, z: 0, y: 11, shx: 0, shy: 0 };
  let frameMs = 0;

  function project(x, y, z) {
    return {
      x: VIEW_W / 2 + (x - cam.x) * PX + cam.shx,
      y: VIEW_H / 2 + (z - cam.z) * PX * SQUASH - (y - cam.y) * HEIGHT_PX + cam.shy,
    };
  }

  function projectPx(x, y, z) {
    const p = project(x, y, z);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  function depthKey(x, z, y, layer) {
    return (z - cam.z) * PX * SQUASH + y * 0.08 + layer;
  }

  function visible(p, margin) {
    return p.x >= -margin && p.y >= -margin && p.x < VIEW_W + margin && p.y < VIEW_H + margin;
  }

  function roadPoint(p, lateral, y) {
    return project(p.x + p.rx * lateral, y, p.z + p.rz * lateral);
  }

  function ribbon(a, b, offset, halfW, color) {
    fillPolygon(frame, [
      roadPoint(a, offset - halfW, a.y + 0.05),
      roadPoint(a, offset + halfW, a.y + 0.05),
      roadPoint(b, offset + halfW, b.y + 0.05),
      roadPoint(b, offset - halfW, b.y + 0.05),
    ], color);
  }

  function drawRoad(a, b) {
    const ha = a.half;
    const hb = b.half;
    const deck = [
      roadPoint(a, -ha, a.y),
      roadPoint(a, ha, a.y),
      roadPoint(b, hb, b.y),
      roadPoint(b, -hb, b.y),
    ];
    if (offscreen(deck, 12)) return;
    const sole = [
      roadPoint(a, -ha, 0),
      roadPoint(a, ha, 0),
      roadPoint(b, hb, 0),
      roadPoint(b, -hb, 0),
    ];
    fillPolygon(frame, sole, SOLE);
    fillPolygon(frame, [deck[0], deck[3], sole[3], sole[0]], SKIRT);
    fillPolygon(frame, [deck[1], deck[2], sole[2], sole[1]], SKIRT);
    fillPolygon(frame, deck, ASPHALT);
    ribbon(a, b, -(ha - 0.55), 0.16, SHOULDER);
    ribbon(a, b, hb - 0.55, 0.16, SHOULDER);
    ribbon(a, b, 0, 0.14, CENTER);
    if (Math.floor(a.along / 8) % 2 === 0) {
      ribbon(a, b, -5.35, 0.09, LANE);
      ribbon(a, b, 5.35, 0.09, LANE);
    }
  }

  function sheetFor(car) {
    if (car.kind === 'player') return garage.player;
    if (car.kind === 'rival') return garage.rivals[car.paintId];
    return garage.traffic[car.paintId % garage.traffic.length];
  }

  function carSprite(car, turn) {
    const dmg = 1 - clamp(car.health / car.maxHealth, 0, 1);
    const shade = 1 - dmg * 0.7;
    const shadeB = Math.round(shade * 8);
    const scrap = dmg > 0.84 ? 5 : dmg > 0.56 ? 3 : dmg > 0.28 ? 2 : 0;
    const brake = car.braking ? 1 : 0;
    const boost = car.boosting ? 1 : 0;
    const id = car.kind === 'player' ? 0 : car.paintId;
    const key = `${car.kind}:${id}:${turn.bucket}:${shadeB}:${scrap}:${brake}:${boost}`;
    let sprite = carCache.get(key);
    if (!sprite) {
      sprite = rasterStack(sheetFor(car), turn.turn, SQUASH, SPACING, {
        shade: shadeB >= 8 ? 1 : shadeB / 8,
        scrap,
        brake: !!brake,
        boost: !!boost,
      });
      carCache.set(key, sprite);
      if (carCache.size > 500) {
        let dropped = 0;
        for (const k of carCache.keys()) {
          carCache.delete(k);
          if (++dropped >= 120) break;
        }
      }
    }
    return sprite;
  }

  function flameSprite(bucket, turn, phase) {
    const key = `${bucket}:${phase}`;
    let sprite = flameCache.get(key);
    if (!sprite) {
      sprite = rasterStack(garage.flame, turn, SQUASH, SPACING);
      flameCache.set(key, sprite);
    }
    return sprite;
  }

  function drawCar(car, time) {
    const py = car.y + (car.wrecked ? 0 : Math.min(0.6, car.bob * 3));
    const roll = car.bodyRoll || 0;
    const rx = Math.cos(car.yaw);
    const rz = -Math.sin(car.yaw);
    const px = car.x + rx * roll;
    const pz = car.z + rz * roll;
    const p = projectPx(px, py, pz);
    if (!visible(p, 64)) return;
    // Heading, not velocity: a reversing car keeps its nose pointed along the road.
    const turn = quantizeTurn(turnFromYaw(car.yaw));
    if (car.boosting) {
      const fx = Math.sin(car.yaw);
      const fz = Math.cos(car.yaw);
      const back = (car.bodyLength || 4.4) * 0.48;
      const fp = projectPx(px - fx * back, py, pz - fz * back);
      const phase = (time * 16) & 1;
      blit(frame, flameSprite(turn.bucket, turn.turn, phase), fp.x, fp.y);
    }
    blit(frame, carSprite(car, turn), p.x, p.y);
  }

  function drawSkid(mark) {
    const a = project(mark.x, mark.y + 0.05, mark.z);
    const b = project(mark.x2, mark.y2 + 0.05, mark.z2);
    const col = mark.life > 0.65 ? [28, 24, 18] : [46, 42, 32];
    stampLine(frame, a.x, a.y, b.x, b.y, packRGBA(col[0], col[1], col[2], 255));
  }

  function drawSmoke(puffLife, particle) {
    const p = projectPx(particle.x, particle.y, particle.z);
    if (!visible(p, 12)) return;
    blit(frame, puffLife, p.x, p.y);
  }

  function drawShard(shard) {
    const p = projectPx(shard.x, shard.y, shard.z);
    if (!visible(p, 16)) return;
    const frames = shardSprites[shard.paintId] || shardSprites[0];
    const i = Math.abs(Math.round(shard.rot * 16 / (Math.PI * 2))) % frames.length;
    blit(frame, frames[i], p.x, p.y);
  }

  function drawSpeedLines(player, time) {
    const fast = Math.abs(player.speed) > 36;
    if (!fast && !player.boosting) return;
    const hx = Math.sin(player.yaw);
    const hy = Math.cos(player.yaw);
    const px = -hy;
    const py = hx;
    const count = player.boosting ? 18 : 8;
    for (let i = 0; i < count; i++) {
      const along = ((time * 150 + i * 53) % 260) - 80;
      const side = ((i % 9) - 4) * 28;
      const cx = VIEW_W / 2 + hx * along + px * side;
      const cy = VIEW_H / 2 + hy * along + py * side;
      if (Math.hypot(cx - VIEW_W / 2, cy - VIEW_H / 2) < 34) continue;
      stampLine(frame, cx, cy, cx - hx * 9, cy - hy * 9, SPEED);
    }
  }

  function drawDebug(spec) {
    if (!spec) return;
    let sprite = debugCache.get(spec.label);
    if (!sprite) {
      sprite = rasterStack(garage.player, spec.turn, spec.squash, spec.spacing);
      debugCache.set(spec.label, sprite);
    }
    blit(frame, sprite, 78, 168);
  }

  function resize() {
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }

  function warm(x, z) {
    world.ensure(z);
    const { statics } = world.collect();
    for (const obj of statics) {
      if (obj.sprite || !obj.build) continue;
      obj.sprite = obj.build();
    }
    void x;
  }

  function draw(sim, game, dt, debugSpec) {
    const t0 = performance.now();
    const player = sim.player;
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    cam.x = player.x + fx * LEAD;
    cam.z = player.z + fz * LEAD;
    cam.y = player.y;
    cam.shx = 0;
    cam.shy = 0;
    if (game.shake > 0) {
      cam.shx = Math.round((Math.random() - 0.5) * game.shake * 10);
      cam.shy = Math.round((Math.random() - 0.5) * game.shake * 8);
      game.shake = Math.max(0, game.shake - dt * 1.8);
    }

    world.ensure(player.along || player.z);
    const live = world.collect();

    frame.u32.fill(HAZE);
    list.length = 0;

    for (let i = 0; i < live.roads.length; i++) {
      const seg = live.roads[i];
      const mx = (seg.a.x + seg.b.x) * 0.5;
      const mz = (seg.a.z + seg.b.z) * 0.5;
      const my = (seg.a.y + seg.b.y) * 0.5;
      list.push({
        key: depthKey(mx, mz, my, seg.layer),
        draw: () => drawRoad(seg.a, seg.b),
      });
    }

    for (let i = 0; i < live.statics.length; i++) {
      const obj = live.statics[i];
      list.push({
        key: depthKey(obj.x, obj.z, obj.y, obj.layer),
        draw: () => {
          const p = projectPx(obj.x, obj.y, obj.z);
          if (!visible(p, obj.margin)) return;
          if (!obj.sprite) obj.sprite = obj.build();
          blit(frame, obj.sprite, p.x, p.y);
        },
      });
    }

    for (let i = 0; i < sim.skids.length; i++) {
      const mark = sim.skids[i];
      const mx = (mark.x + mark.x2) * 0.5;
      const mz = (mark.z + mark.z2) * 0.5;
      list.push({
        key: depthKey(mx, mz, mark.y, 0.17),
        draw: () => drawSkid(mark),
      });
    }
    for (let i = 0; i < sim.smoke.length; i++) {
      const particle = sim.smoke[i];
      if (particle.life <= 0) continue;
      list.push({
        key: depthKey(particle.x, particle.z, particle.y, 0.34),
        draw: () => drawSmoke(puff, particle),
      });
    }

    const time = sim.getTime();
    for (let i = 0; i < sim.cars.length; i++) {
      const car = sim.cars[i];
      const py = car.y + (car.wrecked ? 0 : car.bob);
      list.push({
        key: depthKey(car.x, car.z, py, 0.4),
        draw: () => drawCar(car, time),
      });
    }
    for (let i = 0; i < sim.shards.length; i++) {
      const shard = sim.shards[i];
      if (shard.life <= 0) continue;
      list.push({
        key: depthKey(shard.x, shard.z, shard.y, 0.45),
        draw: () => drawShard(shard),
      });
    }

    list.sort((a, b) => a.key - b.key);
    for (let i = 0; i < list.length; i++) list[i].draw();

    if (game.mode === 'play' || game.mode === 'dying') drawSpeedLines(player, time);
    drawDebug(debugSpec);

    image.data.set(frame.data);
    ctx.putImageData(image, 0, 0);
    frameMs = performance.now() - t0;
  }

  return {
    resize,
    draw,
    warm,
    get frameMs() { return frameMs; },
  };
}

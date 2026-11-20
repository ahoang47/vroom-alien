import * as THREE from 'three';
import { mulberry32 } from './util.js';

function finish(canvas, repeat) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const rand = mulberry32(0xA5FA17);
  g.fillStyle = '#3c4234';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) {
    const v = 40 + (rand() * 30) | 0;
    g.fillStyle = `rgb(${v},${v + 4},${v - 6})`;
    g.fillRect((rand() * 128) | 0, (rand() * 128) | 0, 1 + (rand() * 2) | 0, 1);
  }
  // Shoulder lines.
  g.fillStyle = '#e6d7a2';
  g.fillRect(2, 0, 3, 128);
  g.fillRect(123, 0, 3, 128);
  // Lane dashes. U across the full road: dividers sit near 0.26, 0.50, 0.74.
  const lanes = [33, 64, 95];
  for (const x of lanes) {
    const center = x === 64;
    g.fillStyle = center ? '#d6b15a' : '#efe8c8';
    const w = center ? 3 : 2;
    for (let y = 0; y < 128; y += 16) {
      g.fillRect(x - 1, y, w, center ? 10 : 8);
    }
  }
  return finish(c, true);
}

export function chevronTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#d24a3c';
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = '#f4f1e4';
  for (let i = -2; i < 8; i++) {
    g.beginPath();
    g.moveTo(i * 16, 0);
    g.lineTo(i * 16 + 10, 0);
    g.lineTo(i * 16 + 22, 32);
    g.lineTo(i * 16 + 12, 32);
    g.fill();
  }
  return finish(c, true);
}

export function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#1c2218';
  g.fillRect(0, 0, 32, 64);
  for (let y = 2; y < 64; y += 8) {
    for (let x = 2; x < 32; x += 8) {
      const lit = ((x * 3 + y * 5) % 13) < 5;
      g.fillStyle = lit ? '#efe6b0' : '#2c3426';
      g.fillRect(x, y, 5, 4);
    }
  }
  return finish(c, true);
}

export function paintTexture(seed, base, accent) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const rand = mulberry32(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = accent;
  const blobs = 14 + ((rand() * 8) | 0);
  for (let i = 0; i < blobs; i++) {
    const w = 4 + ((rand() * 16) | 0);
    const h = 3 + ((rand() * 11) | 0);
    const x = (rand() * (64 - w)) | 0;
    const y = (rand() * (64 - h)) | 0;
    g.fillRect(x, y, w, h);
    if (rand() > 0.45) {
      g.fillRect(x + ((rand() * 4) | 0), y + h, 2 + ((rand() * 8) | 0), 2 + ((rand() * 4) | 0));
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let i = 0; i < 40; i++) g.fillRect((rand() * 64) | 0, (rand() * 64) | 0, 1, 1);
  return finish(c, false);
}

export function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  const img = g.createImageData(32, 32);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const dx = (x - 15.5) / 13;
      const dy = (y - 15.5) / 11;
      const d = dx * dx + dy * dy;
      const dither = ((x * 3 + y * 5) & 3) !== 0 || d < 0.25;
      const a = d < 1 && dither ? 150 : 0;
      const i = (y * 32 + x) * 4;
      img.data[i] = 12;
      img.data[i + 1] = 14;
      img.data[i + 2] = 8;
      img.data[i + 3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = finish(c, false);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = '#1a2014';
  g.fillRect(0, 0, 160, 48);
  g.fillStyle = '#e7e2b4';
  g.fillRect(3, 3, 154, 42);
  g.fillStyle = '#1a2014';
  g.font = 'bold 22px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 80, 26);
  return finish(c, false);
}

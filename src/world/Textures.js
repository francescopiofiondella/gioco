import * as THREE from 'three';

// Texture generate a runtime con canvas 2D (nessun asset esterno). Fuori dal browser ritornano null.
const hasDOM = typeof document !== 'undefined';
let seed = 12345;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function make(size, draw, rx = 1, ry = 1, srgb = true) {
  if (!hasDOM) return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const speckle = (g, s, n, colors, w = 2, h = 2) => {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[(rnd() * colors.length) | 0]; g.fillRect(rnd() * s, rnd() * s, w, h); }
};

export const grass = (rx, ry) => make(256, (g, s) => {
  g.fillStyle = '#26331c'; g.fillRect(0, 0, s, s);
  speckle(g, s, 3500, ['#1c2815', '#324525', '#2b3a1e', '#3a3d20', '#1a2412'], 2, 4);
  speckle(g, s, 150, ['#5a3a1c', '#6a4a22'], 3, 3);
}, rx, ry);

export const asphalt = (rx, ry) => make(256, (g, s) => {
  g.fillStyle = '#2a2a2e'; g.fillRect(0, 0, s, s);
  speckle(g, s, 2500, ['#1e1e22', '#3a3a3f', '#333338', '#26262a']);
  g.fillStyle = '#c9b45a'; g.fillRect(40, s / 2 - 2, 120, 4); // trattino centrale giallo
}, rx, ry);

export const lot = (rx, ry) => make(256, (g, s) => {
  g.fillStyle = '#2e2e32'; g.fillRect(0, 0, s, s);
  speckle(g, s, 2500, ['#202024', '#3d3d42']);
  g.fillStyle = '#9a9a90'; g.fillRect(0, 0, 4, s);
}, rx, ry);

export const concrete = (rx, ry) => make(128, (g, s) => {
  g.fillStyle = '#5a5855'; g.fillRect(0, 0, s, s);
  speckle(g, s, 900, ['#4a4846', '#6a6865', '#555350']);
  g.strokeStyle = '#3a3836'; g.strokeRect(0, 0, s, s);
}, rx, ry);

export const siding = (hex, rx = 1, ry = 1) => make(128, (g, s) => {
  g.fillStyle = hex; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 16) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y, s, 2); g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, y + 2, s, 1); }
  speckle(g, s, 500, ['rgba(0,0,0,.12)', 'rgba(255,255,255,.05)']);
}, rx, ry);

export const wood = (hex, rx = 1, ry = 1) => make(128, (g, s) => {
  g.fillStyle = hex; g.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 21) { g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x, 0, 2, s); }
  for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.1})`; g.fillRect(rnd() * s, rnd() * s, 1, 12 + rnd() * 20); }
}, rx, ry);

export const bark = () => make(64, (g, s) => {
  g.fillStyle = '#2b2118'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.2 + rnd() * 0.3})`; g.fillRect(rnd() * s, 0, 2, s); }
}, 1, 2);

export const web = () => make(128, (g, s) => {
  g.clearRect(0, 0, s, s);
  g.strokeStyle = 'rgba(230,230,230,.75)'; g.lineWidth = 1;
  for (let a = 0; a <= 5; a++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos((a / 5) * Math.PI / 2) * s * 1.2, Math.sin((a / 5) * Math.PI / 2) * s * 1.2); g.stroke(); }
  for (let r = 18; r < s; r += 20) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI / 2); g.stroke(); }
}, 1, 1, true);

export const radialGlow = () => make(64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
}, 1, 1);

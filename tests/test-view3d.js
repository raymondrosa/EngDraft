/* Prueba de humo del renderizador 3D con un canvas falso */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function fakeCtx() {
  const grad = { addColorStop() {} };
  const ctx = {
    canvas: null, globalAlpha: 1, lineWidth: 1, font: '10px sans-serif', fillStyle: '#000',
    strokeStyle: '#000', textAlign: 'left', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter',
    setTransform() {}, resetTransform() {}, save() {}, restore() {}, clearRect() {}, fillRect() {},
    strokeRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, rect() {}, clip() {}, fill() {}, stroke() {},
    fillText() {}, strokeText() {}, translate() {}, rotate() {}, scale() {}, setLineDash() {},
    drawImage() {}, createLinearGradient() { return grad; }, createRadialGradient() { return grad; },
    createPattern() { return null; }, measureText(s) { return { width: String(s).length * 6 }; },
    getImageData() { return { data: new Uint8ClampedArray(4) }; }, putImageData() {},
    set fillStyle(v) {}, get fillStyle() { return '#000'; }
  };
  return ctx;
}
function fakeCanvas(w, h) {
  const ctx = fakeCtx();
  return {
    width: w * 2, height: h * 2, clientWidth: w, clientHeight: h,
    style: {}, parentElement: { clientWidth: w, clientHeight: h },
    getContext() { return ctx; }, addEventListener() {}, removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: w, height: h }; },
    toDataURL() { return 'data:image/png;base64,iVBORw0KGgo='; }
  };
}

global.window = globalThis;
global.window.devicePixelRatio = 1;
global.requestAnimationFrame = fn => setTimeout(fn, 0);
global.cancelAnimationFrame = id => clearTimeout(id);
if (!global.addEventListener) global.addEventListener = function () {};
if (!global.removeEventListener) global.removeEventListener = function () {};
global.ResizeObserver = function (cb) { this.observe = () => {}; this.disconnect = () => {}; };
global.document = {
  addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
  createElement() { return { style: {}, getContext: () => fakeCtx(), addEventListener() {} }; }
};
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const root = path.resolve(__dirname, '..');
for (const f of ['js/geometry.js', 'js/library.js', 'js/templates.js', 'js/store.js', 'js/view3d.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const ED = globalThis.EngDraft;
assert(ED.View3D, 'View3D no registrado');
const project = ED.Templates.demo();
const store = new ED.Store(project);

for (const preset of ['iso', 'top', 'front', 'right']) {
  const canvas = fakeCanvas(1000, 700);
  const v = new ED.View3D(canvas, { store });
  v.setOptions({ roof: true, furniture: true, labels: true, ground: true, levels: 'all' });
  v.setLevelFilter('all');
  v.setPreset(preset);
  v.resize();
  v.fit();
  v.render();
  const shot = v.screenshot();
  assert(typeof shot === 'string' && shot.startsWith('data:image/png'), 'screenshot inválido');
  v.destroy();
}
console.log('View3D: 4 presets renderizados sin excepciones');
console.log('OK — prueba 3D completada');

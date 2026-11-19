/* Pruebas del módulo de láminas y PDF de EngDraft */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

global.window = globalThis;
global.window.devicePixelRatio = 1;
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const root = path.resolve(__dirname, '..');
for (const f of ['js/geometry.js', 'js/library.js', 'js/templates.js', 'js/sheets.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const ED = globalThis.EngDraft;
assert(ED.Sheets, 'Sheets disponible');
const S = ED.Sheets;
['SIZES', 'TEMPLATES', 'createSheet', 'renderPreview', 'renderSheet', 'createPDF', 'createPDFBytes', 'downloadPDF', 'planBounds']
  .forEach(k => assert(S[k], 'Falta API: ' + k));
assert(Object.keys(S.SIZES).length >= 6);
assert(S.TEMPLATES.length === 4);

const project = ED.Templates.demo();
for (const tpl of ['modern', 'classic', 'technical', 'municipal']) {
  for (const content of ['plan', 'notes', 'cover', '3d']) {
    const sheet = S.createSheet(project, { template: tpl, content, levelId: 'l0', size: 'A3' });
    project.sheets.push(sheet);
    const b = S.planBounds(project, 'l0');
    assert(b.w > 0 && b.h > 0);
  }
}

// Canvas falso para validar la composición de las 4 plantillas.
function fakeCanvas(cssW) {
  const ctx = {
    setTransform() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    bezierCurveTo() {}, rect() {}, closePath() {}, clip() {}, fill() {}, stroke() {},
    fillText() {}, translate() {}, rotate() {}, drawImage() {}, clearRect() {}, setLineDash() {},
    arc() {}, quadraticCurveTo() {}, fillRect() {}, strokeRect() {}, strokeText() {},
    measureText() { return { width: 10 }; }
  };
  return {
    clientWidth: cssW || 900,
    width: 300,
    height: 200,
    style: {},
    parentElement: { clientWidth: 900 },
    getContext() { return ctx; }
  };
}

let previews = 0;
for (const tpl of ['modern', 'classic', 'technical', 'municipal']) {
  for (const size of ['A4', 'A3', 'Letter']) {
    for (const orientation of ['landscape', 'portrait']) {
      const sheet = S.createSheet(project, { template: tpl, size, orientation, content: 'plan', levelId: 'l0' });
      const c = fakeCanvas(720);
      S.renderPreview(c, project, sheet);
      assert(c.width > 100 && c.height > 100, 'Preview sin dimensiones: ' + tpl + size + orientation);
      previews++;
    }
  }
}
const c2 = fakeCanvas(1000);
S.renderPreview(c2, project, project.sheets.find(s => s.content === 'notes'));
console.log('Previews renderizadas:', previews + 1);

const bytes = S.createPDFBytes(project, project.sheets);
assert(bytes instanceof Uint8Array);
assert(bytes.length > 10000, 'PDF demasiado pequeño: ' + bytes.length);
const txt = Buffer.from(bytes).toString('latin1');
assert(txt.startsWith('%PDF-1.4'), 'Cabecera PDF');
assert(txt.includes('%%EOF'), 'PDF sin EOF');
assert((txt.match(/\/Type \/Page[^s]/g) || []).length === project.sheets.length, 'Número de páginas incorrecto');
const sx = txt.match(/startxref\s+(\d+)/);
assert(sx, 'PDF sin startxref');
const xrefPos = Number(sx[1]);
assert(txt.slice(xrefPos, xrefPos + 4) === 'xref', 'startxref no apunta a xref');
const xref = txt.slice(xrefPos).split('\n');
const count = Number(xref[1].split(' ')[1]);
assert(count > project.sheets.length, 'xref con muy pocos objetos');
for (let n = 1; n < count; n++) {
  const entry = xref[2 + n];
  assert(entry && /^\d{10} 00000 n/.test(entry), 'Entrada xref inválida ' + n);
  const off = Number(entry.slice(0, 10));
  assert(txt.slice(off, off + String(n).length + 6).startsWith(n + ' 0 obj'), 'Offset xref incorrecto para objeto ' + n);
}
console.log('PDF:', (bytes.length / 1024).toFixed(1), 'KB,', project.sheets.length, 'páginas, xref OK');

const blob = S.createPDF(project, project.sheets);
assert(blob && typeof blob.arrayBuffer === 'function');
const outDir = path.join(require('os').tmpdir(), 'engdraft-test');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'planos.pdf'), bytes);
console.log('PDF de prueba:', path.join(outDir, 'planos.pdf'));

// ---------------------------------------------------------------------------
// Ampliación 1.2: lámina de planta con muros en arco y spline
// ---------------------------------------------------------------------------
const proyectoCurvo = ED.Templates.create('blank');
proyectoCurvo.walls = [
  {
    id: 'w_lam_recto', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 0 }, b: { x: 5000, y: 0 }, thickness: 150, height: 2700, openings: []
  },
  {
    id: 'w_lam_arco', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 3000 }, b: { x: 5000, y: 3000 }, thickness: 150, height: 2700,
    openings: [], curve: { type: 'arc', bulge: 0.5 }
  },
  {
    id: 'w_lam_spline', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 7000 }, b: { x: 5000, y: 7000 }, thickness: 150, height: 2700,
    openings: [], curve: { type: 'spline', pts: [{ x: 1500, y: 9000 }, { x: 3500, y: 9000 }] }
  }
];
proyectoCurvo.rooms = [{
  id: 'r_lam', type: 'room', level: 'l0', layerId: 'rooms', name: 'Patio',
  polygon: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 3000 }, { x: 0, y: 3000 }],
  finish: 'wood'
}];
proyectoCurvo.items = [{
  id: 'i_lam', type: 'item', level: 'l0', layerId: 'furniture',
  libId: 'tree', x: 6000, y: 3000, rotation: 0, w: 2400, d: 2400, h: 5000
}];
const laminaCurva = S.createSheet(proyectoCurvo, {
  template: 'technical', content: 'plan', levelId: 'l0', size: 'A3', orientation: 'landscape'
});
proyectoCurvo.sheets = [laminaCurva];

const boundsCurvo = S.planBounds(proyectoCurvo, 'l0');
['minX', 'minY', 'maxX', 'maxY', 'w', 'h'].forEach(function (k) {
  assert(typeof boundsCurvo[k] === 'number' && isFinite(boundsCurvo[k]),
    'planBounds con muros curvos devolvió un valor no finito en ' + k + ': ' + boundsCurvo[k]);
});
assert(boundsCurvo.w >= 5000, 'planBounds debe cubrir el ancho de la planta curva; w = ' + boundsCurvo.w);
assert(boundsCurvo.h >= 7000, 'planBounds debe cubrir el alto de la planta curva; h = ' + boundsCurvo.h);
assert(boundsCurvo.minY <= 1700,
  'planBounds debe incluir la flecha del arco (minY ≈ 1675); minY = ' + boundsCurvo.minY);
assert(boundsCurvo.maxY >= 8900,
  'planBounds debe incluir la spline (maxY ≈ 9075); maxY = ' + boundsCurvo.maxY);

const cvCurvo = fakeCanvas(720);
assert.doesNotThrow(function () { S.renderPreview(cvCurvo, proyectoCurvo, laminaCurva); },
  'renderPreview con muros en arco y spline lanzó una excepción');
assert(cvCurvo.width > 100 && cvCurvo.height > 100,
  'La vista previa de la planta curva quedó sin dimensiones');
const cvCurvo2 = fakeCanvas(1000);
assert.doesNotThrow(function () { S.renderSheet(cvCurvo2, proyectoCurvo, laminaCurva); },
  'renderSheet con muros en arco y spline lanzó una excepción');
assert(cvCurvo2.width > 100 && cvCurvo2.height > 100,
  'La lámina de planta curva quedó sin dimensiones');

const bytesCurvo = S.createPDFBytes(proyectoCurvo, proyectoCurvo.sheets);
assert(bytesCurvo instanceof Uint8Array, 'El PDF de la lámina curva no es un Uint8Array');
assert(bytesCurvo.length > 10000, 'PDF de la lámina curva demasiado pequeño: ' + bytesCurvo.length);
const txtCurvo = Buffer.from(bytesCurvo).toString('latin1');
assert(txtCurvo.startsWith('%PDF-1.4'), 'El PDF de la lámina curva no tiene cabecera PDF');
assert(txtCurvo.includes('%%EOF'), 'El PDF de la lámina curva no tiene %%EOF');
assert((txtCurvo.match(/\/Type \/Page[^s]/g) || []).length === proyectoCurvo.sheets.length,
  'El PDF de la lámina curva no tiene una página por lámina');
const sxCurvo = txtCurvo.match(/startxref\s+(\d+)/);
assert(sxCurvo, 'El PDF de la lámina curva no tiene startxref');
const xrefCurvo = txtCurvo.slice(Number(sxCurvo[1]), Number(sxCurvo[1]) + 4);
assert(xrefCurvo === 'xref', 'El startxref del PDF de la lámina curva no apunta a xref');
console.log('Lámina de planta con muro en arco y spline: preview, renderSheet y PDF — OK');

console.log('OK — pruebas de láminas completadas');

/* Genera los archivos de muestra de la entrega */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = globalThis;
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const root = path.resolve(__dirname, '..');
for (const f of ['js/geometry.js', 'js/library.js', 'js/templates.js', 'js/sheets.js', 'js/dxf.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const ED = globalThis.EngDraft;
const project = ED.Templates.demo();
const out = path.join(root, 'samples');
fs.mkdirSync(out, { recursive: true });

fs.writeFileSync(path.join(out, 'Residencia-Aurora.engdraft'), JSON.stringify(project, null, 2));
const pdf = ED.Sheets.createPDFBytes(project, project.sheets);
fs.writeFileSync(path.join(out, 'Residencia-Aurora-planos.pdf'), Buffer.from(pdf));
const dxf = ED.DXF.create(project, { levels: 'all' });
fs.writeFileSync(path.join(out, 'Residencia-Aurora.dxf'), dxf, 'utf8');

console.log('Muestras generadas:');
console.log(' - samples/Residencia-Aurora.engdraft');
console.log(' - samples/Residencia-Aurora-planos.pdf (' + (pdf.length / 1024).toFixed(1) + ' KB)');
console.log(' - samples/Residencia-Aurora.dxf (' + (dxf.length / 1024).toFixed(1) + ' KB)');

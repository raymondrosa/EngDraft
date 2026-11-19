/* Pruebas de humo de EngDraft — ejecutar con Node */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

global.window = globalThis;
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};

const root = path.resolve(__dirname, '..');
const files = ['js/geometry.js', 'js/library.js', 'js/templates.js', 'js/store.js', 'js/dxf.js'];
for (const f of files) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}

const ED = globalThis.EngDraft;
assert(ED.Geo, 'Geo cargado');
assert(ED.Library, 'Library cargada');
assert(ED.Templates, 'Templates cargado');
assert(ED.Store, 'Store cargado');
assert(ED.DXF, 'DXF cargado');

const lib = ED.Library;
assert(lib.list().length >= 30, 'Se esperaban 30+ accesorios, hay ' + lib.list().length);
for (const def of lib.list()) {
  assert(def.plan && def.plan.length, 'Sin planta: ' + def.id);
  assert(def.boxes && def.boxes.length, 'Sin cajas 3D: ' + def.id);
  assert(def.w > 0 && def.d > 0 && def.h > 0, 'Dimensiones inválidas: ' + def.id);
}

for (const id of ['blank', 'casa1', 'casa2', 'demo']) {
  const p = ED.Templates.create(id);
  assert(p.levels.length >= 1, 'Sin niveles: ' + id);
  assert(p.sheets.length >= 1, 'Sin hojas: ' + id);
  for (const w of p.walls) {
    assert(ED.Geo.wallLength(w) > 0, 'Muro de longitud 0 en ' + id);
    for (const o of w.openings) {
      assert(o.t >= 0 && o.t <= 1, 'Abertura fuera de rango en ' + id);
      assert(o.width > 0, 'Abertura sin ancho en ' + id);
    }
  }
  for (const it of p.items) assert(lib.get(it.libId), 'libId inexistente: ' + it.libId);
  p.sheets.forEach(s => {
    assert(['A4', 'A3', 'A2', 'A1', 'Letter', 'Tabloid'].includes(s.size), 'Tamaño inválido');
    assert(['modern', 'classic', 'technical', 'municipal'].includes(s.template), 'Plantilla inválida');
    assert(p.levels.some(l => l.id === s.levelId), 'Nivel de hoja inválido');
  });
}

const demo = ED.Templates.demo();
assert(demo.walls.length >= 14, 'Demo debe tener muros');
assert(demo.rooms.length >= 10, 'Demo debe tener 10+ ambientes');
assert(demo.items.length >= 20, 'Demo debe tener mobiliario');
const demoArea = demo.rooms.reduce((a, r) => a + ED.Geo.polygonArea(r.polygon), 0);
assert(demoArea > 150e6, 'La demo debe superar 150 m² construidos');
console.log('Demo:', demo.walls.length, 'muros,', demo.rooms.length, 'ambientes,',
  demo.items.length, 'muebles,', (demoArea / 1e6).toFixed(1), 'm²,', demo.sheets.length, 'hojas');

// Detección de ambientes por rejilla
const t0 = Date.now();
const found = ED.Geo.findRooms(demo, 'l0', { minArea: 1.2e6 });
const elapsed = Date.now() - t0;
assert(found.length >= 4, 'findRooms debía encontrar recintos, encontró ' + found.length);
found.forEach(r => {
  assert(r.polygon.length >= 4);
  assert(ED.Geo.polygonArea(r.polygon) > 1.2e6);
});
console.log('findRooms:', found.length, 'recintos en', elapsed, 'ms');

// Store, historial, autoguardado
const store = new ED.Store(demo);
const l0Count = demo.walls.filter(w => w.level === 'l0').length;
assert(store.walls().length === l0Count);
assert(store.activeLevel === 'l0');
store.act('Prueba', () => {
  store.project.walls.push({
    id: 'w_test', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, thickness: 150, height: 2700, openings: []
  });
});
assert(store.project.walls.length === demo.walls.length + 1);
assert(store.canUndo());
store.undo();
assert(store.project.walls.length === demo.walls.length, 'Undo no restauró');
store.redo();
assert(store.project.walls.length === demo.walls.length + 1, 'Redo no restauró');
store.saveLocal();
assert(store.loadLocal(), 'Autoguardado no recuperable');
const json = store.exportJSON();
const store2 = new ED.Store(JSON.parse(json));
assert(store2.project.meta.name === demo.meta.name);
console.log('Store/undo/autosave: OK');

// DXF
const dxf = ED.DXF.create(demo, { levels: 'all' });
assert(dxf.startsWith('0\r\nSECTION') || dxf.startsWith('999'), 'DXF sin cabecera');
assert(dxf.includes('A-WALL'), 'DXF sin capa de muros');
assert(dxf.includes('ENTITIES'), 'DXF sin entidades');
assert(dxf.trim().endsWith('EOF'), 'DXF sin EOF');
assert(!/NaN|undefined|Infinity/.test(dxf), 'DXF contiene valores inválidos');
console.log('DXF:', (dxf.length / 1024).toFixed(1), 'KB');

console.log('OK — pruebas core completadas');

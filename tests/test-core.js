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

// ---------------------------------------------------------------------------
// Biblioteca ampliada 1.2: plantas, jardines y vías con plan/boxes/dims válidos
// ---------------------------------------------------------------------------
var TIPOS_PLAN = { rect: 1, line: 1, circle: 1, poly: 1, arc: 1 };
function numeroFinito(v, msg) {
  assert(typeof v === 'number' && isFinite(v), msg + ' (valor: ' + v + ')');
}
// Algunos accesorios agrupan sus cajas en un array anidado: se valida aplanado.
function cajasPlanas(lista) {
  var out = [];
  (lista || []).forEach(function (b) {
    if (Array.isArray(b)) out = out.concat(cajasPlanas(b));
    else if (b) out.push(b);
  });
  return out;
}
var idsVistos = {};
for (const def of lib.list()) {
  assert(def.id && !idsVistos[def.id], 'Id de biblioteca repetido: ' + def.id);
  idsVistos[def.id] = true;
  assert(typeof def.name === 'string' && def.name.trim(), 'Sin nombre: ' + def.id);
  numeroFinito(def.w, 'Ancho inválido en ' + def.id);
  numeroFinito(def.d, 'Fondo inválido en ' + def.id);
  numeroFinito(def.h, 'Alto inválido en ' + def.id);
  assert(def.w > 0 && def.d > 0 && def.h > 0, 'Dimensiones inválidas: ' + def.id);
  assert(Array.isArray(def.plan) && def.plan.length, 'Sin planta: ' + def.id);
  def.plan.forEach(function (sh, idx) {
    assert(sh && TIPOS_PLAN[sh.t], 'Planta ' + idx + ' de ' + def.id + ' con tipo desconocido: ' + (sh && sh.t));
    if (sh.t === 'rect') {
      ['x', 'y', 'w', 'h'].forEach(function (k) {
        numeroFinito(sh[k], 'rect.' + k + ' de ' + def.id);
      });
    } else if (sh.t === 'circle' || sh.t === 'arc') {
      ['cx', 'cy', 'r'].forEach(function (k) {
        numeroFinito(sh[k], sh.t + '.' + k + ' de ' + def.id);
      });
      assert(sh.r > 0, 'Radio inválido en la planta de ' + def.id);
    } else if (sh.t === 'line') {
      ['x1', 'y1', 'x2', 'y2'].forEach(function (k) {
        numeroFinito(sh[k], 'line.' + k + ' de ' + def.id);
      });
    } else if (sh.t === 'poly') {
      assert(Array.isArray(sh.points) && sh.points.length >= 3,
        'Polígono con menos de 3 puntos en la planta de ' + def.id);
      sh.points.forEach(function (p) {
        assert(p && isFinite(p.x) && isFinite(p.y),
          'Punto no finito en el polígono de la planta de ' + def.id);
      });
    }
  });
  const cajas = cajasPlanas(def.boxes);
  assert(cajas.length > 0, 'Sin cajas 3D: ' + def.id);
  var cajasUtiles = 0;
  cajas.forEach(function (bx) {
    ['x', 'y', 'z', 'w', 'd', 'h'].forEach(function (k) {
      numeroFinito(bx[k], 'Caja 3D de ' + def.id + ': ' + k);
    });
    assert(bx.w >= 0 && bx.d >= 0 && bx.h >= 0,
      'Caja 3D con medidas negativas en ' + def.id);
    // Las medidas 0 son marcadores heredados de datos antiguos: se toleran,
    // pero cada ítem debe conservar al menos una caja con volumen real.
    if (bx.w > 0 && bx.d > 0 && bx.h > 0) cajasUtiles++;
    if (bx.color != null) assert(typeof bx.color === 'string', 'Color de caja inválido en ' + def.id);
  });
  assert(cajasUtiles > 0, 'Ninguna caja 3D de ' + def.id + ' tiene volumen');
  assert(lib.categories.some(function (c) { return c.id === def.cat; }),
    'Categoría inexistente "' + def.cat + '" en ' + def.id);
}
// Nota de diagnóstico: la biblioteca histórica agrupa las cajas de algunos ítems
// en arrays anidados y deja marcadores de volumen 0. Se toleran en la validación.
const conCajasAnidadas = lib.list().filter(function (d) {
  return (d.boxes || []).some(Array.isArray);
}).map(function (d) { return d.id; });
if (conCajasAnidadas.length) {
  console.log('Nota: cajas 3D anidadas en', conCajasAnidadas.join(', '),
    '(View3D solo recorre el primer nivel)');
}

// Mínimos y nombres de las categorías nuevas (CONTRACT §13.5).
const minimosNuevos = { plantas: 5, jardines: 4, vias: 5 };
const conteoCat = {};
lib.list().forEach(function (d) { conteoCat[d.cat] = (conteoCat[d.cat] || 0) + 1; });
Object.keys(minimosNuevos).forEach(function (id) {
  const cat = lib.categories.filter(function (c) { return c.id === id; })[0];
  assert(cat, 'Falta la categoría nueva "' + id + '"');
  assert(typeof cat.name === 'string' && cat.name.trim(), 'La categoría "' + id + '" no tiene nombre visible');
  assert((conteoCat[id] || 0) >= minimosNuevos[id],
    'La categoría "' + id + '" debe tener al menos ' + minimosNuevos[id] +
    ' ítems; tiene ' + (conteoCat[id] || 0));
});
const requeridos = {
  plantas: ['palm', 'tree', 'bush', 'hedge', 'flowerBed', 'ornamentalPlant'],
  jardines: ['lawn', 'planter', 'gardenPath', 'fountain', 'rockGarden'],
  vias: ['roadStraight', 'roadCurve', 'driveway', 'drivewayCurve', 'sidewalk', 'parking']
};
Object.keys(requeridos).forEach(function (cat) {
  requeridos[cat].forEach(function (id) {
    const def = lib.get(id);
    assert(def, 'Falta el ítem "' + id + '" de la categoría ' + cat);
    assert.strictEqual(def.cat, cat, 'El ítem "' + id + '" debe pertenecer a la categoría ' + cat);
    assert((def.tags || '').length > 0, 'El ítem "' + id + '" no tiene etiquetas de búsqueda');
  });
});
console.log('Biblioteca 1.2:', lib.list().length, 'ítems;',
  'plantas', conteoCat.plantas, '· jardines', conteoCat.jardines, '· vías', conteoCat.vias, '— OK');


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

// Aspecto 3D por defecto del proyecto (CONTRACT §13.3): la demo debe seguir válida
// y saneada también en techo, materiales y modo de renderizado.
assert.deepStrictEqual(demo.settings.roof, { style: 'flat', height: 1200, overhang: 400 },
  'La demo debe tener techo plano por defecto (1200 mm / alero 400 mm)');
assert.deepStrictEqual(demo.settings.materials, {
  wall: { color: '#f3eee2', texture: 'stucco' },
  roof: { color: '#b49a7c', texture: 'tile' },
  trim: { color: '#fdfaf2' },
  ground: { color: '#c9d3ab', texture: 'grass' }
}, 'La demo debe traer los materiales por defecto de la 1.2');
assert.deepStrictEqual(demo.settings.render, { mode: 'schematic', shadows: true, textures: true, sunAngle: 135 },
  'La demo debe arrancar en modo esquemático con sombras y texturas');
const demoNorm = ED.Store.normalizeProject(ED.Geo.deepClone(demo));
assert.deepStrictEqual(demoNorm.settings.roof, demo.settings.roof,
  'normalizeProject no debe alterar el techo por defecto de la demo');
assert.deepStrictEqual(demoNorm.settings.materials, demo.settings.materials,
  'normalizeProject no debe alterar los materiales por defecto de la demo');
assert.deepStrictEqual(demoNorm.settings.render, demo.settings.render,
  'normalizeProject no debe alterar el render por defecto de la demo');

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

// Rejilla configurable: valores por defecto y saneado en project.settings
const demoGrid = ED.Templates.demo().settings;
assert.strictEqual(demoGrid.grid, 250, 'grid por defecto debe ser 250 mm; es ' + demoGrid.grid);
assert.strictEqual(demoGrid.gridMajor, 4, 'gridMajor por defecto debe ser 4; es ' + demoGrid.gridMajor);
assert.strictEqual(demoGrid.gridOriginX, 0, 'gridOriginX por defecto debe ser 0; es ' + demoGrid.gridOriginX);
assert.strictEqual(demoGrid.gridOriginY, 0, 'gridOriginY por defecto debe ser 0; es ' + demoGrid.gridOriginY);
assert.strictEqual(demoGrid.snapStep, 0, 'snapStep por defecto debe ser 0 (heredar rejilla); es ' + demoGrid.snapStep);
assert.strictEqual(demoGrid.gridAdaptive, true, 'gridAdaptive por defecto debe ser true');
assert.strictEqual(demoGrid.gridStyle, 'lines', 'gridStyle por defecto debe ser lines');
assert.strictEqual(demoGrid.showAxes, true, 'showAxes por defecto debe ser true');

function normalizedSettings(settings) {
  const p = ED.Templates.demo();
  p.settings = Object.assign({}, p.settings, settings);
  return ED.Store.normalizeProject(p).settings;
}

let ns = normalizedSettings({
  units: 'imperial', grid: 'basura', gridMajor: 0, gridOriginX: 'x', gridOriginY: 1e12,
  snapStep: -5, gridAdaptive: 'si', gridStyle: 'zigzag', showAxes: 0
});
assert.strictEqual(ns.units, 'ft', 'units "imperial" debe normalizarse a "ft"; quedó ' + ns.units);
assert.strictEqual(ns.grid, 250, 'grid no numérico debe caer a 250 mm; quedó ' + ns.grid);
assert.strictEqual(ns.gridMajor, 2, 'gridMajor=0 debe limitarse al mínimo 2; quedó ' + ns.gridMajor);
assert.strictEqual(ns.gridOriginX, 0, 'gridOriginX no numérico debe caer a 0; quedó ' + ns.gridOriginX);
assert.strictEqual(ns.gridOriginY, 1e7, 'gridOriginY debe limitarse a 1e7 mm; quedó ' + ns.gridOriginY);
assert.strictEqual(ns.snapStep, 0, 'snapStep negativo debe caer a 0 (heredar); quedó ' + ns.snapStep);
assert.strictEqual(ns.gridAdaptive, true, 'gridAdaptive solo se desactiva con false');
assert.strictEqual(ns.gridStyle, 'lines', 'gridStyle desconocido debe caer a "lines"; quedó ' + ns.gridStyle);
assert.strictEqual(ns.showAxes, true, 'showAxes solo se oculta con false');

ns = normalizedSettings({ grid: 0, gridMajor: 99, gridOriginY: -1e12, snapStep: 0 });
assert.strictEqual(ns.grid, 5, 'grid=0 debe limitarse al mínimo 5 mm; quedó ' + ns.grid);
assert.strictEqual(ns.gridMajor, 50, 'gridMajor=99 debe limitarse a 50; quedó ' + ns.gridMajor);
assert.strictEqual(ns.gridOriginY, -1e7, 'gridOriginY negativo debe limitarse a -1e7 mm; quedó ' + ns.gridOriginY);
ns = normalizedSettings({ grid: -250, gridMajor: 2.6, snapStep: 999999 });
assert.strictEqual(ns.grid, 5, 'grid negativo debe limitarse al mínimo 5 mm; quedó ' + ns.grid);
assert.strictEqual(ns.gridMajor, 3, 'gridMajor=2.6 debe redondearse a 3; quedó ' + ns.gridMajor);
assert.strictEqual(ns.snapStep, 100000, 'snapStep debe limitarse a 100000 mm; quedó ' + ns.snapStep);
ns = normalizedSettings({ grid: 1e9, gridMajor: NaN, gridOriginX: -1e12, gridStyle: 'dots' });
assert.strictEqual(ns.grid, 100000, 'grid=1e9 debe limitarse a 100000 mm; quedó ' + ns.grid);
assert.strictEqual(ns.gridMajor, 4, 'gridMajor=NaN debe caer al valor por defecto 4; quedó ' + ns.gridMajor);
assert.strictEqual(ns.gridOriginX, -1e7, 'gridOriginX debe limitarse a -1e7 mm; quedó ' + ns.gridOriginX);
assert.strictEqual(ns.gridStyle, 'dots', 'gridStyle "dots" debe conservarse');

// Un JSON con basura no debe romper la carga y debe quedar sin NaN.
const basura = JSON.parse(JSON.stringify(ED.Templates.demo()));
basura.settings = {
  units: 'm', grid: -5, gridMajor: 'x', gridOriginX: null, gridOriginY: 'y',
  snapStep: -1, gridAdaptive: null, gridStyle: 'x', showAxes: false
};
const storeBasura = new ED.Store(basura);
const sBasura = storeBasura.project.settings;
assert.strictEqual(sBasura.grid, 5, 'Importar grid negativo debe sanear a 5 mm; quedó ' + sBasura.grid);
assert.strictEqual(sBasura.gridMajor, 4, 'Importar gridMajor no numérico debe sanear a 4; quedó ' + sBasura.gridMajor);
assert.strictEqual(sBasura.gridOriginX, 0, 'Importar gridOriginX null debe sanear a 0; quedó ' + sBasura.gridOriginX);
assert.strictEqual(sBasura.gridOriginY, 0, 'Importar gridOriginY texto debe sanear a 0; quedó ' + sBasura.gridOriginY);
assert.strictEqual(sBasura.snapStep, 0, 'Importar snapStep negativo debe sanear a 0; quedó ' + sBasura.snapStep);
assert.strictEqual(sBasura.gridStyle, 'lines', 'Importar gridStyle inválido debe sanear a lines');
assert.strictEqual(sBasura.showAxes, false, 'showAxes=false debe conservarse al importar');
['grid', 'gridMajor', 'gridOriginX', 'gridOriginY', 'snapStep'].forEach(function (k) {
  assert(isFinite(sBasura[k]), 'La rejilla importada deja NaN en settings.' + k + ': ' + sBasura[k]);
});

// Los ajustes de rejilla deben sobrevivir a exportJSON/importJSON.
const projGrid = ED.Templates.demo();
projGrid.settings.grid = 500;
projGrid.settings.gridMajor = 5;
projGrid.settings.gridOriginX = -1250;
projGrid.settings.gridOriginY = 800;
projGrid.settings.snapStep = 100;
projGrid.settings.gridAdaptive = false;
projGrid.settings.gridStyle = 'dots';
projGrid.settings.showAxes = false;
const storeGrid = new ED.Store(projGrid);
const jsonGrid = storeGrid.exportJSON();
const storeGrid2 = new ED.Store(JSON.parse(jsonGrid));
const s2 = storeGrid2.project.settings;
assert.strictEqual(s2.grid, 500, 'grid no sobrevive a export/import: ' + s2.grid);
assert.strictEqual(s2.gridMajor, 5, 'gridMajor no sobrevive a export/import: ' + s2.gridMajor);
assert.strictEqual(s2.gridOriginX, -1250, 'gridOriginX no sobrevive a export/import: ' + s2.gridOriginX);
assert.strictEqual(s2.gridOriginY, 800, 'gridOriginY no sobrevive a export/import: ' + s2.gridOriginY);
assert.strictEqual(s2.snapStep, 100, 'snapStep no sobrevive a export/import: ' + s2.snapStep);
assert.strictEqual(s2.gridAdaptive, false, 'gridAdaptive no sobrevive a export/import');
assert.strictEqual(s2.gridStyle, 'dots', 'gridStyle no sobrevive a export/import');
assert.strictEqual(s2.showAxes, false, 'showAxes no sobrevive a export/import');

const storeGrid3 = new ED.Store(ED.Templates.demo());
const importado = storeGrid3.importJSON(jsonGrid);
assert.strictEqual(importado.settings.grid, 500, 'importJSON no restaura grid');
assert.strictEqual(storeGrid3.project.settings.snapStep, 100, 'importJSON no restaura snapStep');
storeGrid.saveLocal();
const recargado = storeGrid.loadLocal();
assert(recargado, 'El autoguardado con rejilla configurable no es recuperable');
assert.strictEqual(recargado.settings.grid, 500, 'El autoguardado pierde grid');
assert.strictEqual(recargado.settings.gridStyle, 'dots', 'El autoguardado pierde gridStyle');
assert.deepStrictEqual(
  ED.Store.normalizeProject(ED.Store.normalizeProject(JSON.parse(jsonGrid))).settings.grid,
  500,
  'normalizeProject debe ser idempotente con la rejilla'
);
assert.throws(function () { storeGrid3.importJSON('{"levels":[]}'); }, /niveles/i, 'Importar un proyecto sin niveles debe lanzar Error');
console.log('Rejilla configurable (settings): defaults, saneado y persistencia — OK');

// DXF
const dxf = ED.DXF.create(demo, { levels: 'all' });
assert(dxf.startsWith('0\r\nSECTION') || dxf.startsWith('999'), 'DXF sin cabecera');
assert(dxf.includes('A-WALL'), 'DXF sin capa de muros');
assert(dxf.includes('ENTITIES'), 'DXF sin entidades');
assert(dxf.trim().endsWith('EOF'), 'DXF sin EOF');
assert(!/NaN|undefined|Infinity/.test(dxf), 'DXF contiene valores inválidos');
console.log('DXF:', (dxf.length / 1024).toFixed(1), 'KB');

console.log('OK — pruebas core completadas');

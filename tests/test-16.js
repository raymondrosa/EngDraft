/* Pruebas de la ampliación 1.6 (CONTRACT §17): aberturas tipadas, estructura de
 * techo con vigas, líneas/curvas, snaps avanzados, escalado, vistas editables,
 * niveles y guardado en JSON. Node + canvas falso; sin DOM ni red.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// ------------------------------------------------------------------ canvas falso
function fakeCtx() {
  const ops = [];
  function rec(name) {
    return function () {
      ops.push({ name: name, args: Array.prototype.slice.call(arguments) });
    };
  }
  return {
    canvas: null, globalAlpha: 1, lineWidth: 1, font: '10px sans-serif',
    fillStyle: '#000', strokeStyle: '#000', textAlign: 'left', textBaseline: 'alphabetic',
    lineCap: 'butt', lineJoin: 'miter',
    _ops: ops,
    setTransform: rec('setTransform'), resetTransform: rec('resetTransform'),
    save() {}, restore() {},
    clearRect: rec('clearRect'), fillRect: rec('fillRect'), strokeRect: rec('strokeRect'),
    beginPath: rec('beginPath'), closePath: rec('closePath'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), arc: rec('arc'), ellipse: rec('ellipse'),
    bezierCurveTo: rec('bezierCurveTo'), quadraticCurveTo: rec('quadraticCurveTo'),
    rect: rec('rect'), clip: rec('clip'), fill: rec('fill'), stroke: rec('stroke'),
    fillText: rec('fillText'), strokeText: rec('strokeText'),
    translate: rec('translate'), rotate: rec('rotate'), scale: rec('scale'),
    setLineDash: rec('setLineDash'), drawImage: rec('drawImage'), roundRect: rec('roundRect'),
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return null; },
    measureText(s) { return { width: String(s).length * 6 }; },
    getImageData() { return { data: new Uint8ClampedArray(4) }; },
    putImageData() {}
  };
}
function fakeCanvas(w, h) {
  const ctx = fakeCtx();
  return {
    width: w * 2, height: h * 2, clientWidth: w, clientHeight: h,
    style: {}, parentElement: { clientWidth: w, clientHeight: h },
    getContext() { return ctx; }, addEventListener() {}, removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: w, height: h }; },
    toDataURL() { return 'data:image/png;base64,iVBORw0KGgo='; },
    _ctx: ctx
  };
}

// --------------------------------------------------------------- entorno mínimo
global.window = globalThis;
global.window.devicePixelRatio = 1;
global.requestAnimationFrame = fn => setTimeout(fn, 0);
global.cancelAnimationFrame = id => clearTimeout(id);
if (!global.addEventListener) global.addEventListener = function () {};
if (!global.removeEventListener) global.removeEventListener = function () {};
global.ResizeObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };
global.document = {
  addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
  createElement() { return { style: {}, getContext: () => fakeCtx(), addEventListener() {} }; }
};
global.localStorage = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};

const root = path.resolve(__dirname, '..');
for (const f of ['js/geometry.js', 'js/library.js', 'js/templates.js', 'js/store.js',
  'js/editor2d.js', 'js/view3d.js', 'js/views.js', 'js/dxf.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const ED = globalThis.EngDraft;
['Geo', 'Library', 'Templates', 'Store', 'Editor2D', 'View3D', 'Views', 'DXF'].forEach(function (k) {
  assert(ED[k], 'Falta ED.' + k);
});

// --------------------------------------------------------------- utilidades
function plain(v) { return JSON.parse(JSON.stringify(v)); }
function finito(v, msg) {
  assert(typeof v === 'number' && isFinite(v), msg + ' (valor: ' + v + ')');
}
function near(a, b, tol, msg) {
  finito(a, msg);
  assert(Math.abs(a - b) <= tol, msg + ': ' + a + ' ≠ ' + b + ' ±' + tol);
}
function assertOpsFinitas(ops, label) {
  assert(ops.length > 0, label + ': no se dibujó nada');
  ops.forEach(function (op) {
    op.args.forEach(function (a) {
      if (typeof a === 'number') finito(a, label + ': coordenada no finita (' + op.name + ')');
    });
  });
}
function nombres() {
  const counts = {};
  arguments[0].forEach(function (op) { counts[op.name] = (counts[op.name] || 0) + 1; });
  return counts;
}
// Proyecto de un solo nivel (los techos 3D se generan sobre el nivel superior).
function proyectoNuevo() {
  const p = ED.Templates.create('blank');
  p.levels = [p.levels[0]];
  p.walls = []; p.rooms = []; p.items = []; p.texts = []; p.dims = [];
  p.lines = []; p.sheets = [];
  return p;
}
// Proyecto de editor con muros recto y en arco (sin mobiliario ni ambientes).
function proyectoSnaps() {
  const p = proyectoNuevo();
  p.walls = [
    {
      id: 'w_recto', type: 'wall', level: 'l0', layerId: 'walls',
      a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 200, height: 2700, openings: []
    },
    {
      id: 'w_arco', type: 'wall', level: 'l0', layerId: 'walls',
      a: { x: 0, y: 4000 }, b: { x: 4000, y: 4000 }, thickness: 200, height: 2700,
      openings: [], curve: { type: 'arc', bulge: 1 }
    }
  ];
  return p;
}
function editorDe(proyecto) {
  const store = new ED.Store(proyecto);
  const canvas = fakeCanvas(900, 650);
  const ed = new ED.Editor2D(canvas, store, {});
  ed.view.x = 2000; ed.view.y = 2000; ed.view.zoom = 0.05;
  ed.setSnap({ grid: false, snapping: false });
  return { ed: ed, store: store, canvas: canvas };
}
function paresDxf(texto) {
  const lineas = texto.split('\r\n');
  if (lineas[lineas.length - 1] === '') lineas.pop();
  assert.strictEqual(lineas.length % 2, 0, 'DXF con líneas impares');
  const pares = [];
  for (let i = 0; i < lineas.length; i += 2) {
    assert(/^-?\d+$/.test(lineas[i]), 'Código de grupo DXF inválido: ' + lineas[i]);
    pares.push({ code: lineas[i], value: lineas[i + 1] });
  }
  return pares;
}

// =====================================================================
// 1) ABERTURAS TIPADAS (CONTRACT §17.1)
// =====================================================================
function normalizarAberturas(lista) {
  const p = proyectoNuevo();
  p.walls = [{
    id: 'w1', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 0 }, b: { x: 12000, y: 0 }, thickness: 200, height: 2700,
    openings: lista
  }];
  return new ED.Store(p).project.walls[0].openings;
}
const entradaAberturas = [
  { id: 'a1', type: 'door' },
  { id: 'a2', type: 'door', subtype: 'double' },
  { id: 'a3', type: 'door', subtype: 'sliding' },
  { id: 'a4', type: 'door', subtype: 'awning' },
  { id: 'a5', type: 'window' },
  { id: 'a6', type: 'window', subtype: 'sliding' },
  { id: 'a7', type: 'window', subtype: 'double' },
  { id: 'a8', type: 'window', subtype: 'awning' },
  { id: 'a9', type: 'window', subtype: 'single' },
  { id: 'a10', type: 'garage' },
  { id: 'a11', type: 'garage', subtype: 'sliding' },
  { id: 'a12', type: 'garage', subtype: 'double' },
  { id: 'a13', type: 'pass' },
  { id: 'a14', type: 'pass', subtype: 'single' },
  { id: 'a15', type: 'mampara', subtype: 'double' },
  { id: 'a16', type: 'door', subtype: 'SINGLE' },
  { id: 'a17', subtype: 'double' }, // sin type: se descarta
  null
];
const aberturas = normalizarAberturas(entradaAberturas);
assert.strictEqual(aberturas.length, 16,
  'Se esperaban 16 aberturas válidas (se descartan las que no tienen type); hay ' + aberturas.length);
const porId = {};
aberturas.forEach(function (o) { porId[o.id] = o; });
assert.strictEqual(porId.a1.subtype, 'single', 'door sin subtipo debe caer a single');
assert.strictEqual(porId.a2.subtype, 'double', 'door double debe conservarse');
assert.strictEqual(porId.a3.subtype, 'sliding', 'door sliding debe conservarse');
assert.strictEqual(porId.a4.subtype, 'single', 'door awning (inválido) debe caer a single');
assert.strictEqual(porId.a5.subtype, 'fixed', 'window sin subtipo debe caer a fixed');
assert.strictEqual(porId.a6.subtype, 'sliding', 'window sliding debe conservarse');
assert.strictEqual(porId.a7.subtype, 'double', 'window double debe conservarse');
assert.strictEqual(porId.a8.subtype, 'awning', 'window awning debe conservarse');
assert.strictEqual(porId.a9.subtype, 'fixed', 'window single (inválido) debe caer a fixed');
assert.strictEqual(porId.a10.subtype, 'sectional', 'garage sin subtipo debe caer a sectional');
assert.strictEqual(porId.a11.subtype, 'sliding', 'garage sliding debe conservarse');
assert.strictEqual(porId.a12.subtype, 'sectional', 'garage double (inválido) debe caer a sectional');
assert.strictEqual(porId.a13.subtype, '', 'pass no debe tener subtipo');
assert.strictEqual(porId.a14.subtype, '', 'pass no debe admitir subtipo');
assert.strictEqual(porId.a15.type, 'door', 'Un type inválido debe corregirse a door');
assert.strictEqual(porId.a15.subtype, 'double',
  'Al corregir type, un subtipo válido para el nuevo tipo debe conservarse (double es válido para door)');
assert.strictEqual(porId.a16.subtype, 'single', 'Un subtipo con mayúsculas debe corregirse al por defecto');
aberturas.forEach(function (o) {
  assert(['door', 'window', 'garage', 'pass'].indexOf(o.type) >= 0, 'type inválido: ' + o.type);
  finito(o.t, 'Abertura sin t finito');
  assert(o.t >= 0 && o.t <= 1, 'Abertura con t fuera de rango');
  assert(o.width > 0, 'Abertura sin ancho');
  assert(o.height > 0, 'Abertura sin alto');
});
console.log('Aberturas 1.6: subtipos saneados (door/window/garage/pass) — OK');

// --- 2D: símbolos distintos por subtipo (el doble tiene dos abanicos).
function render2DConAbertura(type, subtype) {
  const p = proyectoNuevo();
  const o = { id: 'o1', type: type, t: 0.5, width: 900, height: 2100, sill: 0, swing: 1, hinge: 1 };
  if (subtype) o.subtype = subtype;
  p.walls = [{
    id: 'w1', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 200, height: 2700, openings: [o]
  }];
  const ctx = editorDe(p);
  ctx.ed.view.zoom = 0.1;
  ctx.canvas._ctx._ops.length = 0;
  ctx.ed.render();
  const ops = ctx.canvas._ctx._ops.slice();
  assertOpsFinitas(ops, 'editor2d abertura ' + type + '/' + subtype);
  ctx.ed.destroy();
  return { ops: ops, count: nombres(ops) };
}
const dSingle = render2DConAbertura('door', 'single');
const dDouble = render2DConAbertura('door', 'double');
const dSliding = render2DConAbertura('door', 'sliding');
assert((dDouble.count.arc || 0) > (dSingle.count.arc || 0),
  'La puerta de doble hoja debe dibujar más abanicos (arc) que la de una hoja');
assert((dSingle.count.arc || 0) > (dSliding.count.arc || 0),
  'La puerta corrediza debe dibujar menos abanicos que la de una hoja');
const wFixed = render2DConAbertura('window', 'fixed');
const wSliding = render2DConAbertura('window', 'sliding');
const wDouble = render2DConAbertura('window', 'double');
const wAwning = render2DConAbertura('window', 'awning');
const totalesVentana = [wFixed.ops.length, wSliding.ops.length, wDouble.ops.length, wAwning.ops.length];
assert(new Set(totalesVentana).size === 4,
  'Cada subtipo de ventana debe dibujarse distinto en 2D; totales: ' + JSON.stringify(totalesVentana));
const gSec = render2DConAbertura('garage', 'sectional');
const gSlid = render2DConAbertura('garage', 'sliding');
assert.notStrictEqual(gSec.ops.length, gSlid.ops.length,
  'El garaje seccional y el corredizo deben dibujarse distinto');
assert.doesNotThrow(function () { render2DConAbertura('pass', null); }, 'pass debe dibujarse sin lanzar');
console.log('Aberturas 1.6: símbolos 2D diferenciados por subtipo — OK');

// --- 3D y vistas: todos los subtipos renderizan y la vista etiqueta su origen.
const proyectoAberturas = proyectoNuevo();
proyectoAberturas.walls = [
  {
    id: 'w_front', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 0 }, b: { x: 12000, y: 0 }, thickness: 200, height: 2700,
    openings: [
      { id: 'o_d_single', type: 'door', subtype: 'single', t: 0.06, width: 900, height: 2100, sill: 0, swing: 1, hinge: 1 },
      { id: 'o_d_double', type: 'door', subtype: 'double', t: 0.16, width: 1600, height: 2100, sill: 0, swing: 1, hinge: 1 },
      { id: 'o_d_sliding', type: 'door', subtype: 'sliding', t: 0.28, width: 1200, height: 2100, sill: 0, swing: 1, hinge: 1 },
      { id: 'o_w_fixed', type: 'window', subtype: 'fixed', t: 0.4, width: 1200, height: 1500, sill: 900, swing: 1, hinge: 1 },
      { id: 'o_w_sliding', type: 'window', subtype: 'sliding', t: 0.52, width: 1200, height: 1500, sill: 900, swing: 1, hinge: 1 },
      { id: 'o_w_double', type: 'window', subtype: 'double', t: 0.64, width: 1200, height: 1500, sill: 900, swing: 1, hinge: 1 },
      { id: 'o_w_awning', type: 'window', subtype: 'awning', t: 0.76, width: 1200, height: 1500, sill: 900, swing: 1, hinge: 1 },
      { id: 'o_g_sec', type: 'garage', subtype: 'sectional', t: 0.9, width: 2400, height: 2200, sill: 0, swing: 1, hinge: 1 }
    ]
  },
  {
    id: 'w_side', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 0 }, b: { x: 0, y: 4000 }, thickness: 200, height: 2700,
    openings: [{ id: 'o_g_slid', type: 'garage', subtype: 'sliding', t: 0.5, width: 2400, height: 2200, sill: 0, swing: 1, hinge: 1 }]
  },
  {
    id: 'w_back', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 4000 }, b: { x: 12000, y: 4000 }, thickness: 200, height: 2700,
    openings: [{ id: 'o_pass', type: 'pass', t: 0.5, width: 1500, height: 2400, sill: 0, swing: 1, hinge: 1 }]
  }
];
proyectoAberturas.settings.roof = {
  style: 'gable', ridge: 'auto', height: 2000, overhang: 400, profile: null,
  structure: { material: 'wood', spacing: 800, depth: 200, width: 120 }
};
const storeAberturas = new ED.Store(proyectoAberturas);
const errores3D = [];
const consoleErrorOriginal = console.error;
console.error = function () { errores3D.push(Array.prototype.slice.call(arguments).map(String).join(' ')); };
try {
  const v = new ED.View3D(fakeCanvas(1000, 700), { store: storeAberturas });
  v.setOptions({ roof: true });
  v.render();
  assert(v.getRenderInfo().faces > 0, 'La vista 3D con aberturas tipadas no generó caras');
  assert(typeof v.screenshot() === 'string' && v.screenshot().startsWith('data:image/png'),
    'screenshot con aberturas tipadas inválido');
  v.setOptions({ renderMode: 'realistic', textures: true });
  v.render();
  v.destroy();
} finally {
  console.error = consoleErrorOriginal;
}
assert.strictEqual(errores3D.length, 0,
  'El render 3D con aberturas tipadas registró errores: ' + errores3D.join(' | '));
const vistaFrontal = ED.Views.build(storeAberturas.project, { type: 'front', levelId: 'all' });
const primPorAbertura = {};
vistaFrontal.primitives.forEach(function (pr) {
  if (pr.src && pr.src.kind === 'opening') {
    primPorAbertura[pr.src.openingId] = (primPorAbertura[pr.src.openingId] || 0) + 1;
  }
});
['o_d_single', 'o_d_double', 'o_d_sliding', 'o_w_fixed', 'o_w_sliding', 'o_w_double',
  'o_w_awning', 'o_g_sec', 'o_pass'].forEach(function (id) {
  assert(primPorAbertura[id] > 0, 'La vista frontal debe dibujar la abertura ' + id);
});
assert(primPorAbertura.o_d_double > primPorAbertura.o_d_single,
  'La puerta doble debe aportar más primitivas que la de una hoja en la vista');
assert(primPorAbertura.o_w_sliding > primPorAbertura.o_w_fixed,
  'La ventana corrediza debe aportar más primitivas que la fija en la vista');
assert(primPorAbertura.o_w_awning > primPorAbertura.o_w_fixed,
  'La ventana proyectante debe aportar más primitivas que la fija en la vista');
console.log('Aberturas 1.6: render 2D/3D y alzados con paneles por subtipo — OK');

// =====================================================================
// 2) ESTRUCTURA DE TECHO CON VIGAS (CONTRACT §17.3)
// =====================================================================
function normalizarSettings(patch) {
  const p = ED.Templates.create('blank');
  Object.keys(patch || {}).forEach(function (k) { p.settings[k] = patch[k]; });
  return ED.Store.normalizeProject(p).settings;
}
var s = normalizarSettings({});
assert.deepStrictEqual(s.roof.structure, { material: 'none', spacing: 800, depth: 200, width: 120 },
  'Estructura de techo por defecto incorrecta');
s = normalizarSettings({ roof: { structure: null } });
assert.deepStrictEqual(s.roof.structure, { material: 'none', spacing: 800, depth: 200, width: 120 },
  'structure nula debe caer a los valores por defecto');
s = normalizarSettings({ roof: { structure: { material: 'steel', spacing: 900, depth: 250, width: 150 } } });
assert.deepStrictEqual(s.roof.structure, { material: 'steel', spacing: 900, depth: 250, width: 150 },
  'La estructura válida debe conservarse');
s = normalizarSettings({ roof: { structure: { material: 'madera', spacing: 100, depth: 9999, width: 9999 } } });
assert.deepStrictEqual(s.roof.structure, { material: 'none', spacing: 300, depth: 600, width: 400 },
  'Material inválido y medidas extremas deben sanearse: ' + JSON.stringify(s.roof.structure));
s = normalizarSettings({ roof: { structure: { material: 'concrete', spacing: 5000, depth: 50, width: 20 } } });
assert.deepStrictEqual(s.roof.structure, { material: 'concrete', spacing: 3000, depth: 80, width: 60 },
  'Las medidas fuera de rango deben limitarse: ' + JSON.stringify(s.roof.structure));
s = normalizarSettings({ roof: { structure: { material: 'wood', spacing: NaN, depth: 'x', width: undefined } } });
assert.deepStrictEqual(s.roof.structure, { material: 'wood', spacing: 800, depth: 200, width: 120 },
  'Los valores no numéricos deben caer a sus defectos');
const pEstructura = proyectoNuevo();
pEstructura.settings.roof = {
  style: 'gable', ridge: 'auto', height: 2200, overhang: 500, profile: null,
  structure: { material: 'steel', spacing: 700, depth: 240, width: 130 }
};
const jsonEstructura = new ED.Store(pEstructura).exportJSON();
const pEstructuraImp = new ED.Store(JSON.parse(jsonEstructura)).project;
assert.deepStrictEqual(pEstructuraImp.settings.roof.structure,
  { material: 'steel', spacing: 700, depth: 240, width: 130 },
  'La estructura de techo debe sobrevivir a exportJSON/Store');
console.log('Estructura de techo 1.6: saneado y persistencia — OK');

// --- 3D: vigas en todos los estilos, info y opciones.
function proyectoVigas(material, estilo) {
  const p = proyectoNuevo();
  p.walls = [
    { id: 'w1', type: 'wall', level: 'l0', layerId: 'walls', a: { x: 0, y: 0 }, b: { x: 6000, y: 0 }, thickness: 200, height: 2700, openings: [] },
    { id: 'w2', type: 'wall', level: 'l0', layerId: 'walls', a: { x: 0, y: 0 }, b: { x: 0, y: 4000 }, thickness: 200, height: 2700, openings: [] },
    { id: 'w3', type: 'wall', level: 'l0', layerId: 'walls', a: { x: 6000, y: 0 }, b: { x: 6000, y: 4000 }, thickness: 200, height: 2700, openings: [] },
    { id: 'w4', type: 'wall', level: 'l0', layerId: 'walls', a: { x: 0, y: 4000 }, b: { x: 6000, y: 4000 }, thickness: 200, height: 2700, openings: [] }
  ];
  p.settings.roof = {
    style: estilo || 'gable', ridge: 'auto', height: 2000, overhang: 400,
    profile: estilo === 'custom' ? [{ t: 0, z: 0 }, { t: 0.5, z: 1400 }, { t: 1, z: 0 }] : null,
    structure: { material: material, spacing: 800, depth: 200, width: 120 }
  };
  return new ED.Store(p);
}
function caras3D(store, opciones) {
  const v = new ED.View3D(fakeCanvas(900, 650), { store: store });
  v.setOptions(Object.assign({ roof: true }, opciones || {}));
  v.render();
  const info = v.getRenderInfo();
  const resultado = { info: info, options: v.getOptions(), scene: v._scene };
  v.destroy();
  return resultado;
}
const sinVigas = caras3D(proyectoVigas('none'));
const conVigas = caras3D(proyectoVigas('steel'));
assert.strictEqual(sinVigas.info.hasStructure, false, 'Sin estructura hasStructure debe ser false');
assert.strictEqual(sinVigas.info.material, 'none', 'Sin estructura material debe ser none');
assert.strictEqual(conVigas.info.hasStructure, true, 'Con vigas hasStructure debe ser true');
assert.strictEqual(conVigas.info.material, 'steel', 'Con vigas de acero material debe ser steel');
assert(conVigas.info.faces > sinVigas.info.faces,
  'Las vigas deben añadir caras (' + conVigas.info.faces + ' vs ' + sinVigas.info.faces + ')');
assert(conVigas.scene.roofFaces.length > sinVigas.scene.roofFaces.length,
  'Las vigas deben añadirse a las caras del techo');
errores3D.length = 0;
console.error = function () { errores3D.push(Array.prototype.slice.call(arguments).map(String).join(' ')); };
try {
  ['flat', 'gable', 'hip', 'arc', 'spline', 'custom'].forEach(function (estilo) {
    const r = caras3D(proyectoVigas('wood', estilo));
    assert.strictEqual(r.info.roofStyle, estilo,
      'El techo ' + estilo + ' debe renderizar con vigas; informa ' + r.info.roofStyle);
    assert.strictEqual(r.info.hasStructure, true, 'hasStructure debe ser true con techo ' + estilo);
    assert.strictEqual(r.info.material, 'wood', 'material debe ser wood con techo ' + estilo);
    assert(r.info.faces > 0, 'El techo ' + estilo + ' con vigas no generó caras');
  });
  // Override por setOptions y saneado de valores inválidos.
  const storeVigas = proyectoVigas('none');
  const v = new ED.View3D(fakeCanvas(900, 650), { store: storeVigas });
  v.setOptions({ roof: true, roofStructure: { material: 'concrete', spacing: 1, depth: 9999, width: 0 } });
  v.render();
  assert.deepStrictEqual(plain(v.getOptions().roofStructure),
    { material: 'concrete', spacing: 300, depth: 600, width: 60 },
    'setOptions debe sanear roofStructure: ' + JSON.stringify(v.getOptions().roofStructure));
  assert.strictEqual(v.getRenderInfo().material, 'concrete', 'getRenderInfo debe reflejar el material de setOptions');
  assert.strictEqual(v.getRenderInfo().hasStructure, true, 'getRenderInfo debe marcar la estructura activa');
  v.setOptions({ roofStructure: { material: 'inventado' } });
  v.render();
  assert.deepStrictEqual(plain(v.getOptions().roofStructure),
    { material: 'none', spacing: 800, depth: 200, width: 120 },
    'Un material inválido en setOptions debe caer a none');
  assert.strictEqual(v.getRenderInfo().material, 'none', 'getRenderInfo debe volver a material none');
  v.destroy();
} finally {
  console.error = consoleErrorOriginal;
}
assert.strictEqual(errores3D.length, 0, 'El render 3D con vigas registró errores: ' + errores3D.join(' | '));
console.log('Estructura de techo 1.6: vigas en 3D con los 6 estilos e info expuesta — OK');

// --- Vistas: meta y primitivas de vigas en las secciones.
function proyectoVistasVigas(material) {
  const p = proyectoNuevo();
  p.walls = [
    { id: 'w1', type: 'wall', level: 'l0', layerId: 'walls', a: { x: 0, y: 0 }, b: { x: 8000, y: 0 }, thickness: 200, height: 2700, openings: [] },
    { id: 'w2', type: 'wall', level: 'l0', layerId: 'walls', a: { x: 0, y: 0 }, b: { x: 0, y: 5000 }, thickness: 200, height: 2700, openings: [] },
    { id: 'w3', type: 'wall', level: 'l0', layerId: 'walls', a: { x: 8000, y: 0 }, b: { x: 8000, y: 5000 }, thickness: 200, height: 2700, openings: [] },
    { id: 'w4', type: 'wall', level: 'l0', layerId: 'walls', a: { x: 0, y: 5000 }, b: { x: 8000, y: 5000 }, thickness: 200, height: 2700, openings: [] }
  ];
  p.settings.roof = {
    style: 'gable', ridge: 'x', height: 2400, overhang: 500, profile: null,
    structure: { material: material, spacing: 900, depth: 250, width: 150 }
  };
  return new ED.Store(p).project;
}
const projVistasNone = proyectoVistasVigas('none');
const projVistasSteel = proyectoVistasVigas('steel');
const secNone = ED.Views.build(projVistasNone, { type: 'sectionY', levelId: 'all' });
const secSteel = ED.Views.build(projVistasSteel, { type: 'sectionY', levelId: 'all' });
assert.deepStrictEqual(plain(secNone.meta.roofStructure),
  { material: 'none', spacing: 900, depth: 250, width: 150 },
  'La sección sin vigas debe informar material none en meta.roofStructure');
assert.deepStrictEqual(plain(secSteel.meta.roofStructure),
  { material: 'steel', spacing: 900, depth: 250, width: 150 },
  'La sección debe informar la estructura en meta.roofStructure');
assert(secSteel.primitives.length > secNone.primitives.length,
  'La sección con vigas debe añadir primitivas (' + secSteel.primitives.length + ' vs ' + secNone.primitives.length + ')');
const frontNone = ED.Views.build(projVistasNone, { type: 'front', levelId: 'all' });
const frontSteel = ED.Views.build(projVistasSteel, { type: 'front', levelId: 'all' });
assert(frontSteel.primitives.length > frontNone.primitives.length,
  'El alzado con vigas debe mostrar el canto de la estructura bajo el alero');
console.log('Estructura de techo 1.6: vigas en secciones y alzados de vistas — OK');

// =====================================================================
// 3) LÍNEAS Y CURVAS (CONTRACT §17.4)
// =====================================================================
const pLineas = proyectoNuevo();
pLineas.lines = [
  { id: 'ln_recta', type: 'line', level: 'l0', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } },
  {
    id: 'ln_arco', type: 'curve', level: 'l0', a: { x: 0, y: 500 }, b: { x: 1000, y: 500 },
    curve: { type: 'arc', bulge: 10 }, color: '#123456', width: 999, style: 'dash'
  },
  {
    id: 'ln_spline', type: 'curve', level: 'l0', a: { x: 0, y: 1000 }, b: { x: 1000, y: 1000 },
    curve: { type: 'spline', pts: [{ x: 500, y: 1400 }, { x: NaN, y: 0 }, null] }
  },
  { id: 'ln_sin_curva', type: 'curve', level: 'l0', a: { x: 0, y: 1500 }, b: { x: 1000, y: 1500 } },
  {
    id: 'ln_bulge_cero', type: 'curve', level: 'l0', a: { x: 0, y: 2000 }, b: { x: 1000, y: 2000 },
    curve: { type: 'arc', bulge: 0 }
  },
  { id: 'ln_tipo_malo', type: 'garabato', level: 'nivelX', a: { x: NaN, y: 0 }, b: { x: 1000, y: 2500 }, color: 'rojo', width: 1, style: 'x' },
  { id: 'ln_sin_b', type: 'line', level: 'l0', a: { x: 0, y: 0 } },
  null
];
const storeLineas = new ED.Store(pLineas);
const lineasNorm = storeLineas.project.lines;
assert.strictEqual(lineasNorm.length, 6,
  'Se esperaban 6 líneas válidas (se descartan null y las que no tienen b); hay ' + lineasNorm.length);
function lineaPorId(id) { return lineasNorm.filter(function (l) { return l.id === id; })[0]; }
const lnRecta = lineaPorId('ln_recta');
assert.strictEqual(lnRecta.type, 'line', 'Una línea recta conserva type line');
assert.strictEqual(lnRecta.level, 'l0', 'La línea debe nivelarse al primer nivel');
assert.strictEqual(lnRecta.layerId, 'annotation', 'La capa por defecto de líneas debe ser annotation');
assert.strictEqual(lnRecta.color, '#3f6f86', 'El color por defecto de línea debe ser #3f6f86');
assert.strictEqual(lnRecta.width, 25, 'El ancho por defecto de línea debe ser 25');
assert.strictEqual(lnRecta.style, 'solid', 'El estilo por defecto de línea debe ser solid');
assert.strictEqual(lnRecta.curve, undefined, 'Una línea recta no debe tener curve');
const lnArco = lineaPorId('ln_arco');
assert.strictEqual(lnArco.type, 'curve', 'Un arco debe conservar type curve');
assert.deepStrictEqual(lnArco.curve, { type: 'arc', bulge: 4 }, 'El bulge de la curva debe limitarse a ±4');
assert.strictEqual(lnArco.width, 300, 'El ancho de la curva debe limitarse a 300');
assert.strictEqual(lnArco.style, 'dash', 'El estilo dash de la curva debe conservarse');
assert.strictEqual(lnArco.color, '#123456', 'El color válido de la curva debe conservarse');
assert.deepStrictEqual(lineaPorId('ln_spline').curve,
  { type: 'spline', pts: [{ x: 500, y: 1400 }] },
  'La spline debe descartar puntos inválidos y conservar los válidos');
assert.strictEqual(lineaPorId('ln_sin_curva').type, 'line',
  'Una curva sin curve debe degradarse a línea recta');
assert.strictEqual(lineaPorId('ln_bulge_cero').type, 'line',
  'Una curva con bulge 0 debe degradarse a línea recta');
assert.strictEqual(lineaPorId('ln_bulge_cero').curve, undefined, 'bulge 0 no debe dejar curve');
const lnMala = lineaPorId('ln_tipo_malo');
assert.strictEqual(lnMala.type, 'line', 'Un type de línea desconocido debe caer a line');
assert.strictEqual(lnMala.level, 'l0', 'Un nivel inválido debe caer al primer nivel');
assert.strictEqual(lnMala.color, '#3f6f86', 'Un color inválido debe caer al color por defecto');
assert.strictEqual(lnMala.width, 5, 'Un ancho menor que 5 debe limitarse a 5');
assert.strictEqual(lnMala.style, 'solid', 'Un estilo inválido debe caer a solid');
assert.strictEqual(lnMala.a.x, 0, 'Coordenadas no numéricas deben sanearse a 0');
const jsonLineas = storeLineas.exportJSON();
const lineasImp = new ED.Store(JSON.parse(jsonLineas)).project.lines;
assert.deepStrictEqual(plain(lineasImp), plain(lineasNorm), 'Las líneas deben sobrevivir a export/import');
console.log('Líneas/curvas 1.6: saneado de project.lines — OK');

// --- Editor 2D: dibujar, hit-test, mover, duplicar y borrar.
const edCtx = editorDe(proyectoNuevo());
const ed = edCtx.ed;
ed.setTool('line');
ed._lineDown({ x: 0, y: 0 });
ed._lineDown({ x: 1000, y: 0 });
ed._lineDown({ x: 1000, y: 600 });
ed._finishDraw();
assert.strictEqual(edCtx.store.project.lines.length, 2,
  'La herramienta Línea debe crear un segmento por clic; hay ' + edCtx.store.project.lines.length);
assert(edCtx.store.project.lines.every(function (l) { return l.type === 'line'; }),
  'La herramienta Línea debe crear entidades type line');
ed.setTool('curve');
ed._curveLineDown({ x: 0, y: 2000 });
ed._curveLineDown({ x: 2000, y: 2000 });
ed._curveLineDown({ x: 1000, y: 2600 }); // clic fuera de la cuerda: define la curvatura
const curvaCreada = edCtx.store.project.lines[edCtx.store.project.lines.length - 1];
assert.strictEqual(curvaCreada.type, 'curve', 'La herramienta Curva debe crear type curve');
assert(curvaCreada.curve && curvaCreada.curve.type === 'arc', 'La curva creada debe ser un arco');
assert(Math.abs(Math.abs(curvaCreada.curve.bulge) - 0.6) < 0.05,
  'La flecha de la curva debe ser ≈0.6; es ' + curvaCreada.curve.bulge);
edCtx.canvas._ctx._ops.length = 0;
assert.doesNotThrow(function () { ed.render(); }, 'render() con líneas y curvas lanzó una excepción');
assertOpsFinitas(edCtx.canvas._ctx._ops, 'editor2d con líneas');
const hitRecta = ed._hitTest({ x: 500, y: 0 });
assert(hitRecta && hitRecta.kind === 'line', '_hitTest debe detectar la línea recta');
const hitCurva = ed._hitTest({ x: 1000, y: 2600 });
assert(hitCurva && hitCurva.kind === 'line', '_hitTest debe detectar la curva por su eje');
// Mover una línea (arrastre).
const lineaMover = edCtx.store.find('line', hitRecta.id);
ed.setSnap({ grid: false, snapping: false });
ed._startDrag('line', lineaMover, 'move', { x: 500, y: 0 });
ed._dragMove({ x: 1500, y: 400 }, false);
edCtx.store.historyCommit();
ed.drag = null;
assert.strictEqual(lineaMover.a.x, 1000, 'Arrastrar la línea debe mover su extremo A en X; a.x = ' + lineaMover.a.x);
assert.strictEqual(lineaMover.a.y, 400, 'Arrastrar la línea debe mover su extremo A en Y; a.y = ' + lineaMover.a.y);
assert.strictEqual(lineaMover.b.x, 2000, 'Arrastrar la línea debe mover su extremo B en X');
// Duplicar y borrar.
edCtx.store.setSelection([{ kind: 'line', id: lineaMover.id }]);
const copias = ed.duplicateSelection();
assert.strictEqual(copias.length, 1, 'Duplicar una línea debe devolver una copia');
assert.strictEqual(edCtx.store.project.lines.length, 4, 'Debe añadirse una línea duplicada');
const copia = edCtx.store.find('line', copias[0].id);
assert(copia && copia.id !== lineaMover.id, 'La copia debe tener id propio');
assert.strictEqual(copia.a.x, lineaMover.a.x + 400, 'La copia debe desplazarse +400 mm en X');
assert.strictEqual(copia.a.y, lineaMover.a.y - 400, 'La copia debe desplazarse -400 mm en Y');
edCtx.store.setSelection([{ kind: 'line', id: copia.id }]);
assert.strictEqual(ed.deleteSelection(), 1, 'deleteSelection debe borrar la línea seleccionada');
assert.strictEqual(edCtx.store.project.lines.length, 3, 'Tras borrar la copia deben quedar 3 líneas');
ed.cancel();
ed.destroy();
console.log('Líneas/curvas 1.6: editor 2D (dibujar, hit-test, mover, duplicar y borrar) — OK');

// --- DXF: LINE, LWPOLYLINE con bulge, capas y AC1015 solo con curvas.
function proyectoDxfLineas(conCurva) {
  const p = proyectoNuevo();
  p.lines = [
    { id: 'ln_solida', type: 'line', level: 'l0', a: { x: 0, y: 0 }, b: { x: 2000, y: 0 }, color: '#3f6f86', width: 25, style: 'solid' },
    { id: 'ln_guion', type: 'line', level: 'l0', a: { x: 0, y: 300 }, b: { x: 2000, y: 300 }, color: '#3f6f86', width: 25, style: 'dash' }
  ];
  if (conCurva) {
    p.lines.push({
      id: 'ln_curva', type: 'curve', level: 'l0', a: { x: 0, y: 600 }, b: { x: 2000, y: 600 },
      curve: { type: 'arc', bulge: -0.5 }, color: '#3f6f86', width: 25, style: 'solid'
    });
  }
  return new ED.Store(p).project;
}
const dxfRectas = ED.DXF.create(proyectoDxfLineas(false), { levels: 'all' });
assert(!/NaN|undefined|Infinity/.test(dxfRectas), 'El DXF de líneas contiene valores inválidos');
assert(dxfRectas.indexOf('AC1009') >= 0, 'Sin curvas, el DXF de líneas debe ser R12 (AC1009)');
assert(dxfRectas.indexOf('LWPOLYLINE') < 0, 'Sin curvas no debe haber LWPOLYLINE');
let paresRectas = paresDxf(dxfRectas);
const capasRectas = paresRectas.filter(function (p) { return p.code === '8'; }).map(function (p) { return p.value; });
assert(capasRectas.indexOf('A-LINE') >= 0, 'Las líneas deben exportarse en la capa A-LINE');
assert(capasRectas.indexOf('A-LINE-DASHED') >= 0, 'Las líneas discontinuas deben usar A-LINE-DASHED');
const entidadesLine = [];
for (let i = 0; i < paresRectas.length - 1; i++) {
  if (paresRectas[i].code === '0' && paresRectas[i].value === 'LINE') entidadesLine.push(paresRectas[i]);
}
assert(entidadesLine.filter(function (e, idx) { return idx < 2; }).length === 2,
  'El DXF debe incluir una entidad LINE por cada línea recta');
assert(dxfRectas.trim().endsWith('EOF'), 'El DXF de líneas debe terminar con EOF');

const dxfCurvas = ED.DXF.create(proyectoDxfLineas(true), { levels: 'all' });
assert(!/NaN|undefined|Infinity/.test(dxfCurvas), 'El DXF con curva de dibujo contiene valores inválidos');
assert(dxfCurvas.indexOf('AC1015') >= 0, 'Con curvas de dibujo el DXF debe subir a AC1015 (R2000)');
assert((dxfCurvas.match(/\r\n0\r\nLWPOLYLINE\r\n/g) || []).length >= 1,
  'La curva de dibujo debe exportarse como LWPOLYLINE');
const paresCurvas = paresDxf(dxfCurvas);
const bulges = paresCurvas.filter(function (p) { return p.code === '42'; });
assert(bulges.length >= 1, 'La LWPOLYLINE de la curva debe llevar su bulge (grupo 42)');
near(Number(bulges[0].value), -0.5, 1e-6, 'El bulge exportado debe ser -0.5');
assert(dxfCurvas.trim().endsWith('EOF'), 'El DXF con curvas debe terminar con EOF');
console.log('Líneas/curvas 1.6: DXF con LINE/LWPOLYLINE, capas y AC1015 — OK');

// =====================================================================
// 4) SNAPS AVANZADOS (CONTRACT §17.2)
// =====================================================================
delete global.localStorage._d['engdraft.snaps'];
const snaps = editorDe(proyectoSnaps());
const edSnap = snaps.ed;
edSnap.setSnap({ grid: false, snapping: true });
edSnap.view.zoom = 0.05; // tolerancia de 220 mm
const modosDefecto = edSnap.getSnapModes();
assert.deepStrictEqual(modosDefecto, {
  endpoint: true, midpoint: true, center: true, quadrant: true, tangent: true, perpendicular: true
}, 'Los modos de snap deben estar activos por defecto: ' + JSON.stringify(modosDefecto));
function snapA(x, y, opts) { return edSnap.snapPoint({ x: x, y: y }, opts); }
function assertSnap(res, tipo, label) {
  assert(res && res.snapped === true, label + ': se esperaba un ajuste');
  assert.strictEqual(res.type, tipo, label + ': se esperaba ' + tipo + '; se obtuvo ' + res.type);
  finito(res.point.x, label + ': x del punto');
  finito(res.point.y, label + ': y del punto');
}
assertSnap(snapA(30, 20), 'EXTREMO', 'Extremo de muro');
assertSnap(snapA(2000, 30), 'MEDIO', 'Punto medio de muro');
assertSnap(snapA(2000, 4000), 'CENTRO', 'Centro del arco de muro');
assertSnap(snapA(2000, 6000), 'CUADRANTE', 'Cuadrante del arco de muro');
// Tangente desde el punto de referencia (2000,0) al arco de centro (2000,4000).
const arcoSnap = ED.Geo.arcFromBulge({ x: 0, y: 4000 }, { x: 4000, y: 4000 }, 1);
const refTangent = { x: 2000, y: 0 };
const baseAng = Math.atan2(refTangent.y - arcoSnap.center.y, refTangent.x - arcoSnap.center.x);
const alphaTang = Math.acos(arcoSnap.radius / ED.Geo.dist(refTangent, arcoSnap.center));
const puntoTangente = {
  x: arcoSnap.center.x + Math.cos(baseAng + alphaTang) * arcoSnap.radius,
  y: arcoSnap.center.y + Math.sin(baseAng + alphaTang) * arcoSnap.radius
};
assertSnap(snapA(puntoTangente.x, puntoTangente.y, { ref: refTangent }), 'TANGENTE', 'Tangente al arco');
assertSnap(snapA(1500, 30, { ref: { x: 1500, y: 2000 } }), 'PERPENDICULAR', 'Perpendicular al muro recto');
// Sin referencia no hay tangente ni perpendicular.
assert.strictEqual(snapA(puntoTangente.x, puntoTangente.y).type, null,
  'La tangente no debe aparecer sin punto de referencia');
// El resultado incluye el punto exacto y snapped=true.
const resMedio = snapA(2000, 20);
assert.deepStrictEqual(plain(resMedio.point), { x: 2000, y: 0 }, 'El snap MEDIO debe devolver el punto exacto');
assert.strictEqual(resMedio.snapped, true, 'El snap debe informar snapped=true');
// Sin ningún candidato y rejilla desactivada: punto libre, snapped=false.
const libre = snapA(700, 1700);
assert.strictEqual(libre.snapped, false, 'Sin candidatos y sin rejilla snapped debe ser false');
assert.strictEqual(libre.type, null, 'Sin candidatos y sin rejilla el tipo debe ser null');
assert.deepStrictEqual(plain(libre.point), { x: 700, y: 1700 }, 'Sin snap el punto debe ser el crudo');

// Toggles: desactivar un modo elimina sus candidatos.
const TODOS_LOS_MODOS = {
  endpoint: true, midpoint: true, center: true, quadrant: true, tangent: true, perpendicular: true
};
const toggles = [
  ['endpoint', 30, 20, undefined, 'EXTREMO'],
  ['midpoint', 2000, 30, undefined, 'MEDIO'],
  ['center', 2000, 4000, undefined, 'CENTRO'],
  ['quadrant', 2000, 6000, undefined, 'CUADRANTE'],
  ['tangent', puntoTangente.x, puntoTangente.y, { ref: refTangent }, 'TANGENTE'],
  ['perpendicular', 1500, 30, { ref: { x: 1500, y: 2000 } }, 'PERPENDICULAR']
];
toggles.forEach(function (caso) {
  const modo = caso[0];
  edSnap.setSnapModes(TODOS_LOS_MODOS); // todos activos
  assertSnap(snapA(caso[1], caso[2], caso[3]), caso[4], 'Antes de desactivar ' + modo);
  const modos = edSnap.setSnapModes({ [modo]: false });
  assert.strictEqual(modos[modo], false, 'setSnapModes debe desactivar ' + modo);
  const res = snapA(caso[1], caso[2], caso[3]);
  assert.notStrictEqual(res.type, caso[4], 'Desactivar ' + modo + ' no debe devolver ' + caso[4]);
  // La persistencia en localStorage guarda el estado.
  const guardado = JSON.parse(global.localStorage.getItem('engdraft.snaps'));
  assert.strictEqual(guardado[modo], false, 'localStorage debe guardar ' + modo + ' desactivado');
});
edSnap.setSnapModes({ endpoint: false, midpoint: false, center: false, quadrant: false, tangent: false, perpendicular: false });
assert(JSON.parse(global.localStorage.getItem('engdraft.snaps')).endpoint === false,
  'localStorage debe conservar los modos desactivados');
// Un editor nuevo carga los modos persistidos.
const snaps2 = editorDe(proyectoSnaps());
assert.strictEqual(snaps2.ed.getSnapModes().endpoint, false,
  'Un editor nuevo debe cargar los modos de snap persistidos');
assert.strictEqual(edSnap.setSnapModes(null).endpoint, false,
  'setSnapModes(null) debe devolver el estado actual sin lanzar');
snaps.ed.destroy();
snaps2.ed.destroy();
delete global.localStorage._d['engdraft.snaps'];
console.log('Snaps 1.6: modos por defecto, tipos, toggles y persistencia — OK');

// =====================================================================
// 5) ESCALADO (CONTRACT §17.4)
// =====================================================================
const pEscala = proyectoNuevo();
pEscala.walls = [{
  id: 'w_escala', type: 'wall', level: 'l0', layerId: 'walls',
  a: { x: 1000, y: 1000 }, b: { x: 3000, y: 1000 }, thickness: 200, height: 2700,
  openings: [{ id: 'o_escala', type: 'door', subtype: 'single', t: 0.5, width: 900, height: 2100, sill: 0, swing: 1, hinge: 1 }]
}];
pEscala.rooms = [{
  id: 'r_escala', type: 'room', level: 'l0', layerId: 'rooms', name: 'Sala',
  polygon: [{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 3000 }, { x: 1000, y: 3000 }],
  finish: 'wood'
}];
pEscala.items = [{
  id: 'i_escala', type: 'item', level: 'l0', layerId: 'furniture',
  libId: 'sofa3', x: 2000, y: 2000, rotation: 0, w: 1400, d: 800, h: 850
}];
pEscala.texts = [{ id: 't_escala', type: 'text', level: 'l0', layerId: 'annotation', text: 'Sala', x: 2000, y: 2000, size: 300, rotation: 0 }];
pEscala.dims = [{ id: 'd_escala', type: 'dim', level: 'l0', layerId: 'dimensions', a: { x: 1000, y: 1000 }, b: { x: 3000, y: 1000 }, offset: 700 }];
pEscala.lines = [
  { id: 'ln_escala', type: 'line', level: 'l0', layerId: 'annotation', a: { x: 1000, y: 2200 }, b: { x: 3000, y: 2200 }, color: '#3f6f86', width: 25, style: 'solid' },
  {
    id: 'ln_spline_escala', type: 'curve', level: 'l0', layerId: 'annotation',
    a: { x: 1000, y: 3000 }, b: { x: 3000, y: 3000 },
    curve: { type: 'spline', pts: [{ x: 2000, y: 3400 }] }, color: '#3f6f86', width: 25, style: 'solid'
  }
];
const storeEscala = new ED.Store(pEscala);
const edEscala = new ED.Editor2D(fakeCanvas(900, 650), storeEscala, {});
const antesEscala = plain(storeEscala.project);
storeEscala.setSelection([
  { kind: 'wall', id: 'w_escala' }, { kind: 'item', id: 'i_escala' },
  { kind: 'room', id: 'r_escala' }, { kind: 'text', id: 't_escala' },
  { kind: 'dim', id: 'd_escala' }, { kind: 'line', id: 'ln_escala' },
  { kind: 'line', id: 'ln_spline_escala' }
]);
const aplicados = edEscala.scaleSelection({ x: 0, y: 0 }, 2);
assert.strictEqual(aplicados, 7, 'scaleSelection debe escalar las 7 entidades seleccionadas; aplicó ' + aplicados);
assert.strictEqual(storeEscala.canUndo(), true, 'El escalado debe registrarse en el historial');
const wallEsc = storeEscala.find('wall', 'w_escala');
assert.deepStrictEqual(plain(wallEsc.a), { x: 2000, y: 2000 }, 'El muro debe escalar su extremo A');
assert.deepStrictEqual(plain(wallEsc.b), { x: 6000, y: 2000 }, 'El muro debe escalar su extremo B');
assert.strictEqual(wallEsc.openings[0].width, 1800, 'El ancho de la abertura debe escalar con el muro');
const itemEsc = storeEscala.find('item', 'i_escala');
assert.strictEqual(itemEsc.x, 4000, 'La posición X del mueble debe escalar');
assert.strictEqual(itemEsc.y, 4000, 'La posición Y del mueble debe escalar');
assert.strictEqual(itemEsc.w, 2800, 'El ancho del mueble debe escalar');
assert.strictEqual(itemEsc.d, 1600, 'El fondo del mueble debe escalar');
assert.deepStrictEqual(plain(storeEscala.find('room', 'r_escala').polygon[2]), { x: 6000, y: 6000 },
  'El polígono del ambiente debe escalar');
const textEsc = storeEscala.find('text', 't_escala');
assert.strictEqual(textEsc.x, 4000, 'La posición X del texto debe escalar');
assert.strictEqual(textEsc.size, 600, 'El tamaño del texto debe escalar');
const dimEsc = storeEscala.find('dim', 'd_escala');
assert.deepStrictEqual(plain(dimEsc.a), { x: 2000, y: 2000 }, 'La cota debe escalar sus extremos');
assert.strictEqual(dimEsc.offset, 1400, 'El desplazamiento de la cota debe escalar');
const lineEsc = storeEscala.find('line', 'ln_escala');
assert.deepStrictEqual(plain(lineEsc.a), { x: 2000, y: 4400 }, 'La línea debe escalar su extremo A');
assert.deepStrictEqual(plain(lineEsc.b), { x: 6000, y: 4400 }, 'La línea debe escalar su extremo B');
assert.deepStrictEqual(plain(storeEscala.find('line', 'ln_spline_escala').curve.pts[0]),
  { x: 4000, y: 6800 }, 'Los puntos de control de la spline deben escalar');
// Un solo deshacer revierte todo el escalado.
storeEscala.undo();
assert.deepStrictEqual(plain(storeEscala.project), ED.Store.normalizeProject(ED.Geo.deepClone(antesEscala)),
  'Un solo deshacer debe revertir todo el escalado');
storeEscala.redo();
assert.strictEqual(storeEscala.find('wall', 'w_escala').a.x, 2000, 'Rehacer debe volver a aplicar el escalado');
// Factores inválidos o sin selección no hacen nada.
storeEscala.setSelection([]);
assert.strictEqual(edEscala.scaleSelection({ x: 0, y: 0 }, 2), 0,
  'Sin selección scaleSelection debe devolver 0');
storeEscala.setSelection([{ kind: 'wall', id: 'w_escala' }]);
const antesInvalidos = plain(storeEscala.project);
assert.strictEqual(edEscala.scaleSelection(null, 2), 0, 'Sin punto base scaleSelection debe devolver 0');
assert.strictEqual(edEscala.scaleSelection({ x: 0, y: 0 }, NaN), 0, 'Un factor NaN debe rechazarse');
assert.strictEqual(edEscala.scaleSelection({ x: 0, y: 0 }, 0), 0, 'Un factor 0 debe rechazarse');
assert.deepStrictEqual(plain(storeEscala.project), antesInvalidos,
  'Los intentos inválidos no deben modificar el proyecto');
// El factor se limita a 0.1..20.
const wallClamp = storeEscala.find('wall', 'w_escala');
const aClamp = plain(wallClamp.a);
edEscala.scaleSelection({ x: 0, y: 0 }, 0.001);
near(storeEscala.find('wall', 'w_escala').a.x, aClamp.x * 0.1, 1e-6,
  'Un factor menor que 0.1 debe limitarse a 0.1');
storeEscala.undo();
edEscala.destroy();
console.log('Escalado 1.6: 6 tipos de entidad, un solo deshacer y límites de factor — OK');

// =====================================================================
// 6) VISTAS EDITABLES: src en las primitivas (CONTRACT §17.5)
// =====================================================================
const proyectoVistas = proyectoNuevo();
proyectoVistas.walls = [
  {
    id: 'w_v1', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 0 }, b: { x: 8000, y: 0 }, thickness: 200, height: 2700,
    openings: [
      { id: 'o_v1', type: 'door', subtype: 'double', t: 0.3, width: 1600, height: 2100, sill: 0, swing: 1, hinge: 1 },
      { id: 'o_v2', type: 'window', subtype: 'sliding', t: 0.7, width: 1400, height: 1400, sill: 900, swing: 1, hinge: 1 }
    ]
  },
  {
    id: 'w_v2', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 0 }, b: { x: 0, y: 5000 }, thickness: 200, height: 2700,
    openings: [{ id: 'o_v3', type: 'garage', subtype: 'sectional', t: 0.5, width: 2400, height: 2200, sill: 0, swing: 1, hinge: 1 }]
  },
  {
    id: 'w_v3', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 5000 }, b: { x: 8000, y: 5000 }, thickness: 200, height: 2700, openings: []
  }
];
proyectoVistas.rooms = [{
  id: 'r_v1', type: 'room', level: 'l0', layerId: 'rooms', name: 'Sala',
  polygon: [{ x: 0, y: 0 }, { x: 8000, y: 0 }, { x: 8000, y: 5000 }, { x: 0, y: 5000 }],
  finish: 'wood'
}];
proyectoVistas.items = [{
  id: 'i_v1', type: 'item', level: 'l0', layerId: 'furniture',
  libId: 'sofa3', x: 4000, y: 2500, rotation: 0, w: 2200, d: 900, h: 850
}];
proyectoVistas.settings.roof = {
  style: 'hip', ridge: 'x', height: 2400, overhang: 500, profile: null,
  structure: { material: 'wood', spacing: 900, depth: 220, width: 130 }
};
const storeVistas = new ED.Store(proyectoVistas);
const idsValidos = {
  wall: storeVistas.project.walls.map(function (w) { return w.id; }),
  item: storeVistas.project.items.map(function (i) { return i.id; }),
  room: storeVistas.project.rooms.map(function (r) { return r.id; })
};
const aberturasPorMuro = {};
storeVistas.project.walls.forEach(function (w) {
  aberturasPorMuro[w.id] = (w.openings || []).map(function (o) { return o.id; });
});
const tiposSrc = {};
let primitivasConSrc = 0;
['front', 'right', 'left', 'sectionX', 'sectionY'].forEach(function (tipo) {
  const vista = ED.Views.build(storeVistas.project, { type: tipo, levelId: 'all' });
  vista.primitives.forEach(function (pr) {
    if (!pr.src) return;
    primitivasConSrc++;
    const src = pr.src;
    assert(['wall', 'opening', 'item', 'roof', 'room'].indexOf(src.kind) >= 0,
      'src.kind desconocido en ' + tipo + ': ' + src.kind);
    assert(typeof src.id === 'string' && src.id.length > 0,
      'src.id vacío en ' + tipo + ' para ' + src.kind);
    tiposSrc[src.kind] = (tiposSrc[src.kind] || 0) + 1;
    if (src.kind === 'wall') {
      assert(idsValidos.wall.indexOf(src.id) >= 0, 'src de muro con id inexistente: ' + src.id);
    } else if (src.kind === 'item') {
      assert(idsValidos.item.indexOf(src.id) >= 0, 'src de mueble con id inexistente: ' + src.id);
    } else if (src.kind === 'room') {
      assert(idsValidos.room.indexOf(src.id) >= 0, 'src de ambiente con id inexistente: ' + src.id);
    } else if (src.kind === 'roof') {
      assert.strictEqual(src.id, 'roof', 'src de techo debe usar id roof');
    } else if (src.kind === 'opening') {
      assert(idsValidos.wall.indexOf(src.wallId) >= 0, 'src de abertura con wallId inexistente: ' + src.wallId);
      assert(aberturasPorMuro[src.wallId].indexOf(src.openingId) >= 0,
        'src de abertura con openingId inexistente: ' + src.openingId);
      assert.strictEqual(src.id, src.openingId, 'El id de la abertura debe coincidir con openingId');
    }
  });
});
assert(primitivasConSrc > 0, 'Las vistas deben incluir primitivas con src');
assert(tiposSrc.wall > 0, 'Las vistas deben tener src de muro');
assert(tiposSrc.opening > 0, 'Las vistas deben tener src de abertura');
assert(tiposSrc.item > 0, 'Las vistas deben tener src de mueble');
assert(tiposSrc.roof > 0, 'Las vistas deben tener src de techo');
assert(tiposSrc.room > 0, 'Las secciones deben tener src de ambiente');
console.log('Vistas editables 1.6: src wall/opening/item/roof/room con ids válidos — OK');

// =====================================================================
// 7) NIVELES: Store.removeLevel (CONTRACT §17.6 y modelo de niveles)
// =====================================================================
const demoNiveles = ED.Templates.demo();
demoNiveles.lines = [{
  id: 'ln_l1', type: 'line', level: 'l1', layerId: 'annotation',
  a: { x: 0, y: 4000 }, b: { x: 2000, y: 4000 }, color: '#3f6f86', width: 25, style: 'solid'
}];
const storeNiveles = new ED.Store(demoNiveles);
const wallsL1 = storeNiveles.project.walls.filter(function (w) { return w.level === 'l1'; }).length;
assert(wallsL1 > 0, 'La demo debe tener muros en el nivel superior para la prueba');
const sheetsL1 = storeNiveles.project.sheets.filter(function (sh) { return sh.levelId === 'l1'; }).length;
const okRemove = storeNiveles.removeLevel('l1');
assert.strictEqual(okRemove, true, 'removeLevel debe eliminar un nivel existente');
assert.strictEqual(storeNiveles.project.levels.length, 1, 'Tras removeLevel debe quedar un nivel');
assert.strictEqual(storeNiveles.project.levels[0].id, 'l0', 'Debe quedar el primer nivel');
assert.strictEqual(storeNiveles.activeLevel, 'l0', 'El nivel activo debe reasignarse al primero');
['walls', 'rooms', 'items', 'texts', 'dims', 'lines'].forEach(function (nombre) {
  const quedan = storeNiveles.project[nombre].filter(function (o) { return o.level === 'l1'; }).length;
  assert.strictEqual(quedan, 0, 'removeLevel no debe dejar ' + nombre + ' del nivel eliminado');
});
storeNiveles.project.sheets.forEach(function (sh) {
  assert.strictEqual(sh.levelId, 'l0', 'Las láminas del nivel eliminado deben reasignarse');
});
assert(sheetsL1 > 0, 'La demo debe tener al menos una lámina en el nivel superior');
assert.strictEqual(storeNiveles.removeLevel('l0'), false,
  'removeLevel no debe permitir quedarse sin niveles');
assert.strictEqual(storeNiveles.project.levels.length, 1, 'El proyecto debe conservar un nivel');
assert.strictEqual(storeNiveles.removeLevel('nivel-inexistente'), false,
  'removeLevel con un id inexistente debe devolver false');
// Eliminar el nivel inferior de una demo nueva reasigna el activo al que queda.
const demoNiveles2 = new ED.Store(ED.Templates.demo());
const okRemoveL0 = demoNiveles2.removeLevel('l0');
assert.strictEqual(okRemoveL0, true, 'removeLevel debe poder eliminar el nivel inferior');
assert.deepStrictEqual(demoNiveles2.project.levels.map(function (l) { return l.id; }), ['l1'],
  'Debe quedar el nivel superior');
assert.strictEqual(demoNiveles2.activeLevel, 'l1', 'El nivel activo debe pasar al que queda');
demoNiveles2.project.sheets.forEach(function (sh) {
  assert.strictEqual(sh.levelId, 'l1', 'Las láminas del nivel eliminado deben reasignarse al que queda');
});
console.log('Niveles 1.6: removeLevel elimina entidades, reasigna láminas y protege el último nivel — OK');

// =====================================================================
// 8) GUARDADO Y APERTURA EN JSON (CONTRACT §17.6)
// =====================================================================
const rutaSamples = path.join(root, 'samples');
const rutaJson = path.join(rutaSamples, 'Residencia-Aurora.json');
const rutaEngdraft = path.join(rutaSamples, 'Residencia-Aurora.engdraft');
assert(fs.existsSync(rutaJson), 'Debe existir samples/Residencia-Aurora.json');
assert(fs.existsSync(rutaEngdraft), 'Debe existir samples/Residencia-Aurora.engdraft');
const textoJson = fs.readFileSync(rutaJson, 'utf8');
const textoEngdraft = fs.readFileSync(rutaEngdraft, 'utf8');
const parsedJson = JSON.parse(textoJson);
assert(parsedJson && typeof parsedJson === 'object', 'La muestra JSON debe ser un objeto');
assert(Array.isArray(parsedJson.levels) && parsedJson.levels.length >= 1,
  'La muestra JSON debe tener niveles');
assert(Array.isArray(parsedJson.walls) && parsedJson.walls.length > 0,
  'La muestra JSON debe tener muros');
assert(Array.isArray(parsedJson.sheets) && parsedJson.sheets.length > 0,
  'La muestra JSON debe tener láminas');
assert(parsedJson.meta && parsedJson.meta.name, 'La muestra JSON debe tener metadatos');

const storeJson = new ED.Store(ED.Templates.create('blank'));
const proyectoImportadoJson = storeJson.importJSON(textoJson);
assert(proyectoImportadoJson.levels.length === parsedJson.levels.length,
  'importJSON debe cargar los niveles de la muestra .json');
assert(proyectoImportadoJson.walls.length === parsedJson.walls.length,
  'importJSON debe cargar los muros de la muestra .json');
assert.strictEqual(storeJson.activeLevel, proyectoImportadoJson.levels[0].id,
  'importJSON debe dejar activo el primer nivel');
assert.deepStrictEqual(plain(proyectoImportadoJson.settings.roof.structure),
  { material: 'none', spacing: 800, depth: 200, width: 120 },
  'Un proyecto JSON antiguo debe recibir la estructura de techo por defecto');
// Se acepta también el contenido .engdraft histórico y un objeto ya parseado.
const storeEng = new ED.Store(ED.Templates.create('blank'));
const proyectoEng = storeEng.importJSON(textoEngdraft);
assert.strictEqual(proyectoEng.walls.length, parsedJson.walls.length,
  'importJSON debe cargar el .engdraft histórico con los mismos muros');
const storeObj = new ED.Store(ED.Templates.create('blank'));
const proyectoObj = storeObj.importJSON(plain(parsedJson));
assert.strictEqual(proyectoObj.walls.length, parsedJson.walls.length,
  'importJSON debe aceptar un objeto de proyecto ya parseado');
// Las aberturas importadas reciben su subtipo por defecto.
proyectoImportadoJson.walls.forEach(function (w) {
  (w.openings || []).forEach(function (o) {
    assert(typeof o.subtype === 'string', 'Toda abertura importada debe tener subtipo');
  });
});
// Los errores de importación son claros.
assert.throws(function () { storeJson.importJSON('{ esto no es json'); }, /JSON válido/,
  'Un JSON inválido debe lanzar un error claro');
assert.throws(function () { storeJson.importJSON('{"levels":[]}'); }, /niveles/,
  'Un proyecto sin niveles debe lanzar un error claro');
// Exportar guarda líneas y estructura de techo.
const pExport = proyectoNuevo();
pExport.lines = [{ id: 'ln_exp', type: 'line', level: 'l0', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } }];
pExport.settings.roof.structure = { material: 'wood', spacing: 750, depth: 220, width: 140 };
const storeExport = new ED.Store(pExport);
const exportado = JSON.parse(storeExport.exportJSON());
assert(Array.isArray(exportado.lines) && exportado.lines.length === 1,
  'exportJSON debe incluir las líneas de dibujo');
assert.deepStrictEqual(exportado.settings.roof.structure,
  { material: 'wood', spacing: 750, depth: 220, width: 140 },
  'exportJSON debe incluir la estructura de techo');
console.log('JSON 1.6: muestras .json/.engdraft válidas, importJSON y export con líneas — OK');

// =====================================================================
// 9) VERSIONES DE LA DOCUMENTACIÓN (README/CONTRACT 1.6)
// =====================================================================
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'CONTRACT.md'), 'utf8');
assert(/EngDraft 1\.6/.test(readme), 'README debe indicar la versión 1.6');
assert(/1\.6/.test(contract), 'CONTRACT debe mencionar la versión 1.6');
assert(/## 17\./.test(contract), 'CONTRACT debe incluir la sección 17 de la ampliación 1.6');
assert(/test-views\.js/.test(readme), 'README debe listar la prueba test-views.js');
assert(/test-import\.js/.test(readme), 'README debe listar la prueba test-import.js');
assert(/Residencia-Aurora\.json/.test(readme) || /\.json/.test(readme),
  'README debe documentar el guardado/ apertura en JSON');
console.log('Versiones 1.6: README y CONTRACT actualizados — OK');

console.log('OK — pruebas de la ampliación 1.6 completadas');

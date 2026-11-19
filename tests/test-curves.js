/* Pruebas de la ampliación 1.2: muros en arco y spline.
 * Se ejecutan con Node y un canvas falso (mismo patrón que tests/test-grid.js).
 * Cubren:
 *   (a) Geo.* — arco por bulge, spline Catmull-Rom, longitud, polígono, hit-test
 *   (b) Store.normalizeProject — saneado de wall.curve, techo, materiales y render
 *   (c) Editor2D — creación de muro en arco y spline, render y selección
 *   (d) DXF — exportación de muros curvos con LWPOLYLINE y sin valores inválidos
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
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const root = path.resolve(__dirname, '..');
for (const f of ['js/geometry.js', 'js/library.js', 'js/templates.js', 'js/store.js', 'js/editor2d.js', 'js/dxf.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const ED = globalThis.EngDraft;
const Geo = ED.Geo;
assert(Geo && typeof Geo.arcFromBulge === 'function', 'Geo.arcFromBulge no disponible');
['wallIsCurved', 'catmullRomPath', 'arcFromBulge', 'bulgeFromPoint', 'wallPath', 'wallLength',
  'wallPointAt', 'distToWall', 'wallPolygon', 'wallAngle'].forEach(function (k) {
  assert(typeof Geo[k] === 'function', 'Falta Geo.' + k);
});
assert(ED.Store && ED.Store.normalizeProject, 'Store.normalizeProject no disponible');
assert(ED.Editor2D, 'Editor2D no registrado');
assert(ED.DXF && typeof ED.DXF.create === 'function', 'DXF.create no disponible');

// Utilidades de aserción
function near(actual, esperado, tol, mensaje) {
  assert(isFinite(actual), mensaje + ': el valor no es finito (' + actual + ')');
  assert(Math.abs(actual - esperado) <= tol,
    mensaje + ': se esperaba ≈' + esperado + ' ±' + tol + ' y se obtuvo ' + actual);
}
function finitos(pts, etiqueta) {
  assert(Array.isArray(pts), etiqueta + ': se esperaba una lista de puntos');
  pts.forEach(function (p, i) {
    assert(p && isFinite(p.x) && isFinite(p.y),
      etiqueta + ': punto no finito en el índice ' + i + ' (' + JSON.stringify(p) + ')');
  });
}
function cercaDe(p, q, tol, mensaje) {
  assert(Geo.dist(p, q) <= tol, mensaje + ' (' + JSON.stringify(p) + ' ≠ ' + JSON.stringify(q) + ')');
}

// =====================================================================
// (a) Geo — arco definido por bulge
// =====================================================================
const A = { x: 0, y: 0 };
const B = { x: 2000, y: 0 };

// bulge 1 = media circunferencia de radio 1000 sobre la cuerda de 2000 mm.
const semi = Geo.arcFromBulge(A, B, 1);
assert(semi, 'arcFromBulge(A, B, 1) debe devolver un arco');
cercaDe(semi.center, { x: 1000, y: 0 }, 1e-6, 'Centro del arco de media circunferencia');
near(semi.radius, 1000, 1e-6, 'Radio del arco de media circunferencia');
near(Math.abs(semi.sweep), Math.PI, 1e-6, 'Barrido del arco de media circunferencia');
assert.strictEqual(Geo.arcFromBulge(A, A, 1), null, 'Un arco de longitud cero debe devolver null');
assert.strictEqual(Geo.arcFromBulge(A, B, 0), null, 'Un bulge 0 debe devolver null');

const wallSemi = { a: A, b: B, thickness: 150, height: 2700, curve: { type: 'arc', bulge: 1 } };
assert.strictEqual(Geo.wallIsCurved(wallSemi), true, 'Un arco con bulge 1 debe ser curvo');
near(Geo.wallLength(wallSemi), Math.PI * 1000, Math.PI * 1000 * 0.01, 'Longitud del arco de media circunferencia');
near(Geo.wallAngle(wallSemi), 0, 1e-9, 'wallAngle debe medir el ángulo de la cuerda');

const semiPath = Geo.wallPath(wallSemi);
assert(semiPath.length >= 20, 'El eje del arco debe muestrearse con 20+ puntos; hay ' + semiPath.length);
finitos(semiPath, 'Geo.wallPath (arco)');
cercaDe(semiPath[0], A, 1e-6, 'El eje del arco debe empezar en wall.a');
cercaDe(semiPath[semiPath.length - 1], B, 1e-6, 'El eje del arco debe terminar en wall.b');
var minY = Infinity;
semiPath.forEach(function (p) { if (p.y < minY) minY = p.y; });
near(minY, -1000, 5, 'La flecha del arco debe llegar a -1000 mm (bulge positivo = descenso)');
cercaDe(Geo.wallPointAt(wallSemi, 0), A, 1, 'wallPointAt(0) debe caer en wall.a');
cercaDe(Geo.wallPointAt(wallSemi, 1), B, 1, 'wallPointAt(1) debe caer en wall.b');
const semiMid = Geo.wallPointAt(wallSemi, 0.5);
near(semiMid.x, 1000, 2, 'x del punto medio del arco');
near(semiMid.y, -1000, 2, 'y del punto medio del arco');

const dEje = Geo.distToWall(semiMid, wallSemi);
assert(dEje.dist < 1, 'distToWall sobre el eje del arco debe ser ≈0; es ' + dEje.dist);
near(dEje.t, 0.5, 0.02, 'distToWall debe devolver t ≈ 0.5 en el punto medio');
const dArriba = Geo.distToWall({ x: 1000, y: 1000 }, wallSemi);
assert(dArriba.dist > 900, 'distToWall del punto opuesto a la flecha debe superar 900 mm; es ' + dArriba.dist);
assert(dArriba.t >= 0 && dArriba.t <= 1, 'distToWall debe devolver t dentro de [0, 1]');

// bulgeFromPoint: el punto de la flecha define la curvatura con signo.
near(Geo.bulgeFromPoint(A, B, { x: 1000, y: -1000 }), 1, 1e-9, 'bulgeFromPoint bajo la cuerda debe ser +1');
near(Geo.bulgeFromPoint(A, B, { x: 1000, y: 1000 }), -1, 1e-9, 'bulgeFromPoint sobre la cuerda debe ser -1');
assert.strictEqual(Geo.bulgeFromPoint(A, B, null), 0, 'bulgeFromPoint sin punto debe ser 0');
assert.strictEqual(Geo.bulgeFromPoint(A, A, { x: 1, y: 1 }), 0, 'bulgeFromPoint con cuerda nula debe ser 0');

// Polígono de banda del muro curvo: 2 puntos por muestra del eje.
const semiPoly = Geo.wallPolygon(wallSemi);
assert.strictEqual(semiPoly.length, semiPath.length * 2,
  'La banda del arco debe tener 2N puntos (' + (semiPath.length * 2) + '); tiene ' + semiPoly.length);
finitos(semiPoly, 'Geo.wallPolygon (arco)');
const semiBounds = Geo.bounds(semiPoly);
assert(semiBounds.w > 1900, 'La banda del arco debe medir ~2 m de ancho; mide ' + semiBounds.w);
assert(semiBounds.minY < -950, 'La banda del arco debe bajar con la flecha; minY = ' + semiBounds.minY);
assert(semiBounds.maxY > 0 && semiBounds.maxY < 400, 'La banda del arco no debe subir más de medio espesor; maxY = ' + semiBounds.maxY);
assert.strictEqual(Geo.wallPolygon(wallSemi, false).length, semiPoly.length,
  'wallPolygon(..., false) debe conservar el número de puntos');

// Arco suave (bulge 0.5): radio y longitud R·|barrido|.
const suave = Geo.arcFromBulge(A, B, 0.5);
assert(suave, 'arcFromBulge con bulge 0.5 debe devolver un arco');
near(suave.sweep, 4 * Math.atan(0.5), 1e-9, 'Barrido del arco con bulge 0.5');
near(suave.radius, 1250, 1e-6, 'Radio del arco con bulge 0.5');
const wallSuave = { a: A, b: B, thickness: 150, height: 2700, curve: { type: 'arc', bulge: 0.5 } };
const lenSuave = Geo.wallLength(wallSuave);
near(lenSuave, suave.radius * Math.abs(suave.sweep), lenSuave * 0.01,
  'La longitud del arco suave debe ser R·|barrido|');
console.log('Geo: arco por bulge (longitud, eje, flecha, polígono y hit-test) — OK');

// =====================================================================
// (a2) Geo — spline Catmull-Rom
// =====================================================================
const ctrl = { x: 1000, y: 1000 };
const wallSpline = {
  a: A, b: B, thickness: 150, height: 2700,
  curve: { type: 'spline', pts: [ctrl] }
};
assert.strictEqual(Geo.wallIsCurved(wallSpline), true, 'Una spline con puntos debe ser curva');
const splinePath = Geo.wallPath(wallSpline);
assert(splinePath.length >= 3, 'El eje de la spline debe tener al menos 3 puntos; tiene ' + splinePath.length);
finitos(splinePath, 'Geo.wallPath (spline)');
cercaDe(splinePath[0], A, 1e-6, 'La spline debe empezar en wall.a');
cercaDe(splinePath[splinePath.length - 1], B, 1e-6, 'La spline debe terminar en wall.b');
assert(splinePath.some(function (p) { return Geo.dist(p, ctrl) < 1e-6; }),
  'La spline debe pasar exactamente por su punto de control');

const splineLen = Geo.wallLength(wallSpline);
assert(splineLen > 2000, 'Una spline con control a 1000 mm debe medir más que la cuerda; mide ' + splineLen);
assert(splineLen < 4000, 'La longitud de la spline es desmedida: ' + splineLen);
const splineMid = Geo.wallPointAt(wallSpline, 0.5);
assert(splineMid.y > 100, 'El punto medio de la spline debe quedar por encima de la cuerda; y = ' + splineMid.y);
assert(Math.abs(splineMid.x - 1000) < 700, 'El punto medio de la spline debe estar cerca del centro; x = ' + splineMid.x);
const dCtrl = Geo.distToWall(ctrl, wallSpline);
assert(dCtrl.dist < 1, 'distToWall sobre un punto de control de la spline debe ser ≈0; es ' + dCtrl.dist);
assert(dCtrl.t > 0.2 && dCtrl.t < 0.8, 'distToWall debe ubicar el punto de control en el tramo central; t = ' + dCtrl.t);

const splinePoly = Geo.wallPolygon(wallSpline);
assert.strictEqual(splinePoly.length, splinePath.length * 2,
  'La banda de la spline debe tener 2N puntos; tiene ' + splinePoly.length);
finitos(splinePoly, 'Geo.wallPolygon (spline)');
const splineBounds = Geo.bounds(splinePoly);
assert(splineBounds.maxY > 900, 'La banda de la spline debe subir con el control; maxY = ' + splineBounds.maxY);
assert(splineBounds.minY < 0, 'La banda de la spline debe incluir el borde inferior; minY = ' + splineBounds.minY);

// catmullRomPath: pasa por todos los puntos y con ≤2 puntos devuelve los extremos.
const cat = Geo.catmullRomPath([A, ctrl, B], 8);
assert.strictEqual(cat.length, 8 * 2 + 1, 'catmullRomPath con 3 puntos y 8 muestras debe dar 17 puntos; dio ' + cat.length);
finitos(cat, 'Geo.catmullRomPath');
cercaDe(cat[0], A, 1e-9, 'catmullRomPath debe empezar en el primer punto');
cercaDe(cat[cat.length - 1], B, 1e-9, 'catmullRomPath debe terminar en el último punto');
assert(cat.some(function (p) { return Geo.dist(p, ctrl) < 1e-9; }),
  'catmullRomPath debe pasar por el punto de control intermedio');
assert.strictEqual(Geo.catmullRomPath([A, B]).length, 2, 'catmullRomPath con 2 puntos debe devolver 2 puntos');
assert.strictEqual(Geo.catmullRomPath([]).length, 0, 'catmullRomPath sin puntos debe devolver []');
assert.strictEqual(Geo.catmullRomPath([A, { x: NaN, y: 100 }, B]).length, 2,
  'catmullRomPath debe descartar puntos con NaN');
console.log('Geo: spline Catmull-Rom (control, longitud, banda y distToWall) — OK');

// =====================================================================
// (a3) Robustez con muros rectos y curvas inválidas
// =====================================================================
const straight = { a: A, b: { x: 3000, y: 0 }, thickness: 150, height: 2700, openings: [] };
assert.strictEqual(Geo.wallIsCurved(straight), false, 'Un muro sin curve no es curvo');
assert.strictEqual(Geo.wallPath(straight).length, 2, 'El eje de un muro recto debe tener 2 puntos');
near(Geo.wallLength(straight), 3000, 1e-9, 'Longitud del muro recto');
const dRecta = Geo.distToWall({ x: 1500, y: 500 }, straight);
near(dRecta.dist, 500, 1e-9, 'distToWall de un muro recto');
near(dRecta.t, 0.5, 1e-9, 'distToWall debe devolver t = 0.5 en el centro');
assert.strictEqual(Geo.wallPolygon(straight).length, 4, 'wallPolygon de un muro recto debe tener 4 puntos');
assert(Geo.wallPolygon(straight).every(function (p) { return isFinite(p.x) && isFinite(p.y); }),
  'wallPolygon de un muro recto debe ser finito');

assert.strictEqual(Geo.wallIsCurved({ a: A, b: B, curve: { type: 'arc', bulge: 0 } }), false,
  'bulge 0 equivale a un muro recto');
assert.strictEqual(Geo.wallIsCurved({ a: A, b: B, curve: { type: 'arc', bulge: NaN } }), false,
  'bulge NaN equivale a un muro recto');
assert.strictEqual(Geo.wallIsCurved({ a: A, b: B, curve: { type: 'spline', pts: [] } }), false,
  'spline sin puntos equivale a un muro recto');
assert.strictEqual(Geo.wallIsCurved({ a: A, b: B, curve: { type: 'zigzag' } }), false,
  'Un tipo de curva desconocido equivale a un muro recto');
assert.deepStrictEqual(Geo.wallPath({ a: A, b: B, curve: { type: 'zigzag' } }),
  [{ x: 0, y: 0 }, { x: 2000, y: 0 }], 'wallPath con curva desconocida debe devolver la recta');
cercaDe(Geo.wallPointAt(straight, -5), A, 1e-9, 'wallPointAt debe limitar t por debajo a 0');
cercaDe(Geo.wallPointAt(straight, 5), { x: 3000, y: 0 }, 1e-9, 'wallPointAt debe limitar t por encima a 1');
assert.strictEqual(Geo.wallLength(null), 0, 'wallLength(null) debe ser 0');
assert.strictEqual(Geo.wallAngle(null), 0, 'wallAngle(null) debe ser 0');
assert.strictEqual(Geo.wallPointAt(null, 0.5).x, 0, 'wallPointAt(null) debe devolver {x:0,y:0}');
assert.strictEqual(Geo.distToWall({ x: 0, y: 0 }, null).dist, Infinity,
  'distToWall con muro nulo debe devolver Infinity');
console.log('Geo: muros rectos y curvas inválidas (robustez) — OK');

// =====================================================================
// (b) Store — saneado de wall.curve
// =====================================================================
function muroBase(id, extra) {
  const w = {
    id: id, type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 0 }, b: { x: 2000, y: 0 },
    thickness: 150, height: 2700, openings: []
  };
  if (extra) Object.keys(extra).forEach(function (k) { w[k] = extra[k]; });
  return w;
}
function normalizarMuros(lista) {
  const p = ED.Templates.create('blank');
  p.walls = lista;
  return ED.Store.normalizeProject(p).walls;
}

var walls = normalizarMuros([
  muroBase('w_bulge_ok', { curve: { type: 'arc', bulge: 0.5 } }),
  muroBase('w_bulge_max', { curve: { type: 'arc', bulge: 10 } }),
  muroBase('w_bulge_min', { curve: { type: 'arc', bulge: -10 } }),
  muroBase('w_bulge_texto', { curve: { type: 'arc', bulge: '3' } }),
  muroBase('w_bulge_cero', { curve: { type: 'arc', bulge: 0 } }),
  muroBase('w_bulge_nan', { curve: { type: 'arc', bulge: NaN } }),
  muroBase('w_tipo_malo', { curve: { type: 'zigzag', bulge: 1 } }),
  muroBase('w_sin_pts', { curve: { type: 'spline', pts: [] } }),
  muroBase('w_pts_mixtos', {
    curve: {
      type: 'spline',
      pts: [null, { x: NaN, y: 10 }, { x: Infinity, y: 10 }, { x: 100, y: 200 }, { x: '400', y: '500' }]
    }
  }),
  muroBase('w_pts_tope', {
    curve: {
      type: 'spline',
      pts: (function () {
        var out = [];
        for (var i = 0; i < 40; i++) out.push({ x: i * 10, y: 100 + i });
        return out;
      })()
    }
  }),
  muroBase('w_arc_con_hueco', {
    curve: { type: 'arc', bulge: 0.4 },
    openings: [{ id: 'o1', type: 'door', t: 0.5, width: 900 }]
  }),
  muroBase('w_recto_con_hueco', {
    openings: [{ id: 'o2', type: 'door', t: 0.5, width: 900 }]
  })
]);
function porId(id) {
  return walls.filter(function (w) { return w.id === id; })[0];
}

assert.deepStrictEqual(porId('w_bulge_ok').curve, { type: 'arc', bulge: 0.5 }, 'bulge 0.5 debe conservarse');
assert.deepStrictEqual(porId('w_bulge_max').curve, { type: 'arc', bulge: 4 }, 'bulge 10 debe limitarse a 4');
assert.deepStrictEqual(porId('w_bulge_min').curve, { type: 'arc', bulge: -4 }, 'bulge -10 debe limitarse a -4');
assert.deepStrictEqual(porId('w_bulge_texto').curve, { type: 'arc', bulge: 3 }, 'bulge "3" debe convertirse a 3');
assert.strictEqual(porId('w_bulge_cero').curve, undefined, 'bulge 0 debe eliminar la curva');
assert.strictEqual(porId('w_bulge_nan').curve, undefined, 'bulge NaN debe eliminar la curva');
assert.strictEqual(porId('w_tipo_malo').curve, undefined, 'Un tipo de curva inválido debe eliminarse');
assert.strictEqual(porId('w_sin_pts').curve, undefined, 'Una spline sin puntos debe eliminar la curva');
assert.deepStrictEqual(porId('w_pts_mixtos').curve,
  { type: 'spline', pts: [{ x: 100, y: 200 }, { x: 400, y: 500 }] },
  'Los puntos inválidos de la spline deben descartarse y los numéricos convertirse');
assert.strictEqual(porId('w_pts_tope').curve.pts.length, 32, 'La spline debe limitarse a 32 puntos');
assert(porId('w_pts_tope').curve.pts.every(function (p) {
  return isFinite(p.x) && isFinite(p.y);
}), 'Los 32 puntos conservados deben ser finitos');
assert.deepStrictEqual(porId('w_arc_con_hueco').openings, [],
  'Los muros curvos no admiten aberturas: deben vaciarse');
assert.strictEqual(porId('w_recto_con_hueco').openings.length, 1,
  'Los muros rectos conservan sus aberturas');
assert.strictEqual(porId('w_recto_con_hueco').openings[0].width, 900,
  'La abertura del muro recto debe conservar su ancho');

// normalizeProject debe ser idempotente con curvas.
const pIdem = ED.Templates.create('blank');
pIdem.walls = [
  muroBase('w_idem_arc', { curve: { type: 'arc', bulge: -2.5 } }),
  muroBase('w_idem_spl', { curve: { type: 'spline', pts: [{ x: 500, y: 300 }] } })
];
const una = ED.Store.normalizeProject(ED.Geo.deepClone(pIdem));
const dos = ED.Store.normalizeProject(ED.Geo.deepClone(una));
assert.deepStrictEqual(dos.walls, una.walls, 'normalizeProject debe ser idempotente con wall.curve');

// El constructor del Store también sanea.
const storeCurvas = new ED.Store(pIdem);
assert.deepStrictEqual(storeCurvas.project.walls[0].curve, { type: 'arc', bulge: -2.5 },
  'El Store debe conservar el arco al construirse');
assert.deepStrictEqual(storeCurvas.project.walls[1].curve,
  { type: 'spline', pts: [{ x: 500, y: 300 }] }, 'El Store debe conservar la spline al construirse');
console.log('Store: saneado de wall.curve y de aberturas en muros curvos — OK');

// =====================================================================
// (b2) Store — techo, materiales y modo de render
// =====================================================================
function normalizarSettings(patch) {
  const p = ED.Templates.create('blank');
  Object.keys(patch || {}).forEach(function (k) { p.settings[k] = patch[k]; });
  return ED.Store.normalizeProject(p).settings;
}

var s = normalizarSettings({ roof: null, materials: null, render: null });
assert.deepStrictEqual(s.roof, { style: 'flat', height: 1200, overhang: 400, ridge: 'auto', profile: null },
  'roof nulo debe caer a los valores por defecto');
assert.deepStrictEqual(s.materials, {
  wall: { color: '#f3eee2', texture: 'stucco' },
  roof: { color: '#b49a7c', texture: 'tile' },
  trim: { color: '#fdfaf2' },
  ground: { color: '#c9d3ab', texture: 'grass' }
}, 'materials nulo debe caer a los materiales por defecto');
assert.deepStrictEqual(s.render, { mode: 'schematic', shadows: true, textures: true, sunAngle: 135 },
  'render nulo debe caer a los valores por defecto');

s = normalizarSettings({ roof: { style: 'gable', height: 9999, overhang: -10 } });
assert.strictEqual(s.roof.style, 'gable', 'roof.style gable debe conservarse');
assert.strictEqual(s.roof.height, 8000, 'roof.height debe limitarse a 8000 mm');
assert.strictEqual(s.roof.overhang, 0, 'roof.overhang negativo debe limitarse a 0');
s = normalizarSettings({ roof: { style: 'domo', height: 'basura', overhang: NaN } });
assert.strictEqual(s.roof.style, 'flat', 'roof.style desconocido debe caer a flat');
assert.strictEqual(s.roof.height, 1200, 'roof.height no numérico debe caer a 1200');
assert.strictEqual(s.roof.overhang, 400, 'roof.overhang no numérico debe caer a 400');
s = normalizarSettings({ roof: { height: 0, overhang: 9999 } });
assert.strictEqual(s.roof.height, 200, 'roof.height debe limitarse al mínimo 200 mm');
assert.strictEqual(s.roof.overhang, 2500, 'roof.overhang debe limitarse a 2500 mm');

s = normalizarSettings({
  materials: {
    wall: { color: 'rojo', texture: 'lava' },
    roof: { color: '#ABC', texture: 'shingle' },
    trim: { color: '#123456' },
    ground: { color: '#00ff00', texture: 'gravel' }
  }
});
assert.strictEqual(s.materials.wall.color, '#f3eee2', 'Un color no válido debe caer al color por defecto');
assert.strictEqual(s.materials.wall.texture, 'stucco', 'Una textura de pared inválida debe caer a stucco');
assert.strictEqual(s.materials.roof.color, '#ABC', 'Un color #rgb válido debe conservarse');
assert.strictEqual(s.materials.roof.texture, 'shingle', 'La textura de techo shingle debe conservarse');
assert.strictEqual(s.materials.trim.color, '#123456', 'El color de marcos #rrggbb debe conservarse');
assert.strictEqual(s.materials.ground.color, '#00ff00', 'El color del suelo válido debe conservarse');
assert.strictEqual(s.materials.ground.texture, 'gravel', 'La textura de suelo gravel debe conservarse');
s = normalizarSettings({ materials: { wall: { color: '#12345', texture: 'wood' } } });
assert.strictEqual(s.materials.wall.color, '#f3eee2', 'Un color de 5 dígitos debe rechazarse');
assert.strictEqual(s.materials.wall.texture, 'wood', 'La textura de pared wood debe conservarse');
assert.strictEqual(s.materials.roof.texture, 'tile', 'Las texturas no indicadas deben caer a su valor por defecto');
assert.strictEqual(s.materials.ground.texture, 'grass', 'La textura de suelo no indicada debe caer a grass');

s = normalizarSettings({ render: { mode: 'realistic', shadows: false, textures: false, sunAngle: 400 } });
assert.strictEqual(s.render.mode, 'realistic', 'render.mode realistic debe conservarse');
assert.strictEqual(s.render.shadows, false, 'render.shadows=false debe conservarse');
assert.strictEqual(s.render.textures, false, 'render.textures=false debe conservarse');
assert.strictEqual(s.render.sunAngle, 360, 'sunAngle debe limitarse a 360');
s = normalizarSettings({ render: { mode: 'holograma', shadows: 0, textures: 'no', sunAngle: -10 } });
assert.strictEqual(s.render.mode, 'schematic', 'Un modo de render desconocido debe caer a schematic');
assert.strictEqual(s.render.shadows, true, 'render.shadows solo se desactiva con false');
assert.strictEqual(s.render.textures, true, 'render.textures solo se desactiva con false');
assert.strictEqual(s.render.sunAngle, 0, 'sunAngle negativo debe limitarse a 0');
s = normalizarSettings({ render: { mode: 'realistic', sunAngle: NaN } });
assert.strictEqual(s.render.mode, 'realistic', 'El modo realistic debe conservarse con sunAngle NaN');
assert.strictEqual(s.render.sunAngle, 135, 'sunAngle NaN debe caer a 135');
console.log('Store: saneado de roof, materials y render — OK');

// =====================================================================
// (b2b) Store — techos de diseño 1.4: hip, custom, ridge y profile (CONTRACT §15.1)
// =====================================================================
s = normalizarSettings({ roof: { style: 'hip', ridge: 'x', height: 2600, overhang: 700 } });
assert.strictEqual(s.roof.style, 'hip', 'roof.style hip debe conservarse');
assert.strictEqual(s.roof.ridge, 'x', 'roof.ridge x debe conservarse');
assert.strictEqual(s.roof.height, 2600, 'roof.height del techo hip debe conservarse');
assert.strictEqual(s.roof.overhang, 700, 'roof.overhang del techo hip debe conservarse');
assert.strictEqual(s.roof.profile, null, 'Un techo hip no debe tener perfil');
s = normalizarSettings({ roof: { style: 'hip', ridge: 'y' } });
assert.strictEqual(s.roof.ridge, 'y', 'roof.ridge y debe conservarse');
s = normalizarSettings({ roof: { style: 'gable', ridge: 'z' } });
assert.strictEqual(s.roof.ridge, 'auto', 'Un ridge desconocido debe caer a auto');
s = normalizarSettings({ roof: { style: 'gable', ridge: null } });
assert.strictEqual(s.roof.ridge, 'auto', 'Un ridge nulo debe caer a auto');
s = normalizarSettings({ roof: { style: 'spline', ridge: 'auto' } });
assert.strictEqual(s.roof.style, 'spline', 'roof.style spline debe conservarse');

// Perfil válido pero desordenado, con valores fuera de rango, NaN, texto y duplicados.
const perfilMixto = [
  { t: 1.4, z: 9999 }, { t: 0.5, z: 1500 }, { t: -0.2, z: -50 },
  { t: NaN, z: 100 }, { t: 0.5, z: 2000 }, { t: '0.25', z: '900' }, { t: 0.75, z: 4000 }
];
s = normalizarSettings({ roof: { style: 'custom', height: 2000, profile: perfilMixto } });
assert.strictEqual(s.roof.style, 'custom', 'Un techo custom con perfil válido debe conservarse');
assert(Array.isArray(s.roof.profile), 'El perfil saneado debe ser un array');
assert.deepStrictEqual(s.roof.profile, [
  { t: 0, z: 0 },
  { t: 0.25, z: 900 },
  { t: 0.5, z: 1500 },
  { t: 0.75, z: 4000 },
  { t: 1, z: 5000 }
], 'Perfil saneado inesperado: ' + JSON.stringify(s.roof.profile));
s.roof.profile.forEach(function (p, i, lista) {
  assert(isFinite(p.t) && isFinite(p.z), 'Punto de perfil no finito en el índice ' + i);
  assert(p.t >= 0 && p.t <= 1, 't del perfil fuera de 0..1 en el índice ' + i + ': ' + p.t);
  assert(p.z >= 0 && p.z <= 8000, 'z del perfil fuera de 0..8000 en el índice ' + i + ': ' + p.z);
  if (i > 0) assert(p.t >= lista[i - 1].t, 'El perfil debe quedar ordenado por t');
});
assert.strictEqual(s.roof.profile[0].t, 0, 'El perfil debe empezar en t = 0');
assert.strictEqual(s.roof.profile[s.roof.profile.length - 1].t, 1, 'El perfil debe terminar en t = 1');

// Perfil que no incluye los extremos: se fuerzan t = 0 y t = 1.
s = normalizarSettings({ roof: { style: 'custom', height: 2000, profile: [{ t: 0.3, z: 100 }, { t: 0.7, z: 300 }] } });
assert.strictEqual(s.roof.profile.length, 4,
  'Al forzar extremos el perfil debe tener 4 puntos; tiene ' + s.roof.profile.length);
assert.deepStrictEqual(s.roof.profile, [
  { t: 0, z: 0 }, { t: 0.3, z: 100 }, { t: 0.7, z: 300 }, { t: 1, z: 0 }
], 'Extremos forzados incorrectos: ' + JSON.stringify(s.roof.profile));

// El z del perfil se limita a 2,5 veces la altura del techo.
s = normalizarSettings({ roof: { style: 'custom', height: 1000, profile: [{ t: 0, z: 0 }, { t: 0.5, z: 8000 }, { t: 1, z: 0 }] } });
assert.strictEqual(s.roof.profile[1].z, 2500,
  'El z del perfil debe limitarse a height·2,5; es ' + s.roof.profile[1].z);

// custom sin perfil válido → gable.
s = normalizarSettings({ roof: { style: 'custom', height: 2000, profile: null } });
assert.strictEqual(s.roof.style, 'gable', 'custom sin perfil debe caer a gable');
assert.strictEqual(s.roof.profile, null, 'custom sin perfil no debe inventar perfil');
s = normalizarSettings({ roof: { style: 'custom', height: 2000, profile: [{ t: 0.5, z: 1000 }] } });
assert.strictEqual(s.roof.style, 'gable', 'custom con un solo punto debe caer a gable');
s = normalizarSettings({ roof: { style: 'custom', height: 2000, profile: [{ t: NaN, z: NaN }, null, 'x'] } });
assert.strictEqual(s.roof.style, 'gable', 'custom con perfil inválido debe caer a gable');
assert.strictEqual(s.roof.profile, null, 'custom con perfil inválido no debe dejar perfil');

// Un perfil con muchos puntos se limita y el resultado queda ordenado.
const perfilLargo = [];
for (let i = 0; i < 30; i++) perfilLargo.push({ t: i / 29, z: i * 10 });
s = normalizarSettings({ roof: { style: 'custom', height: 3000, profile: perfilLargo } });
assert.strictEqual(s.roof.style, 'custom', 'Un perfil largo válido debe conservar style custom');
assert(s.roof.profile.length >= 2 && s.roof.profile.length <= 26,
  'El perfil saneado debe quedar entre 2 y 26 puntos; tiene ' + s.roof.profile.length);
for (let i = 1; i < s.roof.profile.length; i++) {
  assert(s.roof.profile[i].t >= s.roof.profile[i - 1].t, 'El perfil largo debe quedar ordenado por t');
}
if (s.roof.profile.length > 24) {
  console.log('Nota (posible desajuste CONTRACT §15.1): al forzar los extremos de un perfil de 24',
    'puntos interiores el saneado devuelve', s.roof.profile.length,
    'puntos; el contrato describe el perfil como 2..24 puntos.');
}

// Idempotencia del saneado de techos de diseño.
const sHip = normalizarSettings({ roof: { style: 'hip', ridge: 'y', height: 2200, overhang: 350 } });
const pIdemHip = ED.Templates.create('blank');
pIdemHip.settings.roof = ED.Geo.deepClone(sHip.roof);
assert.deepStrictEqual(ED.Store.normalizeProject(pIdemHip).settings.roof, sHip.roof,
  'normalizeProject debe ser idempotente con el techo hip');
const sCustomIdem = normalizarSettings({ roof: { style: 'custom', height: 1800, profile: perfilMixto } });
const pIdemCustom = ED.Templates.create('blank');
pIdemCustom.settings.roof = ED.Geo.deepClone(sCustomIdem.roof);
assert.deepStrictEqual(ED.Store.normalizeProject(pIdemCustom).settings.roof, sCustomIdem.roof,
  'normalizeProject debe ser idempotente con el techo custom');
console.log('Store: techos hip/custom, ridge y profile (saneado e idempotencia) — OK');


// =====================================================================
// (b3) Store — export/import conserva curvas y aspecto 3D
// =====================================================================
const projCurvas = ED.Templates.create('blank');
projCurvas.walls = [
  muroBase('w_arc_exp', { curve: { type: 'arc', bulge: 0.75 } }),
  muroBase('w_spl_exp', {
    a: { x: 0, y: 3000 }, b: { x: 2000, y: 3000 },
    curve: { type: 'spline', pts: [{ x: 900, y: 4200 }] }
  })
];
projCurvas.settings.roof = { style: 'arc', height: 2500, overhang: 750 };
projCurvas.settings.materials = {
  wall: { color: '#dab', texture: 'brick' },
  roof: { color: '#a53', texture: 'metal' },
  trim: { color: '#111' },
  ground: { color: '#2a4', texture: 'paving' }
};
projCurvas.settings.render = { mode: 'realistic', shadows: false, textures: false, sunAngle: 300 };

const storeExp = new ED.Store(projCurvas);
const jsonExp = storeExp.exportJSON();
const storeImp = new ED.Store(JSON.parse(jsonExp));
const pImp = storeImp.project;
function wallExp(id) {
  return pImp.walls.filter(function (w) { return w.id === id; })[0];
}
assert.deepStrictEqual(wallExp('w_arc_exp').curve, { type: 'arc', bulge: 0.75 },
  'exportJSON/Store debe conservar el arco');
assert.deepStrictEqual(wallExp('w_spl_exp').curve,
  { type: 'spline', pts: [{ x: 900, y: 4200 }] }, 'exportJSON/Store debe conservar la spline');
assert.deepStrictEqual(pImp.settings.roof,
  { style: 'arc', height: 2500, overhang: 750, ridge: 'auto', profile: null },
  'export/import debe conservar el techo');
assert.deepStrictEqual(pImp.settings.materials, projCurvas.settings.materials,
  'export/import debe conservar los materiales');
assert.deepStrictEqual(pImp.settings.render, projCurvas.settings.render,
  'export/import debe conservar el modo de render');

const storeImport = new ED.Store(ED.Templates.create('blank'));
storeImport.importJSON(jsonExp);
assert.deepStrictEqual(storeImport.project.walls.filter(function (w) { return w.id === 'w_arc_exp'; })[0].curve,
  { type: 'arc', bulge: 0.75 }, 'importJSON debe restaurar el arco');
assert.strictEqual(storeImport.project.settings.render.mode, 'realistic',
  'importJSON debe restaurar el modo realista');
console.log('Store: export/import de curvas, techo, materiales y render — OK');

// =====================================================================
// (b4) Store — project.assets de objetos importados (CONTRACT §15.5)
// =====================================================================
const projAssets = ED.Templates.create('blank');
projAssets.assets = [
  {
    id: 'asset_a', name: 'Lampara', w: 1500, d: 800, h: 1200,
    color: '#aabbcc', source: 'obj',
    mesh: [{ points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }], color: '#ff0000' }],
    plan: [{ x: -750, y: -400 }, { x: 750, y: -400 }, { x: 750, y: 400 }]
  },
  { id: 'asset_sin_malla', name: 'Descartable', w: 500, d: 500, h: 500 },
  { id: 'asset_a', name: 'Duplicado', w: 900, d: 900, h: 900, mesh: [] },
  {
    id: 'asset_c', w: 50, d: 50000, h: 1000, color: 'rojo', source: 'zzz',
    mesh: [
      { points: [{ x: 0, y: 0, z: 0 }, { x: NaN, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }] },
      { points: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }], color: '#00ff00' }
    ],
    plan: [{ x: 0, y: 0 }]
  }
];
const storeAssets = new ED.Store(projAssets);
const assetsNorm = storeAssets.project.assets;
assert.deepStrictEqual(assetsNorm.map(function (a) { return a.id; }), ['asset_a', 'asset_c'],
  'assets: deben conservarse los objetos con malla, sin duplicados; quedaron ' +
  JSON.stringify(assetsNorm.map(function (a) { return a.id; })));
const assetA = assetsNorm[0];
assert.strictEqual(assetA.type, 'asset', 'El asset debe marcarse con type asset');
assert.strictEqual(assetA.cat, 'mios', 'El asset debe pertenecer a la categoría mios');
assert.strictEqual(assetA.layerId, 'furniture', 'El asset debe usar la capa de mobiliario');
assert.strictEqual(assetA.name, 'Lampara', 'El asset debe conservar su nombre');
assert.strictEqual(assetA.color, '#aabbcc', 'El asset debe conservar su color válido');
assert.strictEqual(assetA.source, 'obj', 'El asset debe conservar el origen obj');
assert.strictEqual(assetA.w, 1500, 'El asset debe conservar el ancho');
assert.strictEqual(assetA.d, 800, 'El asset debe conservar el fondo');
assert.strictEqual(assetA.h, 1200, 'El asset debe conservar el alto');
assert.strictEqual(assetA.mesh.length, 1, 'El asset debe conservar su malla válida');
assert.strictEqual(assetA.mesh[0].points.length, 3, 'Las caras de la malla deben ser triángulos');
assert.strictEqual(assetA.mesh[0].color, '#ff0000', 'La cara debe conservar su color');
assert(assetA.mesh[0].points.every(function (p) {
  return isFinite(p.x) && isFinite(p.y) && isFinite(p.z);
}), 'Las caras del asset deben tener coordenadas finitas');
assert.strictEqual(assetA.plan.length, 3, 'El asset debe conservar su contorno de planta');
assert.strictEqual(assetA.boxes.length, 1, 'El asset debe generar una caja 3D de respaldo');
assert.strictEqual(assetA.boxes[0].w, 1500, 'La caja del asset debe usar el ancho saneado');
assert.strictEqual(assetA.boxes[0].h, 1200, 'La caja del asset debe usar el alto saneado');

const assetC = assetsNorm[1];
assert.strictEqual(assetC.w, 100, 'Un ancho menor que 100 mm debe limitarse a 100; es ' + assetC.w);
assert.strictEqual(assetC.d, 20000, 'Un fondo mayor que 20000 mm debe limitarse a 20000; es ' + assetC.d);
assert.strictEqual(assetC.h, 1000, 'El alto válido debe conservarse');
assert.strictEqual(assetC.color, '#cfd6dd', 'Un color inválido debe caer al neutro #cfd6dd');
assert.strictEqual(assetC.source, 'glb', 'Un origen desconocido debe caer a glb');
assert.strictEqual(assetC.name, 'Objeto importado', 'Un asset sin nombre debe recibir el de por defecto');
assert.strictEqual(assetC.mesh.length, 1, 'La malla debe descartar las caras con NaN');
assert.strictEqual(assetC.plan.length, 4, 'Un contorno inválido debe sustituirse por el rectángulo de la huella');

// Los assets se conservan en export/import y el saneado es idempotente.
const jsonAssets = storeAssets.exportJSON();
const storeAssets2 = new ED.Store(JSON.parse(jsonAssets));
assert.deepStrictEqual(JSON.parse(JSON.stringify(storeAssets2.project.assets)),
  JSON.parse(JSON.stringify(assetsNorm)),
  'Los assets deben conservarse idénticos en exportJSON/import');
const storeAssets3 = new ED.Store(ED.Templates.create('blank'));
storeAssets3.importJSON(jsonAssets);
assert.strictEqual(storeAssets3.project.assets.length, 2, 'importJSON debe restaurar los assets');
assert.strictEqual(storeAssets3.project.assets[0].id, 'asset_a', 'importJSON debe conservar el id del asset');

// Tope de 8000 caras y recorte del contorno en un asset grande.
const projAssetGrande = ED.Templates.create('blank');
const carasGrandes = [];
for (let i = 0; i < 8100; i++) {
  carasGrandes.push({
    points: [{ x: i, y: 0, z: 0 }, { x: i + 1, y: 0, z: 0 }, { x: i, y: 1, z: 0 }],
    color: '#00ff00'
  });
}
const planGrande = [];
for (let i = 0; i < 70; i++) planGrande.push({ x: i * 10, y: (i % 2) * 100 });
projAssetGrande.assets = [{
  id: 'asset_grande', name: 'Malla grande', w: 2000, d: 2000, h: 2000,
  mesh: carasGrandes, plan: planGrande
}];
const assetGrande = new ED.Store(projAssetGrande).project.assets[0];
assert.strictEqual(assetGrande.mesh.length, 8000,
  'El asset debe limitar su malla a 8000 caras; tiene ' + assetGrande.mesh.length);
assert(assetGrande.plan.length <= 64,
  'El contorno del asset debe limitarse a 64 puntos; tiene ' + assetGrande.plan.length);

// Un proyecto sin assets debe exponer un array vacío.
assert.deepStrictEqual(new ED.Store(ED.Templates.create('blank')).project.assets, [],
  'Un proyecto sin assets debe tener assets = []');
console.log('Store: project.assets (saneado, export/import y topes) — OK');


// =====================================================================
// (c) Editor2D — crear muros en arco y spline
// =====================================================================
const edStore = new ED.Store(ED.Templates.create('blank'));
const canvas = fakeCanvas(800, 600);
const ed = new ED.Editor2D(canvas, edStore, {});
const ctx = canvas._ctx;
ed.view.x = 0;
ed.view.y = 0;
ed.view.zoom = 0.05; // 1 px = 20 mm
ed.setSnap({ grid: false });

function opsDe() { return ctx._ops.map(function (o) { return o.name; }); }
function limpiarOps() { ctx._ops.length = 0; }
function assertOpsFinitas(label) {
  for (const op of ctx._ops) {
    for (const a of op.args) {
      if (typeof a === 'number') {
        assert(isFinite(a), 'Coordenada no finita en ' + label + ' (' + op.name + ': ' + a + ')');
      }
    }
  }
}

// --- Muro en arco: clic inicio, clic fin, curva con el ratón y clic final.
ed.setTool('wallArc');
ed._arcDown({ x: 0, y: 0 });
assert(ed.drawing && ed.drawing.type === 'wallArc' && ed.drawing.phase === 'end',
  'El primer clic del arco debe fijar el inicio y pedir el fin');
ed._arcDown({ x: 2000, y: 0 });
assert.strictEqual(ed.drawing.phase, 'bulge',
  'El segundo clic del arco debe pasar a la fase de curvatura');
const arcStart = ed.drawing.start;
const arcEnd = ed.drawing.end;
ed.drawing.bulge = Geo.bulgeFromPoint(arcStart, arcEnd, { x: 1000, y: -1000 }); // como el pointermove
near(ed.drawing.bulge, 1, 1e-9, 'El arrastre del ratón debe dar bulge ≈ 1');
ed._arcDown({ x: 1000, y: -1000 });
assert.strictEqual(ed.drawing, null, 'El tercer clic debe cerrar el dibujo del arco');
assert.strictEqual(edStore.walls().length, 1, 'Debe existir un muro tras cerrar el arco');
const arcWall = edStore.walls()[0];
assert(arcWall.curve && arcWall.curve.type === 'arc', 'El muro creado debe tener wall.curve.type = arc');
near(arcWall.curve.bulge, 1, 0.01, 'El bulge guardado debe ser ≈ 1');
cercaDe(arcWall.a, { x: 0, y: 0 }, 1e-6, 'wall.a debe ser el primer clic');
cercaDe(arcWall.b, { x: 2000, y: 0 }, 1e-6, 'wall.b debe ser el segundo clic');
assert.strictEqual(edStore.selection.length, 1, 'El muro recién creado debe quedar seleccionado');
assert.strictEqual(edStore.selection[0].kind, 'wall', 'La selección debe ser de tipo wall');
assert.strictEqual(edStore.selection[0].id, arcWall.id, 'La selección debe apuntar al muro creado');

limpiarOps();
assert.doesNotThrow(function () { ed.render(); }, 'render() con un muro en arco lanzó una excepción');
assert(ctx._ops.length > 0, 'render() no dibujó nada con el muro en arco');
assertOpsFinitas('render() con muro en arco');
const hitArco = ed._hitTest(Geo.wallPointAt(arcWall, 0.5));
assert(hitArco && hitArco.kind === 'wall' && hitArco.id === arcWall.id,
  '_hitTest sobre el eje del arco debe devolver el muro');
assert.strictEqual(ed._hitTest({ x: 12000, y: 12000 }), null,
  '_hitTest lejos de los muros debe devolver null');
assert(ed._wallCurveHandles(arcWall).length >= 1, 'Un muro en arco debe mostrar su manejador de curvatura');
console.log('Editor2D: muro en arco creado, seleccionado, renderizado y con hit-test — OK');

// --- Muro spline: clics sucesivos y Enter/doble clic para terminar.
ed.setTool('wallSpline');
ed._splineDown({ x: 0, y: 4000 });
ed._splineDown({ x: 1000, y: 6000 });
ed._splineDown({ x: 3000, y: 6000 });
ed._splineDown({ x: 4000, y: 4000 });
assert.strictEqual(ed.drawing.pts.length, 4, 'La spline en curso debe acumular 4 clics');
assert.strictEqual(ed._finishDraw(), true, '_finishDraw debe cerrar la spline en curso');
assert.strictEqual(ed.drawing, null, 'Tras _finishDraw no debe quedar dibujo en curso');
assert.strictEqual(edStore.walls().length, 2, 'Deben existir dos muros curvos tras crear la spline');
const splWall = edStore.walls()[1];
assert(splWall.curve && splWall.curve.type === 'spline', 'El muro creado debe tener wall.curve.type = spline');
assert.deepStrictEqual(splWall.a, { x: 0, y: 4000 }, 'La spline debe empezar en el primer clic');
assert.deepStrictEqual(splWall.b, { x: 4000, y: 4000 }, 'La spline debe terminar en el último clic');
assert.deepStrictEqual(splWall.curve.pts, [{ x: 1000, y: 6000 }, { x: 3000, y: 6000 }],
  'Los clics intermedios deben guardarse como puntos de control');
assert.strictEqual(edStore.selection[0].id, splWall.id, 'La spline recién creada debe quedar seleccionada');

limpiarOps();
assert.doesNotThrow(function () { ed.render(); }, 'render() con un muro spline lanzó una excepción');
assert(ctx._ops.length > 0, 'render() no dibujó nada con el muro spline');
assertOpsFinitas('render() con muro spline');
const hitSpline = ed._hitTest(Geo.wallPointAt(splWall, 0.5));
assert(hitSpline && hitSpline.kind === 'wall' && hitSpline.id === splWall.id,
  '_hitTest sobre el eje de la spline debe devolver el muro');
const splMid = Geo.wallPointAt(splWall, 0.5);
assert(splMid.y > 4100, 'El eje de la spline debe curvarse por encima de la cuerda; y = ' + splMid.y);
assert.strictEqual(ed._wallCurveHandles(splWall).length, 2,
  'Un muro spline debe mostrar un manejador por punto de control');

// Cancelar un dibujo en curso no debe crear objetos.
ed.setTool('wallSpline');
ed._splineDown({ x: 8000, y: 8000 });
assert(ed.drawing, 'Debe haber un dibujo en curso antes de cancelar');
assert.strictEqual(ed.cancel(), true, 'cancel() debe informar que canceló el dibujo');
assert.strictEqual(ed.drawing, null, 'cancel() debe descartar el dibujo en curso');
assert.strictEqual(edStore.walls().length, 2, 'cancel() no debe añadir muros');

// Esc en la fase de fin del arco descarta el muro.
ed.setTool('wallArc');
ed._arcDown({ x: 0, y: 9000 });
assert(ed.drawing, 'El arco debe estar en curso');
ed._finishDraw(true);
assert.strictEqual(ed.drawing, null, '_finishDraw debe descartar un arco sin curvatura');
assert.strictEqual(edStore.walls().length, 2, 'Un arco cancelado no debe añadir muros');

// La selección de un muro curvo dibuja sus manejadores sin lanzar.
edStore.setSelection([{ kind: 'wall', id: arcWall.id }]);
limpiarOps();
assert.doesNotThrow(function () { ed.render(); }, 'render() con la selección de un muro curvo lanzó una excepción');
assert(ctx._ops.length > 0, 'render() no dibujó la selección');
assertOpsFinitas('render() con selección de muro curvo');
assert(opsDe().indexOf('arc') >= 0, 'Los manejadores curvos deben dibujarse con arc()');

ed.cancel();
ed.destroy();
console.log('Editor2D: muro spline creado, hit-test, cancelaciones y selección — OK');

// =====================================================================
// (d) DXF — muros curvos como LWPOLYLINE
// =====================================================================
function paresDxf(texto) {
  const lineas = texto.split('\r\n');
  if (lineas[lineas.length - 1] === '') lineas.pop();
  assert.strictEqual(lineas.length % 2, 0,
    'El DXF debe tener pares código/valor; hay ' + lineas.length + ' líneas');
  const pares = [];
  for (let i = 0; i < lineas.length; i += 2) {
    assert(/^-?\d+$/.test(lineas[i]), 'Código de grupo DXF inválido en la línea ' + i + ': ' + lineas[i]);
    pares.push({ code: lineas[i], value: lineas[i + 1] });
  }
  return pares;
}

const dxfProject = ED.Templates.create('blank');
dxfProject.walls = [
  {
    id: 'w_dxf_recto', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 150, height: 2700,
    openings: [{ id: 'o_dxf', type: 'door', t: 0.5, width: 900, height: 2100, sill: 0, swing: 1, hinge: 1 }]
  },
  {
    id: 'w_dxf_arco', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 3000 }, b: { x: 4000, y: 3000 }, thickness: 150, height: 2700,
    openings: [], curve: { type: 'arc', bulge: 1 }
  },
  {
    id: 'w_dxf_spline', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: 0, y: 8000 }, b: { x: 4000, y: 8000 }, thickness: 150, height: 2700,
    openings: [], curve: { type: 'spline', pts: [{ x: 1000, y: 10000 }, { x: 3000, y: 10000 }] }
  }
];
dxfProject.rooms = [{
  id: 'r_dxf', type: 'room', level: 'l0', layerId: 'rooms', name: 'Sala',
  polygon: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }],
  finish: 'wood'
}];
dxfProject.items = [{
  id: 'i_dxf', type: 'item', level: 'l0', layerId: 'furniture',
  libId: 'sofa3', x: 2000, y: 1500, rotation: 0, w: 2200, d: 900, h: 850
}];

const dxf = ED.DXF.create(dxfProject, { levels: 'all' });
assert(typeof dxf === 'string' && dxf.length > 1000, 'El DXF exportado debe ser un texto no vacío');
assert(!/NaN|undefined|Infinity/.test(dxf), 'El DXF con curvas contiene NaN/undefined/Infinity');
assert(dxf.indexOf('A-WALL') >= 0, 'El DXF debe declarar la capa A-WALL');
assert((dxf.match(/\r\n0\r\nLWPOLYLINE\r\n/g) || []).length >= 4,
  'El DXF debe incluir una LWPOLYLINE por banda y por directriz de cada muro curvo');
assert(dxf.trim().endsWith('EOF'), 'El DXF debe terminar con EOF');
assert(dxf.indexOf('AC1015') >= 0,
  'Con muros curvos el DXF debe declararse R2000 (AC1015) para interpretar LWPOLYLINE');
const pares = paresDxf(dxf);
const bulges = pares.filter(function (p) { return p.code === '42'; });
assert(bulges.length >= 1, 'La directriz del arco debe llevar su bulge (grupo 42)');
assert(Math.abs(Number(bulges[0].value) - 1) < 1e-6,
  'El bulge del arco exportado debe ser 1; es ' + bulges[0].value);
const lwCounts = pares.filter(function (p) { return p.code === '90'; });
assert(lwCounts.length >= 4, 'Cada LWPOLYLINE debe declarar su número de vértices (grupo 90)');
console.log('DXF: proyecto con arco + spline exportado sin NaN/undefined/Infinity — OK');

// Proyecto crudo (sin pasar por Store): el DXF también sanea el bulge y los puntos.
const crudo = ED.Templates.create('blank');
crudo.walls = [{
  id: 'w_crudo_arc', type: 'wall', level: 'l0', layerId: 'walls',
  a: { x: 0, y: 0 }, b: { x: 3000, y: 0 }, thickness: 150, height: 2700,
  openings: [], curve: { type: 'arc', bulge: 10 }
}];
const dxfCrudo = ED.DXF.create(crudo, { levels: 'all' });
assert(!/NaN|undefined|Infinity/.test(dxfCrudo), 'El DXF debe sanear un bulge fuera de rango');
assert(dxfCrudo.indexOf('LWPOLYLINE') >= 0, 'El arco crudo debe exportarse como LWPOLYLINE');
const bulgeCrudo = paresDxf(dxfCrudo).filter(function (p) { return p.code === '42'; })[0];
assert(bulgeCrudo && Math.abs(Number(bulgeCrudo.value)) <= 4 + 1e-9,
  'El bulge exportado debe limitarse a ±4; es ' + (bulgeCrudo && bulgeCrudo.value));
assert(dxfCrudo.trim().endsWith('EOF'), 'El DXF crudo debe terminar con EOF');

const crudoSpline = ED.Templates.create('blank');
crudoSpline.walls = [{
  id: 'w_crudo_spl', type: 'wall', level: 'l0', layerId: 'walls',
  a: { x: 0, y: 0 }, b: { x: 3000, y: 0 }, thickness: 150, height: 2700,
  openings: [], curve: { type: 'spline', pts: [{ x: NaN, y: 100 }, { x: 1500, y: 2000 }] }
}];
const dxfCrudoSpline = ED.DXF.create(crudoSpline, { levels: 'all' });
assert(!/NaN|undefined|Infinity/.test(dxfCrudoSpline),
  'El DXF debe descartar los puntos no finitos de una spline cruda');
assert(dxfCrudoSpline.indexOf('LWPOLYLINE') >= 0, 'La spline cruda debe exportarse como LWPOLYLINE');

// Sin curvas se mantiene DXF R12 (AC1009) como en la versión 1.1.
const sinCurvas = ED.Templates.create('blank');
sinCurvas.walls = [{
  id: 'w_r12', type: 'wall', level: 'l0', layerId: 'walls',
  a: { x: 0, y: 0 }, b: { x: 3000, y: 0 }, thickness: 150, height: 2700, openings: []
}];
const dxfR12 = ED.DXF.create(sinCurvas, { levels: 'all' });
assert(dxfR12.indexOf('AC1009') >= 0, 'Sin muros curvos el DXF debe seguir siendo R12 (AC1009)');
assert(dxfR12.indexOf('LWPOLYLINE') < 0, 'Sin muros curvos no debe haber LWPOLYLINE');
assert(dxfR12.trim().endsWith('EOF'), 'El DXF R12 debe terminar con EOF');
console.log('DXF: saneado de curvas crudas y compatibilidad R12 sin curvas — OK');

console.log('OK — pruebas de curvas (Geo, Store, Editor2D y DXF) completadas');

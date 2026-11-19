/* Pruebas del motor de rejilla configurable del editor 2D de EngDraft.
 * Se ejecutan con Node y un canvas falso: comprueban el ajuste (paso + origen),
 * el saneado de valores inválidos, getGridInfo() y que el render no lance
 * excepciones ni produzca coordenadas NaN.
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
for (const f of ['js/geometry.js', 'js/library.js', 'js/templates.js', 'js/store.js', 'js/editor2d.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const ED = globalThis.EngDraft;
assert(ED.Editor2D, 'Editor2D no registrado');
assert(typeof ED.Geo.clamp === 'function', 'Geo.clamp no disponible');

const project = ED.Templates.demo();
const store = new ED.Store(project);
const canvas = fakeCanvas(800, 600);
const ed = new ED.Editor2D(canvas, store, {});
const ctx = canvas._ctx;
ed.view.x = 0;
ed.view.y = 0;
ed.view.zoom = 0.05; // 1 px = 20 mm

// Utilidades de aserción
function opsDe() { return ctx._ops.map(op => op.name); }
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
function assertInfoFinita(info, label) {
  [info.size, info.major, info.step, info.effectiveSize, info.origin.x, info.origin.y].forEach(function (v, i) {
    assert(typeof v === 'number' && isFinite(v), 'getGridInfo devolvió un valor no finito en ' + label + ' (índice ' + i + ': ' + v + ')');
  });
}

// ------------------------------------------------- (a) rejilla por defecto: 250 mm
const inicial = ed.getGridInfo();
assert.strictEqual(inicial.size, 250, 'La rejilla por defecto debe medir 250 mm; mide ' + inicial.size);
assert.strictEqual(inicial.major, 4, 'La línea maestra por defecto debe ser cada 4 líneas');
assert.strictEqual(inicial.step, 250, 'Sin paso propio, el ajuste debe usar 250 mm');
assert.deepStrictEqual(inicial.origin, { x: 0, y: 0 }, 'El origen por defecto debe ser (0, 0)');
assert.strictEqual(inicial.style, 'lines', 'El estilo por defecto debe ser líneas');
assert.strictEqual(inicial.adaptive, true, 'La rejilla adaptativa debe estar activa por defecto');
assert.strictEqual(inicial.axes, true, 'Los ejes del origen deben mostrarse por defecto');
assertInfoFinita(inicial, 'valores por defecto');

let p = ed.snapPoint({ x: 1234, y: 567 }, { noObject: true });
assert.deepStrictEqual(p.point, { x: 1250, y: 500 }, 'Ajuste por defecto incorrecto: ' + JSON.stringify(p.point));
assert.strictEqual(p.type, 'REJILLA', 'El ajuste por defecto debe informar tipo REJILLA');

// Los objetos siguen teniendo prioridad sobre la rejilla.
const muro = store.walls()[0];
assert(muro, 'La demo debe tener muros en el nivel activo');
const pObj = ed.snapPoint({ x: muro.a.x, y: muro.a.y });
assert.notStrictEqual(pObj.type, 'REJILLA', 'Un vértice de muro debe ganar a la rejilla');
assert.deepStrictEqual(pObj.point, { x: muro.a.x, y: muro.a.y }, 'El vértice de muro debe devolverse exacto');
console.log('Rejilla por defecto: 250 mm, maestra cada 4, ajuste 250 mm — OK');

// ---------------------------------------- (b) ajuste con origen desplazado y tamaño
ed.setSnap({ gridSize: 500, gridMajor: 5, snapStep: 0, gridOrigin: { x: 100, y: -40 } });
let info = ed.getGridInfo();
assert.strictEqual(info.size, 500, 'Tamaño de rejilla con origen: ' + info.size);
assert.strictEqual(info.major, 5, 'Línea maestra con origen: ' + info.major);
assert.strictEqual(info.step, 500, 'El paso debe heredar el tamaño de la rejilla');
assert.deepStrictEqual(info.origin, { x: 100, y: -40 }, 'Origen aplicado con setSnap({gridOrigin})');
p = ed.snapPoint({ x: 1234, y: 567 }, { noObject: true });
assert.deepStrictEqual(p.point, { x: 1100, y: 460 }, 'Ajuste con origen (500 mm) incorrecto: ' + JSON.stringify(p.point));
p = ed.snapPoint({ x: -234, y: -567 }, { noObject: true });
assert.deepStrictEqual(p.point, { x: -400, y: -540 }, 'Ajuste con origen en coordenadas negativas incorrecto: ' + JSON.stringify(p.point));

// La forma individual gridOriginX/gridOriginY (la que usa app.js) da el mismo resultado.
ed.setSnap({ gridOriginX: 100, gridOriginY: -40 });
assert.deepStrictEqual(ed.getGridInfo().origin, { x: 100, y: -40 }, 'gridOriginX/Y individuales no se aplicaron');
console.log('Ajuste con origen y tamaño: OK');

// --------------------------------- (c) paso fino independiente de la rejilla dibujada
ed.setSnap({ gridSize: 250, snapStep: 50, gridOriginX: 0, gridOriginY: 0 });
info = ed.getGridInfo();
assert.strictEqual(info.size, 250, 'Con paso fino, la rejilla debe seguir en 250 mm; está en ' + info.size);
assert.strictEqual(info.step, 50, 'El paso de ajuste debe ser 50 mm; es ' + info.step);
assert.strictEqual(info.effectiveSize, 250, 'effectiveSize debe ser la rejilla realmente dibujada (250)');
p = ed.snapPoint({ x: 1234, y: 567 }, { noObject: true });
assert.deepStrictEqual(p.point, { x: 1250, y: 550 }, 'Ajuste con paso fino incorrecto: ' + JSON.stringify(p.point));

ed.setSnap({ gridOriginX: 25, gridOriginY: -15 });
p = ed.snapPoint({ x: 1234, y: 567 }, { noObject: true });
assert.deepStrictEqual(p.point, { x: 1225, y: 585 }, 'Ajuste paso+origen incorrecto: ' + JSON.stringify(p.point));

// Cambiar la rejilla en caliente (sin recrear el editor) debe surtir efecto de inmediato.
const secuencia = [
  [500, 0, { x: 1000, y: 500 }],
  [100, 0, { x: 1200, y: 600 }],
  [250, 0, { x: 1250, y: 500 }]
];
for (const [size, step, esperado] of secuencia) {
  ed.setSnap({ gridSize: size, snapStep: step, gridOriginX: 0, gridOriginY: 0 });
  p = ed.snapPoint({ x: 1234, y: 567 }, { noObject: true });
  assert.deepStrictEqual(p.point, esperado, 'Cambio de rejilla a ' + size + ' mm sin reinicio: ' + JSON.stringify(p.point));
}
console.log('Ajuste con paso fino y cambios en caliente: OK');

// ------------------------------------- (d) valores inválidos saneados, nunca NaN
ed.setSnap({ gridSize: 0, gridMajor: 0, snapStep: -5, gridOriginX: NaN, gridOriginY: 'x' });
info = ed.getGridInfo();
assertInfoFinita(info, 'saneado de grid inválido');
assert.strictEqual(info.size, 250, 'grid=0 debe caer a 250 mm; quedó ' + info.size);
assert.strictEqual(info.major, 4, 'gridMajor=0 debe caer a 4; quedó ' + info.major);
assert.strictEqual(info.step, 250, 'snapStep negativo debe caer al tamaño de rejilla; quedó ' + info.step);
assert.deepStrictEqual(info.origin, { x: 0, y: 0 }, 'Origen NaN/texto debe sanearse a 0');
p = ed.snapPoint({ x: 1234, y: 567 }, { noObject: true });
assert.deepStrictEqual(p.point, { x: 1250, y: 500 }, 'Snap tras saneado incorrecto: ' + JSON.stringify(p.point));

ed.setSnap({ gridSize: NaN, gridMajor: Infinity, snapStep: NaN, gridOriginX: Infinity, gridOriginY: -Infinity });
info = ed.getGridInfo();
assertInfoFinita(info, 'saneado de NaN/Infinity');
assert.strictEqual(info.size, 250, 'grid=NaN debe caer a 250 mm');
assert.strictEqual(info.major, 4, 'gridMajor=Infinity debe caer a 4');
assert.strictEqual(info.step, 250, 'snapStep=NaN debe caer al tamaño de rejilla');
assert.deepStrictEqual(info.origin, { x: 0, y: 0 }, 'Origen Infinity debe sanearse a 0');

ed.setSnap({ gridSize: -100, gridMajor: -3, snapStep: -0.1, gridOriginX: 1e12, gridOriginY: -1e12 });
info = ed.getGridInfo();
assertInfoFinita(info, 'saneado de negativos y desbordes');
assert.strictEqual(info.size, 250, 'grid negativo debe caer a 250 mm');
assert.strictEqual(info.major, 4, 'gridMajor negativo debe caer a 4');
assert.deepStrictEqual(info.origin, { x: 1e7, y: -1e7 }, 'El origen debe limitarse a ±1e7 mm');
p = ed.snapPoint({ x: 1234, y: 567 }, { noObject: true });
assert(isFinite(p.point.x) && isFinite(p.point.y), 'El snap con origen desbordado produjo NaN');

ed.setSnap({ gridSize: 0.2, gridMajor: 99, snapStep: 0.0001 });
info = ed.getGridInfo();
assertInfoFinita(info, 'saneado de extremos');
assert.strictEqual(info.size, 1, 'grid por debajo de 1 mm debe limitarse a 1 mm; quedó ' + info.size);
assert.strictEqual(info.major, 50, 'gridMajor por encima de 50 debe limitarse a 50; quedó ' + info.major);
assert.strictEqual(info.step, 0.5, 'snapStep por debajo de 0.5 mm debe limitarse a 0.5 mm; quedó ' + info.step);

ed.setSnap({ gridMajor: 1 });
assert.strictEqual(ed.getGridInfo().major, 4, 'gridMajor=1 (menor que 2) debe caer al valor por defecto 4');
ed.setSnap({ gridStyle: 'zigzag', gridAdaptive: 0, showAxes: null });
info = ed.getGridInfo();
assert.strictEqual(info.style, 'lines', 'Un gridStyle desconocido debe caer a líneas');
assert.strictEqual(info.adaptive, true, 'Solo el valor false desactiva la rejilla adaptativa');
assert.strictEqual(info.axes, true, 'Solo el valor false oculta los ejes');
assert.strictEqual(ed.setSnap(null), undefined, 'setSnap(null) no debe lanzar excepciones');
console.log('Saneado de valores inválidos: OK');

// ------------------------------------ (e/f) estilo de puntos, adaptativa y getGridInfo
ed.setSnap({ gridSize: 100, gridMajor: 5, snapStep: 0, gridOriginX: 0, gridOriginY: 0, gridStyle: 'dots', gridAdaptive: true, showAxes: true });
ed.view.zoom = 0.05;
info = ed.getGridInfo();
assert.strictEqual(info.style, 'dots', 'getGridInfo debe informar el estilo de puntos');
assert.strictEqual(info.effectiveSize, 200, 'Con zoom 0.05 (100 mm = 5 px) la rejilla adaptativa se agrupa a 200 mm');
ed.view.zoom = 0.002;
assert.strictEqual(ed.getGridInfo().effectiveSize, 6400, 'La rejilla adaptativa debe agruparse al alejar el zoom');
ed.setSnap({ gridAdaptive: false });
assert.strictEqual(ed.getGridInfo().effectiveSize, 100, 'Sin rejilla adaptativa, effectiveSize no debe cambiar');

// La rejilla de puntos dibuja rectángulos rellenos; la de líneas, trazos.
ed.view.zoom = 0.05;
ed.setSnap({ gridSize: 250, snapStep: 0, gridStyle: 'dots', gridAdaptive: false, showAxes: false });
limpiarOps();
ed._drawGrid();
let nombres = opsDe();
assert(nombres.indexOf('rect') >= 0, 'La rejilla de puntos debe usar rect() para los puntos');
assert(nombres.indexOf('fill') >= 0, 'La rejilla de puntos debe rellenar los puntos');
assert(nombres.indexOf('moveTo') < 0, 'La rejilla de puntos no debe dibujar líneas');
assertOpsFinitas('_drawGrid con puntos');

ed.setSnap({ gridStyle: 'lines' });
limpiarOps();
ed._drawGrid();
nombres = opsDe();
assert(nombres.indexOf('moveTo') >= 0, 'La rejilla de líneas debe usar moveTo()');
assert(nombres.indexOf('lineTo') >= 0, 'La rejilla de líneas debe usar lineTo()');
assert(nombres.indexOf('stroke') >= 0, 'La rejilla de líneas debe trazar el camino');
assert(nombres.indexOf('rect') < 0, 'La rejilla de líneas no debe dibujar puntos');
assertOpsFinitas('_drawGrid con líneas');

// Los ejes del origen añaden exactamente dos líneas (una horizontal y otra vertical).
ed.setSnap({ showAxes: false });
limpiarOps();
ed._drawGrid();
const sinEjes = opsDe().filter(n => n === 'moveTo').length;
ed.setSnap({ showAxes: true });
limpiarOps();
ed._drawGrid();
const conEjes = opsDe().filter(n => n === 'moveTo').length;
assert.strictEqual(conEjes, sinEjes + 2, 'showAxes debe añadir los dos ejes del origen (' + sinEjes + ' → ' + conEjes + ')');
console.log('Estilo de puntos, rejilla adaptativa y getGridInfo: OK');

// ------------------------------------------ (g) render completo en una vista 800x600
function renderCaso(label, patch, zoom) {
  ed.setSnap(patch);
  ed.view.x = 0;
  ed.view.y = 0;
  ed.view.zoom = zoom;
  limpiarOps();
  assert.doesNotThrow(function () { ed.render(); }, 'render() lanzó una excepción: ' + label);
  assert(ctx._ops.length > 0, 'render() no dibujó nada: ' + label);
  assertOpsFinitas(label);
  assert.strictEqual(ed.w, 800, 'El lienzo debe medir 800 px de ancho en ' + label);
  assert.strictEqual(ed.h, 600, 'El lienzo debe medir 600 px de alto en ' + label);
}

renderCaso('líneas + adaptativa + ejes', { gridSize: 250, gridMajor: 4, snapStep: 50, gridOriginX: 125, gridOriginY: -80, gridStyle: 'lines', gridAdaptive: true, showAxes: true }, 0.05);
renderCaso('puntos + adaptativa + ejes', { gridSize: 100, gridMajor: 5, snapStep: 0, gridOriginX: 0, gridOriginY: 0, gridStyle: 'dots', gridAdaptive: true, showAxes: true }, 0.05);
renderCaso('puntos sin adaptativa ni ejes (zoom lejano)', { gridSize: 100, gridMajor: 2, snapStep: 10, gridOriginX: -500, gridOriginY: 500, gridStyle: 'dots', gridAdaptive: false, showAxes: false }, 0.002);
renderCaso('líneas sin adaptativa (zoom lejano)', { gridSize: 250, gridMajor: 10, snapStep: 0, gridStyle: 'lines', gridAdaptive: false, showAxes: true }, 0.002);
renderCaso('rejilla densa de 5 mm', { gridSize: 5, gridMajor: 2, snapStep: 1, gridStyle: 'dots', gridAdaptive: false, showAxes: true }, 0.8);
console.log('Render completo 800x600 en 5 configuraciones: OK');

// ------------------------------------------- arrastre ajustado al paso y al origen
const item = {
  id: 'i_grid_test', type: 'item', level: store.activeLevel, layerId: 'furniture',
  libId: 'sofa3', x: 1000, y: 1000, rotation: 0, w: 2200, d: 900, h: 850
};
store.project.items.push(item);
ed.view.x = 0;
ed.view.y = 0;
ed.view.zoom = 0.05;

ed.setSnap({ grid: true, gridSize: 250, gridMajor: 4, snapStep: 50, gridOriginX: 125, gridOriginY: -80 });
store.historyBegin('Mover objeto (prueba)');
ed.drag = {
  kind: 'item', obj: item, orig: JSON.parse(JSON.stringify(item)), mode: 'move',
  startWorld: { x: 1000, y: 1000 }, startAngle: 0, moved: false, startCursor: { x: 0, y: 0 }
};
ed._dragMove({ x: 1400, y: 1310 }, false);
assert.strictEqual(item.x, 1425, 'Arrastre X debe ajustarse a paso 50 + origen 125; quedó ' + item.x);
assert.strictEqual(item.y, 1320, 'Arrastre Y debe ajustarse a paso 50 + origen -80; quedó ' + item.y);
store.historyCancel();
ed.drag = null;

// Con la rejilla desactivada el arrastre es libre.
ed.setSnap({ grid: false });
item.x = 1000; item.y = 1000;
ed.drag = {
  kind: 'item', obj: item, orig: JSON.parse(JSON.stringify(item)), mode: 'move',
  startWorld: { x: 1000, y: 1000 }, startAngle: 0, moved: false, startCursor: { x: 0, y: 0 }
};
ed._dragMove({ x: 1400, y: 1310 }, false);
assert.strictEqual(item.x, 1400, 'Sin rejilla el arrastre no debe ajustarse en X; quedó ' + item.x);
assert.strictEqual(item.y, 1310, 'Sin rejilla el arrastre no debe ajustarse en Y; quedó ' + item.y);
store.historyCancel();
ed.drag = null;
ed.setSnap({ grid: true });
console.log('Arrastre ajustado a paso + origen: OK');

// --------------------------------------------------------------- limpieza final
ed.cancel();
ed.destroy();
console.log('OK — pruebas de rejilla configurable completadas');

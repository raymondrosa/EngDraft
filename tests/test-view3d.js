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

for (const preset of ['iso', 'top', 'front', 'rear', 'right', 'left']) {
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
console.log('View3D: 6 presets renderizados sin excepciones');

// =====================================================================
// Ampliación 1.2: techos, modo realista, materiales y vuelo de dron
// =====================================================================
// Proyecto con muro recto + muro en arco + muro spline, en una zona libre
// al oeste de la vivienda de la demo.
const proyectoCurvo = ED.Templates.demo();
proyectoCurvo.walls.push(
  {
    id: 'w_test_recto', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: -8000, y: 2000 }, b: { x: -2000, y: 2000 },
    thickness: 150, height: 2700, openings: []
  },
  {
    id: 'w_test_arco', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: -8000, y: 4000 }, b: { x: -2000, y: 4000 },
    thickness: 150, height: 2700, openings: [], curve: { type: 'arc', bulge: 1 }
  },
  {
    id: 'w_test_spline', type: 'wall', level: 'l0', layerId: 'walls',
    a: { x: -8000, y: 6000 }, b: { x: -2000, y: 6000 },
    thickness: 150, height: 2700, openings: [],
    curve: { type: 'spline', pts: [{ x: -6000, y: 7500 }, { x: -4000, y: 7500 }] }
  }
);
const storeCurvo = new ED.Store(proyectoCurvo);
assert.strictEqual(storeCurvo.project.walls.filter(w => w.curve).length, 2,
  'El proyecto de prueba debe tener dos muros curvos');

const erroresInternos = [];
const consoleErrorOriginal = console.error;
function casos3D() {
  const estilos = ['flat', 'gable', 'arc', 'spline'];
  const materiales = {
    wall: { color: '#ddccbb', texture: 'brick' },
    roof: { color: '#aa5533', texture: 'tile' },
    trim: { color: '#ffffff' },
    ground: { color: '#99aa77', texture: 'grass' }
  };
  for (const estilo of estilos) {
    const canvas = fakeCanvas(1000, 700);
    const v = new ED.View3D(canvas, { store: storeCurvo });
    v.setOptions({
      roof: true, roofStyle: estilo, renderMode: 'realistic',
      roofHeight: 1500, roofOverhang: 500,
      materials: materiales, textures: true, shadows: true, sunAngle: 200
    });
    v.resize();
    v.fit();
    v.render();
    const info = v.getRenderInfo();
    assert.strictEqual(info.mode, 'realistic', 'getRenderInfo debe informar modo realista con techo ' + estilo);
    assert.strictEqual(info.roofStyle, estilo, 'getRenderInfo debe informar el techo ' + estilo + '; informa ' + info.roofStyle);
    assert.strictEqual(info.textures, true, 'getRenderInfo debe informar texturas activas con techo ' + estilo);
    assert.strictEqual(info.shadows, true, 'getRenderInfo debe informar sombras activas con techo ' + estilo);
    assert.strictEqual(info.sunAngle, 200, 'getRenderInfo debe informar sunAngle 200 con techo ' + estilo);
    assert(info.faces > 0, 'getRenderInfo debe contar caras con techo ' + estilo + '; contó ' + info.faces);
    assert.strictEqual(info.flying, false, 'getRenderInfo no debe marcar vuelo antes de empezar');
    const shot = v.screenshot();
    assert(typeof shot === 'string' && shot.startsWith('data:image/png'),
      'screenshot inválido con modo realista y techo ' + estilo);
    v.destroy();
  }

  // Modo esquemático con techo a dos aguas: no debe lanzar y conserva la paleta.
  const canvasEsq = fakeCanvas(1000, 700);
  const vEsq = new ED.View3D(canvasEsq, { store: storeCurvo });
  vEsq.setOptions({ roof: true, roofStyle: 'gable', renderMode: 'schematic', sunAngle: 90 });
  vEsq.render();
  const infoEsq = vEsq.getRenderInfo();
  assert.strictEqual(infoEsq.mode, 'schematic', 'getRenderInfo debe informar modo esquemático');
  assert.strictEqual(infoEsq.roofStyle, 'gable', 'El techo a dos aguas debe funcionar también en esquemático');
  assert(infoEsq.faces > 0, 'El modo esquemático debe generar caras');
  assert(vEsq.screenshot().startsWith('data:image/png'),
    'screenshot del modo esquemático no devolvió PNG');
  // Captura de alta resolución (escala 2) del proyecto con muros curvos.
  const shot2 = vEsq.screenshot(2);
  assert(typeof shot2 === 'string' && shot2.startsWith('data:image/png'),
    'screenshot(2) del proyecto con muros curvos no devolvió PNG');
  vEsq.destroy();
  return estilos.length;
}
let casos = 0;
console.error = function () {
  erroresInternos.push(Array.prototype.slice.call(arguments).map(String).join(' '));
};
try {
  casos = casos3D();
} finally {
  console.error = consoleErrorOriginal;
}
assert.strictEqual(erroresInternos.length, 0,
  'render()/screenshot() registraron errores internos con muros curvos: ' + erroresInternos.join(' | '));
console.log('View3D: 4 estilos de techo en modo realista + esquemático — OK');

// Vuelo de dron: arranca, informa el estado y se detiene sin excepciones.
let vueloOk = 0;
console.error = function () {
  erroresInternos.push(Array.prototype.slice.call(arguments).map(String).join(' '));
};
erroresInternos.length = 0;
try {
  for (const estilo of ['flat', 'gable', 'arc', 'spline']) {
    const canvas = fakeCanvas(900, 650);
    const v = new ED.View3D(canvas, { store: storeCurvo });
    v.setOptions({ roof: true, roofStyle: estilo, renderMode: 'realistic' });
    v.render();
    assert.strictEqual(v.isFlying(), false, 'No debe estar volando antes de startFlight()');
    assert.strictEqual(v.startFlight({ duration: 3000 }), v, 'startFlight debe devolver el propio View3D');
    assert.strictEqual(v.isFlying(), true, 'isFlying debe ser true tras startFlight() con techo ' + estilo);
    assert.strictEqual(v.getRenderInfo().flying, true, 'getRenderInfo debe marcar vuelo activo con techo ' + estilo);
    assert.doesNotThrow(function () { v.render(); }, 'render() durante el vuelo no debe lanzar (techo ' + estilo + ')');
    assert.doesNotThrow(function () { v.screenshot(); }, 'screenshot() durante el vuelo no debe lanzar (techo ' + estilo + ')');
    assert.strictEqual(v.stopFlight(), v, 'stopFlight debe devolver el propio View3D');
    assert.strictEqual(v.isFlying(), false, 'isFlying debe ser false tras stopFlight() con techo ' + estilo);
    assert.strictEqual(v.getRenderInfo().flying, false, 'getRenderInfo no debe marcar vuelo tras stopFlight()');
    assert.doesNotThrow(function () { v.stopFlight(); }, 'stopFlight() debe tolerar que no haya vuelo');
    // Volver a iniciar sustituye al vuelo anterior sin lanzar.
    v.startFlight({ duration: 3000 });
    assert.strictEqual(v.isFlying(), true, 'El vuelo debe poder reiniciarse');
    v.startFlight({ duration: 4000 });
    assert.strictEqual(v.isFlying(), true, 'startFlight debe reiniciar un vuelo en curso');
    v.stopFlight();
    assert.strictEqual(v.isFlying(), false, 'stopFlight debe detener un vuelo reiniciado');
    v.destroy();
    assert.strictEqual(v.isFlying(), false, 'destroy() debe detener el vuelo');
    vueloOk++;
  }
} finally {
  console.error = consoleErrorOriginal;
}
assert.strictEqual(vueloOk, 4, 'El vuelo de dron debe probarse con los 4 estilos de techo');
assert.strictEqual(erroresInternos.length, 0,
  'startFlight/stopFlight registraron errores internos: ' + erroresInternos.join(' | '));
console.log('View3D: vuelo de dron (start/isFlying/stop/destroy) con 4 techos — OK');

// Las opciones heredan de project.settings cuando no se pasan a setOptions.
const proyectoTema = ED.Templates.demo();
proyectoTema.settings.roof = { style: 'spline', height: 2400, overhang: 900 };
proyectoTema.settings.materials = {
  wall: { color: '#eeddcc', texture: 'stone' },
  roof: { color: '#884422', texture: 'metal' },
  trim: { color: '#ffeeee' },
  ground: { color: '#77aa55', texture: 'gravel' }
};
proyectoTema.settings.render = { mode: 'realistic', shadows: false, textures: false, sunAngle: 55 };
const canvasTema = fakeCanvas(1000, 700);
const vTema = new ED.View3D(canvasTema, { store: new ED.Store(proyectoTema) });
vTema.render();
const infoTema = vTema.getRenderInfo();
assert.strictEqual(infoTema.mode, 'realistic', 'Sin setOptions debe heredarse render.mode realista del proyecto');
assert.strictEqual(infoTema.roofStyle, 'spline', 'Sin setOptions debe heredarse roof.style spline del proyecto');
assert.strictEqual(infoTema.textures, false, 'Sin setOptions debe heredarse render.textures=false');
assert.strictEqual(infoTema.shadows, false, 'Sin setOptions debe heredarse render.shadows=false');
assert.strictEqual(infoTema.sunAngle, 55, 'Sin setOptions debe heredarse render.sunAngle del proyecto');
// setOptions puede forzar un modo distinto al del proyecto.
vTema.setOptions({ renderMode: 'schematic', textures: true, roofStyle: 'flat' });
vTema.render();
const infoForzado = vTema.getRenderInfo();
assert.strictEqual(infoForzado.mode, 'schematic', 'setOptions debe poder forzar el modo esquemático');
assert.strictEqual(infoForzado.textures, true, 'setOptions debe poder forzar textures=true');
assert.strictEqual(infoForzado.roofStyle, 'flat', 'setOptions debe poder forzar roofStyle=flat');
// Valores inválidos no deben romper ni dejar NaN en getOptions/getRenderInfo.
assert.doesNotThrow(function () {
  vTema.setOptions({
    renderMode: 'holograma', roofStyle: 'domo', textures: null, shadows: null,
    sunAngle: NaN, roofHeight: 'x', roofOverhang: Infinity, roofColor: 42, roofTexture: 'lava'
  });
}, 'setOptions con valores inválidos no debe lanzar');
const optsInvalidas = vTema.getOptions();
assert.strictEqual(optsInvalidas.renderMode, null, 'Un renderMode inválido debe caer a null (heredar)');
assert.strictEqual(optsInvalidas.roofStyle, null, 'Un roofStyle inválido debe caer a null (heredar)');
vTema.render();
const infoInvalidas = vTema.getRenderInfo();
assert.strictEqual(infoInvalidas.mode, 'realistic', 'Tras un renderMode inválido debe reheredarse el del proyecto');
assert.strictEqual(infoInvalidas.roofStyle, 'spline', 'Tras un roofStyle inválido debe reheredarse el del proyecto');
vTema.destroy();
console.log('View3D: herencia de project.settings y setOptions inválidas — OK');
// =====================================================================
// Ampliación 1.3: mallas poligonales de biblioteca (def.mesh) — CONTRACT §14.1
// =====================================================================
// Cilindro de 22 caras (20 laterales + 2 tapas) generado en memoria con los
// mismos metadatos que admiten las mallas reales (color, edge, twoSided, tex).
function mallaCilindro(radio, altura, lados) {
  const caras = [];
  const abajo = [], arriba = [];
  for (let i = 0; i < lados; i++) {
    const a = Math.PI * 2 * i / lados;
    const x = Math.cos(a) * radio, y = Math.sin(a) * radio;
    abajo.push({ x: x, y: y, z: 0 });
    arriba.push({ x: x, y: y, z: altura });
  }
  for (let i = 0; i < lados; i++) {
    const j = (i + 1) % lados;
    caras.push({ points: [abajo[i], abajo[j], arriba[j], arriba[i]], color: '#8fa6c4' });
  }
  caras.push({ points: abajo.slice().reverse(), color: '#7d94b2' });
  caras.push({ points: arriba.slice(), color: '#9db4d0', edge: true });
  caras[0].twoSided = true;   // ramas opcionales que View3D debe respetar
  caras[1].tex = 'wood';
  caras[2].edge = true;
  return caras;
}
const meshCilindro = mallaCilindro(420, 900, 20);
assert.strictEqual(meshCilindro.length, 22,
  'La malla de prueba debe tener 22 caras; tiene ' + meshCilindro.length);

function defPrueba(id, nombre) {
  return {
    id: id, name: nombre, cat: 'exterior', tags: 'malla prueba temporal',
    w: 1000, d: 1000, h: 1000, color: '#8fa6c4',
    plan: [{ t: 'rect', x: -500, y: -500, w: 1000, h: 1000, r: 20, fill: '#8fa6c4', stroke: '#5b6875' }],
    boxes: [{ x: -500, y: -500, z: 0, w: 1000, d: 1000, h: 900, color: '#8fa6c4' }]
  };
}
const defMallaBase = defPrueba('__mesh_base', 'Cilindro de prueba (cajas)');
const defMallaTest = defPrueba('__mesh_test', 'Cilindro de prueba (malla)');
defMallaTest.mesh = meshCilindro;
ED.Library.items.__mesh_base = defMallaBase;
ED.Library.items.__mesh_test = defMallaTest;
assert.strictEqual(ED.Library.get('__mesh_test').mesh.length, 22,
  'La definición temporal con malla debe quedar registrada en la biblioteca');
assert(!ED.Library.get('__mesh_base').mesh,
  'La definición de control no debe tener malla');

function proyectoConItem(libId) {
  const p = ED.Templates.create('blank');
  p.items = [{
    id: 'i_' + libId, type: 'item', level: 'l0', layerId: 'furniture',
    libId: libId, x: 0, y: 0, rotation: 0, w: 1000, d: 1000, h: 1000
  }];
  return p;
}
function renderProyectoMesh(proyecto, opciones) {
  const canvas = fakeCanvas(1000, 700);
  const v = new ED.View3D(canvas, { store: new ED.Store(proyecto) });
  v.setOptions(Object.assign({
    roof: false, furniture: true, labels: true, ground: true, levels: 'all'
  }, opciones));
  v.render();
  return v;
}

const modosMalla = ['realistic', 'schematic'];
let mallaOk = 0;
erroresInternos.length = 0;
console.error = function () {
  erroresInternos.push(Array.prototype.slice.call(arguments).map(String).join(' '));
};
try {
  for (const modo of modosMalla) {
    const vBase = renderProyectoMesh(proyectoConItem('__mesh_base'), { renderMode: modo });
    const infoBase = vBase.getRenderInfo();
    const shotBase = vBase.screenshot();
    assert(typeof shotBase === 'string' && shotBase.startsWith('data:image/png'),
      'screenshot de control (cajas, ' + modo + ') inválido');
    vBase.destroy();

    const vMalla = renderProyectoMesh(proyectoConItem('__mesh_test'), { renderMode: modo });
    const infoMalla = vMalla.getRenderInfo();
    assert.strictEqual(infoMalla.mode, modo,
      'La malla debe renderizar en modo ' + modo + '; getRenderInfo dice ' + infoMalla.mode);
    assert(infoMalla.faces > 0,
      'getRenderInfo().faces no debe ser 0 con la malla en modo ' + modo);
    assert(infoMalla.faces > infoBase.faces,
      'La malla debe aportar más caras que las cajas en modo ' + modo +
      ' (' + infoMalla.faces + ' vs ' + infoBase.faces + ')');
    const shotMalla = vMalla.screenshot();
    assert(typeof shotMalla === 'string' && shotMalla.startsWith('data:image/png'),
      'screenshot con malla en modo ' + modo + ' no devolvió PNG');
    // Alternar texturas cubre las ramas tex/twoSided/edge de la malla.
    vMalla.setOptions({ textures: true });
    assert.doesNotThrow(function () { vMalla.render(); },
      'render con texturas sobre la malla lanzó una excepción en modo ' + modo);
    vMalla.setOptions({ textures: false });
    assert.doesNotThrow(function () { vMalla.render(); },
      'render sin texturas sobre la malla lanzó una excepción en modo ' + modo);
    vMalla.destroy();
    mallaOk++;
  }
} finally {
  console.error = consoleErrorOriginal;
}
assert.strictEqual(mallaOk, modosMalla.length,
  'La malla debe probarse en modo realista y esquemático; probados ' + mallaOk);
assert.strictEqual(erroresInternos.length, 0,
  'El render de mallas registró errores internos: ' + erroresInternos.join(' | '));
// Limpieza de las definiciones temporales.
delete ED.Library.items.__mesh_base;
delete ED.Library.items.__mesh_test;
assert.strictEqual(ED.Library.get('__mesh_test'), null,
  'La definición temporal con malla debe eliminarse al terminar');
console.log('View3D: malla def.mesh renderizada en realista y esquemático — OK');
console.log('OK — prueba 3D completada');

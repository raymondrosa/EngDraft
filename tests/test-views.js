/* Pruebas del módulo de vistas y secciones (js/views.js) de EngDraft 1.4.
 * Se ejecutan con Node y un canvas falso. Cubren:
 *   (a) ED.Views.TYPES: las 5 vistas del contrato.
 *   (b) build(): bounds y primitivas finitas, no vacías y coherentes con la
 *       geometría, para el proyecto demo y para un proyecto con muros en arco
 *       y spline, aberturas y techos hip/custom.
 *   (c) Secciones: sectionPos por defecto (centro) y explícito.
 *   (d) render(): canvas falso, canvas nulo/roto, sin excepciones ni NaN.
 *   (e) Datos incompletos o inválidos: no lanzan y devuelven una vista válida.
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
    setLineDash: rec('setLineDash'), drawImage: rec('drawImage'),
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return null; },
    measureText(s) { return { width: String(s).length * 6 }; }
  };
}

function fakeCanvas(w, h) {
  const ctx = fakeCtx();
  return {
    width: w, height: h, clientWidth: w, clientHeight: h,
    style: {}, parentElement: { clientWidth: w, clientHeight: h },
    getContext() { return ctx; }, addEventListener() {}, removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: w, height: h }; },
    _ctx: ctx
  };
}

// --------------------------------------------------------------- entorno mínimo
global.window = globalThis;
global.window.devicePixelRatio = 1;
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const root = path.resolve(__dirname, '..');
for (const f of ['js/geometry.js', 'js/templates.js', 'js/store.js', 'js/views.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const ED = globalThis.EngDraft;
assert(ED.Views, 'ED.Views no registrado');
assert(typeof ED.Views.build === 'function', 'Falta ED.Views.build');
assert(typeof ED.Views.render === 'function', 'Falta ED.Views.render');
assert(ED.Store && typeof ED.Store.normalizeProject === 'function', 'Falta Store.normalizeProject');

// Utilidades de aserción
const TIPOS_PRIMITIVA = { poly: 1, line: 1, text: 1 };
const ESTILOS_TECHO = { flat: 1, gable: 1, hip: 1, arc: 1, spline: 1, custom: 1 };
function finito(v, msg) {
  assert(typeof v === 'number' && isFinite(v), msg + ' (valor: ' + v + ')');
}
function assertBounds(view, label) {
  const b = view.bounds;
  assert(b && typeof b === 'object', label + ': falta bounds');
  ['minX', 'minY', 'maxX', 'maxY', 'w', 'h'].forEach(function (k) {
    finito(b[k], label + ': bounds.' + k + ' no finito');
  });
  assert(b.maxX > b.minX && b.maxY > b.minY, label + ': bounds vacío (' + JSON.stringify(b) + ')');
  assert(b.w > 0 && b.h > 0, label + ': bounds sin ancho/alto');
  assert(Math.abs(b.maxX - b.minX - b.w) < 0.02, label + ': bounds.w incoherente');
  assert(Math.abs(b.maxY - b.minY - b.h) < 0.02, label + ': bounds.h incoherente');
}
function assertPrimitivas(view, label) {
  assert(Array.isArray(view.primitives), label + ': primitives no es un array');
  assert(view.primitives.length > 0, label + ': primitives vacío');
  view.primitives.forEach(function (pr, i) {
    assert(pr && typeof pr === 'object', label + ': primitiva ' + i + ' inválida');
    assert(TIPOS_PRIMITIVA[pr.kind], label + ': primitiva ' + i + ' con kind desconocido: ' + (pr && pr.kind));
    assert(Array.isArray(pr.points) && pr.points.length > 0,
      label + ': primitiva ' + i + ' sin points');
    pr.points.forEach(function (p, j) {
      assert(p && isFinite(p.x) && isFinite(p.y),
        label + ': punto no finito ' + j + ' en la primitiva ' + i);
    });
    if (pr.kind === 'text') {
      assert(typeof pr.text === 'string' && pr.text.length > 0,
        label + ': primitiva de texto ' + i + ' sin texto');
      assert(isFinite(pr.size) && pr.size > 0, label + ': primitiva de texto ' + i + ' sin tamaño');
      assert(pr.align == null || ['left', 'center', 'right'].indexOf(pr.align) >= 0,
        label + ': alineación de texto inválida en la primitiva ' + i);
    } else {
      assert(pr.points.length >= 2,
        label + ': primitiva ' + pr.kind + ' ' + i + ' con menos de 2 puntos');
      assert(pr.fill == null || typeof pr.fill === 'string',
        label + ': fill inválido en la primitiva ' + i);
      assert(pr.stroke == null || typeof pr.stroke === 'string',
        label + ': stroke inválido en la primitiva ' + i);
      if (pr.kind === 'poly') {
        assert(pr.closed == null || typeof pr.closed === 'boolean',
          label + ': closed inválido en la primitiva ' + i);
      }
    }
  });
}
function assertVistaCompleta(view, label) {
  assert(view && typeof view === 'object', label + ': la vista no es un objeto');
  assert(typeof view.type === 'string' && view.type, label + ': falta type');
  assert(typeof view.title === 'string' && view.title, label + ': falta title');
  assertBounds(view, label);
  assertPrimitivas(view, label);
  assert(view.meta && typeof view.meta === 'object', label + ': falta meta');
  assert(ESTILOS_TECHO[view.meta.roofStyle], label + ': roofStyle desconocido en meta: ' + (view.meta && view.meta.roofStyle));
  assert.strictEqual(view.meta.primitives, view.primitives.length,
    label + ': meta.primitives no coincide con la lista');
  // bounds debe contener todos los puntos de las primitivas (con margen).
  const b = view.bounds;
  view.primitives.forEach(function (pr) {
    pr.points.forEach(function (p) {
      assert(p.x >= b.minX - 1 && p.x <= b.maxX + 1 && p.y >= b.minY - 1 && p.y <= b.maxY + 1,
        label + ': la primitiva sale de bounds (' + JSON.stringify(p) + ' fuera de ' + JSON.stringify(b) + ')');
    });
  });
}
function tiposDe(view) {
  const out = {};
  view.primitives.forEach(function (pr) { out[pr.kind] = (out[pr.kind] || 0) + 1; });
  return out;
}

// =====================================================================
// (a) ED.Views.TYPES — las 6 vistas actuales (incluye posterior)
// =====================================================================
assert(Array.isArray(ED.Views.TYPES), 'ED.Views.TYPES debe ser un array');
assert.strictEqual(ED.Views.TYPES.length, 6,
  'ED.Views.TYPES debe tener 6 vistas; tiene ' + ED.Views.TYPES.length);
const IDS_ESPERADOS = ['front', 'rear', 'right', 'left', 'sectionX', 'sectionY'];
assert.deepStrictEqual(ED.Views.TYPES.map(function (t) { return t.id; }), IDS_ESPERADOS,
  'Ids de ED.Views.TYPES inesperados: ' + JSON.stringify(ED.Views.TYPES.map(function (t) { return t.id; })));
ED.Views.TYPES.forEach(function (t) {
  assert(typeof t.name === 'string' && t.name.trim(), 'La vista ' + t.id + ' no tiene nombre visible');
});
console.log('Views: 6 tipos de vista registrados (' + IDS_ESPERADOS.join(', ') + ') — OK');

// =====================================================================
// (b) build() con el proyecto demo: todas las vistas
// =====================================================================
const demo = ED.Templates.demo();
const storeDemo = new ED.Store(demo);
assert(storeDemo.project.walls.length > 0, 'La demo debe tener muros');

// Centro de la caja de la demo (para el sectionPos por defecto).
var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
storeDemo.project.walls.forEach(function (w) {
  [w.a, w.b].forEach(function (p) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });
});
const centroDemo = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

const vistasDemo = {};
ED.Views.TYPES.forEach(function (t) {
  const view = ED.Views.build(storeDemo.project, { type: t.id, levelId: 'all' });
  assertVistaCompleta(view, 'demo/' + t.id);
  assert.strictEqual(view.type, t.id, 'build() debe devolver el tipo pedido');
  assert.strictEqual(view.title, t.name, 'El título por defecto debe ser el nombre de la vista');
  assert.strictEqual(view.meta.levelId, 'all', 'levelId debe conservarse en meta');
  const kinds = tiposDe(view);
  assert(kinds.poly > 0, 'La vista ' + t.id + ' debe incluir polígonos de muros/losas');
  assert(kinds.line > 0, 'La vista ' + t.id + ' debe incluir líneas de detalle');
  assert(kinds.text > 0, 'La vista ' + t.id + ' debe incluir etiquetas de texto');
  if (t.id === 'sectionX' || t.id === 'sectionY') {
    finito(view.meta.sectionPos, 'Sección ' + t.id + ' sin sectionPos finito');
    const esperado = t.id === 'sectionX' ? centroDemo.x : centroDemo.y;
    assert(Math.abs(view.meta.sectionPos - esperado) < 1,
      'sectionPos por defecto de ' + t.id + ' debe ser el centro (' + esperado + '); es ' + view.meta.sectionPos);
    assert(typeof view.meta.sectionText === 'string' && view.meta.sectionText.length > 0,
      'Las secciones deben informar su plano de corte en meta.sectionText');
  } else {
    assert.strictEqual(view.meta.sectionPos, null,
      'Las vistas de alzado no deben informar sectionPos');
  }
  vistasDemo[t.id] = view;
});
// Las vistas proyectan ejes distintos: el ancho del alzado frontal y el lateral difieren.
assert.notStrictEqual(vistasDemo.front.bounds.w, vistasDemo.right.bounds.w,
  'Frontal y lateral no deben tener el mismo ancho de encuadre');
console.log('Views: build() de las 5 vistas del demo (bounds, primitivas y centro de sección) — OK');

// =====================================================================
// (c) Proyecto con muros en arco/spline, aberturas y techos hip/custom
// =====================================================================
function proyectoCurvo() {
  const p = ED.Templates.create('blank');
  p.walls = [
    {
      id: 'w_frontal', type: 'wall', level: 'l0', layerId: 'walls',
      a: { x: 0, y: 0 }, b: { x: 6000, y: 0 }, thickness: 200, height: 2700,
      openings: [
        { id: 'o_door', type: 'door', t: 0.25, width: 900, height: 2100, sill: 0 },
        { id: 'o_window', type: 'window', t: 0.6, width: 1200, height: 1200, sill: 900 },
        { id: 'o_garage', type: 'garage', t: 0.85, width: 2400, height: 2200, sill: 0 },
        { id: 'o_pass', type: 'pass', t: 0.45, width: 1200, height: 2200, sill: 0 }
      ]
    },
    {
      id: 'w_izq', type: 'wall', level: 'l0', layerId: 'walls',
      a: { x: 0, y: 0 }, b: { x: 0, y: 4000 }, thickness: 200, height: 2700, openings: []
    },
    {
      id: 'w_der', type: 'wall', level: 'l0', layerId: 'walls',
      a: { x: 6000, y: 0 }, b: { x: 6000, y: 4000 }, thickness: 200, height: 2700, openings: []
    },
    {
      id: 'w_arco', type: 'wall', level: 'l0', layerId: 'walls',
      a: { x: 0, y: 4000 }, b: { x: 6000, y: 4000 }, thickness: 200, height: 2700,
      openings: [], curve: { type: 'arc', bulge: 0.6 }
    },
    {
      id: 'w_spline', type: 'wall', level: 'l0', layerId: 'walls',
      a: { x: 6000, y: 4000 }, b: { x: 9000, y: 1000 }, thickness: 200, height: 2700,
      openings: [], curve: { type: 'spline', pts: [{ x: 7600, y: 3200 }, { x: 8800, y: 2200 }] }
    }
  ];
  p.rooms = [{
    id: 'r1', type: 'room', level: 'l0', layerId: 'rooms', name: 'Sala',
    polygon: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }],
    finish: 'wood'
  }];
  return p;
}

// --- Techo hip (cuatro aguas) con ridge explícito.
const projHip = proyectoCurvo();
projHip.settings.roof = { style: 'hip', ridge: 'x', height: 2500, overhang: 600, profile: null };
const storeHip = new ED.Store(projHip);
assert.strictEqual(storeHip.project.settings.roof.style, 'hip', 'El Store debe conservar el techo hip');
assert.strictEqual(storeHip.project.settings.roof.ridge, 'x', 'El Store debe conservar ridge x');
ED.Views.TYPES.forEach(function (t) {
  const view = ED.Views.build(storeHip.project, { type: t.id, levelId: 'all', sectionPos: 2500 });
  assertVistaCompleta(view, 'hip/' + t.id);
  assert.strictEqual(view.meta.roofStyle, 'hip',
    'La vista ' + t.id + ' debe informar el techo hip; informa ' + view.meta.roofStyle);
  assert(tiposDe(view).poly > 0 || tiposDe(view).line > 0,
    'La vista ' + t.id + ' debe dibujar geometría con el techo hip');
  if (t.id === 'sectionX' || t.id === 'sectionY') {
    assert.strictEqual(view.meta.sectionPos, 2500,
      'sectionPos explícito debe respetarse en ' + t.id + '; es ' + view.meta.sectionPos);
  }
});
console.log('Views: techo hip (cuatro aguas) en las 5 vistas — OK');

// --- Techo custom (perfil barrido) con ridge y sectionPos propios.
const projCustom = proyectoCurvo();
projCustom.settings.roof = {
  style: 'custom', ridge: 'y', height: 2000, overhang: 500,
  profile: [{ t: 0, z: 0 }, { t: 0.25, z: 900 }, { t: 0.5, z: 1600 }, { t: 1, z: 300 }]
};
const storeCustom = new ED.Store(projCustom);
assert.strictEqual(storeCustom.project.settings.roof.style, 'custom', 'El Store debe conservar el techo custom');
assert.strictEqual(storeCustom.project.settings.roof.ridge, 'y', 'El Store debe conservar ridge y');
assert.strictEqual(storeCustom.project.settings.roof.profile.length, 4,
  'El Store debe conservar el perfil del techo custom');
ED.Views.TYPES.forEach(function (t) {
  const view = ED.Views.build(storeCustom.project, { type: t.id, levelId: 'all', sectionPos: 3000 });
  assertVistaCompleta(view, 'custom/' + t.id);
  assert.strictEqual(view.meta.roofStyle, 'custom',
    'La vista ' + t.id + ' debe informar el techo custom; informa ' + view.meta.roofStyle);
  if (t.id === 'sectionX' || t.id === 'sectionY') {
    assert.strictEqual(view.meta.sectionPos, 3000,
      'sectionPos explícito debe respetarse con techo custom en ' + t.id);
  }
});
console.log('Views: techo custom (perfil) en las 5 vistas — OK');

// --- custom sin perfil válido: el Store lo convierte a gable y las vistas lo reflejan.
const projCustomSinPerfil = proyectoCurvo();
projCustomSinPerfil.settings.roof = { style: 'custom', ridge: 'auto', height: 1800, overhang: 400, profile: [] };
const storeCustomSin = new ED.Store(projCustomSinPerfil);
assert.strictEqual(storeCustomSin.project.settings.roof.style, 'gable',
  'Un techo custom sin perfil debe sanearse a gable');
const vistaSinPerfil = ED.Views.build(storeCustomSin.project, { type: 'front', levelId: 'all' });
assertVistaCompleta(vistaSinPerfil, 'custom-sin-perfil/front');
assert.strictEqual(vistaSinPerfil.meta.roofStyle, 'gable',
  'La vista debe reflejar el techo gable saneado; informa ' + vistaSinPerfil.meta.roofStyle);
console.log('Views: techo custom sin perfil → gable (integración con Store) — OK');

// --- sectionPos inválido o fuera de rango no rompe y queda finito.
const corteNaN = ED.Views.build(storeHip.project, { type: 'sectionX', sectionPos: NaN });
assertVistaCompleta(corteNaN, 'sectionX/NaN');
finito(corteNaN.meta.sectionPos, 'sectionPos NaN debe sanearse a un valor finito');
const corteLejos = ED.Views.build(storeHip.project, { type: 'sectionY', sectionPos: 1e9 });
assertVistaCompleta(corteLejos, 'sectionY/lejos');
finito(corteLejos.meta.sectionPos, 'sectionPos fuera de rango debe seguir siendo finito');
console.log('Views: sectionPos por defecto y valores inválidos — OK');

// =====================================================================
// (d) render() con canvas falso, nulo o roto
// =====================================================================
ED.Views.TYPES.forEach(function (t) {
  const canvas = fakeCanvas(900, 600);
  const view = ED.Views.render(canvas, storeHip.project, { type: t.id, levelId: 'all', sectionPos: 2500 });
  assertVistaCompleta(view, 'render/' + t.id);
  assert.strictEqual(view.type, t.id, 'render() debe devolver la vista del tipo pedido');
  assert(canvas.width > 0 && canvas.height > 0, 'render() debe dimensionar el canvas');
  assert(canvas._ctx._ops.length > 0, 'render() no dibujó nada en ' + t.id);
  const nombres = canvas._ctx._ops.map(function (o) { return o.name; });
  assert(nombres.indexOf('fillText') >= 0, 'render() debe escribir la cabecera/rótulo (fillText) en ' + t.id);
  assert(nombres.indexOf('moveTo') >= 0 && nombres.indexOf('lineTo') >= 0,
    'render() debe trazar primitivas (moveTo/lineTo) en ' + t.id);
  canvas._ctx._ops.forEach(function (op) {
    op.args.forEach(function (a) {
      if (typeof a === 'number') finito(a, 'Coordenada no finita en render/' + t.id + ' (' + op.name + ')');
    });
  });
});
// canvas con solo atributos width/height (sin clientWidth).
{
  const ctx = fakeCtx();
  const canvas = { width: 800, height: 500, style: {}, getContext() { return ctx; } };
  const view = ED.Views.render(canvas, storeCustom.project, { type: 'front' });
  assertVistaCompleta(view, 'render/sin-clientWidth');
  assert(canvas.width > 0 && canvas.height > 0, 'render() debe dimensionar un canvas sin clientWidth');
}
// Canvas nulo, sin getContext o con getContext que lanza: devuelven la vista sin lanzar.
const sinCanvas = ED.Views.render(null, storeHip.project, { type: 'front' });
assertVistaCompleta(sinCanvas, 'render/null');
const sinMetodo = ED.Views.render({ width: 400, height: 300 }, storeHip.project, { type: 'sectionX' });
assertVistaCompleta(sinMetodo, 'render/sin-getContext');
const canvasRoto = {
  width: 400, height: 300, clientWidth: 400, clientHeight: 300, style: {},
  getContext() { throw new Error('contexto no disponible'); }
};
let vistaRoto;
assert.doesNotThrow(function () {
  vistaRoto = ED.Views.render(canvasRoto, storeHip.project, { type: 'sectionY' });
}, 'render() debe tolerar un canvas cuyo getContext lanza');
assertVistaCompleta(vistaRoto, 'render/getContext-roto');
console.log('Views: render() con canvas falso, sin clientWidth, nulo y roto — OK');

// =====================================================================
// (e) Datos incompletos o inválidos: nunca lanzan
// =====================================================================
const casos = [
  ['proyecto nulo', null, { type: 'front' }],
  ['proyecto indefinido', undefined, { type: 'sectionX' }],
  ['proyecto vacío', {}, { type: 'front' }],
  ['sin niveles', { levels: [] }, { type: 'sectionY' }],
  ['sin walls/rooms/items', { levels: [{ id: 'l0', name: 'Nivel', height: 2800 }] }, { type: 'front' }],
  ['muro sin espesor ni alto', {
    levels: [{ id: 'l0', name: 'Nivel', height: 2800 }],
    walls: [{ id: 'w', type: 'wall', level: 'l0', a: { x: 0, y: 0 }, b: { x: 3000, y: 0 } }]
  }, { type: 'front' }],
  ['coordenadas NaN', {
    levels: [{ id: 'l0', name: 'Nivel', height: 2800 }],
    walls: [{ id: 'w', type: 'wall', level: 'l0', a: { x: NaN, y: 0 }, b: { x: 3000, y: NaN }, thickness: 150, height: 2700 }]
  }, { type: 'sectionX' }],
  ['tipo de vista desconocido', storeHip.project, { type: 'inventada' }],
  ['levelId inexistente', storeHip.project, { type: 'front', levelId: 'nivel-que-no-existe' }]
];
casos.forEach(function (caso) {
  const label = caso[0];
  let view;
  assert.doesNotThrow(function () {
    view = ED.Views.build(caso[1], caso[2]);
  }, 'build() no debe lanzar con ' + label);
  assert(view && typeof view === 'object', 'build() debe devolver un objeto con ' + label);
  assert(typeof view.type === 'string' && view.type, 'La vista de ' + label + ' debe tener type');
  assertBounds(view, 'incompleto/' + label);
  // Las primitivas pueden ser una etiqueta de respaldo, pero nunca vacías ni NaN.
  assertPrimitivas(view, 'incompleto/' + label);
});
// Un tipo desconocido cae en la primera vista del contrato.
const vistaDesconocida = ED.Views.build(storeHip.project, { type: 'inventada' });
assert.strictEqual(vistaDesconocida.type, 'front',
  'Un tipo de vista desconocido debe caer a front; cayó a ' + vistaDesconocida.type);
console.log('Views: datos incompletos/tipo desconocido no lanzan — OK');

console.log('OK — pruebas de vistas y secciones completadas');

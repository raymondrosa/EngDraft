/* Pruebas del importador de objetos 3D (js/importer.js) de EngDraft 1.4.
 * Se ejecuta en un contexto vm SIN window/document (ni TextDecoder) para probar
 * que el módulo es puro: parse de OBJ y GLB, triángulos, bounds, color, errores
 * claros en español y tope de 8000 triángulos con decimado.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const fuente = fs.readFileSync(path.join(root, 'js', 'importer.js'), 'utf8');

// =====================================================================
// Carga sin DOM: sólo builtins del lenguaje en el contexto vm.
// =====================================================================
const sandbox = { console: console };
vm.createContext(sandbox);
vm.runInContext(fuente, sandbox, { filename: 'js/importer.js' });
const Importer = sandbox.EngDraft && sandbox.EngDraft.Importer;
assert(Importer && typeof Importer.parse === 'function', 'ED.Importer.parse no está disponible');
assert.strictEqual(typeof sandbox.window, 'undefined', 'El importador no debe exigir window');
assert.strictEqual(typeof sandbox.document, 'undefined', 'El importador no debe exigir document');
assert.strictEqual(typeof sandbox.TextDecoder, 'undefined',
  'El contexto de prueba debe carecer de TextDecoder (se prueba el respaldo propio)');
console.log('Importer: cargado en vm sin window/document/TextDecoder — OK');

// En el navegador debe registrarse en window.EngDraft.Importer.
const navegador = { console: console, window: {} };
vm.createContext(navegador);
vm.runInContext(fuente, navegador, { filename: 'js/importer.js' });
assert(navegador.window.EngDraft && navegador.window.EngDraft.Importer &&
  typeof navegador.window.EngDraft.Importer.parse === 'function',
  'El importador debe registrarse en window.EngDraft.Importer');
console.log('Importer: registrado en window.EngDraft.Importer — OK');

assert.strictEqual(Importer.MAX_TRIANGLES, 8000,
  'El tope de triángulos debe ser 8000; es ' + Importer.MAX_TRIANGLES);
assert.strictEqual(Importer.SUPPORTED_FORMATS.join(','), 'glb,gltf,obj',
  'Formatos soportados inesperados: ' + Importer.SUPPORTED_FORMATS.join(','));

// =====================================================================
// Constructores binarios de prueba (Node; no forman parte del módulo)
// =====================================================================
function pad4(n) { return (4 - (n % 4)) % 4; }
function le32(buf, off, v) {
  buf[off] = v & 255; buf[off + 1] = (v >>> 8) & 255;
  buf[off + 2] = (v >>> 16) & 255; buf[off + 3] = (v >>> 24) & 255;
}
function f32(buf, off, v) { new DataView(buf.buffer, buf.byteOffset, buf.byteLength).setFloat32(off, v, true); }
function u16(buf, off, v) { new DataView(buf.buffer, buf.byteOffset, buf.byteLength).setUint16(off, v, true); }

// Agrupa un GLB válido con chunk JSON + BIN.
function buildGlb(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonLen = jsonBytes.length + pad4(jsonBytes.length);
  const binLen = bin ? bin.length + pad4(bin.length) : 0;
  const total = 12 + 8 + jsonLen + (bin ? 8 + binLen : 0);
  const out = Buffer.alloc(total);
  le32(out, 0, 0x46546C67); // 'glTF'
  le32(out, 4, 2);
  le32(out, 8, total);
  let off = 12;
  le32(out, off, jsonLen);
  le32(out, off + 4, 0x4E4F534A); // 'JSON'
  jsonBytes.copy(out, off + 8);
  for (let i = jsonBytes.length; i < jsonLen; i++) out[off + 8 + i] = 0x20;
  off += 8 + jsonLen;
  if (bin) {
    le32(out, off, binLen);
    le32(out, off + 4, 0x004E4942); // 'BIN\0'
    bin.copy(out, off + 8);
  }
  return new Uint8Array(out);
}
function positionsBuffer(lista) {
  const buf = Buffer.alloc(lista.length * 12);
  lista.forEach(function (p, i) {
    f32(buf, i * 12, p[0]); f32(buf, i * 12 + 4, p[1]); f32(buf, i * 12 + 8, p[2]);
  });
  return buf;
}
// GLB de un quad (2 triángulos, índices Uint16, material rojo) con TRS de nodo.
function glbQuad() {
  const pos = positionsBuffer([[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]]);
  const idx = Buffer.alloc(12);
  [0, 1, 2, 0, 2, 3].forEach(function (v, i) { u16(idx, i * 2, v); });
  const bin = Buffer.concat([pos, idx]);
  const json = {
    asset: { version: '2.0', generator: 'prueba' },
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.length },
      { buffer: 0, byteOffset: pos.length, byteLength: idx.length }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' }
    ],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    nodes: [{ mesh: 0, translation: [10, 20, 30], scale: [2, 2, 2] }],
    scenes: [{ nodes: [0] }],
    scene: 0
  };
  return buildGlb(json, bin);
}
function plano(v) { return JSON.parse(JSON.stringify(v)); }
function assertMallaValida(resultado, label) {
  assert(Array.isArray(resultado.mesh) && resultado.mesh.length > 0,
    label + ': la malla no debe estar vacía');
  resultado.mesh.forEach(function (cara, i) {
    assert(Array.isArray(cara.points), label + ': la cara ' + i + ' no tiene points');
    assert.strictEqual(cara.points.length, 3, label + ': la cara ' + i + ' no es un triángulo');
    assert(typeof cara.color === 'string' && cara.color,
      label + ': la cara ' + i + ' no tiene color');
    cara.points.forEach(function (p, j) {
      assert(typeof p.x === 'number' && isFinite(p.x) &&
        typeof p.y === 'number' && isFinite(p.y) &&
        typeof p.z === 'number' && isFinite(p.z),
        label + ': punto no finito ' + j + ' en la cara ' + i);
    });
  });
  const b = resultado.bounds;
  ['minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ'].forEach(function (k) {
    assert(typeof b[k] === 'number' && isFinite(b[k]), label + ': bounds.' + k + ' no finito');
  });
  assert(b.maxX >= b.minX && b.maxY >= b.minY && b.maxZ >= b.minZ,
    label + ': bounds incoherente');
  // Determinista: triangleCount coincide con las caras devueltas.
  if (resultado.triangleCount <= Importer.MAX_TRIANGLES) {
    assert.strictEqual(resultado.triangleCount, resultado.mesh.length,
      label + ': triangleCount debe coincidir con mesh.length');
  } else {
    assert.strictEqual(resultado.mesh.length, Importer.MAX_TRIANGLES,
      label + ': la malla debe recortarse al tope');
  }
}
async function expectError(nombre, fn, patron) {
  try {
    await fn();
  } catch (e) {
    const msg = String(e && e.message || e);
    assert(patron.test(msg), nombre + ': mensaje inesperado: "' + msg + '"');
    assert(msg.length > 10, nombre + ': el mensaje debe ser claro, no "' + msg + '"');
    assert(/[áéíóúñ¿¡]|archivo|formato|triángulos|geometría|soporta|modelo/i.test(msg),
      nombre + ': el mensaje debe ser comprensible en español: "' + msg + '"');
    console.log('OK  error claro — ' + nombre + ': ' + msg);
    return;
  }
  throw new Error(nombre + ': se esperaba un rechazo y la promesa resolvió');
}

async function run() {
  // ------------------------------------------------------------------ OBJ
  // OBJ mínimo: un solo triángulo.
  const objTri = 'v 0 0 0\nv 100 0 0\nv 0 100 0\nf 1 2 3\n';
  const rTri = await Importer.parse(objTri, { name: 'triangulo.obj' });
  assert.strictEqual(rTri.format, 'obj', 'OBJ: formato detectado incorrecto');
  assert.strictEqual(rTri.name, 'triangulo', 'OBJ: nombre desde opts.name sin extensión');
  assert.strictEqual(rTri.triangleCount, 1, 'OBJ: debe haber 1 triángulo');
  assert.deepStrictEqual(plano(rTri.bounds),
    { minX: 0, minY: 0, minZ: 0, maxX: 100, maxY: 100, maxZ: 0 },
    'OBJ: bounds del triángulo: ' + JSON.stringify(rTri.bounds));
  assert.strictEqual(rTri.mesh[0].color, '#cfd6dd', 'OBJ: color neutro por defecto');
  assert.strictEqual(rTri.decimated, false, 'OBJ mínimo no debe decimarse');
  assert(Array.isArray(rTri.warnings) && rTri.warnings.length === 0, 'OBJ mínimo sin avisos');
  assertMallaValida(rTri, 'OBJ triángulo');
  console.log('OK  OBJ mínimo: triángulo, bounds y color neutro');

  // OBJ con quad (2 triángulos), índice negativo y n-gon (3 triángulos).
  const objQuad = [
    'o Mesa', 'v 0 0 0', 'v 2 0 0', 'v 2 1 0', 'v 0 1 0',
    'f 1 2 3 4',    // quad -> 2 triángulos
    'f -1 -2 -3',   // índices negativos -> 1 triángulo
    'f 1 2 3'       // triángulo explícito -> 1
  ].join('\n');
  const rQuad = await Importer.parse(objQuad);
  assert.strictEqual(rQuad.name, 'Mesa', 'OBJ: nombre desde el grupo "o" cuando no hay archivo');
  assert.strictEqual(rQuad.triangleCount, 4, 'OBJ: quad(2) + negativo(1) + triángulo(1) = 4; hay ' + rQuad.triangleCount);
  assertMallaValida(rQuad, 'OBJ quad');
  console.log('OK  OBJ: quad triangulado, índices negativos y nombre por grupo');

  // ------------------------------------------------------------------ GLB
  const rGlb = await Importer.parse(glbQuad(), { name: 'quad.glb' });
  assert.strictEqual(rGlb.format, 'glb', 'GLB: formato detectado incorrecto');
  assert.strictEqual(rGlb.name, 'quad', 'GLB: nombre desde opts.name');
  assert.strictEqual(rGlb.triangleCount, 2, 'GLB: deben ser 2 triángulos; son ' + rGlb.triangleCount);
  assert.deepStrictEqual(plano(rGlb.bounds),
    { minX: 10, minY: 20, minZ: 30, maxX: 14, maxY: 22, maxZ: 30 },
    'GLB: bounds con el TRS del nodo: ' + JSON.stringify(rGlb.bounds));
  assert.strictEqual(rGlb.mesh[0].color, '#ff0000', 'GLB: color desde baseColorFactor');
  assertMallaValida(rGlb, 'GLB quad');
  console.log('OK  GLB mínimo: 2 triángulos, bounds con TRS y color de material');

  // GLB sin índices: triángulos implícitos y color neutro.
  {
    const pos = positionsBuffer([[0, 0, 0], [1, 0, 0], [0, 1, 0], [5, 0, 0], [6, 0, 0], [5, 1, 0]]);
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: pos.length }],
      bufferViews: [{ buffer: 0, byteLength: pos.length }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 6, type: 'VEC3' }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }]
    };
    const r = await Importer.parse(buildGlb(json, pos), { name: 'implicito.glb' });
    assert.strictEqual(r.triangleCount, 2, 'GLB sin índices: 2 triángulos; hay ' + r.triangleCount);
    assert.strictEqual(r.mesh[0].color, '#cfd6dd', 'GLB sin material: color neutro');
    assertMallaValida(r, 'GLB sin índices');
    console.log('OK  GLB sin índices (triángulos implícitos) y color neutro');
  }

  // ------------------------------------------------------------ errores claros
  await expectError('entrada nula', function () { return Importer.parse(null); },
    /ningún archivo/i);
  await expectError('archivo vacío',
    function () { return Importer.parse(new Uint8Array(0), { name: 'vacio.obj' }); }, /vacío/i);
  await expectError('formato no soportado (.fbx)',
    function () {
      return Importer.parse('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3', { name: 'silla.fbx' });
    }, /no soportado/i);
  await expectError('GLB con firma inválida',
    function () {
      return Importer.parse(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
        { name: 'malo.glb' });
    }, /GLB.*(dañado|firma)/i);
  await expectError('glTF sin asset.version',
    function () { return Importer.parse('{"meshes":[]}', { name: 'x.gltf' }); },
    /asset\.version|versión/i);
  await expectError('OBJ sin caras',
    function () { return Importer.parse('v 0 0 0\nv 1 0 0\nv 0 1 0', { name: 'sin.obj' }); },
    /caras/i);
  await expectError('OBJ sin vértices',
    function () { return Importer.parse('f 1 2 3', { name: 'vacio.obj' }); }, /vértices/i);
  await expectError('binario desconocido',
    function () {
      return Importer.parse(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), { name: 'raro.bin' });
    }, /no parece|compatible/i);
  console.log('Importer: 8 errores rechazados con mensajes claros — OK');

  // ----------------------------------------- tope de 8000 triángulos (decimado)
  {
    const partes = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0'];
    for (let i = 0; i < 9000; i++) partes.push('f 1 2 3');
    const r = await Importer.parse(partes.join('\n'), { name: 'grande.obj' });
    assert.strictEqual(r.triangleCount, 8000,
      'OBJ: la malla debe quedar en 8000 triángulos; quedó ' + r.triangleCount);
    assert.strictEqual(r.mesh.length, 8000, 'OBJ: mesh debe quedar en 8000 triángulos');
    assert.strictEqual(r.sourceTriangleCount, 9000,
      'OBJ: debe informar los triángulos de origen; informa ' + r.sourceTriangleCount);
    assert.strictEqual(r.decimated, true, 'OBJ: decimated debe ser true');
    assert(r.warnings.length >= 1 && /8000/.test(r.warnings[0]),
      'OBJ: debe avisar del decimado; avisos: ' + JSON.stringify(r.warnings));
    assertMallaValida(r, 'OBJ 9000→8000');
    console.log('OK  tope 8000 en OBJ (decimado + aviso): ' + r.warnings[0]);
  }
  {
    // 9000 triángulos implícitos en GLB (27000 vértices).
    const N = 27000;
    const bin = Buffer.alloc(N * 12);
    for (let i = 0; i < N; i++) { f32(bin, i * 12, i); f32(bin, i * 12 + 4, 0); f32(bin, i * 12 + 8, 0); }
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: bin.length }],
      bufferViews: [{ buffer: 0, byteLength: bin.length }],
      accessors: [{ bufferView: 0, componentType: 5126, count: N, type: 'VEC3' }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }]
    };
    const r = await Importer.parse(buildGlb(json, bin), { name: 'grande.glb' });
    assert.strictEqual(r.triangleCount, 8000, 'GLB: debe decimarse a 8000; quedó ' + r.triangleCount);
    assert.strictEqual(r.sourceTriangleCount, 9000,
      'GLB: debe informar 9000 triángulos de origen; informa ' + r.sourceTriangleCount);
    assert.strictEqual(r.decimated, true, 'GLB: decimated debe ser true');
    assert(r.warnings.length >= 1, 'GLB: debe avisar del decimado');
    assertMallaValida(r, 'GLB 9000→8000');
    console.log('OK  tope 8000 en GLB (muestreo uniforme + aviso)');
  }

  console.log('OK — pruebas de importación completadas');
}

run().catch(function (e) {
  console.error('FALLO: ' + (e && e.stack ? e.stack : e));
  process.exitCode = 1;
});

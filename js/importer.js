/* EngDraft — importador de objetos 3D externos (OBJ, GLB y glTF 2.0)
 *
 * ED.Importer.parse(file, opts) -> Promise<{
 *   name, format: 'obj'|'glb'|'gltf',
 *   mesh: [ { points: [{x,y,z},{x,y,z},{x,y,z}], color } ],
 *   bounds: { minX,minY,minZ,maxX,maxY,maxZ },
 *   triangleCount, sourceTriangleCount, decimated, warnings
 * }>
 *
 * - Acepta File/Blob (usa .arrayBuffer()), ArrayBuffer, vistas tipadas o texto.
 * - OBJ: vértices 'v' y caras 'f' (triángulos, quads y n-gons triangulados en
 *   abanico); se ignoran vt/vn/materiales; nombre por 'o'/'g' o del archivo.
 * - GLB: cabecera glTF 2.0, chunks JSON + BIN, nodos con TRS o matriz, varias
 *   primitivas, POSITION FLOAT e índices UNSIGNED_BYTE/SHORT/INT; color por
 *   pbrMetallicRoughness.baseColorFactor o neutro #cfd6dd.
 * - .gltf: variante JSON con buffers embebidos data:base64 (sin red).
 * - Máximo 8000 triángulos: si se excede se decima por muestreo uniforme y se
 *   avisa en `warnings`. Se descartan vértices/triángulos no finitos.
 * - Sin dependencias, sin red y sin DOM obligatorio (no usa document/window).
 * - Devuelve la malla en las coordenadas originales del modelo (la UI normaliza
 *   a mm y calcula bounds/planta).
 */
(function (ED) {
  'use strict';

  var MAX_TRIANGLES = 8000;
  var DEFAULT_COLOR = '#cfd6dd';
  var IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  var UNSUPPORTED_EXT = {
    fbx: 1, stl: 1, '3ds': 1, max: 1, dae: 1, skp: 1, blend: 1, ply: 1,
    step: 1, stp: 1, iges: 1, igs: 1, '3mf': 1, amf: 1, wrl: 1, vrml: 1
  };
  var KNOWN_EXT = { obj: 1, glb: 1, gltf: 1 };
  var COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  var GL = {
    BYTE: 5120, UNSIGNED_BYTE: 5121, SHORT: 5122, UNSIGNED_SHORT: 5123,
    UNSIGNED_INT: 5125, FLOAT: 5126,
    POINTS: 0, LINES: 1, LINE_LOOP: 2, LINE_STRIP: 3,
    TRIANGLES: 4, TRIANGLE_STRIP: 5, TRIANGLE_FAN: 6
  };
  var CHUNK_JSON = 0x4E4F534A; // 'JSON'
  var CHUNK_BIN = 0x004E4942;  // 'BIN\0'
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  // ------------------------------------------------------------------ utils
  function fail(msg) { throw new Error(msg); }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function exists(v) { return v !== undefined && v !== null; }

  function isFiniteNum(v) { var n = Number(v); return isFinite(n); }

  function msgOf(err) {
    if (!err) return 'error desconocido';
    return (err && err.message) ? String(err.message) : String(err);
  }

  function extOf(name) {
    var m = /\.([A-Za-z0-9]+)\s*$/.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function cleanName(raw) {
    var s = String(raw == null ? '' : raw).replace(/^.*[\\\/]/, '').trim();
    s = s.replace(/\.(obj|glb|gltf)$/i, '').trim();
    return s.slice(0, 80);
  }

  function unsupportedExtMessage(ext) {
    return 'Formato no soportado: ".' + ext + '". Importa un archivo GLB ' +
      '(recomendado) u OBJ; FBX, STL, 3DS y DAE no se admiten.';
  }

  function makeColor(r, g, b) {
    function c(v) {
      var n = Math.round(clamp(Number(v) || 0, 0, 1) * 255);
      return (n < 16 ? '0' : '') + n.toString(16);
    }
    return '#' + c(r) + c(g) + c(b);
  }

  function defaultColor(opts) {
    var c = opts && typeof opts.color === 'string' ? String(opts.color).trim() : '';
    return /^#[0-9a-fA-F]{3,8}$/.test(c) || /^rgba?\(/.test(c) ? c : DEFAULT_COLOR;
  }

  // Decodificador UTF-8 propio: sin DOM y con respaldo si no hay TextDecoder.
  function utf8Decode(bytes) {
    if (typeof TextDecoder !== 'undefined') {
      try { return new TextDecoder('utf-8').decode(bytes); } catch (e) { /* respaldo */ }
    }
    var out = '', i = 0, len = bytes.length;
    while (i < len) {
      var b = bytes[i++];
      if (b < 0x80) {
        out += String.fromCharCode(b);
      } else if (b < 0xC2) {
        out += '\uFFFD';
      } else if (b < 0xE0) {
        if (i >= len) break;
        out += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i++] & 0x3F));
      } else if (b < 0xF0) {
        if (i + 1 >= len) break;
        out += String.fromCharCode(((b & 0x0F) << 12) |
          ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F));
      } else {
        if (i + 2 >= len) break;
        var cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3F) << 12) |
          ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F);
        cp -= 0x10000;
        out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
      }
    }
    return out;
  }

  // Decodifica base64 sin atob (los buffers glTF embebidos usan data:base64).
  function base64ToBytes(text, what) {
    var s = String(text || '').replace(/[\s\r\n\t]/g, '');
    if (!s) return new Uint8Array(0);
    var pad = 0;
    if (s.charAt(s.length - 1) === '=') pad++;
    if (s.length > 1 && s.charAt(s.length - 2) === '=') pad++;
    var out = new Uint8Array(Math.max(0, Math.floor((s.length * 3) / 4) - pad));
    var o = 0, buf = 0, bits = 0, i;
    for (i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '=') break;
      var v = B64.indexOf(ch);
      if (v < 0) {
        fail('Los datos embebidos (' + (what || 'buffer') + ') no son base64 válido.');
      }
      buf = (buf << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        if (o < out.length) out[o++] = (buf >> bits) & 0xFF;
      }
    }
    return o === out.length ? out : out.subarray(0, o);
  }

  function decodeDataUri(uri, what) {
    var comma = String(uri).indexOf(',');
    if (comma < 0) fail('El buffer embebido (' + (what || 'buffer') + ') no es un data URI válido.');
    var meta = String(uri).slice(0, comma);
    var body = String(uri).slice(comma + 1);
    if (!/;base64/i.test(meta)) {
      fail('Sólo se admiten buffers embebidos data: base64 (recurso "' +
        (what || 'buffer') + '").');
    }
    return base64ToBytes(body, what);
  }

  function isArrayBufferLike(v) {
    if (!v || typeof v !== 'object') return false;
    var tag = Object.prototype.toString.call(v);
    if (tag === '[object ArrayBuffer]' || tag === '[object SharedArrayBuffer]') return true;
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(v)) return true;
    return typeof v.byteLength === 'number' && typeof v.byteOffset === 'number' &&
      typeof v.BYTES_PER_ELEMENT === 'number';
  }

  function toBytes(v) {
    var tag = Object.prototype.toString.call(v);
    if (tag === '[object ArrayBuffer]' || tag === '[object SharedArrayBuffer]') {
      return new Uint8Array(v);
    }
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(v)) {
      return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    }
    if (v && typeof v.byteLength === 'number' && typeof v.byteOffset === 'number' && v.buffer) {
      return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    }
    fail('Tipo de datos no soportado: se esperaba File/Blob, ArrayBuffer o texto.');
  }

  // --------------------------------------------------------- lectura de entrada
  function readInput(file, opts) {
    return new Promise(function (resolve, reject) {
      var optName = opts && typeof opts.name === 'string' ? opts.name
        : (opts && typeof opts.fileName === 'string' ? opts.fileName : '');
      if (file === undefined || file === null) {
        reject(new Error('No se seleccionó ningún archivo para importar.'));
        return;
      }
      if (typeof file === 'string') {
        resolve({ name: optName, text: file, bytes: null });
        return;
      }
      if (isArrayBufferLike(file)) {
        resolve({ name: optName, text: null, bytes: toBytes(file) });
        return;
      }
      if (typeof file === 'object') {
        var fname = optName || (typeof file.name === 'string' ? file.name : '');
        if (typeof file.arrayBuffer === 'function') {
          var p;
          try { p = file.arrayBuffer(); } catch (e) {
            reject(new Error('No se pudo leer el archivo: ' + msgOf(e)));
            return;
          }
          Promise.resolve(p).then(function (ab) {
            resolve({ name: fname, text: null, bytes: toBytes(ab) });
          }, function (err) {
            reject(new Error('No se pudo leer el archivo seleccionado: ' + msgOf(err)));
          });
          return;
        }
        if (typeof file.text === 'function' && typeof file.size === 'number' &&
          typeof file.slice === 'function') {
          Promise.resolve(file.text()).then(function (txt) {
            resolve({ name: fname, text: txt, bytes: null });
          }, function (err) {
            reject(new Error('No se pudo leer el archivo seleccionado: ' + msgOf(err)));
          });
          return;
        }
      }
      reject(new Error('Entrada no soportada: se esperaba un archivo (File/Blob), ' +
        'un ArrayBuffer o el texto del modelo.'));
    });
  }

  function detectFormat(input) {
    var ext = extOf(input.name);
    var text = input.text;
    var bytes = input.bytes;
    if (text !== null && text !== undefined) {
      var trimmed = String(text).replace(/^\uFEFF/, '').replace(/^\s+/, '');
      if (trimmed.charAt(0) === '{') return 'gltf';
      if (UNSUPPORTED_EXT[ext]) fail(unsupportedExtMessage(ext));
      return 'obj';
    }
    if (!bytes || !bytes.length) fail('El archivo está vacío.');
    var isGlbMagic = bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6C &&
      bytes[2] === 0x54 && bytes[3] === 0x46; // "glTF"
    if (ext === 'glb') {
      if (!isGlbMagic) {
        fail('El archivo GLB está dañado o no es glTF binario (falta la firma "glTF").');
      }
      return 'glb';
    }
    if (ext === 'gltf') {
      if (!looksLikeJson(bytes)) {
        fail('El archivo .gltf no contiene JSON válido de glTF 2.0.');
      }
      return 'gltf';
    }
    if (UNSUPPORTED_EXT[ext]) fail(unsupportedExtMessage(ext));
    if (isGlbMagic) return 'glb';
    if (looksLikeJson(bytes)) return 'gltf';
    if (!looksLikeText(bytes)) {
      fail('El archivo no parece un modelo 3D compatible: se esperaba GLB, ' +
        'glTF 2.0 (.gltf) u OBJ de texto.');
    }
    return 'obj';
  }

  function looksLikeText(bytes) {
    var limit = Math.min(bytes.length, 512);
    var printable = 0;
    for (var i = 0; i < limit; i++) {
      var b = bytes[i];
      if (b === 0) return false;
      if (b === 0x09 || b === 0x0A || b === 0x0D || (b >= 0x20 && b < 0x7F) || b >= 0x80) printable++;
    }
    return limit > 0 && printable / limit >= 0.9;
  }

  function looksLikeJson(bytes) {
    var limit = Math.min(bytes.length, 256);
    for (var i = 0; i < limit; i++) {
      var b = bytes[i];
      if (b === 0x20 || b === 0x09 || b === 0x0A || b === 0x0D) continue;
      return b === 0x7B; // '{'
    }
    return false;
  }

  // --------------------------------------------------------------- geometría
  function triangle(a, b, c, color) {
    return { points: [{ x: a.x, y: a.y, z: a.z }, { x: b.x, y: b.y, z: b.z }, { x: c.x, y: c.y, z: c.z }], color: color };
  }

  function finitePoint(p) {
    return p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z);
  }

  function boundsOf(mesh) {
    var b = {
      minX: Infinity, minY: Infinity, minZ: Infinity,
      maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity
    };
    for (var i = 0; i < mesh.length; i++) {
      var pts = mesh[i].points;
      for (var j = 0; j < pts.length; j++) {
        var p = pts[j];
        if (p.x < b.minX) b.minX = p.x;
        if (p.y < b.minY) b.minY = p.y;
        if (p.z < b.minZ) b.minZ = p.z;
        if (p.x > b.maxX) b.maxX = p.x;
        if (p.y > b.maxY) b.maxY = p.y;
        if (p.z > b.maxZ) b.maxZ = p.z;
      }
    }
    return b;
  }

  // Muestreo uniforme de triángulos (conserva la forma y respeta el tope).
  function decimateUniform(mesh, max) {
    var total = mesh.length;
    if (total <= max) return mesh;
    var out = new Array(max);
    for (var i = 0; i < max; i++) {
      out[i] = mesh[Math.floor((i * total) / max)];
    }
    return out;
  }

  function finish(mesh, sourceTriangleCount, name, format, warnings, sampled) {
    if (!mesh.length) {
      fail('El archivo no contiene geometría 3D utilizable (triángulos válidos).');
    }
    var max = MAX_TRIANGLES;
    var original = (isFinite(sourceTriangleCount) && sourceTriangleCount > 0)
      ? sourceTriangleCount : mesh.length;
    var decimated = false;
    if (mesh.length > max) {
      mesh = decimateUniform(mesh, max);
      decimated = true;
    } else if (sampled && original > max) {
      decimated = true;
    }
    var list = warnings || [];
    if (decimated) {
      list.push('La malla tenía ' + original + ' triángulos; se conservaron ' +
        mesh.length + ' por el límite de ' + max + '.');
    }
    var bounds = boundsOf(mesh);
    if (!isFinite(bounds.minX) || !isFinite(bounds.maxX)) {
      fail('La geometría del archivo no contiene coordenadas válidas.');
    }
    return {
      name: name,
      format: format,
      mesh: mesh,
      bounds: bounds,
      triangleCount: mesh.length,
      sourceTriangleCount: original,
      decimated: decimated,
      warnings: list
    };
  }

  // --------------------------------------------------------------------- OBJ
  function parseObj(text, name, opts) {
    var color = defaultColor(opts);
    var src = String(text == null ? '' : text);
    var lines = src.split(/\r\n|\r|\n/);
    var verts = [];
    var faces = [];
    var objectName = '';
    var i, k;

    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      var hash = line.indexOf('#');
      if (hash >= 0) line = line.slice(0, hash);
      line = line.replace(/^\s+/, '').replace(/\s+$/, '');
      if (!line) continue;
      var parts = line.split(/\s+/);
      var kw = parts[0];
      if (kw === 'v') {
        var vx = Number(parts[1]), vy = Number(parts[2]), vz = Number(parts[3]);
        verts.push({
          x: isFinite(vx) ? vx : NaN,
          y: isFinite(vy) ? vy : NaN,
          z: isFinite(vz) ? vz : NaN
        });
      } else if (kw === 'f') {
        var tokens = [];
        var bad = false;
        for (k = 1; k < parts.length; k++) {
          var tok = parts[k].split('/')[0];
          if (!tok) { bad = true; break; }
          var n = parseInt(tok, 10);
          if (!isFinite(n) || n === 0) { bad = true; break; }
          tokens.push(n);
        }
        if (!bad && tokens.length >= 3) faces.push(tokens);
      } else if ((kw === 'o' || kw === 'g') && !objectName && parts.length > 1) {
        objectName = parts.slice(1).join(' ').trim();
      }
    }

    if (!verts.length) fail('El archivo OBJ no contiene vértices ("v").');
    if (!faces.length) fail('El archivo OBJ no contiene caras ("f") utilizables.');

    var mesh = [];
    for (i = 0; i < faces.length; i++) {
      var toks = faces[i];
      var idx = [];
      var ok = true;
      for (k = 0; k < toks.length; k++) {
        var vi = toks[k] < 0 ? verts.length + toks[k] : toks[k] - 1;
        if (vi < 0 || vi >= verts.length) { ok = false; break; }
        var vv = verts[vi];
        if (!finitePoint(vv)) { ok = false; break; }
        idx.push(vi);
      }
      if (!ok) continue;
      // Triangulación en abanico: f(a,b,c,d,…) -> (a,b,c),(a,c,d),…
      for (k = 1; k + 1 < idx.length; k++) {
        var a = idx[0], b = idx[k], c = idx[k + 1];
        if (a === b || b === c || a === c) continue;
        mesh.push(triangle(verts[a], verts[b], verts[c], color));
      }
    }

    var display = cleanName(opts && opts.name);
    if (!display) display = cleanName(objectName);
    if (!display) display = cleanName(name);
    if (!display) display = 'Objeto importado';
    return finish(mesh, mesh.length, display, 'obj', []);
  }

  // --------------------------------------------------------- matrices glTF
  function matMultiply(a, b) {
    var c = new Array(16);
    for (var col = 0; col < 4; col++) {
      for (var row = 0; row < 4; row++) {
        var sum = 0;
        for (var k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
        c[col * 4 + row] = sum;
      }
    }
    return c;
  }

  function vector3(v, def) {
    if (!Array.isArray(v) || v.length < 3) return def.slice();
    var out = [Number(v[0]), Number(v[1]), Number(v[2])];
    if (!isFinite(out[0]) || !isFinite(out[1]) || !isFinite(out[2])) return def.slice();
    return out;
  }

  function matFromNode(node) {
    if (!node) return IDENTITY.slice();
    if (Array.isArray(node.matrix) && node.matrix.length === 16) {
      var m = new Array(16);
      for (var i = 0; i < 16; i++) {
        var n = Number(node.matrix[i]);
        if (!isFinite(n)) return IDENTITY.slice();
        m[i] = n;
      }
      return m;
    }
    var t = vector3(node.translation, [0, 0, 0]);
    var s = vector3(node.scale, [1, 1, 1]);
    var q = [0, 0, 0, 1];
    if (Array.isArray(node.rotation) && node.rotation.length >= 4) {
      var qq = [Number(node.rotation[0]), Number(node.rotation[1]),
        Number(node.rotation[2]), Number(node.rotation[3])];
      if (isFinite(qq[0]) && isFinite(qq[1]) && isFinite(qq[2]) && isFinite(qq[3])) q = qq;
    }
    var x = q[0], y = q[1], z = q[2], w = q[3];
    var xx = x * x, yy = y * y, zz = z * z;
    var xy = x * y, xz = x * z, yz = y * z;
    var wx = w * x, wy = w * y, wz = w * z;
    return [
      (1 - 2 * (yy + zz)) * s[0], (2 * (xy + wz)) * s[0], (2 * (xz - wy)) * s[0], 0,
      (2 * (xy - wz)) * s[1], (1 - 2 * (xx + zz)) * s[1], (2 * (yz + wx)) * s[1], 0,
      (2 * (xz + wy)) * s[2], (2 * (yz - wx)) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1
    ];
  }

  function applyMat(m, p) {
    return {
      x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
      y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
      z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]
    };
  }

  // ------------------------------------------------------- glTF: buffers/accessors
  function resolveBuffers(json, binBytes) {
    var src = Array.isArray(json.buffers) ? json.buffers : [];
    var out = [];
    for (var i = 0; i < src.length; i++) {
      var b = src[i] || {};
      var uri = typeof b.uri === 'string' ? b.uri.trim() : '';
      if (uri) {
        if (uri.indexOf('data:') === 0) {
          out.push(decodeDataUri(uri, 'buffer ' + i));
        } else {
          fail('El archivo glTF referencia un recurso externo ("' +
            uri.slice(0, 48) + '"). Usa GLB o un .gltf con buffers embebidos ' +
            'data:base64; no se descargan recursos de red.');
        }
      } else if (i === 0 && binBytes && binBytes.length) {
        out.push(binBytes);
      } else {
        fail('El archivo glTF no incluye los datos binarios del buffer ' + i + '.');
      }
    }
    return out;
  }

  function bufferDataView(buffer, what) {
    if (!buffer || !buffer.byteLength) fail('El buffer ' + what + ' está vacío.');
    return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  function readAccessor(json, buffers, index, kind) {
    if (!Array.isArray(json.accessors) || !json.accessors[index]) {
      fail('El archivo glTF referencia un accessor inexistente (' + kind + ' ' + index + ').');
    }
    var acc = json.accessors[index];
    var count = Number(acc.count);
    if (!isFinite(count) || count < 0) fail('Accessor ' + index + ' con número de elementos inválido.');
    var components = kind === 'POSITION' ? 3 : (kind === 'SCALAR' ? 1 : 0);
    if (!components) fail('Tipo de accessor no soportado en ' + index + '.');
    var bytesPer = COMPONENT_BYTES[acc.componentType];
    if (!bytesPer) fail('Accessor ' + index + ' con componentType no soportado (' + acc.componentType + ').');
    if (kind === 'POSITION') {
      if (acc.componentType !== GL.FLOAT) {
        fail('Las posiciones (POSITION) deben ser FLOAT; el accessor ' + index +
          ' usa componentType ' + acc.componentType + '.');
      }
      if (acc.type !== 'VEC3') {
        fail('El accessor POSITION ' + index + ' debe ser VEC3 (es ' + acc.type + ').');
      }
    } else {
      if (acc.componentType !== GL.UNSIGNED_BYTE && acc.componentType !== GL.UNSIGNED_SHORT &&
        acc.componentType !== GL.UNSIGNED_INT) {
        fail('Los índices del accessor ' + index + ' deben ser UNSIGNED_BYTE, ' +
          'UNSIGNED_SHORT o UNSIGNED_INT.');
      }
      if (acc.type !== 'SCALAR') fail('Los índices del accessor ' + index + ' deben ser SCALAR.');
    }
    var values = new Array(count);
    var i, p;
    if (acc.bufferView === undefined || acc.bufferView === null) {
      // glTF permite accessors sin bufferView (todo ceros).
      for (i = 0; i < count; i++) {
        values[i] = kind === 'POSITION' ? { x: 0, y: 0, z: 0 } : 0;
      }
      return values;
    }
    if (!Array.isArray(json.bufferViews) || !json.bufferViews[acc.bufferView]) {
      fail('El accessor ' + index + ' referencia un bufferView inexistente.');
    }
    var bv = json.bufferViews[acc.bufferView];
    var buffer = buffers[bv.buffer];
    if (!buffer) fail('El accessor ' + index + ' referencia un buffer inexistente.');
    var compSize = components * bytesPer;
    var stride = Number(bv.byteStride);
    if (!isFinite(stride) || stride <= 0) stride = compSize;
    if (stride < compSize) stride = compSize;
    var base = (Number(bv.byteOffset) || 0) + (Number(acc.byteOffset) || 0);
    var needed = count > 0 ? base + (count - 1) * stride + compSize : base;
    if (!isFinite(base) || base < 0 || needed > buffer.byteLength) {
      fail('Los datos del accessor ' + index + ' se salen del buffer (archivo glTF dañado).');
    }
    var dv = bufferDataView(buffer, index);
    for (i = 0; i < count; i++) {
      var off = base + i * stride;
      if (kind === 'POSITION') {
        values[i] = {
          x: dv.getFloat32(off, true),
          y: dv.getFloat32(off + 4, true),
          z: dv.getFloat32(off + 8, true)
        };
      } else if (acc.componentType === GL.UNSIGNED_BYTE) {
        values[i] = dv.getUint8(off);
      } else if (acc.componentType === GL.UNSIGNED_SHORT) {
        values[i] = dv.getUint16(off, true);
      } else {
        values[i] = dv.getUint32(off, true);
      }
      if (!isFinite(values[i]) && typeof values[i] === 'number') values[i] = 0;
      if (kind === 'POSITION') {
        p = values[i];
        if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) {
          values[i] = { x: NaN, y: NaN, z: NaN };
        }
      }
    }
    return values;
  }

  function materialColor(gltf, index) {
    if (!Array.isArray(gltf.materials) || index === undefined || index === null) return DEFAULT_COLOR;
    var mat = gltf.materials[index];
    if (!mat) return DEFAULT_COLOR;
    var factor = null;
    if (mat.pbrMetallicRoughness && Array.isArray(mat.pbrMetallicRoughness.baseColorFactor)) {
      factor = mat.pbrMetallicRoughness.baseColorFactor;
    } else if (mat.extensions &&
      mat.extensions.KHR_materials_pbrSpecularGlossiness &&
      Array.isArray(mat.extensions.KHR_materials_pbrSpecularGlossiness.diffuseFactor)) {
      factor = mat.extensions.KHR_materials_pbrSpecularGlossiness.diffuseFactor;
    }
    if (!factor || factor.length < 3) return DEFAULT_COLOR;
    return makeColor(factor[0], factor[1], factor[2]);
  }

  // -------------------------------------------------------- glTF: recorrido
  function sceneRoots(gltf) {
    var nodes = Array.isArray(gltf.nodes) ? gltf.nodes : [];
    var scene = null;
    if (Array.isArray(gltf.scenes) && gltf.scenes.length) {
      if (typeof gltf.scene === 'number' && gltf.scenes[gltf.scene]) scene = gltf.scenes[gltf.scene];
      else scene = gltf.scenes[0];
    }
    if (scene && Array.isArray(scene.nodes) && scene.nodes.length) {
      return scene.nodes.slice();
    }
    var childOf = {};
    var i, j;
    for (i = 0; i < nodes.length; i++) {
      var ch = (nodes[i] && nodes[i].children) || [];
      for (j = 0; j < ch.length; j++) childOf[ch[j]] = true;
    }
    var roots = [];
    for (i = 0; i < nodes.length; i++) if (!childOf[i]) roots.push(i);
    return roots;
  }

  function collectPrimitives(gltf, callback) {
    var nodes = Array.isArray(gltf.nodes) ? gltf.nodes : [];
    var visited = {};
    function walk(index, parentMatrix) {
      if (!isFinite(index) || index < 0 || index >= nodes.length) return;
      if (visited[index]) return;
      visited[index] = true;
      var node = nodes[index];
      if (!node) return;
      var world = matMultiply(parentMatrix, matFromNode(node));
      if (exists(node.mesh) && Array.isArray(gltf.meshes) && gltf.meshes[node.mesh]) {
        callback(gltf.meshes[node.mesh], world);
      }
      var children = node.children || [];
      for (var c = 0; c < children.length; c++) walk(children[c], world);
    }
    var roots = sceneRoots(gltf);
    for (var r = 0; r < roots.length; r++) walk(roots[r], IDENTITY.slice());
    // Respaldo: archivos sin escenas/nodos pero con meshes sueltos.
    var used = false;
    for (var k in visited) { if (visited.hasOwnProperty(k)) { used = true; break; } }
    if (!used && Array.isArray(gltf.meshes)) {
      for (var m = 0; m < gltf.meshes.length; m++) callback(gltf.meshes[m], IDENTITY.slice());
    }
  }

  function primitiveTriangleCount(gltf, prim) {
    if (!prim || !prim.attributes || !exists(prim.attributes.POSITION)) return 0;
    if (!Array.isArray(gltf.accessors)) return 0;
    var pos = gltf.accessors[prim.attributes.POSITION];
    if (!pos) return 0;
    var count = Number(pos.count);
    if (!isFinite(count) || count <= 0) return 0;
    var mode = exists(prim.mode) ? Number(prim.mode) : GL.TRIANGLES;
    var n;
    if (exists(prim.indices)) {
      var idx = gltf.accessors[prim.indices];
      n = idx ? Number(idx.count) : 0;
      if (!isFinite(n) || n <= 0) return 0;
    } else {
      n = count;
    }
    if (mode === GL.TRIANGLES) return Math.floor(n / 3);
    if (mode === GL.TRIANGLE_STRIP || mode === GL.TRIANGLE_FAN) return Math.max(0, n - 2);
    return 0; // puntos/líneas no aportan triángulos
  }

  // Determinante de la parte 3x3 (column-major) de una matriz 4x4. Si es
  // negativo el nodo refleja la geometría y hay que invertir el orden de los
  // vértices para conservar las normales hacia fuera.
  function matDet3(m) {
    return m[0] * (m[5] * m[10] - m[6] * m[9]) -
      m[4] * (m[1] * m[10] - m[2] * m[9]) +
      m[8] * (m[1] * m[6] - m[2] * m[5]);
  }

  function buildGltf(json, binBytes, name, opts, format) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      fail('El archivo no contiene un documento glTF válido.');
    }
    if (!json.asset || typeof json.asset.version !== 'string') {
      fail('El archivo glTF no declara su versión (falta asset.version); se requiere glTF 2.0.');
    }
    if (!/^\s*2(\.|$)/.test(json.asset.version)) {
      fail('Versión de glTF no soportada: ' + json.asset.version + ' (se requiere 2.0).');
    }
    var buffers = resolveBuffers(json, binBytes);
    var items = [];
    collectPrimitives(json, function (mesh, world) {
      var prims = (mesh && Array.isArray(mesh.primitives)) ? mesh.primitives : [];
      for (var p = 0; p < prims.length; p++) {
        var prim = prims[p];
        if (!prim || !prim.attributes || !exists(prim.attributes.POSITION)) continue;
        var tris = primitiveTriangleCount(json, prim);
        if (tris <= 0) continue;
        items.push({
          prim: prim,
          world: world,
          triangles: tris,
          color: materialColor(json, prim.material),
          flip: matDet3(world) < 0
        });
      }
    });
    if (!items.length) {
      fail('El archivo glTF no contiene geometría de triángulos (primitivas TRIANGLES con POSITION).');
    }
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += items[i].triangles;

    var selected = null;
    if (total > MAX_TRIANGLES) {
      selected = {};
      for (i = 0; i < MAX_TRIANGLES; i++) selected[Math.floor((i * total) / MAX_TRIANGLES)] = true;
    }

    var mesh = [];
    var globalIndex = 0;
    for (i = 0; i < items.length; i++) {
      var item = items[i];
      var positions = readAccessor(json, buffers, item.prim.attributes.POSITION, 'POSITION');
      var indices = null;
      var nVerts = positions.length;
      if (exists(item.prim.indices)) {
        indices = readAccessor(json, buffers, item.prim.indices, 'SCALAR');
      }
      var mode = exists(item.prim.mode) ? Number(item.prim.mode) : GL.TRIANGLES;
      var count = indices ? indices.length : nVerts;
      var transformed = new Array(nVerts);
      var vertexAt = function (idx) {
        if (!isFinite(idx) || idx < 0 || idx >= nVerts) return null;
        if (!transformed[idx]) {
          var raw = positions[idx];
          var wp = applyMat(item.world, raw);
          transformed[idx] = finitePoint(wp) ? wp : null;
        }
        return transformed[idx];
      };
      var emit = function (a, b, c) {
        if (a === b || b === c || a === c) return;
        var gi = globalIndex++;
        if (selected && !selected[gi]) return;
        var pa = vertexAt(a), pb = vertexAt(b), pc = vertexAt(c);
        if (!pa || !pb || !pc) return;
        // Nodo con escala negativa: se invierte el orden para conservar la
        // orientación (normales) de los triángulos.
        if (item.flip) {
          mesh.push({ points: [{ x: pa.x, y: pa.y, z: pa.z }, { x: pc.x, y: pc.y, z: pc.z },
            { x: pb.x, y: pb.y, z: pb.z }], color: item.color });
        } else {
          mesh.push({ points: [{ x: pa.x, y: pa.y, z: pa.z }, { x: pb.x, y: pb.y, z: pb.z },
            { x: pc.x, y: pc.y, z: pc.z }], color: item.color });
        }
      };
      var k;
      if (mode === GL.TRIANGLES) {
        for (k = 0; k + 2 < count; k += 3) {
          emit(indices ? indices[k] : k, indices ? indices[k + 1] : k + 1,
            indices ? indices[k + 2] : k + 2);
        }
      } else if (mode === GL.TRIANGLE_STRIP) {
        for (k = 0; k + 2 < count; k++) {
          if (k % 2 === 0) emit(indices ? indices[k] : k, indices ? indices[k + 1] : k + 1,
            indices ? indices[k + 2] : k + 2);
          else emit(indices ? indices[k + 1] : k + 1, indices ? indices[k] : k,
            indices ? indices[k + 2] : k + 2);
        }
      } else if (mode === GL.TRIANGLE_FAN) {
        for (k = 1; k + 1 < count; k++) {
          emit(indices ? indices[0] : 0, indices ? indices[k] : k, indices ? indices[k + 1] : k + 1);
        }
      }
    }

    var display = cleanName(opts && opts.name);
    if (!display) display = cleanName(name);
    if (!display) display = 'Objeto importado';
    return finish(mesh, total, display, format, [], !!selected);
  }

  // -------------------------------------------------------------------- GLB
  function parseGlb(bytes, name, opts) {
    if (bytes.length < 12) fail('El archivo GLB está dañado: cabecera incompleta.');
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var magic = dv.getUint32(0, true);
    if (magic !== 0x46546C67) fail('El archivo GLB está dañado: firma "glTF" no encontrada.');
    var version = dv.getUint32(4, true);
    if (version !== 2) fail('Versión de GLB no soportada: ' + version + ' (se requiere 2).');
    var totalLength = dv.getUint32(8, true);
    if (!isFinite(totalLength) || totalLength < 20) {
      fail('El archivo GLB está dañado: longitud de cabecera inválida.');
    }
    if (totalLength > bytes.length) {
      fail('El archivo GLB está truncado: la cabecera indica ' + totalLength +
        ' bytes y sólo hay ' + bytes.length + '.');
    }
    var limit = Math.min(totalLength, bytes.length);
    var off = 12, jsonChunk = null, binChunk = null;
    while (off + 8 <= limit) {
      var chunkLen = dv.getUint32(off, true);
      var chunkType = dv.getUint32(off + 4, true);
      var start = off + 8;
      if (chunkLen < 0 || start + chunkLen > limit) {
        fail('El archivo GLB está dañado: bloque de datos incompleto.');
      }
      var chunk = bytes.subarray(start, start + chunkLen);
      if (chunkType === CHUNK_JSON && !jsonChunk) jsonChunk = chunk;
      else if (chunkType === CHUNK_BIN && !binChunk) binChunk = chunk;
      off = start + chunkLen;
    }
    if (!jsonChunk) fail('El archivo GLB está dañado: no contiene el bloque JSON de glTF.');
    var json;
    try {
      json = JSON.parse(utf8Decode(jsonChunk));
    } catch (e) {
      fail('El archivo GLB contiene JSON inválido: ' + msgOf(e));
    }
    return buildGltf(json, binChunk, name, opts, 'glb');
  }

  // ------------------------------------------------------------------- glTF
  function parseGltf(text, name, opts) {
    var json;
    try {
      json = JSON.parse(String(text == null ? '' : text).replace(/^\uFEFF/, ''));
    } catch (e) {
      fail('El archivo glTF contiene JSON inválido: ' + msgOf(e));
    }
    return buildGltf(json, null, name, opts, 'gltf');
  }

  // ------------------------------------------------------------------- API
  function parse(file, opts) {
    opts = opts || {};
    return readInput(file, opts).then(function (input) {
      var format = detectFormat(input);
      var text = input.text;
      if (format === 'glb') {
        return parseGlb(input.bytes, input.name, opts);
      }
      if (text === null || text === undefined) text = utf8Decode(input.bytes);
      if (format === 'gltf') return parseGltf(text, input.name, opts);
      return parseObj(text, input.name, opts);
    });
  }

  ED.Importer = {
    parse: parse,
    MAX_TRIANGLES: MAX_TRIANGLES,
    DEFAULT_COLOR: DEFAULT_COLOR,
    SUPPORTED_FORMATS: ['glb', 'gltf', 'obj']
  };
})(typeof window !== 'undefined'
  ? (window.EngDraft = window.EngDraft || {})
  : (typeof globalThis !== 'undefined' ? (globalThis.EngDraft = globalThis.EngDraft || {}) : {}));

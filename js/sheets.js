/*
 * EngDraft — js/sheets.js
 * Módulo de láminas: composición vectorial compartida entre Canvas 2D (preview)
 * y un escritor PDF propio (sin dependencias, sin red, sin rasterizar el plano).
 *
 * Unidades: milímetros de PAPEL. Origen: esquina superior izquierda de la lámina,
 * eje Y hacia abajo (igual que Canvas). El plano se transforma desde el mundo
 * (mm, eje Y hacia arriba) a papel con una matriz de vista.
 *
 * API pública: window.EngDraft.Sheets (ver CONTRACT.md §8).
 */
(function (root) {
  'use strict';

  var ED = (root.EngDraft = root.EngDraft || {});
  var Sheets = {};

  /* ------------------------------------------------------------------ *
   *  Constantes
   * ------------------------------------------------------------------ */

  var SIZES = {
    A4: { w: 297, h: 210 },
    A3: { w: 420, h: 297 },
    A2: { w: 594, h: 420 },
    A1: { w: 841, h: 594 },
    Letter: { w: 279.4, h: 215.9 },
    Tabloid: { w: 431.8, h: 279.4 }
  };

  var TEMPLATES = [
    { id: 'modern', name: 'Moderna', desc: 'Banda inferior oscura con retícula y acento ámbar' },
    { id: 'classic', name: 'Clásica', desc: 'Cajetín inferior con doble borde y celdas' },
    { id: 'technical', name: 'Técnica', desc: 'Bloque lateral con retícula y tipografía monoespaciada' },
    { id: 'municipal', name: 'Municipal', desc: 'Bloque ancho inferior con casillas de revisión y firmas' }
  ];

  var SCALES = [50, 75, 100, 125, 150, 200, 250];
  var PT_PER_MM = 72 / 25.4;          // 2.834645669...
  var MM_PER_PT = 25.4 / 72;

  var PAPER = '#f8f6f0';
  var INK = '#24313d';
  var INK_SOFT = '#5b6b78';
  var RULE = '#8d9aa5';
  var HAIR = '#c9c2b2';
  var ACCENT = '#f5a623';
  var CYAN = '#48c9d8';
  var DARK = '#1b2631';
  var DARK_2 = '#243240';
  var WHITE = '#ffffff';

  var FALLBACK_LIB_COLORS = ['#dfe5ec', '#e8e2d6', '#dde7e8', '#ece3e4', '#e4e9df'];

  /* ------------------------------------------------------------------ *
   *  Utilidades numéricas / de cadenas
   * ------------------------------------------------------------------ */

  function clamp(v, a, b) {
    v = Number(v);
    if (!isFinite(v)) return a;
    return v < a ? a : (v > b ? b : v);
  }

  function num(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d;
  }

  function roundTo(v, d) {
    var p = Math.pow(10, d || 0);
    return Math.round(v * p) / p;
  }

  function fmt(v, dec) {
    var d = (dec === undefined) ? 2 : dec;
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    return n.toFixed(d);
  }

  function fmtNum(v, dec) {
    // Quita ceros sobrantes: 2.50 -> 2.5, 4.00 -> 4
    var s = fmt(v, (dec === undefined) ? 2 : dec);
    if (s.indexOf('.') >= 0) {
      s = s.replace(/0+$/, '').replace(/\.$/, '');
    }
    return s;
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < (width || 2)) s = '0' + s;
    return s;
  }

  function uid(prefix) {
    var rnd = '';
    var i;
    var chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    for (i = 0; i < 6; i++) rnd += chars.charAt(Math.floor(Math.random() * chars.length));
    return (prefix || 'id') + '_' + Date.now().toString(36) + rnd;
  }

  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

  function toArray(v) { return isArr(v) ? v : []; }

  function rad(deg) { return Number(deg) * Math.PI / 180; }
  function deg(r) { return Number(r) * 180 / Math.PI; }

  function normDeg(d) {
    d = Number(d) || 0;
    d = d % 360;
    if (d < 0) d += 360;
    return d;
  }

  function normDeg180(d) {
    // -180..180
    d = normDeg(d);
    return d > 180 ? d - 360 : d;
  }

  function escapePdfBytes(str) {
    // str ya es una cadena "binaria" (cada char = 1 byte WinAnsi).
    var out = '';
    var i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c === 40 || c === 41 || c === 92) {
        out += '\\' + String.fromCharCode(c);           // ( ) \
      } else if (c < 32 || c > 126) {
        out += '\\' + ('00' + c.toString(8)).slice(-3); // octal
      } else {
        out += String.fromCharCode(c);
      }
    }
    return out;
  }

  function pdfNum(v) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    // máximo 4 decimales, sin notación científica
    var s = n.toFixed(4);
    s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0' || s === '') s = '0';
    return s;
  }

  /* ------------------------------------------------------------------ *
   *  Colores
   * ------------------------------------------------------------------ */

  var NAMED_COLORS = {
    white: '#ffffff', black: '#000000', gray: '#808080', grey: '#808080',
    red: '#ff0000', green: '#008000', blue: '#0000ff', none: null
  };

  function parseColor(c) {
    if (c === null || c === undefined || c === '') return null;
    if (typeof c === 'object' && c.r !== undefined) {
      return { r: clamp(c.r, 0, 255), g: clamp(c.g, 0, 255), b: clamp(c.b, 0, 255) };
    }
    var s = String(c).trim().toLowerCase();
    if (s === 'none' || s === 'transparent') return null;
    if (NAMED_COLORS[s] !== undefined) s = NAMED_COLORS[s];
    if (!s) return null;
    if (s.charAt(0) === '#') {
      var h = s.slice(1);
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      if (h.length === 6) {
        var v = parseInt(h, 16);
        if (!isFinite(v)) return null;
        return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
      }
      if (h.length === 8) {
        var v8 = parseInt(h.slice(0, 6), 16);
        if (!isFinite(v8)) return null;
        return { r: (v8 >> 16) & 255, g: (v8 >> 8) & 255, b: v8 & 255 };
      }
      return null;
    }
    var m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    if (m) return { r: clamp(+m[1], 0, 255), g: clamp(+m[2], 0, 255), b: clamp(+m[3], 0, 255) };
    return null;
  }

  function toHex(rgb) {
    if (!rgb) return '#000000';
    function h(v) { var s = Math.round(clamp(v, 0, 255)).toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + h(rgb.r) + h(rgb.g) + h(rgb.b);
  }

  function mixColor(c1, c2, t) {
    var a = parseColor(c1) || { r: 0, g: 0, b: 0 };
    var b = parseColor(c2) || { r: 255, g: 255, b: 255 };
    t = clamp(t, 0, 1);
    return toHex({
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t
    });
  }

  function lighten(c, t) { return mixColor(c, '#ffffff', t); }
  function darken(c, t) { return mixColor(c, '#000000', t); }

  function inkWithOpacity(c, t) {
    // Mezcla con el papel (para tramas suaves en plano)
    return mixColor(c, PAPER, t);
  }

  /* ------------------------------------------------------------------ *
   *  Geometría: usa ED.Geo cuando existe; si no, respaldo local
   * ------------------------------------------------------------------ */

  function Geo() {
    return ED.Geo && ED.Geo.wallLength ? ED.Geo : GeoFallback;
  }

  var GeoFallback = {
    clamp: clamp,
    dist: function (a, b) {
      var dx = (b.x - a.x), dy = (b.y - a.y);
      return Math.sqrt(dx * dx + dy * dy);
    },
    angle: function (a, b) { return Math.atan2(b.y - a.y, b.x - a.x); },
    pointAt: function (a, b, t) {
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    },
    bounds: function (points) {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      var i, p;
      for (i = 0; i < (points ? points.length : 0); i++) {
        p = points[i];
        if (!p) continue;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
      return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
    },
    polygonArea: function (poly) {
      if (!poly || poly.length < 3) return 0;
      var a = 0, i, j;
      for (i = 0; i < poly.length; i++) {
        j = (i + 1) % poly.length;
        a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
      }
      return Math.abs(a) / 2;
    },
    polygonCentroid: function (poly) {
      if (!poly || !poly.length) return { x: 0, y: 0 };
      var a = 0, cx = 0, cy = 0, i, j, f;
      for (i = 0; i < poly.length; i++) {
        j = (i + 1) % poly.length;
        f = poly[i].x * poly[j].y - poly[j].x * poly[i].y;
        a += f;
        cx += (poly[i].x + poly[j].x) * f;
        cy += (poly[i].y + poly[j].y) * f;
      }
      if (Math.abs(a) < 1e-6) {
        var b = GeoFallback.bounds(poly);
        return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
      }
      a *= 0.5;
      return { x: cx / (6 * a), y: cy / (6 * a) };
    },
    wallLength: function (wall) { return GeoFallback.dist(wall.a, wall.b); },
    wallAngle: function (wall) { return GeoFallback.angle(wall.a, wall.b); },
    wallPolygon: function (wall) {
      var thk = num(wall.thickness, 150) / 2;
      var len = GeoFallback.wallLength(wall);
      if (len < 1e-6) return [{ x: wall.a.x, y: wall.a.y }];
      var nx = -(wall.b.y - wall.a.y) / len * thk;
      var ny = (wall.b.x - wall.a.x) / len * thk;
      return [
        { x: wall.a.x + nx, y: wall.a.y + ny },
        { x: wall.b.x + nx, y: wall.b.y + ny },
        { x: wall.b.x - nx, y: wall.b.y - ny },
        { x: wall.a.x - nx, y: wall.a.y - ny }
      ];
    },
    openingSpan: function (wall, op) {
      var len = GeoFallback.wallLength(wall);
      var half = num(op.width, 900) / 2;
      var c = clamp(num(op.t, 0.5), 0, 1) * len;
      return { from: clamp(c - half, 0, len), to: clamp(c + half, 0, len) };
    },
    transformPoint: function (p, origin, rotDeg) {
      var r = rad(rotDeg);
      var dx = p.x, dy = p.y;
      return {
        x: origin.x + dx * Math.cos(r) - dy * Math.sin(r),
        y: origin.y + dx * Math.sin(r) + dy * Math.cos(r)
      };
    },
    rectPolygon: function (cx, cy, w, h, rotDeg) {
      var r = rad(rotDeg), c = Math.cos(r), s = Math.sin(r);
      var pts = [
        { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
        { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }
      ];
      var out = [], i;
      for (i = 0; i < 4; i++) {
        out.push({
          x: cx + pts[i].x * c - pts[i].y * s,
          y: cy + pts[i].x * s + pts[i].y * c
        });
      }
      return out;
    },
    formatLength: function (mm, unit) {
      var m = Number(mm) / 1000;
      if (unit === 'ft') {
        var inch = Number(mm) / 25.4;
        var ft = Math.floor(inch / 12);
        var rest = inch - ft * 12;
        return ft + "'-" + (Math.round(rest * 16) / 16).toFixed(0) + '"';
      }
      return fmt(m, 2) + ' m';
    },
    formatArea: function (mm2) {
      return fmt(Number(mm2) / 1e6, 2) + ' m²';
    },
    snapAngle: function (r, stepDeg) {
      var step = rad(stepDeg || 15);
      return Math.round(r / step) * step;
    },
    deepClone: function (o) { return JSON.parse(JSON.stringify(o)); }
  };

  /* ------------------------------------------------------------------ *
   *  Base64 / data URLs / cabeceras de imágenes
   * ------------------------------------------------------------------ */

  var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var B64_LOOKUP = null;

  function b64Lookup() {
    if (B64_LOOKUP) return B64_LOOKUP;
    B64_LOOKUP = {};
    var i;
    for (i = 0; i < B64_CHARS.length; i++) B64_LOOKUP[B64_CHARS.charAt(i)] = i;
    return B64_LOOKUP;
  }

  function b64ToBytes(str) {
    var lookup = b64Lookup();
    var clean = String(str).replace(/[^A-Za-z0-9+/=]/g, '');
    var len = clean.length;
    var pad = 0;
    if (len >= 2 && clean.charAt(len - 1) === '=') pad++;
    if (len >= 2 && clean.charAt(len - 2) === '=') pad++;
    var outLen = Math.floor(len * 3 / 4) - pad;
    var out = new Uint8Array(outLen);
    var i = 0, o = 0, a, b, c, d;
    while (i < len) {
      a = lookup[clean.charAt(i)]; i++;
      b = lookup[clean.charAt(i)]; i++;
      c = clean.charAt(i) === '=' ? 0 : lookup[clean.charAt(i)]; i++;
      d = clean.charAt(i) === '=' ? 0 : lookup[clean.charAt(i)]; i++;
      if (a === undefined) a = 0;
      if (b === undefined) b = 0;
      if (c === undefined) c = 0;
      if (d === undefined) d = 0;
      if (o < outLen) out[o++] = (a << 2) | (b >> 4);
      if (o < outLen) out[o++] = ((b & 15) << 4) | (c >> 2);
      if (o < outLen) out[o++] = ((c & 3) << 6) | d;
    }
    return out;
  }

  function bytesToBinary(bytes) {
    var out = [];
    var CHUNK = 0x8000;
    var i;
    for (i = 0; i < bytes.length; i += CHUNK) {
      out.push(String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
    }
    return out.join('');
  }

  function parseDataUrl(url) {
    if (typeof url !== 'string') return null;
    if (url.slice(0, 5).toLowerCase() !== 'data:') return null;
    var comma = url.indexOf(',');
    if (comma < 0) return null;
    var header = url.slice(5, comma);
    var payload = url.slice(comma + 1);
    var isB64 = /;base64/i.test(header);
    var mime = header.split(';')[0].toLowerCase() || 'application/octet-stream';
    var bytes;
    if (isB64) {
      bytes = b64ToBytes(payload);
    } else {
      try {
        var txt = decodeURIComponent(payload);
        bytes = new Uint8Array(txt.length);
        for (var i = 0; i < txt.length; i++) bytes[i] = txt.charCodeAt(i) & 255;
      } catch (e) {
        return null;
      }
    }
    return { mime: mime, bytes: bytes };
  }

  function readU32(b, p) {
    return ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
  }

  function pngHeader(bytes) {
    if (!bytes || bytes.length < 33) return null;
    if (bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return null;
    if (bytes[4] !== 13 || bytes[5] !== 10 || bytes[6] !== 26 || bytes[7] !== 10) return null;
    var w = readU32(bytes, 16);
    var h = readU32(bytes, 20);
    return {
      w: w, h: h,
      bitDepth: bytes[24],
      colorType: bytes[25],
      compression: bytes[26],
      filter: bytes[27],
      interlace: bytes[28]
    };
  }

  function jpegHeader(bytes) {
    if (!bytes || bytes.length < 4) return null;
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
    var p = 2;
    while (p + 9 < bytes.length) {
      while (p < bytes.length && bytes[p] !== 0xFF) p++;
      while (p < bytes.length && bytes[p] === 0xFF) p++;
      if (p >= bytes.length) break;
      var marker = bytes[p];
      p++;
      if (marker === 0xD8 || marker === 0xD9 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
      if (p + 1 >= bytes.length) break;
      var segLen = (bytes[p] << 8) | bytes[p + 1];
      if (segLen < 2) break;
      if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) ||
          (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
        return {
          h: (bytes[p + 3] << 8) | bytes[p + 4],
          w: (bytes[p + 5] << 8) | bytes[p + 6],
          components: bytes[p + 7]
        };
      }
      p += segLen;
    }
    return null;
  }

  // Dimensiones de una imagen dataURL sin decodificarla (PNG o JPEG).
  function imageDims(dataUrl) {
    var parsed = parseDataUrl(dataUrl);
    if (!parsed) return null;
    var hdr = pngHeader(parsed.bytes);
    if (hdr) return { w: hdr.w, h: hdr.h, type: 'png', header: hdr, bytes: parsed.bytes };
    hdr = jpegHeader(parsed.bytes);
    if (hdr) return { w: hdr.w, h: hdr.h, type: 'jpeg', header: hdr, bytes: parsed.bytes };
    return null;
  }

  /* ------------------------------------------------------------------ *
   *  Láminas: tamaños, orientación, normalización
   * ------------------------------------------------------------------ */

  function normalizeSize(size) {
    var s = String(size || 'A3').trim();
    var keys = Object.keys(SIZES);
    var i;
    if (SIZES[s]) return s;
    for (i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === s.toLowerCase()) return keys[i];
    }
    return 'A3';
  }

  function normalizeTemplate(t) {
    var s = String(t || 'modern').toLowerCase();
    var i;
    for (i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === s) return s;
    return 'modern';
  }

  function normalizeContent(c) {
    var s = String(c || 'plan').toLowerCase().replace(/^vista-/, '').replace(/^fachada-/, '');
    if (s === '3d' || s === 'vista3d' || s === 'perspectiva') return '3d';
    if (s === 'front' || s === 'frontal' || s === 'frente') return 'front';
    if (s === 'rear' || s === 'posterior') return 'rear';
    if (s === 'right' || s === 'lateral-derecha' || s === 'lateral derecha' || s === 'derecha') return 'right';
    if (s === 'left' || s === 'lateral-izquierda' || s === 'lateral izquierda' || s === 'izquierda') return 'left';
    if (s === 'notes' || s === 'notas') return 'notes';
    if (s === 'cover' || s === 'portada') return 'cover';
    return 'plan';
  }

  function normalizeOrientation(o) {
    return String(o || 'landscape').toLowerCase() === 'portrait' ? 'portrait' : 'landscape';
  }

  // Tamaño de papel en mm con orientación aplicada.
  function pageSize(sheet) {
    var key = normalizeSize(sheet && sheet.size);
    var base = SIZES[key];
    var w = base.w, h = base.h;
    if (sheet && normalizeOrientation(sheet.orientation) === 'portrait') {
      w = base.h; h = base.w;
    }
    return { w: w, h: h };
  }

  // Factor de escala tipográfica/de cajetín relativo a A3 horizontal.
  // El mínimo evita que A4/Letter queden con tipografía ilegible al imprimir.
  function sheetK(w, h) {
    var k = Math.sqrt((w * h) / (420 * 297));
    return clamp(k, 0.82, 1.9);
  }

  function fs(base, k, min) {
    return Math.max(min || 1.6, base * k);
  }

  /* ------------------------------------------------------------------ *
   *  Inflate (RFC 1951) — necesario para decodificar PNG sin dependencias
   * ------------------------------------------------------------------ */

  var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
    35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
    3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
    257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8201, 12289, 16385, 24577];
  var DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function BitReader(data, start) {
    this.data = data;
    this.pos = start || 0;
    this.bitBuf = 0;
    this.bitCnt = 0;
  }

  BitReader.prototype.bits = function (n) {
    if (n === 0) return 0;
    while (this.bitCnt < n) {
      if (this.pos >= this.data.length) throw new Error('deflate: flujo truncado');
      this.bitBuf |= this.data[this.pos++] << this.bitCnt;
      this.bitCnt += 8;
    }
    var v = this.bitBuf & ((1 << n) - 1);
    this.bitBuf >>>= n;
    this.bitCnt -= n;
    return v;
  };

  BitReader.prototype.align = function () {
    this.bitBuf = 0;
    this.bitCnt = 0;
  };

  function buildHuffman(lengths, n) {
    var counts = new Uint16Array(16);
    var symbols = new Uint16Array(n);
    var offsets = new Uint16Array(16);
    var i, sum;
    for (i = 0; i < n; i++) {
      if (lengths[i] > 15) throw new Error('deflate: longitud inválida');
      counts[lengths[i]]++;
    }
    counts[0] = 0;
    sum = 0;
    for (i = 1; i < 16; i++) {
      offsets[i] = sum;
      sum += counts[i];
    }
    for (i = 0; i < n; i++) {
      if (lengths[i]) symbols[offsets[lengths[i]]++] = i;
    }
    return { counts: counts, symbols: symbols };
  }

  function decodeSym(br, huff) {
    var code = 0, first = 0, index = 0, count, len;
    for (len = 1; len <= 15; len++) {
      code |= br.bits(1);
      count = huff.counts[len];
      if (code - first < count) return huff.symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('deflate: código Huffman inválido');
  }

  var FIXED_LIT = null, FIXED_DIST = null;

  function ensureFixed() {
    if (FIXED_LIT) return;
    var l = new Uint8Array(288);
    var i;
    for (i = 0; i < 144; i++) l[i] = 8;
    for (i = 144; i < 256; i++) l[i] = 9;
    for (i = 256; i < 280; i++) l[i] = 7;
    for (i = 280; i < 288; i++) l[i] = 8;
    FIXED_LIT = buildHuffman(l, 288);
    var d = new Uint8Array(30);
    for (i = 0; i < 30; i++) d[i] = 5;
    FIXED_DIST = buildHuffman(d, 30);
  }

  function inflateRaw(data) {
    var br = new BitReader(data, 0);
    var out = new Uint8Array(Math.max(4096, data.length * 4));
    var outLen = 0;

    function ensure(n) {
      if (outLen + n <= out.length) return;
      var next = new Uint8Array(Math.max(out.length * 2, outLen + n + 1024));
      next.set(out.subarray(0, outLen));
      out = next;
    }

    var final = 0;
    while (!final) {
      final = br.bits(1);
      var type = br.bits(2);

      if (type === 0) {
        br.align();
        var p = br.pos;
        if (p + 4 > data.length) throw new Error('deflate: bloque almacenado truncado');
        var len = data[p] | (data[p + 1] << 8);
        var nlen = data[p + 2] | (data[p + 3] << 8);
        if (((len ^ 0xffff) & 0xffff) !== nlen) throw new Error('deflate: longitud inválida');
        p += 4;
        if (p + len > data.length) throw new Error('deflate: bloque almacenado truncado');
        ensure(len);
        out.set(data.subarray(p, p + len), outLen);
        outLen += len;
        br.pos = p + len;
        br.bitBuf = 0;
        br.bitCnt = 0;
        continue;
      }

      var litHuff, distHuff, sym, length, distance, dsym, k;

      if (type === 1) {
        ensureFixed();
        litHuff = FIXED_LIT;
        distHuff = FIXED_DIST;
      } else if (type === 2) {
        var hlit = br.bits(5) + 257;
        var hdist = br.bits(5) + 1;
        var hclen = br.bits(4) + 4;
        var clen = new Uint8Array(19);
        var ci;
        for (ci = 0; ci < hclen; ci++) clen[CLEN_ORDER[ci]] = br.bits(3);
        var clHuff = buildHuffman(clen, 19);
        var lengths = new Uint8Array(hlit + hdist);
        var idx = 0;
        while (idx < lengths.length) {
          sym = decodeSym(br, clHuff);
          if (sym < 16) {
            lengths[idx++] = sym;
          } else if (sym === 16) {
            if (idx === 0) throw new Error('deflate: repetición sin anterior');
            var prev = lengths[idx - 1];
            var rep = br.bits(2) + 3;
            while (rep-- > 0 && idx < lengths.length) lengths[idx++] = prev;
          } else if (sym === 17) {
            rep = br.bits(3) + 3;
            while (rep-- > 0 && idx < lengths.length) lengths[idx++] = 0;
          } else if (sym === 18) {
            rep = br.bits(7) + 11;
            while (rep-- > 0 && idx < lengths.length) lengths[idx++] = 0;
          } else {
            throw new Error('deflate: símbolo de longitudes inválido');
          }
        }
        litHuff = buildHuffman(lengths.subarray(0, hlit), hlit);
        distHuff = buildHuffman(lengths.subarray(hlit), hdist);
      } else {
        throw new Error('deflate: tipo de bloque reservado');
      }

      for (;;) {
        sym = decodeSym(br, litHuff);
        if (sym < 256) {
          ensure(1);
          out[outLen++] = sym;
        } else if (sym === 256) {
          break;
        } else {
          sym -= 257;
          if (sym >= 29) throw new Error('deflate: longitud inválida');
          length = LEN_BASE[sym] + (LEN_EXTRA[sym] ? br.bits(LEN_EXTRA[sym]) : 0);
          dsym = decodeSym(br, distHuff);
          if (dsym >= 30) throw new Error('deflate: distancia inválida');
          distance = DIST_BASE[dsym] + (DIST_EXTRA[dsym] ? br.bits(DIST_EXTRA[dsym]) : 0);
          if (distance > outLen) throw new Error('deflate: distancia fuera de rango');
          ensure(length);
          for (k = 0; k < length; k++) {
            out[outLen] = out[outLen - distance];
            outLen++;
          }
        }
      }
    }
    return out.subarray(0, outLen);
  }

  function inflateZlib(data) {
    if (!data || data.length < 2) throw new Error('zlib: datos vacíos');
    var cmf = data[0];
    var flg = data[1];
    if ((cmf & 15) !== 8) throw new Error('zlib: método de compresión desconocido');
    if (((cmf << 8) + flg) % 31 !== 0) throw new Error('zlib: cabecera inválida');
    var start = 2;
    if (flg & 0x20) start += 4; // FDICT
    return inflateRaw(data.subarray(start));
  }

  /* ------------------------------------------------------------------ *
   *  Decodificación PNG -> RGB (fondo blanco) y escritura zlib "stored"
   * ------------------------------------------------------------------ */

  function paeth(a, b, c) {
    var p = a + b - c;
    var pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }

  function pngChunks(bytes) {
    var chunks = [];
    var p = 8;
    while (p + 8 <= bytes.length) {
      var len = readU32(bytes, p);
      if (len > bytes.length) break;
      var type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
      var start = p + 8;
      var end = start + len;
      if (end + 4 > bytes.length) break;
      chunks.push({ type: type, start: start, end: end });
      if (type === 'IEND') break;
      p = end + 4;
    }
    return chunks;
  }

  function decodePNG(bytes) {
    var hdr = pngHeader(bytes);
    if (!hdr) return null;
    if (hdr.bitDepth !== 8 || hdr.interlace !== 0) return null;
    if (hdr.compression !== 0 || hdr.filter !== 0) return null;

    var ct = hdr.colorType;
    var channels;
    if (ct === 0) channels = 1;
    else if (ct === 2) channels = 3;
    else if (ct === 3) channels = 1;
    else if (ct === 4) channels = 2;
    else if (ct === 6) channels = 4;
    else return null;

    var chunks = pngChunks(bytes);
    var idat = [];
    var palette = null, trns = null;
    var i, c;
    for (i = 0; i < chunks.length; i++) {
      c = chunks[i];
      if (c.type === 'PLTE') palette = bytes.subarray(c.start, c.end);
      else if (c.type === 'tRNS') trns = bytes.subarray(c.start, c.end);
      else if (c.type === 'IDAT') idat.push(bytes.subarray(c.start, c.end));
    }
    if (!idat.length) return null;
    if (ct === 3 && !palette) return null;

    var total = 0;
    for (i = 0; i < idat.length; i++) total += idat[i].length;
    var compressed = new Uint8Array(total);
    var off = 0;
    for (i = 0; i < idat.length; i++) {
      compressed.set(idat[i], off);
      off += idat[i].length;
    }

    var raw;
    try {
      raw = inflateZlib(compressed);
    } catch (e) {
      return null;
    }

    var w = hdr.w, h = hdr.h;
    if (!w || !h) return null;
    var rowBytes = w * channels;
    var stride = rowBytes + 1;
    if (raw.length < stride * h) return null;

    // Desfiltrado PNG (tipos 0..4)
    var rgba = new Uint8Array(w * h * 4);
    var prev = new Uint8Array(rowBytes);
    var cur = new Uint8Array(rowBytes);
    var x, y, f, a, b, cc, v;
    for (y = 0; y < h; y++) {
      var rowStart = y * stride;
      f = raw[rowStart];
      for (x = 0; x < rowBytes; x++) {
        a = x >= channels ? cur[x - channels] : 0;
        b = prev[x];
        cc = x >= channels ? prev[x - channels] : 0;
        v = raw[rowStart + 1 + x];
        if (f === 1) v = (v + a) & 255;
        else if (f === 2) v = (v + b) & 255;
        else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
        else if (f === 4) v = (v + paeth(a, b, cc)) & 255;
        else if (f !== 0) return null;
        cur[x] = v;
      }
      // Convertir a RGBA
      var o = y * w * 4;
      for (x = 0; x < w; x++) {
        var r, g, bl, al = 255;
        if (ct === 0) {
          r = g = bl = cur[x];
        } else if (ct === 2) {
          r = cur[x * 3]; g = cur[x * 3 + 1]; bl = cur[x * 3 + 2];
        } else if (ct === 3) {
          var pi = cur[x] * 3;
          r = palette[pi]; g = palette[pi + 1]; bl = palette[pi + 2];
          if (trns && cur[x] < trns.length) al = trns[cur[x]];
        } else if (ct === 4) {
          r = g = bl = cur[x * 2];
          al = cur[x * 2 + 1];
        } else {
          r = cur[x * 4]; g = cur[x * 4 + 1]; bl = cur[x * 4 + 2]; al = cur[x * 4 + 3];
        }
        rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = bl; rgba[o + 3] = al;
        o += 4;
      }
      var tmp = prev; prev = cur; cur = tmp;
    }

    // Aplanar sobre blanco + reducción opcional
    var maxSide = 1500;
    var scale = 1;
    if (Math.max(w, h) > maxSide) scale = maxSide / Math.max(w, h);
    var ow = Math.max(1, Math.round(w * scale));
    var oh = Math.max(1, Math.round(h * scale));
    var out = new Uint8Array(ow * oh * 3);
    var ox, oy, sx, sy, si, di, alpha, inv;
    for (oy = 0; oy < oh; oy++) {
      sy = scale === 1 ? oy : Math.min(h - 1, Math.floor(oy / scale));
      for (ox = 0; ox < ow; ox++) {
        sx = scale === 1 ? ox : Math.min(w - 1, Math.floor(ox / scale));
        si = (sy * w + sx) * 4;
        di = (oy * ow + ox) * 3;
        alpha = rgba[si + 3] / 255;
        inv = 1 - alpha;
        out[di] = Math.round(rgba[si] * alpha + 255 * inv);
        out[di + 1] = Math.round(rgba[si + 1] * alpha + 255 * inv);
        out[di + 2] = Math.round(rgba[si + 2] * alpha + 255 * inv);
      }
    }
    return { w: ow, h: oh, rgb: out };
  }

  // Deflate "stored" (sin compresión) envuelto en zlib: válido según RFC 1950/1951.
  function zlibStore(data) {
    var blocks = Math.max(1, Math.ceil(data.length / 65535));
    var out = new Uint8Array(2 + data.length + blocks * 5 + 4);
    var o = 0;
    out[o++] = 0x78;
    out[o++] = 0x01;
    var pos = 0;
    do {
      var n = Math.min(65535, data.length - pos);
      var finalBit = (pos + n >= data.length) ? 1 : 0;
      out[o++] = finalBit;
      out[o++] = n & 255;
      out[o++] = (n >> 8) & 255;
      var nl = (~n) & 0xffff;
      out[o++] = nl & 255;
      out[o++] = (nl >> 8) & 255;
      out.set(data.subarray(pos, pos + n), o);
      o += n;
      pos += n;
    } while (pos < data.length);
    var a = 1, b = 0, i;
    for (i = 0; i < data.length; i++) {
      a = (a + data[i]) % 65521;
      b = (b + a) % 65521;
    }
    out[o++] = (b >> 8) & 255;
    out[o++] = b & 255;
    out[o++] = (a >> 8) & 255;
    out[o++] = a & 255;
    return out.subarray(0, o);
  }

  /* ------------------------------------------------------------------ *
   *  Texto: métricas Helvetica/Courier + codificación WinAnsi (español)
   * ------------------------------------------------------------------ */

  // Anchos AFM (1/1000 em) para códigos ASCII 32..126.
  var HELV_W = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
  ];

  var HELV_BOLD_W = [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
  ];

  var SPECIAL_W = {
    176: 400,   // °
    170: 333,   // ª
    186: 333,   // º
    183: 278,   // ·
    178: 333,   // ²
    179: 333,   // ³
    185: 333,   // ¹
    188: 834,   // ¼
    189: 834,   // ½
    190: 834,   // ¾
    191: 556,   // ¿
    161: 333,   // ¡
    8364: 556,  // €
    8211: 556,  // –
    8212: 1000, // —
    8216: 191, 8217: 191, 8218: 191,
    8220: 333, 8221: 333, 8222: 333,
    8230: 1000, // …
    8226: 350,  // •
    8482: 1000, // ™
    8224: 556, 8225: 556
  };

  var WINANSI_SPECIAL = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
    0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
    0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
    0x017E: 0x9E, 0x0178: 0x9F
  };

  function winAnsiByte(code) {
    if (code >= 0x20 && code <= 0x7E) return code;
    if (code >= 0xA0 && code <= 0xFF) return code;
    if (WINANSI_SPECIAL[code] !== undefined) return WINANSI_SPECIAL[code];
    if (code === 10 || code === 13 || code === 9) return 32;
    return 0x3F; // '?'
  }

  function encodeWinAnsi(str) {
    var s = String(str === null || str === undefined ? '' : str).replace(/[\r\n\t]+/g, ' ');
    var out = '';
    var i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        var lo = s.charCodeAt(i + 1);
        if (lo >= 0xDC00 && lo <= 0xDFFF) {
          out += '?';
          i++;
          continue;
        }
      }
      out += String.fromCharCode(winAnsiByte(c));
    }
    return out;
  }

  function baseAsciiFor(code) {
    if (code < 128) return code;
    var ch;
    try {
      ch = String.fromCharCode(code).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (e) {
      ch = '';
    }
    if (ch.length === 1) {
      var c = ch.charCodeAt(0);
      if (c >= 32 && c < 127) return c;
    }
    return 0;
  }

  function charWidthUnits(code, bold, mono) {
    if (mono) return 600;
    if (code >= 32 && code <= 126) {
      return (bold ? HELV_BOLD_W : HELV_W)[code - 32];
    }
    if (SPECIAL_W[code] !== undefined) return SPECIAL_W[code];
    var base = baseAsciiFor(code);
    if (base) return (bold ? HELV_BOLD_W : HELV_W)[base - 32];
    return bold ? 556 : 500;
  }

  function measureTextWidth(str, style) {
    style = style || {};
    var size = num(style.size, 2.5);
    var bold = !!style.bold;
    var mono = style.font === 'mono';
    var s = String(str === null || str === undefined ? '' : str);
    var total = 0, i;
    for (i = 0; i < s.length; i++) {
      total += charWidthUnits(s.charCodeAt(i), bold, mono);
    }
    return total / 1000 * size;
  }

  function fontNameFor(style) {
    style = style || {};
    var mono = style.font === 'mono';
    if (mono) return style.bold ? 'F4' : 'F3';
    return style.bold ? 'F2' : 'F1';
  }

  function wrapTextLines(str, maxWidth, style) {
    var paragraphs = String(str === null || str === undefined ? '' : str).split(/\r?\n/);
    var lines = [];
    var pi, words, line, test, wi;
    for (pi = 0; pi < paragraphs.length; pi++) {
      var para = paragraphs[pi].replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
      if (!para) {
        lines.push('');
        continue;
      }
      words = para.split(' ');
      line = '';
      for (wi = 0; wi < words.length; wi++) {
        var word = words[wi];
        test = line ? line + ' ' + word : word;
        if (measureTextWidth(test, style) <= maxWidth || !line) {
          if (!line && measureTextWidth(word, style) > maxWidth && maxWidth > 0) {
            // Partir palabras largas
            var rest = word;
            while (measureTextWidth(rest, style) > maxWidth && rest.length > 1) {
              var cut = 1;
              while (cut < rest.length && measureTextWidth(rest.slice(0, cut + 1), style) <= maxWidth) cut++;
              lines.push(rest.slice(0, cut));
              rest = rest.slice(cut);
            }
            line = rest;
          } else {
            line = test;
          }
        } else {
          lines.push(line);
          line = word;
        }
      }
      if (line || !words.length) lines.push(line);
    }
    return lines;
  }

  function fitTextSize(str, maxWidth, style, minSize) {
    var st = {};
    var key;
    for (key in style) if (Object.prototype.hasOwnProperty.call(style, key)) st[key] = style[key];
    var size = num(st.size, 2.5);
    var w = measureTextWidth(str, st);
    if (w > maxWidth && w > 0) {
      size = Math.max(minSize || 1.6, size * (maxWidth / w));
      st.size = size;
    }
    return st;
  }

  /* ------------------------------------------------------------------ *
   *  Pintor abstracto: primitivas comunes Canvas 2D / PDF
   * ------------------------------------------------------------------ */

  function PainterBase() {
    this.pathStarted = false;
  }

  PainterBase.prototype._wantFill = function (style) {
    return !!(style && style.fill && parseColor(style.fill));
  };

  PainterBase.prototype._wantStroke = function (style) {
    return !!(style && style.stroke && parseColor(style.stroke));
  };

  PainterBase.prototype.stroke = function (style) {
    this.paint(style, false, true);
  };

  PainterBase.prototype.fill = function (style) {
    this.paint(style, true, false);
  };

  PainterBase.prototype.fillStroke = function (style) {
    this.paint(style, true, true);
  };

  PainterBase.prototype.line = function (x1, y1, x2, y2, style) {
    this.beginPath();
    this.moveTo(x1, y1);
    this.lineTo(x2, y2);
    this.stroke(style);
  };

  PainterBase.prototype.polyline = function (pts, style, close) {
    if (!pts || pts.length < 2) return;
    this.beginPath();
    this.moveTo(pts[0].x, pts[0].y);
    var i;
    for (i = 1; i < pts.length; i++) this.lineTo(pts[i].x, pts[i].y);
    if (close) this.closePath();
    if (close) {
      this.paint(style, this._wantFill(style), this._wantStroke(style));
    } else {
      this.stroke(style);
    }
  };

  PainterBase.prototype.polygon = function (pts, style) {
    if (!pts || pts.length < 2) return;
    this.beginPath();
    this.moveTo(pts[0].x, pts[0].y);
    var i;
    for (i = 1; i < pts.length; i++) this.lineTo(pts[i].x, pts[i].y);
    this.closePath();
    var doFill = this._wantFill(style);
    var doStroke = this._wantStroke(style);
    if (doFill && doStroke) this.paint(style, true, true);
    else if (doFill) this.paint(style, true, false);
    else this.paint(style, false, true);
  };

  PainterBase.prototype.roundedRectPath = function (x, y, w, h, r) {
    r = clamp(r || 0, 0, Math.min(w, h) / 2);
    if (!r) {
      this.moveTo(x, y);
      this.lineTo(x + w, y);
      this.lineTo(x + w, y + h);
      this.lineTo(x, y + h);
      this.closePath();
      return;
    }
    var k = 0.5522847498 * r;
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.curveTo(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.curveTo(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.curveTo(x + r - k, y + h, x, y + h - r + k, x, y + h - r);
    this.lineTo(x, y + r);
    this.curveTo(x, y + r - k, x + r - k, y, x + r, y);
    this.closePath();
  };

  PainterBase.prototype.rect = function (x, y, w, h, style) {
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    if (w === 0 && h === 0) return;
    this.beginPath();
    if (style && style.radius) this.roundedRectPath(x, y, w, h, style.radius);
    else this.rectPath(x, y, w, h);
    var doF = this._wantFill(style);
    var doS = this._wantStroke(style);
    if (doF || doS) this.paint(style, doF, doS);
  };

  PainterBase.prototype.arcPath = function (cx, cy, r, a0, a1) {
    if (!(r > 0)) return;
    var delta = a1 - a0;
    if (Math.abs(delta) < 1e-9) return;
    var steps = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
    var step = delta / steps;
    var t = 4 / 3 * Math.tan(step / 4);
    var a = a0;
    var p0x = cx + r * Math.cos(a);
    var p0y = cy + r * Math.sin(a);
    this.moveTo(p0x, p0y);
    var i, next, p3x, p3y, c1x, c1y, c2x, c2y;
    for (i = 0; i < steps; i++) {
      next = a + step;
      p3x = cx + r * Math.cos(next);
      p3y = cy + r * Math.sin(next);
      c1x = p0x - t * r * Math.sin(a);
      c1y = p0y + t * r * Math.cos(a);
      c2x = p3x + t * r * Math.sin(next);
      c2y = p3y - t * r * Math.cos(next);
      this.curveTo(c1x, c1y, c2x, c2y, p3x, p3y);
      a = next;
      p0x = p3x;
      p0y = p3y;
    }
  };

  PainterBase.prototype.circlePath = function (cx, cy, r) {
    this.arcPath(cx, cy, r, 0, Math.PI * 2);
  };

  PainterBase.prototype.circle = function (cx, cy, r, style) {
    if (!(r > 0)) return;
    this.beginPath();
    this.circlePath(cx, cy, r);
    var doF = this._wantFill(style);
    var doS = this._wantStroke(style);
    if (doF || doS) this.paint(style, doF, doS);
  };

  PainterBase.prototype.arc = function (cx, cy, r, a0, a1, style) {
    this.beginPath();
    this.arcPath(cx, cy, r, a0, a1);
    this.stroke(style);
  };

  PainterBase.prototype.clipRect = function (x, y, w, h, fn) {
    this.save();
    this.beginPath();
    this.rectPath(x, y, w, h);
    this.clip();
    if (fn) fn();
    this.restore();
  };

  PainterBase.prototype.measureText = function (str, style) {
    return measureTextWidth(str, style);
  };

  /* ------------------------------------------------------------------ *
   *  Escritor PDF 1.4 (objetos, xref, páginas, fuentes estándar, imágenes)
   * ------------------------------------------------------------------ */

  // Cabecera PDF puramente ASCII: todos los caracteres de la cadena final
  // representan exactamente un byte, de modo que los offsets del xref coinciden
  // con los bytes reales al convertirla con pdfStringToBytes().
  var PDF_HEADER = '%PDF-1.4\n%EngDraft\n';

  function pdfStream(dict, data) {
    return '<< ' + dict + ' /Length ' + data.length + ' >>\nstream\n' + data + '\nendstream';
  }

  function rgbOp(color, op) {
    var c = parseColor(color) || { r: 0, g: 0, b: 0 };
    return pdfNum(c.r / 255) + ' ' + pdfNum(c.g / 255) + ' ' + pdfNum(c.b / 255) + ' ' + op;
  }

  function pdfDate(d) {
    d = d || new Date();
    var off = -d.getTimezoneOffset();
    var sign = off >= 0 ? '+' : '-';
    off = Math.abs(off);
    return 'D:' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) +
      sign + pad(Math.floor(off / 60)) + "'" + pad(off % 60) + "'";
  }

  function PDFDocument(meta) {
    this.meta = meta || {};
    this.objects = [];
    this.nextNum = 1;
    this.pages = [];
    this.imageObjects = {};
    this.catalogNum = this.alloc(null);
    this.pagesNum = this.alloc(null);
    this.fonts = {
      F1: this.alloc('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
      F2: this.alloc('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
      F3: this.alloc('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'),
      F4: this.alloc('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>')
    };
    this.infoNum = this.alloc(null);
  }

  PDFDocument.prototype.alloc = function (data) {
    var n = this.nextNum++;
    this.objects[n - 1] = data;
    return n;
  };

  PDFDocument.prototype.set = function (n, data) {
    this.objects[n - 1] = data;
  };

  PDFDocument.prototype.addPage = function (wmm, hmm) {
    var page = new PDFPage(this, wmm, hmm);
    this.pages.push(page);
    return page;
  };

  PDFDocument.prototype.embedImage = function (dataUrl, dims) {
    var dict, streamData, num;
    try {
      if (dims.type === 'jpeg') {
        var comps = dims.header.components || 3;
        var cs = comps === 4 ? '/DeviceCMYK' : (comps === 1 ? '/DeviceGray' : '/DeviceRGB');
        dict = '/Type /XObject /Subtype /Image /Width ' + dims.w + ' /Height ' + dims.h +
          ' /ColorSpace ' + cs + ' /BitsPerComponent 8 /Filter /DCTDecode';
        if (comps === 4) dict += ' /Decode [1 0 1 0 1 0 1 0]';
        streamData = bytesToBinary(dims.bytes);
      } else {
        var dec = decodePNG(dims.bytes);
        if (!dec) return null;
        var compressed = zlibStore(dec.rgb);
        dict = '/Type /XObject /Subtype /Image /Width ' + dec.w + ' /Height ' + dec.h +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode';
        streamData = bytesToBinary(compressed);
      }
      num = this.alloc(pdfStream(dict, streamData));
    } catch (e) {
      return null;
    }
    return { num: num, w: dims.w, h: dims.h };
  };

  PDFDocument.prototype.build = function () {
    var i, page, pageNum, contentNum, resources, num, name;
    var pageNums = [];

    for (i = 0; i < this.pages.length; i++) {
      page = this.pages[i];
      var content = 'q\n1 J 1 j\n' + page.content + 'Q\n';
      pageNum = this.alloc(null);
      contentNum = this.alloc(pdfStream('', content));

      resources = '<< /Font << /F1 ' + this.fonts.F1 + ' 0 R /F2 ' + this.fonts.F2 +
        ' 0 R /F3 ' + this.fonts.F3 + ' 0 R /F4 ' + this.fonts.F4 + ' 0 R >>';
      if (page.imageSeq > 0) {
        resources += ' /XObject <<';
        for (num in page.images) {
          if (!Object.prototype.hasOwnProperty.call(page.images, num)) continue;
          name = page.images[num];
          resources += ' /' + name + ' ' + num + ' 0 R';
        }
        resources += ' >>';
      }
      resources += ' >>';

      this.set(pageNum, '<< /Type /Page /Parent ' + this.pagesNum + ' 0 R /MediaBox [0 0 ' +
        pdfNum(page.wmm * PT_PER_MM) + ' ' + pdfNum(page.hmm * PT_PER_MM) + '] /Resources ' +
        resources + ' /Contents ' + contentNum + ' 0 R >>');
      pageNums.push(pageNum);
    }

    if (!pageNums.length) {
      // Un PDF válido necesita al menos una página.
      pageNum = this.alloc(null);
      contentNum = this.alloc(pdfStream('', 'q\nQ\n'));
      this.set(pageNum, '<< /Type /Page /Parent ' + this.pagesNum + ' 0 R /MediaBox [0 0 ' +
        pdfNum(420 * PT_PER_MM) + ' ' + pdfNum(297 * PT_PER_MM) + '] /Resources << >> /Contents ' +
        contentNum + ' 0 R >>');
      pageNums.push(pageNum);
    }

    var kids = [];
    for (i = 0; i < pageNums.length; i++) kids.push(pageNums[i] + ' 0 R');
    this.set(this.pagesNum, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' +
      pageNums.length + ' >>');
    this.set(this.catalogNum, '<< /Type /Catalog /Pages ' + this.pagesNum + ' 0 R >>');

    var title = escapePdfBytes(encodeWinAnsi(this.meta.title || 'EngDraft'));
    var subject = escapePdfBytes(encodeWinAnsi(this.meta.subject || 'Planos arquitectónicos'));
    var info = '<< /Title (' + title + ') /Subject (' + subject + ')' +
      ' /Producer (EngDraft ' + escapePdfBytes(this.meta.version || '1.0') + ')' +
      ' /Creator (EngDraft - Lamina y PDF vectorial)' +
      ' /CreationDate (' + pdfDate(this.meta.date || new Date()) + ')' +
      ' /ModDate (' + pdfDate(this.meta.date || new Date()) + ') >>';
    this.set(this.infoNum, info);

    var out = PDF_HEADER;
    var offsets = [];
    var n;
    for (n = 1; n <= this.objects.length; n++) {
      offsets[n] = out.length;
      out += n + ' 0 obj\n' + this.objects[n - 1] + '\nendobj\n';
    }
    var xrefPos = out.length;
    out += 'xref\n0 ' + (this.objects.length + 1) + '\n0000000000 65535 f \n';
    for (n = 1; n <= this.objects.length; n++) {
      out += ('0000000000' + offsets[n]).slice(-10) + ' 00000 n \n';
    }
    out += 'trailer\n<< /Size ' + (this.objects.length + 1) + ' /Root ' + this.catalogNum +
      ' 0 R /Info ' + this.infoNum + ' 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n';
    return out;
  };

  function PDFPage(doc, wmm, hmm) {
    this.doc = doc;
    this.wmm = wmm;
    this.hmm = hmm;
    this.content = '';
    this.images = {};
    this.imageSeq = 0;
  }

  PDFPage.prototype.addImage = function (dataUrl, dims) {
    var cached = this.doc.imageObjects[dataUrl];
    if (!cached) {
      cached = this.doc.embedImage(dataUrl, dims);
      if (!cached) return null;
      this.doc.imageObjects[dataUrl] = cached;
    }
    var key = String(cached.num);
    if (!this.images[key]) {
      this.imageSeq++;
      this.images[key] = 'Im' + this.imageSeq;
    }
    return this.images[key];
  };

  /* --------------------------- Pintor PDF --------------------------- */

  function PDFPainter(page) {
    PainterBase.call(this);
    this.page = page;
    this.h = page.hmm;
    this.tmp = [];
  }

  PDFPainter.prototype = Object.create(PainterBase.prototype);
  PDFPainter.prototype.constructor = PDFPainter;

  PDFPainter.prototype.push = function (s) {
    this.page.content += s;
  };

  PDFPainter.prototype.px = function (mm) {
    return pdfNum(mm * PT_PER_MM);
  };

  PDFPainter.prototype.py = function (mm) {
    return pdfNum((this.h - mm) * PT_PER_MM);
  };

  PDFPainter.prototype.save = function () { this.push('q\n'); };
  PDFPainter.prototype.restore = function () { this.push('Q\n'); };

  PDFPainter.prototype.beginPath = function () {
    this.tmp = [];
    this.pathStarted = true;
  };

  PDFPainter.prototype.moveTo = function (x, y) {
    this.tmp.push(this.px(x) + ' ' + this.py(y) + ' m');
  };

  PDFPainter.prototype.lineTo = function (x, y) {
    this.tmp.push(this.px(x) + ' ' + this.py(y) + ' l');
  };

  PDFPainter.prototype.curveTo = function (x1, y1, x2, y2, x3, y3) {
    this.tmp.push(this.px(x1) + ' ' + this.py(y1) + ' ' + this.px(x2) + ' ' + this.py(y2) +
      ' ' + this.px(x3) + ' ' + this.py(y3) + ' c');
  };

  PDFPainter.prototype.rectPath = function (x, y, w, h) {
    this.tmp.push(this.px(x) + ' ' + this.py(y + h) + ' ' + pdfNum(w * PT_PER_MM) + ' ' +
      pdfNum(h * PT_PER_MM) + ' re');
  };

  PDFPainter.prototype.closePath = function () {
    this.tmp.push('h');
  };

  PDFPainter.prototype.clip = function () {
    this.push(this.tmp.join('\n') + '\nW n\n');
    this.tmp = [];
  };

  PDFPainter.prototype.paint = function (style, doFill, doStroke) {
    style = style || {};
    var lw = Math.max(num(style.lineWidth, 0.25), 0.05);
    var ops = this.px(lw) + ' w\n';
    if (style.dash && style.dash.length) {
      var arr = [], i;
      for (i = 0; i < style.dash.length; i++) arr.push(pdfNum(Math.abs(style.dash[i]) * PT_PER_MM));
      ops += '[' + arr.join(' ') + '] 0 d\n';
    } else {
      ops += '[] 0 d\n';
    }
    ops += rgbOp(style.stroke, 'RG') + '\n' + rgbOp(style.fill, 'rg') + '\n';
    ops += this.tmp.join('\n') + '\n';
    ops += (doFill && doStroke) ? 'B\n' : (doFill ? 'f\n' : 'S\n');
    this.push(ops);
  };

  PDFPainter.prototype.text = function (str, x, y, style) {
    str = str === null || str === undefined ? '' : String(str);
    if (!str) return;
    style = style || {};
    var size = Math.max(0.6, num(style.size, 2.5));
    var width = measureTextWidth(str, style);
    var align = style.align || 'left';
    var ox = align === 'center' ? -width / 2 : (align === 'right' ? -width : 0);
    var baseline = style.baseline || 'alphabetic';
    var oy = baseline === 'top' ? size * 0.80 : (baseline === 'middle' ? size * 0.36 : 0);
    var rot = num(style.rotate, 0);
    var a = 1, b = 0, c = 0, d = 1;
    if (rot) {
      var r = rad(rot);
      var cs = Math.cos(r), sn = Math.sin(r);
      var pxo = ox * cs - oy * sn;
      var pyo = ox * sn + oy * cs;
      x += pxo;
      y += pyo;
      a = cs; b = -sn; c = sn; d = cs;
    } else {
      x += ox;
      y += oy;
    }
    var encoded = escapePdfBytes(encodeWinAnsi(str));
    var color = parseColor(style.color) || { r: 0, g: 0, b: 0 };
    var rgb = pdfNum(color.r / 255) + ' ' + pdfNum(color.g / 255) + ' ' + pdfNum(color.b / 255) + ' rg';
    this.push('BT\n/' + fontNameFor(style) + ' ' + pdfNum(size * PT_PER_MM) + ' Tf\n' + rgb +
      '\n' + pdfNum(a) + ' ' + pdfNum(b) + ' ' + pdfNum(c) + ' ' + pdfNum(d) + ' ' +
      this.px(x) + ' ' + this.py(y) + ' Tm\n(' + encoded + ') Tj\nET\n');
  };

  PDFPainter.prototype.image = function (dataUrl, x, y, w, h) {
    if (!dataUrl || !(w > 0) || !(h > 0)) return false;
    var dims = imageDims(dataUrl);
    if (!dims) return false;
    var name = this.page.addImage(dataUrl, dims);
    if (!name) return false;
    this.push('q\n' + pdfNum(w * PT_PER_MM) + ' 0 0 ' + pdfNum(h * PT_PER_MM) + ' ' +
      this.px(x) + ' ' + this.py(y + h) + ' cm\n/' + name + ' Do\nQ\n');
    return true;
  };

  /* --------------------------- Pintor Canvas --------------------------- */

  var SANS_FONT = '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';
  var MONO_FONT = 'Consolas, "Courier New", monospace';

  function CanvasPainter(canvas, scale, offX, offY) {
    PainterBase.call(this);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = scale || 1;
    this.offX = offX || 0;
    this.offY = offY || 0;
    this.ctx.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.miterLimit = 4;
    this.images = CanvasPainter.imageCache;
    this.onImageReady = null;
  }

  CanvasPainter.imageCache = {};

  CanvasPainter.prototype = Object.create(PainterBase.prototype);
  CanvasPainter.prototype.constructor = CanvasPainter;

  CanvasPainter.prototype.save = function () { this.ctx.save(); };
  CanvasPainter.prototype.restore = function () { this.ctx.restore(); };
  CanvasPainter.prototype.beginPath = function () { this.ctx.beginPath(); this.pathStarted = true; };
  CanvasPainter.prototype.moveTo = function (x, y) { this.ctx.moveTo(x, y); };
  CanvasPainter.prototype.lineTo = function (x, y) { this.ctx.lineTo(x, y); };
  CanvasPainter.prototype.curveTo = function (x1, y1, x2, y2, x3, y3) {
    this.ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
  };
  CanvasPainter.prototype.rectPath = function (x, y, w, h) { this.ctx.rect(x, y, w, h); };
  CanvasPainter.prototype.closePath = function () { this.ctx.closePath(); };
  CanvasPainter.prototype.clip = function () { this.ctx.clip(); };

  CanvasPainter.prototype.paint = function (style, doFill, doStroke) {
    style = style || {};
    var ctx = this.ctx;
    if (doFill) {
      var f = parseColor(style.fill);
      ctx.fillStyle = f ? toHex(f) : '#000000';
    }
    if (doStroke) {
      var s = parseColor(style.stroke);
      ctx.strokeStyle = s ? toHex(s) : '#000000';
      ctx.lineWidth = Math.max(0.02, num(style.lineWidth, 0.25));
      if (style.dash && style.dash.length) ctx.setLineDash(style.dash);
      else ctx.setLineDash([]);
    }
    if (doFill) ctx.fill();
    if (doStroke) ctx.stroke();
  };

  CanvasPainter.prototype.text = function (str, x, y, style) {
    str = str === null || str === undefined ? '' : String(str);
    if (!str) return;
    style = style || {};
    var ctx = this.ctx;
    var size = Math.max(0.5, num(style.size, 2.5));
    ctx.save();
    ctx.translate(x, y);
    if (style.rotate) ctx.rotate(rad(style.rotate));
    ctx.font = (style.bold ? 'bold ' : '') + size + 'px ' +
      (style.font === 'mono' ? MONO_FONT : SANS_FONT);
    ctx.fillStyle = toHex(parseColor(style.color) || { r: 0, g: 0, b: 0 });
    ctx.textAlign = style.align || 'left';
    ctx.textBaseline = style.baseline || 'alphabetic';
    ctx.fillText(str, 0, 0);
    ctx.restore();
  };

  CanvasPainter.prototype.image = function (dataUrl, x, y, w, h) {
    if (!dataUrl || !(w > 0) || !(h > 0)) return false;
    var rec = this.images[dataUrl];
    if (rec && rec.status === 'ok') {
      try {
        this.ctx.drawImage(rec.img, x, y, w, h);
        return true;
      } catch (e) {
        return false;
      }
    }
    if (rec && rec.status === 'failed') return false;
    if (typeof Image === 'undefined') {
      this.images[dataUrl] = { status: 'failed' };
      return false;
    }
    var self = this;
    rec = this.images[dataUrl] = { status: 'loading' };
    var img = new Image();
    img.onload = function () {
      rec.status = 'ok';
      rec.img = img;
      if (typeof self.onImageReady === 'function') self.onImageReady();
    };
    img.onerror = function () {
      rec.status = 'failed';
      if (typeof self.onImageReady === 'function') self.onImageReady();
    };
    img.src = dataUrl;
    return false;
  };

  /* ------------------------------------------------------------------ *
   *  Modelo: niveles, capas, vista mundo->papel, límites del plano
   * ------------------------------------------------------------------ */

  function findLevel(project, levelId) {
    var levels = toArray(project && project.levels);
    var i;
    for (i = 0; i < levels.length; i++) {
      if (levels[i] && levels[i].id === levelId) return levels[i];
    }
    return levels.length ? levels[0] : null;
  }

  function filterLevel(list, levelId) {
    var out = [];
    var i, o;
    for (i = 0; i < toArray(list).length; i++) {
      o = list[i];
      if (!o) continue;
      if (levelId && o.level && o.level !== levelId) continue;
      out.push(o);
    }
    return out;
  }

  function layerOf(project, id) {
    var layers = toArray(project && project.layers);
    var i;
    for (i = 0; i < layers.length; i++) {
      if (layers[i] && layers[i].id === id) return layers[i];
    }
    return null;
  }

  function layerVisible(project, id) {
    var layer = layerOf(project, id);
    return !layer || layer.visible !== false;
  }

  function layerColor(project, id, fallback) {
    var layer = layerOf(project, id);
    return (layer && layer.color) || fallback || INK;
  }

  function levelElevationText(level, units) {
    if (!level) return '';
    var mm = num(level.elevation, 0);
    var s;
    if (String(units || 'm').toLowerCase() === 'ft') {
      s = (mm >= 0 ? '+' : '') + fmt(mm / 304.8, 2) + ' ft';
    } else {
      s = (mm >= 0 ? '+' : '') + fmt(mm / 1000, 2) + ' m';
    }
    return 'NIVEL ' + s;
  }

  function metaline(level, units) {
    if (!level) return '';
    var parts = [];
    if (level.name) parts.push(String(level.name).toUpperCase());
    parts.push(levelElevationText(level, units));
    return parts.join('  ·  ');
  }

  function makeView(cx, cy, wx, wy, f) {
    return {
      f: f,
      cx: cx,
      cy: cy,
      wx: wx,
      wy: wy,
      pt: function (p) {
        return { x: this.cx + (p.x - this.wx) * this.f, y: this.cy - (p.y - this.wy) * this.f };
      },
      x: function (x) { return this.cx + (x - this.wx) * this.f; },
      y: function (y) { return this.cy - (y - this.wy) * this.f; },
      len: function (mm) { return mm * this.f; },
      invX: function (px) { return this.wx + (px - this.cx) / this.f; },
      invY: function (py) { return this.wy - (py - this.cy) / this.f; }
    };
  }

  function mapPts(pts, view) {
    var out = [];
    var i;
    for (i = 0; i < (pts ? pts.length : 0); i++) {
      if (pts[i]) out.push(view.pt(pts[i]));
    }
    return out;
  }

  function planBounds(project, levelId) {
    project = project || {};
    var pts = [];
    var i, j, w, poly;
    var walls = filterLevel(project.walls, levelId);
    for (i = 0; i < walls.length; i++) {
      w = walls[i];
      if (!w || !w.a || !w.b) continue;
      poly = Geo().wallPolygon(w);
      for (j = 0; j < poly.length; j++) pts.push(poly[j]);
    }
    var rooms = filterLevel(project.rooms, levelId);
    for (i = 0; i < rooms.length; i++) {
      poly = rooms[i] && rooms[i].polygon;
      for (j = 0; j < toArray(poly).length; j++) pts.push(poly[j]);
    }
    var items = filterLevel(project.items, levelId);
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      var corners = Geo().rectPolygon(num(it.x, 0), num(it.y, 0),
        Math.max(100, num(it.w, 600)), Math.max(100, num(it.d, 600)), num(it.rotation, 0));
      for (j = 0; j < corners.length; j++) pts.push(corners[j]);
    }
    var texts = filterLevel(project.texts, levelId);
    for (i = 0; i < texts.length; i++) {
      if (texts[i]) pts.push({ x: num(texts[i].x, 0), y: num(texts[i].y, 0) });
    }
    var dims = filterLevel(project.dims, levelId);
    for (i = 0; i < dims.length; i++) {
      var d = dims[i];
      if (!d || !d.a || !d.b) continue;
      var dx = d.b.x - d.a.x, dy = d.b.y - d.a.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-6) continue;
      var nx = -dy / len, ny = dx / len;
      var off = num(d.offset, 500);
      pts.push(d.a, d.b);
      pts.push({ x: d.a.x + nx * off, y: d.a.y + ny * off });
      pts.push({ x: d.b.x + nx * off, y: d.b.y + ny * off });
    }

    if (!pts.length) {
      return { minX: -5000, minY: -5000, maxX: 5000, maxY: 5000, w: 10000, h: 10000 };
    }
    var b = Geo().bounds(pts);
    var MIN = 1200;
    if (b.w < MIN) {
      var cx = (b.minX + b.maxX) / 2;
      b.minX = cx - MIN / 2;
      b.maxX = cx + MIN / 2;
      b.w = MIN;
    }
    if (b.h < MIN) {
      var cy = (b.minY + b.maxY) / 2;
      b.minY = cy - MIN / 2;
      b.maxY = cy + MIN / 2;
      b.h = MIN;
    }
    return b;
  }

  function formatSheetDate(value) {
    var s = String(value || '').replace(/^\s+|\s+$/g, '');
    if (!s) {
      var d = new Date();
      return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    }
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    return s;
  }

  function cleanText(value, fallback) {
    var s = value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return s || fallback || '';
  }

  function defaultTitle(sheet) {
    var content = normalizeContent(sheet && sheet.content);
    if (content === 'cover') return 'PORTADA';
    if (content === 'notes') return 'NOTAS Y CUADROS';
    if (content === '3d') return 'VISTA 3D';
    if (content === 'front') return 'FACHADA FRONTAL';
    if (content === 'rear') return 'FACHADA POSTERIOR';
    if (content === 'right') return 'FACHADA LATERAL DERECHA';
    if (content === 'left') return 'FACHADA LATERAL IZQUIERDA';
    return 'PLANTA';
  }

  function metaOf(project, sheet, scaleText) {
    project = project || {};
    sheet = sheet || {};
    var m = project.meta || {};
    var level = findLevel(project, sheet.levelId);
    return {
      project: cleanText(m.name, 'Proyecto sin nombre'),
      client: cleanText(m.client, '—'),
      location: cleanText(m.location, '—'),
      engineer: cleanText(m.engineer, '—'),
      license: cleanText(m.license, '—'),
      phone: cleanText(m.phone, ''),
      email: cleanText(m.email, ''),
      date: formatSheetDate(m.date),
      revision: cleanText(m.revision, 'A'),
      description: cleanText(m.description, ''),
      notes: cleanText(m.notes, ''),
      title: cleanText(sheet.title, defaultTitle(sheet)),
      sheetNo: cleanText(sheet.sheetNo, 'A-01'),
      levelName: level ? cleanText(level.name, '') : '',
      levelElev: levelElevationText(level, project.settings && project.settings.units),
      levelText: metaline(level, project.settings && project.settings.units),
      scale: scaleText || 'S/E',
      sheetName: cleanText(sheet.name, ''),
      templateName: (function () {
        var id = normalizeTemplate(sheet.template);
        var i;
        for (i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i].name;
        return 'Moderna';
      })()
    };
  }

  /* ------------------------------------------------------------------ *
   *  Distribución de la lámina por plantilla
   * ------------------------------------------------------------------ */

  function computeLayout(template, W, H, k) {
    var m = Math.max(6, 9 * k);
    var frame = { x: m, y: m, w: W - 2 * m, h: H - 2 * m };
    var lay = {
      template: template, k: k, W: W, H: H, frame: frame,
      headerH: 0, tbH: 0, sidebarW: 0
    };
    var pad = 4.5 * k;

    if (template === 'modern') {
      lay.tbH = clamp(frame.h * 0.16, 26 * k, 38 * k);
      lay.titleBlock = { x: frame.x, y: frame.y + frame.h - lay.tbH, w: frame.w, h: lay.tbH };
      lay.content = {
        x: frame.x + pad, y: frame.y + pad,
        w: frame.w - pad * 2, h: frame.h - lay.tbH - pad * 2
      };
    } else if (template === 'classic') {
      lay.tbH = clamp(frame.h * 0.19, 30 * k, 44 * k);
      lay.titleBlock = { x: frame.x, y: frame.y + frame.h - lay.tbH, w: frame.w, h: lay.tbH };
      lay.content = {
        x: frame.x + pad, y: frame.y + pad,
        w: frame.w - pad * 2, h: frame.h - lay.tbH - pad * 2
      };
    } else if (template === 'technical') {
      lay.sidebarW = clamp(frame.w * 0.2, 62 * k, 86 * k);
      lay.titleBlock = { x: frame.x + frame.w - lay.sidebarW, y: frame.y, w: lay.sidebarW, h: frame.h };
      lay.content = {
        x: frame.x + pad, y: frame.y + pad,
        w: frame.w - lay.sidebarW - pad * 2, h: frame.h - pad * 2
      };
    } else { // municipal
      lay.headerH = clamp(frame.h * 0.07, 14 * k, 22 * k);
      lay.tbH = clamp(frame.h * 0.22, 38 * k, 58 * k);
      lay.header = { x: frame.x, y: frame.y, w: frame.w, h: lay.headerH };
      lay.titleBlock = { x: frame.x, y: frame.y + frame.h - lay.tbH, w: frame.w, h: lay.tbH };
      lay.content = {
        x: frame.x + pad, y: frame.y + lay.headerH + pad,
        w: frame.w - pad * 2, h: frame.h - lay.headerH - lay.tbH - pad * 2
      };
    }

    if (lay.content.w < 40) lay.content.w = 40;
    if (lay.content.h < 30) lay.content.h = 30;
    return lay;
  }

  /* ------------------------------------------------------------------ *
   *  Plano: preparación de escala, dibujo vectorial del nivel
   * ------------------------------------------------------------------ */

  function niceDenominator(needed) {
    var cands = [10, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400,
      500, 750, 1000, 1250, 1500, 2000, 2500];
    var i;
    for (i = 0; i < cands.length; i++) {
      if (cands[i] >= needed * 0.999) return cands[i];
    }
    return Math.ceil(needed / 100) * 100;
  }

  function preparePlan(project, sheet, content, k) {
    var bounds = planBounds(project, sheet.levelId);
    var hdrH = 6.5 * k;
    var sbH = 13 * k;
    var pad = 4 * k;
    var planRect = {
      x: content.x,
      y: content.y + hdrH,
      w: content.w,
      h: Math.max(25, content.h - hdrH)
    };
    var plotRect = {
      x: planRect.x + pad,
      y: planRect.y + pad,
      w: Math.max(20, planRect.w - pad * 2),
      h: Math.max(18, planRect.h - sbH - pad * 2)
    };
    var requested = clamp(num(sheet.scale, 100), 10, 2500);
    var fFit = Math.min(plotRect.w / bounds.w, plotRect.h / bounds.h);
    if (!(fFit > 0)) fFit = 0.001;
    var f = 1 / requested;
    var eff = requested;
    var adjusted = false;
    if (f > fFit * 0.9995) {
      var needed = 1 / fFit;
      eff = niceDenominator(needed);
      f = 1 / eff;
      adjusted = true;
    }
    var view = makeView(
      plotRect.x + plotRect.w / 2,
      plotRect.y + plotRect.h / 2,
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      f
    );
    return {
      bounds: bounds,
      planRect: planRect,
      plotRect: plotRect,
      view: view,
      f: f,
      requested: requested,
      eff: eff,
      adjusted: adjusted,
      headerH: hdrH,
      sbH: sbH,
      units: (project.settings && project.settings.units) || 'm',
      scaleText: '1:' + eff + (adjusted ? ' (ajustada)' : '')
    };
  }

  function finishFill(finish) {
    var map = {
      wood: '#efe3cc', tile: '#e4eaea', carpet: '#ece4da',
      concrete: '#e5e4df', marble: '#edefef', grass: '#e1ebd3'
    };
    return map[String(finish || '')] || '#efeade';
  }

  function getLibrary() {
    return ED.Library || null;
  }

  function libDef(lib, id) {
    if (!lib) return null;
    if (typeof lib.get === 'function') {
      try { return lib.get(id); } catch (e) { return null; }
    }
    return lib.items ? (lib.items[id] || null) : null;
  }

  function paintPlanGrid(p, project, view, plot, k) {
    var gridWorld = Math.max(100, num(project.settings && project.settings.grid, 1000));
    var stepP = gridWorld * view.f;
    if (!(stepP >= 2.5) || stepP > 45) return;
    var style = { stroke: '#e3ded2', lineWidth: 0.12 };
    var leftWorld = view.invX(plot.x);
    var rightWorld = view.invX(plot.x + plot.w);
    var topWorld = view.invY(plot.y);
    var botWorld = view.invY(plot.y + plot.h);
    var startX = Math.floor(Math.min(leftWorld, rightWorld) / gridWorld) * gridWorld;
    var startY = Math.floor(Math.min(topWorld, botWorld) / gridWorld) * gridWorld;
    var x, y, i;
    var guard = 0;
    for (x = startX; x <= Math.max(leftWorld, rightWorld) && guard < 600; x += gridWorld) {
      var px = view.x(x);
      if (px >= plot.x && px <= plot.x + plot.w) {
        p.line(px, plot.y, px, plot.y + plot.h, style);
      }
      guard++;
    }
    guard = 0;
    for (y = startY; y <= Math.max(topWorld, botWorld) && guard < 600; y += gridWorld) {
      var py = view.y(y);
      if (py >= plot.y && py <= plot.y + plot.h) {
        p.line(plot.x, py, plot.x + plot.w, py, style);
      }
      guard++;
    }
  }

  function paintRooms(p, project, sheet, view) {
    if (sheet.showRooms === false) return;
    var rooms = filterLevel(project.rooms, sheet.levelId);
    var i, j, room, poly, pts;
    for (i = 0; i < rooms.length; i++) {
      room = rooms[i];
      if (!room || !layerVisible(project, room.layerId)) continue;
      poly = room.polygon;
      if (!poly || poly.length < 3) continue;
      pts = mapPts(poly, view);
      var base = room.color || finishFill(room.finish);
      p.polygon(pts, {
        fill: mixColor(base, PAPER, 0.25),
        stroke: mixColor(base, '#8c8270', 0.35),
        lineWidth: 0.12
      });
    }
  }

  function paintWalls(p, project, sheet, view, k) {
    var walls = filterLevel(project.walls, sheet.levelId);
    var wallColor = layerColor(project, 'walls', '#263238');
    var i;
    for (i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (!w || !w.a || !w.b) continue;
      if (!layerVisible(project, w.layerId)) continue;
      var poly = Geo().wallPolygon(w);
      if (!poly || poly.length < 3) continue;
      p.polygon(mapPts(poly, view), {
        fill: wallColor,
        stroke: darken(wallColor, 0.25),
        lineWidth: Math.max(0.08, 0.1 * k)
      });
    }
  }

  function paintOpenings(p, project, sheet, view, k) {
    var walls = filterLevel(project.walls, sheet.levelId);
    var i, j;
    var JAMB = { stroke: '#5b6b78', lineWidth: 0.15 };
    var LEAF = { stroke: '#3e4b57', lineWidth: 0.2 };
    var ARC = { stroke: '#4e6070', lineWidth: 0.14 };
    var GLASS = { stroke: '#3d6f7a', lineWidth: 0.16 };

    for (i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (!w || !w.a || !w.b) continue;
      if (!layerVisible(project, w.layerId)) continue;
      var openings = toArray(w.openings);
      if (!openings.length) continue;
      var pa = view.pt(w.a);
      var pb = view.pt(w.b);
      var dux = pb.x - pa.x, duy = pb.y - pa.y;
      var lenP = Math.sqrt(dux * dux + duy * duy);
      if (lenP < 0.01) continue;
      var ux = dux / lenP, uy = duy / lenP;
      var nx = -uy, ny = ux;
      var thkP = Math.max(0.35, num(w.thickness, 150) * view.f);
      var halfT = thkP / 2;
      var rotWorld = Geo().wallAngle(w);

      for (j = 0; j < openings.length; j++) {
        var op = openings[j];
        if (!op) continue;
        var span = Geo().openingSpan(w, op);
        var widthWorld = span.to - span.from;
        if (!(widthWorld > 20)) continue;
        var centerWorld = (span.from + span.to) / 2;
        var c = { x: pa.x + ux * centerWorld * view.f, y: pa.y + uy * centerWorld * view.f };
        var halfW = widthWorld * view.f / 2;
        var gap = [
          { x: c.x - ux * halfW - nx * halfT, y: c.y - uy * halfW - ny * halfT },
          { x: c.x + ux * halfW - nx * halfT, y: c.y + uy * halfW - ny * halfT },
          { x: c.x + ux * halfW + nx * halfT, y: c.y + uy * halfW + ny * halfT },
          { x: c.x - ux * halfW + nx * halfT, y: c.y - uy * halfW + ny * halfT }
        ];
        p.polygon(gap, { fill: PAPER, stroke: null });
        p.line(gap[0].x, gap[0].y, gap[3].x, gap[3].y, JAMB);
        p.line(gap[1].x, gap[1].y, gap[2].x, gap[2].y, JAMB);

        var type = String(op.type || 'door');
        if (type === 'pass') continue;

        if (type === 'window') {
          var gt = halfT * 0.46;
          var s;
          for (s = -1; s <= 1; s += 2) {
            p.line(
              c.x - ux * halfW + nx * gt * s, c.y - uy * halfW + ny * gt * s,
              c.x + ux * halfW + nx * gt * s, c.y + uy * halfW + ny * gt * s,
              GLASS
            );
          }
          p.line(c.x - ux * halfW, c.y - uy * halfW,
            c.x + ux * halfW, c.y + uy * halfW,
            { stroke: '#7fa3a8', lineWidth: 0.09 });
          continue;
        }

        // Puertas / portones: hoja con abanico
        var swingSign = num(op.swing, 1) >= 0 ? -1 : 1; // mundo derecha = papel -normal
        var dir = { x: nx * swingSign, y: ny * swingSign };
        var hingeAtA = num(op.hinge, 1) >= 0;
        var hinge = hingeAtA
          ? { x: c.x - ux * halfW, y: c.y - uy * halfW }
          : { x: c.x + ux * halfW, y: c.y + uy * halfW };
        var toward = hingeAtA ? { x: ux, y: uy } : { x: -ux, y: -uy };
        var radius = halfW * 2;

        if (type === 'garage' && radius > 13 * k) {
          // Portón de dos hojas
          var rHalf = radius / 2;
          var leftHinge = { x: c.x - ux * halfW, y: c.y - uy * halfW };
          var rightHinge = { x: c.x + ux * halfW, y: c.y + uy * halfW };
          var lDir = { x: nx * swingSign, y: ny * swingSign };
          p.line(leftHinge.x, leftHinge.y, leftHinge.x + lDir.x * rHalf, leftHinge.y + lDir.y * rHalf, LEAF);
          p.arc(leftHinge.x, leftHinge.y, rHalf,
            Math.atan2(uy, ux), Math.atan2(lDir.y, lDir.x), ARC);
          p.line(rightHinge.x, rightHinge.y, rightHinge.x + lDir.x * rHalf, rightHinge.y + lDir.y * rHalf, LEAF);
          p.arc(rightHinge.x, rightHinge.y, rHalf,
            Math.atan2(-uy, -ux), Math.atan2(lDir.y, lDir.x), ARC);
        } else {
          p.line(hinge.x, hinge.y, hinge.x + dir.x * radius, hinge.y + dir.y * radius, LEAF);
          p.arc(hinge.x, hinge.y, radius,
            Math.atan2(toward.y, toward.x), Math.atan2(dir.y, dir.x), ARC);
        }
      }
    }
  }

  function paintLibShape(p, shape, item, origin, rot, view, color) {
    if (!shape) return;
    var t = shape.t || shape.type;
    var fill = shape.fill || mixColor(color, '#ffffff', 0.55);
    var stroke = shape.stroke || mixColor(color, '#000000', 0.28);
    var style = { fill: fill, stroke: stroke, lineWidth: 0.11 };
    var i, pts;

    // Las formas de la biblioteca están en coordenadas LOCALES centradas en (0,0);
    // hay que rotarlas y luego trasladarlas al centro del mueble (origin).
    // Geo.transformPoint espera un punto en coordenadas de mundo, por eso no se usa aquí.
    function tx(pt) {
      var r = rad(rot);
      var cs = Math.cos(r), sn = Math.sin(r);
      var lx = num(pt.x, 0), ly = num(pt.y, 0);
      return view.pt({
        x: origin.x + lx * cs - ly * sn,
        y: origin.y + lx * sn + ly * cs
      });
    }

    if (t === 'rect') {
      var x = num(shape.x, 0), y = num(shape.y, 0);
      var w = Math.max(1, num(shape.w, 10)), h = Math.max(1, num(shape.h, 10));
      var corners = [
        { x: x, y: y }, { x: x + w, y: y }, { x: x + w, y: y + h }, { x: x, y: y + h }
      ];
      p.polygon([tx(corners[0]), tx(corners[1]), tx(corners[2]), tx(corners[3])], style);
      return;
    }
    if (t === 'circle') {
      var cc = tx({ x: num(shape.cx, 0), y: num(shape.cy, 0) });
      p.circle(cc.x, cc.y, Math.max(0.15, num(shape.r, 10) * view.f), style);
      return;
    }
    if (t === 'line') {
      var a = tx({ x: num(shape.x1, 0), y: num(shape.y1, 0) });
      var b = tx({ x: num(shape.x2, 0), y: num(shape.y2, 0) });
      p.line(a.x, a.y, b.x, b.y, {
        stroke: shape.stroke || mixColor(color, '#000000', 0.2),
        lineWidth: 0.12
      });
      return;
    }
    if (t === 'poly') {
      var src = toArray(shape.points);
      if (src.length < 2) return;
      var local = [];
      for (i = 0; i < src.length; i++) {
        local.push({ x: num(src[i].x, 0), y: num(src[i].y, 0) });
      }
      pts = [];
      for (i = 0; i < local.length; i++) pts.push(tx(local[i]));
      p.polygon(pts, style);
      return;
    }
    if (t === 'arc') {
      var ac = tx({ x: num(shape.cx, 0), y: num(shape.cy, 0) });
      var start = num(shape.start, 0);
      var end = num(shape.end, 270);
      p.arc(ac.x, ac.y, Math.max(0.15, num(shape.r, 10) * view.f),
        -rad(start + rot), -rad(end + rot),
        { stroke: shape.stroke || stroke, lineWidth: 0.12 });
    }
  }

  function paintItems(p, project, sheet, view, k) {
    if (sheet.showFurniture === false) return;
    var items = filterLevel(project.items, sheet.levelId);
    var lib = getLibrary();
    var i, j;
    for (i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || !layerVisible(project, item.layerId)) continue;
      var def = libDef(lib, item.libId);
      var color = (def && def.color) || '#7c8798';
      var origin = { x: num(item.x, 0), y: num(item.y, 0) };
      var rot = num(item.rotation, 0);
      var shapes = def ? def.plan : null;
      if (shapes && shapes.length) {
        for (j = 0; j < shapes.length; j++) {
          paintLibShape(p, shapes[j], item, origin, rot, view, color);
        }
      } else {
        var w = Math.max(100, num(item.w, def && def.w ? def.w : 600));
        var d = Math.max(100, num(item.d, def && def.d ? def.d : 600));
        var corners = Geo().rectPolygon(origin.x, origin.y, w, d, rot);
        p.polygon(mapPts(corners, view), {
          fill: mixColor(color, '#ffffff', 0.55),
          stroke: mixColor(color, '#000000', 0.28),
          lineWidth: 0.11
        });
      }
    }
  }

  function paintRoomLabels(p, project, sheet, view, k) {
    if (sheet.showRooms === false) return;
    var rooms = filterLevel(project.rooms, sheet.levelId);
    var i;
    for (i = 0; i < rooms.length; i++) {
      var room = rooms[i];
      if (!room || !layerVisible(project, room.layerId)) continue;
      var poly = room.polygon;
      if (!poly || poly.length < 3) continue;
      var area = Geo().polygonArea(poly);
      var center = Geo().polygonCentroid(poly);
      var pc = view.pt(center);
      var bb = Geo().bounds(poly);
      var maxW = Math.max(7, bb.w * view.f * 0.88);
      var name = cleanText(room.name, 'AMBIENTE').toUpperCase();
      var st = fitTextSize(name, maxW, { size: 2.6 * k, bold: true, color: INK }, 1.45);
      if (st.size >= 1.45) {
        p.text(name, pc.x, pc.y - 0.85 * k, {
          size: st.size, bold: true, color: INK, align: 'center', baseline: 'middle'
        });
      }
      var areaText = Geo().formatArea(area, project.settings && project.settings.units);
      var st2 = fitTextSize(areaText, maxW, { size: 1.9 * k, color: INK_SOFT }, 1.25);
      if (st2.size >= 1.25) {
        p.text(areaText, pc.x, pc.y + 1.6 * k, {
          size: st2.size, color: INK_SOFT, align: 'center', baseline: 'middle'
        });
      }
    }
  }

  function paintTexts(p, project, sheet, view, k) {
    var texts = filterLevel(project.texts, sheet.levelId);
    var i;
    for (i = 0; i < texts.length; i++) {
      var t = texts[i];
      if (!t || !layerVisible(project, t.layerId)) continue;
      var txt = t.text === null || t.text === undefined ? '' : String(t.text);
      if (!txt) continue;
      var pc = view.pt({ x: num(t.x, 0), y: num(t.y, 0) });
      var size = clamp(num(t.size, 300) * view.f, 1.2, 12);
      p.text(txt, pc.x, pc.y, {
        size: size,
        color: layerColor(project, t.layerId, '#1f2937'),
        rotate: -num(t.rotation, 0),
        align: 'left',
        baseline: 'middle'
      });
    }
  }

  function paintDims(p, project, sheet, view, k) {
    if (sheet.showDims === false) return;
    var dims = filterLevel(project.dims, sheet.levelId);
    var color = layerColor(project, 'dimensions', '#b5651d');
    var i;
    for (i = 0; i < dims.length; i++) {
      var d = dims[i];
      if (!d || !d.a || !d.b || !layerVisible(project, d.layerId)) continue;
      var dx = d.b.x - d.a.x, dy = d.b.y - d.a.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      var ux = dx / len, uy = dy / len;
      var nx = -uy, ny = ux;
      var off = num(d.offset, 600);
      var aOff = { x: d.a.x + nx * off, y: d.a.y + ny * off };
      var bOff = { x: d.b.x + nx * off, y: d.b.y + ny * off };
      var pa = view.pt(d.a), pb = view.pt(d.b);
      var pao = view.pt(aOff), pbo = view.pt(bOff);

      var vx = pao.x - pa.x, vy = pao.y - pa.y;
      var vl = Math.sqrt(vx * vx + vy * vy);
      if (vl < 0.1) continue;
      var npx = vx / vl, npy = vy / vl;
      var overshoot = 1.3 * k;
      var gapStart = 0.8 * k;

      p.line(pa.x + npx * gapStart, pa.y + npy * gapStart,
        pao.x + npx * overshoot, pao.y + npy * overshoot,
        { stroke: color, lineWidth: 0.13 });
      p.line(pb.x + npx * gapStart, pb.y + npy * gapStart,
        pbo.x + npx * overshoot, pbo.y + npy * overshoot,
        { stroke: color, lineWidth: 0.13 });
      p.line(pao.x, pao.y, pbo.x, pbo.y, { stroke: color, lineWidth: 0.16 });

      var lu = { x: (pbo.x - pao.x), y: (pbo.y - pao.y) };
      var ll = Math.sqrt(lu.x * lu.x + lu.y * lu.y);
      if (ll < 0.01) continue;
      lu.x /= ll; lu.y /= ll;
      var tick = 1.4 * k;
      var tickVec = { x: (lu.x + npx) * 0.7071, y: (lu.y + npy) * 0.7071 };
      p.line(pao.x - tickVec.x * tick / 2, pao.y - tickVec.y * tick / 2,
        pao.x + tickVec.x * tick / 2, pao.y + tickVec.y * tick / 2,
        { stroke: color, lineWidth: 0.16 });
      p.line(pbo.x - tickVec.x * tick / 2, pbo.y - tickVec.y * tick / 2,
        pbo.x + tickVec.x * tick / 2, pbo.y + tickVec.y * tick / 2,
        { stroke: color, lineWidth: 0.16 });

      var angle = Math.atan2(pbo.y - pao.y, pbo.x - pao.x);
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
      var mid = { x: (pao.x + pbo.x) / 2, y: (pao.y + pbo.y) / 2 };
      var tx = mid.x + npx * 1.35 * k;
      var ty = mid.y + npy * 1.35 * k;
      var label = d.text || Geo().formatLength(len, (project.settings && project.settings.units) || 'm');
      var size = 2.15 * k;
      var textStyle = { size: size, color: color, align: 'center', baseline: 'middle', rotate: deg(angle) };
      p.text(label, tx, ty, textStyle);
    }
  }

  function paintNorth(p, x, y, r, angleDeg, k) {
    var a = rad(num(angleDeg, 0));
    function npt(lx, ly) {
      var wx = lx * Math.cos(a) - ly * Math.sin(a);
      var wy = lx * Math.sin(a) + ly * Math.cos(a);
      return { x: x + wx, y: y - wy };
    }
    p.circle(x, y, r, { stroke: RULE, lineWidth: 0.22 });
    var needle = [npt(0, r * 0.86), npt(r * 0.3, -r * 0.12), npt(0, -r * 0.42), npt(-r * 0.3, -r * 0.12)];
    p.polygon([needle[0], needle[1], needle[2]], { fill: DARK, stroke: DARK, lineWidth: 0.1 });
    p.polygon([needle[0], needle[3], needle[2]], { fill: '#ffffff', stroke: DARK, lineWidth: 0.13 });
    p.text('N', npt(0, r * 1.35).x, npt(0, r * 1.35).y, {
      size: Math.max(1.6, r * 0.62), bold: true, color: INK,
      align: 'center', baseline: 'middle'
    });
  }

  function niceScaleLength(targetWorld) {
    var cands = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000,
      20000, 25000, 50000, 100000, 200000];
    var best = cands[0];
    var i;
    for (i = 0; i < cands.length; i++) {
      if (cands[i] <= targetWorld * 1.1) best = cands[i];
    }
    return best;
  }

  function paintScaleBar(p, x, y, maxW, info, k) {
    var targetWorld = maxW / info.f;
    var imperial = String(info.units || 'm').toLowerCase() === 'ft';
    var worldLen;
    if (imperial) {
      var ftCands = [304.8, 609.6, 1524, 3048, 6096, 15240, 30480, 60960];
      worldLen = ftCands[0];
      for (var fi = 0; fi < ftCands.length; fi++) {
        if (ftCands[fi] <= targetWorld * 1.1) worldLen = ftCands[fi];
      }
    } else {
      worldLen = niceScaleLength(targetWorld);
    }
    var barW = worldLen * info.f;
    if (barW > maxW * 1.15) {
      worldLen = worldLen / 2;
      barW = worldLen * info.f;
    }
    var segs = 4;
    var segW = barW / segs;
    var h = 2.2 * k;
    var i;
    for (i = 0; i < segs; i++) {
      p.rect(x + i * segW, y, segW, h, {
        fill: i % 2 === 0 ? DARK : '#ffffff',
        stroke: DARK,
        lineWidth: 0.14
      });
    }
    var labelBase = { size: 1.9 * k, color: INK_SOFT, baseline: 'top' };
    var labelY = y + h + 0.9 * k;
    p.text('0', x, labelY, { size: labelBase.size, color: labelBase.color, align: 'left', baseline: 'top' });
    if (imperial) {
      p.text(Geo().formatLength(worldLen / 2, 'ft'), x + barW / 2, labelY,
        { size: labelBase.size, color: labelBase.color, align: 'center', baseline: 'top' });
      p.text(Geo().formatLength(worldLen, 'ft'), x + barW, labelY,
        { size: labelBase.size, color: labelBase.color, align: 'right', baseline: 'top' });
    } else {
      p.text(fmtNum(worldLen / 2000, 2), x + barW / 2, labelY,
        { size: labelBase.size, color: labelBase.color, align: 'center', baseline: 'top' });
      p.text(fmtNum(worldLen / 1000, 2) + ' m', x + barW, labelY,
        { size: labelBase.size, color: labelBase.color, align: 'right', baseline: 'top' });
    }
    p.text('ESCALA 1:' + info.eff, x, y - 1.1 * k, {
      size: 2.05 * k, bold: true, color: INK_SOFT, align: 'left', baseline: 'bottom'
    });
  }

  function paintPlanContent(p, project, sheet, content, k, info) {
    var level = findLevel(project, sheet.levelId);
    var headerMid = content.y + info.headerH / 2;
    p.text(metaline(level, project.settings && project.settings.units), content.x, headerMid, {
      size: 2.9 * k, bold: true, color: INK, align: 'left', baseline: 'middle'
    });
    var right = info.adjusted
      ? 'ESCALA 1:' + info.eff + '  ·  AJUSTADA AL FORMATO'
      : 'ESCALA 1:' + info.eff;
    p.text(right, content.x + content.w, headerMid, {
      size: 2.15 * k, bold: true, color: INK_SOFT, align: 'right', baseline: 'middle'
    });
    p.line(content.x, content.y + info.headerH, content.x + content.w, content.y + info.headerH,
      { stroke: HAIR, lineWidth: 0.25 });

    var plot = info.plotRect;
    var view = info.view;

    p.clipRect(plot.x - 0.6, plot.y - 0.6, plot.w + 1.2, plot.h + 1.2, function () {
      if (sheet.showGrid) paintPlanGrid(p, project, view, plot, k);
      paintRooms(p, project, sheet, view);
      paintWalls(p, project, sheet, view, k);
      paintOpenings(p, project, sheet, view, k);
      paintItems(p, project, sheet, view, k);
      paintRoomLabels(p, project, sheet, view, k);
      paintTexts(p, project, sheet, view, k);
      paintDims(p, project, sheet, view, k);
    });

    p.rect(info.planRect.x, info.planRect.y, info.planRect.w, info.planRect.h,
      { stroke: '#d8d2c4', lineWidth: 0.3 });

    paintNorth(p, plot.x + plot.w - 7.5 * k, plot.y + 8 * k, 4.6 * k,
      num(project.settings && project.settings.northAngle, 0), k);

    paintScaleBar(p, plot.x, plot.y + plot.h + 2.6 * k,
      Math.min(plot.w * 0.5, 58 * k), info, k);
  }

  /* ------------------------------------------------------------------ *
   *  Cajetines: utilidades de composición
   * ------------------------------------------------------------------ */

  var BORDER_INK = '#3a4650';

  function copyStyle(style) {
    var out = {}, key;
    style = style || {};
    for (key in style) {
      if (Object.prototype.hasOwnProperty.call(style, key)) out[key] = style[key];
    }
    return out;
  }

  // Ajusta un estilo de texto para que quepa en un ancho y alto dados.
  function bigTextSize(str, maxW, maxH, style) {
    var st = copyStyle(style);
    var size = num(st.size, Math.max(1, num(maxH, 4) * 0.7));
    st.size = size;
    var w = measureTextWidth(str, st);
    if (maxW > 0 && w > maxW) st.size = Math.max(1.1, size * maxW / w);
    if (maxH > 0) st.size = Math.min(st.size, maxH * 0.82);
    return st;
  }

  // Monograma ENGDRAFT: cuadrado de acento con una E geométrica.
  function drawLogoMark(p, x, y, s, opts) {
    opts = opts || {};
    if (!(s > 0.5)) return;
    var accent = opts.accent || ACCENT;
    var ink = opts.ink || DARK;
    p.rect(x, y, s, s, {
      fill: accent, stroke: opts.stroke || null, lineWidth: 0.12,
      radius: Math.min(s * 0.17, 1.8 * num(opts.k, 1))
    });
    var pad = s * 0.245;
    var stemW = s * 0.135;
    var barW = s * 0.40;
    var barH = s * 0.115;
    var innerH = s - pad * 2;
    p.rect(x + pad, y + pad, stemW, innerH, { fill: ink });
    p.rect(x + pad, y + pad, barW, barH, { fill: ink });
    p.rect(x + pad, y + pad + (innerH - barH) / 2, barW * 0.84, barH, { fill: ink });
    p.rect(x + pad, y + pad + innerH - barH, barW, barH, { fill: ink });
  }

  // Marca + logotipo ENGDRAFT + bajada. Devuelve el ancho consumido.
  function drawLogo(p, x, y, s, opts) {
    opts = opts || {};
    var k = num(opts.k, 1);
    drawLogoMark(p, x, y, s, opts);
    var gap = s * 0.34;
    var tx = x + s + gap;
    var maxW = num(opts.maxW, 0);
    var word = opts.word || 'ENGDRAFT';
    var wst = {
      size: Math.min(num(opts.wordSize, s * 0.36), s * 0.46),
      bold: true, color: opts.color || INK, font: opts.mono ? 'mono' : null
    };
    if (maxW > 0) wst = fitTextSize(word, Math.max(9 * k, maxW), wst, 2.0 * k);
    wst.size = Math.min(wst.size, s * 0.46);
    p.text(word, tx, y + s * 0.42, {
      size: wst.size, bold: true, color: wst.color, font: wst.font,
      align: 'left', baseline: 'middle'
    });
    var wordW = measureTextWidth(word, wst);
    if (opts.sub) {
      var sub = String(opts.sub);
      var sst = {
        size: Math.max(1.15, s * 0.145), bold: true,
        color: opts.subColor || RULE, font: opts.mono ? 'mono' : null
      };
      if (maxW > 0) sst = fitTextSize(sub, Math.max(9 * k, maxW), sst, 1.1 * k);
      p.text(sub, tx, y + s * 0.78, {
        size: sst.size, bold: true, color: sst.color, font: sst.font,
        align: 'left', baseline: 'middle'
      });
      wordW = Math.max(wordW, measureTextWidth(sub, sst));
    }
    return s + gap + wordW;
  }

  // Celda de cajetín: etiqueta pequeña arriba y valor (con ajuste y salto).
  function paintCell(p, x, y, w, h, label, value, o) {
    o = o || {};
    var k = num(o.k, 1);
    var padX = num(o.padX, 2.0 * k);
    var padY = num(o.padY, 1.15 * k);
    var lsize = Math.max(1.0, num(o.labelSize, 1.65 * k));
    var vsize = Math.max(1.15, num(o.valueSize, 2.5 * k));
    var mono = !!o.mono;
    var bold = o.valueBold !== false;
    var lcolor = o.labelColor || RULE;
    var vcolor = o.valueColor || INK;
    var innerW = Math.max(1.5, w - padX * 2);
    var hasLabel = !!(label && String(label).length);
    if (o.fill) p.rect(x, y, w, h, { fill: o.fill });
    if (o.stroke) p.rect(x, y, w, h, { stroke: o.stroke, lineWidth: num(o.lineWidth, 0.15) });
    var top = y + padY;
    if (hasLabel) {
      p.text(String(label).toUpperCase(), x + padX, y + padY + lsize * 0.94, {
        size: lsize, color: lcolor, bold: o.labelBold !== false,
        font: mono ? 'mono' : null, align: 'left', baseline: 'alphabetic'
      });
      top = y + padY + lsize * 1.32;
    }
    var str = value === null || value === undefined ? '' : String(value);
    var style = { size: vsize, bold: bold, font: mono ? 'mono' : null, color: vcolor };
    var lines = o.singleLine ? [str] : wrapTextLines(str, innerW, style);
    if (!lines.length) lines = [''];
    var availH = Math.max(vsize, y + h - padY - top);
    var lineH = vsize * 1.15;
    var maxLines = Math.max(1, Math.floor(availH / lineH));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1];
      while (last.length > 1 && measureTextWidth(last + '…', style) > innerW) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = last.replace(/\s+$/, '') + '…';
    }
    var totalH = lines.length * lineH;
    var startY = top + Math.max(0, (availH - totalH) / 2) + vsize * 0.82;
    var align = o.align || 'left';
    var ax = align === 'right' ? x + w - padX : (align === 'center' ? x + w / 2 : x + padX);
    var i;
    for (i = 0; i < lines.length; i++) {
      var st = fitTextSize(lines[i], innerW, style, Math.max(1.05, vsize * 0.58));
      p.text(lines[i], ax, startY + i * lineH, {
        size: st.size, bold: bold, color: vcolor, font: mono ? 'mono' : null,
        align: align, baseline: 'top'
      });
    }
  }

  // Valor grande centrado (número de lámina, etc.).
  function paintBigValue(p, str, x, y, w, h, o) {
    o = o || {};
    var pad = num(o.pad, 1.2);
    var st = bigTextSize(str, Math.max(1, w - pad * 2), Math.max(1, h - pad * 2), {
      size: num(o.size, h * 0.62), bold: o.bold !== false,
      font: o.mono ? 'mono' : null, color: o.color || INK
    });
    p.text(str, x + w / 2, y + h / 2, {
      size: st.size, bold: o.bold !== false, color: o.color || INK,
      font: o.mono ? 'mono' : null, align: 'center', baseline: 'middle'
    });
  }

  function cornerTick(p, x, y, dx, dy, len, style) {
    p.line(x, y, x + dx * len, y, style);
    p.line(x, y, x, y + dy * len, style);
  }

  /* ------------------------------------------------------------------ *
   *  Borde de la lámina (distinto por plantilla)
   * ------------------------------------------------------------------ */

  function paintBorder(p, project, sheet, lay, k, meta) {
    var f = lay.frame;
    var tpl = lay.template;
    var i, x, y;

    if (tpl === 'classic') {
      p.rect(f.x, f.y, f.w, f.h, { stroke: INK, lineWidth: 0.5 });
      var ci = 2.3 * k;
      p.rect(f.x + ci, f.y + ci, f.w - ci * 2, f.h - ci * 2, { stroke: INK, lineWidth: 0.16 });
      var cs = 2.4 * k;
      var corners = [
        { x: f.x + ci, y: f.y + ci }, { x: f.x + f.w - ci, y: f.y + ci },
        { x: f.x + ci, y: f.y + f.h - ci }, { x: f.x + f.w - ci, y: f.y + f.h - ci }
      ];
      for (i = 0; i < corners.length; i++) {
        p.rect(corners[i].x - cs / 2, corners[i].y - cs / 2, cs, cs, { fill: INK });
      }
      return;
    }

    if (tpl === 'technical') {
      p.rect(f.x, f.y, f.w, f.h, { stroke: BORDER_INK, lineWidth: 0.3 });
      var step = 18 * k;
      var tl = 2.4 * k;
      var tick = { stroke: RULE, lineWidth: 0.16 };
      for (x = f.x + step; x < f.x + f.w - step * 0.4; x += step) {
        p.line(x, f.y, x, f.y + tl, tick);
        p.line(x, f.y + f.h, x, f.y + f.h - tl, tick);
      }
      for (y = f.y + step; y < f.y + f.h - step * 0.4; y += step) {
        p.line(f.x, y, f.x + tl, y, tick);
        p.line(f.x + f.w, y, f.x + f.w - tl, y, tick);
      }
      p.rect(f.x, f.y, 10 * k, 0.8 * k, { fill: CYAN });
      p.rect(f.x, f.y, 0.8 * k, 10 * k, { fill: CYAN });
      p.rect(f.x + f.w - 10 * k, f.y + f.h - 0.8 * k, 10 * k, 0.8 * k, { fill: CYAN });
      p.rect(f.x + f.w - 0.8 * k, f.y + f.h - 10 * k, 0.8 * k, 10 * k, { fill: CYAN });
      return;
    }

    if (tpl === 'municipal') {
      p.rect(f.x, f.y, f.w, f.h, { stroke: INK, lineWidth: 0.45 });
      var mi = 1.6 * k;
      p.rect(f.x + mi, f.y + mi, f.w - mi * 2, f.h - mi * 2, { stroke: '#b3aca0', lineWidth: 0.12 });
      var ml = 6.5 * k;
      var mstyle = { stroke: BORDER_INK, lineWidth: 0.5 };
      cornerTick(p, f.x + 2.6 * k, f.y + 2.6 * k, 1, 1, ml, mstyle);
      cornerTick(p, f.x + f.w - 2.6 * k, f.y + 2.6 * k, -1, 1, ml, mstyle);
      cornerTick(p, f.x + 2.6 * k, f.y + f.h - 2.6 * k, 1, -1, ml, mstyle);
      cornerTick(p, f.x + f.w - 2.6 * k, f.y + f.h - 2.6 * k, -1, -1, ml, mstyle);
      return;
    }

    // modern
    p.rect(f.x, f.y, f.w, f.h, { stroke: BORDER_INK, lineWidth: 0.42 });
    var inset = 1.7 * k;
    p.rect(f.x + inset, f.y + inset, f.w - inset * 2, f.h - inset * 2,
      { stroke: '#d9d3c4', lineWidth: 0.13 });
    var al = 7 * k;
    var ast = { stroke: ACCENT, lineWidth: 0.7 };
    cornerTick(p, f.x + inset, f.y + inset, 1, 1, al, ast);
    cornerTick(p, f.x + f.w - inset, f.y + inset, -1, 1, al, ast);
    cornerTick(p, f.x + inset, f.y + f.h - inset, 1, -1, al, ast);
    cornerTick(p, f.x + f.w - inset, f.y + f.h - inset, -1, -1, al, ast);
  }

  /* ------------------------------------------------------------------ *
   *  Cajetín "moderno": banda inferior oscura con acento ámbar
   * ------------------------------------------------------------------ */

  function paintModern(p, project, sheet, lay, k, meta) {
    var tb = lay.titleBlock;
    if (!tb) return;
    k = Math.max(k, 0.9);
    var pad = 3.4 * k;
    var innerH = Math.max(8, tb.h - pad * 2);
    var y0 = tb.y + pad;
    var ruleColor = mixColor(DARK, '#ffffff', 0.26);
    var softColor = mixColor(DARK, '#ffffff', 0.64);
    var dimColor = mixColor(DARK, '#ffffff', 0.46);
    var div = { stroke: ruleColor, lineWidth: 0.14 };

    p.rect(tb.x, tb.y, tb.w, tb.h, { fill: DARK });
    p.rect(tb.x, tb.y, tb.w, Math.max(0.7, 1.05 * k), { fill: ACCENT });

    var noW = clamp(tb.h * 1.12, 23 * k, 42 * k);
    var noX = tb.x + tb.w - pad - noW;
    var titleW = clamp(tb.w * 0.23, 54 * k, tb.w * 0.30);
    var titleX = noX - pad * 0.9 - titleW;
    var gridW = clamp(tb.w * 0.185, 50 * k, tb.w * 0.25);
    var gridX = titleX - pad * 0.8 - gridW;
    var logoW = clamp(tb.w * 0.16, 42 * k, 96 * k);
    var logoX = tb.x + pad;
    var projX = logoX + logoW + pad * 0.7;
    var projW = Math.max(30 * k, gridX - pad * 0.8 - projX);

    p.line(logoX + logoW + pad * 0.15, y0, logoX + logoW + pad * 0.15, y0 + innerH, div);
    p.line(gridX - pad * 0.4, y0, gridX - pad * 0.4, y0 + innerH, div);
    p.line(titleX - pad * 0.45, y0, titleX - pad * 0.45, y0 + innerH, div);

    var markS = Math.min(innerH * 0.62, 16 * k);
    drawLogo(p, logoX, y0 + Math.max(0, (innerH - markS) / 2 - 1.4 * k), markS, {
      accent: ACCENT, ink: DARK, color: WHITE, wordSize: markS * 0.40,
      sub: 'PLANOS ARQUITECTÓNICOS',
      subColor: ACCENT, maxW: logoW - markS - 2.4 * k, k: k
    });

    p.text('PROYECTO', projX, y0 + innerH * 0.055, {
      size: Math.max(1.25, 1.55 * k), bold: true, color: ACCENT, baseline: 'middle'
    });
    var nameSt = bigTextSize(meta.project, projW, innerH * 0.32,
      { size: Math.min(innerH * 0.30, 7.6 * k), bold: true, color: WHITE });
    p.text(meta.project, projX, y0 + innerH * 0.23, {
      size: nameSt.size, bold: true, color: WHITE, baseline: 'middle'
    });
    var infoLines = [
      'CLIENTE: ' + meta.client,
      'UBICACIÓN: ' + meta.location,
      'INGENIERO: ' + meta.engineer +
        (meta.license && meta.license !== '—' ? '   ·   LIC. ' + meta.license : '')
    ];
    var ly = [0.49, 0.67, 0.85];
    var li;
    for (li = 0; li < infoLines.length; li++) {
      var ist = fitTextSize(infoLines[li], projW, { size: 2.5 * k, color: softColor }, 1.5 * k);
      p.text(infoLines[li], projX, y0 + innerH * ly[li], {
        size: ist.size, color: softColor, baseline: 'middle'
      });
    }

    p.text('TÍTULO DE LÁMINA', titleX, y0 + innerH * 0.18, {
      size: Math.max(1.2, 1.6 * k), bold: true, color: ACCENT, baseline: 'middle'
    });
    var titleSt = bigTextSize(meta.title, titleW, innerH * 0.40,
      { size: Math.min(innerH * 0.24, 6.4 * k), bold: true, color: WHITE });
    p.text(meta.title, titleX, y0 + innerH * 0.55, {
      size: titleSt.size, bold: true, color: WHITE, baseline: 'middle'
    });
    var levelLine = meta.levelText || meta.levelElev || '';
    var lvlSt = fitTextSize(levelLine, titleW,
      { size: 2.05 * k, color: dimColor }, 1.35 * k);
    p.text(levelLine, titleX, y0 + innerH * 0.87, {
      size: lvlSt.size, color: dimColor, baseline: 'middle'
    });

    var halfW = gridW / 2;
    var halfH = innerH / 2;
    p.rect(gridX, y0, gridW, innerH, { stroke: ruleColor, lineWidth: 0.16 });
    p.line(gridX + halfW, y0, gridX + halfW, y0 + innerH, div);
    p.line(gridX, y0 + halfH, gridX + gridW, y0 + halfH, div);
    var cells = [
      { x: gridX, y: y0, label: 'ESCALA', value: meta.scale },
      { x: gridX + halfW, y: y0, label: 'FECHA', value: meta.date },
      { x: gridX, y: y0 + halfH, label: 'REVISIÓN', value: meta.revision },
      { x: gridX + halfW, y: y0 + halfH, label: 'NIVEL', value: meta.levelName || '—' }
    ];
    var ci, cc;
    for (ci = 0; ci < cells.length; ci++) {
      cc = cells[ci];
      paintCell(p, cc.x, cc.y, halfW, halfH, cc.label, cc.value, {
        k: k, padX: 1.8 * k, padY: 1.0 * k, labelSize: 1.42 * k,
        valueSize: 2.3 * k, labelColor: dimColor, valueColor: WHITE,
        singleLine: true
      });
    }

    p.rect(noX, y0, noW, innerH, { fill: ACCENT, radius: 0.8 * k });
    p.text('LÁMINA', noX + noW / 2, y0 + innerH * 0.18, {
      size: Math.max(1.2, 1.5 * k), bold: true, color: DARK,
      align: 'center', baseline: 'middle'
    });
    paintBigValue(p, meta.sheetNo, noX + 1.3 * k, y0 + innerH * 0.25,
      noW - 2.6 * k, innerH * 0.52,
      { color: DARK, size: Math.min(innerH * 0.38, 10 * k), bold: true });
    p.text('REV. ' + meta.revision, noX + noW / 2, y0 + innerH * 0.90, {
      size: Math.max(1.15, 1.45 * k), bold: true, color: DARK,
      align: 'center', baseline: 'middle'
    });
  }

  /* ------------------------------------------------------------------ *
   *  Cajetín "clásico": bloque inferior con doble borde y celdas
   * ------------------------------------------------------------------ */

  function paintClassic(p, project, sheet, lay, k, meta) {
    var tb = lay.titleBlock;
    if (!tb) return;
    k = Math.max(k, 0.9);
    var paper2 = '#fbf9f2';
    var lcol = '#7d8b96';
    var lineStyle = { stroke: INK, lineWidth: 0.18 };
    var hair = { stroke: '#c7bfae', lineWidth: 0.12 };

    p.rect(tb.x, tb.y, tb.w, tb.h, { fill: paper2 });
    p.rect(tb.x, tb.y, tb.w, tb.h, { stroke: INK, lineWidth: 0.55 });
    p.rect(tb.x + 1.6 * k, tb.y + 1.6 * k, tb.w - 3.2 * k, tb.h - 3.2 * k,
      { stroke: INK, lineWidth: 0.16 });

    var pad = 3.2 * k;
    var x0 = tb.x + pad, y0 = tb.y + pad;
    var W = tb.w - pad * 2, H = tb.h - pad * 2;
    var numW = clamp(W * 0.125, 22 * k, 46 * k);
    var c0 = clamp(W * 0.235, 44 * k, 100 * k);
    var c2 = clamp(W * 0.235, 54 * k, 118 * k);
    var c1 = Math.max(60 * k, W - numW - c0 - c2);
    c2 = Math.max(50 * k, W - numW - c0 - c1);
    var r0 = H * 0.44;
    var r1 = H * 0.30;
    var r2 = H - r0 - r1;
    var xa = x0, xb = x0 + c0, xc = xb + c1, xd = xc + c2;

    p.line(xb, y0, xb, y0 + H, lineStyle);
    p.line(xc, y0, xc, y0 + H, lineStyle);
    p.line(xd, y0, xd, y0 + H, lineStyle);
    p.line(x0, y0 + r0, x0 + W, y0 + r0, lineStyle);
    p.line(x0, y0 + r0 + r1, x0 + W, y0 + r0 + r1, lineStyle);
    p.line(xc + c2 / 2, y0 + r0, xc + c2 / 2, y0 + H, lineStyle);

    var markS = Math.min(r0 * 0.58, 14 * k);
    drawLogo(p, xa + 2.6 * k, y0 + r0 / 2 - markS / 2, markS, {
      accent: INK, ink: paper2, color: INK, wordSize: markS * 0.46,
      sub: 'ESTUDIO DE INGENIERÍA',
      subColor: lcol, maxW: c0 - 2.6 * k - markS - 2 * k, k: k
    });

    paintCell(p, xa, y0 + r0, c0, r1, 'INGENIERO', meta.engineer,
      { k: k, labelSize: 1.55 * k, valueSize: 2.35 * k, labelColor: lcol });
    paintCell(p, xa, y0 + r0 + r1, c0, r2, 'LICENCIA', meta.license,
      { k: k, labelSize: 1.55 * k, valueSize: 2.35 * k, labelColor: lcol });

    paintCell(p, xb, y0, c1, r0, 'PROYECTO', meta.project,
      { k: k, padX: 2.8 * k, labelSize: 1.6 * k, valueSize: 4.7 * k, labelColor: lcol });
    paintCell(p, xb, y0 + r0, c1, r1, 'CLIENTE', meta.client,
      { k: k, padX: 2.8 * k, labelSize: 1.55 * k, valueSize: 2.6 * k, labelColor: lcol });
    paintCell(p, xb, y0 + r0 + r1, c1, r2, 'UBICACIÓN', meta.location,
      { k: k, padX: 2.8 * k, labelSize: 1.55 * k, valueSize: 2.45 * k, labelColor: lcol });

    paintCell(p, xc, y0, c2, r0, 'TÍTULO DE LÁMINA', meta.title,
      { k: k, padX: 2.4 * k, labelSize: 1.55 * k, valueSize: 3.6 * k, labelColor: lcol });
    paintCell(p, xc, y0 + r0, c2 / 2, r1, 'ESCALA', meta.scale,
      { k: k, padX: 2.2 * k, labelSize: 1.45 * k, valueSize: 2.4 * k,
        labelColor: lcol, singleLine: true });
    paintCell(p, xc + c2 / 2, y0 + r0, c2 / 2, r1, 'NIVEL', meta.levelName || '—',
      { k: k, padX: 2.2 * k, labelSize: 1.45 * k, valueSize: 2.2 * k,
        labelColor: lcol, singleLine: true });
    paintCell(p, xc, y0 + r0 + r1, c2 / 2, r2, 'FECHA', meta.date,
      { k: k, padX: 2.2 * k, labelSize: 1.45 * k, valueSize: 2.25 * k,
        labelColor: lcol, singleLine: true });
    paintCell(p, xc + c2 / 2, y0 + r0 + r1, c2 / 2, r2, 'REVISIÓN', meta.revision,
      { k: k, padX: 2.2 * k, labelSize: 1.45 * k, valueSize: 2.25 * k,
        labelColor: lcol, singleLine: true });

    var nx = xd, nw = numW;
    p.text('N.º DE LÁMINA', nx + nw / 2, y0 + 2.8 * k, {
      size: Math.max(1.15, 1.4 * k), bold: true, color: lcol,
      align: 'center', baseline: 'middle'
    });
    var noBoxH = H * 0.46;
    paintBigValue(p, meta.sheetNo, nx + 1.5 * k, y0 + 4.8 * k, nw - 3 * k, noBoxH,
      { color: INK, size: Math.min(H * 0.36, 11.5 * k), bold: true });
    p.line(nx + 1.5 * k, y0 + 4.8 * k + noBoxH + 1.6 * k,
      nx + nw - 1.5 * k, y0 + 4.8 * k + noBoxH + 1.6 * k, hair);
    p.text('REVISIÓN ' + meta.revision, nx + nw / 2, y0 + H - 2.3 * k, {
      size: Math.max(1.15, 1.55 * k), bold: true, color: INK,
      align: 'center', baseline: 'middle'
    });
  }

  /* ------------------------------------------------------------------ *
   *  Cajetín "técnico": barra lateral con retícula y tipografía mono
   * ------------------------------------------------------------------ */

  function paintTechnical(p, project, sheet, lay, k, meta) {
    var tb = lay.titleBlock;
    if (!tb) return;
    k = Math.max(k, 0.9);
    var bg = '#f1efe8';
    var mono = 'mono';
    var labelC = '#7b8894';
    var blockH = clamp(tb.h * 0.30, 46 * k, 94 * k);
    var accentW = Math.max(0.8, 1.0 * k);

    p.rect(tb.x, tb.y, tb.w, tb.h, { fill: bg });
    p.rect(tb.x, tb.y, tb.w, tb.h, { stroke: BORDER_INK, lineWidth: 0.35 });
    p.rect(tb.x, tb.y, accentW, tb.h, { fill: CYAN });
    var gy;
    for (gy = tb.y + 7 * k; gy < tb.y + tb.h - 2 * k; gy += 7 * k) {
      p.line(tb.x + accentW, gy, tb.x + tb.w, gy, { stroke: '#e0dbcd', lineWidth: 0.07 });
    }

    var pad = 3.4 * k;
    var x = tb.x + accentW + pad;
    var w = Math.max(20 * k, tb.w - accentW - pad * 1.8);
    var y = tb.y + pad;

    var markS = Math.min(14 * k, tb.w * 0.24);
    drawLogo(p, x, y, markS, {
      accent: CYAN, ink: DARK, color: INK, mono: true, wordSize: 4.4 * k,
      sub: 'HOJA TÉCNICA', subColor: labelC,
      maxW: w - markS - 2.4 * k, k: k
    });
    y += markS + 4.4 * k;
    p.line(x, y, x + w, y, { stroke: BORDER_INK, lineWidth: 0.35 });
    y += 3.4 * k;

    var dataBottom = tb.y + tb.h - blockH - pad * 2;
    function field(label, value, maxLines) {
      if (y > dataBottom - 7 * k) return;
      var lsize = Math.max(1.05, 1.45 * k);
      var vstyle = { size: 2.45 * k, bold: true, font: mono, color: INK };
      p.text(label, x, y, {
        size: lsize, bold: true, font: mono, color: labelC, baseline: 'top'
      });
      y += lsize * 1.7;
      var lines = wrapTextLines(value, w, vstyle).slice(0, maxLines || 2);
      var li;
      for (li = 0; li < lines.length; li++) {
        if (y > dataBottom) return;
        var st = fitTextSize(lines[li], w, vstyle, 1.5 * k);
        p.text(lines[li], x, y, {
          size: st.size, bold: true, font: mono, color: INK, baseline: 'top'
        });
        y += vstyle.size * 1.16;
      }
      y += 1.1 * k;
      p.line(x, y, x + w, y, { stroke: '#d9d3c4', lineWidth: 0.1 });
      y += 3.4 * k;
    }

    field('PROYECTO', meta.project, 2);
    field('CLIENTE', meta.client, 2);
    field('UBICACIÓN', meta.location, 2);
    field('INGENIERO', meta.engineer, 1);
    field('LICENCIA', meta.license, 1);
    if (meta.phone) field('TELÉFONO', meta.phone, 1);
    if (meta.email) field('CORREO', meta.email, 1);
    field('NIVEL', meta.levelText || meta.levelName || '—', 1);

    /* ---- leyenda, escala gráfica, revisiones y observaciones ---- */
    var legendY = y + 0.6 * k;
    if (dataBottom - legendY > 30 * k) {
      p.text('LEYENDA', x, legendY + 1.3 * k, {
        size: Math.max(1.1, 1.45 * k), bold: true, font: mono, color: labelC, baseline: 'top'
      });
      legendY += 4.2 * k;
      var legend = [
        { label: 'MURO', kind: 'wall' },
        { label: 'VENTANA', kind: 'win' },
        { label: 'PUERTA', kind: 'door' },
        { label: 'MOBILIARIO', kind: 'furn' }
      ];
      var li2, kd;
      for (li2 = 0; li2 < legend.length; li2++) {
        if (legendY > dataBottom - 7 * k) break;
        var lbx = x, lby = legendY, lbw = 14 * k, lbh = 5.4 * k;
        p.rect(lbx, lby, lbw, lbh, { stroke: '#d9d3c4', lineWidth: 0.1 });
        kd = legend[li2].kind;
        if (kd === 'wall') {
          p.rect(lbx + 1.3 * k, lby + lbh * 0.32, lbw - 2.6 * k, lbh * 0.36,
            { fill: '#263238' });
        } else if (kd === 'win') {
          p.line(lbx + 1.3 * k, lby + lbh * 0.40, lbx + lbw - 1.3 * k,
            lby + lbh * 0.40, { stroke: '#3d6f7a', lineWidth: 0.22 });
          p.line(lbx + 1.3 * k, lby + lbh * 0.60, lbx + lbw - 1.3 * k,
            lby + lbh * 0.60, { stroke: '#3d6f7a', lineWidth: 0.22 });
        } else if (kd === 'door') {
          p.line(lbx + 1.3 * k, lby + lbh * 0.78, lbx + lbw - 1.3 * k,
            lby + lbh * 0.22, { stroke: '#3e4b57', lineWidth: 0.24 });
          p.arc(lbx + 1.3 * k, lby + lbh * 0.78, (lbw - 2.6 * k) * 0.5,
            -Math.PI / 2, 0, { stroke: '#4e6070', lineWidth: 0.18 });
        } else {
          p.rect(lbx + 1.3 * k, lby + lbh * 0.32, lbw - 2.6 * k, lbh * 0.36,
            { fill: '#dfe5ec', stroke: '#52606d', lineWidth: 0.14 });
        }
        p.text(legend[li2].label, x + lbw + 3.0 * k, lby + lbh / 2, {
          size: Math.max(1.0, 1.35 * k), bold: true, font: mono,
          color: INK, baseline: 'middle'
        });
        legendY += lbh + 2.5 * k;
      }

      if (dataBottom - legendY > 15 * k) {
        p.text('ESCALA GRÁFICA', x, legendY + 1.3 * k, {
          size: Math.max(1.05, 1.35 * k), bold: true, font: mono,
          color: labelC, baseline: 'top'
        });
        legendY += 3.6 * k;
        var segN = 4, segW = (w * 0.72) / segN, si;
        for (si = 0; si < segN; si++) {
          p.rect(x + si * segW, legendY, segW, 2.0 * k, {
            fill: si % 2 === 0 ? DARK : '#ffffff',
            stroke: BORDER_INK, lineWidth: 0.12
          });
        }
        p.text('0', x, legendY + 3.6 * k, {
          size: Math.max(1.0, 1.2 * k), font: mono, color: labelC,
          align: 'left', baseline: 'top'
        });
        p.text('5 m', x + segW * segN, legendY + 3.6 * k, {
          size: Math.max(1.0, 1.2 * k), font: mono, color: labelC,
          align: 'right', baseline: 'top'
        });
        legendY += 6.2 * k;
      }

      if (dataBottom - legendY > 20 * k) {
        p.text('REVISIONES', x, legendY + 1.2 * k, {
          size: Math.max(1.05, 1.3 * k), bold: true, font: mono,
          color: labelC, baseline: 'top'
        });
        legendY += 3.6 * k;
        var revRows = [
          ['REV', 'FECHA', 'DESCRIPCIÓN'],
          [meta.revision, meta.date, 'EMISIÓN']
        ];
        var rvW = w / 2.4;
        var rvi, rvj;
        for (rvi = 0; rvi < revRows.length; rvi++) {
          var ry = legendY + rvi * 3.6 * k;
          for (rvj = 0; rvj < 3; rvj++) {
            var rvx = x + (rvj === 0 ? 0 : (rvj === 1 ? rvW : rvW * 1.7));
            var rvw = rvj === 0 ? rvW : (rvj === 1 ? rvW * 0.7 : w - rvW * 1.7);
            tableText(p, revRows[rvi][rvj], rvx, ry, rvw - 1.2 * k, 3.6 * k, 'left', {
              size: Math.max(1.0, 1.2 * k), mono: true,
              bold: rvi === 0, color: rvi === 0 ? labelC : INK
            });
          }
          p.line(x, ry + 3.6 * k, x + w, ry + 3.6 * k,
            { stroke: '#d9d3c4', lineWidth: 0.09 });
        }
        legendY += 3.6 * k * (revRows.length + 1);
      }

      if (dataBottom - legendY > 22 * k) {
        p.text('OBSERVACIONES', x, legendY + 1.2 * k, {
          size: Math.max(1.05, 1.3 * k), bold: true, font: mono,
          color: labelC, baseline: 'top'
        });
        legendY += 3.4 * k;
        var oi;
        for (oi = 0; oi < 3; oi++) {
          if (legendY > dataBottom - 4 * k) break;
          p.line(x, legendY + 4.0 * k, x + w, legendY + 4.0 * k,
            { stroke: '#d9d3c4', lineWidth: 0.1 });
          legendY += 5.4 * k;
        }
      }
    }

    var block = {
      x: tb.x + accentW, y: tb.y + tb.h - blockH,
      w: tb.w - accentW, h: blockH
    };
    p.rect(block.x, block.y, block.w, block.h, { fill: DARK });
    p.rect(block.x, block.y, block.w, Math.max(0.7, 1.0 * k), { fill: CYAN });

    var bx = block.x + 3.0 * k;
    var bw = Math.max(14 * k, block.w - 6.0 * k);
    var zTitleH = blockH * 0.46;
    var zMidY = block.y + zTitleH;
    var zMidH = blockH * 0.24;
    var zBotY = zMidY + zMidH;
    var zBotH = block.y + block.h - zBotY;
    var softRule = { stroke: mixColor(DARK, '#ffffff', 0.24), lineWidth: 0.12 };

    p.text('TÍTULO DE LÁMINA', bx, block.y + 3.0 * k, {
      size: Math.max(1.05, 1.4 * k), bold: true, font: mono, color: CYAN, baseline: 'top'
    });
    var tin = { size: Math.min(2.9 * k, zTitleH * 0.22), bold: true, font: mono, color: WHITE };
    var tlines = wrapTextLines(meta.title, bw, tin).slice(0, 2);
    var ty = block.y + 5.7 * k;
    var ti;
    for (ti = 0; ti < tlines.length; ti++) {
      var tst = fitTextSize(tlines[ti], bw, tin, 1.6 * k);
      p.text(tlines[ti], bx, ty, {
        size: tst.size, bold: true, font: mono, color: WHITE, baseline: 'top'
      });
      ty += tin.size * 1.16;
    }
    if (ty < zMidY - 3.4 * k) {
      p.text('PROYECTO: ' + String(meta.project).toUpperCase(), bx, ty + 0.6 * k, {
        size: Math.max(1.0, Math.min(1.35 * k, zTitleH * 0.11)),
        bold: true, font: mono, color: '#9fb0bf', baseline: 'top'
      });
    }
    p.line(block.x + 2.4 * k, zMidY, block.x + block.w - 2.4 * k, zMidY, softRule);
    p.line(block.x + 2.4 * k, zBotY, block.x + block.w - 2.4 * k, zBotY, softRule);

    p.text('NIVEL', bx, zMidY + 1.3 * k, {
      size: Math.max(1.0, 1.25 * k), bold: true, font: mono,
      color: '#8fa0ae', baseline: 'top'
    });
    var lvl = meta.levelText || meta.levelName || '—';
    var lvlSt = fitTextSize(lvl, bw * 0.58, { size: 1.8 * k, bold: true, font: mono }, 1.2 * k);
    p.text(lvl, bx, zMidY + 3.5 * k, {
      size: lvlSt.size, bold: true, font: mono, color: WHITE, baseline: 'top'
    });
    p.text('LÁMINA', block.x + block.w - 3.0 * k, zMidY + 1.3 * k, {
      size: Math.max(1.0, 1.25 * k), bold: true, font: mono,
      color: CYAN, align: 'right', baseline: 'top'
    });
    var noSt = bigTextSize(meta.sheetNo, 36 * k, zMidH * 0.92,
      { size: zMidH * 0.52, bold: true, font: mono, color: ACCENT });
    p.text(meta.sheetNo, block.x + block.w - 3.0 * k, zMidY + zMidH * 0.64, {
      size: noSt.size, bold: true, font: mono, color: ACCENT,
      align: 'right', baseline: 'middle'
    });

    var cells3 = [
      { label: 'ESCALA', value: meta.scale },
      { label: 'FECHA', value: meta.date },
      { label: 'REVISIÓN', value: meta.revision }
    ];
    var cw = (block.w - 4.8 * k) / 3;
    var ci;
    for (ci = 0; ci < cells3.length; ci++) {
      var cx = block.x + 2.4 * k + ci * cw;
      if (ci > 0) p.line(cx, zBotY + 1.2 * k, cx, block.y + block.h - 1.2 * k, softRule);
      paintCell(p, cx, zBotY, cw, zBotH, cells3[ci].label, cells3[ci].value, {
        k: k, mono: true, padX: 2.2 * k, padY: 1.4 * k,
        labelSize: 1.2 * k, valueSize: 1.9 * k,
        labelColor: '#8fa0ae', valueColor: WHITE, singleLine: true
      });
    }
  }

  /* ------------------------------------------------------------------ *
   *  Cajetín "municipal": barra superior + bloque inferior con casillas
   * ------------------------------------------------------------------ */

  function paintMunicipal(p, project, sheet, lay, k, meta) {
    var hd = lay.header;
    var tb = lay.titleBlock;
    var i;
    k = Math.max(k, 0.9);

    if (hd) {
      p.rect(hd.x, hd.y, hd.w, hd.h, { fill: DARK_2 });
      p.rect(hd.x, hd.y, hd.w, Math.max(0.6, 0.85 * k), { fill: ACCENT });
      var leftBar = Math.max(2.0 * k, 1.8);
      p.rect(hd.x, hd.y, leftBar, hd.h, { fill: ACCENT });
      var hpad = 3.2 * k;
      var hMark = Math.max(5 * k, Math.min(hd.h - 2.6 * k, 10 * k));
      drawLogo(p, hd.x + leftBar + hpad, hd.y + (hd.h - hMark) / 2, hMark, {
        accent: ACCENT, ink: DARK, color: WHITE, wordSize: hMark * 0.44,
        maxW: hd.w * 0.26, k: k
      });
      var rightW = Math.min(52 * k, hd.w * 0.20);
      var leftW = Math.min(hd.w * 0.30, 90 * k);
      var centerW = Math.max(40 * k, hd.w - leftW - rightW - 2 * hpad);
      var cx = hd.x + leftW + centerW / 2;
      var h1 = fitTextSize('EXPEDIENTE DE LICENCIA DE CONSTRUCCIÓN', centerW,
        { size: 2.15 * k, bold: true, color: WHITE }, 1.35 * k);
      p.text('EXPEDIENTE DE LICENCIA DE CONSTRUCCIÓN', cx, hd.y + hd.h * 0.38, {
        size: h1.size, bold: true, color: WHITE, align: 'center', baseline: 'middle'
      });
      var h2 = fitTextSize('PLANOS ARQUITECTÓNICOS · DOCUMENTO TÉCNICO', centerW,
        { size: 1.5 * k, bold: true, color: CYAN }, 1.05 * k);
      p.text('PLANOS ARQUITECTÓNICOS · DOCUMENTO TÉCNICO', cx, hd.y + hd.h * 0.74, {
        size: h2.size, bold: true, color: CYAN, align: 'center', baseline: 'middle'
      });
      p.text('LÁMINA', hd.x + hd.w - hpad, hd.y + hd.h * 0.30, {
        size: Math.max(1.0, 1.35 * k), bold: true,
        color: mixColor(DARK_2, '#ffffff', 0.55), align: 'right', baseline: 'middle'
      });
      var hno = bigTextSize(meta.sheetNo, rightW - hpad, hd.h * 0.46,
        { size: hd.h * 0.40, bold: true, color: ACCENT });
      p.text(meta.sheetNo, hd.x + hd.w - hpad, hd.y + hd.h * 0.68, {
        size: hno.size, bold: true, color: ACCENT, align: 'right', baseline: 'middle'
      });
    }

    if (!tb) return;
    var form = '#fbf9f2';
    var cellStroke = '#a7b0b8';
    p.rect(tb.x, tb.y, tb.w, tb.h, { fill: form });
    p.rect(tb.x, tb.y, tb.w, tb.h, { stroke: INK, lineWidth: 0.5 });
    p.rect(tb.x + 1.3 * k, tb.y + 1.3 * k, tb.w - 2.6 * k, tb.h - 2.6 * k,
      { stroke: INK, lineWidth: 0.18 });

    var pad = 3.0 * k;
    var x0 = tb.x + pad, y0 = tb.y + pad;
    var W = tb.w - pad * 2, H = tb.h - pad * 2;
    var r1H = H * 0.34;
    var r2H = H * 0.29;
    var r3H = H - r1H - r2H;
    var y1 = y0 + r1H, y2 = y1 + r2H;
    var w1a = W * 0.64, w1b = W - w1a;

    paintCell(p, x0, y0, w1a, r1H, 'PROYECTO', meta.project, {
      k: k, padX: 2.6 * k, labelSize: 1.5 * k, valueSize: 3.3 * k,
      labelColor: INK_SOFT, valueColor: INK, stroke: cellStroke
    });
    paintCell(p, x0 + w1a, y0, w1b, r1H, 'TÍTULO DE LÁMINA', meta.title, {
      k: k, padX: 2.4 * k, labelSize: 1.5 * k, valueSize: 2.7 * k,
      labelColor: INK_SOFT, valueColor: INK, stroke: cellStroke
    });

    var cols = [
      { label: 'CLIENTE', value: meta.client, frac: 0.26 },
      { label: 'UBICACIÓN', value: meta.location, frac: 0.30 },
      { label: 'INGENIERO', value: meta.engineer, frac: 0.26 },
      { label: 'LICENCIA', value: meta.license, frac: 0.18 }
    ];
    var cxp = x0, ri;
    for (ri = 0; ri < cols.length; ri++) {
      var cw = W * cols[ri].frac;
      paintCell(p, cxp, y1, cw, r2H, cols[ri].label, cols[ri].value, {
        k: k, padX: 2.0 * k, labelSize: 1.35 * k, valueSize: 2.2 * k,
        labelColor: INK_SOFT, valueColor: INK, stroke: cellStroke
      });
      cxp += cw;
    }

    var dataW = W * 0.44;
    var halfW = dataW / 2, halfH = r3H / 2;
    var dataCells = [
      ['ESCALA', meta.scale], ['FECHA', meta.date],
      ['REVISIÓN', meta.revision], ['NIVEL', meta.levelName || '—']
    ];
    for (ri = 0; ri < 4; ri++) {
      var dcx = x0 + (ri % 2) * halfW;
      var dcy = y2 + Math.floor(ri / 2) * halfH;
      paintCell(p, dcx, dcy, halfW, halfH, dataCells[ri][0], dataCells[ri][1], {
        k: k, padX: 1.8 * k, padY: 0.9 * k, labelSize: 1.2 * k,
        valueSize: 1.95 * k, labelColor: INK_SOFT, valueColor: INK,
        stroke: cellStroke, singleLine: true
      });
    }

    var sx = x0 + dataW, sw = W - dataW;
    p.rect(sx, y2, sw, r3H, { fill: '#f5f1e6', stroke: cellStroke, lineWidth: 0.15 });
    var sp = 2.2 * k;
    p.text('REVISIÓN Y FIRMAS', sx + sp, y2 + 2.1 * k, {
      size: Math.max(1.0, 1.25 * k), bold: true, color: INK_SOFT, baseline: 'middle'
    });
    var checks = ['REVISADO', 'APROBADO', 'OBSERVADO'];
    var chW = (sw - sp * 2) / 3;
    var chY = y2 + Math.max(3.8 * k, r3H * 0.26);
    for (i = 0; i < checks.length; i++) {
      var bx = sx + sp + i * chW;
      p.rect(bx, chY, 2.0 * k, 2.0 * k, { stroke: INK, lineWidth: 0.16 });
      p.text(checks[i], bx + 2.8 * k, chY + 1.0 * k, {
        size: Math.max(0.95, 1.15 * k), color: INK_SOFT, baseline: 'middle'
      });
    }
    var sigLabels = ['PROYECTISTA', 'REVISOR MUNICIPAL', 'APROBACIÓN'];
    var sigY = y2 + r3H * 0.68;
    for (i = 0; i < sigLabels.length; i++) {
      var lx = sx + sp + i * chW;
      p.line(lx, sigY, lx + chW - 3 * k, sigY, { stroke: INK, lineWidth: 0.18 });
      p.text(sigLabels[i], lx + (chW - 3 * k) / 2, sigY + 2.2 * k, {
        size: Math.max(0.9, 1.08 * k), color: INK_SOFT,
        align: 'center', baseline: 'middle'
      });
    }
  }

  function paintTitleBlock(p, project, sheet, lay, k, meta) {
    var tpl = normalizeTemplate(sheet && sheet.template);
    if (tpl === 'classic') paintClassic(p, project, sheet, lay, k, meta);
    else if (tpl === 'technical') paintTechnical(p, project, sheet, lay, k, meta);
    else if (tpl === 'municipal') paintMunicipal(p, project, sheet, lay, k, meta);
    else paintModern(p, project, sheet, lay, k, meta);
  }

  /* ------------------------------------------------------------------ *
   *  Contenido: notas generales y cuadros
   * ------------------------------------------------------------------ */

  var STANDARD_NOTES = [
    'Las cotas y superficies se expresan en el sistema de unidades seleccionado en el proyecto (métrico o imperial).',
    'Los muros se ejecutarán en albañilería de 150 mm (6") de espesor, salvo que el plano indique otra dimensión.',
    'Las puertas interiores tendrán 0,90 × 2,10 m (3\'-0" × 7\'-0"); las ventanas serán de aluminio con vidrio simple de 4 mm (5/32"), salvo detalle en contra.',
    'La cubierta se resolverá con losa de hormigón armado y pendiente mínima del 2 % hacia los desagües.',
    'Las instalaciones sanitaria, eléctrica y de gas deberán cumplir con las normas técnicas vigentes del municipio.',
    'Verificar en obra las cotas y niveles antes de iniciar la excavación; cualquier diferencia debe consultarse con el proyectista.',
    'Los planos de detalle y las especificaciones técnicas forman parte integrante de este expediente.'
  ];

  function libCategoryName(def, lib) {
    if (!def) return '';
    var cats = lib && toArray(lib.categories);
    var i;
    for (i = 0; i < cats.length; i++) {
      if (cats[i] && cats[i].id === def.cat) return cleanText(cats[i].name, '');
    }
    return cleanText(def.cat, '');
  }

  function tableText(p, str, x, y, w, h, align, style) {
    var st = fitTextSize(str, Math.max(1, w), style, Math.max(1.05, style.size * 0.62));
    var ax = align === 'right' ? x + w : (align === 'center' ? x + w / 2 : x);
    p.text(str, ax, y + h / 2, {
      size: st.size, bold: !!style.bold, color: style.color || INK,
      font: style.mono ? 'mono' : null, align: align || 'left', baseline: 'middle'
    });
  }

  function paintTable(p, x, y, w, maxY, k, opt) {
    var titleSize = Math.max(1.25, 2.15 * k);
    var titleH = titleSize * 2.3;
    var headH = 4.3 * k;
    var footH = opt.footer ? 4.3 * k : 0;
    var rowH = Math.max(2.6 * k, num(opt.rowH, 3.9 * k));
    var cols = opt.columns;
    var rows = toArray(opt.rows);
    var ci, ri;

    p.rect(x, y, 1.1 * k, titleSize * 1.05, { fill: ACCENT, radius: 0.15 * k });
    p.text(opt.title, x + 2.7 * k, y + titleSize * 0.55, {
      size: titleSize, bold: true, color: INK, baseline: 'middle'
    });

    var headY = y + titleH;
    var avail = Math.max(rowH, maxY - headY - headH - footH);
    var maxRows = Math.max(1, Math.floor(avail / rowH));
    var extra = 0;
    if (rows.length > maxRows) {
      extra = rows.length - (maxRows - 1);
      rows = rows.slice(0, Math.max(1, maxRows - 1));
    }

    var totalFrac = 0;
    for (ci = 0; ci < cols.length; ci++) totalFrac += num(cols[ci].frac, 0);
    if (!(totalFrac > 0)) totalFrac = 1;
    var xs = [];
    var acc = x;
    for (ci = 0; ci < cols.length; ci++) {
      xs.push(acc);
      acc += w * num(cols[ci].frac, 0) / totalFrac;
    }
    function colW(ci) {
      return (ci + 1 < cols.length ? xs[ci + 1] : x + w) - xs[ci];
    }

    var tableH = headH + rows.length * rowH + (extra ? rowH : 0) + footH;
    var bottom = headY + tableH;
    p.rect(x, headY, w, tableH, { stroke: '#9aa5ae', lineWidth: 0.22 });
    p.rect(x, headY, w, headH, { fill: DARK });
    for (ci = 0; ci < cols.length; ci++) {
      tableText(p, cols[ci].label, xs[ci] + 1.4 * k, headY, colW(ci) - 2.2 * k, headH,
        cols[ci].align, { size: 1.6 * k, bold: true, color: WHITE });
    }

    var ry;
    for (ri = 0; ri < rows.length; ri++) {
      ry = headY + headH + ri * rowH;
      if (ri % 2 === 1) p.rect(x, ry, w, rowH, { fill: '#f4f1e9' });
      if (ri > 0) p.line(x, ry, x + w, ry, { stroke: '#ded8ca', lineWidth: 0.09 });
      for (ci = 0; ci < cols.length; ci++) {
        tableText(p, rows[ri][ci], xs[ci] + 1.4 * k, ry, colW(ci) - 2.2 * k, rowH,
          cols[ci].align, { size: 1.68 * k, color: INK, mono: ci === 0 });
      }
    }
    if (extra > 0) {
      ry = headY + headH + rows.length * rowH;
      p.rect(x, ry, w, rowH, { fill: '#f4f1e9' });
      p.text('… ' + extra + ' fila' + (extra === 1 ? '' : 's') + ' más', x + 1.4 * k,
        ry + rowH / 2, { size: 1.5 * k, color: INK_SOFT, baseline: 'middle' });
    }
    if (opt.footer) {
      ry = bottom - footH;
      p.rect(x, ry, w, footH, { fill: mixColor(ACCENT, '#ffffff', 0.72) });
      p.line(x, ry, x + w, ry, { stroke: '#9aa5ae', lineWidth: 0.22 });
      var foot = toArray(opt.footer);
      for (ci = 0; ci < cols.length; ci++) {
        tableText(p, foot[ci] || '', xs[ci] + 1.4 * k, ry, colW(ci) - 2.2 * k, footH,
          cols[ci].align, { size: 1.68 * k, bold: true, color: INK, mono: ci === 0 });
      }
    }
    for (ci = 1; ci < cols.length; ci++) {
      p.line(xs[ci], headY, xs[ci], bottom, { stroke: '#c9d0d6', lineWidth: 0.09 });
    }
    return bottom;
  }

  // Notas generales en una o varias columnas; la altura se ajusta al contenido.
  // Devuelve la coordenada Y inferior utilizada.
  function paintNotesBlock(p, project, meta, x, y, w, maxH, k, colCount) {
    var titleSize = Math.max(1.45, 2.3 * k);
    var cols = Math.max(1, Math.round(num(colCount, 1)));
    p.rect(x, y, 1.1 * k, titleSize * 1.05, { fill: ACCENT, radius: 0.15 * k });
    p.text('NOTAS GENERALES', x + 2.8 * k, y + titleSize * 0.55, {
      size: titleSize, bold: true, color: INK, baseline: 'middle'
    });
    var top = y + titleSize * 2.2;
    var style = { size: 2.0 * k, color: '#33414d' };
    var lineH = style.size * 1.3;
    var gap = 7 * k;
    var colW = (w - gap * (cols - 1)) / cols;
    var maxAvail = Math.max(lineH, (y + maxH) - top);
    var maxPerCol = Math.max(1, Math.floor(maxAvail / lineH));
    var lines = [];
    var i, j;
    if (meta.notes) {
      lines.push({ label: 'DEL PROYECTO' });
      var pl = wrapTextLines(meta.notes, colW, style);
      for (j = 0; j < pl.length; j++) lines.push({ text: pl[j], indent: 0 });
      lines.push({ text: '' });
    }
    for (i = 0; i < STANDARD_NOTES.length; i++) {
      var nl = wrapTextLines(STANDARD_NOTES[i], colW - 4.5 * k, style);
      for (j = 0; j < nl.length; j++) {
        lines.push({ text: nl[j], num: j === 0 ? (i + 1) : null, indent: 4.5 * k });
      }
    }
    var totalCap = maxPerCol * cols;
    if (lines.length > totalCap) {
      lines = lines.slice(0, totalCap - 1);
      lines.push({ text: '…', indent: 0 });
    }
    var perCol = Math.max(1, Math.ceil(lines.length / cols));
    var usedH = titleSize * 2.2 + perCol * lineH;
    p.clipRect(x, y, w, Math.min(maxH, usedH + lineH), function () {
      var c, li, line, cx, cy, start, end;
      for (c = 0; c < cols; c++) {
        start = c * perCol;
        end = Math.min(lines.length, start + perCol);
        cx = x + c * (colW + gap);
        cy = top;
        for (li = start; li < end; li++) {
          line = lines[li];
          if (line.label) {
            p.text(line.label, cx, cy, {
              size: Math.max(1.15, 1.5 * k), bold: true,
              color: INK_SOFT, baseline: 'top'
            });
          } else if (line.text) {
            if (line.num) {
              p.text(line.num + '.', cx, cy, {
                size: 1.95 * k, bold: true, color: '#b5651d', baseline: 'top'
              });
            }
            p.text(line.text, cx + line.indent, cy, {
              size: style.size, color: style.color, baseline: 'top'
            });
          }
          cy += lineH;
        }
      }
    });
    return Math.min(y + maxH, y + usedH);
  }

  function paintRoomsTable(p, project, x, y, w, maxY, k) {
    var rooms = toArray(project.rooms);
    var levels = toArray(project.levels);
    var order = {};
    var i, l;
    for (i = 0; i < levels.length; i++) {
      if (levels[i]) order[levels[i].id] = i;
    }
    var list = [];
    for (i = 0; i < rooms.length; i++) {
      if (rooms[i] && toArray(rooms[i].polygon).length >= 3) list.push(rooms[i]);
    }
    list.sort(function (a, b) {
      var la = order[a.level] === undefined ? 99 : order[a.level];
      var lb = order[b.level] === undefined ? 99 : order[b.level];
      if (la !== lb) return la - lb;
      return cleanText(a.name, '').localeCompare(cleanText(b.name, ''));
    });
    var total = 0;
    var rows = [];
    for (i = 0; i < list.length; i++) {
      l = findLevel(project, list[i].level);
      var area = Geo().polygonArea(list[i].polygon);
      total += area;
      rows.push([
        pad(i + 1, 2),
        cleanText(list[i].name, 'Ambiente'),
        l ? cleanText(l.name, '—') : '—',
        Geo().formatArea(area, project.settings && project.settings.units)
      ]);
    }
    return paintTable(p, x, y, w, maxY, k, {
      title: 'CUADRO DE AMBIENTES',
      columns: [
        { label: 'N.º', frac: 0.08, align: 'center' },
        { label: 'AMBIENTE', frac: 0.44, align: 'left' },
        { label: 'NIVEL', frac: 0.25, align: 'left' },
        { label: 'ÁREA', frac: 0.23, align: 'right' }
      ],
      rows: rows,
      footer: ['', 'TOTAL: ' + rows.length + ' AMBIENTES', '', Geo().formatArea(total, project.settings && project.settings.units)],
      rowH: 5.0 * k
    });
  }

  function paintFurnitureTable(p, project, x, y, w, maxY, k) {
    var items = toArray(project.items);
    var lib = getLibrary();
    var grouped = {};
    var order = [];
    var i;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      var def = libDef(lib, it.libId);
      var name = cleanText(it.name, def ? cleanText(def.name, '') : '');
      if (!name) name = cleanText(it.libId, 'Mobiliario');
      var key = name.toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(grouped, key)) {
        grouped[key] = { name: name, cat: libCategoryName(def, lib), count: 0 };
        order.push(key);
      }
      grouped[key].count++;
    }
    order.sort(function (a, b) {
      return grouped[b].count - grouped[a].count ||
        grouped[a].name.localeCompare(grouped[b].name);
    });
    var rows = [];
    for (i = 0; i < order.length; i++) {
      var g = grouped[order[i]];
      rows.push([String(g.count), g.name, g.cat || '—']);
    }
    return paintTable(p, x, y, w, maxY, k, {
      title: 'CUADRO DE MOBILIARIO',
      columns: [
        { label: 'CANT.', frac: 0.12, align: 'center' },
        { label: 'MOBILIARIO', frac: 0.60, align: 'left' },
        { label: 'CATEGORÍA', frac: 0.28, align: 'left' }
      ],
      rows: rows,
      footer: [String(items.length), 'TOTAL DE PIEZAS', ''],
      rowH: 5.0 * k
    });
  }

  function paintAreaSummary(p, project, x, y, w, maxY, k) {
    var titleSize = Math.max(1.2, 2.0 * k);
    p.rect(x, y, 1.1 * k, titleSize * 1.05, { fill: ACCENT, radius: 0.15 * k });
    p.text('RESUMEN DE SUPERFICIES', x + 2.7 * k, y + titleSize * 0.55, {
      size: titleSize, bold: true, color: INK, baseline: 'middle'
    });
    var levels = toArray(project.levels);
    var rooms = toArray(project.rooms);
    var rows = [];
    var total = 0;
    var i, j, lvl, area;
    for (i = 0; i < levels.length; i++) {
      lvl = levels[i];
      if (!lvl) continue;
      area = 0;
      for (j = 0; j < rooms.length; j++) {
        if (rooms[j] && rooms[j].level === lvl.id &&
            toArray(rooms[j].polygon).length >= 3) {
          area += Geo().polygonArea(rooms[j].polygon);
        }
      }
      total += area;
      rows.push([cleanText(lvl.name, 'Nivel'), Geo().formatArea(area, project.settings && project.settings.units)]);
    }
    rows.push(['TOTAL CONSTRUIDO', Geo().formatArea(total, project.settings && project.settings.units)]);
    var top = y + titleSize * 2.4;
    var rowH = Math.min(8.0 * k, Math.max(3.8 * k, (maxY - top) / rows.length));
    var tableH = rowH * rows.length;
    if (top + tableH > maxY) tableH = Math.max(rowH, maxY - top);
    p.rect(x, top, w, tableH, { stroke: '#9aa5ae', lineWidth: 0.18 });
    for (i = 0; i < rows.length; i++) {
      var ry = top + i * rowH;
      if (ry + rowH > top + tableH + 0.1) break;
      var isTotal = i === rows.length - 1;
      if (isTotal) p.rect(x, ry, w, rowH, { fill: mixColor(ACCENT, '#ffffff', 0.72) });
      else if (i % 2 === 1) p.rect(x, ry, w, rowH, { fill: '#f4f1e9' });
      if (i > 0) p.line(x, ry, x + w, ry, { stroke: '#ded8ca', lineWidth: 0.09 });
      tableText(p, rows[i][0], x + 1.4 * k, ry, w * 0.62, rowH, 'left',
        { size: 1.7 * k, color: INK, bold: isTotal });
      tableText(p, rows[i][1], x + w * 0.63, ry, w * 0.34, rowH, 'right',
        { size: 1.7 * k, color: INK, bold: isTotal, mono: true });
    }
    p.line(x + w * 0.63, top, x + w * 0.63, top + tableH,
      { stroke: '#c9d0d6', lineWidth: 0.09 });
    return top + tableH;
  }

  function paintDataSummary(p, project, meta, x, y, w, maxY, k) {
    var titleSize = Math.max(1.2, 2.0 * k);
    p.rect(x, y, 1.1 * k, titleSize * 1.05, { fill: ACCENT, radius: 0.15 * k });
    p.text('DATOS DEL PROYECTO', x + 2.7 * k, y + titleSize * 0.55, {
      size: titleSize, bold: true, color: INK, baseline: 'middle'
    });
    var fields = [
      ['CLIENTE', meta.client],
      ['UBICACIÓN', meta.location],
      ['INGENIERO', meta.engineer],
      ['LICENCIA', meta.license],
      ['FECHA', meta.date],
      ['REVISIÓN', meta.revision]
    ];
    if (meta.phone) fields.push(['TELÉFONO', meta.phone]);
    if (meta.email) fields.push(['CORREO', meta.email]);
    var top = y + titleSize * 2.6;
    var rowH = Math.min(7.4 * k, Math.max(3.6 * k, (maxY - top) / fields.length));
    var maxRows = Math.max(1, Math.floor((maxY - top) / rowH));
    var i;
    for (i = 0; i < fields.length && i < maxRows; i++) {
      var ry = top + i * rowH;
      p.text(fields[i][0], x, ry + rowH * 0.46, {
        size: Math.max(1.0, 1.3 * k), bold: true, color: INK_SOFT, baseline: 'middle'
      });
      var vst = fitTextSize(fields[i][1], w, { size: 2.1 * k, bold: true, color: INK }, 1.2 * k);
      p.text(fields[i][1], x, ry + rowH * 0.80, {
        size: vst.size, bold: true, color: INK, baseline: 'middle'
      });
      if (i < fields.length - 1) {
        p.line(x, ry + rowH, x + w, ry + rowH,
          { stroke: '#e3ded2', lineWidth: 0.1 });
      }
    }
    return top + Math.min(fields.length, maxRows) * rowH;
  }

  function paintNotesContent(p, project, sheet, content, k, meta) {
    var x = content.x, y = content.y;
    var w = content.w, h = content.h;
    var kk = Math.max(k, 0.9);
    p.text(cleanText(sheet && sheet.title, 'NOTAS GENERALES Y CUADROS'),
      x, y + 3.2 * kk, { size: 3.0 * kk, bold: true, color: INK, baseline: 'middle' });
    p.text(meta.project + '  ·  LÁMINA ' + meta.sheetNo, x + w, y + 3.2 * kk, {
      size: 2.0 * kk, color: INK_SOFT, align: 'right', baseline: 'middle'
    });
    p.line(x, y + 6.2 * kk, x + w, y + 6.2 * kk,
      { stroke: ACCENT, lineWidth: 0.55 });

    var top = y + 9.6 * kk;
    var bodyH = Math.max(40, h - (top - y));
    var gap = 6.0 * kk;
    var notesCols = w > 200 * kk ? 2 : 1;
    var notesBottom = paintNotesBlock(p, project, meta, x, top, w,
      Math.max(30, bodyH * 0.52), kk, notesCols);

    var tablesTop = notesBottom + gap;
    var tablesBottom = top + bodyH;
    if (tablesBottom - tablesTop < 30 * kk) tablesTop = top + bodyH * 0.5;
    var colGap = 6.0 * kk;
    var leftW = (w - colGap) * 0.56;
    var rightW = w - leftW - colGap;

    var roomsBottom = paintRoomsTable(p, project, x, tablesTop, leftW, tablesBottom, kk);
    if (tablesBottom - roomsBottom > 30 * kk) {
      paintAreaSummary(p, project, x, roomsBottom + 5.0 * kk, leftW, tablesBottom, kk);
    }
    var furnBottom = paintFurnitureTable(p, project, x + leftW + colGap, tablesTop,
      rightW, tablesBottom, kk);
    if (tablesBottom - furnBottom > 32 * kk) {
      paintDataSummary(p, project, meta, x + leftW + colGap, furnBottom + 5.0 * kk,
        rightW, tablesBottom, kk);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Contenido: portada
   * ------------------------------------------------------------------ */

  function contentLabel(c) {
    c = normalizeContent(c);
    if (c === 'notes') return 'Notas y cuadros';
    if (c === 'cover') return 'Portada';
    if (c === '3d') return 'Vista 3D';
    if (c === 'front') return 'Fachada frontal';
    if (c === 'rear') return 'Fachada posterior';
    if (c === 'right') return 'Lateral derecha';
    if (c === 'left') return 'Lateral izquierda';
    return 'Planta';
  }

  function paintCoverThumb(p, project, sheet, meta, x, y, w, h, k) {
    k = Math.max(k, 0.9);
    var pad = 3.2 * k;
    var labelH = 5.2 * k;
    p.rect(x, y, w, h, { fill: '#ffffff', stroke: '#d8d2c4', lineWidth: 0.3 });
    p.rect(x + pad * 0.5, y + pad * 0.5, w - pad, h - pad,
      { stroke: '#ece7db', lineWidth: 0.12 });
    var level = findLevel(project, sheet.levelId);
    var levelId = level ? level.id : sheet.levelId;
    p.text('PLANTA' + (level ? ' — ' + cleanText(level.name, '').toUpperCase() : ''),
      x + pad, y + labelH * 0.62, {
        size: Math.max(1.15, 1.75 * k), bold: true, color: INK_SOFT,
        baseline: 'middle'
      });
    var bounds = planBounds(project, levelId);
    var inner = {
      x: x + pad, y: y + labelH,
      w: Math.max(8, w - pad * 2), h: Math.max(8, h - labelH - pad)
    };
    var f = Math.min(inner.w / bounds.w, inner.h / bounds.h);
    if (!(f > 0)) f = 0.001;
    var view = makeView(
      inner.x + inner.w / 2, inner.y + inner.h / 2,
      (bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2,
      f
    );
    var cfg = {
      levelId: levelId,
      showRooms: sheet.showRooms !== false,
      showFurniture: sheet.showFurniture !== false,
      showDims: false, showGrid: false
    };
    p.clipRect(inner.x - 0.5, inner.y - 0.5, inner.w + 1, inner.h + 1, function () {
      paintRooms(p, project, cfg, view);
      paintWalls(p, project, cfg, view, k);
      paintOpenings(p, project, cfg, view, k);
      paintItems(p, project, cfg, view, k);
    });
    p.rect(inner.x, inner.y, inner.w, inner.h, { stroke: '#e3ded2', lineWidth: 0.14 });
    paintNorth(p, inner.x + inner.w - 6 * k, inner.y + 7 * k, 3.2 * k,
      num(project.settings && project.settings.northAngle, 0), k);
  }

  function paintCoverData(p, project, meta, x, y, w, h, k) {
    k = Math.max(k, 0.9);
    var titleSize = Math.max(1.25, 2.0 * k);
    p.rect(x, y, 1.1 * k, titleSize * 1.05, { fill: ACCENT, radius: 0.15 * k });
    p.text('DATOS DEL PROYECTO', x + 2.7 * k, y + titleSize * 0.55, {
      size: titleSize, bold: true, color: INK, baseline: 'middle'
    });
    var fields = [
      ['CLIENTE', meta.client],
      ['UBICACIÓN', meta.location],
      ['INGENIERO', meta.engineer],
      ['LICENCIA', meta.license],
      ['FECHA', meta.date],
      ['REVISIÓN', meta.revision]
    ];
    if (meta.phone) fields.push(['TELÉFONO', meta.phone]);
    if (meta.email) fields.push(['CORREO', meta.email]);
    var top = y + titleSize * 2.5;
    var avail = h - (top - y);
    var rowH = Math.max(5.0 * k, Math.min(10.0 * k, avail / Math.max(1, fields.length)));
    var maxFields = Math.max(1, Math.floor(avail / rowH));
    if (fields.length > maxFields) fields = fields.slice(0, maxFields);
    var i;
    for (i = 0; i < fields.length; i++) {
      var ly = top + i * rowH;
      p.text(fields[i][0], x, ly + rowH * 0.30, {
        size: Math.max(1.0, 1.32 * k), bold: true, color: INK_SOFT, baseline: 'middle'
      });
      var vst = fitTextSize(fields[i][1], w,
        { size: 2.55 * k, bold: true, color: INK }, 1.2 * k);
      p.text(fields[i][1], x, ly + rowH * 0.70, {
        size: vst.size, bold: true, color: INK, baseline: 'middle'
      });
      if (i < fields.length - 1) {
        p.line(x, ly + rowH - 0.3 * k, x + w, ly + rowH - 0.3 * k,
          { stroke: '#e3ded2', lineWidth: 0.1 });
      }
    }
  }

  function paintSheetList(p, project, sheet, x, y, w, maxY, k) {
    k = Math.max(k, 0.9);
    var sheets = toArray(project.sheets);
    if (!sheets.length && sheet) sheets = [sheet];
    var rows = [];
    var i;
    for (i = 0; i < sheets.length; i++) {
      var s = sheets[i];
      if (!s) continue;
      rows.push([
        cleanText(s.sheetNo, '—'),
        cleanText(s.title, defaultTitle(s)),
        contentLabel(s.content),
        s.scale ? '1:' + num(s.scale, 100) : 'S/E',
        normalizeSize(s.size) + ' · ' +
          (normalizeOrientation(s.orientation) === 'portrait' ? 'VERTICAL' : 'HORIZONTAL')
      ]);
    }
    return paintTable(p, x, y, w, maxY, k, {
      title: 'LISTA DE LÁMINAS',
      columns: [
        { label: 'N.º', frac: 0.10, align: 'left' },
        { label: 'TÍTULO', frac: 0.36, align: 'left' },
        { label: 'CONTENIDO', frac: 0.20, align: 'left' },
        { label: 'ESCALA', frac: 0.14, align: 'left' },
        { label: 'FORMATO', frac: 0.20, align: 'left' }
      ],
      rows: rows,
      rowH: 4.4 * k
    });
  }

  function paintCoverContent(p, project, sheet, content, k, meta) {
    k = Math.max(k, 0.9);
    var x = content.x, y = content.y;
    var w = content.w, h = content.h;
    var bandH = Math.min(h * 0.36, 84 * k);
    var accentBar = Math.max(2.0 * k, 2.0);
    p.rect(x, y, w, bandH, { fill: DARK });
    p.rect(x, y, w, Math.max(0.7, 1.2 * k), { fill: ACCENT });
    p.rect(x, y, accentBar, bandH, { fill: ACCENT });

    var lx = x + accentBar + 8 * k;
    var markS = Math.min(16 * k, bandH * 0.24);
    drawLogo(p, lx, y + 6 * k, markS, {
      accent: ACCENT, ink: DARK, color: WHITE, wordSize: markS * 0.40,
      sub: 'DISEÑO RESIDENCIAL', subColor: ACCENT,
      maxW: w * 0.30, k: k
    });
    var rightX = x + w - 8 * k;
    p.text('EXPEDIENTE DE PLANOS', rightX, y + 7 * k, {
      size: Math.max(1.2, 1.8 * k), bold: true, color: CYAN,
      align: 'right', baseline: 'middle'
    });
    p.text('LÁMINA ' + meta.sheetNo, rightX, y + 11.2 * k, {
      size: Math.max(1.1, 1.7 * k), color: mixColor(DARK, '#ffffff', 0.55),
      align: 'right', baseline: 'middle'
    });

    var nameSt = bigTextSize(meta.project, w - 16 * k, bandH * 0.34,
      { size: 14 * k, bold: true, color: WHITE });
    p.text(meta.project, lx, y + bandH * 0.56, {
      size: nameSt.size, bold: true, color: WHITE, baseline: 'middle'
    });
    var desc = meta.description || 'Planos arquitectónicos del proyecto';
    var dcolor = mixColor(DARK, '#ffffff', 0.68);
    var dst = fitTextSize(desc, w - 16 * k, { size: 2.9 * k, color: dcolor }, 1.3 * k);
    p.text(desc, lx, y + bandH * 0.79, {
      size: dst.size, color: dcolor, baseline: 'middle'
    });
    p.text('REV. ' + meta.revision + '  ·  ' + meta.date, rightX, y + bandH - 6.0 * k, {
      size: Math.max(1.1, 1.7 * k), bold: true, color: ACCENT,
      align: 'right', baseline: 'middle'
    });

    var gap = 4.0 * k;
    var belowY = y + bandH + gap;
    var belowH = h - bandH - gap;
    var thumbH = Math.max(20, belowH * 0.56);
    var listH = belowH - thumbH - gap;
    var thumbW = w * 0.52;
    paintCoverThumb(p, project, sheet, meta, x, belowY, thumbW, thumbH, k);
    paintCoverData(p, project, meta, x + thumbW + gap, belowY,
      w - thumbW - gap, thumbH, k);
    if (listH > 10) {
      paintSheetList(p, project, sheet, x, belowY + thumbH + gap,
        w, belowY + belowH, k);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Contenido: vista 3D
   * ------------------------------------------------------------------ */

  function drawIsoMark(p, cx, cy, s, color) {
    if (!(s > 0.3)) return;
    var T = { x: cx, y: cy - s };
    var R = { x: cx + s * 0.87, y: cy - s * 0.5 };
    var BR = { x: cx + s * 0.87, y: cy + s * 0.5 };
    var B = { x: cx, y: cy + s };
    var BL = { x: cx - s * 0.87, y: cy + s * 0.5 };
    var L = { x: cx - s * 0.87, y: cy - s * 0.5 };
    var C = { x: cx, y: cy };
    p.polygon([T, R, BR, B, BL, L], {
      fill: '#f4f2ec', stroke: color, lineWidth: 0.4
    });
    p.polygon([T, R, C, L], { fill: '#e9edef', stroke: color, lineWidth: 0.3 });
    p.line(L.x, L.y, C.x, C.y, { stroke: color, lineWidth: 0.3 });
    p.line(C.x, C.y, B.x, B.y, { stroke: color, lineWidth: 0.3 });
    p.line(C.x, C.y, R.x, R.y, { stroke: color, lineWidth: 0.3 });
  }

  function paint3DContent(p, project, sheet, content, k, meta) {
    k = Math.max(k, 0.9);
    var kind = normalizeContent(sheet && sheet.content);
    var labels = {
      '3d': { title: 'VISTA 3D — PERSPECTIVA', caption: 'PERSPECTIVA ARQUITECTÓNICA DEL PROYECTO' },
      front: { title: 'FACHADA FRONTAL', caption: 'ELEVACIÓN FRONTAL DEL PROYECTO' },
      rear: { title: 'FACHADA POSTERIOR', caption: 'ELEVACIÓN POSTERIOR DEL PROYECTO' },
      right: { title: 'FACHADA LATERAL DERECHA', caption: 'ELEVACIÓN LATERAL DERECHA' },
      left: { title: 'FACHADA LATERAL IZQUIERDA', caption: 'ELEVACIÓN LATERAL IZQUIERDA' }
    };
    var info = labels[kind] || labels['3d'];
    var x = content.x, y = content.y;
    var w = content.w, h = content.h;
    p.text(info.title, x, y + 3.0 * k, {
      size: 2.9 * k, bold: true, color: INK, baseline: 'middle'
    });
    p.text(meta.levelText || meta.project, x + w, y + 3.0 * k, {
      size: 1.9 * k, color: INK_SOFT, align: 'right', baseline: 'middle'
    });
    p.line(x, y + 5.6 * k, x + w, y + 5.6 * k, { stroke: ACCENT, lineWidth: 0.5 });

    var by = y + 8.0 * k;
    var bh = Math.max(20, h - 9.0 * k);
    p.rect(x, by, w, bh, { fill: '#ffffff', stroke: '#d8d2c4', lineWidth: 0.35 });
    p.rect(x + 2.0 * k, by + 2.0 * k, w - 4.0 * k, bh - 4.0 * k,
      { stroke: '#e6e0d4', lineWidth: 0.12, dash: [3.0 * k, 2.5 * k] });

    var pad = 7.0 * k;
    var ix = x + pad, iy = by + pad;
    var iw = Math.max(10, w - pad * 2), ih = Math.max(10, bh - pad * 2);
    var url = sheet.imageDataUrl;
    var drawn = false;
    if (url) {
      var dims = imageDims(url);
      var ar = dims && dims.h > 0 ? dims.w / dims.h : iw / ih;
      var dw = iw, dh = dw / ar;
      if (dh > ih) { dh = ih; dw = dh * ar; }
      var dx = ix + (iw - dw) / 2;
      var dy = iy + (ih - dh) / 2;
      drawn = p.image(url, dx, dy, dw, dh);
      if (drawn) {
        p.rect(dx, dy, dw, dh, { stroke: '#b9c2c9', lineWidth: 0.2 });
        p.text(info.caption, x + w / 2,
          by + bh - 3.0 * k, {
            size: Math.max(1.0, 1.5 * k), color: INK_SOFT,
            align: 'center', baseline: 'middle'
          });
      }
    }
    if (!drawn) {
      var cx = x + w / 2;
      var markS = Math.min(18 * k, bh * 0.17);
      drawIsoMark(p, cx, by + bh * 0.38, markS, '#8d9aa5');
      p.text('VISTA NO DISPONIBLE', cx, by + bh * 0.63, {
        size: Math.min(4.4 * k, bh * 0.085), bold: true, color: INK,
        align: 'center', baseline: 'middle'
      });
      var msg = 'Actualiza la vista desde las propiedades de la lámina para incluirla.';
      var msgStyle = { size: 2.1 * k, color: INK_SOFT };
      var lines = wrapTextLines(msg, Math.min(iw, 150 * k), msgStyle).slice(0, 3);
      var my = by + bh * 0.72;
      var mi;
      for (mi = 0; mi < lines.length; mi++) {
        var mst = fitTextSize(lines[mi], iw, msgStyle, 1.2 * k);
        p.text(lines[mi], cx, my, {
          size: mst.size, color: INK_SOFT, align: 'center', baseline: 'middle'
        });
        my += msgStyle.size * 1.25;
      }
    }
  }

  /* ------------------------------------------------------------------ *
   *  Composición de la lámina (compartida por preview y PDF)
   * ------------------------------------------------------------------ */

  function composeSheet(p, project, sheet) {
    project = project || {};
    sheet = sheet || {};
    var size = pageSize(sheet);
    var k = sheetK(size.w, size.h);
    var tpl = normalizeTemplate(sheet.template);
    var lay = computeLayout(tpl, size.w, size.h, k);
    var content = normalizeContent(sheet.content);
    var meta, info = null;

    if (content === 'plan') {
      info = preparePlan(project, sheet, lay.content, k);
      meta = metaOf(project, sheet, '1:' + info.eff);
    } else {
      meta = metaOf(project, sheet, 'S/E');
    }

    p.rect(0, 0, size.w, size.h, { fill: PAPER });
    paintBorder(p, project, sheet, lay, k, meta);

    if (content === 'plan') {
      paintPlanContent(p, project, sheet, lay.content, k, info);
    } else if (content === 'notes') {
      paintNotesContent(p, project, sheet, lay.content, k, meta);
    } else if (content === 'cover') {
      paintCoverContent(p, project, sheet, lay.content, k, meta);
    } else {
      paint3DContent(p, project, sheet, lay.content, k, meta);
    }

    paintTitleBlock(p, project, sheet, lay, k, meta);
    return { size: size, k: k, layout: lay, meta: meta, info: info };
  }

  /* ------------------------------------------------------------------ *
   *  Render en canvas (preview y alta resolución)
   * ------------------------------------------------------------------ */

  var PREVIEW_HOOKS = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;

  function setPreviewState(canvas, state) {
    if (PREVIEW_HOOKS) PREVIEW_HOOKS.set(canvas, state);
    else canvas.__engdraftPreviewState = state;
  }

  function getPreviewState(canvas) {
    if (PREVIEW_HOOKS) return PREVIEW_HOOKS.get(canvas) || null;
    return canvas.__engdraftPreviewState || null;
  }

  // Re-render único cuando una imagen (por ejemplo la captura 3D) termina de cargar.
  function schedulePreviewRedraw(canvas, project, sheet) {
    if (!canvas) return;
    var st = getPreviewState(canvas);
    if (!st) { st = { redrawn: false }; setPreviewState(canvas, st); }
    if (st.redrawn) return;
    st.redrawn = true;
    var run = function () {
      try { renderPreview(canvas, project, sheet); } catch (e) { /* silencio */ }
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run);
    } else if (typeof setTimeout === 'function') {
      setTimeout(run, 16);
    }
  }

  function renderPreview(canvas, project, sheet) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    var size = pageSize(sheet);
    var cssW = 0;
    if (num(canvas.clientWidth, 0) > 0) cssW = canvas.clientWidth;
    else if (canvas.style && canvas.style.width) cssW = parseFloat(canvas.style.width) || 0;
    else if (canvas.parentElement && num(canvas.parentElement.clientWidth, 0) > 20) {
      cssW = canvas.parentElement.clientWidth;
    }
    if (!(cssW > 0)) cssW = 900;
    cssW = clamp(cssW, 220, 4000);
    var dpr = 1;
    if (typeof window !== 'undefined' && window.devicePixelRatio) {
      dpr = clamp(window.devicePixelRatio, 1, 2.5);
    }
    var pxW = Math.min(2400, Math.round(cssW * dpr));
    var scale = pxW / size.w;
    var pxH = Math.max(1, Math.round(size.h * scale));
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;
    if (canvas.style) {
      canvas.style.aspectRatio = String(size.w) + ' / ' + String(size.h);
      if (!(num(canvas.clientWidth, 0) > 0) && !canvas.style.width) {
        canvas.style.width = '100%';
      }
    }
    setPreviewState(canvas, { redrawn: false });
    var painter = new CanvasPainter(canvas, scale, 0, 0);
    painter.onImageReady = function () {
      schedulePreviewRedraw(canvas, project, sheet);
    };
    composeSheet(painter, project, sheet);
  }

  function renderSheet(canvas, project, sheet, pxPerMm) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    var size = pageSize(sheet);
    var ppm = clamp(num(pxPerMm, 3), 0.4, 24);
    var pxW = Math.max(1, Math.round(size.w * ppm));
    var pxH = Math.max(1, Math.round(size.h * ppm));
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;
    if (canvas.style) canvas.style.aspectRatio = String(size.w) + ' / ' + String(size.h);
    var painter = new CanvasPainter(canvas, ppm, 0, 0);
    composeSheet(painter, project, sheet);
    return { width: pxW, height: pxH, pxPerMm: ppm };
  }

  /* ------------------------------------------------------------------ *
   *  PDF: cadena binaria -> bytes, una página por lámina
   * ------------------------------------------------------------------ */

  // Cada carácter de la cadena representa un byte (0..255); un Blob construido
  // a partir de la cadena rompería los offsets del xref y los flujos de imagen.
  function pdfStringToBytes(str) {
    var s = String(str === null || str === undefined ? '' : str);
    var out = new Uint8Array(s.length);
    var i;
    for (i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255;
    return out;
  }

  function documentMeta(project) {
    var m = (project && project.meta) || {};
    return {
      title: cleanText(m.name, 'EngDraft'),
      subject: 'Láminas de planos — ' + cleanText(m.name, 'Proyecto EngDraft'),
      date: new Date()
    };
  }

  function createPDFBytes(project, sheets) {
    project = project || {};
    var list = toArray(sheets);
    if (!list.length) {
      var all = toArray(project.sheets);
      list = all.length ? all : [createSheet(project, {})];
    }
    var doc = new PDFDocument(documentMeta(project));
    var i;
    for (i = 0; i < list.length; i++) {
      var sheet = list[i] || {};
      var size = pageSize(sheet);
      var page = doc.addPage(size.w, size.h);
      var pp = new PDFPainter(page);
      try {
        composeSheet(pp, project, sheet);
      } catch (err) {
        pp.text('No se pudo componer esta lámina: ' +
          (err && err.message ? err.message : 'error desconocido'),
          size.w / 2, size.h / 2, {
            size: 4, color: '#f87171', align: 'center', baseline: 'middle'
          });
      }
    }
    return pdfStringToBytes(doc.build());
  }

  function createPDF(project, sheets) {
    var bytes = createPDFBytes(project, sheets);
    if (typeof Blob === 'undefined') return bytes;
    return new Blob([bytes], { type: 'application/pdf' });
  }

  function defaultPdfName(project) {
    var m = (project && project.meta) || {};
    var base = cleanText(m.name, 'EngDraft');
    base = base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return (base || 'EngDraft') + '.pdf';
  }

  function downloadPDF(project, sheets, filename) {
    var blob = createPDF(project, sheets);
    var name = cleanText(filename, defaultPdfName(project));
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    if (typeof Blob === 'undefined' || typeof document === 'undefined' ||
        typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return blob;
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    if (document.body) document.body.appendChild(a);
    try { a.click(); } catch (e) { /* silencio */ }
    if (typeof setTimeout === 'function') {
      setTimeout(function () {
        try { if (a.parentNode) a.parentNode.removeChild(a); } catch (e) { /* silencio */ }
        try { URL.revokeObjectURL(url); } catch (e) { /* silencio */ }
      }, 800);
    }
    return blob;
  }

  /* ------------------------------------------------------------------ *
   *  Creación de láminas
   * ------------------------------------------------------------------ */

  function nextSheetNumber(project) {
    var sheets = toArray(project && project.sheets);
    var max = 0;
    var prefix = 'A';
    var i, m;
    for (i = 0; i < sheets.length; i++) {
      if (!sheets[i]) continue;
      m = String(sheets[i].sheetNo || '').match(/^\s*([A-Za-zÁÉÍÓÚÜÑ]+)\s*[-–—]?\s*(\d+)/);
      if (!m) continue;
      if (!max) prefix = m[1].toUpperCase();
      max = Math.max(max, parseInt(m[2], 10) || 0);
    }
    return prefix + '-' + pad(max + 1, 2);
  }

  function createSheet(project, opts) {
    project = project || {};
    opts = opts || {};
    var content = normalizeContent(opts.content || 'plan');
    var levels = toArray(project.levels);
    var levelId = opts.levelId;
    if (levelId === undefined || levelId === null || levelId === '') {
      levelId = levels.length && levels[0] ? levels[0].id : null;
    }
    var level = findLevel(project, levelId);
    var contentName = content === 'cover' ? 'Portada'
      : content === 'notes' ? 'Notas y cuadros'
        : content === '3d' ? 'Vista 3D'
          : content === 'front' ? 'Fachada frontal'
            : content === 'rear' ? 'Fachada posterior'
              : content === 'right' ? 'Lateral derecha'
                : content === 'left' ? 'Lateral izquierda'
                  : (level ? cleanText(level.name, 'Planta') : 'Planta');
    var title = cleanText(opts.title, '');
    if (!title) {
      if (content === 'cover') title = 'PORTADA';
      else if (content === 'notes') title = 'NOTAS Y CUADROS';
      else if (content === '3d') title = 'VISTA 3D';
      else if (content === 'front') title = 'FACHADA FRONTAL';
      else if (content === 'rear') title = 'FACHADA POSTERIOR';
      else if (content === 'right') title = 'FACHADA LATERAL DERECHA';
      else if (content === 'left') title = 'FACHADA LATERAL IZQUIERDA';
      else title = (level ? cleanText(level.name, 'PLANTA') : 'PLANTA').toUpperCase();
    }
    return {
      id: uid('sheet'),
      name: cleanText(opts.name, contentName),
      size: normalizeSize(opts.size || 'A3'),
      orientation: normalizeOrientation(opts.orientation || 'landscape'),
      template: normalizeTemplate(opts.template || 'modern'),
      scale: clamp(num(opts.scale, 100), 10, 2500),
      content: content,
      levelId: levelId,
      sheetNo: cleanText(opts.sheetNo, nextSheetNumber(project)),
      title: title,
      notes: opts.notes === undefined || opts.notes === null ? '' : String(opts.notes),
      showDims: opts.showDims === undefined ? true : !!opts.showDims,
      showFurniture: opts.showFurniture === undefined ? true : !!opts.showFurniture,
      showRooms: opts.showRooms === undefined ? true : !!opts.showRooms,
      showGrid: !!opts.showGrid,
      imageDataUrl: opts.imageDataUrl || null
    };
  }

  /* ------------------------------------------------------------------ *
   *  API pública
   * ------------------------------------------------------------------ */

  Sheets.SIZES = SIZES;
  Sheets.TEMPLATES = TEMPLATES;
  Sheets.SCALES = SCALES;
  Sheets.CONTENTS = [
    { id: 'plan', name: 'Planta' },
    { id: 'notes', name: 'Notas y cuadros' },
    { id: 'cover', name: 'Portada' },
    { id: '3d', name: 'Perspectiva 3D' },
    { id: 'front', name: 'Fachada frontal' },
    { id: 'right', name: 'Lateral derecha' },
    { id: 'left', name: 'Lateral izquierda' },
    { id: 'rear', name: 'Fachada posterior' }
  ];
  Sheets.mmToPx = 3.0;

  Sheets.pageSize = pageSize;
  Sheets.planBounds = planBounds;
  Sheets.createSheet = createSheet;
  Sheets.renderPreview = renderPreview;
  Sheets.renderSheet = renderSheet;
  Sheets.createPDF = createPDF;
  Sheets.createPDFBytes = createPDFBytes;
  Sheets.downloadPDF = downloadPDF;

  Sheets.metaOf = metaOf;
  Sheets.composeSheet = composeSheet;
  Sheets.computeLayout = computeLayout;
  Sheets.preparePlan = preparePlan;
  Sheets.pdfStringToBytes = pdfStringToBytes;

  Sheets.paintBorder = paintBorder;
  Sheets.paintModern = paintModern;
  Sheets.paintClassic = paintClassic;
  Sheets.paintTechnical = paintTechnical;
  Sheets.paintMunicipal = paintMunicipal;
  Sheets.paintTitleBlock = paintTitleBlock;

  ED.Sheets = Sheets;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

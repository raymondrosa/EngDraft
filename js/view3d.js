/* EngDraft — Vista 3D propia sobre Canvas 2D.
 * Proyección en perspectiva, algoritmo del pintor, iluminación plana por normales.
 * Mundo en milímetros: X = este, Y = norte, Z = arriba. Sin dependencias externas.
 *
 * API:
 *   var view = new ED.View3D(canvas, { store });   // store opcional
 *   view.setStore(store)
 *   view.setOptions({ roof, furniture, labels, dimensions, ground, levels,
 *                     renderMode:'schematic'|'realistic', materials:{wall,roof,trim,ground},
 *                     roofStyle:'flat'|'gable'|'hip'|'arc'|'spline'|'custom',
 *                     roofHeight, roofOverhang, roofRidge:'auto'|'x'|'y',
 *                     roofProfile:[{t,z}], roofColor, roofTexture, shadows, textures, sunAngle })
 *   view.setLevelFilter('all' | 'active' | levelId)
 *   view.setPreset('iso' | 'top' | 'front' | 'right')
 *   view.fit() / render() / resize()
 *   view.screenshot(scaleOpcional) -> dataURL PNG
 *   view.getRenderInfo() -> { mode, textures, faces, roofStyle, ridge, shadows, flying }
 *   view.startFlight({ duration }) / stopFlight() / isFlying()
 *   view.destroy()
 */
(function (ED) {
  'use strict';

  var DEG = Math.PI / 180;
  var TAU = Math.PI * 2;
  var FOV = 42 * DEG;          // campo visual vertical
  var NEAR = 60;               // plano cercano (mm)
  var MAX_LABELS = 90;

  // Luz direccional. Se recalcula desde options.sunAngle al construir la escena.
  // Usada para sombrear caras (y para orientar las sombras del terreno).
  var LIGHT = { x: 0.34, y: 0.52, z: 0.78 };
  var SHADE_REALISTIC = false;

  var WALL_COLOR = '#f8f3e9';
  var TRIM_COLOR = '#fdfaf2';
  var DOOR_COLOR = '#c9a97e';
  var GLASS_FILL = 'rgba(164, 201, 218, 0.42)';
  var GLASS_STROKE = 'rgba(108, 141, 156, 0.55)';
  var EDGE_SOLID = 'rgba(76, 84, 90, 0.20)';
  var EDGE_FURN = 'rgba(48, 56, 64, 0.28)';
  var EDGE_FLOOR = 'rgba(86, 82, 72, 0.10)';
  var EDGE_ROOF = 'rgba(88, 86, 78, 0.24)';

  var SHADOW_KX = -0.44;       // desplazamiento de sombra por mm de altura
  var SHADOW_KY = -0.67;
  var SHADOW_MAX = 520;

  // Presupuesto de mallas poligonales de biblioteca (def.mesh). Las caras de
  // malla se descartan al agotar el presupuesto sin afectar a las cajas.
  var MESH_ITEM_FACE_MAX = 8000;       // caras por ítem (objetos importados hasta 8000)
  var MESH_SCENE_FACE_MAX = 40000;     // caras de malla por escena
  var MESH_FACE_POINTS_MAX = 64;       // puntos por cara (el contrato pide 3..8)
  var MESH_FOOTPRINT_SHADOW_MAX = 60;  // ítems con sombra de base (opcional)

  var ROOF_STYLES = { flat: 1, gable: 1, hip: 1, arc: 1, spline: 1, custom: 1 };
  var WALL_TEXTURES = { stucco: 1, brick: 1, wood: 1, stone: 1, smooth: 1 };
  var ROOF_TEXTURES = { tile: 1, shingle: 1, metal: 1, wood: 1, concrete: 1, smooth: 1 };
  var GROUND_TEXTURES = { grass: 1, paving: 1, gravel: 1, smooth: 1 };

  // Materiales por defecto (se completan con project.settings.materials).
  var DEFAULT_MATERIALS = {
    wall: { color: '#f3eee2', texture: 'stucco' },
    roof: { color: '#b49a7c', texture: 'tile' },
    trim: { color: '#fdfaf2' },
    ground: { color: '#c9d3ab', texture: 'grass' }
  };

  // Presupuesto aproximado de trazos de textura por fotograma.
  var TEXTURE_BUDGET = 26000;

  var PRESETS = {
    iso: { yaw: -52, pitch: 29 },
    top: { yaw: -90, pitch: 89.2 },
    front: { yaw: -90, pitch: 4.5 },
    right: { yaw: 0, pitch: 4.5 }
  };

  var FINISH_COLORS = {
    wood: '#d8b47e',
    tile: '#e7e4da',
    carpet: '#cdc1af',
    concrete: '#d5d2c7',
    marble: '#eae7de',
    grass: '#c9d6a8'
  };

  // Textura procedural asociada a cada acabado de piso (modo realista).
  var FINISH_TEXTURES = {
    wood: 'wood',
    tile: 'tile',
    carpet: 'smooth',
    concrete: 'concrete',
    marble: 'stone',
    grass: 'grass'
  };

  var DETAIL_STYLES = {
    wood: { grid: false, space: 460, color: 'rgba(104, 76, 44, 0.13)', lw: 0.8, max: 90 },
    tile: { grid: true, space: 620, color: 'rgba(94, 99, 102, 0.11)', lw: 0.7, max: 70 },
    marble: { grid: true, space: 820, color: 'rgba(120, 120, 112, 0.10)', lw: 0.7, max: 60 },
    concrete: { grid: true, space: 1400, color: 'rgba(96, 98, 96, 0.08)', lw: 0.7, max: 40 },
    carpet: null,
    grass: null
  };

  // ---------- utilidades ----------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function dist2(a, b) { var dx = b.x - a.x, dy = b.y - a.y; return Math.sqrt(dx * dx + dy * dy); }
  function nowMs() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }
  function hash01(str) {
    var h = 2166136261, s = String(str || '');
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return (h >>> 0) / 4294967295;
  }

  function parseColor(c) {
    if (typeof c !== 'string') return [176, 172, 164];
    var s = c.trim();
    if (s.charAt(0) === '#') {
      var hx = s.slice(1);
      if (hx.length === 3) {
        return [parseInt(hx.charAt(0) + hx.charAt(0), 16) || 0,
          parseInt(hx.charAt(1) + hx.charAt(1), 16) || 0,
          parseInt(hx.charAt(2) + hx.charAt(2), 16) || 0];
      }
      if (hx.length >= 6) {
        return [parseInt(hx.slice(0, 2), 16) || 0,
          parseInt(hx.slice(2, 4), 16) || 0,
          parseInt(hx.slice(4, 6), 16) || 0];
      }
    }
    var m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      var parts = m[1].split(',');
      return [parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, parseInt(parts[2], 10) || 0];
    }
    return [176, 172, 164];
  }

  // Color final de una cara según su normal (sombreo plano precalculado).
  function shade(color, n, alpha) {
    var c = parseColor(color);
    var d = n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z;
    var f, lift;
    if (SHADE_REALISTIC) {
      // Modo realista: más contraste direccional y menos "blanqueado".
      var dl = d > 0 ? d : 0;
      f = 0.62 + 0.52 * dl;
      if (n.z > 0.5) f += 0.05;
      else if (n.z < -0.5) f *= 0.72;
      f = clamp(f, 0.36, 1.12);
      lift = Math.max(0, 0.14 * (1 - f));
    } else {
      f = 0.89 + 0.17 * (d > 0 ? d : 0);
      if (n.z > 0.5) f += 0.04;
      else if (n.z < -0.5) f *= 0.78;
      f = clamp(f, 0.3, 1.04);
      // Eleva las caras en sombra hacia el blanco: blancos cálidos de maqueta.
      lift = Math.max(0, 0.28 * (1 - f));
    }
    var r = Math.round(clamp(c[0] * f + 255 * lift, 0, 255));
    var g = Math.round(clamp(c[1] * f + 254 * lift, 0, 255));
    var b = Math.round(clamp(c[2] * f + 251 * lift, 0, 255));
    if (alpha == null || alpha >= 1) return 'rgb(' + r + ',' + g + ',' + b + ')';
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function mixColor(a, b, t) {
    var ca = parseColor(a), cb = parseColor(b);
    var k = clamp(num(t), 0, 1);
    return 'rgb(' + Math.round(lerp(ca[0], cb[0], k)) + ',' +
      Math.round(lerp(ca[1], cb[1], k)) + ',' +
      Math.round(lerp(ca[2], cb[2], k)) + ')';
  }

  // Orientación de la luz y desplazamiento de sombras a partir de sunAngle.
  function applyLight(cfg) {
    var ang = (num(cfg.sunAngle) % 360) * DEG;
    var elev = 52 * DEG;                      // altura del sol (constante, agradable)
    var hz = Math.cos(elev);
    LIGHT.x = Math.cos(ang) * hz;
    LIGHT.y = Math.sin(ang) * hz;
    LIGHT.z = Math.sin(elev);
    var l = Math.sqrt(LIGHT.x * LIGHT.x + LIGHT.y * LIGHT.y + LIGHT.z * LIGHT.z) || 1;
    LIGHT.x /= l; LIGHT.y /= l; LIGHT.z /= l;
    SHADE_REALISTIC = !!cfg.realistic;
    SHADOW_KX = clamp(-LIGHT.x / Math.max(0.2, LIGHT.z), -1.5, 1.5);
    SHADOW_KY = clamp(-LIGHT.y / Math.max(0.2, LIGHT.z), -1.5, 1.5);
  }

  function tintColor(color, factor) {
    var c = parseColor(color);
    var r = Math.round(clamp(c[0] * (1 + factor), 0, 255));
    var g = Math.round(clamp(c[1] * (1 + factor), 0, 255));
    var b = Math.round(clamp(c[2] * (1 + factor), 0, 255));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function signedArea2(poly) {
    var s = 0;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      s += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    }
    return s / 2;
  }

  function polyArea(poly) { return Math.abs(signedArea2(poly)); }

  function polyCentroid2(poly) {
    var a = signedArea2(poly);
    if (Math.abs(a) < 1e-6) {
      var sx = 0, sy = 0;
      for (var k = 0; k < poly.length; k++) { sx += poly[k].x; sy += poly[k].y; }
      return { x: sx / poly.length, y: sy / poly.length };
    }
    var cx = 0, cy = 0;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var cross = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
      cx += (poly[j].x + poly[i].x) * cross;
      cy += (poly[j].y + poly[i].y) * cross;
    }
    return { x: cx / (6 * a), y: cy / (6 * a) };
  }

  function polyBounds(poly) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
  }

  function cleanPolygon(poly) {
    if (!poly || poly.length < 3) return null;
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i];
      if (!p || !isFinite(p.x) || !isFinite(p.y)) continue;
      var last = out[out.length - 1];
      if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
      out.push({ x: num(p.x), y: num(p.y) });
    }
    while (out.length > 3) {
      var a = out[0], b = out[out.length - 1];
      if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) out.pop();
      else break;
    }
    return out.length >= 3 ? out : null;
  }

  // Devuelve copia en sentido antihorario (vista desde +Z).
  function ensureCCW(poly) {
    if (signedArea2(poly) < 0) return poly.slice().reverse();
    return poly;
  }

  function expandPoly(poly, factor) {
    var c = polyCentroid2(poly);
    var out = new Array(poly.length);
    for (var i = 0; i < poly.length; i++) {
      out[i] = { x: c.x + (poly[i].x - c.x) * factor, y: c.y + (poly[i].y - c.y) * factor };
    }
    return out;
  }

  // ---------- geometría de respaldo (si ED.Geo aún no está) ----------
  function fbWallPolygon(wall) {
    var a = wall.a, b = wall.b;
    var t = Math.max(1, num(wall.thickness) || 150);
    var len = dist2(a, b);
    var half = t / 2;
    if (len < 0.001) {
      return [{ x: a.x - half, y: a.y - half }, { x: a.x + half, y: a.y - half },
        { x: a.x + half, y: a.y + half }, { x: a.x - half, y: a.y + half }];
    }
    var ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    var nx = -uy, ny = ux;
    var a2 = { x: a.x - ux * half, y: a.y - uy * half };
    var b2 = { x: b.x + ux * half, y: b.y + uy * half };
    return [
      { x: a2.x + nx * half, y: a2.y + ny * half },
      { x: b2.x + nx * half, y: b2.y + ny * half },
      { x: b2.x - nx * half, y: b2.y - ny * half },
      { x: a2.x - nx * half, y: a2.y - ny * half }
    ];
  }

  function fbOpeningSpan(wall, opening) {
    var len = dist2(wall.a, wall.b);
    var w = Math.max(10, num(opening.width) || 900);
    var center = clamp(num(opening.t) || 0, 0, 1) * len;
    var from = clamp(center - w / 2, 0, len);
    var to = clamp(center + w / 2, 0, len);
    return { from: from, to: to, center: center, width: to - from };
  }

  function wallPolygonOf(wall, G) {
    if (G && typeof G.wallPolygon === 'function') {
      try { return G.wallPolygon(wall, true); } catch (e) { /* respaldo */ }
    }
    return fbWallPolygon(wall);
  }

  // Polilínea del eje del muro (recto o curvo). Respaldo recto si no hay Geo.
  function wallPathOf(wall, G) {
    if (G && typeof G.wallPath === 'function') {
      try {
        var p = G.wallPath(wall);
        if (p && p.length >= 2) return p;
      } catch (e) { /* respaldo */ }
    }
    return [{ x: wall.a.x, y: wall.a.y }, { x: wall.b.x, y: wall.b.y }];
  }

  function wallIsCurved(wall, G) {
    if (!G || typeof G.wallIsCurved !== 'function') return false;
    try { return !!G.wallIsCurved(wall); } catch (e) { return false; }
  }

  function openingSpanOf(wall, opening, G) {
    if (G && typeof G.openingSpan === 'function') {
      try {
        var s = G.openingSpan(wall, opening);
        return { from: num(s.from), to: num(s.to) };
      } catch (e) { /* respaldo */ }
    }
    return fbOpeningSpan(wall, opening);
  }

  function formatAreaText(mm2, units) {
    var G = ED && ED.Geo;
    if (G && typeof G.formatArea === 'function') {
      try { return G.formatArea(mm2, units); } catch (e) { /* respaldo */ }
    }
    return units === 'ft' ? (mm2 / 92930.4).toFixed(2) + ' ft²' : (mm2 / 1e6).toFixed(2) + ' m²';
  }

  function formatLengthText(mm, units) {
    var G = ED && ED.Geo;
    if (G && typeof G.formatLength === 'function') {
      try { return G.formatLength(mm, units || 'm'); } catch (e) { /* respaldo */ }
    }
    return units === 'ft' ? (mm / 304.8).toFixed(2) + ' ft' : (mm / 1000).toFixed(2) + ' m';
  }

  function layerVisible(store, id) {
    if (!store || !id) return true;
    try {
      if (typeof store.isVisible === 'function') return store.isVisible(id) !== false;
      if (typeof store.getLayer === 'function') {
        var l = store.getLayer(id);
        return !l || l.visible !== false;
      }
    } catch (e) { /* tolerar */ }
    return true;
  }

  function libGet(id) {
    var L = ED && ED.Library;
    if (!L || typeof L.get !== 'function') return null;
    try { return L.get(id) || null; } catch (e) { return null; }
  }

  // ---------- primitivas de escena ----------
  var VX = new Float64Array(2048), VY = new Float64Array(2048), VZ = new Float64Array(2048);
  var CLX = new Float64Array(2048), CLY = new Float64Array(2048), CLZ = new Float64Array(2048);
  var SEGBUF = [0, 0, 0, 0];

  function faceNormal(pts) {
    var nx = 0, ny = 0, nz = 0, n = pts.length;
    for (var i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      nx += (a.y - b.y) * (a.z + b.z);
      ny += (a.z - b.z) * (a.x + b.x);
      nz += (a.x - b.x) * (a.y + b.y);
    }
    var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-9) return { x: 0, y: 0, z: 1 };
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  function centroid3(pts) {
    var x = 0, y = 0, z = 0;
    for (var i = 0; i < pts.length; i++) { x += pts[i].x; y += pts[i].y; z += pts[i].z; }
    var n = pts.length || 1;
    return { x: x / n, y: y / n, z: z / n };
  }

  // Crea una cara con color ya sombreado y buffers de proyección reutilizables.
  // o.tex: identificador de textura procedural ('stucco', 'brick', 'tile', …).
  function addFace(list, pts, color, o) {
    o = o || {};
    var n = faceNormal(pts);
    var fill = o.fill || shade(color || '#cccccc', n, o.alpha);
    var stroke = o.stroke || (o.edge === false ? null : (o.edge || EDGE_SOLID));
    var count = pts.length * 2 + 3;
    var f = {
      pts: pts,
      n: n,
      c: centroid3(pts),
      fill: fill,
      stroke: stroke,
      lw: o.lw || 0.7,
      twoSided: !!o.twoSided,
      details: o.details || null,
      tex: o.tex || null,
      px: new Float64Array(count),
      py: new Float64Array(count),
      pn: 0,
      depth: 0
    };
    list.push(f);
    return f;
  }

  // Como addFace pero garantiza que la normal apunte hacia `outward`.
  function addFaceOriented(list, pts, color, o, outward) {
    if (outward) {
      var n = faceNormal(pts);
      if (n.x * outward.x + n.y * outward.y + n.z * outward.z < 0) {
        pts = pts.slice().reverse();
      }
    }
    return addFace(list, pts, color, o);
  }

  function addBox(list, corners, z0, z1, color, edge, tex) {
    var ccw = ensureCCW(corners);
    var n = ccw.length;
    var top = [], bottom = [], i, p;
    for (i = 0; i < n; i++) top.push({ x: ccw[i].x, y: ccw[i].y, z: z1 });
    for (i = n - 1; i >= 0; i--) bottom.push({ x: ccw[i].x, y: ccw[i].y, z: z0 });
    addFace(list, top, color, { edge: edge, tex: tex });
    addFace(list, bottom, color, { edge: edge });
    for (i = 0; i < n; i++) {
      p = ccw[i];
      var q = ccw[(i + 1) % n];
      addFace(list, [
        { x: p.x, y: p.y, z: z0 },
        { x: q.x, y: q.y, z: z0 },
        { x: q.x, y: q.y, z: z1 },
        { x: p.x, y: p.y, z: z1 }
      ], color, { edge: edge, tex: tex });
    }
  }

  // Intervalos de una recta horizontal (axis=0: y=value) o vertical dentro del polígono.
  function lineIntervals(poly, axis, value) {
    var hits = [], i, j;
    for (i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var p = poly[i], q = poly[j];
      var v0 = axis === 0 ? p.y : p.x;
      var v1 = axis === 0 ? q.y : q.x;
      if ((v0 <= value && v1 > value) || (v1 <= value && v0 > value)) {
        var t = (value - v0) / (v1 - v0);
        var c0 = axis === 0 ? p.x : p.y;
        var c1 = axis === 0 ? q.x : q.y;
        hits.push(c0 + (c1 - c0) * t);
      }
    }
    hits.sort(function (a, b) { return a - b; });
    var out = [];
    for (i = 0; i + 1 < hits.length; i += 2) {
      if (hits[i + 1] - hits[i] > 40) out.push([hits[i], hits[i + 1]]);
    }
    return out;
  }

  function guessFinish(name) {
    var s = String(name || '').toLowerCase();
    if (/ba[ñn]o|lavander|servicio|vestidor/.test(s)) return 'tile';
    if (/cocina|comedor|sala|estar|hall|living/.test(s)) return 'wood';
    if (/dormitorio|habitaci[oó]n|rec[aá]mara/.test(s)) return 'wood';
    if (/garaje|patio|terraza|balc[oó]n|escalera/.test(s)) return 'concrete';
    if (/jard[ií]n|parque|grama|c[eé]sped/.test(s)) return 'grass';
    return 'wood';
  }

  function fallbackBoxes(item) {
    var w = Math.max(100, num(item.w) || 600);
    var d = Math.max(100, num(item.d) || 600);
    var h = Math.max(80, num(item.h) || 800);
    return [
      { x: -w / 2, y: -d / 2, z: 0, w: w, d: d, h: h * 0.72, color: '#97a1ae' },
      { x: -w * 0.38, y: -d * 0.38, z: h * 0.15, w: w * 0.76, d: d * 0.76, h: h * 0.3, color: '#c4ccd6' }
    ];
  }

  // ---------- constructor ----------
  function View3D(canvas, opts) {
    opts = opts || {};
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new Error('EngDraft.View3D: se requiere un canvas 2D.');
    }
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d') || null;
    this.store = null;
    this.options = {
      roof: false,
      furniture: true,
      labels: true,
      dimensions: false,
      ground: true,
      levels: 'all',
      wallsCut: false,
      // Ampliación 1.2: techo, materiales, realismo. Ampliación 1.4: cumbrera y perfil.
      // null = heredar de project.settings (roof/materials/render).
      roofStyle: null,
      roofHeight: null,
      roofOverhang: null,
      roofRidge: null,
      roofProfile: null,
      roofColor: null,
      roofTexture: null,
      renderMode: null,
      materials: null,
      shadows: null,
      textures: null,
      sunAngle: null
    };
    this.camera = {
      yaw: PRESETS.iso.yaw * DEG,
      pitch: PRESETS.iso.pitch * DEG,
      dist: 26000,
      target: { x: 0, y: 0, z: 1500 }
    };
    this._scene = null;
    this._dirty = true;
    this._raf = 0;
    this._anim = null;
    this._animRaf = 0;
    this._destroyed = false;
    this._cssW = 0;
    this._cssH = 0;
    this._dpr = 1;
    this._distRange = { min: 600, max: 400000 };
    this._pointers = {};
    this._mode = 0;          // 0 ninguno, 1 órbita, 2 desplazar, 3 pinza
    this._pinch = null;
    this._last = { x: 0, y: 0 };
    this._bucket = [];
    this._segBuf = SEGBUF;
    this._pt = { x: 0, y: 0, z: 0 };
    this._sky = null;
    this._unsub = null;
    this._ro = null;
    this._handlers = null;
    this._onWinResize = null;
    this._cfg = null;
    this._texBudget = 0;
    this._flight = null;
    this._flightRaf = 0;

    this._bindEvents();
    this.resize();
    if (opts.store) this.setStore(opts.store);
    if (opts.options) this.setOptions(opts.options);
    this.fit();
  }

  View3D.prototype._bindEvents = function () {
    var self = this;
    var canvas = this.canvas;
    var h = {};

    h.down = function (e) {
      if (self._destroyed) return;
      self.stopFlight();
      self._cancelAnim();
      var pan = (e.button === 2) || e.shiftKey || (e.button === 1);
      self._pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(self._pointers);
      if (ids.length >= 2) {
        self._mode = 3;
        self._pinch = self._pinchState();
      } else {
        self._mode = pan ? 2 : 1;
        self._last.x = e.clientX;
        self._last.y = e.clientY;
      }
      try { if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId); } catch (err) { /* tolerar */ }
      try { canvas.style.cursor = self._mode === 2 ? 'move' : 'grabbing'; } catch (err2) { /* tolerar */ }
      if (e.preventDefault) e.preventDefault();
    };

    h.move = function (e) {
      if (self._destroyed || !self._pointers[e.pointerId]) return;
      self._pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (self._mode === 3) {
        self._pinchMove();
        return;
      }
      var dx = e.clientX - self._last.x;
      var dy = e.clientY - self._last.y;
      self._last.x = e.clientX;
      self._last.y = e.clientY;
      if (!dx && !dy) return;
      if (self._mode === 1) {
        self.camera.yaw -= dx * 0.0072;
        self.camera.pitch = clamp(self.camera.pitch + dy * 0.0062, 2 * DEG, 89.4 * DEG);
      } else if (self._mode === 2) {
        self._panBy(dx, dy);
      }
      self._requestRender();
      if (e.preventDefault) e.preventDefault();
    };

    h.up = function (e) {
      if (self._destroyed) return;
      delete self._pointers[e.pointerId];
      self._pinch = null;
      var ids = Object.keys(self._pointers);
      if (!ids.length) {
        self._mode = 0;
        try { canvas.style.cursor = 'grab'; } catch (err) { /* tolerar */ }
      } else if (ids.length === 1) {
        self._mode = 1;
        self._last.x = self._pointers[ids[0]].x;
        self._last.y = self._pointers[ids[0]].y;
      }
    };

    h.wheel = function (e) {
      if (self._destroyed) return;
      self._cancelAnim();
      var delta = e.deltaY || 0;
      if (e.deltaMode === 1) delta *= 16;
      else if (e.deltaMode === 2) delta *= 120;
      var factor = Math.exp(clamp(delta, -360, 360) * 0.0014);
      self.camera.dist = clamp(self.camera.dist * factor, self._distRange.min, self._distRange.max);
      self._requestRender();
      if (e.preventDefault) e.preventDefault();
    };

    h.dbl = function (e) {
      if (self._destroyed) return;
      self._ensureScene();
      var st = self._fitState(self.camera.yaw, self.camera.pitch);
      self._distRange = st.range;
      self._animateTo(st, 420);
      if (e.preventDefault) e.preventDefault();
    };

    h.ctx = function (e) { if (e.preventDefault) e.preventDefault(); };

    this._handlers = h;
    canvas.addEventListener('pointerdown', h.down, false);
    canvas.addEventListener('pointermove', h.move, false);
    canvas.addEventListener('pointerup', h.up, false);
    canvas.addEventListener('pointercancel', h.up, false);
    canvas.addEventListener('lostpointercapture', h.up, false);
    canvas.addEventListener('wheel', h.wheel, { passive: false });
    canvas.addEventListener('dblclick', h.dbl, false);
    canvas.addEventListener('contextmenu', h.ctx, false);
    try { canvas.style.cursor = 'grab'; } catch (e2) { /* tolerar */ }

    this._onWinResize = function () { self.resize(); };
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('resize', this._onWinResize, false);
    }
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(function () { self.resize(); });
      try { this._ro.observe(canvas); } catch (e3) { /* tolerar */ }
      if (canvas.parentElement) {
        try { this._ro.observe(canvas.parentElement); } catch (e4) { /* tolerar */ }
      }
    }
  };

  View3D.prototype._panBy = function (dx, dy) {
    var w = this._cssW || 800, h = this._cssH || 600;
    var view = this._makeView(w, h);
    var mmPerPx = this.camera.dist / Math.max(1, view.focal);
    var tx = -dx * mmPerPx;
    var ty = dy * mmPerPx;
    this.camera.target.x += view.right.x * tx + view.up.x * ty;
    this.camera.target.y += view.right.y * tx + view.up.y * ty;
    this.camera.target.z += view.right.z * tx + view.up.z * ty;
  };

  View3D.prototype._pinchState = function () {
    var ids = Object.keys(this._pointers);
    if (ids.length < 2) return null;
    var a = this._pointers[ids[0]], b = this._pointers[ids[1]];
    return {
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      d: Math.max(1, Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)))
    };
  };

  View3D.prototype._pinchMove = function () {
    var st = this._pinchState();
    if (!st) return;
    var prev = this._pinch;
    this._pinch = st;
    if (!prev) return;
    this.camera.dist = clamp(this.camera.dist * (prev.d / st.d), this._distRange.min, this._distRange.max);
    this._panBy(st.mid.x - prev.mid.x, st.mid.y - prev.mid.y);
    this._requestRender();
  };

  // ---------- API pública ----------
  View3D.prototype.setStore = function (store) {
    if (this._destroyed) return this;
    if (this._unsub) { try { this._unsub(); } catch (e) { /* tolerar */ } this._unsub = null; }
    this.store = store || null;
    if (store && typeof store.on === 'function') {
      var self = this;
      this._unsub = store.on(function (ev) {
        if (self._destroyed) return;
        var type = ev && ev.type;
        if (type === 'selection' || type === 'saved') return;
        self.invalidate();
        self._requestRender();
      });
    }
    this.invalidate();
    this.fit();
    return this;
  };

  View3D.prototype.setOptions = function (patch) {
    if (this._destroyed || !patch) return this;
    var o = this.options;
    if ('roof' in patch) o.roof = !!patch.roof;
    if ('furniture' in patch) o.furniture = patch.furniture !== false;
    if ('labels' in patch) o.labels = patch.labels !== false;
    if ('dimensions' in patch) o.dimensions = !!patch.dimensions;
    if ('ground' in patch) o.ground = patch.ground !== false;
    if ('wallsCut' in patch) o.wallsCut = !!patch.wallsCut;
    if ('levels' in patch) {
      var lv = patch.levels;
      o.levels = (lv === 'active' || lv === 'all' || (typeof lv === 'string' && lv)) ? lv : 'all';
    }
    // --- ampliación 1.2 / 1.4 ---
    if ('roofStyle' in patch) o.roofStyle = ROOF_STYLES[patch.roofStyle] ? patch.roofStyle : null;
    if ('roofHeight' in patch) o.roofHeight = isFinite(Number(patch.roofHeight)) ? num(patch.roofHeight) : null;
    if ('roofOverhang' in patch) o.roofOverhang = isFinite(Number(patch.roofOverhang)) ? num(patch.roofOverhang) : null;
    if ('roofRidge' in patch) {
      o.roofRidge = (patch.roofRidge === 'x' || patch.roofRidge === 'y' || patch.roofRidge === 'auto')
        ? patch.roofRidge : null;
    }
    if ('roofProfile' in patch) o.roofProfile = cloneRoofProfile(patch.roofProfile);
    if ('roofColor' in patch) o.roofColor = (typeof patch.roofColor === 'string' && patch.roofColor) ? patch.roofColor : null;
    if ('roofTexture' in patch) o.roofTexture = ROOF_TEXTURES[patch.roofTexture] ? patch.roofTexture : null;
    if ('renderMode' in patch) {
      o.renderMode = (patch.renderMode === 'realistic' || patch.renderMode === 'schematic') ? patch.renderMode : null;
    }
    if ('materials' in patch) o.materials = mergeMaterials(o.materials, patch.materials);
    if ('shadows' in patch) o.shadows = patch.shadows == null ? null : !!patch.shadows;
    if ('textures' in patch) o.textures = patch.textures == null ? null : !!patch.textures;
    if ('sunAngle' in patch) o.sunAngle = isFinite(Number(patch.sunAngle)) ? num(patch.sunAngle) : null;
    this.invalidate();
    this._requestRender();
    return this;
  };

  // Mezcla profunda de materiales {wall,roof,trim,ground} sin perder texturas.
  function mergeMaterials(base, patch) {
    if (!patch || typeof patch !== 'object') return base || null;
    var out = {};
    var keys = ['wall', 'roof', 'trim', 'ground'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var b = (base && base[k]) || null;
      var p = patch[k];
      if (p && typeof p === 'object') {
        out[k] = {};
        for (var kk in b) if (Object.prototype.hasOwnProperty.call(b, kk)) out[k][kk] = b[kk];
        for (var pk in p) if (Object.prototype.hasOwnProperty.call(p, pk)) out[k][pk] = p[pk];
      } else if (b) {
        out[k] = {};
        for (var bk in b) if (Object.prototype.hasOwnProperty.call(b, bk)) out[k][bk] = b[bk];
      }
    }
    return out;
  }

  // Copia saneada del perfil de techo recibido por setOptions (la validación
  // definitiva y el fallback a 'gable' se aplican al construir la escena).
  function cloneRoofProfile(raw) {
    if (!Array.isArray(raw)) return null;
    var out = [];
    for (var i = 0; i < raw.length && out.length < 24; i++) {
      var p = raw[i];
      if (!p || typeof p !== 'object') continue;
      var t = Number(p.t), z = Number(p.z);
      if (!isFinite(t) || !isFinite(z)) continue;
      out.push({ t: clamp(t, 0, 1), z: clamp(z, 0, 8000) });
    }
    return out.length ? out : null;
  }

  // Validación definitiva del perfil (2..24 puntos, t ordenado y extremos 0/1).
  function normalizeRoofProfile(raw) {
    if (!Array.isArray(raw)) return null;
    var pts = [];
    for (var i = 0; i < raw.length && pts.length < 24; i++) {
      var p = raw[i];
      if (!p || typeof p !== 'object') continue;
      var t = Number(p.t), z = Number(p.z);
      if (!isFinite(t) || !isFinite(z)) continue;
      pts.push({ t: clamp(t, 0, 1), z: clamp(z, 0, 8000) });
    }
    if (pts.length < 2) return null;
    pts.sort(function (a, b) { return a.t - b.t; });
    var ded = [];
    for (var j = 0; j < pts.length; j++) {
      if (ded.length && Math.abs(pts[j].t - ded[ded.length - 1].t) < 1e-4) {
        ded[ded.length - 1] = pts[j];
      } else {
        ded.push(pts[j]);
      }
    }
    if (ded.length < 2) return null;
    if (ded[0].t > 1e-4) ded.unshift({ t: 0, z: ded[0].z });
    var last = ded[ded.length - 1];
    if (last.t < 1 - 1e-4) ded.push({ t: 1, z: last.z });
    else last.t = 1;
    ded[0].t = 0;
    return ded.length >= 2 ? ded : null;
  }

  // Muestreo suave (Catmull-Rom) del perfil t/z: devuelve [{u:0..1, z:relativo}].
  function sampleRoofProfile(def) {
    if (!def || def.length < 2) return null;
    var pts = new Array(def.length);
    for (var i = 0; i < def.length; i++) pts[i] = { x: def[i].t, y: def[i].z };
    var smooth = null;
    var G = (ED && ED.Geo) || null;
    if (G && typeof G.catmullRomPath === 'function') {
      try { smooth = G.catmullRomPath(pts, 5); } catch (e) { smooth = null; }
    }
    if (!smooth || smooth.length < 2) smooth = pts;
    var out = [];
    for (var k = 0; k < smooth.length; k++) {
      var s = smooth[k];
      if (!s || !isFinite(s.x) || !isFinite(s.y)) continue;
      var u = clamp(s.x, 0, 1);
      var z = clamp(s.y, 0, 8000);
      var prev = out[out.length - 1];
      if (prev && u <= prev.u) u = Math.min(1, prev.u + 1e-4);
      out.push({ u: u, z: z });
      if (out.length > 160) break;
    }
    if (out.length < 2) return null;
    out[0].u = 0;
    out[out.length - 1].u = 1;
    out[0].z = clamp(num(def[0].z), 0, 8000);
    out[out.length - 1].z = clamp(num(def[def.length - 1].z), 0, 8000);
    return out;
  }

  View3D.prototype.getOptions = function () {
    var o = this.options;
    return {
      roof: o.roof, furniture: o.furniture, labels: o.labels, dimensions: o.dimensions,
      ground: o.ground, levels: o.levels, wallsCut: o.wallsCut,
      roofStyle: o.roofStyle, roofHeight: o.roofHeight, roofOverhang: o.roofOverhang,
      roofRidge: o.roofRidge, roofProfile: o.roofProfile,
      roofColor: o.roofColor, roofTexture: o.roofTexture, renderMode: o.renderMode,
      materials: o.materials, shadows: o.shadows, textures: o.textures, sunAngle: o.sunAngle
    };
  };

  View3D.prototype.setLevelFilter = function (value) {
    if (this._destroyed) return this;
    this.options.levels = (typeof value === 'string' && value) ? value : 'all';
    this.invalidate();
    this._requestRender();
    return this;
  };

  View3D.prototype.setPreset = function (name) {
    if (this._destroyed) return this;
    var p = PRESETS[name];
    if (!p) return this;
    this._ensureScene();
    var st = this._fitState(p.yaw * DEG, p.pitch * DEG);
    this._distRange = st.range;
    this._animateTo(st, 460);
    return this;
  };

  View3D.prototype.fit = function () {
    if (this._destroyed) return this;
    this.stopFlight();
    this._cancelAnim();
    this._ensureScene();
    var st = this._fitState(this.camera.yaw, this.camera.pitch);
    this._distRange = st.range;
    this.camera.yaw = st.yaw;
    this.camera.pitch = st.pitch;
    this.camera.dist = st.dist;
    this.camera.target.x = st.target.x;
    this.camera.target.y = st.target.y;
    this.camera.target.z = st.target.z;
    this._requestRender();
    return this;
  };

  View3D.prototype.invalidate = function () {
    this._dirty = true;
    this._scene = null;
    this._sky = null;
    return this;
  };

  View3D.prototype.resize = function () {
    if (this._destroyed) return this;
    var canvas = this.canvas;
    var cw = canvas.clientWidth || 0;
    var ch = canvas.clientHeight || 0;
    if ((!cw || !ch) && canvas.parentElement) {
      cw = cw || canvas.parentElement.clientWidth || 0;
      ch = ch || canvas.parentElement.clientHeight || 0;
    }
    if (!cw || !ch) {
      cw = this._cssW || 800;
      ch = this._cssH || 600;
    }
    cw = Math.max(160, Math.round(cw));
    ch = Math.max(120, Math.round(ch));
    var dpr = 1;
    try { dpr = clamp((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 1, 2.5); } catch (e) { dpr = 1; }
    var bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    this._cssW = cw;
    this._cssH = ch;
    this._dpr = dpr;
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._sky = null;
    this._requestRender();
    return this;
  };

  View3D.prototype.render = function () {
    if (this._destroyed) return this;
    var ctx = this.ctx;
    if (!ctx) return this;
    var cw = this.canvas.clientWidth || 0, ch = this.canvas.clientHeight || 0;
    if (cw > 2 && ch > 2 && (cw !== this._cssW || ch !== this._cssH)) {
      this.resize();
      ctx = this.ctx;
      if (!ctx) return this;
    }
    if (this._cssW < 2 || this._cssH < 2) this.resize();
    var w = this._cssW, h = this._cssH;
    try {
      this._ensureScene();
      this._texBudget = (this._cfg && this._cfg.realistic && this._cfg.textures) ? TEXTURE_BUDGET : 0;
      ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      this._drawSky(ctx, w, h);
      var view = this._makeView(w, h);
      if (this.options.ground) this._drawGroundPass(ctx, view);
      this._drawPasses(ctx, view);
      this._drawDims(ctx, view);
      ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) console.error('[EngDraft.View3D]', err);
    }
    return this;
  };

  View3D.prototype.screenshot = function (scale) {
    if (this._destroyed || !this.ctx) return '';
    this._finishAnim();
    var s = clamp(num(scale) || 1, 1, 4);
    var canvas = this.canvas;
    var oldW = this._cssW, oldH = this._cssH, oldDpr = this._dpr;
    var url = '';
    try {
      if (s > 1) {
        var bw = Math.max(2, Math.round(oldW * oldDpr * s));
        var bh = Math.max(2, Math.round(oldH * oldDpr * s));
        canvas.width = bw;
        canvas.height = bh;
        this._dpr = oldDpr * s;
        this.render();
        url = canvas.toDataURL('image/png');
        this._dpr = oldDpr;
        canvas.width = Math.round(oldW * oldDpr);
        canvas.height = Math.round(oldH * oldDpr);
        this.ctx.setTransform(oldDpr, 0, 0, oldDpr, 0, 0);
        this.render();
      } else {
        this.render();
        url = canvas.toDataURL('image/png');
      }
    } catch (err) {
      this._dpr = oldDpr;
      if (typeof console !== 'undefined' && console.error) console.error('[EngDraft.View3D]', err);
      url = '';
    }
    return url;
  };

  View3D.prototype.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    this.stopFlight();
    this._cancelAnim();
    if (this._raf) {
      try { cancelAnimationFrame(this._raf); } catch (e) { /* tolerar */ }
      this._raf = 0;
    }
    if (this._unsub) { try { this._unsub(); } catch (e2) { /* tolerar */ } this._unsub = null; }
    if (this._ro) { try { this._ro.disconnect(); } catch (e3) { /* tolerar */ } this._ro = null; }
    if (typeof window !== 'undefined' && window.removeEventListener && this._onWinResize) {
      window.removeEventListener('resize', this._onWinResize, false);
    }
    var c = this.canvas, h = this._handlers;
    if (c && h) {
      c.removeEventListener('pointerdown', h.down, false);
      c.removeEventListener('pointermove', h.move, false);
      c.removeEventListener('pointerup', h.up, false);
      c.removeEventListener('pointercancel', h.up, false);
      c.removeEventListener('lostpointercapture', h.up, false);
      c.removeEventListener('wheel', h.wheel, { passive: false });
      c.removeEventListener('dblclick', h.dbl, false);
      c.removeEventListener('contextmenu', h.ctx, false);
    }
    this._handlers = null;
    this._scene = null;
    this.ctx = null;
  };

  // ---------- vuelo de dron ----------
  // Animación cinematográfica en bucle (~14 s): órbita, subida/bajada suave y
  // desplazamiento ligero del objetivo. No bloquea: usa requestAnimationFrame.
  View3D.prototype.startFlight = function (opts) {
    if (this._destroyed) return this;
    opts = opts || {};
    this.stopFlight();
    this._cancelAnim();
    this._ensureScene();
    var st = this._fitState(this.camera.yaw, this.camera.pitch);
    this._distRange = st.range;
    var b = (this._scene && this._scene.bounds) || { minX: -4000, minY: -4000, maxX: 4000, maxY: 4000, minZ: 0, maxZ: 2800 };
    var flight = {
      t0: nowMs(),
      dur: Math.max(3000, num(opts.duration) || 14000),
      loop: opts.loop !== false,
      raf: 0,
      base: st,
      range: st.range,
      span: Math.max(2000, Math.max(b.maxX - b.minX, b.maxY - b.minY)),
      height: Math.max(1200, (b.maxZ - b.minZ) || 2700)
    };
    this._flight = flight;
    var self = this;
    if (typeof requestAnimationFrame !== 'function') {
      this._applyFlight(0, flight);
      this.render();
      return this;
    }
    function step() {
      if (self._destroyed || self._flight !== flight) { flight.raf = 0; return; }
      var elapsed = nowMs() - flight.t0;
      var t = elapsed / flight.dur;
      var phase = flight.loop ? (t % 1) : clamp(t, 0, 1);
      self._applyFlight(phase, flight);
      self.render();
      if (!flight.loop && t >= 1) {
        self._flight = null;
        flight.raf = 0;
        return;
      }
      flight.raf = requestAnimationFrame(step);
    }
    this._applyFlight(0, flight);
    this.render();
    flight.raf = requestAnimationFrame(step);
    return this;
  };

  View3D.prototype._applyFlight = function (t, flight) {
    flight = flight || this._flight;
    if (!flight) return;
    var base = flight.base;
    var wave = Math.sin(TAU * t);
    var cam = this.camera;
    cam.yaw = base.yaw + TAU * t;
    cam.pitch = clamp(base.pitch + wave * 15 * DEG, 4 * DEG, 72 * DEG);
    cam.dist = clamp(base.dist * (1 - 0.13 * wave), flight.range.min, flight.range.max);
    cam.target.x = base.target.x + Math.cos(TAU * t) * flight.span * 0.085;
    cam.target.y = base.target.y + Math.sin(TAU * t) * flight.span * 0.085;
    cam.target.z = base.target.z + wave * flight.height * 0.12;
  };

  View3D.prototype.stopFlight = function () {
    var flight = this._flight;
    if (!flight) return this;
    this._flight = null;
    if (flight.raf) {
      try { cancelAnimationFrame(flight.raf); } catch (e) { /* tolerar */ }
      flight.raf = 0;
    }
    this._requestRender();
    return this;
  };

  View3D.prototype.isFlying = function () {
    return !!(this._flight && !this._destroyed);
  };

  View3D.prototype.getRenderInfo = function () {
    var cfg = this._cfg;
    var faces = 0;
    try {
      var scene = this._ensureScene();
      faces = (scene && scene.faceTotal) || 0;
      cfg = this._cfg || cfg;
    } catch (e) { faces = 0; }
    return {
      mode: (cfg && cfg.realistic) ? 'realistic' : 'schematic',
      textures: !!(cfg && cfg.textures),
      faces: faces,
      roofStyle: (cfg && cfg.roofStyle) || 'flat',
      ridge: (cfg && cfg.roofRidge) || 'auto',
      hasProfile: !!(cfg && cfg.roofProfile),
      shadows: !!(cfg && cfg.shadows),
      sunAngle: cfg ? cfg.sunAngle : 135,
      flying: this.isFlying()
    };
  };

  // ---------- cámara ----------
  View3D.prototype._makeView = function (w, h) {
    var cam = this.camera;
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    var dx = cp * cy, dy = cp * sy, dz = sp;
    var eye = {
      x: cam.target.x + dx * cam.dist,
      y: cam.target.y + dy * cam.dist,
      z: cam.target.z + dz * cam.dist
    };
    var fx = -dx, fy = -dy, fz = -dz;
    var rlen = Math.sqrt(fy * fy + fx * fx);
    var rx, ry, rz;
    if (rlen > 1e-6) { rx = fy / rlen; ry = -fx / rlen; rz = 0; }
    else { rx = 1; ry = 0; rz = 0; }
    var ux = ry * fz - rz * fy;
    var uy = rz * fx - rx * fz;
    var uz = rx * fy - ry * fx;
    return {
      eye: eye,
      fwd: { x: fx, y: fy, z: fz },
      right: { x: rx, y: ry, z: rz },
      up: { x: ux, y: uy, z: uz },
      focal: (h / 2) / Math.tan(FOV / 2),
      w: w, h: h, cx: w / 2, cy: h / 2
    };
  };

  View3D.prototype._fitState = function (yaw, pitch) {
    var b = (this._scene && this._scene.bounds) || {
      minX: -4000, minY: -4000, maxX: 4000, maxY: 4000, minZ: 0, maxZ: 2800
    };
    var w = Math.max(1000, b.maxX - b.minX);
    var d = Math.max(1000, b.maxY - b.minY);
    var hh = Math.max(500, b.maxZ - b.minZ);
    var radius = Math.max(1200, Math.sqrt(w * w + d * d + hh * hh) / 2);
    var tanHalf = Math.tan(FOV / 2);
    var aspect = this._cssW / Math.max(1, this._cssH);
    // Dirección objetivo→cámara y ejes de pantalla para un encuadre ajustado.
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var dir = { x: cp * Math.cos(yaw), y: cp * Math.sin(yaw), z: sp };
    var fx = -dir.x, fy = -dir.y, fz = -dir.z;
    var rlen = Math.sqrt(fy * fy + fx * fx);
    var rx = rlen > 1e-6 ? fy / rlen : 1;
    var ry = rlen > 1e-6 ? -fx / rlen : 0;
    var rz = 0;
    var ux = ry * fz - rz * fy;
    var uy = rz * fx - rx * fz;
    var uz = rx * fy - ry * fx;
    var target = {
      x: (b.minX + b.maxX) / 2,
      y: (b.minY + b.maxY) / 2,
      z: (b.minZ + b.maxZ) / 2
    };
    // Ajuste exacto de la caja envolvente en la pantalla (más ceñido que una esfera).
    var need = 0;
    for (var ci = 0; ci < 8; ci++) {
      var px = (ci & 1) ? b.maxX : b.minX;
      var py = (ci & 2) ? b.maxY : b.minY;
      var pz = (ci & 4) ? b.maxZ : b.minZ;
      var ox = px - target.x, oy = py - target.y, oz = pz - target.z;
      var depthA = ox * dir.x + oy * dir.y + oz * dir.z;
      var vx = ox * rx + oy * ry + oz * rz;
      var vy = ox * ux + oy * uy + oz * uz;
      var dV = depthA + Math.abs(vy) / tanHalf;
      var dH = depthA + Math.abs(vx) / (tanHalf * Math.max(0.25, aspect));
      if (dV > need) need = dV;
      if (dH > need) need = dH;
    }
    var dist = Math.max(radius * 0.9, need * 1.04);
    return {
      yaw: yaw,
      pitch: pitch,
      dist: dist,
      target: target,
      range: { min: Math.max(500, dist * 0.14), max: Math.max(dist * 3, dist + radius * 9) }
    };
  };

  View3D.prototype._applyCam = function (st) {
    this.camera.yaw = st.yaw;
    this.camera.pitch = st.pitch;
    this.camera.dist = st.dist;
    this.camera.target.x = st.target.x;
    this.camera.target.y = st.target.y;
    this.camera.target.z = st.target.z;
  };

  View3D.prototype._cancelAnim = function () {
    this._anim = null;
    if (this._animRaf) {
      try { cancelAnimationFrame(this._animRaf); } catch (e) { /* tolerar */ }
      this._animRaf = 0;
    }
  };

  View3D.prototype._finishAnim = function () {
    if (!this._anim) return;
    var to = this._anim.to;
    this._cancelAnim();
    this._applyCam(to);
  };

  View3D.prototype._animateTo = function (to, dur) {
    this._cancelAnim();
    var reduce = false;
    try {
      reduce = !!(typeof window !== 'undefined' && window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { reduce = false; }
    var canRaf = typeof requestAnimationFrame === 'function';
    if (!canRaf || reduce) {
      this._applyCam(to);
      this.render();
      return;
    }
    var cam = this.camera;
    var from = {
      yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist,
      target: { x: cam.target.x, y: cam.target.y, z: cam.target.z }
    };
    var deltaYaw = ((to.yaw - from.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
    var dest = {
      yaw: from.yaw + deltaYaw,
      pitch: to.pitch,
      dist: to.dist,
      target: { x: to.target.x, y: to.target.y, z: to.target.z }
    };
    var self = this;
    var anim = { from: from, to: dest, t0: nowMs(), dur: dur || 420 };
    this._anim = anim;
    function step() {
      if (self._destroyed || self._anim !== anim) { self._animRaf = 0; return; }
      var t = clamp((nowMs() - anim.t0) / anim.dur, 0, 1);
      var e = easeInOut(t);
      cam.yaw = lerp(anim.from.yaw, anim.to.yaw, e);
      cam.pitch = lerp(anim.from.pitch, anim.to.pitch, e);
      cam.dist = lerp(anim.from.dist, anim.to.dist, e);
      cam.target.x = lerp(anim.from.target.x, anim.to.target.x, e);
      cam.target.y = lerp(anim.from.target.y, anim.to.target.y, e);
      cam.target.z = lerp(anim.from.target.z, anim.to.target.z, e);
      self.render();
      if (t >= 1) {
        self._anim = null;
        self._animRaf = 0;
        return;
      }
      self._animRaf = requestAnimationFrame(step);
    }
    this._animRaf = requestAnimationFrame(step);
  };

  View3D.prototype._requestRender = function () {
    if (this._destroyed) return;
    if (typeof requestAnimationFrame !== 'function') {
      this.render();
      return;
    }
    if (this._raf) return;
    var self = this;
    this._raf = requestAnimationFrame(function () {
      self._raf = 0;
      self.render();
    });
  };

  // ---------- proyección ----------
  View3D.prototype._projectPoint = function (p, view) {
    var vx = p.x - view.eye.x, vy = p.y - view.eye.y, vz = p.z - view.eye.z;
    var rx = vx * view.right.x + vy * view.right.y + vz * view.right.z;
    var ry = vx * view.up.x + vy * view.up.y + vz * view.up.z;
    var rz = vx * view.fwd.x + vy * view.fwd.y + vz * view.fwd.z;
    this._pt.z = rz;
    if (rz < NEAR) return this._pt;
    var inv = 1 / rz;
    this._pt.x = view.cx + rx * view.focal * inv;
    this._pt.y = view.cy - ry * view.focal * inv;
    return this._pt;
  };

  View3D.prototype._projectSegment = function (a, b, view) {
    var ax = a.x - view.eye.x, ay = a.y - view.eye.y, az = a.z - view.eye.z;
    var bx = b.x - view.eye.x, by = b.y - view.eye.y, bz = b.z - view.eye.z;
    var arx = ax * view.right.x + ay * view.right.y + az * view.right.z;
    var ary = ax * view.up.x + ay * view.up.y + az * view.up.z;
    var arz = ax * view.fwd.x + ay * view.fwd.y + az * view.fwd.z;
    var brx = bx * view.right.x + by * view.right.y + bz * view.right.z;
    var bry = bx * view.up.x + by * view.up.y + bz * view.up.z;
    var brz = bx * view.fwd.x + by * view.fwd.y + bz * view.fwd.z;
    if (arz < NEAR && brz < NEAR) return null;
    if (arz < NEAR || brz < NEAR) {
      var t = (NEAR - arz) / (brz - arz);
      var nrx = arx + (brx - arx) * t;
      var nry = ary + (bry - ary) * t;
      if (arz < NEAR) { arx = nrx; ary = nry; arz = NEAR; }
      else { brx = nrx; bry = nry; brz = NEAR; }
    }
    var out = this._segBuf;
    out[0] = view.cx + arx * view.focal / arz;
    out[1] = view.cy - ary * view.focal / arz;
    out[2] = view.cx + brx * view.focal / brz;
    out[3] = view.cy - bry * view.focal / brz;
    return out;
  };

  // Proyecta una cara; devuelve false si queda fuera. Escribe px/py/depth.
  View3D.prototype._projectFace = function (f, view, cull) {
    if (cull && !f.twoSided) {
      var d = f.n.x * (view.eye.x - f.c.x) + f.n.y * (view.eye.y - f.c.y) + f.n.z * (view.eye.z - f.c.z);
      if (d <= 0) return false;
    }
    var pts = f.pts, n = pts.length;
    if (n < 3 || n > 2040) return false;
    var i, anyBehind = false, allBehind = true;
    for (i = 0; i < n; i++) {
      var p = pts[i];
      var vx = p.x - view.eye.x, vy = p.y - view.eye.y, vz = p.z - view.eye.z;
      var ax = vx * view.right.x + vy * view.right.y + vz * view.right.z;
      var ay = vx * view.up.x + vy * view.up.y + vz * view.up.z;
      var az = vx * view.fwd.x + vy * view.fwd.y + vz * view.fwd.z;
      VX[i] = ax; VY[i] = ay; VZ[i] = az;
      if (az < NEAR) anyBehind = true;
      else allBehind = false;
    }
    if (allBehind) return false;
    var sx = VX, sy = VY, sz = VZ, cnt = n;
    if (anyBehind) {
      cnt = 0;
      for (i = 0; i < n; i++) {
        var j = (i + 1) % n;
        var zi = VZ[i], zj = VZ[j];
        var ini = zi >= NEAR, inj = zj >= NEAR;
        if (ini) {
          if (cnt >= 2047) return false;
          CLX[cnt] = VX[i]; CLY[cnt] = VY[i]; CLZ[cnt] = VZ[i]; cnt++;
        }
        if (ini !== inj) {
          var t = (NEAR - zi) / (zj - zi);
          if (cnt >= 2047) return false;
          CLX[cnt] = VX[i] + (VX[j] - VX[i]) * t;
          CLY[cnt] = VY[i] + (VY[j] - VY[i]) * t;
          CLZ[cnt] = NEAR;
          cnt++;
        }
      }
      sx = CLX; sy = CLY; sz = CLZ;
    }
    if (cnt < 3 || cnt > f.px.length) return false;
    var minX = 1e12, minY = 1e12, maxX = -1e12, maxY = -1e12, dsum = 0;
    for (i = 0; i < cnt; i++) {
      var inv = 1 / sz[i];
      var X = view.cx + sx[i] * view.focal * inv;
      var Y = view.cy - sy[i] * view.focal * inv;
      f.px[i] = X;
      f.py[i] = Y;
      dsum += sz[i];
      if (X < minX) minX = X;
      if (X > maxX) maxX = X;
      if (Y < minY) minY = Y;
      if (Y > maxY) maxY = Y;
    }
    f.pn = cnt;
    f.depth = dsum / cnt;
    if (maxX < -30 || minX > view.w + 30 || maxY < -30 || minY > view.h + 30) return false;
    return true;
  };

  View3D.prototype._paintFace = function (ctx, f) {
    var n = f.pn;
    if (n < 3) return;
    ctx.beginPath();
    ctx.moveTo(f.px[0], f.py[0]);
    for (var i = 1; i < n; i++) ctx.lineTo(f.px[i], f.py[i]);
    ctx.closePath();
    ctx.fillStyle = f.fill;
    ctx.fill();
    if (f.stroke) {
      ctx.strokeStyle = f.stroke;
      ctx.lineWidth = f.lw;
      ctx.stroke();
    }
    if (f.tex) this._paintTexture(ctx, f);
    if (f.details && f.details.length) this._paintDetails(ctx, f.details);
  };

  View3D.prototype._texTick = function (cost) {
    if (!(this._texBudget > 0)) return false;
    this._texBudget -= (cost || 1);
    return this._texBudget > 0;
  };

  // Texturas procedurales sin imágenes: se recortan al polígono de la cara y se
  // dibujan a partir de su caja en pantalla (aprox.). Presupuesto por fotograma.
  View3D.prototype._paintTexture = function (ctx, f) {
    var kind = f.tex;
    if (!kind || kind === 'smooth') return;
    var cfg = this._cfg;
    if (!cfg || !cfg.textures || !cfg.realistic) return;
    if (f.pn < 3 || !(this._texBudget > 0)) return;
    var i, X, Y;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (i = 0; i < f.pn; i++) {
      X = f.px[i]; Y = f.py[i];
      if (X < minX) minX = X;
      if (X > maxX) maxX = X;
      if (Y < minY) minY = Y;
      if (Y > maxY) maxY = Y;
    }
    var bw = maxX - minX, bh = maxY - minY;
    if (bw < 15 || bh < 15 || bw * bh < 1100) return;
    ctx.save();
    try {
      this._pathFace(ctx, f);
      ctx.clip();
      this._drawTexture(ctx, kind, f, minX, minY, bw, bh);
    } catch (e) { /* tolerar */ }
    ctx.restore();
  };

  View3D.prototype._drawTexture = function (ctx, kind, f, minX, minY, bw, bh) {
    var self = this;
    var seed = hash01(kind + '|' + f.fill + '|' + Math.round(minX) + '|' + Math.round(minY));
    var x1 = minX + bw, y1 = minY + bh;
    ctx.lineCap = 'butt';

    function line(ax, ay, bx2, by2, color, lw) {
      if (!self._texTick(1)) return false;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx2, by2);
      ctx.strokeStyle = color;
      ctx.lineWidth = lw || 0.7;
      ctx.stroke();
      return true;
    }
    function dot(cx, cy, r, color) {
      if (!self._texTick(1)) return false;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fillStyle = color;
      ctx.fill();
      return true;
    }
    function rows(count, color, lw) {
      for (var r = 1; r < count; r++) {
        var y = minY + (bh * r) / count;
        if (!line(minX, y, x1, y, color, lw)) return false;
      }
      return true;
    }
    function rnd(i, salt) { return hash01(seed + salt + i * 7.317); }
    var i, r, y, x, count, step, rowsN, off, brickW, color;

    switch (kind) {
      case 'stucco': {
        // Ruido sutil de grano fino.
        count = clamp(Math.round((bw * bh) / 950), 10, 190);
        color = 'rgba(88, 80, 68, 0.055)';
        for (i = 0; i < count; i++) {
          x = minX + rnd(i, 1.7) * bw;
          y = minY + rnd(i, 9.1) * bh;
          if (!dot(x, y, 0.5 + rnd(i, 3.3) * 0.9, color)) break;
        }
        // Manchas de estuco aplicado.
        count = clamp(Math.round((bw * bh) / 12000), 3, 26);
        for (i = 0; i < count; i++) {
          x = minX + rnd(i, 21.3) * bw;
          y = minY + rnd(i, 31.9) * bh;
          if (!dot(x, y, 3 + rnd(i, 5.1) * 7, 'rgba(255, 252, 244, 0.04)')) break;
        }
        break;
      }
      case 'brick': {
        rowsN = clamp(Math.round(bh / 24), 3, 18);
        color = 'rgba(96, 74, 62, 0.18)';
        if (!rows(rowsN, color, 0.8)) break;
        var rowH = bh / rowsN;
        brickW = Math.max(10, rowH * 2.2);
        for (r = 0; r < rowsN; r++) {
          y = minY + rowH * r;
          off = (r % 2) * brickW * 0.5;
          step = clamp(Math.round(bw / brickW), 1, 30);
          for (i = 0; i <= step; i++) {
            x = minX + off + (bw * i) / step;
            if (x > x1 - 1) break;
            if (!line(x, y, x, y + rowH, color, 0.7)) { r = rowsN; break; }
          }
        }
        break;
      }
      case 'stone': {
        rowsN = clamp(Math.round(bh / 34), 2, 12);
        color = 'rgba(84, 82, 76, 0.17)';
        if (!rows(rowsN, color, 0.9)) break;
        var sRowH = bh / rowsN;
        for (r = 0; r < rowsN; r++) {
          y = minY + sRowH * r;
          brickW = sRowH * (1.5 + rnd(r, 4.3) * 1.4);
          off = rnd(r, 8.7) * brickW;
          for (x = minX + off; x < x1; x += brickW) {
            if (!line(x, y, x, y + sRowH, color, 0.8)) { r = rowsN; break; }
          }
        }
        break;
      }
      case 'wood': {
        // Vetas a lo largo del lado mayor en pantalla.
        var vertical = bw >= bh;
        var len = vertical ? bh : bw;
        var across = vertical ? bw : bh;
        count = clamp(Math.round(across / 11), 3, 20);
        color = 'rgba(96, 68, 40, 0.12)';
        for (i = 0; i < count; i++) {
          var u = (i + 0.5) / count;
          var wob = (rnd(i, 2.9) - 0.5) * Math.min(10, across * 0.06);
          if (!self._texTick(2)) break;
          ctx.beginPath();
          if (vertical) {
            var xx = minX + across * u;
            ctx.moveTo(xx, minY);
            ctx.quadraticCurveTo(xx + wob, minY + len * 0.5, xx + wob * 0.4, y1);
          } else {
            var yy = minY + across * u;
            ctx.moveTo(minX, yy);
            ctx.quadraticCurveTo(minX + len * 0.5, yy + wob, x1, yy + wob * 0.4);
          }
          ctx.strokeStyle = color;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
        break;
      }
      case 'tile': {
        rowsN = clamp(Math.round(bh / 16), 4, 26);
        color = 'rgba(96, 72, 52, 0.20)';
        if (!rows(rowsN, color, 0.8)) break;
        var tRowH = bh / rowsN;
        for (r = 0; r < rowsN; r++) {
          y = minY + tRowH * r;
          off = (r % 2) * tRowH * 0.7;
          step = Math.max(9, tRowH * 1.4);
          for (x = minX + off; x < x1; x += step) {
            if (!line(x, y, x, y + tRowH, 'rgba(104, 80, 58, 0.13)', 0.7)) { r = rowsN; break; }
          }
        }
        break;
      }
      case 'shingle': {
        rowsN = clamp(Math.round(bh / 14), 5, 30);
        color = 'rgba(70, 68, 64, 0.20)';
        if (!rows(rowsN, color, 0.9)) break;
        var hRowH = bh / rowsN;
        for (r = 0; r < rowsN; r++) {
          y = minY + hRowH * r;
          off = (r % 2) * hRowH * 0.9;
          step = Math.max(8, hRowH * 1.8);
          for (x = minX + off; x < x1; x += step) {
            if (!line(x, y, x, y + hRowH * 0.9, 'rgba(80, 78, 72, 0.12)', 0.7)) { r = rowsN; break; }
          }
        }
        break;
      }
      case 'metal': {
        count = clamp(Math.round(bw / 26), 3, 12);
        color = 'rgba(72, 78, 82, 0.18)';
        for (i = 1; i < count; i++) {
          x = minX + (bw * i) / count;
          if (!line(x, minY, x, y1, color, 1)) break;
        }
        if (bh > 60) line(minX, minY + bh * 0.5, x1, minY + bh * 0.5, 'rgba(72, 78, 82, 0.10)', 0.8);
        break;
      }
      case 'concrete': {
        rowsN = clamp(Math.round(bh / 42), 2, 8);
        if (!rows(rowsN, 'rgba(84, 82, 76, 0.10)', 0.7)) break;
        count = clamp(Math.round((bw * bh) / 2600), 6, 70);
        for (i = 0; i < count; i++) {
          x = minX + rnd(i, 6.1) * bw;
          y = minY + rnd(i, 12.7) * bh;
          if (!dot(x, y, 0.5 + rnd(i, 4.4), 'rgba(90, 88, 82, 0.05)')) break;
        }
        break;
      }
      case 'grass': {
        count = clamp(Math.round((bw * bh) / 1500), 18, 240);
        var greens = ['rgba(66, 98, 46, 0.10)', 'rgba(96, 124, 62, 0.10)', 'rgba(126, 142, 84, 0.09)'];
        for (i = 0; i < count; i++) {
          x = minX + rnd(i, 2.2) * bw;
          y = minY + rnd(i, 7.7) * bh;
          if (!dot(x, y, 0.8 + rnd(i, 3.9) * 2.2, greens[i % 3])) break;
        }
        count = clamp(Math.round((bw * bh) / 9000), 3, 40);
        for (i = 0; i < count; i++) {
          x = minX + rnd(i, 17.1) * bw;
          y = minY + rnd(i, 23.5) * bh;
          if (!dot(x, y, 3 + rnd(i, 8.8) * 8, 'rgba(140, 156, 96, 0.055)')) break;
        }
        break;
      }
      case 'paving': {
        var cols = clamp(Math.round(bw / 42), 2, 14);
        var pRows = clamp(Math.round(bh / 38), 2, 12);
        color = 'rgba(88, 84, 76, 0.16)';
        for (i = 1; i < cols; i++) {
          x = minX + (bw * i) / cols;
          if (!line(x, minY, x, y1, color, 0.8)) break;
        }
        for (r = 1; r < pRows; r++) {
          y = minY + (bh * r) / pRows;
          if (!line(minX, y, x1, y, color, 0.8)) break;
        }
        break;
      }
      case 'gravel': {
        count = clamp(Math.round((bw * bh) / 1100), 30, 320);
        for (i = 0; i < count; i++) {
          x = minX + rnd(i, 5.4) * bw;
          y = minY + rnd(i, 13.3) * bh;
          var shade2 = rnd(i, 19.7);
          color = shade2 > 0.5 ? 'rgba(120, 116, 106, 0.13)' : 'rgba(168, 162, 150, 0.12)';
          if (!dot(x, y, 0.7 + rnd(i, 27.1) * 1.5, color)) break;
        }
        break;
      }
      default:
        break;
    }
  };

  View3D.prototype._paintDetails = function (ctx, details, view) {
    view = view || this._pView;
    if (!view) return;
    for (var i = 0; i < details.length; i++) {
      var d = details[i];
      var s = this._projectSegment(d.a, d.b, view);
      if (!s) continue;
      ctx.beginPath();
      ctx.moveTo(s[0], s[1]);
      ctx.lineTo(s[2], s[3]);
      ctx.strokeStyle = d.color;
      ctx.lineWidth = d.lw || 1;
      ctx.stroke();
    }
  };

  View3D.prototype._sunScreen = function (w, h) {
    var x = w * (0.5 - 0.44 * LIGHT.x);
    var y = h * (0.24 - 0.26 * LIGHT.y);
    return { x: clamp(x, w * 0.06, w * 0.94), y: clamp(y, h * 0.04, h * 0.46) };
  };

  View3D.prototype._drawSky = function (ctx, w, h) {
    var cfg = this._cfg || {};
    var realistic = !!cfg.realistic;
    var key = (realistic ? 'r' : 's') + '|' + w + 'x' + h;
    if (!this._sky || this._sky.key !== key) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      if (realistic) {
        g.addColorStop(0, '#6f9dc4');
        g.addColorStop(0.38, '#a8c6da');
        g.addColorStop(0.68, '#d3e1e5');
        g.addColorStop(1, '#edf0e9');
      } else {
        g.addColorStop(0, '#dfe9ee');
        g.addColorStop(0.5, '#e6edef');
        g.addColorStop(1, '#f4f1e8');
      }
      this._sky = { key: key, grad: g };
    }
    ctx.fillStyle = this._sky.grad;
    ctx.fillRect(0, 0, w, h);
    if (realistic) {
      var sun = this._sunScreen(w, h);
      var rad = Math.max(w, h) * 0.62;
      var glow = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, rad);
      glow.addColorStop(0, 'rgba(255, 250, 232, 0.92)');
      glow.addColorStop(0.12, 'rgba(255, 246, 218, 0.42)');
      glow.addColorStop(0.42, 'rgba(255, 244, 214, 0.10)');
      glow.addColorStop(1, 'rgba(255, 244, 214, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, Math.max(9, Math.min(w, h) * 0.022), 0, TAU);
      ctx.fillStyle = 'rgba(255, 253, 244, 0.96)';
      ctx.fill();
    } else {
      var glow2 = ctx.createRadialGradient(w * 0.78, h * 0.1, 0, w * 0.78, h * 0.1, Math.max(w, h) * 0.62);
      glow2.addColorStop(0, 'rgba(255, 250, 232, 0.55)');
      glow2.addColorStop(1, 'rgba(255, 250, 232, 0)');
      ctx.fillStyle = glow2;
      ctx.fillRect(0, 0, w, h);
    }
  };

  View3D.prototype._drawGroundPass = function (ctx, view) {
    var scene = this._scene;
    if (!scene) return;
    var i;
    var ground = scene.groundFace;
    if (ground) {
      if (this._projectFace(ground, view, false)) {
        this._paintFace(ctx, ground);
        // Luz ambiental del terreno: degradado radial suave.
        var c = this._projectPoint(scene.groundCenter, view);
        if (c.z > NEAR) {
          ctx.save();
          this._pathFace(ctx, ground);
          ctx.clip();
          var r = Math.max(120, Math.max(view.w, view.h) * 0.72);
          var rg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
          var gGlow = (this._cfg && this._cfg.groundGlow) || 'rgba(255, 255, 250, 0.30)';
          var gGlow2 = (this._cfg && this._cfg.realistic) ? 'rgba(255, 255, 250, 0.06)' : 'rgba(255, 255, 250, 0.10)';
          rg.addColorStop(0, gGlow);
          rg.addColorStop(0.6, gGlow2);
          rg.addColorStop(1, 'rgba(255, 255, 250, 0)');
          ctx.fillStyle = rg;
          ctx.fillRect(0, 0, view.w, view.h);
          ctx.restore();
        }
        // Borde del disco de terreno.
        if (ground.pn >= 3) {
          ctx.strokeStyle = 'rgba(118, 110, 94, 0.22)';
          ctx.lineWidth = 1.2;
          this._pathFace(ctx, ground);
          ctx.stroke();
        }
      }
    }
    // Rejilla del terreno (recortada al disco)
    var grid = scene.gridLines;
    if (grid.length) {
      ctx.save();
      if (ground && ground.pn >= 3) { this._pathFace(ctx, ground); ctx.clip(); }
      for (i = 0; i < grid.length; i++) {
        var s = this._projectSegment(grid[i].a, grid[i].b, view);
        if (!s) continue;
        ctx.beginPath();
        ctx.moveTo(s[0], s[1]);
        ctx.lineTo(s[2], s[3]);
        ctx.strokeStyle = grid[i].color;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }
    // Base / podio sutil
    var pad = scene.padFaces;
    for (i = 0; i < pad.length; i++) {
      if (this._projectFace(pad[i], view, false)) this._paintFace(ctx, pad[i]);
    }
    // Sombras suaves sobre el terreno
    var sh = scene.shadowFaces;
    for (i = 0; i < sh.length; i++) {
      if (this._projectFace(sh[i], view, false)) this._paintFace(ctx, sh[i]);
    }
  };

  View3D.prototype._pathFace = function (ctx, f) {
    if (f.pn < 3) return;
    ctx.beginPath();
    ctx.moveTo(f.px[0], f.py[0]);
    for (var i = 1; i < f.pn; i++) ctx.lineTo(f.px[i], f.py[i]);
    ctx.closePath();
  };

  View3D.prototype._drawFaceList = function (ctx, list, view, cull) {
    if (!list || !list.length) return;
    var bucket = this._bucket;
    bucket.length = 0;
    var i, f;
    for (i = 0; i < list.length; i++) {
      f = list[i];
      if (this._projectFace(f, view, cull)) bucket.push(f);
    }
    bucket.sort(function (a, b) { return b.depth - a.depth; });
    for (i = 0; i < bucket.length; i++) this._paintFace(ctx, bucket[i]);
  };

  View3D.prototype._drawPasses = function (ctx, view) {
    var scene = this._scene;
    if (!scene) return;
    this._pView = view;
    for (var i = 0; i < scene.passes.length; i++) {
      var pass = scene.passes[i];
      this._drawFaceList(ctx, pass.slabs, view, true);
      this._drawFaceList(ctx, pass.floors, view, true);
      this._drawFaceList(ctx, pass.others, view, true);
      // Las etiquetas se dibujan tras el nivel superior: el techo las oculta.
      if (i === scene.passes.length - 1 && pass.labels.length && !this.options.roof) {
        this._drawLabels(ctx, view, pass.labels);
      }
    }
    // El techo se dibuja al final: su gran plano debe ocultar el interior.
    this._drawFaceList(ctx, scene.roofFaces, view, true);
    this._pView = null;
  };

  View3D.prototype._drawDims = function (ctx, view) {
    if (!this.options.dimensions) return;
    var dims = this._scene ? this._scene.dims : null;
    if (!dims || !dims.length) return;
    ctx.save();
    ctx.lineWidth = 1;
    for (var i = 0; i < dims.length; i++) {
      var d = dims[i];
      var a = this._projectPoint({ x: d.ax, y: d.ay, z: d.z }, view);
      if (a.z < NEAR) continue;
      var ax = a.x, ay = a.y;
      var b = this._projectPoint({ x: d.bx, y: d.by, z: d.z }, view);
      if (b.z < NEAR) continue;
      var bx = b.x, by = b.y;
      var a2 = this._projectPoint({ x: d.a2x, y: d.a2y, z: d.z }, view);
      if (a2.z < NEAR) continue;
      var a2x = a2.x, a2y = a2.y;
      var b2 = this._projectPoint({ x: d.b2x, y: d.b2y, z: d.z }, view);
      if (b2.z < NEAR) continue;
      var b2x = b2.x, b2y = b2.y;
      ctx.strokeStyle = 'rgba(181, 101, 29, 0.65)';
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(a2x, a2y);
      ctx.moveTo(bx, by); ctx.lineTo(b2x, b2y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(181, 101, 29, 0.9)';
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(a2x, a2y);
      ctx.lineTo(b2x, b2y);
      ctx.stroke();
      ctx.setLineDash([]);
      var mx = (a2x + b2x) / 2, my = (a2y + b2y) / 2;
      ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
      var tw = ctx.measureText(d.text).width;
      ctx.fillStyle = 'rgba(248, 246, 240, 0.86)';
      ctx.fillRect(mx - tw / 2 - 3, my - 8, tw + 6, 14);
      ctx.fillStyle = '#8a5a1c';
      ctx.fillText(d.text, mx - tw / 2, my + 2);
    }
    ctx.restore();
  };

  View3D.prototype._drawLabels = function (ctx, view, labels) {
    if (!this.options.labels || !labels || !labels.length) return;
    var vis = [];
    var i, l, p;
    for (i = 0; i < labels.length; i++) {
      l = labels[i];
      p = this._projectPoint(l, view);
      if (p.z < NEAR) continue;
      if (p.x < -80 || p.x > view.w + 80 || p.y < -40 || p.y > view.h + 40) continue;
      var scale = view.focal / p.z;
      if (l.radius * scale < 17) continue;
      vis.push({ l: l, x: p.x, y: p.y, d: p.z });
    }
    if (!vis.length) return;
    vis.sort(function (a, b) { return b.d - a.d; });
    var fs = view.w >= 1400 ? 12 : 11;
    ctx.font = '600 ' + fs + 'px "Segoe UI", system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    var rects = [];
    var drawn = 0;
    var maxDraw = Math.min(vis.length, 40);
    for (i = 0; i < vis.length && drawn < maxDraw; i++) {
      var item = vis[i];
      var text = item.l.name + '  ·  ' + item.l.areaText;
      var tw = ctx.measureText(text).width;
      var padX = 6, padY = 4;
      var bw = tw + padX * 2;
      var bh = fs + padY * 2;
      var bx = item.x - bw / 2;
      var by = item.y - bh / 2;
      var overlap = false;
      for (var k = 0; k < rects.length; k++) {
        var r = rects[k];
        if (bx < r.x + r.w && bx + bw > r.x && by < r.y + r.h && by + bh > r.y) { overlap = true; break; }
      }
      if (overlap) continue;
      rects.push({ x: bx, y: by, w: bw, h: bh });
      drawn++;
      roundRectPath(ctx, bx, by, bw, bh, 4);
      ctx.fillStyle = 'rgba(252, 251, 246, 0.87)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(74, 86, 96, 0.18)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = '#2b3540';
      ctx.fillText(text, bx + padX, item.y + 0.5);
    }
  };

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ---------- construcción de la escena ----------
  View3D.prototype._ensureScene = function () {
    if (this._dirty || !this._scene) {
      this._scene = this._buildScene();
      this._dirty = false;
    }
    return this._scene;
  };

  // Resuelve el aspecto de la escena mezclando options con project.settings
  // (roof/materials/render). En modo esquemático conserva la paleta anterior.
  View3D.prototype._resolveConfig = function (settings) {
    settings = settings || {};
    var o = this.options || {};
    var sRoof = settings.roof || {};
    var sMats = settings.materials || {};
    var sRender = settings.render || {};
    var oM = o.materials || {};
    var sWall = sMats.wall || {}, sRoofM = sMats.roof || {}, sTrim = sMats.trim || {}, sGround = sMats.ground || {};
    var oWall = oM.wall || {}, oRoofM = oM.roof || {}, oTrim = oM.trim || {}, oGround = oM.ground || {};

    var wall = {
      color: oWall.color || sWall.color || DEFAULT_MATERIALS.wall.color,
      texture: WALL_TEXTURES[oWall.texture] ? oWall.texture
        : (WALL_TEXTURES[sWall.texture] ? sWall.texture : DEFAULT_MATERIALS.wall.texture)
    };
    var roof = {
      color: oRoofM.color || sRoofM.color || DEFAULT_MATERIALS.roof.color,
      texture: ROOF_TEXTURES[oRoofM.texture] ? oRoofM.texture
        : (ROOF_TEXTURES[sRoofM.texture] ? sRoofM.texture : DEFAULT_MATERIALS.roof.texture)
    };
    var trim = { color: oTrim.color || sTrim.color || DEFAULT_MATERIALS.trim.color };
    var ground = {
      color: oGround.color || sGround.color || DEFAULT_MATERIALS.ground.color,
      texture: GROUND_TEXTURES[oGround.texture] ? oGround.texture
        : (GROUND_TEXTURES[sGround.texture] ? sGround.texture : DEFAULT_MATERIALS.ground.texture)
    };

    var mode = (o.renderMode === 'realistic' || o.renderMode === 'schematic')
      ? o.renderMode : (sRender.mode === 'realistic' ? 'realistic' : 'schematic');
    var realistic = mode === 'realistic';
    var shadows = o.shadows == null ? (sRender.shadows !== false) : !!o.shadows;
    var textures = o.textures == null ? (sRender.textures !== false) : !!o.textures;
    var sunAngle = o.sunAngle == null
      ? (isFinite(Number(sRender.sunAngle)) ? num(sRender.sunAngle) : 135)
      : num(o.sunAngle);
    var style = ROOF_STYLES[o.roofStyle] ? o.roofStyle
      : (ROOF_STYLES[sRoof.style] ? sRoof.style : 'flat');
    var rh = o.roofHeight == null ? num(sRoof.height) : num(o.roofHeight);
    if (!isFinite(rh) || rh <= 0) rh = 1200;
    var ov = o.roofOverhang == null ? num(sRoof.overhang) : num(o.roofOverhang);
    if (!isFinite(ov)) ov = 400;
    // Cumbrera y perfil de diseño (ampliación 1.4).
    var ridgeRaw = o.roofRidge != null ? o.roofRidge : sRoof.ridge;
    var ridge = (ridgeRaw === 'x' || ridgeRaw === 'y') ? ridgeRaw : 'auto';
    var profileRaw = o.roofProfile != null ? o.roofProfile : sRoof.profile;
    var roofProfile = normalizeRoofProfile(profileRaw);
    // 'custom' sin perfil válido cae a 'gable' (estilo efectivo).
    if (style === 'custom' && !roofProfile) style = 'gable';

    var roofColor = o.roofColor || roof.color || DEFAULT_MATERIALS.roof.color;
    var roofTexture = ROOF_TEXTURES[o.roofTexture] ? o.roofTexture : roof.texture;
    var wallTexture = wall.texture;
    var groundTexture = ground.texture;

    var cfg = {
      realistic: realistic,
      renderMode: mode,
      shadows: shadows,
      textures: textures,
      sunAngle: sunAngle,
      roofStyle: style,
      roofHeight: clamp(rh, 150, 8000),
      roofOverhang: clamp(ov, 0, 2500),
      roofRidge: ridge,
      roofProfile: roofProfile,
      materials: { wall: wall, roof: roof, trim: trim, ground: ground },
      wallColor: realistic ? wall.color : WALL_COLOR,
      trimColor: realistic ? trim.color : TRIM_COLOR,
      doorColor: realistic ? mixColor(wall.color, '#8a5a2b', 0.5) : DOOR_COLOR,
      garageColor: realistic ? mixColor(trim.color, '#5d5b52', 0.2) : '#cfc8b9',
      roofColor: realistic ? roofColor : '#d9d2c2',
      wallTexture: textures ? wallTexture : 'smooth',
      roofTexture: textures ? roofTexture : 'smooth',
      groundColor: realistic ? ground.color : '#e4dfd1',
      groundTexture: textures ? groundTexture : 'smooth',
      floorTextures: realistic && textures,
      slabColor: realistic ? tintColor(trim.color, -0.06) : '#e6e0d3',
      padTopColor: realistic ? mixColor(ground.color, '#b0a894', 0.3) : '#efeade',
      padSideColor: realistic ? mixColor(ground.color, '#7d7768', 0.45) : '#ded8ca',
      edge: realistic ? 'rgba(62, 60, 54, 0.28)' : EDGE_SOLID,
      glassFill: realistic ? 'rgba(150, 193, 214, 0.46)' : GLASS_FILL,
      glassStroke: realistic ? 'rgba(96, 124, 138, 0.5)' : GLASS_STROKE,
      groundGlow: realistic ? 'rgba(255, 255, 250, 0.18)' : 'rgba(255, 255, 250, 0.30)'
    };
    return cfg;
  };

  View3D.prototype._buildScene = function () {
    var store = this.store;
    var opts = this.options;
    var G = (ED && ED.Geo) || null;
    var project = store && store.project;
    var settings = (project && project.settings) || {};
    var cfg = this._resolveConfig(settings);
    this._cfg = cfg;
    applyLight(cfg);
    var scene = {
      passes: [],
      dims: [],
      gridLines: [],
      padFaces: [],
      shadowFaces: [],
      roofFaces: [],
      groundFace: null,
      groundCenter: { x: 0, y: 0, z: 0 },
      bounds: null
    };
    var bmin = { x: Infinity, y: Infinity, z: Infinity };
    var bmax = { x: -Infinity, y: -Infinity, z: -Infinity };
    var padMin = { x: Infinity, y: Infinity }, padMax = { x: -Infinity, y: -Infinity };
    var shadowCount = 0;
    var padFound = false;
    // Contadores de mallas de biblioteca (def.mesh) para el presupuesto global.
    var meshFaces = 0;
    var meshShadowCount = 0;

    function bump(x, y, z) {
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
      if (x < bmin.x) bmin.x = x;
      if (y < bmin.y) bmin.y = y;
      if (z < bmin.z) bmin.z = z;
      if (x > bmax.x) bmax.x = x;
      if (y > bmax.y) bmax.y = y;
      if (z > bmax.z) bmax.z = z;
    }
    function bumpPad(x, y) {
      if (!isFinite(x) || !isFinite(y)) return;
      padFound = true;
      if (x < padMin.x) padMin.x = x;
      if (y < padMin.y) padMin.y = y;
      if (x > padMax.x) padMax.x = x;
      if (y > padMax.y) padMax.y = y;
    }
    function face(list, pts, color, o) {
      return addFace(list, pts, color, o);
    }
    // Cuenta aproximada de caras ya construidas (presupuesto de detalles).
    function totalFacesNow() {
      var total = 0;
      for (var ti = 0; ti < scene.passes.length; ti++) {
        total += scene.passes[ti].slabs.length + scene.passes[ti].floors.length + scene.passes[ti].others.length;
      }
      return total;
    }
    function shadow(corners2, topZ) {
      if (!opts.ground || !cfg.shadows || shadowCount >= SHADOW_MAX) return;
      shadowCount++;
      var ox = topZ * SHADOW_KX, oy = topZ * SHADOW_KY;
      var pts = [], i;
      for (i = 0; i < corners2.length; i++) {
        pts.push({ x: corners2[i].x + ox, y: corners2[i].y + oy, z: 4 });
      }
      var poly = ensureCCW(pts);
      var far = expandPoly(poly, 1.16);
      var mid = expandPoly(poly, 1.07);
      var farPts = [], midPts = [];
      for (i = 0; i < far.length; i++) farPts.push({ x: far[i].x, y: far[i].y, z: 4 });
      for (i = 0; i < mid.length; i++) midPts.push({ x: mid[i].x, y: mid[i].y, z: 4 });
      var aFar = cfg.realistic ? 0.028 : 0.016;
      var aMid = cfg.realistic ? 0.046 : 0.026;
      var aCore = cfg.realistic ? 0.085 : 0.042;
      var aContact = cfg.realistic ? 0.032 : 0.018;
      var shCol = cfg.realistic ? '44, 54, 66' : '62, 74, 86';
      scene.shadowFaces.push(addFace([], farPts, '#000', { fill: 'rgba(' + shCol + ', ' + aFar + ')', edge: false, twoSided: true }));
      scene.shadowFaces.push(addFace([], midPts, '#000', { fill: 'rgba(' + shCol + ', ' + aMid + ')', edge: false, twoSided: true }));
      scene.shadowFaces.push(addFace([], poly, '#000', { fill: 'rgba(' + shCol + ', ' + aCore + ')', edge: false, twoSided: true }));
      // Contacto suave bajo el volumen (oclusión ambiental).
      var contact = expandPoly(poly, 1.02);
      var contactPts = [];
      for (i = 0; i < contact.length; i++) contactPts.push({ x: contact[i].x, y: contact[i].y, z: 4 });
      scene.shadowFaces.push(addFace([], contactPts, '#000', { fill: 'rgba(58, 68, 78, ' + aContact + ')', edge: false, twoSided: true }));
    }

    // --- niveles visibles ---
    var levels = ((project && project.levels) || []).filter(function (l) { return l && l.id; });
    var activeId = (store && store.activeLevel) || (levels[0] && levels[0].id);
    var shown = levels.slice();
    var filter = opts.levels;
    if (filter === 'active') {
      shown = levels.filter(function (l) { return l.id === activeId; });
    } else if (filter && filter !== 'all') {
      var one = levels.filter(function (l) { return l.id === filter; });
      if (one.length) shown = one;
    }
    shown.sort(function (a, b) { return (num(a.elevation) - num(b.elevation)); });

    var passByLevel = {};
    // Un solo nivel visible se apoya en el terreno (vista de nivel enfocado).
    var grounded = shown.length === 1;
    for (var li = 0; li < shown.length; li++) {
      var lv = shown[li];
      var pass = {
        level: lv,
        elevation: grounded ? 0 : num(lv.elevation),
        trueElevation: num(lv.elevation),
        floors: [],
        slabs: [],
        others: [],
        labels: [],
        wallBounds: null,
        maxWallTop: 0
      };
      scene.passes.push(pass);
      passByLevel[lv.id] = pass;
    }

    if (!project) {
      scene.bounds = { minX: -4000, minY: -4000, maxX: 4000, maxY: 4000, minZ: 0, maxZ: 2800 };
      return scene;
    }

    // --- pisos por ambiente y etiquetas ---
    var rooms = project.rooms || [];
    var roomCount = 0;
    for (var ri = 0; ri < rooms.length; ri++) {
      var room = rooms[ri];
      if (!room || !passByLevel[room.level]) continue;
      if (!layerVisible(store, room.layerId)) continue;
      var poly = cleanPolygon(room.polygon);
      if (!poly) continue;
      var passR = passByLevel[room.level];
      var floorZ = passR.elevation + 6;
      var finish = room.finish || guessFinish(room.name);
      var base = room.color || FINISH_COLORS[finish] || '#e5dfd1';
      var variation = hash01(room.id || room.name || 'room') * 0.05 - 0.025;
      var ccw = ensureCCW(poly);
      var zPts = [];
      for (var pi = 0; pi < ccw.length; pi++) {
        zPts.push({ x: ccw[pi].x, y: ccw[pi].y, z: floorZ });
        bump(ccw[pi].x, ccw[pi].y, floorZ);
        bumpPad(ccw[pi].x, ccw[pi].y);
      }
      var floorFace = face(passR.floors, zPts, tintColor(base, variation), { edge: EDGE_FLOOR });
      if (cfg.floorTextures && floorFace) floorFace.tex = FINISH_TEXTURES[finish] || null;
      addFloorDetails(floorFace, poly, floorZ, finish);
      roomCount++;

      // etiqueta: nombre + área
      var area = polyArea(poly);
      if (area > 250000 && room.name) {
        var cen = polyCentroid2(poly);
        var radius = Math.sqrt(area) * 0.5;
        passR.labels.push({
          x: cen.x, y: cen.y, z: floorZ + 1450,
          name: String(room.name), areaText: formatAreaText(area, store.project.settings && store.project.settings.units), radius: radius
        });
      }
    }

    function addFloorDetails(faceRef, poly, z, finish) {
      var style = DETAIL_STYLES[finish];
      if (!style || !faceRef) return;
      var b = polyBounds(poly);
      var span = Math.max(b.w, b.h);
      if (!isFinite(span) || span < 400) return;
      var maxLines = style.max;
      var segs = [];
      var step = style.space;
      var value, i, intervals, k;
      if (style.grid) {
        var nx = Math.floor(b.w / step) + 1;
        var ny = Math.floor(b.h / step) + 1;
        if (nx + ny > maxLines) return;
        for (value = Math.ceil(b.minY / step) * step; value <= b.maxY; value += step) {
          intervals = lineIntervals(poly, 0, value);
          for (k = 0; k < intervals.length; k++) {
            segs.push([{ x: intervals[k][0], y: value, z: z + 2 }, { x: intervals[k][1], y: value, z: z + 2 }]);
          }
        }
        for (value = Math.ceil(b.minX / step) * step; value <= b.maxX; value += step) {
          intervals = lineIntervals(poly, 1, value);
          for (k = 0; k < intervals.length; k++) {
            segs.push([{ x: value, y: intervals[k][0], z: z + 2 }, { x: value, y: intervals[k][1], z: z + 2 }]);
          }
        }
      } else {
        var axis = b.w >= b.h ? 0 : 1; // tablas a lo largo del lado mayor
        var count = Math.floor((axis === 0 ? b.h : b.w) / step);
        if (count > maxLines) return;
        for (value = (axis === 0 ? b.minY : b.minX) + step; value < (axis === 0 ? b.maxY : b.maxX); value += step) {
          intervals = lineIntervals(poly, axis, value);
          for (k = 0; k < intervals.length; k++) {
            if (axis === 0) segs.push([{ x: intervals[k][0], y: value, z: z + 2 }, { x: intervals[k][1], y: value, z: z + 2 }]);
            else segs.push([{ x: value, y: intervals[k][0], z: z + 2 }, { x: value, y: intervals[k][1], z: z + 2 }]);
          }
        }
      }
      if (!segs.length || segs.length > style.max * 2) return;
      faceRef.details = faceRef.details || [];
      for (i = 0; i < segs.length; i++) {
        faceRef.details.push({ a: segs[i][0], b: segs[i][1], color: style.color, lw: style.lw });
      }
    }

    // --- muros ---
    var walls = project.walls || [];
    for (var wi = 0; wi < walls.length; wi++) {
      var wall = walls[wi];
      if (!wall || !wall.a || !wall.b) continue;
      var passW = passByLevel[wall.level];
      if (!passW) continue;
      if (!layerVisible(store, wall.layerId)) continue;
      buildWall(passW, wall);
    }

    function buildWall(pass, wall) {
      var a = wall.a, b = wall.b;
      // Muros curvos: pared continua extruida (sin aberturas en esta versión).
      if (wallIsCurved(wall, G)) {
        buildCurvedWall(pass, wall);
        return;
      }
      var len = dist2(a, b);
      if (!(len > 20)) return;
      var thick = Math.max(30, num(wall.thickness) || num(settings.wallThickness) || 150);
      var height = Math.max(200, num(wall.height) || num(pass.level.height) || num(settings.wallHeight) || 2700);
      var z0 = pass.elevation;
      var z1 = z0 + height;
      var ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      var nx = -uy, ny = ux;
      var half = thick / 2;

      bump(a.x, a.y, z0); bump(a.x, a.y, z1);
      bump(b.x, b.y, z0); bump(b.x, b.y, z1);
      var wp = wallPolygonOf(wall, G);
      for (var wpi = 0; wpi < wp.length; wpi++) { bump(wp[wpi].x, wp[wpi].y, z0); bumpPad(wp[wpi].x, wp[wpi].y); }
      if (pass.maxWallTop < z1) pass.maxWallTop = z1;
      if (!pass.wallBounds) {
        pass.wallBounds = { minX: Math.min(a.x, b.x) - half, minY: Math.min(a.y, b.y) - half, maxX: Math.max(a.x, b.x) + half, maxY: Math.max(a.y, b.y) + half };
      } else {
        var wb = pass.wallBounds;
        wb.minX = Math.min(wb.minX, Math.min(a.x, b.x) - half);
        wb.minY = Math.min(wb.minY, Math.min(a.y, b.y) - half);
        wb.maxX = Math.max(wb.maxX, Math.max(a.x, b.x) + half);
        wb.maxY = Math.max(wb.maxY, Math.max(a.y, b.y) + half);
      }

      function corners(s0, s1, ext0, ext1, halfT) {
        var hh = halfT == null ? half : halfT;
        var x0 = a.x + ux * (s0 - ext0), y0 = a.y + uy * (s0 - ext0);
        var x1 = a.x + ux * (s1 + ext1), y1 = a.y + uy * (s1 + ext1);
        return [
          { x: x0 + nx * hh, y: y0 + ny * hh },
          { x: x1 + nx * hh, y: y1 + ny * hh },
          { x: x1 - nx * hh, y: y1 - ny * hh },
          { x: x0 - nx * hh, y: y0 - ny * hh }
        ];
      }

      // Aberturas ordenadas y unión de huecos.
      var ops = [];
      var openings = wall.openings || [];
      for (var oi = 0; oi < openings.length; oi++) {
        var op = openings[oi];
        if (!op || !op.type) continue;
        var sp = openingSpanOf(wall, op, G);
        var from = clamp(num(sp.from), 0, len);
        var to = clamp(num(sp.to), 0, len);
        if (to - from < 60) continue;
        ops.push({ o: op, from: from, to: to });
      }
      ops.sort(function (p, q) { return p.from - q.from; });
      var union = [];
      for (var ui = 0; ui < ops.length; ui++) {
        var u = ops[ui];
        if (union.length && u.from <= union[union.length - 1].to + 1) {
          if (u.to > union[union.length - 1].to) union[union.length - 1].to = u.to;
        } else {
          union.push({ from: u.from, to: u.to });
        }
      }
      var cursor = 0;
      var solids = [];
      for (var si = 0; si < union.length; si++) {
        if (union[si].from > cursor + 1) solids.push([cursor, union[si].from]);
        if (union[si].to > cursor) cursor = union[si].to;
      }
      if (cursor < len - 1) solids.push([cursor, len]);
      for (var bj = 0; bj < solids.length; bj++) {
        var ss0 = solids[bj][0], ss1 = solids[bj][1];
        var e0 = ss0 <= 0.5 ? half : 0;
        var e1 = ss1 >= len - 0.5 ? half : 0;
        addBox(pass.others, corners(ss0, ss1, e0, e1), z0, z1, cfg.wallColor, cfg.edge, cfg.wallTexture);
      }

      // Aberturas: antepechos, dinteles, marcos, vidrio y hojas.
      for (var ai = 0; ai < ops.length; ai++) {
        var op2 = ops[ai];
        var o = op2.o;
        var type = o.type;
        var from2 = op2.from, to2 = op2.to, wop = to2 - from2;
        var bottom, top;
        if (type === 'window') {
          var sill = Math.max(0, num(o.sill) || 0);
          bottom = z0 + Math.min(sill, height);
          top = Math.min(z1, bottom + Math.max(120, num(o.height) || 1200));
        } else if (type === 'garage') {
          bottom = z0;
          top = Math.min(z1, z0 + Math.max(150, num(o.height) || 2200));
        } else {
          bottom = z0;
          top = Math.min(z1, z0 + Math.max(150, num(o.height) || 2100));
        }
        if (bottom > z0 + 8) {
          addBox(pass.others, corners(from2, to2, 0, 0), z0, Math.min(bottom, z1), cfg.wallColor, cfg.edge, cfg.wallTexture);
        }
        if (top < z1 - 8) {
          addBox(pass.others, corners(from2, to2, 0, 0), Math.max(top, z0), z1, cfg.wallColor, cfg.edge, cfg.wallTexture);
        }

        // Marcos (solo si la escena no es enorme)
        if (wop > 220 && totalFacesNow() < 15000) {
          var tw = Math.min(55, wop * 0.1);
          var trimHalf = half + 12;
          addBox(pass.others, corners(from2 - tw, from2, 0, 0, trimHalf), bottom, top, cfg.trimColor, cfg.edge);
          addBox(pass.others, corners(to2, to2 + tw, 0, 0, trimHalf), bottom, top, cfg.trimColor, cfg.edge);
          addBox(pass.others, corners(from2 - tw, to2 + tw, 0, 0, trimHalf), top, Math.min(top + tw, z1), cfg.trimColor, cfg.edge);
        }

        // Vidrio y montantes
        if (type === 'window') {
          var p0 = { x: a.x + ux * from2, y: a.y + uy * from2 };
          var p1 = { x: a.x + ux * to2, y: a.y + uy * to2 };
          var gpts = [
            { x: p0.x, y: p0.y, z: bottom },
            { x: p1.x, y: p1.y, z: bottom },
            { x: p1.x, y: p1.y, z: top },
            { x: p0.x, y: p0.y, z: top }
          ];
          var glass = face(pass.others, gpts, cfg.glassFill, { fill: cfg.glassFill, stroke: cfg.glassStroke, lw: 0.9, twoSided: true, edge: false });
          if (glass) {
            glass.details = glass.details || [];
            var midx = (p0.x + p1.x) / 2, midy = (p0.y + p1.y) / 2;
            if (wop > 900) {
              glass.details.push({ a: { x: midx, y: midy, z: bottom }, b: { x: midx, y: midy, z: top }, color: 'rgba(246, 249, 249, 0.8)', lw: 1.1 });
            }
            if (top - bottom > 1000) {
              var mz = (bottom + top) / 2;
              glass.details.push({ a: { x: p0.x, y: p0.y, z: mz }, b: { x: p1.x, y: p1.y, z: mz }, color: 'rgba(246, 249, 249, 0.7)', lw: 1 });
            }
            // Reflejo diagonal sutil
            glass.details.push({
              a: { x: p0.x, y: p0.y, z: bottom + (top - bottom) * 0.16 },
              b: { x: p1.x, y: p1.y, z: top - (top - bottom) * 0.04 },
              color: 'rgba(255, 255, 255, 0.30)', lw: 1.2
            });
          }
        } else if (type === 'garage') {
          // Panel de garaje cerrado con nervaduras.
          var q0 = { x: a.x + ux * from2, y: a.y + uy * from2 };
          var q1 = { x: a.x + ux * to2, y: a.y + uy * to2 };
          var panel = face(pass.others, [
            { x: q0.x, y: q0.y, z: bottom + 10 },
            { x: q1.x, y: q1.y, z: bottom + 10 },
            { x: q1.x, y: q1.y, z: top - 10 },
            { x: q0.x, y: q0.y, z: top - 10 }
          ], cfg.garageColor, { edge: cfg.edge });
          if (panel) {
            panel.details = panel.details || [];
            var ribs = Math.min(6, Math.floor((top - bottom) / 350));
            for (var rb = 1; rb <= ribs; rb++) {
              var rz = bottom + (top - bottom) * (rb / (ribs + 1));
              panel.details.push({ a: { x: q0.x, y: q0.y, z: rz }, b: { x: q1.x, y: q1.y, z: rz }, color: 'rgba(120, 112, 98, 0.35)', lw: 1 });
            }
          }
        } else if (type === 'door') {
          // Hoja abierta (detalle de puerta)
          if (totalFacesNow() < 22000) {
            var hingeFrom = (num(o.hinge) || 1) >= 0;
            var hs = hingeFrom ? from2 : to2;
            var hinge = { x: a.x + ux * hs, y: a.y + uy * hs };
            var baseX = hingeFrom ? ux : -ux;
            var baseY = hingeFrom ? uy : -uy;
            var ang = ((num(o.swing) || 1) >= 0 ? 1 : -1) * 66 * DEG;
            var ca = Math.cos(ang), sa = Math.sin(ang);
            var dirx = baseX * ca - baseY * sa;
            var diry = baseX * sa + baseY * ca;
            var leafW = Math.max(200, wop - 80);
            var tip = { x: hinge.x + dirx * leafW, y: hinge.y + diry * leafW };
            var opx = -diry * 22, opy = dirx * 22;
            var leafCorners = [
              { x: hinge.x + opx, y: hinge.y + opy },
              { x: tip.x + opx, y: tip.y + opy },
              { x: tip.x - opx, y: tip.y - opy },
              { x: hinge.x - opx, y: hinge.y - opy }
            ];
            var leafZ0 = Math.min(z1 - 40, z0 + 35);
            var leafZ1 = Math.max(leafZ0 + 60, top - 40);
            addBox(pass.others, leafCorners, leafZ0, leafZ1, cfg.doorColor, EDGE_FURN);
          }
        }
      }

      // Sombra del muro sobre el terreno.
      if (opts.ground) {
        var wpoly = wallPolygonOf(wall, G);
        var shPts = [];
        for (var spi = 0; spi < wpoly.length; spi++) shPts.push({ x: wpoly[spi].x, y: wpoly[spi].y });
        shadow(shPts, z1);
      }
    }

    // Muro curvo (arco o spline): pared continua extruida entre z0 y z1 con
    // caras exteriores/interiores por tramos, tapa superior continua y tapas
    // de extremo. Sin aberturas (el modelo de datos las vacía para curvas).
    function buildCurvedWall(pass, wall) {
      var thick = Math.max(30, num(wall.thickness) || num(settings.wallThickness) || 150);
      var height = Math.max(200, num(wall.height) || num(pass.level.height) || num(settings.wallHeight) || 2700);
      var z0 = pass.elevation;
      var z1 = z0 + height;
      var half = thick / 2;
      var path = wallPathOf(wall, G);
      var pts = [], i;
      for (i = 0; i < path.length; i++) {
        var pp = path[i];
        if (!pp || !isFinite(pp.x) || !isFinite(pp.y)) continue;
        var lastP = pts[pts.length - 1];
        if (lastP && Math.abs(lastP.x - pp.x) < 0.5 && Math.abs(lastP.y - pp.y) < 0.5) continue;
        pts.push({ x: num(pp.x), y: num(pp.y) });
      }
      if (pts.length < 2) {
        // Degenerado: tratar como muro recto mínimo.
        var fb = [
          { x: wall.a.x - half, y: wall.a.y - half }, { x: wall.a.x + half, y: wall.a.y - half },
          { x: wall.a.x + half, y: wall.a.y + half }, { x: wall.a.x - half, y: wall.a.y + half }
        ];
        addBox(pass.others, fb, z0, z1, cfg.wallColor, cfg.edge, cfg.wallTexture);
        bump(wall.a.x, wall.a.y, z0); bump(wall.a.x, wall.a.y, z1);
        bumpPad(wall.a.x, wall.a.y);
        if (pass.maxWallTop < z1) pass.maxWallTop = z1;
        return;
      }

      // Banda de espesor constante: desplaza el eje ± half por su normal suavizada.
      var left = [], right = [];
      for (i = 0; i < pts.length; i++) {
        var prev = pts[i - 1] || pts[i];
        var next = pts[i + 1] || pts[i];
        var tx = next.x - prev.x, ty = next.y - prev.y;
        var tl = Math.sqrt(tx * tx + ty * ty) || 1;
        var sx = -ty / tl, sy = tx / tl;
        var px = pts[i].x, py = pts[i].y;
        if (i === 0) { px -= (tx / tl) * half; py -= (ty / tl) * half; }
        if (i === pts.length - 1) { px += (tx / tl) * half; py += (ty / tl) * half; }
        left.push({ x: px + sx * half, y: py + sy * half });
        right.push({ x: px - sx * half, y: py - sy * half });
      }

      function quadZ(p0, p1, za, zb) {
        return [
          { x: p0.x, y: p0.y, z: za },
          { x: p1.x, y: p1.y, z: za },
          { x: p1.x, y: p1.y, z: zb },
          { x: p0.x, y: p0.y, z: zb }
        ];
      }

      // Caras laterales: exterior (izquierda) e interior (derecha). Sin borde por
      // tramo para que la pared curva se lea continua (solo tapa y extremos).
      for (i = 0; i + 1 < pts.length; i++) {
        var stx = pts[i + 1].x - pts[i].x, sty = pts[i + 1].y - pts[i].y;
        var stl = Math.sqrt(stx * stx + sty * sty) || 1;
        var snx = -sty / stl, sny = stx / stl;
        addFaceOriented(pass.others, quadZ(left[i], left[i + 1], z0, z1), cfg.wallColor,
          { edge: false, tex: cfg.wallTexture }, { x: snx, y: sny, z: 0 });
        addFaceOriented(pass.others, quadZ(right[i], right[i + 1], z0, z1), cfg.wallColor,
          { edge: false, tex: cfg.wallTexture }, { x: -snx, y: -sny, z: 0 });
      }

      // Tapa superior: polígono continuo del anillo (izquierda + derecha inversa).
      var ring = left.concat(right.slice().reverse());
      var capPts = [];
      for (i = 0; i < ring.length; i++) capPts.push({ x: ring[i].x, y: ring[i].y, z: z1 });
      addFaceOriented(pass.others, ensureCCW(capPts), cfg.wallColor,
        { edge: cfg.edge, tex: cfg.wallTexture }, { x: 0, y: 0, z: 1 });

      // Tapas de extremo para cerrar el volumen.
      var t0x = pts[1].x - pts[0].x, t0y = pts[1].y - pts[0].y;
      var t0l = Math.sqrt(t0x * t0x + t0y * t0y) || 1;
      addFaceOriented(pass.others, quadZ(left[0], right[0], z0, z1), cfg.wallColor,
        { edge: cfg.edge, tex: cfg.wallTexture }, { x: -t0x / t0l, y: -t0y / t0l, z: 0 });
      var nPts = pts.length;
      var t1x = pts[nPts - 1].x - pts[nPts - 2].x, t1y = pts[nPts - 1].y - pts[nPts - 2].y;
      var t1l = Math.sqrt(t1x * t1x + t1y * t1y) || 1;
      addFaceOriented(pass.others, quadZ(left[nPts - 1], right[nPts - 1], z0, z1), cfg.wallColor,
        { edge: cfg.edge, tex: cfg.wallTexture }, { x: t1x / t1l, y: t1y / t1l, z: 0 });

      // Cotas de la planta del muro (extremos y muestras del eje).
      bump(wall.a.x, wall.a.y, z0); bump(wall.a.x, wall.a.y, z1);
      bump(wall.b.x, wall.b.y, z0); bump(wall.b.x, wall.b.y, z1);
      var loX = Infinity, loY = Infinity, hiX = -Infinity, hiY = -Infinity;
      for (i = 0; i < pts.length; i++) {
        bump(pts[i].x, pts[i].y, z0);
        bump(pts[i].x, pts[i].y, z1);
        for (var side = 0; side < 2; side++) {
          var q = side === 0 ? left[i] : right[i];
          bump(q.x, q.y, z0); bump(q.x, q.y, z1);
          bumpPad(q.x, q.y);
          if (q.x < loX) loX = q.x;
          if (q.y < loY) loY = q.y;
          if (q.x > hiX) hiX = q.x;
          if (q.y > hiY) hiY = q.y;
        }
      }
      if (pass.maxWallTop < z1) pass.maxWallTop = z1;
      if (isFinite(loX)) {
        if (!pass.wallBounds) {
          pass.wallBounds = { minX: loX, minY: loY, maxX: hiX, maxY: hiY };
        } else {
          var cwb = pass.wallBounds;
          cwb.minX = Math.min(cwb.minX, loX);
          cwb.minY = Math.min(cwb.minY, loY);
          cwb.maxX = Math.max(cwb.maxX, hiX);
          cwb.maxY = Math.max(cwb.maxY, hiY);
        }
      }

      // Sombra sobre el terreno con el contorno curvo (Geo.wallPolygon).
      if (opts.ground && cfg.shadows) {
        var wpoly = wallPolygonOf(wall, G);
        var shPts = [];
        for (i = 0; i < wpoly.length; i++) shPts.push({ x: wpoly[i].x, y: wpoly[i].y });
        if (shPts.length >= 3) shadow(shPts, z1);
      }
    }

    // --- mobiliario ---
    if (opts.furniture) {
      var items = project.items || [];
      for (var ii = 0; ii < items.length; ii++) {
        var item = items[ii];
        if (!item || !passByLevel[item.level]) continue;
        if (!layerVisible(store, item.layerId)) continue;
        var passI = passByLevel[item.level];
        var def = libGet(item.libId);
        var boxes = (def && def.boxes && def.boxes.length) ? def.boxes : fallbackBoxes(item);
        // Tolerancia a definiciones antiguas: aplana arrays anidados y descarta
        // cajas sin volumen útil.
        if (Array.isArray(boxes[0])) {
          var flatBoxes = [];
          for (var fb = 0; fb < boxes.length; fb++) {
            if (Array.isArray(boxes[fb])) flatBoxes = flatBoxes.concat(boxes[fb]);
            else if (boxes[fb]) flatBoxes.push(boxes[fb]);
          }
          boxes = flatBoxes;
        }
        boxes = boxes.filter(function (b) {
          return b && (num(b.w) > 0 && num(b.d) > 0 && num(b.h) > 0);
        });
        var rot = num(item.rotation) || 0;
        var rad = rot * DEG, cosr = Math.cos(rad), sinr = Math.sin(rad);
        var ix = num(item.x), iy = num(item.y);
        var sx = 1, sy = 1, sz = 1;
        if (def && num(def.w) > 0 && num(item.w) > 0) sx = clamp(num(item.w) / num(def.w), 0.45, 2.4);
        if (def && num(def.d) > 0 && num(item.d) > 0) sy = clamp(num(item.d) / num(def.d), 0.45, 2.4);
        if (def && num(def.h) > 0 && num(item.h) > 0) sz = clamp(num(item.h) / num(def.h), 0.45, 2.4);
        var itemColor = (def && def.color) || '#8e99a6';
        // Malla poligonal opcional (def.mesh): cuando la definición de la
        // biblioteca trae caras válidas, la malla sustituye a las cajas como
        // representación 3D (las cajas quedan de respaldo y para la miniatura
        // de planta). Así no se dibuja geometría duplicada.
        var mesh = (def && Array.isArray(def.mesh)) ? def.mesh : null;
        var hasMesh = false;
        if (mesh && mesh.length) {
          for (var mv0 = 0; mv0 < mesh.length; mv0++) {
            var mtest = mesh[mv0];
            var mtestPts = mtest && mtest.points;
            if (!mtestPts || typeof mtestPts.length !== 'number') continue;
            var mn = mtestPts.length;
            if (mn < 3 || mn > MESH_FACE_POINTS_MAX) continue;
            var mvalid = true;
            for (var mv1 = 0; mv1 < mn; mv1++) {
              var mtp = mtestPts[mv1];
              if (!mtp || !isFinite(Number(mtp.x)) || !isFinite(Number(mtp.y)) ||
                !isFinite(Number(mtp.z))) {
                mvalid = false;
                break;
              }
            }
            if (mvalid) { hasMesh = true; break; }
          }
        }
        if (!hasMesh) {
          for (var bi = 0; bi < boxes.length; bi++) {
            var bx = boxes[bi];
            if (!bx) continue;
            var lx = num(bx.x) * sx, ly = num(bx.y) * sy;
            var bw = Math.max(20, num(bx.w) * sx), bd = Math.max(20, num(bx.d) * sy);
            var bz = Math.max(0, num(bx.z) * sz), bh = Math.max(15, num(bx.h) * sz);
            var lx0 = lx, ly0 = ly, lx1 = lx + bw, ly1 = ly + bd;
            var local = [[lx0, ly0], [lx1, ly0], [lx1, ly1], [lx0, ly1]];
            var corners2 = [];
            for (var ci = 0; ci < 4; ci++) {
              var lxp = local[ci][0], lyp = local[ci][1];
              corners2.push({
                x: ix + lxp * cosr - lyp * sinr,
                y: iy + lxp * sinr + lyp * cosr
              });
            }
            var z0i = passI.elevation + bz;
            var z1i = z0i + bh;
            addBox(passI.others, corners2, z0i, z1i, bx.color || itemColor, EDGE_FURN);
            for (var ci2 = 0; ci2 < 4; ci2++) {
              bump(corners2[ci2].x, corners2[ci2].y, z0i);
              bump(corners2[ci2].x, corners2[ci2].y, z1i);
              bumpPad(corners2[ci2].x, corners2[ci2].y);
            }
          }
        }
        // --- caras de la malla ya validada: se transforman con la misma
        // escala/rotación/traslación que las cajas y se añaden como caras lisas
        // (sin arista por defecto) para que el volumen se lea real. ---
        var itemMeshFaces = 0;
        if (mesh && mesh.length) {
          var meshTopZ = passI.elevation;
          for (var mi = 0; mi < mesh.length; mi++) {
            if (itemMeshFaces >= MESH_ITEM_FACE_MAX || meshFaces >= MESH_SCENE_FACE_MAX) break;
            var mf = mesh[mi];
            var mpts = mf && mf.points;
            if (!mpts || typeof mpts.length !== 'number') continue;
            var np = mpts.length;
            if (np < 3 || np > MESH_FACE_POINTS_MAX) continue;
            var worldPts = [], meshOk = true, mpi;
            for (mpi = 0; mpi < np; mpi++) {
              var lp = mpts[mpi];
              if (!lp) { meshOk = false; break; }
              var lpx = Number(lp.x), lpy = Number(lp.y), lpz = Number(lp.z);
              if (!isFinite(lpx) || !isFinite(lpy) || !isFinite(lpz)) { meshOk = false; break; }
              var wx = ix + lpx * sx * cosr - lpy * sy * sinr;
              var wy = iy + lpx * sx * sinr + lpy * sy * cosr;
              var wz = passI.elevation + lpz * sz;
              if (!isFinite(wx) || !isFinite(wy) || !isFinite(wz)) { meshOk = false; break; }
              worldPts.push({ x: wx, y: wy, z: wz });
            }
            if (!meshOk || worldPts.length < 3) continue;
            var mEdge = mf.edge === true ? EDGE_FURN
              : (typeof mf.edge === 'string' && mf.edge ? mf.edge : false);
            addFace(passI.others, worldPts, mf.color || itemColor, {
              edge: mEdge,
              twoSided: mf.twoSided === true,
              tex: cfg.textures ? (mf.tex || null) : null
            });
            itemMeshFaces++;
            meshFaces++;
            for (mpi = 0; mpi < worldPts.length; mpi++) {
              var wp = worldPts[mpi];
              bump(wp.x, wp.y, wp.z);
              bumpPad(wp.x, wp.y);
              if (wp.z > meshTopZ) meshTopZ = wp.z;
            }
          }
          // Sombra de la base con el contorno del ítem (opcional y acotada).
          if (itemMeshFaces > 0 && opts.ground && cfg.shadows &&
            meshShadowCount < MESH_FOOTPRINT_SHADOW_MAX) {
            var fw = num(item.w) || num(def && def.w) || 600;
            var fd = num(item.d) || num(def && def.d) || 600;
            if (fw > 0 && fd > 0) {
              var hw = fw / 2, hd = fd / 2;
              var foot = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
              var footPts = [];
              for (var fi = 0; fi < 4; fi++) {
                var fpx = foot[fi][0], fpy = foot[fi][1];
                footPts.push({
                  x: ix + fpx * cosr - fpy * sinr,
                  y: iy + fpx * sinr + fpy * cosr
                });
              }
              shadow(footPts, Math.max(passI.elevation + 250, meshTopZ));
              meshShadowCount++;
              for (var fbi = 0; fbi < 4; fbi++) bumpPad(footPts[fbi].x, footPts[fbi].y);
            }
          }
        }
      }
    }

    // --- cotas (opcional) ---
    if (opts.dimensions) {
      var dims = project.dims || [];
      for (var di = 0; di < dims.length; di++) {
        var dm = dims[di];
        if (!dm || !dm.a || !dm.b || !passByLevel[dm.level]) continue;
        if (!layerVisible(store, dm.layerId)) continue;
        var passD = passByLevel[dm.level];
        var dlen = dist2(dm.a, dm.b);
        if (dlen < 20) continue;
        var dx = (dm.b.x - dm.a.x) / dlen, dy = (dm.b.y - dm.a.y) / dlen;
        var dnx = -dy, dny = dx;
        var off = num(dm.offset) || 700;
        // Las cotas flotan por encima del nivel para no cruzar los muros.
        var zD = (passD.maxWallTop || (passD.elevation + num(passD.level.height) || 2700)) + 280;
        var a2 = { x: dm.a.x + dnx * off, y: dm.a.y + dny * off };
        var b2 = { x: dm.b.x + dnx * off, y: dm.b.y + dny * off };
        scene.dims.push({
          ax: dm.a.x, ay: dm.a.y, bx: dm.b.x, by: dm.b.y,
          a2x: a2.x, a2y: a2.y, b2x: b2.x, b2y: b2.y,
          z: zD, text: dm.text || formatLengthText(dlen, store.project.settings && store.project.settings.units)
        });
        bump(a2.x, a2.y, zD);
        bump(b2.x, b2.y, zD);
      }
    }

    // --- base bajo cada nivel (losas) ---
    for (var pi2 = 0; pi2 < scene.passes.length; pi2++) {
      var p2 = scene.passes[pi2];
      var sb = p2.wallBounds;
      if (!sb) {
        // sin muros: derivar de ambientes del nivel
        continue;
      }
      // La losa del nivel inferior queda bajo el terreno: no debe pintarse
      // (el pintor por capas la mostraría sobre el terreno).
      if (p2.elevation - 6 <= 2) continue;
      var sbx0 = sb.minX - 30, sby0 = sb.minY - 30, sbx1 = sb.maxX + 30, sby1 = sb.maxY + 30;
      addBox(p2.slabs, [
        { x: sbx0, y: sby0 }, { x: sbx1, y: sby0 }, { x: sbx1, y: sby1 }, { x: sbx0, y: sby1 }
      ], p2.elevation - 140, p2.elevation - 6, cfg.slabColor, EDGE_FLOOR);
      bump(sbx0, sby0, p2.elevation - 140);
      bump(sbx1, sby1, p2.elevation - 6);
    }

    // --- techo según estilo (flat | gable | arc | spline) ---
    buildRoof();

    function buildRoof() {
      if (!opts.roof || !scene.passes.length) return;
      var topPass = scene.passes[scene.passes.length - 1];
      var rb = topPass.wallBounds;
      if (!rb) return;
      var style = cfg.roofStyle;
      var baseZ = topPass.maxWallTop || (topPass.elevation + num(topPass.level.height)) || 2700;
      var rh = clamp(cfg.roofHeight, 150, 8000);
      var ov = clamp(cfg.roofOverhang, 0, 2500);
      var x0 = rb.minX - ov, x1 = rb.maxX + ov, y0 = rb.minY - ov, y1 = rb.maxY + ov;
      var w = x1 - x0, d = y1 - y0;
      if (!(w > 200) || !(d > 200)) return;
      // Cumbrera: 'x' | 'y' | 'auto' (eje largo). Aplica a gable/hip/custom.
      var ridge = cfg.roofRidge || 'auto';
      var alongX;
      if (style === 'gable' || style === 'custom') {
        alongX = ridge === 'x' ? true : (ridge === 'y' ? false : w >= d);
      } else {
        alongX = w >= d;
      }
      var roofCol = cfg.roofColor;
      var roofTex = cfg.roofTexture;
      var edge = EDGE_ROOF;
      var peakZ = baseZ;
      var i;

      // ---- losa plana ----
      if (style === 'flat') {
        var slabH = clamp(Math.round(rh * 0.18), 120, 280);
        addBox(scene.roofFaces, [
          { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }
        ], baseZ, baseZ + slabH, roofCol, edge);
        var capZ = baseZ + slabH + 2;
        var capPts = [
          { x: x0, y: y0, z: capZ }, { x: x1, y: y0, z: capZ },
          { x: x1, y: y1, z: capZ }, { x: x0, y: y1, z: capZ }
        ];
        var roofCap = addFace(scene.roofFaces, ensureCCW(capPts), '#000', { fill: 'rgba(0,0,0,0)', edge: false });
        if (roofCap) {
          roofCap.tex = roofTex;
          roofCap.details = roofCap.details || [];
          var seamStep = 1200, seamColor = 'rgba(96, 88, 72, 0.24)', seamCount = 0;
          for (var sxr = x0 + seamStep; sxr < x1 && seamCount < 40; sxr += seamStep) {
            roofCap.details.push({ a: { x: sxr, y: y0, z: capZ + 1 }, b: { x: sxr, y: y1, z: capZ + 1 }, color: seamColor, lw: 0.8 });
            seamCount++;
          }
          for (var syr = y0 + seamStep; syr < y1 && seamCount < 80; syr += seamStep) {
            roofCap.details.push({ a: { x: x0, y: syr, z: capZ + 1 }, b: { x: x1, y: syr, z: capZ + 1 }, color: seamColor, lw: 0.8 });
            seamCount++;
          }
        }
        peakZ = baseZ + slabH;
        bump(x0, y0, baseZ); bump(x1, y0, baseZ);
        bump(x1, y1, peakZ); bump(x0, y1, peakZ);
        if (cfg.realistic && cfg.shadows) {
          shadow([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], peakZ);
        }
        return;
      }

      // ---- cuatro aguas (hip) / pirámide ----
      if (style === 'hip') {
        buildHipRoof({
          baseZ: baseZ, rh: rh, ov: ov,
          x0: x0, x1: x1, y0: y0, y1: y1, w: w, d: d,
          ridge: ridge, roofCol: roofCol, roofTex: roofTex, edge: edge
        });
        return;
      }

      // ---- perfiles: gable (2 aguas), arc (bóveda), spline (coseno) y custom ----
      var steps = style === 'gable' ? 2 : (style === 'arc' ? 12 : 11);
      var profile = [];
      if (style === 'custom') {
        var customProf = sampleRoofProfile(cfg.roofProfile);
        if (customProf) {
          for (i = 0; i < customProf.length; i++) {
            profile.push({ u: customProf[i].u, z: baseZ + customProf[i].z });
          }
        }
        if (profile.length < 2) {
          // Respaldo improbable (custom ya se validó al resolver la escena).
          profile.push({ u: 0, z: baseZ }, { u: 0.5, z: baseZ + rh }, { u: 1, z: baseZ });
        }
      } else {
        for (i = 0; i <= steps; i++) {
          var u = i / steps;
          var z;
          if (style === 'gable') z = baseZ + rh * (1 - Math.abs(2 * u - 1));
          else if (style === 'arc') z = baseZ + rh * Math.sin(Math.PI * u);
          else z = baseZ + rh * Math.pow(Math.sin(Math.PI * u), 1.55);
          profile.push({ u: u, z: z });
        }
      }
      var longA = alongX ? x0 : y0;
      var longB = alongX ? x1 : y1;
      var crossA = alongX ? y0 : x0;
      var crossB = alongX ? y1 : x1;
      function pt(u2, z2, along) {
        return alongX
          ? { x: along, y: crossA + u2 * (crossB - crossA), z: z2 }
          : { x: crossA + u2 * (crossB - crossA), y: along, z: z2 };
      }
      // Superficie de cubierta por tramos del perfil.
      for (i = 0; i + 1 < profile.length; i++) {
        var pA = profile[i], pB = profile[i + 1];
        var quad = [
          pt(pA.u, pA.z, longA),
          pt(pA.u, pA.z, longB),
          pt(pB.u, pB.z, longB),
          pt(pB.u, pB.z, longA)
        ];
        var du = pB.u - pA.u, dz = pB.z - pA.z;
        var outward = alongX ? { x: 0, y: -dz, z: du } : { x: -dz, y: 0, z: du };
        addFaceOriented(scene.roofFaces, quad, roofCol, { edge: edge, tex: roofTex }, outward);
      }
      // Tapas frontales (hastiales en gable; tapas de bóveda en arc/spline, y
      // sección del perfil en custom).
      var capCol = style === 'gable' ? cfg.wallColor : tintColor(roofCol, 0.06);
      var capTex = style === 'gable' ? cfg.wallTexture : roofTex;
      for (var ci = 0; ci < 2; ci++) {
        var along2 = ci === 0 ? longA : longB;
        var ring = [];
        for (i = 0; i < profile.length; i++) ring.push(pt(profile[i].u, profile[i].z, along2));
        // Perfil custom con extremos elevados: cerrar la sección hasta el alero.
        if (style === 'custom') {
          if (profile[profile.length - 1].z > baseZ + 1) ring.push(pt(1, baseZ, along2));
          if (profile[0].z > baseZ + 1) ring.push(pt(0, baseZ, along2));
        }
        var out2 = alongX
          ? { x: (ci === 0 ? -1 : 1), y: 0, z: 0 }
          : { x: 0, y: (ci === 0 ? -1 : 1), z: 0 };
        addFaceOriented(scene.roofFaces, ring, capCol, { edge: edge, tex: capTex }, out2);
      }
      // Faldón lateral de cierre si el perfil custom arranca por encima del alero.
      if (style === 'custom') {
        for (var vi = 0; vi < 2; vi++) {
          var zEdge = vi === 0 ? profile[0].z : profile[profile.length - 1].z;
          if (zEdge > baseZ + 1) {
            var uV = vi === 0 ? 0 : 1;
            var vq = [
              pt(uV, baseZ, longA), pt(uV, baseZ, longB),
              pt(uV, zEdge, longB), pt(uV, zEdge, longA)
            ];
            var outV = alongX
              ? { x: 0, y: (vi === 0 ? -1 : 1), z: 0 }
              : { x: (vi === 0 ? -1 : 1), y: 0, z: 0 };
            addFaceOriented(scene.roofFaces, vq, tintColor(roofCol, -0.06), { edge: edge, tex: roofTex }, outV);
          }
        }
      }
      // Tabla de alero en los bordes largos (gable, spline y custom).
      if (ov > 80 && style !== 'arc') {
        var fh = clamp(Math.round(rh * 0.09), 70, 170);
        for (var fi = 0; fi < 2; fi++) {
          var uEdge = fi === 0 ? 0 : 1;
          var zE = fi === 0 ? profile[0].z : profile[profile.length - 1].z;
          var e0 = pt(uEdge, zE, longA);
          var e1 = pt(uEdge, zE, longB);
          var fq = [
            { x: e0.x, y: e0.y, z: zE - fh },
            { x: e1.x, y: e1.y, z: zE - fh },
            { x: e1.x, y: e1.y, z: zE },
            { x: e0.x, y: e0.y, z: zE }
          ];
          var out3 = alongX
            ? { x: 0, y: (fi === 0 ? -1 : 1), z: 0 }
            : { x: (fi === 0 ? -1 : 1), y: 0, z: 0 };
          addFaceOriented(scene.roofFaces, fq, cfg.trimColor, { edge: edge }, out3);
        }
      }
      // Altura máxima real del perfil (para cotas de la escena y sombra).
      peakZ = baseZ;
      for (i = 0; i < profile.length; i++) {
        if (profile[i].z > peakZ) peakZ = profile[i].z;
      }
      bump(x0, y0, baseZ); bump(x1, y0, baseZ);
      bump(x1, y1, baseZ); bump(x0, y1, baseZ);
      bump(x0, y1, peakZ); bump(x1, y0, peakZ);
      if (cfg.realistic && cfg.shadows) {
        shadow([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], peakZ * 0.86);
      }
    }

    // Cuatro aguas (hip): cuatro faldones sobre el rectángulo de la planta;
    // cumbrera en el eje largo (o roofRidge 'x'|'y'); si el largo ≈ ancho
    // degenera a pirámide. Alero, color/textura de techo y sombra.
    function buildHipRoof(p) {
      var ridge = p.ridge || 'auto';
      var baseZ = p.baseZ, rh = p.rh, ov = p.ov;
      var x0 = p.x0, x1 = p.x1, y0 = p.y0, y1 = p.y1, w = p.w, d = p.d;
      var roofCol = p.roofCol, roofTex = p.roofTex, edge = p.edge;
      var ridgeAlongX = ridge === 'x' ? true : (ridge === 'y' ? false : w >= d);
      var L = ridgeAlongX ? w : d;
      var S = ridgeAlongX ? d : w;
      var rl = Math.max(0, (L - S) / 2);   // media cumbrera en planta
      var peakZ2 = baseZ + rh;
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      var up = 0.35;
      var rOpts = { edge: edge, tex: roofTex };
      if (rl > 1) {
        if (ridgeAlongX) {
          var rx0 = cx - rl, rx1 = cx + rl, ymid = cy;
          addFaceOriented(scene.roofFaces, [
            { x: x0, y: y0, z: baseZ }, { x: x1, y: y0, z: baseZ },
            { x: rx1, y: ymid, z: peakZ2 }, { x: rx0, y: ymid, z: peakZ2 }
          ], roofCol, rOpts, { x: 0, y: -1, z: up });
          addFaceOriented(scene.roofFaces, [
            { x: x1, y: y1, z: baseZ }, { x: x0, y: y1, z: baseZ },
            { x: rx0, y: ymid, z: peakZ2 }, { x: rx1, y: ymid, z: peakZ2 }
          ], roofCol, rOpts, { x: 0, y: 1, z: up });
          addFaceOriented(scene.roofFaces, [
            { x: x0, y: y0, z: baseZ }, { x: x0, y: y1, z: baseZ },
            { x: rx0, y: ymid, z: peakZ2 }
          ], roofCol, rOpts, { x: -1, y: 0, z: up });
          addFaceOriented(scene.roofFaces, [
            { x: x1, y: y1, z: baseZ }, { x: x1, y: y0, z: baseZ },
            { x: rx1, y: ymid, z: peakZ2 }
          ], roofCol, rOpts, { x: 1, y: 0, z: up });
          bump(rx0, ymid, peakZ2); bump(rx1, ymid, peakZ2);
        } else {
          var ry0 = cy - rl, ry1 = cy + rl, xmid = cx;
          addFaceOriented(scene.roofFaces, [
            { x: x0, y: y0, z: baseZ }, { x: x0, y: y1, z: baseZ },
            { x: xmid, y: ry1, z: peakZ2 }, { x: xmid, y: ry0, z: peakZ2 }
          ], roofCol, rOpts, { x: -1, y: 0, z: up });
          addFaceOriented(scene.roofFaces, [
            { x: x1, y: y1, z: baseZ }, { x: x1, y: y0, z: baseZ },
            { x: xmid, y: ry0, z: peakZ2 }, { x: xmid, y: ry1, z: peakZ2 }
          ], roofCol, rOpts, { x: 1, y: 0, z: up });
          addFaceOriented(scene.roofFaces, [
            { x: x0, y: y0, z: baseZ }, { x: x1, y: y0, z: baseZ },
            { x: xmid, y: ry0, z: peakZ2 }
          ], roofCol, rOpts, { x: 0, y: -1, z: up });
          addFaceOriented(scene.roofFaces, [
            { x: x1, y: y1, z: baseZ }, { x: x0, y: y1, z: baseZ },
            { x: xmid, y: ry1, z: peakZ2 }
          ], roofCol, rOpts, { x: 0, y: 1, z: up });
          bump(xmid, ry0, peakZ2); bump(xmid, ry1, peakZ2);
        }
      } else {
        // Pirámide (planta cuadrada).
        addFaceOriented(scene.roofFaces, [
          { x: x0, y: y0, z: baseZ }, { x: x1, y: y0, z: baseZ }, { x: cx, y: cy, z: peakZ2 }
        ], roofCol, rOpts, { x: 0, y: -1, z: up });
        addFaceOriented(scene.roofFaces, [
          { x: x1, y: y0, z: baseZ }, { x: x1, y: y1, z: baseZ }, { x: cx, y: cy, z: peakZ2 }
        ], roofCol, rOpts, { x: 1, y: 0, z: up });
        addFaceOriented(scene.roofFaces, [
          { x: x1, y: y1, z: baseZ }, { x: x0, y: y1, z: baseZ }, { x: cx, y: cy, z: peakZ2 }
        ], roofCol, rOpts, { x: 0, y: 1, z: up });
        addFaceOriented(scene.roofFaces, [
          { x: x0, y: y1, z: baseZ }, { x: x0, y: y0, z: baseZ }, { x: cx, y: cy, z: peakZ2 }
        ], roofCol, rOpts, { x: -1, y: 0, z: up });
        bump(cx, cy, peakZ2);
      }
      bump(x0, y0, baseZ); bump(x1, y0, baseZ);
      bump(x1, y1, baseZ); bump(x0, y1, baseZ);
      bump(cx, cy, peakZ2);
      // Alero: tabla en los cuatro bordes.
      if (ov > 80) {
        var fh2 = clamp(Math.round(rh * 0.09), 70, 170);
        var zf = baseZ - fh2;
        addFaceOriented(scene.roofFaces, [
          { x: x0, y: y0, z: zf }, { x: x1, y: y0, z: zf },
          { x: x1, y: y0, z: baseZ }, { x: x0, y: y0, z: baseZ }
        ], cfg.trimColor, { edge: edge }, { x: 0, y: -1, z: 0 });
        addFaceOriented(scene.roofFaces, [
          { x: x1, y: y1, z: zf }, { x: x0, y: y1, z: zf },
          { x: x0, y: y1, z: baseZ }, { x: x1, y: y1, z: baseZ }
        ], cfg.trimColor, { edge: edge }, { x: 0, y: 1, z: 0 });
        addFaceOriented(scene.roofFaces, [
          { x: x0, y: y1, z: zf }, { x: x0, y: y0, z: zf },
          { x: x0, y: y0, z: baseZ }, { x: x0, y: y1, z: baseZ }
        ], cfg.trimColor, { edge: edge }, { x: -1, y: 0, z: 0 });
        addFaceOriented(scene.roofFaces, [
          { x: x1, y: y0, z: zf }, { x: x1, y: y1, z: zf },
          { x: x1, y: y1, z: baseZ }, { x: x1, y: y0, z: baseZ }
        ], cfg.trimColor, { edge: edge }, { x: 1, y: 0, z: 0 });
      }
      if (cfg.realistic && cfg.shadows) {
        shadow([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], peakZ2 * 0.86);
      }
    }

    // --- terreno, base y rejilla ---
    if (!isFinite(bmin.x)) {
      bmin = { x: -4000, y: -4000, z: 0 };
      bmax = { x: 4000, y: 4000, z: 2800 };
    }
    scene.bounds = {
      minX: bmin.x - 500, minY: bmin.y - 500,
      maxX: bmax.x + 500, maxY: bmax.y + 500,
      minZ: Math.min(bmin.z, 0), maxZ: bmax.z
    };
    var bc = { x: (scene.bounds.minX + scene.bounds.maxX) / 2, y: (scene.bounds.minY + scene.bounds.maxY) / 2 };
    scene.groundCenter = { x: bc.x, y: bc.y, z: 0 };

    var span = Math.max(bmax.x - bmin.x, bmax.y - bmin.y, 2000);
    var diag = Math.sqrt((bmax.x - bmin.x) * (bmax.x - bmin.x) + (bmax.y - bmin.y) * (bmax.y - bmin.y));
    // Base circular tipo maqueta: deja ver el cielo alrededor.
    var groundRadius = Math.max(12000, diag * 0.78 + 4800);
    var gq = [], groundSegments = 72;
    for (var gsi = 0; gsi < groundSegments; gsi++) {
      var gang = (gsi / groundSegments) * TAU;
      gq.push({ x: bc.x + Math.cos(gang) * groundRadius, y: bc.y + Math.sin(gang) * groundRadius, z: 0 });
    }
    scene.groundFace = addFace([], gq, cfg.groundColor, { edge: false });
    if (scene.groundFace && cfg.textures && cfg.groundTexture !== 'smooth') {
      scene.groundFace.tex = cfg.groundTexture;
    }
    scene.groundRadius = groundRadius;

    // Base/podio
    if (padFound) {
      var padIn = 900;
      var px0 = padMin.x - padIn, py0 = padMin.y - padIn, px1 = padMax.x + padIn, py1 = padMax.y + padIn;
      var pc = [{ x: px0, y: py0 }, { x: px1, y: py0 }, { x: px1, y: py1 }, { x: px0, y: py1 }];
      var pcCcw = ensureCCW(pc);
      var z0p = -70, z1p = 3;
      for (var pci = 0; pci < pcCcw.length; pci++) {
        var pp = pcCcw[pci], pq = pcCcw[(pci + 1) % pcCcw.length];
        scene.padFaces.push(addFace([], [
          { x: pp.x, y: pp.y, z: z0p }, { x: pq.x, y: pq.y, z: z0p },
          { x: pq.x, y: pq.y, z: z1p }, { x: pp.x, y: pp.y, z: z1p }
        ], cfg.padSideColor, { edge: false }));
      }
      var padTop = addFace([], [
        { x: px0, y: py0, z: z1p }, { x: px1, y: py0, z: z1p },
        { x: px1, y: py1, z: z1p }, { x: px0, y: py1, z: z1p }
      ], cfg.padTopColor, { edge: 'rgba(120, 116, 104, 0.16)' });
      if (padTop) {
        scene.padFaces.push(padTop);
        if (cfg.realistic && cfg.textures) padTop.tex = 'paving';
      }
    }

    // Rejilla (se recorta contra el disco del terreno al dibujar)
    var gridStep = Math.max(500, Math.ceil((span / 17) / 500) * 500);
    var gExtent = groundRadius * 0.99;
    var gridColor = 'rgba(88, 100, 105, 0.09)';
    var gx0 = bc.x - gExtent, gx1 = bc.x + gExtent;
    var gy0 = bc.y - gExtent, gy1 = bc.y + gExtent;
    var gCount = 0;
    for (var gx = Math.ceil(gx0 / gridStep) * gridStep; gx <= gx1 && gCount < 200; gx += gridStep) {
      scene.gridLines.push({ a: { x: gx, y: gy0, z: 1 }, b: { x: gx, y: gy1, z: 1 }, color: gridColor });
      gCount++;
    }
    for (var gy = Math.ceil(gy0 / gridStep) * gridStep; gy <= gy1 && gCount < 400; gy += gridStep) {
      scene.gridLines.push({ a: { x: gx0, y: gy, z: 1 }, b: { x: gx1, y: gy, z: 1 }, color: gridColor });
      gCount++;
    }

    // Cap de etiquetas por nivel: prioriza ambientes grandes.
    for (var lpi = 0; lpi < scene.passes.length; lpi++) {
      var lpLabels = scene.passes[lpi].labels;
      lpLabels.sort(function (a, b) { return b.radius - a.radius; });
      if (lpLabels.length > MAX_LABELS) lpLabels.length = MAX_LABELS;
    }

    scene.roomCount = roomCount;
    scene.wallCount = walls.length;
    var totalFaces = 0;
    for (var tpi = 0; tpi < scene.passes.length; tpi++) {
      totalFaces += scene.passes[tpi].slabs.length + scene.passes[tpi].floors.length + scene.passes[tpi].others.length;
    }
    totalFaces += scene.padFaces.length + scene.shadowFaces.length + scene.gridLines.length + scene.roofFaces.length + (scene.groundFace ? 1 : 0);
    scene.faceTotal = totalFaces;
    return scene;
  };

  ED.View3D = View3D;
})(window.EngDraft = window.EngDraft || {});

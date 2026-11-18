/* EngDraft — Vista 3D propia sobre Canvas 2D.
 * Proyección en perspectiva, algoritmo del pintor, iluminación plana por normales.
 * Mundo en milímetros: X = este, Y = norte, Z = arriba. Sin dependencias externas.
 *
 * API:
 *   var view = new ED.View3D(canvas, { store });   // store opcional
 *   view.setStore(store)
 *   view.setOptions({ roof, furniture, labels, dimensions, ground, levels })
 *   view.setLevelFilter('all' | 'active' | levelId)
 *   view.setPreset('iso' | 'top' | 'front' | 'right')
 *   view.fit() / render() / resize()
 *   view.screenshot(scaleOpcional) -> dataURL PNG
 *   view.destroy()
 */
(function (ED) {
  'use strict';

  var DEG = Math.PI / 180;
  var TAU = Math.PI * 2;
  var FOV = 42 * DEG;          // campo visual vertical
  var NEAR = 60;               // plano cercano (mm)
  var MAX_LABELS = 90;

  // Luz direccional (desde el noreste, alta). Usada para sombrear caras.
  var LIGHT = { x: 0.34, y: 0.52, z: 0.78 };

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
    var f = 0.89 + 0.17 * (d > 0 ? d : 0);
    if (n.z > 0.5) f += 0.04;
    else if (n.z < -0.5) f *= 0.78;
    f = clamp(f, 0.3, 1.04);
    // Eleva las caras en sombra hacia el blanco: blancos cálidos de maqueta.
    var lift = Math.max(0, 0.28 * (1 - f));
    var r = Math.round(clamp(c[0] * f + 255 * lift, 0, 255));
    var g = Math.round(clamp(c[1] * f + 254 * lift, 0, 255));
    var b = Math.round(clamp(c[2] * f + 251 * lift, 0, 255));
    if (alpha == null || alpha >= 1) return 'rgb(' + r + ',' + g + ',' + b + ')';
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
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

  function openingSpanOf(wall, opening, G) {
    if (G && typeof G.openingSpan === 'function') {
      try {
        var s = G.openingSpan(wall, opening);
        return { from: num(s.from), to: num(s.to) };
      } catch (e) { /* respaldo */ }
    }
    return fbOpeningSpan(wall, opening);
  }

  function formatAreaText(mm2) {
    var G = ED && ED.Geo;
    if (G && typeof G.formatArea === 'function') {
      try { return G.formatArea(mm2); } catch (e) { /* respaldo */ }
    }
    return (mm2 / 1e6).toFixed(2) + ' m²';
  }

  function formatLengthText(mm) {
    var G = ED && ED.Geo;
    if (G && typeof G.formatLength === 'function') {
      try { return G.formatLength(mm, 'm'); } catch (e) { /* respaldo */ }
    }
    return (mm / 1000).toFixed(2) + ' m';
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
      px: new Float64Array(count),
      py: new Float64Array(count),
      pn: 0,
      depth: 0
    };
    list.push(f);
    return f;
  }

  function addBox(list, corners, z0, z1, color, edge) {
    var ccw = ensureCCW(corners);
    var n = ccw.length;
    var top = [], bottom = [], i, p;
    for (i = 0; i < n; i++) top.push({ x: ccw[i].x, y: ccw[i].y, z: z1 });
    for (i = n - 1; i >= 0; i--) bottom.push({ x: ccw[i].x, y: ccw[i].y, z: z0 });
    addFace(list, top, color, { edge: edge });
    addFace(list, bottom, color, { edge: edge });
    for (i = 0; i < n; i++) {
      p = ccw[i];
      var q = ccw[(i + 1) % n];
      addFace(list, [
        { x: p.x, y: p.y, z: z0 },
        { x: q.x, y: q.y, z: z0 },
        { x: q.x, y: q.y, z: z1 },
        { x: p.x, y: p.y, z: z1 }
      ], color, { edge: edge });
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
      wallsCut: false
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
    this.invalidate();
    this._requestRender();
    return this;
  };

  View3D.prototype.getOptions = function () {
    var o = this.options;
    return {
      roof: o.roof, furniture: o.furniture, labels: o.labels, dimensions: o.dimensions,
      ground: o.ground, levels: o.levels, wallsCut: o.wallsCut
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
    if (f.details && f.details.length) this._paintDetails(ctx, f.details);
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

  View3D.prototype._drawSky = function (ctx, w, h) {
    if (!this._sky) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#dfe9ee');
      g.addColorStop(0.5, '#e6edef');
      g.addColorStop(1, '#f4f1e8');
      this._sky = g;
    }
    ctx.fillStyle = this._sky;
    ctx.fillRect(0, 0, w, h);
    var glow = ctx.createRadialGradient(w * 0.78, h * 0.1, 0, w * 0.78, h * 0.1, Math.max(w, h) * 0.62);
    glow.addColorStop(0, 'rgba(255, 250, 232, 0.55)');
    glow.addColorStop(1, 'rgba(255, 250, 232, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
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
          rg.addColorStop(0, 'rgba(255, 255, 250, 0.30)');
          rg.addColorStop(0.6, 'rgba(255, 255, 250, 0.10)');
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

  View3D.prototype._buildScene = function () {
    var store = this.store;
    var opts = this.options;
    var G = (ED && ED.Geo) || null;
    var project = store && store.project;
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
    var settings = (project && project.settings) || {};

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
      if (!opts.ground || shadowCount >= SHADOW_MAX) return;
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
      scene.shadowFaces.push(addFace([], farPts, '#000', { fill: 'rgba(62, 74, 86, 0.016)', edge: false, twoSided: true }));
      scene.shadowFaces.push(addFace([], midPts, '#000', { fill: 'rgba(62, 74, 86, 0.026)', edge: false, twoSided: true }));
      scene.shadowFaces.push(addFace([], poly, '#000', { fill: 'rgba(62, 74, 86, 0.042)', edge: false, twoSided: true }));
      // Contacto suave bajo el volumen (oclusión ambiental).
      var contact = expandPoly(poly, 1.02);
      var contactPts = [];
      for (i = 0; i < contact.length; i++) contactPts.push({ x: contact[i].x, y: contact[i].y, z: 4 });
      scene.shadowFaces.push(addFace([], contactPts, '#000', { fill: 'rgba(58, 68, 78, 0.018)', edge: false, twoSided: true }));
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
      addFloorDetails(floorFace, poly, floorZ, finish);
      roomCount++;

      // etiqueta: nombre + área
      var area = polyArea(poly);
      if (area > 250000 && room.name) {
        var cen = polyCentroid2(poly);
        var radius = Math.sqrt(area) * 0.5;
        passR.labels.push({
          x: cen.x, y: cen.y, z: floorZ + 1450,
          name: String(room.name), areaText: formatAreaText(area), radius: radius
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
        addBox(pass.others, corners(ss0, ss1, e0, e1), z0, z1, WALL_COLOR, EDGE_SOLID);
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
          addBox(pass.others, corners(from2, to2, 0, 0), z0, Math.min(bottom, z1), WALL_COLOR, EDGE_SOLID);
        }
        if (top < z1 - 8) {
          addBox(pass.others, corners(from2, to2, 0, 0), Math.max(top, z0), z1, WALL_COLOR, EDGE_SOLID);
        }

        // Marcos (solo si la escena no es enorme)
        if (wop > 220 && totalFacesNow() < 15000) {
          var tw = Math.min(55, wop * 0.1);
          var trimHalf = half + 12;
          addBox(pass.others, corners(from2 - tw, from2, 0, 0, trimHalf), bottom, top, TRIM_COLOR, EDGE_SOLID);
          addBox(pass.others, corners(to2, to2 + tw, 0, 0, trimHalf), bottom, top, TRIM_COLOR, EDGE_SOLID);
          addBox(pass.others, corners(from2 - tw, to2 + tw, 0, 0, trimHalf), top, Math.min(top + tw, z1), TRIM_COLOR, EDGE_SOLID);
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
          var glass = face(pass.others, gpts, GLASS_FILL, { fill: GLASS_FILL, stroke: GLASS_STROKE, lw: 0.9, twoSided: true, edge: false });
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
          ], '#cfc8b9', { edge: EDGE_SOLID });
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
            addBox(pass.others, leafCorners, leafZ0, leafZ1, DOOR_COLOR, EDGE_FURN);
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
        var rot = num(item.rotation) || 0;
        var rad = rot * DEG, cosr = Math.cos(rad), sinr = Math.sin(rad);
        var ix = num(item.x), iy = num(item.y);
        var sx = 1, sy = 1, sz = 1;
        if (def && num(def.w) > 0 && num(item.w) > 0) sx = clamp(num(item.w) / num(def.w), 0.45, 2.4);
        if (def && num(def.d) > 0 && num(item.d) > 0) sy = clamp(num(item.d) / num(def.d), 0.45, 2.4);
        if (def && num(def.h) > 0 && num(item.h) > 0) sz = clamp(num(item.h) / num(def.h), 0.45, 2.4);
        var itemColor = (def && def.color) || '#8e99a6';
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
          z: zD, text: dm.text || formatLengthText(dlen)
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
      var sbx0 = sb.minX - 30, sby0 = sb.minY - 30, sbx1 = sb.maxX + 30, sby1 = sb.maxY + 30;
      addBox(p2.slabs, [
        { x: sbx0, y: sby0 }, { x: sbx1, y: sby0 }, { x: sbx1, y: sby1 }, { x: sbx0, y: sby1 }
      ], p2.elevation - 140, p2.elevation - 6, '#e6e0d3', EDGE_FLOOR);
      bump(sbx0, sby0, p2.elevation - 140);
      bump(sbx1, sby1, p2.elevation - 6);
    }

    // --- techo plano opcional ---
    if (opts.roof && scene.passes.length) {
      var topPass = scene.passes[scene.passes.length - 1];
      var rb = topPass.wallBounds;
      if (rb) {
        var ov = clamp((rb.maxX - rb.minX) * 0.05, 260, 700);
        var roofZ = topPass.maxWallTop || (topPass.elevation + num(topPass.level.height) || 2700);
        var rr = [
          { x: rb.minX - ov, y: rb.minY - ov },
          { x: rb.maxX + ov, y: rb.minY - ov },
          { x: rb.maxX + ov, y: rb.maxY + ov },
          { x: rb.minX - ov, y: rb.maxY + ov }
        ];
        addBox(scene.roofFaces, rr, roofZ, roofZ + 260, '#d9d2c2', EDGE_ROOF);
        // Juntas de la membrana del techo (detalle sutil en planta).
        var capPts = [
          { x: rr[0].x, y: rr[0].y, z: roofZ + 261 }, { x: rr[1].x, y: rr[1].y, z: roofZ + 261 },
          { x: rr[2].x, y: rr[2].y, z: roofZ + 261 }, { x: rr[3].x, y: rr[3].y, z: roofZ + 261 }
        ];
        var roofCap = addFace(scene.roofFaces, capPts, '#000', { fill: 'rgba(0,0,0,0)', edge: false });
        var seamStep = 1200, seamColor = 'rgba(96, 88, 72, 0.24)', roofZc = roofZ + 262;
        var seamCount = 0;
        if (roofCap) {
          roofCap.details = roofCap.details || [];
          for (var sxr = rr[0].x + seamStep; sxr < rr[1].x && seamCount < 40; sxr += seamStep) {
            roofCap.details.push({ a: { x: sxr, y: rr[0].y, z: roofZc }, b: { x: sxr, y: rr[3].y, z: roofZc }, color: seamColor, lw: 0.8 });
            seamCount++;
          }
          for (var syr = rr[0].y + seamStep; syr < rr[3].y && seamCount < 80; syr += seamStep) {
            roofCap.details.push({ a: { x: rr[0].x, y: syr, z: roofZc }, b: { x: rr[1].x, y: syr, z: roofZc }, color: seamColor, lw: 0.8 });
            seamCount++;
          }
        }
        for (var rk = 0; rk < rr.length; rk++) {
          bump(rr[rk].x, rr[rk].y, roofZ);
          bump(rr[rk].x, rr[rk].y, roofZ + 260);
        }
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
    scene.groundFace = addFace([], gq, '#e4dfd1', { edge: false });
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
        ], '#ded8ca', { edge: false }));
      }
      scene.padFaces.push(addFace([], [
        { x: px0, y: py0, z: z1p }, { x: px1, y: py0, z: z1p },
        { x: px1, y: py1, z: z1p }, { x: px0, y: py1, z: z1p }
      ], '#efeade', { edge: 'rgba(120, 116, 104, 0.16)' }));
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

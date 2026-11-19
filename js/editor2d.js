/* EngDraft — editor de planta 2D */
(function (ED) {
  'use strict';

  var Geo = ED.Geo;
  var C = {
    paper: '#f8f6f0',
    gridMinor: 'rgba(36, 49, 61, 0.052)',
    gridMajor: 'rgba(36, 49, 61, 0.115)',
    gridFine: 'rgba(36, 49, 61, 0.028)',
    axis: 'rgba(46, 125, 143, 0.22)',
    wall: '#303b46',
    wallEdge: '#141d26',
    wallSelected: '#f5a623',
    wallHover: 'rgba(72, 201, 216, 0.13)',
    roomStroke: 'rgba(58, 82, 74, 0.32)',
    roomText: '#34443e',
    roomSub: '#6d7d77',
    itemStroke: '#556270',
    itemDefault: '#dce3ea',
    opening: '#2e7d8f',
    openingSoft: 'rgba(46, 125, 143, 0.12)',
    window: '#4f9aaa',
    windowFill: 'rgba(126, 199, 212, 0.28)',
    dim: '#b5651d',
    dimSoft: 'rgba(181, 101, 29, 0.35)',
    text: '#1f2937',
    selection: '#f5a623',
    hover: '#48c9d8',
    handle: '#ffffff',
    hud: 'rgba(20, 29, 38, 0.88)',
    hudText: '#f4f7fa',
    danger: '#e05b4d'
  };

  var FINISH_COLORS = {
    wood: '#eadcc1', tile: '#dce8e8', carpet: '#e6dfd0',
    concrete: '#e2e3df', marble: '#e9ecec', grass: '#dce8d4'
  };

  var DEFAULT_ROOM_COLORS = [
    '#e7dfcc', '#dbe8e5', '#e9e0cf', '#dfe3e8', '#e8e3d8', '#dce9dd'
  ];

  function call(fn, args) {
    if (typeof fn !== 'function') return;
    try { fn.apply(null, args || []); } catch (err) { console.error('[EngDraft editor]', err); }
  }

  function Editor2D(canvas, store, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.store = store;
    this.callbacks = callbacks || {};
    this.view = { x: 0, y: 0, zoom: 0.055 };
    this.tool = 'select';
    this.furnitureId = null;
    this.furnitureRotation = 0;
    this.snap = {
      grid: true, snapping: true, ortho: false,
      gridSize: 250, gridMajor: 4, gridOriginX: 0, gridOriginY: 0,
      snapStep: 0, gridAdaptive: true, gridStyle: 'lines', showAxes: true
    };
    this.mouse = { sx: 0, sy: 0, inside: false };
    this.cursor = { x: 0, y: 0 };
    this.snapInfo = null;
    this.hover = null;
    this.drawing = null;
    this.drag = null;
    this.pan = null;
    this.marquee = null;
    this.spaceDown = false;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this._raf = null;
    this._destroyed = false;
    this._resizeObserver = null;
    this._bind();
    this._observeResize();
    this._resize();
    this.fitToContent();
  }

  Editor2D.prototype._units = function () {
    return (this.store.project.settings && this.store.project.settings.units) || 'm';
  };

  Editor2D.prototype._emitStatus = function () {
    var text = this.statusText();
    call(this.callbacks.onStatus, [text]);
  };

  Editor2D.prototype.statusText = function () {
    switch (this.tool) {
      case 'wall': return this.drawing ? 'Clic para fijar el siguiente punto · Esc para terminar' : 'Clic para iniciar un muro · Esc para salir';
      case 'wallArc':
        if (!this.drawing) return 'Muro en arco: clic en el inicio del arco';
        if (this.drawing.phase === 'end') return 'Clic en el final del arco · Esc cancela';
        return 'Mueve el cursor para dar curvatura y haz clic para fijar el arco · Esc cancela';
      case 'wallSpline': return this.drawing ? 'Clic para añadir puntos de la spline (mín. 2) · Enter o doble clic para terminar · Esc cancela' : 'Muro spline: clic en el inicio';
      case 'door': return 'Clic sobre un muro para insertar una puerta';
      case 'window': return 'Clic sobre un muro para insertar una ventana';
      case 'furniture': return 'Clic para colocar · R para rotar · Esc para salir';
      case 'room': return 'Clic dentro de un recinto cerrado para crear un ambiente';
      case 'text': return 'Clic para ubicar el texto';
      case 'dim': return this.drawing ? 'Clic en el segundo punto de la cota' : 'Clic en el primer punto de la cota';
      case 'erase': return 'Clic sobre el objeto que deseas eliminar';
      case 'pan': return 'Arrastra para desplazar la vista';
      default: return 'Selecciona un objeto · arrastra para mover · doble clic en un muro para editarlo';
    }
  };

  Editor2D.prototype._bind = function () {
    var self = this;
    this._onDown = function (e) { self._pointerDown(e); };
    this._onMove = function (e) { self._pointerMove(e); };
    this._onUp = function (e) { self._pointerUp(e); };
    this._onWheel = function (e) { self._wheel(e); };
    this._onDbl = function (e) { self._dblClick(e); };
    this._onCtx = function (e) { e.preventDefault(); self._finishDraw(true); };
    this._onKeyDown = function (e) { self._keyDown(e); };
    this._onKeyUp = function (e) { self._keyUp(e); };
    this._onBlur = function () { self.spaceDown = false; self.canvas.style.cursor = ''; };
    this._onLeave = function () { self.mouse.inside = false; self.hover = null; self.requestRender(); };

    this.canvas.addEventListener('pointerdown', this._onDown);
    this.canvas.addEventListener('pointermove', this._onMove);
    this.canvas.addEventListener('pointerup', this._onUp);
    this.canvas.addEventListener('pointercancel', this._onUp);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
    this.canvas.addEventListener('dblclick', this._onDbl);
    this.canvas.addEventListener('contextmenu', this._onCtx);
    this.canvas.addEventListener('pointerleave', this._onLeave);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  };

  Editor2D.prototype._observeResize = function () {
    var self = this;
    if (typeof ResizeObserver === 'function') {
      this._resizeObserver = new ResizeObserver(function () {
        self._resize();
        self.render();
      });
      this._resizeObserver.observe(this.canvas.parentElement || this.canvas);
    } else {
      this._resizeFallback = function () { self._resize(); self.render(); };
      window.addEventListener('resize', this._resizeFallback);
    }
  };

  Editor2D.prototype._resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.dpr = dpr;
    var pw = Math.round(this.w * dpr), ph = Math.round(this.h * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
  };

  Editor2D.prototype.setTool = function (tool) {
    this.drawing = null;
    this.drag = null;
    this.marquee = null;
    this.tool = tool || 'select';
    if (this.tool !== 'furniture') this.furnitureId = null;
    this._updateCursorStyle();
    this._emitStatus();
    this.requestRender();
  };

  Editor2D.prototype.setFurniture = function (libId) {
    this.furnitureId = libId;
    this.tool = 'furniture';
    this.drawing = null;
    this._updateCursorStyle();
    this._emitStatus();
    this.requestRender();
  };

  Editor2D.prototype.setFurnitureRotation = function (deg) {
    this.furnitureRotation = Geo.normDeg(deg);
    this.requestRender();
  };

  Editor2D.prototype.setLevel = function (levelId) {
    if (levelId && levelId !== this.store.activeLevel) this.store.setActiveLevel(levelId);
    this.requestRender();
  };

  Editor2D.prototype.setSnap = function (patch) {
    if (!patch) return;
    for (var k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      if (k === 'gridOrigin') {
        var o = patch.gridOrigin;
        if (o && typeof o === 'object') {
          this.snap.gridOriginX = isFinite(Number(o.x)) ? Number(o.x) : 0;
          this.snap.gridOriginY = isFinite(Number(o.y)) ? Number(o.y) : 0;
        }
      } else {
        this.snap[k] = patch[k];
      }
    }
    this.requestRender();
  };

  // Rejilla saneada: espaciado menor, líneas maestras, origen y paso de ajuste.
  // Si algún valor llega inválido (0, NaN, negativo) se usa un valor seguro.
  Editor2D.prototype._gridConfig = function () {
    var s = this.snap || {};
    var size = Number(s.gridSize);
    if (!isFinite(size) || size <= 0) size = 250;
    size = Geo.clamp(size, 1, 100000);
    var step = Number(s.snapStep);
    if (!isFinite(step) || step <= 0) step = size;
    step = Geo.clamp(step, 0.5, 100000);
    var major = Math.round(Number(s.gridMajor));
    if (!isFinite(major) || major < 2) major = 4;
    major = Geo.clamp(major, 2, 50);
    var ox = Number(s.gridOriginX);
    if (!isFinite(ox)) ox = 0;
    var oy = Number(s.gridOriginY);
    if (!isFinite(oy)) oy = 0;
    ox = Geo.clamp(ox, -1e7, 1e7);
    oy = Geo.clamp(oy, -1e7, 1e7);
    return {
      size: size, step: step, major: major, ox: ox, oy: oy,
      style: s.gridStyle === 'dots' ? 'dots' : 'lines',
      adaptive: s.gridAdaptive !== false,
      axes: s.showAxes !== false
    };
  };

  function gridAxis(value, origin, step) {
    var t = (value - origin) / step;
    if (!isFinite(t)) return value;
    return origin + Math.round(t) * step;
  }

  // Espaciado realmente dibujado (puede doblarse al alejar para no saturar).
  Editor2D.prototype._effectiveGridSize = function (g) {
    g = g || this._gridConfig();
    var size = g.size;
    if (g.adaptive) {
      var guard = 0;
      while (size * this.view.zoom < 8 && guard++ < 20) size *= 2;
    }
    return size;
  };

  Editor2D.prototype.getGridInfo = function () {
    var g = this._gridConfig();
    return {
      size: g.size,
      major: g.major,
      step: g.step,
      effectiveSize: this._effectiveGridSize(g),
      origin: { x: g.ox, y: g.oy },
      style: g.style,
      adaptive: g.adaptive,
      axes: g.axes
    };
  };

  Editor2D.prototype._updateCursorStyle = function () {
    if (this.pan) this.canvas.style.cursor = 'grabbing';
    else if (this.spaceDown || this.tool === 'pan') this.canvas.style.cursor = 'grab';
    else if (this.tool === 'select') this.canvas.style.cursor = 'default';
    else if (this.tool === 'erase') this.canvas.style.cursor = 'not-allowed';
    else this.canvas.style.cursor = 'crosshair';
  };

  Editor2D.prototype._resizeIfNeeded = function () {
    var rect = this.canvas.getBoundingClientRect();
    if (Math.round(rect.width) !== this.w || Math.round(rect.height) !== this.h) this._resize();
  };

  // ---------------------------------------------------------------- coordenadas
  Editor2D.prototype.screenToWorld = function (sx, sy) {
    return {
      x: this.view.x + (sx - this.w / 2) / this.view.zoom,
      y: this.view.y - (sy - this.h / 2) / this.view.zoom
    };
  };

  Editor2D.prototype.worldToScreen = function (p) {
    return {
      x: (p.x - this.view.x) * this.view.zoom + this.w / 2,
      y: this.h / 2 - (p.y - this.view.y) * this.view.zoom
    };
  };

  Editor2D.prototype._eventPoint = function (e) {
    var r = this.canvas.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  Editor2D.prototype._capturePointer = function (e) {
    try {
      if (this.canvas.setPointerCapture && e && e.pointerId != null) this.canvas.setPointerCapture(e.pointerId);
    } catch (err) { /* los eventos sintéticos no tienen puntero activo */ }
  };

  Editor2D.prototype.getCursor = function () {
    return { x: this.cursor.x, y: this.cursor.y };
  };

  Editor2D.prototype.fitToContent = function () {
    var all = [];
    var level = this.store.activeLevel;
    (this.store.project.walls || []).forEach(function (w) {
      if (w.level === level) {
        var poly = Geo.wallPolygon(w, true);
        for (var i = 0; i < poly.length; i++) all.push(poly[i]);
      }
    });
    (this.store.project.rooms || []).forEach(function (r) {
      if (r.level === level) all = all.concat(r.polygon);
    });
    (this.store.project.items || []).forEach(function (it) {
      if (it.level === level) {
        all.push({ x: it.x - it.w / 2, y: it.y - it.d / 2 });
        all.push({ x: it.x + it.w / 2, y: it.y + it.d / 2 });
      }
    });
    (this.store.project.texts || []).forEach(function (t) {
      if (t.level === level) all.push({ x: t.x, y: t.y });
    });
    if (!all.length) {
      this.view.x = 0; this.view.y = 0; this.view.zoom = 0.055;
      this.requestRender();
      return;
    }
    var b = Geo.bounds(all);
    var padW = Math.max(1000, b.w * 0.12);
    var padH = Math.max(1000, b.h * 0.12);
    var availW = Math.max(100, this.w - 150);
    var availH = Math.max(100, this.h - 150);
    var zoom = Math.min(availW / (b.w + padW * 2), availH / (b.h + padH * 2));
    this.view.zoom = Geo.clamp(zoom, 0.002, 0.8);
    this.view.x = (b.minX + b.maxX) / 2;
    this.view.y = (b.minY + b.maxY) / 2;
    this.requestRender();
  };

  Editor2D.prototype.zoomBy = function (factor) {
    var center = { x: this.w / 2, y: this.h / 2 };
    var before = this.screenToWorld(center.x, center.y);
    this.view.zoom = Geo.clamp(this.view.zoom * factor, 0.002, 1.5);
    this.view.x = before.x - (center.x - this.w / 2) / this.view.zoom;
    this.view.y = before.y + (center.y - this.h / 2) / this.view.zoom;
    this.requestRender();
  };

  // ---------------------------------------------------------------- snapping
  Editor2D.prototype._rawSnapCandidates = function () {
    var c = [];
    var level = this.store.activeLevel;
    var self = this;
    function add(p, type) { if (p && isFinite(p.x) && isFinite(p.y)) c.push({ point: { x: p.x, y: p.y }, type: type }); }
    this.store.project.walls.forEach(function (w) {
      if (w.level !== level) return;
      add(w.a, 'EXT'); add(w.b, 'EXT');
      add(Geo.wallPointAt(w, 0.5), 'MED');
      if (Geo.wallIsCurved(w)) {
        (w.curve.pts || []).forEach(function (p) { add(p, 'CURVA'); });
      } else {
        w.openings.forEach(function (o) {
          var sp = Geo.openingSpan(w, o);
          add(Geo.lerp(w.a, w.b, sp.from / Math.max(1, Geo.wallLength(w))), 'JAMBA');
          add(Geo.lerp(w.a, w.b, sp.to / Math.max(1, Geo.wallLength(w))), 'JAMBA');
        });
      }
    });
    this.store.project.rooms.forEach(function (r) {
      if (r.level !== level) return;
      r.polygon.forEach(function (p) { add(p, 'VÉRTICE'); });
    });
    this.store.project.items.forEach(function (it) {
      if (it.level !== level) return;
      add({ x: it.x, y: it.y }, 'CENTRO');
    });
    this.store.project.texts.forEach(function (t) {
      if (t.level !== level) return;
      add({ x: t.x, y: t.y }, 'TEXTO');
    });
    return c;
  };

  Editor2D.prototype.snapPoint = function (raw, opts) {
    opts = opts || {};
    var tol = 11 / this.view.zoom;
    var best = null, bestD = Infinity;
    if (this.snap.snapping !== false && !opts.noObject) {
      var cands = this._rawSnapCandidates();
      for (var i = 0; i < cands.length; i++) {
        var d = Geo.dist(raw, cands[i].point);
        if (d < bestD && d <= tol) { bestD = d; best = cands[i]; }
      }
    }
    if (best) {
      return { point: best.point, type: best.type, snapped: true };
    }
    if (this.snap.grid !== false && opts.noGrid !== true) {
      var g = this._gridConfig();
      var gp = { x: gridAxis(raw.x, g.ox, g.step), y: gridAxis(raw.y, g.oy, g.step) };
      return { point: gp, type: 'REJILLA', snapped: true };
    }
    return { point: { x: raw.x, y: raw.y }, type: null, snapped: false };
  };

  Editor2D.prototype._constrainOrtho = function (start, raw) {
    var dx = raw.x - start.x, dy = raw.y - start.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return raw;
    var ang = Geo.snapAngle(Math.atan2(dy, dx), 45);
    return { x: start.x + Math.cos(ang) * len, y: start.y + Math.sin(ang) * len };
  };

  // ---------------------------------------------------------------- render
  Editor2D.prototype.requestRender = function () {
    if (this._raf || this._destroyed) return;
    var self = this;
    this._raf = requestAnimationFrame(function () {
      self._raf = null;
      self.render();
    });
  };

  Editor2D.prototype.render = function () {
    if (this._destroyed) return;
    this._resizeIfNeeded();
    if (this.w < 2 || this.h < 2) return;
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, this.w, this.h);
    this._drawGrid();
    this._drawRooms();
    this._drawWalls();
    this._drawDims();
    this._drawItems();
    this._drawTexts();
    this._drawRoomLabels();
    this._drawSelectionOverlays();
    this._drawPreview();
    this._drawMarquee();
    this._drawSnap();
    this._drawHud();
  };

  Editor2D.prototype._drawGrid = function () {
    var ctx = this.ctx;
    var zoom = this.view.zoom;
    if (!isFinite(zoom) || zoom <= 0) return;
    var g = this._gridConfig();
    var style = g.style === 'dots' ? 'dots' : 'lines';
    var minSpan = style === 'dots' ? 14 : 9;
    var minor = g.size;
    if (g.adaptive) {
      var guard = 0;
      while (minor * zoom < minSpan && guard++ < 20) minor *= 2;
    }
    if (!isFinite(minor) || minor <= 0) return;
    var major = minor * g.major;
    var left = this.view.x - this.w / 2 / zoom;
    var right = this.view.x + this.w / 2 / zoom;
    var bottom = this.view.y - this.h / 2 / zoom;
    var top = this.view.y + this.h / 2 / zoom;
    if (!isFinite(left) || !isFinite(right) || !isFinite(bottom) || !isFinite(top)) return;
    var ox = g.ox, oy = g.oy;

    function lines(step, color, width) {
      if (!isFinite(step) || step <= 0 || step * zoom < 3) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      var x = ox + Math.floor((left - ox) / step) * step;
      for (var i = 0; x <= right && i < 4000; i++, x += step) {
        var sx = Math.round((x - this.view.x) * zoom + this.w / 2) + 0.5;
        ctx.moveTo(sx, 0); ctx.lineTo(sx, this.h);
      }
      var y = oy + Math.floor((bottom - oy) / step) * step;
      for (var j = 0; y <= top && j < 4000; j++, y += step) {
        var sy = Math.round(this.h / 2 - (y - this.view.y) * zoom) + 0.5;
        ctx.moveTo(0, sy); ctx.lineTo(this.w, sy);
      }
      ctx.stroke();
    }

    function dots(step, color, radius) {
      if (!isFinite(step) || step <= 0 || step * zoom < 9) return;
      ctx.beginPath();
      var x0 = ox + Math.floor((left - ox) / step) * step;
      var y0 = oy + Math.floor((bottom - oy) / step) * step;
      var count = 0;
      for (var x = x0; x <= right; x += step) {
        var sx = Math.round((x - this.view.x) * zoom + this.w / 2);
        for (var y = y0; y <= top; y += step) {
          var sy = Math.round(this.h / 2 - (y - this.view.y) * zoom);
          ctx.rect(sx - radius, sy - radius, radius * 2, radius * 2);
          if (++count > 12000) { ctx.fillStyle = color; ctx.fill(); return; }
        }
      }
      ctx.fillStyle = color;
      ctx.fill();
    }

    if (style === 'dots') {
      dots.call(this, minor, C.gridMinor, 1);
      if (major * zoom > 16) dots.call(this, major, C.gridMajor, 1.5);
    } else {
      // Subdivisión fina para el paso de ajuste cuando es menor que la rejilla.
      if (g.step < minor * 0.999 && g.step * zoom >= 9) lines.call(this, g.step, C.gridFine, 1);
      lines.call(this, minor, C.gridMinor, 1);
      if (major * zoom > 14) lines.call(this, major, C.gridMajor, 1);
    }

    // Ejes del origen de la rejilla
    if (g.axes) {
      var o = this.worldToScreen({ x: ox, y: oy });
      ctx.strokeStyle = C.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (o.y >= 0 && o.y <= this.h) { ctx.moveTo(0, o.y + 0.5); ctx.lineTo(this.w, o.y + 0.5); }
      if (o.x >= 0 && o.x <= this.w) { ctx.moveTo(o.x + 0.5, 0); ctx.lineTo(o.x + 0.5, this.h); }
      ctx.stroke();
    }
  };

  Editor2D.prototype._roomColor = function (room) {
    if (room.color) return room.color;
    var name = (room.name || '').toLowerCase();
    if (/baño|bano|ducha/.test(name)) return '#d9e9ea';
    if (/cocina/.test(name)) return '#f1e4cc';
    if (/dorm|habit/.test(name)) return '#e9e1d1';
    if (/sala|living/.test(name)) return '#ece5d7';
    if (/comedor/.test(name)) return '#f0e7d8';
    if (/garaje|garage/.test(name)) return '#dfe1e0';
    if (/pasillo|hall/.test(name)) return '#e8e5dd';
    if (/estudio|oficina/.test(name)) return '#e0e6e8';
    return FINISH_COLORS[room.finish] || DEFAULT_ROOM_COLORS[0];
  };

  Editor2D.prototype._drawRooms = function () {
    if (!this.store.isVisible('rooms')) return;
    var ctx = this.ctx;
    var zoom = this.view.zoom;
    var self = this;
    var selectedIds = {};
    this.store.selection.forEach(function (s) { selectedIds[s.kind + ':' + s.id] = true; });
    this.store.rooms().forEach(function (room) {
      if (room.polygon.length < 3) return;
      var pts = room.polygon.map(function (p) { return self.worldToScreen(p); });
      var b = Geo.bounds(pts);
      if (b.maxX < 0 || b.minX > self.w || b.maxY < 0 || b.minY > self.h) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = self._roomColor(room);
      ctx.globalAlpha = 0.72;
      ctx.fill();
      ctx.globalAlpha = 1;
      var isSel = selectedIds['room:' + room.id];
      ctx.strokeStyle = isSel ? C.selection : C.roomStroke;
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.stroke();
    });
  };

  Editor2D.prototype._drawRoomLabels = function () {
    if (!this.store.isVisible('rooms')) return;
    var ctx = this.ctx;
    var self = this;
    this.store.rooms().forEach(function (room) {
      if (!room.polygon || room.polygon.length < 3) return;
      var pts = room.polygon.map(function (p) { return self.worldToScreen(p); });
      var b = Geo.bounds(pts);
      if (b.maxX < 0 || b.minX > self.w || b.maxY < 0 || b.minY > self.h) return;
      if (b.w < 52 || b.h < 34) return;
      var c = Geo.polygonCentroid(room.polygon);
      var sc = self.worldToScreen(c);
      var area = Geo.polygonArea(room.polygon);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.roomText;
      var size = Geo.clamp(b.w / 13, 11, 16);
      ctx.font = '600 ' + size.toFixed(1) + 'px "Segoe UI", system-ui, sans-serif';
      var label = (room.name || 'Ambiente').toUpperCase();
      var tw = ctx.measureText(label).width;
      var areaTxt = Geo.formatArea(area, self._units());
      ctx.font = '500 10.5px "Bahnschrift", "Consolas", monospace';
      var aw = ctx.measureText(areaTxt).width;
      var padX = 9, boxW = Math.max(tw, aw) + padX * 2, boxH = 36;
      ctx.fillStyle = 'rgba(250,248,242,0.82)';
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(sc.x - boxW / 2, sc.y - boxH / 2, boxW, boxH, 4);
        ctx.fill();
      } else {
        ctx.fillRect(sc.x - boxW / 2, sc.y - boxH / 2, boxW, boxH);
      }
      ctx.fillStyle = C.roomText;
      ctx.font = '600 ' + size.toFixed(1) + 'px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(label, sc.x, sc.y - 6.5);
      ctx.font = '500 10.5px "Bahnschrift", "Consolas", monospace';
      ctx.fillStyle = C.roomSub;
      ctx.fillText(areaTxt, sc.x, sc.y + 9.5);
      ctx.restore();
    });
  };

  Editor2D.prototype._wallSegments = function (wall) {
    var len = Geo.wallLength(wall);
    var spans = [];
    (wall.openings || []).forEach(function (o) {
      var sp = Geo.openingSpan(wall, o);
      spans.push({ from: Math.max(0, sp.from), to: Math.min(len, sp.to), opening: o });
    });
    spans.sort(function (a, b) { return a.from - b.from; });
    var solids = [];
    var cursor = 0;
    for (var i = 0; i < spans.length; i++) {
      if (spans[i].from > cursor + 0.5) solids.push({ from: cursor, to: spans[i].from });
      cursor = Math.max(cursor, spans[i].to);
    }
    if (cursor < len - 0.5) solids.push({ from: cursor, to: len });
    if (!spans.length) solids = [{ from: 0, to: len }];
    return { solids: solids, spans: spans, len: len };
  };

  Editor2D.prototype._wallQuad = function (wall, from, to, extendStart, extendEnd) {
    var len = Geo.wallLength(wall);
    if (len < 1) return [];
    var ux = (wall.b.x - wall.a.x) / len;
    var uy = (wall.b.y - wall.a.y) / len;
    var nx = -uy, ny = ux;
    var half = (wall.thickness || 150) / 2;
    var ext = half;
    var s = from - (extendStart ? ext : 0);
    var e = to + (extendEnd ? ext : 0);
    var a = { x: wall.a.x + ux * s, y: wall.a.y + uy * s };
    var b = { x: wall.a.x + ux * e, y: wall.a.y + uy * e };
    return [
      { x: a.x + nx * half, y: a.y + ny * half },
      { x: b.x + nx * half, y: b.y + ny * half },
      { x: b.x - nx * half, y: b.y - ny * half },
      { x: a.x - nx * half, y: a.y - ny * half }
    ];
  };

  Editor2D.prototype._drawWalls = function () {
    var self = this;
    var ctx = this.ctx;
    if (!this.store.isVisible('walls')) return;
    var selectedIds = {};
    this.store.selection.forEach(function (s) { selectedIds['wall:' + s.id] = true; });
    var hoverId = this.hover && this.hover.kind === 'wall' ? this.hover.id : null;

    this.store.walls().forEach(function (wall) {
      if (Geo.wallLength(wall) < 1) return;
      var selected = !!selectedIds['wall:' + wall.id];
      if (Geo.wallIsCurved(wall)) {
        self._drawCurvedWall(wall, selected, hoverId === wall.id);
        return;
      }
      var info = self._wallSegments(wall);

      info.solids.forEach(function (seg, idx) {
        var extStart = idx === 0 && seg.from <= 0.5;
        var extEnd = idx === info.solids.length - 1 && seg.to >= info.len - 0.5;
        var quad = self._wallQuad(wall, seg.from, seg.to, extStart, extEnd).map(function (p) { return self.worldToScreen(p); });
        ctx.beginPath();
        ctx.moveTo(quad[0].x, quad[0].y);
        for (var i = 1; i < quad.length; i++) ctx.lineTo(quad[i].x, quad[i].y);
        ctx.closePath();
        ctx.fillStyle = selected ? '#3c4653' : C.wall;
        ctx.fill();
        ctx.strokeStyle = selected ? C.selection : C.wallEdge;
        ctx.lineWidth = selected ? 1.6 : 1.1;
        ctx.stroke();
      });

      if (self.store.isVisible('openings')) {
        info.spans.forEach(function (span) { self._drawOpening(wall, span.opening, span.from, span.to); });
      }

      if (hoverId === wall.id && !selected) {
        var poly = Geo.wallPolygon(wall, true).map(function (p) { return self.worldToScreen(p); });
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.closePath();
        ctx.fillStyle = C.wallHover;
        ctx.fill();
      }

      if (selected) {
        var outline = Geo.wallPolygon(wall, true).map(function (p) { return self.worldToScreen(p); });
        ctx.beginPath();
        ctx.moveTo(outline[0].x, outline[0].y);
        for (var j = 1; j < outline.length; j++) ctx.lineTo(outline[j].x, outline[j].y);
        ctx.closePath();
        ctx.strokeStyle = C.selection;
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        self._drawHandle(wall.a, C.selection);
        self._drawHandle(wall.b, C.selection);
      }
    });
  };

  // Muro curvo (arco o spline): banda rellena, directriz suave y tiradores.
  Editor2D.prototype._drawCurvedWall = function (wall, selected, hovered) {
    var self = this;
    var ctx = this.ctx;
    var poly = Geo.wallPolygon(wall, true);
    if (poly.length < 4) return;
    var pts = poly.map(function (p) { return self.worldToScreen(p); });
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = selected ? '#3c4653' : C.wall;
    ctx.fill();
    ctx.strokeStyle = selected ? C.selection : C.wallEdge;
    ctx.lineWidth = selected ? 1.6 : 1.1;
    ctx.stroke();
    if (hovered && !selected) { ctx.fillStyle = C.wallHover; ctx.fill(); }

    var path = Geo.wallPath(wall).map(function (p) { return self.worldToScreen(p); });
    if (path.length > 2) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (var k = 1; k < path.length; k++) ctx.lineTo(path[k].x, path[k].y);
      ctx.strokeStyle = selected ? 'rgba(245,166,35,0.5)' : 'rgba(20,29,38,0.10)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    if (selected) {
      this._drawHandle(wall.a, C.selection);
      this._drawHandle(wall.b, C.selection);
      this._wallCurveHandles(wall).forEach(function (h) {
        self._drawCurveHandle(h.point, C.selection);
      });
    }
  };

  Editor2D.prototype._wallCurveHandles = function (wall) {
    var out = [];
    if (!Geo.wallIsCurved(wall)) return out;
    if (wall.curve.type === 'arc') {
      out.push({ point: Geo.wallPointAt(wall, 0.5), kind: 'bulge' });
    } else {
      (wall.curve.pts || []).forEach(function (p, i) {
        out.push({ point: { x: p.x, y: p.y }, kind: 'spline', index: i });
      });
    }
    return out;
  };

  Editor2D.prototype._drawCurveHandle = function (world, color) {
    var p = this.worldToScreen(world);
    var ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  };

  Editor2D.prototype._drawOpening = function (wall, opening, from, to) {
    var ctx = this.ctx;
    var len = Math.max(1, Geo.wallLength(wall));
    var ux = (wall.b.x - wall.a.x) / len;
    var uy = (wall.b.y - wall.a.y) / len;
    var nx = -uy, ny = ux;
    var half = (wall.thickness || 150) / 2;
    var width = to - from;
    if (width < 5) return;
    var a0 = { x: wall.a.x + ux * from, y: wall.a.y + uy * from };
    var a1 = { x: wall.a.x + ux * to, y: wall.a.y + uy * to };

    if (opening.type === 'window') {
      var q = [
        { x: a0.x + nx * half, y: a0.y + ny * half },
        { x: a1.x + nx * half, y: a1.y + ny * half },
        { x: a1.x - nx * half, y: a1.y - ny * half },
        { x: a0.x - nx * half, y: a0.y - ny * half }
      ].map(function (p) { return this.worldToScreen(p); }, this);
      ctx.beginPath();
      ctx.moveTo(q[0].x, q[0].y);
      for (var i = 1; i < q.length; i++) ctx.lineTo(q[i].x, q[i].y);
      ctx.closePath();
      ctx.fillStyle = C.windowFill;
      ctx.fill();
      ctx.strokeStyle = C.window;
      ctx.lineWidth = 1;
      [-1 / 3, 1 / 3].forEach(function (f) {
        var p0 = this.worldToScreen({ x: a0.x + nx * half * f, y: a0.y + ny * half * f });
        var p1 = this.worldToScreen({ x: a1.x + nx * half * f, y: a1.y + ny * half * f });
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      }, this);
      return;
    }

    if (opening.type === 'garage' || opening.type === 'pass') {
      var s0 = this.worldToScreen(a0), s1 = this.worldToScreen(a1);
      ctx.strokeStyle = opening.type === 'garage' ? '#8c6a3c' : C.opening;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([9, 5]);
      ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    // Puerta: hoja y abanico
    var hingeAtStart = opening.hinge !== -1;
    var hinge = hingeAtStart ? a0 : a1;
    var other = hingeAtStart ? a1 : a0;
    var swing = opening.swing === -1 ? -1 : 1;
    var swingDir = { x: nx * swing, y: ny * swing };
    var leafLen = width;
    var openEnd = { x: hinge.x + swingDir.x * leafLen, y: hinge.y + swingDir.y * leafLen };
    var closedVec = { x: other.x - hinge.x, y: other.y - hinge.y };
    var closedAng = Math.atan2(closedVec.y, closedVec.x);
    var openAng = Math.atan2(swingDir.y, swingDir.x);
    var delta = openAng - closedAng;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    ctx.strokeStyle = C.opening;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    var hs = this.worldToScreen(hinge);
    var os = this.worldToScreen(openEnd);
    ctx.moveTo(hs.x, hs.y); ctx.lineTo(os.x, os.y);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.beginPath();
    var steps = 20;
    for (var k = 0; k <= steps; k++) {
      var ang = closedAng + delta * (k / steps);
      var p = { x: hinge.x + Math.cos(ang) * leafLen, y: hinge.y + Math.sin(ang) * leafLen };
      var sp = this.worldToScreen(p);
      if (k === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
    }
    ctx.stroke();
    ctx.fillStyle = C.opening;
    ctx.beginPath(); ctx.arc(hs.x, hs.y, 2.4, 0, Math.PI * 2); ctx.fill();
  };

  Editor2D.prototype._drawDims = function () {
    if (!this.store.isVisible('dimensions')) return;
    var self = this;
    this.store.dims().forEach(function (dim) {
      var g = self._dimGeometry(dim);
      var selected = self.store.selection.some(function (s) { return s.kind === 'dim' && s.id === dim.id; });
      var color = selected ? C.selection : C.dim;
      var ctx = self.ctx;
      ctx.strokeStyle = color;
      ctx.lineWidth = selected ? 1.8 : 1;
      var a = self.worldToScreen(dim.a), b = self.worldToScreen(dim.b);
      var pa = self.worldToScreen(g.pa), pb = self.worldToScreen(g.pb);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(pa.x, pa.y);
      ctx.moveTo(b.x, b.y); ctx.lineTo(pb.x, pb.y);
      ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      // Ticks inclinados
      var tick = 5;
      [pa, pb].forEach(function (p) {
        ctx.beginPath();
        ctx.moveTo(p.x - tick, p.y + tick);
        ctx.lineTo(p.x + tick, p.y - tick);
        ctx.stroke();
      });
      var mid = self.worldToScreen(g.mid);
      var text = dim.text || Geo.formatLength(g.len, self._units());
      var ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
      ctx.save();
      ctx.translate(mid.x, mid.y);
      ctx.rotate(ang);
      ctx.font = '600 12px "Bahnschrift", "Consolas", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 4;
      ctx.strokeStyle = C.paper;
      ctx.strokeText(text, 0, -4);
      ctx.fillStyle = color;
      ctx.fillText(text, 0, -4);
      ctx.restore();
    });
  };

  Editor2D.prototype._dimGeometry = function (dim) {
    var len = Geo.dist(dim.a, dim.b);
    var ux = len > 0.001 ? (dim.b.x - dim.a.x) / len : 1;
    var uy = len > 0.001 ? (dim.b.y - dim.a.y) / len : 0;
    var nx = -uy, ny = ux;
    var off = dim.offset == null ? 700 : dim.offset;
    var pa = { x: dim.a.x + nx * off, y: dim.a.y + ny * off };
    var pb = { x: dim.b.x + nx * off, y: dim.b.y + ny * off };
    return { len: len, ux: ux, uy: uy, nx: nx, ny: ny, pa: pa, pb: pb, mid: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 } };
  };

  Editor2D.prototype.drawPlanShape = function (ctx, shape, defaultStroke, defaultFill) {
    var fill = shape.fill || defaultFill || null;
    var stroke = shape.stroke || defaultStroke || '#556270';
    ctx.beginPath();
    if (shape.t === 'rect') {
      var x = shape.x == null ? -shape.w / 2 : shape.x;
      var y = shape.y == null ? -shape.h / 2 : shape.y;
      var r = Math.min(shape.r || 0, Math.abs(shape.w) / 2, Math.abs(shape.h) / 2);
      if (r > 0 && typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, shape.w, shape.h, r);
      } else if (r > 0) {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + shape.w - r, y);
        ctx.quadraticCurveTo(x + shape.w, y, x + shape.w, y + r);
        ctx.lineTo(x + shape.w, y + shape.h - r);
        ctx.quadraticCurveTo(x + shape.w, y + shape.h, x + shape.w - r, y + shape.h);
        ctx.lineTo(x + r, y + shape.h);
        ctx.quadraticCurveTo(x, y + shape.h, x, y + shape.h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      } else {
        ctx.rect(x, y, shape.w, shape.h);
      }
    } else if (shape.t === 'circle') {
      ctx.arc(shape.cx, shape.cy, Math.max(0.1, shape.r), 0, Math.PI * 2);
    } else if (shape.t === 'line') {
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
    } else if (shape.t === 'poly') {
      var pts = shape.points || [];
      if (pts.length) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
      }
    } else if (shape.t === 'arc') {
      var a0 = Geo.degToRad(shape.start || 0);
      var a1 = Geo.degToRad(shape.end == null ? 180 : shape.end);
      var steps = 18;
      for (var k = 0; k <= steps; k++) {
        var ang = a0 + (a1 - a0) * (k / steps);
        var px = shape.cx + Math.cos(ang) * shape.r;
        var py = shape.cy + Math.sin(ang) * shape.r;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
    }
    if (shape.t !== 'line' && (fill || shape.fill)) {
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    }
    ctx.strokeStyle = stroke;
    ctx.stroke();
  };

  Editor2D.prototype._itemDef = function (item) {
    if (!ED.Library || !ED.Library.get) return null;
    return ED.Library.get(item.libId);
  };

  Editor2D.prototype._renderItemShape = function (item, alpha, ghost) {
    var def = this._itemDef(item);
    var ctx = this.ctx;
    if (!def) {
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.translate(this.worldToScreen({ x: item.x, y: item.y }).x, this.worldToScreen({ x: item.x, y: item.y }).y);
      ctx.rotate(-Geo.degToRad(item.rotation || 0));
      ctx.fillStyle = '#d9dee4';
      ctx.strokeStyle = ghost ? C.selection : C.itemStroke;
      ctx.lineWidth = 1;
      ctx.fillRect(-(item.w || 600) / 2 * this.view.zoom, -(item.d || 600) / 2 * this.view.zoom, (item.w || 600) * this.view.zoom, (item.d || 600) * this.view.zoom);
      ctx.strokeRect(-(item.w || 600) / 2 * this.view.zoom, -(item.d || 600) / 2 * this.view.zoom, (item.w || 600) * this.view.zoom, (item.d || 600) * this.view.zoom);
      ctx.restore();
      return;
    }
    var sp = this.worldToScreen({ x: item.x, y: item.y });
    var zoom = this.view.zoom;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(sp.x, sp.y);
    ctx.scale(zoom, -zoom);
    ctx.rotate(Geo.degToRad(item.rotation || 0));
    ctx.lineWidth = 1.15 / zoom;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    var shapes = def.plan || [];
    for (var i = 0; i < shapes.length; i++) {
      var sh = shapes[i];
      if (sh.t === 'line') ctx.lineWidth = 0.9 / zoom;
      else ctx.lineWidth = 1.15 / zoom;
      this.drawPlanShape(ctx, sh, ghost ? C.selection : C.itemStroke, def.color || C.itemDefault);
    }
    ctx.restore();
  };

  Editor2D.prototype._drawItems = function () {
    if (!this.store.isVisible('furniture')) return;
    var self = this;
    var selectedIds = {};
    this.store.selection.forEach(function (s) { selectedIds['item:' + s.id] = true; });
    this.store.items().forEach(function (item) {
      if (self.store.getLayer(item.layerId).visible === false) return;
      var isSel = !!selectedIds['item:' + item.id];
      self._renderItemShape(item, 1, false);
      var outline = Geo.rectPolygon(item.x, item.y, item.w, item.d, item.rotation).map(function (p) { return self.worldToScreen(p); });
      if (isSel) {
        self._strokePoly(outline, C.selection, 2, [6, 3]);
        var rh = self._rotateHandleScreen(item);
        ctxLine(self.ctx, self.worldToScreen({ x: item.x, y: item.y }), rh, C.selection, 1, [4, 3]);
        self.ctx.beginPath();
        self.ctx.arc(rh.x, rh.y, 5, 0, Math.PI * 2);
        self.ctx.fillStyle = C.handle;
        self.ctx.fill();
        self.ctx.strokeStyle = C.selection;
        self.ctx.lineWidth = 2;
        self.ctx.stroke();
      } else if (self.hover && self.hover.kind === 'item' && self.hover.id === item.id) {
        self._strokePoly(outline, C.hover, 1.6, [5, 3]);
      }
      if ((isSel || (self.hover && self.hover.kind === 'item' && self.hover.id === item.id)) && item.w * self.view.zoom > 26) {
        var name = item.name || (self._itemDef(item) && self._itemDef(item).name) || 'Mobiliario';
        var top = self.worldToScreen({ x: item.x, y: item.y });
        var labelY = top.y - Math.max(18, item.d / 2 * self.view.zoom + 14);
        self._labelChip(name, top.x, labelY);
      }
    });
  };

  function ctxLine(ctx, a, b, color, width, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  }

  Editor2D.prototype._rotateHandleScreen = function (item) {
    var local = { x: 0, y: item.d / 2 + 420 };
    var world = Geo.transformPoint(local, { x: item.x, y: item.y }, item.rotation || 0);
    return this.worldToScreen(world);
  };

  Editor2D.prototype._labelChip = function (text, x, y) {
    var ctx = this.ctx;
    ctx.save();
    ctx.font = '600 11.5px "Segoe UI", system-ui, sans-serif';
    var w = ctx.measureText(text).width + 18;
    var h = 24;
    ctx.fillStyle = 'rgba(20,28,37,0.92)';
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath(); ctx.roundRect(x - w / 2, y - h, w, h, 5); ctx.fill();
    } else {
      ctx.fillRect(x - w / 2, y - h, w, h);
    }
    ctx.fillStyle = '#f2f7fb';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - h / 2 + 0.5);
    ctx.restore();
  };

  Editor2D.prototype._drawTexts = function () {
    if (!this.store.isVisible('annotation')) return;
    var self = this;
    var ctx = this.ctx;
    var selectedIds = {};
    this.store.selection.forEach(function (s) { selectedIds['text:' + s.id] = true; });
    this.store.texts().forEach(function (t) {
      if (self.store.getLayer(t.layerId).visible === false) return;
      var sizePx = Math.max(1, t.size * self.view.zoom);
      var sp = self.worldToScreen({ x: t.x, y: t.y });
      if (sizePx < 5) return;
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(-Geo.degToRad(t.rotation || 0));
      ctx.font = '500 ' + sizePx.toFixed(1) + 'px "Bahnschrift", "Segoe UI", sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = Math.max(2, sizePx * 0.16);
      ctx.strokeStyle = C.paper;
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = C.text;
      ctx.fillText(t.text, 0, 0);
      if (selectedIds['text:' + t.id]) {
        var w = ctx.measureText(t.text).width;
        ctx.strokeStyle = C.selection;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(-3, -sizePx - 3, w + 6, sizePx * 1.25 + 6);
      }
      ctx.restore();
    });
  };

  Editor2D.prototype._strokePoly = function (pts, color, width, dash) {
    if (!pts.length) return;
    var ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  };

  Editor2D.prototype._drawHandle = function (world, color) {
    var p = this.worldToScreen(world);
    var ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath(); ctx.roundRect(p.x - 4.5, p.y - 4.5, 9, 9, 2); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillRect(p.x - 4.5, p.y - 4.5, 9, 9); ctx.strokeRect(p.x - 4.5, p.y - 4.5, 9, 9);
    }
    ctx.restore();
  };

  Editor2D.prototype._drawSelectionOverlays = function () {
    var self = this;
    var ctx = this.ctx;
    this.store.selection.forEach(function (sel) {
      var obj = self.store.find(sel.kind, sel.id);
      if (!obj) return;
      if (sel.kind === 'room') {
        var pts = obj.polygon.map(function (p) { return self.worldToScreen(p); });
        self._strokePoly(pts, C.selection, 2, [7, 4]);
        pts.forEach(function (p) { self._drawHandle(p, C.selection); });
        var c = self.worldToScreen(Geo.polygonCentroid(obj.polygon));
        self._labelChip(obj.name + ' · ' + Geo.formatArea(Geo.polygonArea(obj.polygon), self._units()), c.x, c.y - 10);
      } else if (sel.kind === 'dim') {
        var g = self._dimGeometry(obj);
        var pa = self.worldToScreen(g.pa), pb = self.worldToScreen(g.pb);
        self._drawHandle(pa, C.selection);
        self._drawHandle(pb, C.selection);
      }
    });
  };

  Editor2D.prototype._drawPreview = function () {
    var ctx = this.ctx;
    var tool = this.tool;
    if (tool === 'wall' && this.drawing && this.drawing.type === 'wall') {
      var start = this.drawing.start;
      var end = this._currentWallPoint();
      if (!end) return;
      var len = Geo.dist(start, end);
      ctx.save();
      ctx.strokeStyle = C.selection;
      ctx.fillStyle = 'rgba(245,166,35,0.18)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([8, 4]);
      var ux = len > 0.1 ? (end.x - start.x) / len : 1;
      var uy = len > 0.1 ? (end.y - start.y) / len : 0;
      var half = (this.store.project.settings.wallThickness || 150) / 2;
      var quad = [
        selfPoint(start, ux, uy, -uy, ux, half),
        selfPoint(end, ux, uy, -uy, ux, half),
        selfPoint(end, ux, uy, -uy, ux, -half),
        selfPoint(start, ux, uy, -uy, ux, -half)
      ].map(function (p) { return this.worldToScreen(p); }, this);
      ctx.beginPath();
      ctx.moveTo(quad[0].x, quad[0].y);
      for (var i = 1; i < quad.length; i++) ctx.lineTo(quad[i].x, quad[i].y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      var s = this.worldToScreen(start), e2 = this.worldToScreen(end);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e2.x, e2.y); ctx.stroke();
      this._drawHandle(start, C.selection);
      var label = Geo.formatLength(len, this._units()) + '  ·  ' + Geo.formatDeg(Geo.angle(start, end));
      var mid = { x: (s.x + e2.x) / 2, y: (s.y + e2.y) / 2 };
      this._labelChip(label, mid.x, mid.y - 16);
      ctx.restore();
    }

    if ((tool === 'wallArc' || tool === 'wallSpline') && this.drawing) {
      var prev = this._curvePreviewWall();
      if (prev) {
        var polyP = Geo.wallPolygon(prev, true).map(function (p) { return this.worldToScreen(p); }, this);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(polyP[0].x, polyP[0].y);
        for (var pi = 1; pi < polyP.length; pi++) ctx.lineTo(polyP[pi].x, polyP[pi].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(245,166,35,0.18)';
        ctx.fill();
        ctx.strokeStyle = C.selection;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (prev.curve && prev.curve.type === 'spline') {
          var cps = [{ x: prev.a.x, y: prev.a.y }].concat(prev.curve.pts || [], [{ x: prev.b.x, y: prev.b.y }]);
          cps.forEach(function (p) {
            var sp2 = this.worldToScreen(p);
            ctx.beginPath(); ctx.arc(sp2.x, sp2.y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff'; ctx.fill();
            ctx.strokeStyle = C.selection; ctx.lineWidth = 1.6; ctx.stroke();
          }, this);
        }
        var lenP = Geo.wallLength(prev);
        var midP = this.worldToScreen(Geo.wallPointAt(prev, 0.5));
        this._labelChip(Geo.formatLength(lenP, this._units()) +
          (prev.curve && prev.curve.type === 'arc' ? ' · arco' : (prev.curve ? ' · spline' : '')), midP.x, midP.y - 18);
        ctx.restore();
      }
    }

    if (tool === 'furniture' && this.furnitureId && this.mouse.inside && !this.pan) {
      var def = ED.Library && ED.Library.get ? ED.Library.get(this.furnitureId) : null;
      if (def) {
        var snap = this.snapPoint(this.cursor);
        var ghost = {
          id: 'ghost', libId: this.furnitureId, x: snap.point.x, y: snap.point.y,
          rotation: this.furnitureRotation, w: def.w, d: def.d, h: def.h, layerId: 'furniture'
        };
        this._renderItemShape(ghost, 0.72, true);
        var pts = Geo.rectPolygon(ghost.x, ghost.y, def.w, def.d, ghost.rotation).map(function (p) { return this.worldToScreen(p); }, this);
        this._strokePoly(pts, C.selection, 1.4, [6, 4]);
        var sp = this.worldToScreen({ x: ghost.x, y: ghost.y });
        this._labelChip(def.name, sp.x, sp.y - Math.max(20, def.d / 2 * this.view.zoom + 16));
      }
    }

    if ((tool === 'door' || tool === 'window') && this.mouse.inside) {
      var hit = this._findWallForOpening(this.cursor);
      if (hit) {
        var info = this._wallSegments(hit.wall);
        var len2 = info.len;
        var t = Geo.clamp(hit.t, 0, 1);
        var wOpen = tool === 'door' ? 900 : 1200;
        var center = t * len2;
        var from = Geo.clamp(center - wOpen / 2, 0, len2);
        var to = Geo.clamp(center + wOpen / 2, 0, len2);
        var poly = Geo.wallPolygon(hit.wall, true).map(function (p) { return this.worldToScreen(p); }, this);
        this._strokePoly(poly, C.selection, 2, [6, 4]);
        var pa = this.worldToScreen(Geo.lerp(hit.wall.a, hit.wall.b, from / len2));
        var pb = this.worldToScreen(Geo.lerp(hit.wall.a, hit.wall.b, to / len2));
        ctx.save();
        ctx.strokeStyle = C.selection;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    if (tool === 'dim' && this.drawing && this.drawing.type === 'dim') {
      var a = this.worldToScreen(this.drawing.start);
      var b = this.worldToScreen(this.cursor);
      ctx.save();
      ctx.strokeStyle = C.dim;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([7, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      var len3 = Geo.dist(this.drawing.start, this.cursor);
      if (len3 > 1) this._labelChip(Geo.formatLength(len3, this._units()), (a.x + b.x) / 2, (a.y + b.y) / 2 - 14);
      ctx.restore();
    }
  };

  // Muro provisional para la previsualización de arco/spline.
  Editor2D.prototype._curvePreviewWall = function () {
    var d = this.drawing;
    if (!d) return null;
    var thick = this.store.project.settings.wallThickness || 150;
    if (d.type === 'wallArc') {
      if (d.phase === 'end') {
        var endA = this.snapPoint(this.cursor).point;
        if (Geo.dist(d.start, endA) < 50) return null;
        return { a: d.start, b: endA, thickness: thick, curve: null };
      }
      return { a: d.start, b: d.end, thickness: thick, curve: { type: 'arc', bulge: d.bulge || 0 } };
    }
    if (d.type === 'wallSpline') {
      var pts = d.pts.slice();
      var last = pts[pts.length - 1];
      var cur = this.snapPoint(this.cursor).point;
      if (Geo.dist(last, cur) > 50) pts.push(cur);
      if (pts.length < 2) return null;
      var a = pts[0], b = pts[pts.length - 1];
      var mid = pts.slice(1, -1);
      return { a: a, b: b, thickness: thick, curve: mid.length ? { type: 'spline', pts: mid } : null };
    }
    return null;
  };

  function selfPoint(p, ux, uy, nx, ny, off) {
    return { x: p.x + nx * off, y: p.y + ny * off };
  }

  Editor2D.prototype._drawMarquee = function () {
    if (!this.marquee) return;
    var ctx = this.ctx;
    var a = this.worldToScreen(this.marquee.a);
    var b = this.worldToScreen(this.marquee.b);
    var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    var w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
    ctx.save();
    ctx.fillStyle = 'rgba(72,201,216,0.08)';
    ctx.strokeStyle = C.hover;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.restore();
  };

  Editor2D.prototype._drawSnap = function () {
    if (!this.mouse.inside || this.pan) return;
    var ctx = this.ctx;
    var raw = this.cursor;
    var sp = this.worldToScreen(raw);
    // Cruz fina
    ctx.save();
    ctx.strokeStyle = 'rgba(32,47,61,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sp.x - 7, sp.y + 0.5); ctx.lineTo(sp.x + 7, sp.y + 0.5);
    ctx.moveTo(sp.x + 0.5, sp.y - 7); ctx.lineTo(sp.x + 0.5, sp.y + 7);
    ctx.stroke();
    ctx.restore();

    if (this.snapInfo && this.snapInfo.snapped && this.tool !== 'select' && this.tool !== 'pan') {
      var p = this.worldToScreen(this.snapInfo.point);
      ctx.save();
      ctx.strokeStyle = this.snapInfo.type === 'REJILLA' ? '#7d8b97' : C.selection;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      if (this.snapInfo.type) {
        ctx.font = '600 10px "Bahnschrift", "Consolas", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(20,29,38,0.86)';
        var tw = ctx.measureText(this.snapInfo.type).width + 10;
        ctx.fillRect(p.x + 10, p.y - 18, tw, 15);
        ctx.fillStyle = '#f4f7fa';
        ctx.fillText(this.snapInfo.type, p.x + 15, p.y - 6);
      }
      ctx.restore();
    }
  };

  Editor2D.prototype._drawHud = function () {
    var ctx = this.ctx;
    // Norte
    var cx = this.w - 44, cy = 44;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.76)';
    ctx.strokeStyle = 'rgba(36,49,61,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 23, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    var ang = -Geo.degToRad(this.store.project.settings.northAngle || 0) - Math.PI / 2;
    var tip = { x: cx + Math.cos(ang) * 14, y: cy + Math.sin(ang) * 14 };
    var base = { x: cx - Math.cos(ang) * 7, y: cy - Math.sin(ang) * 7 };
    ctx.strokeStyle = '#26323c';
    ctx.fillStyle = '#26323c';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(tip.x, tip.y, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.font = '700 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy + 4.5);
    ctx.restore();

    // Escala gráfica (métrica o imperial)
    var imperial = Geo.isImperial(this._units());
    var nice = imperial
      ? [304.8, 609.6, 1524, 3048, 6096, 15240, 30480]
      : [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
    var step = nice[0];
    for (var i = 0; i < nice.length; i++) {
      if (nice[i] * this.view.zoom >= 90) { step = nice[i]; break; }
      step = nice[i];
    }
    var px = step * this.view.zoom;
    var x0 = 18, y0 = this.h - 24;
    ctx.save();
    ctx.font = '600 11px "Bahnschrift", "Consolas", monospace';
    ctx.fillStyle = 'rgba(30,42,53,0.82)';
    var stepLabel = imperial ? Geo.formatLength(step, 'ft') : (step >= 1000 ? (step / 1000) + ' m' : (step / 1000).toFixed(1) + ' m');
    ctx.fillText(stepLabel, x0, y0 - 9);
    var seg = px / 2;
    ctx.fillStyle = '#2a3742'; ctx.fillRect(x0, y0, seg, 7);
    ctx.fillStyle = '#f5f3ec'; ctx.fillRect(x0 + seg, y0, seg, 7);
    ctx.strokeStyle = '#2a3742'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, px, 7);
    ctx.strokeStyle = 'rgba(36,49,61,0.4)';
    ctx.beginPath();
    for (var k = 0; k <= 4; k++) {
      var xx = x0 + (px / 4) * k;
      ctx.moveTo(xx + 0.5, y0); ctx.lineTo(xx + 0.5, y0 + 3.5);
    }
    ctx.stroke();
    ctx.restore();
  };

  // ---------------------------------------------------------------- interacción
  Editor2D.prototype._pointerDown = function (e) {
    if (e.button === 2) return;
    var p = this._eventPoint(e);
    this.mouse.sx = p.sx; this.mouse.sy = p.sy; this.mouse.inside = true;
    var raw = this.screenToWorld(p.sx, p.sy);
    this.cursor = raw;
    call(this.callbacks.onCursor, [raw]);

    if (e.button === 1 || this.spaceDown || this.tool === 'pan') {
      this.pan = { sx: p.sx, sy: p.sy, viewX: this.view.x, viewY: this.view.y };
      this._capturePointer(e);
      this._updateCursorStyle();
      e.preventDefault();
      return;
    }

    if (this.tool === 'select') {
      this._selectDown(raw, e.shiftKey);
    } else if (this.tool === 'wall') {
      this._wallDown(raw);
    } else if (this.tool === 'wallArc') {
      this._arcDown(raw);
    } else if (this.tool === 'wallSpline') {
      this._splineDown(raw);
    } else if (this.tool === 'door' || this.tool === 'window') {
      this._openingDown(raw, this.tool);
    } else if (this.tool === 'furniture') {
      this._furnitureDown(raw);
    } else if (this.tool === 'room') {
      this._roomDown(raw);
    } else if (this.tool === 'text') {
      var snapT = this.snapPoint(raw);
      call(this.callbacks.onRequestText, [snapT.point]);
    } else if (this.tool === 'dim') {
      this._dimDown(raw);
    } else if (this.tool === 'erase') {
      this._eraseAt(raw);
    }
    this._capturePointer(e);
    this.requestRender();
  };

  Editor2D.prototype._pointerMove = function (e) {
    var p = this._eventPoint(e);
    this.mouse.sx = p.sx; this.mouse.sy = p.sy; this.mouse.inside = true;
    var raw = this.screenToWorld(p.sx, p.sy);
    this.cursor = raw;

    if (this.pan) {
      this.view.x = this.pan.viewX - (p.sx - this.pan.sx) / this.view.zoom;
      this.view.y = this.pan.viewY + (p.sy - this.pan.sy) / this.view.zoom;
      this.requestRender();
      return;
    }

    if (this.drag) {
      this._dragMove(raw, e.shiftKey);
      return;
    }

    if (this.marquee) {
      this.marquee.b = raw;
      this.requestRender();
      return;
    }

    if (this.tool === 'wall' && this.drawing) {
      var wp = this._currentWallPoint();
      this.snapInfo = wp ? this.snapInfo : null;
      this._emitCursor(raw);
      this.requestRender();
      return;
    }

    if (this.tool === 'wallArc' && this.drawing) {
      if (this.drawing.phase === 'end') {
        this.snapInfo = this.snapPoint(raw);
        this._emitCursor(this.snapInfo.point);
      } else {
        this.drawing.bulge = Geo.bulgeFromPoint(this.drawing.start, this.drawing.end, raw);
        this.snapInfo = null;
        this._emitCursor(raw);
      }
      this.requestRender();
      return;
    }

    if (this.tool === 'wallSpline' && this.drawing) {
      this.snapInfo = this.snapPoint(raw);
      this._emitCursor(this.snapInfo.point);
      this.requestRender();
      return;
    }

    if (this.tool === 'dim' && this.drawing) {
      this.snapInfo = this.snapPoint(raw);
      this._emitCursor(raw);
      this.requestRender();
      return;
    }

    if (this.tool === 'select' || this.tool === 'erase') {
      var hit = this._hitTest(raw);
      var changed = false;
      if ((!hit && this.hover) || (hit && (!this.hover || hit.kind !== this.hover.kind || hit.id !== this.hover.id))) changed = true;
      this.hover = hit;
      if (changed) this.requestRender();
    }

    var snapped = this._needsSnapPreview() ? this.snapPoint(raw) : null;
    this.snapInfo = snapped;
    this._emitCursor(snapped ? snapped.point : raw);
    this.requestRender();
  };

  Editor2D.prototype._pointerUp = function (e) {
    if (this.pan) {
      this.pan = null;
      this._updateCursorStyle();
      this.requestRender();
      return;
    }
    if (this.drag) {
      var drag = this.drag;
      this.drag = null;
      this.store.historyCommit();
      this._updateCursorStyle();
      call(this.callbacks.onStatus, [drag.moved ? 'Objeto actualizado' : '']);
      this.requestRender();
      return;
    }
    if (this.marquee) {
      this._finishMarquee(e && e.shiftKey);
      return;
    }
  };

  Editor2D.prototype._needsSnapPreview = function () {
    return this.tool !== 'select' && this.tool !== 'pan';
  };

  Editor2D.prototype._emitCursor = function (world) {
    call(this.callbacks.onCursor, [world]);
  };

  Editor2D.prototype._currentWallPoint = function () {
    if (!this.drawing || !this.drawing.start) return null;
    var raw = this.cursor;
    if (this.snap.ortho) {
      raw = this._constrainOrtho(this.drawing.start, raw);
    }
    var snap = this.snapPoint(raw);
    this.snapInfo = snap;
    return snap.point;
  };

  // Crea un muro (recto o curvo) con historial y selección.
  Editor2D.prototype._createWall = function (a, b, curve) {
    var self = this;
    var label = curve ? (curve.type === 'arc' ? 'Crear muro en arco' : 'Crear muro spline') : 'Crear muro';
    var wall = this.store.act(label, function () {
      var w = {
        id: self.store.newId('w'), type: 'wall', level: self.store.activeLevel,
        layerId: 'walls', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y },
        thickness: self.store.project.settings.wallThickness || 150,
        height: self.store.project.settings.wallHeight || 2700,
        openings: []
      };
      if (curve) w.curve = curve;
      self.store.project.walls.push(w);
      return w;
    });
    this.store.setSelection([{ kind: 'wall', id: wall.id }]);
    call(this.callbacks.onPlaced, ['wall', wall]);
    this._emitStatus();
    this.requestRender();
    return wall;
  };

  Editor2D.prototype._wallDown = function (raw) {
    var snap = this.snapPoint(raw);
    if (!this.drawing) {
      this.drawing = { type: 'wall', start: snap.point, chainStart: snap.point, count: 0 };
      this._emitStatus();
      return;
    }
    var end = snap.point;
    if (this.snap.ortho) end = this._constrainOrtho(this.drawing.start, end);
    if (Geo.dist(this.drawing.start, end) < 40) return;
    this._createWall(this.drawing.start, end, null);
    this.drawing.count++;
    this.drawing.start = end;
    this._emitStatus();
  };

  // Muro en arco: 1.er clic inicio, 2.º clic fin, 3.er clic fija la curvatura.
  Editor2D.prototype._arcDown = function (raw) {
    var snap = this.snapPoint(raw).point;
    if (!this.drawing || this.drawing.type !== 'wallArc') {
      this.drawing = { type: 'wallArc', phase: 'end', start: snap, bulge: 0.3 };
      this._emitStatus();
      return;
    }
    if (this.drawing.phase === 'end') {
      if (Geo.dist(this.drawing.start, snap) < 100) return;
      this.drawing.end = snap;
      this.drawing.phase = 'bulge';
      this.drawing.bulge = 0.3;
      this._emitStatus();
      this.requestRender();
      return;
    }
    var bulge = Geo.clamp(this.drawing.bulge || 0, -4, 4);
    var start = this.drawing.start;
    var end = this.drawing.end;
    this.drawing = null;
    if (Math.abs(bulge) < 0.02) this._createWall(start, end, null);
    else this._createWall(start, end, { type: 'arc', bulge: Math.round(bulge * 1000) / 1000 });
  };

  // Muro spline: clics sucesivos; Enter/doble clic cierra con el último punto.
  Editor2D.prototype._splineDown = function (raw) {
    var snap = this.snapPoint(raw).point;
    if (!this.drawing || this.drawing.type !== 'wallSpline') {
      this.drawing = { type: 'wallSpline', pts: [snap] };
      this._emitStatus();
      return;
    }
    var pts = this.drawing.pts;
    if (Geo.dist(pts[pts.length - 1], snap) < 100) return;
    pts.push(snap);
    this._emitStatus();
    this.requestRender();
  };

  Editor2D.prototype._finishSpline = function (silent) {
    var d = this.drawing;
    if (!d || d.type !== 'wallSpline') return false;
    var pts = d.pts.slice();
    this.drawing = null;
    if (pts.length >= 2) {
      var a = pts[0], b = pts[pts.length - 1];
      var mid = pts.slice(1, -1);
      this._createWall(a, b, mid.length ? { type: 'spline', pts: mid } : null);
      if (!silent) call(this.callbacks.onStatus, ['Muro spline creado']);
    } else {
      this._emitStatus();
      this.requestRender();
    }
    return true;
  };

  // Termina la creación en curso (muro encadenado, spline o arco).
  Editor2D.prototype._finishDraw = function (silent) {
    if (!this.drawing) return false;
    if (this.drawing.type === 'wall') { this._finishChain(silent); return true; }
    if (this.drawing.type === 'wallSpline') return this._finishSpline(silent);
    if (this.drawing.type === 'wallArc') {
      this.drawing = null;
      this._emitStatus();
      this.requestRender();
      return true;
    }
    return false;
  };

  Editor2D.prototype._finishChain = function (silent) {
    if (this.drawing && this.drawing.type === 'wall') {
      this.drawing = null;
      this._emitStatus();
      this.requestRender();
      if (!silent) call(this.callbacks.onStatus, ['Muro terminado']);
    }
  };

  Editor2D.prototype._furnitureDown = function (raw) {
    if (!this.furnitureId) return;
    var def = ED.Library && ED.Library.get ? ED.Library.get(this.furnitureId) : null;
    if (!def) return;
    if (this.store.isLocked('furniture')) { call(this.callbacks.onError, ['La capa Mobiliario está bloqueada.']); return; }
    var snap = this.snapPoint(raw);
    var self = this;
    var item = this.store.act('Colocar mobiliario', function () {
      var it = {
        id: self.store.newId('i'), type: 'item', level: self.store.activeLevel,
        layerId: 'furniture', libId: def.id, x: snap.point.x, y: snap.point.y,
        rotation: self.furnitureRotation, w: def.w, d: def.d, h: def.h, name: def.name
      };
      self.store.project.items.push(it);
      return it;
    });
    call(this.callbacks.onPlaced, ['item', item]);
  };

  Editor2D.prototype._findWallForOpening = function (world) {
    var best = null, bestD = Infinity;
    var tol = 260;
    this.store.walls().forEach(function (w) {
      if (Geo.wallLength(w) < 1) return;
      if (Geo.wallIsCurved(w)) return;           // los muros curvos no admiten aberturas
      var d = Geo.distToSegment(world, w.a, w.b);
      if (d.dist < tol && d.dist < bestD) { bestD = d.dist; best = { wall: w, t: d.t, point: d.point }; }
    });
    return best;
  };

  Editor2D.prototype._openingDown = function (raw, type) {
    var hit = this._findWallForOpening(raw);
    if (!hit) { call(this.callbacks.onError, ['Acerca el cursor a un muro para insertar la abertura.']); return; }
    if (this.store.isLocked(hit.wall.layerId)) { call(this.callbacks.onError, ['El muro está en una capa bloqueada.']); return; }
    var len = Geo.wallLength(hit.wall);
    var width = type === 'door' ? 900 : 1200;
    if (len < width + 100) { call(this.callbacks.onError, ['El muro es demasiado corto para esta abertura.']); return; }
    var halfT = (width / 2) / len;
    var t = Geo.clamp(hit.t, halfT, 1 - halfT);
    var self = this;
    var opening = this.store.act(type === 'door' ? 'Insertar puerta' : 'Insertar ventana', function () {
      var o = {
        id: self.store.newId('o'), type: type, t: t, width: width,
        height: type === 'door' ? 2100 : 1200,
        sill: type === 'door' ? 0 : 900,
        swing: 1, hinge: 1
      };
      hit.wall.openings.push(o);
      hit.wall.openings.sort(function (a, b) { return a.t - b.t; });
      return o;
    });
    call(this.callbacks.onPlaced, [type, opening, hit.wall]);
    call(this.callbacks.onStatus, [type === 'door' ? 'Puerta insertada' : 'Ventana insertada']);
  };

  Editor2D.prototype._roomDown = function (raw) {
    var found = Geo.findRooms(this.store.project, this.store.activeLevel, { minArea: 1.2e6 });
    var hit = null;
    for (var i = found.length - 1; i >= 0; i--) {
      if (Geo.pointInPolygon(raw, found[i].polygon)) { hit = found[i]; break; }
    }
    if (!hit) { call(this.callbacks.onError, ['No se encontró un recinto cerrado en ese punto. Cierra los muros primero.']); return; }
    var duplicate = this.store.rooms().some(function (r) {
      return Geo.pointInPolygon(hit.centroid, r.polygon);
    });
    if (duplicate) { call(this.callbacks.onError, ['Este ambiente ya está registrado.']); return; }
    var self = this;
    var room = this.store.act('Crear ambiente', function () {
      var count = self.store.rooms().length + 1;
      var r = {
        id: self.store.newId('r'), type: 'room', level: self.store.activeLevel,
        layerId: 'rooms', name: 'Ambiente ' + count,
        polygon: hit.polygon, finish: 'wood',
        color: DEFAULT_ROOM_COLORS[(count - 1) % DEFAULT_ROOM_COLORS.length]
      };
      self.store.project.rooms.push(r);
      return r;
    });
    this.store.setSelection([{ kind: 'room', id: room.id }]);
    this.store.touch();
    call(this.callbacks.onPlaced, ['room', room]);
  };

  Editor2D.prototype._dimDown = function (raw) {
    var snap = this.snapPoint(raw);
    if (!this.drawing || this.drawing.type !== 'dim') {
      this.drawing = { type: 'dim', start: snap.point };
      this._emitStatus();
      return;
    }
    if (Geo.dist(this.drawing.start, snap.point) < 40) return;
    var self = this;
    var start = this.drawing.start;
    var end = snap.point;
    var dir = { x: end.x - start.x, y: end.y - start.y };
    var normal = { x: -dir.y, y: dir.x };
    var normLen = Math.sqrt(normal.x * normal.x + normal.y * normal.y) || 1;
    normal.x /= normLen; normal.y /= normLen;
    var dim = this.store.act('Crear cota', function () {
      var d = {
        id: self.store.newId('d'), type: 'dim', level: self.store.activeLevel,
        layerId: 'dimensions', a: { x: start.x, y: start.y }, b: { x: end.x, y: end.y },
        offset: -650
      };
      self.store.project.dims.push(d);
      return d;
    });
    this.drawing = null;
    call(this.callbacks.onPlaced, ['dim', dim]);
    this._emitStatus();
  };

  Editor2D.prototype._eraseAt = function (raw) {
    var hit = this._hitTest(raw);
    if (!hit) { call(this.callbacks.onError, ['No hay ningún objeto en ese punto.']); return; }
    var self = this;
    this.store.act('Eliminar objeto', function () {
      if (hit.kind === 'wall') self.store.remove('wall', hit.id);
      else if (hit.kind === 'item') self.store.remove('item', hit.id);
      else if (hit.kind === 'room') self.store.remove('room', hit.id);
      else if (hit.kind === 'text') self.store.remove('text', hit.id);
      else if (hit.kind === 'dim') self.store.remove('dim', hit.id);
    });
    this.hover = null;
    this.store.setSelection([]);
    call(this.callbacks.onStatus, ['Objeto eliminado']);
    this.requestRender();
  };

  // ---------------------------------------------------------------- selección y arrastre
  Editor2D.prototype._selectDown = function (raw, shift) {
    // Palancas del objeto ya seleccionado
    var selObj = this.store.selection.length === 1 ? this.store.getSelectionObjects()[0] : null;
    if (selObj) {
      if (selObj.kind === 'item') {
        var rh = this._rotateHandleScreen(selObj.obj);
        var rp = this.worldToScreen(raw);
        if (Geo.dist(rp, rh) <= 9) {
          this._startDrag(selObj.kind, selObj.obj, 'rotate', raw);
          return;
        }
      }
      if (selObj.kind === 'wall') {
        var ap = this.worldToScreen(selObj.obj.a);
        var bp = this.worldToScreen(selObj.obj.b);
        var mp = this.worldToScreen(raw);
        if (Geo.dist(mp, ap) <= 9) { this._startDrag('wall', selObj.obj, 'endpoint-a', raw); return; }
        if (Geo.dist(mp, bp) <= 9) { this._startDrag('wall', selObj.obj, 'endpoint-b', raw); return; }
        var chs = this._wallCurveHandles(selObj.obj);
        for (var chi = 0; chi < chs.length; chi++) {
          if (Geo.dist(mp, this.worldToScreen(chs[chi].point)) <= 9) {
            this._startDrag('wall', selObj.obj, 'curve-' + chi, raw);
            return;
          }
        }
      }
    }

    var hit = this._hitTest(raw);
    if (!hit) {
      if (!shift) this.store.setSelection([]);
      this.marquee = { a: raw, b: raw, additive: !!shift };
      this.requestRender();
      return;
    }
    if (hit.kind === 'dim' && selObj && selObj.kind === 'dim') {
      var gp = this.worldToScreen(raw);
      var g = this._dimGeometry(hit.obj);
      if (Geo.dist(gp, this.worldToScreen(g.pa)) <= 9 || Geo.dist(gp, this.worldToScreen(g.pb)) <= 9) {
        this._startDrag('dim', hit.obj, 'move', raw);
        return;
      }
    }
    var sel = [{ kind: hit.kind, id: hit.id }];
    if (shift) {
      var exists = this.store.selection.some(function (s) { return s.kind === hit.kind && s.id === hit.id; });
      sel = exists ? this.store.selection.filter(function (s) { return !(s.kind === hit.kind && s.id === hit.id); })
        : this.store.selection.concat(sel);
    }
    this.store.setSelection(sel);
    if (hit.kind !== 'room') {
      this._startDrag(hit.kind, hit.obj, 'move', raw);
    }
    this.requestRender();
  };

  Editor2D.prototype._startDrag = function (kind, obj, mode, raw) {
    var self = this;
    this.store.historyBegin(mode === 'rotate' ? 'Rotar objeto' : 'Mover objeto');
    var orig = Geo.deepClone(obj);
    this.drag = {
      kind: kind, obj: obj, orig: orig, mode: mode,
      startWorld: { x: raw.x, y: raw.y }, startAngle: Geo.angle({ x: obj.x || 0, y: obj.y || 0 }, raw),
      moved: false,
      startCursor: this.worldToScreen(raw)
    };
    this._updateCursorStyle();
    this.canvas.style.cursor = mode === 'rotate' ? 'crosshair' : 'move';
    this._dragMove(raw, false);
    return self;
  };

  Editor2D.prototype._dragMove = function (raw, shift) {
    var d = this.drag;
    if (!d) return;
    if (!d.moved && Geo.dist(raw, d.startWorld) * this.view.zoom < 2) return;
    d.moved = true;
    var obj = d.obj;
    var gc = this._gridConfig();
    var grid = this.snap.grid !== false ? gc.step : 0;

    if (d.kind === 'item') {
      if (d.mode === 'rotate') {
        var ang = Geo.radToDeg(Geo.angle({ x: obj.x, y: obj.y }, raw)) - Geo.radToDeg(d.startAngle);
        var rot = Geo.normDeg((d.orig.rotation || 0) + ang);
        if (shift) rot = Math.round(rot / 15) * 15;
        obj.rotation = Geo.round(rot, 1);
      } else {
        var dx = raw.x - d.startWorld.x;
        var dy = raw.y - d.startWorld.y;
        if (shift) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0;
        }
        var nx = d.orig.x + dx, ny = d.orig.y + dy;
        if (grid) {
          nx = gridAxis(nx, gc.ox, grid);
          ny = gridAxis(ny, gc.oy, grid);
        }
        obj.x = nx; obj.y = ny;
      }
    } else if (d.kind === 'wall') {
      if (d.mode === 'endpoint-a' || d.mode === 'endpoint-b') {
        var snapW = this.snapPoint(raw);
        var ptW = snapW.point;
        if (d.mode === 'endpoint-a') { obj.a.x = ptW.x; obj.a.y = ptW.y; }
        else { obj.b.x = ptW.x; obj.b.y = ptW.y; }
      } else if (d.mode.indexOf('curve-') === 0) {
        if (!obj.curve) return;
        if (obj.curve.type === 'arc') {
          var bgl = Geo.bulgeFromPoint(obj.a, obj.b, raw);
          obj.curve = { type: 'arc', bulge: Math.round(bgl * 1000) / 1000 };
          call(this.callbacks.onStatus, ['Arco · flecha ' +
            Geo.formatLength(Math.abs(obj.curve.bulge) * Geo.dist(obj.a, obj.b) / 2, this._units())]);
        } else if (obj.curve.type === 'spline') {
          var idx = Number(d.mode.split('-')[1]) || 0;
          var origPts = (d.orig.curve && d.orig.curve.pts) ? d.orig.curve.pts : obj.curve.pts;
          var pts2 = origPts.map(function (p) { return { x: p.x, y: p.y }; });
          if (pts2[idx]) {
            var sp2 = this.snapPoint(raw).point;
            pts2[idx] = { x: sp2.x, y: sp2.y };
          }
          obj.curve = { type: 'spline', pts: pts2 };
          call(this.callbacks.onStatus, ['Spline · ' + pts2.length + ' punto(s) de control']);
        }
      } else {
        var wdx = raw.x - d.startWorld.x;
        var wdy = raw.y - d.startWorld.y;
        if (shift) { if (Math.abs(wdx) > Math.abs(wdy)) wdy = 0; else wdx = 0; }
        var ax = d.orig.a.x + wdx, ay = d.orig.a.y + wdy;
        if (grid) { ax = gridAxis(ax, gc.ox, grid); ay = gridAxis(ay, gc.oy, grid); }
        var realDx = ax - d.orig.a.x, realDy = ay - d.orig.a.y;
        obj.a.x = ax; obj.a.y = ay;
        obj.b.x = d.orig.b.x + realDx; obj.b.y = d.orig.b.y + realDy;
        if (obj.curve && obj.curve.type === 'spline' && d.orig.curve && d.orig.curve.pts) {
          obj.curve = {
            type: 'spline',
            pts: d.orig.curve.pts.map(function (p) { return { x: p.x + realDx, y: p.y + realDy }; })
          };
        }
      }
    } else if (d.kind === 'room') {
      var rdx = raw.x - d.startWorld.x, rdy = raw.y - d.startWorld.y;
      if (shift) { if (Math.abs(rdx) > Math.abs(rdy)) rdy = 0; else rdx = 0; }
      obj.polygon = d.orig.polygon.map(function (p) { return { x: p.x + rdx, y: p.y + rdy }; });
    } else if (d.kind === 'text' || d.kind === 'dim') {
      var tdx = raw.x - d.startWorld.x, tdy = raw.y - d.startWorld.y;
      if (shift) { if (Math.abs(tdx) > Math.abs(tdy)) tdy = 0; else tdx = 0; }
      if (d.kind === 'text') {
        obj.x = d.orig.x + tdx; obj.y = d.orig.y + tdy;
        if (grid) { obj.x = gridAxis(obj.x, gc.ox, grid); obj.y = gridAxis(obj.y, gc.oy, grid); }
      } else {
        obj.a = { x: d.orig.a.x + tdx, y: d.orig.a.y + tdy };
        obj.b = { x: d.orig.b.x + tdx, y: d.orig.b.y + tdy };
      }
    }
    this.store.touch();
    this._emitCursor(raw);
    call(this.callbacks.onStatus, ['Mover · ' + Geo.formatLength(Geo.dist(d.startWorld, raw), this._units())]);
    this.requestRender();
  };

  Editor2D.prototype._finishMarquee = function (shift) {
    var m = this.marquee;
    if (!m) return;
    this.marquee = null;
    var b = Geo.bounds([m.a, m.b]);
    if (b.w * this.view.zoom < 4 && b.h * this.view.zoom < 4) {
      this.requestRender();
      return;
    }
    var hits = [];
    var self = this;
    var existing = shift ? this.store.selection.slice() : [];
    function addHit(kind, id) {
      if (!existing.some(function (s) { return s.kind === kind && s.id === id; })) hits.push({ kind: kind, id: id });
    }
    this.store.items().forEach(function (it) {
      var p = { x: it.x, y: it.y };
      if (p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY) addHit('item', it.id);
    });
    this.store.texts().forEach(function (t) {
      if (t.x >= b.minX && t.x <= b.maxX && t.y >= b.minY && t.y <= b.maxY) addHit('text', t.id);
    });
    this.store.walls().forEach(function (w) {
      var mid = Geo.wallPointAt(w, 0.5);
      if (mid.x >= b.minX && mid.x <= b.maxX && mid.y >= b.minY && mid.y <= b.maxY) addHit('wall', w.id);
    });
    this.store.rooms().forEach(function (r) {
      var c = Geo.polygonCentroid(r.polygon);
      if (c.x >= b.minX && c.x <= b.maxX && c.y >= b.minY && c.y <= b.maxY) addHit('room', r.id);
    });
    this.store.setSelection(existing.concat(hits));
    this.requestRender();
  };

  // ---------------------------------------------------------------- hit testing
  Editor2D.prototype._hitTest = function (p) {
    var self = this;
    var i, obj, local;
    // items
    for (i = this.store.project.items.length - 1; i >= 0; i--) {
      obj = this.store.project.items[i];
      if (obj.level !== this.store.activeLevel || !this.store.isVisible(obj.layerId) || this.store.isLocked(obj.layerId)) continue;
      var dx = p.x - obj.x, dy = p.y - obj.y;
      var r = Geo.degToRad(obj.rotation || 0);
      var c = Math.cos(r), s = Math.sin(r);
      local = { x: dx * c + dy * s, y: -dx * s + dy * c };
      var pad = 6 / this.view.zoom;
      if (Math.abs(local.x) <= obj.w / 2 + pad && Math.abs(local.y) <= obj.d / 2 + pad) {
        return { kind: 'item', id: obj.id, obj: obj };
      }
    }
    // texts
    for (i = this.store.project.texts.length - 1; i >= 0; i--) {
      obj = this.store.project.texts[i];
      if (obj.level !== this.store.activeLevel || !this.store.isVisible(obj.layerId) || this.store.isLocked(obj.layerId)) continue;
      var tdx = p.x - obj.x, tdy = p.y - obj.y;
      var tr = Geo.degToRad(obj.rotation || 0);
      var tc = Math.cos(tr), ts = Math.sin(tr);
      local = { x: tdx * tc + tdy * ts, y: -tdx * ts + tdy * tc };
      var tw = Math.max(300, (obj.text || '').length * obj.size * 0.58);
      if (local.x >= -100 && local.x <= tw && local.y >= -obj.size * 0.3 && local.y <= obj.size * 1.25) {
        return { kind: 'text', id: obj.id, obj: obj };
      }
    }
    // dimensiones
    for (i = this.store.project.dims.length - 1; i >= 0; i--) {
      obj = this.store.project.dims[i];
      if (obj.level !== this.store.activeLevel || !this.store.isVisible(obj.layerId) || this.store.isLocked(obj.layerId)) continue;
      var g = this._dimGeometry(obj);
      if (Geo.distToSegment(p, g.pa, g.pb).dist <= Math.max(60, 7 / this.view.zoom)) {
        return { kind: 'dim', id: obj.id, obj: obj };
      }
    }
    // muros
    for (i = this.store.project.walls.length - 1; i >= 0; i--) {
      obj = this.store.project.walls[i];
      if (obj.level !== this.store.activeLevel || !this.store.isVisible(obj.layerId) || this.store.isLocked(obj.layerId)) continue;
      var dw = Geo.distToWall(p, obj);
      if (dw.dist <= (obj.thickness || 150) / 2 + Math.max(30, 5 / this.view.zoom)) {
        return { kind: 'wall', id: obj.id, obj: obj };
      }
    }
    // recintos
    for (i = this.store.project.rooms.length - 1; i >= 0; i--) {
      obj = this.store.project.rooms[i];
      if (obj.level !== this.store.activeLevel || !this.store.isVisible(obj.layerId) || this.store.isLocked(obj.layerId)) continue;
      if (Geo.pointInPolygon(p, obj.polygon)) return { kind: 'room', id: obj.id, obj: obj };
    }
    return null;
  };

  // ---------------------------------------------------------------- teclado, zoom
  Editor2D.prototype._wheel = function (e) {
    e.preventDefault();
    var p = this._eventPoint(e);
    var before = this.screenToWorld(p.sx, p.sy);
    var factor = Math.exp(-e.deltaY * 0.0014);
    this.view.zoom = Geo.clamp(this.view.zoom * factor, 0.002, 1.5);
    this.view.x = before.x - (p.sx - this.w / 2) / this.view.zoom;
    this.view.y = before.y + (p.sy - this.h / 2) / this.view.zoom;
    this.requestRender();
  };

  Editor2D.prototype._keyDown = function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (e.key === 'Escape') {
      if (this.cancel()) e.preventDefault();
    } else if (e.key === 'Enter') {
      if (this.drawing && (this.drawing.type === 'wall' || this.drawing.type === 'wallSpline')) {
        this._finishDraw();
        e.preventDefault();
      } else if (this.drawing && this.drawing.type === 'wallArc') {
        if (this.drawing.phase === 'bulge') this._arcDown(this.cursor);
        else this._finishDraw(true);
        e.preventDefault();
      } else if (this.drawing && this.drawing.type === 'dim') { this.cancel(); e.preventDefault(); }
    } else if (e.key === ' ') {
      if (!this.spaceDown) {
        this.spaceDown = true;
        this._updateCursorStyle();
        e.preventDefault();
      }
    } else if (e.key === 'r' || e.key === 'R') {
      if (this.tool === 'furniture') {
        this.furnitureRotation = Geo.normDeg(this.furnitureRotation + 90);
        this.requestRender();
        e.preventDefault();
      }
    }
  };

  Editor2D.prototype._keyUp = function (e) {
    if (e.key === ' ') {
      this.spaceDown = false;
      this._updateCursorStyle();
      if (this.pan) this.pan = null;
    }
  };

  Editor2D.prototype._dblClick = function () {
    if (this.tool === 'wall' || this.tool === 'wallSpline') this._finishDraw();
  };

  Editor2D.prototype.cancel = function () {
    var did = false;
    if (this.drag) {
      this.store.historyCancel();
      this.drag = null;
      did = true;
    }
    if (this.drawing) { this.drawing = null; did = true; }
    if (this.marquee) { this.marquee = null; did = true; }
    if (this.pan) { this.pan = null; did = true; }
    this.snapInfo = null;
    this._updateCursorStyle();
    this.requestRender();
    return did;
  };

  Editor2D.prototype.detectRooms = function () {
    var self = this;
    var found = Geo.findRooms(this.store.project, this.store.activeLevel, { minArea: 1.2e6 });
    var existing = this.store.rooms();
    var toAdd = [];
    for (var i = 0; i < found.length; i++) {
      var f = found[i];
      var dup = existing.some(function (r) {
        return Geo.pointInPolygon(f.centroid, r.polygon) || Geo.pointInPolygon(Geo.polygonCentroid(r.polygon), f.polygon);
      });
      if (!dup) toAdd.push(f);
    }
    if (!toAdd.length) return 0;
    this.store.historyBegin('Detectar ambientes');
    var count = this.store.rooms().length;
    for (var k = 0; k < toAdd.length; k++) {
      count++;
      this.store.project.rooms.push({
        id: this.store.newId('r'), type: 'room', level: this.store.activeLevel,
        layerId: 'rooms', name: 'Ambiente ' + count, polygon: toAdd[k].polygon,
        finish: 'wood', color: DEFAULT_ROOM_COLORS[(count - 1) % DEFAULT_ROOM_COLORS.length]
      });
    }
    this.store.touch();
    this.store.historyCommit();
    this.requestRender();
    return toAdd.length;
  };

  Editor2D.prototype.destroy = function () {
    this._destroyed = true;
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._resizeFallback) window.removeEventListener('resize', this._resizeFallback);
    this.canvas.removeEventListener('pointerdown', this._onDown);
    this.canvas.removeEventListener('pointermove', this._onMove);
    this.canvas.removeEventListener('pointerup', this._onUp);
    this.canvas.removeEventListener('pointercancel', this._onUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('dblclick', this._onDbl);
    this.canvas.removeEventListener('contextmenu', this._onCtx);
    this.canvas.removeEventListener('pointerleave', this._onLeave);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  };

  ED.Editor2D = Editor2D;
})(window.EngDraft = window.EngDraft || {});

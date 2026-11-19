/* EngDraft — estado del proyecto, historial, selección y autoguardado */
(function (ED) {
  'use strict';

  var SCHEMA = 'engdraft/v1';
  var STORAGE_KEY = 'engdraft.autosave.v1';

  var KIND_MAP = {
    wall: 'walls', room: 'rooms', item: 'items',
    text: 'texts', dim: 'dims'
  };

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  var DEFAULT_LAYERS = [
    { id: 'walls', name: 'Muros', color: '#263238', visible: true, locked: false },
    { id: 'openings', name: 'Aberturas', color: '#2e7d8f', visible: true, locked: false },
    { id: 'furniture', name: 'Mobiliario', color: '#6b7c93', visible: true, locked: false },
    { id: 'rooms', name: 'Ambientes', color: '#6aa89a', visible: true, locked: false },
    { id: 'annotation', name: 'Anotaciones', color: '#1f2937', visible: true, locked: false },
    { id: 'dimensions', name: 'Cotas', color: '#b5651d', visible: true, locked: false }
  ];

  function finiteNumber(value, fallback) {
    var x = Number(value);
    return isFinite(x) ? x : fallback;
  }

  function gridNumber(value, fallback, min, max) {
    var x = finiteNumber(value, fallback);
    if (x < min) x = min;
    if (x > max) x = max;
    return x;
  }

  function normalizeProject(input) {
    if (!input || typeof input !== 'object') throw new Error('El archivo no contiene un proyecto válido.');
    var p = input;
    if (!Array.isArray(p.levels) || !p.levels.length) throw new Error('El proyecto no tiene niveles definidos.');
    p.schema = SCHEMA;
    p.meta = p.meta || {};
    var meta = p.meta;
    meta.name = meta.name || 'Proyecto sin nombre';
    meta.client = meta.client || '';
    meta.location = meta.location || '';
    meta.engineer = meta.engineer || '';
    meta.license = meta.license || '';
    meta.phone = meta.phone || '';
    meta.email = meta.email || '';
    meta.date = meta.date || todayISO();
    meta.revision = meta.revision || 'A';
    meta.description = meta.description || '';
    meta.notes = meta.notes || '';

    p.settings = p.settings || {};
    var s = p.settings;
    s.units = ED.Geo.normalizeUnit(s.units);
    // Rejilla configurable: separación menor (mm), línea maestra, origen y paso
    // de ajuste. snapStep 0 significa "usar la misma separación de la rejilla".
    s.grid = gridNumber(s.grid, 250, 5, 100000);
    s.gridMajor = Math.round(gridNumber(s.gridMajor, 4, 2, 50));
    s.gridOriginX = gridNumber(s.gridOriginX, 0, -1e7, 1e7);
    s.gridOriginY = gridNumber(s.gridOriginY, 0, -1e7, 1e7);
    s.snapStep = gridNumber(s.snapStep, 0, 0, 100000);
    s.gridAdaptive = s.gridAdaptive !== false;
    s.gridStyle = s.gridStyle === 'dots' ? 'dots' : 'lines';
    s.showAxes = s.showAxes !== false;
    s.wallThickness = s.wallThickness || 150;
    s.wallHeight = s.wallHeight || 2700;
    s.floorHeight = s.floorHeight || 2800;
    s.northAngle = s.northAngle || 0;
    s.autoDim = s.autoDim !== false;

    var seenLayers = {};
    p.layers = (Array.isArray(p.layers) ? p.layers : []).filter(function (l) { return l && l.id; });
    p.layers.forEach(function (l) {
      seenLayers[l.id] = true;
      l.name = l.name || l.id;
      l.color = l.color || '#667788';
      l.visible = l.visible !== false;
      l.locked = !!l.locked;
    });
    DEFAULT_LAYERS.forEach(function (l) {
      if (!seenLayers[l.id]) p.layers.push(ED.Geo.deepClone(l));
    });

    p.levels = p.levels.filter(function (l) { return l && l.id; }).map(function (l, idx) {
      l.name = l.name || ('Nivel ' + (idx + 1));
      l.elevation = Number(l.elevation) || 0;
      l.height = Number(l.height) || s.wallHeight || 2700;
      return l;
    });
    if (!p.levels.length) throw new Error('El proyecto no tiene niveles definidos.');
    var levelIds = {};
    p.levels.forEach(function (l) { levelIds[l.id] = true; });
    var firstLevel = p.levels[0].id;

    function arr(name) {
      if (!Array.isArray(p[name])) p[name] = [];
      return p[name];
    }
    arr('walls'); arr('rooms'); arr('items'); arr('texts'); arr('dims'); arr('sheets');

    p.walls = p.walls.filter(function (w) { return w && w.a && w.b; });
    p.walls.forEach(function (w) {
      w.id = w.id || ED.Geo.uid('w');
      w.type = 'wall';
      w.level = levelIds[w.level] ? w.level : firstLevel;
      w.layerId = w.layerId || 'walls';
      w.thickness = Number(w.thickness) || p.settings.wallThickness;
      w.height = Number(w.height) || p.settings.wallHeight;
      w.openings = (Array.isArray(w.openings) ? w.openings : []).filter(function (o) { return o && o.type; });
      w.openings.forEach(function (o) {
        o.id = o.id || ED.Geo.uid('o');
        o.t = ED.Geo.clamp(Number(o.t) || 0.5, 0, 1);
        o.width = Number(o.width) || 900;
        o.height = Number(o.height) || (o.type === 'window' ? 1200 : 2100);
        o.sill = Number(o.sill) || 0;
        o.swing = o.swing === -1 ? -1 : 1;
        o.hinge = o.hinge === -1 ? -1 : 1;
      });
      w.openings.sort(function (a, b) { return a.t - b.t; });
    });

    p.rooms = p.rooms.filter(function (r) { return r && Array.isArray(r.polygon) && r.polygon.length >= 3; });
    p.rooms.forEach(function (r) {
      r.id = r.id || ED.Geo.uid('r');
      r.type = 'room';
      r.level = levelIds[r.level] ? r.level : firstLevel;
      r.layerId = r.layerId || 'rooms';
      r.name = r.name || 'Ambiente';
      r.finish = r.finish || 'wood';
      r.polygon = r.polygon.filter(function (pt) { return pt && isFinite(pt.x) && isFinite(pt.y); });
    });

    p.items = p.items.filter(function (i) { return i && i.libId; });
    p.items.forEach(function (i) {
      i.id = i.id || ED.Geo.uid('i');
      i.type = 'item';
      i.level = levelIds[i.level] ? i.level : firstLevel;
      i.layerId = i.layerId || 'furniture';
      i.x = Number(i.x) || 0;
      i.y = Number(i.y) || 0;
      i.rotation = Number(i.rotation) || 0;
      i.w = Number(i.w) || 600;
      i.d = Number(i.d) || 600;
      i.h = Number(i.h) || 800;
    });

    p.texts = p.texts.filter(function (t) { return t && typeof t.text === 'string'; });
    p.texts.forEach(function (t) {
      t.id = t.id || ED.Geo.uid('t');
      t.type = 'text';
      t.level = levelIds[t.level] ? t.level : firstLevel;
      t.layerId = t.layerId || 'annotation';
      t.x = Number(t.x) || 0;
      t.y = Number(t.y) || 0;
      t.size = Number(t.size) || 300;
      t.rotation = Number(t.rotation) || 0;
    });

    p.dims = p.dims.filter(function (d) { return d && d.a && d.b; });
    p.dims.forEach(function (d) {
      d.id = d.id || ED.Geo.uid('d');
      d.type = 'dim';
      d.level = levelIds[d.level] ? d.level : firstLevel;
      d.layerId = d.layerId || 'dimensions';
      d.offset = Number(d.offset) || 700;
    });

    p.sheets = p.sheets.filter(function (s) { return s && s.size; });
    p.sheets.forEach(function (sh, idx) {
      sh.id = sh.id || ED.Geo.uid('s');
      sh.name = sh.name || ('Lámina ' + (idx + 1));
      sh.size = sh.size || 'A3';
      sh.orientation = sh.orientation === 'portrait' ? 'portrait' : 'landscape';
      sh.template = sh.template || 'modern';
      sh.scale = Number(sh.scale) || 100;
      sh.content = sh.content || 'plan';
      sh.levelId = levelIds[sh.levelId] ? sh.levelId : firstLevel;
      sh.sheetNo = sh.sheetNo || ('A-' + String(idx + 1).padStart(2, '0'));
      sh.title = sh.title || sh.name;
      sh.notes = sh.notes || '';
      sh.showDims = sh.showDims !== false;
      sh.showFurniture = sh.showFurniture !== false;
      sh.showRooms = sh.showRooms !== false;
      sh.showGrid = !!sh.showGrid;
    });

    return p;
  }

  function Store(project) {
    this.project = normalizeProject(ED.Geo.deepClone(project));
    this.activeLevel = this.project.levels[0].id;
    this.selection = [];
    this._listeners = [];
    this._undo = [];
    this._redo = [];
    this._pending = null;
    this._pendingDirty = false;
    this._saveTimer = null;
    this._lastSaved = null;
    this._mutating = false;
  }

  Store.prototype.on = function (fn) {
    if (typeof fn !== 'function') return function () {};
    this._listeners.push(fn);
    var self = this;
    return function () { self.off(fn); };
  };

  Store.prototype.off = function (fn) {
    var i = this._listeners.indexOf(fn);
    if (i >= 0) this._listeners.splice(i, 1);
  };

  Store.prototype.emit = function (type, detail) {
    var evt = { type: type, detail: detail || null, store: this };
    var list = this._listeners.slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i](evt); } catch (err) { console.error('[EngDraft store]', err); }
    }
  };

  Store.prototype.levels = function () {
    return this.project.levels;
  };

  Store.prototype.activeLevelObj = function () {
    var id = this.activeLevel;
    for (var i = 0; i < this.project.levels.length; i++) {
      if (this.project.levels[i].id === id) return this.project.levels[i];
    }
    return this.project.levels[0];
  };

  Store.prototype.setActiveLevel = function (id) {
    if (!id || id === this.activeLevel) return;
    var exists = this.project.levels.some(function (l) { return l.id === id; });
    if (!exists) return;
    this.activeLevel = id;
    this.selection = [];
    this.emit('level', id);
    this.emit('selection', this.selection);
    this.emit('change', { reason: 'level' });
    this.scheduleSave();
  };

  Store.prototype.byLevel = function (name) {
    var level = this.activeLevel;
    return this.project[name].filter(function (o) { return o.level === level; });
  };

  Store.prototype.walls = function () { return this.byLevel('walls'); };
  Store.prototype.rooms = function () { return this.byLevel('rooms'); };
  Store.prototype.items = function () { return this.byLevel('items'); };
  Store.prototype.texts = function () { return this.byLevel('texts'); };
  Store.prototype.dims = function () { return this.byLevel('dims'); };

  Store.prototype.newId = function (prefix) {
    return ED.Geo.uid(prefix);
  };

  Store.prototype.find = function (kind, id) {
    var name = KIND_MAP[kind];
    if (!name) return null;
    var list = this.project[name];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  };

  Store.prototype.remove = function (kind, id) {
    var name = KIND_MAP[kind];
    if (!name) return null;
    var list = this.project[name];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        var removed = list.splice(i, 1)[0];
        this.selection = this.selection.filter(function (s) { return !(s.kind === kind && s.id === id); });
        return removed;
      }
    }
    return null;
  };

  Store.prototype.getLayer = function (id) {
    for (var i = 0; i < this.project.layers.length; i++) {
      if (this.project.layers[i].id === id) return this.project.layers[i];
    }
    return { id: id, name: id, color: '#667788', visible: true, locked: false };
  };

  Store.prototype.isVisible = function (layerId) {
    var l = this.getLayer(layerId);
    return l.visible !== false;
  };

  Store.prototype.isLocked = function (layerId) {
    var l = this.getLayer(layerId);
    return !!l.locked;
  };

  Store.prototype.setSelection = function (selection) {
    this.selection = (selection || []).filter(function (s) { return s && s.kind && s.id; });
    this.emit('selection', this.selection);
  };

  Store.prototype.getSelectionObjects = function () {
    var self = this;
    return this.selection.map(function (s) { return { kind: s.kind, obj: self.find(s.kind, s.id) }; })
      .filter(function (x) { return !!x.obj; });
  };

  Store.prototype.historyBegin = function (label) {
    if (this._pending) return;
    this._pending = {
      snapshot: ED.Geo.deepClone(this.project),
      activeLevel: this.activeLevel,
      label: label || 'Cambio'
    };
    this._pendingDirty = false;
  };

  Store.prototype.historyCommit = function () {
    if (!this._pending) return;
    if (this._pendingDirty) {
      this._undo.push(this._pending);
      if (this._undo.length > 60) this._undo.shift();
      this._redo = [];
    }
    this._pending = null;
    this._pendingDirty = false;
  };

  Store.prototype.historyCancel = function () {
    if (!this._pending) return;
    var pending = this._pending;
    this.project = pending.snapshot;
    this.activeLevel = pending.activeLevel;
    this.selection = [];
    this._pending = null;
    this._pendingDirty = false;
    this.emit('change', { reason: 'cancel' });
    this.emit('selection', this.selection);
  };

  Store.prototype.act = function (label, fn) {
    this.historyBegin(label);
    try {
      var result = fn();
      this.touch();
      this.historyCommit();
      return result;
    } catch (err) {
      this.historyCommit();
      throw err;
    }
  };

  Store.prototype.undo = function () {
    if (this._pending) this.historyCommit();
    if (!this._undo.length) return false;
    var current = {
      snapshot: ED.Geo.deepClone(this.project),
      activeLevel: this.activeLevel,
      label: 'Rehacer'
    };
    this._redo.push(current);
    var entry = this._undo.pop();
    this.project = normalizeProject(entry.snapshot);
    this._restoreLevel(entry.activeLevel);
    this.selection = [];
    this.emit('change', { reason: 'undo' });
    this.emit('selection', this.selection);
    this.scheduleSave();
    return true;
  };

  Store.prototype.redo = function () {
    if (!this._redo.length) return false;
    var current = {
      snapshot: ED.Geo.deepClone(this.project),
      activeLevel: this.activeLevel,
      label: 'Deshacer'
    };
    this._undo.push(current);
    var entry = this._redo.pop();
    this.project = normalizeProject(entry.snapshot);
    this._restoreLevel(entry.activeLevel);
    this.selection = [];
    this.emit('change', { reason: 'redo' });
    this.emit('selection', this.selection);
    this.scheduleSave();
    return true;
  };

  Store.prototype._restoreLevel = function (id) {
    var ok = this.project.levels.some(function (l) { return l.id === id; });
    this.activeLevel = ok ? id : this.project.levels[0].id;
  };

  Store.prototype.canUndo = function () { return this._undo.length > 0; };
  Store.prototype.canRedo = function () { return this._redo.length > 0; };
  Store.prototype.undoLabel = function () {
    return this._undo.length ? this._undo[this._undo.length - 1].label : '';
  };

  Store.prototype.touch = function (reason) {
    this._pendingDirty = true;
    this.emit('change', { reason: reason || 'edit' });
    this.scheduleSave();
  };

  Store.prototype.scheduleSave = function () {
    var self = this;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(function () {
      self._saveTimer = null;
      self.saveLocal();
    }, 700);
  };

  Store.prototype.saveLocal = function () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
      this._lastSaved = new Date();
      this.emit('saved', this._lastSaved);
      return true;
    } catch (err) {
      console.warn('No se pudo autoguardar:', err);
      return false;
    }
  };

  Store.prototype.loadLocal = function () {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return normalizeProject(JSON.parse(raw));
    } catch (err) {
      return null;
    }
  };

  Store.prototype.clearLocal = function () {
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
  };

  Store.prototype.exportJSON = function () {
    return JSON.stringify(this.project, null, 2);
  };

  Store.prototype.importJSON = function (str) {
    var raw;
    try {
      raw = typeof str === 'string' ? JSON.parse(str) : str;
    } catch (err) {
      throw new Error('El archivo no es un JSON válido.');
    }
    var project = normalizeProject(raw);
    this.project = project;
    this.activeLevel = project.levels[0].id;
    this.selection = [];
    this._undo = [];
    this._redo = [];
    this._pending = null;
    this.emit('change', { reason: 'import' });
    this.emit('selection', this.selection);
    this.emit('level', this.activeLevel);
    this.saveLocal();
    return project;
  };

  Store.prototype.replaceProject = function (project) {
    return this.importJSON(project);
  };

  Store.prototype.stats = function () {
    var self = this;
    var roomArea = 0;
    this.rooms().forEach(function (r) { roomArea += ED.Geo.polygonArea(r.polygon); });
    var wallLen = 0;
    this.walls().forEach(function (w) { wallLen += ED.Geo.wallLength(w); });
    var items = this.items().length;
    return {
      roomArea: roomArea,
      wallLength: wallLen,
      wallCount: this.walls().length,
      roomCount: this.rooms().length,
      itemCount: items,
      levelName: this.activeLevelObj().name
    };
  };

  Store.prototype.allStats = function () {
    var area = 0;
    this.project.rooms.forEach(function (r) { area += ED.Geo.polygonArea(r.polygon); });
    return { roomArea: area, rooms: this.project.rooms.length, items: this.project.items.length };
  };

  Store.normalizeProject = normalizeProject;
  Store.STORAGE_KEY = STORAGE_KEY;
  ED.Store = Store;
})(window.EngDraft = window.EngDraft || {});

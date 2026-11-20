/* EngDraft — estado del proyecto, historial, selección y autoguardado */
(function (ED) {
  'use strict';

  var SCHEMA = 'engdraft/v1';
  var STORAGE_KEY = 'engdraft.autosave.v1';

  var KIND_MAP = {
    wall: 'walls', room: 'rooms', item: 'items',
    text: 'texts', dim: 'dims', line: 'lines'
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

  var ROOF_STYLES = { flat: 1, gable: 1, hip: 1, arc: 1, spline: 1, custom: 1 };
  var ROOF_RIDGES = { auto: 1, x: 1, y: 1 };
  var ROOF_STRUCTURES = { none: 1, steel: 1, concrete: 1, wood: 1 };
  // Subtipos de aberturas (CONTRACT §17.1).
  var OPENING_SUBTYPES = {
    door: { single: 1, double: 1, sliding: 1 },
    window: { fixed: 1, sliding: 1, double: 1, awning: 1 },
    garage: { sectional: 1, sliding: 1 },
    pass: {}
  };
  var OPENING_DEFAULTS = { door: 'single', window: 'fixed', garage: 'sectional', pass: '' };

  var WALL_TEXTURES = { stucco: 1, brick: 1, wood: 1, stone: 1, smooth: 1 };
  var ROOF_TEXTURES = { tile: 1, shingle: 1, metal: 1, wood: 1, concrete: 1, smooth: 1 };
  var GROUND_TEXTURES = { grass: 1, paving: 1, gravel: 1, smooth: 1 };

  // Perfil de techo personalizado: [{t:0..1, z:mm}], 2..24 puntos ordenados.
  function normalizeRoofProfile(list) {
    var raw = Array.isArray(list) ? list : [];
    var out = raw.filter(function (p) {
      return p && isFinite(Number(p.t)) && isFinite(Number(p.z));
    }).slice(0, 24).map(function (p) {
      return { t: Math.round(ED.Geo.clamp(Number(p.t), 0, 1) * 1000) / 1000, z: ED.Geo.clamp(Number(p.z), 0, 8000) };
    });
    out.sort(function (a, b) { return a.t - b.t; });
    // Sin duplicados de t y con los extremos forzados.
    var clean = [];
    out.forEach(function (p) {
      if (clean.length && Math.abs(clean[clean.length - 1].t - p.t) < 0.002) return;
      clean.push(p);
    });
    if (clean.length < 2) return null;
    if (clean[0].t > 0.001) clean.unshift({ t: 0, z: 0 });
    else clean[0] = { t: 0, z: clean[0].z };
    if (clean[clean.length - 1].t < 0.999) clean.push({ t: 1, z: 0 });
    else clean[clean.length - 1] = { t: 1, z: clean[clean.length - 1].z };
    // CONTRACT §15.1: máximo 24 puntos; al forzar extremos puede crecer uno o dos.
    if (clean.length > 24) {
      var inner = clean.slice(1, clean.length - 1);
      var picked = [clean[0]];
      var need = 22;
      for (var k = 0; k < need; k++) {
        var idx = Math.round(k * (inner.length - 1) / Math.max(1, need - 1));
        picked.push(inner[Math.min(inner.length - 1, idx)]);
      }
      picked.push(clean[clean.length - 1]);
      clean = picked;
    }
    return clean;
  }

  function colorOr(value, fallback) {
    var s = String(value == null ? '' : value).trim();
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s) ? s : fallback;
  }

  function textureOr(value, table, fallback) {
    return table[value] ? value : fallback;
  }

  // Curva de un muro: { type:'arc', bulge } | { type:'spline', pts } | sin curva.
  function normalizeWallCurve(w) {
    var c = w.curve;
    if (!c || typeof c !== 'object') { delete w.curve; return; }
    if (c.type === 'arc') {
      var b = finiteNumber(c.bulge, 0);
      if (Math.abs(b) < 1e-4) { delete w.curve; return; }
      w.curve = { type: 'arc', bulge: ED.Geo.clamp(b, -4, 4) };
      return;
    }
    if (c.type === 'spline') {
      var pts = (Array.isArray(c.pts) ? c.pts : []).filter(function (p) {
        return p && isFinite(Number(p.x)) && isFinite(Number(p.y));
      }).slice(0, 32).map(function (p) { return { x: Number(p.x), y: Number(p.y) }; });
      if (!pts.length) { delete w.curve; return; }
      w.curve = { type: 'spline', pts: pts };
      return;
    }
    delete w.curve;
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
    // Techo 3D, materiales y modo de renderizado.
    s.roof = (s.roof && typeof s.roof === 'object') ? s.roof : {};
    s.roof.style = ROOF_STYLES[s.roof.style] ? s.roof.style : 'flat';
    s.roof.ridge = ROOF_RIDGES[s.roof.ridge] ? s.roof.ridge : 'auto';
    s.roof.height = gridNumber(s.roof.height, 1200, 200, 8000);
    s.roof.overhang = gridNumber(s.roof.overhang, 400, 0, 2500);
    s.roof.profile = normalizeRoofProfile(s.roof.profile);
    if (s.roof.style === 'custom' && !s.roof.profile) s.roof.style = 'gable';
    if (s.roof.style === 'custom' && s.roof.profile) {
      s.roof.profile.forEach(function (p) {
        if (p.z > s.roof.height * 2.5) p.z = s.roof.height * 2.5;
      });
    }
    // Vigas interiores del techo (CONTRACT §17.3).
    var rstruct = (s.roof.structure && typeof s.roof.structure === 'object') ? s.roof.structure : {};
    s.roof.structure = {
      material: ROOF_STRUCTURES[rstruct.material] ? rstruct.material : 'none',
      spacing: gridNumber(rstruct.spacing, 800, 300, 3000),
      depth: gridNumber(rstruct.depth, 200, 80, 600),
      width: gridNumber(rstruct.width, 120, 60, 400)
    };
    var mats = (s.materials && typeof s.materials === 'object') ? s.materials : {};
    var mWall = (mats.wall && typeof mats.wall === 'object') ? mats.wall : {};
    var mRoof = (mats.roof && typeof mats.roof === 'object') ? mats.roof : {};
    var mTrim = (mats.trim && typeof mats.trim === 'object') ? mats.trim : {};
    var mGround = (mats.ground && typeof mats.ground === 'object') ? mats.ground : {};
    s.materials = {
      wall: {
        color: colorOr(mWall.color, '#f3eee2'),
        texture: textureOr(mWall.texture, WALL_TEXTURES, 'stucco')
      },
      roof: {
        color: colorOr(mRoof.color, '#b49a7c'),
        texture: textureOr(mRoof.texture, ROOF_TEXTURES, 'tile')
      },
      trim: { color: colorOr(mTrim.color, '#fdfaf2') },
      ground: {
        color: colorOr(mGround.color, '#c9d3ab'),
        texture: textureOr(mGround.texture, GROUND_TEXTURES, 'grass')
      }
    };
    s.render = (s.render && typeof s.render === 'object') ? s.render : {};
    s.render.mode = s.render.mode === 'realistic' ? 'realistic' : 'schematic';
    s.render.shadows = s.render.shadows !== false;
    s.render.textures = s.render.textures !== false;
    s.render.sunAngle = gridNumber(s.render.sunAngle, 135, 0, 360);
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
    arr('walls'); arr('rooms'); arr('items'); arr('texts'); arr('dims'); arr('sheets'); arr('assets'); arr('lines');

    p.walls = p.walls.filter(function (w) { return w && w.a && w.b; });
    p.walls.forEach(function (w) {
      w.id = w.id || ED.Geo.uid('w');
      w.type = 'wall';
      w.level = levelIds[w.level] ? w.level : firstLevel;
      w.layerId = w.layerId || 'walls';
      w.thickness = Number(w.thickness) || p.settings.wallThickness;
      w.height = Number(w.height) || p.settings.wallHeight;
      normalizeWallCurve(w);
      w.openings = (Array.isArray(w.openings) ? w.openings : []).filter(function (o) { return o && o.type; });
      // Los muros curvos no admiten aberturas en esta versión.
      if (w.curve) w.openings = [];
      w.openings.forEach(function (o) {
        o.id = o.id || ED.Geo.uid('o');
        o.type = OPENING_SUBTYPES[o.type] ? o.type : 'door';
        if (!OPENING_SUBTYPES[o.type][o.subtype]) o.subtype = OPENING_DEFAULTS[o.type];
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

    // Líneas y curvas de dibujo libre (CONTRACT §17.4).
    p.lines = p.lines.filter(function (l) { return l && l.a && l.b; });
    p.lines.forEach(function (l) {
      l.id = l.id || ED.Geo.uid('ln');
      l.type = l.type === 'curve' ? 'curve' : 'line';
      l.level = levelIds[l.level] ? l.level : firstLevel;
      l.layerId = l.layerId || 'annotation';
      l.a = { x: Number(l.a.x) || 0, y: Number(l.a.y) || 0 };
      l.b = { x: Number(l.b.x) || 0, y: Number(l.b.y) || 0 };
      l.color = colorOr(l.color, '#3f6f86');
      l.width = gridNumber(l.width, 25, 5, 300);
      l.style = (l.style === 'dash' || l.style === 'dot') ? l.style : 'solid';
      var c = l.curve;
      if (c && typeof c === 'object' && c.type === 'arc') {
        var bg = finiteNumber(c.bulge, 0);
        if (Math.abs(bg) < 1e-4) delete l.curve;
        else l.curve = { type: 'arc', bulge: ED.Geo.clamp(bg, -4, 4) };
      } else if (c && typeof c === 'object' && c.type === 'spline') {
        var cpts = (Array.isArray(c.pts) ? c.pts : []).filter(function (q) { return q && isFinite(Number(q.x)) && isFinite(Number(q.y)); })
          .slice(0, 32).map(function (q) { return { x: Number(q.x), y: Number(q.y) }; });
        if (cpts.length) l.curve = { type: 'spline', pts: cpts }; else delete l.curve;
      } else {
        delete l.curve;
      }
      if (l.type === 'line') delete l.curve;
      else if (!l.curve) l.type = 'line';
    });

    // Objetos importados por el usuario (GLB/OBJ): se conservan en el proyecto.
    p.assets = p.assets.filter(function (a) { return a && a.id && a.mesh; });
    var assetIds = {};
    p.assets.forEach(function (a) {
      a.id = String(a.id);
      assetIds[a.id] = true;
      a.name = a.name || 'Objeto importado';
      a.type = 'asset';
      a.cat = 'mios';
      a.layerId = 'furniture';
      a.color = colorOr(a.color, '#cfd6dd');
      a.source = a.source === 'obj' ? 'obj' : 'glb';
      a.w = gridNumber(a.w, 1000, 100, 20000);
      a.d = gridNumber(a.d, 1000, 100, 20000);
      a.h = gridNumber(a.h, 1000, 100, 20000);
      a.mesh = (Array.isArray(a.mesh) ? a.mesh : []).filter(function (f) {
        return f && Array.isArray(f.points) && f.points.length >= 3 &&
          f.points.every(function (p) { return p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z); });
      }).slice(0, 8000).map(function (f) {
        return {
          points: f.points.slice(0, 8).map(function (p) { return { x: Number(p.x), y: Number(p.y), z: Number(p.z) }; }),
          color: colorOr(f.color, a.color)
        };
      });
      if (!a.mesh.length) { a.mesh = []; }
      a.plan = (Array.isArray(a.plan) ? a.plan : []).filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); });
      if (a.plan.length < 3) {
        a.plan = [
          { x: -a.w / 2, y: -a.d / 2 }, { x: a.w / 2, y: -a.d / 2 },
          { x: a.w / 2, y: a.d / 2 }, { x: -a.w / 2, y: a.d / 2 }
        ];
      }
      a.plan = a.plan.slice(0, 64).map(function (p) { return { x: Number(p.x), y: Number(p.y) }; });
      a.boxes = [
        { x: -a.w / 2, y: -a.d / 2, z: 0, w: a.w, d: a.d, h: a.h, color: a.color }
      ];
    });
    // Elimina ids duplicados de assets (conserva el primero).
    var seenAssets = {};
    p.assets = p.assets.filter(function (a) {
      if (seenAssets[a.id]) return false;
      seenAssets[a.id] = true;
      return true;
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

  // Elimina un nivel (planta) y todas sus entidades. Debe quedar al menos uno.
  Store.prototype.removeLevel = function (levelId) {
    var p = this.project;
    if (!p || !Array.isArray(p.levels) || p.levels.length <= 1) return false;
    if (!p.levels.some(function (l) { return l.id === levelId; })) return false;
    p.levels = p.levels.filter(function (l) { return l.id !== levelId; });
    ['walls', 'rooms', 'items', 'texts', 'dims', 'lines'].forEach(function (name) {
      if (Array.isArray(p[name])) p[name] = p[name].filter(function (o) { return o.level !== levelId; });
    });
    (p.sheets || []).forEach(function (sh) {
      if (sh.levelId === levelId) sh.levelId = p.levels[0].id;
    });
    if (this.activeLevel === levelId) this.activeLevel = p.levels[0].id;
    this.selection = [];
    this.touch();
    this.emit('level', this.activeLevel);
    this.emit('selection', this.selection);
    return true;
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
  Store.prototype.lines = function () { return this.byLevel('lines'); };

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

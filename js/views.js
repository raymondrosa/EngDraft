/* EngDraft — generador de vistas y secciones (1.4)
 * Módulo PURO de datos (sin DOM): ED.Views.build() devuelve primitivas 2D en mm
 * (Y hacia arriba) y ED.Views.render() las dibuja ajustadas a un canvas 2D.
 * Usa ED.Geo cuando existe (muros curvos) y no depende de nada más.
 *
 *   ED.Views.TYPES  -> front | right | left | sectionX | sectionY
 *   ED.Views.build(project, opts) -> { type, title, bounds, primitives, meta }
 *   ED.Views.render(canvas, project, opts) -> mismo objeto (dibuja si hay canvas)
 *
 * opts = { type, levelId|'all', sectionPos, scale, title }
 */
(function (ED) {
  'use strict';

  var Views = ED.Views = ED.Views || {};
  var Geo = ED.Geo || null;

  var TYPES = [
    { id: 'front', name: 'Frontal' },
    { id: 'right', name: 'Lateral derecho' },
    { id: 'left', name: 'Lateral izquierdo' },
    { id: 'sectionX', name: 'Sección transversal' },
    { id: 'sectionY', name: 'Sección longitudinal' }
  ];

  /* Planos de proyección. h = eje horizontal de la vista; depth = profundidad
   * (mayor = más lejos del observador): depth = dx*x + dy*y. */
  var VIEWS = {
    front: { hx: 1, hy: 0, dx: 0, dy: 1 },
    right: { hx: 0, hy: 1, dx: -1, dy: 0 },
    left: { hx: 0, hy: -1, dx: 1, dy: 0 },
    sectionX: { hx: 0, hy: 1, dx: -1, dy: 0, cut: 'x', viewer: 'este' },
    sectionY: { hx: 1, hy: 0, dx: 0, dy: 1, cut: 'y', viewer: 'sur' }
  };

  var PALETTE = {
    paper: '#f8f6f0',
    ink: '#24313d',
    inkSoft: 'rgba(36,49,61,0.45)',
    inkFaint: 'rgba(36,49,61,0.26)',
    wallFill: '#e6dfd0',
    wallStroke: '#4a463c',
    cutFill: '#cfc6b2',
    cutHatch: 'rgba(92,80,60,0.45)',
    slab: '#d9d2c1',
    slabStroke: '#6d6657',
    furniture: '#ded7c6',
    glass: '#4f7f8f',
    frame: '#5b6b78',
    doorLeaf: '#7a6b55',
    roofFill: '#d8c7ab',
    roofStroke: '#8a7357',
    roofFaint: 'rgba(138,115,87,0.42)',
    roofFaintFill: '#efe9dc',
    earth: '#ebe5d5',
    earthHatch: 'rgba(118,108,86,0.32)',
    dim: '#b5651d',
    level: '#2e7d8f'
  };

  /* Anchos de línea en mm de dibujo (se escalan al canvas). */
  var LW = { hair: 12, thin: 18, normal: 26, frame: 34, cut: 38, roofCut: 56, hatch: 10, dim: 14 };
  var ROOF_STYLES = { flat: 1, gable: 1, hip: 1, arc: 1, spline: 1, custom: 1 };
  var MAX_PRIMITIVES = 5000;

  /* ---------------------------------------------------------------- utils */
  function num(v, fb) {
    var n = Number(v);
    return isFinite(n) ? n : (fb === undefined ? 0 : fb);
  }
  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === 'object' ? v : {}; }
  function text(v, fb) {
    var s = v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return s || fb || '';
  }
  function validPt(p) { return p && isFinite(p.x) && isFinite(p.y); }
  function pt(x, y) { return { x: num(x), y: num(y) }; }
  function rectPts(x0, y0, x1, y1) {
    if (!(x1 > x0 + 1e-6) || !(y1 > y0 + 1e-6)) return null;
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }
  function boundsOf(points) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, i, p;
    for (i = 0; i < points.length; i++) {
      p = points[i];
      if (!validPt(p)) continue;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (!isFinite(minX)) return null;
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
  }
  function dist(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function formatLength(mm, units) {
    if (Geo && typeof Geo.formatLength === 'function') {
      try { return Geo.formatLength(mm, units); } catch (e) { /* sigue abajo */ }
    }
    var v = num(mm) / 1000;
    return v.toFixed(2) + ' m';
  }
  function formatElevation(mm, units) {
    if (Geo && typeof Geo.formatFeetInches === 'function' && units === 'ft') {
      try { return '+' + Geo.formatFeetInches(mm); } catch (e) { /* sigue abajo */ }
    }
    var v = num(mm) / 1000;
    return (v >= 0 ? '+' : '') + v.toFixed(2) + ' m';
  }
  function fmt0(mm) { return (num(mm) / 1000).toFixed(2); }
  function convexHull(points) {
    var pts = points.filter(validPt).slice().sort(function (a, b) {
      return a.x === b.x ? a.y - b.y : a.x - b.x;
    });
    if (pts.length < 3) return pts;
    var lower = [], upper = [], i;
    function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
    for (i = 0; i < pts.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
      lower.push(pts[i]);
    }
    for (i = pts.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
      upper.push(pts[i]);
    }
    lower.pop();
    upper.pop();
    var hull = lower.concat(upper);
    return hull.length >= 3 ? hull : pts;
  }

  function hOf(def, p) { return def.hx * num(p.x) + def.hy * num(p.y); }
  function depthOf(def, p) { return def.dx * num(p.x) + def.dy * num(p.y); }

  /* -------------------------------------------------------- modelo/contexto */
  function layerVisible(project, layerId) {
    var layers = arr(project.layers);
    if (!layerId) return true;
    for (var i = 0; i < layers.length; i++) {
      if (layers[i] && layers[i].id === layerId) return layers[i].visible !== false;
    }
    return true;
  }

  function collectContext(project, opts) {
    project = obj(project);
    opts = obj(opts);
    var settings = obj(project.settings);
    var levels = [];
    arr(project.levels).forEach(function (l) {
      if (!l || !l.id) return;
      levels.push({
        id: String(l.id),
        name: text(l.name, 'Nivel'),
        elevation: num(l.elevation, 0),
        height: Math.max(1, num(l.height, num(settings.wallHeight, 2700)))
      });
    });
    var synthetic = false;
    if (!levels.length) {
      synthetic = true;
      levels = [{ id: 'l0', name: 'Planta baja', elevation: 0, height: Math.max(1, num(settings.wallHeight, 2700)) }];
    }
    var levelById = {};
    levels.forEach(function (l) { levelById[l.id] = l; });
    var levelId = opts.levelId;
    var filterIds = null;
    var active = levels;
    if (levelId && levelId !== 'all') {
      var found = levels.filter(function (l) { return l.id === String(levelId); });
      if (found.length) {
        active = found;
        filterIds = {};
        found.forEach(function (l) { filterIds[l.id] = true; });
      }
    }
    var groundZ;
    if (filterIds) groundZ = active[0].elevation;
    else {
      groundZ = Math.min.apply(null, [0].concat(levels.map(function (l) { return l.elevation; })));
    }
    var walls = [];
    arr(project.walls).forEach(function (w) {
      if (!w || !w.a || !w.b) return;
      if (!isFinite(num(w.a.x, NaN)) || !isFinite(num(w.a.y, NaN))) return;
      if (!isFinite(num(w.b.x, NaN)) || !isFinite(num(w.b.y, NaN))) return;
      if (!layerVisible(project, w.layerId)) return;
      if (filterIds && w.level && !filterIds[w.level]) return;
      walls.push(w);
    });
    return {
      project: project,
      opts: opts,
      settings: settings,
      levels: active,
      allLevels: levels,
      levelById: levelById,
      synthetic: synthetic,
      filterIds: filterIds,
      walls: walls,
      groundZ: groundZ,
      units: Geo && typeof Geo.normalizeUnit === 'function' ? Geo.normalizeUnit(settings.units) : (settings.units === 'ft' ? 'ft' : 'm')
    };
  }

  function levelOfWall(ctx, wall) {
    var id = wall && wall.level != null ? String(wall.level) : '';
    var lv = ctx.levelById[id];
    if (lv) return lv;
    for (var i = 0; i < ctx.levels.length; i++) {
      if (ctx.synthetic || ctx.filterIds) return ctx.levels[i];
    }
    return ctx.levels[0];
  }
  function wallBottomZ(ctx, wall) {
    return levelOfWall(ctx, wall).elevation;
  }
  function wallTopZ(ctx, wall) {
    var lv = levelOfWall(ctx, wall);
    var h = num(wall.height, 0);
    if (!(h > 0)) h = lv.height > 0 ? lv.height : num(ctx.settings.wallHeight, 2700);
    return lv.elevation + Math.max(1, h);
  }

  /* Copa de muro del proyecto (contorno con espesor) con respaldo seguro. */
  function wallBand(wall) {
    if (Geo && typeof Geo.wallPolygon === 'function') {
      var poly = null;
      try { poly = Geo.wallPolygon(wall, true); } catch (e) { poly = null; }
      if (Array.isArray(poly) && poly.length >= 2) {
        var clean = [];
        for (var i = 0; i < poly.length; i++) {
          if (validPt(poly[i])) clean.push({ x: num(poly[i].x), y: num(poly[i].y) });
        }
        if (clean.length >= 2) return clean;
      }
    }
    var a = { x: num(wall.a && wall.a.x, 0), y: num(wall.a && wall.a.y, 0) };
    var b = { x: num(wall.b && wall.b.x, 0), y: num(wall.b && wall.b.y, 0) };
    var len = dist(a, b);
    var half = Math.max(0.5, num(wall.thickness, 150)) / 2;
    if (len < 1e-6) {
      return [{ x: a.x - half, y: a.y - half }, { x: a.x + half, y: a.y - half },
        { x: a.x + half, y: a.y + half }, { x: a.x - half, y: a.y + half }];
    }
    var nx = -(b.y - a.y) / len * half, ny = (b.x - a.x) / len * half;
    return [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny },
      { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }];
  }

  /* Punto del eje a una distancia (mm) desde a; usa Geo.wallPath para curvas. */
  function wallPointAtDistance(wall, d) {
    var a = { x: num(wall.a && wall.a.x, 0), y: num(wall.a && wall.a.y, 0) };
    var b = { x: num(wall.b && wall.b.x, 0), y: num(wall.b && wall.b.y, 0) };
    var path = null;
    if (Geo && typeof Geo.wallPath === 'function') {
      try { path = Geo.wallPath(wall); } catch (e) { path = null; }
    }
    if (!Array.isArray(path) || path.length < 2) path = [a, b];
    var total = 0, i, seg;
    for (i = 1; i < path.length; i++) total += dist(path[i - 1], path[i]);
    var target = clamp(num(d, 0), 0, total);
    var acc = 0;
    for (i = 1; i < path.length; i++) {
      seg = dist(path[i - 1], path[i]);
      if (acc + seg >= target || i === path.length - 1) {
        var t = seg > 1e-9 ? (target - acc) / seg : 0;
        return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * t, y: path[i - 1].y + (path[i].y - path[i - 1].y) * t };
      }
      acc += seg;
    }
    return path[path.length - 1];
  }
  function wallAlignedTools(wall) {
    var len = 0;
    if (Geo && typeof Geo.wallLength === 'function') {
      try { len = Math.max(0, num(Geo.wallLength(wall), 0)); } catch (e) { len = 0; }
    }
    if (!(len > 0)) len = dist(
      { x: num(wall.a && wall.a.x, 0), y: num(wall.a && wall.a.y, 0) },
      { x: num(wall.b && wall.b.x, 0), y: num(wall.b && wall.b.y, 0) }
    );
    return len;
  }
  function openingAtDistance(wall, o) {
    var len = wallAlignedTools(wall);
    if (!(len > 0)) return null;
    var width = Math.max(10, num(o.width, 900));
    var center = clamp(o.t == null ? 0.5 : num(o.t, 0.5), 0, 1) * len;
    var from = clamp(center - width / 2, 0, len);
    var to = clamp(center + width / 2, 0, len);
    if (to - from < 5) return null;
    return { from: from, to: to, width: to - from, center: center };
  }

  /* --------------------------------------------------------------- techo */
  function sanitizeProfile(raw) {
    var list = [];
    arr(raw).forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      var t = num(p.t, NaN), z = num(p.z, NaN);
      if (!isFinite(t) || !isFinite(z)) return;
      list.push({ t: clamp(t, 0, 1), z: clamp(z, 0, 8000) });
    });
    if (list.length > 24) list = list.slice(0, 24);
    list.sort(function (a, b) { return a.t - b.t; });
    var out = [];
    list.forEach(function (p) {
      if (out.length && Math.abs(out[out.length - 1].t - p.t) < 1e-6) {
        out[out.length - 1] = p;
      } else out.push(p);
    });
    return out.length >= 2 ? out : null;
  }

  function catmullZ(profile, t) {
    var n = profile.length;
    if (!n) return 0;
    t = clamp(t, 0, 1);
    if (t <= profile[0].t) return profile[0].z;
    if (t >= profile[n - 1].t) return profile[n - 1].z;
    var i = 0;
    while (i < n - 2 && t > profile[i + 1].t) i++;
    var p0 = profile[Math.max(0, i - 1)], p1 = profile[i];
    var p2 = profile[i + 1], p3 = profile[Math.min(n - 1, i + 2)];
    var span = p2.t - p1.t;
    var u = span > 1e-9 ? (t - p1.t) / span : 0;
    var u2 = u * u, u3 = u2 * u;
    var z = 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * u +
      (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * u2 +
      (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * u3);
    return clamp(z, 0, 8000);
  }

  function sanitizeRoof(settings) {
    var r = obj(settings.roof);
    var style = ROOF_STYLES[r.style] ? r.style : 'flat';
    var profile = sanitizeProfile(r.profile);
    if (style === 'custom' && !profile) style = 'gable';
    return {
      style: style,
      ridge: (r.ridge === 'x' || r.ridge === 'y') ? r.ridge : 'auto',
      height: clamp(num(r.height, 1200), 200, 8000),
      overhang: clamp(num(r.overhang, 400), 0, 2500),
      profile: profile
    };
  }

  function planBox(ctx) {
    var pts = [];
    ctx.walls.forEach(function (w) {
      wallBand(w).forEach(function (p) { if (validPt(p)) pts.push(p); });
    });
    if (!pts.length) {
      arr(ctx.project.rooms).forEach(function (r) {
        if (!r || !Array.isArray(r.polygon)) return;
        if (ctx.filterIds && r.level && !ctx.filterIds[r.level]) return;
        r.polygon.forEach(function (p) { if (validPt(p)) pts.push(p); });
      });
    }
    var b = boundsOf(pts);
    if (!b || !(b.w > 1) || !(b.h > 1)) {
      return { minX: -3000, minY: -2000, maxX: 3000, maxY: 2000, w: 6000, h: 4000, valid: false };
    }
    return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY, w: b.w, h: b.h, valid: true };
  }

  function buildRoof(ctx, plan) {
    var roof = sanitizeRoof(ctx.settings);
    roof.enabled = plan.valid;
    roof.polygons = [];
    roof.lines = [];
    roof.ridgeSegments = [];
    roof.alongX = true;
    roof.baseZ = 0;
    roof.peakZ = 0;
    roof.slabH = 0;
    roof.extruded = false;
    roof.capIndexes = null;
    roof.x0 = plan.minX; roof.x1 = plan.maxX;
    roof.y0 = plan.minY; roof.y1 = plan.maxY;
    if (!plan.valid) return roof;

    var ov = roof.overhang;
    var x0 = plan.minX - ov, x1 = plan.maxX + ov;
    var y0 = plan.minY - ov, y1 = plan.maxY + ov;
    var w = x1 - x0, d = y1 - y0;
    if (!(w > 200) || !(d > 200)) { roof.enabled = false; return roof; }

    var levelTop = 0;
    ctx.levels.forEach(function (l) { levelTop = Math.max(levelTop, l.elevation + l.height); });
    var wallTop = 0;
    ctx.walls.forEach(function (w2) { wallTop = Math.max(wallTop, wallTopZ(ctx, w2)); });
    var baseZ = Math.max(wallTop, levelTop);
    if (!(baseZ > 0)) baseZ = num(ctx.settings.wallHeight, 2700);
    roof.baseZ = baseZ;
    roof.x0 = x0; roof.x1 = x1; roof.y0 = y0; roof.y1 = y1;

    var ridge = roof.ridge;
    var alongX = ridge === 'x' ? true : (ridge === 'y' ? false : w >= d);
    roof.alongX = alongX;
    var style = roof.style;
    var height = roof.height;
    var longMin = alongX ? x0 : y0;
    var longMax = alongX ? x1 : y1;
    var crossMin = alongX ? y0 : x0;
    var crossMax = alongX ? y1 : x1;
    var crossLen = crossMax - crossMin;
    var longLen = longMax - longMin;
    var midCross = (crossMin + crossMax) / 2;
    function p3(cross, z, along) {
      return alongX ? { x: along, y: cross, z: z } : { x: cross, y: along, z: z };
    }

    if (style === 'flat') {
      var slabH = clamp(Math.round(height * 0.18), 120, 280);
      roof.slabH = slabH;
      roof.peakZ = baseZ + slabH;
      var z0 = baseZ, z1 = baseZ + slabH;
      roof.polygons.push({ points: [p3(y0, z1, x0), p3(y0, z1, x1), p3(y1, z1, x1), p3(y1, z1, x0)] });
      roof.polygons.push({ points: [p3(y0, z0, x0), p3(y0, z0, x1), p3(y1, z0, x1), p3(y1, z0, x0)] });
      roof.polygons.push({ points: [p3(y0, z0, x0), p3(y0, z0, x1), p3(y0, z1, x1), p3(y0, z1, x0)] });
      roof.polygons.push({ points: [p3(y1, z0, x1), p3(y1, z0, x0), p3(y1, z1, x0), p3(y1, z1, x1)] });
      roof.polygons.push({ points: [p3(y0, z0, x0), p3(y1, z0, x0), p3(y1, z1, x0), p3(y0, z1, x0)] });
      roof.polygons.push({ points: [p3(y0, z0, x1), p3(y1, z0, x1), p3(y1, z1, x1), p3(y0, z1, x1)] });
      return roof;
    }

    if (style === 'hip') {
      var halfShort = crossLen / 2;
      var lStart = longMin + halfShort, lEnd = longMax - halfShort;
      if (lStart > lEnd) { lStart = lEnd = (longMin + longMax) / 2; }
      var peak = baseZ + height;
      roof.peakZ = peak;
      function hipFace(pts3) {
        var clean = [];
        for (var i = 0; i < pts3.length; i++) {
          var q = pts3[i];
          if (!clean.length || dist({ x: q.x, y: q.y }, { x: clean[clean.length - 1].x, y: clean[clean.length - 1].y }) > 1e-6 ||
            Math.abs(q.z - clean[clean.length - 1].z) > 1e-6) clean.push(q);
        }
        if (clean.length >= 3) roof.polygons.push({ points: clean });
      }
      hipFace([p3(crossMin, baseZ, longMin), p3(crossMin, baseZ, longMax), p3(midCross, peak, lEnd), p3(midCross, peak, lStart)]);
      hipFace([p3(crossMax, baseZ, longMax), p3(crossMax, baseZ, longMin), p3(midCross, peak, lStart), p3(midCross, peak, lEnd)]);
      hipFace([p3(crossMin, baseZ, longMin), p3(crossMax, baseZ, longMin), p3(midCross, peak, lStart)]);
      hipFace([p3(crossMax, baseZ, longMax), p3(crossMin, baseZ, longMax), p3(midCross, peak, lEnd)]);
      if (lEnd > lStart + 1e-6) {
        var ridgeSeg = { a: p3(midCross, peak, lStart), b: p3(midCross, peak, lEnd) };
        roof.ridgeSegments.push(ridgeSeg);
        roof.lines.push(ridgeSeg);
      }
      roof.lines.push({ a: p3(crossMin, baseZ, longMin), b: p3(midCross, peak, lStart) });
      roof.lines.push({ a: p3(crossMax, baseZ, longMin), b: p3(midCross, peak, lStart) });
      roof.lines.push({ a: p3(crossMin, baseZ, longMax), b: p3(midCross, peak, lEnd) });
      roof.lines.push({ a: p3(crossMax, baseZ, longMax), b: p3(midCross, peak, lEnd) });
      return roof;
    }

    /* gable | arc | spline | custom: perfil barrido sobre el eje corto */
    var samples = 24;
    var profile = [];
    var prof = roof.profile;
    function zAt(t) {
      if (style === 'gable') return height * (1 - Math.abs(2 * t - 1));
      if (style === 'arc') return height * Math.sin(Math.PI * t);
      if (style === 'spline') return height * Math.pow(Math.sin(Math.PI * t), 1.55);
      return catmullZ(prof || [{ t: 0, z: 0 }, { t: 1, z: 0 }], t);
    }
    var i, u;
    for (i = 0; i <= samples; i++) {
      u = i / samples;
      profile.push({ t: u, z: clamp(zAt(u), 0, 8000) });
    }
    var peakZ = baseZ;
    var peakT = 0;
    for (i = 0; i < profile.length; i++) {
      if (profile[i].z > peakZ - baseZ) { peakZ = baseZ + profile[i].z; peakT = profile[i].t; }
    }
    roof.peakZ = peakZ;
    for (i = 0; i < samples; i++) {
      var tA = i / samples, tB = (i + 1) / samples;
      var zA = profile[i].z, zB = profile[i + 1].z;
      roof.polygons.push({
        points: [
          p3(crossMin + tA * crossLen, baseZ + zA, longMin),
          p3(crossMin + tA * crossLen, baseZ + zA, longMax),
          p3(crossMin + tB * crossLen, baseZ + zB, longMax),
          p3(crossMin + tB * crossLen, baseZ + zB, longMin)
        ]
      });
    }
    var capA = [], capB = [];
    for (i = 0; i <= samples; i++) {
      u = i / samples;
      capA.push(p3(crossMin + u * crossLen, baseZ + profile[i].z, longMin));
      capB.push(p3(crossMin + u * crossLen, baseZ + profile[i].z, longMax));
    }
    roof.polygons.push({ points: capA });
    roof.polygons.push({ points: capB });
    roof.extruded = true;
    roof.capIndexes = [roof.polygons.length - 2, roof.polygons.length - 1];
    var ridgeA = p3(crossMin + peakT * crossLen, peakZ, longMin);
    var ridgeB = p3(crossMin + peakT * crossLen, peakZ, longMax);
    roof.ridgeSegments.push({ a: ridgeA, b: ridgeB });
    roof.lines.push({ a: ridgeA, b: ridgeB });
    return roof;
  }

  /* --------------------------------------------------------- primitivas */
  function Painter(limit) {
    this.list = [];
    this.limit = limit || MAX_PRIMITIVES;
  }
  Painter.prototype.add = function (prim) {
    if (!prim || this.list.length >= this.limit) return null;
    this.list.push(prim);
    return prim;
  };
  Painter.prototype.poly = function (points, style) {
    var pts = [], i;
    if (!points) return null;
    for (i = 0; i < points.length; i++) {
      if (validPt(points[i])) pts.push({ x: num(points[i].x), y: num(points[i].y) });
    }
    if (pts.length < 3) return null;
    style = style || {};
    return this.add({
      kind: 'poly', points: pts,
      fill: style.fill === undefined ? null : style.fill,
      stroke: style.stroke === undefined ? PALETTE.ink : style.stroke,
      width: style.width === undefined ? LW.thin : style.width,
      closed: style.closed === undefined ? true : style.closed !== false
    });
  };
  Painter.prototype.line = function (a, b, style) {
    if (!validPt(a) || !validPt(b)) return null;
    if (dist(a, b) < 0.5) return null;
    style = style || {};
    return this.add({
      kind: 'line',
      points: [{ x: num(a.x), y: num(a.y) }, { x: num(b.x), y: num(b.y) }],
      stroke: style.stroke === undefined ? PALETTE.ink : style.stroke,
      width: style.width === undefined ? LW.thin : style.width
    });
  };
  Painter.prototype.text = function (p, value, size, style) {
    var str = text(value, '');
    if (!str || !validPt(p)) return null;
    style = style || {};
    return this.add({
      kind: 'text',
      points: [{ x: num(p.x), y: num(p.y) }],
      text: str,
      size: Math.max(40, num(size, 240)),
      align: style.align || 'left',
      fill: style.fill || PALETTE.ink
    });
  };
  Painter.prototype.hatch = function (x0, y0, x1, y1, step, style) {
    if (!(x1 > x0 + 1) || !(y1 > y0 + 1)) return;
    var spacing = clamp(num(step, 220), 40, 4000);
    var w = x1 - x0, h = y1 - y0;
    var total = w + h;
    var count = Math.floor(total / spacing);
    if (count > 16) { spacing = total / 16; count = 16; }
    var c, xa, xb, ya, yb;
    for (c = x0 + y0 + spacing; c < x1 + y1 - 0.5; c += spacing) {
      xa = Math.max(x0, c - y1);
      ya = c - xa;
      xb = Math.min(x1, c - y0);
      yb = c - xb;
      if (xb > xa + 5) this.line({ x: xa, y: ya }, { x: xb, y: yb }, style);
    }
  };

  function addGround(p, h0, h1, groundZ) {
    var depth = 700;
    var earth = rectPts(h0, groundZ - depth, h1, groundZ);
    if (earth) p.poly(earth, { fill: PALETTE.earth, stroke: null, width: LW.hair });
    p.hatch(h0, groundZ - depth, h1, groundZ, 380, { stroke: PALETTE.earthHatch, width: LW.hatch });
    p.line({ x: h0, y: groundZ }, { x: h1, y: groundZ }, { stroke: PALETTE.ink, width: LW.frame });
  }

  function addLevelLabels(p, ctx, hLeft, groundZ) {
    var i, lv, z, label;
    for (i = 0; i < ctx.levels.length; i++) {
      lv = ctx.levels[i];
      z = lv.elevation;
      if (z < groundZ - 50) continue;
      p.line({ x: hLeft, y: z }, { x: hLeft + 420, y: z }, { stroke: PALETTE.level, width: LW.thin });
      p.text({ x: hLeft - 180, y: z + 70 }, formatElevation(z, ctx.units), 230, { align: 'right', fill: PALETTE.level });
      label = lv.name;
      if (label) p.text({ x: hLeft - 180, y: z - 250 }, label, 190, { align: 'right', fill: PALETTE.inkSoft });
    }
  }

  function addOverallDimension(p, h0, h1, z, ctx) {
    if (!(h1 - h0 > 800)) return;
    p.line({ x: h0, y: z }, { x: h1, y: z }, { stroke: PALETTE.dim, width: LW.dim });
    p.line({ x: h0 - 90, y: z + 150 }, { x: h0 + 90, y: z - 150 }, { stroke: PALETTE.dim, width: LW.dim });
    p.line({ x: h1 - 90, y: z + 150 }, { x: h1 + 90, y: z - 150 }, { stroke: PALETTE.dim, width: LW.dim });
    p.line({ x: h0, y: z + 70 }, { x: h0, y: z + 420 }, { stroke: PALETTE.dim, width: LW.hair });
    p.line({ x: h1, y: z + 70 }, { x: h1, y: z + 420 }, { stroke: PALETTE.dim, width: LW.hair });
    p.text({ x: (h0 + h1) / 2, y: z + 190 }, formatLength(h1 - h0, ctx.units), 215, { align: 'center', fill: PALETTE.dim });
  }

  /* --------------------------------------------------- elementos comunes */
  function elevationWallInfo(ctx, def) {
    var out = [];
    ctx.walls.forEach(function (w) {
      var band = wallBand(w);
      var hvals = [], dvals = [], i, p;
      for (i = 0; i < band.length; i++) {
        p = band[i];
        if (!validPt(p)) continue;
        hvals.push(hOf(def, p));
        dvals.push(depthOf(def, p));
      }
      if (!hvals.length) return;
      out.push({
        wall: w, band: band,
        h0: Math.min.apply(null, hvals), h1: Math.max.apply(null, hvals),
        depth: dvals.reduce(function (a, b) { return a + b; }, 0) / dvals.length,
        z0: wallBottomZ(ctx, w), z1: wallTopZ(ctx, w)
      });
    });
    out.sort(function (a, b) { return b.depth - a.depth; });
    return out;
  }

  function openingRectForWall(p, item, def) {
    var wall = item.wall;
    var openings = arr(wall.openings);
    var i, o, span, pa, pb, h0, h1, zb, zt;
    for (i = 0; i < openings.length; i++) {
      o = openings[i];
      if (!o) continue;
      span = openingAtDistance(wall, o);
      if (!span) continue;
      pa = wallPointAtDistance(wall, span.from);
      pb = wallPointAtDistance(wall, span.to);
      h0 = Math.min(hOf(def, pa), hOf(def, pb));
      h1 = Math.max(hOf(def, pa), hOf(def, pb));
      if (!(h1 - h0 > 2)) continue;
      var sill = Math.max(0, num(o.sill, 0));
      var height = Math.max(50, num(o.height, o.type === 'window' ? 1200 : 2100));
      zb = item.z0 + sill;
      zt = Math.min(item.z1, zb + height);
      if (!(zt > zb + 10)) continue;
      var type = text(o.type, 'door');
      var rect = rectPts(h0, zb, h1, zt);
      if (!rect) continue;
      p.poly(rect, { fill: PALETTE.paper, stroke: null, width: LW.hair });
      p.line({ x: h0, y: zb }, { x: h0, y: zt }, { stroke: PALETTE.frame, width: LW.normal });
      p.line({ x: h1, y: zb }, { x: h1, y: zt }, { stroke: PALETTE.frame, width: LW.normal });
      p.line({ x: h0, y: zt }, { x: h1, y: zt }, { stroke: PALETTE.frame, width: LW.normal });
      p.line({ x: h0, y: zb }, { x: h1, y: zb }, { stroke: PALETTE.frame, width: LW.thin });
      if (type === 'window') {
        var zm = (zb + zt) / 2;
        p.line({ x: h0, y: zm }, { x: h1, y: zm }, { stroke: PALETTE.glass, width: LW.thin });
        p.line({ x: (h0 + h1) / 2, y: zb }, { x: (h0 + h1) / 2, y: zt }, { stroke: PALETTE.glass, width: LW.hair });
      } else if (type === 'garage') {
        for (var k = 1; k <= 3; k++) {
          var zg = zb + (zt - zb) * k / 4;
          p.line({ x: h0, y: zg }, { x: h1, y: zg }, { stroke: PALETTE.doorLeaf, width: LW.hair });
        }
      } else if (type === 'pass') {
        /* hueco de paso: sin hoja */
      } else {
        p.line({ x: h0, y: zb + 700 }, { x: h1, y: zb + 700 }, { stroke: PALETTE.doorLeaf, width: LW.hair });
      }
    }
  }

  function addElevationItems(p, ctx, def) {
    arr(ctx.project.items).forEach(function (it) {
      if (!it || !layerVisible(ctx.project, it.layerId)) return;
      if (ctx.filterIds && it.level && !ctx.filterIds[it.level]) return;
      var cx = num(it.x, NaN), cy = num(it.y, NaN);
      if (!isFinite(cx) || !isFinite(cy)) return;
      var w = Math.max(50, num(it.w, 600)), d = Math.max(50, num(it.d, 600)), h = Math.max(30, num(it.h, 800));
      var lv = ctx.levelById[String(it.level)] || ctx.levels[0];
      var ring = Geo && typeof Geo.rectPolygon === 'function'
        ? Geo.rectPolygon(cx, cy, w, d, num(it.rotation, 0))
        : [{ x: cx - w / 2, y: cy - d / 2 }, { x: cx + w / 2, y: cy - d / 2 }, { x: cx + w / 2, y: cy + d / 2 }, { x: cx - w / 2, y: cy + d / 2 }];
      var vals = [], i;
      for (i = 0; i < arr(ring).length; i++) if (validPt(ring[i])) vals.push(hOf(def, ring[i]));
      if (vals.length < 2) return;
      var rect = rectPts(Math.min.apply(null, vals), lv.elevation, Math.max.apply(null, vals), lv.elevation + h);
      if (!rect) return;
      p.poly(rect, { fill: PALETTE.furniture, stroke: PALETTE.inkSoft, width: LW.hair });
    });
  }

  /* La vista mira a lo largo de la cumbrera: el perfil del techo es visible. */
  function isAlongRidge(def, roof) {
    return roof.alongX ? def.hx === 0 : def.hx === 1;
  }
  function projectRoofPoly(def, roof, index) {
    var poly = (roof.polygons[index] && roof.polygons[index].points) || [];
    var pts = [], j, h;
    for (j = 0; j < poly.length; j++) {
      h = hOf(def, poly[j]);
      if (!isFinite(h) || !isFinite(poly[j].z)) continue;
      pts.push({ x: h, y: num(poly[j].z) });
    }
    return pts;
  }

  function addRoofSilhouette(p, def, roof, mode) {
    if (!roof || !roof.enabled || !roof.polygons.length) return;
    var proj = [], i, j, pts, pb;
    for (i = 0; i < roof.polygons.length; i++) {
      pts = projectRoofPoly(def, roof, i);
      if (pts.length < 3) continue;
      pb = boundsOf(pts);
      if (!pb || pb.w < 1 || pb.h < 1) continue; /* aristas degeneradas en esta vista */
      if (mode === 'faint') p.poly(pts, { fill: PALETTE.roofFaintFill, stroke: null, width: LW.hair });
      else p.poly(pts, { fill: PALETTE.roofFill, stroke: null, width: LW.hair });
      for (j = 0; j < pts.length; j++) proj.push(pts[j]);
    }
    if (proj.length < 3) return;
    /* Contorno: si se ve el perfil (vista a lo largo de la cumbrera) se recalca el
     * perfil real; en vista perpendicular la silueta es convexa (rectángulo/trapecio). */
    var outline = null;
    if (roof.extruded && roof.capIndexes && isAlongRidge(def, roof)) {
      outline = projectRoofPoly(def, roof, roof.capIndexes[1]);
    } else {
      outline = convexHull(proj);
    }
    if (!outline || outline.length < 3) return;
    pb = boundsOf(proj);
    if (mode === 'faint') {
      p.poly(outline, { fill: null, stroke: PALETTE.roofFaint, width: LW.hair });
      return;
    }
    p.poly(outline, { fill: null, stroke: PALETTE.roofStroke, width: LW.frame });
    if (pb) {
      p.line({ x: pb.minX, y: roof.baseZ }, { x: pb.maxX, y: roof.baseZ }, { stroke: PALETTE.roofStroke, width: LW.normal });
    }
    for (i = 0; i < roof.lines.length; i++) {
      var la = roof.lines[i].a, lb = roof.lines[i].b;
      p.line({ x: hOf(def, la), y: num(la.z) }, { x: hOf(def, lb), y: num(lb.z) }, { stroke: PALETTE.roofStroke, width: LW.thin });
    }
  }

  function roofCutSegments(def, roof, axis, value) {
    var segments = [];
    if (!roof || !roof.enabled) return segments;
    var i, j, poly, pts;
    for (i = 0; i < roof.polygons.length; i++) {
      poly = roof.polygons[i].points || [];
      pts = [];
      for (j = 0; j < poly.length; j++) {
        var p = poly[j], q = poly[(j + 1) % poly.length];
        var dp = num(p[axis]) - value, dq = num(q[axis]) - value;
        if (Math.abs(dp) < 1e-6) {
          pts.push(p);
          continue;
        }
        if (Math.abs(dq) < 1e-6) { pts.push(q); continue; }
        if (dp * dq < 0) {
          var t = dp / (dp - dq);
          pts.push({
            x: num(p.x) + (num(q.x) - num(p.x)) * t,
            y: num(p.y) + (num(q.y) - num(p.y)) * t,
            z: num(p.z) + (num(q.z) - num(p.z)) * t
          });
        }
      }
      if (pts.length >= 2) {
        var ha = hOf(def, pts[0]), hb = hOf(def, pts[pts.length - 1]);
        var za = num(pts[0].z), zb = num(pts[pts.length - 1].z);
        if (isFinite(ha) && isFinite(hb) && dist({ x: ha, y: za }, { x: hb, y: zb }) > 1) {
          segments.push({ a: { x: ha, y: za }, b: { x: hb, y: zb } });
        }
      }
    }
    return segments;
  }

  /* ------------------------------------------------------------ vistas */
  function elevation(ctx, def, roof) {
    var p = new Painter();
    var info = elevationWallInfo(ctx, def);
    var hMin = Infinity, hMax = -Infinity;
    info.forEach(function (it) { hMin = Math.min(hMin, it.h0); hMax = Math.max(hMax, it.h1); });
    if (!isFinite(hMin)) {
      var plan = planBox(ctx);
      hMin = def.hx === 1 ? plan.minX : plan.minY;
      hMax = def.hx === 1 ? plan.maxX : plan.maxY;
      if (def.hx === 0) { hMin = def.hy > 0 ? plan.minY : -plan.maxY; hMax = def.hy > 0 ? plan.maxY : -plan.minY; }
    }
    var groundZ = ctx.groundZ;
    var pad = Math.max(700, (hMax - hMin) * 0.05);
    addGround(p, hMin - pad, hMax + pad, groundZ);
    /* losas como líneas tenues bajo los muros */
    ctx.levels.forEach(function (lv) {
      if (lv.elevation <= groundZ + 40) return;
      p.line({ x: hMin - pad, y: lv.elevation }, { x: hMax + pad, y: lv.elevation }, { stroke: PALETTE.inkFaint, width: LW.hair });
    });
    addElevationItems(p, ctx, def);
    info.forEach(function (it) {
      var rect = rectPts(it.h0, it.z0, it.h1, it.z1);
      if (!rect) return;
      p.poly(rect, { fill: PALETTE.wallFill, stroke: PALETTE.wallStroke, width: LW.normal });
      openingRectForWall(p, it, def);
    });
    addRoofSilhouette(p, def, roof, 'fill');
    addLevelLabels(p, ctx, hMin - pad - 600, groundZ);
    addOverallDimension(p, hMin, hMax, groundZ - 1000, ctx);
    return p.list;
  }

  function cutInterval(band, axis, value) {
    var i, p, q, dp, dq, hits = [];
    for (i = 0; i < band.length; i++) {
      p = band[i]; q = band[(i + 1) % band.length];
      if (!validPt(p) || !validPt(q)) continue;
      dp = num(p[axis]) - value; dq = num(q[axis]) - value;
      if (Math.abs(dp) < 1e-6 && Math.abs(dq) < 1e-6) { hits.push(p, q); continue; }
      if (dp * dq < 0) {
        var t = dp / (dp - dq);
        hits.push({ x: num(p.x) + (num(q.x) - num(p.x)) * t, y: num(p.y) + (num(q.y) - num(p.y)) * t });
      }
    }
    function hv(q) { return axis === 'x' ? num(q.y) : num(q.x); }
    if (hits.length >= 2) {
      var vals = hits.map(hv);
      var a = Math.min.apply(null, vals), b = Math.max.apply(null, vals);
      if (b - a > 0.5) return { h0: a, h1: b, transversal: true, point: hits[0] };
    }
    var proj = band.map(function (q) { return num(q[axis]); });
    var pMin = Math.min.apply(null, proj), pMax = Math.max.apply(null, proj);
    if (value > pMin + 1e-6 && value < pMax - 1e-6) {
      var vals2 = band.map(hv);
      var a2 = Math.min.apply(null, vals2), b2 = Math.max.apply(null, vals2);
      if (b2 - a2 > 0.5) return { h0: a2, h1: b2, transversal: false, point: null };
    }
    return null;
  }

  function section(ctx, def, roof) {
    var p = new Painter();
    var axis = def.cut;
    var pos = num(ctx.opts.sectionPos, NaN);
    var plan = planBox(ctx);
    if (!isFinite(pos)) pos = axis === 'x' ? (plan.minX + plan.maxX) / 2 : (plan.minY + plan.maxY) / 2;
    var hMin0 = def.hx === 1 ? plan.minX : plan.minY;
    var hMax0 = def.hx === 1 ? plan.maxX : plan.maxY;
    if (def.hx === 0 && def.hy < 0) { var tmp = hMin0; hMin0 = -hMax0; hMax0 = -tmp; }
    var groundZ = ctx.groundZ;
    var pad = Math.max(700, (hMax0 - hMin0) * 0.05);
    var hMin = hMin0 - pad, hMax = hMax0 + pad;
    addGround(p, hMin, hMax, groundZ);
    /* techo posterior tenue */
    addRoofSilhouette(p, def, roof, 'faint');
    /* muros posteriores (geometría tras el plano de corte) */
    var planeDepth = def.cut === 'x' ? def.dx * pos : def.dy * pos;
    var items = [];
    ctx.walls.forEach(function (w) {
      var band = wallBand(w);
      var hvals = [], dvals = [], i;
      for (i = 0; i < band.length; i++) {
        if (!validPt(band[i])) continue;
        hvals.push(hOf(def, band[i]));
        dvals.push(depthOf(def, band[i]));
      }
      if (!hvals.length) return;
      items.push({
        wall: w, band: band,
        h0: Math.min.apply(null, hvals), h1: Math.max.apply(null, hvals),
        depthMax: Math.max.apply(null, dvals),
        z0: wallBottomZ(ctx, w), z1: wallTopZ(ctx, w),
        cut: cutInterval(band, axis, pos)
      });
    });
    items.forEach(function (it) {
      if (it.cut || !(it.depthMax > planeDepth + 0.5)) return;
      var rect = rectPts(it.h0, it.z0, it.h1, it.z1);
      if (!rect) return;
      p.poly(rect, { fill: null, stroke: PALETTE.inkFaint, width: LW.hair });
    });
    /* losa/fundación cortadas */
    var base = rectPts(hMin0 - 250, groundZ - 240, hMax0 + 250, groundZ);
    if (base) p.poly(base, { fill: PALETTE.cutFill, stroke: PALETTE.wallStroke, width: LW.normal });
    ctx.levels.forEach(function (lv) {
      if (lv.elevation <= groundZ + 40) return;
      var slab = rectPts(hMin0 - 120, lv.elevation - 180, hMax0 + 120, lv.elevation);
      if (slab) p.poly(slab, { fill: PALETTE.slab, stroke: PALETTE.slabStroke, width: LW.thin });
    });
    /* muros cortados (relleno + trama) */
    items.forEach(function (it) {
      if (!it.cut) return;
      var rect = rectPts(it.cut.h0, it.z0, it.cut.h1, it.z1);
      if (!rect) return;
      p.poly(rect, { fill: PALETTE.cutFill, stroke: PALETTE.wallStroke, width: LW.normal });
      p.hatch(it.cut.h0, it.z0, it.cut.h1, it.z1, 180, { stroke: PALETTE.cutHatch, width: LW.hatch });
      /* aberturas que corta el plano: hueco en el relleno */
      if (it.cut.transversal && it.cut.point && Geo && typeof Geo.distToWall === 'function') {
        var res = null;
        try { res = Geo.distToWall(it.cut.point, it.wall); } catch (e) { res = null; }
        if (res && isFinite(res.t)) {
          var len = wallAlignedTools(it.wall);
          var openings = arr(it.wall.openings);
          for (var oi = 0; oi < openings.length; oi++) {
            var o = openings[oi];
            if (!o) continue;
            var span = openingAtDistance(it.wall, o);
            if (!span) continue;
            var center = span.center;
            if (res.t * len < span.from - 1 || res.t * len > span.to + 1) continue;
            var zb = it.z0 + Math.max(0, num(o.sill, 0));
            var zt = Math.min(it.z1, zb + Math.max(50, num(o.height, o.type === 'window' ? 1200 : 2100)));
            var hole = rectPts(it.cut.h0, zb, it.cut.h1, zt);
            if (!hole) continue;
            p.poly(hole, { fill: PALETTE.paper, stroke: null, width: LW.hair });
            p.line({ x: it.cut.h0, y: zt }, { x: it.cut.h1, y: zt }, { stroke: PALETTE.wallStroke, width: LW.thin });
            p.line({ x: it.cut.h0, y: zb }, { x: it.cut.h1, y: zb }, { stroke: PALETTE.wallStroke, width: LW.hatch });
          }
        }
      }
    });
    /* techo cortado: losa plana rellena; en los demás estilos, perfil grueso */
    var segs = roofCutSegments(def, roof, axis, pos);
    if (roof && roof.style === 'flat' && segs.length >= 2) {
      var zs = [], hs = [];
      segs.forEach(function (s) { zs.push(s.a.y, s.b.y); hs.push(s.a.x, s.b.x); });
      var band = rectPts(Math.min.apply(null, hs), Math.min.apply(null, zs),
        Math.max.apply(null, hs), Math.max.apply(null, zs));
      if (band) {
        p.poly(band, { fill: PALETTE.roofStroke, stroke: PALETTE.roofStroke, width: LW.hair });
        p.hatch(band[0].x, band[0].y, band[2].x, band[2].y, 240, { stroke: PALETTE.paper, width: LW.hatch });
      }
    } else {
      segs.forEach(function (s) {
        p.line(s.a, s.b, { stroke: PALETTE.roofStroke, width: LW.roofCut });
      });
    }
    addLevelLabels(p, ctx, hMin - 600, groundZ);
    addOverallDimension(p, hMin0, hMax0, groundZ - 1000, ctx);
    return p.list;
  }

  /* -------------------------------------------------------- bounds/output */
  function primitiveBounds(prims) {
    var pts = [], i, j, pr, w;
    for (i = 0; i < prims.length; i++) {
      pr = prims[i];
      if (!pr || !Array.isArray(pr.points)) continue;
      if (pr.kind === 'text') {
        var anchor = pr.points[0];
        if (!validPt(anchor)) continue;
        w = num(pr.size, 240) * 0.62 * text(pr.text, '').length + num(pr.size, 240) * 0.5;
        var align = pr.align || 'left';
        var x0 = anchor.x, x1 = anchor.x;
        if (align === 'center') { x0 = anchor.x - w / 2; x1 = anchor.x + w / 2; }
        else if (align === 'right') { x1 = anchor.x; x0 = anchor.x - w; }
        else { x1 = anchor.x + w; }
        pts.push({ x: x0, y: anchor.y - pr.size * 0.8 });
        pts.push({ x: x1, y: anchor.y + pr.size * 0.35 });
      } else {
        for (j = 0; j < pr.points.length; j++) if (validPt(pr.points[j])) pts.push(pr.points[j]);
      }
    }
    return boundsOf(pts);
  }

  function normalizeType(type) {
    var id = text(type, 'front');
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i];
    return TYPES[0];
  }

  function fallbackView(type, reason) {
    var def = normalizeType(type);
    return {
      type: def.id,
      title: def.name,
      bounds: { minX: -3000, minY: -1000, maxX: 3000, maxY: 2000, w: 6000, h: 3000 },
      primitives: [{
        kind: 'text', points: [{ x: -2500, y: 1200 }],
        text: reason || 'Sin geometría para la vista', size: 260, align: 'left', fill: PALETTE.inkSoft
      }],
      meta: { scale: null, levelId: null, sectionPos: null, roofStyle: 'flat', empty: true }
    };
  }

  function build(project, opts) {
    Geo = ED.Geo || Geo; /* tolera que geometry.js cargue después de este módulo */
    try {
      return buildUnsafe(project, opts);
    } catch (e) {
      return fallbackView(opts && opts.type, 'No se pudo generar la vista');
    }
  }

  function buildUnsafe(project, opts) {
    opts = obj(opts);
    var def0 = normalizeType(opts.type);
    var def = VIEWS[def0.id] || VIEWS.front;
    def = {
      id: def0.id, name: def0.name,
      hx: def.hx, hy: def.hy, dx: def.dx, dy: def.dy,
      cut: def.cut, viewer: def.viewer
    };
    var ctx = collectContext(project, opts);
    var plan = planBox(ctx);
    var roof = buildRoof(ctx, plan);
    var prims;
    if (def.cut) prims = section(ctx, def, roof);
    else prims = elevation(ctx, def, roof);

    if (!prims || !prims.length) {
      var empty = fallbackView(def0.id, 'Sin geometría para la vista');
      empty.meta.levelId = opts.levelId || null;
      return empty;
    }
    var b = primitiveBounds(prims);
    if (!b || !(b.w > 10) || !(b.h > 10)) {
      var plaza = planBox(ctx);
      b = {
        minX: Math.min(plaza.minX, -1000), minY: Math.min(ctx.groundZ - 1200, -1000),
        maxX: Math.max(plaza.maxX, 1000), maxY: Math.max(plaza.maxY, 3000),
        w: 1, h: 1
      };
      b.w = b.maxX - b.minX; b.h = b.maxY - b.minY;
    }
    var title = text(opts.title, '') || def0.name;
    var meta = {
      scale: isFinite(num(opts.scale, NaN)) ? num(opts.scale) : null,
      levelId: opts.levelId || 'all',
      levelName: ctx.levels.length === 1 ? ctx.levels[0].name : 'Todos los niveles',
      sectionPos: def.cut ? num(ctx.opts.sectionPos, NaN) : null,
      roofStyle: roof && roof.enabled ? roof.style : 'flat',
      units: ctx.units,
      primitives: prims.length
    };
    if (def.cut && !isFinite(meta.sectionPos)) {
      meta.sectionPos = def.cut === 'x' ? (plan.minX + plan.maxX) / 2 : (plan.minY + plan.maxY) / 2;
    }
    if (def.cut) {
      meta.sectionText = (def.cut === 'x' ? 'x = ' : 'y = ') + fmt0(meta.sectionPos) + ' m';
    }
    return {
      type: def0.id,
      title: title,
      bounds: {
        minX: b.minX - 150, minY: b.minY - 150,
        maxX: b.maxX + 150, maxY: b.maxY + 150,
        w: b.w + 300, h: b.h + 300
      },
      primitives: prims,
      meta: meta
    };
  }

  /* --------------------------------------------------------------- render */
  var SCALE_STEPS = [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 500, 750, 1000];

  function nearestScale(den) {
    var best = SCALE_STEPS[0], bestD = Infinity;
    for (var i = 0; i < SCALE_STEPS.length; i++) {
      var d = Math.abs(Math.log(SCALE_STEPS[i] / den));
      if (d < bestD) { bestD = d; best = SCALE_STEPS[i]; }
    }
    return best;
  }

  function drawPrimitive(ctx, pr, sx, ox, oy, ppmm) {
    if (!pr) return;
    if (pr.kind === 'text') {
      var anchor = pr.points && pr.points[0];
      if (!validPt(anchor)) return;
      var size = clamp(num(pr.size, 240) * ppmm, 6, 60);
      ctx.font = '400 ' + size.toFixed(1) + 'px "Bahnschrift","Consolas","Segoe UI",monospace';
      ctx.textAlign = pr.align === 'center' ? 'center' : (pr.align === 'right' ? 'right' : 'left');
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = pr.fill || PALETTE.ink;
      ctx.fillText(text(pr.text, ''), ox + anchor.x * sx, oy - anchor.y * sx);
      return;
    }
    if (!Array.isArray(pr.points) || pr.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(ox + pr.points[0].x * sx, oy - pr.points[0].y * sx);
    for (var i = 1; i < pr.points.length; i++) {
      ctx.lineTo(ox + pr.points[i].x * sx, oy - pr.points[i].y * sx);
    }
    if (pr.kind === 'poly' && pr.closed !== false) ctx.closePath();
    if (pr.kind === 'poly' && pr.fill) {
      ctx.fillStyle = pr.fill;
      ctx.fill();
    }
    if (pr.stroke) {
      ctx.strokeStyle = pr.stroke;
      ctx.lineWidth = clamp(num(pr.width, 20) * sx, 0.4, 8);
      ctx.stroke();
    }
  }

  function render(canvas, project, opts) {
    var view = build(project, opts);
    if (!canvas || typeof canvas.getContext !== 'function') return view;
    var ctx = null;
    try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    if (!ctx) return view;
    try {
      var dpr = 1;
      try { if (typeof window !== 'undefined' && isFinite(window.devicePixelRatio)) dpr = clamp(window.devicePixelRatio, 1, 3); } catch (e2) { dpr = 1; }
      var cssW = num(canvas.clientWidth, 0) || num(canvas.parentElement && canvas.parentElement.clientWidth, 0) || num(canvas.width, 0) || 960;
      var cssH = num(canvas.clientHeight, 0) || num(canvas.parentElement && canvas.parentElement.clientHeight, 0) || num(canvas.height, 0) || 620;
      cssW = Math.max(240, cssW); cssH = Math.max(180, cssH);
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      if (typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = PALETTE.paper;
      ctx.fillRect(0, 0, cssW, cssH);

      var meta = view.meta || {};
      var projName = text((project && project.meta && project.meta.name) || 'Proyecto', 'Proyecto');
      var titleH = clamp(Math.round(cssH * 0.09), 34, 56);
      var bottomH = clamp(Math.round(cssH * 0.11), 40, 70);
      var margin = clamp(Math.round(cssH * 0.035), 12, 28);
      var area = { x: margin, y: titleH, w: cssW - 2 * margin, h: cssH - titleH - bottomH };
      var b = view.bounds || { minX: 0, minY: 0, maxX: 1000, maxY: 1000, w: 1000, h: 1000 };
      if (!(b.w > 0)) b.w = 1000;
      if (!(b.h > 0)) b.h = 1000;
      var sx;
      var forced = num(meta.scale, 0);
      if (forced > 0) {
        sx = 3.7795275591 / forced;
        if (b.w * sx > area.w || b.h * sx > area.h) sx = Math.min(area.w / b.w, area.h / b.h);
      } else {
        sx = Math.min(area.w / b.w, area.h / b.h);
      }
      if (!(sx > 0) || !isFinite(sx)) sx = 0.02;
      var ox = area.x + (area.w - b.w * sx) / 2 - b.minX * sx;
      var oy = area.y + (area.h - b.h * sx) / 2 + b.maxY * sx;

      /* marco */
      ctx.strokeStyle = PALETTE.inkFaint;
      ctx.lineWidth = 0.8;
      if (typeof ctx.strokeRect === 'function') {
        ctx.strokeRect(margin * 0.5, titleH * 0.55, cssW - margin, cssH - titleH * 0.55 - bottomH * 0.45);
      }

      for (var i = 0; i < view.primitives.length; i++) drawPrimitive(ctx, view.primitives[i], sx, ox, oy, sx);

      /* cabecera */
      var title = text(view.title, 'Vista').toUpperCase();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = PALETTE.ink;
      ctx.font = '600 ' + Math.round(clamp(cssH * 0.035, 13, 20)) + 'px "Bahnschrift","Segoe UI",sans-serif';
      ctx.fillText(title, margin, titleH * 0.45);
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.font = '400 ' + Math.round(clamp(cssH * 0.024, 10, 14)) + 'px "Bahnschrift","Segoe UI",sans-serif';
      ctx.fillText(projName, cssW - margin, titleH * 0.45);
      if (meta.sectionText) {
        ctx.textAlign = 'center';
        ctx.fillText('Plano de corte ' + meta.sectionText, cssW / 2, titleH * 0.45);
      }

      /* rótulo inferior */
      var ry = cssH - bottomH;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(margin * 0.5, ry);
      ctx.lineTo(cssW - margin * 0.5, ry);
      ctx.stroke();
      var den = forced > 0 ? forced : nearestScale(3.7795275591 / sx);
      var scaleText = 'Escala 1:' + den;
      var dateText = new Date().toLocaleDateString('es-ES');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = PALETTE.ink;
      ctx.font = '500 ' + Math.round(clamp(cssH * 0.022, 10, 13)) + 'px "Bahnschrift","Segoe UI",sans-serif';
      ctx.fillText(projName, margin, ry + bottomH * 0.38);
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.font = '400 ' + Math.round(clamp(cssH * 0.019, 9, 12)) + 'px "Bahnschrift","Segoe UI",sans-serif';
      var sub = view.title + (meta.levelName ? ' · ' + meta.levelName : '');
      ctx.fillText(sub, cssW / 2, ry + bottomH * 0.38);
      ctx.fillText(scaleText + ' · ' + dateText, cssW / 2, ry + bottomH * 0.72);
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.fillText('ENGDRAFT', cssW - margin, ry + bottomH * 0.38);
      ctx.fillText('Vistas y secciones', cssW - margin, ry + bottomH * 0.72);
    } catch (err) {
      /* Un canvas incompleto no debe romper la app: build sigue siendo válido. */
    }
    return view;
  }

  Views.TYPES = TYPES;
  Views.build = build;
  Views.render = render;
  Views.PALETTE = PALETTE;
  Views.version = '1.4';
})(window.EngDraft = window.EngDraft || {});

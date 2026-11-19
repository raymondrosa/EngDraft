/* EngDraft — exportador DXF (DWG compatible, AutoCAD/LibreCAD)
 * Se genera DXF ASCII R12 (AC1009): máxima compatibilidad. Todas las unidades mm.
 * Los muros curvos (arco/spline) se exportan como LWPOLYLINE de la banda de muro
 * (cerrada, capa A-WALL) más la directriz como LWPOLYLINE abierta; el tramo de
 * arco se conserva exacto con su bulge DXF. Como LWPOLYLINE no forma parte de
 * R12, cuando la exportación contiene curvas la cabecera sube a AC1015 (R2000);
 * sin curvas el archivo sigue siendo R12 como siempre.
 */
(function (ED) {
  'use strict';

  var Geo = ED.Geo;

  var LAYERS = [
    { name: 'A-WALL', color: 7, ltype: 'CONTINUOUS' },
    { name: 'A-DOOR', color: 4, ltype: 'CONTINUOUS' },
    { name: 'A-WIND', color: 5, ltype: 'CONTINUOUS' },
    { name: 'A-FURN', color: 8, ltype: 'CONTINUOUS' },
    { name: 'A-ROOM', color: 3, ltype: 'CONTINUOUS' },
    { name: 'A-TEXT', color: 7, ltype: 'CONTINUOUS' },
    { name: 'A-DIM', color: 1, ltype: 'DASHED' },
    { name: 'A-LEVEL', color: 2, ltype: 'CONTINUOUS' }
  ];

  var ACI = {
    walls: 7, openings: 4, furniture: 8, rooms: 3,
    annotation: 7, dimensions: 1
  };

  function num(n) {
    if (!isFinite(n)) return '0.0';
    var r = Math.round(n * 1000) / 1000;
    return String(r);
  }

  function clean(text) {
    return String(text == null ? '' : text)
      .replace(/[\r\n]+/g, ' ')
      .replace(/[áàäâ]/g, 'a').replace(/[ÁÀÄÂ]/g, 'A')
      .replace(/[éèëê]/g, 'e').replace(/[ÉÈËÊ]/g, 'E')
      .replace(/[íìïî]/g, 'i').replace(/[ÍÌÏÎ]/g, 'I')
      .replace(/[óòöô]/g, 'o').replace(/[ÓÒÖÔ]/g, 'O')
      .replace(/[úùüû]/g, 'u').replace(/[ÚÙÜÛ]/g, 'U')
      .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
      .replace(/[°º]/g, 'o').replace(/[²]/g, '2')
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
      .replace(/[^\x20-\x7E]/g, '');
  }

  function Writer() {
    this.parts = [];
  }
  Writer.prototype.raw = function (code, value) {
    this.parts.push(String(code));
    this.parts.push(String(value));
  };
  Writer.prototype.point = function (x, y, z) {
    this.raw(10, num(x));
    this.raw(20, num(y));
    this.raw(30, num(z || 0));
  };
  Writer.prototype.line = function (x1, y1, x2, y2, layer, z) {
    this.raw(0, 'LINE');
    this.raw(8, layer || '0');
    this.point(x1, y1, z);
    this.raw(11, num(x2));
    this.raw(21, num(y2));
    this.raw(31, num(z || 0));
  };
  Writer.prototype.circle = function (cx, cy, r, layer, z) {
    this.raw(0, 'CIRCLE');
    this.raw(8, layer || '0');
    this.point(cx, cy, z);
    this.raw(40, num(Math.max(0.1, r)));
  };
  Writer.prototype.arc = function (cx, cy, r, startDeg, endDeg, layer, z) {
    var s = ((startDeg % 360) + 360) % 360;
    var e = ((endDeg % 360) + 360) % 360;
    if (Math.abs(s - e) < 0.05) return;
    this.raw(0, 'ARC');
    this.raw(8, layer || '0');
    this.point(cx, cy, z);
    this.raw(40, num(Math.max(0.1, r)));
    this.raw(50, num(s));
    this.raw(51, num(e));
  };
  Writer.prototype.text = function (x, y, h, value, rotDeg, layer, z) {
    if (!value) return;
    this.raw(0, 'TEXT');
    this.raw(8, layer || 'A-TEXT');
    var p = new Writer();
    p.point(x, y, z);
    this.parts = this.parts.concat(p.parts);
    this.raw(40, num(Math.max(20, h)));
    this.raw(1, clean(value));
    if (rotDeg) this.raw(50, num(rotDeg));
  };
  Writer.prototype.polyline = function (points, close, layer, z) {
    if (!points || points.length < 2) return;
    for (var i = 0; i < points.length; i++) {
      var a = points[i];
      var b = points[(i + 1) % points.length];
      if (!close && i === points.length - 1) break;
      this.line(a.x, a.y, b.x, b.y, layer, z);
    }
  };
  // LWPOLYLINE: una sola entidad para contornos/directrices (curvas muestreadas) y,
  // con `bulge`, un tramo de arco exacto según la convención DXF.
  // Los marcadores 100 AcDbEntity/AcDbPolyline los exigen los lectores modernos.
  Writer.prototype.lwpolyline = function (points, close, layer, z, bulges) {
    var list = points || [];
    if (list.length < 2) return;
    this.raw(0, 'LWPOLYLINE');
    this.raw(100, 'AcDbEntity');
    this.raw(8, layer || '0');
    this.raw(100, 'AcDbPolyline');
    this.raw(90, list.length);
    this.raw(70, close ? 1 : 0);
    this.raw(43, 0);
    if (z) this.raw(38, num(z));
    for (var i = 0; i < list.length; i++) {
      var p = list[i] || {};
      this.raw(10, num(p.x));
      this.raw(20, num(p.y));
      var bulge = bulges && bulges[i] != null ? bulges[i] : p.bulge;
      if (isFinite(bulge) && Math.abs(bulge) > 1e-9) this.raw(42, num(bulge));
    }
  };
  Writer.prototype.toString = function () { return this.parts.join('\r\n') + '\r\n'; };

  function buildHeader(w, ext, version) {
    w.raw(0, 'SECTION');
    w.raw(2, 'HEADER');
    w.raw(9, '$ACADVER'); w.raw(1, version || 'AC1009');
    w.raw(9, '$INSUNITS'); w.raw(70, 4);
    w.raw(9, '$MEASUREMENT'); w.raw(70, 1);
    w.raw(9, '$LUNITS'); w.raw(70, 2);
    w.raw(9, '$LUPREC'); w.raw(70, 2);
    w.raw(9, '$EXTMIN');
    w.raw(10, num(ext.minX)); w.raw(20, num(ext.minY)); w.raw(30, 0);
    w.raw(9, '$EXTMAX');
    w.raw(10, num(ext.maxX)); w.raw(20, num(ext.maxY)); w.raw(30, 0);
    w.raw(0, 'ENDSEC');
  }

  function buildTables(w) {
    w.raw(0, 'SECTION');
    w.raw(2, 'TABLES');
    w.raw(0, 'TABLE');
    w.raw(2, 'LTYPE');
    w.raw(70, 2);
    w.raw(0, 'LTYPE');
    w.raw(2, 'CONTINUOUS');
    w.raw(70, 64);
    w.raw(3, 'Solid line');
    w.raw(72, 65);
    w.raw(73, 0);
    w.raw(40, 0);
    w.raw(0, 'LTYPE');
    w.raw(2, 'DASHED');
    w.raw(70, 64);
    w.raw(3, 'Dashed __ __ __');
    w.raw(72, 65);
    w.raw(73, 2);
    w.raw(40, 450);
    w.raw(49, 300);
    w.raw(49, -150);
    w.raw(0, 'ENDTAB');

    w.raw(0, 'TABLE');
    w.raw(2, 'LAYER');
    w.raw(70, LAYERS.length);
    LAYERS.forEach(function (l) {
      w.raw(0, 'LAYER');
      w.raw(2, l.name);
      w.raw(70, 0);
      w.raw(62, l.color);
      w.raw(6, l.ltype);
    });
    w.raw(0, 'ENDTAB');
    w.raw(0, 'ENDSEC');
  }

  function layerFor(kind) {
    return { wall: 'A-WALL', door: 'A-DOOR', window: 'A-WIND', furniture: 'A-FURN', room: 'A-ROOM', text: 'A-TEXT', dim: 'A-DIM' }[kind] || '0';
  }

  // Caja de un nivel tal como se dibuja (muros + ambientes; el mobiliario no
  // define la separación entre niveles, igual que en buildEntities).
  function levelExtent(project, levelId) {
    var pts = [];
    project.walls.forEach(function (wall) {
      if (wall.level !== levelId) return;
      pts = pts.concat(Geo.wallPolygon(wall, true));
    });
    project.rooms.forEach(function (r) {
      if (r.level !== levelId) return;
      pts = pts.concat(r.polygon);
    });
    return pts.length ? Geo.bounds(pts) : { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  }

  function resolveLevels(project, options) {
    options = options || {};
    var levels = options.levels === 'all' ? project.levels.slice() : project.levels.filter(function (l) {
      return l.id === (options.levelId || project.levels[0].id);
    });
    if (!levels.length) levels = [project.levels[0]];
    return levels;
  }

  // Extents del DXF: incluye el desplazamiento ox de cada nivel (los niveles se
  // dibujan uno al lado del otro) y todos los vértices del contorno curvo.
  function projectBounds(project, levels) {
    var pts = [];
    var cursorX = 0;
    levels.forEach(function (level) {
      var bb = levelExtent(project, level.id);
      var ox = cursorX - bb.minX;
      project.walls.forEach(function (wall) {
        if (wall.level !== level.id) return;
        var poly = Geo.wallPolygon(wall, true);
        for (var i = 0; i < poly.length; i++) pts.push({ x: poly[i].x + ox, y: poly[i].y });
      });
      project.rooms.forEach(function (r) {
        if (r.level !== level.id || !r.polygon) return;
        for (var i = 0; i < r.polygon.length; i++) pts.push({ x: r.polygon[i].x + ox, y: r.polygon[i].y });
      });
      project.items.forEach(function (it) {
        if (it.level !== level.id) return;
        pts.push({ x: it.x - it.w / 2 - 800 + ox, y: it.y - it.d / 2 - 800 });
        pts.push({ x: it.x + it.w / 2 + 800 + ox, y: it.y + it.d / 2 + 800 });
      });
      cursorX += bb.w + 4000;
    });
    if (!pts.length) return { minX: -5000, minY: -5000, maxX: 5000, maxY: 5000, w: 10000, h: 10000 };
    return Geo.bounds(pts);
  }

  function emitItem(w, item, ox) {
    var def = ED.Library && ED.Library.get ? ED.Library.get(item.libId) : null;
    if (!def) return;
    var sx = def.w ? (item.w || def.w) / def.w : 1;
    var sy = def.d ? (item.d || def.d) / def.d : 1;
    var rot = item.rotation || 0;
    function toWorld(p) {
      var local = { x: p.x * sx, y: p.y * sy };
      var world = Geo.transformPoint(local, { x: item.x, y: item.y }, rot);
      return { x: world.x + ox, y: world.y };
    }
    (def.plan || []).forEach(function (sh) {
      if (sh.t === 'rect') {
        var x = sh.x == null ? -sh.w / 2 : sh.x;
        var y = sh.y == null ? -sh.h / 2 : sh.y;
        var pts = [
          { x: x, y: y }, { x: x + sh.w, y: y },
          { x: x + sh.w, y: y + sh.h }, { x: x, y: y + sh.h }
        ].map(toWorld);
        w.polyline(pts, true, 'A-FURN');
      } else if (sh.t === 'circle') {
        var cc = toWorld({ x: sh.cx, y: sh.cy });
        w.circle(cc.x, cc.y, sh.r * Math.max(sx, sy), 'A-FURN');
      } else if (sh.t === 'line') {
        var p1 = toWorld({ x: sh.x1, y: sh.y1 });
        var p2 = toWorld({ x: sh.x2, y: sh.y2 });
        w.line(p1.x, p1.y, p2.x, p2.y, 'A-FURN');
      } else if (sh.t === 'poly') {
        var pp = (sh.points || []).map(toWorld);
        w.polyline(pp, true, 'A-FURN');
      } else if (sh.t === 'arc') {
        var ac = toWorld({ x: sh.cx, y: sh.cy });
        w.arc(ac.x, ac.y, sh.r * Math.max(sx, sy), (sh.start || 0) + rot, (sh.end == null ? 180 : sh.end) + rot, 'A-FURN');
      }
    });
    var label = item.name || def.name;
    if (label && item.w * 0.001 > 0.4) {
      w.text(item.x + ox - item.w / 2, item.y - item.d / 2 - 220, 150, label, 0, 'A-FURN');
    }
  }

  // Muro curvo: banda de muro como LWPOLYLINE cerrada (capa A-WALL) y directriz
  // como LWPOLYLINE abierta (capa A-WALL). El arco se exporta exacto con su bulge;
  // el spline se muestrea con Geo.wallPath. Los muros curvos no llevan aberturas.
  function shiftedPts(points, ox) {
    var out = [];
    for (var i = 0; i < (points ? points.length : 0); i++) {
      var p = points[i];
      if (!p || !isFinite(p.x) || !isFinite(p.y)) continue;
      out.push({ x: p.x + ox, y: p.y });
    }
    return out;
  }

  function emitCurvedWall(w, wall, ox) {
    var c = wall.curve || {};
    var target = wall;
    var bulge = 0;
    if (c.type === 'arc') {
      // Sanea el bulge como hace normalizeProject (se conserva exacto en DXF).
      bulge = Geo.clamp(Number(c.bulge) || 0, -4, 4);
      if (bulge !== Number(c.bulge)) {
        target = {
          a: wall.a, b: wall.b, thickness: wall.thickness, height: wall.height,
          curve: { type: 'arc', bulge: bulge }, openings: []
        };
      }
    }
    var contour = shiftedPts(Geo.wallPolygon(target, true), ox);
    if (contour.length >= 3) w.lwpolyline(contour, true, 'A-WALL');
    if (c.type === 'arc' && bulge) {
      w.lwpolyline([
        { x: wall.a.x + ox, y: wall.a.y, bulge: bulge },
        { x: wall.b.x + ox, y: wall.b.y }
      ], false, 'A-WALL');
      return;
    }
    var axis = shiftedPts(Geo.wallPath(target), ox);
    if (axis.length >= 2) w.lwpolyline(axis, false, 'A-WALL');
  }

  function emitWall(w, wall, ox) {
    var len = Geo.wallLength(wall);
    if (len < 1) return;
    if (Geo.wallIsCurved(wall)) { emitCurvedWall(w, wall, ox); return; }
    var half = (wall.thickness || 150) / 2;
    var ux = (wall.b.x - wall.a.x) / len;
    var uy = (wall.b.y - wall.a.y) / len;
    var openings = (wall.openings || []).slice().sort(function (a, b) {
      return Geo.openingSpan(wall, a).from - Geo.openingSpan(wall, b).from;
    });
    var cursor = 0;
    function segment(s, e, extendStart, extendEnd) {
      if (e - s < 0.5) return;
      var ext = half;
      var s0 = s - (extendStart ? ext : 0);
      var e0 = e + (extendEnd ? ext : 0);
      var a = { x: wall.a.x + ux * s0, y: wall.a.y + uy * s0 };
      var b = { x: wall.a.x + ux * e0, y: wall.a.y + uy * e0 };
      var nx = -uy * half, ny = ux * half;
      var pts = [
        { x: a.x + nx, y: a.y + ny },
        { x: b.x + nx, y: b.y + ny },
        { x: b.x - nx, y: b.y - ny },
        { x: a.x - nx, y: a.y - ny }
      ].map(function (p) { return { x: p.x + ox, y: p.y }; });
      w.polyline(pts, true, 'A-WALL');
    }
    if (!openings.length) {
      segment(0, len, true, true);
      return;
    }
    openings.forEach(function (o, idx) {
      var sp = Geo.openingSpan(wall, o);
      if (sp.from > cursor) segment(cursor, sp.from, cursor === 0, false);
      cursor = Math.max(cursor, sp.to);
      var o0 = { x: wall.a.x + ux * sp.from, y: wall.a.y + uy * sp.from };
      var o1 = { x: wall.a.x + ux * sp.to, y: wall.a.y + uy * sp.to };
      var nx = -uy * half, ny = ux * half;
      if (o.type === 'door') {
        var hingeAtStart = o.hinge !== -1;
        var hinge = hingeAtStart ? o0 : o1;
        var swing = o.swing === -1 ? -1 : 1;
        var ex = hinge.x + nx * swing * (sp.width / len) * (sp.width / len) * 0 + (-uy) * 0;
        var openVec = { x: -uy * swing, y: ux * swing };
        var end = { x: hinge.x + openVec.x * sp.width, y: hinge.y + openVec.y * sp.width };
        w.line(hinge.x + ox, hinge.y, end.x + ox, end.y, 'A-DOOR');
        var closedVec = { x: (hingeAtStart ? o1.x - o0.x : o0.x - o1.x), y: (hingeAtStart ? o1.y - o0.y : o0.y - o1.y) };
        var closedAng = Math.atan2(closedVec.y, closedVec.x) * 180 / Math.PI;
        var openAng = Math.atan2(openVec.y, openVec.x) * 180 / Math.PI;
        var delta = ((openAng - closedAng + 540) % 360) - 180;
        if (delta >= 0) w.arc(hinge.x + ox, hinge.y, sp.width, closedAng, closedAng + delta, 'A-DOOR');
        else w.arc(hinge.x + ox, hinge.y, sp.width, closedAng + delta, closedAng, 'A-DOOR');
      } else if (o.type === 'window') {
        [-1 / 3, 1 / 3].forEach(function (f) {
          w.line(o0.x + nx * f + ox, o0.y + ny * f, o1.x + nx * f + ox, o1.y + ny * f, 'A-WIND');
        });
      } else {
        w.line(o0.x + ox, o0.y, o1.x + ox, o1.y, 'A-DOOR');
      }
      if (idx === openings.length - 1 && cursor < len) segment(cursor, len, false, true);
    });
  }

  function emitRoom(w, room, ox) {
    var pts = room.polygon.map(function (p) { return { x: p.x + ox, y: p.y }; });
    w.polyline(pts, true, 'A-ROOM');
    var c = Geo.polygonCentroid(room.polygon);
    w.text(c.x + ox - 700, c.y + 80, 300, room.name || 'AMBIENTE', 0, 'A-ROOM');
    w.text(c.x + ox - 500, c.y - 380, 220, Geo.formatArea(Geo.polygonArea(room.polygon)), 0, 'A-ROOM');
  }

  function emitText(w, t, ox) {
    w.text(t.x + ox, t.y, t.size || 300, t.text, t.rotation || 0, 'A-TEXT');
  }

  function emitDim(w, dim, ox) {
    var len = Geo.dist(dim.a, dim.b);
    if (len < 1) return;
    var ux = (dim.b.x - dim.a.x) / len, uy = (dim.b.y - dim.a.y) / len;
    var nx = -uy, ny = ux;
    var off = dim.offset == null ? 700 : dim.offset;
    var pa = { x: dim.a.x + nx * off, y: dim.a.y + ny * off };
    var pb = { x: dim.b.x + nx * off, y: dim.b.y + ny * off };
    w.line(dim.a.x + ox, dim.a.y, pa.x + ox, pa.y, 'A-DIM');
    w.line(dim.b.x + ox, dim.b.y, pb.x + ox, pb.y, 'A-DIM');
    w.line(pa.x + ox, pa.y, pb.x + ox, pb.y, 'A-DIM');
    var tick = 100;
    w.line(pa.x - tick + ox, pa.y + tick, pa.x + tick + ox, pa.y - tick, 'A-DIM');
    w.line(pb.x - tick + ox, pb.y + tick, pb.x + tick + ox, pb.y - tick, 'A-DIM');
    var mid = { x: (pa.x + pb.x) / 2 + nx * 180, y: (pa.y + pb.y) / 2 + ny * 180 };
    var ang = Math.atan2(uy, ux) * 180 / Math.PI;
    var norm = ((ang % 180) + 180) % 180;
    if (norm > 90) ang += 180;
    w.text(mid.x + ox, mid.y, 220, dim.text || Geo.formatLength(len), ang, 'A-DIM');
  }

  function buildEntities(project, options) {
    var w = new Writer();
    var levels = resolveLevels(project, options);
    var cursorX = 0;
    levels.forEach(function (level, index) {
      var lvlWalls = project.walls.filter(function (x) { return x.level === level.id; });
      var lvlRooms = project.rooms.filter(function (x) { return x.level === level.id; });
      var lvlItems = project.items.filter(function (x) { return x.level === level.id; });
      var lvlTexts = project.texts.filter(function (x) { return x.level === level.id; });
      var lvlDims = project.dims.filter(function (x) { return x.level === level.id; });
      var bb = levelExtent(project, level.id);
      var ox = cursorX - bb.minX;
      lvlWalls.forEach(function (wall) { emitWall(w, wall, ox); });
      lvlRooms.forEach(function (room) { emitRoom(w, room, ox); });
      lvlItems.forEach(function (item) { emitItem(w, item, ox); });
      lvlTexts.forEach(function (t) { emitText(w, t, ox); });
      lvlDims.forEach(function (d) { emitDim(w, d, ox); });
      w.text(ox + bb.minX, bb.maxY + 800, 500, (level.name || 'NIVEL') + '  ·  EngDraft', 0, 'A-LEVEL');
      w.text(ox + bb.minX, bb.maxY + 250, 230, 'Escala 1:1 · mm · ' + (project.meta.name || ''), 0, 'A-LEVEL');
      cursorX += bb.w + 4000;
    });
    return w.toString();
  }

  var DXF = {
    LAYERS: LAYERS,
    create: function (project, options) {
      options = options || {};
      var levelObjs = resolveLevels(project, options);
      var levelIds = levelObjs.map(function (l) { return l.id; });
      var hasCurves = project.walls.some(function (wall) {
        return levelIds.indexOf(wall.level) >= 0 && Geo.wallIsCurved(wall);
      });
      var ext = projectBounds(project, levelObjs);
      var w = new Writer();
      w.raw(999, 'EngDraft — ' + clean(project.meta && project.meta.name || 'Proyecto'));
      w.raw(999, 'DXF ASCII · unidades milimetros · exportado ' + new Date().toISOString());
      // LWPOLYLINE no existe en DXF R12: si la exportación incluye muros curvos
      // se declara R2000 (AC1015) para que la polilínea se interprete bien.
      // Sin curvas se mantiene R12 (AC1009) como siempre.
      buildHeader(w, ext, hasCurves ? 'AC1015' : 'AC1009');
      buildTables(w);
      w.raw(0, 'SECTION');
      w.raw(2, 'BLOCKS');
      w.raw(0, 'ENDSEC');
      w.raw(0, 'SECTION');
      w.raw(2, 'ENTITIES');
      // buildEntities ya devuelve sus líneas con CRLF: se recorta el salto final
      // para no dejar una línea vacía (código de grupo inválido) antes de ENDSEC.
      var body = buildEntities(project, { levels: options.levels, levelId: options.levelId })
        .replace(/[\r\n]+$/, '');
      if (body) w.parts.push(body);
      w.raw(0, 'ENDSEC');
      w.raw(0, 'EOF');
      return w.toString();
    },
    download: function (project, options) {
      options = options || {};
      var dxf = DXF.create(project, options);
      var blob = new Blob([dxf], { type: 'application/dxf;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      var safe = (project.meta.name || 'plano').replace(/[^\w\-]+/g, '_').slice(0, 60);
      a.download = safe + '.dxf';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1200);
      return dxf;
    }
  };

  ED.DXF = DXF;
})(window.EngDraft = window.EngDraft || {});

/* EngDraft — geometría y utilidades de dibujo
 * Todas las medidas están en milímetros. Eje Y hacia arriba (norte).
 */
(function (ED) {
  'use strict';

  var Geo = {};
  var uidCounter = 0;

  Geo.uid = function (prefix) {
    uidCounter += 1;
    var stamp = Date.now().toString(36).slice(-4);
    var rnd = Math.random().toString(36).slice(2, 6);
    return (prefix || 'id') + '_' + stamp + uidCounter.toString(36) + rnd;
  };

  Geo.clamp = function (v, min, max) {
    return v < min ? min : (v > max ? max : v);
  };

  Geo.round = function (v, decimals) {
    var f = Math.pow(10, decimals == null ? 3 : decimals);
    return Math.round(v * f) / f;
  };

  Geo.dist = function (a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  Geo.dist2 = function (a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    return dx * dx + dy * dy;
  };

  Geo.angle = function (a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  };

  Geo.lerp = function (a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  Geo.pointAt = function (a, b, t) {
    return Geo.lerp(a, b, t);
  };

  Geo.normDeg = function (deg) {
    var d = deg % 360;
    return d < 0 ? d + 360 : d;
  };

  Geo.radToDeg = function (rad) {
    return rad * 180 / Math.PI;
  };

  Geo.degToRad = function (deg) {
    return deg * Math.PI / 180;
  };

  Geo.distToSegment = function (p, a, b) {
    var abx = b.x - a.x;
    var aby = b.y - a.y;
    var len2 = abx * abx + aby * aby;
    var t = 0;
    if (len2 > 1e-9) {
      t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
      t = Geo.clamp(t, 0, 1);
    }
    var q = { x: a.x + abx * t, y: a.y + aby * t };
    return { dist: Geo.dist(p, q), t: t, point: q };
  };

  Geo.pointOnSegment = function (p, a, b, tol) {
    var t = tol == null ? 0.5 : tol;
    return Geo.distToSegment(p, a, b).dist <= t;
  };

  Geo.pointInPolygon = function (pt, poly) {
    if (!poly || poly.length < 3) return false;
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y;
      var xj = poly[j].x, yj = poly[j].y;
      if (Geo.pointOnSegment(pt, poly[i], poly[j], 0.01)) return true;
      var intersect = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  Geo.signedArea = function (poly) {
    if (!poly || poly.length < 3) return 0;
    var sum = 0;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      sum += (poly[j].x * poly[i].y - poly[i].x * poly[j].y);
    }
    return sum / 2;
  };

  Geo.polygonArea = function (poly) {
    return Math.abs(Geo.signedArea(poly));
  };

  Geo.polygonCentroid = function (poly) {
    if (!poly || !poly.length) return { x: 0, y: 0 };
    var a = Geo.signedArea(poly);
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
  };

  Geo.bounds = function (points) {
    if (!points || !points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (!p) continue;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
  };

  Geo.centerBounds = function (b) {
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  };

  Geo.wallLength = function (wall) {
    return Geo.dist(wall.a, wall.b);
  };

  Geo.wallAngle = function (wall) {
    return Geo.angle(wall.a, wall.b);
  };

  Geo.wallPolygon = function (wall, extendEnds) {
    var t = Math.max(1, wall.thickness || 150);
    var len = Geo.wallLength(wall);
    var half = t / 2;
    if (len < 0.001) {
      return [
        { x: wall.a.x - half, y: wall.a.y - half },
        { x: wall.a.x + half, y: wall.a.y - half },
        { x: wall.a.x + half, y: wall.a.y + half },
        { x: wall.a.x - half, y: wall.a.y + half }
      ];
    }
    var ux = (wall.b.x - wall.a.x) / len;
    var uy = (wall.b.y - wall.a.y) / len;
    var nx = -uy, ny = ux;
    var ext = extendEnds === false ? 0 : half;
    var a = { x: wall.a.x - ux * ext, y: wall.a.y - uy * ext };
    var b = { x: wall.b.x + ux * ext, y: wall.b.y + uy * ext };
    return [
      { x: a.x + nx * half, y: a.y + ny * half },
      { x: b.x + nx * half, y: b.y + ny * half },
      { x: b.x - nx * half, y: b.y - ny * half },
      { x: a.x - nx * half, y: a.y - ny * half }
    ];
  };

  Geo.openingSpan = function (wall, opening) {
    var len = Geo.wallLength(wall);
    var w = Math.max(10, opening.width || 900);
    var center = Geo.clamp(opening.t == null ? 0.5 : opening.t, 0, 1) * len;
    var from = Geo.clamp(center - w / 2, 0, len);
    var to = Geo.clamp(center + w / 2, 0, len);
    return { from: from, to: to, center: center, width: to - from };
  };

  Geo.transformPoint = function (p, origin, rotDeg) {
    var r = Geo.degToRad(rotDeg || 0);
    var c = Math.cos(r), s = Math.sin(r);
    var dx = p.x - origin.x;
    var dy = p.y - origin.y;
    return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
  };

  Geo.rotatePoint = function (p, rotDeg) {
    var r = Geo.degToRad(rotDeg || 0);
    var c = Math.cos(r), s = Math.sin(r);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
  };

  Geo.rectPolygon = function (cx, cy, w, h, rotDeg) {
    var pts = [
      { x: cx - w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy + h / 2 },
      { x: cx - w / 2, y: cy + h / 2 }
    ];
    if (!rotDeg) return pts;
    return pts.map(function (p) { return Geo.transformPoint(p, { x: cx, y: cy }, rotDeg); });
  };

  Geo.snapAngle = function (rad, stepDeg) {
    var step = Geo.degToRad(stepDeg || 45);
    return Math.round(rad / step) * step;
  };

  Geo.normalizeUnit = function (unit) {
    var u = String(unit || 'm').toLowerCase();
    return (u === 'ft' || u === 'imperial' || u === 'pie' || u === 'pies') ? 'ft' : 'm';
  };

  Geo.isImperial = function (unit) {
    return Geo.normalizeUnit(unit) === 'ft';
  };

  function feetInches(mm) {
    var sign = mm < 0 ? '-' : '';
    var totalInches = Math.abs(mm) / 25.4;
    var feet = Math.floor(totalInches / 12);
    var rest = totalInches - feet * 12;
    var quarter = Math.round(rest * 4) / 4;
    if (quarter >= 12) { feet += 1; quarter = 0; }
    var whole = Math.floor(quarter);
    var frac = Math.round((quarter - whole) * 4);
    var inchStr = String(whole);
    if (frac === 1) inchStr += ' 1/4';
    else if (frac === 2) inchStr += ' 1/2';
    else if (frac === 3) inchStr += ' 3/4';
    return sign + feet + "'-" + inchStr + '"';
  }

  Geo.formatFeetInches = function (mm) {
    return feetInches(mm);
  };

  Geo.formatLength = function (mm, unit, decimals) {
    var u = Geo.normalizeUnit(unit);
    var d = decimals == null ? 2 : decimals;
    if (u === 'ft') return feetInches(mm);
    return (Number(mm) / 1000).toFixed(d) + ' m';
  };

  // Longitud numérica corta para estados, campos y coordenadas.
  Geo.formatLengthShort = function (mm, unit, decimals) {
    var u = Geo.normalizeUnit(unit);
    var d = decimals == null ? 2 : decimals;
    if (u === 'ft') return (Number(mm) / 304.8).toFixed(d) + ' ft';
    return (Number(mm) / 1000).toFixed(d) + ' m';
  };

  Geo.formatArea = function (mm2, unit) {
    var u = Geo.normalizeUnit(unit);
    if (u === 'ft') return (Number(mm2) / 92930.4).toFixed(2) + ' ft²';
    return (Number(mm2) / 1e6).toFixed(2) + ' m²';
  };

  Geo.lengthInput = function (mm, unit, decimals) {
    var u = Geo.normalizeUnit(unit);
    var d = decimals == null ? 2 : decimals;
    return (Number(mm) / (u === 'ft' ? 304.8 : 1000)).toFixed(d);
  };

  Geo.parseLengthInput = function (value, unit) {
    var u = Geo.normalizeUnit(unit);
    return (Number(value) || 0) * (u === 'ft' ? 304.8 : 1000);
  };

  // Espesores, alturas y tamaños pequeños: mm o pulgadas.
  Geo.sizeInput = function (mm, unit, decimals) {
    var u = Geo.normalizeUnit(unit);
    if (u === 'ft') return (Number(mm) / 25.4).toFixed(decimals == null ? 1 : decimals);
    return String(Math.round(Number(mm)));
  };

  Geo.parseSizeInput = function (value, unit) {
    var u = Geo.normalizeUnit(unit);
    return (Number(value) || 0) * (u === 'ft' ? 25.4 : 1);
  };

  Geo.unitLengthLabel = function (unit) { return Geo.normalizeUnit(unit) === 'ft' ? 'ft' : 'm'; };
  Geo.unitSizeLabel = function (unit) { return Geo.normalizeUnit(unit) === 'ft' ? 'in' : 'mm'; };
  Geo.unitAreaLabel = function (unit) { return Geo.normalizeUnit(unit) === 'ft' ? 'ft²' : 'm²'; };

  Geo.formatDeg = function (rad) {
    return Geo.normDeg(Geo.radToDeg(rad)).toFixed(1) + '°';
  };

  Geo.polygonPerimeter = function (poly) {
    var p = 0;
    for (var i = 0; i < poly.length; i++) {
      p += Geo.dist(poly[i], poly[(i + 1) % poly.length]);
    }
    return p;
  };

  Geo.deepClone = function (obj) {
    if (obj == null) return obj;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(obj); } catch (e) { /* fallback */ }
    }
    return JSON.parse(JSON.stringify(obj));
  };

  Geo.polar = function (origin, rad, dist) {
    return { x: origin.x + Math.cos(rad) * dist, y: origin.y + Math.sin(rad) * dist };
  };

  Geo.normal = function (a, b) {
    var len = Geo.dist(a, b);
    if (len < 1e-9) return { x: 0, y: 1 };
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  };

  Geo.pointLineDistance = function (p, linePoint, lineDir) {
    return Math.abs((p.x - linePoint.x) * (-lineDir.y) + (p.y - linePoint.y) * lineDir.x);
  };

  Geo.polylinePath = function (ctx, poly, close) {
    if (!poly || !poly.length) return;
    ctx.moveTo(poly[0].x, poly[0].y);
    for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    if (close) ctx.closePath();
  };

  // Douglas-Peucker sobre una polilínea abierta.
  function rdp(points, eps) {
    if (points.length < 3) return points.slice();
    var first = 0, last = points.length - 1;
    var maxD = 0, index = -1;
    var a = points[first], b = points[last];
    for (var i = first + 1; i < last; i++) {
      var d = Geo.distToSegment(points[i], a, b).dist;
      if (d > maxD) { maxD = d; index = i; }
    }
    if (maxD > eps) {
      var left = rdp(points.slice(0, index + 1), eps);
      var right = rdp(points.slice(index), eps);
      return left.slice(0, -1).concat(right);
    }
    return [a, b];
  }

  function removeCollinear(poly, tol) {
    if (poly.length < 3) return poly;
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var prev = poly[(i - 1 + poly.length) % poly.length];
      var cur = poly[i];
      var next = poly[(i + 1) % poly.length];
      var cross = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
      var len1 = Geo.dist(prev, cur), len2 = Geo.dist(cur, next);
      if (Math.abs(cross) > (tol || 1) * Math.max(1, len1 + len2) * 0.001 || len1 < 2 || len2 < 2) {
        out.push(cur);
      }
    }
    return out.length >= 3 ? out : poly;
  }

  function simplifyClosed(poly, eps) {
    if (poly.length < 5) return poly;
    var far = 0, maxD = -1;
    for (var i = 1; i < poly.length; i++) {
      var d = Geo.dist(poly[0], poly[i]);
      if (d > maxD) { maxD = d; far = i; }
    }
    if (far < 2) return poly;
    var part1 = rdp(poly.slice(0, far + 1), eps);
    var part2 = rdp(poly.slice(far).concat([poly[0]]), eps);
    var merged = part1.slice(0, -1).concat(part2.slice(0, -1));
    merged = removeCollinear(merged, eps);
    if (merged.length < 4) return poly;
    return merged;
  }

  function snapPolygon(poly, step) {
    return poly.map(function (p) {
      return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
    });
  }

  /**
   * Detecta ambientes cerrados rasterizando los muros y buscando componentes
   * vacíos que no tocan el borde del área de estudio.
   */
  Geo.findRooms = function (project, levelId, opts) {
    opts = opts || {};
    var walls = (project.walls || []).filter(function (w) {
      return !levelId || w.level === levelId;
    });
    if (!walls.length) return [];

    var pts = [];
    for (var i = 0; i < walls.length; i++) {
      pts.push(walls[i].a, walls[i].b);
      var wp = Geo.wallPolygon(walls[i], true);
      for (var k = 0; k < wp.length; k++) pts.push(wp[k]);
    }
    var b = Geo.bounds(pts);
    var pad = 900;
    var minX = b.minX - pad, minY = b.minY - pad;
    var maxX = b.maxX + pad, maxY = b.maxY + pad;
    var bw = maxX - minX, bh = maxY - minY;
    var cell = opts.cell || Math.max(45, Math.min(110, Math.max(bw, bh) / 420));
    while ((bw / cell) * (bh / cell) > 700000) cell *= 1.25;
    var cols = Math.ceil(bw / cell), rows = Math.ceil(bh / cell);
    var occ = new Uint8Array(cols * rows);
    var total = cols * rows;

    for (var w = 0; w < walls.length; w++) {
      var poly = Geo.wallPolygon(walls[w], true);
      var pb = Geo.bounds(poly);
      var i0 = Math.max(0, Math.floor((pb.minX - minX) / cell));
      var i1 = Math.min(cols - 1, Math.ceil((pb.maxX - minX) / cell));
      var j0 = Math.max(0, Math.floor((pb.minY - minY) / cell));
      var j1 = Math.min(rows - 1, Math.ceil((pb.maxY - minY) / cell));
      for (var j = j0; j <= j1; j++) {
        for (var ii = i0; ii <= i1; ii++) {
          var c = { x: minX + (ii + 0.5) * cell, y: minY + (j + 0.5) * cell };
          if (Geo.pointInPolygon(c, poly)) occ[j * cols + ii] = 1;
        }
      }
    }

    var comp = new Int32Array(total); comp.fill(-1);
    var componentId = 0;
    var result = [];
    var minArea = opts.minArea || 1.2e6;

    for (var start = 0; start < total; start++) {
      if (occ[start] || comp[start] !== -1) continue;
      var compId = componentId++;
      var queue = [start];
      comp[start] = compId;
      var head = 0;
      var cells = [];
      var touchesBorder = false;
      while (head < queue.length) {
        var idx = queue[head++];
        cells.push(idx);
        var cx = idx % cols, cy = (idx - cx) / cols;
        if (cx === 0 || cy === 0 || cx === cols - 1 || cy === rows - 1) touchesBorder = true;
        var nbs = [];
        if (cx > 0) nbs.push(idx - 1);
        if (cx < cols - 1) nbs.push(idx + 1);
        if (cy > 0) nbs.push(idx - cols);
        if (cy < rows - 1) nbs.push(idx + cols);
        for (var n = 0; n < nbs.length; n++) {
          var ni = nbs[n];
          if (!occ[ni] && comp[ni] === -1) {
            comp[ni] = compId;
            queue.push(ni);
          }
        }
      }
      if (touchesBorder) continue;
      if (cells.length * cell * cell < minArea) continue;

      // Aristas dirigidas con el componente a la izquierda.
      var edges = [];
      var adj = Object.create(null);
      function addEdge(x1, y1, x2, y2) {
        var id = edges.length;
        edges.push({ x1: x1, y1: y1, x2: x2, y2: y2, used: false });
        var key = x1 + ',' + y1;
        (adj[key] || (adj[key] = [])).push(id);
      }
      for (var ci = 0; ci < cells.length; ci++) {
        var id2 = cells[ci];
        var x = id2 % cols, y = (id2 - x) / cols;
        if (y === 0 || comp[id2 - cols] !== compId) {
          addEdge(x, y, x + 1, y);
        }
        if (x === cols - 1 || comp[id2 + 1] !== compId) {
          addEdge(x + 1, y, x + 1, y + 1);
        }
        if (y === rows - 1 || comp[id2 + cols] !== compId) {
          addEdge(x + 1, y + 1, x, y + 1);
        }
        if (x === 0 || comp[id2 - 1] !== compId) {
          addEdge(x, y + 1, x, y);
        }
      }

      var loops = [];
      for (var e = 0; e < edges.length; e++) {
        if (edges[e].used) continue;
        var loop = [];
        var cur = e;
        var guard = 0;
        while (cur != null && !edges[cur].used && guard < edges.length + 5) {
          guard++;
          var edge = edges[cur];
          edge.used = true;
          loop.push({ x: edge.x1, y: edge.y1 });
          var key2 = edge.x2 + ',' + edge.y2;
          var options = adj[key2] || [];
          var next = null;
          for (var oi = 0; oi < options.length; oi++) {
            if (!edges[options[oi]].used) { next = options[oi]; break; }
          }
          cur = next;
        }
        if (loop.length >= 4) loops.push(loop);
      }

      var best = null, bestArea = 0;
      for (var li = 0; li < loops.length; li++) {
        var a = Math.abs(Geo.signedArea(loops[li]));
        if (a > bestArea) { bestArea = a; best = loops[li]; }
      }
      if (!best || bestArea * cell * cell < minArea) continue;

      var world = best.map(function (p) {
        return { x: minX + p.x * cell, y: minY + p.y * cell };
      });
      world = simplifyClosed(world, Math.max(20, cell * 1.15));
      world = snapPolygon(world, 10);
      world = removeCollinear(world, 20);
      if (world.length < 4) continue;
      var area = Geo.polygonArea(world);
      if (area < minArea) continue;
      var bb = Geo.bounds(world);
      result.push({ polygon: world, area: area, bounds: bb, centroid: Geo.polygonCentroid(world) });
    }
    return result;
  };

  Geo.expandRect = function (b, pad) {
    return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  };

  Geo.rectsOverlap = function (a, b) {
    return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
  };

  ED.Geo = Geo;
})(window.EngDraft = window.EngDraft || {});

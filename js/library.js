/* EngDraft — biblioteca de mobiliario y accesorios
 * Coordenadas locales en mm: X derecha, Y ARRIBA (norte), centro (0,0).
 * El frente del mueble mira hacia -Y. Las cajas 3D usan x,y = esquina mínima y z = piso.
 */
(function (ED) {
  'use strict';

  var items = {};
  var order = [];

  function R(x, y, w, h, r, fill, stroke) {
    return { t: 'rect', x: x, y: y, w: w, h: h, r: r || 0, fill: fill, stroke: stroke || '#5b6875' };
  }
  function C(cx, cy, r, fill, stroke) {
    return { t: 'circle', cx: cx, cy: cy, r: r, fill: fill, stroke: stroke || '#5b6875' };
  }
  function L(x1, y1, x2, y2, stroke, w) {
    return { t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, stroke: stroke || '#5b6875', lw: w || 1 };
  }
  function P(points, fill, stroke) {
    return { t: 'poly', points: points, fill: fill, stroke: stroke || '#5b6875' };
  }
  function ARC(cx, cy, r, start, end, stroke) {
    return { t: 'arc', cx: cx, cy: cy, r: r, start: start, end: end, stroke: stroke || '#5b6875' };
  }
  function B(x, y, z, w, d, h, color) {
    return { x: x, y: y, z: z, w: w, d: d, h: h, color: color };
  }

  function add(id, name, cat, w, d, h, color, plan, boxes, tags) {
    var def = {
      id: id, name: name, cat: cat, tags: tags || '',
      w: w, d: d, h: h, color: color, plan: plan, boxes: boxes
    };
    items[id] = def;
    order.push(id);
    return def;
  }

  var COL = {
    fabric: '#dfe5ec', fabricDark: '#c6d2df', wood: '#e6d8c3', woodDark: '#cdb99d',
    woodMid: '#dccdb5', metal: '#c9d1d8', white: '#f1f2ee', ceramic: '#eef2f2',
    glass: 'rgba(151,199,210,0.45)', green: '#cfe0c5', greenDark: '#9fbd93',
    dark: '#5a6673', stone: '#dedfd8', linen: '#f2ece2'
  };

  // ------------------------------------------------------------------ mallas 3D
  // CONTRACT §14.1: def.mesh = [{ points:[{x,y,z},…] (3..8),
  //   color:'#rrggbb', edge?:false, twoSided?:true, tex?:'wood' }]
  // Son visuales (solo vista 3D): no se serializan y se escalan como las cajas.
  // Se generan aquí en carga con primitivas (esferas, tubos, discos, hojas).

  function MFace(pts, color, opts) {
    var f = { points: pts, color: color };
    if (opts) {
      if (opts.edge) f.edge = true;
      if (opts.twoSided) f.twoSided = true;
      if (opts.tex) f.tex = opts.tex;
    }
    return f;
  }

  function MNormal(pts) {
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

  function MCentroid(pts) {
    var x = 0, y = 0, z = 0;
    for (var i = 0; i < pts.length; i++) { x += pts[i].x; y += pts[i].y; z += pts[i].z; }
    var n = pts.length || 1;
    return { x: x / n, y: y / n, z: z / n };
  }

  // Orienta todas las caras de una pieza hacia fuera desde un punto interior.
  // Así el sombreado por normal de View3D queda coherente sin cuidar el orden.
  function MOrient(faces, inside) {
    for (var i = 0; i < faces.length; i++) {
      var f = faces[i];
      var n = MNormal(f.points), c = MCentroid(f.points);
      if (n.x * (c.x - inside.x) + n.y * (c.y - inside.y) + n.z * (c.z - inside.z) < 0) {
        f.points.reverse();
      }
    }
    return faces;
  }

  function MRingXY(cx, cy, z, rx, ry, seg, phase) {
    var out = [], i, ang;
    for (i = 0; i < seg; i++) {
      ang = Math.PI * 2 * i / seg + (phase || 0);
      out.push({ x: cx + Math.cos(ang) * rx, y: cy + Math.sin(ang) * ry, z: z });
    }
    return out;
  }

  // Elipsoide (esfera aplastada/escalada) con contorno irregular opcional.
  function MBlob(cx, cy, cz, rx, ry, rz, color, seg, rings, opts) {
    opts = opts || {};
    var out = [], rows = [], k, i, ang, phi, row, f, cols = opts.colors, wob = opts.wob || 0;
    for (k = 1; k <= rings; k++) {
      phi = Math.PI * (k / (rings + 1));
      row = [];
      for (i = 0; i < seg; i++) {
        ang = Math.PI * 2 * i / seg;
        f = 1 + wob * Math.sin(ang * 3 + phi * 2.6);
        row.push({
          x: cx + Math.cos(ang) * rx * Math.sin(phi) * f,
          y: cy + Math.sin(ang) * ry * Math.sin(phi) * f,
          z: cz + rz * Math.cos(phi) + (wob ? rz * 0.1 * Math.sin(ang * 2 + phi) : 0)
        });
      }
      rows.push(row);
    }
    function colOf(kk, ii) {
      if (cols && cols.length) return cols[(kk * 5 + ii * 3) % cols.length];
      return color;
    }
    var top = { x: cx, y: cy, z: cz + rz }, bot = { x: cx, y: cy, z: cz - rz };
    for (i = 0; i < seg; i++) out.push(MFace([top, rows[0][i], rows[0][(i + 1) % seg]], colOf(0, i), opts));
    for (k = 0; k < rows.length - 1; k++) {
      for (i = 0; i < seg; i++) {
        var j = (i + 1) % seg;
        out.push(MFace([rows[k][i], rows[k][j], rows[k + 1][j], rows[k + 1][i]], colOf(k, i), opts));
      }
    }
    var last = rows[rows.length - 1];
    for (i = 0; i < seg; i++) out.push(MFace([bot, last[(i + 1) % seg], last[i]], colOf(rows.length - 1, i), opts));
    return MOrient(out, { x: cx, y: cy, z: cz });
  }

  // Tramo de cilindro o cono entre dos puntos 3D (tronco, ramas, fustes).
  function MTubeSeg(p0, p1, r0, r1, color, seg, opts) {
    opts = opts || {};
    var ax = p1.x - p0.x, ay = p1.y - p0.y, az = p1.z - p0.z;
    var len = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
    ax /= len; ay /= len; az /= len;
    var hx = 0, hy = 0, hz = 1;
    if (Math.abs(az) > 0.92) { hx = 1; hy = 0; hz = 0; }
    var ux = hy * az - hz * ay, uy = hz * ax - hx * az, uz = hx * ay - hy * ax;
    var ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    var vx = ay * uz - az * uy, vy = az * ux - ax * uz, vz = ax * uy - ay * ux;
    function ringAt(p, r) {
      var arr = [], i, ang, ca, sa;
      for (i = 0; i < seg; i++) {
        ang = Math.PI * 2 * i / seg; ca = Math.cos(ang) * r; sa = Math.sin(ang) * r;
        arr.push({ x: p.x + ux * ca + vx * sa, y: p.y + uy * ca + vy * sa, z: p.z + uz * ca + vz * sa });
      }
      return arr;
    }
    var out = [], A = ringAt(p0, r0), B = ringAt(p1, r1), i, j;
    for (i = 0; i < seg; i++) {
      j = (i + 1) % seg;
      out.push(MFace([A[i], A[j], B[j], B[i]], color, opts));
    }
    if (opts.caps) {
      out.push(MFace(A.slice(), color, opts));
      out.push(MFace(B.slice(), color, opts));
    }
    return MOrient(out, {
      x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2, z: (p0.z + p1.z) / 2
    });
  }

  function MTubeZ(cx, cy, z0, z1, r0, r1, color, seg, opts) {
    return MTubeSeg({ x: cx, y: cy, z: z0 }, { x: cx, y: cy, z: z1 }, r0, r1, color, seg, opts);
  }

  function MDiscZ(cx, cy, z, r, color, seg, opts) {
    return MFace(MRingXY(cx, cy, z, r, r, seg, 0), color, opts);
  }

  function MDiscY(cx, y, cz, r, color, seg) {
    var out = [], i, ang;
    for (i = 0; i < seg; i++) {
      ang = Math.PI * 2 * i / seg;
      out.push({ x: cx + Math.cos(ang) * r, y: y, z: cz + Math.sin(ang) * r });
    }
    return MFace(out, color, {});
  }

  // Abanico de triángulos en el plano XZ (tapas de llanta).
  function MFanY(cx, y, cz, r, color, seg) {
    var out = [], i, a0, a1;
    for (i = 0; i < seg; i++) {
      a0 = Math.PI * 2 * i / seg;
      a1 = Math.PI * 2 * (i + 1) / seg;
      out.push(MFace([
        { x: cx, y: y, z: cz },
        { x: cx + Math.cos(a0) * r, y: y, z: cz + Math.sin(a0) * r },
        { x: cx + Math.cos(a1) * r, y: y, z: cz + Math.sin(a1) * r }
      ], color, {}));
    }
    return out;
  }

  // Rueda: banda de rodadura + flancos + llanta clara y radios.
  function MWheel(cx, cy, cz, r, halfW, tire, rim, seg) {
    seg = seg || 14;
    var out = [], i, j;
    out = out.concat(MTubeSeg({ x: cx, y: cy - halfW, z: cz }, { x: cx, y: cy + halfW, z: cz }, r, r, tire, seg, {}));
    var inner = r * 0.62;
    function ringXZ(y, rad) {
      var arr = [], k, ang;
      for (k = 0; k < seg; k++) {
        ang = Math.PI * 2 * k / seg;
        arr.push({ x: cx + Math.cos(ang) * rad, y: y, z: cz + Math.sin(ang) * rad });
      }
      return arr;
    }
    var oL = ringXZ(cy - halfW, r), iL = ringXZ(cy - halfW, inner);
    var oR = ringXZ(cy + halfW, r), iR = ringXZ(cy + halfW, inner);
    for (i = 0; i < seg; i++) {
      j = (i + 1) % seg;
      out.push(MFace([oL[i], oL[j], iL[j], iL[i]], tire, {}));
      out.push(MFace([oR[i], oR[j], iR[j], iR[i]], tire, {}));
    }
    var yL = cy - halfW - 1, yR = cy + halfW + 1;
    out = out.concat(MFanY(cx, yL, cz, inner, rim, seg));
    out = out.concat(MFanY(cx, yR, cz, inner, rim, seg));
    // Radios de la llanta (detalle sobre el disco claro).
    var spokes = 5, r0 = inner * 0.22, r1 = inner * 0.94, hs = 0.22;
    for (i = 0; i < spokes; i++) {
      var a0 = Math.PI * 2 * i / spokes, a1 = a0 + hs;
      out.push(MFace([
        { x: cx + Math.cos(a0) * r0, y: yL - 2, z: cz + Math.sin(a0) * r0 },
        { x: cx + Math.cos(a1) * r0, y: yL - 2, z: cz + Math.sin(a1) * r0 },
        { x: cx + Math.cos(a1) * r1, y: yL - 2, z: cz + Math.sin(a1) * r1 },
        { x: cx + Math.cos(a0) * r1, y: yL - 2, z: cz + Math.sin(a0) * r1 }
      ], '#7e8894', {}));
      out.push(MFace([
        { x: cx + Math.cos(a0) * r0, y: yR + 2, z: cz + Math.sin(a0) * r0 },
        { x: cx + Math.cos(a1) * r0, y: yR + 2, z: cz + Math.sin(a1) * r0 },
        { x: cx + Math.cos(a1) * r1, y: yR + 2, z: cz + Math.sin(a1) * r1 },
        { x: cx + Math.cos(a0) * r1, y: yR + 2, z: cz + Math.sin(a0) * r1 }
      ], '#7e8894', {}));
    }
    return MOrient(out, { x: cx, y: cy, z: cz });
  }

  // Hoja/fronda curva: tira de 4 quads que se eleva y cae hacia la punta.
  function MBlade(ox, oy, oz, ang, len, halfW, lift, droop, color) {
    var opts = { twoSided: true };
    var rows = 5, out = [], prev = null, i, s, dist, z, hw, rx, ry, row;
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var px = -dy, py = dx;
    for (i = 0; i <= rows; i++) {
      s = i / rows;
      dist = 45 + len * s;
      z = oz + lift * Math.sin(s * 1.25) - droop * s * s;
      hw = halfW * (0.22 + 0.9 * Math.sin(Math.PI * Math.pow(s, 0.8)));
      rx = ox + dx * dist;
      ry = oy + dy * dist;
      row = [
        { x: rx + px * hw, y: ry + py * hw, z: z },
        { x: rx - px * hw, y: ry - py * hw, z: z }
      ];
      if (prev) out.push(MFace([prev[0], prev[1], row[1], row[0]], color, opts));
      prev = row;
    }
    return MOrient(out, { x: ox + dx * len * 0.5, y: oy + dy * len * 0.5, z: oz - 500 });
  }

  // --- palmera: tronco curvo con anillos, 11 frondas colgantes y cocos ---
  function buildPalmMesh() {
    var mesh = [], i, s, t, r0, r1, greens = ['#8db079', '#9cbd87', '#a8c894', '#93b57f'];
    var pts = [];
    for (s = 0; s <= 6; s++) {
      t = s / 6;
      pts.push({ x: 55 * Math.sin(t * 2.1) - 30, y: 28 * Math.sin(t * 1.7), z: 10 + t * 4040 });
    }
    for (s = 0; s < 6; s++) {
      r0 = 118 - 62 * (s / 6);
      r1 = 118 - 62 * ((s + 1) / 6);
      mesh = mesh.concat(MTubeSeg(pts[s], pts[s + 1], r0, r1, s % 2 ? '#c0ab8e' : '#b39f84', 8, s === 0 ? { caps: true } : {}));
    }
    for (i = 1; i < 6; i++) {
      var rr = 118 - 62 * (i / 6);
      mesh = mesh.concat(MTubeZ(pts[i].x, pts[i].y, pts[i].z - 28, pts[i].z + 28, rr + 15, rr + 15, '#a08c72', 8, {}));
    }
    mesh = mesh.concat(MTubeZ(pts[6].x, pts[6].y, 3920, 4060, 100, 42, '#9db185', 8, { caps: true }));
    for (i = 0; i < 11; i++) {
      var ang = (Math.PI * 2 / 11) * i + Math.PI / 11;
      mesh = mesh.concat(MBlade(pts[6].x, pts[6].y, 4020, ang, 1150 + (i % 3) * 90, 115, 1150, 1900, greens[i % 4]));
    }
    var cocos = [[78, 24, 3940], [-66, 62, 3980], [14, -84, 3900]];
    for (i = 0; i < 3; i++) {
      mesh = mesh.concat(MBlob(cocos[i][0], cocos[i][1], cocos[i][2], 52, 52, 56, '#8a6b45', 5, 2, {}));
    }
    return mesh;
  }

  // --- árbol: tronco con horquillas y copa de 6 esferas irregulares ---
  function buildTreeMesh() {
    var mesh = [], i;
    var trunk = [
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 700 }, { x: 0, y: 0, z: 1400 },
      { x: 0, y: 0, z: 1950 }, { x: 0, y: 0, z: 2450 }
    ];
    var trunkR = [205, 185, 168, 150, 135];
    for (i = 0; i < 4; i++) {
      mesh = mesh.concat(MTubeSeg(trunk[i], trunk[i + 1], trunkR[i], trunkR[i + 1],
        i % 2 ? '#a2907a' : '#9b8a70', 8, { tex: 'wood' }));
    }
    var forks = [
      [{ x: 0, y: 0, z: 2050 }, { x: -500, y: 220, z: 2980 }, 100, 46],
      [{ x: 0, y: 0, z: 2150 }, { x: 440, y: -260, z: 3010 }, 96, 44],
      [{ x: 0, y: 0, z: 2320 }, { x: 120, y: 90, z: 3480 }, 82, 36]
    ];
    for (i = 0; i < 3; i++) {
      mesh = mesh.concat(MTubeSeg(forks[i][0], forks[i][1], forks[i][2], forks[i][3], '#a2907a', 8, {}));
    }
    var crown = [
      [0, 0, 2960, 1050, 1030, 780, ['#7fa06a', '#86a873']],
      [-390, 250, 3250, 690, 650, 560, ['#8caa76', '#93b17f']],
      [430, -270, 3200, 640, 610, 540, ['#93b17f', '#9cba87']],
      [-170, -430, 3650, 610, 560, 480, ['#9cba87', '#a5c193']],
      [330, 300, 3750, 590, 550, 470, ['#a5c193', '#adc99b']],
      [20, 70, 4140, 470, 450, 400, ['#adc99b', '#b6d4a3']]
    ];
    for (i = 0; i < crown.length; i++) {
      var c = crown[i];
      mesh = mesh.concat(MBlob(c[0], c[1], c[2], c[3], c[4], c[5], c[6][0], 8, 4, { colors: c[6], wob: 0.09 }));
    }
    return mesh;
  }

  // --- arbusto: 4 esferas aplastadas solapadas ---
  function buildBushMesh() {
    var mesh = [];
    var parts = [
      [-160, 80, 258, 350, 320, 245, ['#7f9a6c', '#87a273']],
      [160, 40, 290, 320, 300, 275, ['#8caa76', '#93b17f']],
      [-20, -190, 265, 330, 310, 250, ['#8fae7c', '#97b585']],
      [50, 110, 500, 280, 260, 235, ['#9cba87', '#a5c193']]
    ];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      mesh = mesh.concat(MBlob(p[0], p[1], p[2], p[3], p[4], p[5], p[6][0], 7, 3, { colors: p[6], wob: 0.1 }));
    }
    return mesh;
  }

  // --- seto: cuerpo alargado con cúpula y bultos de follaje ---
  function buildHedgeMesh() {
    var mesh = [], i;
    mesh = mesh.concat(MBlob(0, 0, 500, 855, 205, 500, '#91af7c', 10, 4,
      { colors: ['#91af7c', '#97b585', '#9cba87'], wob: 0.05 }));
    var tones = ['#9cba87', '#a5c193', '#b0cd9e'];
    for (i = 0; i < 7; i++) {
      mesh = mesh.concat(MBlob(-720 + i * 240, (i % 2) ? 55 : -60, 980, 210, 185, 190,
        tones[i % 3], 5, 2, { wob: 0.12 }));
    }
    return mesh;
  }

  // --- macizo floral: flores esféricas de colores y hojas ---
  function buildFlowerBedMesh() {
    var mesh = [], i;
    var flowers = [
      [-430, 160, '#d9b45b'], [-130, 250, '#d78f9e'], [230, 150, '#c96f62'],
      [420, -130, '#e6e2d6'], [-40, -180, '#b58ac4'], [-330, -230, '#d9b45b'],
      [120, -210, '#d78f9e']
    ];
    for (i = 0; i < flowers.length; i++) {
      var x = flowers[i][0], y = flowers[i][1], col = flowers[i][2];
      mesh = mesh.concat(MBlob(x, y, 402, 78, 78, 72, col, 5, 2, { colors: [col, '#f2ead7'] }));
      mesh = mesh.concat(MBlade(x - 28, y - 18, 352, (i * 1.7) % (Math.PI * 2), 88, 26, 62, 38, '#7f9a6c'));
      mesh = mesh.concat(MBlade(x + 20, y + 16, 352, (i * 2.3 + 2.2) % (Math.PI * 2), 74, 22, 44, 30, '#93b57f'));
    }
    return mesh;
  }

  // --- vehículos: sedán (car), SUV (suv) y pickup (pickup) ---
  // Carrocería con laterales suavizados y pasos de rueda circulares, cabina de
  // cristal tintado, paragolpes, capó con líneas, techo panorámico (car/suv),
  // faros/pilotos con detalle y 4 ruedas con llanta y radios. Frente hacia -X.
  var VEH = {
    car: {
      L: 2150, NB: 810, NT: 790, Z0: 220, BELT: 950, ROOF: 1470,
      wheelR: 330, wheelHW: 105, wheelY: 735, axleF: -1380, axleR: 1380, archR: 430,
      cowlX: -820, zCowl: 1015, roofF: -300, roofR: 640, roofHW: 680,
      deckX: 1080, deckZ: 1015, rear: 'trunk', pano: true, rails: false,
      paint: '#9db2c3', paintDark: '#7e97aa', glass: '#37434f', trim: '#2f3a45'
    },
    suv: {
      L: 2400, NB: 870, NT: 845, Z0: 300, BELT: 1080, ROOF: 1760,
      wheelR: 380, wheelHW: 120, wheelY: 770, axleF: -1480, axleR: 1480, archR: 500,
      cowlX: -880, zCowl: 1180, roofF: -320, roofR: 900, roofHW: 720,
      deckX: 1380, deckZ: 1140, rear: 'trunk', pano: true, rails: true,
      paint: '#9fb4c4', paintDark: '#8098ab', glass: '#37434f', trim: '#2f3a45'
    },
    pickup: {
      L: 2700, NB: 900, NT: 875, Z0: 320, BELT: 1120, ROOF: 1820,
      wheelR: 385, wheelHW: 125, wheelY: 795, axleF: -1650, axleR: 1650, archR: 500,
      cowlX: -920, zCowl: 1210, roofF: -380, roofR: 520, roofHW: 720,
      deckX: 800, deckZ: 1210, rear: 'bed', pano: false, rails: false, bedX0: 860,
      paint: '#a5b7c6', paintDark: '#8499aa', glass: '#37434f', trim: '#2f3a45'
    }
  };

  function buildVehicleMesh(kind) {
    var c = VEH[kind] || VEH.car;
    var L = c.L, NB = c.NB, NT = c.NT, Z0 = c.Z0, BELT = c.BELT, ROOF = c.ROOF;
    var paint = c.paint, paintDark = c.paintDark, glass = c.glass, trim = c.trim;
    var light = '#fdf3cf', amber = '#e8a95b', red = '#c1453c';
    var body = [], extra = [], axles = [c.axleF, c.axleR];
    function q(a, b, cc, d, color, opts) { body.push(MFace([a, b, cc, d], color, opts)); }
    var i, k;
    var zAedge = 2 * c.wheelR + 40 - c.archR;
    function zArch(dx) {
      return (2 * c.wheelR + 40) + Math.sqrt(Math.max(0, c.archR * c.archR - dx * dx)) - c.archR;
    }
    function zBottom(x) {
      var z = Z0;
      for (var a = 0; a < 2; a++) {
        var dx = x - axles[a], ad = Math.abs(dx);
        if (ad <= c.archR) z = Math.max(z, zArch(dx));
        else if (ad < c.archR + 90) {
          var t = (ad - c.archR) / 90;
          z = Math.max(z, zAedge * (1 - t) + Z0 * t);
        }
      }
      return z;
    }

    // Bajos.
    q({ x: -L + 20, y: -NB, z: Z0 }, { x: L - 20, y: -NB, z: Z0 },
      { x: L - 20, y: NB, z: Z0 }, { x: -L + 20, y: NB, z: Z0 }, trim);
    // Laterales con caída y pasos de rueda redondeados.
    var xs = [-L, -L + 180, L - 180, L];
    for (k = 0; k < 2; k++) {
      xs.push(axles[k] - c.archR - 90, axles[k] + c.archR + 90);
      for (i = 0; i <= 12; i++) xs.push(axles[k] + c.archR * (-1 + 2 * i / 12));
    }
    xs.sort(function (a, b) { return a - b; });
    var X = [-L];
    for (i = 1; i < xs.length; i++) {
      if (xs[i] - X[X.length - 1] > 45 && xs[i] < L - 40) X.push(xs[i]);
    }
    X.push(L);
    for (i = 0; i < X.length - 1; i++) {
      var x0 = X[i], x1 = X[i + 1], z0 = zBottom(x0), z1b = zBottom(x1);
      q({ x: x0, y: NB, z: z0 }, { x: x1, y: NB, z: z1b },
        { x: x1, y: NT, z: BELT }, { x: x0, y: NT, z: BELT }, paint);
      q({ x: x0, y: -NB, z: z0 }, { x: x1, y: -NB, z: z1b },
        { x: x1, y: -NT, z: BELT }, { x: x0, y: -NT, z: BELT }, paint);
    }
    // Frente y zaga.
    q({ x: -L, y: -NB, z: Z0 }, { x: -L, y: NB, z: Z0 },
      { x: -L, y: NT, z: BELT }, { x: -L, y: -NT, z: BELT }, paint);
    q({ x: L, y: -NB, z: Z0 }, { x: L, y: NB, z: Z0 },
      { x: L, y: NT, z: BELT }, { x: L, y: -NT, z: BELT }, paint);
    // Capó (con dos líneas de carácter) y tapa del maletero.
    q({ x: -L, y: -NT, z: BELT }, { x: -L, y: NT, z: BELT },
      { x: c.cowlX, y: NT, z: c.zCowl }, { x: c.cowlX, y: -NT, z: c.zCowl }, paint);
    for (k = -1; k <= 1; k += 2) {
      q({ x: -L + 60, y: k * NT / 3 - 3, z: BELT + 4 }, { x: -L + 60, y: k * NT / 3 + 3, z: BELT + 4 },
        { x: c.cowlX - 40, y: k * NT / 3 + 3, z: c.zCowl + 4 }, { x: c.cowlX - 40, y: k * NT / 3 - 3, z: c.zCowl + 4 }, paintDark);
    }
    if (c.rear === 'trunk') {
      q({ x: c.deckX, y: -NT, z: c.deckZ }, { x: c.deckX, y: NT, z: c.deckZ },
        { x: L, y: NT, z: BELT }, { x: L, y: -NT, z: BELT }, paint);
    }
    // Parabrisas, techo, techo panorámico, barras y luneta.
    q({ x: c.cowlX, y: -NT, z: c.zCowl }, { x: c.cowlX, y: NT, z: c.zCowl },
      { x: c.roofF, y: c.roofHW, z: ROOF }, { x: c.roofF, y: -c.roofHW, z: ROOF }, glass);
    q({ x: c.roofF, y: -c.roofHW, z: ROOF }, { x: c.roofF, y: c.roofHW, z: ROOF },
      { x: c.roofR, y: c.roofHW, z: ROOF }, { x: c.roofR, y: -c.roofHW, z: ROOF }, paint);
    q({ x: c.roofR, y: -c.roofHW, z: ROOF }, { x: c.roofR, y: c.roofHW, z: ROOF },
      { x: c.deckX, y: NT, z: c.deckZ }, { x: c.deckX, y: -NT, z: c.deckZ }, glass);
    if (c.pano) {
      q({ x: c.roofF + 90, y: -(c.roofHW - 95), z: ROOF + 2 }, { x: c.roofF + 90, y: c.roofHW - 95, z: ROOF + 2 },
        { x: c.roofR - 90, y: c.roofHW - 95, z: ROOF + 2 }, { x: c.roofR - 90, y: -(c.roofHW - 95), z: ROOF + 2 }, '#4c5d6b');
    }
    if (c.rails) {
      q({ x: c.roofF + 60, y: c.roofHW - 50, z: ROOF + 1 }, { x: c.roofF + 60, y: c.roofHW - 12, z: ROOF + 1 },
        { x: c.roofR - 60, y: c.roofHW - 12, z: ROOF + 1 }, { x: c.roofR - 60, y: c.roofHW - 50, z: ROOF + 1 }, paintDark);
      q({ x: c.roofF + 60, y: -c.roofHW + 12, z: ROOF + 1 }, { x: c.roofF + 60, y: -c.roofHW + 50, z: ROOF + 1 },
        { x: c.roofR - 60, y: -c.roofHW + 50, z: ROOF + 1 }, { x: c.roofR - 60, y: -c.roofHW + 12, z: ROOF + 1 }, paintDark);
    }
    // Cabina: cristales laterales tintados, pilares A/B/C.
    var ys = NT, yt = c.roofHW, b0 = Math.round((c.cowlX + c.deckX) / 2) - 10, b1 = b0 + 60;
    q({ x: c.cowlX, y: ys, z: BELT }, { x: b0, y: ys, z: BELT },
      { x: b0, y: yt, z: ROOF }, { x: c.roofF, y: yt, z: ROOF }, glass);
    q({ x: b1, y: ys, z: BELT }, { x: c.deckX, y: ys, z: BELT },
      { x: c.roofR, y: yt, z: ROOF }, { x: b1, y: yt, z: ROOF }, glass);
    q({ x: b0, y: ys + 2, z: BELT }, { x: b1, y: ys + 2, z: BELT },
      { x: b1, y: yt + 2, z: ROOF }, { x: b0, y: yt + 2, z: ROOF }, paintDark);
    q({ x: c.cowlX, y: -ys, z: BELT }, { x: b0, y: -ys, z: BELT },
      { x: b0, y: -yt, z: ROOF }, { x: c.roofF, y: -yt, z: ROOF }, glass);
    q({ x: b1, y: -ys, z: BELT }, { x: c.deckX, y: -ys, z: BELT },
      { x: c.roofR, y: -yt, z: ROOF }, { x: b1, y: -yt, z: ROOF }, glass);
    q({ x: b0, y: -ys - 2, z: BELT }, { x: b1, y: -ys - 2, z: BELT },
      { x: b1, y: -yt - 2, z: ROOF }, { x: b0, y: -yt - 2, z: ROOF }, paintDark);
    body.push(MFace([{ x: c.cowlX, y: ys, z: BELT }, { x: c.cowlX, y: ys, z: c.zCowl }, { x: c.roofF, y: yt, z: ROOF }], paint));
    body.push(MFace([{ x: c.deckX, y: ys, z: c.deckZ }, { x: c.deckX, y: ys, z: BELT }, { x: c.roofR, y: yt, z: ROOF }], paint));
    body.push(MFace([{ x: c.cowlX, y: -ys, z: BELT }, { x: c.cowlX, y: -ys, z: c.zCowl }, { x: c.roofF, y: -yt, z: ROOF }], paint));
    body.push(MFace([{ x: c.deckX, y: -ys, z: c.deckZ }, { x: c.deckX, y: -ys, z: BELT }, { x: c.roofR, y: -yt, z: ROOF }], paint));
    // Espejos retrovisores y manillas de puerta.
    var mx0 = c.cowlX + 40, mx1 = c.cowlX + 160, mz0 = c.zCowl + 15, mz1 = c.zCowl + 65;
    q({ x: mx0, y: NT - 4, z: mz0 }, { x: mx1, y: NT - 4, z: mz0 },
      { x: mx1, y: NT + 95, z: mz1 }, { x: mx0, y: NT + 95, z: mz1 }, paint, { twoSided: true });
    q({ x: mx0, y: -NT + 4, z: mz0 }, { x: mx1, y: -NT + 4, z: mz0 },
      { x: mx1, y: -NT - 95, z: mz1 }, { x: mx0, y: -NT - 95, z: mz1 }, paint, { twoSided: true });
    var hxs = [-L * 0.06, L * 0.28];
    for (i = 0; i < 2; i++) {
      q({ x: hxs[i], y: NT + 3, z: BELT - 120 }, { x: hxs[i] + 150, y: NT + 3, z: BELT - 120 },
        { x: hxs[i] + 150, y: NT + 3, z: BELT - 80 }, { x: hxs[i], y: NT + 3, z: BELT - 80 }, '#8d9aa6');
      q({ x: hxs[i], y: -NT - 3, z: BELT - 120 }, { x: hxs[i] + 150, y: -NT - 3, z: BELT - 120 },
        { x: hxs[i] + 150, y: -NT - 3, z: BELT - 80 }, { x: hxs[i], y: -NT - 3, z: BELT - 80 }, '#8d9aa6');
    }
    // Cejas de los pasos de rueda siguiendo el arco.
    for (k = 0; k < 2; k++) {
      var ax = axles[k];
      for (i = 0; i < 8; i++) {
        var dx0 = -c.archR + 2 * c.archR * (i / 8);
        var dx1 = -c.archR + 2 * c.archR * ((i + 1) / 8);
        var za = zArch(dx0), zbb = zArch(dx1);
        q({ x: ax + dx0, y: NB + 5, z: za - 26 }, { x: ax + dx1, y: NB + 5, z: zbb - 26 },
          { x: ax + dx1, y: NB + 5, z: zbb + 32 }, { x: ax + dx0, y: NB + 5, z: za + 32 }, trim);
        q({ x: ax + dx0, y: -NB - 5, z: za - 26 }, { x: ax + dx1, y: -NB - 5, z: zbb - 26 },
          { x: ax + dx1, y: -NB - 5, z: zbb + 32 }, { x: ax + dx0, y: -NB - 5, z: za + 32 }, trim);
      }
    }
    // Faldones entre pasos y bajo los paragolpes.
    var sk0 = c.axleF + c.archR + 40, sk1 = c.axleR - c.archR - 40;
    q({ x: sk0, y: NB + 5, z: Z0 }, { x: sk1, y: NB + 5, z: Z0 },
      { x: sk1, y: NB + 5, z: Z0 + 130 }, { x: sk0, y: NB + 5, z: Z0 + 130 }, trim);
    q({ x: sk0, y: -NB - 5, z: Z0 }, { x: sk1, y: -NB - 5, z: Z0 },
      { x: sk1, y: -NB - 5, z: Z0 + 130 }, { x: sk0, y: -NB - 5, z: Z0 + 130 }, trim);
    // Líneas de puerta.
    var seams = [-L * 0.07, L * 0.26];
    for (i = 0; i < 2; i++) {
      q({ x: seams[i], y: NB + 1, z: Z0 + 80 }, { x: seams[i] + 8, y: NB + 1, z: Z0 + 80 },
        { x: seams[i] + 8, y: NT + 1, z: BELT }, { x: seams[i], y: NT + 1, z: BELT }, '#5d6f7f');
      q({ x: seams[i], y: -NB - 1, z: Z0 + 80 }, { x: seams[i] + 8, y: -NB - 1, z: Z0 + 80 },
        { x: seams[i] + 8, y: -NT - 1, z: BELT }, { x: seams[i], y: -NT - 1, z: BELT }, '#5d6f7f');
    }
    // Paragolpes (fascia central + esquinas envolventes).
    var bz1 = Z0 + 190;
    q({ x: -L - 3, y: -NB + 30, z: Z0 }, { x: -L - 3, y: NB - 30, z: Z0 },
      { x: -L - 3, y: NB - 30, z: bz1 }, { x: -L - 3, y: -NB + 30, z: bz1 }, trim);
    q({ x: -L - 3, y: NB - 30, z: Z0 }, { x: -L + 240, y: NB + 5, z: Z0 },
      { x: -L + 240, y: NB + 5, z: bz1 }, { x: -L - 3, y: NB - 30, z: bz1 }, trim);
    q({ x: -L - 3, y: -NB + 30, z: Z0 }, { x: -L + 240, y: -NB - 5, z: Z0 },
      { x: -L + 240, y: -NB - 5, z: bz1 }, { x: -L - 3, y: -NB + 30, z: bz1 }, trim);
    q({ x: L + 3, y: -NB + 30, z: Z0 }, { x: L + 3, y: NB - 30, z: Z0 },
      { x: L + 3, y: NB - 30, z: bz1 }, { x: L + 3, y: -NB + 30, z: bz1 }, trim);
    q({ x: L + 3, y: NB - 30, z: Z0 }, { x: L - 240, y: NB + 5, z: Z0 },
      { x: L - 240, y: NB + 5, z: bz1 }, { x: L + 3, y: NB - 30, z: bz1 }, trim);
    q({ x: L + 3, y: -NB + 30, z: Z0 }, { x: L - 240, y: -NB - 5, z: Z0 },
      { x: L - 240, y: -NB - 5, z: bz1 }, { x: L + 3, y: -NB + 30, z: bz1 }, trim);
    // Parrilla con barras, faros con detalle y toma de aire.
    var gz0 = Z0 + (BELT - Z0) * 0.44, gz1 = Z0 + (BELT - Z0) * 0.74;
    q({ x: -L - 4, y: -NB * 0.56, z: gz0 }, { x: -L - 4, y: NB * 0.56, z: gz0 },
      { x: -L - 4, y: NB * 0.56, z: gz1 }, { x: -L - 4, y: -NB * 0.56, z: gz1 }, '#2a333c');
    for (i = 0; i < 3; i++) {
      var gz = gz0 + (gz1 - gz0) * (0.18 + 0.32 * i);
      q({ x: -L - 5, y: -NB * 0.52, z: gz }, { x: -L - 5, y: NB * 0.52, z: gz },
        { x: -L - 5, y: NB * 0.52, z: gz + 26 }, { x: -L - 5, y: -NB * 0.52, z: gz + 26 }, '#b9c4cc');
    }
    var hz0 = Z0 + (BELT - Z0) * 0.74, hz1 = Z0 + (BELT - Z0) * 0.95;
    q({ x: -L - 4, y: NB * 0.58, z: hz0 }, { x: -L - 4, y: NB * 0.95, z: hz0 },
      { x: -L - 4, y: NB * 0.95, z: hz1 }, { x: -L - 4, y: NB * 0.58, z: hz1 }, '#39434c');
    q({ x: -L - 5, y: NB * 0.62, z: hz0 + 12 }, { x: -L - 5, y: NB * 0.93, z: hz0 + 12 },
      { x: -L - 5, y: NB * 0.93, z: hz1 - 12 }, { x: -L - 5, y: NB * 0.62, z: hz1 - 12 }, light);
    q({ x: -L - 4, y: -NB * 0.95, z: hz0 }, { x: -L - 4, y: -NB * 0.58, z: hz0 },
      { x: -L - 4, y: -NB * 0.58, z: hz1 }, { x: -L - 4, y: -NB * 0.95, z: hz1 }, '#39434c');
    q({ x: -L - 5, y: -NB * 0.93, z: hz0 + 12 }, { x: -L - 5, y: -NB * 0.62, z: hz0 + 12 },
      { x: -L - 5, y: -NB * 0.62, z: hz1 - 12 }, { x: -L - 5, y: -NB * 0.93, z: hz1 - 12 }, light);
    q({ x: -L - 4, y: NB * 0.60, z: gz0 - 70 }, { x: -L - 4, y: NB * 0.95, z: gz0 - 70 },
      { x: -L - 4, y: NB * 0.95, z: gz0 - 30 }, { x: -L - 4, y: NB * 0.60, z: gz0 - 30 }, amber);
    q({ x: -L - 4, y: -NB * 0.95, z: gz0 - 70 }, { x: -L - 4, y: -NB * 0.60, z: gz0 - 70 },
      { x: -L - 4, y: -NB * 0.60, z: gz0 - 30 }, { x: -L - 4, y: -NB * 0.95, z: gz0 - 30 }, amber);
    // Pilotos con detalle y matrícula.
    var tz0 = BELT - 210, tz1 = BELT - 60;
    q({ x: L + 4, y: NB * 0.50, z: tz0 }, { x: L + 4, y: NB * 0.95, z: tz0 },
      { x: L + 4, y: NB * 0.95, z: tz1 }, { x: L + 4, y: NB * 0.50, z: tz1 }, '#39434c');
    q({ x: L + 5, y: NB * 0.54, z: tz0 + 14 }, { x: L + 5, y: NB * 0.92, z: tz0 + 14 },
      { x: L + 5, y: NB * 0.92, z: tz1 - 14 }, { x: L + 5, y: NB * 0.54, z: tz1 - 14 }, red);
    q({ x: L + 4, y: -NB * 0.95, z: tz0 }, { x: L + 4, y: -NB * 0.50, z: tz0 },
      { x: L + 4, y: -NB * 0.50, z: tz1 }, { x: L + 4, y: -NB * 0.95, z: tz1 }, '#39434c');
    q({ x: L + 5, y: -NB * 0.92, z: tz0 + 14 }, { x: L + 5, y: -NB * 0.54, z: tz0 + 14 },
      { x: L + 5, y: -NB * 0.54, z: tz1 - 14 }, { x: L + 5, y: -NB * 0.92, z: tz1 - 14 }, red);
    q({ x: L + 4, y: -NB * 0.22, z: tz0 - 40 }, { x: L + 4, y: NB * 0.22, z: tz0 - 40 },
      { x: L + 4, y: NB * 0.22, z: tz0 + 90 }, { x: L + 4, y: -NB * 0.22, z: tz0 + 90 }, '#e8e4d8');
    // Caja de la pickup: piso, paredes interiores y tapas de las paredes.
    if (c.rear === 'bed') {
      q({ x: c.deckX, y: -NT, z: BELT }, { x: c.deckX, y: NT, z: BELT },
        { x: c.deckX, y: NT, z: c.deckZ }, { x: c.deckX, y: -NT, z: c.deckZ }, paint);
      var bedZ = BELT - 150, bw = NT - 45;
      extra.push(MFace([{ x: c.bedX0, y: -bw, z: bedZ }, { x: L - 40, y: -bw, z: bedZ },
        { x: L - 40, y: bw, z: bedZ }, { x: c.bedX0, y: bw, z: bedZ }], '#9aa6b0', { twoSided: true }));
      extra.push(MFace([{ x: c.bedX0, y: bw, z: bedZ }, { x: L - 40, y: bw, z: bedZ },
        { x: L - 40, y: bw, z: BELT }, { x: c.bedX0, y: bw, z: BELT }], paintDark, { twoSided: true }));
      extra.push(MFace([{ x: c.bedX0, y: -bw, z: bedZ }, { x: L - 40, y: -bw, z: bedZ },
        { x: L - 40, y: -bw, z: BELT }, { x: c.bedX0, y: -bw, z: BELT }], paintDark, { twoSided: true }));
      extra.push(MFace([{ x: c.bedX0, y: -bw, z: bedZ }, { x: c.bedX0, y: bw, z: bedZ },
        { x: c.bedX0, y: bw, z: BELT }, { x: c.bedX0, y: -bw, z: BELT }], paintDark, { twoSided: true }));
      q({ x: c.bedX0, y: bw, z: BELT }, { x: L - 40, y: bw, z: BELT },
        { x: L - 40, y: NT, z: BELT }, { x: c.bedX0, y: NT, z: BELT }, paintDark);
      q({ x: c.bedX0, y: -NT, z: BELT }, { x: L - 40, y: -NT, z: BELT },
        { x: L - 40, y: -bw, z: BELT }, { x: c.bedX0, y: -bw, z: BELT }, paintDark);
    }
    // Pozos de rueda oscuros (evitan ver a través de los pasos).
    for (k = 0; k < 2; k++) {
      var ax2 = axles[k], wy = c.wheelY - c.wheelHW - 10, wz = zArch(0) + 40;
      extra.push(MFace([{ x: ax2 - c.archR - 40, y: wy, z: Z0 }, { x: ax2 + c.archR + 40, y: wy, z: Z0 },
        { x: ax2 + c.archR + 40, y: wy, z: wz }, { x: ax2 - c.archR - 40, y: wy, z: wz }], '#232a31', { twoSided: true }));
      extra.push(MFace([{ x: ax2 - c.archR - 40, y: -wy, z: Z0 }, { x: ax2 + c.archR + 40, y: -wy, z: Z0 },
        { x: ax2 + c.archR + 40, y: -wy, z: wz }, { x: ax2 - c.archR - 40, y: -wy, z: wz }], '#232a31', { twoSided: true }));
    }

    MOrient(body, { x: 0, y: 0, z: BELT * 0.75 });
    var mesh = body.concat(extra);
    mesh = mesh.concat(MWheel(c.axleF, -c.wheelY, c.wheelR + 5, c.wheelR, c.wheelHW, '#2b333b', '#c9d1d8', 14));
    mesh = mesh.concat(MWheel(c.axleF, c.wheelY, c.wheelR + 5, c.wheelR, c.wheelHW, '#2b333b', '#c9d1d8', 14));
    mesh = mesh.concat(MWheel(c.axleR, -c.wheelY, c.wheelR + 5, c.wheelR, c.wheelHW, '#2b333b', '#c9d1d8', 14));
    mesh = mesh.concat(MWheel(c.axleR, c.wheelY, c.wheelR + 5, c.wheelR, c.wheelHW, '#2b333b', '#c9d1d8', 14));
    return mesh;
  }

  function buildCarMesh() { return buildVehicleMesh('car'); }

  // --- iluminación: farola, lámpara de jardín, poste y colgante ---
  // Luz emisiva simulada con colores muy claros en lentes y bombillas.
  var LAMP_LIGHT = '#fdf3c4', LAMP_GLOW = '#fff7dc', LAMP_GLASS = '#e8dfc4';

  function buildStreetLampMesh() {
    var m = [], i;
    m = m.concat(MTubeZ(0, 0, 0, 110, 230, 205, '#5b6771', 8, { caps: true }));
    m = m.concat(MTubeZ(0, 0, 110, 1150, 150, 120, '#5b6771', 8, {}));
    m = m.concat(MTubeZ(0, 0, 1150, 2160, 120, 85, '#5b6771', 8, {}));
    var arm = [
      { x: 0, y: 0, z: 2160 }, { x: 90, y: 0, z: 2240 }, { x: 200, y: 0, z: 2280 },
      { x: 300, y: 0, z: 2280 }
    ];
    for (i = 0; i < arm.length - 1; i++) {
      m = m.concat(MTubeSeg(arm[i], arm[i + 1], 60 - i * 10, 50 - i * 10, '#5b6771', 8, {}));
    }
    m = m.concat(MTubeSeg({ x: 300, y: 0, z: 2280 }, { x: 300, y: 0, z: 2165 }, 45, 130, '#4f5b66', 10, {}));
    m.push(MDiscZ(300, 0, 2166, 122, LAMP_LIGHT, 8));
    m = m.concat(MBlob(300, 0, 2215, 52, 52, 55, LAMP_GLOW, 5, 2, {}));
    return m;
  }

  function buildGardenLampMesh() {
    var m = [];
    m = m.concat(MTubeZ(0, 0, 0, 370, 55, 34, '#5b6771', 8, { caps: true }));
    m = m.concat(MBlob(0, 0, 430, 122, 122, 112, LAMP_GLOW, 6, 3, { colors: [LAMP_GLOW, LAMP_LIGHT] }));
    m = m.concat(MTubeZ(0, 0, 540, 600, 105, 12, '#4f5b66', 8, { caps: true }));
    return m;
  }

  function buildPostLampMesh() {
    var m = [];
    m = m.concat(MTubeZ(0, 0, 0, 180, 205, 175, '#5b6771', 8, { caps: true }));
    m = m.concat(MTubeZ(0, 0, 180, 2400, 62, 46, '#5b6771', 8, {}));
    m = m.concat(MTubeZ(0, 0, 2400, 2760, 148, 128, LAMP_LIGHT, 6, {}));
    m.push(MFace(MRingXY(0, 0, 2401, 145, 145, 6, 0), LAMP_GLOW));
    m.push(MFace(MRingXY(0, 0, 2759, 126, 126, 6, 0), '#4f5b66'));
    m = m.concat(MTubeZ(0, 0, 2760, 2940, 185, 12, '#4f5b66', 8, { caps: true }));
    m = m.concat(MBlob(0, 0, 2945, 34, 34, 32, '#4f5b66', 5, 2, {}));
    return m;
  }

  function buildPendantLampMesh() {
    var m = [];
    m = m.concat(MTubeZ(0, 0, 340, 400, 20, 18, '#5b6771', 6, {}));
    m.push(MDiscZ(0, 0, 400, 62, '#4f5b66', 8));
    m = m.concat(MTubeSeg({ x: 0, y: 0, z: 340 }, { x: 0, y: 0, z: 232 }, 42, 150, LAMP_GLASS, 10, {}));
    m.push(MDiscZ(0, 0, 233, 128, LAMP_GLOW, 8));
    m = m.concat(MBlob(0, 0, 212, 54, 54, 58, LAMP_GLOW, 5, 2, {}));
    return m;
  }


  // ------------------------------------------------------------------ muebles
  function sofa(id, name, seats) {
    var w = seats === 3 ? 2200 : (seats === 2 ? 1650 : 950);
    var plan = [
      R(-w / 2, -450, w, 900, 70, COL.fabric),
      R(-w / 2, 230, w, 220, 40, COL.fabricDark),
      R(-w / 2, -450, 170, 900, 30, COL.fabricDark),
      R(w / 2 - 170, -450, 170, 900, 30, COL.fabricDark)
    ];
    var innerW = w - 340;
    var seg = innerW / seats;
    var boxes = [
      B(-w / 2, -450, 0, w, 900, 380, '#e5eaf0'),
      B(-w / 2, 230, 380, w, 220, 430, '#c9d5e2'),
      B(-w / 2, -450, 380, 170, 900, 280, '#d3dde7'),
      B(w / 2 - 170, -450, 380, 170, 900, 280, '#d3dde7')
    ];
    for (var s = 0; s < seats; s++) {
      var cx = -innerW / 2 + seg * s + seg / 2;
      plan.push(R(cx - seg / 2 + 25, -340, seg - 50, 620, 35, '#eef1f4'));
      boxes.push(B(cx - seg / 2 + 20, -340, 380, seg - 40, 620, 120, '#eef1f4'));
    }
    if (seats === 1) {
      plan.push(L(-w / 2 + 170, -300, w / 2 - 170, -300, '#b9c4d0'));
    }
    add(id, name, 'muebles', w, 900, 850, '#8c9aaa', plan, boxes, 'sala living sofa ' + seats + ' puestos');
  }
  sofa('sofa3', 'Sofá 3 puestos', 3);
  sofa('sofa2', 'Sofá 2 puestos', 2);
  sofa('armchair', 'Sillón', 1);

  add('coffeeTable', 'Mesa de centro', 'muebles', 1100, 600, 420, '#b99f7c', [
    R(-550, -300, 1100, 600, 55, COL.wood),
    R(-470, -220, 940, 440, 35, '#efe6d6'),
    C(0, 0, 60, '#d3c1a5')
  ], [
    B(-550, -300, 360, 1100, 600, 60, '#e7dac6'),
    B(-500, -250, 0, 70, 70, 360, '#b99f7c'),
    B(430, -250, 0, 70, 70, 360, '#b99f7c'),
    B(-500, 180, 0, 70, 70, 360, '#b99f7c'),
    B(430, 180, 0, 70, 70, 360, '#b99f7c')
  ], 'mesa centro sala');

  function diningTable(id, name, w, seats) {
    var d = 1000;
    var plan = [R(-w / 2, -d / 2, w, d, 70, COL.wood), R(-w / 2 + 40, -d / 2 + 40, w - 80, d - 80, 50, '#f0e7d8')];
    var boxes = [
      B(-w / 2, -d / 2, 700, w, d, 70, '#e8dcc8'),
      B(-w / 2 + 80, -d / 2 + 80, 0, 80, 80, 700, '#bda98c'),
      B(w / 2 - 160, -d / 2 + 80, 0, 80, 80, 700, '#bda98c'),
      B(-w / 2 + 80, d / 2 - 160, 0, 80, 80, 700, '#bda98c'),
      B(w / 2 - 160, d / 2 - 160, 0, 80, 80, 700, '#bda98c')
    ];
    for (var i = 0; i < seats / 2; i++) {
      var x = -w / 2 + (w / (seats / 2)) * (i + 0.5);
      boxes.push(B(x - 210, -d / 2 - 480, 0, 420, 480, 450, '#8b98a7'));
      boxes.push(B(x - 210, -d / 2 - 480, 450, 420, 90, 420, '#7d8a99'));
      boxes.push(B(x - 210, d / 2, 0, 420, 480, 450, '#8b98a7'));
      boxes.push(B(x - 210, d / 2 + 390, 450, 420, 90, 420, '#7d8a99'));
      plan.push(R(x - 210, -d / 2 - 480, 420, 480, 35, '#cfd8e2'));
      plan.push(R(x - 210, d / 2, 420, 480, 35, '#cfd8e2'));
    }
    add(id, name, 'muebles', w, d, 750, '#b9a17e', plan, boxes, 'comedor mesa ' + seats + ' sillas');
  }
  diningTable('diningTable6', 'Mesa de comedor 6', 1900, 6);
  diningTable('diningTable4', 'Mesa de comedor 4', 1300, 4);

  add('chair', 'Silla', 'muebles', 450, 450, 900, '#8795a4', [
    R(-225, -225, 450, 450, 35, '#d5dee7'),
    R(-225, 130, 450, 95, 25, '#c2ceda'),
    C(0, 0, 90, '#e7ebef')
  ], [
    B(-225, -225, 0, 450, 450, 440, '#d5dee7'),
    B(-225, 140, 440, 450, 85, 430, '#b8c5d3'),
    B(-220, -180, 0, 35, 35, 440, '#8c99a8'),
    B(185, -180, 0, 35, 35, 440, '#8c99a8'),
    B(-220, 140, 0, 35, 35, 440, '#8c99a8'),
    B(185, 140, 0, 35, 35, 440, '#8c99a8')
  ], 'silla comedor escritorio');

  add('tvUnit', 'Mueble de TV', 'muebles', 1800, 420, 500, '#a08a6e', [
    R(-900, -210, 1800, 420, 25, COL.wood),
    L(-600, -210, -600, 210, '#b9a58b'),
    L(600, -210, 600, 210, '#b9a58b'),
    R(-120, -90, 240, 30, 8, '#8e7b63')
  ], [
    B(-900, -210, 0, 1800, 420, 500, '#d9cab4'),
    B(-880, -190, 500, 1760, 380, 35, '#c6b49b'),
    B(-590, -200, 80, 20, 20, 350, '#a89478'),
    B(570, -200, 80, 20, 20, 350, '#a89478')
  ], 'tv television mueble sala');

  add('television', 'Televisor', 'muebles', 1200, 110, 700, '#3c4650', [
    R(-600, -55, 1200, 110, 15, '#3b4651'),
    R(-540, -40, 1080, 80, 8, '#667584')
  ], [
    B(-600, -55, 420, 1200, 110, 700, '#2f3a45'),
    B(-520, -40, 450, 1040, 90, 640, '#41505e'),
    B(-120, -100, 0, 240, 200, 40, '#303a45'),
    B(-60, -60, 40, 120, 120, 380, '#303a45')
  ], 'tv pantalla television');

  add('desk', 'Escritorio', 'muebles', 1400, 700, 750, '#bfa887', [
    R(-700, -350, 1400, 700, 30, COL.wood),
    R(-620, -280, 520, 560, 25, '#efe6d6'),
    R(300, -240, 280, 480, 12, '#c9b596'),
    L(-700, 350, 700, 350, '#a89070')
  ], [
    B(-700, -350, 700, 1400, 700, 50, '#e2d4bf'),
    B(-680, -330, 0, 60, 60, 700, '#b6a184'),
    B(620, -330, 0, 60, 60, 700, '#b6a184'),
    B(-680, 270, 0, 60, 60, 700, '#b6a184'),
    B(620, 270, 0, 60, 60, 700, '#b6a184'),
    B(-620, -280, 700, 520, 560, 180, '#d5c4a9')
  ], 'escritorio oficina estudio');

  add('bookshelf', 'Estantería', 'muebles', 1200, 350, 2000, '#b09a7c', [
    R(-600, -175, 1200, 350, 20, COL.wood),
    L(-600, 60, 600, 60, '#cdbb9f'),
    L(-600, -60, 600, -60, '#cdbb9f'),
    R(-460, -120, 220, 90, 5, '#9fb4a3'),
    R(-180, -120, 250, 90, 5, '#c9a9a0'),
    R(140, -120, 220, 90, 5, '#a7b6c8'),
    R(-470, 0, 180, 70, 5, '#b7a4c4'),
    R(-240, 0, 250, 70, 5, '#c9b68f')
  ], [
    B(-600, -175, 0, 1200, 350, 2000, '#d7c7ae'),
    B(-580, -160, 0, 30, 320, 2000, '#ae987c'),
    B(550, -160, 0, 30, 320, 2000, '#ae987c'),
    B(-580, -160, 650, 1160, 320, 30, '#bfa988'),
    B(-580, -160, 1300, 1160, 320, 30, '#bfa988')
  ], 'estanteria libros repisa');

  add('rug', 'Alfombra', 'muebles', 2400, 1600, 15, '#cbb9a0', [
    R(-1200, -800, 2400, 1600, 10, '#ddd0ba'),
    R(-1120, -720, 2240, 1440, 6, 'rgba(255,255,255,0.0)', '#c4ad8e'),
    R(-980, -580, 1960, 1160, 4, 'rgba(255,255,255,0.0)', '#cdb99d')
  ], [
    B(-1200, -800, 0, 2400, 1600, 15, '#ded1bb')
  ], 'alfombra sala');

  add('sideboard', 'Aparador', 'muebles', 1600, 450, 850, '#a98f70', [
    R(-800, -225, 1600, 450, 20, COL.wood),
    L(-300, -225, -300, 225, '#bda889'),
    L(300, -225, 300, 225, '#bda889'),
    C(-530, 0, 25, '#8d7a62'),
    C(0, 0, 25, '#8d7a62'),
    C(530, 0, 25, '#8d7a62')
  ], [
    B(-800, -225, 0, 1600, 450, 850, '#d3c0a5'),
    B(-780, -205, 820, 1560, 410, 30, '#c2ae91')
  ], 'aparador consola sala');

  add('consoleTable', 'Consola', 'muebles', 1000, 350, 800, '#b39a7a', [
    R(-500, -175, 1000, 350, 15, COL.wood),
    L(-430, -175, -430, 175, '#9f886b'),
    L(430, -175, 430, 175, '#9f886b')
  ], [
    B(-500, -175, 760, 1000, 350, 40, '#dfd0b8'),
    B(-470, -155, 0, 45, 45, 760, '#ae9678'),
    B(425, -155, 0, 45, 45, 760, '#ae9678'),
    B(-470, 110, 0, 45, 45, 760, '#ae9678'),
    B(425, 110, 0, 45, 45, 760, '#ae9678')
  ], 'consola recibidor');

  // ------------------------------------------------------------------ cocina
  add('kitchenCounter', 'Mesón de cocina', 'cocina', 2400, 620, 900, '#cbb99f', [
    R(-1200, -310, 2400, 620, 10, '#e8e1d4'),
    R(-1180, -300, 2360, 600, 8, '#d6d0c5'),
    R(-560, -230, 520, 440, 120, '#cfd7d9'),
    C(300, 0, 180, '#c8d1d3'),
    L(300, 0, 300, 120, '#8d9aa2'),
    L(-1200, 170, 1200, 170, '#c1bbb0')
  ], [
    B(-1200, -310, 0, 2400, 620, 850, '#e7dfd2'),
    B(-1200, -310, 850, 2400, 620, 50, '#d6cfc3'),
    B(-560, -230, 860, 520, 440, 20, '#aab7bb'),
    B(120, -110, 860, 360, 220, 20, '#aab7bb')
  ], 'cocina meson mueble bajo');

  add('kitchenIsland', 'Isla de cocina', 'cocina', 1800, 900, 950, '#c6b398', [
    R(-900, -450, 1800, 900, 12, '#e6dfd1'),
    R(-860, -410, 1720, 820, 8, '#d5cec2'),
    C(0, 0, 210, '#ccd5d7'),
    L(0, 0, 0, -140, '#8e9ba3'),
    R(460, -170, 300, 320, 16, '#d9d2c6')
  ], [
    B(-900, -450, 0, 1800, 900, 900, '#e2dacd'),
    B(-900, -450, 900, 1800, 900, 50, '#d1c9bc'),
    B(-210, -210, 910, 420, 420, 15, '#aab7bb'),
    B(430, -180, 910, 360, 360, 12, '#b9c1c4')
  ], 'isla cocina meson');

  add('stove', 'Estufa', 'cocina', 760, 640, 900, '#b8c1c8', [
    R(-380, -320, 760, 640, 12, '#dfe3e5'),
    C(-180, 140, 90, '#aeb8bf'), C(180, 140, 90, '#aeb8bf'),
    C(-180, -150, 90, '#aeb8bf'), C(180, -150, 90, '#aeb8bf'),
    L(-380, -320, 380, 320, '#c1c9ce')
  ], [
    B(-380, -320, 0, 760, 640, 900, '#d2d7da'),
    B(-380, -320, 900, 760, 640, 25, '#3f4a54'),
    B(-330, 190, 925, 120, 120, 15, '#6b7781'),
    B(-330, -250, 925, 120, 120, 15, '#6b7781'),
    B(210, 190, 925, 120, 120, 15, '#6b7781'),
    B(210, -250, 925, 120, 120, 15, '#6b7781')
  ], 'estufa cocina horno');

  add('kitchenSink', 'Fregadero', 'cocina', 800, 500, 220, '#c6cfd3', [
    R(-400, -250, 800, 500, 8, '#e4e6e5'),
    R(-330, -190, 660, 380, 60, '#c6d0d2'),
    C(0, 0, 50, '#9fadb2'),
    L(0, 0, 0, 170, '#8e9aa1')
  ], [
    B(-400, -250, 840, 800, 500, 60, '#d1d9dc'),
    B(-330, -190, 860, 660, 380, 40, '#aebbc0'),
    B(-25, 0, 900, 50, 160, 30, '#85949c')
  ], 'fregadero cocina lavabo');

  add('fridge', 'Refrigerador', 'cocina', 760, 720, 1850, '#b7c2cb', [
    R(-380, -360, 760, 720, 45, '#dfe5e9'),
    L(-380, 20, 380, 20, '#b9c4cc'),
    R(280, 120, 60, 160, 8, '#8e9aa3')
  ], [
    B(-380, -360, 0, 760, 720, 1850, '#e2e7ea'),
    B(-380, 20, 950, 760, 30, 20, '#bcc7cf'),
    B(290, 110, 1000, 40, 140, 18, '#8a969f'),
    B(290, 110, 260, 40, 140, 18, '#8a969f')
  ], 'refrigerador nevera cocina');

  add('microwave', 'Microondas', 'cocina', 650, 420, 320, '#c3ccd2', [
    R(-325, -210, 650, 420, 20, '#d9dfe2'),
    R(-250, -160, 430, 320, 12, '#5f6d78'),
    R(210, -110, 60, 220, 8, '#b4bec5')
  ], [
    B(-325, -210, 900, 650, 420, 320, '#d5dbde'),
    B(-260, -160, 925, 440, 320, 250, '#4a5661'),
    B(230, -80, 940, 45, 160, 160, '#aab5bc')
  ], 'microondas cocina');

  add('upperCabinet', 'Alacena', 'cocina', 1200, 360, 700, '#d4c9b8', [
    R(-600, -180, 1200, 360, 8, '#e5ded2'),
    L(0, -180, 0, 180, '#c8beaf')
  ], [
    B(-600, -180, 1550, 1200, 360, 700, '#e6dfd3'),
    B(-10, -170, 1600, 20, 10, 600, '#bdb3a4')
  ], 'alacena gabinete cocina');

  // ------------------------------------------------------------------ baño
  add('toilet', 'Inodoro', 'bano', 400, 700, 780, '#eef1f0', [
    R(-200, 170, 400, 180, 40, '#e9eceb'),
    C(0, -70, 220, '#f4f5f3', '#8e9ba1'),
    C(0, -70, 120, '#e3e8e7'),
    R(-180, 160, 360, 170, 30, '#dfe4e2')
  ], [
    B(-190, 120, 0, 380, 180, 760, '#e8eae8'),
    B(-200, 230, 760, 400, 100, 30, '#dfe3e1'),
    B(-220, -180, 0, 440, 420, 380, '#f0f2f0'),
    B(-180, -300, 0, 360, 140, 420, '#eceeec')
  ], 'bano inodoro wc');

  add('sinkVanity', 'Lavamanos', 'bano', 900, 520, 850, '#e3e6e4', [
    R(-450, -260, 900, 520, 12, '#e9e6de'),
    C(0, 20, 230, '#fbfcfc', '#9aa6ac'),
    C(0, 20, 170, '#e9eff0'),
    C(0, 20, 25, '#aeb9be'),
    L(0, 220, 0, 140, '#8e9ba1')
  ], [
    B(-450, -260, 0, 900, 520, 820, '#e7e3db'),
    B(-450, -260, 820, 900, 520, 30, '#d7d3ca'),
    B(-230, -180, 850, 460, 360, 40, '#f4f6f5')
  ], 'bano lavamanos lavabo vanity');

  add('shower', 'Ducha', 'bano', 1200, 1200, 2100, '#dce7e9', [
    R(-600, -600, 1200, 1200, 12, '#e4ebec'),
    R(-540, -540, 1080, 1080, 8, '#dfe9ea'),
    L(-600, -600, 600, -600, '#9db1b7', 2),
    L(-600, 600, 600, 600, '#9db1b7', 2),
    C(0, 0, 55, '#b7c5c8'),
    P([{ x: -600, y: -600 }, { x: -600, y: 600 }, { x: -450, y: 600 }, { x: -450, y: -600 }], 'rgba(168,206,214,0.35)', '#9db1b7')
  ], [
    B(-600, -600, 0, 1200, 1200, 80, '#dfe8e9'),
    B(-600, 560, 80, 1200, 30, 2000, 'rgba(144,192,202,0.5)'),
    B(-600, -600, 80, 30, 1200, 2000, 'rgba(144,192,202,0.5)'),
    B(-60, 300, 1950, 120, 120, 25, '#9aaab0')
  ], 'bano ducha shower');

  add('bathtub', 'Bañera', 'bano', 1700, 800, 600, '#e9edec', [
    R(-850, -400, 1700, 800, 80, '#f0f2f1'),
    R(-760, -320, 1520, 640, 70, '#dfe9ea'),
    C(650, 0, 28, '#a8b5ba'),
    L(-850, -400, -850, 400, '#c3cacb')
  ], [
    B(-850, -400, 0, 1700, 800, 560, '#eef1f0'),
    B(-760, -320, 450, 1520, 640, 110, '#dce8e9')
  ], 'bano banera tina');

  add('washer', 'Lavadora', 'bano', 620, 620, 900, '#dfe3e6', [
    R(-310, -310, 620, 620, 20, '#e6e9eb'),
    C(0, 0, 210, '#c5ced4', '#9aa6ad'),
    C(0, 0, 150, '#b2bec6'),
    L(-310, 200, 310, 200, '#c2cbd1')
  ], [
    B(-310, -310, 0, 620, 620, 900, '#e3e7ea'),
    B(-230, -240, 250, 460, 480, 20, '#9fb0ba'),
    B(-250, -260, 880, 500, 520, 20, '#cbd3d8')
  ], 'bano lavadora ropa');

  add('towelRack', 'Toallero', 'bano', 600, 120, 900, '#b7c0c6', [
    R(-300, -60, 600, 120, 30, '#dde3e6'),
    L(-250, 0, 250, 0, '#9aa7ae', 2)
  ], [
    B(-300, -40, 1100, 600, 80, 30, '#c3ccd1'),
    B(-280, -30, 300, 25, 60, 800, '#aab5bc')
  ], 'bano toalla toallero');

  // ------------------------------------------------------------------ dormitorio
  function bed(id, name, w, d, h) {
    var plan = [
      R(-w / 2, -d / 2, w, d, 45, COL.wood),
      R(-w / 2 + 70, -d / 2 + 70, w - 140, d - 140, 55, COL.linen),
      R(-w / 2 + 70, d / 2 - 520, w - 140, 450, 30, '#dde5ec'),
      R(-w / 2 + 90, -d / 2 + 160, w * 0.38, 430, 45, '#f6f8fa'),
      R(w / 2 - w * 0.38 - 90, -d / 2 + 160, w * 0.38, 430, 45, '#f6f8fa'),
      R(-w / 2 + 90, -d / 2 + 760, w - 180, d - 1150, 30, '#e4dfd3'),
      R(-w / 2, d / 2 - 110, w, 110, 20, '#c9b696')
    ];
    var boxes = [
      B(-w / 2, -d / 2, 0, w, d, 380, '#d9c8ae'),
      B(-w / 2 + 60, -d / 2 + 60, 380, w - 120, d - 120, 220, '#f1ece3'),
      B(-w / 2, d / 2 - 110, 0, w, 110, h, '#c5b091'),
      B(-w / 2 + 80, d / 2 - 560, 600, w * 0.36, 420, 160, '#f4f5f3'),
      B(w / 2 - w * 0.36 - 80, d / 2 - 560, 600, w * 0.36, 420, 160, '#f4f5f3'),
      B(-w / 2 + 80, -d / 2 + 740, 600, w - 160, d - 1180, 80, '#e3ded2')
    ];
    add(id, name, 'dormitorio', w, d, h, '#c9b696', plan, boxes, 'cama dormitorio dormir');
  }
  bed('bedSingle', 'Cama 1 plaza', 1000, 2000, 900);
  bed('bedDouble', 'Cama 2 plazas', 1600, 2100, 1000);
  bed('bedQueen', 'Cama queen', 1800, 2150, 1050);
  bed('bedKing', 'Cama king', 2000, 2200, 1100);

  add('crib', 'Cuna', 'dormitorio', 700, 1400, 900, '#e2d7c2', [
    R(-350, -700, 700, 1400, 30, '#eee6d8'),
    R(-310, -660, 620, 1320, 25, '#f7f3eb'),
    R(-300, -620, 600, 500, 20, '#e2e8ec'),
    L(-350, 500, 350, 500, '#c7b79f'),
    L(-350, -500, 350, -500, '#c7b79f')
  ], [
    B(-350, -700, 0, 700, 1400, 650, '#ebdfcb'),
    B(-320, -660, 650, 640, 1320, 100, '#f5f1e9'),
    B(-340, 640, 0, 680, 60, 900, '#d9c9ae'),
    B(-340, -700, 0, 680, 60, 900, '#d9c9ae')
  ], 'cuna bebe');

  add('nightstand', 'Mesa de noche', 'dormitorio', 500, 450, 600, '#bca284', [
    R(-250, -225, 500, 450, 18, COL.wood),
    L(-250, 30, 250, 30, '#cbb99d'),
    C(0, -110, 18, '#8e7b63'),
    C(0, 130, 18, '#8e7b63')
  ], [
    B(-250, -225, 0, 500, 450, 600, '#d8c5a9'),
    B(-235, -210, 580, 470, 420, 20, '#c5b093'),
    B(180, -80, 300, 35, 35, 250, '#9b876b')
  ], 'mesa noche dormitorio');

  add('wardrobe', 'Ropero', 'dormitorio', 1800, 600, 2200, '#c4ae8d', [
    R(-900, -300, 1800, 600, 15, COL.wood),
    L(0, -300, 0, 300, '#b49d7d'),
    L(-900, 0, 900, 0, '#d5c4aa'),
    L(-840, 80, -60, 80, '#b9a586'),
    L(60, 80, 840, 80, '#b9a586')
  ], [
    B(-900, -300, 0, 1800, 600, 2200, '#dacbb4'),
    B(-880, -280, 80, 860, 560, 2050, '#cbb99f'),
    B(20, -280, 80, 860, 560, 2050, '#cbb99f'),
    B(-20, 250, 1050, 40, 30, 260, '#9b876b')
  ], 'ropero closet guardarropa');

  add('dresser', 'Cómoda', 'dormitorio', 1400, 500, 900, '#c1a987', [
    R(-700, -250, 1400, 500, 18, COL.wood),
    L(-700, 80, 700, 80, '#cbb89c'),
    L(-700, -80, 700, -80, '#cbb89c'),
    C(-350, 0, 20, '#8e7b63'),
    C(0, 0, 20, '#8e7b63'),
    C(350, 0, 20, '#8e7b63')
  ], [
    B(-700, -250, 0, 1400, 500, 900, '#d5c2a7'),
    B(-680, -230, 890, 1360, 460, 25, '#c3ae92'),
    B(-660, -220, 300, 420, 30, 20, '#9e8b70'),
    B(-180, -220, 300, 420, 30, 20, '#9e8b70'),
    B(300, -220, 300, 420, 30, 20, '#9e8b70')
  ], 'comoda dormitorio cajones');

  // ------------------------------------------------------------------ exterior / estructura
  add('column', 'Columna', 'exterior', 300, 300, 2700, '#d8d6d0', [
    R(-150, -150, 300, 300, 10, '#d5d2cb'),
    R(-100, -100, 200, 200, 6, '#c6c3bb')
  ], [
    B(-150, -150, 0, 300, 300, 2700, '#dad7d1')
  ], 'columna estructura concreto');

  var stairBoxes = [];
  for (var st = 0; st < 8; st++) {
    stairBoxes.push(B(-1200 + st * 300, -500, 0, 300, 1000, 170 + st * 170, '#d6cfc2'));
  }
  stairBoxes.push(B(-1200, 440, 0, 2400, 60, 40, '#b9b0a1'));

  add('stairs', 'Escalera', 'exterior', 2400, 1000, 2700, '#cfc7b9', [
    R(-1200, -500, 2400, 1000, 8, '#d9d3c7'),
    L(-900, -500, -900, 500, '#b8afa0'),
    L(-600, -500, -600, 500, '#b8afa0'),
    L(-300, -500, -300, 500, '#b8afa0'),
    L(0, -500, 0, 500, '#b8afa0'),
    L(300, -500, 300, 500, '#b8afa0'),
    L(600, -500, 600, 500, '#b8afa0'),
    L(900, -500, 900, 500, '#b8afa0'),
    P([{ x: 1050, y: -500 }, { x: 1200, y: -500 }, { x: 1200, y: 500 }, { x: 1050, y: 500 }], '#b6ad9e', '#a59b8b')
  ], stairBoxes, 'escalera gradas estructura');

  add('plant', 'Planta', 'exterior', 600, 600, 1400, '#a9bf9b', [
    C(0, 0, 260, '#c9d8bc', '#8fa583'),
    C(-90, 40, 150, '#b7cca9', '#8fa583'),
    C(100, -30, 130, '#d2dfc7', '#8fa583'),
    R(-130, -130, 260, 260, 30, '#c7b79f', '#9b8a72')
  ], [
    B(-130, -130, 0, 260, 260, 420, '#c4b39a'),
    B(-200, -200, 420, 400, 400, 700, '#9fb98e'),
    B(-100, -100, 1000, 200, 200, 350, '#b6cca5')
  ], 'planta maceta decoracion');

  add('pot', 'Maceta', 'exterior', 400, 400, 600, '#b8a68d', [
    C(0, 0, 200, '#c8b79f', '#9b8a72'),
    C(0, 0, 150, '#a88663')
  ], [
    B(-180, -180, 0, 360, 360, 500, '#c1af96'),
    B(-150, -150, 500, 300, 300, 100, '#a88663')
  ], 'maceta jardin');

  var carDef = add('car', 'Vehículo', 'exterior', 4400, 1800, 1500, '#8fa6b8', [
    R(-2200, -900, 4400, 1800, 260, '#9fb4c4'),
    R(-1400, -780, 2300, 1560, 220, '#b8c9d5'),
    R(-1100, -650, 900, 1300, 150, '#cbd8e2'),
    C(-1400, -900, 260, '#5b6875'), C(1400, -900, 260, '#5b6875'),
    C(-1400, 900, 260, '#5b6875'), C(1400, 900, 260, '#5b6875')
  ], [
    B(-2200, -900, 250, 4400, 1800, 750, '#8fa6b8'),
    B(-1400, -800, 1000, 2300, 1600, 500, '#a8bccb'),
    B(-1300, -800, 1000, 900, 1600, 450, '#7e97aa'),
    B(-1900, -900, 0, 600, 1800, 260, '#3a4450')
  ], 'carro auto vehiculo garaje');
  carDef.mesh = buildCarMesh();

  var suvDef = add('suv', 'Camioneta SUV', 'exterior', 4800, 1950, 1800, '#8fa6b8', [
    R(-2400, -975, 4800, 1950, 300, '#9fb4c4'),
    R(-1500, -860, 2800, 1720, 240, '#b8c9d5'),
    R(-1150, -700, 860, 1400, 150, '#cbd8e2'),
    R(1150, -700, 500, 1400, 90, '#cbd8e2'),
    C(-1450, -975, 275, '#5b6875'), C(1450, -975, 275, '#5b6875'),
    C(-1450, 975, 275, '#5b6875'), C(1450, 975, 275, '#5b6875'),
    L(-2400, -760, -2050, -760, '#fdf3cf', 4), L(-2400, 760, -2050, 760, '#fdf3cf', 4),
    L(-1500, -560, 1300, -560, '#8a949c', 2), L(-1500, 560, 1300, 560, '#8a949c', 2)
  ], [
    B(-2400, -975, 300, 4800, 1950, 780, '#8fa6b8'),
    B(-1500, -860, 1080, 2800, 1720, 680, '#a8bccb'),
    B(-1470, -800, 1760, 2800, 80, 40, '#c9d1d8'),
    B(-1470, 720, 1760, 2800, 80, 40, '#c9d1d8'),
    B(-1610, -975, 0, 320, 300, 660, '#3a4450'),
    B(-1610, 675, 0, 320, 300, 660, '#3a4450'),
    B(1290, -975, 0, 320, 300, 660, '#3a4450'),
    B(1290, 675, 0, 320, 300, 660, '#3a4450'),
    B(-2400, -360, 470, 120, 720, 260, '#4a555f')
  ], 'camioneta suv todoterreno vehiculo auto 4x4');
  suvDef.mesh = buildVehicleMesh('suv');

  var pickupDef = add('pickup', 'Pickup con caja', 'exterior', 5400, 2000, 1850, '#9fb4c4', [
    R(-2700, -1000, 5400, 2000, 300, '#a5b7c6'),
    R(-1150, -880, 1750, 1760, 240, '#b8c9d5'),
    R(-850, -700, 780, 1400, 150, '#cbd8e2'),
    R(500, -700, 260, 1400, 80, '#cbd8e2'),
    R(880, -1000, 1750, 2000, 120, '#b8c9d5'),
    R(940, -940, 1630, 1880, 80, '#9aa6b0'),
    L(2620, -1000, 2620, 1000, '#7e97aa', 2),
    C(-1650, -1000, 285, '#5b6875'), C(1650, -1000, 285, '#5b6875'),
    C(-1650, 1000, 285, '#5b6875'), C(1650, 1000, 285, '#5b6875'),
    L(-2700, -760, -2320, -760, '#fdf3cf', 4), L(-2700, 760, -2320, 760, '#fdf3cf', 4)
  ], [
    B(-2700, -1000, 320, 5400, 2000, 800, '#8fa6b8'),
    B(-1150, -880, 1120, 1750, 1760, 700, '#a8bccb'),
    B(-900, -760, 1320, 1250, 1520, 120, '#cbd8e2'),
    B(880, -1000, 900, 1800, 2000, 120, '#9aa6b0'),
    B(880, -1000, 1020, 1800, 180, 100, '#9fb4c4'),
    B(880, 820, 1020, 1800, 180, 100, '#9fb4c4'),
    B(2620, -1000, 900, 80, 2000, 300, '#9fb4c4'),
    B(-1810, -1000, 0, 320, 320, 760, '#3a4450'),
    B(-1810, 680, 0, 320, 320, 760, '#3a4450'),
    B(1490, -1000, 0, 320, 320, 760, '#3a4450'),
    B(1490, 680, 0, 320, 320, 760, '#3a4450'),
    B(-2700, -380, 500, 120, 760, 260, '#4a555f')
  ], 'pickup camioneta caja carga vehiculo auto');
  pickupDef.mesh = buildVehicleMesh('pickup');

  add('outdoorTable', 'Mesa exterior', 'exterior', 1200, 1200, 750, '#b6a184', [
    C(0, 0, 600, '#ddd0bb', '#a08a6e'),
    C(0, 0, 540, '#e8ddc9'),
    C(0, 0, 90, '#a08a6e')
  ], [
    B(-90, -90, 0, 180, 180, 720, '#b6a184'),
    B(-950, -950, 720, 1900, 1900, 60, '#d8cbb5')
  ], 'mesa exterior terraza patio');

  add('bbq', 'Parrilla', 'exterior', 900, 650, 1100, '#5b6771', [
    R(-450, -325, 900, 650, 20, '#c4ccd2'),
    R(-380, -260, 760, 520, 12, '#4a555f'),
    L(-380, -260, 380, 260, '#8c9aa4'),
    C(-180, 180, 55, '#6d7a84'), C(180, 180, 55, '#6d7a84')
  ], [
    B(-450, -325, 0, 900, 650, 1000, '#56636e'),
    B(-380, -260, 1000, 760, 520, 60, '#c1cbd1'),
    B(-400, 280, 900, 800, 60, 40, '#3d4852')
  ], 'parrilla bbq exterior');

  // ------------------------------------------------------------------ plantas
  (function () {
    var plan = [
      C(0, 0, 395, '#e6efdd', '#c3d4b6')
    ];
    var boxes = [
      B(-75, -75, 0, 150, 150, 3900, '#b6a186'),
      B(-95, -95, 3860, 190, 190, 220, '#c2ad90')
    ];
    var greens = ['#8db079', '#9cbd87', '#a8c894', '#93b57f'];
    var i, a, cx, cy, hx, hy, leaf, r0, r1, half;
    for (i = 0; i < 10; i++) {
      a = (Math.PI * 2 / 10) * i + Math.PI / 10;
      half = 0.17;
      r0 = 110;
      r1 = 385;
      leaf = [
        { x: Math.cos(a - half) * r0, y: Math.sin(a - half) * r0 },
        { x: Math.cos(a - half * 1.35) * (r0 + (r1 - r0) * 0.55), y: Math.sin(a - half * 1.35) * (r0 + (r1 - r0) * 0.55) },
        { x: Math.cos(a) * r1, y: Math.sin(a) * r1 },
        { x: Math.cos(a + half * 1.35) * (r0 + (r1 - r0) * 0.55), y: Math.sin(a + half * 1.35) * (r0 + (r1 - r0) * 0.55) },
        { x: Math.cos(a + half) * r0, y: Math.sin(a + half) * r0 }
      ];
      plan.push(P(leaf, greens[i % 3], '#7f9c6d'));
      cx = Math.cos(a) * 210;
      cy = Math.sin(a) * 210;
      hx = Math.abs(Math.cos(a)) * 110 + 55;
      hy = Math.abs(Math.sin(a)) * 110 + 55;
      boxes.push(B(cx - hx, cy - hy, 3940, hx * 2, hy * 2, 300, greens[i % 4]));
    }
    plan.push(C(0, 0, 95, '#8f7a5f', '#7a6750'));
    plan.push(C(0, 0, 45, '#b7a083', '#8f7a5f'));
    for (i = 0; i < 6; i++) {
      a = (Math.PI * 2 / 6) * i + Math.PI / 6;
      cx = Math.cos(a) * 150;
      cy = Math.sin(a) * 150;
      hx = Math.abs(Math.cos(a)) * 95 + 50;
      hy = Math.abs(Math.sin(a)) * 95 + 50;
      boxes.push(B(cx - hx, cy - hy, 4200, hx * 2, hy * 2, 260, greens[(i + 2) % 4]));
    }
    var palmDef = add('palm', 'Palmera', 'plantas', 800, 800, 4500, '#9cb98a', plan, boxes,
      'palmera palma cocotero fronda tropical planta arbol');
    palmDef.mesh = buildPalmMesh();
  })();

  (function () {
    var plan = [
      C(0, 0, 1150, '#b6cba3', '#8fa583'),
      C(0, 0, 940, '#a7c191', '#8fa583'),
      C(0, 0, 700, '#9ab882', '#8fa583'),
      C(0, 0, 430, '#8fb077', '#8fa583'),
      C(0, 0, 95, '#8a7357', '#7a6750')
    ];
    for (var i = 0; i < 6; i++) {
      var a = (Math.PI * 2 / 6) * i;
      plan.push(L(Math.cos(a) * 130, Math.sin(a) * 130, Math.cos(a) * 1080, Math.sin(a) * 1080, '#7f9c6d', 2));
    }
    var treeDef = add('tree', 'Árbol', 'plantas', 2400, 2400, 5000, '#8fa573', plan, [
      B(-120, -120, 0, 240, 240, 2200, '#a2907a'),
      B(-1050, -1050, 2050, 2100, 2100, 1050, '#8fae7c'),
      B(-800, -800, 2950, 1600, 1600, 1000, '#9dbc8a'),
      B(-500, -500, 3800, 1000, 1000, 900, '#a9c996')
    ], 'arbol arboleda copa sombra planta jardin');
    treeDef.mesh = buildTreeMesh();
  })();

  var bushDef = add('bush', 'Arbusto', 'plantas', 1000, 1000, 900, '#94b180', [
    C(-90, 60, 420, '#a3c08e', '#839f70'),
    C(170, 40, 310, '#9dbc88', '#839f70'),
    C(-40, -150, 280, '#b0cb9c', '#839f70'),
    C(0, 0, 70, '#7f9a6c', '#6d875c')
  ], [
    B(-480, -400, 0, 960, 800, 430, '#94b180'),
    B(-330, -480, 380, 700, 960, 320, '#9dbc88'),
    B(-190, -220, 680, 460, 440, 220, '#aac694')
  ], 'arbusto mata planta jardin seto bajo');
  bushDef.mesh = buildBushMesh();

  (function () {
    var plan = [
      R(-900, -225, 1800, 450, 40, '#a4bd90', '#7f9c6d'),
      R(-860, -190, 1720, 380, 30, '#b6cfa2', '#7f9c6d')
    ];
    var boxes = [B(-900, -225, 0, 1800, 450, 1100, '#91af7c')];
    for (var i = 0; i < 8; i++) {
      plan.push(C(-780 + i * 215, 40, 58, '#94b180', '#7f9c6d'));
      plan.push(C(-680 + i * 215, -70, 50, '#a3bf8e', '#7f9c6d'));
    }
    for (var k = 0; k < 4; k++) {
      boxes.push(B(-900 + k * 450, -210, 1100, 430, 420, 100, k % 2 ? '#9cb98a' : '#a5c193'));
    }
    var hedgeDef = add('hedge', 'Seto', 'plantas', 1800, 450, 1200, '#9cb98a', plan, boxes,
      'seto cerco vivo arbusto largo jardin jardinera');
    hedgeDef.mesh = buildHedgeMesh();
  })();

  (function () {
    var plan = [
      R(-700, -450, 1400, 900, 70, '#cfc9bc', '#a9a294'),
      R(-620, -370, 1240, 740, 50, '#8d7a63', '#7a6750'),
      R(-660, -410, 1320, 820, 60, 'rgba(255,255,255,0)', '#bdb6a8')
    ];
    var flowers = [
      [-430, 160, '#d9b45b'], [-130, 250, '#d78f9e'], [230, 150, '#c96f62'],
      [420, -130, '#e6e2d6'], [-40, -180, '#b58ac4'], [-330, -230, '#d9b45b'],
      [120, -210, '#d78f9e']
    ];
    var boxes = [
      B(-700, -450, 0, 1400, 900, 180, '#c9c3b6'),
      B(-620, -370, 180, 1240, 740, 140, '#8d7a63')
    ];
    for (var i = 0; i < flowers.length; i++) {
      var fx = flowers[i][0], fy = flowers[i][1];
      plan.push(C(fx, fy, 62, flowers[i][2], '#8f7a63'));
      plan.push(C(fx, fy, 20, '#f7f4e6', '#d9d4c6'));
      boxes.push(B(fx - 55, fy - 55, 320, 110, 110, 180, flowers[i][2]));
    }
    var bedDef = add('flowerBed', 'Macizo floral', 'plantas', 1400, 900, 500, '#a9bd8c', plan, boxes,
      'macizo floral flores jardin cantero parterre');
    bedDef.mesh = buildFlowerBedMesh();
  })();

  add('ornamentalPlant', 'Planta ornamental', 'plantas', 500, 500, 1000, '#a8c48f', [
    C(0, 0, 200, '#c8b79f', '#9b8a72'),
    C(0, 0, 150, '#b18d68', '#8f7350'),
    C(-40, 30, 150, '#a8c48f', '#8fa583'),
    C(45, -35, 120, '#b9d1a3', '#8fa583'),
    C(0, 60, 70, '#c6dcb2', '#8fa583')
  ], [
    B(-110, -110, 0, 220, 220, 380, '#c1af96'),
    B(-200, -200, 380, 400, 400, 420, '#93b07f'),
    B(-140, -140, 780, 280, 280, 220, '#a6c292')
  ], 'planta ornamental decorativa maceta interior jardin');

  // ------------------------------------------------------------------ jardines
  (function () {
    var plan = [
      R(-1500, -1000, 3000, 2000, 24, '#b7cfa0', '#93ac7c'),
      R(-1420, -920, 2840, 1840, 18, '#c3d9ad', '#9db886')
    ];
    var boxes = [
      B(-1500, -1000, 0, 3000, 2000, 40, '#b7cfa0'),
      B(-1450, -950, 40, 2900, 1900, 20, '#c2d8ab')
    ];
    for (var i = 0; i < 8; i++) {
      plan.push(R(-1490 + i * 372, -980, 150, 1960, 6, 'rgba(233,243,219,0.55)', 'rgba(0,0,0,0)'));
    }
    add('lawn', 'Césped', 'jardines', 3000, 2000, 60, '#b7cfa0', plan, boxes,
      'cesped pasto grama jardin verde area');
  })();

  add('planter', 'Jardinera', 'jardines', 1600, 600, 500, '#a9bd8c', [
    R(-800, -300, 1600, 600, 36, '#cfc8b8', '#a9a294'),
    R(-740, -240, 1480, 480, 26, '#8d7a63', '#7a6750'),
    C(-520, 0, 120, '#9dbc8b', '#839f70'),
    C(-160, -60, 110, '#a8c894', '#839f70'),
    C(180, 40, 130, '#93b57f', '#839f70'),
    C(520, -20, 100, '#b3cd9f', '#839f70')
  ], [
    B(-800, -300, 0, 1600, 600, 320, '#cbc4b4'),
    B(-740, -240, 320, 1480, 480, 40, '#9a8a6f'),
    B(-640, -120, 360, 240, 240, 140, '#9dbc8b'),
    B(-270, -180, 360, 220, 220, 140, '#a8c894'),
    B(60, -80, 360, 240, 240, 140, '#93b57f'),
    B(420, -120, 360, 200, 200, 140, '#b3cd9f')
  ], 'jardinera jardin maceta grande flores parterre');

  (function () {
    var plan = [
      R(-1000, -450, 2000, 900, 14, '#cfc9bc', '#a9a294'),
      R(-960, -410, 1920, 820, 10, '#d8d2c5', '#b3ada0')
    ];
    var boxes = [B(-1000, -450, 0, 2000, 900, 20, '#cfc9bc')];
    for (var i = 0; i < 4; i++) {
      var x = -850 + i * 460;
      plan.push(R(x, -340, 320, 680, 34, '#ded9cd', '#b3ada0'));
      boxes.push(B(x, -340, 20, 320, 680, 20, '#e2ddd1'));
    }
    add('gardenPath', 'Sendero de jardín', 'jardines', 2000, 900, 40, '#d3cdc0', plan, boxes,
      'sendero camino jardin losas piedra paso jardin');
  })();

  add('fountain', 'Fuente', 'jardines', 1800, 1800, 700, '#c9d6d8', [
    C(0, 0, 880, '#d7d2c6', '#a9a294'),
    C(0, 0, 790, '#c9c3b5', '#a9a294'),
    C(0, 0, 640, 'rgba(151,199,210,0.55)', '#8fb0b8'),
    C(0, 0, 210, '#ded9cd', '#a9a294'),
    C(0, 0, 120, 'rgba(160,206,216,0.7)', '#8fb0b8'),
    ARC(0, 0, 470, 0, 360, '#a6c4ca'),
    L(-120, 130, -300, 300, '#a6c4ca', 1),
    L(120, 130, 300, 300, '#a6c4ca', 1),
    L(120, -130, 300, -300, '#a6c4ca', 1),
    L(-120, -130, -300, -300, '#a6c4ca', 1)
  ], [
    B(-880, -880, 0, 1760, 1760, 320, '#d2ccc0'),
    B(-760, -760, 300, 1520, 1520, 180, 'rgba(130,180,195,0.55)'),
    B(-240, -240, 320, 480, 480, 340, '#d9d4c8'),
    B(-390, -390, 660, 780, 780, 40, '#e0dcd0')
  ], 'fuente agua jardin patio estanque pila');

  add('rockGarden', 'Rocalla', 'jardines', 1200, 900, 400, '#b8b5ab', [
    R(-600, -450, 1200, 900, 30, '#d3cec1', '#b3ada0'),
    P([{ x: -560, y: -260 }, { x: -260, y: -330 }, { x: -180, y: -60 }, { x: -320, y: 140 }, { x: -560, y: 80 }], '#b3b0a8', '#8f8c84'),
    P([{ x: 60, y: -340 }, { x: 380, y: -280 }, { x: 430, y: -90 }, { x: 250, y: -40 }], '#a9a69e', '#8f8c84'),
    P([{ x: -120, y: 120 }, { x: 160, y: 60 }, { x: 300, y: 220 }, { x: 120, y: 330 }, { x: -80, y: 300 }], '#bdbbb3', '#8f8c84'),
    P([{ x: 330, y: 150 }, { x: 520, y: 180 }, { x: 540, y: 330 }, { x: 380, y: 300 }], '#b0ada5', '#8f8c84')
  ], [
    B(-600, -450, 0, 1200, 900, 100, '#ccc6b9'),
    B(-560, -330, 100, 380, 360, 220, '#b3b0a8'),
    B(-180, -350, 100, 400, 300, 160, '#a9a69e'),
    B(-120, 60, 100, 420, 260, 200, '#bdbbb3'),
    B(330, 130, 100, 210, 190, 300, '#b0ada5')
  ], 'rocalla roca piedra jardin decorativo gravilla');

  // ------------------------------------------------------------------ vias y accesos
  // Malla plana para una vía curva de 90°: superficie continua con bordes,
  // líneas laterales y eje discontinuo (sustituye a las cajas en 3D).
  function curvedLaneMesh(cx, cy, rOut, rIn, h, base, lineCol, centerCol) {
    var mesh = [];
    var sectors = 14, rad = 2, i, k;
    var baseAlt = base === '#8b9198' ? '#8f959c' : (base === '#c7c4bc' ? '#cbc8c0' : base);
    function pt(r, a, z) { return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, z: z }; }
    var top = h;
    for (i = 0; i < sectors; i++) {
      var a0 = (Math.PI / 2) * (i / sectors);
      var a1 = (Math.PI / 2) * ((i + 1) / sectors);
      for (k = 0; k < rad; k++) {
        var r0 = rIn + (rOut - rIn) * (k / rad);
        var r1 = rIn + (rOut - rIn) * ((k + 1) / rad) + 1;
        mesh.push(MFace([pt(r0, a0, top), pt(r1, a0, top), pt(r1, a1, top), pt(r0, a1, top)],
          (i + k) % 2 ? baseAlt : base));
      }
      mesh.push(MFace([pt(rOut, a0, 0), pt(rOut, a1, 0), pt(rOut, a1, top), pt(rOut, a0, top)], base));
      mesh.push(MFace([pt(rIn, a0, 0), pt(rIn, a1, 0), pt(rIn, a1, top), pt(rIn, a0, top)], base));
      var rO = rOut - 180, rI = rIn + 180, lw = 130;
      mesh.push(MFace([pt(rO - lw / 2, a0, top + 2), pt(rO + lw / 2, a0, top + 2),
        pt(rO + lw / 2, a1, top + 2), pt(rO - lw / 2, a1, top + 2)], lineCol));
      mesh.push(MFace([pt(rI - lw / 2, a0, top + 2), pt(rI + lw / 2, a0, top + 2),
        pt(rI + lw / 2, a1, top + 2), pt(rI - lw / 2, a1, top + 2)], lineCol));
    }
    mesh.push(MFace([pt(rIn, 0, 0), pt(rOut, 0, 0), pt(rOut, 0, top), pt(rIn, 0, top)], base));
    mesh.push(MFace([pt(rIn, Math.PI / 2, 0), pt(rOut, Math.PI / 2, 0),
      pt(rOut, Math.PI / 2, top), pt(rIn, Math.PI / 2, top)], base));
    if (centerCol) {
      var mid = (rOut + rIn) / 2;
      for (i = 0; i < sectors; i += 2) {
        var c0 = (Math.PI / 2) * ((i + 0.15) / sectors);
        var c1 = (Math.PI / 2) * ((i + 0.85) / sectors);
        var hw = 60;
        mesh.push(MFace([pt(mid - hw, c0, top + 2), pt(mid + hw, c0, top + 2),
          pt(mid + hw, c1, top + 2), pt(mid - hw, c1, top + 2)], centerCol));
      }
    }
    return mesh;
  }
  function curvedLane(id, name, w, d, h, cx, cy, rOut, rIn, base, lineCol, centerCol, tags) {
    var plan = [];
    var pts = [];
    var steps = 10;
    var i, a;
    for (i = 0; i <= steps; i++) {
      a = (Math.PI / 2) * (i / steps);
      pts.push({ x: cx + Math.cos(a) * rOut, y: cy + Math.sin(a) * rOut });
    }
    for (i = steps; i >= 0; i--) {
      a = (Math.PI / 2) * (i / steps);
      pts.push({ x: cx + Math.cos(a) * rIn, y: cy + Math.sin(a) * rIn });
    }
    plan.push(P(pts, base, '#74797f'));
    var seg = 8;
    for (i = 0; i < seg; i++) {
      var a0 = (Math.PI / 2) * (i / seg);
      var a1 = (Math.PI / 2) * ((i + 1) / seg);
      plan.push(L(cx + Math.cos(a0) * (rOut - 150), cy + Math.sin(a0) * (rOut - 150),
        cx + Math.cos(a1) * (rOut - 150), cy + Math.sin(a1) * (rOut - 150), lineCol, 2));
      plan.push(L(cx + Math.cos(a0) * (rIn + 150), cy + Math.sin(a0) * (rIn + 150),
        cx + Math.cos(a1) * (rIn + 150), cy + Math.sin(a1) * (rIn + 150), lineCol, 2));
    }
    var boxes = [];
    var sectors = 8;
    var radial = 1;
    var width = rOut - rIn;
    for (i = 0; i < sectors; i++) {
      var b0 = (Math.PI / 2) * (i / sectors);
      var b1 = (Math.PI / 2) * ((i + 1) / sectors);
      for (var k = 0; k < radial; k++) {
        var ra = rIn + width * (k / radial);
        var rb = rIn + width * ((k + 1) / radial) + 30;
        var corners = [
          { x: cx + Math.cos(b0) * ra, y: cy + Math.sin(b0) * ra },
          { x: cx + Math.cos(b0) * rb, y: cy + Math.sin(b0) * rb },
          { x: cx + Math.cos(b1) * ra, y: cy + Math.sin(b1) * ra },
          { x: cx + Math.cos(b1) * rb, y: cy + Math.sin(b1) * rb }
        ];
        var minX = corners[0].x, maxX = corners[0].x, minY = corners[0].y, maxY = corners[0].y;
        for (var q = 1; q < 4; q++) {
          if (corners[q].x < minX) minX = corners[q].x;
          if (corners[q].x > maxX) maxX = corners[q].x;
          if (corners[q].y < minY) minY = corners[q].y;
          if (corners[q].y > maxY) maxY = corners[q].y;
        }
        boxes.push(B(minX, minY, 0, maxX - minX, maxY - minY, 12, (i + k) % 2 ? '#8f959c' : '#8a9097'));
      }
    }
    if (centerCol) {
      for (i = 0; i < sectors; i += 2) {
        var c0 = (Math.PI / 2) * ((i + 0.15) / sectors);
        var c1 = (Math.PI / 2) * ((i + 0.85) / sectors);
        var mid = (rOut + rIn) / 2;
        var px0 = cx + Math.cos(c0) * mid, py0 = cy + Math.sin(c0) * mid;
        var px1 = cx + Math.cos(c1) * mid, py1 = cy + Math.sin(c1) * mid;
        var dminX = Math.min(px0, px1) - 70, dmaxX = Math.max(px0, px1) + 70;
        var dminY = Math.min(py0, py1) - 70, dmaxY = Math.max(py0, py1) + 70;
        boxes.push(B(dminX, dminY, 12, dmaxX - dminX, dmaxY - dminY, 8, centerCol));
        for (var t = 0; t < 2; t++) {
          var ta = c0 + (c1 - c0) * (t / 2);
          var tb = c0 + (c1 - c0) * ((t + 1) / 2);
          plan.push(L(cx + Math.cos(ta) * mid, cy + Math.sin(ta) * mid,
            cx + Math.cos(tb) * mid, cy + Math.sin(tb) * mid, centerCol, 2));
        }
      }
    }
    add(id, name, 'vias', w, d, h, base, plan, boxes, tags);
    var laneDef = items[id];
    if (laneDef) laneDef.mesh = curvedLaneMesh(cx, cy, rOut, rIn, h, base, lineCol, centerCol);
  }

  add('roadStraight', 'Carretera recta', 'vias', 7000, 6000, 20, '#8b9198', (function () {
    var plan = [
      R(-3500, -3000, 7000, 6000, 0, '#8b9198', '#74797f'),
      R(-3500, -2820, 7000, 120, 0, '#e9e5da', 'rgba(0,0,0,0)'),
      R(-3500, 2700, 7000, 120, 0, '#e9e5da', 'rgba(0,0,0,0)'),
      R(-3500, -2400, 7000, 90, 0, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0)'),
      R(-3500, 2310, 7000, 90, 0, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0)')
    ];
    for (var i = 0; i < 9; i++) {
      plan.push(R(-3400 + i * 780, -60, 420, 120, 10, '#e8dfa0', 'rgba(0,0,0,0)'));
    }
    return plan;
  })(), [
    B(-3500, -3000, 0, 7000, 6000, 12, '#8b9198'),
    B(-3500, -2820, 12, 7000, 120, 8, '#e9e5da'),
    B(-3500, 2700, 12, 7000, 120, 8, '#e9e5da'),
    B(-3400, -60, 12, 6800, 120, 8, '#e8dfa0')
  ], 'carretera calle via acceso asfalto recta camino');

  add('driveway', 'Entrada recta', 'vias', 4500, 3000, 20, '#c7c4bc', [
    R(-2250, -1500, 4500, 3000, 10, '#c7c4bc', '#a9a294'),
    R(-2200, -1450, 4400, 2900, 8, '#cfccc4', '#b3ada0'),
    L(-1125, -1450, -1125, 1450, '#b8b5ad', 1),
    L(0, -1450, 0, 1450, '#b8b5ad', 1),
    L(1125, -1450, 1125, 1450, '#b8b5ad', 1),
    L(-2200, 0, 2200, 0, '#b8b5ad', 1)
  ], [
    B(-2250, -1500, 0, 4500, 3000, 14, '#c7c4bc'),
    B(-1135, -1450, 14, 20, 2900, 6, '#b0ada5'),
    B(-10, -1450, 14, 20, 2900, 6, '#b0ada5'),
    B(1115, -1450, 14, 20, 2900, 6, '#b0ada5')
  ], 'entrada acceso cochera concreto recta vado garaje');

  add('sidewalk', 'Acera', 'vias', 6000, 1200, 120, '#cbc8c0', (function () {
    var plan = [
      R(-3000, -600, 6000, 1200, 12, '#cbc8c0', '#a9a294'),
      R(-2950, -550, 5900, 1100, 10, '#d4d1c9', '#b3ada0'),
      R(-3000, 520, 6000, 80, 0, '#b6b2a9', '#9e9a92')
    ];
    for (var i = 0; i < 10; i++) {
      plan.push(L(-2700 + i * 600, -550, -2700 + i * 600, 550, '#b8b4ab', 1));
    }
    return plan;
  })(), [
    B(-3000, -600, 0, 6000, 1200, 90, '#cbc8c0'),
    B(-3000, 520, 90, 6000, 80, 30, '#bdb9b0'),
    B(-3000, -600, 90, 6000, 80, 30, '#c4c0b7')
  ], 'acera vereda anden peatonal concreto banqueta');

  add('parking', 'Estacionamiento', 'vias', 5000, 4500, 20, '#8b9198', (function () {
    var plan = [
      R(-2500, -2250, 5000, 4500, 0, '#8b9198', '#74797f'),
      L(-2500, 1050, 2500, 1050, '#e9e5da', 2),
      L(-2500, -1050, 2500, -1050, '#e9e5da', 2)
    ];
    for (var i = 0; i <= 4; i++) {
      var x = -2500 + i * 1250;
      plan.push(L(x, 1050, x, 2250, '#e9e5da', 2));
      plan.push(L(x, -1050, x, -2250, '#e9e5da', 2));
    }
    plan.push(P([{ x: 0, y: -160 }, { x: 60, y: -160 }, { x: 60, y: 120 }, { x: 0, y: 120 }], '#e8dfa0', 'rgba(0,0,0,0)'));
    plan.push(P([{ x: -70, y: 120 }, { x: 130, y: 120 }, { x: 30, y: 280 }], '#e8dfa0', 'rgba(0,0,0,0)'));
    return plan;
  })(), (function () {
    var boxes = [B(-2500, -2250, 0, 5000, 4500, 12, '#8b9198')];
    boxes.push(B(-2500, 1040, 12, 5000, 20, 8, '#e9e5da'));
    boxes.push(B(-2500, -1060, 12, 5000, 20, 8, '#e9e5da'));
    for (var i = 0; i <= 4; i++) {
      var x = -2500 + i * 1250;
      boxes.push(B(x - 10, 1050, 12, 20, 1200, 8, '#e9e5da'));
      boxes.push(B(x - 10, -2250, 12, 20, 1200, 8, '#e9e5da'));
    }
    return boxes;
  })(), 'estacionamiento parking parqueo plazas vehiculos auto');

  curvedLane('roadCurve', 'Carretera en curva', 7000, 7000, 20, -3500, -3500, 6800, 3800,
    '#8b9198', '#e9e5da', '#e8dfa0', 'carretera calle curva via acceso asfalto giro 90');
  curvedLane('drivewayCurve', 'Entrada en curva', 4500, 4500, 20, -2250, -2250, 4400, 1400,
    '#c7c4bc', '#e6e2d8', null, 'entrada acceso curva cochera concreto giro garaje');

  // ------------------------------------------------------------------ iluminación
  // Luz emisiva simulada con lentes y bombillas en colores muy claros.
  var streetDef = add('streetLamp', 'Farola de calle', 'iluminacion', 900, 450, 2400, '#4f5b66', [
    C(0, 0, 200, '#4f5b66', '#3a4450'),
    C(0, 0, 60, '#fdf3c4', '#8a949c'),
    L(0, 0, 300, 0, '#4f5b66', 4),
    C(300, 0, 130, '#fdf3c4', '#8a949c'),
    C(300, 0, 70, '#fff7dc', '#8a949c'),
    P([{ x: 180, y: -35 }, { x: 430, y: -150 }, { x: 430, y: 150 }, { x: 180, y: 35 }],
      'rgba(253,243,196,0.35)', 'rgba(0,0,0,0)')
  ], [
    B(-200, -200, 0, 400, 400, 110, '#5b6771'),
    B(-45, -45, 110, 90, 90, 2050, '#5b6771'),
    B(0, -30, 2120, 330, 60, 70, '#5b6771'),
    B(170, -130, 2140, 260, 260, 140, '#4f5b66'),
    B(190, -110, 2130, 220, 220, 40, '#fdf3c4')
  ], 'farola calle alumbrado luz publica lampara poste');
  streetDef.mesh = buildStreetLampMesh();

  var gardenDef = add('gardenLamp', 'Lámpara de jardín', 'iluminacion', 280, 280, 600, '#5b6771', [
    C(0, 0, 135, '#e8dfc4', '#8a949c'),
    C(0, 0, 95, '#fdf3c4', '#8a949c'),
    C(0, 0, 40, '#fff7dc', '#8a949c'),
    C(0, 0, 18, '#5b6771', '#3a4450')
  ], [
    B(-45, -45, 0, 90, 90, 380, '#5b6771'),
    B(-125, -125, 350, 250, 250, 250, '#fdf3c4'),
    B(-100, -100, 590, 200, 200, 10, '#4f5b66')
  ], 'lampara jardin baliza luz exterior suelo');
  gardenDef.mesh = buildGardenLampMesh();

  var postDef = add('postLamp', 'Poste con luminaria', 'iluminacion', 500, 500, 3000, '#4f5b66', [
    R(-160, -160, 320, 320, 16, '#4f5b66', '#3a4450'),
    R(-120, -120, 240, 240, 12, '#fdf3c4', '#8a949c'),
    C(0, 0, 52, '#5b6771', '#3a4450'),
    C(0, 0, 120, '#4f5b66', '#3a4450')
  ], [
    B(-200, -200, 0, 400, 400, 180, '#5b6771'),
    B(-50, -50, 180, 100, 100, 2220, '#5b6771'),
    B(-150, -150, 2400, 300, 300, 360, '#fdf3c4'),
    B(-190, -190, 2760, 380, 380, 180, '#4f5b66'),
    B(-40, -40, 2940, 80, 80, 40, '#4f5b66')
  ], 'poste luminaria farol luz alumbrado parque');
  postDef.mesh = buildPostLampMesh();

  var pendantDef = add('pendantLamp', 'Lámpara colgante', 'iluminacion', 300, 300, 400, '#e8dfc4', [
    C(0, 0, 150, '#e8dfc4', '#8a949c'),
    C(0, 0, 105, '#fdf3c4', '#8a949c'),
    C(0, 0, 42, '#5b6771', '#3a4450'),
    C(0, 0, 18, '#4f5b66', '#3a4450')
  ], [
    B(-20, -20, 340, 40, 40, 60, '#5b6771'),
    B(-150, -150, 230, 300, 300, 110, '#e8dfc4'),
    B(-55, -55, 170, 110, 110, 70, '#fdf3c4')
  ], 'lampara colgante techo suspension luz interior');
  pendantDef.mesh = buildPendantLampMesh();

  // ------------------------------------------------------------------ objetos personalizados
  // registerCustom(def): añade o actualiza un objeto importado en la categoría 'mios'.
  var CUSTOM_CAT = 'mios';

  function normalizeCustom(def) {
    if (!def || typeof def !== 'object') return null;
    var id = typeof def.id === 'string' ? def.id.replace(/[^\w\-]/g, '').slice(0, 64) : '';
    if (!id) return null;
    var w = Number(def.w), d = Number(def.d), h = Number(def.h);
    if (!isFinite(w) || w <= 0) w = 1000;
    if (!isFinite(d) || d <= 0) d = 1000;
    if (!isFinite(h) || h <= 0) h = 1000;
    var color = (typeof def.color === 'string' && def.color) ? def.color : '#9aa8b6';
    var plan = Array.isArray(def.plan) ? def.plan.filter(function (s) { return s && typeof s.t === 'string'; }) : [];
    if (!plan.length) plan = [R(-w / 2, -d / 2, w, d, 20, color, '#52606d')];
    var boxes = Array.isArray(def.boxes) ? def.boxes.filter(function (b) {
      return b && isFinite(b.x) && isFinite(b.y) && isFinite(b.z) && b.w > 0 && b.d > 0 && b.h > 0;
    }) : [];
    if (!boxes.length) boxes = [B(-w / 2, -d / 2, 0, w, d, h, color)];
    var out = {
      id: id,
      name: (typeof def.name === 'string' && def.name.trim()) ? def.name.trim().slice(0, 80) : id,
      cat: CUSTOM_CAT,
      tags: (((typeof def.tags === 'string') ? def.tags : '') + ' importado personalizado mios').trim(),
      w: w, d: d, h: h, color: color,
      plan: plan, boxes: boxes
    };
    var mesh = Array.isArray(def.mesh) ? def.mesh.filter(function (f) {
      return f && Array.isArray(f.points) && f.points.length >= 3 && f.points.length <= 8;
    }) : null;
    if (mesh && mesh.length) out.mesh = mesh.slice(0, 8000);
    if (typeof def.source === 'string' && def.source) out.source = def.source;
    return out;
  }

  function registerCustom(def) {
    var item = normalizeCustom(def);
    if (!item) return null;
    var exists = Object.prototype.hasOwnProperty.call(items, item.id);
    items[item.id] = item;
    if (!exists) order.push(item.id);
    var hasMios = false;
    for (var i = 0; i < categories.length; i++) if (categories[i].id === CUSTOM_CAT) hasMios = true;
    if (!hasMios) categories.push({ id: CUSTOM_CAT, name: 'Mis objetos', icon: 'cube' });
    return item;
  }

  var categories = [
    { id: 'todos', name: 'Todos', icon: 'grid' },
    { id: 'muebles', name: 'Muebles', icon: 'sofa' },
    { id: 'cocina', name: 'Cocina', icon: 'kitchen' },
    { id: 'bano', name: 'Baño', icon: 'bath' },
    { id: 'dormitorio', name: 'Dormitorio', icon: 'bed' },
    { id: 'exterior', name: 'Exterior', icon: 'tree' },
    { id: 'iluminacion', name: 'Iluminación', icon: 'sun' },
    { id: 'plantas', name: 'Plantas', icon: 'tree' },
    { id: 'jardines', name: 'Jardines', icon: 'garden' },
    { id: 'vias', name: 'Vías y accesos', icon: 'road' },
    { id: 'mios', name: 'Mis objetos', icon: 'cube' }
  ];

  var Library = {
    categories: categories,
    items: items,
    list: function (cat) {
      var out = [];
      for (var i = 0; i < order.length; i++) {
        var d = items[order[i]];
        if (!cat || cat === 'todos' || d.cat === cat) out.push(d);
      }
      return out;
    },
    get: function (id) { return items[id] || null; },
    defaults: function (id) { return items[id] || null; },
    search: function (query, cat) {
      var q = String(query || '').toLowerCase().trim();
      return this.list(cat).filter(function (d) {
        if (!q) return true;
        return (d.name + ' ' + d.tags + ' ' + d.id).toLowerCase().indexOf(q) >= 0;
      });
    },
    registerCustom: registerCustom
  };

  ED.Library = Library;
})(window.EngDraft = window.EngDraft || {});

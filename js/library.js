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

  add('car', 'Vehículo', 'exterior', 4400, 1800, 1500, '#8fa6b8', [
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
    add('palm', 'Palmera', 'plantas', 800, 800, 4500, '#9cb98a', plan, boxes,
      'palmera palma cocotero fronda tropical planta arbol');
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
    add('tree', 'Árbol', 'plantas', 2400, 2400, 5000, '#8fa573', plan, [
      B(-120, -120, 0, 240, 240, 2200, '#a2907a'),
      B(-1050, -1050, 2050, 2100, 2100, 1050, '#8fae7c'),
      B(-800, -800, 2950, 1600, 1600, 1000, '#9dbc8a'),
      B(-500, -500, 3800, 1000, 1000, 900, '#a9c996')
    ], 'arbol arboleda copa sombra planta jardin');
  })();

  add('bush', 'Arbusto', 'plantas', 1000, 1000, 900, '#94b180', [
    C(-90, 60, 420, '#a3c08e', '#839f70'),
    C(170, 40, 310, '#9dbc88', '#839f70'),
    C(-40, -150, 280, '#b0cb9c', '#839f70'),
    C(0, 0, 70, '#7f9a6c', '#6d875c')
  ], [
    B(-480, -400, 0, 960, 800, 430, '#94b180'),
    B(-330, -480, 380, 700, 960, 320, '#9dbc88'),
    B(-190, -220, 680, 460, 440, 220, '#aac694')
  ], 'arbusto mata planta jardin seto bajo');

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
    add('hedge', 'Seto', 'plantas', 1800, 450, 1200, '#9cb98a', plan, boxes,
      'seto cerco vivo arbusto largo jardin jardinera');
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
    add('flowerBed', 'Macizo floral', 'plantas', 1400, 900, 500, '#a9bd8c', plan, boxes,
      'macizo floral flores jardin cantero parterre');
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

  var categories = [
    { id: 'todos', name: 'Todos', icon: 'grid' },
    { id: 'muebles', name: 'Muebles', icon: 'sofa' },
    { id: 'cocina', name: 'Cocina', icon: 'kitchen' },
    { id: 'bano', name: 'Baño', icon: 'bath' },
    { id: 'dormitorio', name: 'Dormitorio', icon: 'bed' },
    { id: 'exterior', name: 'Exterior', icon: 'tree' },
    { id: 'plantas', name: 'Plantas', icon: 'tree' },
    { id: 'jardines', name: 'Jardines', icon: 'garden' },
    { id: 'vias', name: 'Vías y accesos', icon: 'road' }
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
    }
  };

  ED.Library = Library;
})(window.EngDraft = window.EngDraft || {});

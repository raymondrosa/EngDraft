/* EngDraft — plantillas y proyectos de ejemplo
 * Coordenadas en mm. Y hacia arriba. Sin DOM ni dependencias.
 */
(function (ED) {
  'use strict';

  var counter = 0;
  function uid(prefix) {
    counter++;
    return prefix + '_' + counter.toString(36) + Math.random().toString(36).slice(2, 5);
  }

  var LAYERS = [
    { id: 'walls', name: 'Muros', color: '#263238', visible: true, locked: false },
    { id: 'openings', name: 'Aberturas', color: '#2e7d8f', visible: true, locked: false },
    { id: 'furniture', name: 'Mobiliario', color: '#6b7c93', visible: true, locked: false },
    { id: 'rooms', name: 'Ambientes', color: '#6aa89a', visible: true, locked: false },
    { id: 'annotation', name: 'Anotaciones', color: '#1f2937', visible: true, locked: false },
    { id: 'dimensions', name: 'Cotas', color: '#b5651d', visible: true, locked: false }
  ];

  function baseProject(name, description) {
    counter = 0;
    var p = {
      schema: 'engdraft/v1',
      meta: {
        name: name || 'Proyecto sin nombre',
        client: '',
        location: '',
        engineer: '',
        license: '',
        phone: '',
        email: '',
        date: '2026-11-18',
        revision: 'A',
        description: description || '',
        notes: ''
      },
      settings: {
        units: 'm', grid: 250, wallThickness: 150, wallHeight: 2700,
        floorHeight: 2800, northAngle: 0, autoDim: true
      },
      layers: JSON.parse(JSON.stringify(LAYERS)),
      levels: [
        { id: 'l0', name: 'Planta baja', elevation: 0, height: 2800 },
        { id: 'l1', name: 'Planta alta', elevation: 2800, height: 2800 }
      ],
      walls: [], rooms: [], items: [], texts: [], dims: [], sheets: []
    };
    return p;
  }

  function mkOpening(type, t, width, height, sill, swing, hinge) {
    return {
      id: uid('o'), type: type, t: t,
      width: width || (type === 'window' ? 1500 : 900),
      height: height || (type === 'window' ? 1200 : 2100),
      sill: sill || (type === 'window' ? 900 : 0),
      swing: swing || 1, hinge: hinge || 1
    };
  }

  function wall(p, level, ax, ay, bx, by, openings, thickness, height) {
    var w = {
      id: uid('w'), type: 'wall', level: level, layerId: 'walls',
      a: { x: ax, y: ay }, b: { x: bx, y: by },
      thickness: thickness || 150, height: height || 2700, openings: []
    };
    (openings || []).forEach(function (o) {
      if (!o) return;
      var len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
      var pos = o.pos != null ? o.pos : len * (o.t != null ? o.t : 0.5);
      w.openings.push(mkOpening(o.type, pos / len, o.width, o.height, o.sill, o.swing, o.hinge));
    });
    p.walls.push(w);
    return w;
  }

  function room(p, level, name, x1, y1, x2, y2, finish, color) {
    p.rooms.push({
      id: uid('r'), type: 'room', level: level, layerId: 'rooms', name: name,
      polygon: [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }],
      finish: finish || 'wood', color: color || '#e9e1d1'
    });
  }

  function item(p, level, libId, x, y, rot, name) {
    var def = ED.Library && ED.Library.get ? ED.Library.get(libId) : null;
    if (!def) return null;
    var it = {
      id: uid('i'), type: 'item', level: level, layerId: 'furniture', libId: libId,
      x: x, y: y, rotation: rot || 0, w: def.w, d: def.d, h: def.h, name: name || def.name
    };
    p.items.push(it);
    return it;
  }

  function text(p, level, value, x, y, size, rot) {
    p.texts.push({
      id: uid('t'), type: 'text', level: level, layerId: 'annotation',
      text: value, x: x, y: y, size: size || 300, rotation: rot || 0
    });
  }

  function dim(p, level, ax, ay, bx, by, offset) {
    p.dims.push({
      id: uid('d'), type: 'dim', level: level, layerId: 'dimensions',
      a: { x: ax, y: ay }, b: { x: bx, y: by }, offset: offset == null ? 700 : offset
    });
  }

  function sheet(p, name, size, orientation, template, content, levelId, scale, sheetNo, title, notes) {
    p.sheets.push({
      id: uid('s'), name: name, size: size || 'A3', orientation: orientation || 'landscape',
      template: template || 'modern', scale: scale || 100, content: content || 'plan',
      levelId: levelId || 'l0', sheetNo: sheetNo || 'A-01', title: title || name,
      notes: notes || '', showDims: true, showFurniture: true, showRooms: true,
      showGrid: false, imageDataUrl: null
    });
  }

  function envelope(p, level, openingsSouth, openingsNorth, openingsEast, openingsWest) {
    wall(p, level, 0, 0, 12000, 0, openingsSouth || [
      { type: 'window', pos: 1700, width: 1800 }, { type: 'door', pos: 5750, width: 1000 }, { type: 'window', pos: 9500, width: 1500 }
    ]);
    wall(p, level, 12000, 0, 12000, 9000, openingsEast || [
      { type: 'window', pos: 2200, width: 1400 }, { type: 'window', pos: 6800, width: 1400 }
    ]);
    wall(p, level, 12000, 9000, 0, 9000, openingsNorth || [
      { type: 'window', pos: 2200, width: 1500 }, { type: 'window', pos: 6000, width: 1200 }, { type: 'window', pos: 9300, width: 1500 }
    ]);
    wall(p, level, 0, 9000, 0, 0, openingsWest || [
      { type: 'window', pos: 2500, width: 1400 }, { type: 'window', pos: 7000, width: 1400 }
    ]);
  }

  function groundFloor(p) {
    envelope(p, 'l0');
    // Muros interiores: dos ejes verticales y divisiones de ambientes.
    wall(p, 'l0', 4500, 0, 4500, 9000, [
      { type: 'door', pos: 2200, width: 950 }, { type: 'door', pos: 7000, width: 900 }
    ]);
    wall(p, 'l0', 7000, 0, 7000, 9000, [
      { type: 'door', pos: 2200, width: 950 }, { type: 'door', pos: 6800, width: 900 }
    ]);
    wall(p, 'l0', 0, 5000, 4500, 5000, [{ type: 'door', pos: 3300, width: 900 }]);
    wall(p, 'l0', 7000, 4500, 12000, 4500, [{ type: 'door', pos: 2300, width: 900 }]);
    wall(p, 'l0', 4500, 6000, 7000, 6000, [{ type: 'door', pos: 1000, width: 850 }]);

    room(p, 'l0', 'Sala / Comedor', 0, 0, 4500, 5000, 'wood', '#ece4d4');
    room(p, 'l0', 'Cocina', 0, 5000, 4500, 9000, 'tile', '#f1e4cc');
    room(p, 'l0', 'Dormitorio 1', 7000, 0, 12000, 4500, 'wood', '#e7dfcf');
    room(p, 'l0', 'Dormitorio 2', 7000, 4500, 12000, 9000, 'wood', '#e7dfcf');
    room(p, 'l0', 'Hall / Escalera', 4500, 0, 7000, 6000, 'tile', '#e8e5dd');
    room(p, 'l0', 'Baño', 4500, 6000, 7000, 9000, 'tile', '#d9e9ea');

    // Sala
    item(p, 'l0', 'rug', 2250, 2350, 0);
    item(p, 'l0', 'sofa3', 2250, 1300, 0);
    item(p, 'l0', 'coffeeTable', 2250, 2450, 0);
    item(p, 'l0', 'tvUnit', 2250, 4050, 180);
    item(p, 'l0', 'television', 2250, 4230, 180);
    item(p, 'l0', 'diningTable6', 2200, 3900, 0);
    item(p, 'l0', 'plant', 650, 650, 0);
    item(p, 'l0', 'consoleTable', 650, 4400, 90);

    // Cocina
    item(p, 'l0', 'kitchenCounter', 1500, 8550, 0);
    item(p, 'l0', 'fridge', 4020, 8400, 0);
    item(p, 'l0', 'stove', 2800, 8550, 0);
    item(p, 'l0', 'kitchenIsland', 1800, 6550, 0);
    item(p, 'l0', 'diningTable4', 3100, 5450, 0);

    // Dormitorio 1
    item(p, 'l0', 'bedDouble', 9400, 2600, 0);
    item(p, 'l0', 'nightstand', 8300, 3400, 0);
    item(p, 'l0', 'nightstand', 10550, 3400, 0);
    item(p, 'l0', 'wardrobe', 10800, 1450, 90);
    item(p, 'l0', 'rug', 9400, 1600, 0);

    // Dormitorio 2
    item(p, 'l0', 'bedQueen', 9400, 6650, 0);
    item(p, 'l0', 'nightstand', 8300, 7600, 0);
    item(p, 'l0', 'nightstand', 10600, 7600, 0);
    item(p, 'l0', 'wardrobe', 10800, 5500, 90);
    item(p, 'l0', 'desk', 7950, 8400, 0);

    // Baño
    item(p, 'l0', 'toilet', 4850, 8650, 0);
    item(p, 'l0', 'sinkVanity', 6350, 8550, 0);
    item(p, 'l0', 'shower', 5250, 6950, 0);
    item(p, 'l0', 'towelRack', 6800, 6750, 90);

    // Hall
    item(p, 'l0', 'stairs', 5150, 3000, 90);
    item(p, 'l0', 'plant', 6650, 900, 0);
    item(p, 'l0', 'consoleTable', 6600, 4700, 90);

    dim(p, 'l0', 0, 0, 12000, 0, -900);
    dim(p, 'l0', 0, 0, 0, 9000, 900);
  }

  function upperFloor(p) {
    envelope(p, 'l1', [
      { type: 'window', pos: 2200, width: 1500 }, { type: 'window', pos: 5750, width: 1200 }, { type: 'window', pos: 9500, width: 1500 }
    ], [
      { type: 'window', pos: 2200, width: 1400 }, { type: 'window', pos: 5750, width: 1000 }, { type: 'window', pos: 9500, width: 1500 }
    ], [
      { type: 'window', pos: 2200, width: 1500 }, { type: 'window', pos: 6800, width: 1500 }
    ], [
      { type: 'window', pos: 2600, width: 1400 }, { type: 'window', pos: 7000, width: 1400 }
    ]);

    wall(p, 'l1', 4500, 0, 4500, 9000, [
      { type: 'door', pos: 2400, width: 950 }, { type: 'door', pos: 7200, width: 850 }
    ]);
    wall(p, 'l1', 7000, 0, 7000, 9000, [
      { type: 'door', pos: 2200, width: 950 }, { type: 'door', pos: 6800, width: 900 }
    ]);
    wall(p, 'l1', 0, 5500, 4500, 5500, [{ type: 'door', pos: 3200, width: 900 }]);
    wall(p, 'l1', 7000, 4500, 12000, 4500, [{ type: 'door', pos: 2300, width: 900 }]);

    room(p, 'l1', 'Dormitorio principal', 0, 0, 4500, 5500, 'wood', '#e8dfcf');
    room(p, 'l1', 'Baño principal', 0, 5500, 4500, 9000, 'tile', '#dbe9ea');
    room(p, 'l1', 'Dormitorio 3', 7000, 0, 12000, 4500, 'carpet', '#e6dfd2');
    room(p, 'l1', 'Dormitorio 4', 7000, 4500, 12000, 9000, 'carpet', '#e6dfd2');
    room(p, 'l1', 'Hall / Escalera', 4500, 0, 7000, 9000, 'tile', '#e8e5dd');

    // Dormitorio principal
    item(p, 'l1', 'bedKing', 2200, 2800, 0);
    item(p, 'l1', 'nightstand', 950, 3700, 0);
    item(p, 'l1', 'nightstand', 3450, 3700, 0);
    item(p, 'l1', 'wardrobe', 3750, 1300, 90);
    item(p, 'l1', 'dresser', 2100, 4900, 0);
    item(p, 'l1', 'rug', 2200, 1900, 0);

    // Baño principal
    item(p, 'l1', 'bathtub', 3200, 8350, 0);
    item(p, 'l1', 'shower', 1000, 8300, 0);
    item(p, 'l1', 'sinkVanity', 2750, 5950, 180);
    item(p, 'l1', 'toilet', 4000, 6100, 180);
    item(p, 'l1', 'towelRack', 900, 6200, 0);

    // Dormitorio 3
    item(p, 'l1', 'bedDouble', 9400, 2300, 0);
    item(p, 'l1', 'nightstand', 8300, 3150, 0);
    item(p, 'l1', 'nightstand', 10550, 3150, 0);
    item(p, 'l1', 'wardrobe', 10800, 1350, 90);
    item(p, 'l1', 'desk', 7800, 3900, 180);

    // Dormitorio 4
    item(p, 'l1', 'bedQueen', 9400, 6800, 0);
    item(p, 'l1', 'nightstand', 8300, 7750, 0);
    item(p, 'l1', 'nightstand', 10600, 7750, 0);
    item(p, 'l1', 'wardrobe', 10800, 5600, 90);
    item(p, 'l1', 'bookshelf', 7550, 8500, 0);

    // Hall
    item(p, 'l1', 'stairs', 5150, 3000, 90);
    item(p, 'l1', 'plant', 6650, 900, 0);
    item(p, 'l1', 'consoleTable', 6600, 7600, 90);
    item(p, 'l1', 'rug', 5750, 6000, 0);

    dim(p, 'l1', 0, 0, 12000, 0, -900);
    dim(p, 'l1', 0, 0, 0, 9000, 900);
  }

  function demo() {
    var p = baseProject('Residencia Aurora', 'Vivienda unifamiliar de dos niveles');
    p.meta.client = 'Familia Mendoza';
    p.meta.location = 'Calle Los Nogales 245, Santa Cruz';
    p.meta.engineer = 'Ing. Ana Martínez';
    p.meta.license = 'CIP 12-3456';
    p.meta.phone = '+591 700 12345';
    p.meta.email = 'ana.martinez@estudioaurora.com';
    p.meta.date = '2026-11-18';
    p.meta.revision = 'A';
    p.meta.notes = 'Proyecto residencial de dos niveles. Estructura aporticada de hormigón armado, losa maciza y cubierta plana. Todas las cotas están expresadas en metros y los niveles en metros respecto al nivel de terreno natural.';
    p.settings.northAngle = 0;

    groundFloor(p);
    upperFloor(p);

    sheet(p, 'Planta baja', 'A3', 'landscape', 'modern', 'plan', 'l0', 50, 'A-01', 'PLANTA BAJA');
    sheet(p, 'Planta alta', 'A3', 'landscape', 'classic', 'plan', 'l1', 50, 'A-02', 'PLANTA ALTA');
    sheet(p, 'Notas y cuadros', 'A3', 'landscape', 'technical', 'notes', 'l0', 100, 'A-03', 'NOTAS Y CUADROS');
    sheet(p, 'Portada', 'A3', 'landscape', 'municipal', 'cover', 'l0', 100, 'A-04', 'PORTADA');
    return p;
  }

  function blank() {
    var p = baseProject('Proyecto nuevo', 'Plano residencial');
    p.meta.engineer = '';
    sheet(p, 'Planta baja', 'A3', 'landscape', 'modern', 'plan', 'l0', 100, 'A-01', 'PLANTA BAJA');
    return p;
  }

  function casa1() {
    var p = demo();
    p.meta.name = 'Casa Jardín';
    p.meta.description = 'Vivienda de un nivel, 2 dormitorios y área social';
    p.levels = [p.levels[0]];
    p.levels[0].height = 2800;
    ['walls', 'rooms', 'items', 'texts', 'dims'].forEach(function (k) {
      p[k] = p[k].filter(function (o) { return o.level === 'l0'; });
    });
    p.items = p.items.filter(function (o) { return o.libId !== 'stairs'; });
    p.sheets = p.sheets.filter(function (s) { return s.content === 'plan' && s.levelId === 'l0'; }).slice(0, 1);
    p.sheets[0].name = 'Planta única';
    p.sheets[0].title = 'PLANTA ÚNICA';
    p.sheets[0].sheetNo = 'A-01';
    p.sheets[0].template = 'modern';
    p.meta.notes = 'Vivienda de un nivel con estructura de hormigón armado y cubierta de losa.';
    return p;
  }

  function casa2() {
    var p = demo();
    p.meta.name = 'Casa Esmeralda';
    p.meta.client = 'Sr. y Sra. Rojas';
    p.meta.location = 'Urbanización Las Palmas, lote 12';
    p.meta.description = 'Vivienda dúplex de cuatro dormitorios';
    p.sheets[0].template = 'technical';
    p.sheets[1].template = 'modern';
    p.sheets[3].template = 'classic';
    return p;
  }

  var Templates = {
    list: [
      { id: 'blank', name: 'Plano en blanco', desc: 'Proyecto vacío con capas, dos niveles y hoja A3 lista.' },
      { id: 'casa1', name: 'Casa de un nivel', desc: 'Vivienda de 2 dormitorios, sala, cocina, baño y hall.' },
      { id: 'casa2', name: 'Casa de dos niveles', desc: 'Dúplex de 4 dormitorios con planos y portada.' },
      { id: 'demo', name: 'Residencia Aurora', desc: 'Proyecto demostración completo, 2 niveles amueblados.' }
    ],
    create: function (id) {
      if (id === 'blank') return blank();
      if (id === 'casa1') return casa1();
      if (id === 'casa2') return casa2();
      return demo();
    },
    demo: demo
  };

  ED.Templates = Templates;
})(window.EngDraft = window.EngDraft || {});

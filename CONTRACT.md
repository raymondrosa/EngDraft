# EngDraft — Contrato de arquitectura y datos

Aplicación web **offline** (abrir `index.html` con doble clic). HTML + CSS + JavaScript clásico,
sin bundler, sin módulos ES, sin CDN, sin dependencias externas. Todo el código comparte el
espacio global `window.EngDraft` y se carga en este orden desde `index.html`:

```html
<script src="js/geometry.js"></script>
<script src="js/library.js"></script>
<script src="js/templates.js"></script>
<script src="js/store.js"></script>
<script src="js/editor2d.js"></script>
<script src="js/view3d.js"></script>
<script src="js/sheets.js"></script>
<script src="js/dxf.js"></script>
<script src="js/app.js"></script>
```

Cada archivo debe envolverse en un IIFE y registrar su API en `window.EngDraft`:

```js
(function (ED) {
  'use strict';
  // ...
  ED.View3D = View3D;
})(window.EngDraft = window.EngDraft || {});
```

**Reglas**: no usar `fetch`, `import`, red, fuentes ni imágenes remotas. No tocar archivos fuera
del alcance asignado. Español para todo texto visible al usuario; identificadores de código en
inglés. Unidades internas: **milímetros**; el usuario ve metros/m². El eje Y del mundo apunta
hacia arriba (norte). El ángulo 0° apunta a +X (este). Las rotaciones se guardan en **grados
sexagesimales, sentido antihorario** (positivo hacia +Y/norte).

---

## 1. Modelo de proyecto (JSON serializable)

```js
project = {
  schema: "engdraft/v1",
  meta: {
    name: "Residencia Aurora",        // nombre del proyecto
    client: "Familia Pérez",
    location: "Av. Central 123, Ciudad",
    engineer: "Ing. Ana Martínez",
    license: "CIP-12345",
    phone: "+591 700 00000",
    email: "ana@estudio.com",
    date: "2026-11-18",               // ISO yyyy-mm-dd
    revision: "A",
    description: "Vivienda unifamiliar de dos niveles",
    notes: "Notas generales del proyecto"
  },
  settings: {
    units: "m",                       // "m" (métrico) | "ft" (imperial); solo presentación, datos en mm
    grid: 250,                        // separación de rejilla en mm
    wallThickness: 150,               // mm, valor por defecto para muros nuevos
    wallHeight: 2700,                 // mm
    floorHeight: 2800,                // mm entre niveles
    northAngle: 0,                    // grados, giro de la flecha norte
    autoDim: true
  },
  layers: [
    { id: "walls",      name: "Muros",       color: "#263238", visible: true, locked: false },
    { id: "openings",   name: "Aberturas",   color: "#2e7d8f", visible: true, locked: false },
    { id: "furniture",  name: "Mobiliario",  color: "#6b7c93", visible: true, locked: false },
    { id: "rooms",      name: "Ambientes",   color: "#6aa89a", visible: true, locked: false },
    { id: "annotation", name: "Anotaciones", color: "#1f2937", visible: true, locked: false },
    { id: "dimensions", name: "Cotas",       color: "#b5651d", visible: true, locked: false }
  ],
  levels: [
    { id: "l0", name: "Planta baja", elevation: 0,    height: 2700 },
    { id: "l1", name: "Planta alta", elevation: 2800, height: 2700 }
  ],
  walls: [
    {
      id: "w1", type: "wall", level: "l0", layerId: "walls",
      a: { x: 0, y: 0 }, b: { x: 5000, y: 0 },
      thickness: 150, height: 2700,
      openings: [
        { id: "o1", type: "door" | "window" | "garage" | "pass",
          t: 0.5,              // centro de la abertura, 0..1 sobre a→b
          width: 900,          // mm
          height: 2100,        // altura del hueco
          sill: 0,             // antepecho (ventanas)
          swing: 1,            // 1 derecha / -1 izquierda (puertas)
          hinge: 1 }           // 1 lado a / -1 lado b
      ]
    }
  ],
  rooms: [
    {
      id: "r1", type: "room", level: "l0", layerId: "rooms",
      name: "Sala", polygon: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3500 }],
      finish: "wood" | "tile" | "carpet" | "concrete" | "marble" | "grass",
      color: "#e8dfc9"             // color de relleno (opcional)
    }
  ],
  items: [
    {
      id: "i1", type: "item", level: "l0", layerId: "furniture",
      libId: "sofa3",              // clave de EngDraft.Library.items
      x: 2000, y: 1500,            // centro
      rotation: 0,                 // grados antihorarios
      w: 2200, d: 900, h: 850,     // dimensiones (normalmente las del catálogo)
      name: "Sofá 3 puestos"       // opcional; si falta se usa el nombre del catálogo
    }
  ],
  texts: [
    { id: "t1", type: "text", level: "l0", layerId: "annotation",
      x: 1000, y: 1000, text: "SALA", size: 300, rotation: 0 }
  ],
  dims: [
    { id: "d1", type: "dim", level: "l0", layerId: "dimensions",
      a: { x: 0, y: 0 }, b: { x: 5000, y: 0 },
      offset: 700,                  // distancia perpendicular de la línea de cota
      text: null                    // opcional; por defecto se calcula
    }
  ],
  sheets: [
    {
      id: "s1", name: "Planta baja",
      size: "A3",                   // A4 | A3 | A2 | A1 | Letter | Tabloid
      orientation: "landscape",     // landscape | portrait
      template: "modern",           // modern | classic | technical | municipal
      scale: 100,                   // denominador 1:100 (50, 75, 100, 125, 150, 200, 250)
      content: "plan",              // plan | notes | cover | 3d
      levelId: "l0",
      sheetNo: "A-01",
      title: "PLANTA BAJA",
      notes: "",
      showDims: true, showFurniture: true, showRooms: true, showGrid: false,
      imageDataUrl: null            // solo content:"3d", captura opcional
    }
  ]
}
```

Objetos opcionales adicionales futuros deben ignorarse sin romper. Cada objeto de `walls`,
`rooms`, `items`, `texts` y `dims` tiene `level`; filtrar por nivel cuando aplique.

---

## 2. `EngDraft.Geo` (lo implementa el Lead en `js/geometry.js`)

Funciones disponibles (no reimplementar salvo conveniencia):

```js
Geo.uid(prefix) -> "w_ab12cd"           // id único corto
Geo.clamp(v,min,max)
Geo.dist(a,b)
Geo.angle(a,b) -> radianes (atan2(dy,dx))
Geo.lerp(a,b,t)                         // punto interpolado
Geo.pointAt(a,b,t)
Geo.normDeg(deg)                        // 0..360
Geo.pointInPolygon(pt, poly)            // ray casting, incluye borde aproximado
Geo.polygonArea(poly)                   // área absoluta mm²
Geo.polygonCentroid(poly) -> {x,y}
Geo.bounds(points) -> {minX,minY,maxX,maxY,w,h}
Geo.wallLength(wall) -> mm
Geo.wallAngle(wall) -> rad
Geo.wallPolygon(wall) -> [p0,p1,p2,p3]  // contorno del muro con espesor
Geo.openingSpan(wall, opening) -> { from, to } // distancias en mm desde a
Geo.transformPoint(p, origin, rotDeg)
Geo.rectPolygon(cx,cy,w,h,rotDeg)
Geo.formatLength(mm, unit) -> "5.00 m" | "16'-5\""
Geo.formatArea(mm2) -> "12.50 m²"
Geo.snapAngle(rad, stepDeg)
Geo.deepClone(obj)
Geo.findRooms(project, levelId, opts) -> [{ polygon, area }]  // detección por rejilla
```

`Geo.findRooms` detecta regiones cerradas a partir de los muros. La implementa el Lead.

---

## 3. `EngDraft.Library` (equipo de mobiliario — `js/library.js`)

```js
ED.Library = {
  categories: [ { id:"muebles", name:"Mobiliario", icon:"sofa" }, ... ],
  items: {
    sofa3: {
      id: "sofa3",
      name: "Sofá 3 puestos",
      cat: "muebles",
      tags: "sala living sofa",
      w: 2200, d: 900, h: 850,
      color: "#7c8798",
      plan: [ // coordenadas LOCALES, centro (0,0), X derecha, Y ARRIBA (norte)
        { t:"rect", x:-1100, y:-450, w:2200, h:900, r:80, fill:"#dfe5ec", stroke:"#52606d" },
        { t:"circle", cx:-700, cy:0, r:180, fill:"#c9d2dc" },
        { t:"line", x1:-1100, y1:-450, x2:1100, y2:-450, stroke:"#52606d" },
        { t:"poly", points:[{x:0,y:0},...], fill:"...", stroke:"..." }
      ],
      boxes: [ // 3D, coordenadas locales, z desde el piso, centrado en x/y
        { x:-1100, y:-450, z:0, w:2200, d:900, h:400, color:"#8c98a8" },
        ...
      ]
    }
  },
  get(id) -> def|null,
  list(cat) -> [defs],
  search(q, cat) -> [defs]
}
```

Tipos de forma de planta: `rect` (x,y = esquina inferior izquierda local, w,h, r opcional),
`circle` (cx,cy,r), `line` (x1,y1,x2,y2), `poly` (points[]), `arc` (cx,cy,r,start,end en grados).
`fill`/`stroke` opcionales. La caja 3D usa `x,y` esquina mínima, `w,d,h` y elevación `z`.
Mínimo 28 accesorios repartidos en: muebles, cocina, baño, dormitorio, exterior/estructura.
Cada ítem debe verse bien en planta y en 3D.

---

## 4. `EngDraft.Templates` (`js/templates.js`)

```js
ED.Templates = {
  list: [ { id:"blank", name:"Plano en blanco", desc:"..." }, ... ],
  create(id) -> project,   // proyecto completo y válido; "blank" incluido
  demo() -> project        // casa residencial de ejemplo, 2 niveles, muebles y hojas
}
```
La demo debe abrir la app ya poblada y lucir profesional. Hojas incluidas:
planta baja A3, planta alta A3, notas/portada. No debe depender del DOM.

---

## 5. `EngDraft.Store` (Lead — `js/store.js`)

Instancia única `ED.store` disponible cuando corre `app.js`.

```js
store.project                     // proyecto activo
store.activeLevel                 // id de nivel activo (string)
store.selection                   // [{ kind:"wall"|"room"|"item"|"text"|"dim", id }]
store.on(fn) / store.off(fn)      // suscripción a cambios; fn(event)
store.emit(type, detail)          // "change" | "selection" | "view" | "level"
store.historyBegin(label)         // snapshot para una transacción
store.historyCommit()             // confirma snapshot en undo
store.historyCancel()
store.act(label, fn)              // begin + fn + commit + touch
store.touch()                     // emite change y autoguarda
store.undo() / store.redo()
store.canUndo() / store.canRedo()
store.activeLevelObj()            // {id,name,elevation,height}
store.levels()
store.walls() / rooms() / items() / texts() / dims()  // del nivel activo
store.find(kind, id)              // objeto o null
store.remove(kind, id)
store.newId(prefix)
store.setSelection(selection)
store.getLayer(id)
store.exportJSON() -> string
store.importJSON(str) -> project (lanza Error si inválido)
store.saveLocal() / store.loadLocal() / store.clearLocal()
```

El editor y la app mutan `store.project` y llaman `store.touch()` o `store.act(...)`.

---

## 6. `EngDraft.Editor2D` (Lead — `js/editor2d.js`)

```js
new ED.Editor2D(canvas, store, {
  onSelectionChange(selection), onCursor(worldPt), onStatus(text),
  onRequestText(worldPt), onPlaced(kind,obj), onError(msg)
})
editor.setTool("select"|"pan"|"wall"|"door"|"window"|"furniture"|"room"|"text"|"dim"|"erase")
editor.setFurniture(libId)
editor.setLevel(levelId)
editor.setSnap({ grid:true, snapping:true, ortho:false, gridSize:250 })
editor.setFurnitureRotation(deg)
editor.render()
editor.fitToContent()
editor.zoomBy(factor)
editor.detectRooms() -> number   // crea rooms en regiones cerradas
editor.getCursor()
editor.cancel()
```

---

## 7. `EngDraft.View3D` (equipo 3D — `js/view3d.js`)

Renderizador 3D propio sobre Canvas 2D (sin WebGL ni Three.js). Proyección en perspectiva,
pintor por profundidad, iluminación plana, órbita/zoom/pan, presets.

```js
const view = new ED.View3D(canvas, { store });   // o new ED.View3D(canvas); view.setStore(store)
view.setStore(store)
view.setOptions({ roof:false, furniture:true, labels:true, dimensions:false, ground:true, levels:"all"|"active", wallsCut:false })
view.setLevelFilter("all"|"active"|levelId)
view.setPreset("iso"|"top"|"front"|"right")
view.fit()
view.render()
view.resize()
view.screenshot() -> dataURL PNG
view.destroy()
```

Debe leer `store.project`, `store.activeLevel`, `ED.Library`, `ED.Geo`. Renderiza todos los
niveles apilados (elevación + altura), muros con huecos de puertas/ventanas, pisos por ambiente,
mobiliario (cajas 3D), etiquetas de ambiente y una base/terreno sutil. Colores claros,
estética arquitectónica, bordes suaves, cielo degradado. Debe verse bien a 1600×900 y en un
panel de 800×600, y responder a `ResizeObserver`.

---

## 8. `EngDraft.Sheets` (equipo láminas/PDF — `js/sheets.js`)

Todo el módulo de láminas y el escritor PDF vectorial, sin dependencias.

```js
ED.Sheets.SIZES = { A4:{w:297,h:210}, A3:{w:420,h:297}, A2:{w:594,h:420},
                    A1:{w:841,h:594}, Letter:{w:279.4,h:215.9}, Tabloid:{w:431.8,h:279.4} };
ED.Sheets.TEMPLATES = [
  { id:"modern", name:"Moderna", desc:"..." },
  { id:"classic", name:"Clásica", desc:"..." },
  { id:"technical", name:"Técnica", desc:"..." },
  { id:"municipal", name:"Municipal", desc:"..." }
];
ED.Sheets.mmToPx = 3.0;                         // referencia de preview
ED.Sheets.renderPreview(canvas, project, sheet) // ajusta al tamaño CSS del canvas; fondo blanco
ED.Sheets.renderSheet(canvas, project, sheet, pxPerMm) // render de alta resolución
ED.Sheets.createSheet(project, opts) -> sheet   // valores razonables y correlativo
ED.Sheets.createPDF(project, sheets) -> Blob    // PDF vectorial, una página por lámina
ED.Sheets.downloadPDF(project, sheets, filename)
ED.Sheets.planBounds(project, levelId) -> {minX,minY,maxX,maxY,w,h}
```

Requisitos:
- Tamaños A4/A3/A2/A1/Letter/Tabloid, horizontal/vertical.
- 4 plantillas de cajetín claramente distintas, con: logo **ENGDRAFT**, nombre de proyecto,
  cliente, ubicación, ingeniero, licencia, escala, fecha, revisión, número y título de lámina,
  nivel. Jerarquía tipográfica y líneas profesionales.
- Contenido `plan`: dibujo vectorial del nivel (muros, huecos, puertas con abanico, ventanas,
  mobiliario, nombres/áreas de ambientes, cotas si `showDims`), norte, escala gráfica,
  cajetín completo. Escala fija si cabe; si no, ajustar y anotar la escala efectiva.
- `notes`: notas generales, tabla de ambientes con superficies, tabla de mobiliario.
- `cover`: portada con título, datos, miniatura de planta y notas.
- `3d`: si `sheet.imageDataUrl`, incrustarla; si no, recuadro con aviso.
- PDF real (botón "Exportar PDF" descarga sin diálogo), texto vectorial con acentos españoles
  en WinAnsi, rellenos y líneas vectoriales, sin rasterizar el plano. Una página por hoja.
- `renderPreview` y el PDF deben compartir un backend de dibujo (canvas/painter + PDF painter)
  para que la lámina se vea igual en pantalla y en PDF.

---

## 9. `EngDraft.DXF` (Lead — `js/dxf.js`)

```js
ED.DXF.create(project, { levels:"active"|"all" }) -> string  // ASCII DXF R2010
ED.DXF.download(project, opts)
```
Entidades `LINE`, `LWPOLYLINE`, `CIRCLE`, `ARC`, `TEXT`, `INSERT` opcional; capas
`A-WALL`, `A-DOOR`, `A-WIND`, `A-FURN`, `A-ROOM`, `A-TEXT`, `A-DIM`; unidades mm.
Debe abrir en AutoCAD/LibreCAD. La UI lo etiqueta "DWG/DXF (AutoCAD)".

---

## 10. Tema visual (app)

- Fondo UI: grafito `#11161d` / `#161d26` / `#1d2631`; texto `#e8edf2`; secundario `#93a1b1`.
- Acento principal: ámbar `#f5a623`; acento secundario: cian `#48c9d8`; éxito `#4ade80`;
  peligro `#f87171`.
- Lienzo de plano: papel cálido `#f8f6f0`, rejilla `#e3ded2`, tinta `#24313d`.
- Tipografía de UI: `"Segoe UI", system-ui, -apple-system, sans-serif`.
- Tipografía técnica: `"Bahnschrift", "Consolas", monospace` para cifras.
- Radios 6–10 px, sombras suaves, microanimaciones 120–180 ms. Sin emojis en la UI.
- Iconos SVG de trazo (1.5 px), no librerías externas.

## 11. Pruebas

- `node --check` en cada archivo.
- Node disponible en:
  `C:\Users\Raymond\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`
- Python disponible en:
  `C:\Users\Raymond\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe`
- No hay red. No instalar paquetes.
- La app debe funcionar con `file://` (sin `import`, sin `fetch`, sin `type=module`).

## 12. Propiedad de archivos

| Archivo | Responsable |
|---|---|
| `index.html`, `css/app.css`, `js/app.js` | Lead |
| `js/geometry.js`, `js/store.js`, `js/editor2d.js`, `js/dxf.js` | Lead |
| `js/view3d.js` | Equipo 3D |
| `js/sheets.js` | Equipo láminas |
| `js/library.js`, `js/templates.js` | Equipo biblioteca |
| `README.md`, `CONTRACT.md` | Lead |

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
    engineer: "Ing. Proyecto",        // datos de ejemplo genéricos en las plantillas
    license: "***",
    phone: "+591 700 00000",
    email: "contacto@estudio.com",
    date: "2026-11-18",               // ISO yyyy-mm-dd
    revision: "A",
    description: "Vivienda unifamiliar de dos niveles",
    notes: "Notas generales del proyecto"
  },
  settings: {
    units: "m",                       // "m" (métrico) | "ft" (imperial); solo presentación, datos en mm
    grid: 250,                        // mm, separación de la rejilla menor
    gridMajor: 4,                     // entero 2..50, líneas maestras cada N líneas menores
    gridOriginX: 0,                   // mm, desfase del origen de la rejilla en X
    gridOriginY: 0,                   // mm, desfase del origen de la rejilla en Y
    snapStep: 0,                      // mm, paso de ajuste al dibujar; 0 = heredar grid
    gridAdaptive: true,               // al alejar el zoom agrupa líneas para no saturar
    gridStyle: "lines",               // "lines" | "dots"
    showAxes: true,                   // dibuja los ejes del origen de la rejilla
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

`Store.normalizeProject` sanea las claves de rejilla: `grid` se limita a 5..100000 mm,
`gridMajor` se redondea y limita a 2..50, `gridOriginX/Y` a ±1e7 mm, `snapStep` a 0..100000 mm
(0 = heredar `grid`), `gridStyle` cae a `"lines"` si no es `"dots"`, y `gridAdaptive`/`showAxes`
solo se desactivan con el valor `false`. Ningún valor puede quedar en `NaN`.

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
editor.setSnap({ grid:true, snapping:true, ortho:false,
                 gridSize:250,                 // mm, rejilla menor
                 gridMajor:4,                  // líneas maestras cada N menores
                 gridOriginX:0, gridOriginY:0, // mm; también acepta gridOrigin:{x,y}
                 snapStep:0,                   // mm; 0 = igual a gridSize
                 gridStyle:"lines"|"dots", gridAdaptive:true, showAxes:true })
editor.getGridInfo() -> { size, major, step, effectiveSize,
                          origin:{x,y}, style, adaptive, axes }
editor.snapPoint(worldPt, { noObject, noGrid }) -> { point, type, snapped }
editor.setFurnitureRotation(deg)
editor.render()
editor.fitToContent()
editor.zoomBy(factor)
editor.detectRooms() -> number   // crea rooms en regiones cerradas
editor.getCursor()
editor.cancel()
```

El ajuste a rejilla usa `p = round((v - origen) / paso) * paso + origen`, tanto en
`snapPoint()` como al arrastrar objetos en `_dragMove()`; los snaps a objetos (extremos,
medios, jambas, vértices, centros) siguen teniendo prioridad sobre la rejilla. `effectiveSize`
es la separación realmente dibujada, que puede doblarse cuando `gridAdaptive` está activo y el
zoom aleja demasiado las líneas.

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
- **Tamaño de letra de la interfaz:** la escala tipográfica se define con los tokens CSS
  `--fs-10` … `--fs-20`. El atributo `data-font` del elemento `<html>` admite
  `normal` (sin atributo o `"normal"`), `grande` (+1 px por token) y `xl` (+2 px por token).
  Lo gestiona el control **Aa** de la barra de estado y la preferencia se guarda en
  `localStorage` con la clave `engdraft.ui.font`.
- **Modal "Rejilla y ajuste":** se abre con `Shift+G`, con el botón **Rejilla** del lienzo o
  con el chip de rejilla de la barra de estado. Edita `project.settings` (separación, maestra,
  origen, paso de ajuste, estilo, adaptativa y ejes) con vista previa en vivo, aplica el cambio
  con `editor.setSnap()` y pasa por el historial (`Ctrl+Z` lo deshace).
- **Parámetros de URL de apoyo** (solo para verificación automática, no para el usuario final):
  `?font=normal|grande|xl` fija el tamaño de letra del arranque sin persistirlo y
  `?dialog=grid` abre el modal de rejilla al iniciar (también `?dialog=help`).

## 11. Pruebas

- `node --check` en cada archivo.
- Pruebas de humo con Node: `node tests/test-core.js` (geometría, biblioteca, plantillas,
  store y rejilla), `node tests/test-grid.js` (motor de rejilla del editor 2D),
  `node tests/test-sheets.js` (láminas y PDF) y `node tests/test-view3d.js` (renderizador 3D).
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

---

## 13. Ampliación 1.2 — curvas, techos, materiales, render y disposición de paneles

### 13.1 Muros curvos (modelo de datos)

`wall.curve` es opcional:

```js
{ type: 'arc', bulge: 0.35 }        // bulge = tan(barrido/4), convención DXF
{ type: 'spline', pts: [{x,y}, …] } // puntos intermedios ABSOLUTOS entre wall.a y wall.b (máx. 32)
```

- Muro recto = sin `curve`. `a` y `b` son siempre los extremos; nivel, capa, espesor y altura no cambian.
- `bulge` positivo = arco antihorario de `a`→`b`; `|bulge|=1` es media circunferencia; sagitta = (cuerda/2)·`|bulge|`. Se sanea a ±4.
- `spline`: la curva pasa por todos los puntos (Catmull-Rom). Con `pts` vacío equivale a una recta.
- **Los muros curvos no admiten aberturas** en esta versión: `normalizeProject` vacía `openings` si hay `curve`. El editor lo avisa.

### 13.2 `EngDraft.Geo` — API de curvas

```js
Geo.wallIsCurved(wall) -> boolean
Geo.wallPath(wall, {samples}) -> [{x,y}, …]   // eje: recta 2 puntos; curva muestreada
Geo.catmullRomPath(points, samplesPerSegment) -> polilínea que pasa por los puntos
Geo.arcFromBulge(a, b, bulge) -> { center, radius, startAngle, endAngle, sweep }
Geo.bulgeFromPoint(a, b, point) -> bulge firmado    // para editar el arco con el ratón
Geo.wallLength(wall) -> longitud del eje (curva o recta)
Geo.wallPointAt(wall, t) -> punto a fracción de longitud (0..1)
Geo.distToWall(point, wall) -> { dist, t, point }  // hit-test
Geo.wallPolygon(wall, extendEnds) -> 4 puntos (recta) o banda de 2N puntos (curva)
Geo.wallAngle(wall) -> ángulo de la cuerda a→b
```

### 13.3 `project.settings` nuevos

```js
roof:      { style: 'flat'|'gable'|'arc'|'spline',  // defecto "flat"
             height: 1200,                           // mm, 200..8000
             overhang: 400 },                        // mm, 0..2500
materials: {
  wall:   { color: '#f3eee2', texture: 'stucco'|'brick'|'wood'|'stone'|'smooth' },
  roof:   { color: '#b49a7c', texture: 'tile'|'shingle'|'metal'|'wood'|'concrete'|'smooth' },
  trim:   { color: '#fdfaf2' },
  ground: { color: '#c9d3ab', texture: 'grass'|'paving'|'gravel'|'smooth' }
},
render:    { mode: 'schematic'|'realistic',         // defecto "schematic"
             shadows: true, textures: true, sunAngle: 135 }  // sunAngle 0..360
```

`store.normalizeProject` sanea colores (`#rgb`/`#rrggbb`), texturas (lista blanca), números y aplica los defaults.

### 13.4 `EngDraft.View3D` — ampliación

```js
view.setOptions({ …actuales,
  renderMode: "schematic"|"realistic",
  materials: { wall:{color,texture}, roof:{color,texture}, trim:{color}, ground:{color,texture} },
  roofStyle: "flat"|"gable"|"arc"|"spline", roofHeight, roofOverhang,
  roofColor, roofTexture, shadows:bool, textures:bool, sunAngle:number })
view.getRenderInfo() -> { mode, textures, faces }
view.startFlight(opts) -> inicia animación de vuelo de dron en bucle (~14 s); no bloquea
view.stopFlight()
view.isFlying() -> boolean
```

Requisitos: muros curvos extruidos como pared continua (sin huecos), techos gable/arc/spline sobre `wallBounds`, colores de pared/techo y texturas procedurales (sin imágenes ni red), modo realista con cielo/sol/sombras y variación de color. `startFlight` mueve la cámara por una trayectoria cinematográfica alrededor de la maqueta; cualquier `pointerdown` del usuario detiene el vuelo. Debe funcionar con canvas falso en Node.

### 13.5 `EngDraft.Library` — nuevas categorías

Categorías nuevas: `plantas` (Plantas), `jardines` (Jardines), `vias` (Vías y accesos). Mínimos:
- `plantas`: palmera, árbol, arbusto, seto, macizo floral, planta ornamental (≥5).
- `jardines`: césped, jardín/jardinera, sendero, fuente, roca decorativa (≥4).
- `vias`: carretera recta, carretera curva 90°, entrada recta, entrada curva, acera, estacionamiento (≥5).

Cada ítem mantiene el formato actual (`id/name/cat/tags/w/d/h/color/plan[]/boxes[]`). Las curvas 3D se aproximan con varios `boxes`. Deben verse bien en planta (miniaturas SVG) y en 3D. No se renombran ids existentes.

### 13.6 Disposición de paneles y controles nuevos

- **Menú lateral colapsable (izquierda):** `#app[data-rail="expanded"|"compact"]`; botón `#btnRailToggle`. Persistencia `localStorage["engdraft.ui.rail"]` (defecto `expanded`). Expandido: icono + etiqueta + tecla por herramienta. Compacto: como la versión anterior.
- **Panel de ajustes colapsable (derecha):** `#app[data-inspector="open"|"closed"]`; botones `#btnInspectorToggle` (cerrar) y `#btnInspectorReopen` (reabrir, oculto si está abierto). Persistencia `localStorage["engdraft.ui.inspector"]` (defecto `open`).
- **Nueva pestaña `Escena`** (`data-tab="scene"`, `#panelScene`): modo de render, techo (estilo/altura/color/textura), paredes, suelo, sombras/sol y botón de vuelo de dron.
- **Acciones del escenario 3D:** además de las actuales, botones **Realista** y **Vuelo**.
- **Parámetros URL de apoyo** (verificación, no usuario final): `?view=3d|sheets`, `?font=`, `?dialog=grid|help|scene`, `?render=realistic`, `?roof=flat|gable|arc|spline`, `?flight=1`.
- Español en todo texto visible, sin emojis.

### 13.7 Pruebas esperadas de la ampliación

- Geometría: longitud/polígono de arco y spline, `bulgeFromPoint`, `distToWall`, robustez con valores inválidos.
- Store: saneado de `wall.curve`, `roof`, `materials`, `render`; export/import los conserva; muros curvos sin aberturas.
- Biblioteca: todos los ítems con `plan` y `boxes` válidos; las 3 categorías nuevas existen con sus mínimos.
- View3D: proyecto con muros curvos, 4 estilos de techo, modo realista y `startFlight()/stopFlight()` sin excepciones con canvas falso.
- Láminas y DXF: un proyecto con muro curvo se exporta sin `NaN` y el DXF abre (estructura válida).

---

## 14. Ampliación 1.3 — malla 3D en la biblioteca y controles rápidos de escena

### 14.1 Geometría de malla en las definiciones de biblioteca

`def.mesh` (opcional, solo para el 3D; la planta sigue en `def.plan` y las cajas en `def.boxes`):

```js
def.mesh = [
  { points: [ {x,y,z}, {x,y,z}, {x,y,z}, … ],  // 3..8 puntos, polígono convexo simple
    color: '#5a7d3f',        // color base (se sombrea por normal)
    edge: false,             // arista opcional (por defecto false)
    twoSided: true,          // caras visibles por ambos lados (hojas, telas)
    tex: 'wood' }            // textura procedural opcional, misma lista que las cajas
];
```

- Coordenadas locales idénticas a `boxes`: centro del objeto en (0,0), Y = norte, z desde el piso del nivel; en milímetros.
- El ítem escala la malla con el mismo criterio que las cajas (`item.w/d/h` frente a `def.w/d/h`) y aplica rotación/posición del ítem.
- `View3D` debe transformar los puntos y añadir cada polígono como cara iluminada (`addFace`), respetando `twoSided`, `edge` y, si existe, `tex`.
- Presupuesto: máximo ~600 caras por ítem de biblioteca y hasta 8000 caras por objeto importado (`project.assets`), con ~40 000 caras de malla por escena (descarta el resto sin romper).
- `library.js` puede generar mallas con bucles/funciones auxiliares (esferas, cilindros, conos, hojas curvas) en tiempo de carga; no se serializan en el proyecto.
- Las mallas son visuales: los tests de integridad siguen exigiendo `plan` y `boxes` válidos.

### 14.2 Controles rápidos de escena en la vista 3D

- Overlay `#view3dTools.view3d-tools` en la esquina superior izquierda de la vista 3D con:
  - selector **Techo**: `Sin techo | Plano | A dos aguas | Arco | Spline` (al elegir un estilo se activa `options3d.roof` automáticamente);
  - selector **Modo**: `Esquemático | Realista`;
  - botón **Colores y texturas** que abre el panel de ajustes en la pestaña Escena y desplaza hasta la sección Materiales.
- Los cambios se reflejan al instante y se sincronizan con la pestaña Escena (misma fuente: `project.settings.roof/materials/render` + `options3d.roof`).
- En la pestaña Escena, cambiar el tipo de techo activa "Mostrar techo" y la sección Materiales queda identificada (`#sceneMaterials`) para el acceso rápido.
- El control rápido debe ser legible sobre el fondo claro del 3D y no tapar el indicador norte ni el canvas.

---

## 15. Ampliación 1.4 — techos de diseño, vistas y secciones, i18n, importación de objetos y barra lateral limpia

### 15.1 Techos de diseño (modelo)

`project.settings.roof`:

```js
{
  style: 'flat'|'gable'|'hip'|'arc'|'spline'|'custom',
  ridge: 'auto'|'x'|'y',        // orientación de la cumbrera (gable/hip/custom)
  height: 1200,                 // mm, altura de referencia / flecha
  overhang: 400,                // mm
  profile: [ {t:0..1, z:mm}, … ] // solo style='custom': perfil del techo
}
```

- `hip` = cuatro aguas (poliforme): cuatro faldones sobre el rectángulo de la planta, cumbrera en el eje largo (o el indicado por `ridge`); en plantas cuadradas degenera a pirámide.
- `custom` = barrido del `profile` a lo largo de la cumbrera: `t` normalizado a lo ancho (extremos t=0 y t=1), `z` mm sobre el alero; muestreo suave (Catmull-Rom) entre puntos.
- Saneado en `store.normalizeProject`: style/ridge en lista blanca; `profile` 2..24 puntos finitos ordenados por t, z 0..8000; si `style='custom'` sin perfil válido → `'gable'`.
- `View3D` debe renderizar `hip` y `custom` con color/textura de techo, alero y sombras; `getRenderInfo().roofStyle` devuelve el estilo efectivo.
- UI: modal **Diseñar techo** con lienzo interactivo (arrastrar puntos del perfil), presets Plano / A dos aguas / Cuatro aguas / Arco / Spline / Mi diseño, y botones Cancelar/Aplicar. Se abre desde el selector rápido de la vista 3D y desde Escena → Techo.

### 15.2 Vistas y secciones (nuevo módulo `js/views.js`, equipo-planos)

```js
ED.Views.TYPES = [
  { id:'front',    name:'Frontal' },
  { id:'right',    name:'Lateral derecho' },
  { id:'left',     name:'Lateral izquierdo' },
  { id:'sectionX', name:'Sección transversal' },
  { id:'sectionY', name:'Sección longitudinal' }
];
ED.Views.build(project, opts) -> {
  type, title,
  bounds: { minX, minY, maxX, maxY, w, h },
  primitives: [ { kind:'poly'|'line'|'text', points:[{x,y}], fill, stroke, width, closed, text, size, align } ],
  meta: { scale }
}
opts = { type, levelId|'all', sectionPos (mm), scale }
ED.Views.render(canvas, project, opts) -> dibuja la vista ajustada al canvas (Canvas 2D; debe funcionar con canvas falso en Node)
```

- **Frontal:** proyección sobre X-Z mirando desde el sur (Y−); X a la derecha.
- **Lateral derecho:** mirando desde +X hacia −X; **lateral izquierdo:** desde −X hacia +X; ejes horizontales Y (invertido/rotado según vista).
- **Secciones:** `sectionX` = corte vertical en x=`sectionPos` (transversal); `sectionY` = corte en y=`sectionPos` (longitudinal). Por defecto `sectionPos` = centro de la caja del proyecto. Dibujar muros cortados con relleno/hatch, geometría visible detrás con líneas tenues, losa/terreno, techo (todos los estilos) y etiquetas de nivel/cota.
- Soportar muros rectos y curvos, aberturas (puerta, ventana, garaje, paso), niveles, y techo flat/gable/hip/arc/spline/custom. Si algo no se puede representar se omite sin lanzar.
- Coordenadas de salida en mm con Y hacia arriba; `build` es puro datos y `render` usa la misma primitiva. Sin dependencias ni DOM.

### 15.3 Idioma ES/EN (nuevo módulo `js/i18n.js`, ui-typography)

```js
ED.I18n = {
  current: 'es',
  setLang('es'|'en'),          // persiste en localStorage 'engdraft.lang'
  t(textoEspañol|clave, …),    // devuelve traducción o el original
  apply(root),                 // traduce nodos de texto y atributos title/placeholder/aria-label
  dict: { en: {…} }
};
```

- Traducción por coincidencia exacta de los textos de la interfaz, con patrones para cadenas con números (p. ej. “Zoom 46%”, “3 ambientes”). `apply()` se puede invocar tras cada render; opcionalmente MutationObserver para contenido dinámico (toasts, modales).
- Cobertura: index.html (topbar, vistas, menú, pestañas, estado), app.js (herramientas, propiedades, escena, láminas, modales principales, ayuda, toasts), biblioteca (categorías y nombres de objetos), etiquetas de vistas y mensajes de estado.
- El PDF/manual y los mensajes internos de validación pueden quedar en español en esta versión.
- Botón `#langToggle` en la barra lateral (lo inserta el Lead) con “ES / EN”; el Lead añade `<script src="js/i18n.js">` y llama a `apply()` en los renders principales.

### 15.4 Importación de muebles/objetos (nuevo módulo `js/importer.js`, equipo-3d-mesh)

```js
ED.Importer.parse(file, opts) -> Promise<{
  name, format: 'obj'|'glb'|'gltf',
  mesh: [ { points:[{x,y,z}], color } ],   // triángulos
  bounds: { minX,minY,minZ,maxX,maxY,maxZ },
  triangleCount
}>
```

- **OBJ** (texto, .obj): vértices `v` y caras `f` (triángulos o polígonos → triangulados); se ignoran normales/UV/materiales.
- **GLB** (glTF 2.0 binario): chunk JSON + BIN, primitivas con POSITION e índices UNSIGNED_BYTE/SHORT/INT, FLOAT, aplicación de matrices de nodos; color de `pbrMetallicRoughness.baseColorFactor` o neutro `#cfd6dd`.
- **.gltf** con buffers embebidos (`data:` base64) opcional.
- Validación: máximo 8000 triángulos (si excede, decimado simple avisando), coordenadas finitas, errores claros en español cuando el formato no sea compatible.
- La UI (Lead) pide nombre y dimensiones reales (ancho, fondo, alto), normaliza la malla a ese tamaño, calcula un contorno de planta (convex hull de la huella) y un color medio, y crea el objeto en `project.assets`.
- **Formato recomendado al usuario:** GLB (glTF binario) por ser un único archivo estándar web con materiales; OBJ como alternativa aceptable; FBX/3DS/STL no se soportan.

### 15.5 `project.assets` y biblioteca de objetos importados

```js
project.assets = [
  { id:'asset_x', name, w, d, h, color, plan:[…], boxes:[…], mesh:[…], source:'glb'|'obj' }
];
```

- `store.normalizeProject` valida y sanea assets (ids únicos, w/d/h 100..20000 mm, mesh ≤8000 caras, plan ≥3 puntos) y los conserva en export/import y autoguardado.
- `ED.Library.registerCustom(def)` añade el objeto a `items`, `order` y a la categoría `mios` (“Mis objetos”); `ED.Library.categories` incluye `{ id:'mios', name:'Mis objetos' }`.
- Al cargar un proyecto, el Lead registra `project.assets` para que planta, 3D, láminas y DXF resuelvan el `libId`.
- UI Biblioteca: botón **Importar objeto** con selector de archivo `.glb/.obj`, campos de nombre y dimensiones, y nota sobre el formato recomendado.

### 15.6 Barra lateral limpia (canvas despejado)

- Se eliminan del lienzo `.canvas-toggles` y `.zoom-controls`; el canvas 2D queda sin overlays.
- El rail izquierdo incorpora secciones:
  * **Dibujo:** toggles Rejilla/Snap/Orto + chip de rejilla (abre Configurar rejilla).
  * **Vista:** Ajustar, Zoom +, Zoom −.
  * **Vistas:** Planta, Frontal, Lateral izq., Lateral der., Sección transversal, Sección longitudinal.
  * **Sistema:** selector de unidades (m/ft) y selector de idioma (ES/EN).
- Los toggles se sincronizan con `editor.snap`; unidades con `project.settings.units`; idioma con `ED.I18n`.
- La barra de estado conserva coordenadas, zoom y nivel, pero pierde los botones de unidades/toggles (se mueven al rail); `#btnUnits` desaparece.
- En modo vista (≠ Planta) se oculta el canvas del plano y se muestra `#viewsCanvas` con la vista generada; Ajustar/Zoom operan sobre la vista activa.

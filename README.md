# EngDraft

**Planos de residencias en 2D y 3D, directo en el navegador.**
EngDraft es una aplicación HTML offline pensada para ingenieros civiles y diseñadores: dibuja la planta —con muros rectos, en arco o spline—, inserta puertas, ventanas, ambientes y mobiliario, revisa la maqueta 3D con techos y acabados realistas, genera **vistas y secciones** del proyecto y entrega el juego de planos en PDF vectorial o DXF compatible con AutoCAD. La interfaz cambia entre **español e inglés**, incluye un **diseñador de techos** (plano, a dos aguas, cuatro aguas, arco, spline o perfil propio) y permite **importar muebles externos en GLB u OBJ**.

📘 **Manual completo:** [`manual/EngDraft-Manual.pdf`](manual/EngDraft-Manual.pdf) · versión editable en Word: [`manual/EngDraft-Manual.docx`](manual/EngDraft-Manual.docx). Incluye tutorial paso a paso, referencia de herramientas, 3D, láminas, archivos, buenas prácticas, ejercicios para estudiantes, FAQ y checklist de entrega.

![Vista 2D](docs/vista-2d.png)

## Abrir la aplicación

No requiere instalación, servidor ni internet.

1. Abre **`index.html`** con doble clic (Edge, Chrome, Firefox o Safari recientes).
2. La primera vez se carga **Residencia Aurora**, un proyecto demostración de dos niveles completamente amueblado.
3. Si quieres servirlo por HTTP (útil para pruebas):

```bash
python -m http.server 8765
# abre http://127.0.0.1:8765/
```

Todos los datos se dibujan y se guardan en tu equipo. No se envía nada a ningún servidor.

## Funciones principales

### Plano 2D
- Muros encadenados con espesor y altura editables, uniones automáticas y snapping a extremos, medios, vértices y rejilla.
- **Muros en arco (C) y muro spline (K)**: el arco se define con tres clics (inicio, fin y curvatura con el ratón) y el spline con clics sucesivos que la curva atraviesa; puedes cambiar la flecha o mover los puntos de control arrastrando sus manejadores, y **Quitar curva** devuelve el muro a recto. Los muros curvos no admiten puertas ni ventanas en esta versión y el editor lo avisa.
- **Interfaz despejada**: el **menú de opciones** de la izquierda y el **panel de ajustes** de la derecha se pliegan con sus botones y el estado se recuerda en el navegador. El menú izquierdo reúne las herramientas, los toggles **Rejilla/Snap/Orto**, **Ajustar** y el zoom, las **vistas generadas**, el **selector de unidades** y el **idioma ES/EN**; el lienzo queda libre de controles flotantes. La pestaña **Escena** del panel derecho reúne el render, el techo, los materiales y el vuelo de dron.
- **Rejilla configurable**: separación de líneas, línea maestra, origen desplazado y un **paso de ajuste independiente** para dibujar con dimensiones exactas (por ejemplo rejilla de 25 cm y ajuste fino de 5 cm). Estilos de líneas o puntos, rejilla adaptativa al zoom y ejes del origen. Se abre con `Shift+G` o con el botón **Rejilla** del menú izquierdo; la configuración se guarda en el proyecto y se puede deshacer con `Ctrl+Z`.
- **Letra más legible**: escala tipográfica de la interfaz y control **Aa** en la barra de estado con tres tamaños (Normal, Grande y Muy grande). La preferencia queda recordada en este navegador.
- Puertas y ventanas insertadas sobre un muro recto, con abanico, jambas, vidrio y antepecho. Puedes **girar la hoja, invertir la bisagra** y editar ancho, alto, posición y antepecho.
- **Sistema métrico o imperial** conmutable desde el menú izquierdo (junto a ES/EN) o desde Datos del proyecto: m / m² o ft / ft² en cotas, áreas, propiedades, láminas y 3D.
- Ambientes con nombre, acabado, color y **área calculada**; detección automática de recintos cerrados.
- Biblioteca de **65 accesorios** (sala, cocina, baño, dormitorio, exterior, **iluminación**, **plantas, jardines y vías**) y **objetos importados**; ver [Biblioteca de objetos](#biblioteca-de-objetos).
- Cotas manuales y cotas generales automáticas, textos, norte, rejilla adaptativa, capas con visibilidad y bloqueo.
- Selección, arrastre, rotación, duplicado, borrado, deshacer/rehacer y edición numérica de cada objeto.
- Niveles ilimitados con pestañas de planta.

La rejilla se ajusta desde su propio cuadro (`Shift+G`) y la letra de la interfaz desde el control **Aa** de la barra de estado.

![Muros en arco y spline](docs/muros-curvos.png)

![Configuración de la rejilla](docs/rejilla-config.png)

![Tamaño de letra de la interfaz](docs/menu-letra.png)

### Vistas y secciones
- El menú izquierdo, sección **Vistas**, cambia el área 2D entre la **planta** editable y dibujos de **solo lectura** generados desde el proyecto: **frontal**, **lateral derecho**, **lateral izquierdo**, **sección transversal** y **sección longitudinal**.
- Los alzados muestran muros, huecos de puertas y ventanas, vidrios, antepechos, losas, terreno, techo (con todos los estilos, incluidos cuatro aguas y perfil propio) y etiquetas de nivel; las secciones cortan los muros con relleno y trama, dibujan la geometría posterior en líneas tenues y permiten mover la **posición del corte**.
- La vista generada se puede ampliar con la rueda o los botones de zoom, arrastrar para desplazarla, ajustar al ancho con **Ajustar** y volver al editor con **Volver a planta**. Se dibujan con primitivas vectoriales propias (sin librerías) y respetan las unidades del proyecto.

![Vista frontal generada desde la planta](docs/vistas-secciones.png)

![Sección transversal con muros cortados y techo](docs/seccion-transversal.png)

### Biblioteca de objetos
- **65 accesorios 3D** con planta, alzado aproximado y etiquetas de búsqueda:
  - **Plantas**: palmera, árbol, arbusto, seto, macizo floral y planta ornamental.
  - **Jardines**: césped, jardinera, sendero, fuente y rocalla.
  - **Vías y accesorios**: carretera recta, carretera en curva, entrada recta, entrada en curva, acera y estacionamiento. Las vías curvas son superficies 3D continuas con bordes y eje pintado.
  - **Vehículos**: automóvil, camioneta SUV y pickup, con carrocería, cristales, faros, espejos y ruedas.
  - **Iluminación**: farola de calle, poste con luminaria, lámpara de jardín y lámpara colgante.
  - **Mis objetos**: muebles y accesorios que importes en el proyecto (ver [Importar objetos](#importar-objetos)).
- En planta las miniaturas son SVG nítidas y en 3D los objetos con malla se dibujan con volumen real (troncos, copa, frondas, ruedas o luminarias), no como cajas.

![Biblioteca de plantas](docs/biblioteca-plantas.png)

![Biblioteca de vías y accesos](docs/biblioteca-vias.png)

### Vista 3D
- Renderizador propio sobre Canvas 2D (sin WebGL ni librerías externas): perspectiva orbital, iluminación, sombras suaves y cielo.
- Muros con huecos reales de puertas y ventanas, vidrios, dinteles y antepechos; los **muros en arco y spline** se extruyen como pared continua, sin huecos ni cortes.
- **Seis estilos de techo**: plano, a dos aguas, **cuatro aguas (poliforme)**, arco, spline y **Mi diseño** (perfil propio dibujado por el usuario), con altura/flecha, alero y orientación de cumbrera ajustables. Las cubiertas se generan sobre la planta del nivel superior y respetan los muros curvos.
- **Controles rápidos en la propia vista 3D**: selector **Techo** (sin techo, plano, a dos aguas, cuatro aguas, arco, spline o Mi diseño), selector **Modo** (esquemático/realista) y botón **Colores y texturas** que abre los materiales de paredes, techo y suelo.
- **Diseñador de techo**: lienzo interactivo para arrastrar los puntos del perfil, añadir o quitar puntos y partir de los presets; se abre desde Escena, desde el botón **Diseñar techo** de la vista 2D o eligiendo **Mi diseño** en el selector rápido.
- **Modo realista**: cielo con sol, sombras, colores por material (paredes, techo, marcos y suelo) y **texturas procedurales** de estuco, ladrillo, madera, piedra, teja, metal, césped y pavimento, sin imágenes ni red. El modo esquemático conserva la paleta de planos.
- **Vegetación y vehículos con volumen real**: palmeras, árboles, arbustos, setos y automóviles se dibujan con mallas 3D (troncos cilíndricos, copas esféricas, frondas curvas y ruedas), no como cajas. Las **vías curvas** también son superficies continuas con bordes y eje pintado.
- **Vuelo de dron**: la cámara recorre la maqueta en bucle durante unos 14 segundos; se inicia y detiene desde **Escena** o con el botón **Vuelo**, y un clic sobre la vista 3D lo detiene.
- Pisos por ambiente, mobiliario 3D, plantas, jardines y vías, etiquetas de ambiente y captura PNG de alta resolución para las láminas.
- Presets **Iso / Planta / Frente / Lateral**, encuadre automático, filtro de nivel activo o ambos niveles.
- Órbita con arrastre, desplazamiento con botón derecho/Shift, rueda para zoom y doble clic para encuadrar.

![Vegetación y vehículos con volumen 3D real](docs/vegetacion-autos.png)

![Materiales de paredes, techo y suelo en la pestaña Escena](docs/materiales-3d.png)

![Escena 3D en modo realista con techo en arco](docs/escena-3d.png)

![Techo a cuatro aguas generado en la vista 3D](docs/techo-cuatro-aguas.png)

![Diseñador de techo con perfil editable](docs/disenador-techo-2.png)

![Vuelo de dron](docs/vuelo-dron.png)

### Idioma
- Botón **ES / EN** en la parte superior del menú izquierdo: cambia toda la interfaz entre español e inglés (menús, herramientas, paneles, propiedades, escena, biblioteca, láminas, modales, ayuda y avisos) sin recargar el proyecto. La preferencia se recuerda en este navegador.
- El plano, las vistas, el manual/PDF y los datos del proyecto no se traducen.

![Interfaz en inglés](docs/idioma-en.png)

![Menú izquierdo limpio con unidades e idioma](docs/rail-limpio.png)

### Importar objetos
- En **Biblioteca** pulsa **Importar objeto (.glb / .obj)** y elige el archivo. El formato **recomendado es GLB** (glTF 2.0 binario): un solo archivo, estándar web, con materiales y colores; **OBJ** también se acepta (sin texturas). FBX, 3DS, STL y DAE no se admiten.
- Tras leer el archivo se muestran los **triángulos** y las **dimensiones detectadas**; ajusta nombre, ancho, fondo y alto reales y pulsa **Importar objeto**. Se crea en **Mis objetos**, se puede colocar en planta (con contorno de huella), ver en 3D con su malla y se guarda dentro del proyecto `.engdraft` (incluido el autoguardado).
- Los objetos importados se limitan a **8000 triángulos** por objeto; si el archivo trae más, se decima avisando. El render 3D comparte un presupuesto de malla por escena.

![Importar un mueble GLB u OBJ con dimensiones reales](docs/importar-objeto.png)

![Vehículos y lámparas nuevos en la biblioteca 1.4](docs/autos-lamparas.png)

### Láminas y PDF
- **4 cajetines profesionales**: Moderna, Clásica, Técnica y Municipal, con logo, proyecto, cliente, ubicación, ingeniero, licencia, escala, fecha, revisión, nivel, título y número de lámina.
- Tamaños **A4, A3, A2, A1, Letter y Tabloid**, horizontal o vertical.
- Contenidos: planta del nivel, notas y cuadros, portada y vista 3D con captura.
- Escala fija si cabe; si no cabe, se ajusta automáticamente y se anota la escala efectiva.
- Exportación **PDF vectorial** (no rasteriza el plano), una página por lámina, con acentos y símbolos españoles.

![Lámina de planta](docs/lamina-planta.png)

### Archivos
- **Guardar / abrir** proyectos `.engdraft` (JSON legible) con todos los niveles, objetos, capas, láminas, diseño de techo y **objetos importados** (malla, huella y dimensiones).
- Arrastrar y soltar un `.engdraft` o `.json` sobre la aplicación también lo abre.
- Autoguardado en el navegador.
- Exportar **DXF ASCII** en milímetros para AutoCAD, LibreCAD, BricsCAD y otros CAD. Sin curvas se genera **R12**; si el plano incluye muros en arco o spline se declara **R2000** para que las `LWPOLYLINE` de las curvas se lean bien.
- Exportar **PDF** de todo el juego de planos.

> **Sobre DWG:** el navegador no puede escribir el formato binario propietario `.dwg`. EngDraft exporta **DXF** (R12, o R2000 cuando hay muros curvos), el formato de intercambio estándar de AutoCAD. Abre el `.dxf` en AutoCAD y usa *Guardar como → DWG* si necesitas ese formato. La interfaz lo etiqueta como **DWG/DXF** y muestra esta explicación al exportar.

## Flujo de trabajo recomendado

1. **Muro (M) / Arco (C) / Spline (K)**: dibuja el perímetro y los tabiques con clics; `Esc` termina.
2. **Puerta (P) / Ventana (N)**: haz clic sobre un muro recto para insertar la abertura.
3. **Detectar ambientes**: cierra los recintos y pulsa el botón; se crean con área.
4. **Mueble (F)**: elige un accesorio de la biblioteca (muebles, plantas, jardines o vías) y haz clic en el plano; `R` rota 90°.
5. **Texto (T), Cota (D)**: añade anotaciones y acotaciones.
6. **Vista 3D (2)**: revisa la maqueta, elige techo y materiales en la pestaña **Escena**, prueba el **modo realista** y el **vuelo de dron**, y captura una imagen si quieres incluirla en una lámina.
7. **Láminas (3)**: configura tamaño, cajetín, escala y contenido.
8. **PDF** o **DWG/DXF**: exporta el entregable. Guarda el `.engdraft` para conservar el proyecto editable.

## Atajos

| Acción | Tecla |
|---|---|
| Seleccionar / Mover vista | `V` / `H` |
| Muro / Puerta / Ventana | `M` / `P` / `N` |
| Muro en arco / Muro spline | `C` / `K` |
| Ambiente / Mobiliario | `A` / `F` |
| Texto / Cota / Borrar | `T` / `D` / `E` |
| Terminar o salir | `Esc` |
| Deshacer / Rehacer | `Ctrl+Z` / `Ctrl+Y` |
| Guardar proyecto / Abrir | `Ctrl+S` / `Ctrl+O` |
| Nuevo proyecto / Duplicar mueble | `Ctrl+N` / `Ctrl+D` |
| Alternar rejilla / snap / orto | `G` / `S` / `O` |
| Configurar rejilla y paso de ajuste | `Shift+G` |
| Rotar mueble seleccionado | `R` |
| Ajustar vista | `Shift+F` o `Home` |
| Vistas 2D / 3D / Láminas | `1` / `2` / `3` |
| Zoom | `+` / `−` |
| Ayuda | `?` o `F1` |

## Estructura

```
index.html                  Entrada de la aplicación
css/app.css                 Interfaz oscura y responsiva
js/geometry.js              Geometría, curvas (arco/spline), snapping y detección de ambientes
js/library.js               Catálogo de mobiliario, plantas, jardines y vías (planta + cajas 3D)
js/templates.js             Plantillas y proyecto demostración
js/store.js                 Estado, historial, selección y autoguardado
js/editor2d.js              Editor de planta (muros rectos, en arco y spline)
js/view3d.js                Renderizador 3D sobre Canvas 2D (techos, materiales y vuelo)
js/sheets.js                Cajetines, backend Canvas/PDF y PDF vectorial
js/dxf.js                   Exportador DXF (R12; R2000 con muros curvos)
js/app.js                   Orquestación de la interfaz
samples/                    Proyecto, PDF y DXF de ejemplo
docs/                       Capturas de la aplicación
tests/                      Pruebas de humo con Node
```

## Muestras incluidas

- `samples/Residencia-Aurora.engdraft` — proyecto editable de dos niveles.
- `samples/Residencia-Aurora-planos.pdf` — 4 láminas A3 (plantas, notas y portada).
- `samples/Residencia-Aurora.dxf` — plano en DXF para AutoCAD.

## Pruebas

Con Node disponible:

```bash
node tests/test-core.js      # geometría, biblioteca, plantillas, store (rejilla, techo, materiales, assets), DXF
node tests/test-grid.js      # rejilla configurable del editor 2D: ajuste, saneado y render
node tests/test-curves.js    # muros en arco y spline: Geo.*, saneado, editor 2D y DXF con LWPOLYLINE
node tests/test-sheets.js    # previews Canvas (incluye planta con curvas) y PDF vectorial (xref/páginas)
node tests/test-view3d.js    # renderizador 3D: presets, techos (incl. cuatro aguas y perfil), mallas y vuelo
node tests/test-views.js     # vistas frontal/laterales y secciones generadas desde el proyecto
node tests/test-import.js    # importación de OBJ y GLB (triángulos, bounds, límites y errores)
node tests/make-samples.js   # regenera las muestras
```

Las pruebas de navegador se hicieron contra Microsoft Edge (Chromium) servido por HTTP y también abriendo `index.html` directamente.

![Vista 3D](docs/vista-3d.png)

## Privacidad y guardado

- Todo el procesamiento es local; no hay peticiones de red ni dependencias CDN.
- El autoguardado usa `localStorage`. Algunos navegadores restringen `localStorage` en `file://`; en ese caso la interfaz avisa *Sin autoguardado*. Descarga el `.engdraft` para conservar tu trabajo.
- No se recopilan datos, cuentas ni telemetría.

## Limitaciones conocidas

- **DWG nativo:** no se genera el binario propietario; se entrega DXF compatible (R12, o R2000 con curvas) y se explica cómo guardarlo como DWG en AutoCAD.
- **Muros curvos sin aberturas:** en la versión 1.2 los muros en arco y spline no admiten puertas ni ventanas; el editor avisa y el saneado del proyecto vacía esas aberturas.
- El techo 3D se genera sobre la envolvente del nivel superior; con los estilos a dos aguas, arco y spline puede quedar algún voladizo en plantas muy irregulares.
- Las texturas del modo realista son **procedurales** (sin imágenes externas) y buscan dar volumen y material, no fotorrealismo; tampoco hay *picking* de objetos en la vista 3D.
- El PDF no comprime los flujos de imagen de la captura 3D; un juego con capturas puede pesar unos MB.
- **Vistas y secciones:** se generan y consultan en la opción 2D; en esta versión no se insertan como contenido de lámina PDF ni se exportan al DXF (la lámina y el DXF siguen siendo de planta).
- **Objetos importados:** sin texturas ni animación; GLB con recursos externos no se admite (debe ser un único `.glb` o `.gltf` con buffers embebidos). El límite es 8000 triángulos por objeto (se decima avisando) y el render 3D comparte un presupuesto de malla por escena.
- La aplicación está pensada para escritorio; en pantallas pequeñas se recomienda 1280 px de ancho o más.

---

**EngDraft 1.4** · HTML + CSS + JavaScript clásico · sin dependencias externas · funciona offline.

**Autor:** Prof. Raymond Rosa Ávila.

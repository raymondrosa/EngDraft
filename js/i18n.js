/* ==========================================================================
   EngDraft — motor de idioma ES / EN
   --------------------------------------------------------------------------
   Traduce la interfaz por coincidencia de textos (español → inglés).
   - ED.I18n.current: 'es' | 'en'
   - ED.I18n.setLang(lang): cambia, persiste en localStorage 'engdraft.lang' y aplica
   - ED.I18n.t(texto, ...args): traducción de un texto (o el original si no hay)
   - ED.I18n.apply(root): traduce nodos de texto y atributos visibles del DOM
   - MutationObserver para contenido dinámico (toasts, modales, paneles)
   - En Node (sin DOM) el módulo funciona y apply() es no-op.
   Sin dependencias ni red.
   ========================================================================== */
(function (root) {
  'use strict';

  var ED = root.EngDraft = root.EngDraft || {};

  var STORAGE_KEY = 'engdraft.lang';
  var LANGS = ['es', 'en'];

  /* ======================================================================
     Diccionario EN (clave = texto exacto en español, sin espacios extremos)
     ====================================================================== */
  var DICT = {
    en: {
      /* ---------- Interfaz general / barra superior ---------- */
      'Abre un proyecto EngDraft': 'Open an EngDraft project',
      'Abrir proyecto': 'Open project',
      'Abrir proyecto (.engdraft / .json)': 'Open project (.engdraft / .json)',
      'Abrir colores, texturas y materiales de la escena': 'Open scene colors, textures and materials',
      'Ajustes': 'Settings',
      'Alternar menú de opciones': 'Toggle options menu',
      'Autor de EngDraft': 'EngDraft author',
      'Ayuda': 'Help',
      'Ayuda y atajos': 'Help and shortcuts',
      'Atajos de teclado': 'Keyboard shortcuts',
      'Cargando…': 'Loading…',
      'Descargar proyecto': 'Download project',
      'Descargar proyecto (Ctrl+S)': 'Download project (Ctrl+S)',
      'Deshacer': 'Undo',
      'Deshacer (Ctrl+Z)': 'Undo (Ctrl+Z)',
      'Diseño residencial 2D · 3D': 'Residential design 2D · 3D',
      'Editar datos del proyecto': 'Edit project data',
      'Editor de planta': 'Plan editor',
      'EngDraft': 'EngDraft',
      'EngDraft — Planos residenciales 2D / 3D': 'EngDraft — 2D / 3D residential plans',
      'EngDraft: dibujo de planos de residencias en 2D y 3D, ambientes, mobiliario, hojas de título y exportación PDF / DWG-compatible.':
        'EngDraft: 2D and 3D residential plan drawing, rooms, furniture, title sheets and PDF / DWG-compatible export.',
      'Exportar DWG/DXF para AutoCAD': 'Export DWG/DXF for AutoCAD',
      'Exportar láminas a PDF': 'Export sheets to PDF',
      'Guardado': 'Saved',
      'Guardando…': 'Saving…',
      'Herramientas': 'Tools',
      'Pantalla': 'Screen',
      'Automático': 'Automatic',
      'Computadora': 'Computer',
      'Tableta': 'Tablet',
      'Celular': 'Phone',
      'Modo de pantalla': 'Screen mode',
      'Menú de opciones': 'Options menu',
      'Panel de ajustes': 'Settings panel',
      'Listo': 'Ready',
      'Láminas': 'Sheets',
      'Láminas del proyecto': 'Project sheets',
      'Mostrar ajustes': 'Show settings',
      'Mostrar el panel de ajustes': 'Show settings panel',
      'Mostrar u ocultar el menú de opciones': 'Show or hide the options menu',
      'Niveles': 'Levels',
      'Nuevo proyecto': 'New project',
      'Nuevo proyecto (Ctrl+N)': 'New project (Ctrl+N)',
      'Ocultar ajustes': 'Hide settings',
      'Ocultar panel de ajustes': 'Hide settings panel',
      'Opciones': 'Options',
      'Plano 2D': '2D plan',
      'Rehacer': 'Redo',
      'Rehacer (Ctrl+Y)': 'Redo (Ctrl+Y)',
      'Sin autoguardado': 'No autosave',
      'Suelta aquí un archivo': 'Drop a file here',
      'Vista 3D': '3D view',
      'Vistas': 'Views',
      'Ajustes de la interfaz': 'Interface settings',

      /* ---------- Barra lateral: herramientas ---------- */
      'Seleccionar': 'Select',
      'seleccionar': 'select',
      'muro': 'wall',
      'puerta': 'door',
      'ayuda': 'help',
      'Mover': 'Move',
      'Muro': 'Wall',
      'Arco': 'Arch',
      'Spline': 'Spline',
      'Puerta': 'Door',
      'Ventana': 'Window',
      'Ambiente': 'Room',
      'Muebles': 'Furniture',
      'Texto': 'Text',
      'Cota': 'Dimension',
      'Borrar': 'Erase',
      'Muro recto encadenado': 'Chained straight wall',
      'Muro en arco': 'Arched wall',
      'Muro spline': 'Spline wall',
      'Muebles, plantas y vías': 'Furniture, plants and paths',
      'Dibujo': 'Drawing',
      'Vista': 'View',
      'Sistema': 'System',
      'Ajustar': 'Fit',
      'Acercar': 'Zoom in',
      'Alejar': 'Zoom out',
      'Configurar rejilla (Shift+G)': 'Configure grid (Shift+G)',
      'Rejilla': 'Grid',
      'Snap': 'Snap',
      'Orto': 'Ortho',
      'Sistema de unidades (métrico / imperial)': 'Unit system (metric / imperial)',
      'Idioma / Language': 'Language / Idioma',
      'Idioma': 'Language',
      'Español': 'Spanish',
      'Inglés': 'English',
      'Métrico (m · m²)': 'Metric (m · m²)',
      'Imperial (ft · ft²)': 'Imperial (ft · ft²)',
      'm · m²': 'm · m²',
      'ft · ft²': 'ft · ft²',
      'Cambiar sistema de unidades': 'Change unit system',
      'Sistema de unidades': 'Unit system',
      'Sistema métrico (m/mm). Clic para cambiar al sistema imperial.': 'Metric system (m/mm). Click to switch to imperial.',
      'Sistema imperial (ft/in). Clic para volver al sistema métrico.': 'Imperial system (ft/in). Click to return to metric.',
      'Sistema imperial activado (pies/pulgadas).': 'Imperial system enabled (feet/inches).',
      'Sistema métrico activado (metros).': 'Metric system enabled (meters).',

      /* ---------- Barra de estado ---------- */
      'Cambiar entre sistema métrico e imperial': 'Switch between metric and imperial',
      'Tamaño de letra de la interfaz (clic para cambiar)': 'Interface font size (click to change)',
      'Tamaño de letra de la interfaz': 'Interface font size',
      'Tamaño de letra': 'Font size',
      'Normal': 'Normal',
      'Grande': 'Large',
      'Muy grande': 'Very large',
      'Zoom': 'Zoom',

      /* ---------- Escenario / vistas / 3D ---------- */
      'Planta': 'Plan',
      'Frontal': 'Front',
      'Lateral der.': 'Right side',
      'Lateral izq.': 'Left side',
      'Sección transversal': 'Cross section',
      'Sección longitudinal': 'Longitudinal section',
      'Vista generada · solo lectura': 'Generated view · read only',
      'Frente': 'Front',
      'Lateral': 'Side',
      'Iso': 'Iso',
      'Planta baja': 'Ground floor',
      'Planta alta': 'Upper floor',
      'Techo': 'Roof',
      'Modo': 'Mode',
      'Tipo de techo': 'Roof type',
      'Modo de renderizado': 'Render mode',
      'Sin techo': 'No roof',
      'Plano': 'Flat',
      'A dos aguas': 'Gable',
      'Cuatro aguas': 'Hip',
      'Mi diseño…': 'My design…',
      'Mi diseño': 'My design',
      'Esquemático': 'Schematic',
      'Realista': 'Realistic',
      'Colores y texturas': 'Colors and textures',
      'Vuelo de dron': 'Drone flight',
      'Arrastra para orbitar · clic derecho o dos dedos para desplazar · rueda para acercar':
        'Drag to orbit · right-click or two fingers to pan · wheel to zoom',
      'Preparando la maqueta…': 'Preparing the model…',
      'Detectar ambientes': 'Detect rooms',
      'Cotas generales': 'Overall dimensions',
      'Encuadrar': 'Frame',
      'Vuelo dron': 'Drone flight',
      'Detener vuelo': 'Stop flight',
      'Iniciar vuelo': 'Start flight',
      'Captura': 'Capture',
      'Captura a lámina': 'Capture to sheet',
      'Diseñar techo': 'Design roof',
      'Editar techo': 'Edit roof',
      'Aplicar techo': 'Apply roof',
      'El módulo de vista 3D no está disponible.': 'The 3D view module is not available.',
      'Módulo de vistas no disponible.': 'Views module unavailable.',
      'La vista 3D aún no está lista.': 'The 3D view is not ready yet.',
      'La vista 3D encontró un problema al dibujar.': 'The 3D view hit a problem while drawing.',
      'No se pudo iniciar la vista 3D.': 'Could not start the 3D view.',
      'No se pudo capturar la vista 3D.': 'Could not capture the 3D view.',
      'Vuelo de dron detenido.': 'Drone flight stopped.',
      'Vuelo de dron iniciado.': 'Drone flight started.',
      'Vuelo de dron en curso · clic en la vista para detenerlo': 'Drone flight in progress · click the view to stop it',
      'Modo esquemático activado.': 'Schematic mode enabled.',
      'Modo realista: texturas, luz solar y sombras.': 'Realistic mode: textures, sunlight and shadows.',
      'Techo oculto. Elige un estilo para mostrarlo.': 'Roof hidden. Choose a style to show it.',
      'Ajuste de renderizado': 'Render settings',
      'Renderizado': 'Rendering',
      'Materiales': 'Materials',
      'Paredes': 'Walls',
      'Suelo': 'Ground',
      'Marcos': 'Frames',
      'Color de puertas y ventanas': 'Door and window color',
      'Contenido': 'Content',
      'Etiquetas de ambientes': 'Room labels',
      'Terreno y rejilla': 'Ground and grid',
      'Niveles visibles': 'Visible levels',
      'Ambos niveles': 'Both levels',
      'Solo el nivel activo': 'Active level only',
      'Restablecer escena': 'Reset scene',
      'Restablecer': 'Reset',
      'Sombras suaves': 'Soft shadows',
      'Texturas procedurales': 'Procedural textures',
      'Ángulo del sol:': 'Sun angle:',
      'Mostrar techo en la vista 3D': 'Show roof in 3D view',
      'Altura / flecha': 'Height / rise',
      'Alero': 'Overhang',
      'Orientación de cumbrera': 'Ridge orientation',
      'Orientación de la cumbrera': 'Ridge orientation',
      'Orientación del techo': 'Roof orientation',
      'Cumbrera': 'Ridge',
      'Perfil del techo': 'Roof profile',
      'Automática (eje largo)': 'Automatic (long axis)',
      'Horizontal (X)': 'Horizontal (X)',
      'Vertical (Y)': 'Vertical (Y)',
      'El perfil se barre a lo largo de la cumbrera en el 3D. Los extremos del perfil quedan en los aleros.':
        'The profile is swept along the ridge in 3D. The profile ends sit at the overhangs.',
      'Plano, a dos aguas, cuatro aguas, arco, spline o tu propio perfil':
        'Flat, gable, hip, arch, spline or your own profile',
      'Añade al menos dos puntos al perfil.': 'Add at least two points to the profile.',
      'El modo realista añade texturas, luz solar y sombras en la vista 3D.':
        'Realistic mode adds textures, sunlight and shadows in the 3D view.',
      'Al elegir un estilo se muestra el techo automáticamente. También puedes cambiarlo con el selector':
        'Choosing a style shows the roof automatically. You can also change it with the selector',
      'de la vista 3D.': 'in the 3D view.',
      'Colores y texturas de paredes, techo y suelo. También puedes abrirlos con el botón “Colores y texturas” de la vista 3D.':
        'Colors and textures for walls, roof and ground. You can also open them with the “Colors and textures” button in the 3D view.',
      'La cámara recorre la maqueta en bucle. Un clic sobre la vista 3D detiene el vuelo.':
        'The camera loops around the model. Clicking the 3D view stops the flight.',
      'Materiales, techo y vuelo de dron': 'Materials, roof and drone flight',
      'Escena 3D': '3D scene',
      'Escena': 'Scene',
      'Escena 3D.': '3D scene.',
      'Escena restablecida (materiales, techo y render).': 'Scene reset (materials, roof and render).',
      'Un clic sobre la vista 3D detiene el vuelo.': 'Clicking the 3D view stops the flight.',
      'Estuco': 'Stucco',
      'Ladrillo': 'Brick',
      'Madera': 'Wood',
      'Piedra': 'Stone',
      'Liso': 'Smooth',
      'Teja': 'Roof tile',
      'Tejuela': 'Shingle',
      'Metal': 'Metal',
      'Concreto': 'Concrete',
      'Césped': 'Grass',
      'Adoquín': 'Paving',
      'Grava': 'Gravel',
      'Baldosa': 'Tile',
      'Mármol': 'Marble',

      /* ---------- Propiedades / entidades ---------- */
      'Propiedades': 'Properties',
      'Biblioteca': 'Library',
      'Capas': 'Layers',
      'Proyecto activo': 'Active project',
      'Proyecto completo': 'Whole project',
      'Proyecto sin nombre': 'Untitled project',
      'Proyecto nuevo': 'New project',
      'Nivel activo': 'Active level',
      'Nivel asociado': 'Linked level',
      'Nombre del nivel': 'Level name',
      'Nombre del ambiente': 'Room name',
      'Nombre del proyecto': 'Project name',
      'Planta adicional del proyecto': 'Additional project level',
      'Área de ambientes': 'Room area',
      'Ambientes registrados': 'Registered rooms',
      'Superficie construida': 'Built area',
      'Longitud de muros': 'Wall length',
      'Mobiliario total': 'Total furniture',
      'Láminas del juego': 'Sheets in set',
      'Sugerencias': 'Suggestions',
      'Primeros pasos': 'Getting started',
      'Edición múltiple': 'Multiple editing',
      'Selección': 'Selection',
      'Objeto': 'Object',
      'Mobiliario': 'Furniture',
      'Ambientes': 'Rooms',
      'Anotaciones': 'Annotations',
      'Anotación de plano': 'Plan annotation',
      'Anotación ·': 'Annotation ·',
      'Cotas': 'Dimensions',
      'Dimensiones': 'Dimensions',
      'Geometría': 'Geometry',
      'Posición y giro': 'Position and rotation',
      'Posición (%)': 'Position (%)',
      'Posición': 'Position',
      'Rotación': 'Rotation',
      'Ángulo': 'Angle',
      'Ángulo ortogonal': 'Orthogonal angle',
      'Norte (grados)': 'North (degrees)',
      'Ancho': 'Width',
      'Fondo': 'Depth',
      'Alto': 'Height',
      'Altura': 'Height',
      'Elevación': 'Elevation',
      'Espesor': 'Thickness',
      'Longitud': 'Length',
      'Distancia': 'Distance',
      'Curvatura': 'Curvature',
      'Flecha': 'Rise',
      'Flecha del arco': 'Arc rise',
      'Invertir arco': 'Invert arch',
      'Quitar curva del muro': 'Remove wall curve',
      'Muro convertido en recto.': 'Wall converted to straight.',
      'Muro en arco creado': 'Arched wall created',
      'Muro spline creado': 'Spline wall created',
      'Nombre': 'Name',
      'Nivel': 'Level',
      'Capa': 'Layer',
      'Color': 'Color',
      'Acabado': 'Finish',
      'Acabado en 3D': '3D finish',
      'Superficie': 'Area',
      'Perímetro': 'Perimeter',
      'Código': 'Code',
      'Descripción': 'Description',
      'Teléfono': 'Phone',
      'Correo': 'Email',
      'Fecha': 'Date',
      'Revisión': 'Revision',
      'Ubicación': 'Location',
      'Escala': 'Scale',
      'Formato': 'Format',
      'Tamaño': 'Size',
      'Orientación': 'Orientation',
      'Horizontal': 'Landscape',
      'Vertical': 'Portrait',
      'Identificación': 'Identification',
      'Información para cajetines y portada': 'Information for title blocks and cover',
      'Estos datos alimentan los cajetines de las láminas. Se guardan en el proyecto y también en el autoguardado.':
        'This data feeds the sheet title blocks. It is saved in the project and in the autosave.',
      'Datos del proyecto': 'Project data',
      'Datos del proyecto actualizados.': 'Project data updated.',
      'Guardar datos': 'Save data',
      'Cliente / propietario': 'Client / owner',
      'Ingeniero / arquitecto': 'Engineer / architect',
      'Matrícula / licencia': 'License number',
      'Notas generales del proyecto': 'General project notes',
      'Sin ubicación definida': 'No location set',
      'Editar': 'Edit',
      'Eliminar': 'Delete',
      'Eliminar selección': 'Delete selection',
      'Eliminar abertura': 'Delete opening',
      'Insertar abertura': 'Insert opening',
      'Editar abertura': 'Edit opening',
      'Aberturas': 'Openings',
      'Puerta / ventana': 'Door / window',
      'Antepecho': 'Sill',
      'Girar abertura': 'Rotate opening',
      'Girar hoja': 'Rotate leaf',
      'Invertir bisagra': 'Flip hinge',
      'Bisagra invertida.': 'Hinge flipped.',
      'Sentido de apertura girado.': 'Opening direction rotated.',
      'Este muro no tiene puertas ni ventanas.': 'This wall has no doors or windows.',
      'El muro es demasiado corto para esta abertura.': 'The wall is too short for this opening.',
      'Los muros curvos no admiten puertas ni ventanas en esta versión.':
        'Curved walls do not support doors or windows in this version.',
      'Este proyecto no tiene láminas. Crea una para empezar.': 'This project has no sheets. Create one to start.',
      'Las capas ocultas no se dibujan ni se pueden seleccionar. Las capas bloqueadas permanecen visibles pero protegidas.':
        'Hidden layers are not drawn and cannot be selected. Locked layers stay visible but protected.',
      'La capa Mobiliario está oculta.': 'The Furniture layer is hidden.',
      'Capas del nivel': 'Level layers',
      'Visible': 'Visible',
      'Bloqueado': 'Locked',
      'Mostrar / ocultar': 'Show / hide',
      'Bloquear / desbloquear': 'Lock / unlock',
      'Muros': 'Walls',
      'Buscar muebles, baño, cocina…': 'Search furniture, bathroom, kitchen…',
      'Todos': 'All',
      'Cocina': 'Kitchen',
      'Baño': 'Bathroom',
      'Dormitorio': 'Bedroom',
      'Exterior': 'Outdoor',
      'Plantas': 'Plants',
      'Jardines': 'Gardens',
      'Vías y accesos': 'Roads and access',
      'Mis objetos': 'My objects',
      'Importar objeto': 'Import object',
      'Haz clic dentro de un recinto cerrado por muros.': 'Click inside an area enclosed by walls.',
      'Haz clic en un muro para ajustar espesor, altura y aberturas.': 'Click a wall to adjust thickness, height and openings.',
      'Mueble:': 'Furniture:',
      'Mueble duplicado.': 'Furniture duplicated.',
      'Ambiente creado. Edita su nombre y acabado en Propiedades.':
        'Room created. Edit its name and finish in Properties.',
      'No hay recintos nuevos.': 'No new areas.',
      'No se encontraron recintos nuevos. Cierra los muros y vuelve a intentar.':
        'No new areas were found. Close the walls and try again.',
      'El plano es demasiado pequeño para acotarlo.': 'The plan is too small to dimension.',
      'Las cotas generales ya existen.': 'Overall dimensions already exist.',
      'Dibuja muros antes de generar cotas.': 'Draw walls before generating dimensions.',
      'Objeto(s) eliminado(s). Puedes deshacer con Ctrl+Z.': 'Object(s) deleted. You can undo with Ctrl+Z.',
      'Historial actualizado': 'History updated',
      'Mueble colocado · sigue haciendo clic o pulsa Esc': 'Furniture placed · keep clicking or press Esc',
      'Muro creado · clic para el siguiente tramo · Esc para terminar':
        'Wall created · click for the next segment · Esc to finish',

      /* ---------- Teclear / editar / guardar ---------- */
      'Aceptar': 'OK',
      'Aplicar': 'Apply',
      'Aplicar rejilla': 'Apply grid',
      'Guardar': 'Save',
      'Guardar proyecto': 'Save project',
      'Cancelar': 'Cancel',
      'Cerrar': 'Close',
      'Duplicar': 'Duplicate',
      'Añadir': 'Add',
      'Quitar': 'Remove',
      'Importar': 'Import',
      'Exportar': 'Export',

      /* ---------- Láminas ---------- */
      'Hojas de título listas para imprimir en PDF. Selecciona una lámina para configurarla.':
        'Title sheets ready to print to PDF. Select a sheet to configure it.',
      'Nueva lámina': 'New sheet',
      'Exportar PDF': 'Export PDF',
      'Lámina': 'Sheet',
      'Nombre de la lámina': 'Sheet name',
      'Título en el cajetín': 'Title block title',
      'Plantilla de cajetín': 'Title block template',
      'Notas de la lámina': 'Sheet notes',
      'Notas que aparecerán en la hoja...': 'Notes that will appear on the sheet...',
      'Nombres y áreas de ambientes': 'Room names and areas',
      'Notas y cuadros': 'Notes and tables',
      'Portada': 'Cover',
      'Notas': 'Notes',
      'Vista previa': 'Preview',
      'Vista previa no disponible': 'Preview not available',
      'Preview de lámina:': 'Sheet preview:',
      'Reordenar láminas': 'Reorder sheets',
      'Editar lámina': 'Edit sheet',
      'Eliminar lámina': 'Delete sheet',
      'Duplicar lámina': 'Duplicate sheet',
      'Lámina duplicada.': 'Sheet duplicated.',
      'Lámina eliminada. Puedes deshacer con Ctrl+Z.': 'Sheet deleted. You can undo with Ctrl+Z.',
      'El proyecto debe conservar al menos una lámina.': 'The project must keep at least one sheet.',
      'Crea al menos una lámina antes de exportar.': 'Create at least one sheet before exporting.',
      'Selecciona una lámina de la galería o crea una nueva.': 'Select a sheet from the gallery or create a new one.',
      'Esta lámina ya tiene una captura 3D.': 'This sheet already has a 3D capture.',
      'Moderna': 'Modern',
      'Clásica': 'Classic',
      'Técnica': 'Technical',
      'Municipal': 'Municipal',
      'Banda inferior oscura con retícula y acento ámbar': 'Dark bottom band with grid and amber accent',
      'Cajetín inferior con doble borde y celdas': 'Bottom title block with double border and cells',
      'Bloque lateral con retícula y tipografía monoespaciada': 'Side block with grid and monospaced type',
      'Bloque ancho inferior con casillas de revisión y firmas':
        'Wide bottom block with revision and signature boxes',
      'Generando PDF vectorial de': 'Generating vector PDF of',
      'PDF exportado:': 'PDF exported:',
      'El PDF no se pudo generar.': 'The PDF could not be generated.',
      'Error al generar el PDF.': 'Error generating the PDF.',
      'Error al generar el PDF:': 'Error generating the PDF:',
      'Módulo de PDF no disponible.': 'PDF module not available.',
      'El módulo de láminas no está disponible.': 'The sheets module is not available.',

      /* ---------- Modales: proyecto, plantillas, DXF ---------- */
      'Crear proyecto': 'Create project',
      'Elige una plantilla para empezar': 'Choose a template to start',
      'Plano en blanco': 'Blank plan',
      'Proyecto vacío.': 'Empty project.',
      'Residencia demo': 'Demo residence',
      'Proyecto de ejemplo.': 'Sample project.',
      'Proyecto creado:': 'Project created:',
      'Proyecto abierto:': 'Project opened:',
      'Proyecto descargado como .engdraft': 'Project downloaded as .engdraft',
      'No se pudo descargar el proyecto.': 'Could not download the project.',
      'No se pudo abrir:': 'Could not open:',
      'No se pudo leer el archivo.': 'Could not read the file.',
      'No se pudo crear el proyecto:': 'Could not create the project:',
      'No se pudo crear la demo:': 'Could not create the demo:',
      'Autoguardado inválido, se carga la demo.': 'Invalid autosave, loading the demo.',
      'Sesión restaurada desde este navegador.': 'Session restored from this browser.',
      'El proyecto actual se conserva en el autoguardado del navegador. Si quieres conservarlo también como archivo, descárgalo antes de continuar.':
        'The current project is kept in the browser autosave. If you also want it as a file, download it before continuing.',
      'Guardado automático en el navegador. Descarga el archivo .engdraft para conservar copias.':
        'Autosave in the browser. Download the .engdraft file to keep copies.',
      'El proyecto actual': 'The current project',
      'Exportar DWG / DXF': 'Export DWG / DXF',
      'Exportar DXF': 'Export DXF',
      'Planos editables para AutoCAD': 'Editable plans for AutoCAD',
      'Niveles a exportar': 'Levels to export',
      'DXF ASCII R12': 'DXF ASCII R12',
      'Todos los niveles, uno al lado del otro': 'All levels, side by side',
      'DXF exportado. Ábrelo en AutoCAD y guarda como DWG.':
        'DXF exported. Open it in AutoCAD and save as DWG.',
      'Error al exportar DXF.': 'Error exporting DXF.',
      'Guardar como → DWG': 'Save as → DWG',
      'si necesitas ese formato.': 'if you need that format.',
      'en milímetros, compatible con AutoCAD, LibreCAD, BricsCAD y otros programas CAD. AutoCAD puede guardarlo como':
        'in millimeters, compatible with AutoCAD, LibreCAD, BricsCAD and other CAD programs. AutoCAD can save it as',
      'El navegador no puede escribir el formato binario propietario': 'The browser cannot write the proprietary binary format',
      'El DXF es el formato de intercambio estándar de AutoCAD y conserva muros, aberturas, mobiliario y capas.':
        'DXF is AutoCAD\'s standard exchange format and keeps walls, openings, furniture and layers.',
      'Se generará un archivo': 'A file will be generated',
      'nativo.': 'native.',

      /* ---------- Rejilla / ajuste ---------- */
      'Rejilla y ajuste': 'Grid and snap',
      'Rejilla actualizada:': 'Grid updated:',
      'Rejilla a medida.': 'Custom grid.',
      'Rejilla:': 'Grid:',
      'Separación de la rejilla': 'Grid spacing',
      'Separación de rejilla': 'Grid spacing',
      'Separa las líneas y define el paso de dibujo para medidas exactas':
        'Separate the lines and set the drawing step for exact measurements',
      'Línea base de la cuadrícula. Si no defines un paso distinto, también es el paso de ajuste al dibujar.':
        'Grid base line. If you do not set a different step, it is also the snap step when drawing.',
      'Línea maestra cada': 'Major line every',
      'El cursor se ajusta a este paso aunque la rejilla se dibuje con la separación anterior. Sirve para muros y huecos de medidas exactas.':
        'The cursor snaps to this step even if the grid uses the previous spacing. Useful for walls and openings with exact measurements.',
      'Estilo': 'Style',
      'Líneas': 'Lines',
      'Puntos': 'Dots',
      'Usar un paso de ajuste distinto (dimensiones exactas)': 'Use a different snap step (exact dimensions)',
      'Rejilla adaptativa al zoom': 'Zoom-adaptive grid',
      'Mostrar los ejes del origen': 'Show origin axes',
      'Origen X': 'Origin X',
      'Origen Y': 'Origin Y',
      'Al alejar la vista, las líneas se agrupan para no saturar el plano.':
        'When zooming out, lines are grouped so the plan stays clear.',
      'La rejilla y el paso de ajuste se guardan en el proyecto. Con': 'The grid and snap step are saved in the project. With',

      /* ---------- Editor 2D: barra de estado ---------- */
      'Clic para fijar el siguiente punto · Esc para terminar': 'Click to set the next point · Esc to finish',
      'Clic para iniciar un muro · Esc para salir': 'Click to start a wall · Esc to exit',
      'Muro en arco: clic en el inicio del arco': 'Arched wall: click the start of the arch',
      'Clic en el final del arco · Esc cancela': 'Click the end of the arch · Esc cancels',
      'Mueve el cursor para dar curvatura y haz clic para fijar el arco · Esc cancela':
        'Move the cursor to set the curvature and click to fix the arch · Esc cancels',
      'Clic para añadir puntos de la spline (mín. 2) · Enter o doble clic para terminar · Esc cancela':
        'Click to add spline points (min. 2) · Enter or double-click to finish · Esc cancels',
      'Muro spline: clic en el inicio': 'Spline wall: click the start',
      'Clic sobre un muro para insertar una puerta': 'Click a wall to insert a door',
      'Clic sobre un muro para insertar una ventana': 'Click a wall to insert a window',
      'Clic para colocar · R para rotar · Esc para salir': 'Click to place · R to rotate · Esc to exit',
      'Clic dentro de un recinto cerrado para crear un ambiente':
        'Click inside an enclosed area to create a room',
      'Clic para ubicar el texto': 'Click to place the text',
      'Clic en el segundo punto de la cota': 'Click the second dimension point',
      'Clic en el primer punto de la cota': 'Click the first dimension point',
      'Clic sobre el objeto que deseas eliminar': 'Click the object you want to delete',
      'Arrastra para desplazar la vista': 'Drag to pan the view',
      'Selecciona un objeto · arrastra para mover · doble clic en un muro para editarlo':
        'Select an object · drag to move · double-click a wall to edit it',

      /* ---------- Ayuda: atajos ---------- */
      'Mover vista': 'Pan view',
      'Muro en arco / spline': 'Arched / spline wall',
      'Terminar / salir': 'Finish / exit',
      'Navegación': 'Navigation',
      'Atajos de dibujo': 'Drawing shortcuts',
      'Duplicar mueble': 'Duplicate furniture',
      'Ajustar vista': 'Fit view',
      'Rotar mueble': 'Rotate furniture',
      'Configurar rejilla': 'Configure grid',

      /* ---------- Ayuda: textos ---------- */
      'Flujo recomendado.': 'Recommended workflow.',
      'Dibuja el perímetro con la herramienta Muro, inserta puertas y ventanas sobre los muros, y pulsa':
        'Draw the perimeter with the Wall tool, insert doors and windows on the walls, and press',
      'para etiquetar los recintos. Amuebla desde la biblioteca y comprueba el resultado en 3D.':
        'to label the rooms. Furnish from the library and check the result in 3D.',
      'Láminas y PDF.': 'Sheets and PDF.',
      'En la vista Láminas puedes escoger tamaño, orientación, escala y uno de los cuatro cajetines. El PDF se genera vectorial, con el plano nítido a cualquier zoom.':
        'In the Sheets view you can choose size, orientation, scale and one of the four title blocks. The PDF is generated as vectors, with the plan crisp at any zoom.',
      'DWG/DXF.': 'DWG/DXF.',
      'El navegador no escribe el formato binario propietario DWG; EngDraft exporta DXF R12, el formato de intercambio de AutoCAD. Abre el DXF en AutoCAD y usa':
        'The browser does not write the proprietary binary DWG format; EngDraft exports DXF R12, AutoCAD\'s exchange format. Open the DXF in AutoCAD and use',
      'Unidades.': 'Units.',
      'El botón del sistema de unidades en la barra de estado alterna entre métrico (m · m²) e imperial (ft · ft²). También puedes cambiarlo en Datos del proyecto. Las cotas, áreas, propiedades y láminas se actualizan.':
        'The unit system button switches between metric (m · m²) and imperial (ft · ft²). You can also change it in Project data. Dimensions, areas, properties and sheets update.',
      'Con': 'With',
      'o el botón': 'or the button',
      'del lienzo abres el cuadro de rejilla: separación de líneas, línea maestra, origen y un paso de ajuste independiente. Un paso fino (por ejemplo 5 cm o 1") permite dibujar muros y huecos con dimensiones exactas sin perder la referencia visual.':
        'on the canvas opens the grid dialog: line spacing, major line, origin and an independent snap step. A fine step (for example 5 cm or 1") lets you draw walls and openings with exact dimensions without losing the visual reference.',
      'Tamaño de letra.': 'Font size.',
      'El botón': 'The button',
      'de la barra de estado cambia el tamaño del texto entre Normal, Grande y Muy grande; la preferencia queda guardada en este navegador.':
        'in the status bar changes the text size between Normal, Large and Very large; the preference is saved in this browser.',
      'Muros curvos.': 'Curved walls.',
      'Con las herramientas': 'With the tools',
      'dibujas muros curvos: en el arco, el tercer clic define la curvatura; en la spline, cada clic añade un punto y Enter o doble clic termina. Selecciona un muro curvo para ajustar su flecha, invertir el arco o quitar la curva desde Propiedades. Los muros curvos no admiten puertas ni ventanas en esta versión.':
        'you draw curved walls: for the arch, the third click sets the curvature; for the spline, each click adds a point and Enter or double-click finishes. Select a curved wall to adjust its rise, invert the arch or remove the curve in Properties. Curved walls do not support doors or windows in this version.',
      'En la pestaña': 'In the',
      'del panel de ajustes eliges el modo de renderizado (esquemático o realista), el tipo de techo (plano, a dos aguas, arco o spline), su altura y alero, los colores y texturas de paredes, techo y suelo, y el ángulo del sol. Arriba a la izquierda de la vista 3D tienes además los selectores rápidos':
        'tab of the settings panel you choose the render mode (schematic or realistic), the roof type (flat, gable, arch or spline), its height and overhang, the colors and textures of walls, roof and ground, and the sun angle. At the top left of the 3D view there are also the quick selectors',
      'que abre directamente los materiales. El botón': 'which opens the materials directly. The button',
      'inicia una animación de cámara alrededor de la maqueta; un clic en la vista la detiene.':
        'starts a camera animation around the model; clicking the view stops it.',
      'Puertas y ventanas.': 'Doors and windows.',
      'Selecciona un muro y edita sus aberturas: ancho, alto, posición, antepecho, sentido de apertura y bisagra. Los botones Girar hoja e Invertir bisagra cambian el dibujo en 2D y 3D.':
        'Select a wall and edit its openings: width, height, position, sill, opening direction and hinge. The Rotate leaf and Flip hinge buttons change the 2D and 3D drawing.',
      'Privacidad.': 'Privacy.',
      'Todo se dibuja y se guarda en tu equipo. La aplicación funciona sin conexión y no envía datos a ningún servidor.':
        'Everything is drawn and saved on your device. The app works offline and sends no data to any server.',
      'Manual completo.': 'Full manual.',
      'El manual de uso incluye tutorial paso a paso, buenas prácticas, ejercicios, preguntas frecuentes y checklist de entrega:':
        'The user manual includes a step-by-step tutorial, best practices, exercises, FAQs and a delivery checklist:',
      'abrir manual en PDF': 'open manual as PDF',
      'Autor:': 'Author:',
      'Todo lo necesario para empezar': 'Everything you need to start',
      'Manual PDF': 'PDF manual',
      'Usa': 'Use',
      'para acotar el perímetro.': 'to dimension the perimeter.',
      'Revisa la': 'Check the',
      'y captura una imagen para tus láminas.': 'and capture an image for your sheets.',
      'Exporta el juego de planos a PDF vectorial desde la barra superior.':
        'Export the plan set to vector PDF from the top bar.',
      'para etiquetarlos con su área.': 'to label them with their area.',
      'y revisa la vista 3D.': 'and check the 3D view.',
      'y dibuja el perímetro con clics. Pulsa Esc para terminar.':
        'and draw the perimeter with clicks. Press Esc to finish.',
      'Amuebla desde la': 'Furnish from the',
      'Cierra los recintos y usa': 'Close the areas and use',
      'elige un mueble, mueve el cursor sobre el plano y haz clic. Pulsa':
        'pick a piece of furniture, move the cursor over the plan and click. Press',

      /* ---------- Biblioteca: nombres de objetos ---------- */
      'Sofá 3 puestos': '3-seat sofa',
      'Sofá 2 puestos': '2-seat sofa',
      'Sillón': 'Armchair',
      'Mesa de centro': 'Coffee table',
      'Mesa de comedor 6': '6-seat dining table',
      'Mesa de comedor 4': '4-seat dining table',
      'Silla': 'Chair',
      'Mueble de TV': 'TV stand',
      'Televisor': 'Television',
      'Escritorio': 'Desk',
      'Estantería': 'Bookshelf',
      'Alfombra': 'Rug',
      'Aparador': 'Sideboard',
      'Consola': 'Console table',
      'Mesón de cocina': 'Kitchen counter',
      'Isla de cocina': 'Kitchen island',
      'Estufa': 'Stove',
      'Fregadero': 'Sink',
      'Refrigerador': 'Refrigerator',
      'Microondas': 'Microwave',
      'Alacena': 'Cupboard',
      'Inodoro': 'Toilet',
      'Lavamanos': 'Washbasin',
      'Ducha': 'Shower',
      'Bañera': 'Bathtub',
      'Lavadora': 'Washing machine',
      'Toallero': 'Towel rack',
      'Cama 1 plaza': 'Single bed',
      'Cama 2 plazas': 'Double bed',
      'Cama queen': 'Queen bed',
      'Cama king': 'King bed',
      'Cuna': 'Crib',
      'Mesa de noche': 'Nightstand',
      'Ropero': 'Wardrobe',
      'Cómoda': 'Dresser',
      'Columna': 'Column',
      'Escalera': 'Stairs',
      'Maceta': 'Pot',
      'Vehículo': 'Vehicle',
      'Mesa exterior': 'Outdoor table',
      'Parrilla': 'Grill',
      'Palmera': 'Palm tree',
      'Árbol': 'Tree',
      'Arbusto': 'Shrub',
      'Seto': 'Hedge',
      'Macizo floral': 'Flower bed',
      'Planta ornamental': 'Ornamental plant',
      'Jardinera': 'Planter',
      'Sendero de jardín': 'Garden path',
      'Fuente': 'Fountain',
      'Rocalla': 'Rock garden',
      'Carretera recta': 'Straight road',
      'Entrada recta': 'Straight driveway',
      'Acera': 'Sidewalk',
      'Estacionamiento': 'Parking lot',
      'Carretera en curva': 'Curved road',
      'Entrada en curva': 'Curved driveway',

      /* ---------- Unidades / formatos de números ---------- */
      'cm': 'cm',
      'mm': 'mm',
      'm': 'm',
      'ft': 'ft',
      'in': 'in',
      'm²': 'm²',
      'ft²': 'ft²',
      'Lámina copia': 'Sheet copy',

      /* ---------- Ampliación 1.4: vistas, techos, importación ---------- */
      'Añadir nivel': 'Add level',
      'Insertar texto': 'Insert text',
      'Insertar puerta': 'Insert door',
      'Insertar ventana': 'Insert window',
      'Crear muro': 'Create wall',
      'Crear muro en arco': 'Create arched wall',
      'Crear muro spline': 'Create spline wall',
      'Crear cota': 'Create dimension',
      'Crear ambiente': 'Create room',
      'Generar cotas generales': 'Generate overall dimensions',
      'Colocar mobiliario': 'Place furniture',
      'Eliminar objeto': 'Delete object',
      'Duplicar mobiliario': 'Duplicate furniture',
      'Acciones': 'Actions',
      'Activa': 'Active',
      'Datos': 'Data',
      'Altura de muro por defecto': 'Default wall height',
      'Espesor de muro por defecto': 'Default wall thickness',
      'Altura libre': 'Clear height',
      'Cuerda': 'Chord',
      'Directriz': 'Guideline',
      'Arco · flecha': 'Arch · rise',
      'Arco de': 'Arch of',
      'Arco invertido.': 'Arch inverted.',
      'Automático': 'Automatic',
      'Cambiar el lado de la bisagra': 'Change hinge side',
      'Cambiar el lado hacia el que abre la hoja': 'Change the side the leaf opens to',
      'Captura 3D a lámina': '3D capture to sheet',
      'Colores de paredes y techo': 'Wall and roof colors',
      'Cómo colocar:': 'How to place:',
      'El muro está en una capa bloqueada.': 'The wall is on a locked layer.',
      'La capa Mobiliario está bloqueada.': 'The Furniture layer is locked.',
      'El texto se colocará en X': 'The text will be placed at X',
      'Este ambiente ya está registrado.': 'This room is already registered.',
      'Escribe un texto.': 'Type a text.',
      'Texto de la anotación': 'Annotation text',
      'Acerca el cursor a un muro para insertar la abertura.':
        'Move the cursor near a wall to insert the opening.',
      'Un muro curvo no admite puertas ni ventanas en esta versión.':
        'A curved wall does not support doors or windows in this version.',
      'haciendo clic sobre un muro.': 'by clicking on a wall.',
      'puertas y ventanas': 'doors and windows',
      'Inserta': 'Insert',
      'para rotar 90° y': 'to rotate 90° and',
      'para salir.': 'to exit.',
      'desde la vista 3D.': 'from the 3D view.',
      'Esta lámina 3D aún no tiene imagen. Usa': 'This 3D sheet has no image yet. Use',
      'El color y la textura de paredes, techo y suelo se definen para todo el proyecto en la escena 3D.':
        'Wall, roof and ground colors and textures are defined for the whole project in the 3D scene.',
      'El nivel se apila automáticamente en la vista 3D según su elevación.':
        'The level is stacked automatically in the 3D view according to its elevation.',
      'Elige el color y la textura de paredes, techo y suelo.':
        'Choose the color and texture for walls, roof and ground.',
      'Mostrar todas': 'Show all',
      'Tamaño de letra:': 'Font size:',
      'Biblioteca no disponible.': 'Library unavailable.',
      'Biblioteca de mobiliario no disponible.': 'Furniture library unavailable.',
      'Iluminación': 'Lighting',
      'Inicio': 'Start',
      'Fin': 'End',
      '↑ Subir': '↑ Up',
      '↓ Bajar': '↓ Down',
      'DWG/DXF': 'DWG/DXF',
      'Muro en arco creado · ajusta la curvatura en Propiedades o pulsa Esc':
        'Arched wall created · adjust the curvature in Properties or press Esc',
      'Muro spline creado · ajusta la curvatura en Propiedades o pulsa Esc':
        'Spline wall created · adjust the curvature in Properties or press Esc',
      '· arco': '· arch',
      '· spline': '· spline',
      '· paso': '· step',
      '· ajuste': '· snap',
      '· ajuste a la rejilla': '· snap to grid',
      '· adaptativa': '· adaptive',
      '· línea maestra cada': '· major line every',
      '· maestra cada': '· major line every',
      '· origen:': '· origin:',
      '· ajuste:': '· snap:',
      'igual a la rejilla': 'same as grid',
      'puntos': 'dots',
      'líneas': 'lines',
      '· clic para colocar · R para rotar': '· click to place · R to rotate',
      '· haz clic en el plano para colocar · R para rotar': '· click on the plan to place · R to rotate',
      '· ajusta la curvatura en Propiedades o pulsa Esc': '· adjust the curvature in Properties or press Esc',

      /* ---------- Importación de objetos (.glb / .obj) ---------- */
      'Importar objeto o mueble': 'Import object or furniture',
      'Importar objeto (.glb / .obj)': 'Import object (.glb / .obj)',
      'Añade tus propios modelos 3D a la biblioteca del proyecto':
        'Add your own 3D models to the project library',
      'Archivo 3D del mueble o accesorio': 'Furniture or accessory 3D file',
      'Elegir archivo .glb o .obj': 'Choose a .glb or .obj file',
      'o arrástralo aquí': 'or drag it here',
      'Formato recomendado: GLB': 'Recommended format: GLB',
      ' (glTF binario): un único archivo, estándar web, con materiales y colores. También se acepta ':
        ' (binary glTF): a single web-standard file with materials and colors. Also supports ',
      ' (sin texturas). Evita FBX/3DS/STL: no se importan en esta versión.':
        ' (no textures). Avoid FBX/3DS/STL: they are not imported in this version.',
      'Nombre del objeto': 'Object name',
      'Mi mueble': 'My furniture',
      'Mi objeto': 'My object',
      'Hecho en casa': 'Custom model',
      'Objeto importado': 'Imported object',
      'Leyendo archivo…': 'Reading file…',
      'no se pudo leer el archivo': 'could not read the file',
      'triángulos': 'triangles',
      'vértices': 'vertices',
      'Camioneta SUV': 'SUV',
      'Farola de calle': 'Street lamp',
      'Lámpara colgante': 'Pendant lamp',
      'Lámpara de jardín': 'Garden lamp',

      /* ---------- Cadenas de estado y acciones restantes ---------- */
      'Residencia Aurora cargada. Explora el plano 2D, la vista 3D y las láminas.':
        'Residencia Aurora loaded. Explore the 2D plan, the 3D view and the sheets.',
      'archivo inválido': 'invalid file',
      'Error:': 'Error:',
      'objetos seleccionados': 'objects selected',
      'lámina': 'sheet',
      'Área': 'Area',
      'Separación': 'Spacing',
      'Paso': 'Step',
      'Portón': 'Garage door',
      'Quitar curva': 'Remove curve',
      'PDF de esta lámina': 'PDF of this sheet',
      'Mover objeto': 'Move object',
      'Rotar objeto': 'Rotate object',
      'Rotar mobiliario': 'Rotate furniture',
      'Muro terminado': 'Wall finished',
      'Objeto actualizado': 'Object updated',
      'Objeto eliminado': 'Object deleted',
      'Puerta insertada': 'Door inserted',
      'Puerta insertada.': 'Door inserted.',
      'Ventana insertada': 'Window inserted',
      'Ventana insertada.': 'Window inserted.',
      'Texto insertado.': 'Text inserted.',
      'No hay ningún objeto en ese punto.': 'There is no object at that point.',
      'No se encontró un recinto cerrado en ese punto. Cierra los muros primero.':
        'No enclosed area was found at that point. Close the walls first.',
      'Módulo de idioma no disponible.': 'Language module unavailable.',
      'Módulo de importación no disponible.': 'Import module unavailable.',
      'Mostrar el menú de opciones': 'Show options menu',
      'Ocultar el menú de opciones': 'Hide options menu',
      'Tamaño de letra de la interfaz:': 'Interface font size:',
      'Techo:': 'Roof:',
      'Techo aplicado:': 'Roof applied:',
      'Textura de': 'Texture of',
      'Sin resultados para “': 'No results for “',
      'listo para colocar.': 'ready to place.',
      'para editar y guardar tu forma.': 'to edit and save your shape.',
      'página': 'page',
      'DWG/DXF.': 'DWG/DXF.',
      'DXF ASCII R12': 'DXF ASCII R12',
      'Idioma: Español': 'Idioma: Español',
      'Language: English': 'Language: English',
      'Arrastra los puntos para diseñar el perfil · doble clic añade un punto · clic derecho quita el punto. Con los presets el perfil es una referencia; elige':
        'Drag the points to design the profile · double-click adds a point · right-click removes the point. With presets the profile is a reference; choose',
      'Perfil de referencia · elige "Mi diseño" para editarlo':
        'Reference profile · choose "My design" to edit it'
    }
  };

  /* ======================================================================
     Patrones para cadenas dinámicas (números, medidas, estados)
     ====================================================================== */
  function lowerFirst(s) {
    return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  }
  function tr(text) {
    var out = lookup(text);
    return out == null ? text : out;
  }

  var PATTERNS = [
    /* Zoom / coordenadas / medidas (se conservan, pero quedan cubiertas) */
    [/^Zoom (\d+)%$/, function (m) { return 'Zoom ' + m[1] + '%'; }],
    [/^X: (.+?)\s{2,}Y: (.+)$/, function (m) { return 'X: ' + m[1] + '   Y: ' + m[2]; }],
    [/^(\d+(?:[.,]\d+)?) (m²|ft²|cm|mm|m|ft|in|km)$/, function (m) { return m[1] + ' ' + m[2]; }],
    /* Contadores de la interfaz */
    [/^(\d+) ambiente\(s\) detectado\(s\)\.$/, function (m) { return m[1] + ' room(s) detected.'; }],
    [/^(\d+) objetos seleccionados$/, function (m) { return m[1] + ' objects selected'; }],
    [/^(\d+) ambientes$/, function (m) { return m[1] + ' rooms'; }],
    [/^(\d+) ambiente$/, function (m) { return m[1] + ' room'; }],
    [/^(\d+) objetos$/, function (m) { return m[1] + ' objects'; }],
    [/^(\d+) láminas$/, function (m) { return m[1] + ' sheets'; }],
    [/^(\d+) líneas$/, function (m) { return m[1] + ' lines'; }],
    [/^Objeto\(s\) eliminado\(s\)\. Puedes deshacer con Ctrl\+Z\.$/,
      function () { return 'Object(s) deleted. You can undo with Ctrl+Z.'; }],
    /* Estados dinámicos con prefijo/sufijo textual */
    /* Tooltip completo de la rejilla (antes que el patrón genérico "Rejilla: ") */
    [/^Rejilla: (.+) · línea maestra cada (\d+) · ajuste: (.+) · origen: (.+), (.+) · (puntos|líneas)( · adaptativa)?( · Clic para configurar \(Shift\+G\))?$/,
      function (m) {
        return 'Grid: ' + m[1] +
          ' · major line every ' + m[2] +
          ' · snap: ' + (m[3] === 'igual a la rejilla' ? 'same as grid' : m[3]) +
          ' · origin: ' + m[4] + ', ' + m[5] +
          ' · ' + (m[6] === 'puntos' ? 'dots' : 'lines') +
          (m[7] ? ' · adaptive' : '') +
          (m[8] ? ' · Click to configure (Shift+G)' : '');
      }],
    [/^Rejilla actualizada: (.+)$/, function (m) { return 'Grid updated: ' + m[1]; }],
    [/^Rejilla: (.+)$/, function (m) { return 'Grid: ' + m[1]; }],
    [/^Rejilla (\d.*)$/, function (m) { return 'Grid ' + m[1]; }],
    [/^Techo: (.+)\.$/, function (m) { return 'Roof: ' + tr(m[1]) + '.'; }],
    [/^Modo de pantalla: (.+)\.$/, function (m) { return 'Screen mode: ' + tr(m[1]) + '.'; }],
    [/^Nivel “(.+)” añadido\.$/, function (m) { return 'Level “' + m[1] + '” added.'; }],
    [/^Nivel (.+)$/, function (m) { return 'Level ' + m[1]; }],
    [/^Lámina (.+) creada\.$/, function (m) { return 'Sheet ' + m[1] + ' created.'; }],
    [/^Captura 3D añadida a la lámina ?(.*)$/, function (m) { return '3D capture added to sheet ' + m[1]; }],
    [/^Lámina (\S+)$/, function (m) { return 'Sheet ' + m[1]; }],
    [/^Proyecto creado: (.+)$/, function (m) { return 'Project created: ' + m[1]; }],
    [/^Proyecto abierto: (.+)$/, function (m) { return 'Project opened: ' + m[1]; }],
    [/^Proyecto sin nombre$/, function () { return 'Untitled project'; }],
    [/^PDF exportado: (.+)$/, function (m) { return 'PDF exported: ' + m[1]; }],
    [/^Generando PDF vectorial de (.+)…$/, function (m) { return 'Generating vector PDF of ' + m[1] + '…'; }],
    [/^Mueble: (.+) · clic para colocar · R para rotar$/,
      function (m) { return 'Furniture: ' + tr(m[1]) + ' · click to place · R to rotate'; }],
    [/^(.+) · haz clic en el plano para colocar · R para rotar$/,
      function (m) { return tr(m[1]) + ' · click on the plan to place · R to rotate'; }],
    [/^(.+) · clic para colocar · R para rotar$/, function (m) { return tr(m[1]) + ' · click to place · R to rotate'; }],
    [/^Tamaño de letra de la interfaz: (.+) \(clic para cambiar\)$/,
      function (m) { return 'Interface font size: ' + tr(m[1]) + ' (click to change)'; }],
    [/^Tamaño de letra: (.+)$/, function (m) { return 'Font size: ' + tr(m[1]); }],
    [/^Solo el nivel activo \((.+)\)$/, function (m) { return 'Active level only (' + tr(m[1]) + ')'; }],
    [/^Color de (.+)$/, function (m) { return 'Color of ' + lowerFirst(tr(m[1])); }],
    [/^Textura de (.+)$/, function (m) { return 'Texture of ' + lowerFirst(tr(m[1])); }],
    [/^Fecha: (.+)$/, function (m) { return 'Date: ' + m[1]; }],
    [/^(.*) activado$/, function (m) { return tr(m[1]) + ' on'; }],
    [/^(.*) desactivado$/, function (m) { return tr(m[1]) + ' off'; }],
    [/^(.*) copia$/, function (m) { return tr(m[1]) + ' copy'; }],
    [/^(\d+) seleccionados$/, function (m) { return m[1] + ' selected'; }],
    [/^(\d+) seleccionado$/, function (m) { return m[1] + ' selected'; }],
    [/^Faltan (\d+) puntos$/, function (m) { return 'Missing ' + m[1] + ' points'; }],
    [/^(\d+) triángulos$/, function (m) { return m[1] + ' triangles'; }],
    [/^(\d+) vértices$/, function (m) { return m[1] + ' vertices'; }],
    [/^Objeto «(.+)» importado\. Está en Biblioteca → Mis objetos\.$/,
      function (m) { return 'Object «' + m[1] + '» imported. It is in Library → My objects.'; }],
    /* Estados y mensajes con texto variable al final */
    [/^Techo aplicado: (.+)\.$/, function (m) { return 'Roof applied: ' + tr(m[1]) + '.'; }],
    [/^(.+) listo para colocar\.$/, function (m) { return tr(m[1]) + ' ready to place.'; }],
    [/^Sin resultados para “(.+)”\.$/, function (m) { return 'No results for “' + m[1] + '”.'; }],
    [/^Arco · flecha (.+)$/, function (m) { return 'Arch · rise ' + m[1]; }],
    [/^Spline · (\d+) punto\(s\) de control$/, function (m) { return 'Spline · ' + m[1] + ' control point(s)'; }],
    [/^Mover · (.+)$/, function (m) { return 'Move · ' + m[1]; }],
    [/^(.+) punto\(s\) de control$/, function (m) { return m[1] + ' control point(s)'; }]
  ];

  /* ======================================================================
     Motor
     ====================================================================== */
  var I18n = {
    current: 'es',
    dict: DICT,
    patterns: PATTERNS
  };

  function normalizeLang(lang) {
    var v = String(lang == null ? '' : lang).toLowerCase();
    if (v === 'en' || v.indexOf('en-') === 0 || v.indexOf('en_') === 0) return 'en';
    return 'es';
  }

  function lookup(text) {
    if (!text) return null;
    var table = DICT.en;
    if (Object.prototype.hasOwnProperty.call(table, text)) return table[text];
    for (var i = 0; i < PATTERNS.length; i++) {
      var m = text.match(PATTERNS[i][0]);
      if (m) return PATTERNS[i][1](m);
    }
    return null;
  }

  /** Sustituye {0}, {1}… y luego %s en una cadena. */
  function format(text, args) {
    if (!args || !args.length) return text;
    var out = text;
    for (var i = 0; i < args.length; i++) {
      out = out.split('{' + i + '}').join(String(args[i]));
    }
    var idx = 0;
    out = out.replace(/%s/g, function () {
      return idx < args.length ? String(args[idx++]) : '%s';
    });
    return out;
  }

  function translateText(text) {
    var trimmed = String(text).replace(/^\s+|\s+$/g, '');
    if (!trimmed) return null;
    if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(trimmed)) return null;
    return lookup(trimmed);
  }

  /**
   * t(textoEspañol|clave, ...args)
   * Devuelve la traducción al idioma activo; si no existe, el texto original.
   */
  I18n.t = function (text) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (typeof text !== 'string') return text;
    var out = text;
    if (I18n.current === 'en') {
      var found = lookup(text);
      if (found == null) found = lookup(text.replace(/^\s+|\s+$/g, ''));
      if (found != null) out = found;
    }
    return format(out, args);
  };

  /* ---------------- apply(): traduce el DOM real ---------------- */
  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1, SVG: 1,
    PATH: 1, CIRCLE: 1, RECT: 1, LINE: 1, POLYGON: 1
  };
  var ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  var textOriginals = typeof WeakMap === 'function' ? new WeakMap() : null;
  var attrOriginals = typeof WeakMap === 'function' ? new WeakMap() : null;
  var applying = false;

  function hasDom() {
    return typeof document !== 'undefined' && document && document.documentElement;
  }

  function ignorable(el) {
    if (!el || !el.getAttribute) return true;
    if (el.hasAttribute && el.hasAttribute('data-i18n-ignore')) return true;
    var cls = el.getAttribute('class') || '';
    if (/(^|\s)(no-i18n|lang-opt)(\s|$)/.test(cls)) return true;
    return false;
  }

  function setNodeText(node, raw, value) {
    var lead = raw.match(/^\s*/)[0];
    var trail = raw.match(/\s*$/)[0];
    var next = lead + value + trail;
    if (next !== raw) {
      if (textOriginals) textOriginals.set(node, raw);
      node.nodeValue = next;
      return 1;
    }
    return 0;
  }

  function processTextNode(node) {
    var raw = node.nodeValue;
    var trimmed = String(raw).replace(/^\s+|\s+$/g, '');
    if (!trimmed || ignorable(node.parentElement)) return 0;
    if (I18n.current === 'en') {
      var value = translateText(trimmed);
      if (value == null || value === trimmed) return 0;
      /* se guarda siempre el texto español vigente (por si la app lo reescribió) */
      if (textOriginals) textOriginals.set(node, raw);
      return setNodeText(node, raw, value);
    }
    if (textOriginals && textOriginals.has(node)) {
      var orig = textOriginals.get(node);
      if (node.nodeValue !== orig) { node.nodeValue = orig; return 1; }
    }
    return 0;
  }

  function processAttributes(el) {
    if (!el || el.nodeType !== 1 || !el.getAttribute) return 0;
    if (SKIP_TAGS[String(el.tagName || '').toUpperCase()] || ignorable(el)) return 0;
    var count = 0;
    for (var i = 0; i < ATTRS.length; i++) {
      var attr = ATTRS[i];
      if (!el.hasAttribute(attr)) continue;
      var raw = el.getAttribute(attr);
      var trimmed = String(raw).replace(/^\s+|\s+$/g, '');
      if (!trimmed) continue;
      var stored = attrOriginals ? attrOriginals.get(el) : null;
      if (I18n.current === 'en') {
        var value = translateText(trimmed);
        if (value == null || value === trimmed) continue;
        if (!stored) { stored = {}; if (attrOriginals) attrOriginals.set(el, stored); }
        /* se guarda siempre el texto español vigente (por si la app lo reescribió) */
        stored[attr] = raw;
        el.setAttribute(attr, value);
        count++;
      } else if (stored && Object.prototype.hasOwnProperty.call(stored, attr)) {
        el.setAttribute(attr, stored[attr]);
        count++;
      }
    }
    /* <option value="…">: solo si el value es texto español del diccionario */
    if (el.tagName && String(el.tagName).toUpperCase() === 'OPTION' && el.hasAttribute('value')) {
      var rawV = el.getAttribute('value');
      var trimmedV = String(rawV).replace(/^\s+|\s+$/g, '');
      var storedV = attrOriginals ? attrOriginals.get(el) : null;
      if (I18n.current === 'en') {
        var valV = translateText(trimmedV);
        if (valV != null && valV !== trimmedV) {
          if (!storedV) { storedV = {}; if (attrOriginals) attrOriginals.set(el, storedV); }
          storedV.value = rawV;
          el.setAttribute('value', valV);
          count++;
        }
      } else if (storedV && Object.prototype.hasOwnProperty.call(storedV, 'value')) {
        el.setAttribute('value', storedV.value);
        count++;
      }
    }
    return count;
  }

  function walk(node) {
    var count = 0;
    if (!node) return 0;
    if (node.nodeType === 3) return processTextNode(node);
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return 0;
    if (node.nodeType === 1) {
      if (SKIP_TAGS[String(node.tagName || '').toUpperCase()]) return 0;
      count += processAttributes(node);
      if (ignorable(node)) return count;
    }
    var child = node.firstChild;
    while (child) {
      var next = child.nextSibling; /* por si la traducción altera el DOM */
      count += walk(child);
      child = next;
    }
    return count;
  }

  /**
   * apply(root): traduce (o restaura) textos y atributos visibles bajo root.
   * Devuelve el número de cambios. Sin DOM es no-op.
   */
  I18n.apply = function (root) {
    if (!hasDom()) return 0;
    var target = root || (typeof document !== 'undefined' ? document.body : null);
    if (!target) return 0;
    if (applying) return 0;
    applying = true;
    var n = 0;
    try { n = walk(target); } catch (e) { /* nunca romper la app por i18n */ }
    applying = false;
    try { syncLangToggle(); } catch (e2) { /* ignore */ }
    return n;
  };

  /* ---------------- Botón ES / EN de la barra lateral ---------------- */
  function syncLangToggle() {
    if (!hasDom() || !document.querySelector) return;
    var group = document.querySelector('#langToggle');
    if (!group || !group.querySelectorAll) return;
    var opts = group.querySelectorAll('.lang-opt');
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].classList) {
        opts[i].classList.toggle('active', (i === 0 && I18n.current === 'es') || (i === 1 && I18n.current === 'en'));
      }
    }
  }

  /* ---------------- Observador de contenido dinámico ---------------- */
  var observer = null;
  var observerTimer = 0;

  function scheduleApply() {
    if (observerTimer || !hasDom()) return;
    observerTimer = setTimeout(function () {
      observerTimer = 0;
      I18n.apply(document.body || document.documentElement);
    }, 40);
  }

  function startObserver() {
    if (!hasDom() || typeof MutationObserver === 'undefined' || observer) return;
    try {
      observer = new MutationObserver(function () {
        if (I18n.current !== 'en') return;
        scheduleApply();
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ATTRS.concat(['value'])
      });
    } catch (e) { observer = null; }
  }

  I18n.stopObserver = function () {
    if (observer) { try { observer.disconnect(); } catch (e) { /* ignore */ } }
    observer = null;
    if (observerTimer) { clearTimeout(observerTimer); observerTimer = 0; }
  };

  /* ---------------- Cambio de idioma ---------------- */
  var listeners = [];

  function notify(lang) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](lang); } catch (e) { /* ignore */ }
    }
    if (hasDom() && document.dispatchEvent && typeof CustomEvent === 'function') {
      try {
        document.dispatchEvent(new CustomEvent('engdraft:lang', { detail: { lang: lang } }));
      } catch (e) { /* ignore */ }
    }
  }

  I18n.onChange = function (fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  };

  function persist(lang) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) { /* modo privado / Node */ }
  }

  I18n.setLang = function (lang, opts) {
    var next = normalizeLang(lang);
    var prev = I18n.current;
    I18n.current = next;
    if (!opts || opts.persist !== false) persist(next);
    if (hasDom()) {
      try {
        document.documentElement.setAttribute('lang', next === 'en' ? 'en' : 'es');
        document.documentElement.setAttribute('data-lang', next);
      } catch (e) { /* ignore */ }
      I18n.apply(document.body || document.documentElement);
      syncLangToggle();
    }
    startObserver();
    if (prev !== next || (opts && opts.force)) notify(next);
    return next;
  };

  I18n.getLang = function () { return I18n.current; };

  /* ---------------- Arranque ---------------- */
  function init() {
    var stored = null;
    try {
      if (typeof localStorage !== 'undefined' && localStorage) stored = localStorage.getItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
    if (stored) I18n.current = normalizeLang(stored);
    if (hasDom()) {
      try {
        document.documentElement.setAttribute('lang', I18n.current === 'en' ? 'en' : 'es');
        document.documentElement.setAttribute('data-lang', I18n.current);
      } catch (e) { /* ignore */ }
      var onReady = function () {
        if (I18n.current === 'en') I18n.apply(document.body || document.documentElement);
        startObserver();
        syncLangToggle();
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
      } else {
        onReady();
      }
    }
  }

  ED.I18n = I18n;
  init();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

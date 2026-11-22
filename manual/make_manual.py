# Genera el manual de usuario de EngDraft en Word (.docx).
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_BREAK
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.enum.text import WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IMG = ROOT / "img"
OUT = ROOT / "EngDraft-Manual.docx"

DARK = "1B2631"
DARK_HEX = RGBColor(0x1B, 0x26, 0x31)
INK = RGBColor(0x2B, 0x38, 0x44)
MUTED = RGBColor(0x6B, 0x7C, 0x8C)
AMBER = "F5A623"
AMBER_DARK = RGBColor(0xB5, 0x65, 0x1D)
AMBER_RGB = RGBColor(0xF5, 0xA6, 0x23)
PAPER = "F8F6F0"
SOFT = "F1EEE5"
CYAN = "2E7D8F"
LINE = "D8D2C4"
FONT = "Segoe UI"
MONO = "Bahnschrift"

doc = Document()
doc.core_properties.title = "EngDraft — Manual de uso"
doc.core_properties.subject = "Planos residenciales en 2D y 3D"
doc.core_properties.author = "Prof. Raymond Rosa Ávila"
doc.core_properties.language = "es-ES"
doc.core_properties.keywords = "EngDraft, manual, planos, ingeniería civil, 2D, 3D, PDF, DXF"

# ------------------------------------------------------------------ utilidades OOXML
def shade(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


def cell_margins(cell, top=90, bottom=90, left=140, right=140):
    tcPr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement("w:tcMar")
    for side, val in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        el = OxmlElement("w:" + side)
        el.set(qn("w:w"), str(val))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    tcPr.append(mar)


def cell_borders(cell, color=LINE, size=4, sides=("top", "left", "bottom", "right")):
    tcPr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement("w:tcBorders")
    for side in sides:
        el = OxmlElement("w:" + side)
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), str(size))
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), color)
        borders.append(el)
    tcPr.append(borders)


def table_borders(table, color=LINE, size=4):
    tblPr = table._tbl.tblPr
    el = OxmlElement("w:tblBorders")
    for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
        b = OxmlElement("w:" + side)
        b.set(qn("w:val"), "single")
        b.set(qn("w:sz"), str(size))
        b.set(qn("w:space"), "0")
        b.set(qn("w:color"), color)
        el.append(b)
    tblPr.append(el)


def no_borders(table):
    tblPr = table._tbl.tblPr
    el = OxmlElement("w:tblBorders")
    for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
        b = OxmlElement("w:" + side)
        b.set(qn("w:val"), "nil")
        el.append(b)
    tblPr.append(el)


def keep_row(row):
    trPr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:cantSplit")
    trPr.append(el)


def repeat_header(row):
    trPr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:tblHeader")
    trPr.append(el)


def p_border(paragraph, side="bottom", color=LINE, size=6, space=4):
    pPr = paragraph._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    el = OxmlElement("w:" + side)
    el.set(qn("w:val"), "single")
    el.set(qn("w:sz"), str(size))
    el.set(qn("w:space"), str(space))
    el.set(qn("w:color"), color)
    pBdr.append(el)
    pPr.append(pBdr)


def add_field(paragraph, instr):
    run = paragraph.add_run()
    fld1 = OxmlElement("w:fldChar")
    fld1.set(qn("w:fldCharType"), "begin")
    it = OxmlElement("w:instrText")
    it.set(qn("xml:space"), "preserve")
    it.text = " " + instr + " "
    fld2 = OxmlElement("w:fldChar")
    fld2.set(qn("w:fldCharType"), "separate")
    txt = OxmlElement("w:t")
    txt.text = "1"
    fld3 = OxmlElement("w:fldChar")
    fld3.set(qn("w:fldCharType"), "end")
    run._r.append(fld1)
    run._r.append(it)
    run._r.append(fld2)
    run._r.append(txt)
    run._r.append(fld3)
    return run


# ------------------------------------------------------------------ estilos
styles = doc.styles
normal = styles["Normal"]
normal.font.name = FONT
normal.font.size = Pt(10.5)
normal.font.color.rgb = INK
normal.paragraph_format.space_after = Pt(4)
normal.paragraph_format.line_spacing = 1.12

for name, size, color, before, after in [
    ("Heading 1", 21, DARK_HEX, 2, 10),
    ("Heading 2", 14, AMBER_DARK, 16, 5),
    ("Heading 3", 11.5, INK, 10, 3),
]:
    st = styles[name]
    st.font.name = FONT
    st.font.size = Pt(size)
    st.font.bold = True
    st.font.color.rgb = color
    st.paragraph_format.space_before = Pt(before)
    st.paragraph_format.space_after = Pt(after)
    st.paragraph_format.keep_with_next = True

cap = styles["Caption"]
cap.font.name = FONT
cap.font.size = Pt(8.5)
cap.font.italic = True
cap.font.color.rgb = MUTED
cap.paragraph_format.space_after = Pt(10)
cap.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER

for lname in ("List Bullet", "List Number"):
    try:
        st = styles[lname]
        st.font.name = FONT
        st.font.size = Pt(10.5)
        st.paragraph_format.space_after = Pt(3)
    except KeyError:
        pass

# ------------------------------------------------------------------ secciones
core = doc.sections[0]
core.page_width = Cm(21)
core.page_height = Cm(29.7)
core.left_margin = Cm(0)
core.right_margin = Cm(0)
core.top_margin = Cm(0)
core.bottom_margin = Cm(0)
core.header_distance = Cm(0)
core.footer_distance = Cm(0)

# Portada a sangre
cover_p = doc.add_paragraph()
cover_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
cover_p.paragraph_format.space_before = Pt(0)
cover_p.paragraph_format.space_after = Pt(0)
cover_p.paragraph_format.line_spacing = 1.0
cover_p.add_run().add_picture(str(IMG / "cover.png"), width=Cm(21), height=Cm(29.5))

body = doc.add_section(WD_SECTION.NEW_PAGE)
body.page_width = Cm(21)
body.page_height = Cm(29.7)
body.left_margin = Cm(2.0)
body.right_margin = Cm(2.0)
body.top_margin = Cm(2.1)
body.bottom_margin = Cm(1.9)
body.header_distance = Cm(0.9)
body.footer_distance = Cm(0.8)

# Encabezado y pie
body.header.is_linked_to_previous = False
body.footer.is_linked_to_previous = False
hp = body.header.paragraphs[0]
p_border(hp, "bottom", "D8D2C4", 4, 3)
hp.paragraph_format.tab_stops.add_tab_stop(Cm(16.8), WD_TAB_ALIGNMENT.RIGHT)
r = hp.add_run("ENGDRAFT  ·  MANUAL DE USO")
r.font.name = FONT
r.font.size = Pt(8)
r.font.bold = True
r.font.color.rgb = MUTED
r = hp.add_run("\t\tVersi\u00f3n 1.6")
r.font.name = FONT
r.font.size = Pt(8)
r.font.color.rgb = MUTED

fp = body.footer.paragraphs[0]
p_border(fp, "top", "D8D2C4", 4, 3)
fp.paragraph_format.tab_stops.add_tab_stop(Cm(16.8), WD_TAB_ALIGNMENT.RIGHT)
r = fp.add_run("Planos residenciales 2D / 3D")
r.font.name = FONT
r.font.size = Pt(8)
r.font.color.rgb = MUTED
r = fp.add_run("\t\tP\u00e1gina ")
r.font.name = FONT
r.font.size = Pt(8)
r.font.color.rgb = MUTED
add_field(fp, "PAGE").font.size = Pt(8)
r = fp.add_run(" de ")
r.font.name = FONT
r.font.size = Pt(8)
r.font.color.rgb = MUTED
add_field(fp, "NUMPAGES").font.size = Pt(8)

# ------------------------------------------------------------------ helpers de contenido
fig_no = 0
tab_no = 0


def para(text="", style=None, size=None, bold=False, italic=False, color=None, align=None,
         space_before=None, space_after=None, keep=False):
    p = doc.add_paragraph(style=style)
    if text:
        r = p.add_run(text)
        r.bold = bold
        r.italic = italic
        if size: r.font.size = Pt(size)
        if color: r.font.color.rgb = color
    if align is not None: p.alignment = align
    if space_before is not None: p.paragraph_format.space_before = Pt(space_before)
    if space_after is not None: p.paragraph_format.space_after = Pt(space_after)
    if keep: p.paragraph_format.keep_with_next = True
    return p


def rich(parts, style=None, space_before=None, space_after=None, align=None):
    p = doc.add_paragraph(style=style)
    for text, bold, color in parts:
        r = p.add_run(text)
        r.bold = bold
        if color: r.font.color.rgb = color
    if space_before is not None: p.paragraph_format.space_before = Pt(space_before)
    if space_after is not None: p.paragraph_format.space_after = Pt(space_after)
    if align is not None: p.alignment = align
    return p


def bullets(items, numbered=False):
    for i, item in enumerate(items, 1):
        p = doc.add_paragraph(style="List Number" if numbered else "List Bullet")
        if numbered:
            r = p.add_run(str(i) + ". ")
            r.bold = True
            r.font.color.rgb = AMBER_DARK
        p.add_run(item)


def chapter(number, title, kicker=None):
    if doc.paragraphs:
        doc.add_page_break()
    k = doc.add_paragraph()
    r = k.add_run(kicker or ("CAPÍTULO " + str(number)))
    r.font.name = FONT
    r.font.size = Pt(8.5)
    r.font.bold = True
    r.font.color.rgb = AMBER_DARK
    k.paragraph_format.space_after = Pt(2)
    k.paragraph_format.keep_with_next = True
    h = doc.add_heading(title, level=1)
    p_border(h, "bottom", AMBER, 12, 8)
    h.paragraph_format.space_after = Pt(12)
    return h


def sub(title):
    return doc.add_heading(title, level=2)


def sub3(title):
    return doc.add_heading(title, level=3)


def note(text, label="Consejo", fill="FFF6E3", accent=AMBER):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    table.columns[0].width = Cm(16.6)
    cell = table.cell(0, 0)
    cell.width = Cm(16.6)
    shade(cell, fill)
    cell_margins(cell, 110, 110, 170, 140)
    tcPr = cell._tc.get_or_add_tcPr()
    b = OxmlElement("w:tcBorders")
    for side, size in (("top", 4), ("left", 24), ("bottom", 4), ("right", 4)):
        el = OxmlElement("w:" + side)
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), str(size))
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), accent)
        b.append(el)
    tcPr.append(b)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(1)
    r = p.add_run(label.upper())
    r.bold = True
    r.font.size = Pt(8)
    r.font.color.rgb = RGBColor(0x8A, 0x5A, 0x18) if accent == AMBER else MUTED
    p2 = cell.add_paragraph()
    p2.paragraph_format.space_after = Pt(0)
    r2 = p2.add_run(text)
    r2.font.size = Pt(9.5)
    r2.font.color.rgb = INK
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def figure(path, caption, width=16.5, frame=True):
    global fig_no
    fig_no += 1
    if frame:
        table = doc.add_table(rows=1, cols=1)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = False
        table.columns[0].width = Cm(width + 0.3)
        cell = table.cell(0, 0)
        cell.width = Cm(width + 0.3)
        shade(cell, "FFFFFF")
        cell_margins(cell, 40, 40, 40, 40)
        cell_borders(cell, "DDD6C8", 3)
        keep_row(table.rows[0])
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.keep_with_next = True
        p.add_run().add_picture(str(path), width=Cm(width))
    else:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.keep_with_next = True
        p.add_run().add_picture(str(path), width=Cm(width))
    c = doc.add_paragraph("Figura %d. %s" % (fig_no, caption), style="Caption")
    c.paragraph_format.space_before = Pt(3)
    return c


def make_table(headers, rows, widths, font_size=9, header_fill=DARK, align_center=None):
    global tab_no
    tab_no += 1
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    table_borders(table, LINE, 3)
    hdr = table.rows[0]
    repeat_header(hdr)
    for i, h in enumerate(headers):
        cell = hdr.cells[i]
        cell.width = Cm(widths[i])
        shade(cell, header_fill)
        cell_margins(cell, 70, 70, 90, 90)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(h)
        r.font.size = Pt(8.6)
        r.font.bold = True
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        if align_center and i in align_center: p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for ri, row in enumerate(rows):
        cells = table.add_row().cells
        keep_row(table.rows[-1])
        for i, val in enumerate(row):
            cell = cells[i]
            cell.width = Cm(widths[i])
            cell_margins(cell, 70, 70, 90, 90)
            if ri % 2 == 1:
                shade(cell, "FAF8F2")
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(str(val))
            r.font.size = Pt(font_size)
            r.font.color.rgb = INK
            if i == 0:
                r.bold = True
            if align_center and i in align_center: p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def kv_table(rows, widths=(4.2, 12.4)):
    return make_table(["Concepto", "Descripción"], rows, widths, font_size=9)


def checklist(items):
    for item in items:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.2)
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run("□  ")
        r.font.name = "Segoe UI Symbol"
        r.font.size = Pt(11)
        r.font.color.rgb = AMBER_DARK
        p.add_run(item)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)


def toc_row(num, title, desc):
    table = doc.add_table(rows=1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    widths = (1.2, 6.2, 9.2)
    for i, w in enumerate(widths):
        table.columns[i].width = Cm(w)
    vals = [num, title, desc]
    for i, val in enumerate(vals):
        cell = table.cell(0, i)
        cell.width = Cm(widths[i])
        cell_margins(cell, 55, 55, 60, 60)
        cell_borders(cell, "EAE5DA", 2, sides=("bottom",))
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        if i == 0:
            r = p.add_run(str(val))
            r.font.size = Pt(9)
            r.font.bold = True
            r.font.color.rgb = AMBER_DARK
        elif i == 1:
            r = p.add_run(str(val))
            r.font.size = Pt(10)
            r.font.bold = True
        else:
            r = p.add_run(str(val))
            r.font.size = Pt(9)
            r.font.color.rgb = MUTED


# ================================================================== BIENVENIDA
h = doc.add_heading("Bienvenido a EngDraft", level=1)
p_border(h, "bottom", AMBER, 12, 8)
para("EngDraft es una herramienta de dibujo y documentación de planos residenciales pensada para estudiantes de ingeniería civil, arquitectura y profesionales que necesitan resolver anteproyectos con rapidez, sin depender de una instalación CAD pesada.", size=10.5, space_before=4)
para("El programa combina un editor de planta 2D con una vista 3D de maqueta y un módulo de láminas con cajetines profesionales. Todo el trabajo vive en un único archivo .engdraft y se puede entregar en PDF vectorial o DXF compatible con AutoCAD.")
rich([("Autor: ", True, AMBER_DARK), ("Prof. Raymond Rosa Ávila", True, INK)], space_after=8)

sub("Este manual")
para("Está organizado para que puedas avanzar de dos maneras:")
bullets([
    "Si es tu primera vez, sigue el tutorial del Capítulo 3: en menos de una hora tendrás una vivienda dibujada, amueblada y exportada.",
    "Si ya conoces el programa, usa los capítulos 4 a 7 como referencia de herramientas, 3D, láminas y archivos.",
])
para("Al final encontrarás buenas prácticas de dibujo, ejercicios para estudiantes, preguntas frecuentes, atajos, glosario y una lista de verificación para antes de entregar.")

sub("Convenciones")
make_table(["Elemento", "Significado"], [
    ["Herramienta (M)", "Nombre de una herramienta y su atajo de teclado."],
    ["Clic", "Clic izquierdo con el ratón."],
    ["Clic derecho", "Botón secundario; en el lienzo termina el trazado de muros."],
    ["Arrastrar", "Mantener pulsado y mover el ratón."],
    ["Nota / Importante", "Aclaración que conviene leer antes de continuar."],
], [4.0, 12.6], font_size=9)

note("EngDraft es una ayuda de dibujo y documentación. No sustituye la revisión estructural, la normativa local, el cálculo de cargas ni la firma de un profesional habilitado. Los planos deben verificarse antes de construir.", "Aviso profesional", "FDECEC", "C0392B")

# ================================================================== CONTENIDO
doc.add_page_break()
h = doc.add_heading("Contenido", level=1)
p_border(h, "bottom", AMBER, 12, 8)
toc = [
    ("1", "Introducción y conceptos", "Qué es EngDraft, alcance, requisitos y ruta rápida."),
    ("2", "Interfaz y navegación", "Barra superior, herramientas, lienzo, inspector y estado."),
    ("3", "Tutorial: tu primer plano", "De un proyecto vacío a una lámina PDF paso a paso."),
    ("4", "Herramientas de dibujo", "Selección, muros, aberturas, ambientes, mobiliario, cotas y capas."),
    ("5", "Vista 3D", "Cámara, presets, opciones, niveles y captura de imagen."),
    ("6", "Láminas y exportación PDF", "Cajetines, formatos, escalas, contenidos y salida PDF."),
    ("7", "Archivos, DXF y DWG", "Guardar, abrir, autoguardado y entrega a AutoCAD."),
    ("8", "Buenas prácticas de ingeniería", "Organización, escala, revisión y lista de control."),
    ("9", "Ejercicios para estudiantes", "Tres prácticas con objetivos y rúbrica."),
    ("10", "Preguntas frecuentes", "Problemas habituales y cómo resolverlos."),
    ("A", "Atajos de teclado", "Referencia rápida para dibujar sin ratón."),
    ("B", "Glosario", "Términos de dibujo, CAD y documentación."),
    ("C", "Checklist de entrega", "Verificación final antes de exportar."),
]
for num, title, desc in toc:
    toc_row(num, title, desc)

note("La ruta más corta: abre la demo, pulsa Plano 2D, revisa los muros y ambientes, cambia a Vista 3D y termina en Láminas → Exportar PDF. Después guarda tu .engdraft.", "Ruta rápida", "E8F3F3", CYAN)

# ================================================================== CAP 1
chapter(1, "Introducción y conceptos")
sub("1.1 ¿Qué es EngDraft?")
para("EngDraft es una aplicación web offline para dibujar planos de viviendas. Reúne tres vistas de trabajo:")
bullets([
    "Plano 2D: muros, puertas, ventanas, ambientes, mobiliario, textos, cotas y niveles.",
    "Vista 3D: maqueta volumétrica generada automáticamente a partir del plano, con muros, huecos, pisos y muebles.",
    "Láminas: hojas de título configurables con el plano, notas, portada o captura 3D, listas para PDF.",
])
para("El proyecto se guarda como archivo .engdraft (JSON legible). No necesita internet, cuenta, base de datos ni instalación. La aplicación se ejecuta en el navegador y todo el procesamiento ocurre en el equipo.")

sub("1.2 ¿Para quién está pensado?")
make_table(["Perfil", "Uso típico"], [
    ["Estudiantes de ingeniería civil", "Aprender a leer y producir plantas, practicar distribución, áreas y documentación."],
    ["Ingenieros y arquitectos", "Anteproyectos rápidos, verificación de distribución y entregas preliminares en PDF."],
    ["Técnicos y dibujantes", "Preparar plantas base para luego detallar en AutoCAD u otro CAD."],
    ["Propietarios y autoconstructores", "Explorar una distribución y comunicar ideas a un profesional."],
], [5.0, 11.6], font_size=9)

sub("1.3 Alcance y límites")
para("EngDraft es una herramienta de diseño y documentación de anteproyecto. No es un programa BIM, no calcula estructuras, instalaciones sanitarias, eléctricas ni presupuestos. Tampoco valida automáticamente el cumplimiento de retiros, alturas, ventilación o normativa municipal.")
note("Usa EngDraft para pensar, dibujar y presentar. Antes de construir, valida el proyecto con un profesional habilitado y con la normativa de tu ciudad.", "Importante", "FDECEC", "C0392B")

sub("1.4 Requisitos y privacidad")
bullets([
    "Navegador actualizado: Edge, Chrome, Firefox o Safari reciente. Se recomienda una pantalla de 1280 px de ancho o más.",
    "Ratón con rueda. La app funciona en pantallas táctiles, pero el dibujo preciso se hace mejor con ratón.",
    "No requiere conexión a internet ni instalar nada.",
    "Los datos permanecen en el equipo. El autoguardado usa el almacenamiento local del navegador.",
    "En algunos navegadores, localStorage está restringido al abrir con file://. Si la barra superior indica “Sin autoguardado”, descarga el .engdraft para conservar el trabajo.",
])

sub("1.5 Conceptos básicos")
kv_table([
    ["Unidad interna", "El dibujo se almacena en milímetros (mm). La interfaz puede mostrarse en sistema métrico (m/mm) o imperial (ft/in), a elección del proyecto."],
    ["Nivel", "Una planta de la vivienda. Cada nivel tiene elevación y altura, y se apila en 3D."],
    ["Muro", "Segmento con espesor y altura. Admite puertas, ventanas y portones."],
    ["Abertura", "Hueco de puerta o ventana definido sobre un muro mediante posición, ancho y alto."],
    ["Ambiente", "Recinto cerrado con nombre, acabado, color y área calculada."],
    ["Mobiliario", "Accesorio de la biblioteca colocado con posición y rotación."],
    ["Capa", "Grupo de objetos que se puede ocultar o bloquear."],
    ["Lámina", "Hoja imprimible con cajetín, escala, nivel y contenido."],
    ["Cajetín", "Bloque de título con proyecto, cliente, ubicación, escala, fecha, revisión y número."],
    ["Escala", "Relación entre el dibujo y el papel. Por ejemplo 1:50 significa que 1 m real mide 2 cm en el papel."],
])

sub("1.6 Ruta rápida de trabajo")
make_table(["Paso", "Acción", "Resultado"], [
    ["1", "Abrir index.html", "Se carga la Residencia Aurora de demostración."],
    ["2", "Crear proyecto o editar datos", "Defines nombre, cliente, ubicación, fecha y revisión."],
    ["3", "Dibujar muros", "Obtienes el perímetro y los tabiques de la planta."],
    ["4", "Insertar puertas y ventanas", "Los huecos aparecen en 2D y 3D."],
    ["5", "Detectar ambientes", "Cada recinto recibe nombre y área editable."],
    ["6", "Amueblar", "Colocas muebles y accesorios desde la biblioteca."],
    ["7", "Acotar y rotular", "Añades dimensiones, textos y norte."],
    ["8", "Revisar 3D", "Verificas volúmenes, huecos, niveles y mobiliario."],
    ["9", "Configurar láminas", "Eliges cajetín, tamaño, escala y contenido."],
    ["10", "Exportar PDF y guardar .engdraft", "Entregas el juego de planos y conservas el proyecto editable."],
], [1.1, 6.2, 9.3], font_size=8.8, align_center=[0])

sub("1.7 Decisiones antes del primer trazo")
para("Dibujar sin un plan previo suele terminar en correcciones costosas. Antes de abrir EngDraft, resuelve estas decisiones:")
bullets([
    "Superficie y proporción del terreno, retiros y orientación.",
    "Programa de necesidades: cuántos dormitorios, baños, áreas sociales y de servicio.",
    "Dimensiones aproximadas de cada ambiente y ancho de circulaciones.",
    "Número de niveles y altura libre entre ellos.",
    "Ubicación de accesos, escaleras y patios.",
    "Criterio de entrega: planta amueblada, planta limpia, notas y portada.",
])
note("Un boceto a mano con medidas es suficiente para empezar. EngDraft convierte ese boceto en un plano editable y en una maqueta; no reemplaza la etapa de diseño.", "Método", "FFF6E3", AMBER)

sub("1.8 Sistema métrico o imperial")
para("EngDraft guarda internamente todas las medidas en milímetros, pero puede mostrar el proyecto en dos sistemas:")
make_table(["Sistema", "Longitudes", "Superficies", "Uso típico"], [
    ["Métrico", "m y mm", "m²", "Latinoamérica, Europa y normativa métrica."],
    ["Imperial", "ft y in", "ft²", "Estados Unidos, Canadá y proyectos en pies/pulgadas."],
], [3.2, 4.0, 3.2, 6.2], font_size=8.8)
para("Pulsa el botón de unidades de la barra inferior (m · m² / ft · ft²) para alternar, o cambia el sistema en Datos del proyecto. Las cotas, áreas, propiedades, escala gráfica, láminas y etiquetas 3D se actualizan. El DXF se exporta siempre en milímetros para conservar la compatibilidad CAD.")
note("El cambio de unidades es de presentación: no convierte ni deforma la geometría. Un muro de 3,00 m se seguirá dibujando igual y se mostrará como 9'-10\" en sistema imperial.", "Importante", "FFF6E3", AMBER)

# ================================================================== CAP 2
chapter(2, "Interfaz y navegación")
sub("2.1 Abrir la aplicación")
para("Descomprime la carpeta de EngDraft y abre index.html con doble clic. La aplicación se inicia en Plano 2D con el proyecto de demostración cargado. Si ya usaste la app en ese navegador, puede restaurarse tu último proyecto guardado.")
para("El proyecto de demostración sirve como referencia: puedes recorrerlo, modificarlo o crear uno nuevo con el botón + de la barra superior.")

sub("2.2 Zonas de la interfaz")
figure(IMG / "interfaz-anotada.png", "Zonas principales de la interfaz de EngDraft.", 16.4)
make_table(["Zona", "Qué contiene", "Uso"], [
    ["1. Barra superior", "Proyecto, vistas, nuevo, abrir, guardar, deshacer/rehacer, PDF y DWG/DXF.", "Cambia de vista, guarda o exporta."],
    ["2. Pestañas de vista", "Plano 2D, Vista 3D y Láminas.", "Alterna el modo de trabajo."],
    ["3. Pestañas de planta", "Planta, Planta 2, + y −.", "Cambia de planta, añade otra o elimina la activa."],
    ["4. Barra de herramientas", "Seleccionar, mover, muro, puerta, ventana, ambiente, mueble, texto, cota y borrar.", "Elige la herramienta de dibujo."],
    ["5. Acciones contextuales", "Detectar ambientes, cotas generales, añadir planta, deshacer/rehacer; en 3D, presets y captura.", "Órdenes que cambian según la vista."],
    ["6. Controles de dibujo", "Rejilla, snap, orto, ajustar y zoom.", "Controlan la precisión y el encuadre."],
    ["7. Lienzo", "Plano o maqueta 3D.", "Zona de dibujo y edición."],
    ["8. Inspector", "Propiedades, Biblioteca y Capas.", "Edita el objeto seleccionado o inserta mobiliario."],
    ["9. Barra de estado", "Mensaje de la herramienta, coordenadas, zoom, nivel y unidades.", "Confirma lo que está haciendo el programa."],
], [3.6, 8.6, 4.4], font_size=8.4)

sub("2.3 Cambiar de vista")
bullets([
    "Plano 2D: dibujo técnico y edición precisa. Desde la sección Vistas puedes consultar frontal, posterior, laterales y secciones.",
    "Vista 3D: revisión volumétrica, presentación y captura de imagen.",
    "Láminas: composición de hojas y exportación PDF, con plantas y fachadas automáticas.",
])
para("Puedes cambiar con los botones superiores o con las teclas 1, 2 y 3.")

sub("2.4 Plantas")
para("Las pestañas junto a “Planta” permiten cambiar la planta activa. El proyecto nuevo empieza con una sola planta llamada Planta; el botón + o la acción Añadir planta crea otra con nombre, elevación y altura libre. Los objetos se dibujan en la planta activa y se apilan en 3D según la elevación.")
note("Antes de dibujar en una planta nueva, comprueba que su pestaña esté activa. Un error frecuente es dibujar en Planta cuando se quería trabajar en Planta 2.", "Consejo", "FFF6E3", AMBER)

sub("2.5 Inspector y paneles")
make_table(["Pestaña", "Contenido"], [
    ["Propiedades", "Datos del proyecto cuando no hay selección; parámetros del objeto seleccionado cuando lo hay."],
    ["Biblioteca", "Mobiliario y accesorios por categoría, con buscador y miniatura."],
    ["Capas", "Visibilidad y bloqueo de muros, aberturas, mobiliario, ambientes, anotaciones y cotas."],
], [4.0, 12.6], font_size=9)
para("El inspector se adapta al contexto: si seleccionas un muro muestra longitud, espesor, altura y lista de aberturas; si seleccionas un mueble muestra posición, rotación y dimensiones.")

sub("2.6 Barra de estado")
para("La barra inferior indica la herramienta activa, las coordenadas del cursor, el zoom, el nivel y las unidades. Úsala para comprobar que estás dibujando en el lugar y nivel correctos.")

sub("2.7 Navegación y zoom")
make_table(["Acción", "Cómo"], [
    ["Desplazar la vista", "Mantén pulsada la rueda del ratón o la barra espaciadora y arrastra. También puedes usar la herramienta Mover (H)."],
    ["Acercar / alejar", "Rueda del ratón o botones + / −."],
    ["Ajustar a todo el contenido", "Botón Ajustar, Shift+F o Home."],
    ["Cambiar de nivel", "Pestañas de nivel."],
    ["Seleccionar", "Herramienta V; clic sobre un objeto."],
], [4.7, 11.9], font_size=9)

sub("2.8 Guardado y copias de seguridad")
para("EngDraft autoguarda el proyecto en el navegador. Además, el botón de disquete de la barra superior descarga un archivo .engdraft. Ese archivo es tu copia de seguridad real: guárdalo en OneDrive, Google Drive o una memoria USB.")
bullets([
    "Ctrl+S descarga el proyecto.",
    "El icono de carpeta abre un .engdraft o .json.",
    "También puedes arrastrar y soltar el archivo sobre la aplicación.",
    "El autoguardado es local al navegador y a la dirección desde la que abres la app; no se sincroniza entre equipos.",
])

# ================================================================== CAP 3
chapter(3, "Tutorial: tu primer plano")
para("En este capítulo construiremos una vivienda sencilla de una planta. Si sigues los pasos en orden, terminarás con una lámina PDF y un archivo editable. Usa la demo como referencia visual.")

sub("3.1 Antes de dibujar: define el partido")
para("Antes de tocar el programa, dibuja en papel un esquema con las dimensiones aproximadas. Para el ejercicio usaremos un rectángulo de 10,00 × 8,00 m con:")
bullets([
    "Sala-comedor y cocina integradas en la zona frontal.",
    "Dos dormitorios y un baño en la zona posterior.",
    "Un pasillo central que conecta los ambientes.",
])
note("No empieces por el mobiliario. Primero resuelve muros, circulación y proporción de ambientes; después amuebla.", "Método de trabajo", "FFF6E3", AMBER)

sub("3.2 Crear un proyecto")
para("Pulsa el botón + de la barra superior para abrir Nuevo proyecto. Elige una plantilla:")
figure(IMG / "newproject.png", "Diálogo Nuevo proyecto con las plantillas disponibles.", 16.2)
make_table(["Plantilla", "Uso recomendado"], [
    ["Plano en blanco", "Empezar un proyecto desde cero con capas y hoja A3."],
    ["Casa de un nivel", "Base de una vivienda de dos dormitorios para practicar."],
    ["Casa de dos niveles", "Proyecto dúplex con cuatro dormitorios."],
    ["Residencia Aurora", "Demostración completa de dos niveles, amueblada y con cuatro láminas."],
], [5.0, 11.6], font_size=9)
para("Selecciona Plano en blanco y pulsa Crear proyecto. El proyecto anterior queda en el autoguardado; si lo necesitas, descárgalo antes de continuar.")

sub("3.3 Completar los datos del proyecto")
para("Haz clic en el nombre del proyecto, en la parte superior izquierda. Se abre Datos del proyecto. Completa:")
make_table(["Campo", "Ejemplo"], [
    ["Nombre del proyecto", "Vivienda Unifamiliar Los Álamos"],
    ["Cliente / propietario", "Familia Rojas"],
    ["Ubicación", "Calle 4 #12-34, Barrio Central"],
    ["Ingeniero / arquitecto", "Ing. Proyecto"],
    ["Matrícula / licencia", "***"],
    ["Fecha y revisión", "2026-11-18 · A"],
    ["Descripción y notas", "Vivienda de una planta, 2 dormitorios."],
], [5.0, 11.6], font_size=9)
para("Estos datos alimentan los cajetines de todas las láminas. Si los cambias después, se actualizan al volver a generar las hojas.")

sub("3.4 Añadir más plantas si hacen falta")
para("Para una vivienda de una planta no necesitas más. Si haces un dúplex, pulsa Añadir planta (o + junto a las pestañas), escribe el nombre, la elevación y la altura libre. Por ejemplo: Planta 2, elevación 2,80 m, altura 2,70 m.")

sub("3.5 Dibujar el perímetro")
para("Activa la herramienta Muro (M). El cursor se convierte en una cruz y la barra de estado indica cómo continuar.")
bullets([
    "Haz clic en el primer vértice. Puedes usar la rejilla de 250 mm o el snap a puntos.",
    "Haz clic en el siguiente vértice; se crea el primer tramo y el dibujo continúa encadenado.",
    "Sigue el perímetro hasta cerrar. Pulsa Esc o clic derecho para terminar.",
    "Para un ángulo exacto, activa Orto (O) o mantén Shift mientras mueves.",
])
para("Si necesitas una longitud exacta, selecciona el muro con V y edita Longitud en Propiedades. También puedes ajustar Espesor y Altura.")
note("Los muros deben encontrarse en sus extremos. Si queda una separación de pocos milímetros, la detección de ambientes puede fallar. Usa el snap a extremos para cerrar bien las esquinas.", "Precisión", "FDECEC", "C0392B")

sub("3.6 Dibujar los tabiques")
para("Con la misma herramienta Muro, traza los tabiques interiores. Empieza y termina sobre muros existentes para que el recinto quede cerrado. Si un tabique queda “flotando”, el detector de ambientes no podrá separar los recintos.")
para("Para este ejercicio, dibuja:")
bullets([
    "Un tabique vertical que separe la zona social de los dormitorios.",
    "Un tabique horizontal que separe los dos dormitorios.",
    "El tabique del baño y el del pasillo.",
])

sub("3.7 Insertar puertas y ventanas")
para("Activa Puerta (P) o Ventana (N) y acerca el cursor a un muro. EngDraft resalta el muro y muestra la futura abertura.")
bullets([
    "Haz clic sobre el muro para insertar la abertura en ese punto.",
    "Por defecto, una puerta mide 900 mm de ancho y 2100 mm de alto; una ventana, 1200 × 1200 mm con antepecho de 900 mm.",
    "Selecciona el muro con V y edita Ancho, Alto y Posición (%) de cada abertura en Propiedades.",
    "Puedes añadir o eliminar aberturas desde la ficha del muro.",
])
para("Las aberturas se dibujan con jambas, hoja y abanico en 2D, y generan huecos reales en 3D.")

sub("3.8 Crear y nombrar ambientes")
para("Cierra todos los recintos y pulsa Detectar ambientes en la barra contextual. EngDraft analiza los muros y crea un ambiente por cada región cerrada.")
bullets([
    "Si no detecta nada, revisa que los muros estén unidos y que el recinto esté cerrado.",
    "Haz clic en un ambiente para seleccionarlo y edita su nombre, acabado y color.",
    "El área se calcula automáticamente a partir del polígono.",
    "Puedes crear un ambiente manual con la herramienta Ambiente (A) haciendo clic dentro de un recinto cerrado.",
])
para("Nombra los ambientes con criterio: “Dormitorio 1”, “Dormitorio 2”, “Baño”, “Sala / Comedor”, “Cocina”, “Pasillo”. Evita nombres genéricos como “Ambiente 1” en la entrega final.")

sub("3.9 Amueblar")
para("Abre la pestaña Biblioteca del inspector. Verás más de 40 accesorios organizados en Muebles, Cocina, Baño, Dormitorio y Exterior.")
figure(IMG / "library.png", "Biblioteca de mobiliario con categorías, buscador y vista previa.", 16.2)
bullets([
    "Haz clic en un mueble para seleccionarlo.",
    "Mueve el cursor sobre el plano: verás una vista fantasma.",
    "Haz clic para colocarlo. Puedes seguir colocando más copias.",
    "Pulsa R durante la colocación para girar 90°.",
    "Pulsa Esc para salir de la herramienta.",
    "Con la herramienta V, selecciona un mueble para moverlo, rotarlo, duplicarlo o eliminarlo.",
])
para("Amuebla sin saturar: deja circulaciones libres, respeta el sentido de apertura de puertas y deja espacio frente a armarios y sanitarios.")
note("No es necesario amueblar todos los ambientes para que el plano sea válido, pero sí conviene que la entrega sea legible. Usa el mobiliario para comunicar el uso de cada espacio, no para llenarlo.", "Criterio", "E8F3F3", CYAN)

sub("3.10 Cotas y textos")
para("La herramienta Cota (D) se usa con dos clics: origen y destino. La cota se dibuja con una separación por defecto que luego puedes ajustar en Propiedades. Para el perímetro, también puedes pulsar Cotas generales y el programa acota el ancho y el alto del nivel.")
para("La herramienta Texto (T) abre un cuadro para escribir una anotación. Puedes ajustar tamaño y rotación. Usa textos para nombres de fachada, notas o referencias; los nombres de ambientes ya se generan desde el ambiente.")

sub("3.11 Revisar la vista 3D")
para("Pulsa Vista 3D (2). La maqueta se genera con los muros, huecos, pisos y muebles del proyecto.")
bullets([
    "Arrastra con el botón izquierdo para orbitar.",
    "Arrastra con el botón derecho o Shift para desplazar.",
    "Usa la rueda para acercar y alejar.",
    "Haz doble clic para encuadrar.",
    "Prueba Iso, Planta, Frente y Lateral.",
    "Activa Techo para ver la cubierta; desactívalo para revisar interiores.",
])
para("Si necesitas una imagen para la lámina, usa Captura a lámina. Se creará una hoja con la vista 3D incrustada.")

sub("3.12 Crear la lámina y exportar PDF")
para("Pulsa Láminas (3). La galería muestra las hojas del proyecto. Selecciona una hoja para editarla en Propiedades:")
bullets([
    "Nombre y título de la lámina.",
    "Código (A-01, A-02…).",
    "Tamaño A4, A3, A2, A1, Letter o Tabloid.",
    "Orientación horizontal o vertical.",
    "Plantilla de cajetín.",
    "Escala 1:50, 1:75, 1:100, etc.",
    "Nivel asociado y contenido.",
])
para("Pulsa Exportar PDF para generar todas las láminas, o PDF de esta lámina desde Propiedades. El PDF conserva el plano vectorial y una página por hoja.")

sub("3.13 Guardar el proyecto")
para("Pulsa el disquete de la barra superior (Ctrl+S) para descargar el archivo .engdraft. Guárdalo con un nombre reconocible, por ejemplo Vivienda-Los-Alamos-R1.engdraft. Ese archivo te permite volver a editar el proyecto más adelante.")

sub("3.14 Checklist del tutorial")
checklist([
    "Cerré el perímetro y todos los tabiques tocan muros existentes.",
    "Inserté puertas y ventanas en los muros correspondientes.",
    "Todos los ambientes tienen nombre y área coherente.",
    "El mobiliario no bloquea puertas ni circulaciones.",
    "El plano tiene cotas generales y un norte visible.",
    "La vista 3D no muestra muros faltantes ni huecos raros.",
    "La lámina tiene datos de proyecto, escala y número.",
    "Exporté el PDF y guardé el .engdraft.",
])

# ================================================================== CAP 4
chapter(4, "Herramientas de dibujo")
para("Todas las herramientas están en la barra vertical izquierda. La tecla indicada activa la herramienta desde cualquier vista 2D. Pulsa Esc para cancelar la operación actual o volver a Seleccionar.")

sub("4.1 Seleccionar y editar")
para("La herramienta Seleccionar (V) es la más importante. Permite elegir objetos, moverlos y editar sus parámetros.")
bullets([
    "Clic sobre un objeto: lo selecciona y muestra sus propiedades.",
    "Shift + clic: añade o quita objetos de la selección.",
    "Arrastrar un objeto seleccionado: lo mueve.",
    "Arrastrar el extremo de un muro: cambia su longitud y dirección.",
    "Arrastrar el tirador circular de un mueble: lo rota.",
    "Arrastrar en el vacío: crea una selección por ventana.",
    "Supr o Backspace: elimina la selección.",
])
para("Los valores numéricos se editan en el inspector y se aplican al confirmar el campo. Los cambios son reversibles con Ctrl+Z.")

sub("4.2 Muro")
para("La herramienta Muro (M) dibuja tramos encadenados. Cada tramo es un objeto independiente con longitud, espesor, altura, nivel, capa y aberturas.")
make_table(["Operación", "Cómo"], [
    ["Iniciar", "Clic en el primer punto. Se activa la cadena."],
    ["Añadir tramo", "Clic en el siguiente punto; la cadena continúa desde el extremo."],
    ["Terminar", "Esc, clic derecho o doble clic."],
    ["Ángulo exacto", "Activa Orto (O) o mantén Shift al mover."],
    ["Longitud exacta", "Selecciona el muro y edita Longitud en Propiedades."],
    ["Grosor / altura", "Selecciona el muro y edita Espesor / Altura."],
    ["Unión en esquina", "Termina el tramo sobre el extremo de otro muro; el snap lo ayuda."],
], [4.3, 12.3], font_size=9)
note("El espesor por defecto está en Datos del proyecto. Los valores típicos de dibujo son 100–150 mm para tabiques y 200–250 mm para muros estructurales; el valor definitivo depende del cálculo y la normativa.", "Espesores", "FFF6E3", AMBER)

sub("4.3 Puerta y ventana")
para("Las aberturas no son objetos independientes en el panel: pertenecen al muro. Insértalas con Puerta (P) o Ventana (N) y edítalas desde la ficha del muro.")
bullets([
    "Ancho: dimensión horizontal del hueco.",
    "Alto: altura del hueco.",
    "Posición (%): ubicación del centro de la abertura sobre el muro.",
    "Puerta: hoja y abanico en 2D; en 3D, hueco desde el piso.",
    "Ventana: antepecho y dintel; vidrio en 3D.",
    "Girar hoja: cambia el lado hacia el que abre la puerta.",
    "Invertir bisagra: cambia el lado donde está la bisagra.",
])
para("Los controles Girar hoja e Invertir bisagra se aplican al instante en 2D y 3D. Para ventanas, edita el Antepecho si necesitas otra altura de alféizar.")
para("Para eliminar una abertura, selecciona el muro y pulsa el icono de papelera de la fila correspondiente.")

sub("4.4 Ambiente")
para("La herramienta Ambiente (A) crea un recinto a partir de un área cerrada. Al hacer clic dentro de un recinto, EngDraft detecta el polígono y crea el ambiente. También puedes usar Detectar ambientes para crear todos los recintos cerrados de una vez.")
make_table(["Campo", "Qué hace"], [
    ["Nombre", "Etiqueta del ambiente en el plano y las tablas."],
    ["Acabado", "Madera, baldosa, alfombra, mármol, concreto o césped. Se usa en 3D y en el color base."],
    ["Color", "Color de relleno del ambiente en 2D."],
    ["Área", "Calculada automáticamente; no se edita a mano."],
], [4.0, 12.6], font_size=9)
para("Si la detección falla, revisa que el recinto esté cerrado. Las puertas y ventanas no impiden la detección porque el muro sigue definido; lo que impide detectar es un hueco real entre muros.")

sub("4.5 Mobiliario")
para("La biblioteca incluye muebles de sala, comedor, cocina, baño, dormitorio y exterior. Cada elemento tiene una planta y una representación 3D.")
bullets([
    "Busca por nombre o filtra por categoría.",
    "Haz clic en una tarjeta y luego en el plano.",
    "R rota 90° mientras colocas o con el objeto seleccionado.",
    "En Propiedades puedes editar posición, rotación y nombre.",
    "Duplicar crea una copia desplazada; es útil para sillas, mesas de noche y sanitarios.",
])
para("Los muebles se colocan en la planta activa y se guardan con el proyecto. La biblioteca es local: no descarga modelos de internet.")

sub("4.6 Texto")
para("Texto (T) abre un diálogo con contenido, tamaño y rotación. El texto se dibuja como anotación y se puede mover o editar en Propiedades. Usa textos con moderación: la información principal debe estar en las etiquetas de ambiente y las cotas.")

sub("4.7 Cota")
para("Cota (D) mide entre dos puntos y dibuja líneas de extensión, línea de cota, ticks y texto. La separación se controla con Offset en Propiedades. Las cotas se guardan en la planta activa y se incluyen en la lámina si la opción Cotas está activa.")

sub("4.8 Borrar")
para("Borrar (E) elimina el objeto bajo el cursor. También puedes seleccionar y pulsar Supr. El borrado se puede deshacer con Ctrl+Z. Al borrar un muro se eliminan sus aberturas asociadas; los ambientes no se recalculan automáticamente.")

sub("4.9 Capas")
figure(IMG / "layers.png", "Panel de capas: visibilidad, color, cantidad de objetos y bloqueo.", 16.2)
make_table(["Capa", "Contenido"], [
    ["Muros", "Tramos de muro y sus aberturas."],
    ["Aberturas", "Símbolos de puertas y ventanas."],
    ["Mobiliario", "Muebles y accesorios."],
    ["Ambientes", "Rellenos, nombres y áreas."],
    ["Anotaciones", "Textos."],
    ["Cotas", "Dimensiones."],
], [4.0, 12.6], font_size=9)
para("El icono del ojo muestra u oculta la capa; el candado la bloquea. Una capa oculta no se dibuja ni se puede seleccionar. Una capa bloqueada se ve pero no se puede editar. Usa capas para revisar el plano por partes y para evitar mover elementos por error.")

sub("4.10 Plantas")
para("Cada objeto pertenece a una planta. La pestaña activa determina dónde se dibuja y qué se edita en 2D. En 3D puedes ver todas las plantas o solo la activa.")
bullets([
    "Añade una planta con Añadir planta o con +.",
    "Define elevación y altura; la elevación se usa para apilar en 3D.",
    "Cambia de planta antes de dibujar.",
    "Las láminas eligen la planta que muestran.",
])

sub("4.11 Rejilla, snap y orto")
make_table(["Control", "Qué hace", "Cuándo usarlo"], [
    ["Rejilla (G)", "Muestra una retícula de 250 mm y permite imantar a ella.", "Trazos rápidos y proporciones."],
    ["Snap (S)", "Imanta a extremos, medios, vértices, centros y jambas.", "Unir muros y colocar muebles con precisión."],
    ["Orto (O)", "Restringe el ángulo a múltiplos de 45°.", "Muros horizontales, verticales y en diagonal."],
    ["Ajustar", "Encuadra todo el contenido en la vista.", "Después de cambios de nivel o zoom."],
], [3.5, 9.2, 4.3], font_size=8.8)

sub("4.12 Deshacer, rehacer y autoguardado")
para("Usa los botones Deshacer y Rehacer de la barra de acciones (también están en la barra superior), o Ctrl+Z y Ctrl+Y. El historial cubre dibujo, propiedades, capas, láminas, cambios de planta y eliminación de plantas. El autoguardado guarda el proyecto en el navegador; para conservar una copia fuera del navegador, descarga el .engdraft con Ctrl+S.")
note("Deshacer actúa sobre el proyecto, no sobre la cámara 3D ni el zoom. La barra de acciones indica con su tooltip la última operación que se deshará.", "Consejo", "FFF6E3", AMBER)

# ================================================================== CAP 5
chapter(5, "Vista 3D")
para("La vista 3D es una maqueta de revisión. Se construye automáticamente con los muros, las aberturas, los pisos de los ambientes, el mobiliario y los niveles del proyecto. No es un render fotorrealista: su objetivo es comprobar volúmenes, huecos y distribución.")
figure(IMG / "vista-3d.png", "Vista 3D de la Residencia Aurora con ambos niveles.", 16.4)

sub("5.1 Navegación")
make_table(["Acción", "Control"], [
    ["Orbitar", "Arrastrar con el botón izquierdo."],
    ["Desplazar", "Arrastrar con el botón derecho, botón medio o Shift + arrastrar."],
    ["Zoom", "Rueda del ratón."],
    ["Encuadrar", "Doble clic o botón Encuadrar."],
    ["Presets", "Iso, Planta, Frente, Lateral."],
], [4.0, 12.6], font_size=9)

sub("5.2 Opciones de visualización")
bullets([
    "Techo: añade una losa de cubierta. Oculta el interior; úsalo para la vista exterior.",
    "Muebles: muestra u oculta el mobiliario.",
    "Etiquetas: nombres y áreas de los ambientes visibles.",
    "Ambos niveles / Nivel activo: apila todas las plantas o enfoca solo la activa.",
])
para("Si la maqueta se ve muy cargada, oculta muebles y etiquetas o enfoca un solo nivel. Para revisar la distribución interior, desactiva el techo.")

sub("5.3 Captura y 3D automático en láminas")
para("En la vista 3D, pulsa Captura a lámina para tomar una imagen PNG de la maqueta en la cámara actual y crear una lámina con contenido Perspectiva 3D. Además, cualquier lámina con contenido Perspectiva 3D, Fachada frontal, Fachada posterior o Lateral genera su imagen automáticamente desde el proyecto.")
para("Si cambias muros, huecos o materiales, abre Propiedades de la lámina y pulsa Actualizar vista. Al exportar el PDF, EngDraft vuelve a generar las vistas automáticas para que la entrega esté al día. La captura manual se conserva como imagen personalizada.")
note("Si la vista aparece en blanco, espera a que termine el render y pulsa Actualizar vista. Revisa la miniatura de la galería antes de exportar.", "Consejo", "FFF6E3", AMBER)

sub("5.4 Buenas prácticas")
bullets([
    "Revisa la 3D después de cada cambio importante de muros o niveles.",
    "Comprueba que las puertas y ventanas estén a la altura correcta.",
    "Usa la planta activa para revisar interiores y todas las plantas para la volumetría.",
    "La maqueta no reemplaza un render profesional ni un modelo BIM.",
])

sub("5.5 Revisión rápida de la maqueta")
para("Antes de considerar terminada la revisión 3D, comprueba:")
checklist([
    "El perímetro está cerrado y no hay muros flotantes.",
    "Puertas y ventanas aparecen en el muro correcto y a la altura correcta.",
    "Los niveles están apilados con la elevación prevista.",
    "Los ambientes tienen piso y etiqueta legible.",
    "El mobiliario no atraviesa muros ni queda suspendido.",
    "La cubierta se ve coherente al activar Techo.",
    "La captura que se usará en la lámina está encuadrada.",
])

sub("5.6 Errores visuales frecuentes")
make_table(["Lo que ves", "Posible causa", "Cómo corregirlo"], [
    ["Muros interrumpidos", "Tramos no unidos en la esquina.", "Edita el extremo o vuelve a dibujar con Snap."],
    ["Hueco en el techo", "Aberturas o muro faltante.", "Revisa el muro y la abertura en 2D."],
    ["Mueble atravesado", "Rotación o posición incorrecta.", "Selecciona y corrige X/Y/rotación."],
    ["Nivel flotante", "Elevación mal definida.", "Edita el nivel y ajusta la elevación."],
], [5.0, 5.6, 6.0], font_size=8.6)

# ================================================================== CAP 6
chapter(6, "Láminas y exportación PDF")
para("La vista Láminas compone las hojas de entrega. Cada lámina tiene un tamaño de papel, orientación, cajetín, escala, nivel y contenido. EngDraft genera un PDF vectorial con una página por lámina.")
figure(IMG / "sheets.png", "Galería de láminas del proyecto con vista previa de cada hoja.", 16.2)

sub("6.1 Crear y seleccionar láminas")
bullets([
    "Pulsa Nueva lámina para añadir una hoja.",
    "Haz clic en una tarjeta para seleccionarla y editarla en Propiedades.",
    "Puedes duplicar, subir, bajar o eliminar láminas. El proyecto conserva al menos una.",
    "El código se propone automáticamente (A-01, A-02…), pero se puede editar.",
])

sub("6.2 Cajetines disponibles")
make_table(["Plantilla", "Aspecto", "Uso sugerido"], [
    ["Moderna", "Banda inferior oscura con acento ámbar y retícula.", "Presentaciones y anteproyectos."],
    ["Clásica", "Cajetín inferior con doble borde y celdas.", "Entregas académicas formales."],
    ["Técnica", "Bloque lateral con retícula y tipografía monoespaciada.", "Planos técnicos con notas y cuadros."],
    ["Municipal", "Barra superior y casillas de revisión/firmas.", "Expedientes y revisiones."],
], [3.2, 9.2, 4.6], font_size=8.8)
para("Los cuatro cajetines incluyen logo, proyecto, cliente, ubicación, ingeniero, licencia, escala, fecha, revisión, título y número de lámina, y nivel.")

sub("6.3 Tamaño, orientación y escala")
make_table(["Parámetro", "Opciones", "Recomendación"], [
    ["Tamaño", "A4, A3, A2, A1, Letter, Tabloid", "A3 para plantas de vivienda; A4 para notas."],
    ["Orientación", "Horizontal o vertical", "Horizontal para plantas; vertical para portadas."],
    ["Escala", "1:50, 1:75, 1:100, 1:125, 1:150, 1:200, 1:250", "1:50–1:75 para plantas residenciales."],
], [3.4, 8.4, 5.2], font_size=8.8)
para("Si la escala elegida no cabe en el área de dibujo, EngDraft ajusta automáticamente y anota la escala efectiva. Para mantener una escala fija, elige una hoja más grande o reduce el área dibujada.")

sub("6.4 Contenidos de lámina")
make_table(["Contenido", "Qué muestra"], [
    ["Planta", "Dibujo del nivel con muros, aberturas, mobiliario, ambientes y cotas opcionales."],
    ["Notas y cuadros", "Notas generales, cuadro de ambientes con áreas, cuadro de mobiliario y resumen de superficies."],
    ["Portada", "Título del proyecto, datos, miniatura de planta y lista de láminas."],
    ["Perspectiva 3D", "Imagen automática de la maqueta en perspectiva isométrica. También admite una captura manual desde la vista 3D."],
    ["Fachada frontal", "Elevación frontal generada desde muros, puertas, ventanas y techo."],
    ["Fachada posterior", "Elevación posterior del proyecto."],
    ["Lateral derecha", "Elevación lateral derecha."],
    ["Lateral izquierda", "Elevación lateral izquierda."],
], [4.2, 12.4], font_size=9)
para("Las vistas de fachada se generan automáticamente y se incrustan en el PDF como imágenes de alta resolución. Puedes activar o desactivar nombres de ambientes, mobiliario y cotas en las láminas de planta; las fachadas no usan esas capas porque solo muestran la envolvente y sus huecos.")

sub("6.5 Exportar el PDF")
bullets([
    "Exportar PDF en la barra superior o en la galería genera todas las láminas del proyecto.",
    "PDF de esta lámina, en Propiedades, exporta solo la hoja seleccionada.",
    "El PDF conserva el plano vectorial; las perspectivas y fachadas se incrustan como imágenes de alta resolución.",
    "Cada lámina es una página. El nombre del archivo se toma del proyecto.",
])

sub("6.6 Antes de exportar: revisión de lámina")
checklist([
    "El nombre del proyecto, cliente y ubicación están completos.",
    "La escala indicada coincide con la que necesitas.",
    "El nivel de la lámina es el correcto.",
    "La lámina incluye norte y escala gráfica.",
    "Las cotas y los nombres de ambientes son legibles.",
    "La numeración es correlativa y el PDF tiene todas las páginas.",
])
figure(IMG / "lamina-planta.png", "Lámina de planta con cajetín moderno, cotas, norte y escala.", 16.2)
figure(IMG / "lamina-notas.png", "Lámina de notas y cuadros con cajetín técnico.", 16.2)

# ================================================================== CAP 7
chapter(7, "Archivos, DXF y DWG")
sub("7.1 El archivo .engdraft")
para("El archivo .engdraft es un JSON legible que contiene metadatos, capas, niveles, muros, ambientes, mobiliario, textos, cotas y láminas. Es el formato de trabajo y la copia de seguridad recomendada. Puedes abrirlo en EngDraft y seguir editando.")
bullets([
    "Guardar: disquete de la barra superior o Ctrl+S.",
    "Abrir: icono de carpeta o Ctrl+O.",
    "Arrastrar y soltar: suelta un .engdraft o .json sobre la aplicación.",
    "No lo edites a mano salvo que sepas lo que haces; un error de sintaxis impide abrirlo.",
])

sub("7.2 Autoguardado")
para("Cada cambio se guarda en el navegador después de una breve pausa. La barra superior muestra Guardando o Guardado. Si aparece Sin autoguardado, el navegador no permite almacenamiento local para esa ruta; descarga el .engdraft con frecuencia.")
note("El autoguardado no viaja entre navegadores, equipos ni direcciones web. Si abres la app desde otra carpeta o desde GitHub Pages, verás otro almacenamiento. La copia .engdraft es la única portable.", "Importante", "FDECEC", "C0392B")

sub("7.3 Exportar DXF")
para("El botón DWG/DXF abre un diálogo para exportar la planta activa o todas las plantas. El resultado es un archivo DXF ASCII R12 en milímetros, con capas separadas:")
make_table(["Capa DXF", "Contenido"], [
    ["A-WALL", "Muros y sus contornos."],
    ["A-DOOR", "Puertas, hojas y arcos."],
    ["A-WIND", "Ventanas."],
    ["A-FURN", "Mobiliario."],
    ["A-ROOM", "Contornos, nombres y áreas de ambientes."],
    ["A-TEXT", "Textos."],
    ["A-DIM", "Cotas."],
], [4.2, 12.4], font_size=9)
para("El DXF se puede abrir en AutoCAD, LibreCAD, BricsCAD y otros programas CAD. Las unidades son milímetros y el dibujo está a escala 1:1 en el espacio modelo. Al exportar todos los niveles, se colocan uno al lado del otro para que puedas separarlos o crear layouts en tu CAD.")

sub("7.4 DWG: qué puedes y qué no puedes hacer")
para("El formato .dwg es binario y propietario. Un navegador no puede escribirlo de forma nativa. EngDraft exporta DXF, que es el formato de intercambio estándar de AutoCAD.")
make_table(["Formato", "Qué obtienes", "Cómo se usa"], [
    ["PDF", "Láminas vectoriales listas para imprimir o enviar.", "Entrega final, impresión, revisión."],
    ["DXF", "Geometría editable en CAD, capas y unidades en mm.", "Abrir en AutoCAD y guardar como DWG."],
    ["DWG", "Formato nativo de AutoCAD.", "Se obtiene desde AutoCAD: Abrir DXF → Guardar como DWG."],
], [2.8, 8.4, 5.4], font_size=8.8)
para("Flujo recomendado para entregar DWG: exporta el DXF desde EngDraft, ábrelo en AutoCAD, comprueba capas y unidades, y guarda una copia .dwg. No cambies la escala: el modelo está en milímetros a 1:1.")

sub("7.5 Archivos de ejemplo")
para("La carpeta samples incluye Residencia-Aurora.engdraft, Residencia-Aurora-planos.pdf y Residencia-Aurora.dxf. Úsalos para practicar la apertura, revisar una entrega completa y probar la importación en CAD.")

# ================================================================== CAP 8
chapter(8, "Buenas prácticas de ingeniería")
para("Un plano claro no es el que tiene más líneas, sino el que permite construir y revisar sin ambigüedad. Estas recomendaciones son de dibujo y documentación; no sustituyen el cálculo ni la normativa.")

sub("8.1 Organiza antes de dibujar")
bullets([
    "Define el programa de necesidades y las dimensiones aproximadas.",
    "Decide el número de niveles y la elevación entre ellos.",
    "Dibuja primero la estructura espacial: perímetro, tabiques y circulaciones.",
    "Amuebla después de comprobar que las circulaciones funcionan.",
])

sub("8.2 Unidades y escala")
para("EngDraft trabaja en milímetros y muestra metros. Las cotas se leen en metros. En las láminas, la escala se elige por hoja. Para una vivienda, 1:50 o 1:75 suelen ser adecuadas en A3; 1:100 sirve para plantas generales.")
note("No mezcles escalas en la misma hoja sin indicarlo. Si una lámina se ajusta automáticamente, EngDraft anota la escala efectiva; revisa que sea legible.", "Escala", "FFF6E3", AMBER)

sub("8.3 Muros y aberturas")
make_table(["Elemento", "Criterio de dibujo"], [
    ["Muro exterior", "Continuo, cerrado, con espesor definido. Verifica esquinas."],
    ["Tabique interior", "Une muros existentes; evita extremos sueltos."],
    ["Puerta interior", "900 mm es una referencia habitual; ajusta según el proyecto."],
    ["Puerta de baño", "800–900 mm; comprueba el giro y el espacio libre."],
    ["Ventana", "Define ancho, alto y antepecho; revisa iluminación y ventilación."],
    ["Dinteles", "La vista 3D los genera automáticamente a partir del alto de la abertura."],
], [4.2, 12.4], font_size=8.8)
para("Los valores son referencias de dibujo. El dimensionamiento definitivo debe surgir del cálculo, la normativa y el diseño del proyecto.")

sub("8.4 Ambientes y circulación")
bullets([
    "Nombra cada ambiente según su uso real.",
    "Comprueba que las áreas sean coherentes con el programa.",
    "Deja pasillos de al menos 0.90–1.00 m en viviendas, salvo condiciones específicas.",
    "Evita que una puerta abra contra un mueble o interfiera con otra circulación.",
    "Revisa que todos los ambientes tengan acceso.",
])

sub("8.5 Cotas y anotaciones")
bullets([
    "Acota primero las dimensiones generales y luego las parciales relevantes.",
    "No dupliques cotas innecesariamente.",
    "Coloca el norte y la escala gráfica.",
    "Usa textos breves; la información principal debe estar en el cajetín y las etiquetas.",
    "Revisa que las cotas no se superpongan con muros o muebles.",
])

sub("8.6 Capas y presentación")
para("Mantén las capas ordenadas y usa su visibilidad para generar vistas limpias. Para una entrega, puedes ocultar mobiliario y dejar solo muros, ambientes y cotas; para una presentación, muestra el mobiliario. Recuerda que una capa oculta no se selecciona ni se imprime en la lámina.")
para("El color de capa se usa en el editor; en PDF el plano se dibuja con línea técnica. No dependas del color para transmitir información esencial.")

sub("8.7 Plantas y 3D")
bullets([
    "Comprueba la elevación de cada nivel antes de dibujar.",
    "Revisa que los muros de Planta 2 se apoyen sobre Planta.",
    "Usa la vista 3D para detectar muros faltantes o huecos mal ubicados.",
    "Si una planta no se ve bien, enfoca la planta activa y desactiva el techo.",
])

sub("8.8 Antes de entregar")
checklist([
    "Los datos del proyecto están completos y actualizados.",
    "Todas las plantas tienen muros cerrados y ambientes nombrados.",
    "Las puertas y ventanas están en los muros correctos.",
    "Las cotas generales y el norte están presentes.",
    "La escala y el tamaño de hoja son adecuados.",
    "El PDF tiene el número de páginas previsto y se lee bien.",
    "El archivo .engdraft está guardado como copia de seguridad.",
    "El DXF se abre correctamente si se entregará a CAD.",
])
note("La revisión final debe hacerla una persona. EngDraft no detecta errores de diseño, normativa, estructura ni instalaciones. La responsabilidad profesional sigue siendo del proyectista.", "Aviso", "FDECEC", "C0392B")

# ================================================================== CAP 9
chapter(9, "Ejercicios para estudiantes")
para("Estos ejercicios están pensados para clase o práctica autónoma. Cada uno pide un entregable concreto y se puede evaluar con la rúbrica del final.")

sub("9.1 Ejercicio 1: monoambiente de 6 × 4,5 m")
para("Objetivo: dominar muros, aberturas, un ambiente y una lámina.")
bullets([
    "Crea un proyecto en blanco y dibuja un rectángulo de 6,00 × 4,50 m.",
    "Añade una puerta de entrada de 1,00 m y dos ventanas de 1,20 m.",
    "Detecta el ambiente y nómbralo “Monoambiente”.",
    "Amuebla con cama, mesa, sofá y kitchenette.",
    "Genera una lámina A3 con cajetín Moderna a 1:50.",
])
para("Entregable: PDF de una página y .engdraft.")

sub("9.2 Ejercicio 2: vivienda de 10 × 8 m")
para("Objetivo: resolver una vivienda de dos dormitorios con circulación y documentación.")
bullets([
    "Dibuja el perímetro de 10,00 × 8,00 m y los tabiques interiores.",
    "Crea dos dormitorios, un baño, cocina, sala-comedor y pasillo.",
    "Inserta puertas y ventanas con dimensiones coherentes.",
    "Detecta y nombra todos los ambientes; revisa las áreas.",
    "Amuebla cada ambiente sin bloquear circulaciones.",
    "Añade cotas generales, norte y una lámina de notas.",
])
para("Entregable: PDF de dos láminas (planta y notas) y .engdraft.")

sub("9.3 Ejercicio 3: dúplex de dos niveles")
para("Objetivo: integrar niveles, 3D y captura en lámina.")
bullets([
    "Crea dos niveles con elevación 0,00 y 2,80 m.",
    "Distribuye la planta baja (sala, cocina, baño, escalera) y la planta alta (dormitorios y baño).",
    "Comprueba que la escalera tenga espacio y que los muros se apoyen.",
    "Revisa la 3D en ambos niveles y en nivel activo.",
    "Genera una captura 3D y añádela a una lámina.",
    "Exporta un PDF con planta baja, planta alta y vista 3D.",
])
para("Entregable: PDF de tres páginas, captura 3D y .engdraft.")

sub("9.4 Rúbrica de evaluación")
make_table(["Criterio", "Peso", "Indicador"], [
    ["Muros y cierres", "25%", "Perímetro y tabiques completos, uniones correctas."],
    ["Aberturas y circulación", "20%", "Puertas/ventanas coherentes y circulaciones libres."],
    ["Ambientes y áreas", "20%", "Nombres, áreas y acabados correctos."],
    ["Documentación", "20%", "Cotas, norte, cajetín, escala y PDF legible."],
    ["3D y archivo", "15%", "Maqueta coherente y .engdraft guardado."],
], [4.4, 2.0, 10.2], font_size=8.8, align_center=[1])
note("Entrega también el .engdraft. Un PDF sin archivo editable impide revisar el proceso y corregir el ejercicio.", "Entrega", "E8F3F3", CYAN)

sub("9.5 Sugerencias para docentes")
para("Los ejercicios se pueden adaptar al tiempo de clase y al nivel del grupo. Algunas ideas para integrar EngDraft en la enseñanza:")
bullets([
    "Dedica una sesión corta a la interfaz y otra al tutorial guiado.",
    "Pide dos entregas: una planta limpia y una planta amueblada, para comparar criterios.",
    "Solicita que cada estudiante justifique el ancho de circulaciones y la ubicación de puertas.",
    "Evalúa también el archivo .engdraft, no solo el PDF: permite revisar el proceso.",
    "Usa la rúbrica como coevaluación entre equipos y como lista de corrección.",
])
note("La herramienta no corrige normativa ni cálculo. Las prácticas deben complementarse con revisión docente, normativa local y, cuando corresponda, cálculo estructural.", "Criterio docente", "FDECEC", "C0392B")

# ================================================================== CAP 10
chapter(10, "Preguntas frecuentes")
sub("10.1 Problemas de dibujo")
make_table(["Problema", "Causa probable", "Solución"], [
    ["No se detectan ambientes", "Los muros no cierran el recinto.", "Revisa esquinas y extremos; activa Snap; une los muros."],
    ["No puedo seleccionar un objeto", "Capa oculta o bloqueada.", "Abre Capas y muestra/desbloquea la capa."],
    ["El muro no mide lo que quiero", "Se dibujó a mano.", "Selecciona el muro y edita Longitud en Propiedades."],
    ["La puerta no entra en el muro", "El muro es demasiado corto.", "Aumenta el muro o reduce el ancho de la abertura."],
    ["El mueble queda fuera del ambiente", "Se colocó con el nivel o la vista equivocados.", "Selecciona, edita X/Y o vuelve a colocarlo."],
], [5.3, 5.0, 6.3], font_size=8.4)

sub("10.2 Problemas de 3D y láminas")
make_table(["Problema", "Causa probable", "Solución"], [
    ["La 3D está vacía", "No hay muros en la planta o el módulo aún no cargó.", "Cambia a 3D después de dibujar; espera el render."],
    ["No veo el interior", "El techo está activo.", "Desactiva Techo."],
    ["La lámina se ve pequeña", "La escala elegida no cabe y se ajustó.", "Usa una hoja mayor o una escala menor."],
    ["La lámina 3D no muestra imagen", "La vista aún no se generó.", "Pulsa Actualizar vista en Propiedades de la lámina."],
    ["La fachada no coincide con el plano", "El proyecto cambió después de generar la imagen.", "Pulsa Actualizar vista; al exportar el PDF también se regenera."],
    ["El PDF tarda", "Muchas láminas o imágenes.", "Exporta por partes o usa PDF de esta lámina."],
], [5.3, 5.0, 6.3], font_size=8.4)

sub("10.3 Archivos y compatibilidad")
make_table(["Pregunta", "Respuesta"], [
    ["¿Puedo abrir el .engdraft en AutoCAD?", "No directamente. Exporta DXF desde EngDraft y ábrelo en AutoCAD."],
    ["¿Por qué no hay DWG nativo?", "El navegador no escribe el formato binario propietario. Se exporta DXF, compatible."],
    ["¿Dónde está el autoguardado?", "En el almacenamiento local del navegador. No se sincroniza."],
    ["¿Puedo trabajar sin internet?", "Sí, toda la aplicación es offline."],
    ["¿Puedo usar el móvil?", "Se puede abrir, pero el dibujo preciso está pensado para escritorio."],
], [5.2, 11.4], font_size=8.8)

sub("10.4 Recuperar el trabajo")
para("Si cierras el navegador y el autoguardado no aparece, comprueba que abriste la misma ruta o dirección web. Si cambiaste de equipo o navegador, abre tu copia .engdraft con el icono de carpeta. Si el archivo no abre, verifica que no se haya editado a mano y conserva una copia del original.")

sub("10.5 Buenos hábitos de respaldo")
bullets([
    "Guarda una copia .engdraft al terminar cada sesión importante.",
    "Usa nombres con proyecto, nivel y revisión: Vivienda-Rojas-R1.engdraft.",
    "Conserva una copia del PDF exportado junto al archivo editable.",
    "No dependas solo del autoguardado del navegador.",
    "Antes de una entrega, abre el archivo guardado y comprueba que todo está ahí.",
])

sub("10.6 Si el archivo .engdraft no abre")
make_table(["Posible causa", "Qué revisar"], [
    ["El archivo está incompleto", "Vuelve a descargarlo o usa una copia anterior."],
    ["Se editó a mano y el JSON es inválido", "Restaura la copia original; no modifiques el archivo."],
    ["El archivo pertenece a otra versión", "Abre la versión de EngDraft con la que se creó o recupera una copia."],
    ["El navegador bloquea la lectura", "Copia el archivo a una carpeta local y vuelve a abrirlo."],
], [6.2, 10.4], font_size=8.8)

# ================================================================== ANEXO A
chapter("A", "Atajos de teclado", "ANEXO A")
make_table(["Acción", "Tecla", "Observaciones"], [
    ["Seleccionar", "V", "Herramienta principal."],
    ["Mover vista", "H", "También barra espaciadora + arrastrar."],
    ["Muro", "M", "Trazado encadenado."],
    ["Puerta / Ventana", "P / N", "Clic sobre un muro."],
    ["Ambiente", "A", "Clic dentro de un recinto."],
    ["Mobiliario", "F", "Abre la biblioteca."],
    ["Texto / Cota", "T / D", "Clic para ubicar."],
    ["Borrar", "E", "Clic sobre el objeto."],
    ["Terminar / salir", "Esc", "Cancela la operación actual."],
    ["Deshacer / Rehacer", "Ctrl+Z / Ctrl+Y", "Historial de cambios."],
    ["Guardar / Abrir", "Ctrl+S / Ctrl+O", "Descarga/abre .engdraft."],
    ["Nuevo proyecto", "Ctrl+N", "Abre plantillas."],
    ["Duplicar mueble", "Ctrl+D", "Copia el mueble seleccionado."],
    ["Rotar mueble", "R", "Durante colocación o con el objeto seleccionado."],
    ["Rejilla / Snap / Orto", "G / S / O", "Alternan ayudas de dibujo."],
    ["Vistas 2D / 3D / Láminas", "1 / 2 / 3", "Cambia de modo."],
    ["Ajustar vista", "Shift+F o Home", "Encuadra el contenido."],
    ["Zoom", "+ / −", "Acerca o aleja."],
    ["Ayuda", "? o F1", "Abre la ayuda rápida."],
], [5.2, 4.2, 7.2], font_size=8.5)

# ================================================================== ANEXO B
chapter("B", "Glosario", "ANEXO B")
make_table(["Término", "Definición"], [
    ["Ambiente", "Espacio cerrado de la vivienda con uso definido (sala, dormitorio, baño, etc.)."],
    ["Abertura", "Hueco de puerta, ventana o portón dentro de un muro."],
    ["Cajetín", "Bloque de datos del plano: proyecto, cliente, escala, fecha, número."],
    ["Capa", "Agrupación lógica de objetos que se puede ocultar o bloquear."],
    ["Cota", "Anotación de una dimensión entre dos puntos."],
    ["DXF", "Formato de intercambio de dibujos CAD, abierto y compatible con AutoCAD."],
    ["DWG", "Formato binario nativo de AutoCAD; no se genera directamente desde el navegador."],
    ["Escala", "Relación entre la medida dibujada y la real. 1:50 = 1 m real son 2 cm en papel."],
    ["Lámina", "Hoja de papel configurada con cajetín y contenido."],
    ["Nivel", "Planta de la vivienda con elevación y altura."],
    ["PDF vectorial", "PDF con líneas y texto editables/escalables, no una imagen rasterizada."],
    ["Planta", "Vista superior de la distribución."],
    ["Snap", "Imantación a puntos notables (extremos, medios, centros)."],
    ["Orto", "Restricción de ángulo a múltiplos de 45°."],
], [3.0, 13.6], font_size=8.8)

# ================================================================== ANEXO C
chapter("C", "Checklist de entrega", "ANEXO C")
para("Imprime esta página y revísala antes de exportar. Es una lista de comprobación de dibujo y documentación, no un informe de cálculo.")
sub3("Proyecto y datos")
checklist([
    "Nombre, cliente, ubicación, ingeniero y licencia completos.",
    "Fecha y revisión actualizadas.",
    "Niveles correctos y elevaciones coherentes.",
])
sub3("Plano")
checklist([
    "Perímetro y tabiques cerrados; sin muros sueltos.",
    "Puertas y ventanas en los muros correctos.",
    "Todos los ambientes tienen nombre y área.",
    "Circulaciones libres y puertas sin bloqueos.",
    "Mobiliario suficiente y a escala.",
    "Cotas generales y norte.",
])
sub3("Láminas y archivos")
checklist([
    "Cajetín y escala verificados.",
    "Numeración de láminas correlativa.",
    "PDF generado con todas las páginas.",
    "Captura 3D incluida si se solicitó.",
    "Archivo .engdraft guardado y respaldado.",
    "DXF exportado si se entregará a CAD.",
])
note("Si marcaste todas las casillas, guarda una copia del PDF y del .engdraft en el mismo lugar. La entrega no termina hasta que ambos archivos estén respaldados.", "Entrega final", "E8F3F3", CYAN)

# ================================================================== CIERRE
doc.add_page_break()
h = doc.add_heading("EngDraft en una frase", level=1)
p_border(h, "bottom", AMBER, 12, 8)
para("Dibuja la idea, revísala en 3D y entrégala en PDF o DXF. EngDraft está pensado para que el trabajo técnico empiece rápido y termine documentado.", size=14, color=DARK_HEX, align=WD_ALIGN_PARAGRAPH.LEFT)
para("Gracias por usar EngDraft. Este manual corresponde a la versión 1.6. Los archivos de ejemplo y la documentación técnica se incluyen en la carpeta del proyecto.", space_before=10)

sub("Recursos incluidos")
make_table(["Archivo o carpeta", "Para qué sirve"], [
    ["index.html", "Abrir la aplicación en el navegador."],
    ["samples/", "Proyecto de ejemplo, PDF de cuatro láminas y DXF."],
    ["docs/", "Capturas de la aplicación y de las láminas."],
    ["manual/", "Este manual en PDF y Word, más sus imágenes."],
    ["README.md", "Guía rápida de instalación, uso y publicación."],
], [5.0, 11.6], font_size=8.8)

note("Antes de construir: verifica el proyecto con un profesional habilitado y con la normativa local aplicable. La herramienta ayuda a dibujar y documentar; la responsabilidad del diseño es humana.", "Recordatorio", "FDECEC", "C0392B")

# Pie de cierre
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("ENGDRAFT  ·  MANUAL DE USO  ·  VERSIÓN 1.6  ·  2026")
r.font.name = FONT
r.font.size = Pt(8)
r.font.color.rgb = MUTED
r.bold = True

OUT.parent.mkdir(parents=True, exist_ok=True)
doc.save(str(OUT))
print("Guardado:", OUT)
print("Párrafos:", len(doc.paragraphs), "Tablas:", len(doc.tables), "Figuras:", fig_no)


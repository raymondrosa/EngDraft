# Genera la portada y la captura anotada del manual de EngDraft.
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IMG = ROOT / "img"
FONT = "C:/Windows/Fonts/segoeui.ttf"
FONT_B = "C:/Windows/Fonts/segoeuib.ttf"
FONT_SB = "C:/Windows/Fonts/seguisb.ttf"
FONT_BAHN = "C:/Windows/Fonts/bahnschrift.ttf"

AMBER = (245, 166, 35)
DARK = (17, 24, 32)
DARK2 = (27, 38, 49)
PAPER = (248, 246, 240)
MUTED = (150, 163, 177)


def f(path, size):
    return ImageFont.truetype(path, size)


def rounded(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def cover():
    W, H = 1654, 2339
    im = Image.new("RGB", (W, H), DARK)
    d = ImageDraw.Draw(im)
    # Degradado vertical
    for y in range(H):
        t = y / H
        r = int(17 + (30 - 17) * t)
        g = int(24 + (38 - 24) * t)
        b = int(32 + (50 - 32) * t)
        d.line([(0, y), (W, y)], fill=(r, g, b))
    # Retícula técnica sutil
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, 42):
        gd.line([(x, 0), (x, H)], fill=(255, 255, 255, 8), width=1)
    for y in range(0, H, 42):
        gd.line([(0, y), (W, y)], fill=(255, 255, 255, 8), width=1)
    im = Image.alpha_composite(im.convert("RGBA"), grid).convert("RGB")
    d = ImageDraw.Draw(im)
    # Banda lateral ámbar
    d.rectangle([0, 0, 12, H], fill=AMBER)
    # Logo
    rounded(d, (140, 145, 300, 305), 26, fill=AMBER)
    d.text((180, 165), "E", font=f(FONT_B, 100), fill=DARK)
    d.text((335, 165), "ENGDRAFT", font=f(FONT_B, 62), fill=(246, 249, 251))
    d.text((338, 242), "DISEÑO RESIDENCIAL 2D · 3D", font=f(FONT_BAHN, 23), fill=(163, 177, 190))
    d.text((338, 292), "Por Prof. Raymond Rosa Ávila", font=f(FONT_SB, 22), fill=(158, 174, 188))
    d.text((W - 330, 165), "MANUAL DE USO", font=f(FONT_SB, 22), fill=AMBER)
    d.text((W - 330, 198), "Versión 1.6", font=f(FONT, 19), fill=(139, 154, 168))

    d.text((140, 500), "Manual", font=f(FONT_B, 132), fill=(247, 250, 252))
    d.text((140, 645), "de uso", font=f(FONT_B, 132), fill=(247, 250, 252))
    d.text((145, 815), "Planos residenciales en 2D y 3D", font=f(FONT_SB, 45), fill=AMBER)
    d.rectangle([145, 892, 390, 901], fill=AMBER)

    lines = [
        "Guía práctica para estudiantes de ingeniería y profesionales:",
        "dibujar la planta, insertar muros y aberturas, amueblar,",
        "revisar la maqueta y entregar las láminas en PDF o DXF."
    ]
    y = 950
    for line in lines:
        d.text((147, y), line, font=f(FONT, 29), fill=(206, 216, 225))
        y += 43

    chips = ["PLANO 2D", "MAQUETA 3D", "LÁMINAS A3", "PDF / DXF"]
    x = 145
    for chip in chips:
        tw = d.textlength(chip, font=f(FONT_SB, 19))
        rounded(d, (x, 1090, x + tw + 38, 1140), 12, fill=(34, 47, 61), outline=(78, 96, 112), width=2)
        d.text((x + 19, 1103), chip, font=f(FONT_SB, 19), fill=(236, 243, 248))
        x += tw + 56

    # Tarjeta de captura
    shot = Image.open(IMG / "interface.png").convert("RGB")
    target_w = 1414
    target_h = int(shot.height * target_w / shot.width)
    shot = shot.resize((target_w, target_h), Image.LANCZOS)
    card_x, card_y = 120, 1210
    # sombra
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    rounded(sd, (card_x + 12, card_y + 16, card_x + target_w + 12, card_y + target_h + 16), 22, fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    im = Image.alpha_composite(im.convert("RGBA"), shadow).convert("RGB")
    d = ImageDraw.Draw(im)
    rounded(d, (card_x - 6, card_y - 6, card_x + target_w + 6, card_y + target_h + 6), 20, fill=(238, 234, 224))
    im.paste(shot, (card_x, card_y))
    d = ImageDraw.Draw(im)
    d.text((card_x, card_y + target_h + 24), "Residencia Aurora · proyecto demostración incluido", font=f(FONT, 20), fill=(146, 160, 174))

    d.line([(140, 2200), (W - 140, 2200)], fill=(53, 68, 83), width=1)
    d.text((140, 2222), "Versión 1.6 · 2026 · Prof. Raymond Rosa Ávila", font=f(FONT, 19), fill=(128, 142, 156))
    d.text((W - 300, 2222), "ENGDRAFT", font=f(FONT_B, 21), fill=AMBER)
    im.save(IMG / "cover.png", optimize=True)
    print("cover.png", im.size)


def annotate_interface():
    im = Image.open(IMG / "interface.png").convert("RGB")
    d = ImageDraw.Draw(im)
    marks = [
        (1, 1270, 29, "Barra superior"),
        (2, 1000, 29, "Vistas"),
        (3, 167, 80, "Plantas"),
        (4, 31, 300, "Herramientas"),
        (5, 1248, 80, "Acciones"),
        (6, 250, 130, "Dibujo"),
        (7, 720, 620, "Lienzo"),
        (8, 1503, 132, "Inspector"),
        (9, 820, 987, "Estado"),
    ]
    for n, x, y, _ in marks:
        r = 25
        d.ellipse((x - r, y - r, x + r, y + r), fill=AMBER, outline=(255, 255, 255), width=4)
        text = str(n)
        font = f(FONT_B, 28)
        tw = d.textlength(text, font=font)
        d.text((x - tw / 2, y - 19), text, font=font, fill=DARK)
    im.save(IMG / "interfaz-anotada.png", optimize=True)
    print("interfaz-anotada.png", im.size)


if __name__ == "__main__":
    cover()
    annotate_interface()

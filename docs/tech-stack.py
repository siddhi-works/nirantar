from PIL import Image, ImageDraw, ImageFont

rows = [
    ("UI framework", "React 19 + TypeScript (strict)", "All screens: login, doctor, nurse and patient views"),
    ("Build / dev server", "Vite", "npm run dev, production build"),
    ("State", "Zustand", "Login session, open patient, vitals, uploads, source panel, toasts"),
    ("Icons", "lucide-react", "Interface icons"),
    ("Styling", "Plain CSS with design tokens", "All layout and look; no Tailwind or component library"),
    ("Fonts", "Outfit (headings), Inter (text)", "Installed with the app, works offline"),
    ("Charts", "Hand-built SVG in React", "Trend charts, medicine timeline, sparklines"),
    ("Source viewer", "Plain React", "Draws the slip and highlights the exact cited text"),
    ("Original documents", "PDFs in public/docs/", "Opened in a new tab at the visit's page"),
    ("Data extraction", "Python + openpyxl", "Reads your Excel workbook into his.json"),
    ("Data layer", "Plain TypeScript", "Parses values, computes trends and checks, applies service rules"),
    ("API layer", "One interface in src/api/", "The only thing screens call; swap in a real backend later"),
    ("Dashboard content", "TypeScript data file", "Schedules, notifications, nurse tasks, login details"),
    ("Tests", "Vitest (48 tests)", "Parsing, computed numbers, service rules"),
    ("Type checking", "tsc", "Catches type errors"),
    ("Runtime", "Node.js", "Needed to run it"),
]
head = ("Layer", "Technology", "What it does here")

def font(sz, bold=False):
    for p in (["C:/Windows/Fonts/segoeuib.ttf"] if bold else ["C:/Windows/Fonts/segoeui.ttf"]) + ["C:/Windows/Fonts/arial.ttf"]:
        try: return ImageFont.truetype(p, sz)
        except OSError: pass
    return ImageFont.load_default()

INK, MUTED, LINE, CANVAS, ALT = (26, 47, 51), (91, 103, 112), (229, 231, 235), (247, 245, 240), (251, 250, 247)
S = 2  # supersample for crisp text
W = 1500 * S
pad, rh, hh = 40 * S, 52 * S, 56 * S
cols = [pad, pad + 290 * S, pad + 720 * S]
title_h = 110 * S
H = title_h + hh + rh * len(rows) + 70 * S
img = Image.new("RGB", (W, H), CANVAS)
d = ImageDraw.Draw(img)
d.text((pad, 30 * S), "Nirantar — tech stack", font=font(34 * S, True), fill=INK)
d.text((pad, 74 * S), "React front end on a local data layer built from the HIS workbook", font=font(16 * S), fill=MUTED)

y = title_h
d.rounded_rectangle((pad, y, W - pad, y + hh), radius=6 * S, fill=INK)
for x, t in zip(cols, head):
    d.text((x + 18 * S, y + 17 * S), t.upper(), font=font(14 * S, True), fill=(255, 255, 255))
y += hh
for i, (a, b, c) in enumerate(rows):
    d.rectangle((pad, y, W - pad, y + rh), fill=(255, 255, 255) if i % 2 == 0 else ALT)
    d.line((pad, y + rh, W - pad, y + rh), fill=LINE, width=S)
    d.text((cols[0] + 18 * S, y + 13 * S), a, font=font(17 * S, True), fill=INK)
    d.text((cols[1] + 18 * S, y + 13 * S), b, font=font(17 * S), fill=INK)
    d.text((cols[2] + 18 * S, y + 13 * S), c, font=font(16 * S), fill=MUTED)
    y += rh
d.rectangle((pad, title_h + hh, W - pad, y), outline=LINE, width=S)
d.text((pad, y + 22 * S), "Not used: a real login, a database, a server, an AI model or a router.", font=font(15 * S), fill=MUTED)
img = img.resize((W // S, H // S), Image.LANCZOS) if False else img
img.save("tech-stack.png")
print(img.size)

from pathlib import Path

from PIL import Image, ImageDraw


base = Path("public/icons")
names = ["database.png", "quest.png", "supervisor.jpg", "planejador.png", "designer.png"]
thumbs = []
for name in names:
    path = base / name
    if path.exists():
        thumbs.append((name, Image.open(path).convert("RGB").resize((160, 160))))

out = Image.new("RGB", (160 * len(thumbs), 190), (5, 12, 28))
draw = ImageDraw.Draw(out)
for i, (name, image) in enumerate(thumbs):
    x = i * 160
    out.paste(image, (x, 0))
    draw.text((x + 8, 166), name, fill=(220, 230, 255))

out.save(base / "preview-white-owls.jpg", quality=92)
print(base / "preview-white-owls.jpg")

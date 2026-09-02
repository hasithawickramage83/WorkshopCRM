import fitz
import os

doc = fitz.open(r"C:\Users\admin\Documents\sample invoice.pdf")
page = doc[0]
out = r"c:\CeylonAutomobile\CRM\frontend\public\invoice-assets"
os.makedirs(out, exist_ok=True)

w = page.rect.width
h = page.rect.height
matrix = fitz.Matrix(4, 4)

clips = [
    ("top-banner.png", fitz.Rect(0, 0, w, 52)),
    ("logo-block.png", fitz.Rect(28, 48, 290, 108)),
    ("bottom-bar.png", fitz.Rect(0, h - 42, w - 55, h)),
]

for name, clip in clips:
    pix = page.get_pixmap(matrix=matrix, clip=clip)
    pix.save(os.path.join(out, name))
    print("saved", name, int(clip.width), int(clip.height))

for i, img in enumerate(page.get_images(full=True)):
    xref = img[0]
    base = doc.extract_image(xref)
    ext = base["ext"]
    if base["width"] < 100:
        path = os.path.join(out, f"icon-{i}.{ext}")
        with open(path, "wb") as f:
            f.write(base["image"])
        print("saved icon", path)

print("done")

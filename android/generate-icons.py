"""Pakovanje Dendro Map PNG mastera u web/Android veličine (Pillow)."""
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
MASTER=ROOT/'docs/DENDRO_MAP_ICON.png'
BG=(0,43,24,255)
image=Image.open(MASTER).convert('RGBA')
def icon(size,scale=1,background=None,round_background=False):
    canvas=Image.new('RGBA',(size,size),(0,0,0,0))
    if background:
        if round_background:ImageDraw.Draw(canvas).ellipse((0,0,size-1,size-1),fill=background)
        else:canvas.paste(background,(0,0,size,size))
    n=round(size*scale);art=image.resize((n,n),Image.Resampling.LANCZOS)
    canvas.alpha_composite(art,((size-n)//2,(size-n)//2))
    return canvas
def save(im,path):
    path.parent.mkdir(parents=True,exist_ok=True);im.save(path,optimize=True)
for size,name in [(192,'icon-192.png'),(512,'icon-512.png'),(180,'apple-touch-icon.png')]:
    save(icon(size),ROOT/name)
# Čitav kvadrat ostaje unutar centralnog kruga (80% platna) maskable ikonice.
save(icon(512,.54,BG),ROOT/'icon-maskable.png')
res=ROOT/'android/app/src/main/res'
save(icon(512),res/'drawable/splash_logo.png')
for density,scale in [('mdpi',1),('hdpi',1.5),('xhdpi',2),('xxhdpi',3),('xxxhdpi',4)]:
    directory=res/('mipmap-'+density)
    save(icon(round(48*scale)),directory/'ic_launcher.png')
    save(icon(round(48*scale),.64,BG,True),directory/'ic_launcher_round.png')
    # 42% stranice: dijagonala <61% i svi pikseli unutar centralnih 66dp.
    save(icon(round(108*scale),.42),directory/'ic_launcher_foreground.png')

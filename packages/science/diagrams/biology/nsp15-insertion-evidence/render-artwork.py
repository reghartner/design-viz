"""Rebuild original explanatory artwork and aggregate chart and embed it in the editable spec + starter.
Requires Pillow. Values: Bianco et al., doi:10.64898/2026.08.15.744938,
Results 110–146 / Fig. 2. No paper figure pixels are used.
"""
import base64
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
# Prefer an installed open font; macOS fallback for the authoring workstation.
def font_path(bold):
    paths = (["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"] if bold else ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"])
    return next(path for path in paths if Path(path).exists())

im = Image.new("RGB", (1500, 680), "#101d2b")
d = ImageDraw.Draw(im)
def text(x, y, value, size=30, color="#dfeaf1", bold=False):
    d.text((x, y), value, font=ImageFont.truetype(font_path(bold), size), fill=color)

text(36, 22, "THE CLASS OF INSERTION MATTERS", 40, bold=True)
text(36, 76, "HCoV-OC43/fsGFP · unique events per million viral reads", 30, "#a8becd")
for x, label, color in [(36, "WT NSP15", "#68e0cd"), (375, "Inactive NSP15", "#eca976")]:
    d.rounded_rectangle((x, 132, x+27, 157), 4, fill=color)
    text(x+39, 126, label, 30)
text(1320, 126, "WT / inactive", 23)
rows = [("All ≥2 nt", 33.9, 6.93, "4.9×"), ("Distal ≥11 nt*", 16.7, .2, "83.5×"), ("Tandem ≥11 nt*", .98, .99, "0.99×")]
left, width = 366, 800
for i, (label, wt, inactive, ratio) in enumerate(rows):
    y = 192 + i*126
    text(36, y+23, label, 33, bold=True)
    for value, dy, color in [(wt, 0, "#68e0cd"), (inactive, 48, "#eca976")]:
        d.rounded_rectangle((left, y+dy, left+width, y+dy+31), 4, fill="#223346")
        d.rectangle((left, y+dy, left+value/35*width, y+dy+31), fill=color)
        text(1187, y+dy-5, f"{value:g}", 33, color, True)
    text(1353, y+20, ratio, 32, bold=True)
for value in [0, 10, 20, 30, 35]:
    x = left+value/35*width
    d.line((x, 546, x, 555), fill="#7590a6", width=2)
    text(x-12, 564, str(value), 27, "#a8becd")
text(36, 613, "*Mapped viral origin · shared linear scale · Fig. 2 · paper rounds distal ratio to 84×", 27, "#a8becd")
im.save(HERE / "oc43-comparison.png", optimize=True)

f = font_path(False)
fb = font_path(True)
im=Image.new('RGB',(1100,720),'#f1f6f5');dr=ImageDraw.Draw(im)
def text(x,y,s,n=32,col='#233640',bold=False):dr.text((x,y),s,font=ImageFont.truetype(fb if bold else f,n),fill=col)
text(40,30,'A REPORTER THAT STARTS DARK',40,bold=True);text(40,90,'Cells read a message in groups of three.',32)
for y,title,shift,c,on in [(170,'Wrong grouping → GFP OFF',1,'#8e9caa',False),(430,'Frame restored → GFP ON',0,'#28a96d',True)]:
 text(40,y,title,36,c,True)
 for i in range(12):
  x=70+i*60;dr.rounded_rectangle((x,y+67,x+48,y+113),5,fill='#c7d2da' if not on else '#9ce3bd')
 for i in range(4):
  x=70+i*180+shift*30;dr.line((x,y+125,x,y+137,x+164,y+137,x+164,y+125),fill=c,width=5)
 dr.rounded_rectangle((850,y+60,1035,y+140),15,fill='#dce3e8' if not on else '#1b9458');text(874,y+82,'OFF' if not on else 'GREEN',32,'#405363' if not on else 'white',True)
text(40,350,'A rare insertion or deletion can restore the frame.',32)
text(40,630,'Boxes are symbolic: no nucleotide sequence is shown.',29)
im.save(HERE/'reporter-frame.png',optimize=True)

im=Image.new('RGB',(800,630),'#f1f6f5');dr=ImageDraw.Draw(im)
f=font_path(False);fb=font_path(True)
for i,(title,sub) in enumerate([('Sequencing reads','Evidence from sampled viral RNA'),('Candidate insertion calls','Added material detected in alignments'),('Origin + destination','Tandem, distal and other classes'),('Normalized class comparison','Unique events / million viral reads'),('Mechanism inference','Activity contrast + artifact controls')]):
 y=16+i*123;dr.rounded_rectangle((45,y,755,y+95),14,fill=['#dce9ed','#dce9ed','#d3eee8','#dce9ed','#dfddf1'][i]);dr.ellipse((62,y+19,118,y+75),fill='#326d6a');dr.text((81,y+28),str(i+1),font=ImageFont.truetype(fb,30),fill='white');dr.text((139,y+15),title,font=ImageFont.truetype(fb,31),fill='#203e45');dr.text((139,y+56),sub,font=ImageFont.truetype(f,24),fill='#405b63')
 if i<4:dr.line((400,y+98,400,y+116),fill='#326d6a',width=4);dr.polygon([(393,y+110),(407,y+110),(400,y+120)],fill='#326d6a')
im.save(HERE/'analysis-ladder.png',optimize=True)

spec_path = HERE / "nsp15-insertion-evidence.spec.json"
spec = json.loads(spec_path.read_text())
assets = {"comparison": "oc43-comparison.png", "frame": "reporter-frame.png", "ladder": "analysis-ladder.png"}
for section in spec["page"]["sections"]:
    for panel in section.get("diagram", {}).get("panels", []):
        if panel["id"] in assets:
            panel["src"] = "data:image/png;base64," + base64.b64encode((HERE / assets[panel["id"]]).read_bytes()).decode()
spec_path.write_text(json.dumps(spec, indent=2) + "\n")
(HERE.parents[2] / "starters/nsp15-insertion-evidence.json").write_bytes(spec_path.read_bytes())

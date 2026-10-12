"""Samostalna slika/PDF simulacije iz stvarnih računica aplikacije."""
from pathlib import Path
import json,csv,math,os,sys
os.environ.setdefault('MPLCONFIGDIR','/tmp/dendro-matplotlib')
os.environ.setdefault('XDG_CACHE_HOME','/tmp/dendro-plot-cache')
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.path import Path as MPath
from matplotlib.patches import Polygon,Patch

teams='--teams' in sys.argv
out=Path('outputs/doznaka-two-teams' if teams else 'outputs/doznaka-sixdays');data=json.loads((out/'simulation.json').read_text())
origin=data['origin'];R=6371000;cos=math.cos(math.radians(origin[1]))
def xy(coords):
 a=np.asarray(coords);return np.column_stack(((a[:,0]-origin[0])*math.pi/180*R*cos,(a[:,1]-origin[1])*math.pi/180*R))
ring=xy(data['project']['boundary_geojson']['coordinates'][0]);boundary=MPath(ring)
x=np.arange(-50,971,5);y=np.arange(-50,701,5);X,Y=np.meshgrid(x,y)
H=420+.35*Y+14*np.sin(X/120)+7*np.sin(Y/90)+.02*X
inside=boundary.contains_points(np.column_stack((X.ravel(),Y.ravel()))).reshape(X.shape)
dx=.02+14/120*np.cos(X/120);dy=.35+7/90*np.cos(Y/90);slope=np.hypot(dx,dy)*100
data['terrainStats']={'minM':float(np.min(H[inside])),'maxM':float(np.max(H[inside])),'slopeMinPct':float(np.min(slope[inside])),'slopeMaxPct':float(np.max(slope[inside])),'above30Pct':float(np.mean(slope[inside]>30)*100)}
colors={'A':'#247B57','B':'#287FC4','C':'#CA8630','D':'#8055AF'}
fmt=lambda v:f'{v:.2f}'.replace('.',',')
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':9,'axes.edgecolor':'#B9C7C5','text.color':'#12382F','axes.labelcolor':'#46615A'})
fig=plt.figure(figsize=(13.8,11),facecolor='#F6F8F5');grid=fig.add_gridspec(3,4,height_ratios=[.2,3.9,1.8],left=.06,right=.96,top=.89,bottom=.10,wspace=.32,hspace=.24)
fig.text(.06,.965,'DENDRO MAP  /  DOZNAKA',size=10,weight='bold',color='#287352')
fig.text(.06,.931,'Dvije ekipe · šest dana · 60 pojaseva' if teams else 'Jedan iznad drugog · šest dana · 60 pojaseva',size=22,weight='bold')
fig.text(.06,.903,'SIMULACIJA — izmišljeni odjel i reljef; površine računaju stvarne funkcije aplikacije.',size=10,color='#6B6F61')
ax=fig.add_subplot(grid[1,:3]);ax.set_facecolor('white')
def map_draw(a,last=6,small=False):
 a.pcolormesh(X,Y,np.ma.masked_where(~inside,H),cmap='Greys',vmin=150,vmax=1500,shading='nearest',rasterized=True)
 cs=a.contour(X,Y,np.ma.masked_where(~inside,H),levels=np.arange(400,681,20),colors='#819087',linewidths=.6,alpha=.6)
 if not small:a.clabel(cs,inline=True,fontsize=8,fmt='%d m')
 for f in data['bands']['features']:
  if f['properties']['day']>last:continue
  g=f['geometry'];polys=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
  for rings in polys:
   a.add_patch(Polygon(xy(rings[0]),closed=True,facecolor=colors[f['properties']['uid']],edgecolor='none',alpha=.26))
 for s in data['sessions']:
  if s['day']>last:continue
  p=xy(s['coordinates']);a.plot(p[:,0],p[:,1],color=colors[s['uid']],lw=.9 if small else 1.35)
 a.plot(ring[:,0],ring[:,1],color='#173C30',lw=1.6 if small else 2.3)
 a.set_aspect('equal');a.set_xlim(-40,960);a.set_ylim(-30,700)
 if small:a.set_xticks([]);a.set_yticks([])
map_draw(ax)
ax.set_xlabel('Lokalna udaljenost istok–zapad (m)');ax.set_ylabel('Lokalna udaljenost jug–sjever (m)')
ax.annotate('S',xy=(925,665),xytext=(925,600),ha='center',arrowprops={'arrowstyle':'-|>','color':'#183F31','lw':1.7},weight='bold')
ax.annotate('Viši dio odjela',xy=(430,625),xytext=(430,684),ha='center',size=9,arrowprops={'arrowstyle':'->','color':'#566B5F'})
ax.annotate('Početak rada u nižem dijelu',xy=(300,33),xytext=(300,-20),ha='center',size=9,arrowprops={'arrowstyle':'->','color':'#566B5F'})
ax.plot([680,780],[15,15],color='#183F31',lw=3);ax.text(730,28,'100 m',ha='center',size=8)
ax.legend(handles=[Patch(facecolor=colors[u],label=f'Projektant {i+1}') for i,u in enumerate(colors)],loc='upper left',ncol=2,fontsize=8,framealpha=.95)
panel=fig.add_subplot(grid[1,3]);panel.axis('off');panel.set_facecolor('white')
lines=[('ODJEL',fmt(data['areaHa'])+' ha'),('GPS POJASEVI — UNIJA',fmt(data['coveredHa'])+' ha'),('IZVAN POJASEVA',fmt(data['remainingHa'])+' ha'),('PREKLOP PROJEKTANATA',fmt(data['overlapHa'])+' ha')]
pos=.96
for label,value in lines:
 panel.text(0,pos,label,size=8,weight='bold',color='#63756A');panel.text(0,pos-.065,value,size=21,weight='bold');pos-=.12
panel.text(0,pos+.02,f"Procijenjena pokrivenost: {data['coveredHa']/data['areaHa']*100:.1f}%".replace('.',','),size=10,weight='bold');pos-=.09
panel.text(0,pos,'PO PROJEKTANTU',size=9,weight='bold');pos-=.06
for i,u in enumerate(colors):
 panel.text(0,pos,f"●  Projektant {i+1}",color=colors[u],size=10);panel.text(.69,pos,fmt(data['perUserHa'][u])+' ha',ha='left',size=10);pos-=.055

stats=data['terrainStats'];fig.text(.06,.876,f"Sintetički reljef: {stats['minM']:.0f}–{stats['maxM']:.0f} m · nagib {stats['slopeMinPct']:.0f}–{stats['slopeMaxPct']:.0f}% · iznad 30%: {stats['above30Pct']:.0f}% odjela",size=9,color='#68796F')
# Šest malih karata pokazuju napredovanje od dna prema vrhu.
row=grid[2,:].subgridspec(1,6,wspace=.18)
for i,d in enumerate(data['daily']):
 a=fig.add_subplot(row[0,i]);map_draw(a,d['day'],True)
 a.set_title(f"DAN {d['day']} · {d['newBands']} pojaseva",size=8,weight='bold',pad=9)
 a.text(.5,-.1,fmt(d['cumulativeHa'])+' ha ukupno',transform=a.transAxes,ha='center',size=8)
fig.text(.06,.082,'Svaki: 15 pojaseva (2 ili 3 dnevno). Između pojaseva snimanje je pauzirano. Ukupno je unija, bez dupliranja preklopa.',size=8,color='#6E756D')
fig.text(.06,.063,'Dvije ekipe zbog orografije / velikog odjela. U svakoj ekipi projektanti rade jedan iznad drugog.' if teams else 'Četiri projektanta rade jedan iznad drugog, po izohipsama. Napredovanje: niži → viši dio odjela.',size=9)
fig.text(.06,.044,'Površine su tlocrtne. GPS bafer je do 20 m sa svake strane; obojena površina je procjena kretanja, a ne potvrda doznake svakog stabla.',size=8,color='#6E756D')
fig.text(.06,.026,'Sivi dijelovi su izvan GPS pojaseva. Izohipse: 20 m. Lokalna šema; nije katastarska karta niti stvarni plan za sječu.',size=8,color='#6E756D')
fig.savefig(out/'poligon-doznaka.png',dpi=200,facecolor=fig.get_facecolor());fig.savefig(out/'poligon-doznaka.pdf',facecolor=fig.get_facecolor());plt.close(fig)
(out/'simulation.json').write_text(json.dumps(data,ensure_ascii=False))
with (out/'pregled-po-danima.csv').open('w',newline='',encoding='utf-8-sig') as f:
 w=csv.writer(f,delimiter=';');w.writerow(['Dan','Pojasevi po projektantu','Ukupno novih pojaseva','Ukupno pokriveno ha']);w.writerows([[d['day'],d['perPerson'],d['newBands'],fmt(d['cumulativeHa'])] for d in data['daily']])
print(json.dumps(data['terrainStats']));print(out/'poligon-doznaka.png')

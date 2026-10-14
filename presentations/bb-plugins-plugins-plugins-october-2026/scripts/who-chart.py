# Builds images/intro-who-chart.png for slide 02: commits per year to
# WordPress.org plugins (wordpress-commits.tsv, from plugins.trac.wordpress.org)
# beside commits to this repository's bb plugins. Rerun before the talk, since
# the bb count grows with every commit:
#   python3 scripts/who-chart.py && node scripts/render.mjs who-chart
import email.utils,collections,os,subprocess
HERE=os.path.dirname(os.path.abspath(__file__))
wy=collections.Counter(); wm=collections.Counter()
for l in open(os.path.join(HERE,'wordpress-commits.tsv')):
    d=email.utils.parsedate_to_datetime(l.split('\t')[0]); wy[d.year]+=1; wm[(d.year,d.month)]+=1
repo=os.path.abspath(os.path.join(HERE,'..','..','..'))
def months(where,*args):
    out=subprocess.run(['git','-C',where,'log','--format=%ad|%an','--date=format:%Y-%m',*args],capture_output=True,text=True,check=True).stdout.split('\n')
    return [l.split('|')[0] for l in out if l and 'dependabot' not in l.lower()]
# The plugins lived in ~/.dotfiles under bb/plugins until they moved here on
# September 14; count both, leaving out the talk itself and Dependabot.
dates=months(os.path.expanduser('~/.dotfiles'),'--until=2026-09-14','--','bb/plugins')
dates+=months(repo,'--','.',':(exclude)presentations')
bm=collections.Counter((int(d[:4]),int(d[5:])) for d in dates)
bbtot=sum(bm.values())
BLUE="#3858e9"; ORANGE="#e8590c"; GREY="#666"
FONT="-apple-system,system-ui,sans-serif"
def page(svg,w=1160,h=470):
    return f'<html><body style="margin:0;width:{w}px;height:{h}px;overflow:hidden;background:#fff;font-family:{FONT};color:#222">{svg}</body></html>'
def avatar(x,y,r):
    return (f'<defs><clipPath id="av"><circle cx="{x+r}" cy="{y+r}" r="{r}"/></clipPath></defs>'
            f'<image href="avatar.jpg" x="{x}" y="{y}" width="{2*r}" height="{2*r}" clip-path="url(#av)"/>')
def yearly(x0,y0,w,h,years=range(2009,2027)):
    years=list(years); n=len(years); bw=w/n; mx=bbtot
    s=[]
    for i,yr in enumerate(years):
        x=x0+i*bw+bw*0.15; bwid=bw*0.7
        v=wy.get(yr,0) if yr<2026 else 0
        b=bbtot if yr==2026 else 0
        if v:
            bh=h*v/mx; s.append(f'<rect x="{x:.1f}" y="{y0+h-bh:.1f}" width="{bwid:.1f}" height="{bh:.1f}" rx="3" fill="{BLUE}"/>')
            s.append(f'<text x="{x+bwid/2:.1f}" y="{y0+h-bh-6:.1f}" font-size="15" text-anchor="middle" fill="{GREY}">{v}</text>')
        if b:
            bh=h*b/mx; s.append(f'<rect x="{x:.1f}" y="{y0+h-bh:.1f}" width="{bwid:.1f}" height="{bh:.1f}" rx="3" fill="{ORANGE}"/>')
        s.append(f'<text x="{x+bwid/2:.1f}" y="{y0+h+22}" font-size="15" text-anchor="middle" fill="{GREY}">\'{yr%100:02d}</text>')
    return "".join(s), x0+(n-1)*bw+bw*0.15, bw*0.7
def monthly(x0,y0,w,h):
    months=[(y,m) for y in range(2009,2027) for m in range(1,13) if (y,m)<=(2026,10)]
    n=len(months); bw=w/n; mx=max(bm.values()); s=[]
    for i,k in enumerate(months):
        x=x0+i*bw
        v=wm.get(k,0); b=bm.get(k,0)
        if v: bh=h*v/mx; s.append(f'<rect x="{x:.2f}" y="{y0+h-bh:.1f}" width="{bw*0.8:.2f}" height="{bh:.1f}" fill="{BLUE}"/>')
        if b: bh=h*b/mx; s.append(f'<rect x="{x:.2f}" y="{y0+h-bh:.1f}" width="{bw*0.8:.2f}" height="{bh:.1f}" fill="{ORANGE}"/>')
        if k[1]==1 and k[0]%2==1: s.append(f'<text x="{x:.1f}" y="{y0+h+22}" font-size="15" text-anchor="start" fill="{GREY}">{k[0]}</text>')
    s.append(f'<line x1="{x0}" x2="{x0+w}" y1="{y0+h}" y2="{y0+h}" stroke="#ccc"/>')
    return "".join(s)
legend=lambda x,y: (f'<rect x="{x}" y="{y-13}" width="14" height="14" rx="3" fill="{BLUE}"/><text x="{x+22}" y="{y}" font-size="19">WordPress.org plugin commits</text>'
                    f'<rect x="{x}" y="{y+17}" width="14" height="14" rx="3" fill="{ORANGE}"/><text x="{x+22}" y="{y+30}" font-size="19">bb plugin commits</text>')
# A: avatar left, yearly chart right
c,bx,bwid=yearly(330,40,810,380)
a=f'<svg width="1160" height="470">{avatar(10,95,140)}{c}<text x="{bx+bwid}" y="28" font-size="20" text-anchor="end" font-weight="600" fill="{ORANGE}">21 bb plugins, {bbtot} commits in 7 weeks</text>{legend(340,40)}</svg>'
open(os.path.join(HERE,'who-chart.html'),'w').write(page(a))
print(dict(wy), bbtot)

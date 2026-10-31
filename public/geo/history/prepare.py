"""Reproducible simplification of GPL-3.0 historical-basemaps GeoJSON.
Usage: python3 public/geo/history/prepare.py INPUT_DIRECTORY COUNTRIES_TS OUTPUT_DIRECTORY
Originals: https://github.com/aourednik/historical-basemaps/tree/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson
The source data and adapted geometry retain GPL-3.0. This conversion script is GPL-3.0.
"""
import json, math, pathlib, re, sys
TOLERANCE=.12

def simplify(points):
    if len(points)<5:return points
    keep={0,len(points)-1};pending=[(0,len(points)-1)]
    while pending:
        first,last=pending.pop();a,b=points[first],points[last]
        dx=b[0]-a[0];dy=b[1]-a[1];den=dx*dx+dy*dy
        farthest=-1;distance=TOLERANCE*TOLERANCE
        for i in range(first+1,last):
            p=points[i];t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)) if den else 0
            d=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2
            if d>distance:distance=d;farthest=i
        if farthest>=0:keep.add(farthest);pending.extend([(first,farthest),(farthest,last)])
    result=[points[i] for i in sorted(keep)]
    return result if len(result)>=4 else points

def ring(points):
    output=[]
    for p in simplify(points):
        p=[round(float(p[0]),3),round(float(p[1]),3)]
        if not output or p!=output[-1]:output.append(p)
    if output and output[0]!=output[-1]:output.append(output[0])
    return output if len(output)>=4 else [[float(p[0]),float(p[1])] for p in points]

def geometry(g):
    if not g:return None
    if g['type']=='Polygon':return {'type':'Polygon','coordinates':[ring(p) for p in g['coordinates']]}
    if g['type']=='MultiPolygon':return {'type':'MultiPolygon','coordinates':[[ring(p) for p in polygon] for polygon in g['coordinates']]}
    return None

def main():
    source,countries_file,destination=map(pathlib.Path,sys.argv[1:]);destination.mkdir(parents=True,exist_ok=True)
    countries=json.loads(re.search(r'export const countries: Country\[\] = (\[.*?\]);',countries_file.read_text(),re.S).group(1))
    codes={c['nameEn'].casefold():c['code'] for c in countries}
    codes.update({'siam':'TH','ceylon':'LK','burma':'MM','persia':'IR','united states of america':'US','great britain':'GB'})
    for path in sorted(source.glob('world_*.geojson')):
        original=json.loads(path.read_text());features=[]
        for i,f in enumerate(original['features']):
            g=geometry(f.get('geometry'))
            if not g:continue
            p=f.get('properties') or {};name=p.get('NAME') or p.get('ABBREVN') or p.get('SUBJECTO') or 'Unspecified region'
            features.append({'type':'Feature','id':i,'properties':{'name':name,'subject':p.get('SUBJECTO'),'precision':p.get('BORDERPRECISION'),'code':codes.get(name.casefold())},'geometry':g})
        result={'type':'FeatureCollection','features':features}
        out=destination/path.name;out.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
        print(path.name,len(features),path.stat().st_size,'=>',out.stat().st_size,flush=True)
if __name__=='__main__':main()

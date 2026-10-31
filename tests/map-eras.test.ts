import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { getMapEra, mapEras } from '../src/lib/map-eras';

type GeoFeature = {properties:{name:string;code:string|null;precision:number|null};geometry:{type:'Polygon'|'MultiPolygon';coordinates:number[][][]|number[][][][]}};

test('historical year selection uses real earlier snapshots without fabricated interpolation',()=>{
  assert.equal(mapEras.length,14);
  assert.equal(getMapEra(1800).year,1800);
  assert.equal(getMapEra(1814).year,1800);
  assert.equal(getMapEra(1815).year,1815);
  assert.equal(getMapEra(1850).year,1815);
  assert.equal(getMapEra(1918).year,1914);
  assert.equal(getMapEra(2026).year,2010);
  assert.ok(mapEras.every((era,i)=>!i||era.year>mapEras[i-1].year));
});

test('compressed historical geography retains closed valid rings, labels, and distinct eras',()=>{
  let bytes=0,featureCount=0;const namesByYear=new Map<number,Set<string>>();
  for(const era of mapEras){
    assert.equal(era.license,'GPL-3.0');
    assert.ok(era.source.includes('da7a4b735ecef70aebdc9c73e409d8a2500d50f3'));
    const path=join(process.cwd(),'public',era.file);bytes+=statSync(path).size;
    const data=JSON.parse(gunzipSync(readFileSync(path)).toString()) as {type:string;features:GeoFeature[]};
    assert.equal(data.type,'FeatureCollection');assert.ok(data.features.length>150);
    const names=new Set<string>();namesByYear.set(era.year,names);
    for(const feature of data.features){
      featureCount++;names.add(feature.properties.name);
      assert.ok(feature.properties.name.length>0);
      if(/Ottoman Empire|Soviet Union|Austria-Hungary|Prussia/.test(feature.properties.name))assert.equal(feature.properties.code,null,'multi-successor empires must not be silently mapped to one modern country');
      assert.ok(feature.properties.precision===null||[1,2,3].includes(feature.properties.precision));
      const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates as number[][][]]:feature.geometry.coordinates as number[][][][];
      for(const polygon of polygons)for(const ring of polygon){
        assert.ok(ring.length>=4);assert.deepEqual(ring[0],ring[ring.length-1]);
        for(const [lng,lat] of ring){assert.ok(Number.isFinite(lng)&&lng>=-180&&lng<=180);assert.ok(Number.isFinite(lat)&&lat>=-90&&lat<=90);}
      }
    }
  }
  assert.equal(featureCount,3788);
  assert.ok(bytes<1_500_000,'all fourteen map resources should remain compressed below1.5MB');
  assert.ok(namesByYear.get(1800)?.has('Ottoman Empire'));
  assert.ok(!namesByYear.get(2010)?.has('Ottoman Empire'));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { GlobePointerGesture } from '../src/lib/globe-gesture';

test('a deliberate tap selects while dragging away and back does not',()=>{
  const gesture=new GlobePointerGesture();
  gesture.down(1,100,100);assert.equal(gesture.up(1,102,101),true);
  gesture.down(2,100,100);gesture.move(2,150,100);gesture.move(2,101,100);
  assert.equal(gesture.up(2,100,100),false);
});

test('a pinch never turns its final finger release into a country click',()=>{
  const gesture=new GlobePointerGesture();
  gesture.down(1,100,100);gesture.down(2,200,100);
  assert.equal(gesture.up(1,100,100),false);assert.equal(gesture.up(2,200,100),false);
  gesture.down(3,120,130);assert.equal(gesture.up(3,120,130),true);
  gesture.down(4,0,0);gesture.cancel(4);assert.equal(gesture.up(4,0,0),false);
});

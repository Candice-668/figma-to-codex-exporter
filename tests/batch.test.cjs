'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBatchExporter,scanRoots,selectionRoots,utf8}=require('../src/batch');
function setup(){
  const image=new Uint8Array([137,80,78,71]);
  const page={id:'p1',type:'PAGE',name:'Page 1',children:[],selection:[]};
  const other={id:'p2',type:'PAGE',name:'Page 2',loaded:false,async loadAsync(){this.loaded=true;}};
  const a={id:'1:1',type:'FRAME',name:'同名/测试',width:390,height:800,children:[],parent:page,async exportAsync(){return image;}};
  const b={...a,id:'2:1',type:'COMPONENT',parent:other};
  page.children=[a];Object.defineProperty(other,'children',{get(){assert.ok(this.loaded);return [b];}});
  return {a,b,page,other,api:{root:{name:'Doc',children:[page,other]},currentPage:page}};
}
test('multiple roots from different pages have isolated paths and accurate page metadata',async()=>{
  const f=setup();const result=await createBatchExporter(f.api).run([f.a,f.b]);
  assert.equal(result.design.kind,'batch');assert.equal(result.frames.length,2);
  assert.equal(result.frames[1].design.document.pageId,'p2');
  const names=result.files.map(f=>f.path);assert.equal(new Set(names).size,names.length);
  assert.ok(names.includes(result.design.preview.path));
  assert.equal(names.filter(n=>n.endsWith('design.json')).length,2);
});
test('single Frame retains root design and preview.png paths',async()=>{
  const f=setup(),r=await createBatchExporter(f.api).run([f.a]);
  assert.equal(r.design.root.id,f.a.id);assert.equal(r.design.kind,undefined);assert.equal(r.design.preview.path,'preview.png');
  assert.equal(r.files[0].path,'preview.png');
});
test('cross-page scan loads pages before reading and does not change current page',async()=>{
  const f=setup();assert.equal((await scanRoots(f.api,'current-page')).length,1);assert.equal(f.other.loaded,false);
  assert.equal((await scanRoots(f.api,'document')).length,2);assert.equal(f.api.currentPage,f.page);
});
test('nested selected roots are deduplicated; unsupported roots rejected; cancel propagates',async()=>{
  const f=setup(),child={...f.a,id:'x',parent:f.a};assert.deepEqual(selectionRoots([f.a,child]),[f.a]);
  assert.throws(()=>selectionRoots([{type:'TEXT',id:'t'}]),/Frame/);
  const ex=createBatchExporter(f.api);ex.cancel();await assert.rejects(ex.run([f.a]),/取消/);
  assert.equal(new TextDecoder().decode(utf8('测试🙂')),'测试🙂');
});
test('same-named image/vector layers keep original name and proportional PNG scale in separate frame folders',async()=>{
  const f=setup();
  const child=id=>({id,type:'RECTANGLE',name:'图标 / Same',width:200,height:100,visible:true,fills:[{type:'IMAGE',imageHash:'hash'}],children:[],
    async exportAsync(settings){if(settings.format==='PNG')assert.equal(settings.constraint.value,2);return new Uint8Array([137,80,78,71]);}});
  f.a.children=[child('3:1')];f.b.children=[child('4:1')];f.api.getImageByHash=()=>({async getBytesAsync(){return new Uint8Array([137,80,78,71]);}});
  const r=await createBatchExporter(f.api).run([f.a,f.b],{scale:2});
  for(const frame of r.frames){const node=frame.design.root.children[0];assert.equal(node.width/node.height,2);assert.equal(node.assets.length,2);assert.equal(node.assets[0].originalName,'图标 / Same');assert.equal(node.assets[1].scale,2);}
  assert.equal(new Set(r.files.map(f=>f.path)).size,r.files.length);
});

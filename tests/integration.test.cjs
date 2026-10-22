'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {boot,frame,pumpUntil,unzip}=require('./ui-fixture.cjs');
test('built single-root UI exports chunked Unicode design, handoff files and supports a second diff export',async t=>{
  const n=frame();n.description='混合🙂'.repeat(30000);n.exportAsync=async()=>{const b=new Uint8Array(600000);b.set([137,80,78,71]);return b;};
  const h=boot({roots:[n]});t.after(()=>h.stop());await pumpUntil(()=>!h.get('export').disabled);
  h.get('export').click();await pumpUntil(()=>h.blob);const zip=await unzip(h.blob),design=zip.json('design.json');
  assert.equal(design.root.description,n.description);assert.equal(zip.files.get('preview.png').length,600000);
  for(const file of ['responsive.json','diff.json','diff.md','CODEX-README.md'])assert.ok(zip.files.has(file));
  assert.equal(zip.json('diff.json').status,'no-baseline');h.get('download').click();assert.ok(h.downloaded);
  n.width=420;h.clearBlob();h.get('export').click();await pumpUntil(()=>h.blob);
  const next=await unzip(h.blob);assert.equal(next.json('diff.json').summary.modified,1);assert.match(h.get('status').textContent,/已完成/);
});
test('built UI batches selected roots, keeps resources isolated and emits user-entered breakpoint groups',async t=>{
  const a=frame('1:1'),b=frame('2:1','COMPONENT');a.width=1440;const h=boot({roots:[a,b]});t.after(()=>h.stop());await pumpUntil(()=>!h.get('export').disabled);
  const rows=h.get('candidates').children;
  rows[0].children[1].children[0].value='Home';rows[0].children[1].children[1].value='Desktop';rows[0].children[1].children[2].value='1024';
  rows[1].children[1].children[0].value='Home';rows[1].children[1].children[1].value='Mobile';rows[1].children[1].children[3].value='767';
  h.get('export').click();await pumpUntil(()=>h.blob);const zip=await unzip(h.blob),d=zip.json('design.json');
  assert.equal(d.kind,'batch');assert.equal(d.frames.length,2);
  for(const f of d.frames){assert.ok(zip.files.has(f.basePath+'preview.png'));assert.ok(zip.files.has(f.basePath+'design.json'));}
  assert.equal(zip.json('responsive.json').groups[0].frameIds.length,2);
  assert.equal(zip.json('responsive.json').frames[1].breakpoint.maxWidth,767);
});
test('document scan UI loads non-current pages and exports selected candidates without switching pages',async t=>{
  const a=frame('a'),b=frame('b'),other={id:'p2',type:'PAGE',name:'Other',loaded:false,async loadAsync(){this.loaded=true;}};b.parent=other;
  Object.defineProperty(other,'children',{get(){assert.ok(this.loaded);return [b];}});
  const h=boot({roots:[a,b],selection:[]});h.api.root.children=[h.api.currentPage,other];t.after(()=>h.stop());await new Promise(r=>setImmediate(r));
  h.get('scope').value='document';h.get('scope').onchange();h.get('scan').click();await pumpUntil(()=>h.get('candidates').children.length===2);
  h.get('refresh').click();await pumpUntil(()=>!h.get('export').disabled);
  h.get('export').click();await pumpUntil(()=>h.blob);const zip=await unzip(h.blob);
  assert.equal(zip.json('design.json').frames[1].design.document.pageId,'p2');assert.equal(h.api.currentPage.id,'p1');
});
test('baseline import, invalid baseline and invalid breakpoint inputs are handled locally',async t=>{
  const h=boot();t.after(()=>h.stop());await pumpUntil(()=>!h.get('export').disabled);
  const mapping=h.get('candidates').children[0].children[1].children;mapping[2].value='900';mapping[3].value='300';h.get('export').click();
  assert.match(h.get('status').textContent,/最小宽度/);assert.equal(h.blob,undefined);mapping[2].value='';mapping[3].value='';
  h.get('baseline').files=[{size:10,name:'wrong.json',async text(){return '{}';}}];await h.get('baseline').onchange();assert.match(h.get('baselineInfo').textContent,/无效/);
  const before={generator:'Figma to Codex Exporter',document:{name:'Doc'},root:{id:'1:1',type:'FRAME',width:1,height:1,children:[]}};
  h.get('baseline').files=[{size:200,name:'design.json',async text(){return JSON.stringify(before);}}];await h.get('baseline').onchange();
  h.get('export').click();await pumpUntil(()=>h.blob);assert.equal((await unzip(h.blob)).json('diff.json').summary.modified,1);
});
test('cancelled export does not produce a partial ZIP and can be retried',async t=>{
  let release;const n=frame(),original=n.exportAsync;n.exportAsync=()=>new Promise(resolve=>{release=()=>resolve(new Uint8Array([137,80,78,71]));});
  const h=boot({roots:[n]});t.after(()=>h.stop());await pumpUntil(()=>!h.get('export').disabled);
  h.get('export').click();await pumpUntil(()=>release);h.get('cancel').click();release();await pumpUntil(()=>!h.get('export').disabled);
  assert.equal(h.blob,undefined);n.exportAsync=original;h.get('export').click();await pumpUntil(()=>h.blob);assert.ok((await unzip(h.blob)).files.has('design.json'));
});
test('manifest and built artifacts remain offline and self-contained',()=>{
  const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  assert.deepEqual(manifest.networkAccess.allowedDomains,['none']);assert.equal(manifest.documentAccess,'dynamic-page');
  const code=fs.readFileSync(path.join(root,manifest.main),'utf8'),html=fs.readFileSync(path.join(root,manifest.ui),'utf8');
  assert.doesNotMatch(code,/require\(/);assert.doesNotMatch(html,/\/\* (ZIP|UI|HANDOFF)_MODULE \*\//);assert.doesNotMatch(code+html,/fetch\(|XMLHttpRequest/);
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {compareDesigns,responsiveReport,framesOf}=require('../src/handoff');
function fixture(){return {generator:'Figma to Codex Exporter',document:{name:'Doc'},root:{id:'f',name:'Home',type:'FRAME',width:1440,height:900,layoutMode:'HORIZONTAL',paddingLeft:24,itemSpacing:16,children:[{id:'t',name:'Title',type:'TEXT',parentId:'f',text:{characters:'Before',fontSize:20},fills:[{type:'SOLID',color:{r:1,g:0,b:0}}]}]}};}
test('diff identifies dimensions, text, colors, added/removed/reparented and renamed layers',()=>{
  const a=fixture(),b=structuredClone(a);b.root.width=390;b.root.name='Mobile';b.root.children[0].text.characters='After';b.root.children[0].fills[0].color.r=0;
  b.root.children.push({id:'new',type:'RECTANGLE',name:'New'});
  const diff=compareDesigns(a,b);assert.equal(diff.summary.modified,2);assert.equal(diff.summary.added,1);
  assert.ok(diff.changes.find(c=>c.nodeId==='t').categories.includes('text'));assert.ok(diff.changes.find(c=>c.nodeId==='t').categories.includes('appearance'));
  const c=structuredClone(a);c.root.children=[];assert.equal(compareDesigns(a,c).summary.removed,1);
});
test('timestamps and generated asset paths do not produce false changes; referenced style/variable changes are reported',()=>{
  const a=fixture(),b=structuredClone(a);a.exportedAt='yesterday';b.exportedAt='today';b.root.assets=[{path:'new'}];b.styles={S:{paints:[]}};
  assert.equal(compareDesigns(a,b).summary.modified,0);assert.equal(compareDesigns(a,b).resources[0].field,'styles');
  b.document.name='Other';assert.equal(compareDesigns(a,b).status,'incompatible-source');
});
test('responsive report distinguishes observed layout, inferred hints and manual breakpoints',()=>{
  const a=fixture(),b=fixture();b.root.id='m';b.root.width=390;b.root.children[0].id='mobile-t';
  const batch={generator:a.generator,kind:'batch',frames:[{id:'f',name:'Desktop',design:a},{id:'m',name:'Mobile',design:b}]};
  const r=responsiveReport(batch,{f:{group:'Home',label:'Desktop',minWidth:1024},m:{group:'Home',label:'Mobile',maxWidth:767}});
  assert.equal(r.groups.length,1);assert.equal(r.frames[1].breakpoint.maxWidth,767);assert.equal(r.frames[0].layout[0].hints[0].requiresValidation,true);
  assert.equal(r.groups[0].gaps[0].minExclusive,767);assert.equal(r.groups[0].gaps[0].maxExclusive,1024);
  assert.equal(responsiveReport(a).frames[0].breakpoint.source,'unavailable');
  assert.throws(()=>responsiveReport(a,{f:{minWidth:900,maxWidth:400}}),/最大宽度/);
});
test('invalid baseline and duplicated IDs are rejected; overlapping breakpoint ranges are flagged',()=>{
  assert.throws(()=>framesOf({}),/design.json/);const a=fixture();a.root.children.push({...a.root.children[0]});assert.throws(()=>framesOf(a),/重复/);
  const x=fixture(),y=fixture();y.root.id='y';y.root.children=[];
  const b={generator:x.generator,kind:'batch',frames:[{id:'f',design:x},{id:'y',design:y}]};
  assert.ok(responsiveReport(b,{f:{group:'H',minWidth:0,maxWidth:1000},y:{group:'H',minWidth:500}}).groups[0].warnings.length);
});
test('hierarchy move, sibling order and geometry changes have explicit field records',()=>{
  const a=fixture(),b=structuredClone(a);b.root.children[0].parentId='new-parent';b.root.children[0].siblingIndex=3;b.root.children[0].x=64;
  const c=compareDesigns(a,b).changes.find(c=>c.nodeId==='t');assert.ok(c.categories.includes('layers'));assert.ok(c.categories.includes('geometry'));
  assert.ok(c.fields.some(f=>f.field==='parentId'&&f.before==='f'&&f.after==='new-parent'));
});

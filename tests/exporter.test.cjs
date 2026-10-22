'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createExporter, inverse, multiply, clean, safeName, boundedScale } = require('../src/exporter');
const png = Uint8Array.from([137,80,78,71,13,10,26,10]);
function node(id, type, extra = {}) {
  const n = { id, type, name: '图层 ' + id, x: 12, y: 24, width: 100, height: 80, visible: true,
    absoluteTransform: [[1,0,112],[0,1,224]], relativeTransform: [[1,0,12],[0,1,24]],
    fills: [], strokes: [], effects: [], exports: [],
    async exportAsync(settings) { this.exports.push(settings); return settings.format === 'SVG' ? new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>') : png; }, ...extra };
  if (n.children) for (const c of n.children) c.parent = n;
  return n;
}
function fixture(children = []) {
  const frame = node('1:1','FRAME', { absoluteTransform: [[1,0,100],[0,1,200]], children });
  let imageReads = 0;
  const api = { root: {name:'离线测试'}, currentPage: { id:'0:1',name:'页面'},
    getImageByHash() { return { async getBytesAsync() { imageReads++; return png; } }; },
    async getStyleByIdAsync(id) { return {id,name:'品牌文字',type:'TEXT',fontName:{family:'Inter',style:'Regular'}}; },
    variables: { async getVariableByIdAsync(id) { return {id,name:'主色',resolvedType:'COLOR', valuesByMode:{'1:0':{r:0.2,g:0.3,b:1}}}; } }
  };
  return { frame, api, reads: () => imageReads };
}
test('完整树、混合文本、渐变、描边、阴影、圆角和 Auto Layout 保真', async () => {
  const mixed = Symbol('mixed');
  const text = node('2:1','TEXT', { characters:'Hello世界', fontName:mixed,fontSize:mixed,lineHeight:{unit:'AUTO'},letterSpacing:{unit:'PERCENT',value:2},
    getStyledTextSegments(fields) { assert.ok(fields.includes('fontName')); return [
      {start:0,end:5,characters:'Hello',fontName:{family:'Inter',style:'Regular'},fontSize:16,lineHeight:{unit:'PIXELS',value:24},letterSpacing:{unit:'PIXELS',value:0},fills:[{type:'SOLID',color:{r:1,g:0,b:0}}]},
      {start:5,end:7,characters:'世界',fontName:{family:'Noto Sans SC',style:'Bold'},fontSize:20,lineHeight:{unit:'PERCENT',value:150}}
    ]; } });
  const f = fixture([text]);
  Object.assign(f.frame, {layoutMode:'HORIZONTAL',paddingLeft:24,paddingRight:32,itemSpacing:16,cornerRadius:12,
    fills:[{type:'GRADIENT_LINEAR',gradientTransform:[[1,0,0],[0,1,0]],gradientStops:[{position:0,color:{r:1,g:0,b:0,a:1}},{position:1,color:{r:0,g:0,b:1,a:0.5}}]}],
    strokes:[{type:'SOLID',color:{r:0,g:0,b:0}}],strokeWeight:2,effects:[{type:'DROP_SHADOW',offset:{x:0,y:4},radius:12,color:{r:0,g:0,b:0,a:0.2},visible:true}],
    boundVariables:{fills:[{type:'VARIABLE_ALIAS',id:'VariableID:1'}]},fillStyleId:'S:1' });
  const {design,files} = await createExporter(f.api).run(f.frame);
  assert.equal(design.root.paddingLeft,24); assert.equal(design.root.itemSpacing,16);
  assert.equal(design.root.fills[0].gradientStops[1].color.a,0.5);
  assert.equal(design.root.effects[0].radius,12); assert.equal(design.root.strokeWeight,2); assert.equal(design.root.cornerRadius,12);
  assert.deepEqual(design.root.children[0].text.fontName,{mixed:true});
  assert.equal(design.root.children[0].text.segments[1].fontSize,20);
  assert.equal(design.root.children[0].parentId,'1:1'); assert.equal(design.root.children[0].siblingIndex,0);
  assert.deepEqual(design.root.children[0].transformRelativeToRoot,[[1,0,12],[0,1,24]]);
  assert.equal(design.styles['S:1'].name,'品牌文字'); assert.equal(design.variables['VariableID:1'].name,'主色');
  assert.equal(files[0].path,'preview.png'); assert.equal(design.statistics.nodes,2); assert.equal(design.warnings.length,0);
  assert.doesNotThrow(() => JSON.stringify(design));
});
test('图片按 hash 去重；图片图层 PNG、矢量 SVG 和隐藏层规则', async () => {
  const fill = () => [{type:'IMAGE',imageHash:'abc123',scaleMode:'FILL',imageTransform:[[1,0,0],[0,1,0]]}];
  const a = node('2:1','RECTANGLE',{fills:fill()});
  const b = node('2:2','ELLIPSE',{fills:fill()});
  const hidden = node('2:3','FRAME',{visible:false,children:[node('3:1','VECTOR')]});
  const f = fixture([a,b,hidden]); const result = await createExporter(f.api).run(f.frame);
  assert.equal(f.reads(),1);
  assert.equal(result.design.assets.filter(a=>a.kind==='original-image').length,1);
  assert.ok(result.files.some(f=>f.path.endsWith('.svg')));
  assert.ok(result.files.some(f=>f.path==='assets/nodes/2_1-图层 2_1.png'));
  assert.equal(result.design.root.children[0].fills[0].assetPath,'assets/images/abc123.png');
  assert.equal(result.design.root.children[2].children[0].effectiveVisible,false);
  assert.equal(hidden.children[0].exports.length,0);
});
test('动态页面组件实例使用异步 mainComponent，并保留变体和覆盖信息', async () => {
  const instance = node('4:1','INSTANCE',{componentProperties:{Label:{type:'TEXT',value:'开始'}},variantProperties:{Size:'Large'},overrides:[{id:'x',overriddenFields:['fills']}],
    async getMainComponentAsync() {return {id:'c:1',key:'key',name:'Button',remote:true,parent:{id:'s:1',name:'Buttons',type:'COMPONENT_SET',key:'set'}};}});
  Object.defineProperty(instance,'mainComponent',{get(){throw new Error('Do not use sync accessor');}});
  const f=fixture([instance]); const {design}=await createExporter(f.api).run(f.frame);
  assert.equal(design.root.children[0].mainComponent.componentSet.name,'Buttons');
  assert.equal(design.root.children[0].componentProperties.Label.value,'开始');
  assert.equal(design.warnings.length,0);
});
test('素材失败告警；预览失败、错误选择和取消必须终止',async()=>{
  const v=node('2:1','VECTOR',{async exportAsync(){throw new Error('unsupported');}});
  const f=fixture([v]); const {design}=await createExporter(f.api).run(f.frame);
  assert.equal(design.warnings[0].operation,'export:SVG');
  await assert.rejects(createExporter(f.api).run(v),/Frame/);
  f.frame.exportAsync=async()=>{throw new Error('preview failed');};
  await assert.rejects(createExporter(f.api).run(f.frame),/preview failed/);
  const f2=fixture(); const ex=createExporter(f2.api); ex.cancel(); await assert.rejects(ex.run(f2.frame),/取消/);
});
test('旋转 Frame 坐标通过逆矩阵变换；超大画布缩放和安全文件名',()=>{
  const t=[[0,-1,200],[1,0,300]], child=[[0,-1,180],[1,0,310]];
  assert.deepEqual(multiply(inverse(t),child),[[1,0,10],[0,1,20]]);
  assert.equal(inverse([[0,0,0],[0,0,0]]),null);
  assert.ok(boundedScale({width:20000,height:20000},3)<=0.2);
  assert.equal(safeName('../x:y'),'.._x_y');
  assert.deepEqual(clean({a:Symbol('mixed'),b:undefined}),{a:{mixed:true}});
});
test('分片钩子字节与统计一致，重复图片仍只传一次',async()=>{
  const f=fixture([node('2:1','VECTOR')]); const delivered=[];
  const result=await createExporter(f.api,{file:async(path,bytes)=>delivered.push({path,size:bytes.length})}).run(f.frame);
  assert.deepEqual(result.files,delivered);
  assert.equal(delivered.reduce((n,f)=>n+f.size,0),result.design.statistics.binaryBytes);
});
test('传输失败必须终止而不是误报单个素材告警',async()=>{
  const f=fixture([node('2:1','VECTOR')]); let calls=0;
  const ex=createExporter(f.api,{file:async()=>{if(++calls>1)throw new Error('transport failed');}});
  await assert.rejects(ex.run(f.frame),/transport failed/);
});
test('不可读属性保留警告，旧文本 API 回退仍保留核心混合样式',async()=>{
  const t=node('2:1','TEXT',{characters:'A',getStyledTextSegments(fields){if(fields.includes('fontWeight'))throw new Error('old API');return [{characters:'A',start:0,end:1,fontSize:24}];}});
  Object.defineProperty(t,'fontName',{get(){throw new Error('font inaccessible');}});
  const f=fixture([t]);const {design}=await createExporter(f.api).run(f.frame);
  assert.equal(design.root.children[0].text.segments[0].fontSize,24);
  assert.ok(design.warnings.some(w=>w.operation==='read:fontName'));
  assert.ok(design.warnings.some(w=>w.operation==='text-segments'));
});

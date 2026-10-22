/* Pure, shared handoff analysis; no Figma, DOM, network or filesystem access. */
(function(scope){
  'use strict';
  function framesOf(design) {
    if (!design || design.generator !== 'Figma to Codex Exporter') throw new Error('请选择本插件导出的 design.json。');
    const frames = design.kind === 'batch' ? design.frames : [{id:design.root && design.root.id,name:design.root && design.root.name,basePath:'',design}];
    if (!Array.isArray(frames) || !frames.length || frames.length>100) throw new Error('设计快照的导出对象数量无效。');
    let count=0;const ids=new Set(),allNodeIds=new Set();
    for(const frame of frames){
      if(!frame.design || !frame.design.root || frame.design.root.id!==frame.id || typeof frame.id!=='string' || ids.has(frame.id)) throw new Error('设计快照的根节点无效或重复。');
      ids.add(frame.id);
      const stack=[{n:frame.design.root,depth:0}],nodeIds=new Set();
      while(stack.length){
        const {n,depth}=stack.pop();
        if(++count>20000 || depth>200 || !n || typeof n.id!=='string' || typeof n.type!=='string' || nodeIds.has(n.id) || allNodeIds.has(n.id)) throw new Error('设计快照图层无效、重复或超过限制。');
        nodeIds.add(n.id);allNodeIds.add(n.id);
        if(n.children!==undefined && !Array.isArray(n.children)) throw new Error('children 必须是数组。');
        for(const child of n.children||[])stack.push({n:child,depth:depth+1});
      }
    }
    return frames;
  }
  function stable(v,depth){
    depth=depth||0;if(depth>220)throw new Error('快照属性嵌套过深。');
    if(v===undefined)return null;
    if(!v || typeof v!=='object')return v;
    if(Array.isArray(v))return v.map(x=>stable(x,depth+1));
    const out=Object.create(null);
    for(const k of Object.keys(v).sort())if(!['assetPath','assets'].includes(k))out[k]=stable(v[k],depth+1);
    return out;
  }
  const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
  function compact(v){const s=JSON.stringify(v);return s && s.length>4000 ? {excerpt:s.slice(0,4000),characters:s.length,truncated:true} : v;}
  const GROUPS={
    geometry:['x','y','width','height','rotation','relativeTransform'],
    text:['text'],
    appearance:['fills','strokes','strokeWeight','strokeAlign','strokeCap','strokeJoin','strokeTopWeight','strokeRightWeight','strokeBottomWeight','strokeLeftWeight','dashPattern','opacity','blendMode','effects','cornerRadius','topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius','cornerSmoothing','fillStyleId','strokeStyleId','effectStyleId','boundVariables','vectorPaths','vectorNetwork','arcData','pointCount','innerRadius'],
    layout:['constraints','layoutMode','layoutWrap','primaryAxisSizingMode','counterAxisSizingMode','primaryAxisAlignItems','counterAxisAlignItems','counterAxisAlignContent','paddingTop','paddingRight','paddingBottom','paddingLeft','itemSpacing','counterAxisSpacing','layoutAlign','layoutGrow','layoutPositioning','layoutSizingHorizontal','layoutSizingVertical','minWidth','maxWidth','minHeight','maxHeight','gridRowCount','gridColumnCount','gridRowGap','gridColumnGap','gridRowSizes','gridColumnSizes'],
    layers:['name','type','parentId','siblingIndex','visible','effectiveVisible','clipsContent','isMask','maskType'],
    components:['mainComponent','componentProperties','variantProperties','overrides','componentPropertyDefinitions']
  };
  function flatten(frames){
    const map=new Map();
    for(const frame of frames){
      const stack=[frame.design.root];
      while(stack.length){const n=stack.pop();map.set(n.id,{node:n,frameId:frame.id});for(const c of n.children||[])stack.push(c);}
    }
    return map;
  }
  function compareDesigns(before,after){
    const oldFrames=framesOf(before),newFrames=framesOf(after);
    const result={schemaVersion:'1.0.0',status:'compared',matching:'node-id',identityConfidence:'node-id-and-document-name-only',requiresSameFigmaFile:true,
      baselineExportedAt:before.exportedAt||null,currentExportedAt:after.exportedAt||null,
      note:'仅比较导出范围内的节点；移出范围也会显示为 removed，不能据此断言已从 Figma 文件删除。跨文件复制可能改变 ID。',
      summary:{added:0,removed:0,modified:0},changes:[],truncatedChanges:0,resources:[]};
    if(before.document && after.document && before.document.name!==after.document.name){result.status='incompatible-source';result.reason='文件名称不同，不能可靠确认来自同一设计文件。';return result;}
    const oldMap=flatten(oldFrames),newMap=flatten(newFrames);
    function add(change){if(result.changes.length<2000)result.changes.push(change);else result.truncatedChanges++;}
    for(const [id,entry]of newMap){
      const old=oldMap.get(id);
      if(!old){result.summary.added++;add({kind:'added',nodeId:id,name:entry.node.name,frameId:entry.frameId});continue;}
      const fields=[],categories=[];
      for(const category of Object.keys(GROUPS)){
        let changed=false;
        for(const key of GROUPS[category])if(!same(old.node[key],entry.node[key])){changed=true;fields.push({field:key,before:compact(old.node[key]),after:compact(entry.node[key])});}
        if(changed)categories.push(category);
      }
      if(old.frameId!==entry.frameId){categories.push('layers');fields.push({field:'exportRootId',before:old.frameId,after:entry.frameId});}
      if(fields.length){result.summary.modified++;add({kind:'modified',nodeId:id,name:entry.node.name,frameId:entry.frameId,categories:[...new Set(categories)],fields});}
    }
    for(const [id,entry]of oldMap)if(!newMap.has(id)){result.summary.removed++;add({kind:'removed',nodeId:id,name:entry.node.name,frameId:entry.frameId});}
    for(const frame of newFrames){const old=oldFrames.find(f=>f.id===frame.id);if(old)for(const key of ['styles','variables'])if(!same(old.design[key],frame.design[key]))result.resources.push({frameId:frame.id,field:key,status:'changed'});}
    return result;
  }
  function responsiveReport(design,mapping){
    const frames=framesOf(design),groups=new Map(),out=[];mapping=mapping||{};
    for(const frame of frames){
      const root=frame.design.root,setting=mapping[frame.id]||{},group=typeof setting.group==='string'?setting.group.trim().slice(0,120):'';
      const bp={label:typeof setting.label==='string'?setting.label.slice(0,120):null,source:'user-supplied',minWidth:null,maxWidth:null};
      for(const key of ['minWidth','maxWidth'])if(setting[key]!==undefined && setting[key]!==null && setting[key]!==''){
        const value=Number(setting[key]);if(!Number.isFinite(value)||value<0||value>100000)throw new Error('断点宽度必须是 0–100000 的数字。');bp[key]=value;
      }
      if(bp.minWidth!==null && bp.maxWidth!==null && bp.minWidth>bp.maxWidth)throw new Error('断点最小宽度不能大于最大宽度。');
      if(bp.minWidth===null && bp.maxWidth===null && !bp.label)bp.source='unavailable';
      bp.rangeStatus=bp.minWidth===null && bp.maxWidth===null?'manual-input-required':'user-supplied';
      const item={frameId:frame.id,name:frame.name,designViewport:{width:root.width,height:root.height,source:'observed-frame-size'},group:group||null,breakpoint:bp,layout:[]};
      const stack=[root];
      while(stack.length){
        const n=stack.pop(),observed={};
        for(const key of [...GROUPS.layout,'width','height','itemReverseZIndex','strokesIncludedInLayout'])if(n[key]!==undefined)observed[key]=n[key];
        const hints=[];
        if(n.layoutMode==='HORIZONTAL'||n.layoutMode==='VERTICAL')hints.push({suggestion:'CSS flex layout',direction:n.layoutMode==='HORIZONTAL'?'row':'column',source:'inferred-from-auto-layout',requiresValidation:true});
        if(n.layoutMode==='GRID')hints.push({suggestion:'CSS grid layout',source:'inferred-from-auto-layout',requiresValidation:true});
        if(n.layoutWrap==='WRAP')hints.push({suggestion:'Allow wrapping',source:'inferred-from-auto-layout',requiresValidation:true});
        if(n.layoutSizingHorizontal==='FILL'||n.layoutGrow>0)hints.push({suggestion:'May stretch to parent width',source:'inferred-from-sizing',requiresValidation:true});
        item.layout.push({nodeId:n.id,observed,hints});for(const c of n.children||[])stack.push(c);
      }
      out.push(item);if(group){if(!groups.has(group))groups.set(group,[]);groups.get(group).push(item);}
    }
    const groupList=[...groups].map(([name,items])=>({name,source:'user-supplied',frameIds:items.map(x=>x.frameId),gaps:[],warnings:items.some(x=>x.breakpoint.rangeStatus==='manual-input-required')?['部分设计尚未指定媒体查询范围。']:[]}));
    for(const group of groupList){const items=groups.get(group.name);for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
      const a=items[i].breakpoint,b=items[j].breakpoint;
      if(a.source!=='unavailable'&&b.source!=='unavailable'&&Math.max(a.minWidth??0,b.minWidth??0)<=Math.min(a.maxWidth??Infinity,b.maxWidth??Infinity))group.warnings.push('断点范围可能重叠：'+items[i].name+' / '+items[j].name);
    }
      const ranges=items.map(x=>x.breakpoint).filter(x=>x.rangeStatus==='user-supplied').map(x=>({min:x.minWidth??0,max:x.maxWidth??Infinity})).sort((a,b)=>a.min-b.min);
      let end=ranges.length?ranges[0].max:0;
      for(let i=1;i<ranges.length;i++){if(ranges[i].min>end)group.gaps.push({minExclusive:end,maxExclusive:ranges[i].min,status:'manual-input-required'});end=Math.max(end,ranges[i].max);}
      if(group.gaps.length)group.warnings.push('指定断点之间存在未覆盖范围，需要手动决定布局。');
    }
    return {schemaVersion:'1.0.0',note:'Frame 宽度是设计样本，不是 CSS 媒体查询阈值；不会自动把不同名称/宽度的 Frame 认定为同一页面。',frames:out,groups:groupList,
      unavailable:[{field:'productionMediaQueries',status:'manual-input-required',reason:'Figma Frame 不定义网页实际 CSS 断点。'},{field:'runtimeInteractionAndBackend',status:'unavailable',reason:'Plugin API 不提供真实网站运行逻辑或后端实现。'},{field:'exactBrowserLayout',status:'manual-validation-required',reason:'浏览器字体、换行和布局行为需要运行时验证。'}]};
  }
  function codexInstructions(design,diff,responsive){
    return '# Codex 设计交付说明\n\n版本：'+design.generatorVersion+'\n\n'+
      '1. 先读取 design.json；批量导出的每个 frames 项包含 basePath，子 design 内所有素材路径均相对其 basePath。\n'+
      '2. 对照每个对象的 preview.png，复用 SVG/PNG/原图。原始图层名保留在 JSON，文件名做 Windows 安全字符替换，并附节点 ID 防止重名。不要拉伸素材。\n'+
      '3. text.segments 保留混合字体、字号、行高、间距和颜色；缺少的字体需手动安装或明确协商替代。\n'+
      '4. x/y 相对父层，absoluteTransform 相对页面，transformRelativeToRoot 是根节点坐标系。使用布局、Padding、Gap、constraints 还原结构。\n'+
      '5. 读取 responsive.json：observed 是设计事实，hints 是待验证建议，断点分组/阈值由用户指定。未指定阈值时先询问，不要编造。\n'+
      '6. diff.json 状态为 '+diff.status+'。差异按同一 Figma 文件中的节点 ID 匹配；导出范围变化也可能产生新增/移除。截断详情请查新旧完整 JSON。\n'+
      '7. reactions（若 API 支持）只是原型配置。真实网页交互、网络/后端、未暴露参数见 unavailable，需手动补充，不得假装已实现。\n'+
      '8. 首先检查 warnings，再实现并在浏览器中验证断点、字体、换行和视觉。\n\n'+
      '资源与 JSON 均为本地导出，不包含字体二进制或自动生成的生产代码。\n';
  }
  const api={framesOf,compareDesigns,responsiveReport,codexInstructions};
  if(typeof module!=='undefined')module.exports=api;else scope.ExporterHandoff=api;
})(typeof globalThis!=='undefined'?globalThis:this);

'use strict';
const { createExporter, safeName, pageOf } = require('./exporter');
const ROOT_TYPES = new Set(['FRAME','COMPONENT','COMPONENT_SET','INSTANCE']);
function selectionRoots(nodes) {
  const input = Array.from(nodes);
  if (input.some(n=>!ROOT_TYPES.has(n.type))) throw new Error('请选择 Frame、组件或实例；不支持将文字、Group 作为导出根节点。');
  const eligible = [...new Map(input.map(n=>[n.id,n])).values()];
  const ids = new Set(eligible.map(n => n.id));
  return eligible.filter(n => {
    for (let p = n.parent; p && p.type !== 'PAGE'; p = p.parent) if (ids.has(p.id)) return false;
    return true;
  });
}
async function scanRoots(api, scope, check) {
  const pages = scope === 'document' ? Array.from(api.root.children) : [api.currentPage];
  const roots = []; let visited = 0;
  for (const page of pages) {
    if (check) check();
    if (page !== api.currentPage) {
      if (typeof page.loadAsync !== 'function') throw new Error('当前客户端不支持跨页面加载，请使用当前页面模式。');
      await page.loadAsync();
    }
    const stack = Array.from(page.children).reverse();
    while (stack.length) {
      if (check) check();
      const n = stack.pop();
      if (++visited > 50000) throw new Error('扫描超过 50000 个图层，请改用当前页面或多选导出。');
      if (ROOT_TYPES.has(n.type)) {
        roots.push(n);
        if (roots.length > 500) throw new Error('候选超过 500 个，请改用当前页面或多选导出。');
        // A root already recursively contains its children. Do not duplicate nested frames.
      } else if ('children' in n) { const children=Array.from(n.children);for(let i=children.length-1;i>=0;i--)stack.push(children[i]); }
    }
  }
  return roots;
}
function utf8(s) {
  const out = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 128) out.push(c);
    else if (c < 2048) out.push(192|(c>>6),128|(c&63));
    else if (c < 65536) out.push(224|(c>>12),128|((c>>6)&63),128|(c&63));
    else out.push(240|(c>>18),128|((c>>12)&63),128|((c>>6)&63),128|(c&63));
  }
  return Uint8Array.from(out);
}
function createBatchExporter(api, hooks) {
  hooks = hooks || {};
  let active = null, cancelled = false;
  function check() { if (cancelled) throw new Error('已取消导出'); }
  return {
    cancel() { cancelled = true; if (active) active.cancel(); },
    async run(input, options) {
      const roots = selectionRoots(input);
      if (!roots.length || roots.length > 100) throw new Error('每次请选择 1–100 个导出对象。');
      const files = [], frames = []; let binaryBytes = 0, nodeCount = 0, fileCount = 0;
      async function emit(path, bytes) {
        check(); fileCount++; binaryBytes += bytes.length;
        if (fileCount > 10000 || binaryBytes > 200*1024*1024) throw new Error('批次超过 10000 个文件或 200 MiB，请拆分导出。');
        if (hooks.file) { await hooks.file(path, bytes); files.push({path,size:bytes.length}); }
        else files.push({path,bytes});
      }
      for (let i = 0; i < roots.length; i++) {
        check(); const root = roots[i], page = pageOf(root, api.currentPage);
        const basePath = roots.length === 1 ? '' : 'frames/' + safeName(root.name) + '--' + safeName(root.id) + '/';
        if (hooks.progress) hooks.progress('导出 '+(i+1)+'/'+roots.length+'：'+root.name);
        active = createExporter(api, { file: (p,b) => emit(basePath+p,b), progress: hooks.progress });
        const result = await active.run(root, options);
        check(); nodeCount += result.design.statistics.nodes;
        if (nodeCount > 20000) throw new Error('批次图层超过 20000 个，请拆分导出。');
        frames.push({ id: root.id, name: root.name, type: root.type, page: {id:page.id,name:page.name}, basePath, design: result.design });
        if (roots.length > 1) await emit(basePath+'design.json',utf8(JSON.stringify(result.design,null,2)));
      }
      active = null;
      const design = frames.length === 1 ? frames[0].design : {
        schemaVersion: '1.1.0', kind: 'batch', generator: 'Figma to Codex Exporter', generatorVersion: frames[0].design.generatorVersion,
        exportedAt: new Date().toISOString(), document: {name:api.root.name}, frames,
        preview: {path:frames[0].basePath+'preview.png',description:'First exported root; each frame has its own preview.'},
        statistics:{nodes:nodeCount,frames:frames.length,assetFiles:frames.reduce((s,f)=>s+f.design.assets.length,0),binaryBytes},
        warnings:frames.flatMap(f=>f.design.warnings.map(w=>({...w,frameId:f.id})))
      };
      return {design,files,frames};
    }
  };
}
module.exports = { ROOT_TYPES, selectionRoots, scanRoots, createBatchExporter, utf8 };

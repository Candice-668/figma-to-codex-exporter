'use strict';
const { createExporter, safeName } = require('./exporter');
const { createBatchExporter, selectionRoots, scanRoots } = require('./batch');
figma.showUI(__html__, { width: 500, height: 760, themeColors: true });
let active = null, runId = 0, sequence = 0, pending = null, cancelled = false;
let scanning = false, candidates = new Map();
function send(message) { figma.ui.postMessage(message); }
function descriptor(n) {
  let page = n; while (page.parent && page.type !== 'PAGE') page = page.parent;
  return {id:n.id,name:n.name,type:n.type,width:n.width,height:n.height,pageName:page.type==='PAGE'?page.name:figma.currentPage.name};
}
function selection() {
  const nodes = figma.currentPage.selection;
  let roots=[];try { roots=selectionRoots(nodes); } catch (_) { /* Invalid selection is displayed, not thrown. */ }
  send({ type: 'selection', valid: roots.length > 0 && roots.length <= 100,
    label: roots.length ? '已选 '+roots.length+' 个对象' : '请选择 Frame、组件或实例',items:roots.map(descriptor) });
}
async function reliable(message) {
  if (cancelled) throw new Error('已取消导出');
  const seq = ++sequence;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending = null; reject(new Error('插件窗口传输超时，请重新导出')); }, 30000);
    pending = { seq, resolve: () => { clearTimeout(timeout); pending = null; resolve(); }, reject: e => { clearTimeout(timeout); pending = null; reject(e); } };
    send({ ...message, runId, seq });
  });
}
async function transfer(path, bytes) {
  await reliable({ type: 'file-start', path, size: bytes.length });
  for (let offset = 0; offset < bytes.length; offset += 256 * 1024) {
    await reliable({ type: 'file-chunk', path, bytes: Array.from(bytes.subarray(offset, offset + 256 * 1024)) });
  }
  await reliable({ type: 'file-end', path });
}
figma.ui.onmessage = async message => {
  if (!message || typeof message.type !== 'string') return;
  if (message.type === 'ready') {
    try { selection(); }
    catch (e) { send({ type: 'error', message: '读取选择失败：' + String(e.message || e) }); }
    return;
  }
  if (message.type === 'ack') {
    if (pending && message.runId === runId && message.seq === pending.seq) pending.resolve();
    return;
  }
  if (message.type === 'cancel') {
    cancelled = true;
    if (active) active.cancel();
    if (pending) pending.reject(new Error('已取消导出'));
    return;
  }
  if (message.type === 'scan' && !active && !scanning) {
    scanning = true; cancelled = false; candidates = new Map();
    try {
      if (!['current-page','document'].includes(message.scope)) throw new Error('扫描范围无效。');
      const roots = await scanRoots(figma,message.scope,()=>{if(cancelled)throw new Error('已取消扫描');});
      candidates = new Map(roots.map(n=>[n.id,n]));
      send({type:'candidates',items:roots.map(descriptor),scope:message.scope});
    } catch(e) { send({type:'error',message:String(e.message||e)}); }
    finally { scanning=false; }
    return;
  }
  if (message.type !== 'export' || active || scanning) return;
  let selected;
  try {
    if (message.mode && message.mode !== 'selected') {
      if (!Array.isArray(message.nodeIds) || !message.nodeIds.length || message.nodeIds.length>100) throw new Error('请先扫描并勾选 1–100 个对象。');
      selected = message.nodeIds.map(id=>{const n=candidates.get(id);if(!n || n.removed)throw new Error('候选已失效，请重新扫描。');return n;});
    } else {
      selected = selectionRoots(figma.currentPage.selection);
      if (Array.isArray(message.nodeIds)) selected=selected.filter(n=>message.nodeIds.includes(n.id));
    }
    selected=selectionRoots(selected);
    if (!selected.length || selected.length>100) throw new Error('请选择 1–100 个 Frame、组件或实例。');
  } catch(e) { send({type:'error',message:String(e.message||e)});return; }
  runId++; cancelled = false;
  const root = selected[0];
  let lastProgress = 0;
  active = createBatchExporter(figma, {
    file: transfer,
    progress: text => { if (Date.now() - lastProgress > 100) { send({ type: 'progress', text }); lastProgress = Date.now(); } }
  });
  send({ type: 'begin', runId });
  try {
    const result = await active.run(selected, message.options || {});
    // JSON also travels in bounded messages; encoding stays inside the UI.
    const json = JSON.stringify(result.design, null, 2);
    if (json.length > 32 * 1024 * 1024) throw new Error('设计 JSON 超过 32 Mi 字符，请拆分 Frame');
    await reliable({ type: 'design-start' });
    for (let offset = 0; offset < json.length; offset += 64 * 1024) {
      await reliable({ type: 'design-chunk', text: json.slice(offset, offset + 64 * 1024) });
    }
    await reliable({ type: 'design-end' });
    send({ type: 'complete', runId, filename: (selected.length===1?safeName(root.name):'figma-batch-'+selected.length) + '-codex.zip', previewPaths:result.frames.map(f=>f.basePath+'preview.png'), statistics: result.design.statistics, warnings: result.design.warnings });
  } catch (e) { send({ type: 'error', runId, message: String(e.message || e) }); }
  finally { active = null; selection(); }
};
// Register the host receiver before announcing initial selection.
figma.on('selectionchange', selection);
selection();

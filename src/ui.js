'use strict';
const $ = id => document.getElementById(id);
let valid = false, busy = false, currentRun = 0, incoming = null, files = [], zipUrl = null, filename = '', chunksBytes = 0, jsonParts = null, jsonLength = 0;
let selectionReceived = false, startupAttempts = 0, startupTimer = null;
let rows = [], baseline = null, baselineForRun = null, currentDesign = null, runMapping = {}, latestDiff = null;
const savedSettings = new Map();
const MESSAGE_TYPES = new Set(['selection','candidates','begin','progress','file-start','file-chunk','file-end','design-start','design-chunk','design-end','complete','error']);
function post(message) { parent.postMessage({ pluginMessage: message }, '*'); }
function showStatus(text) { $('status').textContent = text; }
function mode() { return $('scope').value || 'selected'; }
function updateExport() {
  const count=rows.filter(r=>r.check.checked).length;
  $('export').disabled=busy || (rows.length ? count<1 || count>100 : !valid || mode()!=='selected');
}
function mapping() {
  const out=Object.create(null);
  for(const row of rows){
    const value={group:row.group.value,label:row.label.value,minWidth:row.minWidth.value,maxWidth:row.maxWidth.value};
    savedSettings.set(row.id,value);
    if(row.check.checked)out[row.id]=value;
  }
  return out;
}
function renderItems(items) {
  mapping(); rows=[]; $('candidates').replaceChildren();
  for(const item of items){
    const card=document.createElement('div');card.className='row';
    const label=document.createElement('label'),check=document.createElement('input');
    check.type='checkbox';check.checked=items.length<=100;
    const text=document.createElement('span');text.textContent=' '+item.name+' · '+item.type+' · '+item.width+'×'+item.height+' · '+item.pageName;
    label.appendChild(check);label.appendChild(text);card.appendChild(label);
    const grid=document.createElement('div');grid.className='mapping';
    const row={id:item.id,check},saved=savedSettings.get(item.id)||{};
    for(const [key,placeholder]of [['group','页面分组（可选）'],['label','断点标签（可选）'],['minWidth','最小视口宽度 px'],['maxWidth','最大视口宽度 px']]){
      const input=document.createElement('input');input.type=key.includes('Width')?'number':'text';input.placeholder=placeholder;input.title=placeholder;
      input.value=saved[key]??'';input.disabled=busy;if(input.type==='number'){input.min='0';input.max='100000';}else input.maxLength=120;
      row[key]=input;grid.appendChild(input);
    }
    check.disabled=busy;check.onchange=updateExport;card.appendChild(grid);$('candidates').appendChild(card);rows.push(row);
  }
  updateExport();
}
function addText(path,value) { files.push({path,bytes:new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value,null,2))}); }
function analyze(json) {
  currentDesign=JSON.parse(json);ExporterHandoff.framesOf(currentDesign);
  const responsive=ExporterHandoff.responsiveReport(currentDesign,runMapping);
  latestDiff=baselineForRun?ExporterHandoff.compareDesigns(baselineForRun,currentDesign):{schemaVersion:'1.0.0',status:'no-baseline',reason:'未提供前一次设计快照。',summary:{added:0,removed:0,modified:0},changes:[]};
  currentDesign.handoff={instructions:'CODEX-README.md',responsive:'responsive.json',diff:'diff.json',diffSummary:'diff.md'};
  addText('design.json',currentDesign);addText('responsive.json',responsive);addText('diff.json',latestDiff);
  addText('diff.md','# 设计差异报告\n\n状态：'+latestDiff.status+'\n\n'+(latestDiff.reason||latestDiff.note||'')+'\n\n新增 '+latestDiff.summary.added+'；移出范围 '+latestDiff.summary.removed+'；修改 '+latestDiff.summary.modified+'。\n\n'+(latestDiff.changes||[]).slice(0,100).map(c=>'- '+c.kind+' '+c.nodeId+' '+String(c.name||'').replace(/[\r\n]/g,' ')+' '+(c.categories||[]).join(', ')).join('\n')+'\n\n详细字段见 diff.json；截断内容参考新旧完整 design.json。\n');
  addText('CODEX-README.md',ExporterHandoff.codexInstructions(currentDesign,latestDiff,responsive));
}
function stopStartupTimer() { if (startupTimer !== null) clearInterval(startupTimer); startupTimer = null; }
function requestSelection() {
  selectionReceived = false; startupAttempts = 0; stopStartupTimer();
  $('selection').textContent = '正在连接 Figma…';
  valid = false; $('export').disabled = true;
  function ping() {
    if (selectionReceived) { stopStartupTimer(); return; }
    if (++startupAttempts > 10) {
      stopStartupTimer();
      $('selection').textContent = '未收到 Figma 的选择信息';
      showStatus('连接超时。请关闭插件后重新运行；确认导入的是新版 manifest.json。仍失败时，可在 Plugins → Development → Show/Hide Console 查看报错。');
      return;
    }
    post({ type: 'ready' });
  }
  startupTimer = setInterval(ping, 500); ping();
}
function setBusy(value) {
  busy = value; $('cancel').style.display = value ? 'block' : 'none';
  $('progress').style.display = value ? 'block' : 'none'; $('scale').disabled = value; $('allPng').disabled = value;
  $('refresh').disabled = value;
  for(const id of ['scope','scan','baseline','clearBaseline'])$(''+id).disabled=value;
  for(const row of rows)for(const key of ['check','group','label','minWidth','maxWidth'])row[key].disabled=value;
  updateExport();
}
function reset() {
  if (zipUrl) URL.revokeObjectURL(zipUrl);
  zipUrl = null; incoming = null; files = []; chunksBytes = 0; jsonParts = null; jsonLength = 0; currentDesign=null;latestDiff=null; $('download').hidden = true;
}
$('export').onclick = () => {
  runMapping=mapping();
  try {
    for(const key of Object.keys(runMapping)){
      const x=runMapping[key];for(const k of ['minWidth','maxWidth'])if(x[k]!=='' && (!Number.isFinite(Number(x[k]))||Number(x[k])<0||Number(x[k])>100000))throw new Error('断点宽度必须是 0–100000。');
      if(x.minWidth!==''&&x.maxWidth!==''&&Number(x.minWidth)>Number(x.maxWidth))throw new Error('断点最小宽度不能大于最大宽度。');
    }
  }catch(e){showStatus(e.message);return;}
  baselineForRun=baseline;
  reset(); setBusy(true); showStatus('准备预览和图层数据…');
  post({ type: 'export', mode:mode(),nodeIds:rows.length?rows.filter(r=>r.check.checked).map(r=>r.id):undefined, options: { scale: Number($('scale').value), allNodePng: $('allPng').checked } });
};
$('cancel').onclick = () => { post({ type: 'cancel' }); showStatus('正在取消，等待当前 Figma 导出操作结束…'); $('cancel').disabled = true; };
$('refresh').onclick = () => { if (!busy) { if(mode()!=='selected'){$('scan').onclick();return;} showStatus('正在重新读取选择…'); requestSelection(); } };
$('scope').onchange=()=>{valid=false;renderItems([]);if(mode()==='selected')requestSelection();else{$('selection').textContent='请点击扫描，然后勾选导出对象。';updateExport();}};
$('scan').onclick=()=>{
  if(mode()==='selected'){requestSelection();return;}
  reset();setBusy(true);showStatus('正在按需加载页面并扫描…');post({type:'scan',scope:mode()});
};
$('baseline').onchange=async()=>{
  const file=$('baseline').files&&$('baseline').files[0];if(!file)return;
  try{
    if(file.size>32*1024*1024)throw new Error('基线 JSON 超过 32 MiB，请拆分导出。');
    const parsed=JSON.parse(await file.text());ExporterHandoff.framesOf(parsed);baseline=parsed;$('baselineInfo').textContent='已导入基线：'+file.name;
  }catch(e){baseline=null;$('baselineInfo').textContent='基线无效：'+e.message;}
};
$('clearBaseline').onclick=()=>{baseline=null;$('baseline').value='';$('baselineInfo').textContent='已清除对比基线。';};
$('download').onclick = () => {
  if (!zipUrl) return;
  const a = document.createElement('a'); a.href = zipUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
};
window.onmessage = event => {
  // Figma's host bridge can relay MessageEvents with a null or different source.
  // Validate the Plugin API envelope and known message types instead of parent identity.
  const m = event.data && event.data.pluginMessage;
  if (!m || typeof m !== 'object' || !MESSAGE_TYPES.has(m.type)) return;
  if (m.type === 'selection') {
    if (typeof m.valid !== 'boolean' || typeof m.label !== 'string') return;
    const first = !selectionReceived;
    selectionReceived = true; stopStartupTimer(); valid = m.valid;
    if(mode()==='selected'){
      $('selection').textContent = m.label;
      if(Array.isArray(m.items))renderItems(m.items);
      updateExport();
    }
    if (first && !busy) showStatus(valid ? '已连接。点击“导出设计 ZIP”开始。' : '已连接。请选择 Frame / 组件，或扫描导出对象。');
    return;
  }
  if(m.type==='candidates'){
    if(m.scope!==mode())return;
    setBusy(false);valid=false;renderItems(m.items||[]);$('selection').textContent='扫描到 '+rows.length+' 个对象';
    showStatus(rows.length>100?'候选超过 100 个，请勾选最多 100 个。':'请勾选要导出的对象；可选填断点分组。');return;
  }
  if (m.type === 'begin') { reset(); currentRun = m.runId; $('cancel').disabled = false; setBusy(true); return; }
  if (m.runId !== undefined && m.runId !== currentRun) return;
  try {
    if (m.type === 'progress') showStatus(m.text);
    if (m.type === 'file-start') {
      if (incoming || m.size < 0 || m.size > 200 * 1024 * 1024) throw new Error('文件传输状态异常');
      incoming = { path: m.path, data: new Uint8Array(m.size), offset: 0 };
    }
    if (m.type === 'file-chunk') {
      if (!incoming || incoming.path !== m.path || incoming.offset + m.bytes.length > incoming.data.length) throw new Error('文件分片异常');
      incoming.data.set(m.bytes, incoming.offset); incoming.offset += m.bytes.length;
      chunksBytes += m.bytes.length;
      if (chunksBytes > 200 * 1024 * 1024) throw new Error('传输超过 200 MiB');
    }
    if (m.type === 'file-end') {
      if (!incoming || incoming.path !== m.path || incoming.offset !== incoming.data.length) throw new Error('文件传输不完整');
      files.push({ path: incoming.path, bytes: incoming.data }); incoming = null;
    }
    if (m.type === 'design-start') { jsonParts = []; jsonLength = 0; }
    if (m.type === 'design-chunk') {
      if (!jsonParts || typeof m.text !== 'string') throw new Error('JSON 分片异常');
      jsonLength += m.text.length;
      if (jsonLength > 32 * 1024 * 1024) throw new Error('设计 JSON 过大');
      jsonParts.push(m.text);
    }
    if (m.type === 'design-end') {
      if (!jsonParts) throw new Error('JSON 传输状态异常');
      analyze(jsonParts.join('')); jsonParts = null;
    }
    if (m.seq) post({ type: 'ack', seq: m.seq, runId: currentRun });
    if (m.type === 'complete') {
      if (incoming || !files.some(f => f.path === 'design.json') || !(m.previewPaths||['preview.png']).every(path=>files.some(f=>f.path===path))) throw new Error('缺少必要文件');
      if(files.reduce((n,f)=>n+f.bytes.length,0)>256*1024*1024)throw new Error('完整导出包超过 256 MiB，请拆分。');
      const zip = ExporterZip.createZip(files);
      zipUrl = URL.createObjectURL(new Blob([zip], { type: 'application/zip' })); filename = m.filename;
      files = []; $('download').hidden = false; setBusy(false);
      const warningText = m.warnings.length ? '\n警告 ' + m.warnings.length + ' 条，详见 design.json。\n' + m.warnings.slice(0, 2).map(w => w.operation + ': ' + w.message).join('\n') : '';
      baseline=currentDesign;$('baselineInfo').textContent='下一次将与本次完成的导出比较；也可导入其他快照。';
      showStatus('已完成：' + (m.statistics.frames||1)+' 个对象，'+m.statistics.nodes + ' 个图层，' + (zip.length / 1024 / 1024).toFixed(2) + ' MiB。点击“保存 ZIP”。\n差异状态：'+latestDiff.status + warningText);
    }
    if (m.type === 'error') {
      if (!selectionReceived) { stopStartupTimer(); $('selection').textContent = '读取选择失败'; }
      reset(); setBusy(false); $('cancel').disabled = false; showStatus(m.message);
    }
  } catch (e) { post({ type: 'cancel' }); reset(); setBusy(false); showStatus('处理失败：' + e.message); }
};
window.addEventListener('error', event => {
  stopStartupTimer(); $('selection').textContent = '插件界面运行出错';
  showStatus('界面错误：' + (event.message || '请查看开发控制台')); setBusy(false);
});
requestSelection();

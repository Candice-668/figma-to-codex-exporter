(function(){
const __exporter = (function(){const module={exports:{}};
'use strict';

const NODE_FIELDS = [
  'x','y','width','height','rotation','relativeTransform','absoluteTransform','absoluteBoundingBox','absoluteRenderBounds',
  'visible','locked','opacity','blendMode','isMask','maskType','clipsContent',
  'fills','strokes','strokeWeight','strokeTopWeight','strokeRightWeight','strokeBottomWeight','strokeLeftWeight',
  'strokeAlign','strokeCap','strokeJoin','strokeMiterLimit','dashPattern','effects',
  'cornerRadius','topLeftRadius','topRightRadius','bottomRightRadius','bottomLeftRadius','cornerSmoothing',
  'layoutMode','layoutWrap','primaryAxisSizingMode','counterAxisSizingMode','primaryAxisAlignItems','counterAxisAlignItems',
  'counterAxisAlignContent','paddingTop','paddingRight','paddingBottom','paddingLeft','itemSpacing','counterAxisSpacing',
  'itemReverseZIndex','strokesIncludedInLayout','layoutAlign','layoutGrow','layoutPositioning','layoutSizingHorizontal','layoutSizingVertical',
  'minWidth','maxWidth','minHeight','maxHeight','constraints','layoutGrids',
  'gridRowCount','gridColumnCount','gridRowGap','gridColumnGap','gridRowSizes','gridColumnSizes','gridAutoTracks',
  'gridRowSpan','gridColumnSpan','gridRowAnchorIndex','gridColumnAnchorIndex','gridChildHorizontalAlign','gridChildVerticalAlign',
  'fillStyleId','strokeStyleId','effectStyleId','gridStyleId','boundVariables','explicitVariableModes','exportSettings',
  'vectorPaths','vectorNetwork','arcData','pointCount','innerRadius',
  'componentPropertyReferences','componentProperties','componentPropertyDefinitions','variantProperties','overrides','exposedInstances',
  'description','descriptionMarkdown','documentationLinks'
];
const TEXT_FIELDS = ['characters','fontName','fontSize','fontWeight','lineHeight','letterSpacing','textAlignHorizontal','textAlignVertical',
  'textAutoResize','textCase','textDecoration','paragraphIndent','paragraphSpacing','listSpacing','hangingPunctuation','hangingList',
  'textStyleId','hyperlink','hasMissingFont','maxLines','textTruncation'];
const SEGMENT_FIELDS = ['fontName','fontSize','fontWeight','lineHeight','letterSpacing','fills','textCase','textDecoration',
  'textStyleId','fillStyleId','hyperlink','listOptions','indentation','paragraphIndent','paragraphSpacing','listSpacing'];
const VECTOR_TYPES = new Set(['VECTOR','BOOLEAN_OPERATION','RECTANGLE','ELLIPSE','LINE','POLYGON','STAR']);

function clean(value, seen) {
  if (typeof value === 'symbol') return { mixed: true };
  if (value === undefined || typeof value === 'function') return undefined;
  if (value === null || typeof value !== 'object') return typeof value === 'number' && !Number.isFinite(value) ? null : value;
  seen = seen || new Set();
  if (seen.has(value)) return undefined;
  seen.add(value);
  const result = Array.isArray(value) ? value.map(v => clean(v, seen)) : {};
  if (!Array.isArray(value)) {
    for (const key of Object.keys(value)) {
      // Node references must not recursively serialize the entire document.
      if (key === 'parent' || key === 'children' || key === 'removed') continue;
      const v = clean(value[key], seen);
      if (v !== undefined) result[key] = v;
    }
  }
  seen.delete(value);
  return result;
}
function safeName(value) {
  return String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 72) || 'frame';
}
function imageExtension(data) {
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'png';
  if (data[0] === 0xff && data[1] === 0xd8) return 'jpg';
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'gif';
  if (data[0] === 0x52 && data[8] === 0x57 && data[9] === 0x45) return 'webp';
  return 'bin';
}
function createExporter(api, hooks) {
  hooks = hooks || {};
  let cancelled = false, count = 0, totalBytes = 0;
  const warnings = [], imageCache = new Map(), files = [], assetIndex = [], styles = {}, variables = {};
  const check = () => { if (cancelled) throw new Error('已取消导出'); };
  const warn = (id, operation, error) => warnings.push({ nodeId: id, operation, message: String(error && error.message || error) });
  function limit(message) { const e = new Error(message); e.fatal = true; throw e; }
  const addFile = async (path, data) => {
    check();
    const bytes = data instanceof Uint8Array ? data : Uint8Array.from(data);
    totalBytes += bytes.byteLength;
    if (totalBytes > 200 * 1024 * 1024) limit('素材超过 200 MiB，请拆分 Frame 后导出');
    if (files.length >= 10000) limit('素材数量超过 10000，请拆分 Frame');
    if (hooks.file) {
      try { await hooks.file(path, bytes); }
      catch (e) { e.fatal = true; throw e; }
    } else files.push({ path, bytes });
    if (hooks.file) files.push({ path, size: bytes.byteLength });
  };
  function read(node, keys, target) {
    for (const key of keys) {
      try {
        if (key in node) {
          const v = clean(node[key]);
          if (v !== undefined) target[key] = v;
        }
      } catch (e) { warn(node.id, 'read:' + key, e); }
    }
  }
  async function resolveRefs(value) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'VARIABLE_ALIAS' && value.id && !(value.id in variables)) {
      variables[value.id] = { id: value.id, unresolved: true };
      try {
        const v = await api.variables.getVariableByIdAsync(value.id);
        if (v) {
          const record = {}; read(v, ['id','key','name','description','resolvedType','valuesByMode','variableCollectionId','remote','scopes','codeSyntax'], record);
          variables[value.id] = record;
          await resolveRefs(record.valuesByMode);
        }
      } catch (e) { warn(value.id, 'variable', e); }
    }
    for (const key of Object.keys(value)) await resolveRefs(value[key]);
  }
  async function resolveStyles(data) {
    const ids = new Set();
    function find(v) {
      if (!v || typeof v !== 'object') return;
      for (const k of Object.keys(v)) {
        if (/StyleId$/.test(k) && typeof v[k] === 'string' && v[k]) ids.add(v[k]);
        else if (k !== 'children') find(v[k]);
      }
    }
    find(data);
    for (const id of ids) {
      if (id in styles) continue;
      styles[id] = { id, unresolved: true };
      try {
        const style = await api.getStyleByIdAsync(id);
        if (style) {
          const s = {}; read(style, ['id','key','name','type','description','remote','paints','effects','layoutGrids','fontName','fontSize','lineHeight','letterSpacing','paragraphSpacing','textCase','textDecoration','boundVariables'], s);
          styles[id] = s;
          await resolveRefs(s);
        }
      } catch (e) { warn(id, 'style', e); }
    }
  }
  async function imageAsset(hash, nodeId) {
    if (imageCache.has(hash)) return imageCache.get(hash);
    const promise = (async () => {
      try {
        const image = api.getImageByHash(hash);
        if (!image) throw new Error('图片字节不可用');
        const raw = await image.getBytesAsync(); check();
        const path = 'assets/images/' + safeName(hash) + '.' + imageExtension(raw);
        await addFile(path, raw);
        const asset = { path, kind: 'original-image', imageHash: hash, bytes: raw.length };
        assetIndex.push(asset); return path;
      } catch (e) { check(); if (e.fatal) throw e; warn(nodeId, 'image:' + hash, e); return null; }
    })();
    imageCache.set(hash, promise);
    return promise;
  }
  async function attachImages(value, nodeId) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'IMAGE' && value.imageHash) value.assetPath = await imageAsset(value.imageHash, nodeId);
    for (const key of Object.keys(value)) await attachImages(value[key], nodeId);
  }
  async function renderAsset(node, format, scale, data) {
    check();
    try {
      const settings = format === 'SVG' ? { format, svgOutlineText: true, svgIdAttribute: true } : { format, constraint: { type: 'SCALE', value: scale } };
      const bytes = await node.exportAsync(settings); check();
      const path = 'assets/nodes/' + safeName(node.id) + '-' + safeName(node.name) + '.' + format.toLowerCase();
      await addFile(path, bytes);
      const asset = { nodeId: node.id, path, kind: 'rendered-node', format, scale: format === 'PNG' ? scale : undefined };
      data.assets.push(asset); assetIndex.push(asset);
    } catch (e) { check(); if (e.fatal) throw e; warn(node.id, 'export:' + format, e); }
  }
  async function walk(node, parentId, siblingIndex, depth, inheritedVisible, options, rootInverse) {
    check();
    if (++count > 20000 || depth > 200) throw new Error('图层数量或嵌套深度超限，请拆分 Frame');
    if (hooks.progress) hooks.progress('读取 ' + count + '：' + node.name);
    const data = { id: node.id, name: node.name, type: node.type, parentId, siblingIndex, depth, assets: [] };
    read(node, NODE_FIELDS, data);
    data.effectiveVisible = inheritedVisible && data.visible !== false;
    if (data.absoluteTransform && rootInverse) data.transformRelativeToRoot = multiply(rootInverse, data.absoluteTransform);
    if (node.type === 'TEXT') {
      data.text = {}; read(node, TEXT_FIELDS, data.text);
      try { data.text.segments = clean(node.getStyledTextSegments(SEGMENT_FIELDS)); }
      catch (e) {
        warn(node.id, 'text-segments', e);
        // Older API versions can still preserve core rich-text fields.
        try { data.text.segments = clean(node.getStyledTextSegments(['fontName','fontSize','fills','lineHeight','letterSpacing'])); }
        catch (fallback) { warn(node.id, 'text-segments-fallback', fallback); }
      }
    }
    if (node.type === 'INSTANCE') {
      try {
        const main = await node.getMainComponentAsync();
        data.mainComponent = main ? { id: main.id, key: main.key, name: main.name, remote: main.remote,
          componentSet: main.parent && main.parent.type === 'COMPONENT_SET' ? { id: main.parent.id, name: main.parent.name, key: main.parent.key } : null } : null;
      } catch (e) { warn(node.id, 'main-component', e); }
    }
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') read(node, ['key','remote'], data);
    await resolveStyles(data);
    await resolveRefs(data);
    await attachImages(data, node.id);
    const drawable = data.effectiveVisible || options.includeHiddenAssets;
    if (drawable && node !== options.root) {
      const hasImage = JSON.stringify([data.fills, data.strokes, data.text && data.text.segments]).includes('"imageHash"');
      const scale = boundedScale(node, options.scale);
      if (VECTOR_TYPES.has(node.type) || (Array.isArray(data.exportSettings) && data.exportSettings.some(s => s.format === 'SVG'))) await renderAsset(node, 'SVG', scale, data);
      if (hasImage || options.allNodePng || (Array.isArray(data.exportSettings) && data.exportSettings.length)) await renderAsset(node, 'PNG', scale, data);
    }
    if ('children' in node) {
      data.children = [];
      const children = Array.from(node.children);
      for (let i = 0; i < children.length; i++) data.children.push(await walk(children[i], node.id, i, depth + 1, data.effectiveVisible, options, rootInverse));
    }
    return data;
  }
  return {
    cancel() { cancelled = true; },
    async run(root, requested) {
      if (!root || root.type !== 'FRAME') throw new Error('请只选择一个 Frame');
      const options = { scale: 1, allNodePng: false, includeHiddenAssets: false, ...requested, root };
      options.scale = [1, 2, 3].includes(Number(options.scale)) ? Number(options.scale) : 1;
      if (root.width <= 0 || root.height <= 0) throw new Error('Frame 尺寸必须大于 0');
      const previewScale = boundedScale(root, options.scale);
      // Preview is essential. Failure aborts instead of delivering a misleading ZIP.
      await addFile('preview.png', await root.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: previewScale } }));
      check();
      const tree = await walk(root, null, 0, 0, true, options, inverse(root.absoluteTransform));
      return {
        files,
        design: { schemaVersion: '1.0.0', generator: 'Figma to Codex Exporter', generatorVersion: '1.0.1',
          exportedAt: new Date().toISOString(), document: { name: api.root.name, pageId: api.currentPage.id, pageName: api.currentPage.name },
          coordinates: { unit: 'px', xY: 'relative to parent, including root x/y on page', absoluteTransform: 'page coordinates', transformRelativeToRoot: 'inverse(root.absoluteTransform) × node.absoluteTransform', siblingIndex: 'Figma children order, bottom to top; itemReverseZIndex may change Auto Layout paint order' },
          options: { scale: options.scale, allNodePng: !!options.allNodePng, includeHiddenAssets: !!options.includeHiddenAssets },
          preview: { path: 'preview.png', requestedScale: options.scale, effectiveScale: previewScale },
          statistics: { nodes: count, assetFiles: assetIndex.length, binaryBytes: totalBytes },
          root: tree, styles, variables, assets: assetIndex, warnings }
      };
    }
  };
}
function boundedScale(node, scale) {
  const w = Math.max(1, node.width || 1), h = Math.max(1, node.height || 1);
  return Math.min(scale, 8192 / Math.max(w, h), Math.sqrt(16000000 / (w * h)));
}
function multiply(a, b) {
  return [[a[0][0]*b[0][0]+a[0][1]*b[1][0], a[0][0]*b[0][1]+a[0][1]*b[1][1], a[0][0]*b[0][2]+a[0][1]*b[1][2]+a[0][2]],
    [a[1][0]*b[0][0]+a[1][1]*b[1][0], a[1][0]*b[0][1]+a[1][1]*b[1][1], a[1][0]*b[0][2]+a[1][1]*b[1][2]+a[1][2]]];
}
function inverse(t) {
  if (!t) return null;
  const d = t[0][0]*t[1][1]-t[0][1]*t[1][0];
  if (Math.abs(d) < 1e-12) return null;
  const a = t[1][1]/d, b = -t[0][1]/d, c = -t[1][0]/d, e = t[0][0]/d;
  return [[a,b,-a*t[0][2]-b*t[1][2]],[c,e,-c*t[0][2]-e*t[1][2]]];
}
module.exports = { createExporter, clean, safeName, boundedScale, inverse, multiply };

return module.exports;})();
'use strict';
const { createExporter, safeName } = __exporter;
figma.showUI(__html__, { width: 440, height: 570, themeColors: true });
let active = null, runId = 0, sequence = 0, pending = null, cancelled = false;
function send(message) { figma.ui.postMessage(message); }
function selection() {
  const nodes = figma.currentPage.selection;
  send({ type: 'selection', valid: nodes.length === 1 && nodes[0].type === 'FRAME',
    label: nodes.length === 1 ? nodes[0].name + ' · ' + nodes[0].type : '请选择一个 Frame' });
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
  if (message.type !== 'export' || active) return;
  const selected = figma.currentPage.selection;
  if (selected.length !== 1 || selected[0].type !== 'FRAME') { send({ type: 'error', message: '请只选择一个 Frame 后再导出' }); return; }
  runId++; cancelled = false;
  const root = selected[0];
  let lastProgress = 0;
  active = createExporter(figma, {
    file: transfer,
    progress: text => { if (Date.now() - lastProgress > 100) { send({ type: 'progress', text }); lastProgress = Date.now(); } }
  });
  send({ type: 'begin', runId });
  try {
    const result = await active.run(root, message.options || {});
    // JSON also travels in bounded messages; encoding stays inside the UI.
    const json = JSON.stringify(result.design, null, 2);
    if (json.length > 32 * 1024 * 1024) throw new Error('设计 JSON 超过 32 Mi 字符，请拆分 Frame');
    await reliable({ type: 'design-start' });
    for (let offset = 0; offset < json.length; offset += 64 * 1024) {
      await reliable({ type: 'design-chunk', text: json.slice(offset, offset + 64 * 1024) });
    }
    await reliable({ type: 'design-end' });
    send({ type: 'complete', runId, filename: safeName(root.name) + '-codex.zip', statistics: result.design.statistics, warnings: result.design.warnings });
  } catch (e) { send({ type: 'error', runId, message: String(e.message || e) }); }
  finally { active = null; selection(); }
};
// Register the host receiver before announcing initial selection.
figma.on('selectionchange', selection);
selection();

})();

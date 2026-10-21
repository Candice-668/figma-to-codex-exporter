/* ZIP32, STORE method. No CDN or third-party dependency. UTF-8 names + CRC32. */
(function (scope) {
  'use strict';
  const table = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = table[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function bytes(value) {
    if (typeof value === 'string') return new TextEncoder().encode(value);
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return Uint8Array.from(value);
  }
  function createZip(files) {
    if (files.length > 65535) throw new Error('ZIP32 文件数量超限');
    const locals = [], central = [], names = new Set();
    let offset = 0, centralSize = 0;
    for (const file of files) {
      if (!file.path || /(^|\/)\.\.($|\/)|^\/|\\|\x00|:/.test(file.path) || names.has(file.path)) throw new Error('无效或重复 ZIP 路径');
      names.add(file.path);
      const name = bytes(file.path), data = bytes(file.bytes);
      if (name.length > 65535 || data.length > 0xffffffff) throw new Error('ZIP32 文件大小超限');
      const crc = crc32(data), local = new Uint8Array(30 + name.length), l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true);
      l.setUint16(12, 33, true); // 1980-01-01
      l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true);
      l.setUint16(26, name.length, true); local.set(name, 30);
      const entry = new Uint8Array(46 + name.length), c = new DataView(entry.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
      c.setUint16(14, 33, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true); entry.set(name, 46);
      locals.push(local, data); central.push(entry);
      offset += local.length + data.length; centralSize += entry.length;
      if (offset + centralSize + 22 > 0xffffffff) throw new Error('ZIP32 总大小超限');
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
    const out = new Uint8Array(offset + centralSize + 22);
    let cursor = 0;
    for (const part of [...locals, ...central, end]) { out.set(part, cursor); cursor += part.length; }
    return out;
  }
  const api = { createZip, crc32 };
  if (typeof module !== 'undefined') module.exports = api;
  else scope.ExporterZip = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

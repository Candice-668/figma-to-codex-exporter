'use strict';
const {test}=require('node:test'); const assert=require('node:assert/strict');
const {createZip,crc32}=require('../src/zip');
test('CRC32 标准向量，Unicode ZIP 路径、本地头/中央目录和结束记录一致',()=>{
  assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
  const files=[{path:'design.json',bytes:'{"title":"中文"}'},{path:'assets/图标.svg',bytes:'<svg/>'},{path:'preview.png',bytes:[137,80,78,71]}];
  const data=createZip(files); const view=new DataView(data.buffer), end=data.length-22;
  assert.equal(view.getUint32(end,true),0x06054b50); assert.equal(view.getUint16(end+10,true),3);
  let central=view.getUint32(end+16,true);
  for(const f of files){
    assert.equal(view.getUint32(central,true),0x02014b50);
    const local=view.getUint32(central+42,true), nameLen=view.getUint16(central+28,true);
    assert.equal(view.getUint32(local,true),0x04034b50); assert.equal(view.getUint16(local+6,true),0x800);
    assert.equal(new TextDecoder().decode(data.slice(central+46,central+46+nameLen)),f.path);
    const localName=view.getUint16(local+26,true), size=view.getUint32(local+18,true);
    const payload=data.slice(local+30+localName,local+30+localName+size);
    assert.equal(crc32(payload),view.getUint32(central+16,true)); central+=46+nameLen;
  }
  assert.equal(central,end);
});
test('拒绝路径穿越、Windows 盘符和重复文件',()=>{
  for(const path of ['../x','assets/../x','C:/x','/x','a\\b']) assert.throws(()=>createZip([{path,bytes:[]}]),/路径/);
  assert.throws(()=>createZip([{path:'x',bytes:[]},{path:'x',bytes:[]}]),/路径/);
});

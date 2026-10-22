'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(){
  const elements=new Map(),sent=[],timers=new Map();let next=0;
  const get=id=>{if(!elements.has(id))elements.set(id,{style:{},value:id==='scope'?'selected':'1',checked:false,disabled:false,hidden:false,textContent:''});return elements.get(id);};
  const parent={postMessage(message){sent.push(message.pluginMessage);}};
  const context={parent,console,Set,Uint8Array,TextEncoder,Blob,URL,
    setInterval(fn){timers.set(++next,fn);return next;},clearInterval(id){timers.delete(id);},
    document:{getElementById:get},window:{addEventListener(){}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/ui.js'),'utf8'),context);
  return {get,sent,timers,context,receive(data,source){context.window.onmessage({source,data});},tick(){for(const fn of [...timers.values()])fn();}};
}
test('startup accepts Figma bridge messages with null source and updates later selections',()=>{
  const h=harness();assert.equal(h.sent[0].type,'ready');assert.equal(h.get('export').disabled,true);
  h.receive({pluginMessage:{type:'selection',valid:true,label:'Desktop · FRAME'}},null);
  assert.equal(h.get('selection').textContent,'Desktop · FRAME');assert.equal(h.get('export').disabled,false);assert.equal(h.timers.size,0);
  h.receive({pluginMessage:{type:'selection',valid:false,label:'Title · TEXT'}},{});
  assert.equal(h.get('selection').textContent,'Title · TEXT');assert.equal(h.get('export').disabled,true);
});
test('lost startup ready messages retry; timeout stops waiting; refresh can recover',()=>{
  const h=harness();for(let i=0;i<11;i++)h.tick();
  assert.equal(h.sent.length,10);assert.equal(h.timers.size,0);assert.match(h.get('status').textContent,/manifest\.json/);
  h.get('refresh').onclick();assert.equal(h.timers.size,1);assert.equal(h.sent.length,11);
  h.receive({pluginMessage:{type:'selection',valid:true,label:'Recovered · FRAME'}},null);
  assert.equal(h.get('export').disabled,false);assert.equal(h.timers.size,0);
});
test('malformed or unknown message envelopes do not enable export',()=>{
  const h=harness();
  for(const data of [{},{type:'selection',valid:true},{pluginMessage:{type:'selection',valid:'yes',label:'bad'}},{pluginMessage:{type:'unknown'}}])h.receive(data,null);
  assert.equal(h.get('export').disabled,true);assert.equal(h.timers.size,1);
});
test('package, generated UI and exported design use the same release version',()=>{
  const root=path.resolve(__dirname,'..'),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
  assert.match(fs.readFileSync(path.join(root,'dist/ui.html'),'utf8'),new RegExp('v'+version.replaceAll('.','\\.')));
  assert.ok(fs.readFileSync(path.join(root,'src/exporter.js'),'utf8').includes("generatorVersion: '"+version+"'"));
});

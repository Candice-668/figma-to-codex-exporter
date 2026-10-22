'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function element(){return {style:{},value:'',checked:false,hidden:false,disabled:false,textContent:'',children:[],appendChild(child){this.children.push(child);return child;},replaceChildren(){this.children=[];},remove(){},click(){if(!this.disabled)return this.onclick?.();}};}
function frame(id='1:1',type='FRAME'){
  return {id,name:'测试 '+id,type,width:390,height:800,visible:true,children:[],absoluteTransform:[[1,0,0],[0,1,0]],fills:[],
    async exportAsync(settings){if(settings.format==='SVG')return new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');return new Uint8Array([137,80,78,71]);}};
}
async function pumpUntil(predicate){for(let i=0;i<300&&!predicate();i++)await new Promise(r=>setImmediate(r));if(!predicate())throw new Error('Expected UI outcome did not arrive');}
function boot(options={}){
  const elements=new Map(),get=id=>{if(!elements.has(id)){const e=element();e.value=id==='scope'?'selected':id==='scale'?'1':'';elements.set(id,e);}return elements.get(id);};
  let uiReceive,pluginReceive,blob,downloaded=false;
  const timers=new Set(),events=[],parent={postMessage(m){events.push(m.pluginMessage);queueMicrotask(()=>pluginReceive(m.pluginMessage));}};
  const ui={TextEncoder,Uint8Array,ArrayBuffer,DataView,Set,Map,Blob,console,parent,URL:{createObjectURL(b){blob=b;return 'blob:test';},revokeObjectURL(){}},
    setInterval(fn,ms){const id=setInterval(fn,ms);id.unref();timers.add(id);return id;},clearInterval(id){clearInterval(id);timers.delete(id);},
    document:{getElementById:get,createElement(tag){const e=element();if(tag==='a')e.click=()=>{downloaded=true;};return e;},body:element()},window:{addEventListener(){}}};
  const page={id:'p1',name:'Page',type:'PAGE',children:[],selection:[]};
  const roots=options.roots||[frame()];for(const n of roots){if(!n.parent)n.parent=page;}page.children=roots.filter(n=>n.parent===page);page.selection=options.selection||roots;
  const api={root:{name:'Doc',children:options.pages||[page]},currentPage:page,on(){},showUI(){},ui:{postMessage(m){queueMicrotask(()=>uiReceive({source:null,data:{pluginMessage:m}}));}}};
  const sandbox={figma:api,__html__:'<html/>',console,setTimeout,clearTimeout,Uint8Array};vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/code.js'),'utf8'),sandbox);pluginReceive=m=>api.ui.onmessage(m);
  vm.createContext(ui);const html=fs.readFileSync(path.join(__dirname,'../dist/ui.html'),'utf8');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],ui);
  uiReceive=e=>ui.window.onmessage(e);
  return {get,api,roots,events,get blob(){return blob;},get downloaded(){return downloaded;},clearBlob(){blob=null;},stop(){for(const t of timers)clearInterval(t);}};
}
async function unzip(blob){
  const data=new Uint8Array(await blob.arrayBuffer()),view=new DataView(data.buffer),files=new Map();let pos=0;
  while(view.getUint32(pos,true)===0x04034b50){
    const size=view.getUint32(pos+18,true),nl=view.getUint16(pos+26,true),el=view.getUint16(pos+28,true),start=pos+30+nl+el;
    const name=new TextDecoder().decode(data.slice(pos+30,pos+30+nl));files.set(name,data.slice(start,start+size));pos=start+size;
  }
  return {files,json:name=>JSON.parse(new TextDecoder().decode(files.get(name))),text:name=>new TextDecoder().decode(files.get(name))};
}
module.exports={boot,frame,pumpUntil,unzip};

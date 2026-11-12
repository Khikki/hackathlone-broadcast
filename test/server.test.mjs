import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const port=13131, base=`http://127.0.0.1:${port}`;
let processHandle, dir;
const get=async()=> (await fetch(base+'/api/state')).json();
const put=async value=>{const r=await fetch(base+'/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});assert.equal(r.status,200);return r.json();};
async function launch(){
  processHandle=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Server did not start')),5000);processHandle.once('error',reject);processHandle.stdout.once('data',()=>{clearTimeout(timeout);resolve();});processHandle.once('exit',code=>{if(code)reject(new Error('Server exited '+code));});});
}
async function stop(){const done=new Promise(resolve=>processHandle.once('exit',resolve));processHandle.kill();await done;}
before(async()=>{dir=await mkdtemp(path.join(tmpdir(),'hackathlone-test-'));await launch();});
after(async()=>{if(processHandle?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});});
test('serves dashboard, transparent output and bundled brand assets',async()=>{
  for(const url of ['/','/overlay','/overlay?layer=lower','/studio.js','/overlay.js','/studio.css','/overlay.css','/assets/logo.svg','/assets/logo-light.svg','/assets/icon.svg','/assets/icon-light.svg','/assets/spaceapps.svg','/assets/spaceapps-light.svg','/assets/partners/angola-ggpen.png','/assets/partners/uk-space-agency.png','/assets/font.woff2','/assets/overpass.woff2'])assert.equal((await fetch(base+url)).status,200,url);
  assert.equal((await fetch(base+'/unknown')).status,404);
});
test('includes the complete NASA Space Apps agency partner roster',async()=>{
  const state=await get(), agencies=state.partners.filter(partner=>partner.label==='NASA SPACE APPS PARTNER');
  assert.equal(agencies.length,17);
  assert.ok(agencies.every(partner=>partner.logo.startsWith('/assets/partners/')));
  assert.ok(agencies.some(partner=>partner.name.includes('GGPEN')));
  assert.ok(agencies.some(partner=>partner.name==='UK Space Agency'));
});
test('includes the complete official local event schedule',async()=>{
  const {schedule}=await get();
  assert.equal(schedule.length,34);
  assert.deepEqual([...new Set(schedule.map(item=>item.day))],['13 NOV','14 NOV','15 NOV']);
  assert.equal(schedule[0].time,'16:00');
  assert.equal(schedule.at(-1).title,'Venue close-down');
});
test('partial changes preserve other controls and clamp invalid settings',async()=>{
  const original=await get();await put({event:{...original.event,title:'Integration Test'}});
  const state=await put({settings:{accent:'bad',safe:999,speed:-1,autoHide:0}});
  assert.equal(state.event.title,'Integration Test');assert.equal(state.settings.safe,160);assert.equal(state.settings.speed,12);assert.equal(state.settings.accent,'#0042a6');
  const safeLogo=await put({partners:[{name:'Test',logo:'/assets/partners/angola-ggpen.png'}]});assert.equal(safeLogo.partners[0].logo,'/assets/partners/angola-ggpen.png');
  const logos=await put({partners:[{name:'Test',logo:'javascript:alert(1)'}]});assert.equal(logos.partners[0].logo,'');
});
test('rejects foreign origins and malformed configuration',async()=>{
  assert.equal((await fetch(base+'/api/state',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:'broken'})).status,400);
});
test('pushes guest updates to independently connected overlay clients',async()=>{
  const abort=new AbortController();const response=await fetch(base+'/api/events',{signal:abort.signal});
  const reader=response.body.getReader(), decoder=new TextDecoder();
  const first=decoder.decode((await reader.read()).value);assert.match(first,/data: /);
  const state=await get();await put({guest:{name:'Test Speaker',role:'Host',organization:'Test Org'},layers:{...state.layers,lower:true},lowerHideAt:null});
  const next=decoder.decode((await reader.read()).value);assert.match(next,/Test Speaker/);assert.match(next,/"lower":true/);abort.abort();
});
test('auto-hides a lower third on the server without an open control panel',async()=>{
  const state=await get();await put({layers:{...state.layers,lower:true},lowerHideAt:Date.now()+100});
  await new Promise(resolve=>setTimeout(resolve,600));assert.equal((await get()).layers.lower,false);
});
test('persists configuration and restores it after server restart',async()=>{
  await put({event:{title:'Persisted Event'}});assert.equal(JSON.parse(await readFile(path.join(dir,'state.json'),'utf8')).event.title,'Persisted Event');
  await stop();await launch();assert.equal((await get()).event.title,'Persisted Event');
});

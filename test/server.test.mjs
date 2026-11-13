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
  const state=await get();await put({settings:{...state.settings,autoHide:8}});await put({layers:{...state.layers,lower:true},lowerHideAt:Date.now()+100});
  await new Promise(resolve=>setTimeout(resolve,600));assert.equal((await get()).layers.lower,false);
});
test('persists configuration and restores it after server restart',async()=>{
  await put({event:{title:'Persisted Event'}});assert.equal(JSON.parse(await readFile(path.join(dir,'state.json'),'utf8')).event.title,'Persisted Event');
  await stop();await launch();assert.equal((await get()).event.title,'Persisted Event');
});

test('auto-hide starts on show, cancels in manual, and ignores unrelated layer updates',async()=>{
  let s=await get();
  s=await put({scene:'live',layers:{...s.layers,lower:false},settings:{...s.settings,autoHide:8}});
  s=await put({layers:{...s.layers,lower:true}});assert.ok(s.lowerHideAt>Date.now()+7000);
  const deadline=s.lowerHideAt;
  s=await put({layers:{...s.layers,partners:!s.layers.partners}});assert.equal(s.lowerHideAt,deadline);
  s=await put({settings:{...s.settings,autoHide:0}});assert.equal(s.lowerHideAt,null);assert.equal(s.layers.lower,true);
  s=await put({settings:{...s.settings,autoHide:20}});assert.ok(s.lowerHideAt>Date.now()+19000);
  s=await put({scene:'break'});assert.equal(s.lowerHideAt,null);
  s=await put({scene:'live'});assert.ok(s.lowerHideAt>Date.now()+19000);
});
test('saves all logo and layout variations',async()=>{
  for(const logoVariant of ['icon','full','space','combined','stacked','icon-space']){
    const s=await get();const next=await put({settings:{...s.settings,logoVariant,widgetStyle:'dark'}});
    assert.equal(next.settings.logoVariant,logoVariant);assert.equal(next.settings.widgetStyle,'dark');
  }
});
test('guest company images survive saving and can be removed safely',async()=>{
  const logo='data:image/png;base64,iVBORw0KGgo=';
  let s=await put({guest:{name:'Guest',logo},guests:[{name:'Saved guest',logo}]});
  assert.equal(s.guest.logo,logo);assert.equal(s.guests[0].logo,logo);
  s=await put({guest:{...s.guest,logo:''}});assert.equal(s.guest.logo,'');
  s=await put({guest:{name:'Guest',logo:'javascript:alert(1)'}});assert.equal(s.guest.logo,'');
});
test('broadcast theme is shared and persists across server restart',async()=>{
  let s=await get();s=await put({settings:{...s.settings,themeMode:'auto'}});
  assert.equal(s.settings.themeMode,'auto');await stop();await launch();assert.equal((await get()).settings.themeMode,'auto');
});
test('automatic theme follows Dublin time including daylight saving boundaries',async()=>{
  const {resolveTheme}=await import('../dist/theme.js');
  for(const [time,result] of [['2026-11-12T06:59:00Z','dark'],['2026-11-12T07:00:00Z','light'],['2026-11-12T18:59:00Z','light'],['2026-11-12T19:00:00Z','dark'],['2026-07-12T18:00:00Z','dark'],['2026-07-12T06:00:00Z','light']])assert.equal(resolveTheme('auto',new Date(time)),result);
  assert.equal(resolveTheme('light',new Date('2026-11-12T23:00:00Z')),'light');
});
test('scene motion stays shared and random choices do not repeat consecutively',async()=>{
  const {motionChoice,backgrounds,transitions}=await import('../dist/motion.js');
  let s=await get();s=await put({scene:'live',settings:{...s.settings,sceneBackground:'random',sceneTransition:'random'}});
  for(const scene of ['starting','break','technical','live']){const previous=s;s=await put({scene});assert.notEqual(motionChoice('random',s.sceneSeed,backgrounds),motionChoice('random',previous.sceneSeed,backgrounds));assert.notEqual(motionChoice('random',s.sceneSeed,transitions),motionChoice('random',previous.sceneSeed,transitions));}
  const seed=s.sceneSeed;s=await put({settings:{...s.settings,sceneBackground:'nebula'}});assert.equal(s.sceneSeed,seed);assert.equal(motionChoice(s.settings.sceneBackground,seed,backgrounds),'nebula');
});
test('operator preview uses live animation mode, never screenshot capture mode',async()=>{
  const html=await(await fetch(base+'/')).text();
  const src=html.match(/<iframe[^>]+src="([^"]+)"/)[1].replaceAll('&amp;','&');
  const url=new URL(src,base);assert.equal(url.searchParams.get('preview'),'1');assert.equal(url.searchParams.has('capture'),false);
});

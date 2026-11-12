const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state, toastTimer, connected=false, writeQueue=Promise.resolve(), draftDirty=false;
const layerNames={bug:['◈','Event mark','Logo in the top corner'],lower:['▰','Guest lower third','Name, role and organisation'],partners:['⇄','Partner strip','Seamless full-width logo loop'],agenda:['▤','Agenda','The next three items'],timer:['◷','Countdown','Broadcast timer']};
$('layer-toggles').innerHTML=Object.entries(layerNames).map(([key,[icon,title,detail]])=>`<div class="widget-row"><span class="widget-icon">${icon}</span><div><b>${title}</b><small>${detail}</small></div><button class="toggle" data-layer="${key}" aria-label="${title}" aria-pressed="false"></button></div>`).join('');
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000);}
function setConnection(value){connected=value;$('connection').classList.toggle('offline',!value);$('connection').innerHTML=`<i></i> ${value?'Server connected':'Offline · reconnecting'}`;}
// Queue operator actions: every update is derived from the newest acknowledged state.
function update(change,message){
  const run=writeQueue.then(async()=>{
    if(!connected)throw new Error('The server is offline. Your change was not sent.');
    const patch=typeof change==='function'?change(state):change;
    const r=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
    if(!r.ok)throw new Error((await r.json()).error || 'Could not save the change');
    state=await r.json();render();if(message)toast(message);return state;
  });
  writeQueue=run.catch(e=>toast(e.message));return run;
}
function fill(form,data){for(const [key,value] of Object.entries(data)){const el=form.elements.namedItem(key);if(el&&document.activeElement!==el){if(el.type==='checkbox')el.checked=value;else el.value=value;}}}
function draft(){const f=$('guest-form');$('draft-name').textContent=f.elements.name.value || 'Guest name';$('draft-meta').textContent=[f.elements.role.value,f.elements.organization.value].filter(Boolean).join(' / ');}
const tabInfo={studio:['Ready for <span>broadcast.</span>','Names, moments and people. Control exactly what your audience sees.'],guests:['People of the <span>mission.</span>','Prepare guest cards ahead of time, then put the right person on screen at the right moment.'],teams:['Teams on <span>stage.</span>','Choose a team to show its name in the bottom-centre on-stage graphic.'],schedule:['The flight <span>plan.</span>','Event timing, upcoming sessions and important deadlines.'],partners:['Built <span>together.</span>','Organisers, partners and communities making the mission possible.'],settings:['Your broadcast <span>system.</span>','OBS sources, brand graphics and production backups.']};
function tab(name){document.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active',el.id==='tab-'+name));document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el.dataset.tab===name));$('page-title').innerHTML=tabInfo[name][0];$('page-description').textContent=tabInfo[name][1];$('breadcrumb').textContent=document.querySelector(`[data-tab="${name}"]`).textContent.trim();}
document.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>tab(el.dataset.tab));
let libraryKey='';
function render(){
  if(!state)return;
  document.documentElement.style.setProperty('--accent',state.settings.accent);
  document.querySelectorAll('[data-layer]').forEach(el=>el.setAttribute('aria-pressed',state.layers[el.dataset.layer]));
  document.querySelectorAll('[data-scene]').forEach(el=>el.classList.toggle('selected',el.dataset.scene===state.scene));
  const activeLayers=Object.values(state.layers).filter(Boolean).length;$('layer-count').textContent=`${activeLayers} active`;
  if(!draftDirty){fill($('guest-form'),state.guest);draft();}
  fill($('event-form'),state.event);fill($('settings-form'),state.settings);fill($('announcement-form'),state.announcement);
  if(document.activeElement!==$('auto-hide'))$('auto-hide').value=state.settings.autoHide;
  fill($('timer-form'),{label:state.timer.label});
  $('pause-timer').textContent=state.timer.endAt?'Ⅱ Pause':'▶ Resume';
  const key=JSON.stringify([state.guests,state.teams,state.schedule,state.activeSchedule,state.partners]);
  if(key!==libraryKey){
    $('guest-list').innerHTML=state.guests.map((g,i)=>`<div class="list-item"><div class="avatar">${esc(g.name.charAt(0))}</div><div class="info"><b>${esc(g.name)}</b><small>${esc([g.role,g.organization].filter(Boolean).join(' / '))}</small></div><button class="secondary" data-load-guest="${i}">Prepare ↗</button><button class="icon-button" data-delete-guest="${i}" aria-label="Delete guest">×</button></div>`).join('')||'<div class="empty">Add your first guest</div>';
    $('schedule-list').innerHTML=state.schedule.map((p,i)=>`<div class="list-item ${i===state.activeSchedule?'selected':''}"><div class="info"><small>${esc(p.day)} / ${esc(p.time)}</small><b>${esc(p.title)}</b><small>${esc(p.detail)}</small></div><button class="secondary" data-select-schedule="${i}">${i===state.activeSchedule?'Selected':'Select'}</button><button class="icon-button" data-delete-schedule="${i}" aria-label="Delete item">×</button></div>`).join('')||'<div class="empty">The run of show is empty</div>';
    $('partner-list').innerHTML=state.partners.map((p,i)=>`<div class="list-item">${p.logo?`<img src="${esc(p.logo)}" alt="${esc(p.name)}">`:''}<div class="info"><b>${esc(p.name)}</b><small>${esc(p.label)}</small></div><button class="icon-button" data-move-partner="${i}" ${i===0?'disabled':''} aria-label="Move organisation up">↑</button><button class="icon-button" data-delete-partner="${i}" aria-label="Delete organisation">×</button></div>`).join('')||'<div class="empty">Add an organiser or partner</div>';
    $('team-list').innerHTML=state.teams.map((team,i)=>`<article class="team-card"><div><span>TEAM ${String(i+1).padStart(2,'0')}</span><h3>${esc(team)}</h3></div><button class="accent" data-team-index="${i}">↗ Bring on stage</button></article>`).join('')||'<div class="empty">No teams in the saved event page</div>';
    libraryKey=key;
  }
  tick();
}
async function loadState(){
  const response=await fetch('/api/state',{cache:'no-store'});
  if(!response.ok)throw new Error('State request failed');
  state=await response.json();setConnection(true);render();
}
const stream=new EventSource('/api/events');
stream.onopen=()=>setConnection(true);
stream.onmessage=e=>{setConnection(true);state=JSON.parse(e.data);render();};
stream.onerror=()=>{setConnection(false);loadState().catch(()=>{});};
loadState().catch(()=>setConnection(false));
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||!state)return;
  if(b.dataset.layer)update(s=>({layers:{...s.layers,[b.dataset.layer]:!s.layers[b.dataset.layer]},...(b.dataset.layer==='lower'?{lowerHideAt:null}:{})})).catch(()=>{});
  if(b.dataset.scene)update(s=>{
    const timerLayer = ['starting','break','ending'].includes(b.dataset.scene) ? {timer:b.dataset.scene==='break'} : {};
    return {scene:b.dataset.scene,layers:{...s.layers,...timerLayer}};
  },'Scene switched').catch(()=>{});
  if(b.dataset.loadGuest!==undefined){fill($('guest-form'),state.guests[+b.dataset.loadGuest]);draftDirty=true;draft();tab('studio');toast('Guest prepared. Press “Take live” when ready.');}
  if(b.dataset.teamIndex!==undefined){const team=state.teams[+b.dataset.teamIndex];if(team)update(s=>({guest:{name:team,role:'Presenting team',organization:'NASA Space Apps Challenge'},lowerPosition:'center',layers:{...s.layers,lower:true},lowerHideAt:s.settings.autoHide?Date.now()+s.settings.autoHide*1000:null}),'Team is on stage').catch(()=>{});}
  for(const [data,field] of [['deleteGuest','guests'],['deletePartner','partners'],['deleteSchedule','schedule']])if(b.dataset[data]!==undefined)update(s=>({[field]:s[field].filter((_,i)=>i!==+b.dataset[data]),...(field==='schedule'?{activeSchedule:Math.max(0,s.activeSchedule-(+b.dataset[data]<s.activeSchedule?1:0))}:{})}),'Card deleted').catch(()=>{});
  if(b.dataset.selectSchedule!==undefined)update({activeSchedule:+b.dataset.selectSchedule}).catch(()=>{});
  if(b.dataset.movePartner!==undefined)update(s=>{const p=[...s.partners],i=+b.dataset.movePartner;[p[i-1],p[i]]=[p[i],p[i-1]];return{partners:p};}).catch(()=>{});
});
function panic(){update(s=>({scene:'live',layers:Object.fromEntries(Object.keys(s.layers).map(k=>[k,false])),lowerHideAt:null}),'All graphics hidden').catch(()=>{});}
$('panic').onclick=panic;addEventListener('keydown',e=>{if(e.key==='Escape')panic();});
$('guest-form').oninput=()=>{draftDirty=true;draft();};
$('guest-form').onsubmit=async e=>{e.preventDefault();const guest=Object.fromEntries(new FormData(e.target));try{await update(s=>({guest,lowerPosition:'left',layers:{...s.layers,lower:true},lowerHideAt:s.settings.autoHide?Date.now()+s.settings.autoHide*1000:null}),'Guest is live');draftDirty=false;}catch{}};
$('hide-guest').onclick=()=>update(s=>({layers:{...s.layers,lower:false},lowerHideAt:null})).catch(()=>{});
$('auto-hide').onchange=e=>update(s=>({settings:{...s.settings,autoHide:+e.target.value}})).catch(()=>{});
$('save-guest-form').onsubmit=async e=>{e.preventDefault();const guest=Object.fromEntries(new FormData(e.target));try{await update(s=>({guests:[...s.guests,guest]}),'Guest saved');e.target.reset();}catch{}};
$('announcement-form').onsubmit=e=>{e.preventDefault();update({announcement:Object.fromEntries(new FormData(e.target))},'Ticker updated').catch(()=>{});};
$('timer-form').onsubmit=e=>{e.preventDefault();const data=new FormData(e.target),duration=+data.get('minutes')*60;update(s=>({timer:{duration,remaining:duration,endAt:Date.now()+duration*1000,label:data.get('label')},layers:{...s.layers,timer:true}}),'Countdown started').catch(()=>{});};
$('pause-timer').onclick=()=>update(s=>({timer:s.timer.endAt?{...s.timer,remaining:Math.max(0,Math.ceil((s.timer.endAt-Date.now())/1000)),endAt:null}:{...s.timer,endAt:Date.now()+s.timer.remaining*1000}})).catch(()=>{});
$('reset-timer').onclick=()=>update(s=>({timer:{...s.timer,remaining:s.timer.duration,endAt:null}}),'Countdown reset').catch(()=>{});
$('schedule-form').onsubmit=async e=>{e.preventDefault();const item=Object.fromEntries(new FormData(e.target));try{await update(s=>({schedule:[...s.schedule,item]}),'Item added');e.target.reset();}catch{}};
$('show-agenda').onclick=()=>update(s=>({layers:{...s.layers,agenda:true}}),'Agenda is live').catch(()=>{});
$('show-partners').onclick=()=>update(s=>({layers:{...s.layers,partners:true}}),'Partner strip is live').catch(()=>{});
$('partner-form').onsubmit=async e=>{
  e.preventDefault();const f=e.target,data=new FormData(f),file=data.get('logo');let logo='';
  try{if(file?.size){if(file.size>1000000)throw new Error('The logo must be smaller than 1 MB');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPEG or WebP file');logo=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
  await update(s=>({partners:[...s.partners,{name:data.get('name'),label:data.get('label'),logo}]}),'Organisation added');f.reset();}catch(e){toast(e.message);}
};
$('event-form').onsubmit=e=>{e.preventDefault();update({event:Object.fromEntries(new FormData(e.target))},'Event saved').catch(()=>{});};
$('settings-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);update(s=>({settings:{...s.settings,accent:f.get('accent'),safe:+f.get('safe'),speed:+f.get('speed'),guides:f.has('guides')}}),'Graphics settings applied').catch(()=>{});};
$('obs-links').innerHTML=[['Combined output',''],['Guest lower third','lower'],['Partner strip','partners'],['Event mark','bug'],['Announcement ticker','ticker'],['Countdown','timer'],['Agenda','agenda'],['Full-screen slates','slate']].map(([title,layer])=>{const url=location.origin+'/overlay'+(layer?'?layer='+layer:'');return`<div class="obs-link"><span>${title}</span><div><input readonly value="${esc(url)}" aria-label="${title} URL"><button class="secondary" data-copy="${esc(url)}">Copy</button></div></div>`;}).join('');
$('obs-links').onclick=async e=>{const b=e.target.closest('[data-copy]');if(!b)return;try{await navigator.clipboard.writeText(b.dataset.copy);toast('URL copied');}catch{b.previousElementSibling.select();toast('Selected — press Ctrl+C to copy');}};
$('export').onclick=()=>{if(!state)return;const snapshot={...state,timer:{...state.timer,remaining:Math.max(0,Math.ceil(state.timer.endAt?(state.timer.endAt-Date.now())/1000:state.timer.remaining)),endAt:null}};const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='hackathlone-broadcast.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>8000000)throw new Error('The file is too large');const data=JSON.parse(await file.text());if(!data.event||!data.layers||!Array.isArray(data.guests)||!Array.isArray(data.schedule)||!data.settings)throw new Error('This is not a HackAthlone broadcast backup');await update({...data,scene:'live',layers:{bug:false,lower:false,partners:false,ticker:false,timer:false,agenda:false},lowerHideAt:null,timer:{...data.timer,endAt:null}},'Backup restored');draftDirty=false;render();}catch(err){toast(err.message);}e.target.value='';};
function tick(){const d=new Date();$('clock').textContent=d.toLocaleTimeString('en-GB',{timeZone:'Europe/Dublin'})+' DUB';if(!state)return;const n=Math.max(0,Math.ceil(state.timer.endAt?(state.timer.endAt-Date.now())/1000:state.timer.remaining));$('timer-display').textContent=(n>=3600?String(Math.floor(n/3600)).padStart(2,'0')+':':'')+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
tick();setInterval(tick,250);

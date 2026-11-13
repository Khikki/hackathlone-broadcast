import { backgrounds,transitions,motionChoice } from './motion.js';
import { resolveTheme } from './theme.js';
const $ = id => document.getElementById(id);
let state, partnerKey, scheduleKey, tickerKey, sceneKey;
const params = new URLSearchParams(location.search);
const only = params.get('layer');
if(params.has('capture')) document.documentElement.classList.add('capture');
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = (id,v) => { if($(id).textContent !== v) $(id).textContent = v; };
function visibility(id,on) { $(id).classList.toggle('hidden',!on); }
function time() {
  if(!state)return;
  $('canvas').dataset.theme=resolveTheme(state.settings.themeMode);
  const seconds = Math.max(0,Math.ceil(state.timer.endAt ? (state.timer.endAt-Date.now())/1000 : state.timer.remaining));
  const output = (seconds>=3600 ? `${Math.floor(seconds/3600).toString().padStart(2,'0')}:` : '') + `${Math.floor(seconds/60)%60}`.padStart(2,'0')+':'+`${seconds%60}`.padStart(2,'0');
  text('timer-value',output); text('slate-time',state.layers.timer && ['starting','break','technical','standby','lunch','judging'].includes(state.scene) ? output : '');
  $('timer').classList.toggle('expired',seconds===0);
  if(state.lowerHideAt && Date.now()>=state.lowerHideAt)visibility('lower',false);
}
function render(s) {
  state = s;
  const canvas = $('canvas');
  canvas.dataset.widgetStyle=s.settings.widgetStyle || 'compact';
  canvas.dataset.logoVariant=s.settings.logoVariant || 'icon';
  const variant=s.settings.logoVariant || 'icon';
  const ha=variant==='icon' || variant==='icon-space'?'assets/brand/icon-blue.svg':'assets/brand/full-blue.svg';
  const duo=['combined','stacked','icon-space'].includes(variant);
  document.querySelectorAll('.brand-tile').forEach(tile=>{
    if(tile.dataset.variant===variant)return;
    tile.dataset.variant=variant;
    tile.innerHTML=(variant==='space'?'':`<img class="ha-logo" src="${ha}" alt="HackAthlone">`)+(duo?'<span class="logo-divider"></span>':'')+((duo || variant==='space')?'<img class="space-logo" src="assets/spaceapps.svg" alt="NASA Space Apps Athlone">':'');
  });
  canvas.dataset.background=motionChoice(s.settings.sceneBackground,s.sceneSeed || 0,backgrounds);
  canvas.dataset.transition=motionChoice(s.settings.sceneTransition,s.sceneSeed || 0,transitions);
  if(sceneKey !== s.scene){
    sceneKey = s.scene;
    canvas.dataset.scene = s.scene;
    canvas.classList.remove('scene-enter');
    // Restart the entrance sequence on every scene change, including live.
    void canvas.offsetWidth;
    canvas.classList.add('scene-enter');
  }
  canvas.style.setProperty('--accent',s.settings.accent);canvas.style.setProperty('--safe',s.settings.safe+'px');canvas.style.setProperty('--speed',s.settings.speed+'s');
  const guestLogo=document.getElementById('guest-company-logo');
  const company=typeof s.guest.logo==='string' && /^data:image\/(png|jpeg|webp);base64,/.test(s.guest.logo)?s.guest.logo:'';
  guestLogo.parentElement.hidden=!company;
  if(company && guestLogo.getAttribute('src')!==company)guestLogo.src=company;
  if(!company)guestLogo.removeAttribute('src');
  const on = key => s.layers[key] && (!only || only===key);
  $('lower').classList.toggle('team-lower',s.lowerPosition==='center');
  text('lower-eyebrow',s.lowerPosition==='center'?'TEAM ON STAGE':'ON STAGE');
  const partner = on('partners'), ticker = on('ticker');
  canvas.classList.toggle('has-bottom-strip',Boolean(partner || ticker));
  canvas.style.setProperty('--bottom-offset',((partner?122:0)+(ticker?64:0))+'px');canvas.style.setProperty('--ticker-bottom',(partner?122:0)+'px');
  for(const key of Object.keys(s.layers))visibility(key,on(key));
  visibility('slate',s.scene !== 'live' && (!only || only==='slate'));
  if(s.scene !== 'live')for(const key of ['bug','lower','agenda'])visibility(key,false);
  if(s.scene !== 'live')visibility('timer',false);
  visibility('guides',s.settings.guides && new URLSearchParams(location.search).has('preview'));
  text('bug-title',s.event.title);text('bug-sub',s.event.subtitle);
  text('guest-name',s.guest.name);text('guest-meta',[s.guest.role,s.guest.organization].filter(Boolean).join(' / '));
  text('timer-label',s.timer.label);text('slate-event',s.event.title+' / '+s.event.subtitle);
  text('slate-title',({starting:'The mission starts soon.',break:'A short intermission.',ending:'One weekend. Infinite possibilities.',technical:'We’ll be right back.',standby:'Next up. Stay tuned.',lunch:'Time to recharge.',judging:'Great ideas. Big decisions.'})[s.scene] || '');
  text('slate-venue',({technical:'We’re resolving a technical issue. Thank you for your patience.',standby:'We’re preparing the next session. Stay with us.',lunch:'Enjoy your break. The programme will resume shortly.',judging:'Our judges are reviewing the projects. Results coming soon.'})[s.scene] || s.event.venue);text('slate-dates',s.event.dates);text('ticker-label',s.announcement.label);
  const t = s.announcement.text;
  if(tickerKey!==t){
    const repetitions=Math.max(2,Math.ceil(1920/(Math.max(1,t.length)*11+190)));
    $('ticker-track').innerHTML=`<span>${esc(t)}　↗　</span>`.repeat(repetitions*2);tickerKey=t;
  }
  const p = JSON.stringify(s.partners);
  if(partnerKey!==p){
    const group=s.partners.map(p=>`<div class="partner"><div><small>${esc(p.label)}</small>${p.logo?`<img class="${p.background==='dark' || (!p.background && ['/assets/logo.svg','/assets/spaceapps.svg'].includes(p.logo))?'dark':'light'}" src="${esc(p.logo)}" alt="${esc(p.name)}">`:`<b>${esc(p.name)}</b>`}</div></div>`).join('');
    // Each equal-width half fills the viewport even with a single partner.
    const content = group.repeat(Math.max(1,Math.ceil(1920/Math.max(1,s.partners.length*320))));
    $('partner-track').innerHTML=`<div class="partner-group">${content}</div>`.repeat(2);partnerKey=p;
  }
  const a=JSON.stringify([s.schedule,s.activeSchedule]);
  if(scheduleKey!==a){$('agenda-items').innerHTML=s.schedule.slice(s.activeSchedule,s.activeSchedule+3).map(p=>`<div class="agenda-item"><time>${esc(p.time)}</time><div><b>${esc(p.title)}</b><span>${esc(p.day)} · ${esc(p.detail)}</span></div></div>`).join('');scheduleKey=a;}
  time();
}
function resize(){const scale=Math.min(innerWidth/1920,innerHeight/1080);$('canvas').style.transform=`scale(${scale})`;}
addEventListener('resize',resize);resize();
const stream = new EventSource('/api/events');stream.onmessage=e=>render(JSON.parse(e.data));
// OBS and the operator preview use the same server state, including after reload.
setInterval(time,200);

const space=document.createElement('div');space.className='space-effects';space.setAttribute('aria-hidden','true');space.innerHTML='<div class=nebula-cloud></div><div class=galaxy-disc></div><div class=space-grid></div>'+Array.from({length:110},(_,i)=>`<i class=space-star style="--x:${(i*137.508)%100}%;--y:${(i*71.13)%100}%;--delay:${-i*.71}s;--size:${1+i%3}px"></i>`).join('')+Array.from({length:8},(_,i)=>`<i class=meteor style="--x:${20+i*10}%;--y:${4+i*11}%;--delay:${-i*3.7}s"></i>`).join('');$('slate').prepend(space);

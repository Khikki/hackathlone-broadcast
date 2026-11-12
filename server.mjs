import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaults } from './defaults.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3131);
const dir = process.env.DATA_DIR || path.join(root, 'data');
const publicHosts = new Set(['hackathlone.comain.ie', ...(process.env.PUBLIC_HOSTS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)]);
const isAllowedHost = host => {
  const normalized = String(host || '').toLowerCase();
  return ['127.0.0.1', 'localhost', `127.0.0.1:${port}`, `localhost:${port}`].includes(normalized) || publicHosts.has(normalized);
};
const isAllowedOrigin = origin => {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return isAllowedHost(parsed.host) || [...publicHosts].some(host => origin === `https://${host}` || origin === `http://${host}`);
  } catch { return false; }
};
await mkdir(dir, { recursive: true });
let state = structuredClone(defaults);
try { state = normalize(JSON.parse(await readFile(path.join(dir, 'state.json'), 'utf8'))); } catch (e) { if (e.code !== 'ENOENT') console.warn('Saved state invalid; using defaults.'); }
const clients = new Set();
let queue = Promise.resolve();

function str(v, fallback, max = 240) { return typeof v === 'string' ? v.slice(0, max) : fallback; }
function number(v, fallback, min, max) { return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback; }
function person(p = {}) { return { name: str(p.name, '', 90), role: str(p.role, '', 100), organization: str(p.organization, '', 100) }; }
export function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a state object');
  const d = structuredClone(defaults), s = input;
  for (const key of Object.keys(d.event)) d.event[key] = str(s.event?.[key], d.event[key], 140);
  if (s.guest) d.guest = person(s.guest);
  if (Array.isArray(s.guests)) d.guests = s.guests.slice(0, 100).map(person);
  if (Array.isArray(s.teams)) d.teams = s.teams.slice(0, 100).map(team => str(team, '', 120));
  if (s.lowerPosition === 'left' || s.lowerPosition === 'center') d.lowerPosition = s.lowerPosition;
  for (const key of Object.keys(d.layers)) if (typeof s.layers?.[key] === 'boolean') d.layers[key] = s.layers[key];
  if (['live','starting','break','ending'].includes(s.scene)) d.scene = s.scene;
  d.announcement = { label: str(s.announcement?.label, d.announcement.label, 50), text: str(s.announcement?.text, d.announcement.text, 800) };
  if (Array.isArray(s.partners)) d.partners = s.partners.slice(0, 30).map(p => ({ name: str(p.name,'',100), label: str(p.label,'PARTNER',60), logo: typeof p.logo === 'string' && (/^\/assets\/(?:[\w.-]+\/)*[\w.-]+$/.test(p.logo) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.logo)) ? p.logo.slice(0, 1400000) : '' }));
  if (Array.isArray(s.schedule)) d.schedule = s.schedule.slice(0, 100).map(p => ({ day: str(p.day,'',24), time: str(p.time,'TBA',24), title: str(p.title,'',120), detail: str(p.detail,'',800) }));
  d.activeSchedule = Math.floor(number(s.activeSchedule,0,0,Math.max(0,d.schedule.length-1)));
  const t = s.timer || {};
  d.timer = { duration: number(t.duration,600,1,172800), remaining: number(t.remaining,600,0,172800), endAt: t.endAt === null ? null : number(t.endAt,null,0,Date.now()+172800000), label: str(t.label,d.timer.label,70) };
  const c = s.settings || {};
  d.settings = { accent: /^#[\da-f]{6}$/i.test(c.accent) ? c.accent : d.settings.accent, safe: number(c.safe,64,24,160), speed: number(c.speed,35,12,120), autoHide: number(c.autoHide,12,0,120), guides: c.guides === true };
  d.lowerHideAt = s.lowerHideAt === null ? null : number(s.lowerHideAt,null,0,Date.now()+120000);
  return d;
}
function send(res, status, data) { res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store' }); res.end(JSON.stringify(data)); }
function broadcast() { const msg = `data: ${JSON.stringify(state)}\n\n`; for (const client of clients) client.write(msg); }
async function save(next) { await writeFile(path.join(dir,'state.tmp'),JSON.stringify(next,null,2)); await rename(path.join(dir,'state.tmp'),path.join(dir,'state.json')); state = next; broadcast(); }
const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2' };
const server = http.createServer(async (req,res) => {
  try {
    if (!isAllowedHost(req.headers.host)) return send(res,403,{ error:'Host not allowed' });
    const url = new URL(req.url,`http://127.0.0.1:${port}`);
    if (req.method === 'GET' && url.pathname === '/api/state') return send(res,200,state);
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
      res.write(`data: ${JSON.stringify(state)}\n\n`); clients.add(res); req.on('close',()=>clients.delete(res)); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/state') {
      if (!isAllowedOrigin(req.headers.origin)) return send(res,403,{error:'Origin rejected'});
      if (!req.headers['content-type']?.startsWith('application/json')) return send(res,415,{error:'JSON required'});
      let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body)>8000000) return send(res,413,{error:'Configuration too large'}); }
      const data = JSON.parse(body);
      // Serialize disk writes and apply partial updates to the newest state.
      queue = queue.catch(()=>{}).then(async()=>{
        const next = normalize({...state,...data}); await save(next);
      });
      await queue; return send(res,200,state);
    }
    if (req.method !== 'GET') return send(res,405,{error:'Method not allowed'});
    let name = decodeURIComponent(url.pathname);
    if (name === '/') name = '/index.html';
    if (name === '/overlay') name = '/overlay.html';
    const target = path.resolve(root,'dist','.'+name);
    if (!target.startsWith(path.join(root,'dist')+path.sep)) return send(res,403,{error:'Forbidden'});
    const file = await readFile(target);
    res.writeHead(200,{'Content-Type': types[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(file);
  } catch(e) { send(res,e.code === 'ENOENT' ? 404 : 400,{error:e.code === 'ENOENT' ? 'Not found' : e.message}); }
});
setInterval(()=>{ for(const c of clients)c.write(': heartbeat\n\n'); },15000).unref();
setInterval(()=>{
  if(state.layers.lower && state.lowerHideAt && Date.now() >= state.lowerHideAt) {
    queue = queue.catch(()=>{}).then(async()=>{ if(state.lowerHideAt && Date.now()>=state.lowerHideAt) await save({...state,layers:{...state.layers,lower:false},lowerHideAt:null}); });
  }
},250).unref();
server.listen(port,'127.0.0.1',()=>console.log(`HackAthlone Broadcast ready: http://127.0.0.1:${port}\nOBS Browser Source: http://127.0.0.1:${port}/overlay (2560 × 1440 · 2K)`));

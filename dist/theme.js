// Shared by the control panel and independent OBS sources.
export function resolveTheme(mode, date=new Date()) {
  if (mode !== 'auto') return mode === 'dark' ? 'dark' : 'light';
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Dublin',hour:'2-digit',hourCycle:'h23'}).format(date));
  return hour>=19 || hour<7 ? 'dark' : 'light';
}

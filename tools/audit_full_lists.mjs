import { readFileSync } from 'fs';
const ALLOWED_EQUAL = new Set(['GAINTRACK','GainTrack','GainTrack Pro','PRO','FREE','{{message}}','{{error}}']);
const raw = readFileSync('frontend/src/i18n/translations.ts','utf8');
const src = raw.replace(/const\s+translations\s*:\s*Record<[^>]+>\s*=/,'const translations =');
const i0 = src.indexOf('{', src.indexOf('const translations ='));
let depth=0, end=i0;
for(let i=i0;i<src.length;i++){
  if(src[i]==='{') depth++;
  else if(src[i]==='}'){
    depth--;
    if(depth===0){ end=i; break; }
  }
}
const obj=(new Function('return '+src.slice(i0,end+1)))();
function flatten(o,p){
  if(p===undefined) p='';
  const r={};
  for(const k of Object.keys(o)){
    const v=o[k];
    const path=p ? p+'.'+k : k;
    if(Array.isArray(v)) r[path]=v.join('\n');
    else if(typeof v==='object' && v!==null) Object.assign(r,flatten(v,path));
    else r[path]=v;
  }
  return r;
}
const enF=flatten(obj['en']);
for(const locale of ['el','de','fr','it']){
  const lF=flatten(obj[locale]||{});
  const bad=Object.entries(enF).filter(function(e){ return lF[e[0]]===e[1] && !ALLOWED_EQUAL.has(e[1].trim()); });
  console.log('\n=== '+locale.toUpperCase()+' ('+bad.length+' bad-equal keys) ===');
  bad.forEach(function(e){ console.log('  '+e[0]+': "'+e[1].replace(/\n/g,'\\n').slice(0,80)+(e[1].length>80?'..':'')+'"'); });
}

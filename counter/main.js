const card=document.getElementById('coach');
const provider=document.getElementById('provider');
const label=document.getElementById('label');
const map=document.getElementById('map');
const stats=document.getElementById('stats');
const report=document.getElementById('report');
let lastUpdate=0;
let scrollTimer=null;
function autoScrollReport(){
  if(scrollTimer){clearInterval(scrollTimer);scrollTimer=null}
  report.scrollTop=0;
  if(report.scrollHeight-report.clientHeight<=4)return;
  let phase='top',waitUntil=Date.now()+3500;
  scrollTimer=setInterval(()=>{
    const max=report.scrollHeight-report.clientHeight;
    if(max<=4){clearInterval(scrollTimer);scrollTimer=null;return}
    const now=Date.now();
    if(phase==='top'&&now>=waitUntil)phase='down';
    else if(phase==='down'){
      report.scrollTop+=1;
      if(report.scrollTop>=max-1){phase='bottom';waitUntil=now+3000}
    }
    else if(phase==='bottom'&&now>=waitUntil){report.scrollTop=0;phase='top';waitUntil=now+3500}
  },40);
}
async function refresh(){
  try{
    const state=await fetch('http://127.0.0.1:24051/state',{cache:'no-store'}).then(r=>r.json());
    const visible=state.gameStatus!=='offline'&&(Boolean(state.record)||state.status==='welcome')&&(state.displayMode==='always'||state.status==='analyzing'||Date.now()<Number(state.visibleUntil||0));
    const labels={fr:'COACH IA',en:'AI COACH',de:'KI-COACH',es:'COACH IA',it:'COACH IA',pt:'COACH IA',ja:'AIコーチ',ko:'AI 코치',zh:'AI教练'};
    label.textContent=state.coachName||labels[state.language]||labels.en;
    const overlay=state.overlay||{};
    const accent=/^#[0-9a-f]{6}$/i.test(String(overlay.accentColor||''))?overlay.accentColor:'#ff66aa';
    const rgb=[1,3,5].map(i=>parseInt(accent.slice(i,i+2),16)).join(',');
    const rawOpacity=Number(overlay.backgroundOpacity);
    const bgAlpha=(Number.isFinite(rawOpacity)?Math.max(0,Math.min(100,rawOpacity)):overlay.showBackground===false?0:100)/100;
    document.documentElement.style.setProperty('--accent',accent);
    document.documentElement.style.setProperty('--accent-rgb',rgb);
    document.documentElement.style.setProperty('--bg-alpha',String(bgAlpha));
    card.classList.toggle('dim-bg',bgAlpha<0.5);
    card.classList.toggle('no-logo',overlay.showLogo===false);
    card.classList.toggle('hidden',!visible);
    if(!visible||state.updatedAt===lastUpdate)return;
    lastUpdate=state.updatedAt;
    const r=state.record;
    provider.textContent=state.status==='analyzing'?'Analyse en cours…':(state.provider||'Analyse locale');
    if(!r){map.textContent='';stats.textContent='';report.textContent=state.report;autoScrollReport();return}
    map.textContent=`${r.artist} — ${r.title} [${r.difficulty}]`;
    stats.textContent=r.phase==='playing'||r.phase==='selected'
      ?`${Number(r.stars).toFixed(2)}★  •  ${Number(r.bpm).toFixed(0)} BPM  •  ${r.mods||'NoMod'}  •  max ${r.maxCombo}x`
      :`${Number(r.stars).toFixed(2)}★  •  ${Number(r.accuracy).toFixed(2)}%  •  ${r.misses} miss  •  ${r.combo}/${r.maxCombo}x${r.pp?`  •  ${Number(r.pp).toFixed(1)}pp`:''}`;
    report.textContent=state.report;
    autoScrollReport();
  }catch{card.classList.add('hidden')}
}
setInterval(refresh,500);refresh();

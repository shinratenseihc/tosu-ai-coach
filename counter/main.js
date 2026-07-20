const card=document.getElementById('coach');
const provider=document.getElementById('provider');
const label=document.getElementById('label');
const map=document.getElementById('map');
const stats=document.getElementById('stats');
const report=document.getElementById('report');
let lastUpdate=0;
async function refresh(){
  try{
    const state=await fetch('http://127.0.0.1:24051/state',{cache:'no-store'}).then(r=>r.json());
    const visible=Boolean(state.record);
    const labels={fr:'COACH IA',en:'AI COACH',de:'KI-COACH',es:'COACH IA',it:'COACH IA',pt:'COACH IA',ja:'AIコーチ',ko:'AI 코치',zh:'AI教练'};
    label.textContent=labels[state.language]||labels.en;
    card.classList.toggle('hidden',!visible);
    if(!visible||state.updatedAt===lastUpdate)return;
    lastUpdate=state.updatedAt;
    const r=state.record;
    provider.textContent=state.status==='analyzing'?'Analyse en cours…':(state.provider||'Analyse locale');
    map.textContent=`${r.artist} — ${r.title} [${r.difficulty}]`;
    stats.textContent=`${Number(r.stars).toFixed(2)}★  •  ${Number(r.accuracy).toFixed(2)}%  •  ${r.misses} miss  •  ${r.combo}/${r.maxCombo}x  •  UR ${r.timing.unstableRate}`;
    report.textContent=state.report;
  }catch{card.classList.add('hidden')}
}
setInterval(refresh,500);refresh();

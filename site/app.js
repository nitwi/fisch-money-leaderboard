"use strict";
const $ = (id) => document.getElementById(id);
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const palette = ["#29f8ff","#ffd166","#c9a7ff","#61e5b3","#f990bd","#74a8ff","#ffad79","#a6e672","#ff7d91","#8cd9e0","#f8d38a","#9f9fff"];
const state = {data:null, index:0, selected:null, view:"all", filter:"all", byCapture:new Map(), byPlayer:new Map(), playerMeta:new Map(), proofs:new Map(), chartBound:false};
const byId = (id) => state.proofs.get(id);
const compact = (amount) => {
  if (amount === null || amount === undefined) return "—";
  const n = typeof amount === "bigint" ? amount : BigInt(amount);
  const negative = n < 0n, abs = negative ? -n : n;
  for (const [unit, divisor] of [["T",1000000000000n],["B",1000000000n],["M",1000000n],["K",1000n]]) {
    if (abs >= divisor) {
      const decimal = (abs * 10n / divisor);
      return `${negative ? "−" : ""}${decimal / 10n}${decimal % 10n ? "." + decimal % 10n : ""}${unit}`;
    }
  }
  return `${negative ? "−" : ""}${abs} C$`;
};
const exact = (amount) => amount === null || amount === undefined ? "unknown" : `${BigInt(amount).toLocaleString("en-US")} C$`;
const signed = (amount) => amount === null ? "—" : `${BigInt(amount) >= 0n ? "+" : "−"}${compact(BigInt(amount) < 0n ? -BigInt(amount) : BigInt(amount))}`;
const labelDate = (iso, options={}) => new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",...options}).format(new Date(iso));
const hours = (a,b) => (new Date(b).getTime() - new Date(a).getTime()) / 3600000;
const timeRate = (delta, intervalHours) => Number.isFinite(intervalHours) && intervalHours > 0 && BigInt(delta) <= BigInt(Number.MAX_SAFE_INTEGER) && BigInt(delta) >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(BigInt(delta)) / intervalHours : null;
const rateText = (amount) => amount === null ? "—" : `${amount >= 0 ? "+" : "−"}${compact(BigInt(Math.round(Math.abs(amount))))}/hr`;
const confirmed = (row) => row?.status === "verified";
const rainbowBase = (delta) => delta > 0n ? BigInt(Math.round(Number(delta) / 1.5)) : null;
const rainbowRateHtml = (rate) => rate === null || rate <= 0 ? "" : `<span class="rainbow-static">Rainbow-equivalent ${rateText(rate / 1.5)}</span> <span class="muted">(no multiplier ${rateText(rate)})</span>`;
const evidenceUrl = (proof) => proof ? encodeURI(proof.url).replaceAll("#", "%23") : "#";
function player(key) { return state.playerMeta.get(key) || {name:key, roblox_id:null, headshot:null}; }
function avatar(meta) { const url = meta.headshot; return url && /^https:\/\/[a-z0-9.-]+\.(?:roblox\.com|rbxcdn\.com)\//i.test(url) ? `<img src="${safe(url)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ""; }
function point(cp,key) { return state.byCapture.get(cp.id)?.find((row)=>row.key===key) || null; }
function atRank(cp,rank) { return state.byCapture.get(cp.id)?.find((row)=>row.rank===rank) || null; }
function memberHistory(key) { return state.byPlayer.get(key) || []; }
function gapInfo(cp,row) {
  if (!row) return {ahead:null,behind:null};
  const ahead = atRank(cp,row.rank-1), behind = atRank(cp,row.rank+1);
  return {ahead:ahead ? {name:ahead.username, key:ahead.key, gap:BigInt(ahead.balance)-BigInt(row.balance), tentative:!confirmed(ahead)||!confirmed(row)} : null,
          behind:behind ? {name:behind.username, key:behind.key, gap:BigInt(row.balance)-BigInt(behind.balance), tentative:!confirmed(behind)||!confirmed(row)} : null};
}
function interval(cp,row,previous) {
  const old = previous ? point(previous,row.key) : null;
  const delta = old ? BigInt(row.balance)-BigInt(old.balance) : null;
  const elapsed = previous ? hours(previous.at,cp.at) : null;
  const currentGap = gapInfo(cp,row), oldGap = old ? gapInfo(previous,old) : {ahead:null,behind:null};
  return {old,delta,elapsed,currentGap,oldGap,rate:delta===null?null:timeRate(delta,elapsed)};
}
function nearbyLabel(position,current,previous) {
  if (!current) return `<span class="muted">${position}: unknown</span>`;
  const diff=previous ? current.gap-previous.gap : null;
  const diffText=diff===null ? "" : ` <span class="${diff<0n?"negative":"positive"}">(${diff<0n?"narrowed":"widened"} ${compact(diff<0n?-diff:diff)})</span>`;
  const switched=previous && current.key!==previous.key ? ` <span class="muted">· was ${safe(previous.name)}</span>` : "";
  return `${position} ${safe(current.name)}: <b>${current.tentative?"≈":""}${compact(current.gap)}</b>${diffText}${switched}`;
}
function setSelected(key) {
  state.selected = key;
  $("search").value = key ? player(key).name : "";
  const u = new URL(location.href);
  if (key) u.searchParams.set("player",key); else u.searchParams.delete("player");
  window.history.replaceState(null,"",u);
  render();
}
function moveTo(index) { state.index=Math.max(0,Math.min(state.data.checkpoints.length-1,index)); $("capture-slider").value=state.index; render(); }
function renderControls() {
  const cps=state.data.checkpoints, cp=cps[state.index];
  $("capture-date").textContent=labelDate(cp.at); $("capture-index").textContent=`CAPTURE ${String(state.index+1).padStart(2,"0")} / ${cps.length}`;
  $("prev").disabled=state.index===0; $("next").disabled=state.index===cps.length-1;
  $("capture-slider").value=String(state.index);
  $("first-date").textContent=labelDate(cps[0].at,{year:undefined,hour:undefined,minute:undefined});
  $("last-date").textContent=labelDate(cps.at(-1).at,{year:undefined,hour:undefined,minute:undefined});
  $("stat-coverage").textContent=`${cp.visible} / ${cp.coverage}`;
  $("stat-coverage-note").textContent=`${cp.verified} read directly from PNG${cp.coverage<50?` · ${50-cp.coverage} not pictured`:""}`;
  const previous=cps[state.index-1], deltaHours=previous?hours(previous.at,cp.at):null;
  $("stat-hours").textContent=deltaHours===null?"BASELINE":`${deltaHours.toFixed(1)}h`;
  $("stat-hours-note").textContent=cp.precision.includes("approximate")||previous?.precision?.includes("approximate")?"Capture time approximate; rate is indicative":"Since preceding capture · UTC";
  const gains=(state.byCapture.get(cp.id)||[]).map((row)=>({row,change:interval(cp,row,previous)})).filter(({row,change})=>confirmed(row)&&confirmed(change.old)&&change.delta>0n).sort((a,b)=>a.change.delta>b.change.delta?-1:1);
  $("stat-largest").textContent=gains.length?signed(gains[0].change.delta):"—";
  $("stat-largest-name").textContent=gains.length?gains[0].row.username:"No photo-checked adjacent comparison";
  const floor=atRank(cp,50); $("stat-floor").textContent=floor?compact(floor.balance):"UNKNOWN";
  $("stat-floor-note").textContent=floor?`#50 ${floor.username}`:"Rank #50 not pictured or unreadable";
  const notice=$("notice");
  notice.hidden=cp.complete;
  if (!cp.complete) notice.textContent=`${cp.verified} of ${cp.coverage} photographed rank slots have legible values confirmed against the original PNGs.${cp.coverage>cp.verified?` ${cp.coverage-cp.verified} cropped or unreadable slots remain unknown.`:""} Confirmed Top-50 exits require two complete captures; a missing image never means a player had zero C$.`;
}
function renderChart() {
  const node=$("chart"), cps=state.data.checkpoints;
  const selected=state.selected, limit=state.filter==="all"?50:Number(state.filter);
  const allowed=new Set(cps.flatMap((cp)=>(state.byCapture.get(cp.id)||[]).filter((row)=>row.rank<=limit).map((row)=>row.key)));
  if(selected)allowed.add(selected);
  const keys=[...allowed].sort((a,b)=>memberHistory(a)[0]?.rank-memberHistory(b)[0]?.rank || a.localeCompare(b));
  if (!keys.length) {node.textContent="No screenshot readings yet for this range.";return;}
  const plot=[];
  keys.forEach((key,i)=>{
    const rows=cps.map((cp)=>point(cp,key));
    if (!rows.some(Boolean))return;
    const color=selected && selected!==key?"rgba(125,151,164,.22)":palette[i%palette.length];
    const xs=cps.map((cp)=>cp.at), ys=rows.map((row)=>row?Number(row.balance):null);
    plot.push({type:"scatter",mode:"lines+markers",name:player(key).name,x:xs,y:ys,connectgaps:false,meta:{key},
      line:{color,width:selected===key?3.5:1.5,shape:"linear"},marker:{size:rows.map(row=>row?(selected===key?8:5):0),symbol:"circle",color},
      customdata:rows.map((row)=>row?[`#${row.rank}`,exact(row.balance),row.evidence.join(", "),"Photo checked"]:["unknown","unknown","","unknown"]),
      hovertemplate:"<b>%{fullData.name}</b><br>%{x|%b %d, %Y %H:%M UTC}<br>%{customdata[0]} · %{customdata[1]}<br>%{customdata[3]}<br>Proof: %{customdata[2]}<extra></extra>",showlegend:false});
    // A faint dashed bridge marks an unobserved span rather than inventing intermediate points.
    let previous=-1;
    rows.forEach((row,index)=>{if(!row)return;if(previous>=0 && index-previous>1){plot.push({type:"scatter",mode:"lines",x:[xs[previous],xs[index]],y:[ys[previous],ys[index]],line:{color:selected && selected!==key?"rgba(125,151,164,.11)":color,width:1,dash:"dot"},hoverinfo:"skip",showlegend:false});}previous=index;});
  });
  const selectedAt=cps[state.index].at;
  const maxY=plot.flatMap((item)=>item.y||[]).filter((x)=>Number.isFinite(x));
  if(!maxY.length){node.textContent="No screenshot-derived balances yet.";return;}
  const ymax=Math.max(...maxY)*1.08;
  const xLo=new Date(cps[0].at).getTime(),xHi=new Date(cps.at(-1).at).getTime();
  const layout={height:node.clientHeight||495,autosize:true,paper_bgcolor:"rgba(0,0,0,0)",plot_bgcolor:"rgba(4,19,31,.44)",font:{color:"#9cbdcc",family:"Inter, Segoe UI, Arial",size:10},margin:{l:65,r:20,t:18,b:55},hovermode:"closest",hoverlabel:{bgcolor:"#0c2b3f",bordercolor:"#29f8ff",font:{color:"#e8fbff"}},
    xaxis:{type:"date",range:[new Date(xLo-86400000),new Date(xHi+86400000)],gridcolor:"rgba(154,219,231,.1)",tickformat:"%b %d"},
    yaxis:{title:"HELD C$",range:[0,ymax],tickformat:"~s",gridcolor:"rgba(154,219,231,.1)",zeroline:false},
    shapes:[{type:"line",x0:selectedAt,x1:selectedAt,y0:0,y1:1,yref:"paper",line:{color:"#ffd166",width:1.4,dash:"dot"}}],uirevision:"money-ledger"};
  Plotly.react(node,plot,layout,{displayModeBar:false,responsive:true,scrollZoom:false});
  if (!state.chartBound) {node.on("plotly_click",(event)=>{const key=event.points?.[0]?.data?.meta?.key;if(key)setSelected(key);});state.chartBound=true;}
  $("chart-title").textContent=selected?`${player(selected).name} · balance history`:"Leaderboard trajectories";
}
function renderMovement() {
  const cp=state.data.checkpoints[state.index], previous=state.data.checkpoints[state.index-1];
  const rows=(state.byCapture.get(cp.id)||[]).map(row=>({row,change:interval(cp,row,previous)}));
  rows.sort((a,b)=>a.row.rank-b.row.rank);
  let filtered=rows;
  if(state.view==="gains")filtered=rows.filter(({change})=>change.delta!==null && change.delta>0n).sort((a,b)=>a.change.delta>b.change.delta?-1:a.change.delta<b.change.delta?1:0);
  if(state.view==="changes")filtered=rows.filter(({row,change})=>change.old && change.old.rank!==row.rank);
  $("movement-subtitle").textContent=previous?`Relative to ${labelDate(previous.at)} · ${cp.verified} photo-checked readings`:`First recorded capture · ${cp.verified} photo-checked readings`;
  const markup=filtered.map(({row,change})=>{
    const {old,delta,rate,currentGap,oldGap}=change;
    const rank=old?`#${old.rank} ${old.rank===row.rank?"→":old.rank>row.rank?"↗":"↘"} #${row.rank}`:`#${row.rank}`;
    const known=delta!==null;
    const tentative=!confirmed(row)||(old&&!confirmed(old));
    const large=known && !tentative && delta>=BigInt(state.data.threshold);
    const previousText=old?exact(old.balance):"previous amount unknown";
    const deltaText=known?`${tentative?"≈":""}${signed(delta)} observed net C$`:"no adjacent measurement";
    const rateLine=known?(rate>0 ? `<span class="rainbow-rate">${rainbowRateHtml(rate)}</span><span class="muted">Rainbow base-equivalent ≈${signed(rainbowBase(delta))} C$ if all net change were 1.5× sales</span>` : `<span class="muted">Observed no-multiplier rate ${rateText(rate)}</span>`):"";
    const quality="Photo checked";
    return `<button class="movement-item ${state.selected===row.key?"selected":""}" data-player="${safe(row.key)}" type="button"><div class="top"><strong>${avatar(player(row.key))}${safe(row.username)}</strong><span>${rank}</span></div><p>${safe(previousText)} → <strong title="${safe(exact(row.balance))}">${tentative?"≈":""}${compact(row.balance)}</strong> · <span class="${known?(delta<0n?"negative":"positive"):"muted"}">${safe(deltaText)}</span></p>${rateLine?`<p class="rate-compare">${rateLine}</p>`:""}<p class="gaps">${nearbyLabel("↑",currentGap.ahead,oldGap.ahead)}<br>${nearbyLabel("↓",currentGap.behind,oldGap.behind)}</p><div class="badges"><span class="badge ${tentative?"gold":""}">${quality}${tentative?" · check proof":""}</span>${large?'<span class="badge gold">NOTABLE +8B</span>':""}${old?"":`<span class="badge">${previous?.complete&&confirmed(row)?"FIRST SEEN IN TOP 50":"PREVIOUS UNKNOWN"}</span>`}${cp.precision.includes("approximate")||previous?.precision?.includes("approximate")?'<span class="badge gold">TIME APPROX.</span>':""}</div></button>`;
  }).join("");
  const prior=previous?.complete && cp.complete && state.view!=="gains" ? (state.byCapture.get(previous.id)||[]).filter(row=>!point(cp,row.key)) : [];
  const departures=prior.map(row=>`<button class="movement-item" type="button" data-player="${safe(row.key)}"><div class="top"><strong>${avatar(player(row.key))}${safe(row.username)}</strong><span>#${row.rank} → outside Top 50</span></div><p>Last observed ${compact(row.balance)}. Current amount unknown; last captured floor ${compact(atRank(cp,50)?.balance||null)}.</p><div class="badges"><span class="badge gold">LEFT PICTURED TOP 50</span></div></button>`).join("");
  $("movement-list").innerHTML=markup+departures||`<p class="profile-empty">${cp.visible?"No pictured rows match this filter.":"No readable screenshot rows for this capture yet. Open its original proof images below."}</p>`;
  $("movement-list").querySelectorAll("[data-player]").forEach((el)=>el.addEventListener("click",()=>setSelected(el.dataset.player)));
}
function renderProfile() {
  const key=state.selected, wrapper=$("profile-content");
  $("profile-clear").hidden=!key;
  if(!key){$("profile-title").textContent="Select a player";$("profile-hint").textContent="Search, click a chart line, or choose a movement row.";wrapper.className="profile-empty";wrapper.textContent="Historical balances, rates and position changes appear here.";return;}
  const rows=memberHistory(key), first=rows[0], last=rows.at(-1), meta=player(key), gain=BigInt(last.balance)-BigInt(first.balance), time=hours(state.data.checkpoints.find(cp=>cp.id===first.checkpoint).at,state.data.checkpoints.find(cp=>cp.id===last.checkpoint).at);
  const pairs=rows.slice(1).map((row,i)=>({start:rows[i],end:row,delta:BigInt(row.balance)-BigInt(rows[i].balance),elapsed:hours(state.data.checkpoints.find(cp=>cp.id===rows[i].checkpoint).at,state.data.checkpoints.find(cp=>cp.id===row.checkpoint).at)}));
  const maximum=pairs.filter(x=>x.delta>0n).sort((a,b)=>a.delta>b.delta?-1:1)[0];
  const fastest=pairs.filter(x=>x.delta>0n && x.elapsed>0).sort((a,b)=>Number(b.delta)/b.elapsed-Number(a.delta)/a.elapsed)[0];
  const peak=rows.reduce((best,row)=>BigInt(row.balance)>BigInt(best.balance)?row:best,first);
  $("profile-title").textContent=meta.name;
  const checkedCount=rows.filter(confirmed).length;
  $("profile-hint").textContent=`First pictured ${labelDate(state.data.checkpoints.find(cp=>cp.id===first.checkpoint).at)} · latest ${labelDate(state.data.checkpoints.find(cp=>cp.id===last.checkpoint).at)} · ${checkedCount} photo-checked captures`;
  const link=meta.roblox_id?`<a href="https://www.roblox.com/users/${safe(meta.roblox_id)}/profile" rel="noopener noreferrer" target="_blank">View Roblox profile ↗</a>`:"<small>Roblox account not yet independently matched</small>";
  wrapper.className="";
  const stats=[
    ["LATEST BALANCE",compact(last.balance),`Rank #${last.rank} · photo checked`],
    ["NET SINCE FIRST",`${confirmed(first)&&confirmed(last)?"":"≈"}${signed(gain)}`,`${rows.length} pictured captures`],
    ["RAINBOW 1.5× BASE",gain>0n?`≈${signed(rainbowBase(gain))}`:"—",gain>0n?`(no multiplier ${signed(gain)} net C$)` : "Only positive net changes can be compared",gain>0n],
    ["RAINBOW-EQUIVALENT NET RATE",timeRate(gain,time)>0?rateText(timeRate(gain,time)/1.5):"—",`(no multiplier ${rateText(timeRate(gain,time))}) · ${time?time.toFixed(0):0}h`,timeRate(gain,time)>0],
    ["LARGEST INTERVAL",maximum?signed(maximum.delta):"—",maximum?`${maximum.elapsed.toFixed(1)}h between pictured readings`:"No increase measured"],
    ["PEAK RAINBOW-EQUIVALENT RATE",fastest?rateText(timeRate(fastest.delta,fastest.elapsed)/1.5):"—",fastest?`(no multiplier ${rateText(timeRate(fastest.delta,fastest.elapsed))}) · ${fastest.elapsed.toFixed(1)}h`:"No positive interval",Boolean(fastest)],
    ["CHANGE SINCE FIRST",BigInt(first.balance)>0n?`${(Number(gain)/Number(first.balance)*100).toFixed(1)}%`:"—","Observed balance only"]
  ];
  const historyRows=rows.slice().reverse().map((row)=>{
    const ix=state.data.checkpoints.findIndex(cp=>cp.id===row.checkpoint);
    const old=ix>0?point(state.data.checkpoints[ix-1],key):null;
    const change=old?BigInt(row.balance)-BigInt(old.balance):null;
    const elapsed=old?hours(state.data.checkpoints[ix-1].at,state.data.checkpoints[ix].at):0;
    const rate=change===null?null:timeRate(change,elapsed);
    return `<a href="#evidence" data-capture="${ix}" data-proof="${safe(row.evidence[0]||"")}"><span>${safe(labelDate(state.data.checkpoints[ix].at))} · #${row.rank}</span><strong title="${safe(exact(row.balance))}">${compact(row.balance)}</strong><span>${change!==null?`${signed(change)} · ${rate>0?rainbowRateHtml(rate):rateText(rate)}`:"—"} ↗</span></a>`;
  }).join("");
  wrapper.innerHTML=`<div class="profile-head">${avatar(meta)||'<span class="avatar-fallback">@</span>'}<div><strong>${safe(meta.name)}</strong><small>${meta.roblox_name&&meta.roblox_name!==meta.name?`Current Roblox name: ${safe(meta.roblox_name)}`:"Historical screenshot name"}</small>${link}</div></div><div class="profile-stats">${stats.map(([title,value,detail,rainbow])=>`<div><span>${safe(title)}</span><b class="${rainbow?"rainbow-static":""}" title="${safe(value)}">${safe(value)}</b><small>${safe(detail)}</small></div>`).join("")}</div><p class="card-title"><small>Peak pictured ${compact(peak.balance)} · ${BigInt(peak.balance)-BigInt(last.balance)>0n?`${compact(BigInt(peak.balance)-BigInt(last.balance))} below peak`:"at peak"}. Rainbow 1.5× figures are hypothetical base equivalents if all positive net balance change came from boosted sales. Spending, stored fish, and other changes cannot be inferred from the board.</small></p><div class="profile-history">${historyRows}</div>`;
  wrapper.querySelectorAll("[data-capture]").forEach((el)=>el.addEventListener("click",(event)=>{event.preventDefault();moveTo(Number(el.dataset.capture));document.querySelector(".evidence-section").scrollIntoView({behavior:"smooth"});spotlight(el.dataset.proof);}));
}
function spotlight(id){document.querySelectorAll(".proof").forEach((el)=>el.classList.toggle("spotlit",el.dataset.proof===id));}
function renderEvidence() {
  const cp=state.data.checkpoints[state.index];
  $("evidence-count").textContent=`${cp.evidence.length} ORIGINAL PNG${cp.evidence.length===1?"":"S"}`;
  $("evidence-subtitle").textContent=`Captured ${labelDate(cp.at)} · ${cp.precision.replaceAll("_"," ")} · originals are the authoritative proof`;
  $("evidence-grid").innerHTML=cp.evidence.map((id)=>{const item=byId(id);if(!item)return"";return `<button type="button" class="proof" data-proof="${safe(item.id)}"><img src="${safe(evidenceUrl(item))}" loading="lazy" alt="Original evidence ${safe(id)}, leaderboard ranks ${item.min} to ${item.max}"><span>${safe(id)} · rank ${item.min}–${item.max}</span><small>SHA-256 ${safe(item.sha256.slice(0,16))}… · Open full image</small></button>`;}).join("");
  $("evidence-grid").querySelectorAll(".proof").forEach((el)=>el.addEventListener("click",()=>{const item=byId(el.dataset.proof);if(!item)return;$("lightbox-image").src=evidenceUrl(item);$("lightbox-caption").textContent=`${item.id} · ${cp.id} · ranks ${item.min}–${item.max} · original SHA-256 ${item.sha256}`;$("lightbox").showModal();}));
  if(state.selected){const row=point(cp,state.selected);if(row)spotlight(row.evidence[0]);}
}
function render(){renderControls();renderChart();renderMovement();renderProfile();renderEvidence();}
async function init(){
  try{
    const response=await fetch("data.json",{cache:"no-cache"});if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();state.data=data;
    const pictured=data.checkpoints.reduce((sum,cp)=>sum+cp.coverage,0);
    const confirmed=data.checkpoints.reduce((sum,cp)=>sum+cp.verified,0);
    $("global-review-note").textContent=`${confirmed.toLocaleString()} of ${pictured.toLocaleString()} photographed rank slots were read directly from the original screenshots. ${pictured-confirmed} cropped or unreadable slots remain unknown; ${data.observations.filter(row=>row.status==="not_captured").length} were not photographed. Original PNG proofs are available for every capture. Rainbow 1.5× figures are hypothetical base equivalents, not confirmed sales.`;
    data.checkpoints.forEach(cp=>state.byCapture.set(cp.id,[]));
    data.observations.filter(row=>row.status==="verified").forEach(row=>{state.byCapture.get(row.checkpoint).push(row);if(!state.byPlayer.has(row.key))state.byPlayer.set(row.key,[]);state.byPlayer.get(row.key).push(row);});
    data.players.forEach(meta=>state.playerMeta.set(meta.key,meta));
    data.evidence.forEach(proof=>state.proofs.set(proof.id,proof));
    for(const [key,rows] of state.byPlayer)rows.sort((a,b)=>new Date(data.checkpoints.find(cp=>cp.id===a.checkpoint).at)-new Date(data.checkpoints.find(cp=>cp.id===b.checkpoint).at));
    state.index=data.checkpoints.length-1;
    const requested=new URL(location.href).searchParams.get("player");if(requested && state.playerMeta.has(requested))state.selected=requested;
    $("capture-slider").max=String(state.index);$("capture-slider").addEventListener("input",(ev)=>moveTo(Number(ev.target.value)));
    $("prev").addEventListener("click",()=>moveTo(state.index-1));$("next").addEventListener("click",()=>moveTo(state.index+1));
    $("clear").addEventListener("click",()=>setSelected(null));$("profile-clear").addEventListener("click",()=>setSelected(null));
    $("top-filter").addEventListener("change",(ev)=>{state.filter=ev.target.value;renderChart();});
    let resizeTimer;
    window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const plot=$("chart");if(plot?.data&&window.Plotly)Plotly.Plots.resize(plot);},120);});
    $("search").addEventListener("input",(ev)=>{const term=ev.target.value.trim().toLocaleLowerCase();if(!term){setSelected(null);return;}const meta=data.players.find(p=>p.name.toLocaleLowerCase()===term || p.key===term)||data.players.find(p=>p.name.toLocaleLowerCase().includes(term)||p.roblox_name?.toLocaleLowerCase().includes(term));if(meta){state.selected=meta.key;render();$("search").focus();$("search").setSelectionRange(ev.target.value.length,ev.target.value.length);}});
    document.querySelectorAll("[data-view]").forEach(el=>el.addEventListener("click",()=>{state.view=el.dataset.view;document.querySelectorAll("[data-view]").forEach(btn=>btn.classList.toggle("active",btn===el));renderMovement();}));
    $("lightbox").addEventListener("click",(ev)=>{if(ev.target===$("lightbox"))$("lightbox").close();});
    render();
  }catch(error){$("notice").hidden=false;$("notice").textContent=`Could not load the evidence ledger: ${error.message}`;$("capture-date").textContent="Data unavailable";}
}
init();

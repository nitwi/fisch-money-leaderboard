"use strict";
const $ = (id) => document.getElementById(id);
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const palette = ["#29f8ff","#ffd166","#c9a7ff","#61e5b3","#f990bd","#74a8ff","#ffad79","#a6e672","#ff7d91","#8cd9e0","#f8d38a","#9f9fff"];
const patchEvents = [
  {id:"venue-encore",day:"2026-10-31",at:"2026-10-31T16:00:00Z",version:"v2.08",title:"Venue Encore · Black Fairy introduced",description:"Black Fairy became obtainable in Venue Encore; a new money-making option entered the game.",color:"#61e5b3",glyph:"✦",source:"https://fischipedia.org/wiki/2.08#2.08.0",icon:"https://static.wikitide.net/fischwiki/thumb/3/33/Black_Fairy.png/145px-Black_Fairy.png",credit:"https://fischipedia.org/wiki/File:Black_Fairy.png"},
  {id:"stellarwave-change",day:"2026-11-07",at:"2026-11-08T02:34:00Z",version:"v2.09.1",title:"Stellarwave Melody balance changes",description:"Sign and milestone bonuses and extra-catch benefits were sharply reduced; the patch also removed a weight penalty.",color:"#ffd166",glyph:"✧",source:"https://fischipedia.org/wiki/2.09#2.09.1",icon:"https://static.wikitide.net/fischwiki/thumb/4/45/Stellarwave_Melody.png/206px-Stellarwave_Melody.png",credit:"https://fischipedia.org/wiki/File:Stellarwave_Melody.png"}
];
// Preserve this verified reading in the archive; omit only its trace from the graph scale.
const chartExcludedKeys = new Set(["id:8144154137"]);
const state = {data:null, index:0, selected:null, view:"all", filter:"all", highlightPage:0, standoutSeverity:"all", standoutSearch:"", rangeStart:null, rangeEnd:null, byCapture:new Map(), byPlayer:new Map(), playerMeta:new Map(), proofs:new Map(), profileUpdates:new Map(), chartBound:false};
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
const dayLabel = (day) => new Intl.DateTimeFormat("en-US",{timeZone:"UTC",month:"short",day:"numeric",year:"numeric"}).format(new Date(`${day}T12:00:00Z`));
const localDay = (iso) => {
  const fields=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(iso)).map(part=>[part.type,part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
};
function calendarDays(first,last) {
  const result=[];
  const cursor=new Date(`${first}T12:00:00Z`);
  const end=new Date(`${last}T12:00:00Z`);
  while (cursor<=end) {result.push(cursor.toISOString().slice(0,10));cursor.setUTCDate(cursor.getUTCDate()+1);}
  return result;
}
function chartSlots(checkpoints,from,to){
  const byDay=new Map();
  for(const cp of checkpoints){if(!byDay.has(cp.day_key))byDay.set(cp.day_key,[]);byDay.get(cp.day_key).push(cp);}
  return calendarDays(from,to).flatMap(day=>{
    const photos=byDay.get(day)||[];
    return photos.length?photos.map((cp,index)=>({id:index?`${day}#${index+1}`:day,day,cp,index,count:photos.length})):[{id:day,day,cp:null,index:0,count:0}];
  });
}
const weekendSettlement = (cp) => Boolean(cp?.weekend_settlement);
const hours = (a,b) => (new Date(b).getTime() - new Date(a).getTime()) / 3600000;
const elapsedLabel = (value) => {
  if (value===null) return "BASELINE";
  const minutes=Math.round(value*60);
  return minutes<720?`${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,"0")}m`:`${(minutes/60).toFixed(1)}h`;
};
const timeRate = (delta, intervalHours) => Number.isFinite(intervalHours) && intervalHours > 0 && BigInt(delta) <= BigInt(Number.MAX_SAFE_INTEGER) && BigInt(delta) >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(BigInt(delta)) / intervalHours : null;
const rateText = (amount,unit="hr") => amount === null ? "—" : `${amount >= 0 ? "+" : "−"}${compact(BigInt(Math.round(Math.abs(amount))))}/${unit}`;
const confirmed = (row) => row?.status === "verified";
const crossesSettlement = (first,last) => state.data.checkpoints.some(cp=>weekendSettlement(cp) && new Date(cp.at)>new Date(first) && new Date(cp.at)<=new Date(last));
const rainbowBase = (delta) => delta > 0n ? BigInt(Math.round(Number(delta) / 1.5)) : null;
const rainbowRateHtml = (rate) => rate === null || rate <= 0 ? "" : `<span class="rainbow-static">Rainbow-equivalent ${rateText(rate / 1.5)}</span> <span class="muted">(no multiplier ${rateText(rate)})</span>`;
const evidenceUrl = (proof) => proof ? encodeURI(proof.url).replaceAll("#", "%23") : "#";
function player(key) { return state.playerMeta.get(key) || {name:key, roblox_id:null, headshot:null}; }
function avatar(meta) { const url = meta.headshot; return url && /^https:\/\/[a-z0-9.-]+\.(?:roblox\.com|rbxcdn\.com)\//i.test(url) ? `<img src="${safe(url)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ""; }
function point(cp,key) { return state.byCapture.get(cp.id)?.find((row)=>row.key===key) || null; }
function atRank(cp,rank) { return state.byCapture.get(cp.id)?.find((row)=>row.rank===rank) || null; }
function memberHistory(key) { return state.byPlayer.get(key) || []; }
function rangedHistory(key) {return memberHistory(key).filter(row=>row.day_key>=state.rangeStart && row.day_key<=state.rangeEnd);}
function weekendAverages(key) {
  const rows=rangedHistory(key),last=rows.at(-1);
  if(rows.length<2)return {first:null,last,latest:null,daily:null,weekly:null,reason:"Two pictured balances are needed"};
  const settlements=state.data.checkpoints.filter(cp=>weekendSettlement(cp)&&cp.complete&&cp.day_key>=state.rangeStart&&cp.day_key<=state.rangeEnd&&hours(cp.at,last.at)>=0);
  const latest=settlements.at(-1),previous=settlements.at(-2);
  let first=rows[0];
  if(latest){
    const sale=point(latest,key);
    if(!confirmed(sale))return {first:null,last,latest,daily:null,weekly:null,reason:`No pictured balance for this player at ${dayLabel(latest.day_key)} weekend sell`};
    const prior=previous?point(previous,key):null;
    first=confirmed(prior)?prior:rows.find(row=>hours(row.at,sale.at)>0);
    if(!first)return {first:null,last,latest,daily:null,weekly:null,reason:"A pictured balance before the last weekend sell is needed"};
  }
  const elapsed=hours(first.at,last.at),delta=BigInt(last.balance)-BigInt(first.balance),hourly=timeRate(delta,elapsed);
  const weekly=hourly===null?null:hourly*168;
  return {first,last,latest,elapsed,delta,weekly,daily:weekly===null?null:weekly/7,reason:weekly===null?"Two different photo times are needed":null};
}
const boardAmount = (row) => row?.board_balance ?? row?.balance;
function gapInfo(cp,row) {
  if (!row) return {ahead:null,behind:null};
  const ahead = atRank(cp,row.rank-1), behind = atRank(cp,row.rank+1);
  return {ahead:ahead ? {name:ahead.username, key:ahead.key, gap:BigInt(boardAmount(ahead))-BigInt(boardAmount(row)), tentative:!confirmed(ahead)||!confirmed(row)} : null,
          behind:behind ? {name:behind.username, key:behind.key, gap:BigInt(boardAmount(row))-BigInt(boardAmount(behind)), tentative:!confirmed(behind)||!confirmed(row)} : null};
}
function interval(cp,row,previous) {
  const old = previous ? point(previous,row.key) : null;
  const delta = old ? BigInt(row.balance)-BigInt(old.balance) : null;
  const elapsed = old ? hours(old.at,row.at) : null;
  const currentGap = gapInfo(cp,row), oldGap = old ? gapInfo(previous,old) : {ahead:null,behind:null};
  if(previous&&confirmed(old))for(const side of ["ahead","behind"]){
    const neighbor=currentGap[side], priorNeighbor=neighbor?point(previous,neighbor.key):null;
    if(neighbor&&!neighbor.tentative&&confirmed(priorNeighbor))neighbor.priorSpread=BigInt(boardAmount(old))-BigInt(boardAmount(priorNeighbor));
  }
  return {old,delta,elapsed,currentGap,oldGap,rate:delta===null||weekendSettlement(cp)?null:timeRate(delta,elapsed)};
}
function floorEntry(cp,row,previous){
  if(!cp?.complete||!previous?.complete||!confirmed(row)||!row.key.startsWith("id:")||point(previous,row.key))return null;
  // An unresolved prior row with the same photographed name is not evidence of an entry.
  if((state.byCapture.get(previous.id)||[]).some(prior=>prior.username.toLocaleLowerCase()===row.username.toLocaleLowerCase()))return null;
  const floor=atRank(previous,50);
  if(!confirmed(floor))return null;
  const lowerBound=BigInt(row.balance)-BigInt(boardAmount(floor));
  return lowerBound>=BigInt(state.data.threshold)?{floor,lowerBound}:null;
}
function nearbyLabel(position,current,previous) {
  if (!current) return `<span class="muted">${position}: unknown</span>`;
  const ahead=position==="↑", switched=previous&&current.key!==previous.key;
  const now=ahead?-current.gap:current.gap, before=current.priorSpread;
  let change="";
  if(before===undefined)change=' <span class="muted">(previous head-to-head unknown)</span>';
  else {
    const swing=now-before;
    if(swing===0n)change=' <span class="muted">(head-to-head unchanged)</span>';
    else {
      const phrase=before<0n&&now>0n?"overtook by":before>0n&&now<0n?"lost lead by":swing>0n?ahead?"closed gap above by":"lead below grew by":ahead?"fell further behind by":"lead below shrank by";
      change=` <span class="${swing>0n?"positive":"negative"}">(${phrase} ${compact(swing<0n?-swing:swing)}${before*now<0n?" net swing":""})</span>`;
    }
  }
  const neighborNote=switched?` <span class="muted">· prior rank neighbor: ${safe(previous.name)}</span>`:"";
  return `${position} ${safe(current.name)}: <b>${current.tentative?"≈":""}${compact(current.gap)}</b>${change}${neighborNote}`;
}
function setSelected(key) {
  state.selected = key;
  $("search").value = key ? player(key).name : "";
  const u = new URL(location.href);
  if (key) u.searchParams.set("player",key); else u.searchParams.delete("player");
  window.history.replaceState(null,"",u);
  render();
}
function moveTo(index) { state.index=Math.max(0,Math.min(state.data.checkpoints.length-1,index)); $("capture-slider").value=state.index; const u=new URL(location.href),cp=state.data.checkpoints[state.index];if(u.searchParams.has("day"))u.searchParams.set("day",cp.day_key);if(u.searchParams.has("snapshot")||cp.day_snapshot_count>1)u.searchParams.set("snapshot",cp.id);if(u.searchParams.has("day")||u.searchParams.has("snapshot"))history.replaceState(null,"",u);render(); }
function setRateRange(start,end) {
  const first=state.data.checkpoints[0].day_key, last=state.data.checkpoints.at(-1).day_key;
  const bound=(day)=>day<first?first:day>last?last:day;
  state.rangeStart=bound(start);
  const endDay=bound(end);
  state.rangeEnd=endDay<state.rangeStart?state.rangeStart:endDay;
  $("range-start").value=state.rangeStart;$("range-end").value=state.rangeEnd;
  const u=new URL(location.href);
  if(state.rangeStart===first && state.rangeEnd===last){u.searchParams.delete("from");u.searchParams.delete("to");}
  else{u.searchParams.set("from",state.rangeStart);u.searchParams.set("to",state.rangeEnd);}
  history.replaceState(null,"",u);
  renderChart();renderProfile();
}
function renderEvents() {
  $("event-list").innerHTML=patchEvents.map(event=>`<article class="event-card" style="--event-color:${safe(event.color)}" data-event="${safe(event.id)}"><span class="event-icon"><span aria-hidden="true">${safe(event.glyph)}</span><img src="${safe(event.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span><div class="event-copy"><button type="button" class="event-jump" data-event-day="${safe(event.day)}" aria-label="View ${safe(event.title)} on the ledger">${safe(event.version)} · ${safe(event.title)} ↗</button><p>${safe(labelDate(event.at))} · ${safe(event.description)}</p><a href="${safe(event.source)}" target="_blank" rel="noopener noreferrer">Wiki patch notes ↗</a><a href="${safe(event.credit)}" target="_blank" rel="noopener noreferrer">Rod image credit ↗</a></div></article>`).join("");
  const weekend=state.data.checkpoints.find(cp=>cp.day_key==='2026-11-14'&&weekendSettlement(cp));
  if(weekend){
    const proof=byId(weekend.primary_evidence[0]);
    $("event-list").insertAdjacentHTML("beforeend",`<article class="event-card" style="--event-color:#61e5b3" data-event="weekend-settlement"><span class="event-icon" aria-hidden="true">↗</span><div class="event-copy"><button type="button" class="event-jump" data-event-capture="${safe(weekend.id)}">Saturday settlement baseline · ${safe(labelDate(weekend.at))} ↗</button><p>Owner-supplied before/after and later Saturday photos describe one end-of-week held-balance level. Earlier images remain context; the balance step is not an hourly earning rate.</p>${proof?`<a href="${safe(evidenceUrl(proof))}" target="_blank" rel="noopener noreferrer">Selected board proof ${safe(proof.id)} ↗</a>`:""}</div></article>`);
    $("event-list").querySelector("[data-event-capture]").addEventListener("click",()=>{
      moveTo(state.data.checkpoints.findIndex(cp=>cp.id===weekend.id));
      const u=new URL(location.href);u.searchParams.set("day",weekend.day_key);u.searchParams.set("snapshot",weekend.id);history.replaceState(null,"",u);
      $("chart").scrollIntoView({behavior:"smooth",block:"start"});
    });
  }
  $("event-list").querySelectorAll("[data-event-day]").forEach(el=>el.addEventListener("click",()=>{
    const index=state.data.checkpoints.findIndex(cp=>cp.day_key===el.dataset.eventDay);
    if(index>=0){
      if(state.selected&&(el.dataset.eventDay<state.rangeStart||el.dataset.eventDay>state.rangeEnd))setRateRange(state.data.checkpoints[0].day_key,state.data.checkpoints.at(-1).day_key);
      moveTo(index);$("chart").scrollIntoView({behavior:"smooth",block:"start"});
    }
  }));
}
function renderControls() {
  const cps=state.data.checkpoints, cp=cps[state.index];
  $("capture-date").textContent=dayLabel(cp.day_key);
  const calendar=[...new Set(cps.map(item=>item.day_key))];
  const firstPhoto=state.data.captures.find(row=>row.id===cp.source_checkpoints[0]);
  const lastPhoto=state.data.captures.find(row=>row.id===cp.source_checkpoints.at(-1));
  const extra=cp.source_checkpoints.length>1?` · ${cp.source_checkpoints.length} batches (${Math.round(hours(firstPhoto.at,lastPhoto.at)*60)}min)` : "";
  const earlier=cp.earlier_session_ids.length?` · ${cp.earlier_session_ids.length} earlier capture${cp.earlier_session_ids.length===1?"":"s"}`:"";
  $("capture-index").textContent=`DAY ${String(calendar.indexOf(cp.day_key)+1).padStart(2,"0")} / ${calendar.length}${weekendSettlement(cp)?" · WEEKEND SETTLEMENT BASELINE":""} · photo ${labelDate(cp.at)}${extra}${earlier}`;
  $("prev").disabled=state.index===0; $("next").disabled=state.index===cps.length-1;
  $("capture-slider").value=String(state.index);
  $("first-date").textContent=dayLabel(cps[0].day_key);
  $("last-date").textContent=dayLabel(cps.at(-1).day_key);
  $("stat-coverage").textContent=`${cp.visible} / ${cp.coverage}`;
  $("stat-coverage-note").textContent=`${cp.verified} read directly from PNG${cp.coverage<50?` · ${50-cp.coverage} not pictured`:""}`;
  const previous=cps[state.index-1], deltaHours=previous?hours(previous.at,cp.at):null;
  $("stat-hours").textContent=elapsedLabel(deltaHours);
  $("stat-hours-note").textContent=weekendSettlement(cp)?"Time between photos; no hourly rate across Saturday settlement":cp.precision.includes("approximate")||previous?.precision?.includes("approximate")?"Capture time approximate; rate is indicative":"Between daily snapshot photos · UTC";
  const gains=(state.byCapture.get(cp.id)||[]).map((row)=>({row,change:interval(cp,row,previous)})).filter(({row,change})=>confirmed(row)&&confirmed(change.old)&&change.delta>0n).sort((a,b)=>a.change.delta>b.change.delta?-1:1);
  $("stat-largest").textContent=gains.length?signed(gains[0].change.delta):"—";
  $("stat-largest-name").textContent=gains.length?`${gains[0].row.username}${weekendSettlement(cp)?" · weekly settlement step":""}`:"No photo-checked adjacent comparison";
  const floor=atRank(cp,50); $("stat-floor").textContent=floor?compact(floor.balance):"UNKNOWN";
  $("stat-floor-note").textContent=floor?`#50 ${floor.username}`:"Rank #50 not pictured or unreadable";
  const notice=$("notice");
  notice.hidden=cp.complete;
  if (!cp.complete) notice.textContent=`${cp.verified} of ${cp.coverage} photographed rank slots have legible values confirmed against the original PNGs.${cp.coverage>cp.verified?` ${cp.coverage-cp.verified} cropped or unreadable slots remain unknown.`:""} Confirmed Top-50 exits require two complete captures; a missing image never means a player had zero C$.`;
}
function renderChart() {
  const node=$("chart"), cps=state.data.checkpoints;
  const slots=chartSlots(cps,cps[0].day_key,cps.at(-1).day_key).filter(slot=>!state.selected || slot.day>=state.rangeStart && slot.day<=state.rangeEnd);
  const days=slots.map(slot=>slot.id);
  const compactTicks=node.clientWidth<500;
  const selected=state.selected, graphedSelected=selected&&!chartExcludedKeys.has(selected)?selected:null, limit=state.filter==="all"?50:Number(state.filter);
  const allowed=new Set(cps.flatMap((cp)=>(state.byCapture.get(cp.id)||[]).filter((row)=>row.rank<=limit&&!chartExcludedKeys.has(row.key)).map((row)=>row.key)));
  if(graphedSelected)allowed.add(graphedSelected);
  const keys=[...allowed].sort((a,b)=>memberHistory(a)[0]?.rank-memberHistory(b)[0]?.rank || a.localeCompare(b));
  if (!keys.length) {node.textContent="No screenshot readings yet for this range.";return;}
  const plot=[];
  keys.forEach((key,i)=>{
    const rows=slots.map(slot=>slot.cp?point(slot.cp,key):null);
    if (!rows.some(Boolean))return;
    const color=graphedSelected && graphedSelected!==key?"rgba(125,151,164,.22)":palette[i%palette.length];
    const xs=days, ys=rows.map((row)=>row?Number(row.balance):null);
    plot.push({type:"scatter",mode:"lines+markers",name:player(key).name,x:xs,y:ys,connectgaps:false,meta:{key},
      line:{color,width:graphedSelected===key?3.5:1.5,shape:"linear"},marker:{size:rows.map(row=>row?(graphedSelected===key?8:5):0),symbol:"circle",color},
      customdata:rows.map((row,index)=>row?[`#${row.rank}`,exact(row.balance),(row.balance_evidence||row.evidence).join(", "),labelDate(row.at),row.board_at?`Rank pictured ${labelDate(row.board_at)} · board balance ${exact(row.board_balance)}`:"Rank and balance pictured together",dayLabel(slots[index].day),weekendSettlement(slots[index].cp)?"Saturday settlement baseline · no hourly earning pace":"Selected daily photo",slots[index].cp.id]:["unknown","unknown","","unknown","",dayLabel(slots[index].day),"No photo",""]),
      hovertemplate:"<b>%{fullData.name}</b><br>Leaderboard day %{customdata[5]}<br>%{customdata[6]}<br>Balance photo %{customdata[3]} (Chicago)<br>%{customdata[0]} · %{customdata[1]}<br>%{customdata[4]}<br>Balance proof: %{customdata[2]}<extra></extra>",showlegend:false});
    // A faint dashed bridge marks an unobserved span rather than inventing intermediate points.
    let previous=-1;
    rows.forEach((row,index)=>{if(!row)return;if(previous>=0 && index-previous>1){plot.push({type:"scatter",mode:"lines",x:[xs[previous],xs[index]],y:[ys[previous],ys[index]],line:{color:graphedSelected && graphedSelected!==key?"rgba(125,151,164,.11)":color,width:1,dash:"dot"},hoverinfo:"skip",showlegend:false});}previous=index;});
  });
  const selectedSlot=slots.find(slot=>slot.cp?.id===cps[state.index].id);
  const maxY=plot.flatMap((item)=>item.y||[]).filter((x)=>Number.isFinite(x));
  if(!maxY.length){node.textContent="No screenshot-derived balances yet.";return;}
  const ymax=Math.max(...maxY)*1.08;
  const visibleEvents=patchEvents.filter(event=>days.includes(event.day));
  const saturdaySlots=slots.filter(slot=>weekendSettlement(slot.cp));
  const layout={height:node.clientHeight||495,autosize:true,paper_bgcolor:"rgba(0,0,0,0)",plot_bgcolor:"rgba(4,19,31,.44)",font:{color:"#9cbdcc",family:"Inter, Segoe UI, Arial",size:10},margin:{l:65,r:20,t:38,b:55},hovermode:"closest",hoverlabel:{bgcolor:"#0c2b3f",bordercolor:"#29f8ff",font:{color:"#e8fbff"}},
    xaxis:{type:"category",categoryorder:"array",categoryarray:days,range:[-.5,days.length-.5],tickmode:"array",tickvals:days,ticktext:slots.map((slot,index)=>slot.index?compactTicks?`#${slot.index+1}`:new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",hour:"numeric",minute:"2-digit"}).format(new Date(slot.cp.at)):compactTicks&&index%3!==0&&!slot.day.endsWith("-01")&&index!==days.length-1&&slot.count<2?"":index===0||slot.day.endsWith("-01")?dayLabel(slot.day).replace(/,\s*\d{4}$/,""):slot.day.slice(-2)),tickangle:compactTicks?-30:-45,tickfont:{size:9},gridcolor:"rgba(154,219,231,.1)"},
    yaxis:{title:"HELD C$",range:[0,ymax],tickformat:"~s",gridcolor:"rgba(154,219,231,.1)",zeroline:false},
    shapes:[...visibleEvents.map(event=>({type:"line",x0:event.day,x1:event.day,y0:0,y1:1,yref:"paper",line:{color:event.color,width:2,dash:"dash"}})),...saturdaySlots.map(slot=>({type:"line",x0:slot.id,x1:slot.id,y0:0,y1:1,yref:"paper",line:{color:"#61e5b3",width:1.6,dash:"dash"}})),...(selectedSlot?[{type:"line",x0:selectedSlot.id,x1:selectedSlot.id,y0:0,y1:1,yref:"paper",line:{color:"#ffd166",width:1.4,dash:"dot"}}]:[])],
    annotations:[...visibleEvents.map(event=>({x:event.day,xref:"x",y:1,yref:"paper",yanchor:"bottom",showarrow:false,text:event.version,font:{color:event.color,size:10},bgcolor:"#071927",bordercolor:event.color,borderwidth:1,borderpad:3})),...saturdaySlots.map(slot=>({x:slot.id,xref:"x",y:.90,yref:"paper",yanchor:"bottom",showarrow:false,captureevents:true,text:"WEEKEND",font:{color:"#61e5b3",size:9},bgcolor:"#071927",bordercolor:"#61e5b3",borderwidth:1,borderpad:2}))],uirevision:"money-ledger"};
  Plotly.react(node,plot,layout,{displayModeBar:false,responsive:true,scrollZoom:false});
  if (!state.chartBound) {
    node.on("plotly_click",(event)=>{const marker=event.points?.[0],key=marker?.data?.meta?.key,id=marker?.customdata?.[7];const index=state.data.checkpoints.findIndex(cp=>cp.id===id);if(index>=0)moveTo(index);if(key)setSelected(key);if(index>=0){const u=new URL(location.href);u.searchParams.set("day",state.data.checkpoints[index].day_key);u.searchParams.set("snapshot",id);history.replaceState(null,"",u);}});
    node.on("plotly_clickannotation",(event)=>{
      const slot=chartSlots(state.data.checkpoints,state.data.checkpoints[0].day_key,state.data.checkpoints.at(-1).day_key).find(item=>item.id===event.annotation?.x&&item.cp);
      if(!slot)return;
      moveTo(state.data.checkpoints.findIndex(cp=>cp.id===slot.cp.id));
      const u=new URL(location.href);u.searchParams.set("day",slot.day);u.searchParams.set("snapshot",slot.cp.id);history.replaceState(null,"",u);
    });
    state.chartBound=true;
  }
  $("chart-title").textContent=selected?chartExcludedKeys.has(selected)?`${player(selected).name} · omitted from graph`:`${player(selected).name} · balance history`:"Leaderboard trajectories";
}
function renderMovement() {
  const cp=state.data.checkpoints[state.index], previous=state.data.checkpoints[state.index-1];
  const rows=(state.byCapture.get(cp.id)||[]).map(row=>({row,change:interval(cp,row,previous)}));
  rows.sort((a,b)=>a.row.rank-b.row.rank);
  let filtered=rows;
  if(state.view==="gains")filtered=rows.filter(({change})=>change.delta!==null && change.delta>0n).sort((a,b)=>a.change.delta>b.change.delta?-1:a.change.delta<b.change.delta?1:0);
  if(state.view==="changes")filtered=rows.filter(({row,change})=>change.old && change.old.rank!==row.rank);
  $("movement-subtitle").textContent=(previous?`Versus ${dayLabel(previous.day_key)} (photo ${labelDate(previous.at)}) · ${cp.verified} readings`:`First recorded day · ${cp.verified} photo-checked readings`)+(cp.profile_updates?.length?" · Neighbor gaps use simultaneous board values":"");
  const markup=filtered.map(({row,change})=>{
    const {old,delta,rate,currentGap,oldGap}=change;
    const rank=old?`#${old.rank} ${old.rank===row.rank?"→":old.rank>row.rank?"↗":"↘"} #${row.rank}`:`#${row.rank}`;
    const positionDelta=old?old.rank-row.rank:null;
    const positionChange=old?positionDelta>0?`<b class="rank-move up" title="Up ${positionDelta} places">↑${positionDelta}</b>`:positionDelta<0?`<b class="rank-move down" title="Down ${-positionDelta} places">↓${-positionDelta}</b>`:`<b class="rank-move steady" title="Rank unchanged">→0</b>`:previous?.complete?`<b class="rank-move new">NEW</b>`:"";
    const known=delta!==null;
    const tentative=!confirmed(row)||(old&&!confirmed(old));
    const large=known && !tentative && delta>=BigInt(state.data.threshold);
    const entry=!old?floorEntry(cp,row,previous):null;
    const entryLabel=previous?.complete&&confirmed(row)?memberHistory(row.key).some(reading=>new Date(reading.at)<new Date(row.at))?"RETURNED TO TOP 50":"FIRST SEEN IN TOP 50":"PREVIOUS UNKNOWN";
    const previousText=old?exact(old.balance):entry?`prior #50 floor ${exact(boardAmount(entry.floor))} (upper bound; player's previous amount unknown)`:"previous amount unknown";
    const deltaText=known?`${tentative?"≈":""}${signed(delta)} observed net C$`:entry?`at least ${signed(entry.lowerBound)} floor-derived net C$; exact prior balance unknown`:"no adjacent measurement";
    const rateLine=known?(weekendSettlement(cp)?'<span class="muted">Saturday end-of-week balance settlement · new baseline for following photos · no hourly rate inferred</span>':rate>0 ? `<span class="rainbow-rate">${rainbowRateHtml(rate)}</span><span class="muted">Rainbow base-equivalent ≈${signed(rainbowBase(delta))} C$ if all net change were 1.5× sales</span>` : `<span class="muted">Observed no-multiplier rate ${rateText(rate)}</span>`):"";
    const quality="Photo checked";
    const update=state.profileUpdates.get(row.profile_update);
    const profileNote=update?`<p class="profile-update-inline">Player profile at ${safe(labelDate(update.at,{second:"2-digit"}))}: ${signed(BigInt(update.balance)-BigInt(update.source_balance))} observed net C$ since the #${update.source_rank} board photo at ${safe(labelDate(update.source_at,{second:"2-digit"}))} (${elapsedLabel(hours(update.source_at,update.at))}, no multiplier ${rateText(timeRate(BigInt(update.balance)-BigInt(update.source_balance),hours(update.source_at,update.at)))}). Rank and neighboring gaps remain from the board photo; no later rank was photographed.</p>`:"";
    return `<button class="movement-item ${state.selected===row.key?"selected":""}" data-player="${safe(row.key)}" type="button"><div class="top"><strong>${avatar(player(row.key))}${safe(row.username)}</strong><span>${rank} ${positionChange}</span></div><p>${safe(previousText)} → <strong title="${safe(exact(row.balance))}">${tentative?"≈":""}${compact(row.balance)}</strong> · <span class="${known?(delta<0n?"negative":"positive"):entry?"positive":"muted"}">${safe(deltaText)}</span></p>${rateLine?`<p class="rate-compare">${rateLine}</p>`:""}${profileNote}<p class="gaps">${nearbyLabel("↑",currentGap.ahead,oldGap.ahead)}<br>${nearbyLabel("↓",currentGap.behind,oldGap.behind)}</p><div class="badges"><span class="badge ${tentative?"gold":""}">${quality}${tentative?" · check proof":""}</span>${weekendSettlement(cp)?'<span class="badge gold">WEEKEND SETTLEMENT BASELINE</span>':""}${entry?'<span class="badge gold">MAJOR TOP-50 ENTRY · FLOOR-BOUND ≥8B</span>':""}${update?'<span class="badge gold">LATER PROFILE BALANCE</span>':""}${large?'<span class="badge gold">NOTABLE +8B</span>':""}${old?"":`<span class="badge">${entryLabel}</span>`}${cp.precision.includes("approximate")||previous?.precision?.includes("approximate")?'<span class="badge gold">TIME APPROX.</span>':""}</div></button>`;
  }).join("");
  const prior=previous?.complete && cp.complete && state.view!=="gains" ? (state.byCapture.get(previous.id)||[]).filter(row=>!point(cp,row.key)) : [];
  const departures=prior.map(row=>`<button class="movement-item" type="button" data-player="${safe(row.key)}"><div class="top"><strong>${avatar(player(row.key))}${safe(row.username)}</strong><span>#${row.rank} → outside Top 50</span></div><p>Last observed ${compact(row.balance)}. Current amount unknown; last captured floor ${compact(atRank(cp,50)?.balance||null)}.</p><div class="badges"><span class="badge gold">LEFT PICTURED TOP 50</span></div></button>`).join("");
  $("movement-list").innerHTML=markup+departures||`<p class="profile-empty">${cp.visible?"No pictured rows match this filter.":"No readable screenshot rows for this capture yet. Open its original proof images below."}</p>`;
  $("movement-list").querySelectorAll("[data-player]").forEach((el)=>el.addEventListener("click",()=>setSelected(el.dataset.player)));
}
function standoutRows() {
  const cps=state.data.checkpoints, threshold=BigInt(state.data.threshold), flags=[], recentLarge=new Map();
  for(let index=1;index<cps.length;index++){
    const cp=cps[index], previous=cps[index-1];
    const settlement=weekendSettlement(cp);
    if(settlement)recentLarge.clear();
    for(const row of state.byCapture.get(cp.id)||[]){
      if(!confirmed(row))continue;
      const change=interval(cp,row,previous);
      if(!change.old){
        const entry=floorEntry(cp,row,previous);
        if(entry)flags.push({kind:"appearance",index,cp,previous,row,change,
          lowerBound:entry.lowerBound,previousFloor:entry.floor,climb:null,bigGain:false,repeatWith:null,
          severity:!settlement&&entry.lowerBound>=25_000_000_000n?"extreme":"high"});
        continue;
      }
      if(!confirmed(change.old)||change.delta===null||!(change.elapsed>0))continue;
      const climb=change.old.rank-row.rank, bigGain=change.delta>=threshold;
      if(bigGain||climb>=5){
        const item={kind:"movement",index,cp,previous,row,change,climb,bigGain,repeatWith:null,severity:"notable"};
        flags.push(item);
        // A settlement is a flagged balance step, but not a repeated-gain pattern.
        if(!settlement&&change.delta>=20_000_000_000n){
          const earlier=recentLarge.get(row.key);
          if(earlier && hours(earlier.row.at,row.at)>0 && hours(earlier.row.at,row.at)<=72){
            item.repeatWith=earlier;
            if(!earlier.repeatWith)earlier.repeatWith=item;
          }
          recentLarge.set(row.key,item);
        }
      }
    }
  }
  for(const item of flags){
    if(item.kind==="appearance")continue;
    if(item.repeatWith||item.change.delta>=25_000_000_000n)item.severity="extreme";
    else if(item.change.delta>=20_000_000_000n||item.climb>=10||(item.bigGain&&item.climb>=5))item.severity="high";
  }
  return flags.sort((a,b)=>b.index-a.index || (a.kind!==b.kind?(a.kind==="appearance"?-1:1):a.kind==="appearance"?a.row.rank-b.row.rank:a.change.delta===b.change.delta?b.climb-a.climb:a.change.delta>b.change.delta?-1:1));
}
function standoutProof(row,label) {
  const proof=byId((row.balance_evidence||row.evidence)[0]);
  return proof?`<a href="${safe(evidenceUrl(proof))}" target="_blank" rel="noopener noreferrer" title="Original SHA-256 ${safe(proof.sha256)}">${safe(label)} ${safe(proof.id)} ↗</a>`:"";
}
function repeatedGainNote(item){
  if(!item.repeatWith)return "";
  const [first,last]=[item,item.repeatWith].sort((a,b)=>new Date(a.row.at)-new Date(b.row.at));
  return `<p class="highlight-repeat">Two ≥20B observed net changes: ${signed(first.change.delta)} on ${safe(dayLabel(first.cp.day_key))} and ${signed(last.change.delta)} on ${safe(dayLabel(last.cp.day_key))}, ${elapsedLabel(hours(first.row.at,last.row.at))} between later photos. These are balance changes, not verified sales.</p>`;
}
function appearanceBeforeProof(item){
  const url=new URL("./",location.href);
  url.searchParams.set("day",item.previous.day_key);url.searchParams.set("snapshot",item.previous.id);
  return `<a href="${safe(url.href)}" title="Inspect all ${item.previous.primary_evidence.length} original PNGs for the previous complete Top 50">Previous full board (${item.previous.primary_evidence.length} PNGs) ↗</a>`;
}
function appearanceCard(item){
  const {index,cp,previous,row,lowerBound,previousFloor,severity}=item;
  const firstSeen=!memberHistory(row.key).some(reading=>new Date(reading.at)<new Date(row.at));
  return `<article class="highlight-card appearance ${state.index===index?"active":""}" data-severity="${severity}" data-flag-kind="appearance" data-highlight-day="${safe(cp.day_key)}" data-highlight-player="${safe(row.key)}"><button class="highlight-open" type="button" data-highlight-open="${index}" data-player="${safe(row.key)}" aria-label="Open ${safe(row.username)} top-50 entry on ${safe(dayLabel(cp.day_key))}"><span class="highlight-head"><span class="highlight-player">${avatar(player(row.key))}${safe(row.username)}</span><span class="highlight-badges"><b class="severity-badge">${severity.toUpperCase()}</b>${weekendSettlement(cp)?'<b class="settlement-badge">WEEKEND SELL CONTEXT</b>':""}<b>${firstSeen?"FIRST SEEN":"RETURNED"} · TOP 50</b></span></span><p><strong>${safe(dayLabel(previous.day_key))} outside pictured Top 50 → ${safe(dayLabel(cp.day_key))} #${row.rank}</strong></p><p class="highlight-amounts">Previous exact balance unknown · pictured #50 floor ${safe(exact(boardAmount(previousFloor)))}<br>Current ${safe(exact(row.balance))} · <strong>floor-derived minimum net increase ≥${safe(exact(lowerBound))}</strong></p><p>${weekendSettlement(cp)?"Weekend settlement entry · new held-balance baseline.":"Ranked entry from a complete previous board."} Neither the exact prior balance nor an hourly rate is known.</p></button><div class="highlight-proof-links">${appearanceBeforeProof(item)}${standoutProof(row,"Current rank proof")}</div></article>`;
}
function renderHighlights() {
  const flags=standoutRows().filter(item=>(state.standoutSeverity==="all"||item.severity===state.standoutSeverity) && item.row.username.toLocaleLowerCase().includes(state.standoutSearch)), pageSize=8, lastPage=Math.max(0,Math.ceil(flags.length/pageSize)-1);
  state.highlightPage=Math.max(0,Math.min(state.highlightPage,lastPage));
  const start=state.highlightPage*pageSize;
  $("highlight-count").textContent=`${flags.length} FLAG${flags.length===1?"":"S"}`;
  const cards=flags.slice(start,start+pageSize).map(item=>{
    if(item.kind==="appearance")return appearanceCard(item);
    const {index,cp,previous,row,change,climb,bigGain,repeatWith,severity}=item;
    return `
    <article class="highlight-card ${state.index===index?"active":""}" data-severity="${severity}" data-highlight-day="${safe(cp.day_key)}" data-highlight-player="${safe(row.key)}">
      <button class="highlight-open" type="button" data-highlight-open="${index}" data-player="${safe(row.key)}" aria-label="Open ${safe(row.username)} on ${safe(dayLabel(cp.day_key))}">
        <span class="highlight-head"><span class="highlight-player">${avatar(player(row.key))}${safe(row.username)}</span>
          <span class="highlight-badges"><b class="severity-badge">${severity.toUpperCase()}</b>${weekendSettlement(cp)?'<b class="settlement-badge">WEEKEND SELL CONTEXT</b>':""}${bigGain?'<b>+8B NET</b>':""}${climb>=5?'<b>↑5+ RANKS</b>':""}</span></span>
        <p><strong>${safe(dayLabel(previous.day_key))} #${change.old.rank} → ${safe(dayLabel(cp.day_key))} #${row.rank}</strong> · ${signed(change.delta)} observed net C$${climb>0?` · ↑${climb} ranks`:""}</p>
        <p class="highlight-amounts">${safe(exact(change.old.balance))} → ${safe(exact(row.balance))}<br>Photos ${safe(labelDate(change.old.at))} → ${safe(labelDate(row.at))} · ${elapsedLabel(change.elapsed)} elapsed${weekendSettlement(cp)?' · Saturday settlement baseline; no hourly earning rate inferred':""}</p>
        ${repeatedGainNote({row,cp,change,repeatWith})}
      </button>
      <div class="highlight-proof-links">${standoutProof(change.old,"Before proof")}${standoutProof(row,"After proof")}</div>
    </article>`;
  }).join("");
  $("highlight-list").innerHTML=cards||'<p class="highlight-empty">No photo-verified changes match this filter. Try another severity or player name.</p>';
  $("highlight-pages").hidden=flags.length<=pageSize;
  $("highlight-prev").disabled=state.highlightPage===0;
  $("highlight-next").disabled=state.highlightPage===lastPage;
  $("highlight-page-label").textContent=flags.length?`${start+1}–${Math.min(start+pageSize,flags.length)} of ${flags.length}`:"";
  $("highlight-list").querySelectorAll("[data-highlight-open]").forEach(el=>el.addEventListener("click",()=>{
    if(!$("chart")){window.focusStandout(Number(el.dataset.highlightOpen),el.dataset.player);return;}
    const day=state.data.checkpoints[Number(el.dataset.highlightOpen)].day_key;
    if(day<state.rangeStart||day>state.rangeEnd)setRateRange(state.data.checkpoints[0].day_key,state.data.checkpoints.at(-1).day_key);
    moveTo(Number(el.dataset.highlightOpen));setSelected(el.dataset.player);
    const u=new URL(location.href);u.searchParams.set("day",state.data.checkpoints[state.index].day_key);history.replaceState(null,"",u);
    $("profile-card").scrollIntoView({behavior:"smooth",block:"start"});
  }));
}
function renderStandoutTeaser(){
  const flags=standoutRows(), repeated=flags.filter(item=>item.repeatWith).length;
  $("standout-teaser-summary").textContent=`${flags.length} photo-backed flags across the archive · ${repeated} entries in repeated ≥20B net-gain patterns. Browse severity colors, original proofs and player-by-player context.`;
}
function renderProfile() {
  const key=state.selected, wrapper=$("profile-content");
  $("profile-clear").hidden=!key;
  $("profile-range").hidden=!key;
  if(!key){$("profile-title").textContent="Select a player";$("profile-hint").textContent="Search, click a chart line, or choose a movement row.";wrapper.className="profile-empty";wrapper.textContent="Historical balances, rates and position changes appear here.";return;}
  const rows=rangedHistory(key), first=rows[0], last=rows.at(-1), meta=player(key);
  $("profile-title").textContent=meta.name;
  $("profile-hint").textContent=`${dayLabel(state.rangeStart)} – ${dayLabel(state.rangeEnd)} · ${rows.length} photo-checked point${rows.length===1?"":"s"} in range`;
  const settlementBetween=rows.length>=2&&crossesSettlement(first.at,last.at);
  $("range-summary").textContent=rows.length>=2?`${meta.name}: ${rows.length} pictured readings · first ${labelDate(first.at)} → last ${labelDate(last.at)} · ${elapsedLabel(hours(first.at,last.at))} elapsed${settlementBetween?" · includes Saturday settlement; average normalized per week rather than per hour":""}`:`${meta.name}: ${rows.length} pictured reading${rows.length===1?"":"s"} in this window · two are required for an average`;
  if(!rows.length){wrapper.className="profile-empty";wrapper.textContent=`No photo-checked ${meta.name} balance appears between ${dayLabel(state.rangeStart)} and ${dayLabel(state.rangeEnd)}. Widen the range to compare two photographed amounts.`;return;}
  const gain=BigInt(last.balance)-BigInt(first.balance), time=hours(first.at,last.at), hasEndpoints=rows.length>=2&&time>0;
  const hourly=hasEndpoints?timeRate(gain,time):null;
  const average=hourly===null?null:settlementBetween?hourly*168:hourly;
  const rateUnit=settlementBetween?"week":"hr";
  const pairs=rows.slice(1).map((row,i)=>({start:rows[i],end:row,delta:BigInt(row.balance)-BigInt(rows[i].balance),elapsed:hours(rows[i].at,row.at),settlement:crossesSettlement(rows[i].at,row.at)}));
  const maximum=pairs.filter(x=>!x.settlement&&x.delta>0n).sort((a,b)=>a.delta>b.delta?-1:1)[0];
  const fastest=pairs.filter(x=>!x.settlement&&x.delta>0n && x.elapsed>0).sort((a,b)=>Number(b.delta)/b.elapsed-Number(a.delta)/a.elapsed)[0];
  const peak=rows.reduce((best,row)=>BigInt(row.balance)>BigInt(best.balance)?row:best,first);
  const link=meta.roblox_id?`<a href="https://www.roblox.com/users/${safe(meta.roblox_id)}/profile" rel="noopener noreferrer" target="_blank">View Roblox profile ↗</a>`:"<small>Roblox account not yet independently matched</small>";
  const selectedRow=point(state.data.checkpoints[state.index],key);
  const selectedUpdate=selectedRow&&selectedRow.day_key>=state.rangeStart&&selectedRow.day_key<=state.rangeEnd?state.profileUpdates.get(selectedRow.profile_update):null;
  const latestUpdate=state.profileUpdates.get(last.profile_update);
  const update=selectedUpdate||latestUpdate;
  const rankAtUpdate=selectedUpdate?selectedRow.rank:last.rank;
  const boardDelta=update?BigInt(update.balance)-BigInt(update.source_balance):null;
  const boardHours=update?hours(update.source_at,update.at):null;
  const profileNote=update?`<div class="profile-update-detail"><strong>Later player-profile balance · ${safe(labelDate(update.at,{second:"2-digit"}))}</strong><p>${safe(exact(update.source_balance))} at board photo ${safe(labelDate(update.source_at,{second:"2-digit"}))} → ${safe(exact(update.balance))} · ${signed(boardDelta)} observed net C$ in ${elapsedLabel(boardHours)} (no multiplier ${rateText(timeRate(boardDelta,boardHours))}). Rank #${rankAtUpdate} remains from the earlier board photo.</p><p>${safe(update.note)}. The observed net change is not an independently verified sale amount.</p><a href="${safe(evidenceUrl(byId(update.evidence[0])))}" rel="noopener noreferrer" target="_blank">Open original player-profile proof ${safe(update.id)} ↗</a></div>`:"";
  wrapper.className="";
  const week=weekendAverages(key);
  const weekDetail=week.reason||`${labelDate(week.first.at)} → ${labelDate(week.last.at)} · ${elapsedLabel(week.elapsed)} · ${signed(week.delta)} observed net held C$${week.latest?` · includes ${dayLabel(week.latest.day_key)} weekend sell`:" · no weekend sell in date range"}; normalized, not verified sales`;
  const stats=[
    ["LAST BALANCE IN RANGE",compact(last.balance),latestUpdate?`Profile photo · rank #${last.rank} from earlier board`:`Rank #${last.rank} · photo checked`],
    ["WEEKLY AVG INCLUDING WEEKEND SELL",rateText(week.weekly,"week"),weekDetail],
    ["DAILY AVG (WEEKLY ÷ 7)",rateText(week.daily,"day"),weekDetail],
    [settlementBetween?"WEEKLY AVG OBSERVED NET CHANGE":"AVERAGE OBSERVED NET RATE",rateText(average,rateUnit),settlementBetween?`${elapsedLabel(time)} observed span · normalized to seven days · settlement and gaps included; not an earning rate`:hasEndpoints?`${elapsedLabel(time)} first-to-last photos · gaps included`:"At least two photo readings required"],
    ["NET IN RANGE",hasEndpoints?signed(gain):"—",hasEndpoints?`${rows.length} pictured photo points · ${settlementBetween?"includes weekly balance step":"held C$ change"}`:"Only one pictured balance"],
    ["RAINBOW 1.5× BASE EQUIVALENT",hasEndpoints&&gain>0n?`≈${signed(rainbowBase(gain))}`:"—",hasEndpoints&&gain>0n?`Hypothetical base for ${signed(gain)} observed net C$ in window` : "Only positive net changes have a base equivalent",hasEndpoints&&gain>0n],
    [settlementBetween?"RAINBOW 1.5× WEEKLY BASE-EQUIV.":"RAINBOW-EQUIVALENT NET RATE",average>0?rateText(average/1.5,rateUnit):"—",`(no multiplier ${rateText(average,rateUnit)}) · ${hasEndpoints?elapsedLabel(time):"unknown interval"} · hypothetical`,average>0],
    ["LARGEST NON-SETTLEMENT INTERVAL",maximum?signed(maximum.delta):"—",maximum?`${maximum.elapsed.toFixed(1)}h between pictured readings`:"No non-settlement increase measured"],
    ["PEAK RAINBOW-EQUIVALENT RATE",fastest?rateText(timeRate(fastest.delta,fastest.elapsed)/1.5):"—",fastest?`(no multiplier ${rateText(timeRate(fastest.delta,fastest.elapsed))}) · ${fastest.elapsed.toFixed(1)}h`:"No positive interval",Boolean(fastest)],
    ["CHANGE IN RANGE",hasEndpoints&&BigInt(first.balance)>0n?`${(Number(gain)/Number(first.balance)*100).toFixed(1)}%`:"—","Observed held balance only"]
  ];
  if(latestUpdate){const delta=BigInt(latestUpdate.balance)-BigInt(latestUpdate.source_balance), elapsed=hours(latestUpdate.source_at,latestUpdate.at);stats.splice(1,0,["SINCE BOARD PHOTO",signed(delta),`${elapsedLabel(elapsed)} · no multiplier ${rateText(timeRate(delta,elapsed))}`]);}
  const historyRows=rows.slice().reverse().map((row)=>{
    const ix=state.data.checkpoints.findIndex(cp=>cp.id===row.checkpoint);
    const previous=state.data.checkpoints[ix-1];
    const old=previous&&previous.day_key>=state.rangeStart&&previous.day_key<=state.rangeEnd?point(previous,key):null;
    const change=old?BigInt(row.balance)-BigInt(old.balance):null;
    const elapsed=old?hours(old.at,row.at):0;
    const rate=change===null?null:timeRate(change,elapsed);
    const rankChange=old?old.rank>row.rank?`<b class="rank-move up">↑${old.rank-row.rank}</b>`:old.rank<row.rank?`<b class="rank-move down">↓${row.rank-old.rank}</b>`:`<b class="rank-move steady">→0</b>`:"";
    const photoTime=localDay(row.at)===row.day_key?new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",hour:"numeric",minute:"2-digit"}).format(new Date(row.at)):labelDate(row.at);
    const settlement=weekendSettlement(state.data.checkpoints[ix]);
    return `<a href="#evidence" data-capture="${ix}" data-proof="${safe((row.balance_evidence||row.evidence)[0]||"")}"><span>${safe(dayLabel(row.day_key))} · photo ${safe(photoTime)} · #${row.rank} ${rankChange}${row.board_at?` · rank photo ${safe(labelDate(row.board_at))}`:""}</span><strong title="${safe(exact(row.balance))}">${compact(row.balance)}</strong><span>${change!==null?`${signed(change)} · ${settlement?"WEEKEND SETTLEMENT · no hourly rate":rate>0?rainbowRateHtml(rate):rateText(rate)}`:settlement?"WEEKEND BASELINE":"—"} ↗</span></a>`;
  }).join("");
  wrapper.innerHTML=`<div class="profile-head">${avatar(meta)||'<span class="avatar-fallback">@</span>'}<div><strong>${safe(meta.name)}</strong><small>${meta.roblox_name&&meta.roblox_name!==meta.name?`Current Roblox name: ${safe(meta.roblox_name)}`:"Historical screenshot name"}</small>${link}</div></div>${profileNote}<div class="profile-stats">${stats.map(([title,value,detail,rainbow])=>`<div><span>${safe(title)}</span><b class="${rainbow?"rainbow-static":""}" title="${safe(value)}">${safe(value)}</b><small>${safe(detail)}</small></div>`).join("")}</div><p class="card-title"><small>Peak pictured ${compact(peak.balance)} · ${BigInt(peak.balance)-BigInt(last.balance)>0n?`${compact(BigInt(peak.balance)-BigInt(last.balance))} below peak`:"at peak"}. Rainbow 1.5× figures are hypothetical base equivalents if all positive net balance change came from boosted sales. Spending, stored fish, and other changes cannot be inferred from the board.</small></p><div class="profile-history">${historyRows}</div>`;
  wrapper.querySelectorAll("[data-capture]").forEach((el)=>el.addEventListener("click",(event)=>{event.preventDefault();moveTo(Number(el.dataset.capture));document.querySelector(".evidence-section").scrollIntoView({behavior:"smooth"});spotlight(el.dataset.proof);}));
}
function spotlight(id){document.querySelectorAll(".proof").forEach((el)=>el.classList.toggle("spotlit",el.dataset.proof===id));}
function renderEvidence() {
  const cp=state.data.checkpoints[state.index];
  $("evidence-count").textContent=`${cp.evidence.length} ORIGINAL PNG${cp.evidence.length===1?"":"S"}`;
  $("evidence-subtitle").textContent=`Leaderboard day ${dayLabel(cp.day_key)} · board photo ${labelDate(cp.at)}${cp.early_am_rollover?" (early AM, counted for preceding day)":""}${cp.earlier_session_ids.length?` · ${cp.earlier_session_ids.length} earlier capture kept for context`:""}${cp.source_checkpoints.length>1?` · ${cp.source_checkpoints.length} matching photo batches`:""}${cp.profile_updates?.length?` · ${cp.profile_updates.length} separate player-profile balance reading`:""}`;
  $("evidence-grid").innerHTML=cp.evidence.map((id)=>{
    const item=byId(id);if(!item)return"";
    const profile=item.kind==="profile", selected=cp.primary_evidence.includes(id);
    const label=profile?`Player profile balance · ${safe(item.username)} (not a new rank)`:`rank ${item.min}–${item.max}`;
    const context=profile?"Later balance for one player; leaderboard ranks from board photo":selected?"Selected daily board photo":"Earlier context · not used for daily balance";
    return `<button type="button" class="proof ${profile?"profile-proof":selected?"":"earlier-proof"}" data-proof="${safe(item.id)}"><img src="${safe(evidenceUrl(item))}" loading="lazy" alt="Original ${profile?"player profile":"leaderboard"} evidence ${safe(id)}"><span>${safe(id)} · ${label}</span><small>${context} · ${safe(labelDate(item.captured_at))} · SHA-256 ${safe(item.sha256.slice(0,12))}…</small></button>`;
  }).join("");
  $("evidence-grid").querySelectorAll(".proof").forEach((el)=>el.addEventListener("click",()=>{
    const item=byId(el.dataset.proof);if(!item)return;
    $("lightbox-image").src=evidenceUrl(item);
    $("lightbox-caption").textContent=`${item.kind==="profile"?`Player profile balance for ${item.username}; not a new board rank`:cp.primary_evidence.includes(item.id)?"Selected daily board photo":"Earlier capture (not used for daily balance)"} · ${item.id} · ${labelDate(item.captured_at)}${item.kind==="profile"?"":` · ranks ${item.min}–${item.max}`} · original SHA-256 ${item.sha256}`;
    $("lightbox").showModal();
  }));
  if(state.selected){const row=point(cp,state.selected);if(row)spotlight((row.balance_evidence||row.evidence)[0]);}
}
function render(){renderControls();renderStandoutTeaser();renderChart();renderMovement();renderProfile();renderEvidence();}
async function init(){
  try{
    const response=await fetch("data.json",{cache:"no-cache"});if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();state.data=data;
    const pictured=data.captures.reduce((sum,cp)=>sum+cp.coverage,0);
    const confirmed=data.captures.reduce((sum,cp)=>sum+cp.verified,0);
    const days=new Set(data.checkpoints.map(cp=>cp.day_key)).size;
    $("global-review-note").textContent=`${data.checkpoints.length} displayed photo points across ${days} leaderboard days (distinct complete Saturday captures since Nov 14, 2026) from ${data.sessions.length} sessions and ${data.captures.length} original board captures, plus ${data.profile_updates.length} separate player-profile balance update${data.profile_updates.length===1?"":"s"}. ${confirmed.toLocaleString()} of ${pictured.toLocaleString()} board readings were checked directly against original images; ${pictured-confirmed} cropped readings remain unknown, and ${data.capture_status_counts.not_captured} raw rank slots were not pictured. Photo times and SHA-256 proofs are retained. Rainbow 1.5× figures are hypothetical base equivalents, not confirmed sales.`;
    data.checkpoints.forEach(cp=>state.byCapture.set(cp.id,[]));
    data.observations.filter(row=>row.status==="verified").forEach(row=>{state.byCapture.get(row.checkpoint).push(row);if(!state.byPlayer.has(row.key))state.byPlayer.set(row.key,[]);state.byPlayer.get(row.key).push(row);});
    data.players.forEach(meta=>state.playerMeta.set(meta.key,meta));
    data.evidence.forEach(proof=>state.proofs.set(proof.id,proof));
    data.profile_updates.forEach(update=>state.profileUpdates.set(update.id,update));
    for(const [key,rows] of state.byPlayer)rows.sort((a,b)=>new Date(data.checkpoints.find(cp=>cp.id===a.checkpoint).at)-new Date(data.checkpoints.find(cp=>cp.id===b.checkpoint).at));
    const url=new URL(location.href), requestedDay=url.searchParams.get("day"), requestedSnapshot=url.searchParams.get("snapshot"), requestedById=data.checkpoints.findIndex(cp=>cp.id===requestedSnapshot), requestedIndex=data.checkpoints.findLastIndex(cp=>cp.day_key===requestedDay);
    const firstDay=data.checkpoints[0].day_key, lastDay=data.checkpoints.at(-1).day_key;
    const validDay=(value)=>/^\d{4}-\d{2}-\d{2}$/.test(value||"") && value>=firstDay && value<=lastDay;
    state.rangeStart=validDay(url.searchParams.get("from"))?url.searchParams.get("from"):firstDay;
    state.rangeEnd=validDay(url.searchParams.get("to"))?url.searchParams.get("to"):lastDay;
    if(state.rangeStart>state.rangeEnd){state.rangeStart=firstDay;state.rangeEnd=lastDay;}
    for(const input of [$("range-start"),$("range-end")]){input.min=firstDay;input.max=lastDay;}
    $("range-start").value=state.rangeStart;$("range-end").value=state.rangeEnd;
    $("range-start").addEventListener("change",()=>{const start=$("range-start").value||firstDay,end=$("range-end").value||lastDay;setRateRange(start,start>end?start:end);});
    $("range-end").addEventListener("change",()=>{const start=$("range-start").value||firstDay,end=$("range-end").value||lastDay;setRateRange(start>end?end:start,end);});
    $("range-week").addEventListener("click",()=>{const start=new Date(`${lastDay}T12:00:00Z`);start.setUTCDate(start.getUTCDate()-6);setRateRange(start.toISOString().slice(0,10),lastDay);});
    $("range-all").addEventListener("click",()=>setRateRange(firstDay,lastDay));
    for(const event of patchEvents)if(localDay(event.at)!==event.day)throw new Error(`Patch event date mismatch: ${event.id}`);
    renderEvents();
    state.index=requestedById>=0?requestedById:requestedIndex>=0?requestedIndex:data.checkpoints.length-1;
    const requested=url.searchParams.get("player");if(requested && state.playerMeta.has(requested))state.selected=requested;
    $("capture-slider").max=String(data.checkpoints.length-1);$("capture-slider").addEventListener("input",(ev)=>moveTo(Number(ev.target.value)));
    $("prev").addEventListener("click",()=>moveTo(state.index-1));$("next").addEventListener("click",()=>moveTo(state.index+1));
    $("clear").addEventListener("click",()=>{setRateRange(firstDay,lastDay);setSelected(null);});$("profile-clear").addEventListener("click",()=>setSelected(null));
    $("top-filter").addEventListener("change",(ev)=>{state.filter=ev.target.value;renderChart();});
    let resizeTimer;
    window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state.data&&window.Plotly)renderChart();},120);});
    $("search").addEventListener("input",(ev)=>{const term=ev.target.value.trim().toLocaleLowerCase();if(!term){setSelected(null);return;}const meta=data.players.find(p=>p.name.toLocaleLowerCase()===term || p.key===term)||data.players.find(p=>p.name.toLocaleLowerCase().includes(term)||p.roblox_name?.toLocaleLowerCase().includes(term));if(meta){state.selected=meta.key;const u=new URL(location.href);u.searchParams.set("player",meta.key);history.replaceState(null,"",u);render();$("search").focus();$("search").setSelectionRange(ev.target.value.length,ev.target.value.length);}});
    document.querySelectorAll("[data-view]").forEach(el=>el.addEventListener("click",()=>{state.view=el.dataset.view;document.querySelectorAll("[data-view]").forEach(btn=>btn.classList.toggle("active",btn===el));renderMovement();}));
    $("lightbox").addEventListener("click",(ev)=>{if(ev.target===$("lightbox"))$("lightbox").close();});
    render();
  }catch(error){$("notice").hidden=false;$("notice").textContent=`Could not load the evidence ledger: ${error.message}`;$("capture-date").textContent="Data unavailable";}
}
if($("chart"))init();

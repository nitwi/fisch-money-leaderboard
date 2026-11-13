"use strict";

let focusedFlag=null;

function overviewRate() {
  if(!focusedFlag)return;
  const rows=rangedHistory(focusedFlag.row.key), node=$("overview-rate");
  if(rows.length<2){
    node.innerHTML=`<p>${rows.length} photographed daily reading${rows.length===1?"":"s"} in this window. Two are needed to measure an average net rate.</p>`;
    return;
  }
  const first=rows[0], last=rows.at(-1), elapsed=hours(first.at,last.at);
  const delta=BigInt(last.balance)-BigInt(first.balance), rate=timeRate(delta,elapsed);
  node.innerHTML=`<p>${rows.length} photographed points · ${safe(labelDate(first.at))} → ${safe(labelDate(last.at))} · ${elapsedLabel(elapsed)} between actual photos (gaps included).</p><div class="overview-metrics"><div><span>OBSERVED NET RATE</span><b>${rateText(rate)}</b></div><div><span>NET HELD C$ CHANGE</span><b>${signed(delta)}</b></div>${rate>0?`<div><span>HYPOTHETICAL 1.5× BASE RATE</span><b class="rainbow-static">${rateText(rate/1.5)}</b></div>`:""}</div>`;
}

function overviewRange(start,end) {
  const first=state.data.checkpoints[0].day_key, last=state.data.checkpoints.at(-1).day_key;
  const bound=day=>day<first?first:day>last?last:day;
  state.rangeStart=bound(start);
  const target=bound(end);
  state.rangeEnd=target<state.rangeStart?state.rangeStart:target;
  $("overview-start").value=state.rangeStart;$("overview-end").value=state.rangeEnd;
  const u=new URL(location.href);
  if(state.rangeStart===first && state.rangeEnd===last){u.searchParams.delete("from");u.searchParams.delete("to");}
  else{u.searchParams.set("from",state.rangeStart);u.searchParams.set("to",state.rangeEnd);}
  history.replaceState(null,"",u);
  renderOverview();
}

function renderOverview(){
  const item=focusedFlag;
  if(!item)return;
  const {row,change,cp,previous,climb,severity,repeatWith}=item;
  const meta=player(row.key), first=state.data.checkpoints[0].day_key, last=state.data.checkpoints.at(-1).day_key;
  const url=new URL("./",location.href);
  url.searchParams.set("day",cp.day_key);url.searchParams.set("player",row.key);
  if(state.rangeStart!==first||state.rangeEnd!==last){url.searchParams.set("from",state.rangeStart);url.searchParams.set("to",state.rangeEnd);}
  const context=patchEvents.filter(event=>new Date(event.at)>new Date(change.old.at)&&new Date(event.at)<=new Date(row.at));
  $("overview-content").innerHTML=`<div class="overview-person">${avatar(meta)}<span>${safe(meta.name)}<small> · ${safe(dayLabel(cp.day_key))}</small></span></div><p><span class="overview-emphasis">${safe(severity.toUpperCase())} photographed change</span> · ${safe(dayLabel(previous.day_key))} #${change.old.rank} → ${safe(dayLabel(cp.day_key))} #${row.rank}${climb>0?` · ↑${climb} ranks`:""}</p><div class="overview-metrics"><div><span>OBSERVED NET HELD C$</span><b>${signed(change.delta)}</b></div><div><span>PHOTO INTERVAL</span><b>${elapsedLabel(change.elapsed)}</b></div><div><span>BEFORE</span><b>${safe(exact(change.old.balance))}</b></div><div><span>AFTER</span><b>${safe(exact(row.balance))}</b></div><div><span>NET RATE (NO MULTIPLIER)</span><b>${rateText(change.rate)}</b></div></div><p>Before photo ${safe(labelDate(change.old.at))}; after photo ${safe(labelDate(row.at))}. Neither photo establishes gross sales or activity throughout the interval.</p>${repeatWith?`${repeatedGainNote(item)}<button class="overview-other" type="button" data-other-day="${repeatWith.index}" data-other-player="${safe(row.key)}">Inspect the other large change ↗</button>`:""}${context.length?`<p class="event-context">Patch during this photo interval: ${context.map(event=>`<a href="${safe(event.source)}" target="_blank" rel="noopener noreferrer">${safe(event.version)} · ${safe(event.title)} ↗</a>`).join(" · ")}. Timing alone does not establish cause.</p>`:""}<div class="overview-links">${standoutProof(change.old,"Before original")}${standoutProof(row,"After original")}</div><a class="overview-dashboard-link" href="${safe(url.href)}">Open day and player on dashboard ↗</a><div class="overview-range"><h3>Average over your date range</h3><div class="overview-range-fields"><label>From <input id="overview-start" type="date" min="${first}" max="${last}" value="${state.rangeStart}" aria-label="First date for selected player's average"></label><label>Through <input id="overview-end" type="date" min="${first}" max="${last}" value="${state.rangeEnd}" aria-label="Last date for selected player's average"></label></div><div class="overview-range-actions"><button id="overview-week" type="button">Recent 7 days</button><button id="overview-all" type="button">All history</button></div><div id="overview-rate"></div><p>First-to-last net balance ÷ actual elapsed time. Dormant gaps count unless excluded by the dates.</p></div>`;
  $("overview-content").querySelector(".overview-metrics b").insertAdjacentHTML("beforeend",`<small class="overview-exact">${safe(exact(change.delta))} exact</small>`);
  overviewRate();
  $("overview-start").addEventListener("change",()=>{const start=$("overview-start").value||first,end=$("overview-end").value||last;overviewRange(start,start>end?start:end);});
  $("overview-end").addEventListener("change",()=>{const start=$("overview-start").value||first,end=$("overview-end").value||last;overviewRange(start>end?end:start,end);});
  $("overview-week").addEventListener("click",()=>{const date=new Date(`${last}T12:00:00Z`);date.setUTCDate(date.getUTCDate()-6);overviewRange(date.toISOString().slice(0,10),last);});
  $("overview-all").addEventListener("click",()=>overviewRange(first,last));
  $("overview-content").querySelector("[data-other-day]")?.addEventListener("click",(event)=>window.focusStandout(Number(event.currentTarget.dataset.otherDay),event.currentTarget.dataset.otherPlayer));
}

window.focusStandout=(index,key)=>{
  const flag=standoutRows().find(item=>item.index===index && item.row.key===key);
  if(!flag)return;
  focusedFlag=flag;state.index=index;state.selected=key;
  const u=new URL(location.href);u.searchParams.set("day",flag.cp.day_key);u.searchParams.set("player",key);history.replaceState(null,"",u);
  renderOverview();renderHighlights();
  if(window.innerWidth<901)$("standout-overview").scrollIntoView({behavior:"smooth",block:"start"});
};

async function initStandouts(){
  try{
    const response=await fetch("data.json",{cache:"no-cache"});if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();state.data=data;
    for(const cp of data.checkpoints)state.byCapture.set(cp.id,[]);
    for(const row of data.observations.filter(confirmed)){
      state.byCapture.get(row.checkpoint).push(row);
      if(!state.byPlayer.has(row.key))state.byPlayer.set(row.key,[]);
      state.byPlayer.get(row.key).push(row);
    }
    for(const meta of data.players)state.playerMeta.set(meta.key,meta);
    for(const proof of data.evidence)state.proofs.set(proof.id,proof);
    const first=data.checkpoints[0].day_key,last=data.checkpoints.at(-1).day_key,u=new URL(location.href);
    const valid=day=>/^\d{4}-\d{2}-\d{2}$/.test(day||"")&&day>=first&&day<=last;
    state.rangeStart=valid(u.searchParams.get("from"))?u.searchParams.get("from"):first;
    state.rangeEnd=valid(u.searchParams.get("to"))?u.searchParams.get("to"):last;
    if(state.rangeStart>state.rangeEnd){state.rangeStart=first;state.rangeEnd=last;}
    const flags=standoutRows();
    const chosen=flags.find(item=>item.cp.day_key===u.searchParams.get("day")&&item.row.key===u.searchParams.get("player"))||flags[0];
    state.index=chosen?.index??data.checkpoints.length-1;
    state.selected=chosen?.row.key??null;
    if(chosen){focusedFlag=chosen;state.highlightPage=Math.floor(flags.indexOf(chosen)/8);renderOverview();}
    renderHighlights();
    $("highlight-prev").addEventListener("click",()=>{state.highlightPage--;renderHighlights();});
    $("highlight-next").addEventListener("click",()=>{state.highlightPage++;renderHighlights();});
    $("flag-search").addEventListener("input",event=>{state.standoutSearch=event.target.value.trim().toLocaleLowerCase();state.highlightPage=0;renderHighlights();});
    $("flag-severity").addEventListener("change",event=>{state.standoutSeverity=event.target.value;state.highlightPage=0;renderHighlights();});
  }catch(error){$("highlight-list").textContent=`Could not load the evidence ledger: ${error.message}`;}
}

initStandouts();

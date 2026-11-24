"use strict";
const $=id=>document.getElementById(id);
const zone=$("zone"), date=$("date"), time=$("time"), prefix=$("prefix"), occurrence=$("occurrence");
const detected=Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC";
let saved;try{saved=localStorage.getItem("fisch-timestamp-zone")}catch{}
const zones=[...new Set(["UTC",detected,"America/Chicago","America/New_York","America/Denver","America/Los_Angeles","Europe/London","Asia/Kolkata","Asia/Kathmandu","Asia/Manila",...(Intl.supportedValuesOf?Intl.supportedValuesOf("timeZone"):[])])].sort();
for(const z of zones)zone.add(new Option(z.replaceAll("_"," "),z));
zone.value=zones.includes(saved)?saved:detected;
function parts(ms,z){return Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:z,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(ms)).map(p=>[p.type,p.value]));}
function wall(ms,z){const p=parts(ms,z);return Date.parse(p.year+"-"+p.month+"-"+p.day+"T"+p.hour+":"+p.minute+":"+p.second+"Z");}
function candidates(local,z){const target=Date.parse(local+"Z");if(!Number.isFinite(target)||new Date(target).toISOString().slice(0,19)!==local)return [];const offsets=new Set();for(let h=-48;h<=48;h+=6){const t=target+h*3600000;offsets.add(wall(t,z)-t);}return [...offsets].map(o=>target-o).filter(t=>wall(t,z)===target).sort((a,b)=>a-b);}
function pretty(ms,z){return new Intl.DateTimeFormat("en-US",{timeZone:z,year:"numeric",month:"long",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",timeZoneName:"shortOffset"}).format(new Date(ms))+" ("+z+")";}
function output(id,value){$(id).textContent=value||"—";document.querySelector('[data-copy="'+id+'"]').disabled=!value;}
function render(){const local=date.value+"T"+(time.value.length===5?time.value+":00":time.value);const matches=candidates(local,zone.value);const old=occurrence.value;occurrence.replaceChildren();$("ambiguity").hidden=matches.length<2;for(const m of matches)occurrence.add(new Option(pretty(m,zone.value)+" / "+new Date(m).toISOString(),String(m)));if(matches.some(m=>String(m)===old))occurrence.value=old;const selected=matches.length?Number(occurrence.value):NaN;const raw=Number.isFinite(selected)?new Date(selected).toISOString():"";output("raw",raw);output("command",raw?prefix.value+raw:"");$("status").textContent=raw?pretty(selected,zone.value):"Enter a valid date and time. If this time falls in a daylight saving gap, choose another time.";$("status").classList.toggle("error",!raw);decode();}
function decode(){const v=$("reverse").value.trim();const m=v.match(/(?:^|:)(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))$/i);let valid=false,ms=NaN;if(m){ms=Date.parse(m[1]);const day=m[1].slice(0,10);const d=Date.parse(day+"T00:00:00Z");valid=Number.isFinite(ms)&&Number.isFinite(d)&&new Date(d).toISOString().slice(0,10)===day&&Number(m[1].slice(11,13))<24;}output("decoded",valid?pretty(ms,zone.value):"");$("reverse-status").textContent=v&&!valid?"Enter an ISO 8601 timestamp with Z or an explicit UTC offset.":"";}
function useNow(){const p=parts(Date.now(),zone.value);date.value=p.year+"-"+p.month+"-"+p.day;time.value=p.hour+":"+p.minute+":"+p.second;render();}
for(const el of [date,time,prefix,occurrence])el.addEventListener("input",render);
zone.addEventListener("change",()=>{try{localStorage.setItem("fisch-timestamp-zone",zone.value)}catch{}render()});
$("now").addEventListener("click",useNow);$("reverse").addEventListener("input",decode);
for(const b of document.querySelectorAll("[data-copy]"))b.addEventListener("click",async()=>{try{await navigator.clipboard.writeText($(b.dataset.copy).textContent);$("copy-status").textContent="Copied to clipboard."}catch{$("copy-status").textContent="Clipboard unavailable. Select and copy the displayed text manually."}});
useNow();

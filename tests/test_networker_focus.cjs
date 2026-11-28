'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../site/networker-core.js');
const graph = require('../site/network-graph.js');
const patterns = require('../site/username-patterns.js');
const focus = require('../site/networker-focus.js');

const CHECKED = '2026-11-24T10:20:30.000Z';
const evidence = () => [{observed_at:CHECKED, method:'roblox_website',
  source_url:'https://www.roblox.com/users/1/friends#!/friends'}];
const edge = (from,to) => ({from:String(from),to:String(to),kind:'friend',evidence:evidence()});
const person = (id, extra = {}) => ({id:String(id), username:'player' + id, ledger:true, latest_rank:null, ...extra});
const fixture = (nodes, edges, root = '1') => graph.buildBranches({
  network:{nodes:new Map(nodes.map(item => [item.id,item])),edges},
  core, focusId:root, includeConnectors:true
});

test('relationship analysis shows only observed ledger links and distinct shared external bridges', () => {
  const root = person(1), ledger2 = person(2), ledger3 = person(3);
  const bridge = person(4, {ledger:false,username:'SharedFriend'});
  const other = person(5, {ledger:false,username:'SomeExternal'});
  const model = fixture([root, ledger2, ledger3, bridge, other],
    [edge(1,2),edge(1,4),edge(4,2),edge(4,3),edge(1,5)]);
  const result = focus.insights(model,patterns,core);
  assert.deepEqual(result.ledger.map(x=>x.id),['2']);
  assert.deepEqual(result.connectors.map(x=>x.id),['4']);
  assert.deepEqual(result.external.map(x=>x.id),['5']);
  assert.deepEqual(new Set(result.paths.map(x=>x.to.id)),new Set(['2','3']));
  assert.equal(result.neighbors.length,3);
  assert.equal(result.unknownAvatars,3);
});

test('name and outfit flags remain separate from social edges and are never an ownership score', () => {
  const root = person(1, {username:'RareName_01'});
  const patterned = person(2, {username:'RareName_02',ledger:false});
  const unlinked = person(3,{username:'RareName_03',ledger:false});
  const model=fixture([root,patterned,unlinked],[edge(1,2)]);
  const fakePatterns={compare:()=>({available:true,tier:'strong',label:'Numbered variants',reasons:['Shared stem']})};
  const result=focus.insights(model,fakePatterns,core);
  assert.deepEqual(result.nameHints.map(x=>x.person.id),['2']);
  assert.equal(result.neighbors.some(x=>x.id==='3'),false);
  assert.equal('riskScore' in result,false);
});

test('search includes leaderboard history and connected external accounts using exact stable IDs', () => {
  const entries=[person('1',{username:'Alpha',latest_rank:1}),
    person('2',{username:'Historic',latest_rank:null}),
    person('3',{username:'Lunary810',ledger:false}),
    person('4',{username:'BloxHero',latest_rank:2})];
  const network={nodes:new Map(entries.map(item=>[item.id,item]))};
  assert.deepEqual(focus.matchingPeople(network,'',50).map(x=>x.id),['1','4']);
  assert.deepEqual(focus.matchingPeople(network,'lunary',50).map(x=>x.id),['3']);
  assert.equal(focus.resolveAccount(network,'@lunary810',core).id,'3');
  assert.equal(focus.resolveAccount(network,'0003',core).id,'3');
  assert.equal(focus.resolveAccount(network,'missing',core),null);
});

test('exact verified username overlay fills ID-only external accounts without rewriting evidence', () => {
  const saved = person('1',{username:'LedgerName',ledger:true});
  const missing = person('2',{username:'',display_name:'Friendly',ledger:false});
  const observed = person('3',{username:'RecordedHandle',ledger:false});
  const network=core.socialNetwork([saved],[missing,observed]);
  const snapshot={schema_version:1,source_url:'https://users.roblox.com/v1/users',
    users:{
      '2':{id:'2',username:'VerifiedUser2',display_name:'Friendly',
        observed_at:CHECKED,source_url:'https://users.roblox.com/v1/users'},
      '3':{id:'3',username:'ChangedHandle',display_name:'',
        observed_at:CHECKED,source_url:'https://users.roblox.com/v1/users'},
      '1':{id:'1',username:'SpoofLedger',display_name:'',
        observed_at:CHECKED,source_url:'https://users.roblox.com/v1/users'},
      '44':{id:'43',username:'WrongId',observed_at:CHECKED,
        source_url:'https://users.roblox.com/v1/users'}
    }};
  assert.equal(focus.applyVerifiedUsernames(network,snapshot,core),1);
  assert.equal(network.nodes.get('2').username,'VerifiedUser2');
  assert.equal(network.nodes.get('3').username,'RecordedHandle');
  assert.equal(network.nodes.get('1').username,'LedgerName');
  assert.equal(network.nodes.has('44'),false);
  assert.equal(focus.label(network.nodes.get('2')),'@VerifiedUser2');
  assert.equal(focus.resolveAccount(network,'VerifiedUser2',core).id,'2');
});

test('website profile observations label graph nodes by exact ID only', () => {
  const net=core.socialNetwork([person('1',{username:'Root'})],[
    {id:'2',username:'',ledger:false},{id:'3',username:'',ledger:false}]);
  const overlay={schema_version:1,source_url:'roblox_verified_profile_and_prior_api',users:{
    '2':{id:'2',username:'ProfileConfirmed',display_name:'NiceName',
      observed_at:CHECKED,source_url:'https://www.roblox.com/users/2/profile'},
    '3':{id:'3',username:'WrongProfile',observed_at:CHECKED,
      source_url:'https://www.roblox.com/users/2/profile'}
  }};
  assert.equal(focus.applyVerifiedUsernames(net,overlay,core),1);
  assert.equal(focus.label(net.nodes.get('2')),'@ProfileConfirmed');
  assert.equal(focus.label(net.nodes.get('3')),'ID 3');
  assert.equal(net.nodes.get('2').username_source_url,overlay.users['2'].source_url);
});

test('missing usernames use labeled display names, recorded aliases, then ID as last fallback', () => {
  assert.equal(focus.label({id:'2',username:'',display_name:'VisiblePlayer'}),'VisiblePlayer (display name)');
  assert.equal(focus.label({id:'3',username:'',aliases:['PriorExactName']}),
    '@PriorExactName (previously observed)');
  assert.equal(focus.label({id:'4',username:'',display_name:''}),'ID 4');
  const net=core.socialNetwork([person('1',{username:'Root'})],[
    {id:'2',username:'',display_name:'VisiblePlayer',ledger:false}]);
  assert.deepEqual(focus.matchingPeople(net,'visibleplayer',20).map(x=>x.id),['2']);
});

test('untrusted or malformed username overlay is ignored',()=>{
  const net=core.socialNetwork([person('1')],[{id:'2',username:'',ledger:false}]);
  const source='https://users.roblox.com/v1/users';
  const payload={schema_version:1,source_url:source,users:{
    '2':{id:'2',username:'<script>',source_url:source,observed_at:CHECKED}
  }};
  assert.equal(focus.applyVerifiedUsernames(net,payload,core),0);
  payload.users['2'].username='ValidName';
  payload.users['2'].source_url='https://evil.example/v1/users';
  assert.equal(focus.applyVerifiedUsernames(net,payload,core),0);
  payload.users['2'].source_url=source;
  payload.users['2'].observed_at='not-a-date';
  assert.equal(focus.applyVerifiedUsernames(net,payload,core),0);
  assert.equal(net.nodes.get('2').username,'');
});

test('page places relationship graph before compact signals and has no side-by-side comparison UI', () => {
  const html=fs.readFileSync(path.join(__dirname,'../site/networker.html'),'utf8');
  assert.match(html,/networker-focus\.js/);
  assert.match(html,/networker-focus\.css/);
  assert.ok(html.indexOf('id="nwf-graph"') < html.indexOf('id="nwf-pattern-flags"'));
  assert.ok(html.indexOf('id="nwf-graph"') < html.indexOf('id="nwf-friend-results"'));
  assert.doesNotMatch(html,/id="comparison-panel"|id="candidate-list"|FIND A COMPARISON|SIDE BY SIDE/);
  assert.match(html,/Include unverified external neighbors/);
});

class Element {
  constructor(tag='div') {
    this.tagName=tag;this.children=[];this.value='';this.hidden=false;this.disabled=false;
    this.attributes={};this.listeners={};this.className='';this.open=false;
    this.classList={toggle:()=>{}};
  }
  set textContent(value){this.children=[String(value)]}
  get textContent(){return this.children.map(x=>typeof x==='string'?x:x.textContent).join('')}
  append(...items){this.children.push(...items)}
  replaceChildren(...items){this.children=[];this.append(...items)}
  addEventListener(kind,fn){(this.listeners[kind] ||= []).push(fn)}
  setAttribute(k,v){this.attributes[k]=String(v)}
  scrollIntoView(){}
  replaceWith(){}
}
async function renderSnapshot(accounts, extra={}) {
  const elements=new Map();
  const document={
    getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id)},
    createElement(tag){return new Element(tag)}
  };
  const location={href:'https://example.test/networker.html',search:''};
  const calls=[];
  const simulatedGraph={buildBranches:graph.buildBranches,
    mount(_element,options){calls.push(options);options.onSelect(options.focusId);return {
      update(next){calls.push(next);next.onSelect(next.focusId)}
    }}};
  const browser={document,location,FischNetworker:core,FischNetworkGraph:simulatedGraph,
    FischUsernamePatterns:patterns,URL,URLSearchParams,Date,Intl,
    history:{replaceState(_s,_unused,url){location.href=String(url);location.search=new URL(url).search}},
    fetch:async()=>({ok:true,json:async()=>({schema_version:1,generated_at:CHECKED,
      accounts,network_nodes:[],historical_friend_edges:[],...extra})})};
  focus.start(browser);
  await new Promise(resolve=>setImmediate(resolve));
  return {elements,calls,location};
}

test('browser controller renders relationship counts and syncs root and inspected node without comparison panel',async()=>{
  const one=person(1,{username:'Main',latest_rank:1});
  const two=person(2,{username:'Another',latest_rank:2});
  const {elements,calls,location}=await renderSnapshot([one,two]);
  assert.equal(elements.get('networker-app').hidden,false,elements.get('network-status').textContent);
  assert.equal(calls.length,1);
  assert.equal(elements.get('nwf-root-label').textContent.includes('@Main'),true);
  assert.match(elements.get('nwf-inspected-label').textContent,/@Main/);
  assert.match(elements.get('nwf-network-counts').textContent,/Direct ledger accounts/);
  assert.match(elements.get('nwf-pattern-flags').textContent,/Username patterns/);
  assert.equal(elements.get('comparison-panel'),undefined);
  const list=elements.get('nwf-account-grid');
  assert.equal(list.children.length,2);
  list.children[1].listeners.click[0]();
  assert.equal(new URL(location.href).searchParams.get('target'),'2');
  assert.match(elements.get('nwf-root-label').textContent,/@Another/);
  assert.equal(calls.at(-1).focusId,'2');
});

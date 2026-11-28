"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const core = require("../site/networker-core.js");
const focus = require("../site/networker-focus.js");
const graph = require("../site/network-graph.js");

const person = (id, username, extra) => ({id: String(id), username, ledger: true, ...extra});
const row = (checkpoint, rank, username, key, status = "verified") => ({checkpoint, rank, username, key, status});
const checkpoint = (id, complete = true) => ({id, complete, day_key: "2026-11-27"});

test("latest verified ledger photo rows drive picker order and all graph badges independently of scan age", () => {
  const history = {status:"complete", items:[{id:"43", username:"OldSaved"}]};
  const saved = [
    person(42,"Ali",{latest_rank:27,friends:history}),
    person(43,"OldSaved",{latest_rank:45}),
    person(44,"PhotoName",{latest_rank:49}),
    person(45,"WrongPerson",{latest_rank:50, ledger:false}),
  ];
  const ledger = {
    checkpoints: [checkpoint("old"),checkpoint("new")],
    observations: [
      row("old",27,"Ali","id:42"), row("old", 29,"OldSaved","id:43"),
      row("new",47,"PHOTONAME","name:photoname"),
      row("new",3,"Holladayyyyyyy","name:holladayyyyyyy"),
      row("new",25,"Ali","id:42"), row("new",26,"WrongPerson","name:wrongperson"),
      row("new",41,"NewExact","id:46"),
    ],
  };
  const result = focus.ledgerRankProjection(saved,ledger,core);
  assert.deepEqual(result.roster.map(({id,latest_rank})=>[id,latest_rank]),[
    [null,3],["42",25],[null,26],["46",41],["44",47]
  ]);
  const network = core.socialNetwork(result.accounts);
  assert.equal(network.nodes.get("43").latest_rank,null);
  assert.equal(network.nodes.get("43").ledger,true);
  assert.equal(network.nodes.get("46").ledger,true);
  assert.equal(network.nodes.get("46").friends,undefined);
  assert.equal(network.nodes.get("42").friends,history);
  assert.equal(saved[0].latest_rank,27);
  const view = graph.buildBranches({network,accounts:result.accounts,focusId:"43",core});
  assert.match(view.eligibility.get("42").label,/#25/);
});

test("latest partial checkpoint suppresses unverified ranks and does not backfill from previous ranks", () => {
  const saved = [person(1,"First",{latest_rank:1}), person(2,"Second",{latest_rank:2})];
  const ledger = {checkpoints:[checkpoint("old"),checkpoint("new",false)],observations:[
    row("old",1,"First","id:1"),row("old",2,"Second","id:2"),
    row("new",1,"Second","id:2","extracted"),row("new",3,"First","id:1"),
  ]};
  const result = focus.ledgerRankProjection(saved,ledger,core);
  assert.equal(result.checkpoint.id,"new");
  assert.deepEqual(result.roster,[{id:"1",username:"First",latest_rank:3}]);
  assert.equal(result.accounts.find(account=>account.id==="2").latest_rank,null);
});

test("unavailable main ledger retains historical eligibility but displays no current ranks", () => {
  const saved = [person(1,"Saved",{latest_rank:1})];
  const result = focus.ledgerRankProjection(saved,null,core);
  assert.equal(result.checkpoint,null);
  assert.deepEqual(result.roster,[]);
  assert.deepEqual(result.accounts,[person(1,"Saved",{latest_rank:null})]);
});

test("checked-in dashboard and Networker use identical verified rank slots and roster from the latest photo", () => {
  const ledger = require("../site/data.json"), snapshot = require("../site/network-data.json");
  const latest = ledger.checkpoints.at(-1);
  const dashboardRows = ledger.observations.filter(row=>row.checkpoint===latest.id && row.status==="verified").sort((a,b)=>a.rank-b.rank);
  const result = focus.ledgerRankProjection(snapshot.accounts,ledger,core);
  assert.deepEqual(result.roster.map(row=>[row.latest_rank,row.username]),dashboardRows.map(row=>[row.rank,row.username]));
  const ali = result.roster.find(row=>row.username.toLowerCase()==="zerealali");
  if (latest.id === "2026-11-27_2057") {
    assert.equal(ali.latest_rank,25);
    assert.equal(ali.id,"3510772801");
    assert.equal(result.roster.find(row=>row.username.toLowerCase()==="yippz_gg").id,"1115956720");
    assert.equal(result.roster.find(row=>row.username.toLowerCase()==="holladayyyyyyy").id,null);
  }
});

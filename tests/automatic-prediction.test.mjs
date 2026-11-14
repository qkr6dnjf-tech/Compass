import test from 'node:test';
import assert from 'node:assert/strict';
import models from '../data/public-models.json' with {type:'json'};
import history from '../data/rank-history.json' with {type:'json'};
import {publicNotices} from '../lib/public-data.mjs';
import {automaticPrediction} from '../lib/automatic-prediction.mjs';
import {predict} from '../lib/model.mjs';
import {makeSimulation,summarize} from '../lib/records.mjs';

const newest=publicNotices.filter(n=>n.result).sort((a,b)=>b.predictionAt.localeCompare(a.predictionAt))[0];

test('one automatic model recommendation agrees with the highest-scored legacy candidate',()=>{
  const result=automaticPrediction(models,publicNotices,newest,newest.predictionAt,{rankHistory:history});
  assert.equal(result.automatic,true);assert.equal(result.recommendationMethod,'model');assert.equal(result.candidates.length,1);
  const model=models.find(m=>m.version===result.modelVersion);
  const manual=predict(model,publicNotices,newest,result.condition.assumedPriceRank,newest.predictionAt);
  assert.deepEqual(result.candidates,[manual.candidates[0]]);
  assert(result.automaticDecision.historyIds.every(id=>id!==newest.id));
});

test('changing the selected notice result and future prices cannot change its recommendation',()=>{
  const baseline=automaticPrediction(models,publicNotices,newest,newest.predictionAt,{rankHistory:history});
  const changed=structuredClone(publicNotices);
  for(const n of changed.filter(n=>n.predictionAt>=newest.predictionAt))if(n.result){n.result.expectedPriceWon=1;n.result.prices.forEach(p=>p.amountWon=1);}
  const target=changed.find(n=>n.id===newest.id);
  const actual=automaticPrediction(models,changed,target,newest.predictionAt,{rankHistory:history});
  assert.deepEqual(actual,baseline);
});

test('without an eligible model use past selected-price averages; exclude target and seven-day embargo',()=>{
  const n=publicNotices.filter(n=>n.region==='전주'&&n.predictionAt<'2026-01-01').at(-1);
  assert(n);
  const result=automaticPrediction([],publicNotices,n,n.predictionAt,{rankHistory:history});
  assert.equal(result.recommendationMethod,'historical-mean');assert.equal(result.condition.assumedPriceRank,null);
  assert.equal(result.candidates.length,1);
  const rows=history.filter(r=>result.automaticDecision.historyIds.includes(r.id));
  assert(rows.length>=20);assert.equal(rows.length,result.trainingCount);
  for(const row of rows){assert.notEqual(row.id,n.id);assert(Date.parse(row.opened.replace(' ','T')+'+09:00')+7*86400000<Date.parse(n.predictionAt));}
  const expected=rows.reduce((s,row)=>s+row.prices.filter(p=>p[2]===1).reduce((sum,p)=>sum+p[0],0)/4/row.base*100,0)/rows.length;
  assert.equal(result.candidates[0].rate,expected.toFixed(5));
  const changed=history.map(r=>result.automaticDecision.historyIds.includes(r.id)?r:{...r,prices:r.prices.map(p=>[p[0]*.99,...p.slice(1)])});
  assert.deepEqual(automaticPrediction([],publicNotices,n,n.predictionAt,{rankHistory:changed}),result);
  assert.throws(()=>automaticPrediction([],publicNotices,n,n.predictionAt,{rankHistory:[]}),e=>e.code==='INSUFFICIENT_AUTO_HISTORY');
});

test('single statistical recommendation saves and evaluates without falsely counting a missed number',()=>{
  const output=automaticPrediction([],publicNotices,newest,newest.predictionAt,{rankHistory:history});
  const prediction={...output,id:'automatic-test',userId:'test',mode:'practice',createdAt:'2026-11-14T00:00:00Z',notice:{...newest,result:null}};
  const saved=makeSimulation({prediction,candidateId:output.candidates[0].id,now:prediction.createdAt,userId:'test'});
  assert(saved.automatic);assert.equal(saved.recommendationMethod,'historical-mean');assert.equal(saved.candidates.length,1);
  const report=summarize([saved],publicNotices,{mode:'practice'});
  assert.equal(report.savedCount,1);assert.equal(report.completedCount,1);assert.equal(report.numberHitRate,null);
});

test('corrupted model errors are reported rather than silently using a statistical fallback',()=>{
  const bad=structuredClone(models);bad.forEach(m=>m.model.type='corrupt');
  assert.throws(()=>automaticPrediction(bad,publicNotices,newest,newest.predictionAt,{rankHistory:history}),e=>e.code==='MODEL_CORRUPT');
});

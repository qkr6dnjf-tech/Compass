import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {trainingPlan,trainModels,predict} from '../lib/model.mjs';
import {fixtureNotices} from './fixtures.mjs';
const ns=fixtureNotices(260),now='2026-11-05T00:00:00Z';
test('30/60/200 train exactly the selected count with identical holdouts',()=>{
 const models=[30,60,200].map(trainingCount=>trainModels(ns,{trainingCount,allowTest:true,now,version:`test-window-${trainingCount}`}));
 for(let i=0;i<models.length;i++){const m=models[i],count=[30,60,200][i];assert.equal(m.report.trainCount,count);assert.equal(m.trainingConfig.trainingCount,count);assert.equal(m.report.trainingNoticeIds.length,count);assert.equal(m.report.tuningCount,10);assert.equal(m.report.testCount,10);assert(m.trainingCutoff<m.report.period.selectionFrom);assert(m.selectionCutoff<m.report.period.testFrom);assert(!m.report.trainingNoticeIds.some(id=>m.report.validationIds.includes(id)));}
 assert.deepEqual(models[0].report.validationIds,models[1].report.validationIds);assert.deepEqual(models[1].report.validationIds,models[2].report.validationIds);
 assert.deepEqual(models[0].report.trainingNoticeIds,models[2].report.trainingNoticeIds.slice(-30));
 assert.deepEqual(models[1].report.trainingNoticeIds,models[2].report.trainingNoticeIds.slice(-60));
 const target=ns.at(-1),forecast=predict(models[1],ns,target,2,target.predictionAt,{allowTest:true});assert.equal(forecast.trainingCount,60);assert.equal(forecast.modelVersion,'test-window-60');
 mkdirSync('outputs',{recursive:true});writeFileSync('outputs/training-window-checks.json',JSON.stringify({syntheticOnly:true,passed:true,windows:models.map(m=>({trainingCount:m.report.trainCount,selectionCount:m.report.tuningCount,validationCount:m.report.testCount,trainingIds:m.report.trainingNoticeIds,validationIds:m.report.validationIds,period:m.report.period})),sameHoldouts:true},null,2));
});
test('custom counts, invalid counts and insufficient data never silently substitute',()=>{
 const p=trainingPlan(ns,{trainingCount:45,allowTest:true,now});assert(p.ready);assert.equal(p.trainingCount,45);
 for(const count of [0,19,401,30.5,'30',NaN])assert.throws(()=>trainingPlan(ns,{trainingCount:count,allowTest:true,now}),/20~400/);
 const few=fixtureNotices(60),plan=trainingPlan(few,{trainingCount:200,allowTest:true,now});assert(!plan.ready);assert.equal(plan.requestedTrainingCount,200);assert(plan.trainingCount<200);assert.throws(()=>trainModels(few,{trainingCount:200,allowTest:true,now}),/학습 200건/);
});
test('late published labels cannot leak across training/selection/test boundaries',()=>{
 const edited=structuredClone(ns);edited[239].result.publishedAt=ns[250].predictionAt;
 const model=trainModels(edited,{trainingCount:30,allowTest:true,now});assert(!model.report.trainingNoticeIds.includes(ns[239].id));assert(model.trainingCutoff<model.report.period.selectionFrom);assert(model.selectionCutoff<model.report.period.testFrom);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureNotices} from './fixtures.mjs';
import {availableNotices,RESEARCH_POLICY,OBSERVED_POLICY} from '../lib/availability.mjs';
import {trainModels,trainingPlan,predict} from '../lib/model.mjs';
const now='2026-11-05T09:00:00.000Z';
const notices=fixtureNotices(130).map(n=>({...n,result:{...n.result,publishedAt:now,firstObservedAt:now,publicationTimeBasis:'first-observed',officialPublishedAt:null,actualOpenedAt:n.openingAt}}));
const after='2026-11-05T09:01:00.000Z';
test('research availability uses actual opening plus seven days without rewriting evidence',()=>{
 const before=JSON.stringify(notices),transformed=availableNotices(notices,RESEARCH_POLICY);
 assert.equal(transformed[0].result.publishedAt,new Date(Date.parse(notices[0].openingAt)+7*86400000).toISOString());
 assert.equal(transformed[0].result.firstObservedAt,now);assert.equal(transformed[0].result.officialPublishedAt,null);
 assert.equal(JSON.stringify(notices),before);assert.strictEqual(availableNotices(notices,OBSERVED_POLICY),notices);
 const noActual={...notices[0],result:{...notices[0].result,actualOpenedAt:null}};assert.equal(availableNotices([noActual],RESEARCH_POLICY)[0].result.publishedAt,now);
});
test('strict and research training stay distinct and inference uses saved policy',()=>{
 const strict=trainingPlan(notices,{trainingCount:30,now:after,allowTest:true});assert(!strict.ready);assert.equal(strict.totalEligible,0);
 const model=trainModels(notices,{trainingCount:30,now:after,allowTest:true,availabilityPolicy:RESEARCH_POLICY});assert.equal(model.report.trainCount,30);assert(model.researchOnly);assert.equal(model.availability.policy,RESEARCH_POLICY);
 const target=notices.at(-1),prediction=predict(model,notices,target,2,target.predictionAt,{allowTest:true});assert(prediction.researchOnly);assert.equal(prediction.availability.policy,RESEARCH_POLICY);assert.equal(prediction.candidates.length,2);
 assert(prediction.candidates.every(c=>c.sourcePublishedAt<target.predictionAt&&c.sourceNoticeId!==target.id));
});
test('unknown policy rejected and observed earlier than assumed remains available',()=>{
 assert.throws(()=>availableNotices(notices,'unknown'));
 const n=structuredClone(notices[0]);n.result.publishedAt=new Date(Date.parse(n.openingAt)+3600000).toISOString();assert.equal(availableNotices([n],RESEARCH_POLICY)[0].result.publishedAt,n.result.publishedAt);
});

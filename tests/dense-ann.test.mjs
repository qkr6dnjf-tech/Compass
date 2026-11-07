import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {trainDenseANN,scoreDenseANN,validDenseANN} from '../lib/dense-ann.mjs';
import {parameterCount} from '../lib/ann-config.mjs';
import {trainModels,trainModelStep,validateModel,scoreModel,predict} from '../lib/model.mjs';
import {fixtureNotices} from './fixtures.mjs';

test('both deeper networks learn a nonlinear XOR target and survive JSON round-trip', () => {
  const rows = [[-1,-1,0],[-1,1,1],[1,-1,1],[1,1,0]].map(([a,b,y])=>({x:[a,b,...Array(11).fill(0)],y}));
  const scaler = Array.from({length:13},()=>({mean:0,std:1}));
  for (const hidden of [[32,16],[32,16,8]]) {
    const m = trainDenseANN(rows,scaler,hidden);
    assert(validDenseANN(m,13));assert.equal(m.layers.length,hidden.length+1);
    assert.equal(m.layers.reduce((n,l)=>n+l.weights.length+l.biases.length,0),parameterCount(hidden));
    const scores = rows.map(r=>scoreDenseANN(m,r.x));
    assert(scores[1]>scores[0]&&scores[2]>scores[3],JSON.stringify({hidden,scores}));
    assert(scores[1]>scores[3]&&scores[2]>scores[0],JSON.stringify({hidden,scores}));
    const restored=JSON.parse(JSON.stringify(m));
    assert.deepEqual(rows.map(r=>scoreDenseANN(restored,r.x)),scores);
    assert.deepEqual(trainDenseANN(rows,scaler,hidden),m,'Training is deterministic');
    let resumed=null;
    for(let epoch=0;epoch<60;epoch+=5)resumed=JSON.parse(JSON.stringify(trainDenseANN(rows,scaler,hidden,{resume:resumed,epochs:5})));
    assert.deepEqual(resumed,m,'Resumed training preserves every full-batch update exactly');
    const damaged=structuredClone(m);damaged.layers[1].weights.pop();assert(!validDenseANN(damaged,13));
  }
});

test('training checkpoints produce exactly the same final weights and validation as one request', () => {
  const notices=fixtureNotices(70),options={trainingCount:30,annHiddenLayers:[32,16,8],allowTest:true,now:'2026-11-05T00:00:00Z',version:'checkpoint-test'};
  const expected=trainModels(notices,options);let resume=null,actual=null;
  for(let i=0;i<12;i++){const next=trainModelStep(notices,options,resume);resume=JSON.parse(JSON.stringify(next.ann));actual=next.artifact;}
  assert.deepEqual(actual,expected);validateModel(actual);
});

test('legacy one-hidden-layer weights retain exactly the original inference', () => {
  const artifact=JSON.parse(readFileSync('data/public-models.json','utf8')).find(m=>m.model.w1);
  assert(artifact);validateModel(artifact);
  const m=artifact.model,x=Array.from({length:13},(_,i)=>i/10);
  const normalized=x.map((v,i)=>Math.max(-8,Math.min(8,(v-m.scaler[i].mean)/m.scaler[i].std)));
  const hidden=m.w1.map((w,i)=>Math.tanh(w.reduce((sum,v,j)=>sum+v*normalized[j],m.b1[i])));
  const logit=hidden.reduce((sum,v,i)=>sum+v*m.w2[i],m.b2);
  assert.equal(scoreModel(m,x),1/(1+Math.exp(-Math.max(-30,Math.min(30,logit)))));
});

test('architecture changes preserve fixed data splits, metadata and prediction compatibility', () => {
  const notices=fixtureNotices(100),now='2026-11-05T00:00:00Z';
  const models=[[8],[32,16],[32,16,8]].map(annHiddenLayers=>trainModels(notices,{trainingCount:30,annHiddenLayers,allowTest:true,now}));
  for(let i=0;i<models.length;i++){
    const m=models[i];assert.deepEqual(m.trainingConfig.annHiddenLayers,[[8],[32,16],[32,16,8]][i]);
    assert.equal(m.trainingConfig.annEpochs,60);assert.deepEqual(m.report.trainingNoticeIds,models[0].report.trainingNoticeIds);assert.deepEqual(m.report.validationIds,models[0].report.validationIds);
    const restored=JSON.parse(JSON.stringify(m));validateModel(restored);
    const target=notices.at(-1),p=predict(restored,notices,target,2,target.predictionAt,{allowTest:true});
    assert.deepEqual(p.trainingConfig.annHiddenLayers,m.trainingConfig.annHiddenLayers);assert.equal(p.candidates.length,2);
    if(m.model.type==='ann'){const damaged=structuredClone(m);damaged.trainingConfig.annHiddenLayers=[99];assert.throws(()=>validateModel(damaged),{code:'MODEL_CORRUPT'});}
  }
  for(const annHiddenLayers of [[],[64,64,64,64],[32,8],[32,'16'],null])assert.throws(()=>trainModels(notices,{annHiddenLayers}),{code:'INVALID_ANN_ARCHITECTURE'});
});

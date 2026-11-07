import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {publicNotices} from '../lib/public-data.mjs';
import {trainModels,validateModel} from '../lib/model.mjs';
import {RESEARCH_POLICY} from '../lib/availability.mjs';
import {hiddenLayersFor,parameterCount} from '../lib/ann-config.mjs';

const now=new Date().toISOString(),fingerprint=createHash('sha256').update(readFileSync('data/public-notices.json')).digest('hex');
const previous=JSON.parse(readFileSync('data/public-models.json','utf8')),added=[];
const baselines=previous.filter(m=>m.model.type==='ann'&&m.model.w1);
assert.equal(baselines.length,3,'Preserve all three original model versions');
for(const trainingCount of [30,60,200])for(const annHiddenLayers of [[32,16],[32,16,8]]){
  const start=performance.now();
  const artifact=trainModels(publicNotices,{trainingCount,annHiddenLayers,now,availabilityPolicy:RESEARCH_POLICY,previousValidationIds:[...previous,...added].flatMap(m=>m.report.validationIds),version:`g2b-n${trainingCount}-ann${annHiddenLayers.join('-')}-${fingerprint.slice(0,8)}-${now.replace(/\D/g,'')}`});
  artifact.datasetFingerprint=fingerprint;
  const baseline=baselines.find(m=>m.report.trainCount===trainingCount);
  assert.deepEqual(artifact.report.trainingNoticeIds,baseline.report.trainingNoticeIds);
  assert.deepEqual(artifact.report.validationIds,baseline.report.validationIds);
  validateModel(artifact);added.push(artifact);
  console.log(JSON.stringify({trainingCount,annHiddenLayers,seconds:(performance.now()-start)/1000,algorithm:artifact.model.type,annResult:artifact.report.comparisons.find(c=>c.name==='ANN')}));
}
writeFileSync('data/public-models.json',JSON.stringify([...previous,...added]));
mkdirSync('outputs',{recursive:true});
writeFileSync('outputs/ann-architecture-comparison.json',JSON.stringify({createdAt:now,datasetFingerprint:fingerprint,realData:true,sameTrainingAndHoldouts:true,selectionUsesTuningOnly:true,models:[...baselines,...added].map(m=>({version:m.version,trainingCount:m.report.trainCount,annHiddenLayers:hiddenLayersFor(m),parameters:parameterCount(hiddenLayersFor(m)),algorithm:m.model.type,availability:m.availability,report:m.report}))},null,2));

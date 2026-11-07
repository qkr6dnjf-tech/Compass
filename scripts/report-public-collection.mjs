import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {publicNotices,publicCollection,publicModelStatus} from '../lib/public-data.mjs';
import {predict,validateModel} from '../lib/model.mjs';
import {ANN_PRESETS,hiddenLayersFor} from '../lib/ann-config.mjs';
const folders=['outputs/public-probe/batch-20261105','outputs/public-probe/batch-20251106-20260505'];
const periods=[],companies=new Set();let rawResults=0,rawBidders=0;
for(const folder of folders){
 const summary=JSON.parse(readFileSync(folder+'/summary.json','utf8'));
 periods.push({period:folder.split('/').at(-1),catalog:summary.catalogCount,processed:summary.processed,pending:summary.pending,statusCounts:summary.statusCounts,results:summary.resultCount,verified:summary.completeResultCount,bidderRows:summary.bidderRows,openingStatus:summary.openingNotAvailableByNoticeStatus||null});
 for(const file of readdirSync(folder+'/normalized').filter(x=>x.endsWith('.json'))){const n=JSON.parse(readFileSync(folder+'/normalized/'+file,'utf8'));rawResults++;rawBidders+=n.bidders.length;for(const b of n.bidders)companies.add(b.companyId);}
}
const models=JSON.parse(readFileSync('data/public-models.json','utf8')),modelChecks=[];
for(const model of models){
 validateModel(model);if(model.testOnly)throw new Error('A synthetic model reached the public artifact set');
 if(model.report.trainCount!==model.trainingConfig.trainingCount||model.report.trainingNoticeIds.length!==model.report.trainCount)throw new Error('Training count mismatch');
 const target=publicNotices.filter(n=>n.result&&n.price.conditionsReviewed&&n.predictionAt>model.trainingCutoff&&n.predictionAt>model.selectionCutoff).sort((a,b)=>b.predictionAt.localeCompare(a.predictionAt))[0];
 const prediction=predict(model,publicNotices,target,2,target.predictionAt);
 if(prediction.candidates.length!==2||prediction.candidates.some(c=>!c.combination.includes(2)))throw new Error('Published model inference validation failed');
 const comparison=model.report.comparisons.find(c=>c.name===(model.model.type==='ann'?'ANN':'부스팅'));
 modelChecks.push({version:model.version,trainingCount:model.report.trainCount,annHiddenLayers:hiddenLayersFor(model),algorithm:model.model.type,testCount:model.report.testCount,selectedFirstRate:comparison.selectedFirstRate,anyCandidateFirstRate:comparison.anyCandidateFirstRate,belowRate:comparison.belowRate,validationReusedCount:model.report.validationReusedCount,inferenceNotice:target.id,candidates:prediction.candidates.map(c=>({rate:c.rate,amountWon:c.amountWon}))});
}
for(const preset of ANN_PRESETS){const counts=[...new Set(modelChecks.filter(m=>m.annHiddenLayers.join('-')===preset.id).map(m=>m.trainingCount))].sort((a,b)=>a-b);if(JSON.stringify(counts)!=='[30,60,200]')throw new Error('Each ANN architecture requires 30/60/200 trained models');}
if(periods.some(p=>p.pending!==0))throw new Error('Collection is not finished');
const report={createdAt:new Date().toISOString(),period:'2025-11-06 ~ 2026-11-05',catalogCount:periods.reduce((s,p)=>s+p.catalog,0),rawResults,rawBidders,uniqueCompanies:companies.size,siteNotices:publicNotices.length,siteResults:publicCollection.resultCount,siteBidderRows:publicCollection.participantRows,regionCounts:publicCollection.regionCounts,normalizationExclusions:publicCollection.excluded,periods,models:modelChecks,storedModels:publicModelStatus};
writeFileSync('outputs/final-collection-summary.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,normalizationExclusions:report.normalizationExclusions.length,periods:report.periods.map(p=>({period:p.period,processed:p.processed,results:p.results,statusCounts:p.statusCounts})),models:report.models.map(m=>({trainingCount:m.trainingCount,algorithm:m.algorithm,selectedFirstRate:m.selectedFirstRate,testCount:m.testCount})),storedModels:undefined}));

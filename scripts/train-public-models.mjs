import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {publicNotices} from '../lib/public-data.mjs';
import {trainModels,trainingPlan} from '../lib/model.mjs';
import {RESEARCH_POLICY} from '../lib/availability.mjs';
const now=new Date().toISOString(),fingerprint=createHash('sha256').update(readFileSync('data/public-notices.json')).digest('hex'),models=[],plans=[];
const previous=JSON.parse(readFileSync('data/public-models.json','utf8'));
const counts=process.argv.slice(2).length?process.argv.slice(2).map(Number):[30,60,200];
for(const trainingCount of counts){
 const plan=trainingPlan(publicNotices,{trainingCount,now,availabilityPolicy:RESEARCH_POLICY});
 plans.push({...plan,excluded:plan.excluded.reduce((a,v)=>(a[v.code]=(a[v.code]||0)+1,a),{})});
 if(!plan.ready){console.log(JSON.stringify({trainingCount,ready:false,reason:plan.reason}));continue;}
 const model=trainModels(publicNotices,{trainingCount,annHiddenLayers:[8],now,availabilityPolicy:RESEARCH_POLICY,previousValidationIds:[...previous,...models].flatMap(m=>m.report.validationIds),version:`g2b-n${trainingCount}-${fingerprint.slice(0,8)}-research`});
 model.datasetFingerprint=fingerprint;models.push(model);
 console.log(JSON.stringify({trainingCount,version:model.version,algorithm:model.model.type,validationCount:model.report.testCount,comparisons:model.report.comparisons}));
}
writeFileSync('data/public-models.json',JSON.stringify(models));mkdirSync('outputs',{recursive:true});writeFileSync('outputs/real-training-report.json',JSON.stringify({createdAt:now,datasetFingerprint:fingerprint,realData:true,models:models.map(m=>({version:m.version,availability:m.availability,report:m.report})),plans},null,2));

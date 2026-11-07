import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {validateNotice,SCHEMA_VERSION} from '../lib/domain.mjs';
import {trainModels} from '../lib/model.mjs';
const [input,output='models',...flags]=process.argv.slice(2);
if(!input){console.error('Usage: node scripts/train-model.mjs dataset.json [output-directory] [--count 30] [--availability observed|opening-plus-7d] [--hidden 32,16] [--test-only]');process.exit(2);}
try{
 const dataset=JSON.parse(readFileSync(resolve(input),'utf8'));
 if(dataset.schemaVersion!==SCHEMA_VERSION||!Array.isArray(dataset.notices))throw new Error('Unsupported dataset schema');
 const accepted=[],excluded=[];
 for(const raw of dataset.notices){try{accepted.push(validateNotice(raw));}catch(e){excluded.push({number:raw.number,code:e.code,reason:e.message});}}
 if(new Set(accepted.map(n=>n.id)).size!==accepted.length)throw new Error('Duplicate notice/round/rebid. Export the latest canonical revision before training.');
 const allowTest=flags.includes('--test-only');const countIndex=flags.indexOf('--count'),trainingCount=countIndex>=0?Number(flags[countIndex+1]):30;
 if(allowTest&&!accepted.every(n=>n.source.type==='test-only'))throw new Error('Test mode requires clearly marked synthetic fixtures.');
 const policyIndex=flags.indexOf('--availability'),availabilityPolicy=policyIndex>=0?flags[policyIndex+1]:'observed';
 const hiddenIndex=flags.indexOf('--hidden'),annHiddenLayers=hiddenIndex>=0?flags[hiddenIndex+1]?.split(',').map(Number):undefined;
 const model=trainModels(accepted,{allowTest,trainingCount,availabilityPolicy,annHiddenLayers});
 model.datasetFingerprint=createHash('sha256').update(JSON.stringify(accepted)).digest('hex');
 model.report.inputExclusions=excluded;mkdirSync(resolve(output),{recursive:true});
 const path=join(resolve(output),model.version+'.json');writeFileSync(path,JSON.stringify(model,null,2));
 console.log(JSON.stringify({path,version:model.version,testOnly:model.testOnly,trainingCutoff:model.trainingCutoff,report:model.report},null,2));
}catch(e){console.error(JSON.stringify({code:e.code||'TRAINING_FAILED',message:e.message}));process.exit(1);}

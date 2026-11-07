import {hiddenLayersFor} from './ann-config.mjs';
import seedModels from '../data/public-models.json' with {type:'json'};
import currentNotice from '../data/current-notice.json' with {type:'json'};
import dataset from '../data/public-notices.json' with {type:'json'};
import {referenceNotice} from './reference.mjs';
import {validateNotice} from './domain.mjs';
const byId=new Map();
for(const raw of [referenceNotice,currentNotice,...dataset.notices]){const n=validateNotice(raw);byId.set(n.id,n);}
export const publicNotices=[...byId.values()];
export const publicCollection={...dataset.collection,noticeCount:publicNotices.length,resultCount:publicNotices.filter(n=>n.result).length,participantRows:publicNotices.reduce((s,n)=>s+(n.result?.participants.length||0),0),regionCounts:Object.fromEntries(['전북','전주','군산','익산'].map(region=>[region,publicNotices.filter(n=>n.region===region&&n.result).length]))};

export const publicModelStatus=seedModels.map(m=>({version:m.version,trainingCount:m.report.trainCount,algorithm:m.model.type,annHiddenLayers:hiddenLayersFor(m),researchOnly:!!m.researchOnly,testOnly:!!m.testOnly}));

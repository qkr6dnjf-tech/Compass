import {mergedRankHistory,rankStatistics,rankCSV} from '../../../lib/rank-history.mjs';
import {sharedNotices,dailyStatus,collectionInfo,updateDaily} from '../../../lib/daily-update';
import {availableNotices,availabilityInfo,RESEARCH_POLICY} from '../../../lib/availability.mjs';
import {publicCollection,publicNotices,publicModelStatus} from '../../../lib/public-data.mjs';
import { env } from 'cloudflare:workers';
import { DEFAULT_ANN_LAYERS,supportedArchitecture } from '../../../lib/ann-config.mjs';
import { getChatGPTUser } from '../../chatgpt-auth';
import { requestIdentity,checkWriteOrigin } from '../../../lib/browser-identity.mjs';
import { database,list,get,put,statement,notices,modelVersions,auditEvent,audits } from '../../../lib/repository';
import { DomainError,need,REGIONS,SCHEMA_VERSION,validateNotice,analysis,evaluateAmount,repeatPatterns,rankedPrices,historyBefore } from '../../../lib/domain.mjs';
import { trainModels,trainModelStep,trainingPlan,predict,validateModel } from '../../../lib/model.mjs';
import { makeSimulation,summarize } from '../../../lib/records.mjs';
export const dynamic='force-dynamic';
async function hash(value:any){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');}
async function handler(req:Request,params:Promise<{action:string}>){
 let sessionCookie:string|null=null;
 const reply=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff',...(sessionCookie?{'Set-Cookie':sessionCookie}:{})}});
 try{
  const {action}=await params;
  if(req.method==='GET'&&(action==='rank-statistics'||action==='rank-csv')){
   const rows=mergedRankHistory(await list('official:g2b-daily','official-update'));
   if(action==='rank-statistics')return reply(rankStatistics(rows));
   return new Response(rankCSV(rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="rank-history.csv"','Cache-Control':'no-store'}});
  }
  if(action==='daily-update'&&req.method==='POST')return reply(await updateDaily(req));
  if(action==='daily-status'&&req.method==='GET')return reply(await dailyStatus());
  if(action==='health'&&req.method==='GET'){await database().prepare('SELECT 1 AS ready').first();const info=collectionInfo(await sharedNotices(),await dailyStatus());return reply({status:'ok',storage:'D1',schemaVersion:SCHEMA_VERSION,publicData:{noticeCount:info.noticeCount,resultCount:info.resultCount,participantRows:info.participantRows},models:publicModelStatus,at:new Date().toISOString()});}
  checkWriteOrigin(req);
  const user=await requestIdentity(req,await getChatGPTUser());sessionCookie=user.setCookie;const owner=user.userId,now=new Date().toISOString(),url=new URL(req.url);const testMode=env.BID_COMPASS_TEST_MODE==='local-fixtures'&&['127.0.0.1','localhost'].includes(url.hostname);
  if(req.method==='POST'){
   need((req.headers.get('content-type')||'').startsWith('application/json'),'INVALID_CONTENT','JSON 요청이 필요합니다.');
  }
  const body=req.method==='POST'?await req.text():'';need(body.length<=3000000,'REQUEST_TOO_LARGE','한 번에 3MB 이하로 등록하세요.');let input:any={};if(body){try{input=JSON.parse(body);}catch{throw new DomainError('INVALID_JSON','JSON 형식이 올바르지 않습니다.');}}
  if(action==='bootstrap'&&req.method==='GET'){
   const [ns,models,records]=await Promise.all([notices(owner),modelVersions(owner),list(owner,'simulation')]);return reply({testMode,user:{name:user.displayName,isGuest:user.isGuest},now,notices:ns.map(n=>({...n,result:n.result?{publishedAt:n.result.publishedAt,participantsComplete:n.result.participantsComplete}:null})),models:models.map(m=>({version:m.version,trainingCutoff:m.trainingCutoff,selectionCutoff:m.selectionCutoff,createdAt:m.createdAt,testOnly:m.testOnly,researchOnly:!!m.researchOnly,availability:m.availability||null,trainingConfig:m.trainingConfig||null,report:m.report})),records,metrics:{live:summarize(records,ns,{mode:'live'}),practice:summarize(records,ns,{mode:'practice'})},data:{collection:collectionInfo(await sharedNotices(),await dailyStatus()),noticeCount:ns.length,resultCount:ns.filter(n=>n.result).length,officialCount:ns.filter(n=>n.source.type==='official').length},api:{status:'official-daily',message:'나라장터 공개 자료 동기화'}});
  }
  if(action==='analysis'&&req.method==='GET'){const ns=await notices(owner),n=ns.find(n=>n.id===url.searchParams.get('noticeId'));need(n,'NOTICE_NOT_FOUND','공고를 선택하세요.');const mode=url.searchParams.get('mode');need(['live','practice'].includes(mode||''),'INVALID_MODE','모드를 확인하세요.');const asOf=mode==='practice'?n.predictionAt:now;const models=(await modelVersions(owner)).filter(m=>m.trainingCutoff<asOf&&m.selectionCutoff<asOf).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||(b.report.trainCount-a.report.trainCount)),version=url.searchParams.get('modelVersion'),model=version?models.find(m=>m.version===version):models[0],policy=model?.availability?.policy||RESEARCH_POLICY;return reply({...analysis(availableNotices(ns,policy),n.region,asOf),availability:availabilityInfo(policy)});}
  if(action==='predict'&&req.method==='POST'){
   need(REGIONS.includes(input.region),'INVALID_REGION','지역을 선택하세요.');need(['live','practice'].includes(input.mode),'INVALID_MODE','실전·과거 연습 모드를 선택하세요.');
   const ns=await notices(owner),n=ns.find(n=>n.id===input.noticeId);need(n,'NOTICE_NOT_FOUND','등록된 공고를 선택하세요.');need(n.region===input.region,'REGION_MISMATCH','공고의 참가제한 지역과 입력 지역이 다릅니다.');need(testMode||n.source.type!=='test-only','TEST_DATA','시험자료로 실제 예측을 제공하지 않습니다.');need(n.publishedAt<=now,'NOTICE_UNPUBLISHED','아직 공개되지 않은 공고입니다.');
   if(input.mode==='practice')need(n.deadlineAt<=now,'NOT_PAST_NOTICE','과거 연습은 마감된 공고만 지원합니다.');
   if(input.mode==='live')need(now<n.deadlineAt&&!n.result,'DEADLINE_PASSED','마감되었거나 결과가 등록된 공고입니다. 과거 연습 모드를 사용하세요.');
   const asOf=input.mode==='practice'?n.predictionAt:now,models=(await modelVersions(owner)).filter(m=>(testMode||!m.testOnly)&&m.trainingCutoff<asOf&&m.selectionCutoff<asOf).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||(b.report.trainCount-a.report.trainCount));need(models.length,'MODEL_NOT_READY','예측시점 이전에 학습·선택된 모델이 없습니다. 자료 관리에서 실제 자료를 등록하고 학습하세요.');
   const model=input.modelVersion?models.find(m=>m.version===input.modelVersion):models[0];need(model,'MODEL_NOT_AVAILABLE','선택한 모델이 없거나 이 공고의 예측시점 이후에 학습된 모델입니다.');const output=predict(model,ns,n,input.assumedPriceRank,asOf,{allowTest:testMode});const prediction={...output,id:crypto.randomUUID(),userId:owner,createdAt:now,mode:input.mode,notice:{...n,result:null},modelFingerprint:await hash(model),datasetFingerprint:await hash({availabilityPolicy:model.availability?.policy||'observed',history:historyBefore(availableNotices(ns.filter(x=>x.id!==n.id),model.availability?.policy||'observed'),n.region,asOf).map((x:any)=>[x.id,x.result])})};await put(owner,'prediction',prediction);return reply(prediction);
  }
  if(action==='save'&&req.method==='POST'){const p=await get(owner,'prediction',input.predictionId);need(p,'PREDICTION_NOT_FOUND','예측 기록을 찾을 수 없습니다.');const prior=input.revisionOf?await get(owner,'simulation',input.revisionOf):(await list(owner,'simulation')).filter(r=>r.notice.id===p.notice.id&&r.mode===p.mode).at(-1)||null;const record=makeSimulation({prediction:p,candidateId:input.candidateId,now,userId:owner,revisionOf:prior?.id||null,prior});record.rootId=record.rootId||record.id;await put(owner,'simulation',record);return reply(record,201);}
  if(action==='record'&&req.method==='GET'){const r=await get(owner,'simulation',url.searchParams.get('id')||'');need(r,'RECORD_NOT_FOUND','기록이 없습니다.');const ns=await notices(owner),n=ns.find(n=>n.id===r.notice.id);let result=null;if(n?.result)result=evaluateAmount(r.amountWon,n,r.assumedRank);return reply({record:r,result,priceMapping:n?.result?rankedPrices(n):[],versions:(await list(owner,'simulation')).filter(x=>x.rootId===r.rootId)});}
  if(action==='metrics'&&req.method==='GET'){const ns=await notices(owner);return reply(summarize(await list(owner,'simulation'),ns,{mode:url.searchParams.get('mode')||'live',region:url.searchParams.get('region')||'',from:url.searchParams.get('from')||'',to:url.searchParams.get('to')||''}));}
  if(action==='import'&&req.method==='POST'){
   need(input.schemaVersion===SCHEMA_VERSION&&Array.isArray(input.notices)&&input.notices.length>0&&input.notices.length<=100,'INVALID_IMPORT','bid-compass/1.0 형식으로 한 번에 1~100건을 등록하세요.');
   const accepted:any[]=[],rejected:any[]=[];const seen=new Set();for(let i=0;i<input.notices.length;i++){try{const n=validateNotice(input.notices[i]);need(testMode||n.source.type!=='test-only','TEST_DATA','시험자료는 운영 저장소에 등록할 수 없습니다.');need(!n.result||n.result.publishedAt<=now,'FUTURE_RESULT','미래의 개찰 결과는 등록할 수 없습니다.');need(!seen.has(n.id),'DUPLICATE_NOTICE','입력 파일 안의 공고가 중복됐습니다.');seen.add(n.id);accepted.push(n);}catch(e:any){rejected.push({index:i,number:input.notices[i]?.number,code:e.code||'INVALID_NOTICE',reason:e.message});}}
   const current=await notices(owner);need(new Set([...current.map(n=>n.id),...accepted.map(n=>n.id)]).size<=600,'DATA_LIMIT','이 버전은 최대 600개 공고를 지원합니다.');
   if(accepted.length)await database().batch(accepted.map(n=>statement(owner,'notice',n)));await auditEvent(owner,'import',accepted.length,{rejected,ids:accepted.map(n=>n.id),source:'user-import'});return reply({accepted:accepted.length,rejected});
  }
  if(action==='notice'&&req.method==='GET'){const n=(await notices(owner)).find(n=>n.id===url.searchParams.get('id'));need(n,'NOTICE_NOT_FOUND','공고를 찾을 수 없습니다.');return reply(n);}
  if(action==='collection'&&req.method==='GET'){const ns=await sharedNotices();return reply({schemaVersion:SCHEMA_VERSION,collection:collectionInfo(ns,await dailyStatus()),notices:ns});}
  if(action==='training-plan'&&req.method==='GET')return reply(trainingPlan(await notices(owner),{trainingCount:Number(url.searchParams.get('trainingCount')||30),availabilityPolicy:url.searchParams.get('availabilityPolicy')||'observed',now,allowTest:testMode}));
  if(action==='train'&&req.method==='POST'){
   const ns=await notices(owner);
   if(input.jobId){
    const job=await get(owner,'training-job',input.jobId);need(job,'TRAINING_JOB_NOT_FOUND','진행 중인 학습을 찾을 수 없습니다.');
    if(job.status==='complete'){const model=await get(owner,'model',job.options.version);need(model,'MODEL_NOT_FOUND','완료된 모델을 찾을 수 없습니다.');return reply(model);}
    need(Date.parse(job.expiresAt)>Date.now(),'TRAINING_EXPIRED','학습 대기 시간이 지났습니다. 새 학습을 실행하세요.');
    need(await hash(ns)===job.datasetFingerprint,'TRAINING_DATA_CHANGED','학습 중 자료가 변경됐습니다. 새 학습을 실행하세요.');
    const step=trainModelStep(ns,job.options,job.ann),next={...job,ann:step.ann,completedEpochs:step.ann?.completedEpochs||60,status:step.artifact?'complete':'training'};
    if(step.artifact){
     const artifact={...step.artifact,datasetFingerprint:job.datasetFingerprint};
     await database().batch([
      database().prepare('INSERT OR IGNORE INTO documents (id,owner,kind,entity_id,created_at,body) VALUES (?,?,?,?,?,?)').bind('model:'+job.id,owner,'model',artifact.version,artifact.createdAt,JSON.stringify(artifact)),
      database().prepare('UPDATE documents SET body=? WHERE id=? AND owner=? AND kind=?').bind(JSON.stringify(next),'training-job:'+job.id,owner,'training-job'),
      database().prepare('INSERT OR IGNORE INTO audit (id,owner,created_at,action,accepted,body) VALUES (?,?,?,?,?,?)').bind('training-audit:'+job.id,owner,now,'train',artifact.report.trainCount,JSON.stringify({version:artifact.version,trainingCount:artifact.report.trainCount,annHiddenLayers:artifact.trainingConfig.annHiddenLayers,epochs:60}))
     ]);
     return reply(artifact);
    }
    await database().prepare('UPDATE documents SET body=? WHERE id=? AND owner=? AND kind=? AND body=?').bind(JSON.stringify(next),'training-job:'+job.id,owner,'training-job',JSON.stringify(job)).run();
    const current=await get(owner,'training-job',job.id);return reply({jobId:job.id,status:current.status,completedEpochs:current.completedEpochs,totalEpochs:60},202);
   }
   const annHiddenLayers=input.annHiddenLayers===undefined?DEFAULT_ANN_LAYERS:input.annHiddenLayers;
   need(supportedArchitecture(annHiddenLayers),'INVALID_ANN_ARCHITECTURE','지원하는 ANN 은닉층 구성을 선택하세요.');
   const models=await modelVersions(owner),options={trainingCount:input.trainingCount??30,availabilityPolicy:input.availabilityPolicy||'observed',annHiddenLayers,version:`ml-n${input.trainingCount??30}-${now.replace(/\D/g,'')}-${crypto.randomUUID().slice(0,6)}`,now,allowTest:testMode,previousValidationIds:models.flatMap(m=>m.report.validationIds)},datasetFingerprint=await hash(ns);
   if(annHiddenLayers.length===1){const artifact={...trainModels(ns,options),datasetFingerprint};await put(owner,'model',artifact);await auditEvent(owner,'train',artifact.report.trainCount,{version:artifact.version,trainingCount:artifact.report.trainCount,annHiddenLayers});return reply(artifact);}
   const step=trainModelStep(ns,options),id=crypto.randomUUID(),job={id,options,datasetFingerprint,ann:step.ann,status:'training',completedEpochs:step.ann!.completedEpochs,expiresAt:new Date(Date.now()+86400000).toISOString()};
   await database().prepare('INSERT INTO documents (id,owner,kind,entity_id,created_at,body) VALUES (?,?,?,?,?,?)').bind('training-job:'+id,owner,'training-job',id,now,JSON.stringify(job)).run();
   return reply({jobId:id,status:'training',completedEpochs:job.completedEpochs,totalEpochs:60},202);
  }
  if(action==='model'&&req.method==='GET'){const m=(await modelVersions(owner)).find(m=>m.version===url.searchParams.get('version'));need(m,'MODEL_NOT_FOUND','저장된 모델이 없습니다.');validateModel(m);return reply(m);}
  if(action==='export'&&req.method==='GET')return reply({schemaVersion:SCHEMA_VERSION,exportedAt:now,notices:await notices(owner),models:await modelVersions(owner),predictions:await list(owner,'prediction'),simulations:await list(owner,'simulation')});
  if(action==='data'&&req.method==='GET')return reply({audits:await audits(owner),patterns:repeatPatterns(await notices(owner))});
  if(action==='lookup'&&req.method==='POST')throw new DomainError('SOURCE_NOT_CONNECTED','나라장터 자동 조회가 연결되지 않았습니다. 공개 웹 수집 또는 공식 API 연동이 필요합니다. 등록된 자료는 계속 사용할 수 있습니다.',503);
  return reply({code:'NOT_FOUND',message:'지원하지 않는 요청입니다.'},404);
 }catch(error:any){if(error instanceof DomainError)return reply({code:error.code,message:error.message},error.status);console.error('Bid Compass request failed:',error?.name);return reply({code:'SERVICE_UNAVAILABLE',message:'서버 처리에 실패했습니다. 숫자로 대체하지 않았습니다. 잠시 후 다시 시도하세요.'},503);}
}
export async function GET(req:Request,ctx:{params:Promise<{action:string}>}){return handler(req,ctx.params);}
export async function POST(req:Request,ctx:{params:Promise<{action:string}>}){return handler(req,ctx.params);}

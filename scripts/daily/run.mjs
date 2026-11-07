import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {validateNotice} from '../../lib/domain.mjs';
import {readAccess,writeBatch,status} from './writer.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const dateKey=d=>new Date(d+9*3600000).toISOString().slice(0,10).replaceAll('-','');
const day=86400000;
const token=await readAccess();
const latest=await status();
const today=Date.now(),from=dateKey(Math.min(today-30*day,Date.parse(latest.at||new Date(today).toISOString())-7*day)),to=dateKey(today);
const dir=resolve(process.env.DAILY_REPLAY_DIR||'outputs/daily/'+new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(dir,{recursive:true});
function run(file,env){const r=spawnSync(process.execPath,[file,...(file.includes('build-public')?[dir]:[])],{cwd:process.cwd(),stdio:'inherit',env:{...process.env,...env,DAILY_BATCH_DIR:dir}});if(r.status!==0)throw Error('Collection step failed: '+file);}
if(!process.env.DAILY_REPLAY_DIR)run('scripts/daily/collect.mjs',{COLLECT_START:from,COLLECT_END:to});
const state=read(join(dir,'checkpoint.json')),catalog=read(join(dir,'catalog.json'));
if(!state.finishedAt||state.officialTotal!==catalog.rows.length||catalog.rows.some(n=>!state.notices[n.key]||state.notices[n.key].status==='error'))throw Error('Incomplete official search/detail collection. No success marker written.');
run('scripts/build-public-dataset.mjs',{});
const accepted=read(join(dir,'accepted.json')),items=accepted.notices.map(notice=>({notice})),excluded=[...accepted.collection.excluded];
const region={'전북특별자치도':'전북','전북특별자치도 전주시':'전주','전북특별자치도 군산시':'군산','전북특별자치도 익산시':'익산'};
function instant(v){if(!v)throw Error('공고 일정 누락');return new Date(String(v).replaceAll('/','-').replace(' ','T')+'+09:00').toISOString();}
for(const row of catalog.rows){
 const record=state.notices[row.key];if(!['not_opened','complete','incomplete'].includes(record.status))continue;
 const raw=read(join(dir,'raw',row.key+'.json')),detail=raw.responses.find(r=>r.url.endsWith('selectFacilAnncMngV.do'))?.body.dmItemMap;
 if(!detail||detail.bidPbancNo!==row.id||detail.bidPbancOrd!==row.order)throw Error('Official detail ID mismatch');
 if(row.noticeStatus==='취소공고'){items.push({cancelled:true,number:row.id,round:row.order});continue;}
 if(record.status!=='not_opened')continue;
 try{
  const place=region[record.actualEligibilityRegion],license=String(detail.intpLmtCn||'');
  if(!place||!license.includes('4993'))throw Error('대상 업종 또는 참가제한 확인 필요');
  const field=license.split(/주력분야\s*:/)[1]?.split(']')[0]||'',plant=field.includes('조경식재'),facility=field.includes('조경시설물');
  const deadlineAt=instant(detail.slprRcptDdlnDt);
  for(const p of record.progress?.length?record.progress:[{classification:'0',rebidOrder:'000'}]){
   const notice=validateNotice({number:row.id,round:row.order,bidClass:p.classification,rebid:p.rebidOrder,title:row.title,region:place,industry:plant&&!facility?'조경식재':facility&&!plant?'조경시설물':'조경식재·조경시설물',publishedAt:instant(detail.pbancPstgDt),deadlineAt,openingAt:instant(p.scheduledOpening||detail.onbsPrnmntDt),predictionAt:new Date(Date.parse(deadlineAt)-60000).toISOString(),price:null,result:null,source:{type:'official',url:'https://www.g2b.go.kr/',collectedAt:raw.observedAt,regionRestriction:record.regionRestrictionText}});
   items.push({notice});
  }
 }catch(e){excluded.push({key:row.key,reason:e.message});}
}
const at=state.finishedAt,summary={from:catalog.query?.dlSrchParamM?.startBizYmd||process.env.COLLECT_START||from,to:catalog.query?.dlSrchParamM?.endBizYmd||to,listed:catalog.rows.length,received:items.length,excluded:excluded.length};
for(let i=0;i<items.length;i+=5)await writeBatch(token,{at,items:items.slice(i,i+5)});
await writeBatch(token,{at,items:[],summary});
const result=await status();if(result.at!==at)throw Error('Latest collection readback mismatch');
console.log(JSON.stringify(result));

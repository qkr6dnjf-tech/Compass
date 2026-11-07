import {database,get,list} from './repository';
import {publicCollection,publicNotices} from './public-data.mjs';
import {validateNotice,DomainError} from './domain.mjs';
const scope='official:g2b-daily';
const verifier='531ada0ab48606736333e09623207fc752f2bddb6e6675b3540578f29b68b0be';
export async function sharedNotices(){
 const map=new Map(publicNotices.map(n=>[n.id,n]));
 for(const entry of await list(scope,'official-update')){
  if(entry.cancelled){for(const [id,n] of map)if(n.number===entry.number&&n.round<=entry.round)map.delete(id);}
  else map.set(entry.notice.id,entry.notice);
 }
 return [...map.values()];
}
export async function dailyStatus(){return await get(scope,'sync','latest')||{at:null};}
export function collectionInfo(ns:any[],latest:any){
 const results=ns.filter(n=>n.result);
 return {...publicCollection,noticeCount:ns.length,resultCount:results.length,participantRows:results.reduce((s,n)=>s+n.result.participants.length,0),regionCounts:Object.fromEntries(['전북','전주','군산','익산'].map(r=>[r,results.filter(n=>n.region===r).length])),latest};
}
export async function updateDaily(req:Request){
 const key=req.headers.get('X-Daily-Writer')||'';
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==verifier)throw new DomainError('FORBIDDEN','갱신 권한이 필요합니다.',403);
 const body=await req.json() as any;
 const at=new Date(body.at).toISOString();
 if(at>new Date(Date.now()+60000).toISOString())throw new DomainError('INVALID_TIME','수집 시각을 확인하세요.');
 if(!Array.isArray(body.items)||body.items.length>20)throw new DomainError('INVALID_BATCH','갱신 묶음 크기 오류');
 const db=database();
 const put=(kind:string,id:string,value:any)=>db.prepare('INSERT INTO documents (id,owner,kind,entity_id,created_at,body) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at,body=excluded.body WHERE excluded.created_at>=documents.created_at').bind(scope+':'+kind+':'+id,scope,kind,id,at,JSON.stringify(value));
 const ops=[];const ids=[];
 for(const entry of body.items){
  if(entry.cancelled){if(!/^[A-Za-z0-9-]{5,40}$/.test(entry.number)||!/^\d{3}$/.test(entry.round))throw new DomainError('INVALID_ID','취소공고 식별자 오류');ops.push(put('official-update','cancel:'+entry.number+':'+entry.round,{cancelled:true,number:entry.number,round:entry.round}));continue;}
  const n=validateNotice(entry.notice);
  if(n.source.type!=='official'||new URL(n.source.url).hostname!=='www.g2b.go.kr')throw new DomainError('INVALID_SOURCE','나라장터 공식 자료가 필요합니다.');
  const old=(await get(scope,'official-update',n.id))?.notice||publicNotices.find(v=>v.id===n.id);
  if(old?.result&&!n.result)continue;
  if(old?.result&&n.result&&JSON.stringify([old.result.prices,old.result.participants,old.result.expectedPriceWon])===JSON.stringify([n.result.prices,n.result.participants,n.result.expectedPriceWon]))n.result=old.result;
  if(!n.price&&old?.price&&n.deadlineAt===old.deadlineAt&&n.title===old.title&&n.publishedAt===old.publishedAt)n.price=old.price;
  ops.push(put('official-update',n.id,{notice:n}));ids.push(n.id);
 }
 if(body.summary)ops.push(put('sync','latest',{at,from:body.summary.from,to:body.summary.to,listed:body.summary.listed,received:body.summary.received,excluded:body.summary.excluded}));
 if(ops.length)await db.batch(ops);
 return {ids,at};
}

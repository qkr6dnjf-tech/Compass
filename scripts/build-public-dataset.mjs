import {readFileSync,writeFileSync,readdirSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {validateNotice,thresholdForExpected,SCHEMA_VERSION} from '../lib/domain.mjs';
const folders=(process.argv.length>2?process.argv.slice(2):['outputs/public-probe/batch-20261105','outputs/public-probe/batch-20251106-20260505']).map(p=>resolve(p)).filter(p=>existsSync(join(p,'normalized'))&&existsSync(join(p,'checkpoint.json'))&&existsSync(join(p,'catalog.json')));
const periods=[];let counts={},processedCount=0,catalogCount=0,downloadedResultCount=0;
const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const decode=s=>String(s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/<[^>]*>/g,'').trim();
function iso(value){if(!value)return null;const s=String(value);if(/(?:Z|[+-]\d\d:\d\d)$/.test(s))return new Date(s).toISOString();const m=s.match(/^(\d{4})[-/]?(\d\d)[-/]?(\d\d)[ T]?(\d\d):?(\d\d)(?::?(\d\d))?/);if(!m)return null;return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]||'00'}+09:00`).toISOString();}
const regionNames={'전북특별자치도':'전북','전라북도':'전북','전북특별자치도 전주시':'전주','전라북도 전주시':'전주','전북특별자치도 군산시':'군산','전라북도 군산시':'군산','전북특별자치도 익산시':'익산','전라북도 익산시':'익산'};
const output=[],excluded=[];
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
for(const folder of folders){
for(const file of readdirSync(join(folder,'normalized')).filter(f=>f.endsWith('.json'))){
 const v=read(join(folder,'normalized',file)),n=v.notice,key=`${n.id}-${n.order}`;
 try{
  const raw=read(join(folder,'raw',key+'.json'));
  const last=suffix=>raw.responses.filter(x=>x.url.endsWith(suffix)&&x.status===200).at(-1)?.body;
  const detail=last('selectFacilAnncMngV.do'),item=detail?.dmItemMap,aInfo=detail?.dmAamtMap,pricesBody=last('selectRsvePrceInfo.do');
  if(!item||!pricesBody)fail('MISSING_DETAIL','공고상세 또는 예비가격 원문 누락');
  const regionText=decode(item.rgnLmtCn),regions=[...regionText.matchAll(/\[([^\]]+)\]/g)].map(m=>m[1].trim());
  if(regions.length!==1||!regionNames[regions[0]])fail('REGION_OUT_OF_SCOPE','지원지역 단독 제한이 아님: '+regionText);
  const license=decode(item.intpLmtCn),field=(license.split('주력분야:')[1]||license.split('주력분야 :')[1]||'').split(']')[0];
  if(!license.includes('4993')&&!license.includes('조경'))fail('INDUSTRY_OUT_OF_SCOPE','조경업종 확인 불가');
  const planting=/조경식재/.test(field),facility=/조경시설물/.test(field);
  const industry=planting&&!facility?'조경식재':facility&&!planting?'조경시설물':'조경식재·조경시설물';
  if(!Number.isSafeInteger(n.baseAmount)||!Number.isSafeInteger(n.officialScheduledPrice))fail('NON_INTEGER_PRICE','소수 금액 공고는 원 단위 모형에서 제외');
  if(v.prices.length!==15||v.prices.filter(p=>p.selected).length!==4||v.validations?.completeBidderList!==true)fail('INCOMPLETE_RESULT','15가격·4선정·전체 업체 검산 미충족');
  const mean=v.prices.filter(p=>p.selected).reduce((s,p)=>s+p.amount,0)/4;
  const averageRounding=mean===n.officialScheduledPrice?'exact':['floor','round','ceil'].find(k=>Math[k](mean)===n.officialScheduledPrice);
  if(!averageRounding)fail('AVERAGE_MISMATCH','선정가격 평균과 공식 예정가격 불일치');
  if(v.validations.selectionsMatchBidderChoices===false)fail('DRAW_COUNT_MISMATCH','추첨수와 업체 선택 개수 불일치');
  const publishedAt=iso(item.pbancPstgDt||n.announcedAt),deadlineAt=iso(item.slprRcptDdlnDt||n.submissionDeadline),openingAt=iso(item.onbsPrnmntDt||pricesBody.pbancInfo?.onbsPrnmntDt);
  if(!publishedAt||!deadlineAt||!openingAt)fail('MISSING_TIMELINE','공고·마감·개찰예정 시각 누락');
  const predictionAt=new Date(Date.parse(deadlineAt)-60000).toISOString(),unsupported=[];
  const usesA=n.aExcludedBiddingRatioApplied;
  if(usesA!==true&&usesA!==false)fail('UNKNOWN_A_RULE','A값 보정 적용 여부 미확인');
  if(usesA&&!Number.isSafeInteger(n.aValue))fail('MISSING_A','A값 미확인');
  const aWon=usesA?n.aValue:0;
  if(!Number.isFinite(n.lowerLimitPct)||n.lowerLimitPct<=0)fail('MISSING_LOWER_RATE','낙찰하한율 누락');
  if(!['소액수의견적','적격심사제'].includes(decode(item.scsbdMthdNm)))unsupported.push('낙찰방식 확인 필요: '+decode(item.scsbdMthdNm));
  if(decode(item.ctrtTyNm)!=='총액계약')unsupported.push('총액계약 외 금액 단위 확인 필요');
  const aPublishedAt=iso(aInfo?.bpfaaRlsDt||item.bpfaaRlsDt);
  if(usesA&&(!aPublishedAt||aPublishedAt>predictionAt))unsupported.push('예측시점 이전 A값 공개 확인 불가');
  let pureCost=null;
  if(n.pureConstructionCostApplied){
   if(!Number.isSafeInteger(n.basePureConstructionCost)||!Number.isSafeInteger(n.scheduledPureConstructionCost))unsupported.push('순공사원가 값 미확인');
   else {pureCost={baseWon:n.basePureConstructionCost,thresholdPercent:'98',rounding:'ceil-each'};const b=BigInt(n.basePureConstructionCost)*BigInt(n.officialScheduledPrice),den=BigInt(n.baseAmount);if(Number((b+den-1n)/den)!==n.scheduledPureConstructionCost)unsupported.push('순공사원가 환산과 공식값 불일치');}
  }
  const sourceUrl='https://www.g2b.go.kr/';
  const canonical={number:n.id,round:n.order,bidClass:n.classification,rebid:n.rebidOrder,title:decode(n.title),region:regionNames[regions[0]],industry,publishedAt,predictionAt,deadlineAt,openingAt,
   source:{type:'official',url:sourceUrl,note:'나라장터 비로그인 공개 화면 수집. 결과 최초 공개시각 미확인. 원본 추첨수와 업체 선택 및 선정평균 검산.',collectedAt:n.resultFirstObservedAt,rawSha256:createHash('sha256').update(readFileSync(join(folder,'raw',key+'.json'))).digest('hex'),regionRestriction:regionText,licenseRestriction:license},
   price:{baseWon:n.baseAmount,aWon,lowerRatePercent:String(n.lowerLimitPct),unitWon:1,formula:usesA?'a-adjusted':'simple',rounding:'ceil',minimumRatePercent:'97',maximumRatePercent:'103',pureCost,expectedPriceCeiling:true,conditionsReviewed:unsupported.length===0,unsupportedConditions:unsupported,source:'official',aPublishedAt,reviewBasis:'공식 구조화 가격조건과 실제 개찰 유효업체 금액 검산'},
   result:{publishedAt:n.resultFirstObservedAt,firstObservedAt:n.resultFirstObservedAt,publicationTimeBasis:'first-observed',officialPublishedAt:null,actualOpenedAt:iso(n.actualOpenedAt),expectedPriceWon:n.officialScheduledPrice,averageRounding,prices:v.prices.map(p=>({drawNo:p.originalNumber,amountWon:p.amount,selected:p.selected,drawCount:p.selectionCount})),participantsComplete:true,participants:v.bidders.map(b=>({companyId:b.companyId,name:b.companyName,amountWon:b.bidAmount,eligible:b.status==='정상'&&!b.disqualifiedInPrecheck,officialRank:b.officialRank,status:b.status}))}
  };
  const range=String(n.preliminaryPriceRange||'').match(/-([\d.]+)%\s*~\s*\+?([\d.]+)%/);
  if(!range)fail('UNKNOWN_PRICE_RANGE','예비가격 범위 미확인');canonical.price.minimumRatePercent=String(100-Number(range[1]));canonical.price.maximumRatePercent=String(100+Number(range[2]));
  const accepted=validateNotice(canonical);
  if(accepted.price.conditionsReviewed){const minimum=thresholdForExpected(accepted.result.expectedPriceWon,accepted.price);if(accepted.result.participants.some(b=>b.eligible&&(b.amountWon<minimum||b.amountWon>accepted.result.expectedPriceWon))){accepted.price.conditionsReviewed=false;accepted.price.unsupportedConditions.push('공식 정상 업체와 계산된 유효금액 범위 불일치');}}
  output.push(accepted);
 }catch(e){excluded.push({id:`${n.id}:${n.order}:${n.classification}:${n.rebidOrder}`,title:decode(n.title),code:e.code||'NORMALIZATION_ERROR',reason:e.message});}
}
const checkpoint=read(join(folder,'checkpoint.json')),catalog=read(join(folder,'catalog.json'));
const states=Object.values(checkpoint.notices||{});for(const state of states)counts[state.status]=(counts[state.status]||0)+1;
const rows=Array.isArray(catalog)?catalog:(catalog.items||catalog.notices||catalog.rows||[]);catalogCount+=rows.length;processedCount+=states.length;downloadedResultCount+=readdirSync(join(folder,'normalized')).filter(f=>f.endsWith('.json')).length;periods.push({folder:folder.split(/[\\/]/).at(-1),officialTotal:catalog.officialTotal||rows.length,collectedListRows:rows.length,query:catalog.query});
}
const collection={collectedAt:new Date().toISOString(),source:'https://www.g2b.go.kr/',catalogCount,processedCount,downloadedResultCount,periods,includedCount:output.length,priceRulesReadyCount:output.filter(n=>n.price.conditionsReviewed).length,statusCounts:counts,excluded,regionCounts:Object.fromEntries(['전북','전주','군산','익산'].map(region=>[region,output.filter(n=>n.region===region).length])),publicationTimeEvidence:'공식 최초 공개시각 미확인. 원본은 최초 관측시각을 보존하고 연구용 학습에서만 별도 이용시점 가정을 적용.'};
const dest=process.env.DAILY_BATCH_DIR;mkdirSync(dest||'data',{recursive:true});writeFileSync(dest?join(dest,'accepted.json'):'data/public-notices.json',JSON.stringify({schemaVersion:SCHEMA_VERSION,notices:output,collection}));
writeFileSync(dest?join(dest,'normalization.json'):'outputs/collection-normalization.json',JSON.stringify(collection,null,2));
console.log(JSON.stringify({included:output.length,priceRulesReady:collection.priceRulesReadyCount,participants:output.reduce((s,n)=>s+n.result.participants.length,0),regions:collection.regionCounts,excluded:excluded.reduce((a,v)=>(a[v.code]=(a[v.code]||0)+1,a),{}),statusCounts:counts}));

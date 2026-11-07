/** Shared Node/Worker domain. Rates use percent, money uses integer KRW. */
export const REGIONS=['전북','전주','군산','익산'];
export const SCHEMA_VERSION='bid-compass/1.0', POLICY_VERSION='price-first/1.0', BIN_WIDTH=0.2;
export class DomainError extends Error {constructor(code,message,status=422){super(message);this.code=code;this.status=status;}}
export function need(ok,code,message){if(!ok)throw new DomainError(code,message);}
export function instant(v,name){need(typeof v==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v)),'INVALID_DATE',`${name}: 시간대가 있는 ISO 일시가 필요합니다.`);return new Date(v).toISOString();}
function won(v,name,zero=false){need(Number.isSafeInteger(v)&&v>=(zero?0:1),'INVALID_MONEY',`${name}: 원 단위 정수를 입력하세요.`);return v;}
export function decimal(v,name='비율'){need(['string','number'].includes(typeof v)&&/^\d+(\.\d{1,5})?$/.test(String(v)),'INVALID_RATE',`${name}: 최대 소수점 다섯 자리 양수여야 합니다.`);return Number(v);}
export function validateNotice(raw){
 need(raw&&typeof raw==='object','INVALID_NOTICE','공고 객체가 필요합니다.');const n=structuredClone(raw);
 need(typeof n.number==='string'&&/^[A-Za-z0-9-]{5,40}$/.test(n.number),'INVALID_ID','공고번호 형식을 확인하세요.');
 need(/^\d{3}$/.test(n.round)&&/^\d{3}$/.test(n.rebid),'INVALID_ROUND','차수·재입찰은 각각 세 자리입니다.');n.bidClass=n.bidClass||'0';need(/^\d{1,4}$/.test(n.bidClass),'INVALID_CLASS','공고 분류번호를 확인하세요.');n.id=`${n.number}:${n.round}:${n.bidClass}:${n.rebid}`;
 need(typeof n.title==='string'&&n.title.trim().length>0&&n.title.length<300,'INVALID_TITLE','공사명을 입력하세요.');
 need(REGIONS.includes(n.region),'INVALID_REGION','참가제한 지역을 확인하세요.');need(['조경식재','조경시설물','조경식재·조경시설물'].includes(n.industry),'INVALID_INDUSTRY','지원 공종은 조경식재·조경시설물입니다.');
 for(const f of ['publishedAt','deadlineAt','openingAt','predictionAt'])n[f]=instant(n[f],f);
 need(n.publishedAt<=n.predictionAt&&n.predictionAt<n.deadlineAt&&n.deadlineAt<=n.openingAt,'INVALID_TIMELINE','공고일 ≤ 예측시점 < 마감 ≤ 개찰예정이어야 합니다.');
 n.source=n.source||{type:'manual'};need(['official','manual','test-only'].includes(n.source.type),'INVALID_SOURCE','자료 출처를 지정하세요.');
 if(n.source.type==='official')need(/^https:\/\/(?:[a-z0-9-]+\.)*(?:g2b\.go\.kr|data\.go\.kr)(?:\/|$)/.test(n.source.url||''),'INVALID_SOURCE','공식 자료는 나라장터·공공데이터포털 원문 URL이 필요합니다.');
 if(n.price){const p=n.price;won(p.baseWon,'기초금액');won(p.aWon,'A값',true);won(p.unitWon,'금액 단위');need(p.aWon<p.baseWon&&p.unitWon<=10000,'INVALID_MONEY','A값·금액 단위를 확인하세요.');
 need(decimal(p.lowerRatePercent,'낙찰하한율')>0&&Number(p.lowerRatePercent)<=100,'INVALID_RATE','낙찰하한율 범위를 확인하세요.');
 need(['a-adjusted','simple'].includes(p.formula)&&p.rounding==='ceil','UNSUPPORTED_RULE','A값 보정/단순 하한식 및 최소 금액단위 절상만 지원합니다.');
 need(['official','manual','test-only'].includes(p.source),'INVALID_SOURCE','금액 출처를 표시하세요.');need(typeof p.conditionsReviewed==='boolean'&&Array.isArray(p.unsupportedConditions),'RULES_UNREVIEWED','가격조건 확인 여부와 미지원 조건 목록이 필요합니다.');
 if(p.formula==='simple')need(p.aWon===0,'INVALID_MONEY','단순 하한식의 A값은 0입니다.');
 if(p.expectedPriceCeiling!=null)need(typeof p.expectedPriceCeiling==='boolean','INVALID_RULE','예정가격 상한 적용 여부는 true 또는 false여야 합니다.');
 if(p.pureCost){won(p.pureCost.baseWon,'기초금액 중 순공사원가');need(Number(p.pureCost.thresholdPercent)===98&&p.pureCost.rounding==='ceil-each','UNSUPPORTED_RULE','순공사원가 98%, 환산·하한 각각 원 단위 절상만 지원합니다.');}
 need(decimal(p.minimumRatePercent)>0&&Number(p.minimumRatePercent)<decimal(p.maximumRatePercent)&&Number(p.maximumRatePercent)<=110,'INVALID_RANGE','공고 예비가격 범위를 확인하세요.');}
 if(n.result){const r=n.result;need(n.price,'MISSING_PRICE','결과 검산에는 기초금액이 필요합니다.');r.publishedAt=instant(r.publishedAt,'결과 공개일');need(r.publishedAt>=n.openingAt,'INVALID_TIMELINE','결과 공개일은 개찰예정 이후여야 합니다.');won(r.expectedPriceWon,'예정가격');
 need(Array.isArray(r.prices)&&r.prices.length===15,'INVALID_PRICES','실제 예비가격 15개가 필요합니다.');need(new Set(r.prices.map(p=>p.drawNo)).size===15,'INVALID_DRAW','원본 추첨번호가 중복되었습니다.');
 for(const p of r.prices){need(Number.isInteger(p.drawNo)&&p.drawNo>=1&&p.drawNo<=15&&typeof p.selected==='boolean','INVALID_DRAW','원본 추첨번호·선정 여부를 확인하세요.');won(p.amountWon,'예비가격');const rate=p.amountWon/n.price.baseWon*100;need(rate>=Number(n.price.minimumRatePercent)-0.00001&&rate<=Number(n.price.maximumRatePercent)+0.00001,'OUT_OF_RANGE','예비가격이 공고 범위를 벗어났습니다.');if(p.drawCount!=null)need(Number.isInteger(p.drawCount)&&p.drawCount>=0,'INVALID_DRAW','추첨수는 음수가 아닌 정수여야 합니다.');}
 const selected=r.prices.filter(p=>p.selected);need(selected.length===4,'INVALID_SELECTION','선정된 가격은 정확히 4개여야 합니다.');need(['floor','round','ceil','exact'].includes(r.averageRounding),'MISSING_ROUNDING','예정가격 평균 처리 기준이 필요합니다.');const mean=selected.reduce((s,p)=>s+p.amountWon,0)/4;need((r.averageRounding==='exact'?mean:Math[r.averageRounding](mean))===r.expectedPriceWon,'AVERAGE_MISMATCH','선정 4개 평균과 실제 예정가격이 일치하지 않습니다.');
 if(r.prices.every(p=>p.drawCount!=null)){const low=Math.min(...selected.map(p=>p.drawCount));need(r.prices.filter(p=>!p.selected).every(p=>p.drawCount<=low),'DRAW_COUNT_MISMATCH','선정 여부와 추첨수가 일치하지 않습니다. 동률은 원본 선정 결과를 따릅니다.');}
 need(Array.isArray(r.participants)&&typeof r.participantsComplete==='boolean','INVALID_PARTICIPANTS','업체 목록과 전체 목록 여부가 필요합니다.');need(r.participants.length<=5000&&new Set(r.participants.map(p=>p.companyId)).size===r.participants.length,'INVALID_PARTICIPANTS','업체 식별자 중복 또는 목록 크기 초과입니다.');
 for(const p of r.participants){won(p.amountWon,'업체 투찰금액');need(typeof p.companyId==='string'&&p.companyId.length>0&&typeof p.name==='string'&&typeof p.eligible==='boolean','INVALID_PARTICIPANTS','업체 식별자·이름·가격조건 유효 여부가 필요합니다.');}}
 return n;
}
export function rankedPrices(n){return n.result?[...n.result.prices].sort((a,b)=>b.amountWon-a.amountWon||a.drawNo-b.drawNo).map((p,i)=>({...p,rank:i+1,rate:p.amountWon/n.price.baseWon*100})):[];}
const scaled=v=>BigInt(String(v).split('.')[0])*100000n+BigInt((String(v).split('.')[1]||'').padEnd(5,'0'));
const ceilDiv=(a,b)=>(a+b-1n)/b;
function ruleReady(p){need(p&&p.conditionsReviewed&&p.unsupportedConditions.length===0,'PRICE_RULES_UNCONFIRMED','가격조건 확인 또는 미지원 조건 검토가 필요합니다.');}
export function amountForRate(rate,p){ruleReady(p);decimal(rate);const scale=10000000n,base=BigInt(p.baseWon),a=BigInt(p.aWon),unit=BigInt(p.unitWon),r=scaled(rate),low=scaled(p.lowerRatePercent);need(base*r>=a*scale,'INVALID_MONEY','예상 예정가격이 A값보다 작습니다.');let amount=ceilDiv((base*r-a*scale)*low+a*scale*scale,scale*scale*unit)*unit;if(p.pureCost){const pure=ceilDiv(BigInt(p.pureCost.baseWon)*r,scale),minimum=ceilDiv(ceilDiv(pure*98n,100n),unit)*unit;if(minimum>amount)amount=minimum;}need(amount<=BigInt(Number.MAX_SAFE_INTEGER),'INVALID_MONEY','환산금액 범위를 초과했습니다.');return Number(amount);}
export function lowerForExpected(expected,p){ruleReady(p);const unit=BigInt(p.unitWon),a=BigInt(p.aWon);return Number(ceilDiv((BigInt(expected)-a)*scaled(p.lowerRatePercent)+a*10000000n,10000000n*unit)*unit);}
export function thresholdForExpected(expected,p){let threshold=lowerForExpected(expected,p);if(p.pureCost){const pure=ceilDiv(BigInt(p.pureCost.baseWon)*BigInt(expected),BigInt(p.baseWon));threshold=Math.max(threshold,Number(ceilDiv(pure*98n,100n)));}return threshold;}
export function comparisonRate(amount,p){return ((amount-p.aWon)/(Number(p.lowerRatePercent)/100)+p.aWon)/p.baseWon*100;}
export function evaluateAmount(amount,n,assumedRank=null){
 need(n.result,'RESULT_UNPUBLISHED','개찰 결과가 아직 등록되지 않았습니다.');const r=n.result,p=n.price,actualRate=r.expectedPriceWon/p.baseWon*100;
 const base={actualRate,expectedPriceWon:r.expectedPriceWon,comparisonRate:comparisonRate(amount,p),residual:comparisonRate(amount,p)-actualRate,selectedRanks:rankedPrices(n).filter(x=>x.selected).map(x=>x.rank),assumedHit:assumedRank==null?null:rankedPrices(n).some(x=>x.rank===assumedRank&&x.selected)};
 if(!p.conditionsReviewed||p.unsupportedConditions.length)return {...base,status:'unconfirmed-rules',rank:null,first:false};
 const minimum=thresholdForExpected(r.expectedPriceWon,p),competitors=r.participants.filter(x=>x.eligible&&x.amountWon>=minimum&&(!p.expectedPriceCeiling||x.amountWon<=r.expectedPriceWon)&&x.amountWon%p.unitWon===0).sort((a,b)=>a.amountWon-b.amountWon||a.companyId.localeCompare(b.companyId)),winner=competitors[0]||null;
 const extra={...base,minimum,priceFirstCompany:winner,winnerRate:winner?comparisonRate(winner.amountWon,p):null,amountDifference:winner?amount-winner.amountWon:null};
 if(amount%p.unitWon!==0)return {...extra,status:'invalid-unit',rank:null,first:false};
 if(amount<lowerForExpected(r.expectedPriceWon,p))return {...extra,status:'below-lower',rank:null,first:false};
 if(amount<minimum)return {...extra,status:'other-price-condition',rank:null,first:false};
 if(p.expectedPriceCeiling&&amount>r.expectedPriceWon)return {...extra,status:'above-expected',rank:null,first:false};
 if(!r.participantsComplete||!winner)return {...extra,status:'incomplete-participants',rank:null,first:false};
 const less=competitors.filter(x=>x.amountWon<amount).length,ties=competitors.filter(x=>x.amountWon===amount).length,rank=less+1;
 return {...extra,status:ties?'tie':rank===1?'first':'higher',rank,ties,first:rank===1&&ties===0&&(BigInt(amount-p.aWon)*10000000n>BigInt(r.expectedPriceWon-p.aWon)*scaled(p.lowerRatePercent)),competitors};
}
export function sixMonthStart(asOf,months=6){const d=new Date(asOf),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-months);d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));return d.toISOString();}
export function historyBefore(notices,region,asOf,months=6){const start=sixMonthStart(asOf,months);return notices.filter(n=>n.region===region&&n.result&&n.result.publishedAt<asOf&&n.openingAt>=start&&n.openingAt<asOf).sort((a,b)=>a.result.publishedAt.localeCompare(b.result.publishedAt));}
export function binFor(rate){const lo=Math.floor((Number(rate)+1e-9)/BIN_WIDTH)*BIN_WIDTH;return {lower:lo.toFixed(3),upper:(lo+BIN_WIDTH).toFixed(3),label:`[${lo.toFixed(3)}, ${(lo+BIN_WIDTH).toFixed(3)})%`};}
function leaders(rows,key){return [...new Set(rows.map(x=>x[key]).filter(v=>v>0))].sort((a,b)=>b-a).slice(0,2).map(value=>({value,items:rows.filter(x=>x[key]===value),tie:rows.filter(x=>x[key]===value).length>1}));}
export function analysis(notices,region,asOf){
 const hist=historyBefore(notices,region,asOf),counts=Array.from({length:15},(_,i)=>({rank:i+1,count:0,ratio:0})),bins={};
 for(const n of hist){for(const p of rankedPrices(n).filter(x=>x.selected))counts[p.rank-1].count++;const b=binFor(n.result.expectedPriceWon/n.price.baseWon*100);bins[b.label]=(bins[b.label]||0)+1;}
 for(const c of counts)c.ratio=hist.length?c.count/hist.length:0;const top=leaders(counts,'count');
 return {period:{from:sixMonthStart(asOf),to:asOf},asOf,count:hist.length,counts,topNumbers:top,topBins:leaders(Object.entries(bins).map(([bin,count])=>({bin,count})),'count'),months:[1,3,6].map(months=>{const h=historyBefore(notices,region,asOf,months);return {months,count:h.length,counts:Array.from({length:15},(_,i)=>{const c=h.filter(n=>rankedPrices(n).some(p=>p.rank===i+1&&p.selected)).length;return {rank:i+1,count:c,ratio:h.length?c/h.length:0};})};}),recommendation:hist.length>=20&&top[0]?.items.length===1?{rank:top[0].items[0].rank,reason:`최근 6개월 ${hist.length}건 중 ${top[0].value}회 관측. 과거 빈도 기준이며 미래 확률이 아닙니다.`}:null,warning:hist.length<20?'참고 번호를 제시할 관측자료가 부족합니다.':top[0]?.tie?'최다 관측 번호가 동률입니다. 단일 추천을 보류합니다.':null};
}
export function combinations(required=null){const out=[];for(let a=1;a<=12;a++)for(let b=a+1;b<=13;b++)for(let c=b+1;c<=14;c++)for(let d=c+1;d<=15;d++){const v=[a,b,c,d];if(required==null||v.includes(required))out.push(v);}return out;}
export function groupPattern(ranks){const counts=[0,0,0,0];for(const r of ranks)counts[r<=4?0:r<=8?1:r<=11?2:3]++;return counts.join('-');}
export function repeatPatterns(notices){const by={};for(const n of notices.filter(n=>n.result&&n.price))for(const p of n.result.participants){const x=by[p.companyId]||{companyId:p.companyId,name:p.name,total:0,bins:{}};const k=(Math.round(comparisonRate(p.amountWon,n.price)/0.01)*0.01).toFixed(2);x.bins[k]=(x.bins[k]||0)+1;x.total++;by[p.companyId]=x;}return Object.values(by).filter(x=>x.total>=3).map(x=>({...x,clusters:Object.entries(x.bins).filter(([,c])=>c>=2).map(([rate,count])=>({rate,count}))})).filter(x=>x.clusters.length).sort((a,b)=>b.total-a.total).slice(0,50);}

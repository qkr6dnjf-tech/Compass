import {need,DomainError,historyBefore,rankedPrices,amountForRate,binFor} from './domain.mjs';
import {availableNotices,availabilityInfo,RESEARCH_POLICY} from './availability.mjs';
import {predict} from './model.mjs';

const regionOf=value=>['전주','군산','익산'].find(region=>value.includes(region))||'전북';
const openedAt=row=>Date.parse(row.opened.replace(' ','T')+'+09:00');
const recoverable=new Set(['INSUFFICIENT_HISTORY','INSUFFICIENT_CANDIDATES','INSUFFICIENT_SEPARATION']);

export function automaticPrediction(models,notices,notice,asOf,{rankHistory=/** @type {any[]} */([]),allowTest=false}={}){
  const eligible=models.filter(m=>(allowTest||!m.testOnly)&&m.trainingCutoff<asOf&&m.selectionCutoff<asOf)
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.report.trainCount-a.report.trainCount||a.version.localeCompare(b.version));
  let fallbackReason='예측 기준시점에 사용할 학습 모델이 없습니다.';
  if(eligible.length){
    const model=eligible[0],policy=model.availability?.policy||'observed';
    const past=historyBefore(availableNotices(notices.filter(n=>n.id!==notice.id),policy),notice.region,asOf);
    const counts=Array(15).fill(0);
    for(const n of past)for(const p of rankedPrices(n).filter(p=>p.selected))counts[p.rank-1]++;
    const rank=counts.indexOf(Math.max(...counts))+1;
    try{
      const output=predict(model,notices,notice,rank,asOf,{allowTest});
      return {...output,automatic:true,recommendationMethod:'model',methodLabel:model.model.type==='ann'?'ANN 자동 추천':'부스팅 자동 추천',
        candidates:[output.candidates[0]],automaticDecision:{rankRule:'과거 6개월 최다 선정 가격순위 · 동률은 높은 가격순',
          historyCount:past.length,rankCount:counts[rank-1],modelRule:'예측시점 이전 학습·선택 자료를 사용한 최신 버전',
          candidateRule:'모델점수가 가장 높은 후보 1개',historyIds:past.map(n=>n.id)}};
    }catch(error){
      if(!(error instanceof DomainError)||!recoverable.has(error.code))throw error;
      fallbackReason=error.message;
    }
  }
  need(Number(notice.price?.minimumRatePercent)===97&&Number(notice.price?.maximumRatePercent)===103,
    'AUTO_RANGE_UNSUPPORTED','학습 모델이 없는 경우에는 예가 범위 ±3% 공고만 자동 통계 추천을 지원합니다.');
  const cutoff=Date.parse(asOf),past=rankHistory.filter(row=>row.id!==notice.id&&regionOf(row.region)===notice.region&&openedAt(row)+7*86400000<cutoff)
    .sort((a,b)=>openedAt(a)-openedAt(b)||a.id.localeCompare(b.id));
  need(past.length>=20,'INSUFFICIENT_AUTO_HISTORY','이 공고의 예측시점 이전에 이용 가능한 같은 참가제한 지역의 검산 자료가 20건 이상 필요합니다.');
  need(past.every(row=>row.base>0&&row.prices.length===15&&row.prices.filter(p=>p[2]===1).length===4&&
    row.prices.every(p=>Number.isFinite(p[0])&&p[0]*100/row.base>=97&&p[0]*100/row.base<=103)),
    'INVALID_AUTO_HISTORY','자동 추천용 과거 가격 자료의 검산에 실패했습니다.');
  const rawRate=past.reduce((sum,row)=>sum+row.prices.filter(p=>p[2]===1).reduce((s,p)=>s+p[0]*100/row.base,0)/4,0)/past.length;
  const rate=rawRate.toFixed(5),canPrice=notice.price?.conditionsReviewed&&!notice.price.unsupportedConditions.length;
  return {automatic:true,recommendationMethod:'historical-mean',methodLabel:'과거 선정가격 평균',modelVersion:'auto-history-mean-v1',
    availability:availabilityInfo(RESEARCH_POLICY),researchOnly:true,trainingCount:past.length,trainingConfig:null,
    trainingCutoff:new Date(openedAt(past.at(-1))+7*86400000).toISOString(),analysisAsOf:asOf,
    condition:{assumedPriceRank:null,scenarioType:'historical-selected-price-mean'},
    candidates:[{id:'candidate-auto',rate,rawRate,interval:binFor(rate),score:null,amountWon:canPrice?amountForRate(rate,notice.price):null,
      combination:[],explanation:'과거 각 공고에서 실제 선정된 네 예비가격의 평균 사정률을 집계했습니다.'}],
    automaticDecision:{fallbackReason,historyCount:past.length,historyFrom:past[0].opened,historyTo:past.at(-1).opened,
      historyIds:past.map(row=>row.id),candidateRule:'공고별 선정 네 가격 평균 사정률의 전체 평균'},
    precisionNote:'개찰 후 7일부터 자료를 이용할 수 있다고 가정한 연구용 추정입니다. 다섯 자리 표시는 계산값의 표시 자릿수입니다.'};
}

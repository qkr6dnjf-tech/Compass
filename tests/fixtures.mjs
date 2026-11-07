// Synthetic engineering fixtures ONLY. Never used as actual auction evidence.
import {validateNotice,rankedPrices,lowerForExpected} from '../lib/domain.mjs';
export function fixtureNotices(count=100){
 return Array.from({length:count},(_,i)=>{
  const opening=new Date(Date.UTC(2025,0,2+i*2,2)),before=new Date(+opening-3600000),base=100000000+i*10317;
  const prices=Array.from({length:15},(_,j)=>({drawNo:(j*7)%15+1,amountWon:Math.round(base*(1.0285-j*.00408+Math.sin(i*.41+j*1.37)*.00051)),selected:[1,5,9,13].includes(j),drawCount:[1,5,9,13].includes(j)?20+(j%3):4+(j%4)}));
  const expected=Math.floor(prices.filter(x=>x.selected).reduce((s,x)=>s+x.amountWon,0)/4);
  const n={number:'TEST-'+String(i).padStart(5,'0'),round:'000',rebid:'000',title:'시험자료 · 실제 공고 아님 '+i,region:'전주',industry:'조경식재',publishedAt:new Date(+before-86400000).toISOString(),predictionAt:new Date(+before-60000).toISOString(),deadlineAt:before.toISOString(),openingAt:opening.toISOString(),source:{type:'test-only',note:'Deterministic synthetic test fixture'},price:{baseWon:base,aWon:10000000,lowerRatePercent:'89.745',unitWon:1,formula:'a-adjusted',rounding:'ceil',minimumRatePercent:'97',maximumRatePercent:'103',pureCost:null,conditionsReviewed:true,unsupportedConditions:[],source:'test-only'},result:{publishedAt:new Date(+opening+3600000).toISOString(),expectedPriceWon:expected,averageRounding:'floor',prices,participantsComplete:true,participants:[]}};
  const lower=lowerForExpected(expected,n.price);
  n.result.participants=[{companyId:'test-low',name:'시험업체 · 하한미달',amountWon:lower-1000,eligible:true},{companyId:'test-1',name:'시험업체 1 · 실제 업체 아님',amountWon:lower+50000,eligible:true},{companyId:'test-2',name:'시험업체 2 · 실제 업체 아님',amountWon:lower+150000,eligible:true}];
  return validateNotice(n);
 });
}

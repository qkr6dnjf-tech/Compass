import {writeFileSync} from 'node:fs';
import {forecastRanks} from '../lib/rank-forecast.mjs';
import {mergedRankHistory,rankStatistics} from '../lib/rank-history.mjs';
const records=mergedRankHistory([]);
const end=Date.parse(records.at(-1).opened.replace(' ','T')+'+09:00');
const first=end-365*86400000;
const cases=[];
for(const target of records){
  const date=Date.parse(target.opened.replace(' ','T')+'+09:00');
  if(date<first)continue;
  const past=records.filter(r=>Date.parse(r.opened.replace(' ','T')+'+09:00')+7*86400000<date);
  if(past.length<60)continue;
  const stats=rankStatistics(past);
  const actual=target.prices.map(p=>p[0]*100/target.base);
  const selected=target.prices.flatMap((p,i)=>p[2]?[i+1]:[]);
  const final=selected.reduce((sum,i)=>sum+actual[i-1],0)/4;
  cases.push({opened:target.opened,id:target.id,methods:Object.fromEntries(['median','mean'].map(method=>{
    const prediction=forecastRanks(stats,method);
    return [method,{
      priceMAE:prediction.estimates.reduce((sum,r)=>sum+Math.abs(r.rate-actual[r.rank-1]),0)/15,
      matches:prediction.selectedRanks.filter(i=>selected.includes(i)).length,
      finalError:Math.abs(prediction.finalRate-final),
    }];
  }))});
}
const average=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const report={sourceCount:records.length,count:cases.length,from:cases[0].opened.slice(0,10),to:cases.at(-1).opened.slice(0,10),
  timingAssumption:'개찰일 기준 순차 검증 · 이전 결과는 개찰 후 7일부터 이용 가능하다고 가정',
  randomExpectedMatches:16/15,methods:Object.fromEntries(['median','mean'].map(method=>[method,{
    priceMAE:average(cases.map(c=>c.methods[method].priceMAE)),
    averageMatches:average(cases.map(c=>c.methods[method].matches)),
    exactMatches:cases.filter(c=>c.methods[method].matches===4).length,
    finalMAE:average(cases.map(c=>c.methods[method].finalError)),
  }]))};
writeFileSync('data/rank-forecast-validation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));

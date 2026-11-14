export function forecastRanks(statistics, method) {
  if (!['median','mean'].includes(method)) throw new Error('평균 또는 중앙값을 선택하세요.');
  if (statistics.count < 1 || statistics.ranks.length !== 15) throw new Error('예측 자료가 부족합니다.');
  const selectedRanks = [...statistics.ranks]
    .sort((a,b)=>b.selectedCount-a.selectedCount || a.rank-b.rank)
    .slice(0,4).map(r=>r.rank).sort((a,b)=>a-b);
  const estimates = statistics.ranks.map(r=>({rank:r.rank,rate:r[method]}));
  const selectedRates = estimates.filter(r=>selectedRanks.includes(r.rank));
  return {method,selectedRanks,estimates,finalRate:selectedRates.reduce((sum,r)=>sum+r.rate,0)/4};
}

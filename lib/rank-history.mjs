import history from '../data/rank-history.json' with {type:'json'};

// Only verified ±3% histories participate. Daily corrections replace the same notice key.
export function mergedRankHistory(updates) {
  const records = new Map(history.map(row => [row.id, row]));
  for (const entry of updates) {
    if (entry.cancelled) {
      for (const id of records.keys()) {
        const [number, round] = id.split(':');
        if (number === entry.number && round <= entry.round) records.delete(id);
      }
      continue;
    }
    const n = entry.notice;
    if (!n?.result) continue;
    records.delete(n.id);
    if (Number(n.price?.minimumRatePercent) !== 97 || Number(n.price?.maximumRatePercent) !== 103) continue;
    const base = n.price.baseWon;
    const prices = n.result.prices.map(p => [p.amountWon,p.drawNo,Number(p.selected),p.drawCount ?? null])
      .sort((a,b) => b[0]-a[0] || a[1]-b[1]);
    if (!(base>0) || prices.length!==15 || new Set(prices.map(p=>p[1])).size!==15 ||
        prices.filter(p=>p[2]).length!==4 || !prices.every(p=>p[0]*100/base>=97 && p[0]*100/base<=103)) continue;
    const openedAt = new Date(n.result.actualOpenedAt || n.openingAt);
    const opened = new Date(openedAt.getTime()+9*3600000).toISOString().slice(0,19).replace('T',' ');
    records.set(n.id,{id:n.id,title:n.title,region:n.region,opened,base,prices});
  }
  return [...records.values()].sort((a,b)=>a.opened.localeCompare(b.opened)||a.id.localeCompare(b.id));
}

export function rankStatistics(records) {
  const count=records.length;
  const ranks=count?Array.from({length:15},(_,index)=>{
    const values=records.map(r=>r.prices[index][0]*100/r.base).sort((a,b)=>a-b);
    const middle=Math.floor(count/2);
    const selectedCount=records.filter(r=>r.prices[index][2]===1).length;
    return {rank:index+1,selectedCount,selectionFrequency:selectedCount/count,mean:values.reduce((a,b)=>a+b,0)/count,
      median:count%2?values[middle]:(values[middle-1]+values[middle])/2};
  }):[];
  return {count,from:records.at(0)?.opened.slice(0,10),to:records.at(-1)?.opened.slice(0,10),ranks};
}
export function rankCSV(records) {
  const lines=['공고번호,기초금액(원),번호,사정률(%),편차(%p),원본추첨번호,선정여부,추첨횟수'];
  for (const r of records) r.prices.forEach(([price,draw,selected,votes],i)=>{
    lines.push([r.id,r.base,i+1,(price*100/r.base).toFixed(5),i?((r.prices[i-1][0]-price)*100/r.base).toFixed(5):'',draw,selected?'Y':'N',votes??''].join(','));
  });
  return '\uFEFF'+lines.join('\r\n');
}

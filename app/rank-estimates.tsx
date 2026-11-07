'use client';
import {useEffect,useState} from 'react';
type Row={rank:number;mean:number;median:number};
type Result={count:number;from:string;to:string;ranks:Row[]};
export default function RankEstimates(){
  const [method,setMethod]=useState<'median'|'mean'>('median');
  const [result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setError('');
    fetch('/api/rank-statistics',{cache:'no-store',signal:controller.signal}).then(async r=>{
      if(!r.ok)throw Error();return r.json() as Promise<Result>;
    }).then(setResult).catch(()=>{if(!controller.signal.aborted)setError('사정률 자료를 불러오지 못했습니다.');});
    return ()=>controller.abort();
  },[attempt]);
  return <section className="panel">
    <div className="section-title"><h2>가격순 1~15위 예측</h2><span className="tag neutral">예가 범위 ±3%</span></div>
    <p className="muted">각 공고의 예비가격을 높은 순서대로 정렬한 뒤, 같은 순위의 과거 사정률로 추정합니다.</p>
    <div className="count-presets" role="group" aria-label="예측 기준">{(['median','mean'] as const).map(m=><button key={m} type="button" className={m===method?'selected':''} aria-pressed={m===method} onClick={()=>setMethod(m)}>{m==='median'?'중앙값':'평균'}</button>)}</div>
    {error?<p role="alert">{error} <button className="text-button" onClick={()=>setAttempt(attempt+1)}>다시 시도</button></p>:!result?<p role="status">자료를 불러오는 중…</p>:<>
      <p className="micro">검산된 공고 {result.count.toLocaleString('ko-KR')}건 · 개찰일 {result.from} ~ {result.to}</p>
      <table><thead><tr><th>가격순위</th><th>예측 사정률 ({method==='median'?'중앙값':'평균'})</th></tr></thead><tbody>{result.ranks.map(r=><tr key={r.rank}><td>{r.rank}위</td><td>{r[method].toFixed(5)}%</td></tr>)}</tbody></table>
      <a className="text-button" href="/api/rank-csv" download="공고별_사정률.csv">공고별 사정률·선정 번호 CSV</a>
    </>}
  </section>;
}

'use client';
import {useEffect,useState} from 'react';
import {forecastRanks} from '../lib/rank-forecast.mjs';
import validation from '../data/rank-forecast-validation.json';

type Method='median'|'mean';
type Row={rank:number;mean:number;median:number;selectedCount:number;selectionFrequency:number};
type Result={count:number;from:string;to:string;ranks:Row[]};
export default function RankEstimates(){
  const [method,setMethod]=useState<Method>('median');
  const [result,setResult]=useState<Result|null>(null);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [showSelection,setShowSelection]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    setError('');
    fetch('/api/rank-statistics',{cache:'no-store',signal:controller.signal}).then(async r=>{
      if(!r.ok)throw Error();return r.json() as Promise<Result>;
    }).then(setResult).catch(()=>{if(!controller.signal.aborted)setError('사정률 자료를 불러오지 못했습니다.');});
    return ()=>controller.abort();
  },[attempt]);
  const prediction=result?.ranks.length===15?forecastRanks(result,method):null;
  const report=validation.methods[method];
  function chooseMethod(value:Method){setMethod(value);setShowSelection(false);}
  return <div className="model-workspace rank-pipeline">
    <section className="panel">
      <div className="section-title"><h2>가격순 1~15위 예측</h2><span className="tag neutral">예가 범위 ±3%</span></div>
      <p className="muted">각 공고의 예비가격을 높은 순서대로 정렬한 뒤, 같은 순위의 과거 사정률로 추정합니다.</p>
      <div className="count-presets" role="group" aria-label="예측 기준">{(['median','mean'] as const).map(m=><button key={m} type="button" className={m===method?'selected':''} aria-pressed={m===method} onClick={()=>chooseMethod(m)}>{m==='median'?'중앙값':'평균'}</button>)}</div>
      {error?<p role="alert">{error} <button className="text-button" onClick={()=>setAttempt(attempt+1)}>다시 시도</button></p>:!result?<p role="status">자료를 불러오는 중…</p>:<>
        <p className="micro">검산된 공고 {result.count.toLocaleString('ko-KR')}건 · 개찰일 {result.from} ~ {result.to}</p>
        <table><thead><tr><th>가격순위</th><th>예측 사정률 ({method==='median'?'중앙값':'평균'})</th></tr></thead><tbody>{result.ranks.map(r=><tr key={r.rank} className={showSelection&&prediction?.selectedRanks.includes(r.rank)?'my-row':''}><td>{r.rank}위</td><td>{r[method].toFixed(5)}%</td></tr>)}</tbody></table>
        <a className="text-button" href="/api/rank-csv" download="공고별_사정률.csv">공고별 사정률·선정 번호 CSV</a>
      </>}
    </section>
    <section className="panel">
      <div className="section-title"><h2>선정될 4개 가격순위 예측</h2></div>
      <p className="muted">같은 자료에서 실제 선정 횟수가 많은 가격순위 4개를 고릅니다. 동률은 높은 가격순으로 처리합니다.</p>
      <button className="primary" type="button" disabled={!prediction} onClick={()=>setShowSelection(true)}>선정될 4개 순위 예측</button>
      {showSelection&&prediction&&result&&<div className="table-scroll"><table aria-label="예측한 네 가격순위"><thead><tr><th>예측 가격순위</th><th>예측 사정률</th><th>과거 선정</th></tr></thead><tbody>{prediction.selectedRanks.map((rank:number)=>{
        const row=result.ranks.find(r=>r.rank===rank)!;
        return <tr key={rank}><td>{rank}위</td><td>{row[method].toFixed(5)}%</td><td>{row.selectedCount}건 / {result.count}건 ({(row.selectionFrequency*100).toFixed(1)}%)</td></tr>;
      })}</tbody></table></div>}
    </section>
    {showSelection&&prediction&&<section className="panel" aria-label="최종 사정률 예측 결과">
      <div className="section-title"><h2>최종 사정률 예측</h2></div>
      <div className="metric"><span>선택한 네 예측 사정률의 산술평균</span><strong>{prediction.finalRate.toFixed(5)}%</strong></div>
      <p className="micro">가격순 {prediction.selectedRanks.join(' · ')}위 · {method==='median'?'중앙값':'평균'} 기준 · 반올림 전 값으로 네 가격의 평균을 계산했습니다.</p>
    </section>}
    <section className="panel">
      <div className="section-title"><h2>기준모델 검증 성적</h2></div>
      <p className="micro">기본 {validation.sourceCount.toLocaleString('ko-KR')}건 중 {validation.from} ~ {validation.to}의 {validation.count}건 · {validation.timingAssumption}</p>
      <table><tbody>
        <tr><th>15개 사정률 평균 절대오차</th><td>{report.priceMAE.toFixed(5)}%p</td></tr>
        <tr><th>선정 순위 평균 적중 개수</th><td>{report.averageMatches.toFixed(2)} / 4개</td></tr>
        <tr><th>선정 순위 4개 모두 적중</th><td>{report.exactMatches} / {validation.count}건</td></tr>
        <tr><th>최종 사정률 평균 절대오차</th><td>{report.finalMAE.toFixed(5)}%p</td></tr>
      </tbody></table>
      <p className="micro">무작위 네 순위 선택의 기대 적중은 {validation.randomExpectedMatches.toFixed(2)}개입니다. 현재 선정 빈도 기준모델에서는 이 기준보다 높은 평균 적중이 확인되지 않았습니다.</p>
    </section>
  </div>;
}

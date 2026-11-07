'use client';
import {useEffect,useState} from 'react';
import {Download,RefreshCw,ChevronDown} from 'lucide-react';
import {ANN_PRESETS,ANN_EPOCHS,architectureLabel,hiddenLayersFor,modelLabel,parameterCount} from '../lib/ann-config.mjs';
type Any=any;
const pct=(v:Any)=>v==null?'—':`${(v*100).toFixed(1)}%`;
const date=(v:Any)=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}):'—';
export default function ModelPanel({models,completedCount,busy,onTrain,onDownload,onData,trainingProgress}:Any){
 const [architecture,setArchitecture]=useState('32-16');
 const annHiddenLayers=ANN_PRESETS.find(p=>p.id===architecture)!.hiddenLayers;
 const [countInput,setCountInput]=useState('30'),[plan,setPlan]=useState<Any>(null),[planError,setPlanError]=useState(''),[checking,setChecking]=useState(false),[viewVersion,setViewVersion]=useState(''),[availabilityPolicy,setAvailabilityPolicy]=useState('opening-plus-7d');
 const count=Number(countInput),valid=Number.isInteger(count)&&count>=20&&count<=400;
 const selected=models.find((m:Any)=>m.version===viewVersion)||models.at(-1);
 useEffect(()=>{setViewVersion(models.at(-1)?.version||'');},[models.length]);
 useEffect(()=>{
  setPlan(null);setPlanError('');if(!valid){setChecking(false);return;}
  const controller=new AbortController();setChecking(true);
  const timer=setTimeout(async()=>{try{const r=await fetch(`/api/training-plan?trainingCount=${count}&availabilityPolicy=${availabilityPolicy}`,{cache:'no-store',signal:controller.signal}),body:Any=await r.json();if(!r.ok)throw new Error(body.message);if(!controller.signal.aborted)setPlan(body);}catch(e:Any){if(!controller.signal.aborted)setPlanError(e.message);}finally{if(!controller.signal.aborted)setChecking(false);}},180);
  return()=>{clearTimeout(timer);controller.abort();};
 },[count,valid,completedCount,models.length,availabilityPolicy]);
 return <div className="model-workspace">
  <section className="panel training-panel">
   <div className="section-title"><h2>학습 설정</h2><span className="tag neutral">개찰자료 {completedCount}건</span></div>
   <div className="training-controls"><div><label className="field-title" id="training-count-label">학습에 사용할 공고 수</label><div className="count-presets" role="group" aria-labelledby="training-count-label">{[30,60,200].map(n=><button key={n} aria-pressed={count===n} className={count===n?'selected':''} onClick={()=>setCountInput(String(n))}>{n}건</button>)}</div></div><label className="custom-count">직접 입력<div><input type="number" aria-label="학습 공고 수 직접 입력" min="20" max="400" step="1" value={countInput} onChange={e=>setCountInput(e.target.value)}/><span>건</span></div></label><button className="primary" disabled={!!busy||checking||!valid||!plan?.ready} aria-describedby="training-status" title={plan?.reason||'선택한 공고 수로 모델 학습'} onClick={()=>onTrain(count,availabilityPolicy,annHiddenLayers)}><RefreshCw size={16} className={busy==='train'?'spin':''}/>{busy==='train'?`${count}건 학습 중…`:`${valid?count+'건 ':''}학습 실행`}</button></div>
   {busy==='train'&&<p className="micro" role="status">학습 진행: {trainingProgress?.completedEpochs||0} / 60 epoch · 완료까지 이 창을 열어 두세요.</p>}
   <div className={`training-readiness ${plan?.ready?'ready':''}`}>
    <div><strong>{checking?'자료 확인 중':planError?'확인 실패':plan?.ready?'학습 가능':'학습 대기'}</strong><span>등록된 개찰자료 {completedCount}건 · 학습 후보 {plan?.trainingAvailable??'—'}건</span></div>
   <div className={`plan-status ${plan?.ready?'ready':''}`} id="training-status" role="status">{!valid?'20~400 사이의 정수를 입력하세요.':checking?'사용 가능한 자료 확인 중…':planError||plan?.reason||(plan?.ready?`학습 가능 · 학습 후보 ${plan.trainingAvailable}건 중 최근 ${count}건 사용`:'자료 확인 대기')}</div>
    {!checking&&plan&&!plan.ready&&<button className="text-button" onClick={onData}>수집 자료와 제외 사유 확인 →</button>}
   </div>
   <div className="availability-setting ann-setting"><label>ANN 은닉층 구성<select aria-label="ANN 은닉층 구성" value={architecture} disabled={!!busy} onChange={e=>setArchitecture(e.target.value)}>{ANN_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label><p>입력 13 → {annHiddenLayers.join(' → ')} → 출력 1 · 학습 파라미터 {parameterCount(annHiddenLayers).toLocaleString()}개 · {ANN_EPOCHS} epoch<br/>은닉층 tanh · 출력 sigmoid. 후보별 평가 점수를 계산합니다.</p></div>
   <div className="availability-setting"><label>자료 이용시점 기준<select aria-label="자료 이용시점 기준" value={availabilityPolicy} onChange={e=>setAvailabilityPolicy(e.target.value)}><option value="opening-plus-7d">연구용 · 실제 개찰 후 7일</option><option value="observed">확인된 공개·수집시각</option></select></label><p>{availabilityPolicy==='opening-plus-7d'?'공개시각 미확인 자료에 개찰 후 7일 가정을 적용합니다. 모델과 성적에 연구용으로 기록됩니다.':'결과가 공개됐거나 수집된 시각 이전에는 해당 자료를 사용하지 않습니다.'}</p></div>
   <p className="muted compact">검증 구간 이전의 최근 공고를 선택합니다. 모델 선택용 10건과 최종 검증용 10건은 학습에서 제외합니다.</p>
   <div className="training-allocation" aria-label="자료 분할"><div><span>가중치 학습</span><strong>{valid?count:'—'}<small>건</small></strong></div><span className="allocation-arrow">→</span><div><span>ANN·부스팅 선택</span><strong>10<small>건</small></strong></div><span className="allocation-arrow">→</span><div><span>최종 성적 검증</span><strong>10<small>건</small></strong></div></div>

   {plan?.ready&&<div className="training-period"><span>학습 기간 <b>{date(plan.period.trainFrom)} ~ {date(plan.period.trainEnd)}</b></span><span>최종 검증 <b>{date(plan.period.testFrom)} ~ {date(plan.period.testTo)}</b></span></div>}
   <details className="method-details"><summary>공고 선택 기준 <ChevronDown size={14}/></summary><ul><li>선택한 ANN 구조와 부스팅을 비교해 모델 선택 구간의 성적이 더 높은 모델을 저장합니다. 동률이면 ANN을 저장합니다.</li><li>같은 자료에서 층 구성과 30·60·200건을 비교할 때 모델 선택·최종 검증 공고는 동일합니다.</li><li>이전 결과가 다음 구간의 예측시점 전에 공개된 경우에만 사용합니다.</li><li>최근 6개월 특징을 계산할 선행 공고는 선택한 학습 건수와 별도입니다.</li><li>자료가 부족하면 선택한 건수를 줄이거나 다른 값으로 대체하지 않습니다.</li></ul>{plan?.excluded.length>0&&<p>검산·선행자료·시간순 조건으로 제외된 공고: {plan.excluded.length}건</p>}</details>
  </section>
  <section className="panel model-report">
   <div className="section-title"><h2>검증 성적</h2>{models.length>0&&<select aria-label="검증할 모델 버전" value={selected?.version||''} onChange={e=>setViewVersion(e.target.value)}>{models.slice().reverse().map((m:Any)=><option key={m.version} value={m.version}>{m.report.trainCount}건 · {modelLabel(m)} · {date(m.createdAt)} · {m.version.slice(-6)}</option>)}</select>}</div>
   {!selected?<div className="plain-empty"><strong>학습된 모델 없음</strong><p>자료 등록 후 학습을 실행하면 성적이 표시됩니다.</p></div>:<>
    {selected.researchOnly&&<p className="research-note">{selected.availability?.note}</p>}
    <p className="micro">학습한 ANN: 은닉층 {hiddenLayersFor(selected).length}개 · 입력 13 → {architectureLabel(selected)} → 출력 1 · {selected.trainingConfig?.annEpochs||60} epoch</p>
    <div className="model-report-meta"><span>{modelLabel(selected)}</span><span>학습 {selected.report.trainCount}건</span><span>검증 {selected.report.testCount}건</span><span>{date(selected.report.period.testFrom)} ~ {date(selected.report.period.testTo)}</span></div>
    <div className="table-scroll"><table><thead><tr><th>모델</th><th>선택 후보 1순위율</th><th>두 후보 중 성공 포함</th><th>하한 미달</th><th>검증 건수</th></tr></thead><tbody>{selected.report.comparisons.map((c:Any)=><tr key={c.name} className={(c.name==='ANN'&&selected.report.selectedAlgorithm==='ann')||(c.name==='부스팅'&&selected.report.selectedAlgorithm==='boost')?'selected-model-row':''}><td>{c.name}</td><td>{pct(c.selectedFirstRate)}</td><td>{pct(c.anyCandidateFirstRate)}</td><td>{pct(c.belowRate)}</td><td>{c.count}건</td></tr>)}</tbody></table></div>
    <div className="report-notes"><p>{selected.report.improved?'기준선 대비 선택 후보 1순위율 상승':'기준선 대비 선택 후보 1순위율 개선 없음'}</p><span>후보 A 사전 선택 기준 · 동가 제외 · 모델 선택/검증 자료 재사용 {selected.report.validationReusedCount}건</span></div>
    <details className="method-details"><summary>모델 정보와 평가 기준 <ChevronDown size={14}/></summary><p>가격조건을 충족하고 양의 잔차를 가지며, 유효 업체보다 낮은 투찰금액으로 단독 가격 1순위가 되는지를 학습합니다.</p><p>학습 종료 {date(selected.trainingCutoff)} · 모델 선택 종료 {date(selected.selectionCutoff)}<br/>버전 {selected.version}</p><p>모델점수는 보정된 성공확률이 아닙니다. 사정률 다섯 자리는 출력 정밀도입니다.</p><button className="text-button" onClick={()=>onDownload(selected.version)}><Download size={15}/> 모델 파일 다운로드</button></details>
   </>}
  </section>
  <section className="panel"><div className="section-title"><h2>학습 이력</h2><span className="micro">{models.length}개 버전</span></div>{models.length?<div className="table-scroll"><table><thead><tr><th>생성일</th><th>학습 공고</th><th>모델</th><th>최종 검증 기간</th><th>검증 건수</th><th/></tr></thead><tbody>{models.slice().reverse().map((m:Any)=><tr key={m.version}><td>{date(m.createdAt)}</td><td><strong>{m.report.trainCount}건</strong></td><td>{modelLabel(m)}</td><td>{date(m.report.period.testFrom)} ~ {date(m.report.period.testTo)}</td><td>{m.report.testCount}건</td><td><button className="text-button" onClick={()=>setViewVersion(m.version)}>성적 보기</button><button className="icon-button" aria-label={`${m.version} 다운로드`} onClick={()=>onDownload(m.version)}><Download size={15}/></button></td></tr>)}</tbody></table></div>:<p className="muted compact">저장된 학습 이력이 없습니다.</p>}</section>
 </div>;
}

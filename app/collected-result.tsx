'use client';
import {useEffect,useState} from 'react';
import {rankedPrices} from '../lib/domain.mjs';
const won=(v:number)=>v.toLocaleString('ko-KR')+'원';
const date=(v:string)=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
export default function CollectedResult({notices,collection}:any){
 const items=notices.filter((n:any)=>n.result&&n.source.type==='official').sort((a:any,b:any)=>b.openingAt.localeCompare(a.openingAt));
 const [selected,setSelected]=useState(items[0]?.id||''),[n,setNotice]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();setNotice(null);setError('');if(!selected)return;fetch(`/api/notice?id=${encodeURIComponent(selected)}`,{signal:controller.signal,cache:'no-store'}).then(async response=>{const body:any=await response.json();if(!response.ok)throw new Error(body.message);setNotice(body);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[selected]);
 const r=n?.result,prices=n?rankedPrices(n):[];
 const download=async()=>{try{const response=await fetch('/api/collection');const data:any=await response.json();if(!response.ok)throw new Error(data.message);const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='나라장터_수집자료.json';a.click();URL.revokeObjectURL(url);}catch(e:any){setError(e.message);}};
 return <section className="panel collected-result">
  <div className="section-title"><h2>수집한 개찰자료</h2><span className="tag neutral">나라장터 공개 원문</span></div>
  <div className="collection-counts"><span>초기 수집 목록 <b>{collection?.catalogCount||items.length}건</b></span><span>사이트 등록 결과 <b>{items.length}건</b></span><span>업체 투찰내역 <b>{(collection?.participantRows||0).toLocaleString()}행</b></span></div>
  <div className="collection-counts">{Object.entries(collection?.regionCounts||{}).map(([region,count]:any)=><span key={region}>{region} <b>{count}건</b></span>)}</div>
  {collection?.collectedAt&&<p className="collection-status">초기 수집 {date(collection.collectedAt)} · 개찰결과 미확보 {collection.statusCounts?.not_opened||0}건 · 정규화 제외 {collection.excluded?.length||0}건</p>}
  <button className="text-button" onClick={download}>수집 자료 JSON 다운로드</button>
  <label className="collected-selector"><select aria-label="수집한 개찰공고 선택" value={selected} onChange={e=>setSelected(e.target.value)}>{items.map((n:any)=><option key={n.id} value={n.id}>{n.region} · {date(n.openingAt)} · {n.title} · {n.number}-{n.round}</option>)}</select></label>
  {error&&<p className="alert error" role="alert">{error}</p>}
  {!n&&!error&&<p className="muted">개찰자료 불러오는 중…</p>}
  {n&&r&&<>
   <p className="collected-title">{n.title}</p><p className="micro">{n.number}-{n.round} · 분류 {n.bidClass} · 재입찰 {n.rebid} · 참가제한 {n.region} · 개찰 {date(r.actualOpenedAt||n.openingAt)}</p>
   <div className="collected-facts"><div><span>예정가격</span><strong>{won(r.expectedPriceWon)}</strong></div><div><span>사정률</span><strong>{(r.expectedPriceWon/n.price.baseWon*100).toFixed(5)}%</strong></div><div><span>참여업체</span><strong>{r.participants.length}개</strong></div><div><span>선정 가격순 번호</span><strong>{prices.filter(p=>p.selected).map(p=>p.rank).join(' · ')}</strong></div></div>
   {n.price.unsupportedConditions.length>0&&<p className="research-note">금액조건 확인 필요: {n.price.unsupportedConditions.join(' / ')}</p>}
   <details className="method-details"><summary>예비가격 15개 확인</summary><div className="table-scroll"><table><thead><tr><th>가격순</th><th>원본 추첨번호</th><th>금액</th><th>추첨수</th><th>선정</th></tr></thead><tbody>{prices.map(p=><tr key={p.drawNo} className={p.selected?'selected-model-row':''}><td>{p.rank}</td><td>{p.drawNo}</td><td>{won(p.amountWon)}</td><td>{p.drawCount}</td><td>{p.selected?'선정':'—'}</td></tr>)}</tbody></table></div></details>
   <details className="method-details"><summary>업체 투찰내역 {r.participants.length}개 확인</summary><div className="table-scroll participant-scroll"><table><thead><tr><th>순위</th><th>업체</th><th>투찰금액</th><th>처리결과</th></tr></thead><tbody>{r.participants.map((p:any)=><tr key={p.companyId}><td>{p.eligible?p.officialRank:'—'}</td><td>{p.name}</td><td>{won(p.amountWon)}</td><td>{p.status||'—'}</td></tr>)}</tbody></table></div></details>
   <p className="micro">선정평균과 공식 예정가격 검산 · 전체 업체목록 확인</p><p className="micro">수집 {date(r.firstObservedAt||r.publishedAt)} · 최초 결과 공개시각 {r.officialPublishedAt?date(r.officialPublishedAt):'미확인'}</p>
  </>}
  {!!collection?.excluded?.length&&<details className="method-details"><summary>정규화 제외 사유 {collection.excluded.length}건</summary><div className="table-scroll collection-exclusions"><table><thead><tr><th>공고</th><th>제외 사유</th></tr></thead><tbody>{collection.excluded.map((e:any)=><tr key={e.id}><td>{e.title}<small>{e.id}</small></td><td>{e.reason}</td></tr>)}</tbody></table></div></details>}
 </section>;
}

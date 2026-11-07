import {need} from './domain.mjs';
export const OBSERVED_POLICY='observed';
export const RESEARCH_POLICY='opening-plus-7d';
export const RESEARCH_NOTE='연구용: 최초 공개시각 미확인 자료는 실제 개찰 후 7일을 이용 가능 시점으로 가정합니다. 실제 공개시각을 검증한 성적이 아닙니다.';
export function availabilityInfo(policy=OBSERVED_POLICY){
 need([OBSERVED_POLICY,RESEARCH_POLICY].includes(policy),'INVALID_AVAILABILITY_POLICY','자료 이용시점 기준을 확인하세요.');
 return {policy,researchOnly:policy===RESEARCH_POLICY,delayDays:policy===RESEARCH_POLICY?7:null,note:policy===RESEARCH_POLICY?RESEARCH_NOTE:'확인된 결과 공개시각 또는 최초 수집시각을 사용합니다.'};
}
export function availableNotices(notices,policy=OBSERVED_POLICY){
 const info=availabilityInfo(policy);if(!info.researchOnly)return notices;
 return notices.map(n=>{
  const r=n.result;
  if(!r||r.publicationTimeBasis!=='first-observed'||!r.actualOpenedAt)return n;
  const opened=Date.parse(r.actualOpenedAt);if(!Number.isFinite(opened))return n;
  const assumed=new Date(opened+7*86400000).toISOString();
  // Keep provenance intact. Never rewrite the source collection or infer an official timestamp.
  const effective=assumed<r.publishedAt?assumed:r.publishedAt;
  return {...n,result:{...r,publishedAt:effective,firstObservedAt:r.firstObservedAt||r.publishedAt,availabilityAssumed:true,availabilityPolicy:policy}};
 });
}

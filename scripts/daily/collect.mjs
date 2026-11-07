const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.resolve(process.env.DAILY_BATCH_DIR);
for(const d of [out,path.join(out,'raw'),path.join(out,'normalized')])await fs.mkdir(d,{recursive:true});
const limit=Math.min(400,Number(process.env.COLLECT_LIMIT||400));
const detailLimit=Math.min(400,Number(process.env.COLLECT_DETAIL_LIMIT||400));
const listOnly=process.argv.includes('--list-only');
const privateKey=/(?:tel|fax|email|eml|mob|mbl|rprs|ceo|repr|chrg|psnm|user|birth|rrno|sbrno|brno|bzmnNo|bzmnRegNo|bsno|kbrdrId|chnrgId|picNm|picInfo|picId|Blff|exctvr|tlph|aprvrId|prcrId|fncrId|exnrId|atmgId|ctcrId|fncrNm|exnrNm|aprvrNm|prcrNm|chnrgNm|atmgNm|ctcrNm)/i;
const redact=x=>Array.isArray(x)?x.map(redact):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>!privateKey.test(k)).map(([k,v])=>[k,redact(v)])):x;
const arr=x=>Array.isArray(x)?x:x&&typeof x==='object'?[x]:[];
const numberOrNull=x=>x===null||x===undefined||x===''?null:Number(x);
const yesNoOrNull=x=>x==='Y'?true:x==='N'?false:null;
const decode=x=>String(x??'').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>').replace(/<[^>]*>/g,'');
const regionsOf=d=>[...decode(d?.dmItemMap?.rgnLmtCn).matchAll(/\[([^\]]+)\]/g)].map(x=>x[1].trim());
const write=async(name,data)=>{const f=path.join(out,name);await fs.writeFile(f+'.tmp',JSON.stringify(data,null,2));await fs.rename(f+'.tmp',f)};
let state;try{state=JSON.parse(await fs.readFile(path.join(out,'checkpoint.json'),'utf8'))}catch{state={startedAt:new Date().toISOString(),notices:{},catalogCount:0}};
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||undefined,headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1200}});
const page=await context.newPage();page.setDefaultTimeout(15000);
const net=[];const pending=new Set();
page.on('response',r=>{if(!['xhr','fetch'].includes(r.request().resourceType())||!/(srchBidPbanc|selectFacilAnncMngV|selectOnbsRsltSbidCstn|selectRsvePrceInfo)\.do/.test(r.url()))return;
 const task=(async()=>{let body;try{body=redact(await r.json())}catch{return}net.push({url:r.url(),status:r.status(),method:r.request().method(),post:r.request().postData(),observedAt:new Date().toISOString(),body})})();pending.add(task);task.finally(()=>pending.delete(task));
});
page.on('dialog',async d=>{console.log(JSON.stringify({event:'dialog',text:d.message()}));await d.dismiss()});
const quiet=async(ms=200)=>{await page.waitForTimeout(ms);await Promise.allSettled([...pending])};
const last=(suffix,start=0)=>net.slice(start).filter(x=>x.url.endsWith(suffix)).at(-1);
let previousReadActionAt=0;
const clickResponse=async(action,suffix)=>{const gap=1000-(Date.now()-previousReadActionAt);if(gap>0)await quiet(gap);previousReadActionAt=Date.now();const waiting=page.waitForResponse(r=>r.url().endsWith(suffix),{timeout:25000});try{await action();const r=await waiting;await r.finished();await quiet();return last(suffix)}catch(e){waiting.catch(()=>{});throw e}};
const closeAll=async()=>{for(let i=0;i<12;i++){const c=page.locator('button[aria-label="창닫기"]:visible').last();if(!await c.count())return;await c.click();await quiet(200)}};
const checkpoint=async()=>{state.updatedAt=new Date().toISOString();await write('checkpoint.json',state)};
try{
 await page.goto('https://www.g2b.go.kr/',{waitUntil:'domcontentloaded',timeout:60000});await quiet(10000);await closeAll();
 await page.locator('input[type="text"][title="검색어를 입력하세요."]:enabled:visible').first().fill('R26BK01491586');
 await clickResponse(()=>page.locator('a[id$="btnBidPbancDtlSrch"]:visible').click(),'/srchBidPbanc.do');
 await page.locator('#mf_wfm_container_sbxBizNo').fill('');await page.locator('#mf_wfm_container_sbxBizNo').press('Tab');
 await page.locator('#mf_wfm_container_sbxOdnLmtLgdngCd').selectOption({label:'전북특별자치도'});
 await page.locator('#mf_wfm_container_sbxBsneSe_input_0').uncheck();await page.locator('#mf_wfm_container_sbxBsneSe_input_4').check();
 await page.locator('#mf_wfm_container_btnFindMind').click();await quiet(1800);
 await page.locator('#FIIB004_01_wframe_popupCnts_sbxIntpCd').fill('4993');await page.locator('#FIIB004_01_wframe_popupCnts_btnS0001').click();await quiet(1500);
 await page.getByText('조경식재ㆍ시설물공사업',{exact:true}).last().dblclick();await quiet(500);
 await page.locator('input[type="radio"][title="최근 6개월"]').check();
 if(process.env.COLLECT_START&&process.env.COLLECT_END){
  const startInput=page.locator('input[id$="_ibxStrDay"]:visible'),endInput=page.locator('input[id$="_ibxEndDay"]:visible');
  const typeDate=async(input,value)=>{await input.click();await input.press('ControlOrMeta+A');await input.pressSequentially(value);await input.press('Tab');await quiet(200)};
  const previousStart=(await startInput.inputValue()).replace(/\D/g,'');
  if(process.env.COLLECT_END<previousStart)await typeDate(endInput,previousStart);
  await typeDate(startInput,process.env.COLLECT_START);await typeDate(endInput,process.env.COLLECT_END);
 }
 await clickResponse(()=>page.locator('#mf_wfm_container_btnS0001').click(),'/srchBidPbanc.do');
 const countSelect=page.locator('select[id^="mf_wfm_container_"]').filter({has:page.locator('option',{hasText:/^100$/})});
 // DOM-observed page-size selector; one matching select in the search result screen.
 await countSelect.selectOption({label:'100'});
 await clickResponse(()=>page.locator('input[type="button"][value="적용"]:visible').click(),'/srchBidPbanc.do');
 const first=last('/srchBidPbanc.do');const total=Number(first.body.dlSetParamM.totalSize);const pages=Math.min(Math.ceil(total/100),Math.ceil(limit/100));
 const catalog=[];const pageRows=[];
 for(let p=1;p<=pages;p++){
  if(p>1)await clickResponse(()=>page.locator('#mf_wfm_container_pglList_page_'+p).click(),'/srchBidPbanc.do');
  const response=last('/srchBidPbanc.do');await write('raw/list-page-'+p+'.json',response);
  const rows=response.body.dlTotalSrchL;pageRows.push(rows);
  for(let i=0;i<rows.length&&catalog.length<limit;i++){const r=rows[i];catalog.push({id:r.bizNo,order:r.bizOrd,key:r.bizNo+'-'+r.bizOrd,title:decode(r.bizNm),page:p,row:i,regionRestrictionCode:r.pbancSrchItm04,noticeStatus:r.pbancSrchItm11,agency:r.pbancInstUntyGrpNm,industryCode:r.mindCd,classification:null,rebidOrder:null,openingStatus:null,source:r})}
 }
 state.catalogCount=catalog.length;state.officialTotal=total;await write('catalog.json',{observedAt:new Date().toISOString(),query:JSON.parse(first.post),officialTotal:total,collected:catalog.length,rows:catalog});await checkpoint();
 console.log(JSON.stringify({event:'catalog',total,collected:catalog.length,regions:catalog.reduce((a,x)=>(a[x.regionRestrictionCode]=(a[x.regionRestrictionCode]||0)+1,a),{})}));
 if(catalog.length){const rowHtml=await page.locator('[id$="_0_btnOpenKonepsInfo"]').evaluate(e=>e.closest('tr')?.outerHTML||e.parentElement.outerHTML);await fs.writeFile(path.join(out,'list-row-dom.html'),rowHtml);}
 if(listOnly){console.log(JSON.stringify({event:'list-only-complete'}));}
 else{
  let activePage=pages,attempted=0;
  for(const item of catalog){
   if(state.notices[item.key]?.status&&state.notices[item.key].status!=='error')continue;
   const regionCodes=String(item.regionRestrictionCode).split(/[\s,;]+/).filter(Boolean);
   if(!regionCodes.some(c=>['5200000000','5211000000','5213000000','5214000000'].includes(c))){state.notices[item.key]={status:'out_of_scope_region',reason:'공식 목록 참가제한지역 코드가 전북 광역/전주/군산/익산에 해당하지 않음',regionRestrictionCode:item.regionRestrictionCode};await checkpoint();continue}
   if(Object.values(state.notices).filter(x=>x.status!=='out_of_scope_region').length>=detailLimit){state.detailLimitReached=detailLimit;await checkpoint();console.log(JSON.stringify({event:'detail-limit',limit:detailLimit}));break;}
   if(activePage!==item.page){await clickResponse(()=>page.locator('#mf_wfm_container_pglList_page_'+item.page).click(),'/srchBidPbanc.do');activePage=item.page;}
   const begin=net.length;const saved={key:item.key,title:item.title,observedAt:new Date().toISOString()};
   try{
    const visibleRows=last('/srchBidPbanc.do').body.dlTotalSrchL;
    const visibleIndex=visibleRows.findIndex(r=>r.bizNo===item.id&&r.bizOrd===item.order);
    if(visibleIndex<0)throw new Error('새 공고 추가 등으로 현재 페이지에 해당 번호/차수가 없음. 별도 재조회 필요.');
    const row=page.locator('[id="mf_wfm_container_grdTotalSrch_'+visibleIndex+'_btnOpenKonepsInfo"]').locator('xpath=ancestor::tr');
    await clickResponse(()=>row.getByText(item.title,{exact:false}).last().click(),'/selectFacilAnncMngV.do');
    const detail=last('/selectFacilAnncMngV.do',begin);
    if(detail?.body.dmItemMap?.bidPbancNo!==item.id||detail?.body.dmItemMap?.bidPbancOrd!==item.order)throw new Error('공고번호/차수 일치 확인 실패');
    const registrationNotice=page.locator('.messagebox:visible').filter({hasText:'공사업 등록기준 입찰자격 사실조사 안내'});
    if(await registrationNotice.count()){await registrationNotice.locator('input[id$="_btnConfirm"]').click();await quiet(200);}
    const actualRegions=regionsOf(detail.body);
    saved.actualEligibilityRegion=actualRegions.join(', ');
    saved.regionRestrictionText=detail.body.dmItemMap.rgnLmtCn??null;
    saved.progress=arr(detail.body.dlBidBasePgstL).map(x=>({classification:x.bidClsfNo,rebidOrder:x.bidPrgrsOrd,status:x.bidPgstNm,scheduledOpening:x.onbsPrnmntDt}));
    if(actualRegions.length!==1||!/^전북특별자치도(?:\s*(?:전주시|군산시|익산시))?$/.test(actualRegions[0])){saved.status='out_of_scope_region_detail';saved.reason='공고상세 rgnLmtCn 참가가능지역이 대상 네 지역의 단일 제한과 일치하지 않음';}
    else if(detail.body.dmItemMap.totlPnprTnum===1&&detail.body.dmItemMap.bidMthdNm==='전자시담'){
     saved.status='unsupported_single_estimate';saved.reason='공식 전자시담·단일예가 공고. 15개 복수예가 대상이 아님';
     const opening=last('/selectOnbsRsltSbidCstn.do',begin)?.body?.result;
     saved.openingBiddersCaptured=opening?.successBidInfo?.length??0;
    }
    else{
     const completed=saved.progress.filter(x=>x.status==='개찰완료');
     if(!completed.length){saved.status='not_opened';saved.reason=saved.progress.map(x=>x.status).join(', ')||'개찰완료 버튼 없음';}
     else{
      saved.results=[];
      for(let completedIndex=0;completedIndex<completed.length;completedIndex++){
       const resultBegin=net.length;
       await clickResponse(()=>page.getByRole('button',{name:'개찰완료',exact:true}).nth(completedIndex).click(),'/selectOnbsRsltSbidCstn.do');
       await page.locator('select[id$="sbxRecordCountPerPageCstn"]:visible').selectOption({label:'1000'});
       await clickResponse(()=>page.locator('input[id$="srchBtnCstn"]:visible').click(),'/selectOnbsRsltSbidCstn.do');
       const opening=last('/selectOnbsRsltSbidCstn.do',resultBegin);
       await clickResponse(()=>page.locator('input[id$="cstnBtnRsvePrce"]:visible').click(),'/selectRsvePrceInfo.do');
       const prices=last('/selectRsvePrceInfo.do',resultBegin);
       const normalized=normalize(item,detail,opening,prices);
       const key=[item.key,normalized.notice.classification,normalized.notice.rebidOrder].join('-');
       await write('normalized/'+key+'.json',normalized);
       saved.results.push({key,validations:normalized.validations,firstObservedAt:normalized.provenance.firstObservedAt});
       await page.locator('button[aria-label="창닫기"]:visible').last().click();await quiet(150);
       await page.locator('button[aria-label="창닫기"]:visible').last().click();await quiet(150);
      }
      saved.status=saved.results.every(x=>x.validations.complete)?'complete':'incomplete';
     }
    }
   }catch(e){saved.status='error';saved.reason=String(e.message).slice(0,1200)}
   await write('raw/'+item.key+'.json',{notice:item,observedAt:new Date().toISOString(),responses:net.slice(begin)});
   state.notices[item.key]=saved;await checkpoint();attempted++;
   console.log(JSON.stringify({event:'notice',attempted,...saved}));
   await closeAll();await quiet(1000);
  }
 }
 state.finishedAt=new Date().toISOString();await checkpoint();console.log(JSON.stringify({event:'finished',statuses:Object.values(state.notices).reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{})}));
}finally{await browser.close()}

function normalize(item,d,o,p){
 const price=p.body,opening=o.body.result,detail=d.body;
 if(!price.bsisAmtInfo||!opening)throw new Error('공식 가격/개찰 응답 없음');
 const base=numberOrNull(price.bsisAmtInfo.bsamt),scheduled=numberOrNull(price.bsisAmtInfo.pnpr);
 const aRaw=detail.dmAamtMap?.aamtinfosumamt;const a=aRaw==null||aRaw===''?null:Number(aRaw);
 const prices=arr(price.rsvePrceList).flatMap(row=>[1,2].filter(i=>row['plrlRsvePrceSqno'+i]).map(i=>({originalNumber:Number(String(row['plrlRsvePrceSqno'+i]).replace(/\D/g,'')),amount:Number(row['plrlRsvePrce'+i]),selectionCount:Number(row['drawNotm'+i]),selected:row['etpsDrawYn'+i]==='Y',ratioPct:base?Number(row['plrlRsvePrce'+i])/base*100:null})));
 const ranked=[...prices].sort((a,b)=>b.amount-a.amount);for(const p of prices)p.descendingPriceRank=ranked.findIndex(x=>x.originalNumber===p.originalNumber)+1;
 const bidders=arr(opening.successBidInfo).map(x=>({rowNumber:x.rowNum,companyId:x.etpsUntyGrpNo,companyName:x.grpNm,officialRank:x.onbsRnkg,bidAmount:x.bdngAmt,displayedBidRatioPct:x.bdrt==null?null:Number(x.bdrt),displayedAExcludedBidRatioPct:x.bpfaaExclBdrt==null?null:Number(x.bpfaaExclBdrt),statusCode:x.bidUfnsRsnCd,status:x.bidUfnsRsn,submittedAt:x.slprRcptnDt,chosenOriginalNumbers:(x.rsvePrceNoVal||'').trim().split(/\s+/).filter(Boolean).map(Number),disqualifiedInPrecheck:x.unqlfdExcYn}));
 const selected=prices.filter(x=>x.selected);const mean=selected.length?selected.reduce((s,x)=>s+x.amount,0)/selected.length:null;
 const total=opening.successBidInfo?.[0]?.totCnt??0;
 const validations={priceCount:prices.length,selectedCount:selected.length,selectedMean:mean,selectedMeanEqualsOfficialScheduledPrice:mean!==null&&mean===scheduled,selectedMeanFloorEqualsOfficial:mean!==null&&Math.floor(mean)===scheduled,selectedMeanRoundEqualsOfficial:mean!==null&&Math.round(mean)===scheduled,selectedMeanCeilEqualsOfficial:mean!==null&&Math.ceil(mean)===scheduled,totalBiddersReported:total,biddersCollected:bidders.length,completeBidderList:bidders.length===total&&(total===0||opening.successBidInfo.at(-1)?.nextRowYn==='N'),sumSelectionCounts:prices.reduce((s,x)=>s+x.selectionCount,0),bidderChoiceCount:bidders.reduce((s,x)=>s+x.chosenOriginalNumbers.length,0),selectionsMatchBidderChoices:prices.every(p=>bidders.filter(b=>!b.disqualifiedInPrecheck&&b.chosenOriginalNumbers.includes(p.originalNumber)).length===p.selectionCount),statusCounts:bidders.reduce((a,b)=>(a[b.status]=(a[b.status]||0)+1,a),{})};
 validations.complete=prices.length===15&&selected.length===4&&mean===scheduled&&validations.completeBidderList&&validations.selectionsMatchBidderChoices;
 const firstObservedAt=p.observedAt;
 return {schemaVersion:1,dataKind:'official-public-opening-result',notice:{id:item.id,order:item.order,classification:String(price.pbancInfo.bidClsfNo),rebidOrder:price.pbancInfo.bidPrgrsOrd,title:item.title,agency:price.pbancInfo.pbancInstUntyGrpNm,eligibilityRegion:regionsOf(detail).join(", "),eligibilityRegions:regionsOf(detail),regionRestrictionText:detail.dmItemMap.rgnLmtCn??null,industryRestrictionText:detail.dmItemMap.intpLmtCn??null,industryCodes:item.industryCode,industryName:item.source.mindNm,announcedAt:price.pbancInfo.pbancPstgDt,submissionDeadline:price.pbancInfo.slprRcptDdlnFullDt,actualOpenedAt:price.plrlRsvePrceCalcInfo?.onbsDt,preliminaryPricesCreatedAt:price.plrlRsvePrceCalcInfo?.inptDt,resultPublishedAt:null,resultFirstObservedAt:firstObservedAt,historicalAvailabilityVerified:false,baseAmount:base,aValue:a,aValuePublished:yesNoOrNull(detail.dmAamtMap?.bpfaaRlsYn),aValuePublishedAt:detail.dmAamtMap?.bpfaaRlsDt??null,lowerLimitPct:numberOrNull(price.pbancInfo.scsbdLwlmRat),officialScheduledPrice:scheduled,actualAssessmentRatioPct:base&&scheduled!==null?scheduled/base*100:null,preliminaryPriceRange:price.plrlRsvePrceCalcInfo?.prceCrtRangRtNm,pureConstructionCostApplied:yesNoOrNull(price.pcspInfo?.isPureConstExpsTrget),basePureConstructionCost:numberOrNull(price.pcspInfo?.bsamtPcsp),scheduledPureConstructionCost:numberOrNull(price.bsisAmtInfo?.pnprPcsp),aExcludedBiddingRatioApplied:yesNoOrNull(opening.etcData?.bidPcAamtExclBiddingRatioYn)},prices,bidders,validations,provenance:{site:'https://www.g2b.go.kr/',access:'비로그인 공개 UI 검색/상세/개찰/예가 팝업',firstObservedAt,rawFile:'raw/'+item.key+'.json',resultPublicationTimeEvidence:'별도 결과공개 시각 필드 미확인. 개찰일시와 예가작성일시를 공개시각으로 대체하지 않음.',redaction:'개인 성명·연락처·사업자등록번호·담당자 식별자 필드 제거'}};
}


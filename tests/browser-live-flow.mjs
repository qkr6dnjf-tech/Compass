import {chromium} from 'file:///C:/Users/Jae Hyung/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173',browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/signin-with-chatgpt?return_to=/',{waitUntil:'networkidle'});
 await page.getByLabel('공고 검색').fill('R26BK01805820');assert.equal(await page.locator('.notice-card').count(),0,'Future notice must not be listed as past practice');
 await page.getByRole('button',{name:'개찰 전 기록',exact:true}).click();await page.locator('.notice-card').filter({hasText:'효자공원 정비사업'}).click();
 await page.getByText('가격순 번호별 선정 횟수',{exact:true}).waitFor();await page.locator('.numbers').getByRole('button',{name:'2',exact:true}).click();
 const predictionResponse=page.waitForResponse(r=>r.url().endsWith('/api/predict'));await page.getByRole('button',{name:'후보 산출',exact:true}).click();const prediction=await (await predictionResponse).json();assert.equal(prediction.mode,'live',JSON.stringify(prediction));assert.equal(prediction.notice.result,null);assert(prediction.candidates.every(c=>Number.isSafeInteger(c.amountWon)));
 await page.locator('.candidate').first().waitFor();await page.locator('.candidate').first().click();const savedResponse=page.waitForResponse(r=>r.url().endsWith('/api/save'));await page.getByRole('button',{name:'모의투찰 저장',exact:true}).click();const saved=await (await savedResponse).json();assert.equal(saved.eligibleLive,true);assert.equal(saved.mode,'live');
 await page.getByText('개찰 결과 미등록',{exact:true}).waitFor();const record=await (await page.request.get(base+'/api/record?id='+saved.id)).json();assert.equal(record.result,null);assert.equal(record.priceMapping.length,0);
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'outputs/live-record-desktop.png',fullPage:true});
 const metrics=await (await page.request.get(base+'/api/metrics?mode=live')).json();assert(metrics.savedCount>=1);assert.equal(metrics.completedCount,0);
 assert.deepEqual(errors,[]);writeFileSync('outputs/browser-live-flow.json',JSON.stringify({passed:true,realUpcomingNotice:true,noticeId:prediction.notice.id,modelVersion:prediction.modelVersion,mode:saved.mode,eligibleLive:saved.eligibleLive,resultPending:record.result===null,amountWon:saved.amountWon,selectedRate:saved.selectedRate,price:{baseWon:saved.calculation.baseWon,aWon:saved.calculation.aWon,lowerRatePercent:saved.calculation.lowerRatePercent},liveSavedCount:metrics.savedCount,liveCompletedCount:metrics.completedCount,pageErrors:errors},null,2));console.log('Real upcoming notice live save and pending-result checks passed.');
}finally{await browser.close();}

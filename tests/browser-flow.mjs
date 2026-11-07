import {chromium} from 'file:///C:/Users/Jae Hyung/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {fixtureNotices} from './fixtures.mjs';
import {evaluateAmount} from '../lib/domain.mjs';
const ns=fixtureNotices(),target=ns.at(-1),pending={...target,result:null},base='http://127.0.0.1:5173';
mkdirSync('outputs',{recursive:true});
async function trainThroughAPI(request,input){let r=await request.post(base+'/api/train',{data:input}),body=await r.json();assert(r.ok(),JSON.stringify(body));while(body.jobId){r=await request.post(base+'/api/train',{data:{jobId:body.jobId}});body=await r.json();assert(r.ok(),JSON.stringify(body));}return body;}
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/signin-with-chatgpt?return_to=/',{waitUntil:'networkidle'});
 await page.context().setExtraHTTPHeaders({Origin:base});
 const bootstrap=await (await page.request.get(base+'/api/bootstrap')).json();assert.equal(bootstrap.testMode,true,'Must run only in local fixture mode');
 const imported=await (await page.request.post(base+'/api/import',{data:{schemaVersion:'bid-compass/1.0',notices:[...ns.slice(0,-1),pending]}})).json();assert.equal(imported.accepted,100,JSON.stringify(imported));
 const trained=await trainThroughAPI(page.request,{});assert(trained.version,JSON.stringify(trained));assert(trained.testOnly);assert(['ann','boost'].includes(trained.model.type));
 assert.equal(trained.report.trainCount,30);
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'모델 학습',exact:true}).click();await page.getByRole('button',{name:'60건',exact:true}).click();
 await page.getByRole('status').filter({hasText:'학습 가능'}).waitFor();const trainingResponse=page.waitForResponse(r=>r.url().endsWith('/api/train')&&r.status()!==202,{timeout:300000});await page.getByRole('button',{name:'60건 학습 실행',exact:true}).click();const sixty=await (await trainingResponse).json();assert.equal(sixty.report.trainCount,60,JSON.stringify(sixty));assert.deepEqual(sixty.report.validationIds,trained.report.validationIds);
 await page.getByRole('button',{name:'60건 학습 실행',exact:true}).waitFor();await page.screenshot({path:'outputs/model-trained-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'모의투찰',exact:true}).click();await page.getByLabel('공고 검색').fill('TEST-00099');await page.locator('.notice-card').click();await page.locator('.numbers').getByRole('button',{name:'2',exact:true}).click();
 await page.getByLabel('예측 모델 선택').selectOption(trained.version);
 const req=page.waitForRequest(r=>r.url().endsWith('/api/predict')&&r.method()==='POST'),res=page.waitForResponse(r=>r.url().endsWith('/api/predict'));
 await page.getByRole('button',{name:'후보 산출'}).click();const sent=(await req).postDataJSON(),prediction=await (await res).json();assert.deepEqual(sent,{noticeId:target.id,region:'전주',assumedPriceRank:2,mode:'practice',modelVersion:trained.version});assert.equal(prediction.modelVersion,trained.version,JSON.stringify(prediction));assert.equal(prediction.candidates.length,2);assert(prediction.candidates.every(c=>c.combination.includes(2)));
 await page.locator('.candidate').first().waitFor();const shown=await page.locator('.candidate>strong').allTextContents();prediction.candidates.forEach((c,i)=>assert(shown[i].includes(c.rate)));assert(Math.abs(Number(prediction.candidates[0].rate)-Number(prediction.candidates[1].rate))>=.2);
 await page.locator('.candidate').first().click();await page.screenshot({path:'outputs/synthetic-candidates.png',fullPage:true});const savedResponse=page.waitForResponse(r=>r.url().endsWith('/api/save'));await page.getByRole('button',{name:'모의투찰 저장'}).click();const saved=await (await savedResponse).json();assert.equal(saved.predictionId,prediction.id);assert.equal(saved.modelVersion,trained.version);assert.equal(saved.trainingCount,30);assert.equal(saved.selectedRate,prediction.candidates[0].rate);
 await page.getByText('개찰 결과 미등록',{exact:true}).waitFor();
 const importedResult=await (await page.request.post(base+'/api/import',{data:{schemaVersion:'bid-compass/1.0',notices:[target]}})).json();assert.equal(importedResult.accepted,1);
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'투찰 기록',exact:true}).click();await page.getByRole('button',{name:'과거 연습',exact:true}).click();await page.getByRole('button',{name:'상세',exact:false}).first().click();await page.getByText('기록 상세',{exact:true}).waitFor();
 const readback=await (await page.request.get(base+'/api/record?id='+saved.id)).json(),expected=evaluateAmount(saved.amountWon,target,2);assert.equal(readback.record.selectedRate,saved.selectedRate);assert.equal(readback.record.modelVersion,trained.version);assert.equal(readback.result.rank,expected.rank);assert.equal(readback.result.assumedHit,expected.assumedHit);assert.equal(readback.result.status,expected.status);
 await page.screenshot({path:'outputs/synthetic-result.png',fullPage:true});
 const other=await (await page.request.post(base+'/api/save',{data:{predictionId:prediction.id,candidateId:prediction.candidates[1].id}})).json();assert.equal(other.rootId,saved.rootId);assert.equal(other.revisionOf,saved.id);
 const old=await (await page.request.get(base+'/api/record?id='+saved.id)).json();assert.equal(old.record.selectedRate,saved.selectedRate);assert.equal(old.versions.length,2);
 const wrong=await page.request.post(base+'/api/predict',{data:{noticeId:target.id,region:'익산',assumedPriceRank:2,mode:'practice'}});assert.equal(wrong.status(),422);
 const anon=await browser.newContext();const anonymousExport=await (await anon.request.get(base+'/api/export')).json();assert.equal(anonymousExport.simulations.length,0);assert.equal(anonymousExport.predictions.length,0);assert(!anonymousExport.models.some(m=>m.version===trained.version));await anon.close();
 assert.deepEqual(errors,[]);
 writeFileSync('outputs/browser-flow.json',JSON.stringify({passed:true,syntheticOnly:true,modelVersion:trained.version,algorithm:trained.model.type,trainingCount:trained.report.trainCount,predictionId:prediction.id,candidates:prediction.candidates.map(c=>({rate:c.rate,amountWon:c.amountWon,combination:c.combination})),savedId:saved.id,reloadedSelection:old.record.selectedRate,rank:readback.result.rank,numberHit:readback.result.assumedHit,revisionCount:old.versions.length,comparedTrainingCounts:[30,60],sameValidationIds:true,checks:['UI input -> API','60-case UI training','explicit 30-case model used and saved','saved model executed','five decimals unchanged','prediction/selection saved in D1','unpublished result state','actual fixture result/rank comparison','reload preserves selection/model','append-only revisions','region validation','anonymous records isolated'],pageErrors:errors},null,2));
 console.log('All 10 local browser/API/D1 flow checks passed (synthetic fixtures only).');
}finally{await browser.close();}

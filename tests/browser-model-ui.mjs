import {chromium} from 'file:///C:/Users/Jae Hyung/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/signin-with-chatgpt?return_to=/',{waitUntil:'networkidle'});
 assert(!/선택에 근거를|기록에 가치를|조경공사에 집중/.test(await page.locator('body').innerText()));
 await page.getByRole('button',{name:'모델 학습',exact:true}).click();await page.getByLabel('자료 이용시점 기준').selectOption('observed');
 for(const n of [30,60,200]){
  await page.getByRole('button',{name:n+'건',exact:true}).click();
  await page.getByRole('status').filter({hasText:`학습 ${n}건, 모델 선택 10건`}).waitFor();
  assert(await page.getByRole('button',{name:n+'건 학습 실행',exact:true}).isDisabled());
 }
 await page.getByLabel('학습 공고 수 직접 입력').fill('45');await page.getByRole('status').filter({hasText:'학습 45건, 모델 선택 10건'}).waitFor();
 await page.getByRole('button',{name:'60건',exact:true}).click();await page.getByRole('status').filter({hasText:'학습 60건, 모델 선택 10건'}).waitFor();
 await page.screenshot({path:'outputs/model-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'outputs/model-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'자료 관리',exact:true}).click();await page.getByLabel('수집한 개찰공고 선택').selectOption('R26BK01491586:000:0:000');await page.getByText('예비가격 15개 확인',{exact:true}).click();assert.equal(await page.locator('.collected-result table').first().locator('tbody tr').count(),15);
 await page.getByText('업체 투찰내역 115개 확인',{exact:true}).click();assert.equal(await page.locator('.collected-result table').nth(1).locator('tbody tr').count(),115);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:1440,height:1000});await page.getByText('예비가격 15개 확인',{exact:true}).click();await page.getByText('업체 투찰내역 115개 확인',{exact:true}).click();await page.screenshot({path:'outputs/data-desktop.png',fullPage:true});
 assert.deepEqual(errors,[]);writeFileSync('outputs/browser-model-ui.json',JSON.stringify({passed:true,presets:[30,60,200],custom:45,insufficientDisabled:true,officialPrices:15,officialParticipants:115,mobileNoHorizontalOverflow:true,pageErrors:errors},null,2));console.log('Training controls, collected results and responsive UI checks passed.');
}finally{await browser.close();}

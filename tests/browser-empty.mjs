import {chromium} from 'file:///C:/Users/Jae Hyung/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
mkdirSync('outputs',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/signin-with-chatgpt?return_to=/',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'2026년 덕진 중부 녹지대 유지관리사업',exact:false}).waitFor();
 await page.getByRole('button',{name:'2026년 덕진 중부 녹지대 유지관리사업',exact:false}).click();
 await page.getByText('가격순 번호별 선정 횟수',{exact:true}).waitFor();
 await page.screenshot({path:'outputs/desktop.png',fullPage:true});
 await page.locator('.numbers').getByRole('button',{name:'2',exact:true}).click();
 await page.getByRole('button',{name:'후보 산출'}).click();
 await page.getByRole('alert').filter({hasText:'학습·선택된 모델이 없습니다'}).waitFor();
 assert.equal(await page.locator('.candidate').count(),0);
 await page.getByRole('button',{name:'알림 닫기'}).click();
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'outputs/mobile.png',fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);assert(!overflow,'Mobile horizontal overflow');
 await page.getByRole('button',{name:'자료 관리',exact:true}).click();
 await page.getByRole('button',{name:'공식 조회 연결 확인'}).click();
 await page.getByRole('alert').filter({hasText:'자동 조회가 연결되지 않았습니다'}).waitFor();
 assert.deepEqual(errors,[]);
 writeFileSync('outputs/browser-empty.json',JSON.stringify({passed:true,emptyModelNoInventedCandidates:true,lookupFailureVisible:true,mobileNoHorizontalOverflow:true,pageErrors:errors},null,2));
 console.log('Empty-data browser checks passed; desktop/mobile screenshots saved.');
}finally{await browser.close();}


/** Official raw acquisition, not an unverified normalizer. Never logs the service key. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2)options[args[i].replace(/^--/,'')]=args[i+1];
const endpoints={
 notices:['ad/BidPublicInfoService02/getBidPblancListInfoCnstwk02','2'],
 base:['ad/BidPublicInfoService02/getBidPblancListInfoCnstwkBsisAmount02','2'],
 avalues:['ad/BidPublicInfoService02/getBidPblancListBidPrceCalclAInfo02','2'],
 regions:['ad/BidPublicInfoService02/getBidPblancListInfoPrtcptPsblRgn02','2'],
 licenses:['ad/BidPublicInfoService02/getBidPblancListInfoLicenseLimit02','2'],
 openings:['as/ScsbidInfoService/getOpengResultListInfoCnstwk','4'],
 prices:['as/ScsbidInfoService/getOpengResultListInfoCnstwkPreparPcDetail','2'],
 participants:['as/ScsbidInfoService/getOpengResultListInfoOpengCompt',null],
};
try{
 const key=process.env.G2B_SERVICE_KEY;if(!key)throw new Error('G2B_SERVICE_KEY 환경변수에 공공데이터포털 일반 인증키(Decoding)를 설정하세요. 키를 명령행 인수나 소스 파일에 넣지 마세요.');
 const definition=endpoints[options.service];if(!definition)throw new Error('서비스: notices, base, avalues, regions, licenses, openings, prices, participants');
 if(!options.notice&&(!/^\d{12}$/.test(options.from||'')||!/^\d{12}$/.test(options.to||'')))throw new Error('--notice 공고번호 또는 --from/--to YYYYMMDDHHMM 날짜가 필요합니다.');
 if(options.service==='participants'&&!options.notice)throw new Error('업체 조회에는 --notice가 필요합니다.');
 const all=[],receivedAt=new Date().toISOString();let total=0;
 for(let page=1;page<=100;page++){
  const url=new URL('https://apis.data.go.kr/1230000/'+definition[0]);
  const q={serviceKey:key,pageNo:String(page),numOfRows:'100',type:'json'};
  if(definition[1])q.inqryDiv=options.notice?definition[1]:'1';
  if(options.notice)q.bidNtceNo=options.notice;else {q.inqryBgnDt=options.from;q.inqryEndDt=options.to;}
  if(options.round)q.bidNtceOrd=options.round;
  if(options.class)q.bidClsfcNo=options.class;
  if(options.rebid)q.rbidNo=options.rebid;
  Object.entries(q).forEach(([k,v])=>url.searchParams.set(k,v));
  let response;try{response=await fetch(url,{signal:AbortSignal.timeout(30000)});}catch{throw new Error('공식 API 연결에 실패했습니다. 네트워크·활용신청 상태를 확인하세요.');}
  if(!response.ok)throw new Error('공식 API HTTP 오류 '+response.status);
  let data;try{data=await response.json();}catch{throw new Error('JSON 응답을 받지 못했습니다. 인증키·활용신청·서비스 명세를 확인하세요.');}
  const code=String(data.response?.header?.resultCode??'');if(!['00','0'].includes(code))throw new Error('공식 API 오류 코드 '+code+' (키 원문과 응답 메시지는 출력하지 않음)');
  const body=data.response.body;total=Number(body.totalCount||0);
  all.push({pageNo:page,receivedAt:new Date().toISOString(),response:data});
  if(page*100>=total)break;if(page===100)throw new Error('한 요청 범위 10000건 한도를 넘었습니다. 기간을 나누세요.');
 }
 const out=resolve(options.output||'outputs/g2b-raw');mkdirSync(out,{recursive:true});
 const name=options.service+'-'+receivedAt.replace(/\D/g,'')+'.json';
 writeFileSync(join(out,name),JSON.stringify({format:'g2b-raw/1',endpoint:definition[0],request:{...options,serviceKey:undefined},receivedAt,totalCount:total,pages:all,note:'원본 응답. 공고 분류·재입찰 및 가격조건을 확인하고 사이트 정규 형식으로 변환해야 합니다. 예가 재입찰 필드 rbidNtceNo/rbidNo 명세 차이 확인 필요.'},null,2));
 console.log(JSON.stringify({file:join(out,name),totalCount:total,pages:all.length,normalized:false}));
}catch(error){console.error(error.message);process.exitCode=1;}

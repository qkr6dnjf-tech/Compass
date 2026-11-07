import {createHash,createHmac} from 'node:crypto';
const origin='https://jeonbuk-bid-compass.qkrtkatlr3.chatgpt.site';
export async function readAccess(){
  if(process.stdin.isTTY){process.stdin.setRawMode(true);process.stderr.write('Ready for Site access on hidden stdin.\n')}
  const input=await new Promise((resolve,reject)=>{let value='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{value+=chunk;if(value.length>4096)reject(Error('Invalid input'));else if(/[\r\n]/.test(value))resolve(value.trim())});process.stdin.on('end',()=>resolve(value.trim()))});
  if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();
  const token=JSON.parse(input).token;
  if(typeof token!=='string'||token.length<32)throw Error('Site owner access required');
  return createHmac('sha256',token).update('bid-compass/daily-official-update/v1').digest('hex');
}
export const verifier=key=>createHash('sha256').update(key).digest('hex');
export async function writeBatch(key,batch){
  const r=await fetch(origin+'/api/daily-update',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Daily-Writer':key},body:JSON.stringify(batch),signal:AbortSignal.timeout(60000)});
  if(!r.ok)throw Error('Daily update rejected: '+r.status+' '+(await r.text()).slice(0,250));
  return r.json();
}
export const status=async()=>{const r=await fetch(origin+'/api/daily-status',{cache:'no-store'});if(!r.ok)throw Error('Daily status '+r.status);return r.json()};
if(process.argv.includes('--verifier'))console.log(verifier(await readAccess()));

import publicModels from '../data/public-models.json';
import { env } from 'cloudflare:workers';
import { DomainError, validateNotice } from './domain.mjs';
import { sharedNotices } from './daily-update';
export function database(){if(!env.DB)throw new DomainError('STORAGE_UNAVAILABLE','서버 저장소 연결을 확인할 수 없습니다.',503);return env.DB;}
export async function list(owner:string,kind:string):Promise<any[]>{const out=await database().prepare('SELECT body FROM documents WHERE owner = ? AND kind = ? ORDER BY created_at ASC, id ASC LIMIT 5001').bind(owner,kind).all<{body:string}>();if((out.results||[]).length>5000)throw new DomainError('DATA_VOLUME_LIMIT','자료가 현재 조회 한도를 초과했습니다. 일부만 집계하지 않고 처리를 중단했습니다. 페이지네이션 확장이 필요합니다.',503);return (out.results||[]).map(r=>JSON.parse(r.body));}
export async function get(owner:string,kind:string,id:string):Promise<any>{const r=await database().prepare('SELECT body FROM documents WHERE owner = ? AND kind = ? AND entity_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').bind(owner,kind,id).first<{body:string}>();return r?JSON.parse(r.body):null;}
export function statement(owner:string,kind:string,body:any){return database().prepare('INSERT INTO documents (id,owner,kind,entity_id,created_at,body) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),owner,kind,body.id||body.version,new Date().toISOString(),JSON.stringify(body));}
export async function put(owner:string,kind:string,body:any){await statement(owner,kind,body).run();}
export async function notices(owner:string):Promise<any[]>{const rows=await list(owner,'notice'),map=new Map<string,any>();for(const n of await sharedNotices())map.set(n.id,n);for(const n of rows)map.set(n.id,n);return [...map.values()];}
export async function auditEvent(owner:string,action:string,accepted:number,body:any){await database().prepare('INSERT INTO audit (id,owner,created_at,action,accepted,body) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),owner,new Date().toISOString(),action,accepted,JSON.stringify(body)).run();}
export async function audits(owner:string){const r=await database().prepare('SELECT created_at AS createdAt,action,accepted,body FROM audit WHERE owner=? ORDER BY created_at DESC LIMIT 100').bind(owner).all<any>();return (r.results||[]).map(r=>({...r,body:JSON.parse(r.body)}));}

export async function modelVersions(owner:string):Promise<any[]>{return [...publicModels,...await list(owner,'model')].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||(a.report.trainCount-b.report.trainCount)||a.version.localeCompare(b.version));}

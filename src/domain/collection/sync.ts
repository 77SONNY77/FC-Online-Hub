import {z} from 'zod';
import {freshnessConfig} from './freshness';
export const syncConfigSchema=z.object({
 PRICE_SYNC_INTERVAL_MINUTES:z.coerce.number().int().min(5).max(1440).default(30),
 PRICE_FULL_RECONCILIATION_DAYS:z.coerce.number().int().min(14).max(365).default(120),
 PRICE_HISTORY_HEARTBEAT_HOURS:z.coerce.number().int().min(2).max(8760).default(24),
 PRICE_SYNC_VERY_STALE_HOURS:z.coerce.number().int().min(24).default(720),
 PRICE_SYNC_REFERENCE_PACK:z.string().default('official-pool-24987-v1'),
 PRICE_SYNC_REFERENCE_ENABLED:z.enum(['true','false']).default('false'),
 PRICE_QUERY_CACHE_HOURS:z.coerce.number().min(2).max(168).default(2),
});
export function syncConfig(){return syncConfigSchema.parse(process.env);}
export type SyncType='REFERENCE_SNAPSHOT'|'HOT_SYNC'|'BOOTSTRAP'|'INCREMENTAL'|'FULL_RECONCILIATION'|'IDLE';
export function selectSyncWork(input:{reference:boolean;hot:boolean;bootstrap:boolean;incremental:boolean;reconcile:boolean;recentTypes?:string[]}):SyncType{
 if(input.reference)return 'REFERENCE_SNAPSHOT';
 const config=freshnessConfig(),recent=input.recentTypes??[];
 const refresh=(type:string)=>['HOT_SYNC','INCREMENTAL','FULL_RECONCILIATION'].includes(type);
 if(input.bootstrap&&recent.length>=config.PRICE_MAX_CONSECUTIVE_REFRESH_BATCHES&&recent.slice(0,config.PRICE_MAX_CONSECUTIVE_REFRESH_BATCHES).every(refresh))return 'BOOTSTRAP';
 if(input.incremental&&recent.length>=config.PRICE_MAX_CONSECUTIVE_BOOTSTRAP_BATCHES&&recent.slice(0,config.PRICE_MAX_CONSECUTIVE_BOOTSTRAP_BATCHES).every(t=>t==='BOOTSTRAP'))return input.hot?'HOT_SYNC':'INCREMENTAL';
 if(input.incremental&&!input.bootstrap&&recent.length>=config.PRICE_MAX_CONSECUTIVE_BOOTSTRAP_BATCHES&&recent.slice(0,config.PRICE_MAX_CONSECUTIVE_BOOTSTRAP_BATCHES).every(t=>t==='FULL_RECONCILIATION'))return input.hot?'HOT_SYNC':'INCREMENTAL';
 if(input.hot)return 'HOT_SYNC';if(input.bootstrap)return 'BOOTSTRAP';if(input.reconcile)return 'FULL_RECONCILIATION';if(input.incremental)return 'INCREMENTAL';return 'IDLE';
}
export function historyDecision(previous:{price:string;historyAt:Date}|null,price:string,at:Date,heartbeatHours:number,reference=false){
 const classification=!previous?'NEW':previous.price===price?'UNCHANGED':'CHANGED';
 const reason=reference?'REFERENCE_SNAPSHOT':classification==='NEW'?'INITIAL':classification==='CHANGED'?'PRICE_CHANGE':at.getTime()-previous!.historyAt.getTime()>=heartbeatHours*3600000?'HEARTBEAT':null;
 return {classification,reason};
}

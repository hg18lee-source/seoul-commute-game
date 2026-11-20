import { performance } from 'node:perf_hooks';
import { allow, fail } from './plays.mjs';

// These service URLs follow the public agency documentation and the existing Sites bridge.
const MASTER = 'subwayStationMaster';
const BUS_BASE = 'http://ws.bus.go.kr/api/rest/busRouteInfo/';
const cacheKey='commute-7016-stations-v1';

async function subway(key, upstream) {
  const rows = [];
  const base = 'http://openapi.seoul.go.kr:8088/' + encodeURIComponent(key) + '/json/' + MASTER;
  for (let start = 1; start <= 10000;) {
    const data = await upstream(base + '/' + start + '/' + (start + 999) + '/', 'json', 'seoul', 'subwayStationMaster');
    const page = data[MASTER];
    if (page?.RESULT?.CODE !== 'INFO-000' || !page.row?.length) throw new Error('subway format');
    rows.push(...page.row.map(row => ({name: row.BLDN_NM, line: row.ROUTE})));
    if (rows.length >= Number(page.list_total_count)) {
      if (rows.some(row => typeof row.name !== 'string' || typeof row.line !== 'string')) {
        throw new Error('subway fields');
      }
      return rows;
    }
    start += page.row.length;
  }
  throw new Error('subway pagination');
}

function xmlText(element, tag) {
  const value = element.match(new RegExp('<' + tag + '>([^]*?)</' + tag + '>'))?.[1]?.trim() ?? '';
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1].toLowerCase() === 'x';
      return String.fromCodePoint(Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    return {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'"}[entity] ?? '';
  });
}

async function busRows(key, operation, parameters, upstream) {
  const query = new URLSearchParams({serviceKey: decodeURIComponent(key), ...parameters});
  const xml = await upstream(BUS_BASE + operation + '?' + query, 'text', 'bus', operation);
  if (xmlText(xml, 'headerCd') !== '0') throw new Error('bus status');
  return [...xml.matchAll(/<itemList>([^]*?)<\/itemList>/g)].map(row => row[1]);
}

async function bus(key, upstream) {
  const routes = await busRows(key, 'getBusRouteList', {strSrch:'7016'}, upstream);
  const route = routes.find(row => xmlText(row, 'busRouteNm') === '7016');
  const routeId = xmlText(route ?? '', 'busRouteId');
  if (!/^\d+$/.test(routeId)) throw new Error('bus route');
  const stops = await busRows(key, 'getStaionByRoute', {busRouteId:routeId}, upstream);
  const mapped = stops.map(row => ({
    order: Number(xmlText(row, 'seq')),
    name: xmlText(row, 'stationNm'),
    stopNumber: xmlText(row, 'arsId'),
  }));
  if (!mapped.length || mapped.some(stop => !stop.name || !(stop.order > 0))) throw new Error('bus stops');
  mapped.sort((a,b) => a.order-b.order);
  return {
    number: '7016',
    from: xmlText(route, 'stStationNm'),
    to: xmlText(route, 'edStationNm'),
    stops: mapped,
  };
}

function containsSecret(value, secrets) {
  const output = JSON.stringify(value);
  return secrets.some(secret => {
    if (!secret) return false;
    let decoded = secret;
    try { decoded = decodeURIComponent(secret); } catch {}
    return [secret, decoded, encodeURIComponent(decoded)].some(key => output.includes(key));
  });
}


export async function transit(db, ctx, config, fetcher) {
  await db.query('SELECT pg_advisory_xact_lock(624023082)');
  const {rows:[hit]}=await db.query('SELECT payload FROM commute_transit_cache WHERE cache_key=$1 AND expires_at>clock_timestamp()',[cacheKey]);
  ctx.cached=Boolean(hit);
  if (hit) return response(hit.payload,true);

  const calls=ctx.external=[];
  const signal=AbortSignal.timeout(6500);
  const keys=[config.seoulKey,config.busKey];
  async function query(operation, key, provider) {
    if (!key) return {ok:false,checkedAt:null,failure:'not_configured'};
    const upstream=async (url, format, service, operationName) => {
      if (signal.aborted) throw new Error('timeout');
      const started=performance.now();
      const call={provider:service,operation:operationName,at:Date.now(),status:null,result:'connection',duration:0};
      calls.push(call);
      try {
        const answer=await fetcher(url,{signal,redirect:'manual'});
        call.status=answer.status;
        call.result=answer.ok?'invalid_response':'upstream_http';
        if (!answer.ok) throw new Error('upstream_http');
        const body=await answer[format]();
        call.result='ok';
        return body;
      } catch {
        if (signal.aborted) call.result='timeout';
        throw new Error(call.result);
      } finally {call.duration=Math.round(performance.now()-started);}
    };
    try {
      const data=await operation(key,upstream);
      if (containsSecret(data,keys)) throw new Error('invalid_response');
      return {ok:true,checkedAt:new Date().toISOString(),data};
    } catch {
      const last=calls.findLast(call=>call.provider===provider);
      if (last?.result==='ok') last.result='invalid_response';
      return {ok:false,checkedAt:new Date().toISOString(),failure:last?.result??'timeout'};
    }
  }
  const [stations,buses]=await Promise.all([query(subway,keys[0],'seoul'),query(bus,keys[1],'bus')]);
  const payload={stations,bus:buses};
  await db.query(
    "INSERT INTO commute_transit_cache VALUES($1,$2,clock_timestamp()+$3*interval '1 second') "+
    "ON CONFLICT(cache_key) DO UPDATE SET payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at",
    [cacheKey,payload,stations.ok&&buses.ok?300:30]);
  return response(payload,false);
}

function response(payload,cached) {
  const body={...payload,cached};
  return payload.stations.ok&&payload.bus.ok?allow(body,200,cached?'transit_cache':'transit_fetched'):
    fail(502,payload.stations.failure==='not_configured'&&payload.bus.failure==='not_configured'?'transit_not_configured':'upstream_failed',body);
}

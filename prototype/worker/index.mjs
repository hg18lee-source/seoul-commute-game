import { assets } from './assets.mjs';

const MASTER = 'subwayStationMaster';
const BUS_BASE = 'http://ws.bus.go.kr/api/rest/busRouteInfo/';
const CACHE_PATH = '/api/transit/v1';
const SUCCESS_TTL = 300;
const FAILURE_TTL = 30;
let lastResult;
let inFlight;

function failureCode(error) {
  if (error instanceof UpstreamError) return error.message;
  if (error?.name === 'AbortError') return 'timeout';
  if (/http|scheme|protocol/i.test(error?.message ?? '')) return 'protocol';
  if (/network|connect|dns|resolve|fetch/i.test(error?.message ?? '')) return 'connection';
  return 'invalid-response';
}

class UpstreamError extends Error {}

async function upstream(url, format) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {redirect:'manual', signal:controller.signal});
    if (!response.ok) throw new UpstreamError('http-' + response.status);
    return await response[format]();
  } finally {
    clearTimeout(deadline);
  }
}

async function subway(key) {
  const rows = [];
  const base = 'http://openapi.seoul.go.kr:8088/' + encodeURIComponent(key) + '/json/' + MASTER;
  for (let start = 1; start <= 10000;) {
    const data = await upstream(base + '/' + start + '/' + (start + 999) + '/', 'json');
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

async function busRows(key, operation, parameters) {
  const query = new URLSearchParams({serviceKey: decodeURIComponent(key), ...parameters});
  const xml = await upstream(BUS_BASE + operation + '?' + query, 'text');
  if (xmlText(xml, 'headerCd') !== '0') throw new Error('bus status');
  return [...xml.matchAll(/<itemList>([^]*?)<\/itemList>/g)].map(row => row[1]);
}

async function bus(key) {
  const routes = await busRows(key, 'getBusRouteList', {strSrch:'7016'});
  const route = routes.find(row => xmlText(row, 'busRouteNm') === '7016');
  const routeId = xmlText(route ?? '', 'busRouteId');
  if (!/^\d+$/.test(routeId)) throw new Error('bus route');
  const stops = await busRows(key, 'getStaionByRoute', {busRouteId:routeId});
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

async function query(operation, key, secrets) {
  if (key) {
    try {
      const data = await operation(key);
      if (!containsSecret(data, secrets)) return {ok:true, checkedAt:new Date().toISOString(), data};
    } catch (error) {
      return {ok:false, checkedAt:new Date().toISOString(), failure:failureCode(error)};
    }
  }
  return {ok:false, checkedAt:key ? new Date().toISOString() : null};
}

function publicResponse(payload, cached) {
  // Only public, secret-filtered transit data is returned. No cookies or credentials are used.
  return Response.json({...payload, cached}, {headers:{
    'Cache-Control':'no-store',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET, HEAD',
  }});
}

async function loadData(cache, cacheKey, env, ctx) {
  const secrets = [env.SEOUL_OPENAPI_KEY, env.DATA_GO_KR_SERVICE_KEY];
  const [stations, busRoute] = await Promise.all([
    query(subway, secrets[0], secrets),
    query(bus, secrets[1], secrets),
  ]);
  const payload = {stations, bus:busRoute};
  const ttl = stations.ok && busRoute.ok ? SUCCESS_TTL : FAILURE_TTL;
  lastResult = {payload, expires:Date.now() + ttl * 1000};
  if (cache) {
    ctx.waitUntil(cache.put(cacheKey, Response.json(payload, {
      headers:{'Cache-Control':'public, max-age=' + ttl},
    })).catch(() => {}));
  }
  return payload;
}

async function transit(request, env, ctx) {
  if (lastResult?.expires > Date.now()) return publicResponse(lastResult.payload, true);
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(new URL(CACHE_PATH, request.url));
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return publicResponse(await hit.json(), true);
    } catch {}
  }
  const joined = Boolean(inFlight);
  inFlight ??= loadData(cache, cacheKey, env, ctx).finally(() => { inFlight = undefined; });
  return publicResponse(await inFlight, joined);
}

export default {
  async fetch(request, env, ctx) {
    const {pathname} = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, {status:405, headers:{Allow:'GET, HEAD'}});
    }
    if (pathname === '/api/transit') {
      return request.method === 'HEAD' ? new Response(null, {headers:{'Cache-Control':'no-store'}}) : transit(request, env, ctx);
    }
    const name = pathname === '/' ? '/index.html' : pathname;
    if (!Object.hasOwn(assets, name)) return new Response('Not found', {status:404});
    const [type, gzip] = assets[name];
    const body = request.method === 'HEAD' ? null :
      new Blob([Uint8Array.from(atob(gzip), char => char.charCodeAt(0))]).stream()
        .pipeThrough(new DecompressionStream('gzip'));
    return new Response(body, {headers:{'Content-Type':type, 'Cache-Control':'public, max-age=60'}});
  },
};

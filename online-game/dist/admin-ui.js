import { api, element, kst, setAccount } from './online.js';
import { startDailyCompletions } from './admin-completions.js';

const $=id=>document.getElementById(id);
const form=$('filters'), status=$('summary');
const previous=$('previous'), next=$('next');
let page=1, revision=0;
function date(value) {return value?kst.format(new Date(value)):'—';}

function list(id, items, formatter) {
  $(id).replaceChildren(...items.map(item=>{
    const line=element('li');
    line.append(formatter(item));
    return line;
  }));
}

async function details(id) {
  const dialog=$('detail'), body=$('detail-content');
  body.textContent='요청 상세를 불러오는 중…';
  dialog.showModal();
  try {
    const result=await api('admin-detail?'+new URLSearchParams({id}));
    result.request.at=date(result.request.at);
    for (const call of result.external) call.at=date(call.at);
    if (result.play) for (const key of ['started_at','seen_at']) result.play[key]=date(result.play[key]);
    body.textContent=JSON.stringify(result,null,2);
  } catch {body.textContent='요청 상세를 불러오지 못했습니다.';}
}

function render(data) {
  const m=data.metrics;
  status.textContent='전체 사용자 '+data.users+'명 · 요청 '+m.requests+'건 · ALLOW '+m.allowed+' / BLOCK '+m.blocked+
    ' / FAIL '+m.failed+' · 교통 요청 '+m.transit_requests+' / 캐시 적중 '+m.cache_hits+
    ' / 실제 외부 호출 '+m.external_calls+' (실패 '+m.external_failures+')';
  const actions=form.elements.action;
  if (actions.options.length===1) for (const action of data.actions) actions.add(new Option(action,action));
  list('actions',data.byAction,x=>x.action+' · '+x.count+'건');
  list('users',data.byUser,x=>{
    if (!x.user_id) return '익명 · '+x.count+'건';
    const select=element('button',x.nickname+' · '+x.count+'건');
    select.onclick=()=>{form.elements.user.value=x.user_id;load(1);};
    return select;
  });
  $('requests').replaceChildren(...data.rows.map(r=>{
    const row=element('tr'), id=element('button',r.id);
    id.onclick=()=>details(r.id);
    row.append(...[date(r.at),r.nickname??'익명',r.action,r.outcome+' · '+r.reason,r.method+' '+r.http_status,
      r.duration_ms+'ms',r.cache_hit===null?'—':(r.cache_hit?'적중':'미적중')+' / '+r.external_calls,id].map(value=>{
      const cell=element('td');
      cell.append(value);
      return cell;
    }));
    return row;
  }));
  page=data.page;
  $('page').textContent=page+'쪽';
  previous.disabled=page===1;
  next.disabled=!data.next;
}

async function load(number) {
  const request=++revision, params=new URLSearchParams(new FormData(form));
  params.set('page',number);
  status.textContent='조회 중…';
  previous.disabled=next.disabled=true;
  try {
    const data=await api('admin-audit?'+params);
    if (request===revision) render(data);
  } catch (error) {
    if (request!==revision) return;
    status.textContent=[403,401].includes(error.status)?'관리자 권한이 필요합니다.':'조회에 실패했습니다. 필터를 확인해 주세요.';
  }
}
$('close-detail').onclick=()=>$('detail').close();
previous.onclick=()=>load(page-1);
next.onclick=()=>load(page+1);
form.onsubmit=event=>{event.preventDefault();load(1);};
load(1);
startDailyCompletions({api,element,kst,setAccount});

export function startDailyCompletions({api,element,kst,setAccount}) {
  const $=id=>document.getElementById('completion-'+id);
  const time=tenths=>(tenths/10).toFixed(1)+'초';
  const at=value=>value?kst.format(new Date(value)):'—';
  const dialog=$('detail');
  const detailTables={
    evidence:{
      title:'집계 근거', columns:['완주 시각 (KST)','코스','규칙 버전','공식 시간','플레이 ID'],
      values:r=>[at(r.finished_at),label(r.course),r.rules,time(r.tenths),r.play_id+(r.fastest?' · 최단 기록':'')],
    },
    runs:{
      title:'집계 실행 이력', columns:['실행 ID','계기','요청 ID','플레이 ID','시작 (KST)','종료 (KST)','상태','변경 전','변경 후','실패 코드'],
      values:r=>[r.id,r.cause==='record_saved'?'공식 기록 저장':'관리자 재계산',r.request_id,r.play_id??'—',
        at(r.started_at),at(r.ended_at),({success:'성공',failed:'실패',unchanged:'변경 없음'})[r.status],
        describe(r.previous),describe(r.summary),r.reason??'—'],
    },
  };
  let overview, detailKind, detailDate, detailPage=1, detailRevision=0, cursors=[];
  let refreshing=false, recalculating=false;
  const label=course=>overview?.courses[course]?.label??course;
  function describe(summary) {
    if (!summary) return '—';
    return [summary.count+'건',...summary.byCourse.map(c=>label(c.course)+' '+(c.fastest?time(c.fastest.tenths):'기록 없음'))].join(' · ');
  }
  function render(data) {
    overview=data;
    $('date').textContent=data.date+' · '+data.zone;
    const entries=[['공식 완주 건수',data.count+'건'],...data.byCourse.map(row=>[
      data.courses[row.course].transport==='train'?'지하철 최단 시간':'버스 최단 시간',
      row.fastest?time(row.fastest.tenths):'기록 없음',
    ])];
    $('metrics').replaceChildren(...entries.flatMap(([key,value])=>[element('dt',key),element('dd',value)]));
    $('fastest').textContent=data.byCourse.filter(row=>row.fastest)
      .map(row=>label(row.course)+' 최단 플레이 ID '+row.fastest.playId).join(' / ');
    $('rules').textContent=data.byCourse.map(row=>label(row.course)+' · '+row.rules).join(' / ');
    $('updated').textContent='마지막 성공 갱신 '+(data.lastSuccessAt?at(data.lastSuccessAt):'없음')+
      (data.lastSuccessAt&&!data.matchesLastRun?' · 위 수치는 원본 기록의 현재 값입니다.':'');
  }
  async function loadOverview() {
    if (refreshing) return;
    refreshing=true;
    try {render(await api('admin-completions'));}
    catch {
      $('updated').textContent='공식 완주 현황을 조회하지 못했습니다. 표시된 수치는 이전 조회 값입니다.';
    } finally {refreshing=false;}
  }
  function tableRow(tag,values) {
    const row=element('tr');
    row.append(...values.map(value=>element(tag,value)));
    return row;
  }
  async function loadDetail(number) {
    const revision=++detailRevision, view=detailTables[detailKind];
    $('detail-title').textContent=view.title;
    $('detail-filter').textContent='';
    $('detail-status').textContent='조회 중…';
    $('head').replaceChildren(tableRow('th',view.columns));
    $('rows').replaceChildren();
    $('page').textContent='';
    $('previous').disabled=$('next').disabled=true;
    try {
      const params=new URLSearchParams();
      if (detailDate) params.set('date',detailDate);
      if (cursors[number]) params.set('before',cursors[number]);
      const data=await api('admin-completion-'+detailKind+'?'+params);
      if (revision!==detailRevision) return;
      detailDate=data.date;
      $('detail-filter').textContent=[data.date+' 00:00 이상 · 다음 날 00:00 미만',data.zone,
        ...(data.versions??[]).map(row=>label(row.course)+' · '+row.rules)].join(' / ');
      $('rows').replaceChildren(...data.rows.map(row=>tableRow('td',view.values(row))));
      $('detail-status').textContent=data.rows.length?'':detailKind==='evidence'?'기록 없음':'실행 이력 없음';
      detailPage=number;
      cursors[number+1]=data.nextCursor;
      $('page').textContent=detailPage+'쪽';
      $('previous').disabled=detailPage===1;
      $('next').disabled=!data.nextCursor;
    } catch {
      if (revision===detailRevision) $('detail-status').textContent='조회에 실패했습니다.';
    }
  }
  function open(kind) {
    detailKind=kind;
    detailDate=overview?.date;
    cursors=[];
    dialog.showModal();
    loadDetail(1);
  }
  $('close').onclick=()=>dialog.close();
  dialog.onclose=()=>{detailRevision++;};
  $('evidence').onclick=()=>open('evidence');
  $('runs').onclick=()=>open('runs');
  $('previous').onclick=()=>loadDetail(detailPage-1);
  $('next').onclick=()=>loadDetail(detailPage+1);
  $('recalculate').onclick=async()=>{
    if (recalculating) return;
    recalculating=$('recalculate').disabled=true;
    $('status').textContent='다시 계산 중…';
    try {
      setAccount((await api('session')).user);
      const result=await api('admin-completion-recalculate',{});
      $('status').textContent=result.status==='unchanged'?'변경 없음':'다시 계산했습니다.';
    } catch {$('status').textContent='재계산에 실패했습니다. 집계 실행 이력을 확인하세요.';}
    finally {
      recalculating=$('recalculate').disabled=false;
      await loadOverview();
    }
  };
  loadOverview();
  setInterval(()=>{if (!document.hidden) loadOverview();},5000);
  document.addEventListener('visibilitychange',()=>{if (!document.hidden) loadOverview();});
}

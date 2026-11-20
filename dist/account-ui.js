import { api, currentAccount, element, kst, setAccount } from './online.js';
import { showTraffic } from './traffic-data.js';

export function accountInterface({openDialog,closeDialog,button,menu,start,timeText}) {
  const $=id=>document.getElementById(id);
  let courses;
  const catalog=async()=>courses??=(await api('courses')).courses;
  function showError(error,status) {
    if (error.status===401) {setAccount(null);menu();}
    else status.textContent='요청에 실패했습니다. 다시 시도해 주세요.';
  }
  function accountForm(mode) {
    const admin=mode==='admin-login', signup=mode==='signup';
    openDialog('<h2>'+(signup?'ID 생성':admin?'관리자 로그인':'로그인')+'</h2>'+
      '<form id="account-form"><label>닉네임<input name="nickname" required maxlength="10" autocomplete="username"></label>'+
      '<label>비밀번호<input name="password" required type="password" '+(admin?'minlength="20" maxlength="128"':
        'inputmode="numeric" minlength="4" maxlength="4" pattern="[0-9]{4}"')+' autocomplete="'+(signup?'new-password':'current-password')+'"></label>'+
      '<p id="account-status" role="status"></p><div class="button-row"><button class="btn light" type="submit">'+
      (signup?'생성':'로그인')+'</button><button type="button" id="account-exit" class="btn">나가기</button></div></form>');
    const form=$('account-form'), status=$('account-status'), exit=$('account-exit'), submit=form.querySelector('[type=submit]');
    exit.onclick=closeDialog;
    form.elements.nickname.focus();
    form.onsubmit=async event=>{
      event.preventDefault();
      if (submit.disabled) return;
      const data=new FormData(form);
      const nickname=String(data.get('nickname')).normalize('NFC'), password=String(data.get('password'));
      if (!/^[A-Za-z가-힣]{1,10}$/u.test(nickname)) {
        status.textContent='닉네임은 공백 없이 한글·영문 1~10자로 입력하세요.';
        return;
      }
      submit.disabled=exit.disabled=true;
      status.textContent='처리 중…';
      try {
        setAccount((await api(mode,{nickname,password})).user);
        if (admin) location.assign('/administrator');
        else menu();
      } catch (error) {
        const messages={duplicate_id:'이미 사용 중인 닉네임입니다.',account_input:'닉네임과 숫자 4자리 비밀번호를 확인하세요.',
          credentials:'닉네임 또는 비밀번호가 올바르지 않습니다.'};
        status.textContent=messages[error.message]??'요청에 실패했습니다. 다시 시도해 주세요.';
        form.elements.password.value='';
        submit.disabled=exit.disabled=false;
      }
    };
  }
  async function chooseCourse() {
    openDialog('<h2>공식 코스</h2><p id="course-status" role="status">코스를 불러오는 중…</p><div id="dialog-actions" class="button-row"></div>');
    const status=$('course-status'), actions=$('dialog-actions');
    actions.append(button('닫기',closeDialog));
    try {
      const list=await catalog();
      if (!actions.isConnected) return;
      status.textContent='같은 코스의 기록끼리 순위를 매깁니다.';
      actions.prepend(...Object.entries(list).map(([id,course])=>button(course.label,()=>start(id))));
    } catch (error) {if (actions.isConnected) showError(error,status);}
  }
  function listRecords(ranked) {
    openDialog('<h2>'+(ranked?'랭킹':'내 기록')+'</h2><div id="record-filter"></div><p id="record-status" role="status"></p>'+
      '<ol id="record-rows" class="online-records"></ol><div id="record-pages" class="button-row"></div>'+
      '<div class="button-row"><button id="record-close" class="btn">닫기</button></div>');
    const status=$('record-status'), rows=$('record-rows'), pages=$('record-pages');
    $('record-close').onclick=closeDialog;
    const filter=element('select');
    filter.setAttribute('aria-label','코스');
    let revision=0;
    async function load(page=1) {
      const requested=++revision;
      status.textContent='불러오는 중…';
      pages.replaceChildren();
      try {
        const query=new URLSearchParams({page});
        if (ranked) query.set('course',filter.value);
        const result=await api((ranked?'ranking?':'records?')+query);
        if (requested!==revision||!rows.isConnected) return;
        rows.replaceChildren();
        for (const row of result.rows) {
          const text=ranked?row.rank+'위 · '+row.nickname+' · '+timeText(row.tenths/10):
            (result.courses[row.course]?.label??row.course)+' · '+timeText(row.tenths/10)+' · '+kst.format(new Date(row.finished_at));
          const line=element('li',text);
          if (row.mine) line.classList.add('mine');
          rows.append(line);
        }
        status.textContent=result.rows.length?'':'아직 완주 기록이 없습니다.';
        if (page>1) pages.append(button('이전',()=>load(page-1)));
        if (result.next) pages.append(button('다음',()=>load(page+1)));
      } catch (error) {if (requested===revision&&rows.isConnected) showError(error,status);}
    }
    if (ranked) {
      catalog().then(list=>{
        if (!status.isConnected) return;
        for (const [id,course] of Object.entries(list)) filter.add(new Option(course.label,id));
        $('record-filter').append(filter);
        filter.onchange=()=>load();
        load();
      }).catch(error=>{if (status.isConnected) showError(error,status);});
    } else load();
  }
  function renderMenu() {
    const user=currentAccount();
    $('screen').innerHTML='<section class="intro panel"><h1>대중교통<br>출근 게임</h1><p id="intro-note"></p>'+
      '<div id="menu-actions" class="button-row"></div><p id="menu-status" role="status"></p>'+
      '<p class="small-note">방향키 이동 · Shift 달리기 · M 길찾기 · E 상호작용</p></section>';
    const actions=$('menu-actions');
    if (!user) {
      $('intro-note').textContent='공덕동에서 시청역 근처 회사까지 출근하세요.';
      actions.append(button('ID 생성',()=>accountForm('signup'),'btn light'),button('로그인',()=>accountForm('login')));
      return;
    }
    $('intro-note').textContent=user.nickname+' 님, 08:00에 집을 나섭니다.';
    if (user.role==='admin') {
      const link=element('a','관리자');
      link.href='/administrator';
      link.className='btn light';
      actions.append(link);
    } else {
      actions.append(button('게임 시작',chooseCourse,'btn light'),button('내 기록',()=>listRecords(false)),button('랭킹',()=>listRecords(true)));
    }
    actions.append(button('교통 데이터 확인',()=>showTraffic(openDialog,closeDialog)),button('로그아웃',async event=>{
      const control=event.currentTarget;
      control.disabled=true;
      try {await api('logout',{});setAccount(null);menu();}
      catch (error) {control.disabled=false;showError(error,$('menu-status'));}
    }));
  }
  return {renderMenu,accountForm,showError};
}

import { api, currentAccount, element, setAccount } from './online.js';
import { idPattern, signupFailure, validateSignup } from './account-rules.js';

export function accountInterface({openDialog,closeDialog,button,menu,start,timeText}) {
  const $=id=>document.getElementById(id);
  let courses;
  const tutorialEnabled=Boolean(document.querySelector('meta[name="commute-tutorial"][content="enabled"]'));
  const practiceRoute=tutorialEnabled?new URLSearchParams(location.search).get('practice'):null;
  const preference=practiceRoute==='bus'?'bus':practiceRoute==='rail'?'train':null;
  const catalog=async()=>courses??=await api('courses');
  function showError(error,status) {
    if (error.status===401) {setAccount(null);menu();}
    else status.textContent='요청에 실패했습니다. 다시 시도해 주세요.';
  }
  function accountForm(mode) {
    const admin=mode==='admin-login', signup=mode==='signup';
    const nicknameHelp=signup
      ? '<small id="nickname-rule" class="account-rule">한글·영문 1~10자 · 공백 불가</small><span id="nickname-error" class="account-error" aria-live="polite"></span>'
      : '';
    const passwordHelp=signup
      ? '<small id="password-rule" class="account-rule">숫자 4자리</small><span id="password-error" class="account-error" aria-live="polite"></span>'
      : '';
    const nicknameAttrs=signup?'aria-describedby="nickname-rule nickname-error"':'maxlength="10"';
    const passwordAttrs=signup?'inputmode="numeric" aria-describedby="password-rule password-error"':
      admin?'minlength="20" maxlength="128"':'inputmode="numeric" minlength="4" maxlength="4" pattern="[0-9]{4}"';
    openDialog('<h2>'+(signup?'ID 생성':admin?'관리자 로그인':'로그인')+'</h2>'+
      '<form id="account-form"'+(signup?' novalidate':'')+'><label>닉네임<input name="nickname" required '+nicknameAttrs+
      ' autocomplete="username">'+nicknameHelp+'</label>'+
      '<label>비밀번호<input name="password" required type="password" '+passwordAttrs+
      ' autocomplete="'+(signup?'new-password':'current-password')+'">'+passwordHelp+'</label>'+
      '<p id="account-status" role="status"></p><div class="button-row"><button class="btn light" type="submit">'+
      (signup?'생성':'로그인')+'</button><button type="button" id="account-exit" class="btn">나가기</button></div></form>');
    const form=$('account-form'), status=$('account-status'), exit=$('account-exit'), submit=form.querySelector('[type=submit]');
    const showFieldError=(field,message='')=>{
      $(field+'-error').textContent=message;
      if (message) form.elements[field].setAttribute('aria-invalid','true');
      else form.elements[field].removeAttribute('aria-invalid');
    };
    if (signup) for (const field of ['nickname','password']) {
      form.elements[field].addEventListener('input',()=>showFieldError(field));
    }
    exit.onclick=closeDialog;
    form.elements.nickname.focus();
    form.onsubmit=async event=>{
      event.preventDefault();
      if (submit.disabled) return;
      const data=new FormData(form);
      const rawNickname=String(data.get('nickname')), password=String(data.get('password'));
      const nickname=rawNickname.normalize('NFC');
      if (signup) {
        const { errors }=validateSignup(rawNickname,password);
        status.textContent='';
        for (const field of ['nickname','password']) showFieldError(field,errors[field]);
        const first=Object.keys(errors)[0];
        if (first) {form.elements[first].focus();return;}
      } else if (!idPattern.test(nickname)) {
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
        if (signup) {
          const { field, message }=signupFailure(error);
          status.textContent=field?'':message;
          if (field) {showFieldError(field,message);form.elements[field].focus();}
        } else {
          status.textContent=error.message==='credentials'?'닉네임 또는 비밀번호가 올바르지 않습니다.':
            '요청에 실패했습니다. 다시 시도해 주세요.';
          form.elements.password.value='';
        }
        submit.disabled=exit.disabled=false;
      }
    };
  }
  async function chooseCourse() {
    openDialog('<section class="record-dialog"><header class="record-header"><small>SEOUL COMMUTE · COURSE SELECT</small><h2>출근 코스 선택</h2>'+ 
      '<p>이용할 교통수단을 고르면 해당 경로로 출근을 시작합니다.</p></header><div class="record-content course-picker">'+
      '<p id="course-status" class="record-status" role="status">코스를 불러오는 중…</p><div id="course-choices" class="course-choices"></div>'+ 
      '<button id="course-close" class="btn record-close">닫기</button></div></section>', 'dialog-card records-modal course-modal');
    const status=$('course-status'), choices=$('course-choices');
    $('course-close').onclick=closeDialog;
    try {
      const {courses:list}=await catalog();
      if (!choices.isConnected) return;
      status.textContent='지하철과 버스 기록은 서로 다른 코스로 저장됩니다.';
      let preferredOption;
      for(const [id,course] of Object.entries(list)){
        const option=button('',()=>start(id),'course-choice');
        option.append(element('span',course.transport==='bus'?'버스 '+course.busNumber+'번':'지하철 '+course.line+'호선'));
        option.lastChild.className='course-kind';
        option.append(element('strong',course.label));
        option.append(element('small',course.detail));
        if (course.transport===preference) {
          preferredOption=option;
          option.setAttribute('data-practice-choice','');
          option.append(element('b','연습한 코스로 시작 →'));
        } else option.append(element('b','선택 →'));
        choices.append(option);
      }
      preferredOption?.focus();
    } catch (error) {if (choices.isConnected) showError(error,status);}
  }
  function listRecords(ranked) {
    openDialog('<section class="record-dialog"><header class="record-header"><small>SEOUL COMMUTE · '+(ranked?'RANKING':'MY RECORDS')+'</small><h2>'+(ranked?'랭킹':'내 기록')+'</h2>'+
      '<p>'+(ranked?'선택한 교통수단 코스의 완주 기록':'내가 완주한 출근 기록')+'</p></header><div class="record-content">'+
      '<div id="record-filter" class="record-filters"></div><p id="record-note" class="record-note"></p>'+
      '<p id="record-status" class="record-status" role="status" aria-live="polite"></p>'+
      '<div class="record-table-wrap"><table class="record-table"><thead id="record-head"></thead><tbody id="record-rows"></tbody></table></div>'+
      '<div id="record-pages" class="record-pages"></div><button id="record-close" class="btn record-close">닫기</button></div></section>',
      'dialog-card records-modal');
    const status=$('record-status'), rows=$('record-rows'), pages=$('record-pages');
    $('record-close').onclick=closeDialog;
    const filter=element('select');
    filter.setAttribute('aria-label','코스');
    $('record-head').innerHTML=ranked
      ?'<tr><th scope="col">순위</th><th scope="col">플레이어</th><th scope="col" class="record-number">기록</th></tr>'
      :'<tr><th scope="col">번호</th><th scope="col">코스</th><th scope="col" class="record-number">기록</th></tr>';
    $('record-note').textContent=ranked
      ?'내 기록은 색상과 굵은 글씨로 표시됩니다.'
      :'최근 완주 기록부터 표시합니다. 완료 날짜와 시각은 순위표에서 제외했습니다.';
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
        result.rows.forEach((row,index)=>{
          const tr=element('tr');
          if(row.mine)tr.classList.add('mine');
          const rank=element('td',ranked?String(row.rank):String((page-1)*6+index+1));
          rank.className='record-rank';
          const identity=element('td');
          if(ranked) identity.textContent=row.nickname;
          else {
            const courseLabel=result.courses[row.course]?.label??row.course;
            identity.classList.add('record-course-cell');
            identity.append(element('strong',courseLabel));
          }
          const time=element('td',timeText(row.tenths/10));
          time.className='record-number';
          tr.append(rank,identity,time);
          rows.append(tr);
        });
        status.textContent=result.rows.length?'':'아직 완주 기록이 없습니다.';
        if (page>1) pages.append(button('← 이전',()=>load(page-1)));
        pages.append(element('span',`${page} 페이지`));
        if (result.next) pages.append(button('다음 →',()=>load(page+1)));
      } catch (error) {if (requested===revision&&rows.isConnected) showError(error,status);}
    }
    if (ranked) {
      catalog().then(({courses:list})=>{
        if (!status.isConnected) return;
        for (const [id,course] of Object.entries(list)) filter.add(new Option(course.label,id));
        const courseLabel=element('label','코스');
        filter.className='record-select';
        courseLabel.append(filter);
        $('record-filter').append(courseLabel);
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
    if (tutorialEnabled&&!user) {
      const tutorial=element('a','AI 출근 튜토리얼');
      tutorial.href='/tutorial/';
      tutorial.className='btn';
      actions.append(tutorial);

    }
    if (preference) $('menu-status').textContent=
      (preference==='bus'?'버스':'지하철')+' 경로가 선택됐습니다. '+(user?'게임 시작에서 코스를 확인하세요.':'본 게임은 로그인 후 시작할 수 있습니다.');
    if (!user) {
      $('intro-note').textContent='공덕동에서 충정로역 근처 회사까지 출근하세요.';
      const login=button('로그인',()=>accountForm('login'));
      actions.prepend(button('ID 생성',()=>accountForm('signup'),'btn light'),login);
      if (preference) login.focus();
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
    actions.append(button('로그아웃',async event=>{
      const control=event.currentTarget;
      control.disabled=true;
      try {await api('logout',{});setAccount(null);menu();}
      catch (error) {control.disabled=false;showError(error,$('menu-status'));}
    }));
  }
  return {renderMenu,accountForm,showError};
}

export const idPattern = /^[a-zA-Z가-힣]{1,10}$/u;
export const pinPattern = /^[0-9]{4}$/;

export function validateSignup(rawNickname, password) {
  const nickname = rawNickname.normalize('NFC');
  const errors = {};
  if (!nickname) errors.nickname = '닉네임을 입력해주세요.';
  else if (/\s/u.test(nickname)) errors.nickname = '닉네임에는 공백을 넣을 수 없어요.';
  else if ([...nickname].length > 10) errors.nickname = '닉네임은 최대 10자까지 입력할 수 있어요.';
  else if (!idPattern.test(nickname)) errors.nickname = '닉네임은 한글 완성형과 영문만 사용할 수 있어요.';
  if (!password) errors.password = '비밀번호를 입력해주세요.';
  else if (!pinPattern.test(password)) errors.password = '비밀번호는 숫자 4자리로 입력해주세요.';
  return { nickname, password, errors };
}

export function signupFailure(error) {
  if (error.status === 409 && error.message === 'duplicate_id')
    return { field: 'nickname', message: '이미 사용 중인 닉네임이에요. 영문 대소문자만 달라도 같은 ID로 처리해요.' };
  if (error.status === 400 && error.message === 'account_input')
    return { message: '닉네임과 숫자 4자리 비밀번호 규칙을 다시 확인해주세요.' };
  return { message: '가입 요청을 완료하지 못했어요. 연결을 확인하고 다시 시도해주세요.' };
}

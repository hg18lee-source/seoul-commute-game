const actions = {
  walk: ['이곳으로 이동', 0.85, '방향키', '표시된 영역까지 이동'],
  interact: ['연습 안내', 1.35, 'E', '연습 안내 확인'],
  entranceApproach: ['오른쪽 계단 입구', 0.30, '방향키', '계단 오른쪽 입구로 이동'],
  entrance: ['오른쪽 계단 아래', 0.33, '↑', '오른쪽 통로로 내려가기'],
  gate: ['개찰구', 1.15, 'E', '개찰구 열기'],
  pass: ['개찰구 통과 지점', 0.5, '↑', '열린 중앙 통로 지나가기'],
  platform: ['충정로 방면', 0.85, '방향키', '오른쪽 승강장으로 이동'],
  railBoard: ['열차 문', 0.85, '→', '열린 문으로 걸어 타기'],
  railExit: ['열차 하차문', 0.75, '↑', '열린 문으로 걸어 내리기'],
  busStop: ['260번 정류장', 1.35, 'E', '260번 노선 확인'],
  busBoard: ['버스 앞문', 1.35, 'E', '버스 앞문에서 탑승'],
  bell: ['하차 벨', 1.1, 'E', '하차 벨 누르기'],
  busExit: ['버스 뒷문', 1.35, 'E', '버스 뒷문에서 하차'],
};

export function describeTarget(stage, point, context = {}) {
  if (!point) {
    const [key, text] = {
      skills: ['방향키 두 개 · Shift', '대각선 이동과 달리기'],
      choose: ['경로 확인', '이 경로로 계속을 선택'],
      railRide: ['대기', '충정로역에 도착하면 하차 안내가 나타납니다.'],
      busRide: ['대기', '하차 요청 완료. 정차하면 뒷문이 열립니다.'],
    }[stage] ?? ['', ''];
    return { point: null, key, text, ready: false };
  }
  const [label, radius, key, action] = actions[stage];
  const horizontal = Math.hypot(context.x - point[0], context.z - point[1]);
  const elevation = stage === 'entrance' ? Math.abs(context.y - context.entranceTargetY) : 0;
  const distance = Math.hypot(horizontal, elevation);
  const nearby = horizontal <= radius && elevation <= .22;
  const blocked = stage === 'pass' && !context.gateOpen;
  const misaligned = stage === 'pass' && nearby && Math.abs(context.x) > .44;
  const ready = nearby && !blocked && !misaligned;
  return {
    point, label, radius, distance, nearby, ready,
    key: blocked ? '대기' : ready ? key : '방향키',
    text: blocked ? '개찰구 문이 열리는 중입니다.' :
      misaligned ? '몸을 개찰구 중앙으로 맞추세요.' : ready ? action : stage === 'entrance' ? '오른쪽 통로를 따라 계단을 내려가세요.' : label + ' 표시로 이동하세요.',
    activation: key === 'E' ? 'interact' : 'walk',
  };
}

export function indicatorPosition(x, y, rect, view) {
  const middleX = (rect.left + rect.right) / 2;
  const middleY = (rect.top + rect.bottom) / 2;
  const deltaX = x - middleX;
  const deltaY = y - middleY;
  if (!view.behind && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
    return { x, y, edge: false, angle: 0 };
  const dx = Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001 ? 0 : deltaX;
  const dy = dx === 0 && Math.abs(deltaY) < 0.001 ? 1 : deltaY;
  const scale = Math.min(
    dx ? (rect.right - middleX) / Math.abs(dx) : Infinity,
    dy ? (rect.bottom - middleY) / Math.abs(dy) : Infinity,
  );
  return { x: middleX + dx * scale, y: middleY + dy * scale, edge: true,
    angle: Math.atan2(dy, dx) * 180 / Math.PI + 90 };
}

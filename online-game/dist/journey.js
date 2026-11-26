// Canonical playable journey shared by the browser, server validation and self-tests.
export const CHECKPOINTS = Object.freeze({
  entrance: Object.freeze({start:Object.freeze({x:-5,z:15}),street:Object.freeze({x:-5,z:-32.1,radius:1.7}),
    hall:Object.freeze({x:0,z:14}),landingZ:-32.1}),
  gate: Object.freeze({hall:Object.freeze({x:0,z:1.6,radius:2.35,maxX:.47,maxZ:2.06}),
    platform:Object.freeze({x:0,z:8}),triggerZ:2.05}),
  trainBoard: Object.freeze({platform:Object.freeze({x:4.45,z:0,radius:.85}),
    vehicle:Object.freeze({x:0,z:4})}),
  trainAlight: Object.freeze({vehicle:Object.freeze({x:0,z:-11,radius:.85}),
    platform:Object.freeze({x:0,z:8})}),
  stationExit: Object.freeze({platform:Object.freeze({x:0,z:-24}),hall:Object.freeze({x:0,z:14}),
    street:Object.freeze({x:0,z:34})}),
  officeFinish: Object.freeze({office:Object.freeze({x:0,z:-26,radius:1.2})}),
  busStop: Object.freeze({street:Object.freeze({x:7,z:-42,radius:1.4}),vehicle:Object.freeze({x:0,z:4})}),
  busOfficeStart: Object.freeze({office:Object.freeze({x:0,z:14})}),
});

export const CONNECTED_ENTRANCE_RULES = 'gongdeok-chungjeongno-walk-6';
export const STATION_ENTRANCE = Object.freeze({
  opening: {left:-6.93,right:-3.07,front:-22.19,back:-29.35},
  entry: {x:-4,z:-22.19,minX:-4.52,maxX:-3.68},
  landing: {x:-4,z:-32.8,y:-4.048},
  turn: {x:.55,z:-33.75},
  exit: {x:.55,z:-38.15,minX:-.96,maxX:2.06},
  shaftEnd:-31.064,
  dividerEnd:-31.75,
  descentEnd:-32.25,
  sideOpening:-32.15,
  bend:-35.5,
  corridorLeft:-1.2,
  corridorRight:2.3,
  end:-39,
  ceiling:-.77,
});

export function insideEntranceFloor(x,z) {
  const {opening:o,sideOpening,bend,corridorLeft,corridorRight,end}=STATION_ENTRANCE;
  if (z>=sideOpening) return x>=o.left&&x<=o.right&&z<=o.front;
  if (z>=bend) return x>=o.left&&x<=corridorRight;
  return z>=end&&x>=corridorLeft&&x<=corridorRight;
}

export const ENTRANCE_PLAYER_RADIUS = .24;

export function entranceWalkable(x,z) {
  const {opening:o,entry,dividerEnd}=STATION_ENTRANCE;
  const radius=ENTRANCE_PLAYER_RADIUS;
  if (z>o.front+.01) return false;
  if (z>dividerEnd&&(x<entry.minX||x>entry.maxX)) return false;
  const front=Math.min(o.front,z+radius), back=z-radius;
  return insideEntranceFloor(x-radius,front)&&insideEntranceFloor(x+radius,front)
    &&insideEntranceFloor(x-radius,back)&&insideEntranceFloor(x+radius,back);
}

export function atEntranceEntry(x,z) {
  const {entry}=STATION_ENTRANCE;
  return x>=entry.minX&&x<=entry.maxX&&z<=entry.z&&z>=entry.z-.3;
}

export function atEntranceExit(x,z) {
  const {exit,end}=STATION_ENTRANCE;
  return x>=exit.minX&&x<=exit.maxX&&z<=exit.z&&z>=end+.23;
}

export const RIGHT_EXIT_RULES = 'gongdeok-chungjeongno-walk-5';
export const usesRightStationExit = version => version===RIGHT_EXIT_RULES||version===CONNECTED_ENTRANCE_RULES;
export const RIGHT_STATION_EXIT = Object.freeze({x:2.25,z:-24,radius:1.25});
export const insideRightStationExit = (x,z) =>
  Math.hypot(x-RIGHT_STATION_EXIT.x,z-RIGHT_STATION_EXIT.z)<RIGHT_STATION_EXIT.radius;
export const RIGHT_EXIT_PATH = Object.freeze([
  CHECKPOINTS.trainAlight.platform,
  Object.freeze({x:RIGHT_STATION_EXIT.x,z:5.5}),
  RIGHT_STATION_EXIT,
]);

export const TRAIN_LINES = Object.freeze({
  '5': Object.freeze(['마포', '공덕', '애오개', '충정로', '서대문']),
  '2': Object.freeze(['아현', '충정로', '시청', '을지로입구']),
});

export const BUS_STOPS = Object.freeze([
  '공덕역', '마포경찰서', '아현초등학교', '충정로역',
]);

export const COURSE = Object.freeze({
  id: 'gongdeok-chungjeongno-office-walk',
  label: '지하철 5호선 · 공덕 → 충정로',
  detail: '공덕역 입장 → 5호선 충정로 하차 → 도보로 회사',
  transport: 'train',
  line: '5',
  origin: '공덕',
  destination: '충정로',
  destinationIndex: TRAIN_LINES['5'].indexOf('충정로'),
  direction: 1,
  trainTravelSeconds: 12,
  trainDoorSeconds: 6,
  trainCycleSeconds: 48,
});

export const BUS_COURSE = Object.freeze({
  id: 'gongdeok-chungjeongno-260-office-walk',
  label: '버스 260번 · 공덕 → 충정로',
  detail: '공덕역 정류장에서 260번 탑승 → 마포경찰서 → 아현초등학교 → 충정로역 하차 → 도보로 회사',
  transport: 'bus',
  busNumber: '260',
  line: '5',
  origin: '공덕',
  destination: BUS_STOPS[3],
  destinationLabel: '충정로역',
  startBusIndex: 0,
  destinationIndex: 3,
  busTravelSeconds: 13,
  busDoorSeconds: 5,
  busCycleSeconds: 42,
  finishPoint: Object.freeze({x:0,z:-6,radius:1.2}),
});

export const COURSES = Object.freeze({ [COURSE.id]: COURSE, [BUS_COURSE.id]: BUS_COURSE });

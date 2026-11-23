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

export const RIGHT_EXIT_RULES = 'gongdeok-chungjeongno-walk-5';
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

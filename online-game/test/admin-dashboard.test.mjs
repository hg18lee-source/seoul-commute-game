import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cause, officialTime, runResult, seoulDay, stamp, syncLabel } from '../dist/admin-completions.js';
import { adminPage } from '../server/admin-page.mjs';

test('admin formats official tenths like the game and uses the Seoul date boundary', () => {
  assert.equal(officialTime(1049), '01:44.9');
  assert.equal(officialTime(599), '00:59.9');
  assert.equal(officialTime(600), '01:00.0');
  assert.equal(officialTime(0), '00:00.0');
  const before = new Date('2026-02-02T14:59:59.999Z');
  const after = new Date('2026-02-02T15:00:00.000Z');
  assert.equal(seoulDay(before), '2026-02-02');
  assert.equal(stamp(before), '2026-02-02 23:59:59');
  assert.equal(stamp(after), '2026-02-03 00:00:00');
});

test('run labels preserve unknown codes and distinguish missing history from pending reflection', () => {
  assert.equal(cause('record_saved'), '기록 저장으로 자동 실행');
  assert.equal(cause('admin_recalculate'), '관리자가 재계산');
  assert.equal(cause('future_cause'), 'future_cause');
  assert.equal(runResult('failed'), '실패');
  assert.equal(runResult('unchanged'), '변경 없음');
  assert.equal(runResult('future_status'), 'future_status');
  assert.equal(syncLabel({count:0, lastSuccessAt:null, matchesLastRun:false}), '비교할 성공 집계 없음');
  assert.equal(syncLabel({count:1, lastSuccessAt:null, matchesLastRun:false}), '최신 기록 반영 확인 중');
  assert.equal(syncLabel({count:0, lastSuccessAt:'earlier', matchesLastRun:false}), '최신 기록 반영 확인 중');
  assert.equal(syncLabel({count:1, latestRun:{status:'failed'}, matchesLastRun:false}), '원본과 마지막 성공 집계 불일치');
  assert.equal(syncLabel({matchesLastRun:true}), '원본과 마지막 성공 집계 일치');
});

test('dashboard starts with loading values and separate filters for requests and completion evidence', () => {
  for (const field of ['count','train','bus','updated']) {
    assert.match(adminPage, new RegExp('id="completion-'+field+'">조회 중…'));
  }
  assert.match(adminPage, /id="filters"[^]*name="from"[^]*name="to"/);
  assert.match(adminPage, /id="basis-filter"><label>집계 대상일 \(서울\) <input name="date"/);
  assert.match(adminPage, /공식 기록이 저장되면 서버가 자동으로 집계합니다\./);
  assert.match(adminPage, /이 화면은 5초마다 최신 결과를 확인합니다\./);
  assert.doesNotMatch(adminPage, /01:44\.9|id="completion-count">0건/);
});

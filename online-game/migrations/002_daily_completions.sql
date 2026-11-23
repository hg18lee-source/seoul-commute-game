-- Fail and roll back if another transaction prevents timely acquisition of the index-build lock.
SET LOCAL lock_timeout = '2s';
CREATE INDEX commute_records_daily ON commute_records (course, rules, finished_at, play_id) INCLUDE (tenths);

CREATE TABLE commute_daily_completion_runs (
  id uuid PRIMARY KEY,
  sequence bigint GENERATED ALWAYS AS IDENTITY,
  cause text NOT NULL CHECK (cause IN ('record_saved', 'admin_recalculate')),
  request_id uuid NOT NULL,
  play_id uuid,
  target_date date NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'failed', 'unchanged')),
  previous jsonb,
  summary jsonb,
  reason text
);
CREATE INDEX commute_daily_runs_history ON commute_daily_completion_runs (target_date, sequence DESC);
CREATE UNIQUE INDEX commute_daily_runs_request ON commute_daily_completion_runs (request_id);

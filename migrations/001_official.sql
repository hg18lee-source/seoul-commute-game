CREATE TABLE commute_users (
  id uuid PRIMARY KEY,
  nickname text NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 10),
  login_id text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('player', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE commute_sessions (
  token_hash bytea PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES commute_users(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX commute_sessions_expiry ON commute_sessions (expires_at);

CREATE TABLE commute_plays (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES commute_users(id),
  session_hash bytea NOT NULL REFERENCES commute_sessions(token_hash) ON DELETE CASCADE,
  course text NOT NULL,
  rules text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','success','cancelled','invalid')),
  started_at timestamptz NOT NULL,
  seen_at timestamptz NOT NULL,
  paused_at timestamptz,
  paused_ms integer NOT NULL DEFAULT 0,
  seq integer NOT NULL DEFAULT 0,
  state jsonb NOT NULL,
  invalid_reason text
);
CREATE INDEX commute_plays_active ON commute_plays (seen_at) WHERE status = 'active';
CREATE INDEX commute_plays_session ON commute_plays (session_hash) WHERE status = 'active';

CREATE TABLE commute_progress (
  play_id uuid NOT NULL REFERENCES commute_plays(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  received_at timestamptz NOT NULL,
  events jsonb NOT NULL,
  PRIMARY KEY (play_id, seq)
);

CREATE TABLE commute_records (
  play_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES commute_users(id),
  course text NOT NULL,
  rules text NOT NULL,
  tenths integer NOT NULL CHECK (tenths > 0),
  finished_at timestamptz NOT NULL
);
CREATE INDEX commute_records_rank ON commute_records (course, rules, user_id, tenths);
CREATE INDEX commute_records_mine ON commute_records (user_id, finished_at DESC);

CREATE TABLE commute_audit (
  id uuid PRIMARY KEY,
  at timestamptz NOT NULL,
  user_id uuid REFERENCES commute_users(id),
  action text NOT NULL,
  method text NOT NULL,
  http_status integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('ALLOW','BLOCK','FAIL')),
  reason text NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  play_id uuid,
  cache_hit boolean,
  external_calls integer NOT NULL DEFAULT 0,
  external_failures integer NOT NULL DEFAULT 0
);
CREATE INDEX commute_audit_at ON commute_audit (at DESC, id);
CREATE INDEX commute_audit_user_at ON commute_audit (user_id, at DESC);
CREATE INDEX commute_audit_action_at ON commute_audit (action, at DESC);

CREATE TABLE commute_upstream (
  request_id uuid NOT NULL REFERENCES commute_audit(id) ON DELETE CASCADE,
  call_number integer NOT NULL,
  provider text NOT NULL,
  operation text NOT NULL,
  at timestamptz NOT NULL,
  duration_ms integer NOT NULL,
  http_status integer,
  result text NOT NULL,
  PRIMARY KEY (request_id, call_number)
);

CREATE TABLE commute_transit_cache (
  cache_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);

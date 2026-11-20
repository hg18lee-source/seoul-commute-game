let account = null;

export const currentAccount = () => account;
export const setAccount = value => { account = value; };

export async function api(path, data, options = {}) {
  const headers = {};
  if (data !== undefined) {
    headers['Content-Type'] = 'application/json';
    if (account) headers['X-CSRF-Token'] = account.csrf;
  }
  const response = await fetch('/api/' + path, {
    method:data === undefined ? 'GET' : 'POST', headers,
    body:data === undefined ? undefined : JSON.stringify(data),
    signal:options.signal ?? AbortSignal.timeout(10000), keepalive:options.keepalive,
  });
  const answer = await response.json();
  if (!response.ok) {
    const error = new Error(answer.error ?? 'service_error');
    error.status = response.status;
    throw error;
  }
  return answer;
}

export function createPlay(id, snapshot, disconnected) {
  const origin = performance.now();
  const wall = () => Math.round(performance.now() - origin);
  const events = [];
  let lastReply = origin, seq = 0, stopped = false, finishing = false, inflight;
  const connectionError = error => error.message === 'connection_lost'
    || (error.status === undefined && performance.now()-lastReply>=10000);
  function close() {
    stopped = true;
    clearInterval(timer);
    clearInterval(watchdog);
  }
  function abort(error) {
    if (stopped) return;
    close();
    disconnected(error, finishing);
  }
  function check() {
    if (!stopped && performance.now()-lastReply>=10000) abort(new Error('connection_lost'));
    return !stopped;
  }
  function event(kind, before) {
    if (!stopped) events.push({kind,wall:wall(),before,after:snapshot()});
  }
  async function send(action) {
    if (!check()) throw new Error('connection_lost');
    event('sample');
    const payload = {id,seq:seq+1,wall:wall(),events:events.splice(0)};
    for (;;) {
      try {
        const signal = AbortSignal.timeout(Math.min(3300,Math.max(1,10000-(performance.now()-lastReply))));
        const result = await api(action,payload,{signal});
        if (!check()) throw new Error('connection_lost');
        lastReply = performance.now();
        seq = payload.seq;
        return result;
      } catch (error) {
        if (stopped || connectionError(error) || (error.status && error.status < 500) || action==='play-finish') throw error;
        await new Promise(resolve=>setTimeout(resolve,240));
        if (!check()) throw new Error('connection_lost');
      }
    }
  }
  function sync() {
    if (stopped || finishing || inflight) return;
    inflight = send('play-progress').catch(abort).finally(()=>{inflight=undefined;});
  }
  const timer = setInterval(sync,2700);
  const watchdog = setInterval(check,200);
  return {
    event,sync,check,
    async finish() {
      finishing = true;
      await inflight;
      if (stopped) throw new Error('connection_lost');
      try {return await send('play-finish');} finally {close();}
    },
    cancel() {
      close();
      api('play-cancel',{id},{keepalive:true}).catch(()=>{});
    },
  };
}

export function element(tag, text) {
  const node=document.createElement(tag);
  if (text!==undefined) node.textContent=text;
  return node;
}

export const kst = new Intl.DateTimeFormat('ko-KR',{dateStyle:'short',timeStyle:'medium',timeZone:'Asia/Seoul'});

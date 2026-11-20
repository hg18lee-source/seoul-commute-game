import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { hash, verify, Algorithm } from '@node-rs/argon2';

const requirements = {algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1};
export const defaultSessionHours = 24;
export const idPattern = /^[a-zA-Z가-힣]{1,10}$/u;
export const pinPattern = /^[0-9]{4}$/;
export function strongPassword(value) {
  if (typeof value!=='string'||value.length>256) return false;
  const chars=[...value];
  return chars.length>=20&&chars.length<=128&&new Set(chars).size>=8;
}
export const digest = token => createHash('sha256').update(token).digest();

export function identity(value) {
  if (typeof value !== 'string' || value.length > 60) return null;
  const nickname = value.normalize('NFC');
  return idPattern.test(nickname) ? {nickname, loginId:nickname.toLowerCase()} : null;
}

export function passwords(pepper) {
  if (typeof pepper !== 'string' || Buffer.byteLength(pepper) < 32) throw new Error('PASSWORD_PEPPER_REQUIRED');
  const secret = Buffer.from(pepper);
  const options = {...requirements, secret};
  const create = value => hash(value, options);
  let dummy;
  return {
    create,
    async matches(encoded, candidate) {
      const fallback = await (dummy ??= create(randomBytes(24).toString('hex')));
      return (await verify(encoded || fallback, candidate, {secret})) && Boolean(encoded);
    },
  };
}

export function authentication({pepper, secure, sessionHours=defaultSessionHours}) {
  const password = passwords(pepper);
  const cookieName = secure ? '__Host-commute' : 'commute-local';
  const csrf = token => createHmac('sha256', pepper).update('commute-csrf-v1\0').update(token).digest('base64url');
  const attributes = 'Path=/; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : '');
  const view = (user, token) => ({id:user.id, nickname:user.nickname, role:user.role, csrf:csrf(token)});
  return {
    password,
    validCsrf: (context, value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
      && timingSafeEqual(Buffer.from(value), Buffer.from(csrf(context.token))),
    async find(db, headers, lock) {
      const token = headers.get('cookie')?.split(';').map(part=>part.trim())
        .find(part=>part.startsWith(cookieName+'='))?.slice(cookieName.length+1);
      if (!token) return {user:null, invalid:false};
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return {user:null, invalid:true};
      const tokenHash = digest(token);
      const {rows:[user]} = await db.query(
        'SELECT u.id,u.nickname,u.role FROM commute_sessions s JOIN commute_users u ON u.id=s.user_id '+
        'WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp() AND s.revoked_at IS NULL'+(lock?' FOR UPDATE OF s':''),
        [tokenHash]);
      return user ? {user, tokenHash, token, view:view(user,token)} : {user:null,invalid:true};
    },
    async issue(db, user) {
      const token = randomBytes(32).toString('base64url');
      const seconds = sessionHours * 3600;
      await db.query('INSERT INTO commute_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+$3*interval \'1 second\')',
        [digest(token),user.id,seconds]);
      return {body:{user:view(user,token)},cookie:cookieName+'='+token+'; Max-Age='+seconds+'; '+attributes};
    },
    clear:cookieName+'=; Max-Age=0; '+attributes,
    async signup(db, body) {
      const id = identity(body.nickname);
      if (!id || typeof body.password !== 'string' || !pinPattern.test(body.password)) return null;
      const {rows:[user]} = await db.query(
        "INSERT INTO commute_users(id,nickname,login_id,password_hash,role) VALUES ($1,$2,$3,$4,'player') "+
        'ON CONFLICT (login_id) DO NOTHING RETURNING id,nickname,role',
        [randomUUID(),id.nickname,id.loginId,await password.create(body.password)]);
      return user || false;
    },
    async login(db, body, role) {
      const id = identity(body.nickname);
      const valid = role==='admin' ? strongPassword(body.password) : typeof body.password==='string' && pinPattern.test(body.password);
      const {rows:[user]} = id && valid ? await db.query(
        'SELECT id,nickname,password_hash,role FROM commute_users WHERE login_id=$1 AND role=$2',
        [id.loginId,role]) : {rows:[]};
      return await password.matches(user?.password_hash,valid ? body.password : '') ? user : null;
    },
  };
}

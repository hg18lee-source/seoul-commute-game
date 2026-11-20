import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { identity, passwords, strongPassword } from '../server/auth.mjs';
import { makePool } from '../server/db.mjs';

async function readPassword() {
  if (!process.stdin.isTTY) throw new Error('tty');
  const hidden=new Writable({write(chunk,encoding,done){done();}});
  const input=createInterface({input:process.stdin,output:hidden,terminal:true});
  async function ask(prompt) {
    process.stderr.write(prompt);
    try {return await input.question('');}
    finally {process.stderr.write('\n');}
  }
  try {
    const password=await ask('관리자 비밀번호 (20~128자): ');
    const confirm=await ask('비밀번호 확인: ');
    if (!strongPassword(password)||password!==confirm) throw new Error('password');
    return password;
  } finally {input.close();}
}

let pool;
try {
  const id=identity(process.argv[2]);
  if (!id) throw new Error('nickname');
  const encoded=await passwords(process.env.PASSWORD_PEPPER).create(await readPassword());
  pool=makePool(process.env.DIRECT_DATABASE_URL||process.env.DATABASE_URL);
  await pool.query("INSERT INTO commute_users(id,nickname,login_id,password_hash,role) VALUES ($1,$2,$3,$4,'admin')",
    [randomUUID(),id.nickname,id.loginId,encoded]);
  console.log('관리자를 생성했습니다.');
} catch {console.error('관리자 생성 실패. 닉네임·비밀번호·중복 ID와 DB 구성을 확인하세요.');process.exitCode=1;}
finally {await pool?.end();}

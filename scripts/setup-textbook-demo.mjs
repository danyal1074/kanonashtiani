// Add convenient login aliases to existing, unlocked sample students. Never runs outside demo mode.
import '../server/env.js';
import { all, get, run, closeDb } from '../server/db.js';
import { verifyPasswordAsync } from '../server/util.js';
import { feeStatus } from '../server/logic.js';
if(process.env.ROSHD_DEMO!=='1')throw Error('Demo mode is required');
try{
  for(const [grade,username] of [[4,'book4'],[9,'book9']]){
    const existing=get('SELECT u.id,u.pass_hash,s.grade FROM users u JOIN students s ON s.user_id=u.id WHERE u.username=? AND u.role=\'student\'',username);
    if(existing){if(existing.grade!==grade||feeStatus(existing.id)?.locked||!await verifyPasswordAsync('123456',existing.pass_hash))throw Error(`Existing ${username} is not an unlocked sample account`);console.log(`${username}: ready (grade ${grade})`);continue;}
    const candidates=all('SELECT u.id,u.pass_hash FROM users u JOIN students s ON s.user_id=u.id WHERE u.role=\'student\' AND u.active=1 AND u.username IS NULL AND s.grade=? ORDER BY u.id',grade);
    let selected;
    for(const candidate of candidates){if(!feeStatus(candidate.id)?.locked&&await verifyPasswordAsync('123456',candidate.pass_hash)){selected=candidate;break;}}
    if(!selected)throw Error(`No unlocked sample account with the standard demo password for grade ${grade}`);
    const result=run('UPDATE users SET username=? WHERE id=? AND username IS NULL',username,selected.id);
    if(result.changes!==1)throw Error('Sample login alias changed concurrently');
    console.log(`${username}: ready (grade ${grade}); original national-code login preserved`);
  }
}finally{closeDb();}

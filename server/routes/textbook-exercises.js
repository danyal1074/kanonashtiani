import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, all, get, run } from '../db.js';
import { fail } from '../util.js';
import { serveFile } from '../http.js';
import { ensureTextbookStore } from '../textbook-store.js';
import { generateQuiz, validateQuestions } from '../textbook-ai.js';
import { bookFor, textbookRoot, normalize } from './textbooks.js';

function demo(){if(process.env.ROSHD_DEMO!=='1')fail(404,'این بخش فقط در دمو فعال است');ensureTextbookStore();}
const questions=q=>JSON.parse(q.questions_json);
const publicQuestions=q=>questions(q).map(({correct_index,explanation,...rest})=>rest);
const bookAccess=(ctx,id)=>bookFor({...ctx,params:{...ctx.params,id}});
function scope(body,book){
  const from=Number(body.from),to=Number(body.to),count=Number(body.count||5),kind=body.kind||'mcq';
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to>book.printed_pages||from>to||to-from>=30)fail(400,'یک بازهٔ حداکثر ۳۰ صفحه‌ای از کتاب انتخاب کنید');
  if(!Number.isInteger(count)||count<1||count>8||!['mcq','essay'].includes(kind))fail(400,'نوع یا تعداد سؤال نامعتبر است (۱ تا ۸ سؤال)');
  return {from,to,count,kind};
}
function quizAccess(ctx,id){
  demo();const q=get('SELECT * FROM textbook_quizzes WHERE id=?',Number(id));if(!q)fail(404,'برگه یافت نشد');if(q.source==='rejected')fail(409,'این نمونه در بررسی علمی کنار گذاشته شده است');bookAccess(ctx,q.book_id);
  if((q.source==='manual'||q.kind==='essay')&&q.owner_id!==ctx.user.id)fail(403,'این پیش‌نویس متعلق به شما نیست');return q;
}
function paperAccess(ctx,id){
  demo();const paper=get('SELECT p.*,q.book_id,q.questions_json,q.kind,q.from_page,q.to_page,q.source,c.name class_name,c.grade FROM textbook_papers p JOIN textbook_quizzes q ON q.id=p.quiz_id JOIN classes c ON c.id=p.class_id WHERE p.id=?',Number(id));
  if(!paper)fail(404,'برگه یافت نشد');bookAccess(ctx,paper.book_id);
  if(ctx.user.role==='teacher'){if(paper.teacher_id!==ctx.user.id)fail(403,'این برگه متعلق به شما نیست');}
  else if(get('SELECT class_id FROM students WHERE user_id=?',ctx.user.id)?.class_id!==paper.class_id)fail(403,'این برگه مربوط به کلاس شما نیست');
  return paper;
}
const photoRoot=()=>path.join(DATA_DIR,'textbook-private-images');
function savePhoto(file){
  if(typeof file?.data!=='string'||file.data.length>2800000)fail(400,'هر عکس باید حداکثر ۲ مگابایت باشد');
  const m=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(file.data);if(!m)fail(400,'فقط عکس JPG، PNG یا WebP مجاز است');
  const b=Buffer.from(m[2],'base64');if(b.length>2*1024*1024||b.length<12)fail(400,'حجم عکس نامعتبر است');
  const valid=m[1]==='jpeg'?b[0]===255&&b[1]===216&&b[2]===255:m[1]==='png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
  if(!valid)fail(400,'محتوای فایل عکس معتبر نیست');
  fs.mkdirSync(photoRoot(),{recursive:true,mode:0o700});const name=`${crypto.randomUUID()}.${m[1]==='jpeg'?'jpg':m[1]}`;fs.writeFileSync(path.join(photoRoot(),name),b,{mode:0o600});return name;
}
async function servePhoto(ctx,name){if(!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(name))fail(404,'عکس یافت نشد');ctx.handled=true;await serveFile(ctx.req,ctx.res,path.join(photoRoot(),name),{priv:true,sandbox:true});}

export default function register(r){
  const roles={roles:['student','teacher']}, teacher={roles:['teacher']};
  r.post('/api/textbooks/:id/generate',roles,async ctx=>{
    demo();const book=bookFor(ctx),s=scope(ctx.body,book);if(s.kind==='essay'&&ctx.user.role!=='teacher')fail(403,'طرح سؤال تشریحی ویژهٔ معلم است');
    const result=await generateQuiz({user:ctx.user,book,...s,figures:ctx.body.figures===true,assetsRoot:textbookRoot()});
    if(s.kind==='essay')return {quiz_id:result.quiz.id,cached:result.cached};
    const id=Number(run('INSERT INTO textbook_attempts(user_id,quiz_id) VALUES(?,?)',ctx.user.id,result.quiz.id).lastInsertRowid);
    return {attempt_id:id,cached:result.cached};
  });
  r.get('/api/textbook-attempts/:id',roles,ctx=>{
    demo();const a=get('SELECT a.*,q.book_id,q.questions_json,q.from_page,q.to_page,q.source FROM textbook_attempts a JOIN textbook_quizzes q ON q.id=a.quiz_id WHERE a.id=? AND a.user_id=?',Number(ctx.params.id),ctx.user.id);
    if(!a)fail(404,'تمرین یافت نشد');if(a.source==='rejected')fail(409,'این نمونه در بررسی علمی کنار گذاشته شده است؛ تمرین تازه‌ای انتخاب کن');const book=bookAccess(ctx,a.book_id);
    return {id:a.id,book_id:a.book_id,title:book.title,from:a.from_page,to:a.to_page,source:a.source,questions:a.submitted_at?questions(a):publicQuestions(a),result:a.result_json?JSON.parse(a.result_json):null};
  });
  r.post('/api/textbook-attempts/:id/submit',roles,ctx=>{
    demo();const a=get('SELECT a.*,q.book_id,q.questions_json,q.source FROM textbook_attempts a JOIN textbook_quizzes q ON q.id=a.quiz_id WHERE a.id=? AND a.user_id=?',Number(ctx.params.id),ctx.user.id);
    if(!a)fail(404,'تمرین یافت نشد');if(a.source==='rejected')fail(409,'این نمونه در بررسی علمی کنار گذاشته شده است');bookAccess(ctx,a.book_id);if(a.submitted_at)return JSON.parse(a.result_json);
    const qs=questions(a),answers=ctx.body.answers;if(!Array.isArray(answers)||answers.length!==qs.length||answers.some(x=>x!==null&&(!Number.isInteger(x)||x<0||x>3)))fail(400,'پاسخ‌ها نامعتبرند');
    const correct=qs.filter((q,i)=>answers[i]===q.correct_index).length,blank=answers.filter(x=>x===null).length;
    const result={correct,blank,wrong:qs.length-correct-blank,total:qs.length,percent:Math.round(correct/qs.length*100),answers};
    run("UPDATE textbook_attempts SET answers_json=?,result_json=?,submitted_at=datetime('now') WHERE id=? AND submitted_at IS NULL",JSON.stringify(answers),JSON.stringify(result),a.id);
    return JSON.parse(get('SELECT result_json FROM textbook_attempts WHERE id=?',a.id).result_json);
  });
  r.get('/api/textbooks/:id/classes',teacher,ctx=>{
    demo();const book=bookFor(ctx);
    return all('SELECT DISTINCT c.id,c.name,c.grade,tc.subject FROM teacher_classes tc JOIN classes c ON c.id=tc.class_id WHERE tc.teacher_id=? AND c.grade=? AND c.center_id=?',ctx.user.id,book.grade,ctx.user.center_id).filter(c=>normalize(c.subject).split(/[،,]/).some(s=>normalize(s)===book.subject_key||book.subject_key==='علوم'&&normalize(s)==='علوم تجربی')).filter((c,i,a)=>a.findIndex(x=>x.id===c.id)===i);
  });
  r.post('/api/textbooks/:id/manual',teacher,ctx=>{
    demo();const book=bookFor(ctx),s=scope({...ctx.body,kind:'essay',count:ctx.body.questions?.length},book);
    if(!Array.isArray(ctx.body.questions))fail(400,'سؤال‌ها را وارد کنید');
    const qs=validateQuestions({questions:ctx.body.questions.map(q=>({...q,explanation:q.explanation||'پاسخ راهنما ثبت نشده است.',figure:q.file?undefined:q.figure}))},{...s,kind:'essay'});
    const files=[];try{
      qs.forEach((q,i)=>{if(ctx.body.questions[i].file){const file=savePhoto(ctx.body.questions[i].file);files.push(file);q.figure={type:'upload',file};}});
      const id=Number(run("INSERT INTO textbook_quizzes(owner_id,book_id,from_page,to_page,kind,source,questions_json) VALUES(?,?,?,?,'essay','manual',?)",ctx.user.id,book.id,s.from,s.to,JSON.stringify(qs)).lastInsertRowid);return {quiz_id:id};
    }catch(e){files.forEach(f=>fs.rmSync(path.join(photoRoot(),f),{force:true}));throw e;}
  });
  r.get('/api/textbook-quizzes/:id',teacher,ctx=>{const q=quizAccess(ctx,ctx.params.id);return {id:q.id,book_id:q.book_id,from:q.from_page,to:q.to_page,kind:q.kind,source:q.source,questions:questions(q)};});
  r.get('/api/textbook-quizzes/:id/figures/:index',roles,async ctx=>{
    demo();const q=get('SELECT * FROM textbook_quizzes WHERE id=?',Number(ctx.params.id));if(!q)fail(404,'سؤال یافت نشد');bookAccess(ctx,q.book_id);
    if(q.owner_id!==ctx.user.id){const cls=get('SELECT class_id FROM students WHERE user_id=?',ctx.user.id)?.class_id;if(ctx.user.role!=='student'||!get('SELECT id FROM textbook_papers WHERE quiz_id=? AND class_id=?',q.id,cls||-1))fail(403,'دسترسی به شکل مجاز نیست');}
    const f=questions(q)[Number(ctx.params.index)]?.figure;if(f?.type!=='upload')fail(404,'شکل یافت نشد');await servePhoto(ctx,f.file);
  });
  r.post('/api/textbook-quizzes/:id/publish',teacher,ctx=>{
    const q=quizAccess(ctx,ctx.params.id);if(q.owner_id!==ctx.user.id||q.kind!=='essay')fail(403,'فقط پیش‌نویس تشریحی خودتان را منتشر کنید');
    const book=bookAccess(ctx,q.book_id),classId=Number(ctx.body.class_id),deadline=new Date(ctx.body.deadline),title=String(ctx.body.title||'').trim();
    const courses=all('SELECT c.grade,c.center_id,tc.subject FROM teacher_classes tc JOIN classes c ON c.id=tc.class_id WHERE tc.teacher_id=? AND c.id=?',ctx.user.id,classId);
    if(!courses.some(c=>c.grade===book.grade&&c.center_id===ctx.user.center_id&&normalize(c.subject).split(/[،,]/).some(s=>normalize(s)===book.subject_key||book.subject_key==='علوم'&&normalize(s)==='علوم تجربی')))fail(403,'کلاس با پایه و درس شما سازگار نیست');
    if(!title||title.length>150||!Number.isFinite(deadline.getTime())||deadline<=new Date())fail(400,'عنوان و مهلت آینده را درست وارد کنید');
    const id=Number(run('INSERT INTO textbook_papers(teacher_id,class_id,quiz_id,title,deadline) VALUES(?,?,?,?,?)',ctx.user.id,classId,q.id,title,deadline.toISOString()).lastInsertRowid);return {paper_id:id};
  });
  r.get('/api/textbook-papers',roles,ctx=>{
    demo();const teacherMode=ctx.user.role==='teacher',cls=get('SELECT class_id FROM students WHERE user_id=?',ctx.user.id)?.class_id;
    return all(`SELECT p.*,q.book_id,q.from_page,q.to_page,c.name class_name,c.grade,u.full_name teacher,
      (SELECT COUNT(*) FROM textbook_answers a WHERE a.paper_id=p.id) submitted,
      (SELECT reviewed_at FROM textbook_answers a WHERE a.paper_id=p.id AND a.student_id=?) reviewed_at,
      (SELECT submitted_at FROM textbook_answers a WHERE a.paper_id=p.id AND a.student_id=?) submitted_at,
      (SELECT score FROM textbook_answers a WHERE a.paper_id=p.id AND a.student_id=?) score
      FROM textbook_papers p JOIN textbook_quizzes q ON q.id=p.quiz_id JOIN classes c ON c.id=p.class_id JOIN users u ON u.id=p.teacher_id WHERE ${teacherMode?'p.teacher_id':'p.class_id'}=? ORDER BY p.id DESC`,ctx.user.id,ctx.user.id,ctx.user.id,teacherMode?ctx.user.id:cls||-1).filter(p=>{try{bookAccess(ctx,p.book_id);return true;}catch{return false;}});
  });
  r.get('/api/textbook-papers/:id',roles,ctx=>{
    const p=paperAccess(ctx,ctx.params.id),isTeacher=ctx.user.role==='teacher';
    const mine=isTeacher?null:get('SELECT id,note,score,feedback,reviewed_at,submitted_at,photos_json FROM textbook_answers WHERE paper_id=? AND student_id=?',p.id,ctx.user.id);
    const submissions=isTeacher?all('SELECT u.id student_id,u.full_name,a.id answer_id,a.note,a.score,a.feedback,a.reviewed_at,a.submitted_at,a.photos_json FROM students s JOIN users u ON u.id=s.user_id LEFT JOIN textbook_answers a ON a.paper_id=? AND a.student_id=u.id WHERE s.class_id=? AND u.active=1 ORDER BY u.full_name',p.id,p.class_id):undefined;
    const clean=a=>{if(!a)return null;const {photos_json,...rest}=a;return {...rest,photos:photos_json?JSON.parse(photos_json).map((_,i)=>`/api/textbook-papers/${p.id}/answers/${a.student_id||ctx.user.id}/photos/${i}`):[]};};
    const {questions_json,...summary}=p;return {...summary,questions:isTeacher?questions(p):publicQuestions(p),submission:clean(mine),submissions:submissions?.map(clean)};
  });
  r.post('/api/textbook-papers/:id/submit',{roles:['student']},ctx=>{
    const p=paperAccess(ctx,ctx.params.id),photos=ctx.body.photos,note=String(ctx.body.note||'');if(!Array.isArray(photos)||photos.length<1||photos.length>3||note.length>1500)fail(400,'۱ تا ۳ عکس پاسخ و یادداشت حداکثر ۱۵۰۰ نویسه بفرستید');
    const files=[];try{
      photos.forEach(f=>files.push(savePhoto(f)));
      const result=run(`INSERT INTO textbook_answers(paper_id,student_id,photos_json,note) VALUES(?,?,?,?) ON CONFLICT(paper_id,student_id) DO UPDATE SET photos_json=excluded.photos_json,note=excluded.note,submitted_at=datetime('now') WHERE textbook_answers.reviewed_at IS NULL`,p.id,ctx.user.id,JSON.stringify(files),note);
      if(!result.changes)fail(409,'پاسخ تصحیح‌شده قابل جایگزینی نیست');return {ok:true,late:new Date()>new Date(p.deadline)};
    }catch(e){files.forEach(f=>fs.rmSync(path.join(photoRoot(),f),{force:true}));throw e;}
  });
  r.get('/api/textbook-papers/:id/answers/:student/photos/:index',roles,async ctx=>{
    const p=paperAccess(ctx,ctx.params.id),sid=Number(ctx.params.student);if(ctx.user.role==='student'&&sid!==ctx.user.id)fail(403,'فقط عکس پاسخ خودتان را می‌توانید ببینید');
    const a=get('SELECT photos_json FROM textbook_answers WHERE paper_id=? AND student_id=?',p.id,sid),file=a&&JSON.parse(a.photos_json)[Number(ctx.params.index)];if(!file)fail(404,'عکس یافت نشد');await servePhoto(ctx,file);
  });
  r.post('/api/textbook-papers/:id/answers/:student/review',teacher,ctx=>{
    const p=paperAccess(ctx,ctx.params.id),score=Number(ctx.body.score),feedback=String(ctx.body.feedback||'');
    if(ctx.body.score===null||ctx.body.score===''||!Number.isFinite(score)||score<0||score>20||feedback.length>3000)fail(400,'نمره باید بین صفر و ۲۰ باشد و بازخورد حداکثر ۳۰۰۰ نویسه');
    const result=run("UPDATE textbook_answers SET score=?,feedback=?,reviewed_at=datetime('now') WHERE paper_id=? AND student_id=?",score,feedback,p.id,Number(ctx.params.student));if(!result.changes)fail(404,'پاسخی برای تصحیح ارسال نشده است');return {ok:true};
  });
}

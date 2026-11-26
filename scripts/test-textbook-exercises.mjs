import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'textbook-exercises-test-'));
Object.assign(process.env,{NODE_ENV:'test',ROSHD_DATA_DIR:path.join(temp,'data'),ROSHD_UPLOAD_DIR:path.join(temp,'uploads'),ROSHD_SECRET:'test-exercises',ROSHD_TEXTBOOKS_DIR:path.join(root,'data/textbooks/pilot'),ROSHD_DEMO:'1'});
const {run,get,all,closeDb}=await import('../server/db.js');
const {signToken}=await import('../server/util.js');
const {ensureTextbookStore}=await import('../server/textbook-store.js');ensureTextbookStore();
const {reserveAi,PILOT_LIMIT_MICROS}=await import('../server/textbook-ai.js');
fs.mkdirSync(path.join(temp,'data/secrets'),{recursive:true});fs.writeFileSync(path.join(temp,'data/secrets/deepseek.key'),'test-not-a-real-key');
run("INSERT INTO centers(id,name,slug) VALUES(1,'کانون نمونه','exercise-test')");
for(const [id,role]of[[1,'student'],[2,'student'],[3,'student'],[4,'teacher'],[5,'teacher']])run('INSERT INTO users(id,center_id,role,username,pass_hash,full_name) VALUES(?,1,?,?,?,?)',id,role,'test'+id,'test-only','کاربر '+id);
run("UPDATE users SET ui_look='new' WHERE role='teacher'");
run("INSERT INTO classes(id,center_id,grade,name) VALUES(1,1,4,'الف'),(2,1,4,'ب'),(3,1,9,'ج')");
run('INSERT INTO students(user_id,class_id,grade) VALUES(1,1,4),(2,2,4),(3,3,9)');
run("INSERT INTO teacher_classes(teacher_id,class_id,subject) VALUES(4,1,'ریاضی'),(5,2,'ریاضی')");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const port=await freePort(),origin=`http://127.0.0.1:${port}`,log=path.join(temp,'mock.log'),mode=path.join(temp,'mode.txt');
const env={...process.env,PORT:String(port),ROSHD_HOST:'127.0.0.1',TEXTBOOK_MOCK_LOG:log,TEXTBOOK_MOCK_MODE:mode,ROSHD_USER_RPS:'200',ROSHD_USER_BURST:'2000'};
let server,browser,ws,ready=false,logs='';
async function start(){ready=false;server=spawn(process.execPath,['--import',pathToFileURL(path.join(root,'scripts/fixtures/mock-textbook-ai.mjs')).href,'server/index.js'],{cwd:root,env,windowsHide:true,stdio:'pipe'});server.stdout.on('data',s=>{if(String(s).includes(':'+port))ready=true;});server.stderr.on('data',s=>logs+=s);for(let i=0;i<100&&!ready;i++){if(server.exitCode!==null)throw Error(logs);await sleep(100);}assert.ok(ready);}
const token=id=>signToken({uid:id});
async function req(id,url,body){const response=await fetch(origin+url,{method:body?'POST':'GET',headers:{Cookie:`roshd_session=${token(id)}`,...body?{'Content-Type':'application/json'}:{}},...body?{body:JSON.stringify(body)}:{}});const ct=response.headers.get('content-type')||'';return {status:response.status,data:ct.includes('json')?await response.json():Buffer.from(await response.arrayBuffer())};}
const nCalls=()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).length:0;
let attempt,paperId;
try{
  await start();
  const body={from:2,to:3,count:3,kind:'mcq',figures:true};
  const parallel=await Promise.all(Array.from({length:6},()=>req(1,'/api/textbooks/math-4/generate',body)));assert.ok(parallel.every(r=>r.status===200));assert.equal(nCalls(),1);attempt=parallel[0].data.attempt_id;
  const a=await req(1,`/api/textbook-attempts/${attempt}`);assert.equal(a.data.questions.length,3);assert.equal(a.data.questions[0].figure.type,'bars');assert.ok(!('correct_index'in a.data.questions[0]));assert.ok(!('explanation'in a.data.questions[0]));
  assert.equal((await req(2,`/api/textbook-attempts/${attempt}`)).status,404);
  assert.equal((await req(1,`/api/textbook-attempts/${attempt}/submit`,{answers:[3,0,null]})).data.correct,1);
  const repeat=await req(1,`/api/textbook-attempts/${attempt}/submit`,{answers:[3,3,3]});assert.equal(repeat.data.correct,1);assert.ok((await req(1,`/api/textbook-attempts/${attempt}`)).data.questions[0].explanation);
  assert.equal((await req(3,'/api/textbooks/math-4/generate',body)).status,403);
  assert.equal((await req(1,'/api/textbooks/math-4/generate',{...body,to:40})).status,400);
  assert.equal((await req(1,'/api/textbooks/math-4/generate',{...body,kind:'essay'})).status,403);
  const photo={data:'data:image/jpeg;base64,'+fs.readFileSync(path.join(root,'data/textbooks/pilot/math-4/pages/page_2.jpg')).toString('base64')};
  const manual=await req(4,'/api/textbooks/math-4/manual',{from:2,to:3,questions:[{text:'الگوی شکل را توضیح بده.',source_page:2,explanation:'پاسخ راهنمای محرمانهٔ معلم',file:photo}]});assert.equal(manual.status,200);const quiz=manual.data.quiz_id;
  assert.equal(nCalls(),1,'Manual authoring must never call AI');
  assert.equal((await req(5,`/api/textbook-quizzes/${quiz}`)).status,403);
  assert.equal((await req(4,`/api/textbook-quizzes/${quiz}/publish`,{title:'برگهٔ آزمایشی',class_id:2,deadline:new Date(Date.now()+86400000).toISOString()})).status,403);
  const publish=await req(4,`/api/textbook-quizzes/${quiz}/publish`,{title:'برگهٔ آزمایشی',class_id:1,deadline:new Date(Date.now()+86400000).toISOString()});assert.equal(publish.status,200);paperId=publish.data.paper_id;
  assert.equal((await req(1,'/api/textbook-papers')).data.length,1);const paper=await req(1,`/api/textbook-papers/${paperId}`);assert.ok(!JSON.stringify(paper.data).includes('پاسخ راهنمای محرمانه'));
  assert.equal((await req(2,`/api/textbook-papers/${paperId}`)).status,403);
  assert.equal((await req(2,`/api/textbook-quizzes/${quiz}/figures/0`)).status,403);assert.equal((await req(1,`/api/textbook-quizzes/${quiz}/figures/0`)).status,200);
  assert.equal((await req(1,`/api/textbook-papers/${paperId}/submit`,{photos:[{data:'data:image/svg+xml;base64,PHN2Zz4='}]})).status,400);
  assert.equal((await req(2,`/api/textbook-papers/${paperId}/submit`,{photos:[photo]})).status,403);
  assert.equal((await req(1,`/api/textbook-papers/${paperId}/submit`,{photos:[photo,photo],note:'پاسخ روی کاغذ'})).status,200);
  const url=`/api/textbook-papers/${paperId}/answers/1/photos/0`;assert.equal((await req(4,url)).status,200);assert.equal((await req(2,url)).status,403);assert.equal((await req(5,url)).status,403);
  assert.equal((await req(4,`/api/textbook-papers/${paperId}/answers/1/review`,{score:21,feedback:'bad'})).status,400);
  assert.equal((await req(4,`/api/textbook-papers/${paperId}/answers/1/review`,{score:18.5,feedback:'آفرین؛ پاسخ کامل است.'})).status,200);
  assert.equal((await req(1,`/api/textbook-papers/${paperId}`)).data.submission.score,18.5);
  assert.equal((await req(1,`/api/textbook-papers/${paperId}/submit`,{photos:[photo]})).status,409);
  fs.writeFileSync(mode,'auth');const before=nCalls(),cost=get('SELECT SUM(reserved_micros) n FROM textbook_ai_spend').n;
  assert.equal((await req(4,'/api/textbooks/math-4/generate',{from:4,to:4,count:3,kind:'essay'})).status,502);assert.equal(nCalls(),before+1);assert.ok(get('SELECT SUM(reserved_micros) n FROM textbook_ai_spend').n>cost);
  const exit=once(server,'exit');server.kill();await exit;await start();assert.ok(get('SELECT SUM(reserved_micros) n FROM textbook_ai_spend').n>cost,'Reservation must survive restart');fs.writeFileSync(mode,'valid');
  console.log('PASS: no paid calls; mocked AI, concurrent cache dedup, hidden answers, server grading/idempotency, teacher authoring/figure privacy, class publication, photo submission, review, authorization, failed-call accounting and restart persistence.');
  if(process.argv.includes('--browser')){
    const debugPort=await freePort();browser=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let tabs;for(let i=0;i<100;i++){try{tabs=await(await fetch(`http://127.0.0.1:${debugPort}/json`)).json();if(tabs.some(t=>t.type==='page'))break;}catch{}await sleep(100);}
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await once(ws,'open');let seq=0;const pending=new Map(),errors=[];
    ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
    const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');
    const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    async function wait(expression){for(let i=0;i<120;i++){if(await ev(expression))return;await sleep(100);}throw Error('Timed out: '+expression+'\n'+await ev('document.body.innerText.slice(-600)'));}
    async function go(route,selector){await cdp('Page.navigate',{url:origin+'/#'+route});await wait(`document.querySelector(${JSON.stringify(selector)})`);await sleep(300);}
    const dir=path.join(root,'scratch/textbook-exercises-review');fs.mkdirSync(dir,{recursive:true});
    async function shot(name){const {data}=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,name),Buffer.from(data,'base64'));}
    await cdp('Network.setCookie',{name:'roshd_session',value:token(1),url:origin});
    for(const width of [1440,390]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<600});
      await go('/textbooks/math-4/practice?from=2&to=3','#txGenerate');assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'));await shot(`generate-${width}.png`);
      await ev('document.querySelector("#txFigures").checked=true;document.querySelector("#txCount").value="3";document.querySelector("#txGenerate").requestSubmit()');await wait('document.querySelector("#txAttempt")');assert.ok(await ev('!!document.querySelector(".tx-figure svg")'));await shot(`attempt-${width}.png`);
      await ev('document.querySelectorAll(".tx-options").forEach(f=>f.querySelectorAll("input")[3].checked=true);document.querySelector("#txAttempt").requestSubmit()');await wait('document.querySelector(".tx-result")');assert.ok(await ev('document.querySelector(".tx-result").innerText.includes("۱۰۰")'));
      await go('/textbook-papers/'+paperId,'.tx-paper');assert.ok(await ev('document.body.innerText.includes("۱۸٫۵") || document.body.innerText.includes("۱۸.۵")'));assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'));
    }
    await cdp('Network.setCookie',{name:'roshd_session',value:token(4),url:origin});await cdp('Page.navigate',{url:origin+'/?teacher#/textbooks/math-4/practice?from=2&to=3'});await wait('document.querySelector("#txManual")');await ev('document.querySelector("#txManual").click()');await wait('document.querySelector("#txEditForm")');
    await ev('document.querySelector("[name=text]").value="پرسش تشریحی معلم";document.querySelector("[name=explanation]").value="پاسخ راهنما";document.querySelector("#txEditForm").requestSubmit()');await wait('document.querySelector("#txPublish")');assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'));await shot('teacher-preview-mobile.png');
    await ev('document.querySelector("#txPublish").elements.class_id.value="1";document.querySelector("#txPublish input[type=checkbox]").checked=true;document.querySelector("#txPublish").requestSubmit()');await wait('document.querySelector(".tx-review")');const newPaperId=await ev('Number(location.hash.split("/").pop())');
    await cdp('Network.setCookie',{name:'roshd_session',value:token(1),url:origin});await cdp('Page.navigate',{url:origin+'/?photo-upload#/textbook-papers/'+newPaperId});await wait('document.querySelector("#txUpload")');
    const dom=await cdp('DOM.getDocument'),node=await cdp('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#txUpload input[type=file]'});await cdp('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[path.join(root,'data/textbooks/pilot/math-4/pages/page_2.jpg')]});await wait('document.querySelector("#txPhotoPreview img")');await ev('document.querySelector("#txUpload").requestSubmit()');await wait('document.querySelector(".tx-photos a img")');assert.equal((await req(1,`/api/textbook-papers/${newPaperId}`)).data.submission.photos.length,1);
    await cdp('Network.setCookie',{name:'roshd_session',value:token(4),url:origin});await cdp('Page.navigate',{url:origin+'/?review#/textbook-papers/'+newPaperId});await wait('document.querySelector(".tx-review-form")');await ev('document.querySelector(".tx-review-form").elements.score.value="19";document.querySelector(".tx-review-form").elements.feedback.value="پاسخ عکس بررسی شد";document.querySelector(".tx-review-form").requestSubmit()');await wait('document.querySelector(".tx-review-form [role=status]").innerText.includes("ثبت شد")');
    await go('/textbook-papers/'+paperId,'.tx-review-form');await wait('document.querySelector(".tx-photos img").naturalWidth>0');await shot('teacher-review-mobile.png');assert.deepEqual(errors,[]);await cdp('Browser.close');
    console.log('PASS: student generation/test/result, charts, teacher manual editor/preview and photo review on desktop/mobile; no browser exceptions.');
  }
  let stopped=false;for(let i=0;i<50;i++){try{reserveAi(4,30000);}catch(e){assert.equal(e.status,429);stopped=true;break;}}
  assert.ok(stopped);const sum=get('SELECT SUM(reserved_micros) n FROM textbook_ai_spend').n;assert.ok(sum<=PILOT_LIMIT_MICROS);const callsBeforeBudgetBlock=nCalls();assert.equal((await req(4,'/api/textbooks/math-4/generate',{from:8,to:8,count:3,kind:'mcq'})).status,429);assert.equal(nCalls(),callsBeforeBudgetBlock);
  console.log('PASS: durable global $0.75 reservation cap blocks before any external call; unknown/failed calls never refund budget.');
}catch(e){console.error(logs.slice(-1200));throw e;}
finally{ws?.close();browser?.kill();server?.kill();closeDb();}

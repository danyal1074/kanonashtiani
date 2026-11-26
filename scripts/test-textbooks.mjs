// Uses real prepared PDFs/previews, disposable users, and an isolated HTTP server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'textbook-pilot-test-'));
process.env.ROSHD_DATA_DIR=path.join(temp,'data');process.env.ROSHD_UPLOAD_DIR=path.join(temp,'uploads');process.env.ROSHD_SECRET='isolated-textbook-test';
process.env.ROSHD_TEXTBOOKS_DIR ||= path.join(root,'data/textbooks/pilot');
const {run,closeDb}=await import('../server/db.js');
const {signToken}=await import('../server/util.js');
run("INSERT INTO centers(id,name,slug) VALUES(1,'کانون آشتیانی','textbook-test')");
for(const [id,role,name] of [[1,'student','دانش‌آموز چهارم'],[2,'student','دانش‌آموز نهم'],[3,'student','دانش‌آموز پنجم'],[4,'teacher','معلم ریاضی چهارم'],[5,'teacher','معلم علوم نهم'],[6,'teacher','معلم درس دیگر'],[7,'manager','مدیر']])run('INSERT INTO users(id,center_id,role,username,pass_hash,full_name) VALUES(?,1,?,?,?,?)',id,role,`tb-${id}`,'test-hash',name);
run("UPDATE users SET ui_look='new' WHERE role='teacher'");
run("INSERT INTO classes(id,center_id,grade,name) VALUES(1,1,4,'الف'),(2,1,9,'ب'),(3,1,5,'ج')");
run('INSERT INTO students(user_id,class_id,grade) VALUES(1,1,4),(2,2,9),(3,3,5)');
run("INSERT INTO teacher_classes(teacher_id,class_id,subject) VALUES(4,1,'ریاضی'),(5,2,'علوم تجربی'),(6,1,'علوم'),(6,2,'ریاضی')");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const n=s.address().port;await new Promise(r=>s.close(r));return n;}
let server,browser,ws,origin,logs='';
async function start(demo){const port=await freePort();origin=`http://127.0.0.1:${port}`;let ready=false;server=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,PORT:String(port),ROSHD_HOST:'127.0.0.1',ROSHD_DEMO:demo},windowsHide:true,stdio:'pipe'});server.stdout.on('data',s=>{if(String(s).includes(`:${port}`))ready=true;});server.stderr.on('data',s=>logs+=s);for(let i=0;i<100&&!ready;i++){if(server.exitCode!=null)throw Error(logs);await sleep(100);}assert.ok(ready);}
const token=id=>signToken({uid:id});
const request=(id,url)=>fetch(origin+url,{headers:id?{Cookie:`roshd_session=${token(id)}`}:{}});
const json=async(id,url)=>{const r=await request(id,url);return{status:r.status,data:await r.json()};};
try{
  for(const id of ['math-4','science-9'])assert.ok(fs.existsSync(path.join(process.env.ROSHD_TEXTBOOKS_DIR,id,'pages/page_1.jpg')),'Run prepare-textbooks.py first');
  await start('0');assert.equal((await request(1,'/api/textbooks')).status,404);assert.equal((await request(4,'/api/textbooks/math-4/pages/1')).status,404);assert.equal((await json(1,'/api/me')).data.textbooks_enabled,false);
  const exited=once(server,'exit');server.kill();await exited;
  await start('1');assert.equal((await request(null,'/api/textbooks')).status,401);assert.equal((await request(7,'/api/textbooks')).status,403);
  for(const [id,books] of [[1,['math-4']],[2,['science-9']],[3,[]],[4,['math-4']],[5,['science-9']],[6,[]]]){
    const d=await json(id,'/api/textbooks');assert.equal(d.status,200);assert.deepEqual(d.data.books.map(b=>b.id),books);assert.equal((await json(id,'/api/me')).data.textbooks_enabled,books.length>0);
  }
  for(const [id,book] of [[1,'science-9'],[2,'math-4'],[6,'math-4'],[6,'science-9']])for(const suffix of ['','/pages/1','/file'])assert.equal((await request(id,`/api/textbooks/${book}${suffix}`)).status,403);
  for(const n of ['0','155','1.2','-1','abc'])assert.equal((await request(1,`/api/textbooks/math-4/pages/${n}`)).status,400);
  const image=await request(1,'/api/textbooks/math-4/pages/4');assert.equal(image.status,200);assert.match(image.headers.get('cache-control'),/private/);assert.equal(Buffer.from(await image.arrayBuffer()).subarray(0,2).toString('hex'),'ffd8');
  const pdf=await request(2,'/api/textbooks/science-9/file');assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-disposition'),/attachment/);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,4).toString(),'%PDF');
  console.log('PASS: production gate, login/role/grade/subject authorization, cross-course file denial, page validation, real JPG/PDF delivery.');
  if(process.argv.includes('--browser')){
    const port=await freePort();browser=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let tabs;for(let i=0;i<100;i++){try{tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();if(tabs.some(t=>t.type==='page'))break;}catch{}await sleep(100);}
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await once(ws,'open');let seq=0;const pending=new Map(),errors=[];
    ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
    const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');
    const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    async function wait(expression){for(let i=0;i<120;i++){if(await ev(expression))return;await sleep(100);}throw Error('Timeout '+expression+'\n'+await ev('document.body.innerText.slice(-1000)'));}
    async function go(route,selector){await cdp('Page.navigate',{url:origin+'/#'+route});await wait(`document.querySelector(${JSON.stringify(selector)})`);await sleep(350);}
    const artifacts=path.join(root,'scratch/textbook-review');fs.mkdirSync(artifacts,{recursive:true});
    for(const [id,book,role] of [[1,'math-4','student-fourth'],[2,'science-9','student-ninth'],[4,'math-4','teacher-math'],[5,'science-9','teacher-science']]){
      await cdp('Network.setCookie',{name:'roshd_session',value:token(id),url:origin});await cdp('Page.navigate',{url:origin+'/?account='+id+'#/textbooks'});await wait('document.querySelector(".tb-book")');assert.equal(await ev('document.querySelectorAll(".tb-book").length'),1);
      for(const width of [1440,390]){
        await cdp('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<600});
        await go('/textbooks/'+book,'#tbPage');await wait('document.querySelector("#tbPage").naturalWidth>400 && !document.querySelector("#tbPage").hidden');
        assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'),role+' overflow '+width);
        await ev('document.querySelector("#tbChapter").value="2";document.querySelector("#tbChapter").dispatchEvent(new Event("change"));document.querySelector("#tbRange").requestSubmit()');
        const start=book==='math-4'?23:13;await wait(`document.querySelector('#tbPage').src.endsWith('/pages/${start}') && !document.querySelector('#tbPage').hidden`);
        await ev('document.querySelector("#tbNext").click()');await wait(`document.querySelector('#tbPage').src.endsWith('/pages/${start+1}')`);
        await ev('document.querySelector("#tbFrom").value="۴";document.querySelector("#tbTo").value="۸";document.querySelector("#tbRange").requestSubmit()');await wait('document.querySelector("#tbPage").src.endsWith("/pages/4") && !document.querySelector("#tbPage").hidden');
        await ev('document.querySelector("#tbFrom").value="20";document.querySelector("#tbTo").value="10";document.querySelector("#tbRange").requestSubmit()');assert.equal(await ev('document.querySelector("#tbError").hidden'),false);
        const {data}=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,`${role}-${width}.png`),Buffer.from(data,'base64'));
      }
      await go('/more','.tb-entry');
    }
    assert.deepEqual(errors,[]);console.log('PASS: both books, both student grades and teacher subjects, mobile/desktop, real page images, chapter/range navigation, Persian digits, invalid range, More links, no browser exceptions.');await cdp('Browser.close');
  }
}catch(e){console.error(logs.slice(-1000));throw e;}
finally{ws?.close();browser?.kill();server?.kill();closeDb();}

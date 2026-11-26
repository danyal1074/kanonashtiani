// Real API and optional headless-browser regression, using a disposable database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kanoon-messenger-'));
process.env.ROSHD_DATA_DIR=path.join(temp,'data');process.env.ROSHD_UPLOAD_DIR=path.join(temp,'uploads');process.env.ROSHD_SECRET='isolated-messenger-test';
const {run,get,closeDb}=await import('../server/db.js');
const {signToken}=await import('../server/util.js');
run("INSERT INTO centers(id,name,slug) VALUES(1,'کانون آشتیانی','messenger-test')");
for(const [id,role,name] of [[1,'teacher','مریم احمدی'],[2,'teacher','علی رضایی'],[3,'manager','محمد آشتیانی'],[4,'student','آراد رضایی'],[5,'counselor','نگار محمدی'],[6,'student','دانش‌آموز کلاس دیگر']])run('INSERT INTO users(id,center_id,role,username,pass_hash,full_name) VALUES(?,1,?,?,?,?)',id,role,`test-${id}`,'test-hash',name);
run("UPDATE users SET ui_look='new' WHERE role IN ('manager','teacher')");
run("INSERT INTO classes(id,center_id,grade,name) VALUES(1,1,4,'الف'),(2,1,9,'ب')");
run("INSERT INTO teacher_classes(teacher_id,class_id,subject) VALUES(1,1,'ریاضی')");
run('INSERT INTO students(user_id,class_id,grade) VALUES(4,1,4),(6,2,9)');
for(let i=0;i<50;i++)run("INSERT INTO messages(center_id,from_id,to_id,body,created_at,read_at) VALUES(1,?,?,?,datetime('now',?),datetime('now'))",i%2?1:4,i%2?4:1,i%2?'سلام آراد، تمرین‌های فصل جدید را در قسمت تکالیف ببین.':'سلام استاد، ممنونم. تمرین‌ها را انجام می‌دهم و برایتان می‌فرستم.',`-${50-i} minutes`);
run("INSERT INTO messages(center_id,from_id,to_id,body) VALUES(1,3,1,'سلام خانم احمدی، برنامهٔ کلاس‌ها به‌روز شده است.'),(1,5,1,'گزارش مشاوره آمادهٔ بررسی شماست.')");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const n=probe.address().port;await new Promise(r=>probe.close(r));return n;}
const port=await freePort(),origin=`http://127.0.0.1:${port}`;
const token=id=>signToken({uid:id});
let ready=false,logs='';
const server=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,PORT:String(port),ROSHD_HOST:'127.0.0.1'},windowsHide:true,stdio:'pipe'});
server.stdout.on('data',s=>{if(String(s).includes(`:${port}`))ready=true;});server.stderr.on('data',s=>logs+=s);
async function request(id,url,body){const r=await fetch(origin+url,{method:body?'POST':'GET',headers:{Cookie:`roshd_session=${token(id)}`,...body?{'Content-Type':'application/json'}:{}},...body?{body:JSON.stringify(body)}:{}});return{status:r.status,data:await r.json()};}
let browser,ws;
try{
  for(let i=0;i<100&&!ready;i++){if(server.exitCode!=null)throw Error(logs);await sleep(100);}assert.ok(ready);
  assert.equal((await request(1,'/api/messages/6')).status,403);
  assert.equal((await request(1,'/api/messages',{to:6,body:'not allowed'})).status,403);
  assert.equal((await request(1,'/api/messages',{to:4,body:'   '})).status,400);
  const raw='<img src=x onerror=alert(1)>\nمتن آزمایشی';
  const sent=await request(1,'/api/messages',{to:4,body:raw});assert.equal(sent.status,200);assert.equal(sent.data.body,raw);
  assert.equal((await request(4,'/api/messages/1')).data.find(m=>m.id===sent.data.id).body,raw);
  assert.ok((await request(1,'/api/messages/4')).data.find(m=>m.id===sent.data.id).read_at);
  console.log('PASS: permitted send/read, real read receipts, text preservation, empty rejection, class access restrictions.');
  if(process.argv.includes('--browser')){
    const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';assert.ok(fs.existsSync(chrome));const debugPort=await freePort();
    browser=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let tabs;for(let i=0;i<100;i++){try{tabs=await(await fetch(`http://127.0.0.1:${debugPort}/json`)).json();if(tabs.some(t=>t.type==='page'))break;}catch{}await sleep(100);}
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await once(ws,'open');let seq=0;const pending=new Map(),errors=[];
    ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
    const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');
    const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    async function waitFor(expression){for(let i=0;i<120;i++){if(await evaluate(expression))return;await sleep(100);}throw Error('Timeout '+expression+'\n'+await evaluate('document.body.innerText.slice(-1000)'));}
    async function go(route,selector){await cdp('Page.navigate',{url:origin+'/#'+route});await waitFor(`document.querySelector(${JSON.stringify(selector)})`);await sleep(350);}
    const artifacts=path.join(root,'scratch','messenger-review');fs.mkdirSync(artifacts,{recursive:true});
    async function screenshot(name){const {data}=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name),Buffer.from(data,'base64'));}
    await cdp('Network.setCookie',{name:'roshd_session',value:token(1),url:origin});
    await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await go('/messages','.ms-contact');await evaluate('document.fonts.ready');await screenshot('desktop-list.png');
    await evaluate('document.querySelector("[data-ms-tab=unread]").click()');assert.equal(await evaluate('document.querySelectorAll(".ms-contact").length'),2);
    await evaluate('document.querySelector("[data-ms-tab=all]").click();document.querySelector("#cSearch").value="آراد";document.querySelector("#cSearch").dispatchEvent(new Event("input"))');assert.equal(await evaluate('document.querySelectorAll(".ms-contact").length'),1);
    await evaluate('document.querySelector(".ms-contact").click()');await waitFor('document.querySelectorAll(".ms-bubble").length>0');
    assert.equal(await evaluate('document.querySelectorAll(".ms-message-text img").length'),0);assert.ok(await evaluate('document.querySelector(".ms-history").innerText.includes("<img src=x")'));
    assert.ok(await evaluate('!!document.querySelector(".ms-receipt.is-read")'));
    await screenshot('desktop-thread.png');
    const before=get('SELECT COUNT(*) n FROM messages').n;
    await evaluate('const inp=document.querySelector("#msBody");inp.value="پیام آزمایشی تازه\\nخط دوم";inp.dispatchEvent(new Event("input"));document.querySelector(".ms-send").click();document.querySelector(".ms-send").click()');
    await waitFor('document.querySelector("#msBody").value===""');assert.equal(get('SELECT COUNT(*) n FROM messages').n,before+1);
    await evaluate('document.querySelector("#msBody").value="پیش‌نویس محفوظ";document.querySelector("#msBody").dispatchEvent(new Event("input"))');
    await go('/messages/3','#msBody');await go('/messages/4','.ms-bubble');assert.equal(await evaluate('document.querySelector("#msBody").value'),'پیش‌نویس محفوظ');
    await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await evaluate('document.querySelector(".ms-send").click()');await waitFor('!document.querySelector(".ms-connection").hidden');assert.equal(await evaluate('document.querySelector("#msBody").value'),'پیش‌نویس محفوظ');
    await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await evaluate('document.querySelector(".ms-send").click()');await waitFor('document.querySelector("#msBody").value===""');
    await evaluate('document.querySelector("#msgs").scrollTop=100');
    run("INSERT INTO messages(center_id,from_id,to_id,body) VALUES(1,4,1,'پیام تازه هنگام مرور تاریخچه')");
    await waitFor('document.querySelector("#msgs").innerText.includes("پیام تازه هنگام مرور تاریخچه")');assert.ok(await evaluate('document.querySelector("#msgs").scrollTop<200'));assert.ok(await evaluate('!document.querySelector(".ms-jump").hidden'));
    await evaluate('document.querySelector(".ms-jump").click();document.querySelector("#msEmojiToggle").click();document.querySelector("[data-ms-emoji]").click()');assert.equal(await evaluate('document.querySelector("#msBody").value'),'👍');
    for(const width of [1024,768,390,360]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});await sleep(400);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`overflow ${width}`);
      if(width<600){const box=await evaluate('(()=>{const r=document.querySelector(".ms-app").getBoundingClientRect(),s=document.querySelector(".ms-send").getBoundingClientRect();return {top:r.top,bottom:r.bottom,send:s.bottom,h:innerHeight};})()');assert.ok(Math.abs(box.top)<2);assert.ok(box.send<=box.h);if(width===390)await screenshot('mobile-thread.png');}
    }
    await evaluate('document.querySelector(".ms-back").click()');await waitFor('!document.body.classList.contains("messenger-thread")');await screenshot('mobile-list.png');
    for(const [id,role,appearance] of [[1,'teacher','classic'],[3,'manager','new'],[5,'counselor',null],[4,'student',null]]){
      if(appearance)run('UPDATE users SET ui_look=? WHERE id=?',appearance,id);
      await cdp('Network.setCookie',{name:'roshd_session',value:token(id),url:origin});await cdp('Page.reload');await waitFor('document.querySelector(".ms-contact")');
      await go('/messages/'+(id===1?4:1),'.ms-bubble');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),role);assert.ok(await evaluate('document.querySelector(".ms-send").getBoundingClientRect().bottom<=innerHeight'),role);
    }
    await go('/home','#view > *');assert.ok(!await evaluate('document.body.classList.contains("messenger-thread")'));assert.deepEqual(errors,[]);
    console.log('PASS: desktop/mobile, all panel roles and teacher appearances, search/unread, real send once, escaped text, drafts, offline recovery, polling/scroll preservation, emoji, full-screen back navigation, cleanup, no browser exceptions. Screenshots: scratch/messenger-review');
    await cdp('Browser.close');
  }
}catch(e){console.error(logs.slice(-1000));throw e;}
finally{ws?.close();browser?.kill();server.kill();closeDb();}

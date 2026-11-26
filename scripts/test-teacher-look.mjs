// Integration regression: disposable database only. Optional --browser uses local headless Chrome.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kanoon-teacher-look-'));
process.env.ROSHD_DATA_DIR = path.join(temp, 'data');
process.env.ROSHD_UPLOAD_DIR = path.join(temp, 'uploads');
process.env.ROSHD_SECRET = 'isolated-teacher-look-regression';
const { run, get, all, closeDb } = await import('../server/db.js');
const { signToken, ymd, faWeekday } = await import('../server/util.js');
run("INSERT INTO centers(id,name,slug) VALUES(1,'کانون آشتیانی','test-look')");
for (const [id, role, name] of [[1,'teacher','مریم احمدی'],[2,'teacher','علی رضایی'],[3,'manager','مدیر کانون'],[4,'student','دانش‌آموز نمونه'],[5,'counselor','مشاور نمونه']]) {
  run('INSERT INTO users(id,center_id,role,username,pass_hash,full_name) VALUES(?,1,?,?,?,?)', id, role, `look-${id}`, 'test-only-hash', name);
}
run("INSERT INTO classes(id,center_id,grade,name) VALUES(1,1,4,'الف')");
run("INSERT INTO teacher_classes(teacher_id,class_id,subject) VALUES(1,1,'ریاضی')");
run('INSERT INTO students(user_id,class_id,grade) VALUES(4,1,4)');
run("INSERT INTO schedule(class_id,teacher_id,weekday,start,end,subject,room) VALUES(1,1,?,'16:00','17:20','ریاضی','کلاس ۱')", faWeekday(ymd()));
const before = Object.fromEntries(['classes','teacher_classes','students','schedule','assignments','exam_results'].map((t) => [t, all(`SELECT * FROM ${t}`)]));
async function freePort() {
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise((resolve) => probe.close(resolve)); return port;
}
const port = await freePort(), origin = `http://127.0.0.1:${port}`;
const cookie = (id) => `roshd_session=${signToken({ uid: id })}`;
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(port), ROSHD_HOST:'127.0.0.1' }, windowsHide:true, stdio:'pipe' });
let logs = ''; server.stderr.on('data', (s) => logs += s);
let ready = false; server.stdout.on('data', (s) => { if (String(s).includes(`:${port}`)) ready = true; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function request(id, route, method='GET', body) {
  const res = await fetch(origin + route, { method, headers:{Cookie:cookie(id),...(body ? {'Content-Type':'application/json'} : {})}, ...(body ? {body:JSON.stringify(body)} : {}) });
  return { status:res.status, body:await res.json() };
}
let browser, ws;
try {
  for (let i=0;i<100&&!ready;i++) { if (server.exitCode != null) throw Error(logs || 'Test server exited'); await sleep(100); }
  assert.ok(ready, 'Isolated test server did not start');
  assert.equal((await request(1,'/api/me')).body.ui_look, 'classic');
  assert.equal((await request(3,'/api/me')).body.ui_look, 'new');
  for (const look of ['new','classic','new']) {
    assert.equal((await request(1,'/api/me/look','PUT',{look,user_id:2})).status, 200);
    assert.equal((await request(1,'/api/me')).body.ui_look, look);
    assert.equal((await request(2,'/api/me')).body.ui_look, 'classic');
    assert.equal((await request(3,'/api/me')).body.ui_look, 'new');
  }
  assert.equal((await request(1,'/api/me/look','PUT',{look:'invalid'})).status, 400);
  for (const id of [4,5]) assert.equal((await request(id,'/api/me/look','PUT',{look:'new'})).status, 403);
  assert.equal((await fetch(origin+'/api/me/look',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{"look":"new"}'})).status,401);
  for (const id of [1,3]) for (const look of ['classic','new']) {
    assert.equal((await request(id,'/api/me/look','PUT',{look})).status,200);
    assert.equal((await request(id,'/api/me')).body.ui_look,look);
  }
  for (const [table, rows] of Object.entries(before)) assert.deepEqual(all(`SELECT * FROM ${table}`),rows);
  console.log('PASS: defaults, per-user server persistence, repeated switching, manager compatibility, role restrictions, invalid input, educational data unchanged.');
  if (process.argv.includes('--browser')) {
    const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    assert.ok(fs.existsSync(chrome),'Set CHROME_PATH to a local Chrome executable');
    const debugPort = await freePort();
    browser = spawn(chrome, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'], {windowsHide:true,stdio:'ignore'});
    let tabs;
    for(let i=0;i<100;i++){try{tabs=await(await fetch(`http://127.0.0.1:${debugPort}/json`)).json();if(tabs.some(t=>t.type==='page'))break;}catch{}await sleep(100);}
    ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl); await once(ws,'open');
    let seq=0;const pending=new Map(),errors=[];
    ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(m.error.message));else p?.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+(m.params.exceptionDetails.exception?.description||''));});
    const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');
    const evaluate=async(expression)=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    async function waitFor(expression) {for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100);}throw Error('Timed out: '+expression+'\n'+await evaluate('document.body.innerText.slice(0,800)'));}
    async function navigate(route, selector) {await cdp('Page.navigate',{url:origin+'/#'+route});await waitFor(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector('#view .spinner')`);await sleep(150);}
    const artifacts=path.join(root,'scratch','teacher-look-review');fs.mkdirSync(artifacts,{recursive:true});
    async function screenshot(name){const {data}=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(artifacts,name),Buffer.from(data,'base64'));}
    await cdp('Network.setCookie',{name:'roshd_session',value:cookie(1).split('=')[1],url:origin});
    for(const width of [1440,1024,768,390,360]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:width<600?844:1000,deviceScaleFactor:1,mobile:width<600});
      await navigate('/home','.tm-home');await evaluate('document.fonts.ready');
      assert.equal(await evaluate('document.querySelectorAll(".icon-3d").length'),0);
      assert.equal(await evaluate('getComputedStyle(document.querySelector(".sidebar")).backgroundColor'),'rgb(8, 63, 68)');
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),`Overflow at ${width}`);
      if(width===1440||width===390)await screenshot(`teacher-minimal-${width}.png`);
      if(width===390){await evaluate('document.querySelector("#menuBtn").click()');assert.equal(await evaluate('document.querySelector("#sidebar").classList.contains("open")'),true);await evaluate('document.querySelector(".scrim").click()');assert.equal(await evaluate('document.querySelector("#menuBtn").getAttribute("aria-expanded")'),'false');}
    }
    for(const route of ['/classes','/attendance','/reports','/assignments','/exams','/timetable','/materials','/plans','/messages','/more','/account']){
      await navigate(route,'#view > *');
      assert.ok(!await evaluate('document.querySelector("#view").innerText.includes("این بخش باز نشد")'),`Failed route ${route}`);
      assert.equal(await evaluate('document.querySelectorAll(".icon-3d").length'),0,route);
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),`Overflow on ${route}`);
    }
    await evaluate('document.querySelector(".tm-appearance [data-look-set=classic]").click()');
    await waitFor('document.body.classList.contains("look-classic") && document.querySelector(".tm-appearance")');
    assert.equal((await request(1,'/api/me')).body.ui_look,'classic');
    await navigate('/home','.tp-home');await screenshot('teacher-fantasy-390.png');
    await navigate('/account','.tm-appearance');await evaluate('document.querySelector(".tm-appearance [data-look-set=new]").click()');
    await waitFor('document.body.classList.contains("teacher-minimal") && document.querySelector(".tm-appearance")');
    await cdp('Page.reload');await waitFor('document.body.classList.contains("teacher-minimal") && document.querySelector(".tm-appearance")');
    assert.equal((await request(2,'/api/me')).body.ui_look,'classic');
    await cdp('Network.setCookie',{name:'roshd_session',value:cookie(3).split('=')[1],url:origin});
    await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await cdp('Page.reload');await waitFor('document.body.classList.contains("manager-ui")');
    await navigate('/home','.ad-dash');assert.ok(await evaluate('document.body.classList.contains("manager-ui") && !document.body.classList.contains("teacher-minimal")'));
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".sidebar")).backgroundColor'),'rgb(8, 63, 68)');
    assert.deepEqual(errors,[]);
    for (const [table, rows] of Object.entries(before)) assert.deepEqual(all(`SELECT * FROM ${table}`),rows);
    console.log('PASS: browser widths 360/390/768/1024/1440, eleven teacher routes, SVG icons, mobile drawer, both appearance buttons and reload persistence, manager regression, no JS exceptions. Screenshots: scratch/teacher-look-review');
    await cdp('Browser.close');
  }
} catch (e) { console.error(logs.slice(-2000)); throw e; }
finally { ws?.close();browser?.kill();server.kill();closeDb(); }

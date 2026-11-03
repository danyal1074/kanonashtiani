import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const handlers = new Map(); let stored; let saved = 0;
const exports = { all:()=>[],get:()=>({}),run:(sql,...args)=>{stored=args[0]},tx:()=>{},COOKIE:'session',fail:(status,message)=>{throw Object.assign(Error(message),{status})},clampStr:(s,n)=>String(s??'').trim().slice(0,n),saveUpload:()=>{saved++;return 'test.jpg'} };
const source=await fs.readFile('server/routes/common.js','utf8');
const context=vm.createContext({Buffer,Map,Date,console});
const mod=new vm.SourceTextModule(source,{context});
await mod.link(async(spec,ref)=>{const names=Array.from(source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)/g)).filter(m=>m[2]===spec).flatMap(m=>m[1].split(',').map(s=>s.trim()));return new vm.SyntheticModule(names,function(){for(const n of names)this.setExport(n,exports[n]??(()=>{}))},{context});});
await mod.evaluate();mod.namespace.default({get(){},post(){},put(path,opts,fn){handlers.set(path,{opts,fn})}});
const {opts,fn}=handlers.get('/api/me/avatar');assert.deepEqual([...opts.roles],['student']);
const ctx=body=>({body,user:{id:42}});
for(const file of [{data:'data:image/svg+xml;base64,PHN2Zz4='},{data:'data:image/png;base64,aGVsbG8='},{data:'data:image/jpeg;base64,'+'a'.repeat(4*1024*1024)}]) { assert.throws(()=>fn(ctx({file})),e=>e.status===400); }
assert.equal(saved,0);assert.throws(()=>fn(ctx({avatar:'/uploads/other.jpg'})),e=>e.status===400);
fn(ctx({avatar:'trophy'}));assert.equal(stored,'trophy');
fn(ctx({file:{data:'data:image/jpeg;base64,/9j/AA=='}}));assert.equal(stored,'/uploads/test.jpg');assert.equal(saved,1);
console.log('PASS: student-only route, MIME and signature validation, size limit, arbitrary-path rejection, photo and icon persistence.');

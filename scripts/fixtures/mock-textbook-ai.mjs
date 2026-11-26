// Test preload only: guarantees that integration tests cannot spend money on DeepSeek.
import fs from 'node:fs';
if(process.env.NODE_ENV!=='test'||!process.env.TEXTBOOK_MOCK_LOG)throw Error('Test-only preload');
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  if(String(url)!=='https://api.deepseek.com/chat/completions')return originalFetch(url,options);
  const request=JSON.parse(options.body);
  if(request.thinking?.type!=='disabled'||request.max_tokens!==6000||request.tools)throw Error('Unbounded model request');
  fs.appendFileSync(process.env.TEXTBOOK_MOCK_LOG,'call\n');
  await new Promise(r=>setTimeout(r,120));
  const mode=fs.existsSync(process.env.TEXTBOOK_MOCK_MODE)?fs.readFileSync(process.env.TEXTBOOK_MOCK_MODE,'utf8'):'valid';
  if(mode==='offline')throw Error('Test network outage');
  if(mode==='auth')return new Response('{}',{status:401});
  const prompt=request.messages[1].content[0].text;
  if(prompt.startsWith('Review these')){const count=Number(/Review these (\d+)/.exec(prompt)[1]);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reviews:Array.from({length:count},(_,i)=>({index:i,valid:mode!=='reject',evidence:'This is a sufficient test-only mathematical source verification.',issues:mode==='reject'?['Test rejection']:[]}))})}}],usage:{prompt_tokens:2000,completion_tokens:500}});}
  const count=Number(/exactly (\d+)/.exec(prompt)[1]),page=Number(/printed pages (\d+)/.exec(prompt)[1]),essay=prompt.includes('written-answer');
  const questions=Array.from({length:count},(_,i)=>({text:`سؤال نمونهٔ ${i+1}: دو به اضافهٔ دو چند است؟`,source_page:page,...essay?{}:{options:['۱','۲','۳','۴'],correct_index:3},explanation:'دو به اضافهٔ دو برابر چهار است.',...prompt.includes('At least ONE')&&i===0?{figure:{type:'source_page',page}}:{}}));
  return Response.json({choices:[{finish_reason:mode==='truncated'?'length':'stop',message:{content:mode==='invalid'?'invalid':JSON.stringify({questions})}}],usage:{prompt_tokens:2000,completion_tokens:1000}});
};

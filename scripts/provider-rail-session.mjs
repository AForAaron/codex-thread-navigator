#!/usr/bin/env node
// Reversible session UI and fixed-operation backend. Never patches app files.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
const root=resolve(import.meta.dirname,'..');
const port=Number(process.env.EXPLODEX_DEBUG_PORT);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid debug port');
const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const page=targets.find(t=>t.type==='page'&&t.url==='app://-/index.html');
if(!page)throw Error('Codex renderer unavailable');
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=no;});
let seq=0;const pending=new Map();
function send(method,params={}){return new Promise((ok,no)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);no(Error('CDP timeout'));},10000);pending.set(id,m=>{clearTimeout(timer);m.error?no(Error(m.error.message)):ok(m.result);});ws.send(JSON.stringify({id,method,params}));});}
const worker=spawn(process.env.CODEX_PROVIDER_PYTHON||resolve(homedir(),'.pyenv/versions/3.10.12/bin/python3'),[resolve(root,'tools/provider-switcher/bridge.py')],{stdio:['pipe','pipe','ignore']});
let busy=false;let activeId=null;const queue=[];
function dispatch(){if(busy||!queue.length)return;busy=true;const req=queue.shift();activeId=req.id;worker.stdin.write(JSON.stringify(req)+'\n');}
createInterface({input:worker.stdout}).on('line',async line=>{try{const reply=JSON.parse(line);if(reply.id===activeId){busy=false;activeId=null;}await send('Runtime.evaluate',{expression:`window.__cnProviderReply?.(${JSON.stringify(reply)})`});}catch{}dispatch();});
// Restart: leave a short-lived marker for launch-usage-rail.sh, then quit Codex normally (like ⌘Q).
// The launcher sees the marker after this session ends and reopens Codex through Navigator.
const RESTART_FLAG=resolve(homedir(),'Library/Application Support/CodexNavigator/restart-requested');
async function requestRestart(id){
  try{
    await mkdir(dirname(RESTART_FLAG),{recursive:true});
    await writeFile(RESTART_FLAG,String(Date.now()));
    await send('Runtime.evaluate',{expression:`window.__cnProviderReply?.(${JSON.stringify({id,result:{restarting:true}})})`});
    setTimeout(()=>spawn('/usr/bin/osascript',['-e','tell application id "com.openai.codex" to quit'],{stdio:'ignore',detached:true}).unref(),600);
  }catch(error){
    await send('Runtime.evaluate',{expression:`window.__cnProviderReply?.(${JSON.stringify({id,error:'无法请求重启：'+String(error?.message??error).slice(0,120)})})`}).catch(()=>{});
  }
}
ws.onmessage=event=>{const m=JSON.parse(String(event.data));if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}else if(m.method==='Runtime.bindingCalled'&&m.params.name==='__cnProviderRequest'){try{const req=JSON.parse(m.params.payload);if(m.params.payload.length>2048||!['status','usage','apply','restart'].includes(req.operation)||typeof req.id!=='number')return;if(req.operation==='restart'){void requestRestart(req.id);return;}if(req.operation==='usage'){worker.stdin.write(JSON.stringify(req)+'\n');}else{queue.push(req);if(queue.length<=8)dispatch();else queue.pop();}}catch{}}};
await send('Runtime.enable');await send('Runtime.addBinding',{name:'__cnProviderRequest'});
const [html,css,ui]=await Promise.all(['index.html','ui.css','ui.js'].map(f=>readFile(resolve(root,'tools/provider-switcher',f),'utf8')));
const content=html.match(/<body>([\s\S]*?)<script/)[1];
let logic=ui.replace("document.getElementById(id)","shadow.getElementById(id)").replaceAll('document.querySelector','shadow.querySelector').replaceAll('document.documentElement','shell');
logic=logic.replace(/async function api\(path, options\) \{[\s\S]*?\n\}/,`async function api(path, options) { return request(path.endsWith('status')?'status':path.endsWith('usage')?'usage':'apply', options?.body?JSON.parse(options.body):undefined); }`);
logic=logic.replace('setInterval(loadUsage, 60000);','const usageTimer=setInterval(()=>{if(!panel.hidden)loadUsage();},60000);');
const source=`(()=>{
window.__cnProviderDispose?.();
const shell=document.createElement('div');shell.id='cn-provider-rail';shell.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483640';
const shadow=shell.attachShadow({mode:'open'});
shadow.innerHTML='<style>'+${JSON.stringify(css.replaceAll(':root',':host').replaceAll('body{','.panel-body{'))}+'</style><style>:host{font-size:14px}.panel{pointer-events:auto;position:fixed;width:336px;max-width:calc(100vw - 90px);max-height:calc(100vh - 24px);overflow:auto;border-radius:14px;box-shadow:0 12px 40px #0005;background:var(--surface);color:var(--text)}.control{width:100%;box-shadow:none;border-radius:0}.panel header{padding:14px 18px 12px}.panel .usage,.panel #model-section{padding:14px 18px}.panel footer{padding:14px 18px}.rail-button{pointer-events:auto;position:fixed;width:44px;height:44px;border:0;border-radius:10px;background:transparent;color:var(--text);display:grid;place-items:center}.rail-button:hover,.rail-button[aria-expanded=true]{background:var(--hover)}.rail-button svg{width:21px;height:21px}.panel .outside-note{padding:0 18px 14px}.close{position:absolute;right:12px;top:13px;width:32px;height:32px;border:0;background:transparent;color:var(--text);border-radius:7px}.close:hover{background:var(--hover)}#theme{visibility:hidden}.panel .subtitle{font-size:11px}</style><button class="rail-button" aria-label="切换模型来源" title="切换模型来源" aria-expanded="false" aria-controls="provider-panel"><svg viewBox="0 0 24 24"><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/></svg></button><section class="panel" id="provider-panel" aria-label="模型来源与 Go 用量" hidden>'+${JSON.stringify(content)}+'<button class="close" aria-label="关闭模型面板"><svg viewBox="0 0 24 24" width="18" height="18"><path d="m6 6 12 12M18 6 6 18"/></svg></button></section>';
document.documentElement.append(shell);
const button=shadow.querySelector('.rail-button'),panel=shadow.querySelector('.panel');
let rid=0;const replies=new Map();
window.__cnProviderReply=reply=>{const cb=replies.get(reply.id);if(cb){replies.delete(reply.id);reply.error?cb.reject(Error(reply.error)):cb.resolve(reply.result);}};
function request(operation,body){return new Promise((resolve,reject)=>{const id=++rid;replies.set(id,{resolve,reject});window.__cnProviderRequest(JSON.stringify({id,operation,body}));setTimeout(()=>{if(replies.has(id)){replies.delete(id);reject(Error('读取超时，请刷新'));}},35000);});}
function close(){panel.hidden=true;button.setAttribute('aria-expanded','false');}
function position(){const quota=document.querySelector('.cn-usage'),rail=document.querySelector('nav[data-app-navigation-rail]');if(!quota||!rail||getComputedStyle(quota).visibility!=='visible'){button.hidden=true;close();return;}const q=quota.getBoundingClientRect(),r=rail.getBoundingClientRect();const top=q.top-52;const last=[...rail.querySelectorAll('button,a')].filter(e=>!rail.lastElementChild?.contains(e)).map(e=>e.getBoundingClientRect()).filter(x=>x.height&&x.bottom<=q.top).reduce((v,x)=>Math.max(v,x.bottom),r.top);if(top<last+8){button.hidden=true;close();return;}button.hidden=false;button.style.left=(q.left+q.width/2-22)+'px';button.style.top=top+'px';panel.style.left=(r.right+8)+'px';panel.style.top=Math.max(12,Math.min(top,innerHeight-panel.getBoundingClientRect().height-12))+'px';}
button.addEventListener('click',()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));position();if(!panel.hidden){loadStatus();loadUsage();shadow.getElementById('title').focus();}});
shadow.querySelector('.close').addEventListener('click',()=>{close();button.focus();});
const outside=e=>{if(!e.composedPath().includes(shell))close();};const escape=e=>{if(e.key==='Escape'&&!panel.hidden){close();button.focus();}};
document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);window.addEventListener('resize',position);
${logic}
const restartBtn=document.createElement('button');restartBtn.type='button';restartBtn.className='text-button restart';restartBtn.textContent='重启 Codex 以应用';
restartBtn.style.cssText='display:block;width:100%;margin-top:10px;padding:8px 0;text-align:center';
shadow.querySelector('footer')?.append(restartBtn);
const note=shadow.querySelector('.apply-note span');if(note)note.textContent='保存后点「重启 Codex 以应用」，会自动用 Navigator 重新打开并加载全部功能，然后新建聊天。';
let armed=null;
restartBtn.addEventListener('click',async()=>{
  if(!armed){restartBtn.textContent='确认重启？运行中的任务会中断（5 秒内再点一次）';armed=setTimeout(()=>{armed=null;restartBtn.textContent='重启 Codex 以应用';},5000);return;}
  clearTimeout(armed);armed=null;restartBtn.disabled=true;restartBtn.textContent='正在重启 Codex…';
  try{await request('restart');}catch(error){restartBtn.disabled=false;restartBtn.textContent='重启 Codex 以应用';message(error.message,true);}
});
const placementTimer=setInterval(position,500);position();
window.__cnProviderDispose=()=>{clearInterval(usageTimer);clearInterval(placementTimer);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',position);shell.remove();delete window.__cnProviderReply;};
})()`;
const registration=await send('Page.addScriptToEvaluateOnNewDocument',{source});
const result=await send('Runtime.evaluate',{expression:source});
if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
console.log('Provider button attached above quota; fixed-operation bridge active.');
const stop=async()=>{try{await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:registration.identifier});await send('Runtime.evaluate',{expression:'window.__cnProviderDispose?.()'});}catch{}worker.kill();ws.close();};
process.once('SIGTERM',stop);process.once('SIGINT',stop);ws.onclose=()=>{worker.kill();process.exit(0);};worker.on('exit',()=>ws.close());

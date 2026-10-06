import { spawn } from 'node:child_process';
const port=Number(process.env.FIOLE_TEST_PORT??3100);
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{
  env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']
});
let log='';server.stdout.on('data',x=>{log+=x});server.stderr.on('data',x=>{log+=x});
const url=`http://127.0.0.1:${port}`;
try {
  let ready=false;
  for(let i=0;i<100;i++){if(server.exitCode!==null)break;try{const r=await fetch(url);if(r.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
  if(!ready)throw new Error('Server did not start: '+log);
  process.env.FIOLE_TEST_URL=url;
  if(process.env.SPARTICUZ_MODULE){const module=await import(process.env.SPARTICUZ_MODULE);const chromium=module.default;process.env.CHROMIUM_EXECUTABLE=await chromium.executablePath();process.env.CHROMIUM_ARGS=JSON.stringify(chromium.args);}
  await import('./ui-smoke.mjs');
} finally {server.kill('SIGTERM');}

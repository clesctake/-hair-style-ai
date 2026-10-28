import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

/** Translate supervisor/Vite flags to the installed Next CLI, not app behavior. */
export function nextDevArguments(args){
 const output=[];let strict=false,explicitPort=false;
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--strictPort'){strict=true;continue;}
  if(arg==='--host'){
   const value=args[++i];if(!value||value.startsWith('-'))throw Error('--host requires a hostname');
   output.push('--hostname',value);continue;
  }
  if(arg.startsWith('--host=')){const value=arg.slice(7);if(!value)throw Error('--host requires a hostname');output.push('--hostname',value);continue;}
  if(arg==='--port'||arg==='-p'){
   const value=args[++i];if(!/^\d+$/.test(value??'')||Number(value)<1||Number(value)>65535)throw Error('Invalid preview port');
   explicitPort=true;output.push(arg,value);continue;
  }
  if(arg.startsWith('--port=')){const value=arg.slice(7);if(!/^\d+$/.test(value)||Number(value)<1||Number(value)>65535)throw Error('Invalid preview port');explicitPort=true;}
  output.push(arg);
 }
 // Next retries only its default port. An explicit --port disables fallback.
 if(strict&&!explicitPort)throw Error('--strictPort requires an explicit --port');
 return ['dev',...output];
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url)),...nextDevArguments(process.argv.slice(2))],{stdio:'inherit'});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
  child.on('error',error=>{console.error(error.message);process.exitCode=1;});
  child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
 }catch(error){console.error(error.message);process.exitCode=1;}
}

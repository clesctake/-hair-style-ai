import {build} from 'esbuild';
import {mkdir,cp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),output=path.join(root,'dist');
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
await cp(path.join(root,'public'),output,{recursive:true});
await build({entryPoints:['demo/counseling-entry.tsx'],bundle:true,platform:'browser',format:'esm',target:['safari17','chrome120'],outdir:output,entryNames:'counseling',minify:true,tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'},external:['/counseling-master/*'],loader:{'.woff2':'file'}});
await writeFile(path.join(output,'index.html'),'<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#aa7044"><title>COLOR FUTURE AI | HAIR DESIGN LAB</title><link rel="stylesheet" href="/counseling.css"><script type="module" src="/counseling.js"></script></head><body><div id="root"></div></body></html>');
console.log(JSON.stringify({components:['CounselingPageOne','ProDesignPage','AfterSupportPage'],output:'dist',scope:'PAGE_1_PAGE_2_AND_PAGE_3',imageGeneration:'REQUIRES_SERVER_API_AND_KEY'}));

import fs from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
const repo=process.cwd();
const results=[];
for(const scenario of ['unchanged','ignored-only','transient-source','ignored-and-transient-source']){
 const root=fs.realpathSync(fs.mkdtempSync(join(tmpdir(),'chalk-namespace-probe-')));
 try{
  execFileSync('git',['init','-q'],{cwd:root});
  execFileSync(process.execPath,[resolve(repo,'bin/chalk.mjs'),'init','--bare'],{cwd:root});
  fs.writeFileSync(join(root,'.gitignore'),'/build\n');
  const metaPath=join(root,'.chalk/chalk.json'),meta=JSON.parse(fs.readFileSync(metaPath));
  meta.protocol.verify={test:'node -e "console.log(1)"'};fs.writeFileSync(metaPath,JSON.stringify(meta));
  fs.writeFileSync(join(root,'preload.mjs'),`import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';const watch=fs.watch;fs.watch=(path,...args)=>{const cb=args.pop();return watch(path,...args,(event,name)=>{if(String(name)!=='ephemeral.js')cb(event,name);});};syncBuiltinESMExports();`);
  const script=`import fs from 'node:fs';import{Store}from${JSON.stringify(new URL('file://'+join(repo,'lib/store.mjs')).href)};import{verify}from${JSON.stringify(new URL('file://'+join(repo,'lib/verify.mjs')).href)};const root=${JSON.stringify(root)},store=new Store(root),protocol=store.protocol.bind(store);let calls=0,before,after;const stamp=()=>{const s=fs.statSync(root,{bigint:true});return{mtime:String(s.mtimeNs),ctime:String(s.ctimeNs),ino:String(s.ino)}};store.protocol=()=>{const value=protocol();if(++calls===2){before=stamp();${scenario.includes('transient-source')?'fs.writeFileSync(root+"/ephemeral.js","used");fs.readFileSync(root+"/ephemeral.js");fs.unlinkSync(root+"/ephemeral.js");':''}${scenario.startsWith('ignored')?'fs.mkdirSync(root+"/build");fs.writeFileSync(root+"/build/output.log","generated");fs.rmSync(root+"/build",{recursive:true});':''}after=stamp();}return value;};const r=verify(store);console.log(JSON.stringify({green:r.green,freshness:r.freshness,observation:r.observation,directoryChanged:JSON.stringify(before)!==JSON.stringify(after)}));`;
  const output=execFileSync(process.execPath,['--import',join(root,'preload.mjs'),'--input-type=module','-e',script],{encoding:'utf8',timeout:20000});
  results.push({scenario,...JSON.parse(output)});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
console.log(JSON.stringify(results,null,2));

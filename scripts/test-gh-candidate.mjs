// Offline GitHub fixture support: the local bare remote supplies the PR head.
// Retain each test's provider behavior while modeling conditional merge/state.
export function candidateGh(body, { commonjs = false } = {}) {
  const imports = commonjs
    ? "const chalkCandidateFs=require('node:fs'),{execFileSync:chalkCandidateExec}=require('node:child_process');"
    : "import * as chalkCandidateFs from 'node:fs';import {execFileSync as chalkCandidateExec} from 'node:child_process';";
  return `${imports}
const chalkCandidateArgs=process.argv.slice(2),chalkCandidateGit=(...args)=>chalkCandidateExec('git',args,{encoding:'utf8',stdio:'pipe'}).trim();
const chalkCandidateHead=()=>{const branch=chalkCandidateGit('rev-parse','--abbrev-ref','HEAD');return chalkCandidateGit('ls-remote','--exit-code','origin','refs/heads/'+branch).split(/\\s/)[0];};
const chalkCandidateMarker='.chalk/local/fixture-gh-merge.json';
if(chalkCandidateArgs.includes('pr')&&chalkCandidateArgs.includes('view')&&chalkCandidateArgs.some(arg=>arg.includes('headRefOid'))){const head=chalkCandidateHead();const merged=chalkCandidateFs.existsSync(chalkCandidateMarker)?JSON.parse(chalkCandidateFs.readFileSync(chalkCandidateMarker)):null;console.log(JSON.stringify({headRefOid:head,state:merged?.head===head?'MERGED':'OPEN'}));process.exit(0);}
if(chalkCandidateArgs.includes('pr')&&chalkCandidateArgs.includes('merge')){const head=chalkCandidateHead();if(chalkCandidateArgs[chalkCandidateArgs.indexOf('--match-head-commit')+1]!==head)process.exit(9);process.on('exit',code=>{if(code===0){chalkCandidateFs.mkdirSync('.chalk/local',{recursive:true});chalkCandidateFs.writeFileSync(chalkCandidateMarker,JSON.stringify({head}));}});}
${body}`;
}

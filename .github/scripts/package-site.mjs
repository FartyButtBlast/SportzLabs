import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const source = resolve(process.argv[2] || '.');
const target = resolve(process.argv[3] || '_site');
if (source === target) throw new Error('Publication needs a separate output directory.');
if ((await readFile(join(source,'CNAME'),'utf8')).trim() !== 'www.sportzlabs.com') throw new Error('The existing hosted domain must be preserved.');
await mkdir(target,{recursive:true});
for (const entry of await readdir(source,{withFileTypes:true})) {
  if (entry.name === '.git' || entry.name === '.github' || resolve(source,entry.name) === target) continue;
  if (entry.isSymbolicLink()) throw new Error('Unexpected symlink in site publication.');
  await cp(join(source,entry.name),join(target,entry.name),{recursive:true});
}
const digest = createHash('sha256');
async function hashDirectory(directory, prefix='') {
  for (const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path = prefix+entry.name;
    if (path === 'blog/publication.json') continue;
    if (entry.isDirectory()) await hashDirectory(join(directory,entry.name),path+'/');
    else if (entry.isFile()) {const data=await readFile(join(directory,entry.name));digest.update(path+'\0'+data.length+'\0');digest.update(data);}
    else throw new Error('Unsupported file type in site publication.');
  }
}
await hashDirectory(target);
const hash = digest.digest('hex');
let liveHash;
try {
  const response = await fetch('https://www.sportzlabs.com/blog/publication.json?check='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if (response.ok) liveHash = (await response.json()).hash;
} catch { /* A failed check must not suppress a needed deployment or recovery. */ }
await writeFile(join(target,'blog/publication.json'),JSON.stringify({version:1,hash})+'\n');
const changed = hash !== liveHash;
if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT,`changed=${changed}\n`,{flag:'a'});
console.log(changed?'Website content changed; deployment required.':'Live website already matches; no deployment needed.');

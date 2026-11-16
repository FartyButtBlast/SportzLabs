import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const git = (...args) => execFileSync('git',args,{encoding:'utf8'}).trim();
// Only generated public blog files are staged; app assets and other work stay intact.
git('add','--','blog','sitemap.xml');
const lastCommit = Number(git('log','-1','--format=%ct')) * 1000;
if (!Number.isFinite(lastCommit)) throw new Error('Cannot determine publication activity.');
if (Date.now() - lastCommit >= 28 * 86400000) {
  // GitHub disables public-repository schedules after 60 days without activity.
  await writeFile('.github/blog-publisher-heartbeat.txt',new Date().toISOString()+'\n');
  git('add','--','.github/blog-publisher-heartbeat.txt');
}
if (git('diff','--cached','--name-only')) {
  git('config','user.name','github-actions[bot]');
  git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');
  git('commit','-m','Refresh published blog pages and sitemap');
  // Never force or reset. Concurrent repository changes stop this run; the next retries.
  git('push','origin','HEAD:main');
  console.log('Published page sources saved in repository history.');
} else {
  console.log('Published page sources already match.');
}

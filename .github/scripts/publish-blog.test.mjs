import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicPosts, renderArticle, renderIndex, renderSitemap, publishBlog, fetchPublishedPosts } from './publish-blog.mjs';

const now = new Date('2026-11-16T00:00:00Z');
const post = (overrides={}) => ({id:'fixture-id',slug:'sample-article',title:'Sample article',excerpt:'A useful guide.',content:'<h2>Original heading</h2><p>Existing <strong>article</strong> content.</p>',category:'Training guide',author_name:'SportzLabs',status:'published',published_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-03T00:00:00Z',seo_title:'',seo_description:'',...overrides});
const sitemap = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.sportzlabs.com/</loc><lastmod>2026-10-09</lastmod></url><url><loc>https://www.sportzlabs.com/apps/workout-studio/</loc></url><url><loc>https://www.sportzlabs.com/blog/old-article/</loc></url></urlset>';

test('drafts and scheduled content stay private, then publish at the due time', () => {
  const rows = [post(),post({slug:'draft',status:'draft'}),post({slug:'scheduled',published_at:'2026-11-16T00:00:01Z'}),post({slug:'undated',published_at:null})];
  assert.deepEqual(publicPosts(rows,now).map(p=>p.slug),['sample-article']);
  assert.deepEqual(publicPosts(rows,new Date('2026-11-16T00:00:01Z')).map(p=>p.slug),['scheduled','sample-article']);
});
test('path traversal, duplicates and incomplete posts abort publication', () => {
  for (const slug of ['../admin','/workoutstudio','a/b','UPPER']) assert.throws(()=>publicPosts([post({slug})],now));
  assert.throws(()=>publicPosts([post(),post()],now));
  assert.throws(()=>publicPosts([post({content:''})],now));
});
test('HTML contains unchanged article text, metadata and crawlable navigation without JavaScript', () => {
  const p = post(), other=post({slug:'other',id:'other',title:'Another article'});
  const html=renderArticle(p,[p,other]);
  assert.ok(html.includes(`<div class="blog-body">${p.content}</div>`));
  assert.ok(html.includes('href="/blog/other/"'));
  assert.ok(html.includes('href="/blog/"'));
  assert.ok(html.includes('<h1>Sample article</h1>'));
  assert.ok(!html.includes('Loading article'));
  const graph=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(graph['@graph'][0].dateModified,'2026-10-03T00:00:00.000Z');
  assert.equal(graph['@graph'][1]['@type'],'BreadcrumbList');
});
test('metadata is escaped and cannot terminate the structured data script', () => {
  const p=post({title:'A </script><script>bad()</script> & "quote"'});
  const html=renderArticle(p,[p]);
  assert.ok(html.includes('&lt;/script&gt;'));
  assert.ok(!html.includes('<script>bad()'));
  const graph=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(graph['@graph'][0].headline,p.title);
});
test('hub and sitemap cover all public posts and preserve other site entries', () => {
  const posts=[post(),post({slug:'second'})];
  const xml=renderSitemap(sitemap,posts),html=renderIndex(posts);
  for (const p of posts) {assert.ok(xml.includes(`/blog/${p.slug}/`));assert.ok(html.includes(`href="/blog/${p.slug}/"`));}
  assert.ok(xml.includes('https://www.sportzlabs.com/apps/workout-studio/'));
  assert.ok(xml.includes('<lastmod>2026-10-09</lastmod>'));
  assert.ok(!xml.includes('old-article'));
  assert.equal(renderSitemap(xml,posts),xml);
});
test('scheduled posts use publication time for lastmod when edited in advance', () => {
  const xml=renderSitemap(sitemap,[post({published_at:'2026-11-01T00:00:00Z'})]);
  assert.ok(xml.includes('<lastmod>2026-11-01T00:00:00.000Z</lastmod>'));
});
test('API pagination fetches every article with public credentials and a fixed cutoff', async () => {
  let calls=0;
  const posts=await fetchPublishedPosts({now,fetcher:async (url,options)=>{
    assert.equal(options.headers.apikey.startsWith('sb_publishable_'),true);
    assert.equal(options.method,undefined);
    assert.equal(url.searchParams.get('status'),'eq.published');
    assert.equal(url.searchParams.get('published_at'),'lte.2026-11-16T00:00:00.000Z');
    const offset=Number(url.searchParams.get('offset'));
    const rows=Array.from({length:offset===0?100:1},(_,i)=>post({id:String(offset+i),slug:`article-${offset+i}`}));
    calls++;
    return new Response(JSON.stringify(rows),{headers:{'content-range':`${offset}-${offset+rows.length-1}/101`}});
  }});
  assert.equal(calls,2);assert.equal(posts.length,101);
});
test('failed or partial API results cannot replace a working publication', async () => {
  for (const response of [new Response('error',{status:503}),new Response('[]'),new Response(JSON.stringify([post()]),{headers:{'content-range':'0-0/8'}}),new Response(JSON.stringify([post({status:'draft'})]),{headers:{'content-range':'0-0/1'}})]) {
    await assert.rejects(fetchPublishedPosts({now,fetcher:async()=>response}));
  }
});
test('existing app files, downloads and source records survive publication; stale shells expose no content', async () => {
  const dir=await mkdtemp(join(tmpdir(),'sportzlabs-blog-test-'));
  try {
    await mkdir(join(dir,'blog','scheduled'),{recursive:true});
    await mkdir(join(dir,'workoutstudio'),{recursive:true});
    await writeFile(join(dir,'workoutstudio','index.html'),'UNCHANGED APP');
    await writeFile(join(dir,'blog','plan.pdf'),'UNCHANGED DOWNLOAD');
    await writeFile(join(dir,'blog','scheduled','index.html'),'<main data-blog-slug="scheduled">PRIVATE FUTURE CONTENT</main>');
    await writeFile(join(dir,'sitemap.xml'),sitemap);
    const rows=[post(),post({slug:'scheduled',content:'PRIVATE FUTURE CONTENT',published_at:'2026-11-17T00:00:00Z'})];
    const before=JSON.stringify(rows);
    const result=await publishBlog(dir,rows,now);
    assert.equal(result.posts,1);
    assert.equal(JSON.stringify(rows),before);
    assert.equal(await readFile(join(dir,'workoutstudio','index.html'),'utf8'),'UNCHANGED APP');
    assert.equal(await readFile(join(dir,'blog','plan.pdf'),'utf8'),'UNCHANGED DOWNLOAD');
    const hidden=await readFile(join(dir,'blog','scheduled','index.html'),'utf8');
    assert.ok(hidden.includes('noindex,follow'));
    assert.ok(!hidden.includes('PRIVATE FUTURE CONTENT'));
    assert.ok((await readFile(join(dir,'blog','sample-article','index.html'),'utf8')).includes(rows[0].content));
  } finally {await rm(dir,{recursive:true,force:true});}
});

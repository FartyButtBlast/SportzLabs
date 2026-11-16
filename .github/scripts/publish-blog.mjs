import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ORIGIN = 'https://www.sportzlabs.com';
const BLOG_SCRIPT = "// Article text, metadata and navigation are delivered in HTML.\n// JavaScript adds analytics only; API and storage failures never hide content.\n(() => {\n  const article = document.querySelector('[data-blog-id][data-blog-slug]');\n  if (!article) return;\n  const id = article.dataset.blogId;\n  const slug = article.dataset.blogSlug;\n  const key = 'sb_publishable_q_yZF9APuTUsGfHu8N7avA_QbAxS3KY';\n  const tracked = new Set();\n  function track(event) {\n    if (tracked.has(event)) return;\n    const storageKey = `sportzlabs-blog-${event}-${slug}`;\n    try {if (sessionStorage.getItem(storageKey)) return;} catch {}\n    tracked.add(event);\n    try {sessionStorage.setItem(storageKey,'1');} catch {}\n    void fetch('https://npllwuavofpfudchotma.supabase.co/rest/v1/sportzlabs_blog_events', {\n      method:'POST',keepalive:true,\n      headers:{apikey:key,'Content-Type':'application/json',Prefer:'return=minimal'},\n      body:JSON.stringify({post_id:id,event,occurred_at:new Date().toISOString()})\n    }).catch(()=>{});\n  }\n  track('view');\n  document.querySelectorAll('a[href*=\"/workoutstudio/\"]').forEach(link => link.addEventListener('click',()=>track('app_click'),{once:true}));\n})();\n";
const NAV_STYLE = ".blog-pagination{display:flex;flex-wrap:wrap;gap:20px;justify-content:space-between;border-top:1px solid var(--line);margin-top:48px;padding-top:28px}.blog-pagination a{flex:1 1 180px;line-height:1.6}.blog-pagination span{display:block;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.blog-related{border-top:1px solid var(--line);margin-top:32px;padding-top:24px}.blog-related li{margin-bottom:14px}.blog-card h2 a,.blog-pagination a,.blog-related a{overflow-wrap:anywhere}.blog-grid{align-items:start}\n";
const API = 'https://npllwuavofpfudchotma.supabase.co';
// Existing public access. RLS excludes drafts and future publications.
const PUBLIC_KEY = 'sb_publishable_q_yZF9APuTUsGfHu8N7avA_QbAxS3KY';
const FIELDS = 'id,slug,title,excerpt,content,category,author_name,status,published_at,updated_at,seo_title,seo_description,cover_image_url';
export const escape = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const articlePath = post => `/blog/${post.slug}/`;
const date = value => new Intl.DateTimeFormat('en-AU', {day:'numeric',month:'long',year:'numeric',timeZone:'Australia/Melbourne'}).format(new Date(value));
const modified = post => new Date(Math.max(Date.parse(post.published_at), Date.parse(post.updated_at) || 0)).toISOString();

export function publicPosts(rows, now = new Date()) {
  if (!Array.isArray(rows)) throw new Error('The publication response must be an array.');
  const cutoff = new Date(now).getTime();
  if (!Number.isFinite(cutoff)) throw new Error('Invalid publication cutoff.');
  const slugs = new Set();
  return rows.filter(p => p.status === 'published' && Number.isFinite(Date.parse(p.published_at)) && Date.parse(p.published_at) <= cutoff).map(p => {
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(p.slug) || slugs.has(p.slug)) throw new Error('Invalid or duplicate published slug.');
    if (typeof p.id !== 'string' || !p.title?.trim() || typeof p.content !== 'string' || !p.content.trim()) throw new Error(`Incomplete published article: ${p.slug}`);
    slugs.add(p.slug);
    return p;
  }).sort((a,b) => Date.parse(b.published_at) - Date.parse(a.published_at) || a.slug.localeCompare(b.slug));
}

export async function fetchPublishedPosts({fetcher = fetch, now = new Date()} = {}) {
  const cutoff = now.toISOString();
  const rows = [];
  let total;
  for (let offset = 0; ; offset += 100) {
    const url = new URL(`${API}/rest/v1/sportzlabs_blog_posts`);
    url.search = new URLSearchParams({select:FIELDS,status:'eq.published',published_at:`lte.${cutoff}`,order:'published_at.desc,slug.asc',offset:String(offset),limit:'100'}).toString();
    const response = await fetcher(url, {headers:{apikey:PUBLIC_KEY,Prefer:'count=exact'},signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`Blog API failed (${response.status}); existing publication is preserved.`);
    const range = response.headers.get('content-range') || '';
    const count = Number(range.match(/\/(\d+)$/)?.[1]);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Blog API did not confirm a complete result count.');
    if (total !== undefined && count !== total) throw new Error('Blog changed while fetching; retry on the next run.');
    total = count;
    const page = await response.json();
    if (!Array.isArray(page) || page.length > 100) throw new Error('Malformed blog response.');
    rows.push(...page);
    if (rows.length === total) break;
    if (page.length !== 100 || rows.length > total) throw new Error('Incomplete blog response; publication stopped.');
  }
  const posts = publicPosts(rows, now);
  if (posts.length !== rows.length) throw new Error('Blog API returned a non-public article.');
  return posts;
}

const brand = '<a class="brand" href="/" aria-label="SportzLabs home"><img class="brand-icon" src="/assets/workout-studio-logo.png" width="32" height="32" alt="">Sportz<span>Labs</span></a>';
function page({title,description,path,body,graph,attributes='',index=true}) {
  const url = ORIGIN + path;
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="${index?'index,follow,max-image-preview:large':'noindex,follow'}">
<link rel="canonical" href="${escape(url)}"><link rel="stylesheet" href="/sportzlabs.css"><link rel="stylesheet" href="/seo-content.css"><link rel="stylesheet" href="/blog/navigation.css">
<link rel="icon" href="/assets/workout-studio-logo.png" type="image/png"><link rel="apple-touch-icon" href="/assets/workout-studio-logo.png">
<meta property="og:type" content="${attributes.includes('data-blog-slug')?'article':'website'}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(url)}"><meta property="og:site_name" content="SportzLabs">
${graph?`<script type="application/ld+json">${json(graph)}</script>`:''}<script src="/analytics.js" defer></script></head>
<body><a class="skip" href="#main">Skip to content</a><header class="wrap header">${brand}<nav aria-label="Main navigation"><a href="/#workoutstudio">Our apps</a><a href="/apps/workout-studio/">Workout tracker</a><a href="/blog/"${path==='/blog/'?' aria-current="page"':''}>Blog</a><a href="/support.html">Support</a></nav><a class="button small" href="/workoutstudio/">Open Workout Studio <span aria-hidden="true">↗</span></a></header>
<main id="main" class="wrap seo-content blog-page" data-blog-generated="1" ${attributes}>${body}</main>
<footer class="wrap footer">${brand}<p>Simple tools. Purposeful progress.</p><nav aria-label="Footer"><a href="/blog/">All blog articles</a><a href="/apps/workout-studio/">Workout Studio</a><a href="/apps/afl-performance-analytics/">AFL Performance</a><a href="/support.html">Support</a><a href="/privacy.html">Privacy</a><a href="/eula.html">Terms</a></nav><small>© SportzLabs</small></footer><script src="/blog/blog.js?v=static-1" defer></script></body></html>
`;
}
const breadcrumbs = title => `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">SportzLabs</a> / ${title?`<a href="/blog/">Blog</a> / <span aria-current="page">${escape(title)}</span>`:'<span aria-current="page">Blog</span>'}</nav>`;
const byline = p => `<p class="quiet">By ${escape(p.author_name || 'SportzLabs')} · <time datetime="${escape(p.published_at)}">${date(p.published_at)}</time></p>`;

export function renderIndex(posts) {
  const title = 'SportzLabs Blog | Training, Product Updates & Sports Apps';
  const description = 'Practical training guides, workout logging advice and Workout Studio updates. Browse every published SportzLabs article.';
  const cards = posts.map(p => `<article class="blog-card"><p class="eyebrow">${escape(p.category)}</p><h2><a href="${articlePath(p)}">${escape(p.title)}</a></h2><p>${escape(p.excerpt)}</p>${byline(p)}<a class="text-link" href="${articlePath(p)}">Read article <span aria-hidden="true">↗</span></a></article>`).join('\n');
  return page({title,description,path:'/blog/',attributes:'data-blog-hub',body:`${breadcrumbs()}<header class="seo-hero"><p class="eyebrow">FROM SPORTZLABS</p><h1>Training guides and workout advice.</h1><p class="intro">Practical guidance for strength training, building a workout habit and getting more from Workout Studio.</p></header><section aria-labelledby="all-articles"><h2 id="all-articles">All articles</h2><div class="blog-grid">${cards || '<p>No articles have been published yet.</p>'}</div></section>`,graph:{'@context':'https://schema.org','@type':'CollectionPage',name:title,url:ORIGIN+'/blog/',description,mainEntity:{'@type':'ItemList',itemListElement:posts.map((p,i)=>({'@type':'ListItem',position:i+1,url:ORIGIN+articlePath(p),name:p.title}))}}});
}

export function renderArticle(post, posts) {
  const index = posts.findIndex(p => p.slug === post.slug);
  const newer = posts[index-1], older = posts[index+1];
  const related = posts.filter(p => p.slug !== post.slug).sort((a,b)=>Number(b.category===post.category)-Number(a.category===post.category)).slice(0,3);
  const url = ORIGIN + articlePath(post);
  const graph = {'@context':'https://schema.org','@graph':[
    {'@type':'Article',headline:post.title,description:post.seo_description||post.excerpt,datePublished:new Date(post.published_at).toISOString(),dateModified:modified(post),author:{'@type':post.author_name&&post.author_name!=='SportzLabs'?'Person':'Organization',name:post.author_name||'SportzLabs'},publisher:{'@type':'Organization',name:'SportzLabs',url:ORIGIN+'/',logo:{'@type':'ImageObject',url:ORIGIN+'/assets/workout-studio-logo.png'}},mainEntityOfPage:url},
    {'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'SportzLabs',item:ORIGIN+'/'},{'@type':'ListItem',position:2,name:'Blog',item:ORIGIN+'/blog/'},{'@type':'ListItem',position:3,name:post.title,item:url}]}
  ]};
  const navigation = `<nav class="blog-pagination" aria-label="More blog articles">${newer?`<a rel="prev" href="${articlePath(newer)}"><span>Newer article</span>${escape(newer.title)}</a>`:''}<a href="/blog/">Browse all articles</a>${older?`<a rel="next" href="${articlePath(older)}"><span>Older article</span>${escape(older.title)}</a>`:''}</nav>`;
  const relatedSection = related.length?`<aside class="blog-related" aria-labelledby="related-articles"><h2 id="related-articles">More articles to explore</h2><ul>${related.map(p=>`<li><a href="${articlePath(p)}">${escape(p.title)}</a></li>`).join('')}</ul></aside>`:'';
  // Preserve the trusted administrator-authored article HTML byte for byte.
  return page({title:post.seo_title||`${post.title} | SportzLabs`,description:post.seo_description||post.excerpt,path:articlePath(post),graph,attributes:`data-blog-slug="${escape(post.slug)}" data-blog-id="${escape(post.id)}"`,body:`${breadcrumbs(post.title)}<article class="blog-article"><header class="seo-hero"><p class="eyebrow">${escape(post.category)}</p><h1>${escape(post.title)}</h1><p class="intro">${escape(post.excerpt)}</p>${byline(post)}</header><div class="blog-body">${post.content}</div></article>${navigation}${relatedSection}`});
}

export function renderSitemap(existing, posts) {
  if (!existing.includes('<urlset') || !existing.includes('</urlset>')) throw new Error('Invalid existing sitemap; publication stopped.');
  const entries = [...existing.matchAll(/<url>[\s\S]*?<\/url>/g)].map(m=>m[0]).filter(block=>!/<loc>https:\/\/www\.sportzlabs\.com\/blog\//.test(block));
  const latest = posts.length?posts.map(modified).sort().at(-1):null;
  entries.push(`<url><loc>${ORIGIN}/blog/</loc>${latest?`<lastmod>${latest}</lastmod>`:''}</url>`);
  for (const post of posts) entries.push(`<url><loc>${ORIGIN}${articlePath(post)}</loc><lastmod>${modified(post)}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(e=>'  '+e).join('\n')}\n</urlset>\n`;
}

export async function publishBlog(siteDirectory, rows, now = new Date()) {
  const site = resolve(siteDirectory);
  const posts = publicPosts(rows, now);
  const files = new Map([['blog/index.html',renderIndex(posts)],['sitemap.xml',renderSitemap(await readFile(join(site,'sitemap.xml'),'utf8'),posts)],['blog/blog.js',BLOG_SCRIPT],['blog/navigation.css',NAV_STYLE]]);
  for (const post of posts) files.set(`blog/${post.slug}/index.html`,renderArticle(post,posts));
  for (const entry of await readdir(join(site,'blog'),{withFileTypes:true})) {
    if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]*$/.test(entry.name)) continue;
    const relative = `blog/${entry.name}/index.html`;
    if (files.has(relative)) continue;
    let previous;
    try { previous = await readFile(join(site,relative),'utf8'); } catch (e) {if(e.code==='ENOENT')continue;throw e;}
    if (!previous.includes('data-blog-slug=') && !previous.includes('data-blog-generated=')) continue;
    files.set(relative,page({title:'Article unavailable | SportzLabs',description:'Browse the published SportzLabs training guides and workout articles.',path:`/blog/${entry.name}/`,index:false,body:`${breadcrumbs()}<header class="seo-hero"><h1>This article is not available.</h1><p><a href="/blog/">Browse all published articles</a></p></header>`}));
  }
  // Fetching and validation finish before output changes. Actions deploys atomically.
  for (const [relative,content] of files) {
    const target = join(site,relative);
    await mkdir(resolve(target,'..'),{recursive:true});
    await writeFile(target,content);
  }
  return {posts:posts.length,files:[...files.keys()]};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = name => {const i=args.indexOf(name);return i<0?undefined:args[i+1];};
  const site = option('--site');
  if (!site) throw new Error('Usage: node publish-blog.mjs --site DIRECTORY [--posts LOCAL_PUBLIC_SNAPSHOT]');
  const now = new Date();
  const fixture = option('--posts');
  const posts = fixture?JSON.parse(await readFile(fixture,'utf8')):await fetchPublishedPosts({now});
  const result = await publishBlog(site,posts,now);
  console.log(`Rendered ${result.posts} published articles, the blog index and sitemap.`);
}

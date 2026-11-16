// Article text, metadata and navigation are delivered in HTML.
// JavaScript adds analytics only; API and storage failures never hide content.
(() => {
  const article = document.querySelector('[data-blog-id][data-blog-slug]');
  if (!article) return;
  const id = article.dataset.blogId;
  const slug = article.dataset.blogSlug;
  const key = 'sb_publishable_q_yZF9APuTUsGfHu8N7avA_QbAxS3KY';
  const tracked = new Set();
  function track(event) {
    if (tracked.has(event)) return;
    const storageKey = `sportzlabs-blog-${event}-${slug}`;
    try {if (sessionStorage.getItem(storageKey)) return;} catch {}
    tracked.add(event);
    try {sessionStorage.setItem(storageKey,'1');} catch {}
    void fetch('https://npllwuavofpfudchotma.supabase.co/rest/v1/sportzlabs_blog_events', {
      method:'POST',keepalive:true,
      headers:{apikey:key,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({post_id:id,event,occurred_at:new Date().toISOString()})
    }).catch(()=>{});
  }
  track('view');
  document.querySelectorAll('a[href*="/workoutstudio/"]').forEach(link => link.addEventListener('click',()=>track('app_click'),{once:true}));
})();

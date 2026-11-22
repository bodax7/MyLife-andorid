// عامل الخدمة: يحفظ ملفات التطبيق للعمل بدون إنترنت.
// ⚠️ غيّر رقم الإصدار مع كل تحديث لملفات الواجهة حتى يحصل المستخدمون على النسخة الجديدة.
const VERSION = 'mylife-v1.7.0';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'mylife-share' && k !== 'mylife-ocr').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // مشاركة رسالة أو صورة من تطبيق آخر للتطبيق (أندرويد): نحفظها ونفتح شاشة القراءة
  if (e.request.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const fd = await e.request.formData();
      const c = await caches.open('mylife-share');
      const file = fd.get('image');
      const has = file && typeof file !== 'string' && file.size > 0;
      await c.put('shared-meta', new Response(JSON.stringify({ text: fd.get('text') || '', title: fd.get('title') || '', url: fd.get('url') || '', at: Date.now(), hasFile: has })));
      if (has) await c.put('shared-file', new Response(file, { headers: { 'content-type': file.type || 'image/jpeg', 'x-name': encodeURIComponent(file.name || 'shared.jpg') } }));
      else await c.delete('shared-file');
      return Response.redirect(new URL('./#/share', self.registration.scope).href, 303);
    })());
    return;
  }
  // مكتبة قراءة الصور (تُحمّل مرة واحدة ثم تعمل بدون إنترنت)
  if (e.request.method === 'GET' && url.hostname === 'cdn.jsdelivr.net' && /tesseract/.test(url.pathname)) {
    e.respondWith(caches.open('mylife-ocr').then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;   // طلبات Supabase لا تُخزن هنا
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('index.html')));
    return;
  }
  // ملف الإعدادات: الشبكة أولاً حتى تظهر التعديلات فوراً
  if (url.pathname.endsWith('/config.js')) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); }
    return r;
  })));
});

// إشعارات الموبايل (تُفعّل في المرحلة ٧)
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: 'حياتي', body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'حياتي', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'ar', data: { url: d.url || './#/home' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    const target = e.notification.data?.url || './';
    for (const c of list) { if ('focus' in c) { c.navigate(target); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});

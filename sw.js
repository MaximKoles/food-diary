/* Service worker: мгновенный запуск дневника питания.
 *
 * Стратегии:
 *  - install: мгновенно кэширует ядро (HTML, манифест, иконки), остальной
 *    список сборки (все чанки) докачивает в фоне, не блокируя активацию;
 *  - навигация: cache-first + фоновое обновление (stale-while-revalidate) —
 *    открытие с иконки происходит из кэша без ожидания сети;
 *  - статика с хэшем в URL: cache-first (URL неизменяемые);
 *  - прочая статика (sw.js, манифест, иконки): cache-first + фоновое обновление.
 *
 * Список файлов для прекэша подставляется на этапе сборки
 * (scripts/write-sw-precache.mjs), в dev остаётся ядро — SW в dev не регистрируется.
 */
const CACHE = "food-diary-v16";

const CORE_URLS = ["./", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
const PRECACHE_URLS = /* прекэш сборки */ ["./index.html","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./_next/static/chunks/118fcf76469f322f.js","./_next/static/chunks/220139e884bee9f1.js","./_next/static/chunks/26dac82a68bbf6f5.js","./_next/static/chunks/2f236954d6a65e12.js","./_next/static/chunks/45548bb4d545c3ab.js","./_next/static/chunks/56d505d9a49c4f7a.js","./_next/static/chunks/60943fada85e7187.js","./_next/static/chunks/6154000ed8d80e0b.js","./_next/static/chunks/6b172f392600b635.js","./_next/static/chunks/77743fc3fcef4564.js","./_next/static/chunks/79eb7cd34e1041bb.js","./_next/static/chunks/7de9a10883694b54.js","./_next/static/chunks/7e9e56788c19add8.js","./_next/static/chunks/a431943dc12fa6c0.js","./_next/static/chunks/a6dad97d9634a72d.js","./_next/static/chunks/a6dad97d9634a72d.js.map","./_next/static/chunks/a8a6dfdbee489b99.css","./_next/static/chunks/b4c38a00336ba9e0.js","./_next/static/chunks/c5f14c9e89186bee.js","./_next/static/chunks/e76ae842b166009f.js","./_next/static/chunks/turbopack-fa4a6f92d0a01ed2.js","./_next/static/QQ8hDdx9HkMugKNuDSxnc/_buildManifest.js","./_next/static/QQ8hDdx9HkMugKNuDSxnc/_clientMiddlewareManifest.json","./_next/static/QQ8hDdx9HkMugKNuDSxnc/_ssgManifest.js","./_not-found/index.html","./404.html","./404/index.html","./icons/apple-touch-icon.png","./icons/maskable-512.png","./logo.svg","./sw.js"];

self.addEventListener("install", (event) => {
  const scope = self.registration.scope;
  const toURL = (p) => new URL(p, scope).href;
  const core = CORE_URLS.map(toURL);
  // всё, что не вошло в ядро — дотягиваем в фоне
  const rest = [...new Set(PRECACHE_URLS.map(toURL))].filter((u) => !core.includes(u));

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(core);
      self.skipWaiting();
      // фоновый прекэш остальной сборки: пачками по 6, чтобы не мешать сети
      for (let i = 0; i < rest.length; i += 6) {
        await Promise.all(
          rest.slice(i, i + 6).map(async (u) => {
            try {
              const res = await fetch(u, { cache: "no-cache" });
              if (res && res.ok) await cache.put(u, res);
            } catch {
              /* недоступный файл не ломает прекэш */
            }
          })
        );
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Отдать из кэша и параллельно обновить копию в фоне */
async function staleWhileRevalidate(request, cacheKey) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(cacheKey || request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(cacheKey || request, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) return cached;
  const res = await network;
  return res || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  // навигация: мгновенно из кэша, сеть обновляет копию в фоне
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const scope = self.registration.scope;
        const cache = await caches.open(CACHE);
        const exact = await cache.match(req, { ignoreSearch: false });
        const shell =
          exact ||
          (await cache.match(new URL("./", scope))) ||
          (await cache.match(new URL("./index.html", scope)));
        if (shell) {
          event.waitUntil(staleWhileRevalidate(req));
          return shell;
        }
        // первый визит: сеть, с записью в кэш; офлайн — то, что есть
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const url = new URL(req.url);
            const put =
              url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")
                ? new URL("./", scope)
                : req;
            cache.put(put, res.clone());
          }
          return res;
        } catch {
          const any = await cache.match(new URL("./", scope));
          return any || Response.error();
        }
      })()
    );
    return;
  }

  const url = new URL(req.url);
  const immutable = url.pathname.includes("/_next/static/");

  if (immutable) {
    // хэшированные чанки: cache-first без перевыплаты
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // прочие файлы: из кэша сразу + тихое обновление в фоне
  event.respondWith(staleWhileRevalidate(req));
});

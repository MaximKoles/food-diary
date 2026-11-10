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
const CACHE = "food-diary-v17";

const CORE_URLS = ["./", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
const PRECACHE_URLS = /* прекэш сборки */ ["./index.html","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./_next/static/chunks/220139e884bee9f1.js","./_next/static/chunks/2f236954d6a65e12.js","./_next/static/chunks/4277cbb8dfd33214.js","./_next/static/chunks/45548bb4d545c3ab.js","./_next/static/chunks/48ca76b1adcc228f.css","./_next/static/chunks/5355c1f25f96065f.js","./_next/static/chunks/56d505d9a49c4f7a.js","./_next/static/chunks/604f41128017ff08.js","./_next/static/chunks/6154000ed8d80e0b.js","./_next/static/chunks/664adc71bc2617c2.js","./_next/static/chunks/664adc71bc2617c2.js.map","./_next/static/chunks/6b172f392600b635.js","./_next/static/chunks/7e9e56788c19add8.js","./_next/static/chunks/84616ec1f69f3fe3.js","./_next/static/chunks/a431943dc12fa6c0.js","./_next/static/chunks/ae46e3127f719483.js","./_next/static/chunks/b19b72fe9313ea0e.js","./_next/static/chunks/d232069880c237e6.js","./_next/static/chunks/faeb1d724bc5c416.js","./_next/static/chunks/ffd3a1d3ece71c2f.js","./_next/static/chunks/turbopack-fa4a6f92d0a01ed2.js","./_next/static/ckmFFMt56ZMhysAndp0Kf/_buildManifest.js","./_next/static/ckmFFMt56ZMhysAndp0Kf/_clientMiddlewareManifest.json","./_next/static/ckmFFMt56ZMhysAndp0Kf/_ssgManifest.js","./_not-found/index.html","./.nojekyll","./404.html","./404/index.html","./emoji/1f305.png","./emoji/1f306.png","./emoji/1f319.png","./emoji/1f32d.png","./emoji/1f32e.png","./emoji/1f32f.png","./emoji/1f33b.png","./emoji/1f33d.png","./emoji/1f344.png","./emoji/1f345.png","./emoji/1f347.png","./emoji/1f348.png","./emoji/1f349.png","./emoji/1f34a.png","./emoji/1f34b.png","./emoji/1f34c.png","./emoji/1f34e.png","./emoji/1f350.png","./emoji/1f351.png","./emoji/1f353.png","./emoji/1f354.png","./emoji/1f355.png","./emoji/1f356.png","./emoji/1f357.png","./emoji/1f358.png","./emoji/1f35a.png","./emoji/1f35d.png","./emoji/1f35e.png","./emoji/1f35f.png","./emoji/1f361.png","./emoji/1f363.png","./emoji/1f366.png","./emoji/1f369.png","./emoji/1f36a.png","./emoji/1f36b.png","./emoji/1f36c.png","./emoji/1f36e.png","./emoji/1f36f.png","./emoji/1f370.png","./emoji/1f372.png","./emoji/1f373.png","./emoji/1f375.png","./emoji/1f377.png","./emoji/1f37a.png","./emoji/1f37d-fe0f.png","./emoji/1f383.png","./emoji/1f3c6.png","./emoji/1f41f.png","./emoji/1f4a7.png","./emoji/1f4c5.png","./emoji/1f4ca.png","./emoji/1f550.png","./emoji/1f600.png","./emoji/1f7e0.png","./emoji/1f943.png","./emoji/1f950.png","./emoji/1f951.png","./emoji/1f952.png","./emoji/1f953.png","./emoji/1f955.png","./emoji/1f956.png","./emoji/1f957.png","./emoji/1f958.png","./emoji/1f95b.png","./emoji/1f95c.png","./emoji/1f95e.png","./emoji/1f963.png","./emoji/1f964.png","./emoji/1f965.png","./emoji/1f966.png","./emoji/1f967.png","./emoji/1f969.png","./emoji/1f96b.png","./emoji/1f96d.png","./emoji/1f990.png","./emoji/1f991.png","./emoji/1f9c0.png","./emoji/1f9c3.png","./emoji/1f9c4.png","./emoji/1f9c5.png","./emoji/1f9cb.png","./emoji/1f9ed.png","./emoji/1fad0.png","./emoji/1fad1.png","./emoji/1fad2.png","./emoji/1fad9.png","./emoji/1fadb.png","./emoji/2600-fe0f.png","./emoji/2615.png","./emoji/2b50.png","./food-diary-github-pages.zip","./icons/apple-touch-icon.png","./icons/maskable-512.png","./logo.svg","./sw.js"];

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

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
const PRECACHE_URLS = /* прекэш сборки */ ["./index.html","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./_next/static/chunks/149fde1dfdea0d26.js","./_next/static/chunks/15a5385c54e6420a.js","./_next/static/chunks/417b1ba3887ee966.js","./_next/static/chunks/4392189f08a7af14.js","./_next/static/chunks/44eb371a0c87f07d.js","./_next/static/chunks/5355c1f25f96065f.js","./_next/static/chunks/604f41128017ff08.js","./_next/static/chunks/664adc71bc2617c2.js","./_next/static/chunks/664adc71bc2617c2.js.map","./_next/static/chunks/6b172f392600b635.js","./_next/static/chunks/6eb3bfacbfa14383.js","./_next/static/chunks/778af66e5977d1c6.js","./_next/static/chunks/7e9e56788c19add8.js","./_next/static/chunks/84616ec1f69f3fe3.js","./_next/static/chunks/8eee54bbcd9628ab.js","./_next/static/chunks/a431943dc12fa6c0.js","./_next/static/chunks/ae46e3127f719483.js","./_next/static/chunks/cd005988c21a339d.js","./_next/static/chunks/e2688b89afa0ecdd.css","./_next/static/chunks/e2d86fab6ab6a9b3.js","./_next/static/chunks/turbopack-0a83b66e3ae36f55.js","./_next/static/NYwy4McOt-VfpFIGcCmTX/_buildManifest.js","./_next/static/NYwy4McOt-VfpFIGcCmTX/_clientMiddlewareManifest.json","./_next/static/NYwy4McOt-VfpFIGcCmTX/_ssgManifest.js","./_not-found/index.html","./.nojekyll","./404.html","./404/index.html","./emoji/1f305.png","./emoji/1f306.png","./emoji/1f319.png","./emoji/1f32d.png","./emoji/1f32e.png","./emoji/1f32f.png","./emoji/1f33b.png","./emoji/1f33d.png","./emoji/1f344.png","./emoji/1f345.png","./emoji/1f347.png","./emoji/1f348.png","./emoji/1f349.png","./emoji/1f34a.png","./emoji/1f34b.png","./emoji/1f34c.png","./emoji/1f34e.png","./emoji/1f350.png","./emoji/1f351.png","./emoji/1f353.png","./emoji/1f354.png","./emoji/1f355.png","./emoji/1f356.png","./emoji/1f357.png","./emoji/1f358.png","./emoji/1f35a.png","./emoji/1f35d.png","./emoji/1f35e.png","./emoji/1f35f.png","./emoji/1f361.png","./emoji/1f363.png","./emoji/1f366.png","./emoji/1f369.png","./emoji/1f36a.png","./emoji/1f36b.png","./emoji/1f36c.png","./emoji/1f36e.png","./emoji/1f36f.png","./emoji/1f370.png","./emoji/1f372.png","./emoji/1f373.png","./emoji/1f375.png","./emoji/1f377.png","./emoji/1f37a.png","./emoji/1f37d-fe0f.png","./emoji/1f383.png","./emoji/1f3c6.png","./emoji/1f41f.png","./emoji/1f4a7.png","./emoji/1f4c5.png","./emoji/1f4ca.png","./emoji/1f550.png","./emoji/1f600.png","./emoji/1f7e0.png","./emoji/1f943.png","./emoji/1f950.png","./emoji/1f951.png","./emoji/1f952.png","./emoji/1f953.png","./emoji/1f955.png","./emoji/1f956.png","./emoji/1f957.png","./emoji/1f958.png","./emoji/1f95b.png","./emoji/1f95c.png","./emoji/1f95e.png","./emoji/1f963.png","./emoji/1f964.png","./emoji/1f965.png","./emoji/1f966.png","./emoji/1f967.png","./emoji/1f969.png","./emoji/1f96b.png","./emoji/1f96d.png","./emoji/1f990.png","./emoji/1f991.png","./emoji/1f9c0.png","./emoji/1f9c3.png","./emoji/1f9c4.png","./emoji/1f9c5.png","./emoji/1f9cb.png","./emoji/1f9ed.png","./emoji/1fad0.png","./emoji/1fad1.png","./emoji/1fad2.png","./emoji/1fad9.png","./emoji/1fadb.png","./emoji/2600-fe0f.png","./emoji/2615.png","./emoji/2b50.png","./food-diary-github-pages.zip","./icons/apple-touch-icon.png","./icons/maskable-512.png","./logo.svg","./sw.js"];

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

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
const CACHE = "food-diary-v14";

const CORE_URLS = ["./", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
const PRECACHE_URLS = /* прекэш сборки */ ["./index.html","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./_next/static/chunks/042a02aab6652518.css","./_next/static/chunks/0eccdac7888b837d.js","./_next/static/chunks/0f9414c36d75f137.js","./_next/static/chunks/1a3a49ae7dbf3188.js","./_next/static/chunks/2f236954d6a65e12.js","./_next/static/chunks/318b8a27e812d604.js","./_next/static/chunks/45548bb4d545c3ab.js","./_next/static/chunks/4a3fbb27f33fcd91.js","./_next/static/chunks/5029b47e67b7dfe7.js","./_next/static/chunks/513a374b74d0cd27.js","./_next/static/chunks/5276f9d71c25d1ce.js","./_next/static/chunks/54d3293e12c5bf5a.js","./_next/static/chunks/612cea014f8e7cab.js","./_next/static/chunks/6154000ed8d80e0b.js","./_next/static/chunks/625df387fe058841.js","./_next/static/chunks/771dedee3f5e1621.js","./_next/static/chunks/91f1c83c8f6f50c4.js","./_next/static/chunks/a6dad97d9634a72d.js","./_next/static/chunks/a6dad97d9634a72d.js.map","./_next/static/chunks/f21cdd0dac1799a5.js","./_next/static/chunks/turbopack-4bf2471881e33146.js","./_next/static/ol6yf7m3LaN5W-VECXWDh/_buildManifest.js","./_next/static/ol6yf7m3LaN5W-VECXWDh/_clientMiddlewareManifest.json","./_next/static/ol6yf7m3LaN5W-VECXWDh/_ssgManifest.js","./_not-found/index.html","./404.html","./404/index.html","./icons/apple-touch-icon.png","./icons/maskable-512.png","./logo.svg","./sw.js"];

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

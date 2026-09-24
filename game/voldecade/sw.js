const CACHE = "voldecade-static-abeea20539718afb";
const SHELL_ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./ai-worker.js?v=37e3bb37dd1553f3", "./manifest.webmanifest", "./assets/design/fabicon/fabicon.png"];
const MAX_RUNTIME_ASSETS = 96;

function isRuntimeAsset(url) {
  return url.pathname.includes("/assets/") || url.pathname.endsWith("/firebase-online.js");
}

function shouldCache(request, url) {
  return request.mode === "navigate" || isRuntimeAsset(url) || SHELL_ASSETS.some((asset) => new URL(asset, self.registration.scope).pathname === url.pathname);
}

async function pruneRuntimeAssets(cache) {
  const requests = (await cache.keys()).filter((request) => isRuntimeAsset(new URL(request.url)));
  while (requests.length > MAX_RUNTIME_ASSETS) {
    const oldest = requests.shift();
    if (oldest) await cache.delete(oldest);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  let cacheWork = Promise.resolve();
  const responseWork = (async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached !== undefined) {
      if (isRuntimeAsset(url)) {
        cacheWork = cache.delete(event.request)
          .then(() => cache.put(event.request, cached.clone()))
          .then(() => pruneRuntimeAssets(cache))
          .catch(() => undefined);
      }
      return cached;
    }

    try {
      const response = await fetch(event.request);
      if (response.ok && response.type !== "opaque" && shouldCache(event.request, url)) {
        cacheWork = cache.put(event.request, response.clone()).then(() => pruneRuntimeAssets(cache)).catch(() => undefined);
      }
      return response;
    } catch {
      if (event.request.mode === "navigate") {
        const shell = await cache.match("./index.html");
        if (shell !== undefined) return shell;
      }
      return Response.error();
    }
  })();
  event.waitUntil(responseWork.then(() => cacheWork, () => undefined));
  event.respondWith(responseWork);
});

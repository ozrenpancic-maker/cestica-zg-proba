// Čestica HR (ranije ČesticaZG) service worker. Verziju upisuje build.py; svaka nova objava mijenja ovu datoteku, pa preglednik vidi ažuriranje.
// Načela:
//  - sprema se SAMO ljuska aplikacije (stranica, manifest, ikone, knjižnice Leaflet i Turf iz vendor/); fontovi bez interneta padaju na sistemski font;
//  - službeni mrežni podaci (katastar, GUP, slojevi Grada, OSM, Nominatim, Open-Meteo, AI) NIKAD se ne presreću ni spremaju;
//  - stranica se uvijek prvo traži s mreže (nova verzija odmah kad je internet dostupan), a iz spremnika samo bez interneta;
//  - nova verzija čeka korisnikovu potvrdu ("Dostupna je nova verzija") i ne briše localStorage (parcele, scenarije, unose).
const VERSION = "e265d8d2565b";
const SHELL = "czg-ljuska-" + VERSION;
// knjižnice (Leaflet 1.9.4, Turf 6.5.0) su u mapi vendor/ uz aplikaciju, pa rade i bez interneta i bez CDN-a
const LOCAL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-192.png", "./icons/icon-maskable-512.png",
  "./vendor/leaflet-1.9.4/leaflet.js", "./vendor/leaflet-1.9.4/leaflet.css", "./vendor/turf-6.5.0/turf.min.js",
  "./vendor/leaflet-1.9.4/images/layers.png", "./vendor/leaflet-1.9.4/images/layers-2x.png", "./vendor/leaflet-1.9.4/images/marker-icon.png", "./vendor/leaflet-1.9.4/images/marker-icon-2x.png", "./vendor/leaflet-1.9.4/images/marker-shadow.png"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await c.addAll(LOCAL.map((u) => new Request(u, { cache: "reload" })));
  })());
  // bez self.skipWaiting(): nova verzija čeka korisnikovu potvrdu, da se otvorena aplikacija ne promijeni usred unosa
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("czg-ljuska-") && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("message", (e) => { if (e.data === "primijeni-novu-verziju") self.skipWaiting(); });

self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  // stranica aplikacije: prvo mreža (4 s), bez interneta spremljena verzija
  if (req.mode === "navigate" && url.origin === self.location.origin && url.pathname.startsWith(new URL("./", self.location).pathname)) {
    e.respondWith((async () => {
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(req, { signal: ctl.signal, cache: "no-store" }); clearTimeout(t);
        if (r.ok) { const c = await caches.open(SHELL); c.put("./index.html", r.clone()); }
        return r;
      } catch (err) {
        const c = await caches.open(SHELL);
        return (await c.match("./index.html")) || (await c.match("./")) || new Response("<h1>Čestica HR</h1><p>Nema interneta, a aplikacija još nije spremljena na uređaj.</p>", { headers: { "content-type": "text/html; charset=utf-8" } });
      }
    })());
    return;
  }
  // ljuska: iz spremnika, inače s mreže
  if (url.origin === self.location.origin && LOCAL.some((u) => new URL(u, self.location).href === url.href)) {
    e.respondWith(caches.match(req).then((m) => m || fetch(req)));
    return;
  }
  // sve ostalo (službeni podaci, karte, fontovi, AI): ne presreće se i ne sprema. Tako nijedan spori vanjski zahtjev
  // ne zadržava staru verziju aktivnom, pa se ažuriranje primijeni odmah nakon potvrde.
});

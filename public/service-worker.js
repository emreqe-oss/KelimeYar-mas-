const CACHE_NAME = 'kelime-oyunu-v20'; // Versiyonu değiştirdik
const urlsToCache = [
  '/',
  '/index.html',
  // Buraya diğer statik dosyalarını ekleyebilirsin ama Network First kullandığımız için zorunlu değil
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap'
];

// Yükleme
self.addEventListener('install', event => {
  self.skipWaiting(); // Beklemeden yeni sürümü aktif et
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Aktifleştirme (Eski cache'leri temizle)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// İSTEKLERİ YAKALA: NETWORK FIRST (Önce İnternet)
self.addEventListener('fetch', event => {
  // Eğer istek bir web sayfası veya JS dosyası ise önce interneti dene
  if (event.request.mode === 'navigate' || event.request.destination === 'script') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // İnternet var: Cache'i güncelle ve cevabı döndür
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // İnternet YOK: Cache'den döndür (Offline modu)
          return caches.match(event.request);
        })
    );
  } else {
    // Diğer statik dosyalar (resimler vb.) için Cache First devam edebilir
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request);
      })
    );
  }
});
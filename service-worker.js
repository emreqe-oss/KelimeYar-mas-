// service-worker.js

const CACHE_NAME = 'kelime-oyunu-v16'; // Cache versiyonunu bir artırdık.
const urlsToCache = [
  '/',
  '/index.html',
  // '/kelimeler.json', // <-- ARTIK GÜVENLİ DEĞİL! BU SATIRI KALDIRDIK.
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        const promises = urlsToCache.map(url => {
            // no-cors modu harici kaynaklarda sorun yaratabilir, normal request kullanalım
            return cache.add(url).catch(err => {
                console.warn(`Failed to cache ${url}:`, err);
            });
        });
        return Promise.all(promises);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache'de varsa, cache'den döndür.
        if (response) {
          return response;
        }

        // Cache'de yoksa, ağdan iste ve cache'e ekle.
        return fetch(event.request).then(
          (response) => {
            // Sadece geçerli ve 'basic' tipteki istekleri cache'le.
            // Bu, 'opaque' (CORS olmayan) yanıtların cache'lenmesini engeller.
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
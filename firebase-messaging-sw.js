importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

// Ekran görüntüsündeki bilgilerine göre dolduruldu:
const firebaseConfig = {
  apiKey: "AIzaSyA5FcmgM9GV79qGwS8MC3_4yCvwvHZO0iQ",
  authDomain: "kelime-oyunu-flaneur.firebaseapp.com",
  projectId: "kelime-oyunu-flaneur",
  storageBucket: "kelime-oyunu-flaneur.firebasestorage.app",
  messagingSenderId: "888546992121",
  appId: "1:888546992121:web:3e29748729cca6fbbb2728",
  measurementId: "G-RVD6YZ8JYV"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Arka plan mesajlarını yakala
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Arka plan mesajı:', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon-192x192.png',
    data: {
        url: payload.fcmOptions?.link || '/' 
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Bildirime tıklanma olayı
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
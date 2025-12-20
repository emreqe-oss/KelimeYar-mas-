// js/notifications.js - TAM DOSYA

import { getMessaging, getToken } from "firebase/messaging";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db, app } from './firebase.js'; 
import { getUserId } from './state.js';

export async function requestNotificationPermission() {
    const userId = getUserId();
    if (!userId) return;

    let messaging;
    try {
        messaging = getMessaging(app);
    } catch (e) {
        // Tarayıcı desteklemiyorsa sessizce çık
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Bildirim izni verildi.');
            
            let registration;
            try {
                registration = await navigator.serviceWorker.ready;
            } catch (swError) {
                console.warn("SW hazır değil.");
                return;
            }
            
            // Token almayı dene
            try {
                // VAPID Key'in firebase console'dan alınan doğru key olduğundan emin ol
                const currentToken = await getToken(messaging, { 
                    vapidKey: 'BO3eHaAFhgLoP-51vSJDM2ZqzzdVhhNLTlQUdZZK9TU8VCSYVzuM0T16E21hGugw3pp4x3GXfDU5JJFKnJqb3Qw', 
                    serviceWorkerRegistration: registration
                });

                if (currentToken) {
                    const userRef = doc(db, "users", userId);
                    await updateDoc(userRef, {
                        fcmTokens: arrayUnion(currentToken)
                    });
                    console.log('FCM Token kaydedildi.');
                }
            } catch (tokenError) {
                // 401 Hatası (Yetki yok) buraya düşer.
                // Kırmızı hata yerine sarı uyarı basıyoruz ki dikkat dağıtmasın.
                // Bu hata oyunun çalışmasını etkilemez.
                console.warn("Bildirim sistemi uyarısı (Oyun çalışmaya devam eder):", tokenError.code || tokenError.message);
            }

        }
    } catch (error) {
        console.warn('Bildirim izni istenirken genel hata:', error);
    }
}
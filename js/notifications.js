import { getMessaging, getToken } from "firebase/messaging";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db, app } from './firebase.js'; 
import { getUserId } from './state.js';

export async function requestNotificationPermission() {
    const userId = getUserId();
    if (!userId) return;

    const messaging = getMessaging(app);

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Bildirim izni verildi.');
            
            // DİKKAT: 2. Ekran görüntüsündeki 'BO3e...' ile başlayan uzun kodu tırnak içine yapıştır:
            const currentToken = await getToken(messaging, { 
                vapidKey: 'BO3eHaAFhgLoP-51vSJDM2ZqzzdVhhNLTIQUdZZK9TU8VCSYVzuMOT16E21hGugw3pp4x3GXfDU5JJFKnJqb3Qw' 
            });

            if (currentToken) {
                const userRef = doc(db, "users", userId);
                await updateDoc(userRef, {
                    fcmTokens: arrayUnion(currentToken)
                });
                console.log('FCM Token kaydedildi.');
            }
        } else {
            console.log('Bildirim izni reddedildi.');
        }
    } catch (error) {
        console.error('Bildirim hatası:', error);
    }
}
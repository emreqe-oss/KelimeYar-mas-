// js/firebase.js

import { showToast } from './utils.js';

// --- NİHAİ GÜVENLİ YÖNTEM ---
// Bu yapı, projenin Vercel gibi modern platformlara deploy edilmesi için tasarlanmıştır.
// Anahtarlar artık kodun içinde değil, platformun "Environment Variables" ayarlarından güvenli bir şekilde okunur.
const firebaseConfig = {
    apiKey: import.meta.env.VITE_API_KEY,
    authDomain: import.meta.env.VITE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_APP_ID,
    measurementId: import.meta.env.VITE_MEASUREMENT_ID
};

// Firebase'i başlatmadan önce anahtarların yüklenip yüklenmediğini kontrol et.
if (firebaseConfig.apiKey) {
    firebase.initializeApp(firebaseConfig);
} else {
    console.error("Firebase konfigürasyon bilgileri yüklenemedi. Ortam değişkenlerini kontrol edin.");
    showToast("Uygulama başlatılamadı. Yapılandırma hatası.", true);
}

// Diğer dosyalarda kullanmak için servisleri export et
export const db = firebase.firestore();
export const auth = firebase.auth();
const functions = firebase.functions();


// ========================================================================
// NİHAİ ÇÖZÜM: 'callable' dahil tüm Firebase katmanlarını atlayıp,
// en temel ve ilkel 'fetch' isteğini doğrudan sunucunun HTTP adresine yapıyoruz.
// ========================================================================
export const checkWordValidity = async (wordToTest) => {
    try {
        const functionUrl = "https://us-central1-kelime-oyunu-flaneur.cloudfunctions.net/checkWordValidity";

        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ word: wordToTest })
        });

        if (!response.ok) {
            console.error('Sunucudan hatalı yanıt durumu:', response.status);
            throw new Error('Sunucu kelimeyi doğrulayamadı.');
        }

        const jsonResponse = await response.json();
        return jsonResponse.isValid;

    } catch (error) {
        console.error("Kelime kontrol fonksiyonunda 'fetch' hatası:", error);
        showToast("Kelime kontrol edilemedi. Lütfen tekrar deneyin.", true);
        return false;
    }
};

export const getNewSecretWord = async (length) => {
    try {
        const getWord = functions.httpsCallable('getNewSecretWord');
        const result = await getWord({ wordLength: length });
        return result.data.secretWord;
    } catch (error) {
        console.error("Yeni kelime alınamadı:", error);
        showToast("Yeni oyun için kelime alınamadı.", true);
        return null;
    }
};
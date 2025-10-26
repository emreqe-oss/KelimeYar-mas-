// js/firebase.js

import { showToast } from './utils.js';

// js/firebase.js - GÜVENLİ VE DOĞRU KOD
const firebaseConfig = { 
    apiKey: import.meta.env.VITE_API_KEY, 
    authDomain: import.meta.env.VITE_AUTH_DOMAIN, 
    projectId: import.meta.env.VITE_PROJECT_ID, 
    storageBucket: import.meta.env.VITE_STORAGE_BUCKET, 
    messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID, 
    appId: import.meta.env.VITE_APP_ID, 
    measurementId: import.meta.env.VITE_MEASUREMENT_ID 
};

firebase.initializeApp(firebaseConfig);

export const db = firebase.firestore();
export const auth = firebase.auth();

// ========================================================================
// ARTIK TÜM FONKSİYONLAR, EN TEMEL VE GÜVENİLİR OLAN 'fetch' YÖNTEMİNİ KULLANIYOR.
// ========================================================================

export const checkWordValidity = async (wordToTest) => {
    try {
        const functionUrl = "https://us-central1-kelime-oyunu-flaneur.cloudfunctions.net/checkWordValidity";
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: wordToTest })
        });
        if (!response.ok) throw new Error('Sunucu kelimeyi doğrulayamadı.');
        const jsonResponse = await response.json();
        return jsonResponse.isValid;
    } catch (error) {
        console.error("checkWordValidity 'fetch' hatası:", error);
        showToast("Kelime kontrol edilemedi. Lütfen tekrar deneyin.", true);
        return false;
    }
};

export const getNewSecretWord = async (length) => {
    try {
        const functionUrl = "https://us-central1-kelime-oyunu-flaneur.cloudfunctions.net/getNewSecretWord";
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wordLength: length }) // Veriyi doğru formatta gönderiyoruz
        });
        if (!response.ok) throw new Error('Sunucudan yeni kelime alınamadı.');
        const jsonResponse = await response.json();
        return jsonResponse.secretWord;
    } catch (error) {
        console.error("getNewSecretWord 'fetch' hatası:", error);
        showToast("Yeni oyun için kelime alınamadı.", true);
        return null;
    }
};
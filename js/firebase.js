// js/firebase.js - YENİ VE DOĞRU KOD

// Gerekli Firebase fonksiyonlarını doğrudan paketten içe aktarıyoruz
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

import { showToast } from './utils.js';

// Vite'nin .env dosyasından okuduğu environment değişkenleri
const firebaseConfig = {
    apiKey: import.meta.env.VITE_API_KEY,
    authDomain: import.meta.env.VITE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_APP_ID,
    measurementId: import.meta.env.VITE_MEASUREMENT_ID
};

// Firebase uygulamasını başlatıyoruz
const app = initializeApp(firebaseConfig);

// Başlatılan uygulamadan ihtiyacımız olan servisleri (Firestore, Auth) alıyoruz
export const db = getFirestore(app);
export const auth = getAuth(app);

// ========================================================================
// MEVCUT FONKSİYONLARINIZ (Bunlar zaten doğru çalışıyordu, dokunmuyoruz)
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
            body: JSON.stringify({ wordLength: length })
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

export const submitMultiplayerGuess = async (gameId, word, userId, isBR) => {
    try {
        const functionUrl = "https://us-central1-kelime-oyunu-flaneur.cloudfunctions.net/submitMultiplayerGuess";
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId, word, userId, isBR })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Tahmin sunucuda işlenemedi.');
        }
        return await response.json();
    } catch (error) {
        console.error("submitMultiplayerGuess 'fetch' hatası:", error);
        showToast(error.message || "Tahmin gönderilirken kritik bir hata oluştu.", true);
        return { success: false };
    }
};

export const failMultiplayerTurn = async (gameId, userId) => {
    try {
        const functionUrl = "https://us-central1-kelime-oyunu-flaneur.cloudfunctions.net/failMultiplayerTurn";
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId, userId })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Tur sonlandırma sunucuda işlenemedi.');
        }
        return await response.json();
    } catch (error) {
        console.error("failMultiplayerTurn 'fetch' hatası:", error);
        showToast(error.message || "Tur sonlandırılırken kritik bir hata oluştu.", true);
        return { success: false };
    }
};
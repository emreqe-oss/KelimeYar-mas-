// js/firebase.js - GÜNCEL GEN 2 URL'LERİ İLE

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { showToast } from './utils.js';

// Vite environment değişkenleri
const firebaseConfig = {
    apiKey: import.meta.env.VITE_API_KEY,
    authDomain: import.meta.env.VITE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_APP_ID,
    measurementId: import.meta.env.VITE_MEASUREMENT_ID
};

// Firebase uygulamasını başlat
const app = initializeApp(firebaseConfig);

// Servisleri dışarı aktar
export const db = getFirestore(app);
export const auth = getAuth(app);
export { app }; // Bildirim izni için app'i de export ediyoruz

// ========================================================================
// CLOUD FUNCTIONS ÇAĞRILARI (GEN 2 URL'LERİ GİRİLDİ)
// ========================================================================

/**
 * Sunucudan kelime geçerliliğini kontrol eder.
 */
export const checkWordValidity = async (wordToTest) => {
    try {
        // GÜNCEL GEN 2 URL
        const functionUrl = "https://checkwordvalidity-wxw6bd452q-uc.a.run.app";
        
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: wordToTest })
        });
        if (!response.ok) throw new Error('Sunucu kelimeyi doğrulayamadı.');
        const jsonResponse = await response.json();
        return jsonResponse.isValid;
    } catch (error) {
        console.error("checkWordValidity hatası:", error);
        showToast("Kelime kontrol edilemedi.", true);
        return false;
    }
};

/**
 * Sunucudan yeni gizli kelimeyi çeker.
 */
export const getNewSecretWord = async (length) => {
    try {
        // GÜNCEL GEN 2 URL
        const functionUrl = "https://getnewsecretword-wxw6bd452q-uc.a.run.app";
        
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wordLength: length })
        });
        if (!response.ok) throw new Error('Sunucudan yeni kelime alınamadı.');
        const jsonResponse = await response.json();
        return jsonResponse.secretWord;
    } catch (error) {
        console.error("getNewSecretWord hatası:", error);
        showToast("Yeni oyun için kelime alınamadı.", true);
        return null;
    }
};

/**
 * Sunucuya çoklu oyuncu tahminini gönderir.
 */
export const submitMultiplayerGuess = async (gameId, word, userId, isBR) => {
    try {
        // GÜNCEL GEN 2 URL
        const functionUrl = "https://submitmultiplayerguess-wxw6bd452q-uc.a.run.app";
        
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId, word, userId, isBR })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Tahmin işlenemedi.');
        }
        return await response.json();
    } catch (error) {
        console.error("submitMultiplayerGuess hatası:", error);
        showToast(error.message || "Tahmin gönderilemedi.", true);
        return { success: false };
    }
};

/**
 * Sunucuya turun bittiğini bildirir.
 */
export const failMultiplayerTurn = async (gameId, userId) => {
    try {
        // GÜNCEL GEN 2 URL
        const functionUrl = "https://failmultiplayerturn-wxw6bd452q-uc.a.run.app";
        
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId, userId })
        });
        if (!response.ok) throw new Error('Tur sonlandırılamadı.');
        return await response.json();
    } catch (error) {
        console.error("failMultiplayerTurn hatası:", error);
        return { success: false };
    }
};

/**
 * Kelime anlamını çeker.
 */
export const getWordMeaning = async (wordToSearch) => {
    try {
        // GÜNCEL GEN 2 URL
        const functionUrl = "https://getwordmeaning-wxw6bd452q-uc.a.run.app"; 
        
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: wordToSearch })
        });
        
        if (!response.ok) throw new Error('Anlam alınamadı.');
        return await response.json(); 
    } catch (error) {
        console.error("getWordMeaning hatası:", error);
        return { success: false, meaning: "Anlam servisine ulaşılamadı." };
    }
};

/**
 * BR modunda sonraki tura geçer.
 */
export const startNextBRRound = async (gameId, userId) => {
    try {
        // GÜNCEL GEN 2 URL
        const functionUrl = "https://startnextbrround-wxw6bd452q-uc.a.run.app";
        
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId, userId })
        });
        if (!response.ok) throw new Error('Sonraki tura geçilemedi.');
        return await response.json();
    } catch (error) {
        console.error("startNextBRRound hatası:", error);
        return { success: false };
    }
};
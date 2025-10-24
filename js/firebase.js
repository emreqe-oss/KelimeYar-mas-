// js/firebase.js

import { showToast } from './utils.js';

const firebaseConfig = { 
    apiKey: "AIzaSyA5FcmgM9GV79qGwS8MC3_4yCvwvHZO0iQ", 
    authDomain: "kelime-oyunu-flaneur.firebaseapp.com", 
    projectId: "kelime-oyunu-flaneur", 
    storageBucket: "kelime-oyunu-flaneur.appspot.com", 
    messagingSenderId: "888546992121", 
    appId: "1:888546992121:web:3e29748729cca6fbbb2728", 
    measurementId: "G-RVD6YZ8JYV" 
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
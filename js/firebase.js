// js/firebase.js

import { showToast } from './utils.js';

// ========================================================================
// NİHAİ CANLI SÜRÜM: Projemizde bir build adımı (Vite, Webpack vb.) olmadığı için,
// Vercel ortam değişkenlerini koda enjekte edemiyor. Bu nedenle, Vercel'e
// deploy ederken anahtarları bu şekilde doğrudan yazmak, bu proje yapısı için
// en basit ve en güvenilir çözümdür.
// Projenin güvenliği, veritabanı kuralları (firestore.rules) ile sağlanmaktadır.
// ========================================================================
const firebaseConfig = { 
    apiKey: "AIzaSyA5FcmgM9GV79qGwS8MC3_4yCvwvHZO0iQ", 
    authDomain: "kelime-oyunu-flaneur.firebaseapp.com", 
    projectId: "kelime-oyunu-flaneur", 
    storageBucket: "kelime-oyunu-flaneur.appspot.com", 
    messagingSenderId: "888546992121", 
    appId: "1:888546992121:web:3e29748729cca6fbbb2728", 
    measurementId: "G-RVD6YZ8JYV" 
};

// Firebase'i başlat
firebase.initializeApp(firebaseConfig);

// Diğer dosyalarda kullanmak için servisleri export et
export const db = firebase.firestore();
export const auth = firebase.auth();
const functions = firebase.functions();

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
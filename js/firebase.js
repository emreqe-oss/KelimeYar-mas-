// js/firebase.js

// Firebase konfigürasyon bilgileriniz
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

// Diğer dosyalarda kullanmak için Firestore ve Auth'u export et
export const db = firebase.firestore();
export const auth = firebase.auth();
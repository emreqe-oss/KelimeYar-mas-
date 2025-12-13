// js/auth.js - REFERANS SİSTEMİ EKLENMİŞ FİNAL KOD

// Firebase v9'dan gerekli fonksiyonları import ediyoruz
// EKLENDİ: getDoc ve updateDoc fonksiyonlarını buraya dahil ettik
import { serverTimestamp, doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut 
} from "firebase/auth";

import { auth, db } from './firebase.js';
import { showToast, getFirebaseErrorMessage } from './utils.js';
import * as state from './state.js';

// Elementler
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const registerEmail = document.getElementById('register-email');
const registerPassword = document.getElementById('register-password');
const registerFullname = document.getElementById('register-fullname');
const registerUsername = document.getElementById('register-username');
const registerAge = document.getElementById('register-age');
const registerCity = document.getElementById('register-city');
const registerPhone = document.getElementById('register-phone');
const authLoading = document.getElementById('auth-loading');

export const handleLogin = async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) {
        return showToast("E-posta ve şifre alanları boş bırakılamaz.", true);
    }
    authLoading.classList.remove('hidden');
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        showToast(getFirebaseErrorMessage(error), true);
    }
    authLoading.classList.add('hidden');
};

export const handleRegister = async () => {
    const email = registerEmail.value;
    const password = registerPassword.value;
    const fullname = registerFullname.value;
    const username = registerUsername.value;
    const age = registerAge.value;
    const city = registerCity.value;
    const phone = registerPhone.value;

    if (!email || !password || !fullname || !username || !age || !city || !phone) {
        return showToast("Tüm alanları doldurmalısınız.", true);
    }
    if (password.length < 6) {
        return showToast("Şifre en az 6 karakter olmalıdır.", true);
    }
    
    authLoading.classList.remove('hidden');
    
    try {
        // 1. Kullanıcıyı oluştur
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        const initialStats = {
            played: 0,
            wins: 0,
            currentStreak: 0,
            maxStreak: 0,
            guessDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 }
        };

        const userDocRef = doc(db, 'users', user.uid);
        
        // 2. Kullanıcı verilerini Firestore'a kaydet
        await setDoc(userDocRef, {
            username: username,
            fullname: fullname,
            age: parseInt(age),
            city: city,
            phone: phone,
            email: email,
            createdAt: serverTimestamp(),
            stats: initialStats,
            gold: 0, // Başlangıç altını (Referans ödülünü karıştırmamak için 0 veya hediye miktarı)
            inventory: { present: 0, correct: 0, remove: 0 } // Envanter başlangıcı
        });

        // --- REFERANS ÖDÜL SİSTEMİ BAŞLANGICI ---
        const inviterId = sessionStorage.getItem('invitedBy');

        // Kendini davet etmeyi engellemek için kontrol
        if (inviterId && inviterId !== user.uid) {
            try {
                const inviterRef = doc(db, "users", inviterId);
                const inviterSnap = await getDoc(inviterRef);
                
                if (inviterSnap.exists()) {
                    const currentGold = inviterSnap.data().gold || 0;
                    // Davet eden kişiye 5000 Altın ekle
                    await updateDoc(inviterRef, {
                        gold: currentGold + 5000 
                    });
                    console.log(`Referans ödülü (${inviterId}) kullanıcısına gönderildi.`);
                }
                
                // Ödül verildi, referans bilgisini temizle
                sessionStorage.removeItem('invitedBy');
                
            } catch (error) {
                console.error("Referans ödülü verilirken hata:", error);
            }
        }
        // --- REFERANS ÖDÜL SİSTEMİ BİTİŞİ ---
        
    } catch (error) {
        showToast(getFirebaseErrorMessage(error), true);
    }
    
    authLoading.classList.add('hidden');
};

export const handleLogout = async () => {
    const friendsUnsubscribe = state.getFriendsUnsubscribe();
    if (friendsUnsubscribe) friendsUnsubscribe();
    
    // getInvitesUnsubscribe state.js'de tanımlı değilse bu satırlar hata verebilir,
    // eğer tanımlıysa kalabilir. Güvenlik için try-catch içine alabilirsin veya 
    // state.js dosyasında bu fonksiyonların olduğundan emin ol.
    try {
        const invitesUnsubscribe = state.getInvitesUnsubscribe?.();
        if (invitesUnsubscribe) invitesUnsubscribe();
        state.setInvitesUnsubscribe?.(null);
    } catch (e) { console.log("Invite unsubscribe hatası (önemsiz):", e); }

    state.setFriendsUnsubscribe(null);

    try {
        await signOut(auth);
    } catch (error) {
        showToast(getFirebaseErrorMessage(error), true);
    }
};
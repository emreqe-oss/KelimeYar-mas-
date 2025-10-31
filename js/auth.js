// js/auth.js - YENİ VE TAM KOD

// Firebase v9'dan gerekli fonksiyonları import ediyoruz
import { serverTimestamp, doc, setDoc } from "firebase/firestore";
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
const authLoading = document.getElementById('auth-loading');

export const handleLogin = async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) {
        return showToast("E-posta ve şifre alanları boş bırakılamaz.", true);
    }
    authLoading.classList.remove('hidden');
    try {
        // auth objesini direkt kullanmak yerine v9 fonksiyonunu kullanıyoruz
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

    if (!email || !password || !fullname || !username || !age || !city) {
        return showToast("Tüm alanları doldurmalısınız.", true);
    }
    if (password.length < 6) {
        return showToast("Şifre en az 6 karakter olmalıdır.", true);
    }
    authLoading.classList.remove('hidden');
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const initialStats = {
            played: 0,
            wins: 0,
            currentStreak: 0,
            maxStreak: 0,
            guessDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 }
        };

        // YENİ YÖNTEM: Önce doküman referansı oluşturulur
        const userDocRef = doc(db, 'users', user.uid);
        
        // YENİ YÖNTEM: setDoc ile veri yazılır
        await setDoc(userDocRef, {
            username: username,
            fullname: fullname,
            age: parseInt(age),
            city: city,
            email: email,
            createdAt: serverTimestamp(), // Bu fonksiyonu en üste import etmiştik
            stats: initialStats
        });
        
    } catch (error) {
        showToast(getFirebaseErrorMessage(error), true);
    }
    authLoading.classList.add('hidden');
};

export const handleLogout = async () => {
    const friendsUnsubscribe = state.getFriendsUnsubscribe();
    if (friendsUnsubscribe) friendsUnsubscribe();
    
    const invitesUnsubscribe = state.getInvitesUnsubscribe();
    if (invitesUnsubscribe) invitesUnsubscribe();

    state.setFriendsUnsubscribe(null);
    state.setInvitesUnsubscribe(null);

    try {
        await signOut(auth);
    } catch (error) {
        showToast(getFirebaseErrorMessage(error), true);
    }
};
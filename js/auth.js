// js/auth.js - REFERANS SİSTEMİ VE AVATAR ZORUNLULUĞU OLAN FİNAL KOD

import { serverTimestamp, doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
// EKLENDİ: updateProfile fonksiyonunu import ettik
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut,
    updateProfile 
} from "firebase/auth";

import { auth, db } from './firebase.js';
import { showToast, getFirebaseErrorMessage } from './utils.js';
import * as state from './state.js';
import { showScreen } from './ui.js'; // Ekran yönlendirmesi için eklendi

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
        showToast("Giriş başarılı!", false);
        showScreen('main-menu-screen'); // Başarılı girişte menüye at
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

    // --- YENİ EKLENEN KISIM: AVATAR KONTROLÜ ---
    const avatarInput = document.getElementById('register-selected-avatar-url');
    const selectedAvatar = avatarInput ? avatarInput.value : null;

    if (!selectedAvatar) {
        return showToast("Lütfen bir avatar seçin (Zorunlu).", true);
    }
    // -------------------------------------------

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
            
            avatarUrl: selectedAvatar, // <--- YENİ: Avatar URL veritabanına yazılıyor
            
            createdAt: serverTimestamp(),
            stats: initialStats,
            gold: 1000, // Başlangıç altını (1000 yaptık, değiştirebilirsin)
            inventory: { present: 5, correct: 2, remove: 2 }, // Başlangıç Hediyeleri
            
            // Lig Başlangıç Verileri (Hata almamak için)
            currentTier: 'rookie',
            currentLeagueWeek: '2024-W1'
        });

        // 3. Auth Profilini Güncelle (Firebase Auth tarafında da görünsün)
        await updateProfile(user, {
            displayName: username,
            photoURL: selectedAvatar
        });

        // --- REFERANS ÖDÜL SİSTEMİ (MEVCUT KODUNUZ KORUNDU) ---
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
        // --- REFERANS SİSTEMİ BİTİŞİ ---

        showToast("Kayıt başarılı! Hoş geldin.", false);
        showScreen('main-menu-screen'); // Başarılı kayıtta menüye at
        
    } catch (error) {
        showToast(getFirebaseErrorMessage(error), true);
    }
    
    authLoading.classList.add('hidden');
};

export const handleLogout = async () => {
    const friendsUnsubscribe = state.getFriendsUnsubscribe();
    if (friendsUnsubscribe) friendsUnsubscribe();
    
    try {
        const invitesUnsubscribe = state.getInvitesUnsubscribe?.();
        if (invitesUnsubscribe) invitesUnsubscribe();
        state.setInvitesUnsubscribe?.(null);
    } catch (e) { console.log("Invite unsubscribe hatası (önemsiz):", e); }

    state.setFriendsUnsubscribe(null);

    try {
        await signOut(auth);
        showToast("Çıkış yapıldı.", false);
        showScreen('login-screen'); // Çıkışta login ekranına at
    } catch (error) {
        showToast(getFirebaseErrorMessage(error), true);
    }
};
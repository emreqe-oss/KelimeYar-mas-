// js/utils.js - TAM DOSYA

export function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = isError ? 'toast show error' : 'toast show success';
        
        toast.style.backgroundColor = isError ? '#ef4444' : '#10b981';
        toast.style.color = '#ffffff';

        setTimeout(() => { 
            toast.className = toast.className.replace('show', ''); 
        }, 3000);
    } else {
        console.log(isError ? "HATA: " + message : "BİLGİ: " + message);
    }
}

export function playSound(type) {
    // Ses kodları buraya gelecek
    const isMuted = localStorage.getItem('soundMuted') === 'true';
    if (isMuted) return; // Ses kapalıysa çalma
}

export function shakeCurrentRow(wordLength, currentRow) {
    for (let i = 0; i < wordLength; i++) {
        const tile = document.getElementById(`tile-${currentRow}-${i}`);
        if (tile) {
            tile.classList.add('shake');
            setTimeout(() => tile.classList.remove('shake'), 500);
        }
    }
}

export function createElement(tag, options = {}) {
    const el = document.createElement(tag);
    if (options.className) el.className = options.className;
    if (options.id) el.id = options.id;
    if (options.textContent) el.textContent = options.textContent;
    if (options.innerHTML) el.innerHTML = options.innerHTML;
    
    if (options.dataset) {
        Object.entries(options.dataset).forEach(([key, value]) => {
            el.dataset[key] = value;
        });
    }
    
    if (options.onclick) el.onclick = options.onclick;
    
    return el;
}

export function getStatsFromProfile(profile) {
    if (!profile || !profile.stats) {
        return { 
            played: 0, wins: 0, currentStreak: 0, maxStreak: 0, 
            guessDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 } 
        };
    }
    return profile.stats;
}

export function getFirebaseErrorMessage(error) {
    const code = error.code;
    switch (code) {
        case 'auth/email-already-in-use': return "Bu e-posta zaten kullanımda.";
        case 'auth/invalid-email': return "Geçersiz e-posta adresi.";
        case 'auth/weak-password': return "Şifre çok zayıf.";
        case 'auth/user-not-found': return "Kullanıcı bulunamadı.";
        case 'auth/wrong-password': return "Hatalı şifre.";
        default: return error.message || "Bir hata oluştu.";
    }
}

// --- KONFETİ EFEKTİ (GÜNCELLENDİ) ---
export function triggerConfetti() {
    // DÜZELTME: 'confetti' yerine 'window.confetti' kullanıyoruz.
    // Modül yapısında global değişkenlere erişmenin en garanti yolu budur.
    const confettiLib = window.confetti;

    if (typeof confettiLib !== 'function') {
        console.warn("Canvas-confetti kütüphanesi yüklenmemiş veya window nesnesinde bulunamadı.");
        return;
    }

    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    // zIndex'i yüksek tutuyoruz ki her şeyin üstünde görünsün
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

    const randomInRange = (min, max) => Math.random() * (max - min) + min;

    const interval = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
            return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        
        confettiLib(Object.assign({}, defaults, { 
            particleCount, 
            origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } 
        }));
        confettiLib(Object.assign({}, defaults, { 
            particleCount, 
            origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } 
        }));
    }, 250);
}

// js/utils.js - triggerVibration Güncellemesi

export function triggerVibration(pattern = 10) {
    // Tarayıcı desteği kontrolü
    if (window.navigator && window.navigator.vibrate) {
        // pattern: milisaniye cinsinden süre
        window.navigator.vibrate(pattern);
        console.log("📳 Titreşim Tetiklendi:", pattern); // Konsola basar
    } else {
        console.log("⚠️ Bu cihazda titreşim desteklenmiyor (veya iOS).");
    }
}
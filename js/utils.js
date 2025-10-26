// js/utils.js

// --- YENİ EKLENDİ: Dinamik Element Oluşturma Fonksiyonu ---
/**
 * Verilen seçeneklerle yeni bir HTML elemanı oluşturur.
 * @param {string} tag - Oluşturulacak elemanın etiketi (örn: 'div', 'button').
 * @param {object} options - Elemana uygulanacak özellikler.
 * @returns {HTMLElement} Oluşturulan HTML elemanı.
 */
export function createElement(tag, options = {}) {
    const el = document.createElement(tag);
    if (options.className) el.className = options.className;
    if (options.id) el.id = options.id;
    if (options.textContent) el.textContent = options.textContent;
    if (options.innerHTML) el.innerHTML = options.innerHTML;
    if (options.onclick) el.onclick = options.onclick;
    if (options.dataset) {
        for (const key in options.dataset) {
            el.dataset[key] = options.dataset[key];
        }
    }
    if (options.style) {
        for (const key in options.style) {
            el.style[key] = options.style[key];
        }
    }
    return el;
}

// --- SES EFEKTLERİ ---
const sounds = {
    click: new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 } }).toDestination(),
    error: new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 } }).toDestination(),
    win: new Tone.PolySynth(Tone.Synth).toDestination(),
    lose: new Tone.PolySynth(Tone.Synth).toDestination(),
    draw: new Tone.PolySynth(Tone.Synth).toDestination()
};

export function playSound(sound) {
    if (Tone.context.state !== 'running') {
        Tone.context.resume();
    }
    switch (sound) {
        case 'click': sounds.click.triggerAttackRelease('C5', '8n'); break;
        case 'error': sounds.error.triggerAttackRelease('C3', '8n'); break;
        case 'win': sounds.win.triggerAttackRelease(['C4', 'E4', 'G4', 'C5'], '8n', Tone.now()); break;
        case 'lose': sounds.lose.triggerAttackRelease(['C4', 'A3', 'F3', 'D3'], '8n', Tone.now()); break;
        case 'draw': sounds.draw.triggerAttackRelease(['C4', 'G4'], '8n', Tone.now()); break;
    }
}

// --- BİLDİRİM (TOAST) ---
const toast = document.getElementById('toast');
export function showToast(message, isError = false) {
    if (isError) playSound('error');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- FIREBASE HATA MESAJLARI ---
export function getFirebaseErrorMessage(error) {
    switch (error.code) {
        case 'auth/user-not-found': return 'Bu e-posta adresiyle bir kullanıcı bulunamadı.';
        case 'auth/wrong-password': return 'Hatalı şifre girdiniz.';
        case 'auth/invalid-email': return 'Geçersiz e-posta adresi formatı.';
        case 'auth/email-already-in-use': return 'Bu e-posta adresi zaten kayıtlı.';
        case 'auth/weak-password': return 'Şifre çok zayıf, en az 6 karakter olmalı.';
        default: return 'Bir hata oluştu: ' + error.message;
    }
}

// --- SATIR SALLAMA ANİMASYONU ---
export function shakeCurrentRow(wordLength, currentRow) {
    for (let i = 0; i < wordLength; i++) {
        const tile = document.getElementById(`tile-${currentRow}-${i}`);
        if (tile) {
            tile.classList.add('shake');
            tile.addEventListener('animationend', () => {
                tile.classList.remove('shake');
            }, { once: true });
        }
    }
}

// --- ORTAK İSTATİSTİK FONKSİYONU ---
export function getStatsFromProfile(profileData) {
    const defaultStats = { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, guessDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 } };
    
    if (!profileData || !profileData.stats) {
        return defaultStats;
    }

    const userStats = profileData.stats;
    if (!userStats.guessDistribution || typeof userStats.guessDistribution !== 'object') {
        userStats.guessDistribution = {};
    }
    for (let i = 1; i <= 6; i++) {
        const key = String(i);
        if (userStats.guessDistribution[key] === undefined || typeof userStats.guessDistribution[key] !== 'number') {
            userStats.guessDistribution[key] = 0;
        }
    }
    return { ...defaultStats, ...userStats };
}
// js/utils.js

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
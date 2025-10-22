// Bu dosya, projenin en son ve tam halidir. TÜM özellikleri ve YENİ DETAYLI PROFİL EKRANI mantığını içerir.

let kelimeSozlugu = {};

document.addEventListener('DOMContentLoaded', () => {
    // Ekranlar
    const loginScreen = document.getElementById('login-screen');
    const registerScreen = document.getElementById('register-screen');
    const modeSelectionScreen = document.getElementById('mode-selection-screen');
    const singleplayerSetupScreen = document.getElementById('singleplayer-setup-screen');
    const multiplayerSetupScreen = document.getElementById('multiplayer-setup-screen');
    const gameScreen = document.getElementById('game-screen');
    const scoreboardScreen = document.getElementById('scoreboard-screen');
    const profileScreen = document.getElementById('profile-screen');
    const howToPlayScreen = document.getElementById('how-to-play-screen');

    // Elementler
    const guessGrid = document.getElementById('guess-grid');
    const keyboardContainer = document.getElementById('keyboard');
    const toast = document.getElementById('toast');
    const turnDisplay = document.getElementById('turn-display');
    const timerDisplay = document.getElementById('timer-display');
    const createBtn = document.getElementById('create-game-btn');
    const joinBtn = document.getElementById('join-game-btn');
    const mainMenuBtn = document.getElementById('main-menu-btn');
    const newRoundBtn = document.getElementById('new-round-btn');
    const leaveGameBtn = document.getElementById('leave-game-button');
    const gameIdDisplay = document.getElementById('game-id-display');
    const copyGameIdBtn = document.getElementById('copy-game-id-btn');
    const shareGameBtn = document.getElementById('share-game-btn');
    const startGameBtn = document.getElementById('start-game-btn');
    const roundCounter = document.getElementById('round-counter');
    const profileBtn = document.getElementById('profile-btn');
    const closeProfileBtn = document.getElementById('close-profile-btn');
    const howToPlayBtn = document.getElementById('how-to-play-btn');
    const closeHowToPlayBtn = document.getElementById('close-how-to-play-btn');
    const shareResultsBtn = document.getElementById('share-results-btn');
    const dailyWordBtn = document.getElementById('daily-word-btn');
    const hardModeCheckbox = document.getElementById('hard-mode-checkbox');
    const hardModeCheckboxMulti = document.getElementById('hard-mode-checkbox-multi');

    // Auth Elementleri
    const emailInput = document.getElementById('email-input');
    const passwordInput = document.getElementById('password-input');
    const loginBtn = document.getElementById('login-btn');
    const goToRegisterBtn = document.getElementById('go-to-register-btn');
    const backToLoginBtn = document.getElementById('back-to-login-btn');
    const registerBtn = document.getElementById('register-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userDisplay = document.getElementById('user-display');
    const authLoading = document.getElementById('auth-loading');
    const registerFullname = document.getElementById('register-fullname');
    const registerUsername = document.getElementById('register-username');
    const registerEmail = document.getElementById('register-email');
    const registerPassword = document.getElementById('register-password');
    const registerAge = document.getElementById('register-age');
    const registerCity = document.getElementById('register-city');


    let db, auth, userId, currentUserProfile = null, currentGameId = null, gameUnsubscribe = null, turnTimerInterval = null, localGameData = null, gameMode = null;
    let currentRow = 0, isMyTurn = false, isGameOver = false, wordLength = 5, timeLimit = 45;
    let singlePlayerMode = null;
    let gameIdFromUrl = null;

    const scorePoints = [1000, 800, 600, 400, 200, 100];
    const GUESS_COUNT = 6;
    const DAILY_WORD_LENGTH = 5;

    const firebaseConfig = {
        apiKey: "AIzaSyA5FcmgM9GV79qGwS8MC3_4yCvwvHZO0iQ",
        authDomain: "kelime-oyunu-flaneur.firebaseapp.com",
        projectId: "kelime-oyunu-flaneur",
        storageBucket: "kelime-oyunu-flaneur.appspot.com",
        messagingSenderId: "888546992121",
        appId: "1:888546992121:web:3e29748729cca6fbbb2728",
        measurementId: "G-RVD6YZ8JYV"
    };

    const sounds = { click: new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 } }).toDestination(), error: new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 } }).toDestination(), win: new Tone.PolySynth(Tone.Synth).toDestination(), lose: new Tone.PolySynth(Tone.Synth).toDestination(), draw: new Tone.PolySynth(Tone.Synth).toDestination() };
    function playSound(sound) { if (Tone.context.state !== 'running') { Tone.context.resume(); } switch (sound) { case 'click': sounds.click.triggerAttackRelease('C5', '8n'); break; case 'error': sounds.error.triggerAttackRelease('C3', '8n'); break; case 'win': sounds.win.triggerAttackRelease(['C4', 'E4', 'G4', 'C5'], '8n', Tone.now()); break; case 'lose': sounds.lose.triggerAttackRelease(['C4', 'A3', 'F3', 'D3'], '8n', Tone.now()); break; case 'draw': sounds.draw.triggerAttackRelease(['C4', 'G4'], '8n', Tone.now()); break; } }
    
    function showToast(message, isError = false) { if (isError) playSound('error'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }
    
    // --- AUTH FONKSİYONLARI ---
    const handleLogin = async () => {
        const email = emailInput.value;
        const password = passwordInput.value;
        if (!email || !password) { return showToast("E-posta ve şifre alanları boş bırakılamaz.", true); }
        authLoading.classList.remove('hidden');
        try { await auth.signInWithEmailAndPassword(email, password); }
        catch (error) { showToast(getFirebaseErrorMessage(error), true); }
        authLoading.classList.add('hidden');
    };

    const handleRegister = async () => {
        const email = registerEmail.value;
        const password = registerPassword.value;
        const fullname = registerFullname.value;
        const username = registerUsername.value;
        const age = registerAge.value;
        const city = registerCity.value;

        if (!email || !password || !fullname || !username || !age || !city) { return showToast("Tüm alanları doldurmalısınız.", true); }
        if (password.length < 6) { return showToast("Şifre en az 6 karakter olmalıdır.", true); }
        authLoading.classList.remove('hidden');

        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            await db.collection('users').doc(user.uid).set({
                username: username,
                fullname: fullname,
                age: parseInt(age),
                city: city,
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            showToast(getFirebaseErrorMessage(error), true);
        }
        authLoading.classList.add('hidden');
    };

    const handleLogout = async () => {
        try { await auth.signOut(); }
        catch (error) { showToast(getFirebaseErrorMessage(error), true); }
    };

    function getFirebaseErrorMessage(error) {
        switch (error.code) {
            case 'auth/user-not-found': return 'Bu e-posta adresiyle bir kullanıcı bulunamadı.';
            case 'auth/wrong-password': return 'Hatalı şifre girdiniz.';
            case 'auth/invalid-email': return 'Geçersiz e-posta adresi formatı.';
            case 'auth/email-already-in-use': return 'Bu e-posta adresi zaten kayıtlı.';
            case 'auth/weak-password': return 'Şifre çok zayıf, en az 6 karakter olmalı.';
            default: return 'Bir hata oluştu: ' + error.message;
        }
    }

    // Diğer tüm fonksiyonlar...
    function getDaysSinceEpoch() { const today = new Date(); const epoch = new Date('2024-01-01'); return Math.floor((today - epoch) / (1000 * 60 * 60 * 24)); }
    function getWordOfTheDay() { const dayIndex = getDaysSinceEpoch(); const wordList = kelimeSozlugu[DAILY_WORD_LENGTH]; return wordList[dayIndex % wordList.length]; }
    function getDailyGameState() { const state = localStorage.getItem(`dailyGameState_${userId}`); if (!state) return null; try { const parsedState = JSON.parse(state); const today = new Date().toDateString(); if (parsedState.date === today) { return parsedState; } return null; } catch (e) { return null; } }
    function saveDailyGameState(gameState) { const state = { date: new Date().toDateString(), guesses: gameState.players[userId].guesses, status: gameState.status, secretWord: gameState.secretWord }; localStorage.setItem(`dailyGameState_${userId}`, JSON.stringify(state)); }
    function startDailyGame() {
        gameMode = 'daily'; const username = getUsername(); const secretWord = getWordOfTheDay(); wordLength = DAILY_WORD_LENGTH; const savedState = getDailyGameState(); let guesses = []; let status = 'playing'; if (savedState) { guesses = savedState.guesses; status = savedState.status; }
        localGameData = { wordLength, secretWord, timeLimit: 999, isHardMode: true, players: { [userId]: { username, guesses, score: 0 } }, currentPlayerId: userId, status, };
        if (status === 'finished') { showScoreboard(localGameData); } else { showScreen('game-screen'); initializeGameUI(localGameData); renderGameState(localGameData); }
    }
    function shareResultsAsEmoji() {
        if (!localGameData) return; const allGuesses = (gameMode === 'daily') ? localGameData.players[userId].guesses : Object.values(localGameData.players).flatMap(p => p.guesses); const guessCount = localGameData.roundWinner ? allGuesses.length : 'X';
        const title = (gameMode === 'daily') ? `Günün Kelimesi #${getDaysSinceEpoch()} ${guessCount}/${GUESS_COUNT}` : `Kelime Yarışması Tur ${localGameData.currentRound} ${guessCount}/${GUESS_COUNT}`;
        const emojiMap = { correct: '🟩', present: '🟨', absent: '⬛', failed: '🟥' };
        let emojiGrid = allGuesses.map(guess => { return guess.colors.map(color => emojiMap[color] || '⬛').join(''); }).join('\n');
        const shareText = `${title}\n\n${emojiGrid}`;
        navigator.clipboard.writeText(shareText).then(() => { showToast('Sonuç panoya kopyalandı!'); }).catch(err => { console.error('Kopyalama başarısız: ', err); showToast('Kopyalama başarısız oldu!', true); });
    }
    function shakeCurrentRow() { for (let i = 0; i < wordLength; i++) { const tile = document.getElementById(`tile-${currentRow}-${i}`); if (tile) { tile.classList.add('shake'); tile.addEventListener('animationend', () => { tile.classList.remove('shake'); }, { once: true }); } } }
    function getStats() { const defaultStats = { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, guessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } }; try { const stats = JSON.parse(localStorage.getItem(`gameStats_${userId}`)); return stats ? { ...defaultStats, ...stats } : defaultStats; } catch (e) { return defaultStats; } }
    function saveStats(stats) { localStorage.setItem(`gameStats_${userId}`, JSON.stringify(stats)); }
    function updateStats(didWin, guessCount) {
        if (gameMode === 'multiplayer') return;
        const stats = getStats(); stats.played += 1;
        if (didWin) { stats.wins += 1; stats.currentStreak += 1; if (stats.currentStreak > stats.maxStreak) { stats.maxStreak = stats.currentStreak; } if (guessCount >= 1 && guessCount <= 6) { stats.guessDistribution[guessCount] += 1; } } else { stats.currentStreak = 0; }
        saveStats(stats);
    }
    function displayStats() {
        const stats = getStats(); document.getElementById('stats-played').textContent = stats.played; const winPercentage = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
        document.getElementById('stats-win-percentage').textContent = winPercentage; document.getElementById('stats-current-streak').textContent = stats.currentStreak; document.getElementById('stats-max-streak').textContent = stats.maxStreak;
        const distributionContainer = document.getElementById('stats-guess-distribution'); distributionContainer.innerHTML = ''; let maxDistribution = Math.max(...Object.values(stats.guessDistribution)); if (maxDistribution === 0) maxDistribution = 1;
        for (let i = 1; i <= 6; i++) { const count = stats.guessDistribution[i]; const percentage = (count / maxDistribution) * 100; const bar = `<div class="flex items-center"><div class="w-4">${i}</div><div class="flex-grow bg-gray-700 rounded"><div class="bg-amber-500 text-right pr-2 rounded text-black font-bold" style="width: ${percentage > 0 ? percentage : 1}%">${count > 0 ? count : ''}</div></div></div>`; distributionContainer.innerHTML += bar; }
    }
    function getUsername() { return currentUserProfile?.username || 'Oyuncu'; }
    function showScreen(screenId) { ['login-screen', 'register-screen', 'mode-selection-screen', 'singleplayer-setup-screen', 'multiplayer-setup-screen', 'game-screen', 'scoreboard-screen', 'profile-screen', 'how-to-play-screen'].forEach(id => { document.getElementById(id).classList.add('hidden'); }); document.getElementById(screenId).classList.remove('hidden'); }
    function initializeGameUI(gameData) { wordLength = gameData.wordLength; if (wordLength === 4) { guessGrid.style.maxWidth = '220px'; } else if (wordLength === 5) { guessGrid.style.maxWidth = '280px'; } else { guessGrid.style.maxWidth = '320px'; } createGrid(); createKeyboard(); }
    function setupAndStartGame(mode) {
        gameMode = mode;
        wordLength = parseInt(document.getElementById('word-length-select-single').value);
        timeLimit = parseInt(document.getElementById('time-select-single').value);
        const isHard = hardModeCheckbox.checked;
        const username = getUsername();
        const secretWord = kelimeSozlugu[wordLength][Math.floor(Math.random() * kelimeSozlugu[wordLength].length)];
        localGameData = { wordLength, secretWord, timeLimit, isHardMode: isHard, currentRound: 1, matchLength: 1, players: { [userId]: { username, guesses: [], score: 0 } }, currentPlayerId: userId, status: 'playing', turnStartTime: new Date() };
        if (gameMode === 'vsCPU') { localGameData.players['cpu'] = { username: 'Bilgisayar', guesses: [], score: 0 }; }
        showScreen('game-screen');
        initializeGameUI(localGameData);
        renderGameState(localGameData);
    }
    async function createGame() {
        if (!db || !auth || !userId) return showToast("Sunucuya bağlanılamıyor.", true);
        gameMode = 'multiplayer';
        const username = getUsername();
        const selectedLength = parseInt(document.getElementById('word-length-select-multi').value);
        const selectedTime = parseInt(document.getElementById('time-select-multi').value);
        const selectedMatchLength = parseInt(document.getElementById('match-length-select').value);
        const isHard = hardModeCheckboxMulti.checked;
        const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const secretWord = kelimeSozlugu[selectedLength][Math.floor(Math.random() * kelimeSozlugu[selectedLength].length)];
        const gameData = {
            gameId, wordLength: selectedLength, secretWord, timeLimit: selectedTime, creatorId: userId,
            isHardMode: isHard, matchLength: selectedMatchLength, currentRound: 1,
            players: { [userId]: { username, guesses: [], score: 0 } },
            currentPlayerId: userId, status: 'waiting', roundWinner: null, createdAt: new Date(),
            turnStartTime: firebase.firestore.FieldValue.serverTimestamp(),
            firstFailurePlayerId: null
        };
        try { await db.collection("games").doc(gameId).set(gameData); await joinGame(gameId); }
        catch (error) { console.error("Error creating game:", error); showToast("Oyun oluşturulamadı!", true); }
    }
    async function joinGame(gameId) {
        if (!db || !auth || !userId) return showToast("Sunucuya bağlanılamıyor.", true);
        if (!gameId) return showToast("Lütfen bir Oyun ID'si girin.", true);
        gameMode = 'multiplayer';
        const username = getUsername();
        const gameRef = db.collection("games").doc(gameId);
        try {
            const gameDoc = await gameRef.get();
            if (!gameDoc.exists) { localStorage.removeItem('activeGameId'); return showToast("Oyun bulunamadı!", true); }
            const gameData = gameDoc.data();
            if (Object.keys(gameData.players).length === 1 && !gameData.players[userId]) { await gameRef.update({ [`players.${userId}`]: { username, guesses: [], score: 0 } }); }
            else if (!gameData.players[userId]) { return showToast("Bu oyun dolu veya başlamış.", true); }
            localStorage.setItem('activeGameId', gameId);
            currentGameId = gameId;
            showScreen('game-screen');
            initializeGameUI(gameData);
            listenToGameUpdates(gameId);
        } catch (error) { console.error("Error joining game:", error); showToast("Oyuna katılırken hata oluştu.", true); }
    }
    function listenToGameUpdates(gameId) {
        if (gameUnsubscribe) gameUnsubscribe();
        const gameRef = db.collection("games").doc(gameId);
        gameUnsubscribe = gameRef.onSnapshot((doc) => {
            const gameData = doc.data();
            if (!gameData) { showToast("Oyun sonlandırıldı."); leaveGame(); return; }
            const oldGameData = localGameData;
            localGameData = gameData;
            const oldGuessesCount = oldGameData ? Object.values(oldGameData.players).flatMap(p => p.guesses).length : 0;
            const newGuessesCount = Object.values(gameData.players).flatMap(p => p.guesses).length;
            if (gameData.status === 'finished') {
                renderGameState(gameData, oldGuessesCount < newGuessesCount).then(() => {
                    setTimeout(() => showScoreboard(gameData), wordLength * 300 + 500);
                });
            } else {
                renderGameState(gameData, oldGuessesCount < newGuessesCount);
            }
        });
    }
    function leaveGame() { if (gameUnsubscribe) gameUnsubscribe(); stopTurnTimer(); localStorage.removeItem('activeGameId'); gameUnsubscribe = null; currentGameId = null; localGameData = null; gameMode = null; showScreen('mode-selection-screen'); document.getElementById('rejoin-game-btn').classList.add('hidden'); }
    async function renderGameState(gameData, animateLastRow = false) {
        if (gameMode === 'daily') { document.getElementById('game-id-display').textContent = 'Günün Kelimesi'; document.getElementById('game-info-bar').style.display = 'none'; roundCounter.textContent = new Date().toLocaleDateString('tr-TR'); }
        else { document.getElementById('game-id-display').textContent = gameMode === 'multiplayer' ? gameData.gameId : 'Tek Kişilik'; document.getElementById('game-info-bar').style.display = gameMode === 'multiplayer' ? 'flex' : 'none'; if (gameMode === 'multiplayer') { roundCounter.textContent = `Tur ${gameData.currentRound}/${gameData.matchLength}`; } else { roundCounter.textContent = ''; } }
        timeLimit = gameData.timeLimit || 45; isMyTurn = gameData.currentPlayerId === userId && gameData.status === 'playing'; isGameOver = gameData.status === 'finished'; updateTurnDisplay(gameData); updateScores(gameData); const allGuesses = Object.values(gameData.players).flatMap(p => p.guesses);
        for (let i = 0; i < allGuesses.length; i++) { const isLastRow = i === allGuesses.length - 1; await renderGuess(i, allGuesses[i].word, allGuesses[i].colors, animateLastRow && isLastRow); }
        for (let i = allGuesses.length; i < GUESS_COUNT; i++) { for (let j = 0; j < wordLength; j++) { const tile = document.getElementById(`tile-${i}-${j}`); if (tile) { tile.querySelector('.front').textContent = ''; tile.querySelector('.back').textContent = ''; tile.classList.remove('flip', 'correct', 'present', 'absent', 'failed', 'shake'); } } }
        currentRow = allGuesses.length; updateKeyboard(gameData); if (gameData.status === 'playing' && gameMode !== 'daily') { startTurnTimer(); } else { stopTurnTimer(); }
    }
    function updateScores(gameData) {
        if (gameMode === 'daily') { document.getElementById('player1-score').innerHTML = ''; document.getElementById('player2-score').innerHTML = ''; return; }
        const playerIds = Object.keys(gameData.players); const p1ScoreEl = document.getElementById('player1-score'); const p2ScoreEl = document.getElementById('player2-score'); let p1Id = (gameMode !== 'multiplayer') ? userId : (gameData.creatorId || playerIds[0]); if (playerIds.length > 0) { const p1 = gameData.players[p1Id]; if(p1) p1ScoreEl.innerHTML = `<span class="font-bold">${p1.username}</span><br>${p1.score} Puan`; }
        if (playerIds.length > 1) { const p2Id = playerIds.find(id => id !== p1Id); const p2 = gameData.players[p2Id]; if(p2) p2ScoreEl.innerHTML = `<span class="font-bold">${p2.username}</span><br>${p2.score} Puan`; } else { p2ScoreEl.innerHTML = ''; }
    }
    function updateTurnDisplay(gameData) {
        if (gameMode === 'daily') { timerDisplay.textContent = ''; turnDisplay.textContent = 'Günün Kelimesi'; return; }
        const numPlayers = Object.keys(gameData.players).length; shareGameBtn.classList.add('hidden'); if (gameData.status === 'waiting') { stopTurnTimer(); if (numPlayers < 2) { turnDisplay.textContent = "Rakip bekleniyor..."; startGameBtn.classList.add('hidden'); shareGameBtn.classList.remove('hidden'); } else { if (userId === gameData.creatorId) { turnDisplay.textContent = "Rakip katıldı!"; startGameBtn.classList.remove('hidden'); } else { turnDisplay.textContent = "Başlatılıyor..."; startGameBtn.classList.add('hidden'); } } }
        else if (gameData.status === 'playing') { startGameBtn.classList.add('hidden'); const currentPlayerUsername = gameData.players[gameData.currentPlayerId]?.username; if (isMyTurn) { turnDisplay.textContent = "Sıra Sende!"; turnDisplay.classList.add('pulsate'); } else { turnDisplay.textContent = `Sıra: ${currentPlayerUsername}`; turnDisplay.classList.remove('pulsate'); } }
    }
    function createGrid() { guessGrid.innerHTML = ''; guessGrid.style.gridTemplateColumns = `repeat(${wordLength}, 1fr)`; for (let i = 0; i < GUESS_COUNT; i++) { for (let j = 0; j < wordLength; j++) { const tile = document.createElement('div'); tile.classList.add('tile'); tile.id = `tile-${i}-${j}`; const tileInnerFront = document.createElement('div'); tileInnerFront.classList.add('tile-inner', 'front'); const tileInnerBack = document.createElement('div'); tileInnerBack.classList.add('tile-inner', 'back'); tile.appendChild(tileInnerFront); tile.appendChild(tileInnerBack); guessGrid.appendChild(tile); } } }
    async function renderGuess(rowIndex, word, colors, animate = false) { return new Promise(async (resolve) => { for (let i = 0; i < wordLength; i++) { const tile = document.getElementById(`tile-${rowIndex}-${i}`); if (tile) { const front = tile.querySelector('.front'); const back = tile.querySelector('.back'); front.textContent = word[i]; back.textContent = word[i]; tile.classList.remove('correct', 'present', 'absent', 'failed'); if (animate) { await new Promise(res => setTimeout(res, i * 250)); tile.classList.add(colors[i]); tile.classList.add('flip'); } else { tile.classList.add(colors[i]); tile.classList.add('flip'); } } } resolve(); }); }
    function createKeyboard() { keyboardContainer.innerHTML = ''; const keyRows = [['E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'], ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'], ['Z', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç'], ['⌫', 'ENTER']]; keyRows.forEach((row, rowIndex) => { const rowDiv = document.createElement('div'); rowDiv.classList.add('flex', 'justify-center', 'gap-1', 'my-1', 'w-full'); if (rowIndex === 3) { rowDiv.classList.add('gap-2'); } row.forEach(key => { const keyButton = document.createElement('button'); keyButton.dataset.key = key; if (key === '⌫') { keyButton.innerHTML = `<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" /></svg>`; } else if (key === 'ENTER') { keyButton.innerHTML = `<svg class="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4l10 6-10 6V4z"/></svg>`; } else { keyButton.textContent = key; } keyButton.classList.add('keyboard-key', 'rounded', 'font-semibold', 'uppercase', 'bg-gray-500'); if (rowIndex === 3) { keyButton.style.flex = '6'; keyButton.classList.add('bg-gray-600'); } else { keyButton.style.flex = '1'; } keyButton.onclick = () => handleKeyPress(key); rowDiv.appendChild(keyButton); }); keyboardContainer.appendChild(rowDiv); }); }
    function updateKeyboard(gameData) { const allGuesses = Object.values(gameData.players).flatMap(p => p.guesses); const keyStates = {}; allGuesses.forEach(({ word, colors }) => { for (let i = 0; i < word.length; i++) { const letter = word[i]; const color = colors[i]; if (keyStates[letter] === 'correct') continue; if (keyStates[letter] === 'present' && color !== 'correct') continue; keyStates[letter] = color; } }); document.querySelectorAll('.keyboard-key').forEach(btn => { const keyId = btn.dataset.key; if (keyId === 'ENTER' || keyId === '⌫') return; const state = keyStates[keyId]; btn.classList.remove('correct', 'present', 'absent'); if (state) btn.classList.add(state); }); }
    function startTurnTimer() { if (gameMode === 'daily') return; stopTurnTimer(); if (isGameOver) return; let turnStartTime = (gameMode === 'multiplayer' && localGameData.turnStartTime?.toDate) ? localGameData.turnStartTime.toDate() : new Date(); turnTimerInterval = setInterval(async () => { let now = new Date(); let elapsed = Math.floor((now - turnStartTime) / 1000); let timeLeft = timeLimit - elapsed; if (timerDisplay) { if (isMyTurn) { timerDisplay.textContent = timeLeft > 0 ? timeLeft : 0; if (timeLeft <= 5) timerDisplay.classList.add('text-red-500'); else timerDisplay.classList.remove('text-red-500'); } else { timerDisplay.textContent = timeLeft > 0 ? timeLeft : 0; timerDisplay.classList.remove('text-red-500'); } } if (timeLeft <= 0 && isMyTurn) { stopTurnTimer(); await failTurn(''); } }, 1000); }
    function stopTurnTimer() { clearInterval(turnTimerInterval); turnTimerInterval = null; if (timerDisplay) timerDisplay.textContent = ''; }
    async function failTurn(guessWord = '') {
        if (!isMyTurn) return;
        stopTurnTimer(); shakeCurrentRow(); keyboardContainer.style.pointerEvents = 'none';
        const newGuess = { word: guessWord.padEnd(wordLength, ' '), colors: Array(wordLength).fill('failed') };
        const totalGuessesMade = Object.values(localGameData.players).reduce((acc, p) => acc + p.guesses.length, 0) + 1;
        const firstFailurePlayerId = localGameData.firstFailurePlayerId || null;
        if (gameMode === 'multiplayer' && firstFailurePlayerId !== null && firstFailurePlayerId !== userId) { const gameRef = db.collection("games").doc(currentGameId); const playerGuesses = localGameData.players[userId].guesses || []; playerGuesses.push(newGuess); const updates = { [`players.${userId}.guesses`]: playerGuesses, status: 'finished', roundWinner: null, firstFailurePlayerId: userId }; await gameRef.update(updates).finally(() => { keyboardContainer.style.pointerEvents = 'auto'; }); return; }
        if (gameMode === 'multiplayer') { const gameRef = db.collection("games").doc(currentGameId); const playerGuesses = localGameData.players[userId].guesses || []; playerGuesses.push(newGuess); const playerIds = Object.keys(localGameData.players); const myIndex = playerIds.indexOf(userId); const nextPlayerIndex = (myIndex + 1) % playerIds.length; const updates = { [`players.${userId}.guesses`]: playerGuesses, currentPlayerId: playerIds[nextPlayerIndex], turnStartTime: firebase.firestore.FieldValue.serverTimestamp(), firstFailurePlayerId: userId }; if (totalGuessesMade >= GUESS_COUNT) { updates.status = 'finished'; updates.roundWinner = null; } await gameRef.update(updates).finally(() => { keyboardContainer.style.pointerEvents = 'auto'; });
        } else { localGameData.players[userId].guesses.push(newGuess); if (totalGuessesMade >= GUESS_COUNT) { localGameData.status = 'finished'; localGameData.roundWinner = null; } else { if (gameMode === 'vsCPU') { localGameData.currentPlayerId = 'cpu'; } }
            const didWin = localGameData.roundWinner === userId; if (localGameData.status === 'finished') { if(gameMode !== 'multiplayer') updateStats(didWin, 0); if (gameMode === 'daily') saveDailyGameState(localGameData); }
            renderGameState(localGameData, true).then(() => { if (localGameData.status === 'finished') { setTimeout(() => showScoreboard(localGameData), wordLength * 300); } else if (gameMode === 'vsCPU') { setTimeout(cpuTurn, 1500 + wordLength * 250); } });
            keyboardContainer.style.pointerEvents = 'auto';
        }
    }
    function handleKeyPress(key) { if (isGameOver || !isMyTurn) return; const processedKey = key.toLocaleUpperCase('tr-TR'); if (processedKey === 'ENTER') { playSound('click'); submitGuess(); } else if (processedKey === '⌫' || processedKey === 'BACKSPACE') { playSound('click'); deleteLetter(); } else if (processedKey.length === 1 && "ERTYUIOPĞÜASDFGHJKLŞİZC VBNMÖÇ".includes(processedKey)) { addLetter(processedKey); } }
    function addLetter(letter) { if (currentRow >= GUESS_COUNT) return; for (let i = 0; i < wordLength; i++) { const tile = document.getElementById(`tile-${currentRow}-${i}`); if (tile && tile.querySelector('.front').textContent === '') { tile.querySelector('.front').textContent = letter; playSound('click'); break; } } }
    function deleteLetter() { if (currentRow >= GUESS_COUNT) return; for (let i = wordLength - 1; i >= 0; i--) { const tile = document.getElementById(`tile-${currentRow}-${i}`); if (tile && tile.querySelector('.front').textContent !== '') { tile.querySelector('.front').textContent = ''; break; } } }
    async function submitGuess() {
        if (!isMyTurn || currentRow >= GUESS_COUNT) return;
        let guessWord = '';
        for (let i = 0; i < wordLength; i++) { const tile = document.getElementById(`tile-${currentRow}-${i}`); const tileInner = tile.querySelector('.front'); if (!tileInner || tileInner.textContent === '') { showToast("Kelime yeterince uzun değil!", true); shakeCurrentRow(); return; } guessWord += tileInner.textContent; }
        if (localGameData.isHardMode && localGameData.players[userId].guesses.length > 0) {
            const allPlayerGuesses = localGameData.players[userId].guesses;
            const presentLetters = new Set();
            const correctLetters = {};
            allPlayerGuesses.forEach(g => {
                for (let i = 0; i < g.colors.length; i++) {
                    if (g.colors[i] === 'correct') { correctLetters[i] = g.word[i]; } 
                    else if (g.colors[i] === 'present') { presentLetters.add(g.word[i]); }
                }
            });
            for (const index in correctLetters) { if (guessWord[index] !== correctLetters[index]) { showToast(`'${correctLetters[index]}' harfi ${parseInt(index) + 1}. sırada olmalı!`, true); shakeCurrentRow(); return; } }
            for (const letter of presentLetters) { if (!guessWord.includes(letter)) { showToast(`'${letter}' harfini kullanmalısın!`, true); shakeCurrentRow(); return; } }
        }
        if (!kelimeSozlugu[wordLength] || !kelimeSozlugu[wordLength].includes(guessWord)) { showToast("Kelime sözlükte bulunamadı!", true); shakeCurrentRow(); return; }
        keyboardContainer.style.pointerEvents = 'none'; stopTurnTimer();
        const secretWord = localGameData.secretWord; const colors = calculateColors(guessWord, secretWord); const newGuess = { word: guessWord, colors: colors }; const totalGuessesMade = Object.values(localGameData.players).reduce((acc, p) => acc + p.guesses.length, 0) + 1;
        if (gameMode === 'multiplayer') { const gameRef = db.collection("games").doc(currentGameId); const playerGuesses = localGameData.players[userId].guesses || []; playerGuesses.push(newGuess); const playerIds = Object.keys(localGameData.players); const myIndex = playerIds.indexOf(userId); const nextPlayerIndex = (myIndex + 1) % playerIds.length; const updates = { [`players.${userId}.guesses`]: playerGuesses, currentPlayerId: playerIds[nextPlayerIndex], turnStartTime: firebase.firestore.FieldValue.serverTimestamp() }; if (guessWord === secretWord) { updates.status = 'finished'; updates.roundWinner = userId; const scoreToAdd = scorePoints[playerGuesses.length - 1] || 0; updates[`players.${userId}.score`] = (localGameData.players[userId].score || 0) + scoreToAdd; } else if (totalGuessesMade >= GUESS_COUNT) { updates.status = 'finished'; updates.roundWinner = null; } await gameRef.update(updates).finally(() => { keyboardContainer.style.pointerEvents = 'auto'; });
        } else {
            localGameData.players[userId].guesses.push(newGuess);
            if (guessWord === secretWord) { localGameData.status = 'finished'; localGameData.roundWinner = userId; if(gameMode !== 'daily') { const scoreToAdd = scorePoints[localGameData.players[userId].guesses.length - 1] || 0; localGameData.players[userId].score += scoreToAdd; } }
            else { if (totalGuessesMade >= GUESS_COUNT) { localGameData.status = 'finished'; localGameData.roundWinner = null; } else { if (gameMode === 'vsCPU') { localGameData.currentPlayerId = 'cpu'; } } }
            const didWin = localGameData.roundWinner === userId; const guessCount = didWin ? localGameData.players[userId].guesses.length : 0; if (localGameData.status === 'finished') { if (gameMode !== 'multiplayer') updateStats(didWin, guessCount); if (gameMode === 'daily') saveDailyGameState(localGameData); }
            renderGameState(localGameData, true).then(() => { if (localGameData.status === 'finished') { setTimeout(() => showScoreboard(localGameData), wordLength * 300); } else if (gameMode === 'vsCPU') { setTimeout(cpuTurn, 1500 + wordLength * 250); } });
            keyboardContainer.style.pointerEvents = 'auto';
        }
    }
    function cpuTurn() { if (isGameOver || !localGameData || localGameData.currentPlayerId !== 'cpu') return; keyboardContainer.style.pointerEvents = 'none'; setTimeout(() => { const allGuesses = Object.values(localGameData.players).flatMap(p => p.guesses); const correctLetters = {}; const presentLetters = {}; const absentLetters = new Set(); allGuesses.forEach(guess => { for (let i = 0; i < guess.word.length; i++) { const letter = guess.word[i]; const color = guess.colors[i]; if (color === 'correct') { correctLetters[letter] = i; } else if (color === 'present') { if (!presentLetters[letter]) presentLetters[letter] = []; if (!presentLetters[letter].includes(i)) presentLetters[letter].push(i); } else if (color === 'absent' && !correctLetters[letter] && !presentLetters[letter]) { absentLetters.add(letter); } } }); let possibleWords = kelimeSozlugu[wordLength].filter(word => { for (const letter of absentLetters) { if (word.includes(letter)) return false; } for (const letter in correctLetters) { if (word[correctLetters[letter]] !== letter) return false; } for (const letter in presentLetters) { if (!word.includes(letter)) return false; for (const pos of presentLetters[letter]) { if (word[pos] === letter) return false; } } return true; }); if (possibleWords.length === 0) { possibleWords = kelimeSozlugu[wordLength]; } const guessWord = possibleWords[Math.floor(Math.random() * possibleWords.length)]; const secretWord = localGameData.secretWord; const colors = calculateColors(guessWord, secretWord); const newGuess = { word: guessWord, colors: colors }; localGameData.players['cpu'].guesses.push(newGuess); const totalGuessesMade = Object.values(localGameData.players).reduce((acc, p) => acc + p.guesses.length, 0); if (guessWord === secretWord) { localGameData.status = 'finished'; localGameData.roundWinner = 'cpu'; const scoreToAdd = scorePoints[localGameData.players['cpu'].guesses.length - 1] || 0; localGameData.players['cpu'].score += scoreToAdd; updateStats(false, 0); } else { if (totalGuessesMade >= GUESS_COUNT) { localGameData.status = 'finished'; localGameData.roundWinner = null; updateStats(false, 0); } else { localGameData.currentPlayerId = userId; } } renderGameState(localGameData, true).then(() => { if (localGameData.status === 'finished') { setTimeout(() => showScoreboard(localGameData), wordLength * 300); } }); keyboardContainer.style.pointerEvents = 'auto'; }, 1000 + Math.random() * 500); }
    async function showScoreboard(gameData) { stopTurnTimer(); showScreen('scoreboard-screen'); const roundWinnerDisplay = document.getElementById('round-winner-display'); const correctWordDisplay = document.getElementById('correct-word-display'); const finalScores = document.getElementById('final-scores'); const matchWinnerDisplay = document.getElementById('match-winner-display'); const meaningDisplay = document.getElementById('word-meaning-display'); finalScores.style.display = gameMode === 'daily' ? 'none' : 'block'; matchWinnerDisplay.style.display = gameMode === 'daily' ? 'none' : 'block'; if (gameMode === 'daily') { if (gameData.roundWinner === userId) playSound('win'); else playSound('lose'); } else if (gameMode !== 'multiplayer') { if (gameData.roundWinner === userId) playSound('win'); else playSound('lose'); } else { if (gameData.roundWinner === userId) playSound('win'); else if (gameData.roundWinner === null) playSound('draw'); else playSound('lose'); } correctWordDisplay.textContent = gameData.secretWord; meaningDisplay.textContent = 'Anlam yükleniyor...'; const meaning = await fetchWordMeaning(gameData.secretWord); meaningDisplay.textContent = meaning; if (gameData.roundWinner && gameData.players[gameData.roundWinner]) { const winnerName = gameData.players[gameData.roundWinner].username; roundWinnerDisplay.textContent = (gameMode === 'daily') ? 'Tebrikler!' : `${winnerName} Turu Kazandı!`; } else { roundWinnerDisplay.textContent = (gameMode === 'daily') ? 'Başaramadın!' : "Berabere!"; } finalScores.innerHTML = `<h3 class="text-xl font-bold mb-2 text-center">${gameMode === 'multiplayer' ? 'Toplam Puan' : 'Puan'}</h3>`; const sortedPlayers = Object.entries(gameData.players).map(([id, data]) => ({ ...data, id })).sort((a, b) => b.score - a.score); sortedPlayers.forEach(player => { const scoreEl = document.createElement('p'); scoreEl.className = 'text-lg'; scoreEl.textContent = `${player.username}: ${player.score} Puan`; finalScores.appendChild(scoreEl); }); matchWinnerDisplay.textContent = ''; newRoundBtn.textContent = (gameMode === 'multiplayer') ? 'Yeni Tur' : 'Yeni Oyun'; newRoundBtn.classList.add('hidden'); if(gameMode === 'daily') { newRoundBtn.classList.add('hidden'); } else if (gameMode === 'multiplayer') { if (gameData.currentRound >= gameData.matchLength) { localStorage.removeItem('activeGameId'); const p1 = sortedPlayers[0]; const p2 = sortedPlayers.length > 1 ? sortedPlayers[1] : { score: -1 }; if (p1.score > p2.score) { matchWinnerDisplay.textContent = `MAÇI ${p1.username} KAZANDI!`; } else if (p2.score > p1.score) { matchWinnerDisplay.textContent = `MAÇI ${p2.username} KAZANDI!`; } else { matchWinnerDisplay.textContent = 'MAÇ BERABERE!'; } } else if (userId === gameData.creatorId) { newRoundBtn.classList.remove('hidden'); } } else { newRoundBtn.classList.remove('hidden'); } }
    async function startNewRound() { if (gameMode === 'multiplayer') { if (!localGameData) return; const newWordList = kelimeSozlugu[localGameData.wordLength]; const newSecretWord = newWordList[Math.floor(Math.random() * newWordList.length)]; const playerIds = Object.keys(localGameData.players); const newPlayersState = {}; playerIds.forEach(pid => { newPlayersState[pid] = { ...localGameData.players[pid], guesses: [] }; }); const updates = { secretWord: newSecretWord, players: newPlayersState, currentPlayerId: localGameData.creatorId, status: 'playing', roundWinner: null, currentRound: localGameData.currentRound + 1, turnStartTime: firebase.firestore.FieldValue.serverTimestamp(), firstFailurePlayerId: null }; const gameRef = db.collection("games").doc(currentGameId); await gameRef.update(updates); showScreen('game-screen'); } else { setupAndStartGame(gameMode); } }
    function calculateColors(guess, secret) { const secretLetters = secret.split(''); const guessLetters = guess.split(''); const colors = Array(wordLength).fill('absent'); const letterCounts = {}; for (const letter of secretLetters) { letterCounts[letter] = (letterCounts[letter] || 0) + 1; } for (let i = 0; i < wordLength; i++) { if (guessLetters[i] === secretLetters[i]) { colors[i] = 'correct'; letterCounts[guessLetters[i]]--; } } for (let i = 0; i < wordLength; i++) { if (colors[i] !== 'correct' && secret.includes(guessLetters[i]) && letterCounts[guessLetters[i]] > 0) { colors[i] = 'present'; letterCounts[guessLetters[i]]--; } } return colors; }
    async function fetchWordMeaning(word) { try { const response = await fetch(`https://sozluk.gov.tr/gts?ara=${word.toLocaleLowerCase('tr-TR')}`); const data = await response.json(); if (data.error) { return "Anlam bulunamadı."; } return data[0]?.anlamlarListe?.[0]?.anlam || "Anlam bulunamadı."; } catch (error) { console.error("Anlam alınırken hata:", error); return "Anlam alınırken bir hata oluştu."; } }
    async function loadWords() { try { const response = await fetch('kelimeler.json'); if (!response.ok) { throw new Error(`Network response was not ok, status: ${response.status}`); } kelimeSozlugu = await response.json(); document.getElementById('loading-words').style.display = 'none'; } catch (error) { console.error("HATA: Kelime listesi yüklenirken bir sorun oluştu!", error); document.getElementById('loading-words').textContent = 'Kelimeler yüklenemedi! (Hata)'; showToast('Kelime listesi yüklenemedi. Lütfen konsolu kontrol edin.', true); } }
    async function shareGame() { if (navigator.share) { try { const shareUrl = `${window.location.origin}${window.location.pathname}?gameId=${currentGameId}`; await navigator.share({ title: 'Kelime Yarışması', text: `Kelime Yarışması oyunuma katıl!`, url: shareUrl, }); } catch (error) { console.error('Paylaşım hatası:', error); } } else { showToast('Paylaşım desteklenmiyor. ID\'yi kopyalayın.', true); } }
    
    // --- EVENT LISTENERS ---
    document.getElementById('theme-light-btn').addEventListener('click', () => { document.body.classList.add('theme-light'); }); document.getElementById('theme-dark-btn').addEventListener('click', () => { document.body.classList.remove('theme-light'); }); dailyWordBtn.addEventListener('click', () => { startDailyGame(); }); document.getElementById('single-player-btn').addEventListener('click', () => { singlePlayerMode = 'single'; document.getElementById('singleplayer-title').textContent = 'Tek Kişilik Oyun'; showScreen('singleplayer-setup-screen'); }); document.getElementById('vs-cpu-btn').addEventListener('click', () => { singlePlayerMode = 'vsCPU'; document.getElementById('singleplayer-title').textContent = 'Bilgisayara Karşı'; showScreen('singleplayer-setup-screen'); }); document.getElementById('start-single-game-btn').addEventListener('click', () => { setupAndStartGame(singlePlayerMode); }); document.getElementById('multiplayer-btn').addEventListener('click', () => { if(gameIdFromUrl) { joinGame(gameIdFromUrl); } else { showScreen('multiplayer-setup-screen'); } }); document.getElementById('rejoin-game-btn').addEventListener('click', () => { const lastGameId = localStorage.getItem('activeGameId'); if (lastGameId) joinGame(lastGameId); }); profileBtn.addEventListener('click', () => { document.getElementById('profile-fullname').textContent = currentUserProfile.fullname; document.getElementById('profile-username').textContent = currentUserProfile.username; document.getElementById('profile-email').textContent = currentUserProfile.email; document.getElementById('profile-age').textContent = currentUserProfile.age; document.getElementById('profile-city').textContent = currentUserProfile.city; displayStats(); showScreen('profile-screen'); }); closeProfileBtn.addEventListener('click', () => showScreen('mode-selection-screen')); howToPlayBtn.addEventListener('click', () => showScreen('how-to-play-screen')); closeHowToPlayBtn.addEventListener('click', () => showScreen('mode-selection-screen')); shareResultsBtn.addEventListener('click', shareResultsAsEmoji); document.getElementById('back-to-mode-single-btn').addEventListener('click', () => showScreen('mode-selection-screen')); document.getElementById('back-to-mode-multi-btn').addEventListener('click', () => showScreen('mode-selection-screen')); leaveGameBtn.onclick = leaveGame; createBtn.addEventListener('click', createGame); joinBtn.addEventListener('click', () => { const gameId = document.getElementById('game-id-input').value.toUpperCase(); joinGame(gameId); }); copyGameIdBtn.addEventListener('click', () => { const gameId = gameIdDisplay.textContent; navigator.clipboard.writeText(gameId).then(() => { showToast('Oyun ID kopyalandı!'); }); }); shareGameBtn.addEventListener('click', shareGame); startGameBtn.addEventListener('click', async () => { if (!currentGameId || gameMode !== 'multiplayer') return; const gameRef = db.collection("games").doc(currentGameId); await gameRef.update({ status: 'playing', turnStartTime: firebase.firestore.FieldValue.serverTimestamp() }); }); document.addEventListener('keydown', (e) => { if (e.ctrlKey || e.altKey || e.metaKey) return; handleKeyPress(e.key); }); mainMenuBtn.addEventListener('click', leaveGame); newRoundBtn.addEventListener('click', startNewRound);
    loginBtn.addEventListener('click', handleLogin);
    registerBtn.addEventListener('click', handleRegister);
    logoutBtn.addEventListener('click', handleLogout);
    goToRegisterBtn.addEventListener('click', () => showScreen('register-screen'));
    backToLoginBtn.addEventListener('click', () => showScreen('login-screen'));

    async function initializeApp() {
        if (typeof firebase === 'undefined') { showToast("Firebase kütüphanesi yüklenemedi.", true); return; } 
        try {
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            auth = firebase.auth();
            
            auth.onAuthStateChanged(async user => {
                if (user) {
                    userId = user.uid;
                    const userDoc = await db.collection('users').doc(user.uid).get();
                    if (userDoc.exists) {
                        currentUserProfile = userDoc.data();
                        userDisplay.textContent = currentUserProfile.username;
                    } else {
                        currentUserProfile = { username: user.email.split('@')[0], email: user.email };
                        userDisplay.textContent = currentUserProfile.username;
                    }
                    
                    createBtn.disabled = false;
                    joinBtn.disabled = false;
                    const lastGameId = localStorage.getItem('activeGameId');
                    if(lastGameId) { document.getElementById('rejoin-game-btn').classList.remove('hidden'); }
                    
                    await loadWords();
                    
                    document.getElementById('daily-word-btn').disabled = false;
                    document.getElementById('single-player-btn').disabled = false;
                    document.getElementById('vs-cpu-btn').disabled = false;
                    document.getElementById('multiplayer-btn').disabled = false;

                    const urlParams = new URLSearchParams(window.location.search);
                    gameIdFromUrl = urlParams.get('gameId');

                    if (gameIdFromUrl && !currentGameId) {
                        joinGame(gameIdFromUrl);
                        gameIdFromUrl = null;
                    } else {
                        showScreen('mode-selection-screen');
                    }
                } else {
                    userId = null;
                    currentUserProfile = null;
                    createBtn.disabled = true;
                    joinBtn.disabled = true;
                    showScreen('login-screen');
                }
            });
        } catch (e) {
            console.error("Firebase başlatılırken bir sorun oluştu!", e);
            showToast("Uygulama başlatılamadı.", true);
        }
    }
    initializeApp();
});
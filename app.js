<script>
        let kelimeSozlugu = {};
        
        document.addEventListener('DOMContentLoaded', () => {
            const modeSelectionScreen = document.getElementById('mode-selection-screen');
            const singleplayerSetupScreen = document.getElementById('singleplayer-setup-screen');
            const multiplayerSetupScreen = document.getElementById('multiplayer-setup-screen');
            const gameScreen = document.getElementById('game-screen');
            const scoreboardScreen = document.getElementById('scoreboard-screen');
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
            
            let db, auth, userId, currentGameId = null, gameUnsubscribe = null, turnTimerInterval = null, localGameData = null, gameMode = null;
            let currentRow = 0, isMyTurn = false, isGameOver = false, wordLength = 5, timeLimit = 45;
            let singlePlayerMode = null;
            let gameIdFromUrl = null;
            
            const scorePoints = [1000, 800, 600, 400, 200, 100];
            const GUESS_COUNT = 6;

            const sounds = {
                click: new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 } }).toDestination(),
                error: new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 } }).toDestination(),
                win: new Tone.PolySynth(Tone.Synth).toDestination(),
                lose: new Tone.PolySynth(Tone.Synth).toDestination(),
                draw: new Tone.PolySynth(Tone.Synth).toDestination()
            };
            function playSound(sound) {
                if (Tone.context.state !== 'running') { Tone.context.resume(); }
                switch(sound) {
                    case 'click': sounds.click.triggerAttackRelease('C5', '8n'); break;
                    case 'error': sounds.error.triggerAttackRelease('C3', '8n'); break;
                    case 'win': sounds.win.triggerAttackRelease(['C4', 'E4', 'G4', 'C5'], '8n', Tone.now()); break;
                    case 'lose': sounds.lose.triggerAttackRelease(['C4', 'A3', 'F3', 'D3'], '8n', Tone.now()); break;
                    case 'draw': sounds.draw.triggerAttackRelease(['C4', 'G4'], '8n', Tone.now()); break;
                }
            }

            const firebaseConfig = {
                apiKey: "AIzaSyA5FcmgM9GV79qGwS8MC3_4yCvwvHZO0iQ",
                authDomain: "kelime-oyunu-flaneur.firebaseapp.com",
                projectId: "kelime-oyunu-flaneur",
                storageBucket: "kelime-oyunu-flaneur.appspot.com",
                messagingSenderId: "888546992121",
                appId: "1:888546992121:web:3e29748729cca6fbbb2728",
                measurementId: "G-RVD6YZ8JYV"
            };

            function showToast(message, isError = false) {
                if (isError) playSound('error');
                toast.textContent = message;
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 3000);
            }
            
            function getUsername() {
                let username = document.getElementById('username-input').value.trim();
                return username ? username.slice(0, 12) : `Oyuncu${Math.floor(Math.random() * 900) + 100}`;
            }

            function showScreen(screenId) {
                ['mode-selection-screen', 'singleplayer-setup-screen', 'multiplayer-setup-screen', 'game-screen', 'scoreboard-screen'].forEach(id => {
                    document.getElementById(id).classList.add('hidden');
                });
                document.getElementById(screenId).classList.remove('hidden');
            }
            
            function initializeGameUI(gameData) {
                wordLength = gameData.wordLength;
                if (wordLength === 4) {
                    guessGrid.style.maxWidth = '220px';
                } else if (wordLength === 5) {
                    guessGrid.style.maxWidth = '280px';
                } else {
                    guessGrid.style.maxWidth = '320px';
                }
                createGrid();
                createKeyboard();
            }

            function setupAndStartGame(mode) {
                gameMode = mode;
                if (mode === 'single' || mode === 'vsCPU') {
                    wordLength = parseInt(document.getElementById('word-length-select-single').value);
                    timeLimit = parseInt(document.getElementById('time-select-single').value);
                }
                const username = getUsername();
                
                const secretWord = kelimeSozlugu[wordLength][Math.floor(Math.random() * kelimeSozlugu[wordLength].length)];
                
                localGameData = {
                    wordLength, secretWord, timeLimit, currentRound: 1, matchLength: 1,
                    players: { [userId]: { username, guesses: [], score: 0 } },
                    currentPlayerId: userId, status: 'playing', turnStartTime: new Date()
                };

                if (gameMode === 'vsCPU') {
                    localGameData.players['cpu'] = { username: 'Bilgisayar', guesses: [], score: 0 };
                }
                
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
                const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
                const secretWord = kelimeSozlugu[selectedLength][Math.floor(Math.random() * kelimeSozlugu[selectedLength].length)];

                const gameData = {
                    gameId, wordLength: selectedLength, secretWord, timeLimit: selectedTime, creatorId: userId,
                    matchLength: selectedMatchLength, currentRound: 1,
                    players: { [userId]: { username, guesses: [], score: 0 } }, // lastSeen kaldırıldı
                    currentPlayerId: userId, status: 'waiting', roundWinner: null, createdAt: new Date(),
                    turnStartTime: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                try {
                    await firebase.firestore().collection("games").doc(gameId).set(gameData);
                    await joinGame(gameId);
                } catch (error) { console.error("Error creating game:", error); showToast("Oyun oluşturulamadı!", true); }
            }

            async function joinGame(gameId) {
                if (!db || !auth || !userId) return showToast("Sunucuya bağlanılamıyor.", true);
                if (!gameId) return showToast("Lütfen bir Oyun ID'si girin.", true);
                
                gameMode = 'multiplayer';
                const username = getUsername();
                const gameRef = db.collection("games").doc(gameId);
                
                try {
                    const gameDoc = await gameRef.get();
                    if (!gameDoc.exists) {
                        localStorage.removeItem('activeGameId');
                        return showToast("Oyun bulunamadı!", true);
                    }

                    const gameData = gameDoc.data();
                    
                    if (Object.keys(gameData.players).length === 1 && !gameData.players[userId]) {
                        await gameRef.update({ [`players.${userId}`]: { username, guesses: [], score: 0 } }); // lastSeen kaldırıldı
                    } else if (!gameData.players[userId]) {
                        return showToast("Bu oyun dolu veya başlamış.", true);
                    }

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
                    if (!gameData) {
                        showToast("Oyun sonlandırıldı.");
                        leaveGame();
                        return;
                    }
                    localGameData = gameData;
                    if (gameData.status === 'finished') {
                        showScoreboard(gameData);
                    } else {
                        renderGameState(gameData);
                    }
                });
            }
            
            function leaveGame() {
                if (gameUnsubscribe) gameUnsubscribe();
                stopTurnTimer();
                localStorage.removeItem('activeGameId');
                gameUnsubscribe = null;
                currentGameId = null;
                localGameData = null;
                gameMode = null;
                showScreen('mode-selection-screen');
                document.getElementById('rejoin-game-btn').classList.add('hidden');
            }

            function renderGameState(gameData) {
                document.getElementById('game-id-display').textContent = gameMode === 'multiplayer' ? gameData.gameId : 'Tek Kişilik';
                document.getElementById('game-info-bar').style.display = gameMode === 'multiplayer' ? 'flex' : 'none';
                if (gameMode === 'multiplayer') {
                    roundCounter.textContent = `Tur ${gameData.currentRound}/${gameData.matchLength}`;
                } else {
                    roundCounter.textContent = '';
                }
                
                timeLimit = gameData.timeLimit || 45;
                isMyTurn = gameData.currentPlayerId === userId && gameData.status === 'playing';
                isGameOver = gameData.status === 'finished';
                
                updateTurnDisplay(gameData);
                updateScores(gameData);

                const allTiles = document.querySelectorAll('.tile');
                allTiles.forEach(tile => {
                    tile.querySelector('.tile-inner').textContent = '';
                    tile.classList.remove('correct', 'present', 'absent', 'failed');
                });

                const playerIds = Object.keys(gameData.players);
                let turnOrder = playerIds;
                
                if(gameMode === 'multiplayer' && gameData.creatorId && playerIds.length > 1 && playerIds.indexOf(gameData.creatorId) > 0) {
                    turnOrder = [gameData.creatorId, ...playerIds.filter(p => p !== gameData.creatorId)];
                } else if(gameMode === 'vsCPU' && playerIds.indexOf('cpu') === 0) {
                    turnOrder = [userId, 'cpu'];
                }

                let totalGuessesRendered = 0;
                const maxGuessesPerPlayer = Math.ceil(GUESS_COUNT / (turnOrder.length || 1));
                for (let guessIndex = 0; guessIndex < maxGuessesPerPlayer; guessIndex++) {
                    for (const playerId of turnOrder) {
                        if (totalGuessesRendered >= GUESS_COUNT) break;
                        const player = gameData.players[playerId];
                        if (player && player.guesses && player.guesses[guessIndex]) {
                            const { word, colors } = player.guesses[guessIndex];
                            renderGuess(totalGuessesRendered, word, colors);
                            totalGuessesRendered++;
                        }
                    }
                    if (totalGuessesRendered >= GUESS_COUNT) break;
                }
                
                currentRow = totalGuessesRendered;
                updateKeyboard(gameData);

                if (gameData.status === 'playing') {
                    startTurnTimer();
                } else {
                    stopTurnTimer();
                }
            }
            
            function updateScores(gameData) {
                const playerIds = Object.keys(gameData.players);
                const p1ScoreEl = document.getElementById('player1-score');
                const p2ScoreEl = document.getElementById('player2-score');
                let p1Id = (gameMode !== 'multiplayer') ? userId : (gameData.creatorId || playerIds[0]);

                if (playerIds.length > 0) {
                    const p1 = gameData.players[p1Id];
                    if(p1) p1ScoreEl.innerHTML = `<span class="font-bold">${p1.username}</span><br>${p1.score} Puan`;
                }
                 if (playerIds.length > 1) {
                    const p2Id = playerIds.find(id => id !== p1Id);
                    const p2 = gameData.players[p2Id];
                    if(p2) p2ScoreEl.innerHTML = `<span class="font-bold">${p2.username}</span><br>${p2.score} Puan`;
                } else {
                    p2ScoreEl.innerHTML = '';
                }
            }

            function updateTurnDisplay(gameData) {
                const numPlayers = Object.keys(gameData.players).length;
                shareGameBtn.classList.add('hidden');
                
                if (gameData.status === 'waiting') {
                    stopTurnTimer();
                    if (numPlayers < 2) {
                        turnDisplay.textContent = "Rakip bekleniyor...";
                        startGameBtn.classList.add('hidden');
                        shareGameBtn.classList.remove('hidden');
                    } else {
                        if (userId === gameData.creatorId) {
                            turnDisplay.textContent = "Rakip katıldı!";
                            startGameBtn.classList.remove('hidden');
                        } else {
                            turnDisplay.textContent = "Başlatılıyor...";
                            startGameBtn.classList.add('hidden');
                        }
                    }
                } else if (gameData.status === 'playing') {
                    startGameBtn.classList.add('hidden');
                    const currentPlayerUsername = gameData.players[gameData.currentPlayerId]?.username;
                    if (isMyTurn) {
                        turnDisplay.textContent = "Sıra Sende!";
                        turnDisplay.classList.add('pulsate');
                    } else {
                        turnDisplay.textContent = `Sıra: ${currentPlayerUsername}`;
                        turnDisplay.classList.remove('pulsate');
                    }
                }
            }

            function createGrid() {
                guessGrid.innerHTML = '';
                guessGrid.style.gridTemplateColumns = `repeat(${wordLength}, 1fr)`;
                for (let i = 0; i < GUESS_COUNT; i++) {
                    for (let j = 0; j < wordLength; j++) {
                        const tile = document.createElement('div');
                        tile.classList.add('tile');
                        tile.id = `tile-${i}-${j}`;
                        const tileInner = document.createElement('div');
                        tileInner.classList.add('tile-inner');
                        tile.appendChild(tileInner);
                        guessGrid.appendChild(tile);
                    }
                }
            }

            function renderGuess(rowIndex, word, colors) {
                 for (let i = 0; i < wordLength; i++) {
                    const tile = document.getElementById(`tile-${rowIndex}-${i}`);
                    if(tile) {
                        tile.querySelector('.tile-inner').textContent = word[i];
                        tile.classList.add(colors[i]);
                    }
                }
            }

            function createKeyboard() {
                keyboardContainer.innerHTML = '';
                const keyRows = [
                    ['E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'],
                    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'],
                    ['Z', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç'],
                    ['⌫', 'ENTER']
                ];

                keyRows.forEach((row, rowIndex) => {
                    const rowDiv = document.createElement('div');
                    rowDiv.classList.add('flex', 'justify-center', 'gap-1', 'my-1', 'w-full');
                    if(rowIndex === 3){
                         rowDiv.classList.add('gap-2');
                    }

                    row.forEach(key => {
                        const keyButton = document.createElement('button');
                        keyButton.dataset.key = key;

                        if (key === '⌫') {
                            keyButton.innerHTML = `<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" /></svg>`;
                        } else if (key === 'ENTER') {
                            keyButton.innerHTML = `<svg class="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4l10 6-10 6V4z"/></svg>`;
                        } else {
                            keyButton.textContent = key;
                        }
                        
                        keyButton.classList.add('keyboard-key', 'rounded', 'font-semibold', 'uppercase', 'bg-gray-500');

                        if (rowIndex === 3) {
                             keyButton.style.flex = '6';
                             keyButton.classList.add('bg-gray-600');
                        } else {
                             keyButton.style.flex = '1';
                        }

                        keyButton.onclick = () => handleKeyPress(key);
                        rowDiv.appendChild(keyButton);
                    });
                    keyboardContainer.appendChild(rowDiv);
                });
            }


            function updateKeyboard(gameData) {
                const allGuesses = Object.values(gameData.players).flatMap(p => p.guesses);
                const keyStates = {};
                allGuesses.forEach(({ word, colors }) => {
                    for (let i = 0; i < word.length; i++) {
                        const letter = word[i];
                        const color = colors[i];
                        if (keyStates[letter] === 'correct') continue;
                        if (keyStates[letter] === 'present' && color !== 'correct') continue;
                        keyStates[letter] = color;
                    }
                });
                document.querySelectorAll('.keyboard-key').forEach(btn => {
                    const keyId = btn.dataset.key;
                    if (keyId === 'ENTER' || keyId === '⌫') return;

                    const state = keyStates[keyId];
                    btn.classList.remove('correct', 'present', 'absent');
                    if (state) btn.classList.add(state);
                });
            }
            
            function startTurnTimer() {
                stopTurnTimer();
                if(isGameOver) return;

                let turnStartTime = (gameMode === 'multiplayer' && localGameData.turnStartTime?.toDate) 
                    ? localGameData.turnStartTime.toDate() 
                    : new Date();

                turnTimerInterval = setInterval(async () => {
                    let now = new Date();
                    let elapsed = Math.floor((now - turnStartTime) / 1000);
                    let timeLeft = timeLimit - elapsed;
                    
                    if(timerDisplay) {
                        if (isMyTurn) {
                            timerDisplay.textContent = timeLeft > 0 ? timeLeft : 0;
                            if (timeLeft <= 5) timerDisplay.classList.add('text-red-500');
                            else timerDisplay.classList.remove('text-red-500');
                        } else {
                             timerDisplay.textContent = timeLeft > 0 ? timeLeft : 0;
                             timerDisplay.classList.remove('text-red-500');
                        }
                    }

                    if (timeLeft <= 0 && isMyTurn) { 
                        stopTurnTimer(); 
                        await failTurn(''); 
                    }
                }, 1000);
            }

            function stopTurnTimer() {
                clearInterval(turnTimerInterval);
                turnTimerInterval = null;
                if (timerDisplay) timerDisplay.textContent = '';
            }
            
            async function failTurn(guessWord = '') {
                if (!isMyTurn) return;
                stopTurnTimer();
                keyboardContainer.style.pointerEvents = 'none';

                const newGuess = { 
                    word: guessWord.padEnd(wordLength, ' '), 
                    colors: Array(wordLength).fill('failed') 
                };

                const totalGuessesMade = Object.values(localGameData.players).reduce((acc, p) => acc + p.guesses.length, 0) + 1;

                if (gameMode === 'multiplayer') {
                    const gameRef = db.collection("games").doc(currentGameId);
                    const gameData = localGameData;

                    const playerGuesses = gameData.players[userId].guesses || [];
                    playerGuesses.push(newGuess);
                    
                    const playerIds = Object.keys(gameData.players);
                    const myIndex = playerIds.indexOf(userId);
                    const nextPlayerIndex = (myIndex + 1) % playerIds.length;
                    
                    const updates = {
                        [`players.${userId}.guesses`]: playerGuesses,
                        currentPlayerId: playerIds[nextPlayerIndex],
                        turnStartTime: firebase.firestore.FieldValue.serverTimestamp()
                    };

                    if (totalGuessesMade >= GUESS_COUNT) {
                        updates.status = 'finished';
                        updates.roundWinner = null;
                    }
                    await gameRef.update(updates).finally(() => { keyboardContainer.style.pointerEvents = 'auto'; });
                } else {
                    localGameData.players[userId].guesses.push(newGuess);

                    if (totalGuessesMade >= GUESS_COUNT) {
                        localGameData.status = 'finished';
                        showScoreboard(localGameData);
                    } else {
                        if (gameMode === 'vsCPU') {
                            localGameData.currentPlayerId = 'cpu';
                            renderGameState(localGameData);
                            setTimeout(cpuTurn, 1500);
                        } else {
                           renderGameState(localGameData);
                        }
                    }
                    keyboardContainer.style.pointerEvents = 'auto';
                }
            }


            function handleKeyPress(key) {
                if (isGameOver || !isMyTurn) return;
                
                const processedKey = key.toLocaleUpperCase('tr-TR');
                if (processedKey === 'ENTER') {
                    playSound('click');
                    submitGuess();
                } else if (processedKey === '⌫' || processedKey === 'BACKSPACE') {
                    playSound('click');
                    deleteLetter();
                } else if (processedKey.length === 1 && "ERTYUIOPĞÜASDFGHJKLŞİZC VBNMÖÇ".includes(processedKey)) {
                    addLetter(processedKey);
                }
            }
            
            function addLetter(letter) {
                let currentGuess = '';
                for (let i = 0; i < wordLength; i++) {
                    const tile = document.getElementById(`tile-${currentRow}-${i}`);
                    if (tile && tile.querySelector('.tile-inner').textContent !== '') {
                        currentGuess += tile.querySelector('.tile-inner').textContent;
                    }
                }

                if (currentGuess.length < wordLength) {
                     for (let i = 0; i < wordLength; i++) {
                        const tile = document.getElementById(`tile-${currentRow}-${i}`);
                        if (tile && tile.querySelector('.tile-inner').textContent === '') {
                            tile.querySelector('.tile-inner').textContent = letter;
                            playSound('click');
                            break;
                        }
                    }
                } else {
                    playSound('error');
                }
            }

            function deleteLetter() {
                for (let i = wordLength - 1; i >= 0; i--) {
                    const tile = document.getElementById(`tile-${currentRow}-${i}`);
                    if (tile && tile.querySelector('.tile-inner').textContent !== '') {
                        tile.querySelector('.tile-inner').textContent = '';
                        break;
                    }
                }
            }

            async function submitGuess() {
                if (!isMyTurn) return;
                
                let guessWord = '';
                for (let i = 0; i < wordLength; i++) {
                    const tile = document.getElementById(`tile-${currentRow}-${i}`);
                    const tileInner = tile.querySelector('.tile-inner');
                    if (!tileInner || tileInner.textContent === '') { showToast("Kelime yeterince uzun değil!", true); return; }
                    guessWord += tileInner.textContent;
                }
                
                if (!kelimeSozlugu[wordLength] || !kelimeSozlugu[wordLength].includes(guessWord)) {
                    showToast("Kelime sözlükte bulunamadı!", true);
                    await failTurn(guessWord);
                    return;
                }
                
                keyboardContainer.style.pointerEvents = 'none';
                stopTurnTimer();
                
                const secretWord = localGameData.secretWord;
                const colors = calculateColors(guessWord, secretWord);
                const newGuess = { word: guessWord, colors: colors };
                const totalGuessesMade = Object.values(localGameData.players).reduce((acc, p) => acc + p.guesses.length, 0) + 1;

                if (gameMode === 'multiplayer') {
                    const gameRef = db.collection("games").doc(currentGameId);
                    const gameData = localGameData;
                    
                    const playerGuesses = gameData.players[userId].guesses || [];
                    playerGuesses.push(newGuess);

                    const playerIds = Object.keys(gameData.players);
                    const myIndex = playerIds.indexOf(userId);
                    const nextPlayerIndex = (myIndex + 1) % playerIds.length;
                    
                    const updates = {
                        [`players.${userId}.guesses`]: playerGuesses,
                        currentPlayerId: playerIds[nextPlayerIndex],
                        turnStartTime: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    
                    if (guessWord === secretWord) {
                        updates.status = 'finished';
                        updates.roundWinner = userId;
                        const scoreToAdd = scorePoints[playerGuesses.length - 1] || 0;
                        updates[`players.${userId}.score`] = (gameData.players[userId].score || 0) + scoreToAdd;
                    } else if (totalGuessesMade >= GUESS_COUNT) {
                        updates.status = 'finished';
                        updates.roundWinner = null; 
                    }
                    await gameRef.update(updates).finally(() => { keyboardContainer.style.pointerEvents = 'auto'; });
                } else {
                    localGameData.players[userId].guesses.push(newGuess);
                    
                    if (guessWord === secretWord) {
                        localGameData.status = 'finished';
                        localGameData.roundWinner = userId;
                        const scoreToAdd = scorePoints[localGameData.players[userId].guesses.length - 1] || 0;
                        localGameData.players[userId].score += scoreToAdd;
                        showScoreboard(localGameData);
                    } else {
                        if (totalGuessesMade >= GUESS_COUNT) {
                            localGameData.status = 'finished';
                            localGameData.roundWinner = null;
                            showScoreboard(localGameData);
                        } else {
                            if (gameMode === 'vsCPU') {
                                localGameData.currentPlayerId = 'cpu';
                                renderGameState(localGameData);
                                setTimeout(cpuTurn, 1500);
                            } else {
                                renderGameState(localGameData);
                            }
                        }
                    }
                    keyboardContainer.style.pointerEvents = 'auto';
                }
            }

            function cpuTurn() {
                if (isGameOver || !localGameData || localGameData.currentPlayerId !== 'cpu') return;
                
                keyboardContainer.style.pointerEvents = 'none';

                setTimeout(() => {
                    const possibleWords = kelimeSozlugu[wordLength];
                    const guessWord = possibleWords[Math.floor(Math.random() * possibleWords.length)];

                    const secretWord = localGameData.secretWord;
                    const colors = calculateColors(guessWord, secretWord);
                    const newGuess = { word: guessWord, colors: colors };
                    localGameData.players['cpu'].guesses.push(newGuess);
                    
                    const totalGuessesMade = Object.values(localGameData.players).reduce((acc, p) => acc + p.guesses.length, 0);

                    if (guessWord === secretWord) {
                        localGameData.status = 'finished';
                        localGameData.roundWinner = 'cpu';
                        const scoreToAdd = scorePoints[localGameData.players['cpu'].guesses.length - 1] || 0;
                        localGameData.players['cpu'].score += scoreToAdd;
                        showScoreboard(localGameData);
                    } else {
                        if (totalGuessesMade >= GUESS_COUNT) {
                            localGameData.status = 'finished';
                            localGameData.roundWinner = null;
                            showScoreboard(localGameData);
                        } else {
                            localGameData.currentPlayerId = userId;
                            renderGameState(localGameData);
                        }
                    }
                    keyboardContainer.style.pointerEvents = 'auto';
                }, 1000 + Math.random() * 500);
            }
            
            async function showScoreboard(gameData) {
                stopTurnTimer();
                showScreen('scoreboard-screen');

                const roundWinnerDisplay = document.getElementById('round-winner-display');
                const correctWordDisplay = document.getElementById('correct-word-display');
                const finalScores = document.getElementById('final-scores');
                const matchWinnerDisplay = document.getElementById('match-winner-display');
                const meaningDisplay = document.getElementById('word-meaning-display');
                
                if(gameData.roundWinner === userId) playSound('win');
                else if(gameData.roundWinner === null) playSound('draw');
                else playSound('lose');

                correctWordDisplay.textContent = gameData.secretWord;
                meaningDisplay.textContent = 'Anlam yükleniyor...';
                const meaning = await fetchWordMeaning(gameData.secretWord);
                meaningDisplay.textContent = meaning;


                if (gameData.roundWinner) {
                    const winnerName = gameData.players[gameData.roundWinner].username;
                    roundWinnerDisplay.textContent = `${winnerName} Turu Kazandı!`;
                } else {
                    roundWinnerDisplay.textContent = "Berabere!";
                }

                finalScores.innerHTML = `<h3 class="text-xl font-bold mb-2 text-center">${gameMode === 'multiplayer' ? 'Toplam Puan' : 'Puan'}</h3>`;
                const sortedPlayers = Object.entries(gameData.players)
                                            .map(([id, data]) => ({...data, id}))
                                            .sort((a,b) => b.score - a.score);

                sortedPlayers.forEach(player => {
                    const scoreEl = document.createElement('p');
                    scoreEl.className = 'text-lg';
                    scoreEl.textContent = `${player.username}: ${player.score} Puan`;
                    finalScores.appendChild(scoreEl);
                });
                
                matchWinnerDisplay.textContent = '';
                newRoundBtn.textContent = (gameMode === 'multiplayer') ? 'Yeni Tur' : 'Yeni Oyun';
                newRoundBtn.classList.add('hidden');

                if (gameMode === 'multiplayer') {
                     if (gameData.currentRound >= gameData.matchLength) {
                        localStorage.removeItem('activeGameId');
                        const p1 = sortedPlayers[0];
                        const p2 = sortedPlayers.length > 1 ? sortedPlayers[1] : {score: -1};
                        if (p1.score > p2.score) {
                             matchWinnerDisplay.textContent = `MAÇI ${p1.username} KAZANDI!`;
                        } else if (p2.score > p1.score) {
                             matchWinnerDisplay.textContent = `MAÇI ${p2.username} KAZANDI!`;
                        } else {
                             matchWinnerDisplay.textContent = 'MAÇ BERABERE!';
                        }
                    } else if (userId === gameData.creatorId) {
                         newRoundBtn.classList.remove('hidden');
                    }
                } else {
                    newRoundBtn.classList.remove('hidden');
                }
            }
            
            async function startNewRound() {
                if (gameMode === 'multiplayer') {
                     if (!localGameData) return;
                    
                    const newWordList = kelimeSozlugu[localGameData.wordLength];
                    const newSecretWord = newWordList[Math.floor(Math.random() * newWordList.length)];
                    
                    const playerIds = Object.keys(localGameData.players);
                    const newPlayersState = {};
                    playerIds.forEach(pid => {
                        newPlayersState[pid] = { ...localGameData.players[pid], guesses: [] };
                    });

                    const updates = {
                        secretWord: newSecretWord, players: newPlayersState,
                        currentPlayerId: localGameData.creatorId, status: 'playing', roundWinner: null,
                        currentRound: localGameData.currentRound + 1,
                        turnStartTime: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    const gameRef = db.collection("games").doc(currentGameId);
                    await gameRef.update(updates);
                    initializeGameUI(updates);
                } else {
                    if(localGameData.currentRound >= localGameData.matchLength){
                         localGameData.players[userId].score = 0; 
                         if(localGameData.players['cpu']) localGameData.players['cpu'].score = 0;
                    }
                    setupAndStartGame(gameMode);
                }
            }

            function calculateColors(guess, secret) {
                const secretLetters = secret.split('');
                const guessLetters = guess.split('');
                const colors = Array(wordLength).fill('');
                for (let i = 0; i < wordLength; i++) {
                    if (guessLetters[i] === secretLetters[i]) {
                        colors[i] = 'correct';
                        secretLetters[i] = null;
                    }
                }
                for (let i = 0; i < wordLength; i++) {
                    if (colors[i] === '') {
                        const index = secretLetters.indexOf(guessLetters[i]);
                        if (index > -1) {
                            colors[i] = 'present';
                            secretLetters[index] = null;
                        } else {
                            colors[i] = 'absent';
                        }
                    }
                }
                return colors;
            }

            async function fetchWordMeaning(word) {
                try {
                    const response = await fetch(`https://sozluk.gov.tr/gts?ara=${word.toLocaleLowerCase('tr-TR')}`);
                    const data = await response.json();
                    if (data.error) {
                        return "Anlam bulunamadı.";
                    }
                    return data[0]?.anlamlarListe?.[0]?.anlam || "Anlam bulunamadı.";
                } catch (error) {
                    console.error("Anlam alınırken hata:", error);
                    return "Anlam alınırken bir hata oluştu.";
                }
            }
            
            async function loadWords() {
                try {
                    const response = await fetch('kelimeler.json');
                    if (!response.ok) {
                        throw new Error(`Network response was not ok, status: ${response.status}`);
                    }
                    kelimeSozlugu = await response.json();
                    document.getElementById('loading-words').style.display = 'none';
                    document.getElementById('single-player-btn').disabled = false;
                    document.getElementById('vs-cpu-btn').disabled = false;
                    document.getElementById('multiplayer-btn').disabled = false;
                } catch (error) {
                    console.error("HATA: Kelime listesi yüklenirken bir sorun oluştu!", error);
                    document.getElementById('loading-words').textContent = 'Kelimeler yüklenemedi! (Hata)';
                    showToast('Kelime listesi yüklenemedi. Lütfen konsolu kontrol edin.', true);
                }
            }

            async function shareGame() {
                if (navigator.share) {
                    try {
                        const shareUrl = `${window.location.origin}${window.location.pathname}?gameId=${currentGameId}`;
                        await navigator.share({
                            title: 'Kelime Yarışması',
                            text: `Kelime Yarışması oyunuma katıl!`,
                            url: shareUrl,
                        });
                    } catch (error) { console.error('Paylaşım hatası:', error); }
                } else { showToast('Paylaşım desteklenmiyor. ID\'yi kopyalayın.', true); }
            }
            
            // --- EVENT LISTENERS ---
            document.getElementById('theme-light-btn').addEventListener('click', () => { document.body.classList.add('theme-light'); });
            document.getElementById('theme-dark-btn').addEventListener('click', () => { document.body.classList.remove('theme-light'); });
            
            document.getElementById('single-player-btn').addEventListener('click', () => {
                if (getUsername()) {
                    singlePlayerMode = 'single';
                    document.getElementById('singleplayer-title').textContent = 'Tek Kişilik Oyun';
                    showScreen('singleplayer-setup-screen');
                }
            });
            document.getElementById('vs-cpu-btn').addEventListener('click', () => {
                if (getUsername()) {
                    singlePlayerMode = 'vsCPU';
                    document.getElementById('singleplayer-title').textContent = 'Bilgisayara Karşı';
                    showScreen('singleplayer-setup-screen');
                }
            });
            document.getElementById('start-single-game-btn').addEventListener('click', () => { setupAndStartGame(singlePlayerMode); });
            
            document.getElementById('multiplayer-btn').addEventListener('click', () => {
                 if (getUsername()) {
                    if(gameIdFromUrl) {
                        joinGame(gameIdFromUrl);
                    } else {
                        showScreen('multiplayer-setup-screen');
                    }
                }
            });

            document.getElementById('rejoin-game-btn').addEventListener('click', () => {
                if (getUsername()) {
                    const lastGameId = localStorage.getItem('activeGameId');
                    if (lastGameId) joinGame(lastGameId);
                }
            });

            document.getElementById('back-to-mode-single-btn').addEventListener('click', () => showScreen('mode-selection-screen'));
            document.getElementById('back-to-mode-multi-btn').addEventListener('click', () => showScreen('mode-selection-screen'));
            leaveGameBtn.onclick = leaveGame;
            createBtn.addEventListener('click', createGame);
            joinBtn.addEventListener('click', () => { const gameId = document.getElementById('game-id-input').value.toUpperCase(); joinGame(gameId); });
            copyGameIdBtn.addEventListener('click', () => { const gameId = gameIdDisplay.textContent; navigator.clipboard.writeText(gameId).then(() => { showToast('Oyun ID kopyalandı!'); }); });
            shareGameBtn.addEventListener('click', shareGame);
            startGameBtn.addEventListener('click', async () => { if (!currentGameId || gameMode !== 'multiplayer') return; const gameRef = db.collection("games").doc(currentGameId); await gameRef.update({ status: 'playing', turnStartTime: firebase.firestore.FieldValue.serverTimestamp() }); });
            document.addEventListener('keydown', (e) => { if (e.ctrlKey || e.altKey || e.metaKey) return; handleKeyPress(e.key); });
            mainMenuBtn.addEventListener('click', leaveGame);
            newRoundBtn.addEventListener('click', startNewRound);

            // --- Game Startup Logic ---
            async function initializeApp() {
                await loadWords();
                const urlParams = new URLSearchParams(window.location.search);
                gameIdFromUrl = urlParams.get('gameId');

                const lastGameId = localStorage.getItem('activeGameId');
                if(lastGameId) {
                    document.getElementById('rejoin-game-btn').classList.remove('hidden');
                }
                
                 if (typeof firebase === 'undefined') {
                    showToast("Firebase kütüphanesi yüklenemedi.", true); return;
                }
                try {
                    firebase.initializeApp(firebaseConfig);
                    db = firebase.firestore();
                    auth = firebase.auth();
                    auth.onAuthStateChanged(user => {
                        if (user) {
                            userId = user.uid;
                            createBtn.disabled = false;
                            joinBtn.disabled = false;
                            
                            if (gameIdFromUrl && !currentGameId) {
                                document.getElementById('username-input').value = `Misafir${Math.floor(Math.random() * 900) + 100}`;
                                joinGame(gameIdFromUrl);
                                gameIdFromUrl = null;
                            }
                        } else {
                            auth.signInAnonymously().catch(error => { 
                                console.error("Firebase anonim giriş başarısız!", error); 
                                showToast("Bağlantı hatası!", true);
                            });
                        }
                    });
                } catch (e) {
                    console.error("Firebase başlatılırken bir sorun oluştu!", e);
                    showToast("Uygulama başlatılamadı.", true);
                }
            }
            
            initializeApp();
        });
    </script>
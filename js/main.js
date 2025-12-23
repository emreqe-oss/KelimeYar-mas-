// js/main.js - FİNAL DÜZELTİLMİŞ SÜRÜM

// 1. IMPORTLAR
import { 
    setUserId, setCurrentUserProfile, getCurrentUserProfile, getUserId, getCurrentGameId,
    getFriendsUnsubscribe, setFriendsUnsubscribe,
    getMyGamesUnsubscribe, setMyGamesUnsubscribe,
    getChallengedFriendId, setChallengedFriendId
} from './state.js';

import { db, auth } from './firebase.js'; 
import { onAuthStateChanged } from "firebase/auth"; 
import { 
    getDoc, doc, collection, query, orderBy, limit, getDocs, 
    updateDoc, where, onSnapshot, deleteField, startAfter
} from "firebase/firestore"; 

import { handleLogin, handleRegister, handleLogout } from './auth.js';
import { 
    searchUsers,
    listenToFriendships,
    listenToMyGames 
} from './friends.js';

// UI Importları
import { 
    initUI, 
    switchLeagueTab, btnShowFixtures, btnShowStandings, 
    showScreen, 
    displayStats, 
    switchFriendTab, 
    switchMyGamesTab,
    loginBtn, registerBtn, logoutBtn, goToRegisterBtn, backToLoginBtn,
    newGameBtn, myGamesBtn, friendsBtn, statsBtn, statsBtnMain,
    howToPlayBtn, closeHowToPlayBtn,
    backToMainMenuBtn, backToMainMenuFromGamesBtn, backToMainFromFriendsBtn,
    randomGameBtn, seriesGameBtn, withFriendsBtn, vsCpuBtn, multiplayerBrBtn,
    dailyWordBtn,
    kelimeligBtn, backToMainFromLeagueBtn, openKelimeligScreen,
    showActiveGamesTabBtn, showFinishedGamesTabBtn, showInvitesTabBtn,
    showFriendsTabBtn, showRequestsTabBtn, showAddFriendTabBtn, searchFriendBtn,
    closeProfileBtn,
    createGameBtn, joinGameBtn, 
    backToModeMultiBtn, backToModeBrBtn,
    leaveGameButton, startGameBtn, copyGameIdBtn, shareGameBtn,
    newRoundBtn, mainMenuBtn, shareResultsBtn,
    jokerPresentBtn, jokerCorrectBtn, jokerRemoveBtn,
    playTutorialAnimation,
    stopTutorialAnimation, marketBtn, backToMainFromMarketBtn, openKirtasiyeScreen,
    dictionaryMenuBtn, backToMainFromDictionaryBtn, openDictionaryScreen,
    btnCreatePublicBr, btnCreatePrivateBr, btnJoinRandomBr
} from './ui.js';

// Oyun Mantığı Importları
import { 
    startNewGame, 
    findOrCreateRandomGame, 
    joinGame, 
    createBRGame, 
    joinBRGame, 
    leaveGame, 
    handleKeyPress, 
    startGame, 
    createGame,
    usePresentJoker, 
    useCorrectJoker, 
    useRemoveJoker,
    startRematch,
    abandonGame,
    joinRandomBRGame,
    sendQuickChat,
    checkAndGenerateDailyQuests,
    updateQuestProgress
} from './game.js';

import { showToast, playSound } from './utils.js';

// 2. GLOBAL DEĞİŞKENLER
let lastVisibleRankDoc = null; 
let currentRankCount = 1;      
let isRankingLoading = false;  
let globalGamesUnsubscribe = null;

// --- SERVICE WORKER KAYDI ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js')
    .then((registration) => {
      console.log('Service Worker aktif:', registration.scope);
    })
    .catch((err) => {
      console.error('Service Worker hatası:', err);
    });
}

// --- AVATAR LİSTESİ ---
const AVATAR_LIST = [
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar1&background=%236b7280',
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar2&background=%23ef4444',
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar3&background=%23f59e0b',
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar4&background=%2310b981',
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar5&background=%233b82f6',
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar6&background=%238b5cf6',
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=huso&background=%23ec4899',
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=gemini&background=%2314b8a6'
];

// 3. YARDIMCI FONKSİYONLAR

function getDefaultAvatar() {
    return 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Ccircle cx=%2750%27 cy=%2750%27 r=%2750%27 fill=%27%236B7280%27/%3E%3C/svg%3E';
}

function checkReferral() {
    const urlParams = new URLSearchParams(window.location.search);
    const refId = urlParams.get('ref');
    if (refId) {
        sessionStorage.setItem('invitedBy', refId);
        console.log("Referans tespit edildi:", refId);
    }
}

function switchTheme(theme) {
    const sunIcons = document.querySelectorAll('[id*="theme-icon-sun"]');
    const moonIcons = document.querySelectorAll('[id*="theme-icon-moon"]');

    if (theme === 'light') {
        document.body.classList.add('theme-light');
        localStorage.setItem('theme', 'light');
        sunIcons.forEach(el => el.classList.add('hidden'));
        moonIcons.forEach(el => el.classList.remove('hidden'));
    } else {
        document.body.classList.remove('theme-light');
        localStorage.setItem('theme', 'dark');
        sunIcons.forEach(el => el.classList.remove('hidden'));
        moonIcons.forEach(el => el.classList.add('hidden'));
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    switchTheme(savedTheme);
}

// Global Oyun Takibi (Bildirimler İçin)
function startGlobalGamesListener() {
    const userId = getUserId();
    if (!userId) return;

    const q = query(
        collection(db, "games"),
        where("playerIds", "array-contains", userId),
        where("status", "in", ["waiting", "playing"])
    );

    if (globalGamesUnsubscribe) globalGamesUnsubscribe();

    globalGamesUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const gameData = change.doc.data();
            // Eğer yeni bir oyun "playing" durumuna geçtiyse ve biz oyun ekranında değilsek
            if (change.type === "modified" && gameData.status === 'playing') {
                const gameScreen = document.getElementById('game-screen');
                if (gameScreen && gameScreen.classList.contains('hidden')) {
                    showToast(`🔔 "${gameData.gameType === 'friend' ? 'Arkadaşın' : 'Rakip'}" oyuna başladı!`, false);
                    playSound('turn');
                    const inviteCount = document.getElementById('game-invite-count');
                    if(inviteCount) {
                        inviteCount.textContent = "!";
                        inviteCount.classList.remove('hidden');
                    }
                }
            }
        });
    });
}

// Global Sıralama Çekme
async function fetchAndDisplayGlobalRanking(loadMore = false) {
    const listElement = document.getElementById('global-ranking-list');
    const loadingElement = document.getElementById('global-ranking-loading');
    const loadMoreBtn = document.getElementById('load-more-ranking-btn');
    
    if (!listElement || isRankingLoading) return;
    
    isRankingLoading = true;

    if (!loadMore) {
        listElement.innerHTML = '';
        if(loadingElement) loadingElement.classList.remove('hidden');
        if(loadMoreBtn) loadMoreBtn.classList.add('hidden');
        lastVisibleRankDoc = null;
        currentRankCount = 1;
    } else {
        loadMoreBtn.textContent = "Yükleniyor...";
        loadMoreBtn.disabled = true;
    }

    try {
        const usersRef = collection(db, 'users');
        let q;

        if (loadMore && lastVisibleRankDoc) {
            q = query(usersRef, orderBy("stats.wins", "desc"), orderBy("stats.played", "asc"), startAfter(lastVisibleRankDoc), limit(50));
        } else {
            q = query(usersRef, orderBy("stats.wins", "desc"), orderBy("stats.played", "asc"), limit(50));
        }

        const querySnapshot = await getDocs(q);
        const currentUserId = getUserId(); 
        let currentUserRow = null;

        if(loadingElement) loadingElement.classList.add('hidden');

        if (querySnapshot.empty) {
            if(!loadMore && loadingElement) loadingElement.textContent = "Henüz sıralama yok.";
            if(loadMoreBtn) loadMoreBtn.classList.add('hidden');
            isRankingLoading = false;
            return;
        }

        lastVisibleRankDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

        querySnapshot.forEach(doc => {
            const user = doc.data();
            const stats = user.stats || { played: 0, wins: 0 };
            if (!user.username) return; 

            const row = document.createElement('div');
            row.className = 'ranking-row p-3 border-b border-gray-700 flex justify-between items-center animate-fade-in'; 
            
            const isMe = doc.id === currentUserId;
            if (isMe) {
                row.classList.add('bg-indigo-900/50', 'border-indigo-500', 'border'); 
                currentUserRow = row;
            } else {
                row.classList.add('hover:bg-gray-700/50', 'transition');
            }

            const winRate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
            const wins = stats.wins || 0;

            row.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="font-bold text-gray-400 w-8 text-right text-sm">${currentRankCount}.</span>
                    <div class="flex flex-col">
                        <span class="font-bold text-white ${isMe ? 'text-yellow-400' : ''} truncate max-w-[120px]">${user.username}</span>
                        <span class="text-[10px] text-gray-500">Kazanma: ${wins}</span>
                    </div>
                </div>
                <div class="text-right">
                    <span class="block font-bold text-green-400 text-sm">%${winRate}</span>
                    <span class="text-[10px] text-gray-500">BAŞARI</span>
                </div>
            `;
            
            // Meydan Oku Butonu
            if (!isMe) {
                const actionDiv = document.createElement('div');
                actionDiv.className = "ml-2";
                const challengeButton = document.createElement('button');
                challengeButton.className = 'bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold py-1.5 px-2.5 rounded transition';
                challengeButton.textContent = 'VS';
                challengeButton.dataset.opponentId = doc.id;
                challengeButton.dataset.opponentName = user.username;
                challengeButton.onclick = handleChallengeClick;
                actionDiv.appendChild(challengeButton);
                row.appendChild(actionDiv);
            } else {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = "w-[42px]"; 
                row.appendChild(emptyDiv);
            }
            
            listElement.appendChild(row);
            currentRankCount++;
        });

        if (loadMoreBtn) {
            if (querySnapshot.docs.length < 50) {
                loadMoreBtn.classList.add('hidden');
            } else {
                loadMoreBtn.classList.remove('hidden');
                loadMoreBtn.textContent = "👇 Daha Fazla Göster";
                loadMoreBtn.disabled = false;
            }
        }

        if (!loadMore && currentUserRow) {
            setTimeout(() => {
                currentUserRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }

    } catch (error) {
        console.error("Sıralama yüklenirken hata:", error);
        if(loadingElement) loadingElement.textContent = "Sıralama yüklenemedi.";
    } finally {
        isRankingLoading = false;
    }
}

async function handleChallengeClick(event) {
    const button = event.currentTarget;
    const opponentId = button.dataset.opponentId;
    const opponentName = button.dataset.opponentName;

    if (!opponentId) {
        showToast("Rakip ID'si bulunamadı!", true);
        return;
    }

    button.disabled = true;
    button.textContent = '...';

    try {
        await createGame({ 
            invitedFriendId: opponentId,
            timeLimit: 43200, 
            matchLength: 1,   
            isHardMode: false,
            gameType: 'friend'
        });

        showToast(`${opponentName} adlı oyuncuya meydan okundu!`);
        updateQuestProgress('challenge_rank', 1);
        showScreen('my-games-screen');
        switchMyGamesTab('active'); 
        
    } catch (error) {
        console.error("Meydan okuma başarısız:", error);
        showToast("Hata: " + error.message, true);
        button.disabled = false;
        button.textContent = 'Meydan Oku';
    }
}

// İstatistik Sekmesi Değiştirme
function switchStatsTab(tabName) {
    const personalTab = document.getElementById('personal-stats-tab');
    const globalTab = document.getElementById('global-ranking-tab');
    const personalBtn = document.getElementById('show-personal-stats-tab-btn');
    const globalBtn = document.getElementById('show-global-ranking-tab-btn');

    if (tabName === 'global') {
        personalTab.classList.add('hidden');
        globalTab.classList.remove('hidden');
        personalBtn.classList.remove('text-white', 'border-indigo-500');
        personalBtn.classList.add('text-gray-400');
        globalBtn.classList.add('text-white', 'border-indigo-500');
        globalBtn.classList.remove('text-gray-400');
        fetchAndDisplayGlobalRanking(); 
    } else { 
        personalTab.classList.remove('hidden');
        globalTab.classList.add('hidden');
        personalBtn.classList.add('text-white', 'border-indigo-500');
        personalBtn.classList.remove('text-gray-400');
        globalBtn.classList.remove('text-white', 'border-indigo-500');
        globalBtn.classList.add('text-gray-400');
    }
}

// Profil İşlemleri
function openAvatarModal() {
    const avatarGrid = document.getElementById('avatar-grid');
    avatarGrid.innerHTML = ''; 
    
    const currentAvatar = document.getElementById('profile-avatar-img').src;

    AVATAR_LIST.forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'avatar-option w-16 h-16';
        img.dataset.url = url; 

        if (url === currentAvatar) {
            img.classList.add('selected');
        }

        img.addEventListener('click', async () => {
            try {
                await saveProfileChanges({ avatarUrl: url }, true); 
                
                document.getElementById('profile-avatar-img').src = url;
                document.getElementById('main-menu-avatar').src = url;
                
                avatarGrid.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
                img.classList.add('selected');

                document.getElementById('avatar-selection-modal').classList.add('hidden');
            } catch (error) {
                showToast('Avatar kaydedilemedi: ' + error.message, true);
            }
        });
        
        avatarGrid.appendChild(img);
    });

    document.getElementById('avatar-selection-modal').classList.remove('hidden');
}

async function saveProfileChanges(dataToSave = {}, isAvatarSave = false) {
    const userId = getUserId();
    if (!userId) return;

    const saveButton = document.getElementById('save-profile-btn');
    
    if (!isAvatarSave && saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Kaydediliyor...';
    }

    try {
        const userRef = doc(db, "users", userId);
        
        if (Object.keys(dataToSave).length === 0) {
            const newUsername = document.getElementById('profile-username-input').value;
            if (!newUsername || newUsername.length < 3) {
                showToast('Kullanıcı adı en az 3 karakter olmalıdır.', true);
                if(saveButton) {
                    saveButton.disabled = false;
                    saveButton.textContent = 'Değişiklikleri Kaydet';
                }
                return; 
            }
            dataToSave.username = newUsername;
        }

        await updateDoc(userRef, dataToSave);

        const profile = getCurrentUserProfile();
        const newProfile = { ...profile, ...dataToSave };
        setCurrentUserProfile(newProfile);

        if (dataToSave.username) {
            document.getElementById('main-menu-username').textContent = dataToSave.username;
        }
        
        showToast('Profil başarıyla güncellendi!');

    } catch (error) {
        console.error("Profil güncellenirken hata:", error);
        showToast('Hata: ' + error.message, true);
    } finally {
        if (!isAvatarSave && saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Değişiklikleri Kaydet';
            updateQuestProgress('change_avatar', 1);
        }
    }
}

function initRegisterScreenAvatars() {
    const container = document.getElementById('register-avatar-list');
    const input = document.getElementById('register-selected-avatar-url');
    
    if (!container || !input) return;

    container.innerHTML = ''; 
    
    AVATAR_LIST.forEach((url, index) => {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'w-12 h-12 rounded-full border-4 border-transparent cursor-pointer transition hover:scale-110 object-cover bg-gray-700';
        
        if (index === 0) {
            img.classList.add('border-green-500', 'selected-reg-avatar');
            input.value = url;
        }

        img.onclick = () => {
            container.querySelectorAll('img').forEach(el => {
                el.classList.remove('border-green-500', 'selected-reg-avatar');
                el.classList.add('border-transparent');
            });
            img.classList.remove('border-transparent');
            img.classList.add('border-green-500', 'selected-reg-avatar');
            input.value = url;
        };

        container.appendChild(img);
    });
}

const openStatsScreen = () => {
    const profile = getCurrentUserProfile();
    if (!profile) return; 
    displayStats(profile); 
    showScreen('profile-screen');
    switchStatsTab('personal');
};

const openEditProfileScreen = () => {
    const profile = getCurrentUserProfile();
    if (!profile) return;
    
    document.getElementById('profile-avatar-img').src = profile.avatarUrl || getDefaultAvatar();
    document.getElementById('profile-username-input').value = profile.username || 'Kullanıcı';
    document.getElementById('profile-fullname-display').value = profile.fullname || '...';
    document.getElementById('profile-email-display').value = profile.email || '...';
    
    showScreen('edit-profile-screen');
};

// 4. AUTH VE BAŞLATMA
function initAuthListener() {
    onAuthStateChanged(auth, async (user) => { 
        const authLoading = document.getElementById('auth-loading');
        if (user) {
            if(authLoading) authLoading.classList.add('hidden');
            setUserId(user.uid);
            
            checkAndGenerateDailyQuests().then(() => {
                import('./ui.js').then(ui => ui.updateQuestBadge());
            });
            
            startGlobalGamesListener();

            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                const profileData = userSnap.data();
                if (profileData.lastLeagueMessage) {
                    const msg = profileData.lastLeagueMessage;
                    showToast(`${msg.title}\n${msg.body}\n+${msg.reward} Altın`, false);
                    updateDoc(userRef, { lastLeagueMessage: deleteField() });
                }
                setCurrentUserProfile(profileData);
                
                const username = profileData.username || 'Kullanıcı';
                const avatarUrl = profileData.avatarUrl || getDefaultAvatar(); 
                const userGold = profileData.gold || 0;
                
                const goldEl = document.getElementById('main-menu-gold-display');
                if (goldEl) goldEl.textContent = userGold;

                document.getElementById('main-menu-username').textContent = username;
                document.getElementById('main-menu-avatar').src = avatarUrl;
                
                // Form alanlarını doldur
                const pInput = document.getElementById('profile-username-input');
                if(pInput) pInput.value = username;
                const pAvatar = document.getElementById('profile-avatar-img');
                if(pAvatar) pAvatar.src = avatarUrl;
                
                const stats = profileData.stats || { played: 0, wins: 0, currentStreak: 0 };
                const winRate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
                document.getElementById('main-menu-stats').textContent = `Başarı: %${winRate} | Seri: ${stats.currentStreak}`;
                
                const friendsUnsub = listenToFriendships();
                const gamesUnsub = listenToMyGames();
                setFriendsUnsubscribe(friendsUnsub);
                setMyGamesUnsubscribe(gamesUnsub);

            } else {
                setCurrentUserProfile({ email: user.email });
            }
            
            // Yarım kalan oyun kontrolü
            const activeGameId = localStorage.getItem('activeGameId');
            if (activeGameId) {
                try {
                    const gameDoc = await getDoc(doc(db, "games", activeGameId));
                    if (gameDoc.exists() && gameDoc.data().status !== 'finished') {
                        showToast("Yarım kalan oyununa devam ediyorsun!");
                        if (gameDoc.data().gameType === 'multiplayer-br') {
                            await joinBRGame(activeGameId);
                        } else {
                            await joinGame(activeGameId);
                        }
                    } else {
                        localStorage.removeItem('activeGameId');
                        showScreen('main-menu-screen');
                    }
                } catch (error) {
                    console.error("Yarım kalan oyuna girerken hata:", error);
                    localStorage.removeItem('activeGameId');
                    showScreen('main-menu-screen');
                }
            } else {
                showScreen('main-menu-screen');
            }
            
        } else {
            if(authLoading) authLoading.classList.add('hidden');
            setUserId(null);
            setCurrentUserProfile(null);

            if (getFriendsUnsubscribe()) getFriendsUnsubscribe()();
            if (getMyGamesUnsubscribe()) getMyGamesUnsubscribe()();
            if (globalGamesUnsubscribe) globalGamesUnsubscribe();
            
            setFriendsUnsubscribe(null);
            setMyGamesUnsubscribe(null);

            showScreen('login-screen');
        }
    });
}

// 5. EVENT LISTENERS (TIKLAMA OLAYLARI)
function addEventListeners() {

    // --- GÖREVLER BUTONU ---
    const questsBtn = document.getElementById('quests-btn');
    const closeQuestsBtn = document.getElementById('close-quests-modal-btn');
    const questsModal = document.getElementById('quests-modal');

    if (questsBtn) {
        questsBtn.addEventListener('click', () => {
            import('./ui.js').then(ui => ui.openQuestsModal());
        });
    }

    if (closeQuestsBtn) {
        closeQuestsBtn.addEventListener('click', () => {
            if (questsModal) questsModal.classList.add('hidden');
        });
    }

    const loadMoreRankingBtn = document.getElementById('load-more-ranking-btn');
    if (loadMoreRankingBtn) {
        loadMoreRankingBtn.addEventListener('click', () => {
            fetchAndDisplayGlobalRanking(true); 
        });
    }

    // --- TEMA BUTONLARI ---
    const themeToggleButtons = document.querySelectorAll('#theme-toggle-btn, #theme-toggle-btn-footer');
    themeToggleButtons.forEach(btn => {
        btn.onclick = () => {
            const currentTheme = localStorage.getItem('theme') || 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            switchTheme(newTheme);
            playSound('click');
        };
    });

    // --- SES AÇ/KAPA ---
    const soundBtn = document.getElementById('sound-toggle-btn');
    const iconOn = document.getElementById('sound-icon-on');
    const iconOff = document.getElementById('sound-icon-off');

    const updateSoundIcon = () => {
        const isMuted = localStorage.getItem('soundMuted') === 'true';
        if (isMuted) {
            iconOn.classList.add('hidden');
            iconOff.classList.remove('hidden');
            soundBtn.classList.replace('text-green-400', 'text-gray-400');
        } else {
            iconOn.classList.remove('hidden');
            iconOff.classList.add('hidden');
            soundBtn.classList.replace('text-gray-400', 'text-green-400');
        }
    };

    if (soundBtn) {
        updateSoundIcon(); 
        soundBtn.addEventListener('click', () => {
            const isMuted = localStorage.getItem('soundMuted') === 'true';
            localStorage.setItem('soundMuted', !isMuted); 
            updateSoundIcon();
            if (isMuted) playSound('click');
        });
    }

    // --- YENİ BR BUTONLARI ---
    if (btnCreatePublicBr) {
        btnCreatePublicBr.addEventListener('click', () => createBRGame('public'));
    }
    if (btnCreatePrivateBr) {
        btnCreatePrivateBr.addEventListener('click', () => createBRGame('private'));
    }
    if (btnJoinRandomBr) {
        btnJoinRandomBr.addEventListener('click', () => joinRandomBRGame());
    }

    // --- KIRTASİYE BUTONLARI ---
    if (marketBtn) {
        marketBtn.addEventListener('click', () => openKirtasiyeScreen());
    }
    if (backToMainFromMarketBtn) {
        backToMainFromMarketBtn.addEventListener('click', () => showScreen('main-menu-screen'));
    }

    // --- GERİ TUŞU YÖNETİMİ ---
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.screen) {
            showScreen(event.state.screen, true);
        } else {
            showScreen('main-menu-screen', true);
        }
    });

    // --- AUTH EKRANLARI ---
    if(loginBtn) loginBtn.addEventListener('click', handleLogin);
    if(logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if(registerBtn) registerBtn.addEventListener('click', handleRegister);
    if(goToRegisterBtn) goToRegisterBtn.addEventListener('click', () => showScreen('register-screen'));
    if(backToLoginBtn) backToLoginBtn.addEventListener('click', () => showScreen('login-screen'));

    // --- ANA MENÜ NAVİGASYONU ---
    if(newGameBtn) newGameBtn.addEventListener('click', () => showScreen('new-game-screen'));
    if(myGamesBtn) myGamesBtn.addEventListener('click', () => showScreen('my-games-screen'));
    if(friendsBtn) friendsBtn.addEventListener('click', () => showScreen('friends-screen'));

    // --- KELİMELİG ---
    if (kelimeligBtn) {
        kelimeligBtn.addEventListener('click', openKelimeligScreen);
    }
    if (backToMainFromLeagueBtn) {
        backToMainFromLeagueBtn.addEventListener('click', () => showScreen('main-menu-screen'));
    }

    // --- SÖZLÜK ---
    if (dictionaryMenuBtn) {
        dictionaryMenuBtn.addEventListener('click', openDictionaryScreen);
    }
    if (backToMainFromDictionaryBtn) {
        backToMainFromDictionaryBtn.addEventListener('click', () => showScreen('main-menu-screen'));
    }

     // ALT MENÜDEKİ SÖZLÜK BUTONU
    const footerDictionaryBtn = document.getElementById('dictionary-btn-footer');
    if (footerDictionaryBtn) {
        footerDictionaryBtn.addEventListener('click', () => {
            import('./ui.js').then(ui => ui.openDictionaryScreen());
        });
    }

    // --- LİG SEKMELERİ ---
    if (btnShowFixtures) btnShowFixtures.addEventListener('click', () => switchLeagueTab('fixtures'));
    if (btnShowStandings) btnShowStandings.addEventListener('click', () => switchLeagueTab('standings'));

    // --- İSTATİSTİKLER ---
    if (statsBtn) statsBtn.addEventListener('click', openStatsScreen);
    if (statsBtnMain) statsBtnMain.addEventListener('click', openStatsScreen);

    const personalStatsBtn = document.getElementById('show-personal-stats-tab-btn');
    if(personalStatsBtn) personalStatsBtn.addEventListener('click', () => switchStatsTab('personal'));
    
    const globalStatsBtn = document.getElementById('show-global-ranking-tab-btn');
    if(globalStatsBtn) globalStatsBtn.addEventListener('click', () => switchStatsTab('global'));

    // --- NASIL OYNANIR ---
    if(howToPlayBtn) {
        howToPlayBtn.addEventListener('click', () => {
            showScreen('how-to-play-screen');
            playTutorialAnimation(); 
            updateQuestProgress('view_tutorial', 1);
        });
    }
    if(closeHowToPlayBtn) {
        closeHowToPlayBtn.addEventListener('click', () => {
            history.back();
            stopTutorialAnimation(); 
        });
    }

    // --- REKLAM / DAVET ---
    const btnMarketInvite = document.getElementById('btn-market-invite');
    if (btnMarketInvite) {
        btnMarketInvite.addEventListener('click', () => {
            const myId = getUserId();
            const inviteLink = `https://kelime-yar-mas.vercel.app/?ref=${myId}`;
            const text = `Kelime Yarışması'na katıl, birlikte oynayalım! 🎁\n${inviteLink}`;
            
            if (navigator.share) {
                navigator.share({
                    title: 'Kelime Yarışması',
                    text: text,
                    url: inviteLink
                }).catch(console.error);
            } else {
                navigator.clipboard.writeText(text);
                showToast("Link kopyalandı! Arkadaşına gönder.", false);
            }
            updateQuestProgress('invite_friend', 1);
        });
    }

    // Reklam izle butonu
    document.querySelectorAll('.buy-gold-btn[data-amount="500"]').forEach(btn => {
        btn.addEventListener('click', () => {
            updateQuestProgress('watch_ad', 1);
        });
    });

    // --- KAPATMA / GERİ TUŞLARI ---
    if(closeProfileBtn) closeProfileBtn.addEventListener('click', () => history.back());
    const backEditProfile = document.getElementById('back-to-main-from-edit-profile-btn');
    if(backEditProfile) backEditProfile.addEventListener('click', () => history.back());

    if(backToMainMenuBtn) backToMainMenuBtn.addEventListener('click', () => history.back());
    if(backToMainMenuFromGamesBtn) backToMainMenuFromGamesBtn.addEventListener('click', () => history.back()); 
    if(backToMainFromFriendsBtn) backToMainFromFriendsBtn.addEventListener('click', () => history.back());

    // --- OYUN MODU SEÇİMİ ---
if(vsCpuBtn) {
        vsCpuBtn.addEventListener('click', () => {
            // Direkt başlatmak yerine kontrol fonksiyonuna yönlendir
            import('./game.js').then(m => m.handleVsCpuClick());
        });
    }
    
    if(dailyWordBtn) dailyWordBtn.addEventListener('click', () => startNewGame({ mode: 'daily' }));
    
    if(randomGameBtn) {
        randomGameBtn.addEventListener('click', () => findOrCreateRandomGame({ 
            timeLimit: 43200, 
            matchLength: 1,
            gameType: 'random_loose' 
        }));
    }
    
    if(seriesGameBtn) {
        seriesGameBtn.addEventListener('click', () => findOrCreateRandomGame({ timeLimit: 120, matchLength: 5, gameType: 'random_series' }));
    }

    // --- ONLINE SETUP ---
    if(withFriendsBtn) {
        withFriendsBtn.addEventListener('click', () => {
            showScreen('friends-screen');
            switchFriendTab('friends'); 
        });
    }
    
    if(multiplayerBrBtn) multiplayerBrBtn.addEventListener('click', () => showScreen('br-setup-screen'));
    if(backToModeMultiBtn) backToModeMultiBtn.addEventListener('click', () => history.back());
    if(backToModeBrBtn) backToModeBrBtn.addEventListener('click', () => history.back());

    // --- OYUN OLUŞTURMA ---
    if(createGameBtn) {
        createGameBtn.addEventListener('click', () => {
            const friendId = getChallengedFriendId(); 
            
            if (!friendId) {
                showToast("Lütfen önce 'Arkadaşlar' listesinden birini seçip 'Davet Et'e basın.", true);
                showScreen('friends-screen'); 
                return;
            }

            createGame({ 
                invitedFriendId: friendId,
                timeLimit: parseInt(document.getElementById('time-select-multi').value, 10),
                matchLength: parseInt(document.getElementById('match-length-select').value, 10),
                isHardMode: document.getElementById('hard-mode-checkbox-multi').checked,
                gameType: 'friend'
            });

            setChallengedFriendId(null); 
        });
    }
    
    if(joinGameBtn) {
        joinGameBtn.addEventListener('click', () => {
            const gameId = document.getElementById('game-id-input').value.toUpperCase();
            if (gameId) joinGame(gameId);
        });
    }

    // --- SEKMELER ---
    if(showActiveGamesTabBtn) showActiveGamesTabBtn.addEventListener('click', () => switchMyGamesTab('active'));
    if(showFinishedGamesTabBtn) showFinishedGamesTabBtn.addEventListener('click', () => switchMyGamesTab('finished'));
    if(showInvitesTabBtn) showInvitesTabBtn.addEventListener('click', () => switchMyGamesTab('invites'));

    if(showFriendsTabBtn) showFriendsTabBtn.addEventListener('click', () => switchFriendTab('friends'));
    if(showRequestsTabBtn) showRequestsTabBtn.addEventListener('click', () => switchFriendTab('requests'));
    if(showAddFriendTabBtn) showAddFriendTabBtn.addEventListener('click', () => switchFriendTab('add'));
    
    if(searchFriendBtn) searchFriendBtn.addEventListener('click', searchUsers);
    
    // --- OYUN İÇİ BUTONLAR ---
    if(leaveGameButton) leaveGameButton.addEventListener('click', leaveGame);
    if(startGameBtn) startGameBtn.addEventListener('click', startGame);

    if(mainMenuBtn) mainMenuBtn.addEventListener('click', leaveGame);

    const newWordRematchBtn = document.getElementById('new-word-rematch-btn');
    if (newWordRematchBtn) {
        newWordRematchBtn.addEventListener('click', startRematch);
    }
    
    // --- KOPYALA & PAYLAŞ ---
    if(copyGameIdBtn) {
        copyGameIdBtn.addEventListener('click', () => {
            const gameId = document.getElementById('game-id-display').textContent;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(gameId).then(() => showToast("Oyun ID kopyalandı!"));
            }
        });
    }

    if(shareGameBtn) {
        shareGameBtn.addEventListener('click', () => {
            const gameId = document.getElementById('game-id-display').textContent;
            const text = `Kelime Yarışması'na gel! Oyun ID: ${gameId}`;
            if (navigator.share) {
                navigator.share({ title: 'Kelime Yarışması', text: text }).catch(console.error);
            } else {
                navigator.clipboard.writeText(text).then(() => showToast("Davet linki kopyalandı!"));
            }
        });
    }

    // --- JOKERLER ---
    if (jokerPresentBtn) jokerPresentBtn.addEventListener('click', usePresentJoker);
    if (jokerCorrectBtn) jokerCorrectBtn.addEventListener('click', useCorrectJoker);
    if (jokerRemoveBtn) jokerRemoveBtn.addEventListener('click', useRemoveJoker);

    // --- PROFİL ---
    const avatarImg = document.getElementById('main-menu-avatar');
    if(avatarImg) avatarImg.addEventListener('click', openEditProfileScreen);
    
    const saveProfileBtn = document.getElementById('save-profile-btn');
    if(saveProfileBtn) saveProfileBtn.addEventListener('click', () => saveProfileChanges());
    
    const changeAvatarBtn = document.getElementById('change-avatar-btn');
    if(changeAvatarBtn) changeAvatarBtn.addEventListener('click', openAvatarModal);
    
    const closeAvatarModalBtn = document.getElementById('close-avatar-modal-btn');
    if(closeAvatarModalBtn) closeAvatarModalBtn.addEventListener('click', () => {
        document.getElementById('avatar-selection-modal').classList.add('hidden');
    });

    // --- KLAVYE DİNLEYİCİSİ (Window) ---
    window.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName === 'INPUT') return;
        const gameScreen = document.getElementById('game-screen');
        if (gameScreen && gameScreen.classList.contains('hidden')) return;

        if (e.key === 'Enter') {
            handleKeyPress('ENTER');
        } else if (e.key === 'Backspace') {
            handleKeyPress('⌫');
        } else if (e.key.length === 1 && e.key.match(/[a-zA-ZçğıöşüÇĞİÖŞÜ]/i)) {
            handleKeyPress(e.key.toLocaleUpperCase('TR'));
        }
    });

    // --- QUICK CHAT ---
    const chatMenu = document.getElementById('quick-chat-menu');
    document.addEventListener('click', (e) => {
        const chatBtn = e.target.closest('#btn-toggle-chat');
        if (chatBtn) {
            e.stopPropagation();
            if (chatMenu) chatMenu.classList.toggle('hidden');
            playSound('click');
        } else if (chatMenu && !chatMenu.classList.contains('hidden') && !e.target.closest('#quick-chat-menu')) {
            chatMenu.classList.add('hidden');
        }
    });

    if (chatMenu) {
        chatMenu.querySelectorAll('.chat-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const msg = btn.dataset.msg;
                sendQuickChat(msg);
                chatMenu.classList.add('hidden');
                playSound('click');
            });
        });
    }

    // --- PAYLAŞ BUTONLARI ---
    if (shareResultsBtn) {
        shareResultsBtn.addEventListener('click', () => {
            const text = "Kelime Yarışması'nda skoruma bak! Sen de oyna.";
            if (navigator.share) {
                navigator.share({ title: 'Kelime Yarışması', text: text }).catch(console.error);
            } else {
                navigator.clipboard.writeText(text);
                showToast("Sonuç panoya kopyalandı!", false);
            }
            updateQuestProgress('share_result', 1);
        });
    }

    const dailyShareBtn = document.getElementById('daily-share-btn');
    if (dailyShareBtn) {
        dailyShareBtn.addEventListener('click', () => {
            const text = "Günün Kelimesi'ni çözdüm! Sıra sende.";
            if (navigator.share) {
                navigator.share({ title: 'Günün Kelimesi', text: text }).catch(console.error);
            } else {
                navigator.clipboard.writeText(text);
                showToast("Sonuç panoya kopyalandı!", false);
            }
            updateQuestProgress('share_result', 1);
        });
    }
}

// 6. UYGULAMAYI BAŞLAT (initApp fonksiyonu GÖVDESİ EKLENDİ)
function initApp() {
    checkReferral();
    initUI();
    initRegisterScreenAvatars();
    addEventListeners();
    initAuthListener();
    initTheme();
    
    document.addEventListener('click', () => {
       import('./notifications.js').then(m => m.requestNotificationPermission()).catch(() => {});
    }, { once: true });
}

// initApp fonksiyonunu çağır
initApp();
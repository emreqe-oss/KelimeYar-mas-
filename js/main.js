// js/main.js - TAM DOSYA (Meydan Oku butonu eklendi, Gevşek Oyun güncellendi, EKSİKSİZ)

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
    updateDoc
} from "firebase/firestore"; 
import { handleLogin, handleRegister, handleLogout } from './auth.js';
import { 
    searchUsers,
    listenToFriendships,
    listenToMyGames 
} from './friends.js';

import { 
    initUI, 
    showScreen, 
    displayStats, 
    switchFriendTab, 
    switchMyGamesTab,
    loginBtn, registerBtn, logoutBtn, goToRegisterBtn, backToLoginBtn,
    newGameBtn, myGamesBtn, friendsBtn, statsBtn, statsBtnMain,
    howToPlayBtn, closeHowToPlayBtn, themeLightBtn, themeDarkBtn,
    backToMainMenuBtn, 
    backToMainMenuFromGamesBtn,
    backToMainFromFriendsBtn,
    randomGameBtn, seriesGameBtn, withFriendsBtn, vsCpuBtn, multiplayerBrBtn,
    dailyWordBtn,
    showActiveGamesTabBtn, showFinishedGamesTabBtn, showInvitesTabBtn,
    showFriendsTabBtn, showRequestsTabBtn, showAddFriendTabBtn, searchFriendBtn,
    closeProfileBtn,
    createGameBtn, joinGameBtn, createBRGameBtn, joinBRGameBtn, 
    backToModeMultiBtn, backToModeBrBtn,
    leaveGameButton, startGameBtn, copyGameIdBtn, shareGameBtn,
    newRoundBtn, mainMenuBtn, shareResultsBtn,
    jokerPresentBtn, jokerCorrectBtn, jokerRemoveBtn,
    playTutorialAnimation,
    stopTutorialAnimation
} from './ui.js';
import { 
    startNewGame, 
    findOrCreateRandomGame, 
    joinGame, 
    createBRGame, 
    joinBRGame, 
    leaveGame, 
    handleKeyPress, 
    startGame, 
    listenToGameUpdates, 
    createGame,
    usePresentJoker, 
    useCorrectJoker, 
    useRemoveJoker,
    startRematch 
} from './game.js';
import { showToast } from './utils.js';

// Uygulamayı başlatan ana fonksiyon
function initApp() {
    initUI();
    addEventListeners();
    initAuthListener();
    initTheme();
}

// Kullanıcı giriş/çıkış durumunu dinleyen fonksiyon
function initAuthListener() {
    onAuthStateChanged(auth, async (user) => { 
        const authLoading = document.getElementById('auth-loading');
        if (user) {
            authLoading.classList.add('hidden');
            setUserId(user.uid);
            
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                const profileData = userSnap.data();
                setCurrentUserProfile(profileData);
                
                const username = profileData.username || 'Kullanıcı';
                const avatarUrl = profileData.avatarUrl || getDefaultAvatar(); 

                // 1. Ana Menüdeki Başlığı Güncelle
                document.getElementById('main-menu-username').textContent = username;
                document.getElementById('main-menu-avatar').src = avatarUrl;
                
                // 2. YENİ Profil DÜZENLEME Ekranındaki Alanları Doldur
                document.getElementById('profile-username-input').value = username;
                document.getElementById('profile-avatar-img').src = avatarUrl;
                document.getElementById('profile-fullname-display').value = profileData.fullname || '...';
                document.getElementById('profile-email-display').value = profileData.email || '...';

                const stats = profileData.stats || { played: 0, wins: 0, currentStreak: 0 };
                const winRate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
                document.getElementById('main-menu-stats').textContent = `Başarı: %${winRate} | Seri: ${stats.currentStreak}`;
                
                const friendsUnsub = listenToFriendships();
                const gamesUnsub = listenToMyGames();
                setFriendsUnsubscribe(friendsUnsub);
                setMyGamesUnsubscribe(gamesUnsub);

            } else {
                console.warn("Kullanıcı profili bulunamadı.");
                setCurrentUserProfile({ email: user.email });
            }
            
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
                showScreen('main-menu-screen');// YENİ: Ana menüyü "Geri" tuşu için temel (en alt) olarak ayarla
                history.replaceState({ screen: 'main-menu-screen' }, 'Ana Menü', '#main-menu-screen');
            }
            
        } else {
            authLoading.classList.add('hidden');
            setUserId(null);
            setCurrentUserProfile(null);

            if (getFriendsUnsubscribe()) getFriendsUnsubscribe()();
            if (getMyGamesUnsubscribe()) getMyGamesUnsubscribe()();
            setFriendsUnsubscribe(null);
            setMyGamesUnsubscribe(null);

            showScreen('login-screen');
        }
    });
}

// Global Sıralama (MEYDAN OKUMA BUTONU EKLENDİ)
async function fetchAndDisplayGlobalRanking() {
    const listElement = document.getElementById('global-ranking-list');
    const loadingElement = document.getElementById('global-ranking-loading');
    if (!listElement || !loadingElement) return;

    listElement.innerHTML = '';
    loadingElement.classList.remove('hidden');
    loadingElement.textContent = "Sıralama yükleniyor..."; 

    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, 
            orderBy("stats.wins", "desc"), 
            orderBy("stats.played", "asc"),
            limit(20) 
        );

        const querySnapshot = await getDocs(q);
        let rank = 1;
        const currentUserId = getUserId(); 

        if (querySnapshot.empty) {
            loadingElement.textContent = "Henüz sıralamaya girecek kimse yok.";
            return;
        }

        querySnapshot.forEach(doc => {
            const user = doc.data();
            const stats = user.stats || { played: 0, wins: 0 };
            
            if (!user.username) return; 

            const row = document.createElement('div');
            row.className = 'ranking-row'; 
            
            const isMe = doc.id === currentUserId;
            if (isMe) {
                row.classList.add('current-user'); 
            }

            const winRate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
            const wins = stats.wins || 0;

            row.innerHTML = `
                <div class="rank-details">
                    <span class="rank-number">${rank}.</span>
                    <span class="rank-username">${user.username}</span>
                </div>
                <div class="rank-actions">
                    <div class="rank-score">
                        <span>Başarı: <strong>%${winRate}</strong></span> | 
                        <span>Kazanma: <strong>${wins}</strong></span>
                    </div>
                </div>
            `;
            
            if (!isMe) {
                const challengeButton = document.createElement('button');
                challengeButton.className = 'challenge-btn';
                challengeButton.textContent = 'Meydan Oku';
                challengeButton.dataset.opponentId = doc.id;
                challengeButton.dataset.opponentName = user.username;
                challengeButton.addEventListener('click', handleChallengeClick);
                
                row.querySelector('.rank-actions').appendChild(challengeButton);
            }
            
            listElement.appendChild(row);
            rank++;
        });

        loadingElement.classList.add('hidden');

    } catch (error) {
        console.error("Sıralama yüklenirken hata:", error);
        loadingElement.textContent = "Sıralama yüklenemedi.";
    }
}

// İstatistik ekranındaki sekmeleri (tab) yöneten fonksiyon
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
    } else { // 'personal'
        personalTab.classList.remove('hidden');
        globalTab.classList.add('hidden');
        personalBtn.classList.add('text-white', 'border-indigo-500');
        personalBtn.classList.remove('text-gray-400');
        globalBtn.classList.remove('text-white', 'border-indigo-500');
        globalBtn.classList.add('text-gray-400');
    }
}

// SADECE istatistikleri açan fonksiyon
const openStatsScreen = () => {
    const profile = getCurrentUserProfile();
    if (!profile) return; 

    displayStats(profile); 
    
    showScreen('profile-screen');
    switchStatsTab('personal');
};

// Profili Düzenleme ekranını açan fonksiyon
const openEditProfileScreen = () => {
    const profile = getCurrentUserProfile();
    if (!profile) return;
    
    document.getElementById('profile-avatar-img').src = profile.avatarUrl || getDefaultAvatar();
    document.getElementById('profile-username-input').value = profile.username || 'Kullanıcı';
    document.getElementById('profile-fullname-display').value = profile.fullname || '...';
    document.getElementById('profile-email-display').value = profile.email || '...';
    
    showScreen('edit-profile-screen');
};

// Tüm butonlara tıklama olaylarını (event listener) ekleyen fonksiyon
function addEventListeners() {


    // ===================================================
    // === BAŞLANGIÇ: YENİ GERİ TUŞU DİNLEYİCİSİ ===
    // ===================================================
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.screen) {
            // Tarayıcı geri geldiğinde, 'showScreen'i 'isBackNavigation = true'
            // parametresiyle çağırarak history'ye tekrar eklemesini engelle.
            showScreen(event.state.screen, true);
        } else {
            // Eğer history'de bir state yoksa (ilk sayfa), ana menüyü göster
            showScreen('main-menu-screen', true);
        }
    });
    // ===================================================
    // === BİTİŞ: YENİ GERİ TUŞU DİNLEYİCİSİ ===
    // ===================================================

    // Auth Ekranları
    loginBtn.addEventListener('click', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    registerBtn.addEventListener('click', handleRegister);
    goToRegisterBtn.addEventListener('click', () => showScreen('register-screen'));
    backToLoginBtn.addEventListener('click', () => showScreen('login-screen'));

    // Ana Menü
    newGameBtn.addEventListener('click', () => showScreen('new-game-screen'));
    myGamesBtn.addEventListener('click', () => showScreen('my-games-screen'));
    friendsBtn.addEventListener('click', () => showScreen('friends-screen'));

    // İstatistik Butonları
    statsBtn.addEventListener('click', openStatsScreen);
    statsBtnMain.addEventListener('click', openStatsScreen);

    // İstatistik Sekme Butonları
    document.getElementById('show-personal-stats-tab-btn').addEventListener('click', () => switchStatsTab('personal'));
    document.getElementById('show-global-ranking-tab-btn').addEventListener('click', () => switchStatsTab('global'));

    // "Nasıl Oynanır"
    howToPlayBtn.addEventListener('click', () => {
        showScreen('how-to-play-screen');
        playTutorialAnimation(); 
    });
    closeHowToPlayBtn.addEventListener('click', () => {
        showScreenhistory.back();
        stopTutorialAnimation(); 
    });

    // Kapatma Butonları
    closeProfileBtn.addEventListener('click', () => showScreenhistory.back());
    document.getElementById('back-to-main-from-edit-profile-btn').addEventListenerhistory.back();


    // Tema Butonları
    themeLightBtn.addEventListener('click', () => switchTheme('light'));
    themeDarkBtn.addEventListener('click', () => switchTheme('dark'));

    // Geri Butonları
    backToMainMenuBtn.addEventListener('click', () => showScreenhistory.back());
    backToMainMenuFromGamesBtn.addEventListener('click', () => showScreenhistory.back());
    backToMainFromFriendsBtn.addEventListener('click', () => showScreenhistory.back());

    // Oyun Modu Seçim
    vsCpuBtn.addEventListener('click', () => startNewGame({ mode: 'vsCPU' }));
    dailyWordBtn.addEventListener('click', () => startNewGame({ mode: 'daily' }));
    
    // GÜNCELLEME: "Gevşek Oyun" artık 1 tur (matchLength: 1)
    randomGameBtn.addEventListener('click', () => findOrCreateRandomGame({ 
        timeLimit: 43200, 
        matchLength: 1, // 5'ten 1'e düşürüldü
        gameType: 'random_loose' 
    }));
    
    seriesGameBtn.addEventListener('click', () => findOrCreateRandomGame({ timeLimit: 45, matchLength: 5, gameType: 'random_series' }));

    // Online Oyun Kurma / Katılma
    withFriendsBtn.addEventListener('click', () => {
        showScreen('friends-screen');
        switchFriendTab('friends'); 
    });
    
    multiplayerBrBtn.addEventListener('click', () => showScreen('br-setup-screen'));
    backToModeMultiBtn.addEventListener('click', () => showScreen('new-game-screen'));
    backToModeBrBtn.addEventListener('click', () => showScreen('new-game-screen'));

    // Online Multiplayer
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
    
    joinGameBtn.addEventListener('click', () => {
        const gameId = document.getElementById('game-id-input').value.toUpperCase();
        if (gameId) joinGame(gameId);
    });

    // Battle Royale
    createBRGameBtn.addEventListener('click', () => createBRGame());
    joinBRGameBtn.addEventListener('click', () => {
        const gameId = document.getElementById('game-id-input-br').value.toUpperCase();
        if (gameId) joinBRGame(gameId);
    });

    // Oyunlarım Sekmeleri
    showActiveGamesTabBtn.addEventListener('click', () => switchMyGamesTab('active'));
    showFinishedGamesTabBtn.addEventListener('click', () => switchMyGamesTab('finished'));
    showInvitesTabBtn.addEventListener('click', () => switchMyGamesTab('invites'));

    // Arkadaşlar Sekmeleri
    showFriendsTabBtn.addEventListener('click', () => switchFriendTab('friends'));
    showRequestsTabBtn.addEventListener('click', () => switchFriendTab('requests'));
    showAddFriendTabBtn.addEventListener('click', () => switchFriendTab('add'));
    if (searchFriendBtn) {
        searchFriendBtn.addEventListener('click', searchUsers);
    }
    
    // Oyun İçi Butonlar
    leaveGameButton.addEventListener('click', leaveGame);
    startGameBtn.addEventListener('click', startGame);

    // Skor Ekranı Butonları
    mainMenuBtn.addEventListener('click', leaveGame);
// === YENİ EKLENEN RÖVANŞ BUTONU ===
    const newWordRematchBtn = document.getElementById('new-word-rematch-btn');
    if (newWordRematchBtn) {
        newWordRematchBtn.addEventListener('click', startRematch);
    }
    // === BİTİŞ ===    
    // Kopyala & Paylaş
    copyGameIdBtn.addEventListener('click', () => {
        const gameId = document.getElementById('game-id-display').textContent;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(gameId).then(() => {
                showToast("Oyun ID kopyalandı!");
            });
        }
    });

    shareGameBtn.addEventListener('click', () => {
        const gameId = document.getElementById('game-id-display').textContent;
        const text = `Kelime Yarışması'na gel! Oyun ID: ${gameId}`;
        if (navigator.share) {
            navigator.share({
                title: 'Kelime Yarışması',
                text: text,
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(text).then(() => {
                showToast("Davet linki kopyalandı!");
            });
        }
    });

    // JOKER BUTONLARI BAĞLANTILARI
    if (jokerPresentBtn) jokerPresentBtn.addEventListener('click', usePresentJoker);
    if (jokerCorrectBtn) jokerCorrectBtn.addEventListener('click', useCorrectJoker);
    if (jokerRemoveBtn) jokerRemoveBtn.addEventListener('click', useRemoveJoker);

    // === PROFİL VE AVATAR LISTENERS ===
    
    document.getElementById('main-menu-avatar').addEventListener('click', openEditProfileScreen);
    document.getElementById('save-profile-btn').addEventListener('click', () => saveProfileChanges());
    document.getElementById('change-avatar-btn').addEventListener('click', openAvatarModal);
    document.getElementById('close-avatar-modal-btn').addEventListener('click', () => {
        document.getElementById('avatar-selection-modal').classList.add('hidden');
    });

    // Fiziksel Klavye Dinleyicisi
    window.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName === 'INPUT') return;
        if (document.getElementById('game-screen').classList.contains('hidden')) return;

        if (e.key === 'Enter') {
            handleKeyPress('ENTER');
        } else if (e.key === 'Backspace') {
            handleKeyPress('⌫');
        } else if (e.key.length === 1 && e.key.match(/[a-zA-ZçğıöşüÇĞİÖŞÜ]/i)) {
            handleKeyPress(e.key.toLocaleUpperCase('TR'));
        }
    });
}

// Tema Yönetimi
function switchTheme(theme) {
    if (theme === 'light') {
        document.body.classList.add('theme-light');
        localStorage.setItem('theme', 'light');
    } else {
        document.body.classList.remove('theme-light');
        localStorage.setItem('theme', 'dark');
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    switchTheme(savedTheme);
}

// ===================================================
// === AVATAR/PROFİL FONKSİYONLARI ===
// ===================================================

const AVATAR_LIST = [
    // (Avatarları ertelediğimiz için varsayılan liste)
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar1&background=%236b7280',
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar2&background=%23ef4444',
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar3&background=%23f59e0b',
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar4&background=%2310b981',
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar5&background=%233b82f6',
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=avatar6&background=%238b5cf6',
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=huso&background=%23ec4899',
    'https://api.dicebear.com/8.x/pixel-art/svg?seed=gemini&background=%2314b8a6'
];

function getDefaultAvatar() {
    return 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Ccircle cx=%2750%27 cy=%2750%27 r=%2750%27 fill=%27%236B7280%27/%3E%3C/svg%3E';
}

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
    
    if (!isAvatarSave) {
        saveButton.disabled = true;
        saveButton.textContent = 'Kaydediliyor...';
    }

    try {
        const userRef = doc(db, "users", userId);
        
        if (Object.keys(dataToSave).length === 0) {
            const newUsername = document.getElementById('profile-username-input').value;
            if (!newUsername || newUsername.length < 3) {
                showToast('Kullanıcı adı en az 3 karakter olmalıdır.', true);
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
        if (!isAvatarSave) {
            saveButton.disabled = false;
            saveButton.textContent = 'Değişiklikleri Kaydet';
        }
    }
}

// ===================================================
// === YENİ: MEYDAN OKUMA FONKSİYONU ===
// ===================================================
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
        // "Gevşek Oyun" ayarları (12 saat, 1 tur)
        await createGame({ 
            invitedFriendId: opponentId,
            timeLimit: 43200, // 12 Saat
            matchLength: 1,   // 1 Tur
            isHardMode: false,
            gameType: 'friend'
        });

        showToast(`${opponentName} adlı oyuncuya meydan okundu!`);
        showScreen('my-games-screen');
        switchMyGamesTab('active'); 

    } catch (error) {
        console.error("Meydan okuma başarısız:", error);
        showToast("Hata: " + error.message, true);
        button.disabled = false;
        button.textContent = 'Meydan Oku';
    }
}

// Uygulamayı başlat
initApp();
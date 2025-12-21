// js/main.js - TAM DOSYA (Düzeltilmiş)

// 1. TÜM IMPORTLAR EN ÜSTTE OLMALI
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
    updateDoc, where, onSnapshot, deleteField, startAfter // <-- where ve onSnapshot eklendi
} from "firebase/firestore"; 

import { handleLogin, handleRegister, handleLogout } from './auth.js';
import { 
    searchUsers,
    listenToFriendships,
    listenToMyGames 
} from './friends.js';

import { 
    initUI, 
    switchLeagueTab, btnShowFixtures, btnShowStandings, 
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
    
    // Sözlük
    dictionaryMenuBtn, 
    backToMainFromDictionaryBtn,
    openDictionaryScreen,
    btnCreatePublicBr, btnCreatePrivateBr, btnJoinRandomBr
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
    startRematch,
    abandonGame,
    joinRandomBRGame,
    sendQuickChat // <-- Eklendi
} from './game.js';

import { showToast, playSound } from './utils.js'; // <-- Düzeltildi


let lastVisibleRankDoc = null; // Son çekilen dökümanı tutar
let currentRankCount = 1;      // Sıralama sayısını tutar
let isRankingLoading = false;  // Çift tıklamayı önlemek için

// --- SERVICE WORKER KAYDI (Bunu Ekle) ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js')
    .then((registration) => {
      console.log('Service Worker başarıyla kaydedildi, Scope:', registration.scope);
    })
    .catch((err) => {
      console.error('Service Worker kaydı başarısız:', err);
    });
}
// ----------------------------------------

// 2. DEĞİŞKENLER
let globalGamesUnsubscribe = null;

// --- REFERANS KONTROLÜ (YENİ) ---
function checkReferral() {
    const urlParams = new URLSearchParams(window.location.search);
    const refId = urlParams.get('ref');
    
    if (refId) {
        // Davet eden kişinin ID'sini tarayıcı kapanana kadar sakla
        sessionStorage.setItem('invitedBy', refId);
        console.log("Referans tespit edildi:", refId);
    }
}
// --------------------------------
// 3. ANA FONKSİYONLAR
function initApp() {
    checkReferral();
    initUI();
    initRegisterScreenAvatars();
    addEventListeners();
    initAuthListener();
    initTheme();
    // Kullanıcı sayfada herhangi bir yere ilk tıkladığında bildirim izni iste
    document.addEventListener('click', () => {
       import('./notifications.js').then(m => m.requestNotificationPermission());
    }, { once: true });
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
            
            // Eğer yeni bir oyun "playing" durumuna geçtiyse
            if (change.type === "modified" && gameData.status === 'playing') {
                const gameScreen = document.getElementById('game-screen');
                // Kullanıcı o an oyun ekranında değilse bildirim göster
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

function initAuthListener() {
    onAuthStateChanged(auth, async (user) => { 
        const authLoading = document.getElementById('auth-loading');
        if (user) {
            authLoading.classList.add('hidden');
            setUserId(user.uid);
            
            // Günlük Görevleri Kontrol Et
            import('./game.js').then(m => m.checkAndGenerateDailyQuests()).then(() => {
                // Rozeti güncelle
                import('./ui.js').then(ui => ui.updateQuestBadge());
            });
            
            // --- YENİ: Global dinleyiciyi başlat ---
            startGlobalGamesListener();
            // --------------------------------------

            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                const profileData = userSnap.data();
                // --- LİG SONUCU BİLDİRİMİ (YENİ) ---
                if (profileData.lastLeagueMessage) {
                    const msg = profileData.lastLeagueMessage;
                    import('./utils.js').then(u => {
                        // Özel, kalıcı ve şık bir toast veya modal gösterilebilir.
                        // Şimdilik standart toast ile gösteriyoruz:
                        u.showToast(`${msg.title}\n${msg.body}\n+${msg.reward} Altın`, false);
                    });
                    
                    // Mesajı bir daha göstermemek için sil
                    updateDoc(userRef, { lastLeagueMessage: deleteField() });
                }
                // ------------------------------------
                setCurrentUserProfile(profileData);
                
                const username = profileData.username || 'Kullanıcı';
                const avatarUrl = profileData.avatarUrl || getDefaultAvatar(); 
                const userGold = profileData.gold || 0;
                const mainMenuGoldEl = document.getElementById('main-menu-gold-display');
                if (mainMenuGoldEl) mainMenuGoldEl.textContent = userGold;

                document.getElementById('main-menu-username').textContent = username;
                document.getElementById('main-menu-avatar').src = avatarUrl;
                
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
            
            // Yarım kalan oyunu kontrol et
            const activeGameId = localStorage.getItem('activeGameId');
            if (activeGameId) {
                try {
                    const gameDoc = await getDoc(doc(db, "games", activeGameId));
                    if (gameDoc.exists() && gameDoc.data().status !== 'finished') {
                        showToast("Yarım kalan oyununa devam ediyorsun!");
                        // Radar ekranı takılmasın diye direkt oyuna alıyoruz (Resume)
                        // İstersek burada da status kontrolü yapabiliriz ama basitleştirelim:
                        if (gameDoc.data().gameType === 'multiplayer-br') {
                            await joinBRGame(activeGameId);
                        } else {
                            await joinGame(activeGameId);
                        }
                    } else {
                        localStorage.removeItem('activeGameId');
                        showScreen('main-menu-screen');
                        history.replaceState({ screen: 'main-menu-screen' }, 'Ana Menü', '#main-menu-screen');
                    }
                } catch (error) {
                    console.error("Yarım kalan oyuna girerken hata:", error);
                    localStorage.removeItem('activeGameId');
                    showScreen('main-menu-screen');
                    history.replaceState({ screen: 'main-menu-screen' }, 'Ana Menü', '#main-menu-screen');
                }
            } else {
                showScreen('main-menu-screen');
                history.replaceState({ screen: 'main-menu-screen' }, 'Ana Menü', '#main-menu-screen');
            }
            
        } else {
            authLoading.classList.add('hidden');
            setUserId(null);
            setCurrentUserProfile(null);

            if (getFriendsUnsubscribe()) getFriendsUnsubscribe()();
            if (getMyGamesUnsubscribe()) getMyGamesUnsubscribe()();
            if (globalGamesUnsubscribe) globalGamesUnsubscribe(); // Global dinleyiciyi durdur
            
            setFriendsUnsubscribe(null);
            setMyGamesUnsubscribe(null);

            showScreen('login-screen');
        }
    });
}

// Global Sıralama
// --- GELİŞMİŞ SIRALAMA FONKSİYONU ---
async function fetchAndDisplayGlobalRanking(loadMore = false) {
    const listElement = document.getElementById('global-ranking-list');
    const loadingElement = document.getElementById('global-ranking-loading');
    const loadMoreBtn = document.getElementById('load-more-ranking-btn');
    
    if (!listElement || isRankingLoading) return;
    
    isRankingLoading = true;

    // Eğer "Daha Fazla" değilse (yani ilk açılışsa), her şeyi sıfırla
    if (!loadMore) {
        listElement.innerHTML = '';
        loadingElement.classList.remove('hidden');
        loadMoreBtn.classList.add('hidden');
        lastVisibleRankDoc = null;
        currentRankCount = 1;
    } else {
        loadMoreBtn.textContent = "Yükleniyor...";
        loadMoreBtn.disabled = true;
    }

    try {
        const usersRef = collection(db, 'users');
        let q;

        // Sorguyu hazırla
        if (loadMore && lastVisibleRankDoc) {
            // Devamını getir (Pagination)
            q = query(usersRef, 
                orderBy("stats.wins", "desc"), 
                orderBy("stats.played", "asc"),
                startAfter(lastVisibleRankDoc), // <-- Kaldığı yerden devam et
                limit(50) 
            );
        } else {
            // İlk sayfa
            q = query(usersRef, 
                orderBy("stats.wins", "desc"), 
                orderBy("stats.played", "asc"),
                limit(50) 
            );
        }

        const querySnapshot = await getDocs(q);
        const currentUserId = getUserId(); 
        let currentUserRow = null;

        loadingElement.classList.add('hidden');

        if (querySnapshot.empty) {
            if(!loadMore) loadingElement.textContent = "Henüz sıralama yok.";
            loadMoreBtn.classList.add('hidden'); // Daha fazla veri yoksa butonu gizle
            isRankingLoading = false;
            return;
        }

        // Son dökümanı kaydet (Bir sonraki tur için)
        lastVisibleRankDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

        querySnapshot.forEach(doc => {
            const user = doc.data();
            const stats = user.stats || { played: 0, wins: 0 };
            
            // Kullanıcı adı yoksa atla
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
                challengeButton.onclick = handleChallengeClick; // addEventListener yerine onclick daha hafif
                actionDiv.appendChild(challengeButton);
                row.appendChild(actionDiv);
            } else {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = "w-[42px]"; 
                row.appendChild(emptyDiv);
            }
            
            listElement.appendChild(row);
            currentRankCount++; // Sırayı artır
        });

        // Buton durumunu güncelle
        if (querySnapshot.docs.length < 50) {
            loadMoreBtn.classList.add('hidden'); // 50'den az geldiyse listenin sonudur
        } else {
            loadMoreBtn.classList.remove('hidden');
            loadMoreBtn.textContent = "👇 Daha Fazla Göster";
            loadMoreBtn.disabled = false;
        }

        // Kendi ismine odaklan (Sadece ilk yüklemede ve eğer listedeyse)
        if (!loadMore && currentUserRow) {
            setTimeout(() => {
                currentUserRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }

    } catch (error) {
        console.error("Sıralama yüklenirken hata:", error);
        loadingElement.textContent = "Sıralama yüklenemedi.";
    } finally {
        isRankingLoading = false;
    }
}

// İstatistik Sekmeleri
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

// Tüm butonlara tıklama olaylarını ekleyen fonksiyon
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
            fetchAndDisplayGlobalRanking(true); // true = loadMore modu
        });
    }

    // --- SES AÇ/KAPA ---
    const soundBtn = document.getElementById('sound-toggle-btn');
    const iconOn = document.getElementById('sound-icon-on');
    const iconOff = document.getElementById('sound-icon-off');

    // Başlangıç durumunu kontrol et
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
        updateSoundIcon(); // İlk açılışta ayarla
        soundBtn.addEventListener('click', () => {
            const isMuted = localStorage.getItem('soundMuted') === 'true';
            localStorage.setItem('soundMuted', !isMuted); // Tersi yap
            updateSoundIcon();
            
            // Geri bildirim (Sesi açtıysa bip sesi çalsın)
            if (isMuted) import('./utils.js').then(u => u.playSound('click'));
        });
    }

    // --- YENİ BR BUTONLARI ---
    if (btnCreatePublicBr) {
        btnCreatePublicBr.addEventListener('click', () => {
            createBRGame('public'); // Herkese açık kur
        });
    }

    if (btnCreatePrivateBr) {
        btnCreatePrivateBr.addEventListener('click', () => {
            createBRGame('private'); // Gizli kur (Sadece davet)
        });
    }

    if (btnJoinRandomBr) {
        btnJoinRandomBr.addEventListener('click', () => {
            joinRandomBRGame(); // Rastgele açık oyun bul ve gir
        });
    }

    // Kırtasiye Butonları
    if (marketBtn) {
        marketBtn.addEventListener('click', () => {
             import('./ui.js').then(module => module.openKirtasiyeScreen());
        });
    }
    
    if (backToMainFromMarketBtn) {
        backToMainFromMarketBtn.addEventListener('click', () => showScreen('main-menu-screen'));
    }

    // Geri Tuşu Dinleyicisi
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.screen) {
            showScreen(event.state.screen, true);
        } else {
            showScreen('main-menu-screen', true);
        }
    });

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

    // Kelimelig Butonları
    if (kelimeligBtn) {
        kelimeligBtn.addEventListener('click', () => {
            openKelimeligScreen();
        });
    }

    if (backToMainFromLeagueBtn) {
        backToMainFromLeagueBtn.addEventListener('click', () => {
            showScreen('main-menu-screen');
        });
    }

    // --- SÖZLÜK BUTONLARI ---
    if (dictionaryMenuBtn) {
        dictionaryMenuBtn.addEventListener('click', () => {
            openDictionaryScreen();
        });
    }

    if (backToMainFromDictionaryBtn) {
        backToMainFromDictionaryBtn.addEventListener('click', () => {
            showScreen('main-menu-screen');
        });
    }

    // Kelimelig Sekme Butonları
    if (btnShowFixtures) {
        btnShowFixtures.addEventListener('click', () => switchLeagueTab('fixtures'));
    }
    if (btnShowStandings) {
        btnShowStandings.addEventListener('click', () => switchLeagueTab('standings'));
    }

// İstatistik Butonları (Hata Düzeltmesi)
    if (statsBtn) {
        statsBtn.addEventListener('click', openStatsScreen);
    }
    
    if (statsBtnMain) {
        statsBtnMain.addEventListener('click', openStatsScreen);
    }

    // İstatistik Sekme Butonları
    document.getElementById('show-personal-stats-tab-btn').addEventListener('click', () => switchStatsTab('personal'));
    document.getElementById('show-global-ranking-tab-btn').addEventListener('click', () => switchStatsTab('global'));

    // "Nasıl Oynanır"
    howToPlayBtn.addEventListener('click', () => {
        showScreen('how-to-play-screen');
        playTutorialAnimation(); 
        import('./game.js').then(m => m.updateQuestProgress('view_tutorial', 1));
    });
    closeHowToPlayBtn.addEventListener('click', () => {
        history.back();
        stopTutorialAnimation(); 
    });

    // --- YENİ EKLENECEK KOD BAŞLANGICI ---
    
    // js/main.js -> addEventListeners içinde:

    // Market: Arkadaş Davet Et Butonu (5000 Altın)
    const btnMarketInvite = document.getElementById('btn-market-invite');
    if (btnMarketInvite) {
        btnMarketInvite.addEventListener('click', () => {
            const myId = getUserId(); // Senin ID'ni alıyoruz
            // Linke "?ref=SENIN_ID" ekliyoruz
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
                import('./utils.js').then(u => u.showToast("Link kopyalandı! Arkadaşına gönder.", false));
            }
            import('./game.js').then(m => m.updateQuestProgress('invite_friend', 1));
            // DİKKAT: Buradaki "addGold" kodunu SİLDİK. 
            // Artık sadece linki gönderiyoruz, ödül kayıt olunca gelecek.
        });
    }

    // Kapatma Butonları
    closeProfileBtn.addEventListener('click', () => history.back());
    document.getElementById('back-to-main-from-edit-profile-btn').addEventListener('click', () => history.back());

   
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = localStorage.getItem('theme') || 'dark';
            // Eğer şu an dark ise light yap, değilse dark yap
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            switchTheme(newTheme);
            
            // Efekt sesi
            import('./utils.js').then(u => u.playSound('click'));
        });
    }

    // Geri Butonları
    backToMainMenuBtn.addEventListener('click', () => history.back());
    backToMainMenuFromGamesBtn.addEventListener('click', () => history.back()); 
    backToMainFromFriendsBtn.addEventListener('click', () => history.back());

    // Oyun Modu Seçim
    vsCpuBtn.addEventListener('click', () => startNewGame({ mode: 'vsCPU' }));
    dailyWordBtn.addEventListener('click', () => startNewGame({ mode: 'daily' }));
    
    // Gevşek Oyun (12 Saat)
    randomGameBtn.addEventListener('click', () => findOrCreateRandomGame({ 
        timeLimit: 43200, 
        matchLength: 1,
        gameType: 'random_loose' 
    }));
    
    // Seri Oyun (120 Sn)
    seriesGameBtn.addEventListener('click', () => findOrCreateRandomGame({ timeLimit: 120, matchLength: 5, gameType: 'random_series' }));

    // Online Oyun Kurma / Katılma
    withFriendsBtn.addEventListener('click', () => {
        showScreen('friends-screen');
        switchFriendTab('friends'); 
    });
    
    multiplayerBrBtn.addEventListener('click', () => showScreen('br-setup-screen'));
    backToModeMultiBtn.addEventListener('click', () => history.back());
    backToModeBrBtn.addEventListener('click', () => history.back());

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

    const newWordRematchBtn = document.getElementById('new-word-rematch-btn');
    if (newWordRematchBtn) {
        newWordRematchBtn.addEventListener('click', startRematch);
    }
    
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

    // js/main.js -> addEventListeners içine ekle

    // Reklam İzleme Butonu (data-amount="500" olan)
    document.querySelectorAll('.buy-gold-btn[data-amount="500"]').forEach(btn => {
        btn.addEventListener('click', () => {
            // ... (Reklam izleme kodların buradaysa altına ekle)
            
            // --- GÖREV TETİKLEYİCİSİ ---
            // (Not: Gerçekte reklamın BİTMESİNİ beklemek gerekir ama şimdilik tıklayınca verelim)
            import('./game.js').then(m => m.updateQuestProgress('watch_ad', 1));
        });
    });
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
// --- QUICK CHAT SİSTEMİ ---
    const chatMenu = document.getElementById('quick-chat-menu');

    // 1. CHAT BUTONUNA TIKLAMA (Event Delegation)
    // Klavye sonradan oluştuğu için document üzerine dinleyici koyuyoruz
    document.addEventListener('click', (e) => {
        // Eğer tıklanan şey Chat butonu ise
        const chatBtn = e.target.closest('#btn-toggle-chat');
        if (chatBtn) {
            e.stopPropagation(); // Klavye harf basmasını engelle
            if (chatMenu) chatMenu.classList.toggle('hidden'); // Menüyü aç/kapat
            import('./utils.js').then(u => u.playSound('click'));
        }
        
        // Eğer menü açıkken başka yere tıklanırsa menüyü kapat
        else if (chatMenu && !chatMenu.classList.contains('hidden') && !e.target.closest('#quick-chat-menu')) {
            chatMenu.classList.add('hidden');
        }
    });

    // 2. EMOJİ SEÇME
    if (chatMenu) {
        chatMenu.querySelectorAll('.chat-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const msg = btn.dataset.msg;
                
                // Mesajı gönder
                sendQuickChat(msg);
                
                // Menüyü kapat
                chatMenu.classList.add('hidden');
                
                // Geri bildirim sesi
                import('./utils.js').then(u => u.playSound('click'));
            });
        });
    }
    // js/main.js -> addEventListeners fonksiyonunun içine, EN ALTA ekle:

    // --- YENİ GÖREV TETİKLEYİCİLERİ (PAYLAŞIM) ---

    // 1. Normal Oyun Sonu Paylaş Butonu (shareResultsBtn zaten import edilmiş)
    if (shareResultsBtn) {
        shareResultsBtn.addEventListener('click', () => {
            // Basit paylaşım metni
            const text = "Kelime Yarışması'nda skoruma bak! Sen de oyna.";
            
            if (navigator.share) {
                navigator.share({ title: 'Kelime Yarışması', text: text }).catch(console.error);
            } else {
                navigator.clipboard.writeText(text);
                import('./utils.js').then(u => u.showToast("Sonuç panoya kopyalandı!", false));
            }
            
            // GÖREVİ TAMAMLA: 'Hava At'
            import('./game.js').then(m => m.updateQuestProgress('share_result', 1));
        });
    }

    // 2. Günlük Oyun Sonu Paylaş Butonu (ID ile direkt seçiyoruz)
    const dailyShareBtn = document.getElementById('daily-share-btn');
    if (dailyShareBtn) {
        dailyShareBtn.addEventListener('click', () => {
            const text = "Günün Kelimesi'ni çözdüm! Sıra sende.";
            
            if (navigator.share) {
                navigator.share({ title: 'Günün Kelimesi', text: text }).catch(console.error);
            } else {
                navigator.clipboard.writeText(text);
                import('./utils.js').then(u => u.showToast("Sonuç panoya kopyalandı!", false));
            }

            // GÖREVİ TAMAMLA: 'Hava At'
            import('./game.js').then(m => m.updateQuestProgress('share_result', 1));
        });
    }
}

// Tema Yönetimi
// js/main.js -> switchTheme (GÜNCELLENMİŞ HALİ)

function switchTheme(theme) {
    const iconSun = document.getElementById('theme-icon-sun');
    const iconMoon = document.getElementById('theme-icon-moon');

    if (theme === 'light') {
        // Aydınlık Modu Aç
        document.body.classList.add('theme-light');
        localStorage.setItem('theme', 'light');
        
        // Aydınlıktayız -> Ay ikonunu göster (Karanlığa geçiş için)
        if(iconSun) iconSun.classList.add('hidden');
        if(iconMoon) iconMoon.classList.remove('hidden');
        
    } else {
        // Karanlık Modu Aç
        document.body.classList.remove('theme-light');
        localStorage.setItem('theme', 'dark');
        
        // Karanlıktayız -> Güneş ikonunu göster (Aydınlığa geçiş için)
        if(iconSun) iconSun.classList.remove('hidden');
        if(iconMoon) iconMoon.classList.add('hidden');
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
            import('./game.js').then(m => m.updateQuestProgress('change_avatar', 1));
        }
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
        import('./game.js').then(m => m.updateQuestProgress('challenge_rank', 1));
        showScreen('my-games-screen');
        switchMyGamesTab('active'); 
        

    } catch (error) {
        console.error("Meydan okuma başarısız:", error);
        showToast("Hata: " + error.message, true);
        button.disabled = false;
        button.textContent = 'Meydan Oku';
    }
}

// --- KAYIT EKRANI AVATAR YÖNETİMİ ---
function initRegisterScreenAvatars() {
    const container = document.getElementById('register-avatar-list');
    const input = document.getElementById('register-selected-avatar-url');
    
    if (!container || !input) return;

    container.innerHTML = ''; // Temizle

    // AVATAR_LIST zaten main.js'de tanımlıydı, onu kullanıyoruz
    // Eğer tanımlı değilse buraya const AVATAR_LIST = [...] diye ekleyin.
    
    AVATAR_LIST.forEach((url, index) => {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'w-12 h-12 rounded-full border-4 border-transparent cursor-pointer transition hover:scale-110 object-cover bg-gray-700';
        
        // İlk avatarı varsayılan olarak seçelim (Boş gitmesin diye)
        if (index === 0) {
            img.classList.add('border-green-500', 'selected-reg-avatar');
            input.value = url;
        }

        img.onclick = () => {
            // Önceki seçimi kaldır
            container.querySelectorAll('img').forEach(el => {
                el.classList.remove('border-green-500', 'selected-reg-avatar');
                el.classList.add('border-transparent');
            });
            
            // Yeni seçimi işaretle
            img.classList.remove('border-transparent');
            img.classList.add('border-green-500', 'selected-reg-avatar');
            
            // Gizli inputa değeri yaz
            input.value = url;
        };

        container.appendChild(img);
    });
}

// Uygulamayı başlat
initApp();
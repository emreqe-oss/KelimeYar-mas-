// js/state.js (GÜNCELLENMİŞ - YAZMA BAYRAĞI EKLENDİ)

// --- ÖZEL (PRIVATE) DEĞİŞKENLER ---
let _userId = null;
let _currentUserProfile = null;
let _currentGameId = null;
let _localGameData = null;
let _gameMode = null;
let _singlePlayerMode = null;
let _gameIdFromUrl = null;
let _challengedFriendId = null;

// === YENİ EKLEME BAŞLANGICI ===
// Bir tur boyunca bilinen yeşil harflerin konumunu saklar (örn: { 0: 'Ö', 3: 'E' })
let _knownCorrectPositions = {};
// Kullanıcının mevcut satıra yazmaya başlayıp başlamadığını takip eder
let _hasUserStartedTypingInCurrentRow = false;
// === YENİ EKLEME SONU ===

// Fonksiyon ve interval referansları
let _gameUnsubscribe = null;
let _turnTimerInterval = null;
let _friendsUnsubscribe = null;
let _invitesUnsubscribe = null;
let _myGamesUnsubscribe = null; // Yeni dinleyici için

// --- GENEL (PUBLIC) FONKSİYONLAR ---

// --- Kullanıcı ve Oturum State'i ---
export function setUserId(id) { _userId = id; }
export function getUserId() { return _userId; }

export function setCurrentUserProfile(profile) { _currentUserProfile = profile; }
export function getCurrentUserProfile() { return _currentUserProfile; }

// --- Oyun State'i ---
export function setCurrentGameId(id) { _currentGameId = id; }
export function getCurrentGameId() { return _currentGameId; }

export function setLocalGameData(data) { _localGameData = data; }
export function getLocalGameData() { return _localGameData; }

export function setGameMode(mode) { _gameMode = mode; }
export function getGameMode() { return _gameMode; }

export function setSinglePlayerMode(mode) { _singlePlayerMode = mode; }
export function getSinglePlayerMode() { return _singlePlayerMode; }

export function setGameIdFromUrl(id) { _gameIdFromUrl = id; }
export function getGameIdFromUrl() { return _gameIdFromUrl; }

export function setChallengedFriendId(id) { _challengedFriendId = id; }
export function getChallengedFriendId() { return _challengedFriendId; }

// === YENİ EKLEME BAŞLANGICI ===
// Yeşil harf hafızasını yöneten fonksiyonlar
export function getKnownCorrectPositions() { return _knownCorrectPositions; }
export function setKnownCorrectPositions(positions) { _knownCorrectPositions = positions; }
export function resetKnownCorrectPositions() { _knownCorrectPositions = {}; resetPresentJokerLetters(); }

// Yazma bayrağını yöneten fonksiyonlar
export function setHasUserStartedTyping(value) { _hasUserStartedTypingInCurrentRow = value; }
export function getHasUserStartedTyping() { return _hasUserStartedTypingInCurrentRow; }
export function resetHasUserStartedTyping() { _hasUserStartedTypingInCurrentRow = false; }
// === YENİ EKLEME SONU ===


// --- Dinleyici (Listener) ve Interval State'i ---
export function setGameUnsubscribe(func) { _gameUnsubscribe = func; }
export function getGameUnsubscribe() { return _gameUnsubscribe; }

export function setTurnTimerInterval(interval) { _turnTimerInterval = interval; }
export function getTurnTimerInterval() { return _turnTimerInterval; }

export function setFriendsUnsubscribe(func) { _friendsUnsubscribe = func; }
export function getFriendsUnsubscribe() { return _friendsUnsubscribe; }

export function setInvitesUnsubscribe(func) { _invitesUnsubscribe = func; }
export function getInvitesUnsubscribe() { return _invitesUnsubscribe; }

export function setMyGamesUnsubscribe(func) { _myGamesUnsubscribe = func; }
export function getMyGamesUnsubscribe() { return _myGamesUnsubscribe; }

// --- TURUNCU JOKER HAFIZASI (YENİ EKLENECEK KISIM) ---
let presentJokerLetters = new Set(); 

export function addPresentJokerLetter(letter) {
    presentJokerLetters.add(letter);
}

export function getPresentJokerLetters() {
    return Array.from(presentJokerLetters);
}

export function resetPresentJokerLetters() {
    presentJokerLetters.clear();
}
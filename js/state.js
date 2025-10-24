// js/state.js

// --- ÖZEL (PRIVATE) DEĞİŞKENLER ---
let _userId = null;
let _currentUserProfile = null;
let _currentGameId = null;
let _localGameData = null;
let _gameMode = null;
let _singlePlayerMode = null;
let _gameIdFromUrl = null;
let _challengedFriendId = null; // <-- YENİ EKLENDİ

// Fonksiyon ve interval referansları
let _gameUnsubscribe = null;
let _turnTimerInterval = null;
let _friendsUnsubscribe = null;
let _invitesUnsubscribe = null;

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

// --- Meydan Okuma State'i --- // <-- YENİ EKLENDİ
export function setChallengedFriendId(id) { _challengedFriendId = id; }
export function getChallengedFriendId() { return _challengedFriendId; }

// --- Dinleyici (Listener) ve Interval State'i ---
export function setGameUnsubscribe(func) { _gameUnsubscribe = func; }
export function getGameUnsubscribe() { return _gameUnsubscribe; }

export function setTurnTimerInterval(interval) { _turnTimerInterval = interval; }
export function getTurnTimerInterval() { return _turnTimerInterval; }

export function setFriendsUnsubscribe(func) { _friendsUnsubscribe = func; }
export function getFriendsUnsubscribe() { return _friendsUnsubscribe; }

export function setInvitesUnsubscribe(func) { _invitesUnsubscribe = func; }
export function getInvitesUnsubscribe() { return _invitesUnsubscribe; }
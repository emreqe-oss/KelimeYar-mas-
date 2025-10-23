// js/state.js

export let kelimeSozlugu = {};
export let cevapSozlugu = {};

export let userId = null;
export let currentUserProfile = null;
export let currentGameId = null;
export let gameUnsubscribe = null;
export let turnTimerInterval = null;
export let localGameData = null;
export let gameMode = null;
export let singlePlayerMode = null;
export let gameIdFromUrl = null;
export let friendsUnsubscribe = null;
export let invitesUnsubscribe = null;

// Bu fonksiyonlar, state'i güvenli bir şekilde değiştirmemizi sağlar.
export function setKelimeSozlugu(data) { kelimeSozlugu = data; }
export function setCevapSozlugu(data) { cevapSozlugu = data; }
export function setUserId(id) { userId = id; }
export function setCurrentUserProfile(profile) { currentUserProfile = profile; }
export function setCurrentGameId(id) { currentGameId = id; }
export function setGameUnsubscribe(func) { gameUnsubscribe = func; }
export function setTurnTimerInterval(interval) { turnTimerInterval = interval; }
export function setLocalGameData(data) { localGameData = data; }
export function setGameMode(mode) { gameMode = mode; }
export function setSinglePlayerMode(mode) { singlePlayerMode = mode; }
export function setGameIdFromUrl(id) { gameIdFromUrl = id; }
export function setFriendsUnsubscribe(func) { friendsUnsubscribe = func; }
export function setInvitesUnsubscribe(func) { invitesUnsubscribe = func; }
// js/friends.js - TAM VE DÜZELTİLMİŞ KOD

import { 
    collection, 
    query, 
    where, 
    getDocs, 
    getDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    doc, 
    serverTimestamp, 
    orderBy 
} from "firebase/firestore";
import { db } from './firebase.js';
import * as state from './state.js';
import { showToast, createElement } from './utils.js';

// --- DÜZELTME BURADA ---
// Artık ui.js dosyasında gameInviteCount dışarı aktarıldığı için
// süslü parantez içinde, diğer fonksiyonlarla birlikte çağırabiliriz.
import { showScreen, displayStats, renderMyGamesLists, gameInviteCount } from './ui.js';
// -----------------------

import { joinGame, startQuickFriendGame } from './game.js';

// Elementler
const friendsList = document.getElementById('friends-list');
const friendRequestsList = document.getElementById('friend-requests-list');
const searchFriendInput = document.getElementById('search-friend-input');
const friendSearchResults = document.getElementById('friend-search-results');
const friendRequestCount = document.getElementById('friend-request-count');
const friendsListPlaceholder = document.getElementById('friends-list-placeholder');
const friendRequestsPlaceholder = document.getElementById('friend-requests-placeholder');

export async function searchUsers() {
    const searchText = searchFriendInput.value.trim();
    if (searchText.length < 3) return showToast("Arama için en az 3 karakter girin.", true);
    const currentUserId = state.getUserId();
    friendSearchResults.innerHTML = '<p class="text-gray-400">Aranıyor...</p>';
    try {
        const usersRef = collection(db, 'users');
        const byUsernameQuery = query(usersRef, where('username', '==', searchText));
        const byEmailQuery = query(usersRef, where('email', '==', searchText));

        const [usernameSnapshot, emailSnapshot] = await Promise.all([
            getDocs(byUsernameQuery),
            getDocs(byEmailQuery)
        ]);

        const results = new Map();
        usernameSnapshot.forEach(doc => { if (doc.id !== currentUserId) results.set(doc.id, { id: doc.id, ...doc.data() }); });
        emailSnapshot.forEach(doc => { if (doc.id !== currentUserId) results.set(doc.id, { id: doc.id, ...doc.data() }); });

        if (results.size === 0) {
            friendSearchResults.innerHTML = '<p class="text-gray-400">Kullanıcı bulunamadı.</p>';
        } else {
            friendSearchResults.innerHTML = '';
            results.forEach(user => {
                const addButton = createElement('button', {
                    className: 'bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 rounded-lg text-xs',
                    textContent: 'Ekle',
                    onclick: () => sendFriendRequest(user.id)
                });
                const userDiv = createElement('div', {
                    className: 'bg-gray-700 p-2 rounded flex justify-between items-center',
                    innerHTML: `<span>${user.username} <span class="text-xs text-gray-400">(${user.fullname})</span></span>`
                });
                userDiv.appendChild(addButton);
                friendSearchResults.appendChild(userDiv);
            });
        }
    } catch (error) {
        console.error("Kullanıcı arama hatası:", error);
        friendSearchResults.innerHTML = '<p class="text-red-400">Arama sırasında bir hata oluştu.</p>';
    }
}

async function sendFriendRequest(receiverId) {
    const currentUserId = state.getUserId();
    if (!currentUserId || !receiverId) return;
    try {
        const friendshipData = {
            users: [currentUserId, receiverId],
            senderId: currentUserId,
            receiverId: receiverId,
            status: 'pending',
            createdAt: serverTimestamp() 
        };
        await addDoc(collection(db, 'friendships'), friendshipData);
        showToast('Arkadaşlık isteği gönderildi!');
    } catch (error) {
        console.error("İstek gönderme hatası:", error);
        showToast('İstek gönderilirken bir hata oluştu.', true);
    }
}

async function handleFriendRequest(friendshipId, action) {
    try {
        const friendshipRef = doc(db, 'friendships', friendshipId);
        if (action === 'accept') {
            await updateDoc(friendshipRef, { status: 'accepted' });
            showToast('Arkadaşlık isteği kabul edildi.');
        } else if (action === 'reject') {
            await deleteDoc(friendshipRef);
            showToast('Arkadaşlık isteği reddedildi.');
        }
    } catch (error) {
        console.error("İstek işleme hatası:", error);
        showToast('İşlem sırasında bir hata oluştu.', true);
    }
}

async function removeFriend(friendshipId) {
    if (confirm("Bu arkadaşınızı silmek istediğinizden emin misiniz?")) {
        try {
            await deleteDoc(doc(db, 'friendships', friendshipId));
            showToast('Arkadaş silindi.');
        } catch (error) {
            console.error("Arkadaş silme hatası:", error);
            showToast('Arkadaş silinirken bir hata oluştu.', true);
        }
    }
}

export function listenToFriendships() {
    const currentUserId = state.getUserId();
    if (!currentUserId) return;

    const q = query(collection(db, 'friendships'), where('users', 'array-contains', currentUserId));
    
    return onSnapshot(q, async (snapshot) => {
        const friendPromises = [];
        const requestPromises = [];
        let pendingCount = 0;
        
        snapshot.forEach(docSnapshot => { 
            const data = { id: docSnapshot.id, ...docSnapshot.data() };
            if (data.status === 'accepted') {
                const friendId = data.users.find(id => id !== currentUserId);
                if (friendId) {
                    const userPromise = getDoc(doc(db, 'users', friendId))
                        .then(userDoc => ({ friendshipId: data.id, id: userDoc.id, ...userDoc.data() }));
                    friendPromises.push(userPromise);
                }
            } else if (data.status === 'pending' && data.receiverId === currentUserId) {
                pendingCount++;
                const requestPromise = getDoc(doc(db, 'users', data.senderId))
                    .then(userDoc => ({ friendshipId: data.id, id: userDoc.id, ...userDoc.data() }));
                requestPromises.push(requestPromise);
            }
        });
        
        const friends = await Promise.all(friendPromises);
        const requests = await Promise.all(requestPromises);
        
        if (pendingCount > 0) {
            if(friendRequestCount) {
                friendRequestCount.textContent = pendingCount;
                friendRequestCount.classList.remove('hidden');
            }
        } else {
            if(friendRequestCount) friendRequestCount.classList.add('hidden');
        }
        renderFriends(friends, requests);
    }, error => console.error("Arkadaşlıkları dinlerken hata:", error));
}

function challengeFriend(friend) {
    // Ayar ekranı yok, direkt oyunu başlatıyoruz
    startQuickFriendGame(friend.id); 
    // Kullanıcıya bilgi ver (Zaten startQuickFriendGame de toast gösteriyor ama bu ekstra netlik sağlar)
    // showToast(`${friend.username} kişisine oyun açılıyor...`, false);
}

function renderFriends(friends, requests) {
    if (!friendsList || !friendRequestsList) return;
    
    friendsList.innerHTML = '';
    friendRequestsList.innerHTML = '';
    
    if (friends.length > 0) {
        friendsListPlaceholder.classList.add('hidden');
        friends.forEach(friend => {
            const profileButton = createElement('button', { className: 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded-lg text-xs', textContent: 'Profil', onclick: () => showFriendProfile(friend.id) });
            const inviteButton = createElement('button', { className: 'bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-1 px-2 rounded-lg text-xs', textContent: 'Davet Et', onclick: () => challengeFriend(friend) });
            const removeButton = createElement('button', { className: 'bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-lg text-xs', textContent: 'Sil', onclick: () => removeFriend(friend.friendshipId) });
            
            const buttonsWrapper = createElement('div', { className: 'flex gap-2 items-center' });
            buttonsWrapper.append(profileButton, inviteButton, removeButton);
            const friendDiv = createElement('div', { className: 'bg-gray-700 p-2 rounded flex justify-between items-center' });
            friendDiv.innerHTML = `<span>${friend.username}</span>`;
            friendDiv.appendChild(buttonsWrapper);
            friendsList.appendChild(friendDiv);
        });
    } else {
        friendsListPlaceholder.classList.remove('hidden');
    }

    if (requests.length > 0) {
        friendRequestsPlaceholder.classList.add('hidden');
        requests.forEach(request => {
            const acceptButton = createElement('button', { className: 'bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 rounded-lg text-xs', textContent: 'Kabul Et', onclick: () => handleFriendRequest(request.friendshipId, 'accept') });
            const rejectButton = createElement('button', { className: 'bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-lg text-xs', textContent: 'Reddet', onclick: () => handleFriendRequest(request.friendshipId, 'reject') });
            
            const buttonsWrapper = createElement('div', { className: 'flex gap-2' });
            buttonsWrapper.append(acceptButton, rejectButton);
            const requestDiv = createElement('div', { className: 'bg-gray-700 p-2 rounded flex justify-between items-center' });
            requestDiv.innerHTML = `<span>${request.username}</span>`;
            requestDiv.appendChild(buttonsWrapper);
            friendRequestsList.appendChild(requestDiv);
        });
    } else {
        friendRequestsPlaceholder.classList.remove('hidden');
    }
}

export function listenToMyGames() {
    const currentUserId = state.getUserId();
    if (!currentUserId) return;

    const q = query(
        collection(db, 'games'),
        where('playerIds', 'array-contains', currentUserId),
        orderBy('createdAt', 'desc')
    );
    
    return onSnapshot(q, async (snapshot) => {
        const activeGames = [];
        const finishedGames = [];
        const invites = [];
        snapshot.forEach(doc => {
            const game = { id: doc.id, ...doc.data() };
            if (game.status === 'invited' && game.invitedPlayerId === currentUserId) {
                invites.push(game);
            } else if (game.status === 'finished') {
                finishedGames.push(game);
            } else if (game.status === 'waiting' || game.status === 'playing' || (game.status === 'invited' && game.creatorId === currentUserId)) {
                activeGames.push(game);
            }
        });

        // --- GAME INVITE COUNT KULLANIMI ---
        // ui.js'den import ettiğimiz elementi burada kullanıyoruz
        const inviteCount = invites.length;
        if (gameInviteCount) { 
            if (inviteCount > 0) {
                gameInviteCount.textContent = inviteCount;
                gameInviteCount.classList.remove('hidden');
            } else {
                gameInviteCount.classList.add('hidden');
            }
        }
        // -----------------------------------

        renderMyGamesLists(activeGames, finishedGames, invites);
    }, error => console.error("Oyunlar dinlenirken hata:", error));
}

async function showFriendProfile(friendId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', friendId));
        if (userDoc.exists()) {
            const friendProfile = userDoc.data();
            // Profil elementlerini güvenli bir şekilde güncelle (elementler null olabilir)
            const elFullname = document.getElementById('profile-fullname');
            if(elFullname) elFullname.textContent = friendProfile.fullname;
            
            // ... Diğer profil alanlarını güncelleme kodları (UI yapısına göre) ...
            // Not: showScreen ve displayStats ui.js'den geliyor
            
            displayStats(friendProfile);
            showScreen('profile-screen');
        } else {
            showToast("Kullanıcı profili bulunamadı.", true);
        }
    } catch (error) {
        showToast("Profil getirilirken hata oluştu.", true);
        console.error(error);
    }
}
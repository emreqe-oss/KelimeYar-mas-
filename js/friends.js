// js/friends.js
import { db } from './firebase.js';
import * as state from './state.js';
import { showToast, createElement } from './utils.js';
import { showScreen, displayStats, renderMyGamesLists } from './ui.js';
import { joinGame } from './game.js';

// Elementler
const friendsList = document.getElementById('friends-list');
const friendRequestsList = document.getElementById('friend-requests-list');
const searchFriendInput = document.getElementById('search-friend-input');
const friendSearchResults = document.getElementById('friend-search-results');
const friendRequestCount = document.getElementById('friend-request-count');
const friendsListPlaceholder = document.getElementById('friends-list-placeholder');
const friendRequestsPlaceholder = document.getElementById('friend-requests-placeholder');
const invitationModal = document.getElementById('invitation-modal');
const acceptInviteBtn = document.getElementById('accept-invite-btn');
const rejectInviteBtn = document.getElementById('reject-invite-btn');
const invitationText = document.getElementById('invitation-text');

export async function searchUsers() {
    const query = searchFriendInput.value.trim();
    if (query.length < 3) return showToast("Arama için en az 3 karakter girin.", true);
    const currentUserId = state.getUserId();
    friendSearchResults.innerHTML = '<p class="text-gray-400">Aranıyor...</p>';
    try {
        const byUsername = db.collection('users').where('username', '==', query).get();
        const byEmail = db.collection('users').where('email', '==', query).get();
        const [usernameSnapshot, emailSnapshot] = await Promise.all([byUsername, byEmail]);
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
        const friendshipData = { users: [currentUserId, receiverId], senderId: currentUserId, receiverId: receiverId, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp() };
        await db.collection('friendships').add(friendshipData);
        showToast('Arkadaşlık isteği gönderildi!');
    } catch (error) {
        console.error("İstek gönderme hatası:", error);
        showToast('İstek gönderilirken bir hata oluştu.', true);
    }
}
async function handleFriendRequest(friendshipId, action) {
    try {
        if (action === 'accept') {
            await db.collection('friendships').doc(friendshipId).update({ status: 'accepted' });
            showToast('Arkadaşlık isteği kabul edildi.');
        } else if (action === 'reject') {
            await db.collection('friendships').doc(friendshipId).delete();
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
            await db.collection('friendships').doc(friendshipId).delete();
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

    return db.collection('friendships').where('users', 'array-contains', currentUserId)
        .onSnapshot(async (snapshot) => {
            const friendPromises = [];
            const requestPromises = [];
            let pendingCount = 0;
            snapshot.forEach(doc => {
                const data = { id: doc.id, ...doc.data() };
                if (data.status === 'accepted') {
                    const friendId = data.users.find(id => id !== currentUserId);
                    if (friendId) friendPromises.push(db.collection('users').doc(friendId).get().then(userDoc => ({ friendshipId: data.id, id: userDoc.id, ...userDoc.data() })));
                } else if (data.status === 'pending' && data.receiverId === currentUserId) {
                    pendingCount++;
                    requestPromises.push(db.collection('users').doc(data.senderId).get().then(userDoc => ({ friendshipId: data.id, id: userDoc.id, ...userDoc.data() })));
                }
            });
            const friends = await Promise.all(friendPromises);
            const requests = await Promise.all(requestPromises);
            if (pendingCount > 0) {
                friendRequestCount.textContent = pendingCount;
                friendRequestCount.classList.remove('hidden');
            } else {
                friendRequestCount.classList.add('hidden');
            }
            renderFriends(friends, requests);
        }, error => console.error("Arkadaşlıkları dinlerken hata:", error));
}

function challengeFriend(friend) {
    state.setChallengedFriendId(friend.id);
    showScreen('multiplayer-setup-screen');
    showToast(`${friend.username} adlı arkadaşına meydan okumak için ayarları yap.`, false);
}

function renderFriends(friends, requests) {
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

    return db.collection('games')
        .where('playerIds', 'array-contains', currentUserId)
        .orderBy('createdAt', 'desc')
        .onSnapshot(async (snapshot) => {
            const activeGames = [];
            const finishedGames = [];
            const invites = [];

            snapshot.forEach(doc => {
                const game = { id: doc.id, ...doc.data() };
                if (game.status === 'invited' && game.invitedPlayerId === currentUserId) {
                    invites.push(game);
                } else if (game.status === 'finished') {
                    finishedGames.push(game);
                } else if (game.status === 'waiting' || game.status === 'playing') {
                    activeGames.push(game);
                }
            });
            
            renderMyGamesLists(activeGames, finishedGames, invites);

        }, error => console.error("Oyunlar dinlenirken hata:", error));
}


async function acceptInvite(gameId) {
    invitationModal.classList.add('hidden');
    try {
        await joinGame(gameId);
        
        await db.collection('games').doc(gameId).update({
            invitedPlayerId: firebase.firestore.FieldValue.delete(),
            status: 'waiting' 
        });
        
    } catch (error) {
        console.error('Davet kabul edilemedi:', error);
        showToast('Oyuna katılırken bir hata oluştu.', true);
    }
}
async function rejectInvite(gameId) {
    invitationModal.classList.add('hidden');
    try {
        await db.collection('games').doc(gameId).delete();
        showToast('Davet reddedildi.');
    } catch (error) {
        console.error('Davet reddedilemedi:', error);
    }
}
async function showFriendProfile(friendId) {
    try {
        const userDoc = await db.collection('users').doc(friendId).get();
        if (userDoc.exists) {
            const friendProfile = userDoc.data();
            document.getElementById('profile-fullname').textContent = friendProfile.fullname;
            document.getElementById('profile-username').textContent = friendProfile.username;
            document.getElementById('profile-email').textContent = friendProfile.email;
            document.getElementById('profile-age').textContent = friendProfile.age;
            document.getElementById('profile-city').textContent = friendProfile.city;
            displayStats(friendProfile);
            showScreen('profile-screen');
        } else {
            showToast("Kullanıcı profili bulunamadı.", true);
        }
    } catch(error) {
        showToast("Profil getirilirken hata oluştu.", true);
        console.error(error);
    }
}
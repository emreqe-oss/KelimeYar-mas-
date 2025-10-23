// js/friends.js
import { db } from './firebase.js';
import { userId } from './state.js';
import { showToast } from './utils.js';
import { showScreen, displayStats } from './ui.js';
import { createGame, joinGame } from './game.js';

// Elementler
const friendsList = document.getElementById('friends-list');
const friendRequestsList = document.getElementById('friend-requests-list');
const searchFriendInput = document.getElementById('search-friend-input');
const friendSearchResults = document.getElementById('friend-search-results');
const friendRequestCount = document.getElementById('friend-request-count');
const friendsListPlaceholder = document.getElementById('friends-list-placeholder');
const friendRequestsPlaceholder = document.getElementById('friend-requests-placeholder');
const invitationText = document.getElementById('invitation-text');
const acceptInviteBtn = document.getElementById('accept-invite-btn');
const rejectInviteBtn = document.getElementById('reject-invite-btn');
const invitationModal = document.getElementById('invitation-modal');

export async function searchUsers() {
    const query = searchFriendInput.value.trim();
    if (query.length < 3) return showToast("Arama için en az 3 karakter girin.", true);

    friendSearchResults.innerHTML = '<p class="text-gray-400">Aranıyor...</p>';
    try {
        const byUsername = db.collection('users').where('username', '==', query).get();
        const byEmail = db.collection('users').where('email', '==', query).get();
        const [usernameSnapshot, emailSnapshot] = await Promise.all([byUsername, byEmail]);
        
        const results = new Map();
        usernameSnapshot.forEach(doc => { if (doc.id !== userId) results.set(doc.id, { id: doc.id, ...doc.data() }); });
        emailSnapshot.forEach(doc => { if (doc.id !== userId) results.set(doc.id, { id: doc.id, ...doc.data() }); });

        if (results.size === 0) {
            friendSearchResults.innerHTML = '<p class="text-gray-400">Kullanıcı bulunamadı.</p>';
        } else {
            friendSearchResults.innerHTML = '';
            results.forEach(user => {
                const userDiv = document.createElement('div');
                userDiv.className = 'bg-gray-700 p-2 rounded flex justify-between items-center';
                userDiv.innerHTML = `<span>${user.username} <span class="text-xs text-gray-400">(${user.fullname})</span></span>`;
                const addButton = document.createElement('button');
                addButton.className = 'bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 rounded-lg text-xs';
                addButton.textContent = 'Ekle';
                addButton.onclick = () => sendFriendRequest(user.id);
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
    if (!userId || !receiverId) return;
    try {
        const friendshipData = {
            users: [userId, receiverId],
            senderId: userId,
            receiverId: receiverId,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
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
    return db.collection('friendships').where('users', 'array-contains', userId)
        .onSnapshot(async (snapshot) => {
            const friendPromises = [];
            const requestPromises = [];
            let pendingCount = 0;

            snapshot.forEach(doc => {
                const data = { id: doc.id, ...doc.data() };
                if (data.status === 'accepted') {
                    const friendId = data.users.find(id => id !== userId);
                    if (friendId) friendPromises.push(
                        db.collection('users').doc(friendId).get().then(userDoc => ({
                            friendshipId: data.id,
                            id: userDoc.id,
                            ...userDoc.data()
                        }))
                    );
                } else if (data.status === 'pending' && data.receiverId === userId) {
                    pendingCount++;
                    requestPromises.push(
                        db.collection('users').doc(data.senderId).get().then(userDoc => ({
                            friendshipId: data.id,
                            id: userDoc.id,
                            ...userDoc.data()
                        }))
                    );
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


function renderFriends(friends, requests) {
    friendsList.innerHTML = '';
    friendRequestsList.innerHTML = '';

    if (friends.length > 0) {
        friendsListPlaceholder.classList.add('hidden');
        friends.forEach(friend => {
            const friendDiv = document.createElement('div');
            friendDiv.className = 'bg-gray-700 p-2 rounded flex justify-between items-center';
            friendDiv.innerHTML = `<span>${friend.username}</span>`;
            
            const buttonsWrapper = document.createElement('div');
            buttonsWrapper.className = 'flex gap-2 items-center';
            
            const profileButton = document.createElement('button');
            profileButton.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded-lg text-xs';
            profileButton.textContent = 'Profil';
            profileButton.onclick = () => showFriendProfile(friend.id);

            const inviteButton = document.createElement('button');
            inviteButton.className = 'bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-1 px-2 rounded-lg text-xs';
            inviteButton.textContent = 'Davet Et';
            inviteButton.onclick = () => createGameWithFriend(friend.id);

            const removeButton = document.createElement('button');
            removeButton.className = 'bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-lg text-xs';
            removeButton.textContent = 'Sil';
            removeButton.onclick = () => removeFriend(friend.friendshipId);

            buttonsWrapper.appendChild(profileButton);
            buttonsWrapper.appendChild(inviteButton);
            buttonsWrapper.appendChild(removeButton);
            friendDiv.appendChild(buttonsWrapper);
            friendsList.appendChild(friendDiv);
        });
    } else {
        friendsListPlaceholder.classList.remove('hidden');
    }

    if (requests.length > 0) {
        friendRequestsPlaceholder.classList.add('hidden');
        requests.forEach(request => {
            const requestDiv = document.createElement('div');
            requestDiv.className = 'bg-gray-700 p-2 rounded flex justify-between items-center';
            requestDiv.innerHTML = `<span>${request.username}</span>`;

            const buttonsWrapper = document.createElement('div');
            buttonsWrapper.className = 'flex gap-2';

            const acceptButton = document.createElement('button');
            acceptButton.className = 'bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 rounded-lg text-xs';
            acceptButton.textContent = 'Kabul Et';
            acceptButton.onclick = () => handleFriendRequest(request.friendshipId, 'accept');

            const rejectButton = document.createElement('button');
            rejectButton.className = 'bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-lg text-xs';
            rejectButton.textContent = 'Reddet';
            rejectButton.onclick = () => handleFriendRequest(request.friendshipId, 'reject');

            buttonsWrapper.appendChild(acceptButton);
            buttonsWrapper.appendChild(rejectButton);
            requestDiv.appendChild(buttonsWrapper);
            friendRequestsList.appendChild(requestDiv);
        });
    } else {
        friendRequestsPlaceholder.classList.remove('hidden');
    }
}

export function createGameWithFriend(friendId) {
    // Bu fonksiyonu doğrudan createGame'e bağlamak yerine,
    // ana dosyada bir event listener'da kullanacağız.
    // Şimdilik sadece setup ekranını gösterip bir mesaj verelim.
    document.getElementById('create-game-btn').onclick = () => createGame(friendId);
    showScreen('multiplayer-setup-screen');
    showToast(`Oyun kurarak arkadaşına meydan oku.`, false);
}


export function listenForGameInvites() {
    return db.collection('games').where('invitedPlayerId', '==', userId).where('status', '==', 'invited')
        .onSnapshot(async (snapshot) => {
            if (snapshot.docs.length > 0) {
                const inviteDoc = snapshot.docs[0];
                const inviteData = { id: inviteDoc.id, ...inviteDoc.data() };
                const creatorDoc = await db.collection('users').doc(inviteData.creatorId).get();
                const creatorUsername = creatorDoc.exists() ? creatorDoc.data().username : 'Bir arkadaşın';

                invitationText.innerHTML = `<strong class="text-yellow-400">${creatorUsername}</strong> seni bir oyuna davet ediyor!`;
                acceptInviteBtn.onclick = () => acceptInvite(inviteData.id);
                rejectInviteBtn.onclick = () => rejectInvite(inviteData.id);
                invitationModal.classList.remove('hidden');
            }
        });
}

async function acceptInvite(gameId) {
    invitationModal.classList.add('hidden');
    await joinGame(gameId);
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
document.addEventListener('DOMContentLoaded', () => {

    // Конфигурация Firebase остаётся для хранения сообщений
    const firebaseConfig = {
      apiKey: "AIzaSyAlJPuz42YLW5zKGng0WxtfTZrFn2VR_u8",
      authDomain: "duochatmessenger.firebaseapp.com",
      databaseURL: "https://duochatmessenger-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "duochatmessenger",
      storageBucket: "duochatmessenger.appspot.com",
      messagingSenderId: "457353996614",
      appId: "1:457353996614:web:1e99ff54ab5e1f4d205d47"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();

    // --- ЧАСТЬ ДЛЯ ONESIGNAL ---
    window.OneSignal = window.OneSignal || [];
    const OneSignal = window.OneSignal;

    // ВСТАВЬ СЮДА СВОЙ APP ID ИЗ ПАНЕЛИ ONESIGNAL
    const ONESIGNAL_APP_ID = "СЮДА_ВСТАВИТЬ_ТВОЙ_APP_ID"; 

    function initOneSignal() {
        OneSignal.push(function() {
            OneSignal.init({
                appId: ONESIGNAL_APP_ID,
            });

            OneSignal.on('subscriptionChange', function (isSubscribed) {
                if (isSubscribed) {
                    OneSignal.getUserId(function(userId) {
                        if(currentUser) {
                           db.ref(`users/${currentUser}/oneSignalId`).set(userId);
                        }
                    });
                }
            });
        });
    }

    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    const enterChatBtn = document.getElementById('enter-chat');
    const usernameInput = document.getElementById('username');
    const secretKeyInput = document.getElementById('secret-key');
    const exitChatBtn = document.getElementById('exit-chat');
    const messagesDiv = document.getElementById('messages');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    
    let currentUser = null;
    let currentSecretKey = null;
    let messagesRef = null;
    let friendName = null;

    // ИЗМЕНЕНИЕ: Используем localStorage вместо sessionStorage
    if (localStorage.getItem('duo-user')) {
        currentUser = localStorage.getItem('duo-user');
        currentSecretKey = localStorage.getItem('duo-key');
        friendName = localStorage.getItem('duo-friend');
        showChat();
    }
    
    enterChatBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim().replace(/[.#$\[\]]/g, '_');
        const secretKey = secretKeyInput.value.trim();
        const promptedFriendName = prompt("Введите имя вашего друга (точно так, как он его вводит):", "");

        if (username && secretKey && promptedFriendName) {
            currentUser = username;
            friendName = promptedFriendName.replace(/[.#$\[\]]/g, '_');
            currentSecretKey = btoa(secretKey);
            // ИЗМЕНЕНИЕ: Используем localStorage вместо sessionStorage
            localStorage.setItem('duo-user', currentUser);
            localStorage.setItem('duo-key', currentSecretKey);
            localStorage.setItem('duo-friend', friendName);
            showChat();
        } else {
            alert('Пожалуйста, введите ваше имя, имя друга и секретный ключ.');
        }
    });

    exitChatBtn.addEventListener('click', () => {
        if (messagesRef) messagesRef.off();
        // ИЗМЕНЕНИЕ: Используем localStorage вместо sessionStorage
        localStorage.clear();
        window.location.reload();
    });

    function showChat() {
        authContainer.classList.add('hidden');
        chatContainer.classList.remove('hidden');
        initOneSignal();
        listenForMessages();
    }
    
    function listenForMessages() {
        if (messagesRef) messagesRef.off();
        messagesRef = db.ref(`chats/${currentSecretKey}`);
        messagesRef.orderByChild('timestamp').on('child_added', snapshot => {
            const messageData = snapshot.val();
            if (messageData) displayMessage(messageData);
        });
    }

    function displayMessage(data) {
        const messageEl = document.createElement('div');
        messageEl.classList.add('message', data.author === currentUser ? 'my-message' : 'friend-message');
        const imgRegex = /\.(jpeg|jpg|gif|png|webp)$/i;
        let content = data.text;
        if (imgRegex.test(data.text)) {
            content = `<img src="${data.text}" class="message-image" alt="image">`;
        } else {
            const urlRegex = /((https?:\/\/)[^\s]+)/g;
            content = data.text.replace(urlRegex, (url) => `<a href="${url}" target="_blank">${url}</a>`);
        }
        messageEl.innerHTML = `<div class="message-content">${content}</div><div class="message-meta"><strong>${data.author}</strong> - ${new Date(data.timestamp).toLocaleTimeString()}</div>`;
        messagesDiv.appendChild(messageEl);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        if (text && messagesRef) {
            messagesRef.push({
                author: currentUser,
                text: text,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            messageInput.value = '';

            const userTokenRef = db.ref(`users/${friendName}/oneSignalId`);
            const snapshot = await userTokenRef.once('value');
            const friendOneSignalId = snapshot.val();

            if (friendOneSignalId) {
                 OneSignal.push(function() {
                    OneSignal.postNotification({
                        app_id: ONESIGNAL_APP_ID,
                        include_player_ids: [friendOneSignalId],
                        headings: { "en": `Новое сообщение от ${currentUser}` },
                        contents: { "en": text },
                        web_push_topic: `chat_${currentSecretKey}` // Добавляем топик, чтобы уведомления не мешали друг другу
                    });
                });
            } else {
                console.log("ID друга для уведомлений не найден. Он должен сначала зайти в чат и разрешить уведомления.");
            }
        }
    });
});
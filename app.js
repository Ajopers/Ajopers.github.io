// --- app.js (ВЕРСИЯ С ОТЛАДКОЙ) ---
document.addEventListener('DOMContentLoaded', () => {

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

    window.OneSignal = window.OneSignal || [];
    const OneSignal = window.OneSignal;
    const ONESIGNAL_APP_ID = "66444b21-934b-4428-bcc6-8845510894f9"; 

    // --- DOM Elements and Global Vars (без изменений) ---
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    const enterChatBtn = document.getElementById('enter-chat');
    const usernameInput = document.getElementById('username');
    const secretKeyInput = document.getElementById('secret-key');
    const exitChatBtn = document.getElementById('exit-chat');
    const messagesDiv = document.getElementById('messages');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const chatTitle = document.getElementById('chat-title');
    const chatStatus = document.getElementById('chat-status');
    const themeButton = document.getElementById('theme-button');
    const themeModal = document.getElementById('theme-modal');
    const closeThemeModalBtn = document.getElementById('close-theme-modal');
    const themeChoiceBtns = document.querySelectorAll('.theme-choice');
    let currentUser = null;
    let currentSecretKey = null;
    let messagesRef = null;
    let presenceRef = null;
    let typingRef = null;
    let typingTimeout = null;
    let onlineUsers = {};
    let usersTyping = {};

    function initOneSignal() {
        OneSignal.push(function() {
            OneSignal.init({ appId: ONESIGNAL_APP_ID });

            OneSignal.on('subscriptionChange', function (isSubscribed) {
                if (isSubscribed) {
                    OneSignal.getUserId(function(playerId) {
                        // --- ОТЛАДКА ---
                        console.log("ПОЛУЧЕН ONESIGNAL PLAYER ID:", playerId);
                        if (currentUser && playerId) {
                           db.ref(`users/${currentUser}/oneSignalPlayerId`).set(playerId)
                             .then(() => console.log(`Player ID для ${currentUser} успешно сохранен в Firebase.`))
                             .catch(err => console.error("ОШИБКА СОХРАНЕНИЯ Player ID:", err));
                        }
                    });
                } else {
                     if (currentUser) db.ref(`users/${currentUser}/oneSignalPlayerId`).remove();
                }
            });
        });
    }

    // --- Theme Management (без изменений) ---
    function applyTheme(themeName) { document.body.className = `theme-${themeName}`; if (themeName !== 'hell') localStorage.setItem('duo-theme', themeName); }
    themeButton.addEventListener('click', () => themeModal.classList.remove('hidden'));
    closeThemeModalBtn.addEventListener('click', () => themeModal.classList.add('hidden'));
    themeChoiceBtns.forEach(btn => btn.addEventListener('click', () => { applyTheme(btn.dataset.theme); themeModal.classList.add('hidden'); }));
    applyTheme(localStorage.getItem('duo-theme') || 'dark');

    // --- Auth and Login Logic (без изменений) ---
    if (localStorage.getItem('duo-user')) {
        currentUser = localStorage.getItem('duo-user');
        currentSecretKey = localStorage.getItem('duo-key');
        if (currentUser === '666') applyTheme('hell'); else applyTheme(localStorage.getItem('duo-theme') || 'dark');
        showChat();
    }
    enterChatBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim().replace(/[.#$\[\]]/g, '_');
        const secretKey = secretKeyInput.value.trim();
        if (username && secretKey) {
            currentUser = username;
            currentSecretKey = btoa(secretKey);
            localStorage.setItem('duo-user', currentUser);
            localStorage.setItem('duo-key', currentSecretKey);
            if (currentUser === '666') applyTheme('hell'); else applyTheme(localStorage.getItem('duo-theme') || 'dark');
            showChat();
        } else alert('Пожалуйста, введите ваше имя и ключ группы.');
    });
    exitChatBtn.addEventListener('click', () => {
        db.ref(`presence/${currentSecretKey}/${currentUser}`).remove();
        db.ref(`typing/${currentSecretKey}/${currentUser}`).remove();
        if (messagesRef) messagesRef.off(); if (presenceRef) presenceRef.off(); if (typingRef) typingRef.off();
        localStorage.removeItem('duo-user'); localStorage.removeItem('duo-key');
        window.location.reload();
    });

    function showChat() {
        authContainer.classList.add('hidden'); chatContainer.classList.remove('hidden');
        chatTitle.textContent = `Группа: ${atob(currentSecretKey)}`;
        initOneSignal(); listenForMessages(); setupStatusSystem();
    }

    // --- *** ОБНОВЛЕННАЯ ФОРМА ОТПРАВКИ С ДЕТАЛЬНОЙ ОТЛАДКОЙ *** ---
    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        if (!text) return;

        // Шаг 1: Отправка сообщения в чат
        messagesRef.push({ author: currentUser, text: text, timestamp: firebase.database.ServerValue.TIMESTAMP });
        messageInput.value = ''; messageInput.focus();
        db.ref(`typing/${currentSecretKey}/${currentUser}`).remove();

        // Шаг 2: Отправка Push-уведомления
        console.log("--- НАЧАЛО ОТПРАВКИ УВЕДОМЛЕНИЯ ---");
        try {
            const recipients = Object.keys(onlineUsers).filter(user => user !== currentUser);
            console.log("Текущий пользователь:", currentUser);
            console.log("Всего пользователей в сети:", Object.keys(onlineUsers));
            console.log("Получатели уведомления (в сети, кроме меня):", recipients);

            if (recipients.length === 0) {
                console.log("Нет других пользователей в сети. Уведомление не отправляется.");
                return;
            }

            const playerIds = [];
            for (const recipientName of recipients) {
                console.log(`Ищем Player ID для пользователя: ${recipientName}`);
                const snapshot = await db.ref(`users/${recipientName}/oneSignalPlayerId`).once('value');
                const playerId = snapshot.val();
                
                if (playerId) {
                    console.log(`%cНАЙДЕН Player ID для ${recipientName}: ${playerId}`, "color: green; font-weight: bold;");
                    playerIds.push(playerId);
                } else {
                    console.log(`%cНЕ НАЙДЕН Player ID для ${recipientName} в базе данных.`, "color: red;");
                }
            }
            
            console.log("Итоговый список Player ID для отправки:", playerIds);
            if (playerIds.length > 0) {
                OneSignal.push(function() {
                    OneSignal.postNotification({
                        app_id: ONESIGNAL_APP_ID,
                        include_player_ids: playerIds,
                        headings: { "en": `Новое сообщение от ${currentUser}` },
                        contents: { "en": text },
                    });
                });
                console.log("%cУведомление успешно отправлено на сервер OneSignal.", "background: #28a745; color: white;");
            } else {
                console.log("Не найдено ни одного Player ID, уведомление не отправлено.");
            }
        } catch (error) {
            console.error("Критическая ошибка при отправке уведомления:", error);
        }
    });

    // --- Остальные функции без изменений ---
    function listenForMessages(){ messagesRef = db.ref(`chats/${currentSecretKey}`); messagesDiv.innerHTML = ''; messagesRef.orderByChild('timestamp').on('child_added', snapshot => { if(snapshot.val()) displayMessage(snapshot.val()); }); }
    function displayMessage(data){ const messageEl = document.createElement('div'); messageEl.classList.add('message', data.author === currentUser ? 'my-message' : 'friend-message'); const imgRegex = /\.(jpeg|jpg|gif|png|webp)$/i; let content = data.text; const tempDiv = document.createElement('div'); tempDiv.innerText = content; content = tempDiv.innerHTML; if (imgRegex.test(data.text)) { content = `<img src="${data.text}" class="message-image" alt="image">`; } else { const urlRegex = /((https?:\/\/)[^\s]+)/g; content = content.replace(urlRegex, (url) => `<a href="${url}" target="_blank">${url}</a>`); } messageEl.innerHTML = `<div class="message-content">${content}</div><div class="message-meta"><strong>${data.author}</strong> - ${new Date(data.timestamp).toLocaleTimeString()}</div>`; messagesDiv.appendChild(messageEl); messagesDiv.scrollTop = messagesDiv.scrollHeight; }
    function setupStatusSystem(){ presenceRef = db.ref(`presence/${currentSecretKey}`); typingRef = db.ref(`typing/${currentSecretKey}`); const myPresenceRef = presenceRef.child(currentUser); const myTypingRef = typingRef.child(currentUser); db.ref('.info/connected').on('value', (snapshot) => { if (snapshot.val() === false) { myTypingRef.remove(); return; } myPresenceRef.onDisconnect().remove().then(() => myPresenceRef.set(true)); }); presenceRef.on('value', (snapshot) => { onlineUsers = snapshot.val() || {}; renderStatus(); }); typingRef.on('value', (snapshot) => { usersTyping = snapshot.val() || {}; renderStatus(); }); messageInput.addEventListener('input', () => { if (messageInput.value) { myTypingRef.set(true); clearTimeout(typingTimeout); typingTimeout = setTimeout(() => myTypingRef.remove(), 2000); } else { myTypingRef.remove(); } }); }
    function renderStatus(){ const typingNames = Object.keys(usersTyping).filter(name => name !== currentUser); if (typingNames.length > 0) { const typingText = typingNames.join(', ') + (typingNames.length === 1 ? ' печатает...' : ' печатают...'); chatStatus.textContent = typingText; } else { const onlineNames = Object.keys(onlineUsers); if (onlineNames.length > 0) { chatStatus.textContent = `В сети: ${onlineNames.length} (${onlineNames.join(', ')})`; } else { chatStatus.textContent = 'В группе никого нет'; } } }
});
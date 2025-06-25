document.addEventListener('DOMContentLoaded', () => {

    // --- КОНФИГУРАЦИЯ FIREBASE ---
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

    // --- ЭЛЕМЕНТЫ DOM ---
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
    
    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
    let currentUser = null;
    let currentSecretKey = null;
    let messagesRef = null;
    let presenceRef = null;
    let typingRef = null;
    let typingTimeout = null;

    // --- УПРАВЛЕНИЕ ТЕМАМИ ---
    function applyTheme(themeName) {
        document.body.className = `theme-${themeName}`;
        // Сохраняем тему, ТОЛЬКО если это не пасхалка. Пасхалка должна быть временной.
        if (themeName !== 'hell') {
            localStorage.setItem('duo-theme', themeName);
        }
    }

    themeButton.addEventListener('click', () => themeModal.classList.remove('hidden'));
    closeThemeModalBtn.addEventListener('click', () => themeModal.classList.add('hidden'));
    themeChoiceBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            applyTheme(theme);
            themeModal.classList.add('hidden');
        });
    });
    
    // Загружаем тему при старте. Это важно делать до проверки логина.
    const savedTheme = localStorage.getItem('duo-theme') || 'dark';
    applyTheme(savedTheme);


    // --- АВТОРИЗАЦИЯ И ВХОД В ЧАТ ---
    if (localStorage.getItem('duo-user')) {
        currentUser = localStorage.getItem('duo-user');
        currentSecretKey = localStorage.getItem('duo-key');
        
        // *** ИСПРАВЛЕНИЕ №1 ***
        // Проверяем на пасхалку даже при восстановлении сессии.
        if (currentUser === '666') {
            applyTheme('hell');
        } else {
            // Если ник не "666", восстанавливаем сохраненную пользователем тему
            const restoredTheme = localStorage.getItem('duo-theme') || 'dark';
            applyTheme(restoredTheme);
        }

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

            // *** ИСПРАВЛЕНИЕ №2 ***
            // Логика пасхалки теперь не конфликтует с сохранением темы
            if (currentUser === '666') {
                applyTheme('hell');
            } else {
                // Если пользователь меняет ник, сбрасываем тему на стандартную,
                // чтобы не осталась "адская" от прошлого логина
                const currentTheme = localStorage.getItem('duo-theme') || 'dark';
                applyTheme(currentTheme);
            }
            
            showChat();
        } else {
            alert('Пожалуйста, введите ваше имя и ключ группы.');
        }
    });

    exitChatBtn.addEventListener('click', () => {
        // Убираем себя из онлайн и печатающих
        if (presenceRef) presenceRef.child(currentUser).remove();
        if (typingRef) typingRef.child(currentUser).remove();

        // Отписываемся от слушателей
        if (messagesRef) messagesRef.off();
        if (presenceRef) presenceRef.off();
        if (typingRef) typingRef.off();
        
        // *** ИСПРАВЛЕНИЕ №3 ***
        // Очищаем всё, кроме сохраненной темы, чтобы выбор пользователя не сбрасывался
        localStorage.removeItem('duo-user');
        localStorage.removeItem('duo-key');
        
        window.location.reload();
    });

    function showChat() {
        authContainer.classList.add('hidden');
        chatContainer.classList.remove('hidden');
        chatTitle.textContent = `Группа: ${atob(currentSecretKey)}`;
        
        listenForMessages();
        setupPresenceSystem();
        setupTypingIndicator();
    }
    
    // --- СИСТЕМА СООБЩЕНИЙ ---
    function listenForMessages() {
        if (messagesRef) messagesRef.off();
        messagesRef = db.ref(`chats/${currentSecretKey}`);
        messagesDiv.innerHTML = ''; // Очищаем чат перед загрузкой новых сообщений
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
        
        // Экранируем HTML, чтобы избежать XSS-атак, кроме наших тегов
        const tempDiv = document.createElement('div');
        tempDiv.innerText = content;
        content = tempDiv.innerHTML;
        
        if (imgRegex.test(data.text)) {
            content = `<img src="${data.text}" class="message-image" alt="image">`;
        } else {
            const urlRegex = /((https?:\/\/)[^\s]+)/g;
            content = content.replace(urlRegex, (url) => `<a href="${url}" target="_blank">${url}</a>`);
        }
        
        messageEl.innerHTML = `<div class="message-content">${content}</div><div class="message-meta"><strong>${data.author}</strong> - ${new Date(data.timestamp).toLocaleTimeString()}</div>`;
        messagesDiv.appendChild(messageEl);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        if (text && messagesRef) {
            messagesRef.push({
                author: currentUser,
                text: text,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            messageInput.value = '';
            messageInput.focus();
            if (typingRef) typingRef.child(currentUser).remove();
        }
    });

    // --- СИСТЕМА ПРИСУТСТВИЯ (ONLINE/OFFLINE) ---
    function setupPresenceSystem() {
        presenceRef = db.ref(`presence/${currentSecretKey}`);
        const myPresenceRef = presenceRef.child(currentUser);

        db.ref('.info/connected').on('value', (snapshot) => {
            if (snapshot.val() === false) return;
            
            myPresenceRef.onDisconnect().remove()
                .then(() => myPresenceRef.set(true));
        });

        presenceRef.on('value', (snapshot) => {
            const onlineUsers = snapshot.val() ? Object.keys(snapshot.val()) : [];
            // Обновляем статус, только если никто не печатает
            if (!chatStatus.dataset.isTyping || chatStatus.dataset.isTyping === 'false') {
                updateOnlineStatus(onlineUsers);
            }
        });
    }

    function updateOnlineStatus(onlineUsers) {
        const onlineCount = onlineUsers.length;
        if (onlineCount > 0) {
            chatStatus.textContent = `В сети: ${onlineCount} (${onlineUsers.join(', ')})`;
        } else {
            chatStatus.textContent = 'В группе никого нет';
        }
    }

    // --- ИНДИКАТОР ПЕЧАТИ ---
    function setupTypingIndicator() {
        typingRef = db.ref(`typing/${currentSecretKey}`);
        const myTypingRef = typingRef.child(currentUser);

        messageInput.addEventListener('input', () => {
            if (messageInput.value) {
                myTypingRef.set(true);
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => myTypingRef.remove(), 3000);
            } else {
                myTypingRef.remove();
            }
        });

        typingRef.on('value', (snapshot) => {
            const typingUsers = [];
            snapshot.forEach(childSnapshot => {
                if (childSnapshot.key !== currentUser) {
                    typingUsers.push(childSnapshot.key);
                }
            });

            if (typingUsers.length > 0) {
                chatStatus.textContent = `${typingUsers.join(', ')} печатает...`;
                chatStatus.dataset.isTyping = 'true';
            } else {
                chatStatus.dataset.isTyping = 'false';
                // Возвращаем статус "в сети"
                presenceRef.once('value', (presenceSnapshot) => {
                    const onlineUsers = presenceSnapshot.val() ? Object.keys(presenceSnapshot.val()) : [];
                    updateOnlineStatus(onlineUsers);
                });
            }
        });
    }
});
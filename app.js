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
    let currentSecretKey = null; // Теперь это ключ группы
    let messagesRef = null;
    let presenceRef = null;
    let typingRef = null;
    let typingTimeout = null;

    // --- УПРАВЛЕНИЕ ТЕМАМИ ---
    function applyTheme(themeName) {
        document.body.className = `theme-${themeName}`;
        localStorage.setItem('duo-theme', themeName);
    }

    themeButton.addEventListener('click', () => themeModal.classList.remove('hidden'));
    closeThemeModalBtn.addEventListener('click', () => themeModal.classList.add('hidden'));
    themeChoiceBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            applyTheme(btn.dataset.theme);
            themeModal.classList.add('hidden');
        });
    });

    // Применяем сохраненную тему или тему по умолчанию
    const savedTheme = localStorage.getItem('duo-theme') || 'dark';
    applyTheme(savedTheme);

    // --- АВТОРИЗАЦИЯ И ВХОД В ЧАТ ---
    if (localStorage.getItem('duo-user')) {
        currentUser = localStorage.getItem('duo-user');
        currentSecretKey = localStorage.getItem('duo-key');
        showChat();
    }
    
    enterChatBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim().replace(/[.#$\[\]]/g, '_');
        const secretKey = secretKeyInput.value.trim();

        if (username && secretKey) {
            currentUser = username;
            currentSecretKey = btoa(secretKey); // Простое кодирование, не шифрование
            
            localStorage.setItem('duo-user', currentUser);
            localStorage.setItem('duo-key', currentSecretKey);

            // ПАСХАЛКА
            if (username === '666') {
                applyTheme('hell');
            }
            
            showChat();
        } else {
            alert('Пожалуйста, введите ваше имя и ключ группы.');
        }
    });

    exitChatBtn.addEventListener('click', () => {
        if (presenceRef) presenceRef.child(currentUser).remove(); // Убираем себя из списка онлайн
        if (messagesRef) messagesRef.off();
        if (typingRef) typingRef.off();
        db.ref(`presence/${currentSecretKey}`).off();

        localStorage.clear();
        // Сбрасываем тему на стандартную при выходе
        localStorage.setItem('duo-theme', 'dark');
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
            // Уведомляем, что мы перестали печатать
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
                .then(() => {
                    myPresenceRef.set(true);
                });
        });

        presenceRef.on('value', (snapshot) => {
            const onlineUsers = snapshot.val() ? Object.keys(snapshot.val()) : [];
            const onlineCount = onlineUsers.length;
            
            // Обновляем статус, но не показываем статус печати в этот момент
            if (!chatStatus.dataset.isTyping) {
                 if (onlineCount > 0) {
                    chatStatus.textContent = `В сети: ${onlineCount} (${onlineUsers.join(', ')})`;
                 } else {
                    chatStatus.textContent = 'В группе никого нет';
                 }
            }
        });
    }

    // --- ИНДИКАТОР ПЕЧАТИ ---
    function setupTypingIndicator() {
        typingRef = db.ref(`typing/${currentSecretKey}`);
        const myTypingRef = typingRef.child(currentUser);

        messageInput.addEventListener('input', () => {
            // Если пользователь печатает, ставим флаг в БД
            if (messageInput.value) {
                myTypingRef.set(true);
                // Убираем флаг через 3 секунды бездействия
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => myTypingRef.remove(), 3000);
            } else {
                myTypingRef.remove();
            }
        });

        // Слушаем изменения в "печатающих"
        typingRef.on('value', (snapshot) => {
            const typingUsers = [];
            snapshot.forEach(childSnapshot => {
                // Добавляем всех, кроме себя
                if (childSnapshot.key !== currentUser) {
                    typingUsers.push(childSnapshot.key);
                }
            });

            if (typingUsers.length > 0) {
                chatStatus.textContent = `${typingUsers.join(', ')} печатает...`;
                chatStatus.dataset.isTyping = 'true'; // Флаг, что сейчас показывается статус печати
            } else {
                chatStatus.dataset.isTyping = 'false';
                // Возвращаем статус "в сети", запуская его обновление
                setupPresenceSystem();
                presenceRef.once('value', (presenceSnapshot) => {
                    const onlineUsers = presenceSnapshot.val() ? Object.keys(presenceSnapshot.val()) : [];
                    chatStatus.textContent = `В сети: ${onlineUsers.length} (${onlineUsers.join(', ')})`;
                });
            }
        });
    }
});
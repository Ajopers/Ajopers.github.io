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

    // Переменные для хранения актуального состояния
    let onlineUsers = {};
    let usersTyping = {};

    // --- УПРАВЛЕНИЕ ТЕМАМИ ---
    function applyTheme(themeName) {
        document.body.className = `theme-${themeName}`;
        if (themeName !== 'hell') localStorage.setItem('duo-theme', themeName);
    }
    themeButton.addEventListener('click', () => themeModal.classList.remove('hidden'));
    closeThemeModalBtn.addEventListener('click', () => themeModal.classList.add('hidden'));
    themeChoiceBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            applyTheme(btn.dataset.theme);
            themeModal.classList.add('hidden');
        });
    });
    const savedTheme = localStorage.getItem('duo-theme') || 'dark';
    applyTheme(savedTheme);

    // --- АВТОРИЗАЦИЯ И ВХОД В ЧАТ ---
    if (localStorage.getItem('duo-user')) {
        currentUser = localStorage.getItem('duo-user');
        currentSecretKey = localStorage.getItem('duo-key');
        if (currentUser === '666') applyTheme('hell');
        else applyTheme(localStorage.getItem('duo-theme') || 'dark');
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
            if (currentUser === '666') applyTheme('hell');
            else applyTheme(localStorage.getItem('duo-theme') || 'dark');
            showChat();
        } else {
            alert('Пожалуйста, введите ваше имя и ключ группы.');
        }
    });

    exitChatBtn.addEventListener('click', () => {
        const myPresenceRef = db.ref(`presence/${currentSecretKey}/${currentUser}`);
        const myTypingRef = db.ref(`typing/${currentSecretKey}/${currentUser}`);
        if(myPresenceRef) myPresenceRef.remove();
        if(myTypingRef) myTypingRef.remove();
        if (messagesRef) messagesRef.off();
        if (presenceRef) presenceRef.off();
        if (typingRef) typingRef.off();
        localStorage.removeItem('duo-user');
        localStorage.removeItem('duo-key');
        window.location.reload();
    });

    function showChat() {
        authContainer.classList.add('hidden');
        chatContainer.classList.remove('hidden');
        chatTitle.textContent = `Группа: ${atob(currentSecretKey)}`;
        listenForMessages();
        setupStatusSystem();
    }
    
    // --- СИСТЕМА СООБЩЕНИЙ ---
    function listenForMessages() {
        messagesRef = db.ref(`chats/${currentSecretKey}`);
        messagesDiv.innerHTML = ''; 
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
            messagesRef.push({ author: currentUser, text: text, timestamp: firebase.database.ServerValue.TIMESTAMP });
            messageInput.value = '';
            messageInput.focus();
            db.ref(`typing/${currentSecretKey}/${currentUser}`).remove();
        }
    });

    // --- НОВАЯ СИСТЕМА СТАТУСОВ ---
    function setupStatusSystem() {
        presenceRef = db.ref(`presence/${currentSecretKey}`);
        typingRef = db.ref(`typing/${currentSecretKey}`);
        const myPresenceRef = presenceRef.child(currentUser);
        const myTypingRef = typingRef.child(currentUser);

        // Устанавливаем свой онлайн-статус
        db.ref('.info/connected').on('value', (snapshot) => {
            if (snapshot.val() === false) {
                myTypingRef.remove(); // Если соединение потеряно, удаляем свой статус печати
                return;
            }
            myPresenceRef.onDisconnect().remove().then(() => myPresenceRef.set(true));
        });

        // Слушаем, кто онлайн
        presenceRef.on('value', (snapshot) => {
            onlineUsers = snapshot.val() || {};
            renderStatus();
        });

        // Слушаем, кто печатает
        typingRef.on('value', (snapshot) => {
            usersTyping = snapshot.val() || {};
            renderStatus();
        });

        // Сообщаем, что мы печатаем
        messageInput.addEventListener('input', () => {
            if (messageInput.value) {
                myTypingRef.set(true);
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => myTypingRef.remove(), 2000); // 2 секунды
            } else {
                myTypingRef.remove();
            }
        });
    }

    // Единственная функция, которая обновляет текст статуса
    function renderStatus() {
        // Получаем список печатающих, кроме себя
        const typingNames = Object.keys(usersTyping).filter(name => name !== currentUser);
        
        if (typingNames.length > 0) {
            // Приоритет №1: Показать, кто печатает
            const typingText = typingNames.join(', ') + (typingNames.length === 1 ? ' печатает...' : ' печатают...');
            chatStatus.textContent = typingText;
        } else {
            // Приоритет №2: Показать, кто в сети
            const onlineNames = Object.keys(onlineUsers);
            if (onlineNames.length > 0) {
                chatStatus.textContent = `В сети: ${onlineNames.length} (${onlineNames.join(', ')})`;
            } else {
                chatStatus.textContent = 'В группе никого нет';
            }
        }
    }
});
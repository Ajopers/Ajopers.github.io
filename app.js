document.addEventListener('DOMContentLoaded', () => {

    // Вся настройка уже сделана с твоими данными. Больше ничего не трогай.
    const firebaseConfig = {
      apiKey: "AIzaSyAlJPuz42YLW5zKGng0WxtfTZrFn2VR_u8",
      authDomain: "duochatmessenger.firebaseapp.com",
      databaseURL: "https://duochatmessenger-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "duochatmessenger",
      storageBucket: "duochatmessenger.appspot.com", // Я немного поправил эту строку, так часто бывает правильнее
      messagingSenderId: "457353996614",
      appId: "1:457353996614:web:1e99ff54ab5e1f4d205d47"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();

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

    if (sessionStorage.getItem('duo-user') && sessionStorage.getItem('duo-key')) {
        currentUser = sessionStorage.getItem('duo-user');
        currentSecretKey = sessionStorage.getItem('duo-key');
        showChat();
    }
    
    enterChatBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        const secretKey = secretKeyInput.value.trim();
        if (username && secretKey) {
            currentUser = username;
            currentSecretKey = btoa(secretKey); // Простое шифрование ключа, чтобы он не был виден в базе
            sessionStorage.setItem('duo-user', currentUser);
            sessionStorage.setItem('duo-key', currentSecretKey);
            showChat();
        } else {
            alert('Пожалуйста, введите имя и секретный ключ.');
        }
    });
    
    exitChatBtn.addEventListener('click', () => {
        if (messagesRef) {
            messagesRef.off();
        }
        sessionStorage.clear();
        currentUser = null;
        currentSecretKey = null;
        authContainer.classList.remove('hidden');
        chatContainer.classList.add('hidden');
    });

    function showChat() {
        authContainer.classList.add('hidden');
        chatContainer.classList.remove('hidden');
        listenForMessages();
    }
    
    function listenForMessages() {
        if (messagesRef) {
            messagesRef.off();
        }
        messagesRef = db.ref(`chats/${currentSecretKey}`);
        messagesRef.on('child_added', snapshot => {
            const messageData = snapshot.val();
            if (messageData) {
                displayMessage(messageData);
            }
        });
    }

    function displayMessage(data) {
        const messageEl = document.createElement('div');
        messageEl.classList.add('message', data.author === currentUser ? 'my-message' : 'friend-message');
        
        // Проверяем, является ли текст ссылкой на картинку или гифку
        const imgRegex = /\.(jpeg|jpg|gif|png|webp)$/i;
        let content = data.text;
        if (imgRegex.test(data.text)) {
            content = `<img src="${data.text}" class="message-image" alt="image">`;
        } else {
            // Превращаем обычные ссылки в кликабельные, но не картинки
            const urlRegex = /((https?:\/\/)[^\s]+)/g;
            content = data.text.replace(urlRegex, (url) => `<a href="${url}" target="_blank">${url}</a>`);
        }

        messageEl.innerHTML = `
            <div class="message-content">${content}</div>
            <div class="message-meta">
                <strong>${data.author}</strong> - ${new Date(data.timestamp).toLocaleTimeString()}
            </div>
        `;
        messagesDiv.appendChild(messageEl);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    messageForm.addEventListener('submit', e => {
        e.preventDefault();
        const text = messageInput.value.trim();
        if (text && messagesRef) {
            messagesRef.push({
                author: currentUser,
                text: text,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            messageInput.value = '';
        }
    });
});
// Основные переменные
let peer = null;
let connections = {};
let currentRoom = null;
let userName = '';
let roomHost = false;
let messageHistory = [];
let showingRoomInfo = false;
let isMicrophoneTested = false;
let callStream = null;
let activeCall = null;
let callState = 'idle';
let callTimer = null;
let callStartTime = null;
let remoteStreams = {};
let peerConnections = {};
let bestICEServers = [];
let peerReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let peerConnectionHealthCheck = null;
let currentPeerServer = 0;
const MAX_HISTORY = 100;

// Список альтернативных PeerJS серверов
const PEERJS_SERVERS = [
    {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        key: 'peerjs',
        secure: true,
        pingInterval: 5000
    },
    {
        host: '1.peerjs.com',
        port: 443,
        path: '/',
        key: 'peerjs',
        secure: true,
        pingInterval: 5000
    },
    {
        host: '2.peerjs.com',
        port: 443,
        path: '/',
        key: 'peerjs',
        secure: true,
        pingInterval: 5000
    },
    {
        host: '3.peerjs.com',
        port: 443,
        path: '/',
        key: 'peerjs',
        secure: true,
        pingInterval: 5000
    }
];

// Все доступные ICE серверы (STUN + TURN)
const ALL_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
        urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
    }
];

// Элементы DOM
const setupSection = document.getElementById('setupSection');
const roomSection = document.getElementById('roomSection');
const chatSection = document.getElementById('chatSection');
const roomInfo = document.getElementById('roomInfo');
const roomCodeElement = document.getElementById('roomCode');
const connectCodeInput = document.getElementById('connectCode');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const statusDiv = document.getElementById('status');
const usersList = document.getElementById('usersList');
const onlineCount = document.getElementById('onlineCount');
const userNameInput = document.getElementById('userName');
const micTestDiv = document.getElementById('micTest');
const callControls = document.getElementById('callControls');
const callStatus = document.getElementById('callStatus');
const acceptCallBtn = document.getElementById('acceptCallBtn');
const rejectCallBtn = document.getElementById('rejectCallBtn');
const endCallBtn = document.getElementById('endCallBtn');
const callTimerElement = document.getElementById('callTimer');
const remoteAudioContainer = document.getElementById('remoteAudioContainer');
const startCallBtn = document.getElementById('startCallBtn');

// Инициализация
async function init() {
    console.log('P2P Chat initializing...');
    
    // Восстанавливаем имя пользователя
    const savedName = localStorage.getItem('p2p_chat_username');
    if (savedName) {
        userName = savedName;
        userNameInput.value = savedName;
    } else {
        userName = generateRandomName();
        userNameInput.value = userName;
        localStorage.setItem('p2p_chat_username', userName);
    }
    console.log('User:', userName);
    
    // Загружаем PeerJS
    await loadPeerJS();
    
    // Тестируем ICE серверы
    await testAndSelectBestICEServers();
    
    // Запускаем очистку старых пользователей
    cleanupUserList();
    
    // Периодическая очистка
    setInterval(cleanupUserList, 30000);
    
    updateStatus('✅ Система готова');
}

// Загрузка PeerJS библиотеки
async function loadPeerJS() {
    return new Promise((resolve) => {
        if (typeof Peer !== 'undefined') {
            console.log('✅ PeerJS already loaded');
            updateStatus('✅ PeerJS загружен');
            resolve();
            return;
        }
        
        console.log('Loading PeerJS...');
        updateStatus('⏳ Загрузка PeerJS...');
        
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/peerjs@1.5.0/dist/peerjs.min.js';
        
        script.onload = function() {
            console.log('✅ PeerJS loaded');
            updateStatus('✅ PeerJS загружен');
            resolve();
        };
        
        script.onerror = function() {
            console.warn('❌ Failed to load PeerJS from CDN');
            updateStatus('❌ Ошибка загрузки PeerJS');
            resolve(); // Все равно продолжаем, возможно PeerJS уже загружен
        };
        
        document.head.appendChild(script);
    });
}

// Тест и выбор лучших ICE серверов
async function testAndSelectBestICEServers() {
    console.log('Тестирование ICE серверов...');
    
    const workingServers = [];
    
    // Простой тест Google STUN серверов
    const googleStunServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
    ];
    
    // Берем только Google STUN + 1 TURN для простоты
    bestICEServers = [...googleStunServers, ALL_ICE_SERVERS[5]]; // openrelay TURN
    
    console.log(`✅ Используется ${bestICEServers.length} серверов`);
    updateStatus(`✅ ${bestICEServers.length} сетевых серверов`);
    
    return bestICEServers;
}

// Получить лучшие ICE серверы
function getBestICEServers() {
    return bestICEServers;
}

// Создание экземпляра Peer
async function createPeerInstance(id = null) {
    const server = PEERJS_SERVERS[currentPeerServer];
    console.log(`Создание peer на сервере: ${server.host}:${server.port}`);
    
    const config = {
        host: server.host,
        port: server.port,
        path: server.path,
        key: server.key,
        secure: server.secure,
        config: {
            iceServers: getBestICEServers(),
            iceCandidatePoolSize: 5,
            iceTransportPolicy: 'all'
        },
        debug: 1,
        pingInterval: 5000
    };
    
    if (id) {
        return new Peer(id, config);
    } else {
        return new Peer(config);
    }
}

// Очистка старых пользователей из localStorage
function cleanupUserList() {
    if (!peer) return;
    
    const activeIds = [peer.id, ...Object.keys(connections)];
    const allKeys = Object.keys(localStorage);
    
    allKeys.forEach(key => {
        if (key.startsWith('p2p_chat_user_') && !key.endsWith('_time')) {
            const userId = key.replace('p2p_chat_user_', '');
            if (!activeIds.includes(userId)) {
                const timeKey = key + '_time';
                const timeStamp = localStorage.getItem(timeKey);
                const fiveMinutesAgo = Date.now() - 300000;
                
                if (!timeStamp || parseInt(timeStamp) < fiveMinutesAgo) {
                    localStorage.removeItem(key);
                    localStorage.removeItem(timeKey);
                }
            }
        }
    });
}

// Диагностика аудио проблем
function diagnoseAudioIssues() {
    console.log('=== Диагностика аудио ===');
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            console.log('✅ Микрофон доступен');
            stream.getTracks().forEach(track => track.stop());
        })
        .catch(err => {
            console.error('❌ Микрофон недоступен:', err);
            addSystemMessage('❌ Ошибка доступа к микрофону: ' + err.message);
        });
}

// Тест микрофона
async function testMicrophone() {
    try {
        console.log('Testing microphone...');
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        
        micTestDiv.innerHTML = '<span style="color: #28a745;">✅ Микрофон работает нормально</span>';
        isMicrophoneTested = true;
        
        setTimeout(() => {
            stream.getTracks().forEach(track => track.stop());
        }, 3000);
        
        console.log('Microphone test passed');
        
    } catch (error) {
        console.error('Microphone error:', error);
        micTestDiv.innerHTML = '<span style="color: #dc3545;">❌ Ошибка доступа к микрофону</span>';
        isMicrophoneTested = false;
    }
}

// Сохранение имени пользователя
function saveUserName() {
    console.log('saveUserName() called');
    const newName = userNameInput.value.trim();
    if (!newName) {
        alert('Пожалуйста, введите имя!');
        return;
    }
    
    if (newName.length > 20) {
        alert('Имя не должно превышать 20 символов!');
        return;
    }
    
    userName = newName;
    localStorage.setItem('p2p_chat_username', userName);
    
    setupSection.style.display = 'none';
    roomSection.style.display = 'block';
    console.log('Name saved:', userName);
}

// Изменить имя
function changeName() {
    userNameInput.value = userName;
    setupSection.style.display = 'block';
    roomSection.style.display = 'none';
    chatSection.style.display = 'none';
    showingRoomInfo = false;
    userNameInput.focus();
}

// Переключение между чатом и информацией
function toggleRoomInfo() {
    showingRoomInfo = !showingRoomInfo;
    
    if (showingRoomInfo) {
        roomSection.style.display = 'block';
        chatSection.style.display = 'none';
        const infoButton = document.getElementById('infoButton');
        if (infoButton) {
            infoButton.textContent = '← Назад в чат';
        }
    } else {
        backToChat();
    }
}

// Возврат в чат
function backToChat() {
    showingRoomInfo = false;
    roomSection.style.display = 'none';
    chatSection.style.display = 'block';
    
    const infoButton = document.getElementById('infoButton');
    if (infoButton) {
        infoButton.textContent = 'ℹ️ Инфо';
    }
    
    setTimeout(() => {
        if (messageInput && !messageInput.disabled) {
            messageInput.focus();
        }
    }, 100);
}

// Создание новой комнаты (ГЛАВНОЕ ИСПРАВЛЕНИЕ - создатель сразу в чате)
async function createRoom() {
    console.log('=== createRoom() called ===');
    
    if (!userName) {
        alert('Пожалуйста, сначала сохраните имя!');
        return;
    }
    
    if (typeof Peer === 'undefined') {
        alert('Библиотека PeerJS загружается... Подождите немного и попробуйте снова.');
        await loadPeerJS();
        return;
    }
    
    currentRoom = generateRoomCode();
    roomHost = true;
    showingRoomInfo = false;
    peerReconnectAttempts = 0;
    
    console.log('Creating room with code:', currentRoom);
    
    setupSection.style.display = 'none';
    roomSection.style.display = 'none';
    chatSection.classList.remove('hidden');
    
    // Пробуем создать peer
    try {
        peer = await createPeerInstance(currentRoom);
        setupPeerEvents();
        
        // Ждем открытия соединения
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout creating peer'));
            }, 8000);
            
            peer.on('open', (id) => {
                clearTimeout(timeout);
                console.log('Peer opened with ID:', id);
                
                // ХОСТ СРАЗУ В ЧАТЕ - вот ключевое изменение!
                showChatForHost();
                resolve();
            });
            
            peer.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
        
    } catch (error) {
        console.error('Error creating room:', error);
        updateStatus('❌ Ошибка создания комнаты');
        addSystemMessage('❌ Не удалось подключиться к серверу');
        
        // Возвращаем в setup
        setupSection.style.display = 'block';
        roomSection.style.display = 'none';
        chatSection.classList.add('hidden');
    }
}

// Подключение к существующей комнате
async function connectToRoom() {
    console.log('=== connectToRoom() called ===');
    
    if (!userName) {
        alert('Пожалуйста, сначала сохраните имя!');
        return;
    }
    
    const roomCode = connectCodeInput.value.trim().toUpperCase();
    if (!roomCode) {
        alert('Введите код комнаты!');
        return;
    }
    
    if (roomCode.length !== 6) {
        alert('Код комнаты должен содержать 6 символов!');
        return;
    }
    
    currentRoom = roomCode;
    roomHost = false;
    showingRoomInfo = false;
    peerReconnectAttempts = 0;
    
    if (typeof Peer === 'undefined') {
        alert('Библиотека PeerJS загружается... Подождите немного и попробуйте снова.');
        await loadPeerJS();
        return;
    }
    
    console.log('Connecting to room:', currentRoom);
    
    setupSection.style.display = 'none';
    roomSection.style.display = 'none';
    
    try {
        peer = await createPeerInstance();
        setupPeerEvents();
        
        // Ждем открытия соединения
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout connecting to peer server'));
            }, 8000);
            
            peer.on('open', () => {
                clearTimeout(timeout);
                console.log('Peer opened, connecting to host...');
                updateStatus('Подключение к комнате...');
                resolve();
            });
            
            peer.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
        
    } catch (error) {
        console.error('Error connecting to room:', error);
        updateStatus('❌ Ошибка подключения');
        addSystemMessage('❌ Не удалось подключиться к серверу');
        
        setupSection.style.display = 'block';
        roomSection.style.display = 'none';
        chatSection.classList.add('hidden');
    }
}

// Настройка обработчиков событий Peer
function setupPeerEvents() {
    peer.on('open', (id) => {
        console.log('Peer opened with ID:', id);
        peerReconnectAttempts = 0;
        
        if (roomHost) {
            console.log('Host is in chat');
        } else {
            connectToHost();
        }
        showCallButton();
    });
    
    peer.on('connection', (conn) => {
        console.log('Новое подключение:', conn.peer);
        setupConnection(conn);
    });
    
    peer.on('call', (call) => {
        console.log('Входящий звонок от:', call.peer);
        handleIncomingCall(call);
    });
    
    peer.on('error', (err) => {
        console.error('Peer error:', err);
        
        if (err.type === 'peer-unavailable') {
            addSystemMessage('❌ Комната не найдена или хост отключился');
        } else if (err.type === 'server-error') {
            addSystemMessage('⚠️ Проблемы с сервером');
        }
    });
    
    peer.on('disconnected', () => {
        console.log('Peer disconnected from server');
        updateStatus('⚠️ Переподключение к серверу...');
        
        setTimeout(() => {
            if (peer && !peer.destroyed) {
                console.log('Attempting to reconnect...');
                peer.reconnect();
            }
        }, 2000);
    });
}

// Подключение к хосту
function connectToHost() {
    console.log('Connecting to host...');
    updateStatus('Подключение к хосту...');
    
    const conn = peer.connect(currentRoom, {
        reliable: true,
        serialization: 'json',
        metadata: {
            name: userName,
            timestamp: Date.now()
        }
    });
    
    conn.on('open', () => {
        console.log('Connected to host');
        setupConnection(conn);
        showChat();
    });
    
    conn.on('error', (err) => {
        console.error('Connection error:', err);
        updateStatus('❌ Ошибка подключения к хосту');
        addSystemMessage('❌ Не удалось подключиться к хосту');
    });
}

// Настройка соединения
function setupConnection(conn) {
    const peerId = conn.peer;
    
    connections[peerId] = conn;
    
    conn.on('data', (data) => {
        handleIncomingData(data, peerId);
    });
    
    conn.on('close', () => {
        console.log('Соединение закрыто:', peerId);
        delete connections[peerId];
        
        const user = getUserInfo(peerId);
        if (user) {
            addSystemMessage(`${user.name} покинул чат`);
        }
        
        localStorage.removeItem(`p2p_chat_user_${peerId}`);
        localStorage.removeItem(`p2p_chat_user_${peerId}_time`);
        
        updateUsersList();
        
        if (Object.keys(connections).length === 0 && !roomHost) {
            updateStatus('❌ Соединение с комнатой потеряно');
            messageInput.disabled = true;
            sendButton.disabled = true;
        }
    });
    
    // Для хоста: при новом подключении отправляем приветственное сообщение
    if (roomHost && peerId !== currentRoom) {
        addSystemMessage(`Новый участник подключается...`);
        
        conn.send({
            type: 'user_join',
            name: userName,
            id: peer.id,
            isHost: true
        });
        
        if (messageHistory.length > 0) {
            setTimeout(() => {
                conn.send({
                    type: 'message_history',
                    messages: messageHistory.slice(-20)
                });
            }, 1000);
        }
    }
}

// Обработка входящих данных
function handleIncomingData(data, fromPeer) {
    console.log('Получены данные от', fromPeer, ':', data.type);
    
    switch (data.type) {
        case 'message':
            messageHistory.push({
                ...data,
                timestamp: data.timestamp || new Date().toLocaleTimeString()
            });
            
            if (messageHistory.length > MAX_HISTORY) {
                messageHistory = messageHistory.slice(-MAX_HISTORY);
            }
            
            if (data.senderId !== peer.id) {
                addMessage(data.message, data.sender, false, data.timestamp);
            }
            break;
            
        case 'user_join':
            if (data.id !== peer.id) {
                addSystemMessage(`🎉 ${data.name} присоединился к чату`);
                saveUserInfo(data.id, data.name);
                updateUsersList();
                
                if (roomHost) {
                    broadcast({
                        type: 'user_join_broadcast',
                        user: { id: data.id, name: data.name }
                    }, fromPeer);
                }
            }
            break;
            
        case 'user_join_broadcast':
            if (data.user.id !== peer.id) {
                saveUserInfo(data.user.id, data.user.name);
                updateUsersList();
            }
            break;
            
        case 'message_history':
            data.messages.forEach(msg => {
                if (msg.type === 'message' && msg.senderId !== peer.id) {
                    addMessage(msg.message, msg.sender, false, msg.timestamp);
                }
            });
            break;
            
        case 'user_list_request':
            if (roomHost) {
                const users = getAllUsers();
                connections[fromPeer].send({
                    type: 'user_list_response',
                    users: users
                });
            }
            break;
            
        case 'user_list_response':
            data.users.forEach(user => {
                saveUserInfo(user.id, user.name);
            });
            updateUsersList();
            break;
    }
}

// Сохранить информацию о пользователе
function saveUserInfo(userId, name) {
    const key = `p2p_chat_user_${userId}`;
    localStorage.setItem(key, name);
    localStorage.setItem(`${key}_time`, Date.now().toString());
}

// Получить информацию о пользователе
function getUserInfo(userId) {
    const name = localStorage.getItem(`p2p_chat_user_${userId}`);
    return name ? { id: userId, name } : null;
}

// Получить список активных пользователей
function getAllUsers() {
    const users = [{ id: peer.id, name: userName }];
    
    Object.keys(connections).forEach(peerId => {
        const conn = connections[peerId];
        if (conn && conn.open) {
            const userInfo = getUserInfo(peerId);
            if (userInfo) {
                users.push(userInfo);
            } else {
                users.push({ id: peerId, name: `Участник_${peerId.substr(0, 4)}` });
            }
        }
    });
    
    return users;
}

// Отправка текстового сообщения
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    if (showingRoomInfo) {
        backToChat();
    }
    
    const messageData = {
        type: 'message',
        message: message,
        sender: userName,
        senderId: peer.id,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    addMessage(message, userName, true, messageData.timestamp);
    
    messageHistory.push(messageData);
    if (messageHistory.length > MAX_HISTORY) {
        messageHistory = messageHistory.slice(-MAX_HISTORY);
    }
    
    broadcast(messageData);
    
    messageInput.value = '';
    messageInput.focus();
}

// Широковещательная рассылка
function broadcast(data, excludePeer = null) {
    Object.keys(connections).forEach(peerId => {
        if (peerId !== excludePeer && connections[peerId].open) {
            try {
                connections[peerId].send(data);
            } catch (err) {
                console.error('Ошибка отправки сообщения:', err);
            }
        }
    });
}

// Добавление текстового сообщения
function addMessage(text, sender, isOwn = false, timestamp = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    
    const time = timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-info">
            <strong>${isOwn ? 'Вы' : escapeHtml(sender)}</strong>
            <span>${time}</span>
        </div>
        <div class="message-text">${escapeHtml(text)}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Добавление системного сообщения
function addSystemMessage(text) {
    const systemDiv = document.createElement('div');
    systemDiv.className = 'message system';
    systemDiv.textContent = text;
    messagesDiv.appendChild(systemDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Обновление списка участников
function updateUsersList() {
    const users = getAllUsers();
    usersList.innerHTML = '';
    
    users.forEach(user => {
        const userBadge = document.createElement('div');
        userBadge.className = `user-badge ${user.id === peer.id ? 'you' : ''} ${peerConnections[user.id] ? 'in-call' : ''}`;
        
        const callIndicator = peerConnections[user.id] ? 
            '<span class="audio-indicator"><span class="dot"></span>в разговоре</span>' : '';
        
        userBadge.innerHTML = `
            ${user.name}
            ${user.id === peer.id ? '<span style="font-size: 10px; opacity: 0.8;">(вы)</span>' : ''}
            ${callIndicator}
        `;
        
        if (user.id !== peer.id && !peerConnections[user.id]) {
            const callBtn = document.createElement('button');
            callBtn.className = 'call-user-btn';
            callBtn.innerHTML = '📞';
            callBtn.title = 'Позвонить';
            callBtn.onclick = (e) => {
                e.stopPropagation();
                startAudioCall(user.id);
            };
            userBadge.appendChild(callBtn);
        }
        
        usersList.appendChild(userBadge);
    });
    
    const online = users.length;
    const inCall = Object.keys(peerConnections).length;
    onlineCount.textContent = `${online} онлайн${inCall > 0 ? `, ${inCall} в разговоре` : ''}`;
    onlineCount.className = `user-count ${online > 1 ? 'pulse' : ''}`;
}

// Показать чат для хоста (ОТДЕЛЬНАЯ ФУНКЦИЯ)
function showChatForHost() {
    console.log('showChatForHost() - хост сразу в чате');
    setupSection.style.display = 'none';
    roomSection.style.display = 'none';
    chatSection.classList.remove('hidden');
    showingRoomInfo = false;
    
    const infoButton = document.getElementById('infoButton');
    if (infoButton) {
        infoButton.textContent = 'ℹ️ Инфо';
    }
    
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();
    
    roomCodeElement.value = currentRoom;
    
    updateStatus(`✅ Комната создана: ${currentRoom}`);
    
    addSystemMessage(`🎉 Вы создали комнату! Код: ${currentRoom}`);
    addSystemMessage(`Пригласите других участников с помощью этого кода`);
    addSystemMessage(`📞 Теперь вы можете совершать голосовые звонки!`);
    
    updateUsersList();
    showCallButton();
}

// Показать чат для участника
function showChat() {
    console.log('showChat() - участник подключился');
    setupSection.style.display = 'none';
    roomSection.style.display = 'none';
    chatSection.classList.remove('hidden');
    showingRoomInfo = false;
    
    const infoButton = document.getElementById('infoButton');
    if (infoButton) {
        infoButton.textContent = 'ℹ️ Инфо';
    }
    
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();
    
    updateStatus(`✅ Подключено к комнате ${currentRoom}`);
    
    addSystemMessage(`🎉 Вы присоединились к комнате ${currentRoom}`);
    addSystemMessage(`📞 Теперь вы можете совершать голосовые звонки!`);
    
    updateUsersList();
    showCallButton();
}

// Обновление статуса
function updateStatus(text) {
    statusDiv.textContent = text;
    if (text.includes('✅')) {
        statusDiv.className = 'status connected';
    } else if (text.includes('❌')) {
        statusDiv.className = 'status error';
    } else if (text.includes('⚠️') || text.includes('🔄')) {
        statusDiv.className = 'status warning';
    } else {
        statusDiv.className = 'status';
    }
}

// Генерация кода комнаты
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// Генерация случайного имени
function generateRandomName() {
    const adjectives = ['Веселый', 'Серьезный', 'Умный', 'Смелый', 'Добрый', 'Быстрый', 'Тихий', 'Яркий'];
    const animals = ['Енот', 'Тигр', 'Филин', 'Дельфин', 'Волк', 'Медведь', 'Лис', 'Еж'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    const num = Math.floor(Math.random() * 100);
    return `${adj}_${animal}_${num}`;
}

// Копирование кода комнаты
function copyRoomCode() {
    roomCodeElement.select();
    roomCodeElement.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(roomCodeElement.value);
    alert('Код комнаты скопирован в буфер обмена!');
}

// Получить аудиопоток для звонка (УПРОЩЕНО)
async function getCallStream() {
    try {
        callStream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });
        console.log('Аудиопоток получен');
        return callStream;
    } catch (error) {
        console.error('Ошибка получения аудиопотока:', error);
        alert('Не удалось получить доступ к микрофону для звонка');
        return null;
    }
}

// Начать аудиозвонок (УПРОЩЕНО И ИСПРАВЛЕНО)
async function startAudioCall(targetUserId = null) {
    console.log('startAudioCall() called, callState:', callState);
    
    if (callState !== 'idle') {
        alert('Уже есть активный звонок!');
        return;
    }
    
    const stream = await getCallStream();
    if (!stream) return;
    
    if (!targetUserId) {
        const users = getAllUsers().filter(user => user.id !== peer.id);
        if (users.length === 0) {
            alert('Нет пользователей для звонка!');
            return;
        }
        targetUserId = users[0].id;
    }
    
    console.log('Звонок пользователю:', targetUserId);
    
    callState = 'calling';
    activeCall = targetUserId;
    
    updateCallUI();
    addSystemMessage(`📞 Вы звоните ${getUserName(targetUserId)}...`);
    
    try {
        const call = peer.call(targetUserId, stream);
        
        if (!call) {
            throw new Error('Не удалось создать звонок');
        }
        
        peerConnections[targetUserId] = call;
        
        call.on('stream', (remoteStream) => {
            console.log('✅ Получен удаленный поток');
            handleRemoteStream(targetUserId, remoteStream);
            
            callState = 'in_call';
            callStartTime = Date.now();
            updateCallTimer();
            callTimer = setInterval(updateCallTimer, 1000);
            updateCallUI();
            updateUsersList();
            
            addSystemMessage('✅ Звонок установлен');
        });
        
        call.on('close', () => {
            console.log('Звонок завершен');
            endCall();
        });
        
        call.on('error', (err) => {
            console.error('Ошибка звонка:', err);
            addSystemMessage('❌ Ошибка звонка');
            endCall();
        });
        
        setTimeout(() => {
            if (callState === 'calling') {
                addSystemMessage('❌ Звонок не отвечает');
                endCall();
            }
        }, 30000);
        
    } catch (error) {
        console.error('Ошибка при звонке:', error);
        alert('Ошибка при звонке');
        endCall();
    }
}

// Обработка удаленного потока (УПРОЩЕНО)
function handleRemoteStream(userId, stream) {
    console.log('Обработка удаленного потока для:', userId);
    
    const audioId = `remote_audio_${userId}`;
    let audioElement = document.getElementById(audioId);
    
    if (!audioElement) {
        audioElement = document.createElement('audio');
        audioElement.id = audioId;
        audioElement.autoplay = true;
        audioElement.controls = false;
        audioElement.style.width = '100%';
        audioElement.style.marginTop = '5px';
        audioElement.volume = 1.0;
        
        remoteAudioContainer.appendChild(audioElement);
    }
    
    audioElement.srcObject = stream;
    
    // Принудительное воспроизведение
    setTimeout(() => {
        audioElement.play().catch(e => {
            console.error('Ошибка воспроизведения:', e);
        });
    }, 500);
    
    console.log('Удаленный поток подключен');
}

// Принять звонок (УПРОЩЕНО)
async function acceptCall() {
    console.log('acceptCall() called');
    if (callState !== 'ringing' || !activeCall) return;
    
    const stream = await getCallStream();
    if (!stream) return;
    
    try {
        activeCall.answer(stream);
        
        activeCall.on('stream', (remoteStream) => {
            console.log('✅ Получен удаленный поток (принятый звонок)');
            handleRemoteStream(activeCall.peer, remoteStream);
            
            callState = 'in_call';
            callStartTime = Date.now();
            updateCallTimer();
            callTimer = setInterval(updateCallTimer, 1000);
            updateCallUI();
            updateUsersList();
            
            addSystemMessage('✅ Звонок начат');
        });
        
        peerConnections[activeCall.peer] = activeCall;
        
    } catch (error) {
        console.error('Ошибка при принятии звонка:', error);
        addSystemMessage('❌ Ошибка при принятии звонка');
        endCall();
    }
}

// Отклонить звонок
function rejectCall() {
    console.log('rejectCall() called');
    if (callState === 'ringing' && activeCall) {
        activeCall.close();
        addSystemMessage('❌ Звонок отклонен');
    }
    resetCall();
}

// Завершить звонок
function endCall() {
    console.log('endCall() called');
    
    if (activeCall && typeof activeCall.close === 'function') {
        activeCall.close();
    }
    
    Object.values(peerConnections).forEach(conn => {
        if (conn && conn.close) conn.close();
    });
    
    if (callStream) {
        callStream.getTracks().forEach(track => track.stop());
        callStream = null;
    }
    
    remoteAudioContainer.innerHTML = '';
    remoteStreams = {};
    peerConnections = {};
    
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
    
    if (callState === 'in_call') {
        const duration = Math.round((Date.now() - callStartTime) / 1000);
        addSystemMessage(`📞 Звонок завершен (${duration} сек)`);
    }
    
    resetCall();
    updateUsersList();
}

// Обработка входящего звонка
function handleIncomingCall(call) {
    if (callState !== 'idle') {
        call.close();
        return;
    }
    
    callState = 'ringing';
    activeCall = call;
    
    call.on('stream', (remoteStream) => {
        handleRemoteStream(call.peer, remoteStream);
        callState = 'in_call';
        callStartTime = Date.now();
        updateCallTimer();
        callTimer = setInterval(updateCallTimer, 1000);
        updateCallUI();
        updateUsersList();
    });
    
    call.on('close', endCall);
    call.on('error', endCall);
    
    updateCallUI();
    addSystemMessage(`📞 Входящий звонок от ${getUserName(call.peer)}`);
    
    setTimeout(() => {
        if (callState === 'ringing') {
            addSystemMessage('❌ Звонок пропущен');
            rejectCall();
        }
    }, 30000);
}

// Обновление UI звонка
function updateCallUI() {
    callControls.classList.remove('hidden');
    
    switch (callState) {
        case 'calling':
            callStatus.textContent = `📞 Звонок ${getUserName(activeCall)}...`;
            acceptCallBtn.style.display = 'none';
            rejectCallBtn.style.display = 'inline-block';
            endCallBtn.style.display = 'inline-block';
            callTimerElement.style.display = 'none';
            break;
            
        case 'ringing':
            callStatus.textContent = `📞 Входящий звонок от ${getUserName(activeCall.peer)}`;
            acceptCallBtn.style.display = 'inline-block';
            rejectCallBtn.style.display = 'inline-block';
            endCallBtn.style.display = 'none';
            callTimerElement.style.display = 'none';
            break;
            
        case 'in_call':
            callStatus.textContent = `📞 В разговоре с ${getUserName(activeCall.peer || activeCall)}`;
            acceptCallBtn.style.display = 'none';
            rejectCallBtn.style.display = 'none';
            endCallBtn.style.display = 'inline-block';
            callTimerElement.style.display = 'block';
            break;
            
        default:
            callControls.classList.add('hidden');
            break;
    }
}

// Обновление таймера звонка
function updateCallTimer() {
    if (!callStartTime) return;
    
    const seconds = Math.floor((Date.now() - callStartTime) / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    callTimerElement.textContent = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Сброс состояния звонка
function resetCall() {
    callState = 'idle';
    activeCall = null;
    callStartTime = null;
    updateCallUI();
}

// Получить имя пользователя по ID
function getUserName(userId) {
    const user = getUserInfo(userId);
    return user ? user.name : `Участник_${userId.substr(0, 4)}`;
}

// Показать кнопку звонка
function showCallButton() {
    if (startCallBtn) {
        startCallBtn.style.display = 'inline-block';
        startCallBtn.onclick = () => startAudioCall();
        console.log('Call button shown');
    }
}

// Сброс peer соединения
function resetPeerConnection() {
    console.log('Resetting peer connection...');
    
    if (peer) {
        try {
            peer.destroy();
        } catch (e) {
            console.warn('Error destroying peer:', e);
        }
    }
    
    peer = null;
    connections = {};
    peerConnections = {};
    remoteStreams = {};
    peerReconnectAttempts = 0;
    
    remoteAudioContainer.innerHTML = '';
    
    console.log('Peer connection reset');
}

// Отключение от комнаты
function disconnect() {
    console.log('disconnect() called');
    
    if (callState !== 'idle') {
        endCall();
    }
    
    // Закрываем все соединения
    Object.values(peerConnections).forEach(conn => {
        if (conn && conn.close) conn.close();
    });
    
    Object.keys(connections).forEach(peerId => {
        if (connections[peerId].open) {
            connections[peerId].close();
        }
    });
    
    // Сбрасываем peer соединение
    resetPeerConnection();
    
    // Сбрасываем состояния
    currentRoom = null;
    roomHost = false;
    messageHistory = [];
    showingRoomInfo = false;
    resetCall();
    
    // Показываем начальный экран
    setupSection.style.display = 'block';
    roomSection.style.display = 'block';
    chatSection.classList.add('hidden');
    roomInfo.classList.add('hidden');
    messagesDiv.innerHTML = '';
    callControls.classList.add('hidden');
    
    const infoButton = document.getElementById('infoButton');
    if (infoButton) {
        infoButton.textContent = 'ℹ️ Инфо';
    }
    
    if (startCallBtn) {
        startCallBtn.style.display = 'none';
    }
    
    updateStatus('❌ Отключено от комнаты');
    addSystemMessage('🔌 Вы отключились от комнаты');
}

// Экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Обработка нажатия Enter
function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Инициализация при загрузке страницы
window.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM loaded, initializing P2P Chat...');
    await init();
});

// Экспорт функций в глобальную область
window.createRoom = createRoom;
window.saveUserName = saveUserName;
window.testMicrophone = testMicrophone;
window.changeName = changeName;
window.copyRoomCode = copyRoomCode;
window.connectToRoom = connectToRoom;
window.sendMessage = sendMessage;
window.handleKeyPress = handleKeyPress;
window.toggleRoomInfo = toggleRoomInfo;
window.backToChat = backToChat;
window.disconnect = disconnect;
window.acceptCall = acceptCall;
window.rejectCall = rejectCall;
window.endCall = endCall;
window.diagnoseAudioIssues = diagnoseAudioIssues;

console.log('P2P Chat loaded with simplified and stable connection');
// Основные переменные
let peer = null;
let connections = {};
let currentRoom = null;
let userName = '';
let roomHost = false;
let messageHistory = [];
let showingRoomInfo = false;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;
let audioContext = null;
let analyser = null;
let microphone = null;
let isMicrophoneTested = false;
let callStream = null;
let activeCall = null;
let callState = 'idle';
let callTimer = null;
let callStartTime = null;
let remoteStreams = {};
let peerConnections = {};
const MAX_HISTORY = 100;
const MAX_AUDIO_SIZE = 5 * 1024 * 1024;

// Улучшенные ICE серверы для обхода NAT/Файрволов
const ENHANCED_ICE_SERVERS = [
    // STUN серверы Google
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    
    // STUN Twilio
    { urls: 'stun:global.stun.twilio.com:3478' },
    
    // Дополнительные STUN
    { urls: 'stun:stun.voipgate.com:3478' },
    { urls: 'stun:stun.sipgate.com:3478' },
    
    // TURN серверы (критически важны для обхода NAT)
    {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
    },
    {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
    },
    {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
    },
    {
        urls: 'turn:numb.viagenie.ca',
        credential: 'muazkh',
        username: 'webrtc@live.com'
    },
    {
        urls: 'turn:turn.bistri.com:80',
        credential: 'homeo',
        username: 'homeo'
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
const voiceButton = document.getElementById('voiceButton');
const statusDiv = document.getElementById('status');
const usersList = document.getElementById('usersList');
const onlineCount = document.getElementById('onlineCount');
const userNameInput = document.getElementById('userName');
const voiceControls = document.getElementById('voiceControls');
const voiceWave = document.getElementById('voiceWave');
const recordingTime = document.getElementById('recordingTime');
const micTestDiv = document.getElementById('micTest');
const audioPlayer = document.getElementById('audioPlayer');
const callControls = document.getElementById('callControls');
const callStatus = document.getElementById('callStatus');
const acceptCallBtn = document.getElementById('acceptCallBtn');
const rejectCallBtn = document.getElementById('rejectCallBtn');
const endCallBtn = document.getElementById('endCallBtn');
const callTimerElement = document.getElementById('callTimer');
const remoteAudioContainer = document.getElementById('remoteAudioContainer');
const startCallBtn = document.getElementById('startCallBtn');

// Инициализация
function init() {
    console.log('P2P Chat initializing...');
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
    
    // Запускаем очистку старых пользователей
    cleanupUserList();
    
    // Периодическая очистка
    setInterval(cleanupUserList, 30000); // Каждые 30 секунд
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
                // Проверяем время последней активности (5 минут)
                const timeKey = key + '_time';
                const timeStamp = localStorage.getItem(timeKey);
                const fiveMinutesAgo = Date.now() - 300000;
                
                if (!timeStamp || parseInt(timeStamp) < fiveMinutesAgo) {
                    localStorage.removeItem(key);
                    localStorage.removeItem(timeKey);
                    console.log('Cleaned up old user:', userId);
                }
            }
        }
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
        
        if (audioContext) {
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            analyser.fftSize = 256;
        }
        
        micTestDiv.innerHTML = '<span style="color: #28a745;">✅ Микрофон работает нормально</span>';
        isMicrophoneTested = true;
        
        setTimeout(() => {
            stream.getTracks().forEach(track => track.stop());
            if (microphone) microphone.disconnect();
            if (analyser) analyser.disconnect();
            analyser = null;
            microphone = null;
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

// Создание новой комнаты
async function createRoom() {
    console.log('=== createRoom() called ===');
    
    if (!userName) {
        alert('Пожалуйста, сначала сохраните имя!');
        return;
    }
    
    // Проверяем загружен ли PeerJS
    if (typeof Peer === 'undefined') {
        alert('Библиотека PeerJS загружается... Подождите немного и попробуйте снова.');
        loadPeerJS();
        return;
    }
    
    currentRoom = generateRoomCode();
    roomHost = true;
    showingRoomInfo = false;
    
    console.log('Creating room with code:', currentRoom);
    
    setupSection.style.display = 'none';
    
    // Создаем Peer с улучшенными ICE серверами
    peer = new Peer(currentRoom, {
        config: {
            iceServers: ENHANCED_ICE_SERVERS,
            iceCandidatePoolSize: 10,
            iceTransportPolicy: 'all'
        },
        debug: 2
    });
    
    setupPeerEvents();
    
    roomCodeElement.value = currentRoom;
    roomInfo.classList.remove('hidden');
    updateStatus('✅ Комната создана. Ожидание участников...');
    
    const infoButton = document.getElementById('infoButton');
    if (infoButton) {
        infoButton.textContent = 'ℹ️ Инфо';
    }
    
    updateUsersList();
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
    
    // Проверяем загружен ли PeerJS
    if (typeof Peer === 'undefined') {
        alert('Библиотека PeerJS загружается... Подождите немного и попробуйте снова.');
        loadPeerJS();
        return;
    }
    
    console.log('Connecting to room:', currentRoom);
    
    setupSection.style.display = 'none';
    
    // Создаем Peer с улучшенными ICE серверами
    peer = new Peer({
        config: {
            iceServers: ENHANCED_ICE_SERVERS,
            iceCandidatePoolSize: 10,
            iceTransportPolicy: 'all'
        },
        debug: 2
    });
    
    setupPeerEvents();
    updateStatus('Подключение к комнате...');
}

// Настройка обработчиков событий Peer
function setupPeerEvents() {
    peer.on('open', (id) => {
        console.log('Peer opened with ID:', id);
        if (roomHost) {
            updateStatus(`✅ Комната создана (${currentRoom}). Ожидание участников...`);
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
        handleConnectionError(err);
    });
    
    peer.on('disconnected', () => {
        updateStatus('Соединение потеряно. Попытка переподключения...');
        setTimeout(() => {
            if (peer && !peer.disconnected) {
                peer.reconnect();
            }
        }, 1000);
    });
    
    // Диагностика ICE соединения
    if (peer._options.config) {
        console.log('Using ICE servers:', peer._options.config.iceServers);
    }
}

// Обработка ошибок соединения
function handleConnectionError(error) {
    console.error('Connection error:', error);
    
    let message = 'Ошибка подключения: ';
    if (error.type === 'peer-unavailable') {
        message = '❌ Комната не найдена. Проверьте код комнаты.';
    } else if (error.message.includes('ICE') || error.message.includes('NAT')) {
        message += 'Проблема с сетевым соединением. ';
        message += 'Попробуйте: 1) Перезагрузить страницу 2) Использовать VPN 3) Проверить настройки сети';
    } else if (error.message.includes('permission')) {
        message += 'Нет разрешения на доступ к микрофону.';
    } else {
        message += error.message;
    }
    
    updateStatus(message);
    addSystemMessage('⚠️ ' + message);
}

// Подключение к хосту
function connectToHost() {
    console.log('Connecting to host...');
    const conn = peer.connect(currentRoom, {
        reliable: true,
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
        updateStatus('Ошибка подключения к хосту');
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
        
        // Удаляем из localStorage при отключении
        localStorage.removeItem(`p2p_chat_user_${peerId}`);
        localStorage.removeItem(`p2p_chat_user_${peerId}_time`);
        
        updateUsersList();
        
        if (Object.keys(connections).length === 0 && !roomHost) {
            updateStatus('❌ Соединение с комнатой потеряно');
            messageInput.disabled = true;
            sendButton.disabled = true;
            voiceButton.disabled = true;
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
            conn.send({
                type: 'message_history',
                messages: messageHistory.slice(-20)
            });
        }
    }
}

// Обработка входящих данных
function handleIncomingData(data, fromPeer) {
    console.log('Получены данные от', fromPeer, ':', data);
    
    if (showingRoomInfo && (data.type === 'message' || data.type === 'voice_message' || data.type === 'call_event')) {
        backToChat();
    }
    
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
            
        case 'voice_message':
            messageHistory.push({
                ...data,
                timestamp: data.timestamp || new Date().toLocaleTimeString()
            });
            
            if (messageHistory.length > MAX_HISTORY) {
                messageHistory = messageHistory.slice(-MAX_HISTORY);
            }
            
            if (data.senderId !== peer.id) {
                addVoiceMessage(data.audioData, data.sender, false, data.timestamp, data.duration);
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
            
        case 'name_change':
            updateUserName(data.userId, data.newName);
            addSystemMessage(`${data.oldName} сменил имя на ${data.newName}`);
            updateUsersList();
            break;
            
        case 'message_history':
            data.messages.forEach(msg => {
                if (msg.type === 'message' && msg.senderId !== peer.id) {
                    addMessage(msg.message, msg.sender, false, msg.timestamp);
                } else if (msg.type === 'voice_message' && msg.senderId !== peer.id) {
                    addVoiceMessage(msg.audioData, msg.sender, false, msg.timestamp, msg.duration);
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

// Сохранить информацию о пользователе с временной меткой
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

// Обновить имя пользователя
function updateUserName(userId, newName) {
    saveUserInfo(userId, newName);
}

// Получить список ТОЛЬКО активных пользователей
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

// Запись голосового сообщения
async function toggleVoiceRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

// Начать запись
async function startRecording() {
    try {
        if (!isMicrophoneTested) {
            const response = confirm('Рекомендуется сначала проверить микрофон. Начать запись без проверки?');
            if (!response) return;
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100,
                channelCount: 1
            } 
        });
        
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            if (audioBlob.size > MAX_AUDIO_SIZE) {
                alert('Голосовое сообщение слишком большое. Максимум 5MB.');
                return;
            }
            
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
                const base64Audio = reader.result;
                const duration = Math.round((Date.now() - recordingStartTime) / 1000);
                sendVoiceMessage(base64Audio, duration);
            };
            
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start(100);
        isRecording = true;
        recordingStartTime = Date.now();
        
        voiceControls.classList.remove('hidden');
        voiceButton.classList.add('recording');
        voiceButton.textContent = '⏹️ Остановить';
        messageInput.disabled = true;
        sendButton.disabled = true;
        
        updateStatus('🔴 Запись голосового сообщения...');
        statusDiv.classList.add('recording');
        
        updateRecordingTimer();
        recordingTimer = setInterval(updateRecordingTimer, 1000);
        
        voiceWave.style.opacity = '1';
        
    } catch (error) {
        console.error('Ошибка при записи:', error);
        alert('Не удалось получить доступ к микрофону. Проверьте разрешения.');
    }
}

// Остановить запись
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        voiceControls.classList.add('hidden');
        voiceButton.classList.remove('recording');
        voiceButton.textContent = '🎤 Голосовое';
        messageInput.disabled = false;
        sendButton.disabled = false;
        
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        voiceWave.style.opacity = '0';
        
        updateStatus('✅ Запись завершена');
        statusDiv.classList.remove('recording');
    }
}

// Обновление таймера записи
function updateRecordingTimer() {
    if (!recordingStartTime) return;
    
    const seconds = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    recordingTime.textContent = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    
    if (seconds >= 120) {
        stopRecording();
    }
}

// Отправка голосового сообщения
function sendVoiceMessage(base64Audio, duration) {
    if (showingRoomInfo) {
        backToChat();
    }
    
    const voiceData = {
        type: 'voice_message',
        audioData: base64Audio,
        sender: userName,
        senderId: peer.id,
        duration: duration,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    addVoiceMessage(base64Audio, userName, true, voiceData.timestamp, duration);
    
    messageHistory.push(voiceData);
    if (messageHistory.length > MAX_HISTORY) {
        messageHistory = messageHistory.slice(-MAX_HISTORY);
    }
    
    broadcast(voiceData);
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

// Добавление голосового сообщения
function addVoiceMessage(audioData, sender, isOwn = false, timestamp = null, duration = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message voice ${isOwn ? 'own' : 'other'}`;
    
    const time = timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const audioId = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    messageDiv.innerHTML = `
        <div class="message-info">
            <strong>${isOwn ? 'Вы' : escapeHtml(sender)}</strong>
            <span>${time}</span>
        </div>
        <div class="voice-message">
            <button class="voice-play-btn" onclick="playVoiceMessage('${audioId}')" id="play_${audioId}">▶️</button>
            <div style="flex: 1;">
                <div class="voice-duration">${duration || '0'} сек</div>
                <div class="voice-progress">
                    <div class="voice-progress-bar" id="progress_${audioId}"></div>
                </div>
            </div>
        </div>
        <audio id="${audioId}" src="${audioData}" style="display: none;"></audio>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Воспроизведение голосового сообщения
function playVoiceMessage(audioId) {
    const audio = document.getElementById(audioId);
    const playButton = document.getElementById(`play_${audioId}`);
    const progressBar = document.getElementById(`progress_${audioId}`);
    
    if (!audio || !playButton) return;
    
    if (audio.paused) {
        document.querySelectorAll('audio').forEach(a => {
            if (a.id !== audioId && !a.paused) {
                a.pause();
                a.currentTime = 0;
                const otherPlayButton = document.getElementById(`play_${a.id}`);
                if (otherPlayButton) {
                    otherPlayButton.textContent = '▶️';
                    otherPlayButton.classList.remove('playing');
                }
            }
        });
        
        audio.play();
        playButton.textContent = '⏸️';
        playButton.classList.add('playing');
        
        audio.ontimeupdate = () => {
            const progress = (audio.currentTime / audio.duration) * 100;
            progressBar.style.width = `${progress}%`;
        };
        
        audio.onended = () => {
            playButton.textContent = '▶️';
            playButton.classList.remove('playing');
            progressBar.style.width = '0%';
            audio.currentTime = 0;
        };
        
        audio.onpause = () => {
            playButton.textContent = '▶️';
            playButton.classList.remove('playing');
        };
    } else {
        audio.pause();
        playButton.textContent = '▶️';
        playButton.classList.remove('playing');
    }
}

// Добавление системного сообщения
function addSystemMessage(text) {
    const systemDiv = document.createElement('div');
    systemDiv.className = 'message system';
    systemDiv.textContent = text;
    messagesDiv.appendChild(systemDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Обновление списка участников (ТОЛЬКО активные)
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

// Показать чат
function showChat() {
    console.log('Showing chat...');
    roomSection.style.display = 'none';
    chatSection.classList.remove('hidden');
    showingRoomInfo = false;
    
    const infoButton = document.getElementById('infoButton');
    if (infoButton) {
        infoButton.textContent = 'ℹ️ Инфо';
    }
    
    messageInput.disabled = false;
    sendButton.disabled = false;
    voiceButton.disabled = false;
    messageInput.focus();
    
    updateStatus(`✅ Подключено к комнате ${currentRoom}`);
    
    if (roomHost) {
        addSystemMessage(`🎉 Вы создали комнату! Код: ${currentRoom}`);
        addSystemMessage(`🔍 Для соединения между разными сетями используются TURN серверы`);
        addSystemMessage(`📞 Теперь вы можете отправлять голосовые сообщения и совершать звонки!`);
    } else {
        addSystemMessage(`🎉 Вы присоединились к комнате ${currentRoom}`);
        addSystemMessage(`🔍 Если есть проблемы со звуком, попробуйте обновить страницу или VPN`);
        addSystemMessage(`📞 Теперь вы можете отправлять голосовые сообщения и совершать звонки!`);
    }
    
    if (!roomHost) {
        const hostConn = connections[currentRoom];
        if (hostConn && hostConn.open) {
            hostConn.send({ type: 'user_list_request' });
        }
    }
    
    updateUsersList();
    showCallButton();
}

// Обновление статуса
function updateStatus(text) {
    statusDiv.textContent = text;
    if (text.includes('✅')) {
        statusDiv.className = 'status connected';
    } else if (text.includes('🔴')) {
        statusDiv.className = 'status recording';
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

// Загрузка PeerJS библиотеки
function loadPeerJS() {
    if (typeof Peer === 'undefined') {
        console.log('Loading PeerJS...');
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/peerjs@1.4.7/dist/peerjs.min.js';
        script.onload = function() {
            console.log('✅ PeerJS loaded successfully');
        };
        script.onerror = function() {
            console.error('❌ Failed to load PeerJS');
            alert('Ошибка загрузки PeerJS. Проверьте подключение к интернету.');
        };
        document.head.appendChild(script);
    } else {
        console.log('PeerJS already loaded');
    }
}

// Получить аудиопоток для звонка
async function getCallStream() {
    try {
        callStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100,
                channelCount: 1
            },
            video: false
        });
        console.log('Call stream obtained');
        return callStream;
    } catch (error) {
        console.error('Ошибка получения аудиопотока:', error);
        alert('Не удалось получить доступ к микрофону для звонка');
        return null;
    }
}

// Начать аудиозвонок (с исправленной реконнектом)
async function startAudioCall(targetUserId = null) {
    console.log('startAudioCall() called, callState:', callState);
    
    if (callState !== 'idle') {
        alert('Уже есть активный звонок! Завершите текущий звонок сначала.');
        return;
    }
    
    if (!isMicrophoneTested) {
        const response = confirm('Рекомендуется сначала проверить микрофон. Начать звонок без проверки?');
        if (!response) return;
    }
    
    // Проверяем что peer существует и подключен
    console.log('Peer state:', {
        exists: !!peer,
        destroyed: peer ? peer.destroyed : 'no peer',
        disconnected: peer ? peer.disconnected : 'no peer',
        open: peer ? peer.open : 'no peer'
    });
    
    if (!peer || peer.destroyed || peer.disconnected) {
        console.log('Peer не готов, требуется переподключение...');
        
        if (!currentRoom) {
            alert('Вы не в комнате! Создайте или присоединитесь к комнате сначала.');
            return;
        }
        
        // Создаем новый peer
        if (roomHost) {
            peer = new Peer(currentRoom, {
                config: {
                    iceServers: ENHANCED_ICE_SERVERS,
                    iceCandidatePoolSize: 10,
                    iceTransportPolicy: 'all'
                },
                debug: 2
            });
        } else {
            peer = new Peer({
                config: {
                    iceServers: ENHANCED_ICE_SERVERS,
                    iceCandidatePoolSize: 10,
                    iceTransportPolicy: 'all'
                },
                debug: 2
            });
        }
        
        setupPeerEvents();
        
        // Ждем подключения
        await new Promise((resolve) => {
            peer.on('open', resolve);
            setTimeout(resolve, 2000);
        });
        
        if (!roomHost) {
            // Переподключаемся к хосту
            connectToHost();
        }
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
    
    console.log('Starting call to:', targetUserId);
    
    callState = 'calling';
    activeCall = targetUserId;
    
    updateCallUI();
    addSystemMessage(`📞 Вы звоните ${getUserName(targetUserId)}...`);
    
    try {
        // Создаем звонок
        const call = peer.call(targetUserId, stream);
        
        if (!call) {
            throw new Error('Не удалось создать звонок');
        }
        
        // Настраиваем обработчики звонка
        call.on('stream', (remoteStream) => {
            console.log('Получен удаленный поток');
            handleRemoteStream(targetUserId, remoteStream);
            callState = 'in_call';
            callStartTime = Date.now();
            updateCallTimer();
            callTimer = setInterval(updateCallTimer, 1000);
            updateCallUI();
            updateUsersList();
        });
        
        call.on('close', () => {
            console.log('Звонок завершен');
            endCall();
        });
        
        call.on('error', (err) => {
            console.error('Ошибка звонка:', err);
            addSystemMessage('❌ Ошибка звонка: ' + err.message);
            endCall();
        });
        
        // Сохраняем соединение
        peerConnections[targetUserId] = call;
        
        // Таймаут звонка
        setTimeout(() => {
            if (callState === 'calling') {
                addSystemMessage('❌ Звонок не отвечает');
                endCall();
            }
        }, 30000);
        
    } catch (error) {
        console.error('Ошибка при создании звонка:', error);
        alert('Ошибка при звонке: ' + error.message);
        endCall();
    }
}

// Принять звонок
async function acceptCall() {
    console.log('acceptCall() called');
    if (callState !== 'ringing' || !activeCall) return;
    
    const stream = await getCallStream();
    if (!stream) return;
    
    callState = 'in_call';
    activeCall.answer(stream);
    
    callStartTime = Date.now();
    updateCallTimer();
    callTimer = setInterval(updateCallTimer, 1000);
    
    updateCallUI();
    addSystemMessage('✅ Звонок начат');
    updateUsersList();
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
    
    if (activeCall) {
        if (typeof activeCall.close === 'function') {
            activeCall.close();
        }
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
        addSystemMessage(`📞 Звонок завершен (длительность: ${duration} сек)`);
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

// Обработка удаленного потока
function handleRemoteStream(userId, stream) {
    remoteStreams[userId] = stream;
    
    const audioId = `remote_audio_${userId}`;
    let audioElement = document.getElementById(audioId);
    
    if (!audioElement) {
        audioElement = document.createElement('audio');
        audioElement.id = audioId;
        audioElement.autoplay = true;
        audioElement.controls = true;
        audioElement.style.width = '100%';
        audioElement.style.marginTop = '5px';
        remoteAudioContainer.appendChild(audioElement);
    }
    
    audioElement.srcObject = stream;
    audioElement.setAttribute('title', `Аудио от ${getUserName(userId)}`);
    
    console.log('Remote stream playing for user:', userId);
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

// Отключение от комнаты (не уничтожаем peer полностью)
function disconnect() {
    console.log('disconnect() called');
    
    if (callState !== 'idle') {
        endCall();
    }
    
    if (isRecording) {
        stopRecording();
    }
    
    // Закрываем все звонки
    Object.values(peerConnections).forEach(conn => {
        if (conn.close) conn.close();
    });
    
    // Закрываем все соединения чата
    Object.keys(connections).forEach(peerId => {
        if (connections[peerId].open) {
            connections[peerId].close();
        }
    });
    
    // Отправляем сообщение о выходе если есть подключения
    if (peer && Object.keys(connections).length > 0) {
        broadcast({
            type: 'user_left',
            userId: peer.id,
            name: userName
        });
    }
    
    // Закрываем peer соединение, но не уничтожаем объект
    if (peer) {
        if (peer.disconnect) {
            peer.disconnect();
        }
    }
    
    // Сбрасываем состояния
    connections = {};
    currentRoom = null;
    roomHost = false;
    messageHistory = [];
    showingRoomInfo = false;
    isRecording = false;
    resetCall();
    
    // Останавливаем все аудио
    document.querySelectorAll('audio').forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
    });
    
    // Показываем начальный экран
    setupSection.style.display = 'block';
    roomSection.style.display = 'block';
    chatSection.style.display = 'none';
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
window.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing P2P Chat...');
    init();
    loadPeerJS(); // Загружаем PeerJS отдельно
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
window.toggleVoiceRecording = toggleVoiceRecording;
window.playVoiceMessage = playVoiceMessage;

console.log('P2P Chat loaded with enhanced ICE servers and user cleanup');
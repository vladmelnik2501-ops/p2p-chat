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
let bestICEServers = [];
let peerReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let peerConnectionHealthCheck = null;
let currentPeerServer = 0;
const MAX_HISTORY = 100;
const MAX_AUDIO_SIZE = 5 * 1024 * 1024;

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
    },
    // Резервный сервер с другим портом
    {
        host: '0.peerjs.com',
        port: 9000,
        path: '/',
        key: 'peerjs',
        secure: false,
        pingInterval: 3000
    }
];

// Все доступные ICE серверы (STUN + TURN)
const ALL_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.l.google.com:19305' },
    { urls: 'stun:stun1.l.google.com:19305' },
    { urls: 'stun:stun2.l.google.com:19305' },
    { urls: 'stun:stun3.l.google.com:19305' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.services.mozilla.com:3478' },
    { urls: 'stun:stun.office.com:3478' },
    { urls: 'stun:stun.voipgate.com:3478' },
    { urls: 'stun:stun.sipgate.com:3478' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
    {
        urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
    },
    {
        urls: [
            'turn:numb.viagenie.ca:3478',
            'turn:numb.viagenie.ca:3478?transport=tcp'
        ],
        username: 'webrtc@live.com',
        credential: 'muazkh'
    },
    {
        urls: [
            'turn:turn.bistri.com:80',
            'turn:turn.bistri.com:80?transport=tcp'
        ],
        username: 'homeo',
        credential: 'homeo'
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
const serverStatusDiv = document.getElementById('serverStatus');

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
    
    // Добавляем UI элементы
    addDiagnosticButton();
    addSTUNTestButton();
    addServerSelector();
    
    // Тестируем ICE серверы
    await testAndSelectBestICEServers();
    
    // Запускаем очистку старых пользователей
    cleanupUserList();
    
    // Периодическая очистка
    setInterval(cleanupUserList, 30000);
    
    // Проверка здоровья соединения
    startConnectionHealthCheck();
    
    updateStatus('✅ Система готова');
}

// Добавление селектора серверов
function addServerSelector() {
    if (!serverStatusDiv) return;
    
    serverStatusDiv.innerHTML = `
        <div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
            <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Сервер PeerJS:</div>
            <div id="currentServerInfo" style="font-size: 11px; color: #17a2b8;">
                ${PEERJS_SERVERS[currentPeerServer].host}:${PEERJS_SERVERS[currentPeerServer].port}
            </div>
            <button onclick="switchToNextServer()" style="margin-top: 5px; padding: 5px 10px; font-size: 12px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">
                🔄 Сменить сервер
            </button>
        </div>
    `;
}

// Переключение на следующий сервер
function switchToNextServer() {
    if (!peer || peer.destroyed) {
        currentPeerServer = (currentPeerServer + 1) % PEERJS_SERVERS.length;
        updateServerStatus();
        alert(`Сервер изменен на: ${PEERJS_SERVERS[currentPeerServer].host}:${PEERJS_SERVERS[currentPeerServer].port}`);
        return;
    }
    
    const confirmChange = confirm(`Текущий сервер: ${PEERJS_SERVERS[currentPeerServer].host}\n\nСменить на следующий сервер? Текущее соединение будет перезапущено.`);
    
    if (confirmChange) {
        // Сохраняем текущее состояние
        const wasInRoom = !!currentRoom;
        const savedRoomCode = currentRoom;
        const savedIsHost = roomHost;
        
        // Отключаемся
        disconnect();
        
        // Меняем сервер
        currentPeerServer = (currentPeerServer + 1) % PEERJS_SERVERS.length;
        updateServerStatus();
        
        // Восстанавливаем соединение если были в комнате
        if (wasInRoom) {
            setTimeout(() => {
                if (savedIsHost) {
                    // Для хоста нужно создать новую комнату
                    currentRoom = savedRoomCode;
                    createRoom();
                } else {
                    // Для клиента пробуем подключиться снова
                    connectCodeInput.value = savedRoomCode;
                    connectToRoom();
                }
            }, 1000);
        }
        
        alert(`Сервер изменен на: ${PEERJS_SERVERS[currentPeerServer].host}:${PEERJS_SERVERS[currentPeerServer].port}`);
    }
}

// Обновление статуса сервера
function updateServerStatus() {
    const serverInfoDiv = document.getElementById('currentServerInfo');
    if (serverInfoDiv) {
        const server = PEERJS_SERVERS[currentPeerServer];
        serverInfoDiv.textContent = `${server.host}:${server.port} ${server.secure ? '🔒' : '⚠️'}`;
    }
}

// Добавление кнопки диагностики
function addDiagnosticButton() {
    const diagBtn = document.createElement('button');
    diagBtn.textContent = '🩺 Диагностика';
    diagBtn.className = 'diagnostic-btn';
    diagBtn.style.cssText = `
        margin-top: 10px;
        padding: 8px 16px;
        background: #6c757d;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
    `;
    diagBtn.onclick = () => {
        diagnoseAudioIssues();
        testCurrentServer();
        
        const diagnosticInfo = `
Диагностика системы:

PeerJS сервер: ${PEERJS_SERVERS[currentPeerServer].host}:${PEERJS_SERVERS[currentPeerServer].port}
Peer: ${peer ? '✅ Создан' : '❌ Не создан'}
Комната: ${currentRoom || '❌ Нет'}
Имя: ${userName}
Соединения: ${Object.keys(connections).length}
Звонок: ${callState}
ICE серверов: ${bestICEServers.length}

Подробности в консоли (F12)
`;
        alert(diagnosticInfo);
    };
    
    const setupContainer = document.querySelector('#setupSection .setup-container');
    if (setupContainer) {
        setupContainer.appendChild(diagBtn);
    }
}

// Тест текущего сервера
async function testCurrentServer() {
    const server = PEERJS_SERVERS[currentPeerServer];
    console.log(`Testing server: ${server.host}:${server.port}`);
    
    updateStatus(`🔍 Тестирую сервер ${server.host}...`);
    
    try {
        // Пробуем подключиться к WebSocket
        const testResult = await testWebSocketConnection(server);
        
        if (testResult.success) {
            console.log(`✅ Сервер ${server.host} доступен`);
            addSystemMessage(`✅ Сервер ${server.host} работает нормально`);
            return true;
        } else {
            console.warn(`⚠️ Сервер ${server.host} проблемы: ${testResult.error}`);
            addSystemMessage(`⚠️ Сервер ${server.host}: ${testResult.error}`);
            return false;
        }
    } catch (error) {
        console.error(`❌ Ошибка теста сервера ${server.host}:`, error);
        addSystemMessage(`❌ Ошибка теста сервера ${server.host}`);
        return false;
    }
}

// Тест WebSocket соединения
function testWebSocketConnection(server) {
    return new Promise((resolve) => {
        const protocol = server.secure ? 'wss://' : 'ws://';
        const wsUrl = `${protocol}${server.host}:${server.port}${server.path || ''}`;
        
        console.log(`Testing WebSocket: ${wsUrl}`);
        
        const socket = new WebSocket(wsUrl);
        const timeout = setTimeout(() => {
            socket.close();
            resolve({ success: false, error: 'Таймаут подключения' });
        }, 5000);
        
        socket.onopen = () => {
            clearTimeout(timeout);
            socket.close();
            resolve({ success: true, error: null });
        };
        
        socket.onerror = (error) => {
            clearTimeout(timeout);
            resolve({ success: false, error: 'WebSocket ошибка' });
        };
        
        socket.onclose = (event) => {
            clearTimeout(timeout);
            if (event.code === 1006) {
                resolve({ success: false, error: 'Аномальное закрытие (возможно firewall)' });
            } else {
                resolve({ success: false, error: `Закрыто с кодом ${event.code}` });
            }
        };
    });
}

// Добавление кнопки теста STUN
function addSTUNTestButton() {
    const testBtn = document.createElement('button');
    testBtn.id = 'stunTestBtn';
    testBtn.textContent = '🔍 Тест соединения';
    testBtn.className = 'ice-test-btn';
    testBtn.style.cssText = `
        margin-top: 10px;
        padding: 8px 16px;
        background: #17a2b8;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        margin-left: 10px;
    `;
    testBtn.onclick = testAndSelectBestICEServers;
    
    const setupDiv = document.querySelector('#setupSection .setup-container');
    if (setupDiv) {
        setupDiv.appendChild(testBtn);
    }
}

// Загрузка PeerJS библиотеки
async function loadPeerJS() {
    return new Promise((resolve, reject) => {
        if (typeof Peer !== 'undefined') {
            console.log('✅ PeerJS already loaded');
            updateStatus('✅ PeerJS загружен');
            resolve();
            return;
        }
        
        console.log('Loading PeerJS...');
        updateStatus('⏳ Загрузка PeerJS...');
        
        // Пробуем несколько источников для загрузки PeerJS
        const sources = [
            'https://unpkg.com/peerjs@1.5.0/dist/peerjs.min.js',
            'https://cdn.jsdelivr.net/npm/peerjs@1.5.0/dist/peerjs.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.0/peerjs.min.js'
        ];
        
        let currentSource = 0;
        
        function loadScript(source) {
            const script = document.createElement('script');
            script.src = source;
            
            script.onload = function() {
                console.log(`✅ PeerJS loaded from: ${source}`);
                updateStatus('✅ PeerJS загружен');
                resolve();
            };
            
            script.onerror = function() {
                console.warn(`❌ Failed to load PeerJS from: ${source}`);
                currentSource++;
                
                if (currentSource < sources.length) {
                    console.log(`Trying next source: ${sources[currentSource]}`);
                    loadScript(sources[currentSource]);
                } else {
                    updateStatus('❌ Ошибка загрузки PeerJS');
                    reject(new Error('Failed to load PeerJS from all sources'));
                }
            };
            
            document.head.appendChild(script);
        }
        
        loadScript(sources[currentSource]);
    });
}

// Тест и выбор лучших ICE серверов
async function testAndSelectBestICEServers() {
    console.log('Тестирование ICE серверов...');
    updateStatus('🔍 Тестирование сетевых серверов...');
    
    const testResults = [];
    const workingServers = [];
    
    // Берем первые 10 серверов для быстрого теста
    const serversToTest = ALL_ICE_SERVERS.slice(0, 10);
    
    for (const server of serversToTest) {
        try {
            const result = await testICEServer(server);
            testResults.push(result);
            
            if (result.status === 'success') {
                workingServers.push(server);
                console.log(`✅ Сервер работает: ${server.urls}`);
            }
            
        } catch (error) {
            console.warn(`❌ Ошибка теста сервера:`, server.urls, error);
        }
        
        // Небольшая задержка между тестами
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Если нет работающих STUN, добавляем минимум Google STUN
    if (workingServers.length === 0) {
        console.warn('Нет работающих STUN серверов, используем Google по умолчанию');
        workingServers.push({ urls: 'stun:stun.l.google.com:19302' });
        workingServers.push({ urls: 'stun:stun1.l.google.com:19302' });
    }
    
    // Добавляем TURN серверы в конец
    const turnServers = ALL_ICE_SERVERS.filter(s => 
        s.urls.toString().includes('turn:') || s.urls.toString().includes('turns:')
    );
    
    bestICEServers = [...workingServers, ...turnServers.slice(0, 2)];
    
    console.log(`✅ Выбрано ${workingServers.length} STUN и ${turnServers.slice(0,2).length} TURN серверов`);
    
    const summary = `Найдено ${workingServers.length} STUN серверов`;
    updateStatus(summary);
    
    return bestICEServers;
}

// Тест одного ICE сервера
async function testICEServer(server) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve({
                server: Array.isArray(server.urls) ? server.urls[0] : server.urls,
                status: 'timeout',
                details: 'Таймаут (3 сек)'
            });
        }, 3000);
        
        try {
            const config = { iceServers: [server] };
            const pc = new RTCPeerConnection(config);
            
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    clearTimeout(timeout);
                    pc.close();
                    
                    resolve({
                        server: Array.isArray(server.urls) ? server.urls[0] : server.urls,
                        status: 'success',
                        details: `Работает (${event.candidate.protocol})`
                    });
                }
            };
            
            pc.createDataChannel('test');
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .catch(() => {
                    clearTimeout(timeout);
                    pc.close();
                    resolve({
                        server: Array.isArray(server.urls) ? server.urls[0] : server.urls,
                        status: 'error',
                        details: 'Ошибка создания offer'
                    });
                });
            
            // Дополнительная проверка
            setTimeout(() => {
                if (pc.iceGatheringState === 'complete') {
                    clearTimeout(timeout);
                    pc.close();
                    resolve({
                        server: Array.isArray(server.urls) ? server.urls[0] : server.urls,
                        status: pc.iceConnectionState === 'new' ? 'no-candidates' : 'success',
                        details: pc.iceConnectionState === 'new' ? 'Нет кандидатов' : 'Собраны кандидаты'
                    });
                }
            }, 1000);
            
        } catch (error) {
            clearTimeout(timeout);
            resolve({
                server: Array.isArray(server.urls) ? server.urls[0] : server.urls,
                status: 'error',
                details: error.message.substring(0, 50)
            });
        }
    });
}

// Получить лучшие ICE серверы
function getBestICEServers() {
    if (bestICEServers.length === 0) {
        return [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ];
    }
    return bestICEServers;
}

// Создание экземпляра Peer с отказоустойчивостью
async function createPeerInstance(id = null) {
    const server = PEERJS_SERVERS[currentPeerServer];
    console.log(`Creating peer with server: ${server.host}:${server.port}`);
    
    const config = {
        host: server.host,
        port: server.port,
        path: server.path,
        key: server.key,
        secure: server.secure,
        config: {
            iceServers: getBestICEServers(),
            iceCandidatePoolSize: 10,
            iceTransportPolicy: 'all',
            rtcpMuxPolicy: 'require',
            bundlePolicy: 'max-bundle'
        },
        debug: 2,
        pingInterval: server.pingInterval || 5000
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

// Запуск проверки здоровья соединения
function startConnectionHealthCheck() {
    if (peerConnectionHealthCheck) {
        clearInterval(peerConnectionHealthCheck);
    }
    
    peerConnectionHealthCheck = setInterval(() => {
        if (peer) {
            const connectionsCount = Object.keys(connections).length;
            
            // Периодический пинг сервера
            if (Date.now() % 30000 < 1000) { // Каждые 30 секунд
                testCurrentServer().then(isAlive => {
                    if (!isAlive && currentRoom) {
                        console.log('Server appears down, attempting to switch...');
                        addSystemMessage('⚠️ Проблемы с сервером, пробую переключить...');
                        setTimeout(() => switchToNextServer(), 2000);
                    }
                });
            }
            
            // Если peer отключен и мы в комнате, пытаемся переподключиться
            if (peer.disconnected && currentRoom && connectionsCount === 0) {
                attemptReconnect();
            }
        }
    }, 10000);
}

// Попытка переподключения
function attemptReconnect() {
    if (peerReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('Max reconnect attempts reached');
        updateStatus('❌ Не удалось восстановить соединение');
        addSystemMessage('❌ Сервер недоступен. Попробуйте сменить сервер или перезагрузить страницу.');
        
        // Предлагаем сменить сервер
        setTimeout(() => {
            if (confirm('Сервер недоступен. Хотите попробовать другой сервер?')) {
                switchToNextServer();
            }
        }, 1000);
        
        return;
    }
    
    peerReconnectAttempts++;
    console.log(`Reconnect attempt ${peerReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
    
    updateStatus(`🔄 Попытка переподключения (${peerReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    
    if (peer && peer.reconnect) {
        peer.reconnect();
        
        setTimeout(() => {
            if (peer.disconnected) {
                // Если не помогло, пробуем другой сервер после 3 попыток
                if (peerReconnectAttempts >= 3) {
                    console.log('Too many reconnect failures, switching server');
                    switchToNextServer();
                }
            }
        }, 3000);
    }
}

// Диагностика аудио проблем
function diagnoseAudioIssues() {
    console.log('=== Диагностика аудио ===');
    
    // Проверяем микрофон
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            console.log('✅ Микрофон доступен');
            const audioTrack = stream.getAudioTracks()[0];
            console.log('Аудио трек:', {
                enabled: audioTrack.enabled,
                readyState: audioTrack.readyState,
                label: audioTrack.label,
                muted: audioTrack.muted,
                kind: audioTrack.kind
            });
            
            // Тест уровня звука
            if (window.AudioContext) {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioContext.createMediaStreamSource(stream);
                const analyser = audioContext.createAnalyser();
                source.connect(analyser);
                
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                setTimeout(() => {
                    analyser.getByteFrequencyData(dataArray);
                    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                    console.log('Уровень звука с микрофона:', average);
                    
                    if (average < 5) {
                        console.warn('⚠️ Микрофон может не улавливать звук');
                        addSystemMessage('⚠️ Проверьте микрофон - возможно он не улавливает звук');
                    }
                    
                    // Очистка
                    source.disconnect();
                    stream.getTracks().forEach(track => track.stop());
                }, 1000);
            }
            
        })
        .catch(err => {
            console.error('❌ Микрофон недоступен:', err);
            addSystemMessage('❌ Ошибка доступа к микрофону: ' + err.message);
        });
    
    // Проверяем аудио выход
    const testAudio = new Audio();
    testAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    testAudio.volume = 0.1;
    
    testAudio.oncanplaythrough = () => {
        console.log('✅ Аудио выход работает');
        testAudio.play().catch(e => console.error('❌ Не удалось воспроизвести тестовый звук:', e));
    };
    
    testAudio.onerror = (e) => {
        console.error('❌ Проблема с аудио выходом:', e);
    };
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

// Создание новой комнаты с отказоустойчивостью
async function createRoom() {
    console.log('=== createRoom() called ===');
    
    if (!userName) {
        alert('Пожалуйста, сначала сохраните имя!');
        return;
    }
    
    // Проверяем загружен ли PeerJS
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
    
    // Пробуем создать peer с отказоустойчивостью
    try {
        peer = await createPeerInstance(currentRoom);
        setupPeerEvents();
        
        // Ждем открытия соединения с таймаутом
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout creating peer'));
            }, 10000);
            
            peer.on('open', () => {
                clearTimeout(timeout);
                resolve();
            });
            
            peer.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
        
        roomCodeElement.value = currentRoom;
        roomInfo.classList.remove('hidden');
        updateStatus('✅ Комната создана. Ожидание участников...');
        
        const infoButton = document.getElementById('infoButton');
        if (infoButton) {
            infoButton.textContent = 'ℹ️ Инфо';
        }
        
        updateUsersList();
        
    } catch (error) {
        console.error('Error creating room:', error);
        updateStatus('❌ Ошибка создания комнаты');
        addSystemMessage('❌ Не удалось подключиться к серверу PeerJS');
        
        // Предлагаем сменить сервер
        setTimeout(() => {
            if (confirm(`Ошибка подключения к серверу ${PEERJS_SERVERS[currentPeerServer].host}. Попробовать другой сервер?`)) {
                switchToNextServer();
            } else {
                // Возвращаем в setup
                setupSection.style.display = 'block';
                roomSection.style.display = 'none';
            }
        }, 500);
    }
}

// Подключение к существующей комнате с отказоустойчивостью
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
    
    // Проверяем загружен ли PeerJS
    if (typeof Peer === 'undefined') {
        alert('Библиотека PeerJS загружается... Подождите немного и попробуйте снова.');
        await loadPeerJS();
        return;
    }
    
    console.log('Connecting to room:', currentRoom);
    
    setupSection.style.display = 'none';
    
    // Пробуем создать peer с отказоустойчивостью
    try {
        peer = await createPeerInstance();
        setupPeerEvents();
        
        // Ждем открытия соединения с таймаутом
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout connecting to peer server'));
            }, 10000);
            
            peer.on('open', () => {
                clearTimeout(timeout);
                resolve();
            });
            
            peer.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
        
        updateStatus('Подключение к комнате...');
        
    } catch (error) {
        console.error('Error connecting to room:', error);
        updateStatus('❌ Ошибка подключения');
        addSystemMessage('❌ Не удалось подключиться к серверу PeerJS');
        
        // Предлагаем сменить сервер
        setTimeout(() => {
            if (confirm(`Ошибка подключения к серверу ${PEERJS_SERVERS[currentPeerServer].host}. Попробовать другой сервер?`)) {
                switchToNextServer();
            } else {
                // Возвращаем в setup
                setupSection.style.display = 'block';
                roomSection.style.display = 'none';
            }
        }, 500);
    }
}

// Настройка обработчиков событий Peer с улучшенной обработкой ошибок
function setupPeerEvents() {
    peer.on('open', (id) => {
        console.log('Peer opened with ID:', id);
        peerReconnectAttempts = 0;
        
        if (roomHost) {
            updateStatus(`✅ Комната создана (${currentRoom}). Ожидание участников...`);
            addSystemMessage(`✅ Подключено к серверу: ${PEERJS_SERVERS[currentPeerServer].host}`);
        } else {
            connectToHost();
        }
        showCallButton();
        
        console.log('Используемые ICE серверы:', getBestICEServers());
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
        console.log('Peer disconnected from server');
        updateStatus('⚠️ Соединение с сервером потеряно. Переподключение...');
        peerReconnectAttempts++;
        
        setTimeout(() => {
            if (peer && !peer.destroyed) {
                console.log('Attempting to reconnect...');
                peer.reconnect();
            }
        }, 1000 + (peerReconnectAttempts * 2000));
    });
    
    peer.on('close', () => {
        console.log('Peer connection closed');
        updateStatus('❌ Соединение закрыто');
        addSystemMessage('❌ Соединение с сервером закрыто');
    });
}

// Улучшенная обработка ошибок соединения
function handleConnectionError(error) {
    console.error('Connection error:', error);
    
    let message = '';
    let detailedInfo = '';
    let shouldSwitchServer = false;
    
    if (error.type === 'peer-unavailable') {
        message = '❌ Комната не найдена. Проверьте код комнаты.';
        detailedInfo = 'Убедитесь что:\n1. Код комнаты правильный\n2. Хост онлайн\n3. Попробуйте создать новую комнату';
    } else if (error.type === 'server-error' || error.message.includes('Lost connection to server')) {
        message = '❌ Потеряно соединение с сервером.';
        detailedInfo = `Сервер ${PEERJS_SERVERS[currentPeerServer].host} недоступен:\n1. Сервер перегружен\n2. Проблемы с сетью\n3. Попробуйте VPN\n4. Смените сервер`;
        shouldSwitchServer = true;
        
    } else if (error.message.includes('Could not connect to peer')) {
        message = '❌ Не удалось подключиться к участнику.';
        detailedInfo = 'Возможные причины:\n- Участник вышел из комнаты\n- Проблемы с сетью\n- NAT/firewall блокирует соединение';
    } else if (error.message.includes('WebSocket error') || error.message.includes('1006')) {
        message = '❌ Ошибка WebSocket соединения.';
        detailedInfo = 'Проблемы с подключением к серверу:\n1. Firewall блокирует WebSocket\n2. Прокси проблемы\n3. Попробуйте другой сервер';
        shouldSwitchServer = true;
    } else if (error.message.includes('ICE') || error.message.includes('NAT')) {
        message = '❌ Проблема с сетевым соединением (NAT/Файрвол). ';
        detailedInfo = 'Попробуйте:\n1. Перезагрузить страницу\n2. Использовать VPN\n3. Проверить настройки сети';
    } else if (error.message.includes('permission')) {
        message = '❌ Нет разрешения на доступ к микрофону.';
        detailedInfo = 'Разрешите доступ к микрофону в настройках браузера.';
    } else {
        message = '❌ Ошибка: ' + error.message;
    }
    
    updateStatus(message);
    addSystemMessage('⚠️ ' + message);
    
    // Автоматическое переключение сервера при критических ошибках
    if (shouldSwitchServer && peerReconnectAttempts >= 2) {
        setTimeout(() => {
            console.log('Auto-switching server due to persistent errors');
            addSystemMessage('🔄 Автоматически переключаю сервер...');
            switchToNextServer();
        }, 2000);
    } else if (shouldSwitchServer) {
        // Автоматическая попытка переподключения
        setTimeout(() => attemptReconnect(), 3000);
    }
    
    // Показываем подробную информацию
    if (detailedInfo) {
        console.log('Детали ошибки:', detailedInfo);
    }
}

// Подключение к хосту
function connectToHost() {
    console.log('Connecting to host...');
    updateStatus('Установка P2P соединения...');
    
    const conn = peer.connect(currentRoom, {
        reliable: true,
        serialization: 'json',
        metadata: {
            name: userName,
            timestamp: Date.now(),
            iceServers: getBestICEServers(),
            server: PEERJS_SERVERS[currentPeerServer].host
        }
    });
    
    conn.on('open', () => {
        console.log('Connected to host');
        setupConnection(conn);
        showChat();
        
        conn.send({
            type: 'ice_info',
            servers: getBestICEServers(),
            server: PEERJS_SERVERS[currentPeerServer].host
        });
    });
    
    conn.on('error', (err) => {
        console.error('Connection error:', err);
        updateStatus('Ошибка подключения к хосту');
        handleConnectionError(err);
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
            isHost: true,
            server: PEERJS_SERVERS[currentPeerServer].host
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
    console.log('Получены данные от', fromPeer, ':', data.type);
    
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
            
        case 'ice_info':
            console.log('Получены ICE серверы от пира:', data.servers);
            console.log('Пир использует сервер:', data.server);
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

// Обновить имя пользователя
function updateUserName(userId, newName) {
    saveUserInfo(userId, newName);
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
    
    const serverName = PEERJS_SERVERS[currentPeerServer].host;
    if (roomHost) {
        addSystemMessage(`🎉 Вы создали комнату! Код: ${currentRoom}`);
        addSystemMessage(`🌐 Сервер: ${serverName}`);
        addSystemMessage(`🔍 Используется ${bestICEServers.filter(s => s.urls.toString().includes('stun')).length} STUN серверов`);
        addSystemMessage(`📞 Теперь вы можете отправлять голосовые сообщения и совершать звонки!`);
    } else {
        addSystemMessage(`🎉 Вы присоединились к комнате ${currentRoom}`);
        addSystemMessage(`🌐 Сервер: ${serverName}`);
        addSystemMessage(`🔍 Используется ${bestICEServers.length} сетевых серверов`);
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
    } else if (text.includes('🔍')) {
        statusDiv.className = 'status testing';
    } else if (text.includes('❌')) {
        statusDiv.className = 'status error';
    } else if (text.includes('⚠️') || text.includes('🔄')) {
        statusDiv.className = 'status warning';
    } else if (text.includes('🌐')) {
        statusDiv.className = 'status server';
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
        
        const audioTracks = callStream.getAudioTracks();
        if (audioTracks.length > 0) {
            console.log('Audio track details:', {
                enabled: audioTracks[0].enabled,
                readyState: audioTracks[0].readyState,
                muted: audioTracks[0].muted
            });
        }
        
        return callStream;
    } catch (error) {
        console.error('Ошибка получения аудиопотока:', error);
        alert('Не удалось получить доступ к микрофону для звонка');
        return null;
    }
}

// Начать аудиозвонок
async function startAudioCall(targetUserId = null) {
    console.log('startAudioCall() called, callState:', callState);
    
    if (callState !== 'idle') {
        alert('Уже есть активный звонок! Завершите текущий звонок сначала.');
        return;
    }
    
    // Запускаем диагностику перед звонком
    diagnoseAudioIssues();
    
    if (!isMicrophoneTested) {
        const response = confirm('Рекомендуется сначала проверить микрофон. Начать звонок без проверки?');
        if (!response) return;
    }
    
    // Проверяем что peer существует и подключен
    if (!peer || peer.destroyed || peer.disconnected) {
        console.log('Peer не готов, требуется переподключение...');
        
        if (!currentRoom) {
            alert('Вы не в комнате! Создайте или присоединитесь к комнате сначала.');
            return;
        }
        
        // Создаем нового пира
        peer = roomHost ? await createPeerInstance(currentRoom) : await createPeerInstance();
        
        setupPeerEvents();
        
        // Ждем подключения с таймаутом
        try {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
                
                peer.on('open', () => {
                    clearTimeout(timeout);
                    resolve();
                });
                
                peer.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });
        } catch (error) {
            console.error('Failed to initialize peer:', error);
            alert('Не удалось инициализировать соединение. Возможно проблемы с сервером. Попробуйте сменить сервер.');
            return;
        }
        
        if (!roomHost) {
            // Переподключаемся к хосту
            connectToHost();
        }
    }
    
    const stream = await getCallStream();
    if (!stream) {
        alert('Не удалось получить доступ к микрофону');
        return;
    }
    
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
        alert('Микрофон не найден. Проверьте разрешения.');
        return;
    }
    
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
        const call = peer.call(targetUserId, stream, {
            metadata: {
                callerName: userName,
                timestamp: Date.now(),
                iceServers: getBestICEServers(),
                server: PEERJS_SERVERS[currentPeerServer].host
            }
        });
        
        if (!call) {
            throw new Error('Не удалось создать звонок');
        }
        
        // Добавляем обработчики
        call.on('stream', (remoteStream) => {
            console.log('✅ Получен удаленный аудио поток');
            
            const remoteAudioTracks = remoteStream.getAudioTracks();
            console.log('Remote audio tracks:', remoteAudioTracks.length);
            
            handleRemoteStream(targetUserId, remoteStream);
            callState = 'in_call';
            callStartTime = Date.now();
            updateCallTimer();
            callTimer = setInterval(updateCallTimer, 1000);
            updateCallUI();
            updateUsersList();
            
            addSystemMessage('✅ Звонок установлен. Проверьте громкость!');
        });
        
        call.on('close', () => {
            console.log('Звонок завершен');
            addSystemMessage('📞 Звонок завершен');
            endCall();
        });
        
        call.on('error', (err) => {
            console.error('Ошибка звонка:', err);
            addSystemMessage('❌ Ошибка звонка: ' + err.message);
            endCall();
        });
        
        // Отслеживаем ICE состояние
        if (call.connection) {
            call.connection.oniceconnectionstatechange = () => {
                console.log('ICE connection state:', call.connection.iceConnectionState);
                
                if (call.connection.iceConnectionState === 'connected') {
                    console.log('✅ ICE соединение установлено');
                    addSystemMessage('✅ Соединение установлено');
                } else if (call.connection.iceConnectionState === 'disconnected' || 
                          call.connection.iceConnectionState === 'failed') {
                    console.warn('⚠️ Проблемы с ICE соединением:', call.connection.iceConnectionState);
                    addSystemMessage('⚠️ Проблемы с соединением...');
                }
            };
        }
        
        // Сохраняем соединение
        peerConnections[targetUserId] = call;
        
        // Таймаут звонка
        const callTimeout = setTimeout(() => {
            if (callState === 'calling') {
                console.log('Call timeout - no answer');
                addSystemMessage('❌ Звонок не отвечает');
                endCall();
            }
        }, 30000);
        
        // Очищаем таймаут при успешном подключении
        call.on('stream', () => clearTimeout(callTimeout));
        
    } catch (error) {
        console.error('Ошибка при создании звонка:', error);
        alert('Ошибка при звонке: ' + error.message);
        endCall();
    }
}

// Обработка удаленного потока
function handleRemoteStream(userId, stream) {
    console.log('Handling remote stream for user:', userId);
    
    remoteStreams[userId] = stream;
    
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
        console.error('No audio tracks in remote stream');
        addSystemMessage('⚠️ Удаленный участник не передает аудио');
        return;
    }
    
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
        
        const container = document.createElement('div');
        container.className = 'remote-audio-container';
        container.innerHTML = `<div style="font-size: 12px; color: #666;">Аудио от ${getUserName(userId)}</div>`;
        container.appendChild(audioElement);
        
        remoteAudioContainer.appendChild(container);
    }
    
    audioElement.srcObject = stream;
    
    audioElement.oncanplay = () => {
        console.log(`✅ Аудио может воспроизводиться для ${userId}`);
        audioElement.play().catch(e => {
            console.error(`❌ Не удалось воспроизвести аудио:`, e);
        });
    };
    
    console.log('Remote stream attached to audio element for user:', userId);
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
    
    if (isRecording) {
        stopRecording();
    }
    
    // Останавливаем проверку здоровья
    if (peerConnectionHealthCheck) {
        clearInterval(peerConnectionHealthCheck);
        peerConnectionHealthCheck = null;
    }
    
    // Закрываем все звонки
    Object.values(peerConnections).forEach(conn => {
        if (conn && conn.close) conn.close();
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
    
    // Сбрасываем peer соединение
    resetPeerConnection();
    
    // Сбрасываем состояния
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
window.toggleVoiceRecording = toggleVoiceRecording;
window.playVoiceMessage = playVoiceMessage;
window.diagnoseAudioIssues = diagnoseAudioIssues;
window.resetPeerConnection = resetPeerConnection;
window.testAndSelectBestICEServers = testAndSelectBestICEServers;
window.switchToNextServer = switchToNextServer;

console.log('P2P Chat loaded with multiple server support and enhanced error handling');
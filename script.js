// --- DOM Elements ---
const wsUrlInput = document.getElementById('wsUrl');
const tokenInput = document.getElementById('token');
const userIdInput = document.getElementById('userId');
const nicknameInput = document.getElementById('nickname');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatContentDiv = document.getElementById('chatContent'); // Changed ID
const connectionStatusSpan = document.getElementById('connectionStatus');
const toggleDetailsBtn = document.getElementById('toggleDetailsBtn');
const connectionDetailsDiv = document.getElementById('connectionDetails');
const contactListContainer = document.getElementById('contactListContainer'); // For contacts
const statusSpan = document.getElementById('status'); // For status text

// --- WebSocket State ---
let ws = null;
let heartbeatInterval = null;
let clientId = null;
let userNickname = 'You'; // Store user's nickname for sending messages

// --- Utility Functions ---

// 格式化时间 (HH:MM)
function formatTime(date = new Date()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// 将消息添加到聊天窗口
function addMessageToLog(sender, messageSegments, time = formatTime(), senderType = 'other') {
    const messageItem = document.createElement('div');
    messageItem.className = `message-item ${senderType}`; // 'self', 'other', or 'system'

    const messageTime = document.createElement('div');
    messageTime.className = 'message-time';
    messageTime.textContent = time;

    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';

    const senderSpan = document.createElement('strong');
    if (senderType !== 'system' && senderType !== 'self') { // Don't show sender for self or system messages in bubble
       senderSpan.textContent = `${sender}: `;
       // messageBubble.appendChild(senderSpan); // Optionally show sender above bubble
    }


    // Process message segments
    if (Array.isArray(messageSegments)) {
        messageSegments.forEach(seg => {
            if (seg.type === 'text') {
                // Handle newlines in text
                seg.text.split('\\n').forEach((line, index, arr) => {
                    messageBubble.appendChild(document.createTextNode(line));
                    if (index < arr.length - 1) {
                        messageBubble.appendChild(document.createElement('br'));
                    }
                });
            } else if (seg.type === 'image') {
                const img = document.createElement('img');
                img.classList.add('chat-image');
                img.alt = '[Image]';

                let imgSrc = null;
                let hasValidSrc = false;

                if (seg.url) {
                    imgSrc = seg.url;
                    hasValidSrc = true;
                } else if (seg.file?.type === 'Buffer' && Array.isArray(seg.file.data)) {
                    try {
                        const chunkSize = 8192;
                        let byteCharacters = '';
                        for (let i = 0; i < seg.file.data.length; i += chunkSize) {
                            const chunk = seg.file.data.slice(i, i + chunkSize);
                            byteCharacters += String.fromCharCode(...chunk);
                        }
                        const base64String = btoa(byteCharacters);
                        const dataUri = `data:image/png;base64,${base64String}`;
                        imgSrc = dataUri;
                        hasValidSrc = true;
                    } catch (e) {
                        console.error(`Error converting image buffer: ${e}`);
                        messageBubble.appendChild(document.createTextNode('[Image Data Error]'));
                        return;
                    }
                } else {
                    messageBubble.appendChild(document.createTextNode('[Image (no data)]'));
                    return;
                }

                // Wrap the image in a link
                if (hasValidSrc) {
                    img.src = imgSrc;
                    const link = document.createElement('a');
                    link.href = imgSrc;
                    link.target = '_blank'; // Open in new tab
                    link.rel = 'noopener noreferrer'; // Security best practice
                    link.appendChild(img);
                    messageBubble.appendChild(link);
                } else {
                     messageBubble.appendChild(img); // Append image directly if src is invalid (though handled above)
                }

            } else if (seg.type === 'node' || seg.type === 'forward') {
                const forwardContainer = document.createElement('div');
                forwardContainer.className = 'forwarded-message-container';

                let headerText = `--- Forwarded Messages`;
                if (seg.title) { headerText += `: ${seg.title}`; }
                else if (Array.isArray(seg.data)) { headerText += ` (${seg.data.length} items)`; }
                headerText += ' ---';
                const headerDiv = document.createElement('div');
                headerDiv.className = 'forward-header';
                headerDiv.textContent = headerText;
                forwardContainer.appendChild(headerDiv);

                if (Array.isArray(seg.data)) {
                    seg.data.forEach(node => {
                        const nodeContainer = document.createElement('div');
                        nodeContainer.className = 'forward-node';
                        const nodeSender = node.nickname || node.user_id || 'Unknown';
                        const nodeSenderSpan = document.createElement('strong');
                        nodeSenderSpan.textContent = `${nodeSender}:`;
                        nodeContainer.appendChild(nodeSenderSpan);

                        if (Array.isArray(node.message)) {
                            node.message.forEach(innerSeg => {
                                if (innerSeg.type === 'text') {
                                    nodeContainer.appendChild(document.createTextNode(` ${innerSeg.text}`)); // Add space
                                } else if (innerSeg.type === 'image') {
                                    const innerImg = document.createElement('img');
                                    innerImg.classList.add('chat-image');
                                    innerImg.alt = '[Image]';
                                    if (innerSeg.url) {
                                        innerImg.src = innerSeg.url;
                                        // Wrap forwarded image in link too
                                        const innerLink = document.createElement('a');
                                        innerLink.href = innerSeg.url;
                                        innerLink.target = '_blank';
                                        innerLink.rel = 'noopener noreferrer';
                                        innerLink.style.lineHeight = '0'; // Prevent extra space around inline image link
                                        innerLink.appendChild(innerImg);
                                        nodeContainer.appendChild(innerLink);
                                    } else {
                                        nodeContainer.appendChild(document.createTextNode(' [Image]'));
                                        // return; // Don't return, just show placeholder
                                    }
                                    // nodeContainer.appendChild(innerImg); // Appended via link now
                                } else {
                                    nodeContainer.appendChild(document.createTextNode(` [${innerSeg.type}]`));
                                }
                            });
                        } else if (typeof node.message === 'string') {
                            nodeContainer.appendChild(document.createTextNode(` ${node.message}`)); // Add space
                        } else {
                            nodeContainer.appendChild(document.createTextNode(' [Complex Content]'));
                        }
                        forwardContainer.appendChild(nodeContainer);
                    });
                } else {
                    forwardContainer.appendChild(document.createTextNode('[Could not display content]'));
                }
                messageBubble.appendChild(forwardContainer);
            } else {
                messageBubble.appendChild(document.createTextNode(`[Unsupported type: ${seg.type}]`));
            }
        });
    } else if (typeof messageSegments === 'string') {
         // Handle plain string messages (e.g., system messages)
         messageSegments.split('\\n').forEach((line, index, arr) => {
            messageBubble.appendChild(document.createTextNode(line));
            if (index < arr.length - 1) {
                messageBubble.appendChild(document.createElement('br'));
            }
        });
    }

    // Append time and bubble based on sender type
    if (senderType === 'self') {
        messageItem.appendChild(messageBubble);
        messageItem.appendChild(messageTime); // Time below bubble for self
    } else if (senderType === 'other'){
        messageItem.appendChild(messageTime); // Time above bubble for others
        messageItem.appendChild(messageBubble);
    } else { // System message
         messageItem.appendChild(messageBubble); // No time for system messages
    }


    chatContentDiv.appendChild(messageItem);
    // Scroll to bottom
    chatContentDiv.scrollTop = chatContentDiv.scrollHeight;
}

// 更新连接状态显示
function updateStatus(status, className) {
    connectionStatusSpan.textContent = status;
    connectionStatusSpan.className = className;
    const isConnected = (status === 'Connected');
    const isConnecting = (status === 'Connecting');
    const isDisconnected = !isConnected && !isConnecting;

    connectBtn.disabled = isConnected || isConnecting;
    disconnectBtn.disabled = isDisconnected;
    messageInput.disabled = isDisconnected; // Enable input only when connected
    sendBtn.disabled = isDisconnected;

    // Disable connection setting inputs when not disconnected
    wsUrlInput.disabled = !isDisconnected;
    tokenInput.disabled = !isDisconnected;
    userIdInput.disabled = !isDisconnected;
    nicknameInput.disabled = !isDisconnected;
}

// --- WebSocket Functions ---

function connectWebSocket() {
    const wsUrl = wsUrlInput.value.trim();
    const token = tokenInput.value.trim();
    const userId = userIdInput.value.trim();
    const nickname = nicknameInput.value.trim();
    userNickname = nickname || 'You'; // Update user nickname

    if (!wsUrl || !token || !userId || !nickname) {
        addMessageToLog('System', "请填写所有连接设置信息。", formatTime(), 'system');
        return;
    }

    if (ws) return; // Already connected or connecting

    addMessageToLog('System', `正在连接到 ${wsUrl}...`, formatTime(), 'system');
    updateStatus('Connecting', 'connecting');
    chatContentDiv.innerHTML = ''; // Clear chat on new connection attempt

    try {
        ws = new WebSocket(wsUrl);
    } catch (error) {
         addMessageToLog('System', `创建 WebSocket 失败: ${error}`, formatTime(), 'system');
         updateStatus('Disconnected', 'disconnected');
         ws = null;
         return;
    }

    ws.onopen = () => {
        addMessageToLog('System', "WebSocket 连接已打开，正在验证...", formatTime(), 'system');
        const authPayload = { token: token, user_id: userId, nickname: nickname };
        sendWebSocketMessage('auth', authPayload);
        startHeartbeat();
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'connected':
                    clientId = data.payload?.clientId;
                    addMessageToLog('System', `服务器确认连接。客户端 ID: ${clientId || 'N/A'}`, formatTime(), 'system');
                    break;
                case 'auth_response':
                    if (data.payload?.status === 'ok') {
                        addMessageToLog('System', "身份验证成功！", formatTime(), 'system');
                        updateStatus('Connected', 'connected');
                        messageInput.focus(); // Focus input field
                    } else {
                        addMessageToLog('System', `身份验证失败: ${data.payload?.message || '未知错误'}`, formatTime(), 'system');
                        disconnectWebSocket(false);
                        updateStatus('Disconnected (Auth Failed)', 'disconnected');
                    }
                    break;
                case 'message':
                    const sender = data.payload?.sender?.nickname || data.payload?.user_id || 'Bot';
                    const messageSegments = Array.isArray(data.payload?.message) ? data.payload.message : [{type: 'text', text: String(data.payload?.message)}];
                    addMessageToLog(sender, messageSegments, formatTime(), 'other');
                    break;
                case 'message_receipt': /* Ignored */ break;
                case 'api_response':
                    addMessageToLog('System', `API 响应 (echo: ${data.echo}): ${JSON.stringify(data.payload)}`, formatTime(), 'system');
                    break;
                case 'heartbeat_response': /* Ignored */ break;
                case 'error':
                    addMessageToLog('System', `服务器错误: ${data.message || '未知错误'}`, formatTime(), 'system');
                    break;
                case 'notice':
                    if(data.payload?.notice_type === 'recall_attempt') {
                        addMessageToLog('System', `服务器请求撤回消息 ID: ${data.payload.message_id}`, formatTime(), 'system');
                        // TODO: Add logic to find and visually mark/remove the recalled message
                    } else {
                        addMessageToLog('System', `服务器通知: ${JSON.stringify(data.payload)}`, formatTime(), 'system');
                    }
                    break;
                default:
                     addMessageToLog('System', `收到未知消息类型: ${data.type}`, formatTime(), 'system');
            }
        } catch (error) {
             addMessageToLog('System', `处理接收消息时出错: ${error}`, formatTime(), 'system');
             console.error("Raw received data causing error:", event.data);
        }
    };

    ws.onerror = (event) => {
        let errorMsg = 'WebSocket 发生错误。';
        // Browsers often don't provide specific error details here for security reasons
        console.error("WebSocket error event:", event);
        addMessageToLog('System', errorMsg, formatTime(), 'system');
        disconnectWebSocket(false);
        updateStatus('Disconnected (Error)', 'disconnected');
    };

    ws.onclose = (event) => {
        let reason = `代码: ${event.code}`;
        if (event.reason) reason += `, 原因: ${event.reason}`;
        addMessageToLog('System', `WebSocket 连接已关闭。${reason}`, formatTime(), 'system');
        stopHeartbeat();
        ws = null;
        clientId = null;
        updateStatus('Disconnected', 'disconnected');
    };
}

function disconnectWebSocket(sendCloseFrame = true) {
    stopHeartbeat();
    if (ws) {
        addMessageToLog('System', "正在断开连接...", formatTime(), 'system');
        if (sendCloseFrame && ws.readyState === WebSocket.OPEN) {
            ws.close(1000, "Client initiated disconnect");
        } else if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING){
             try { ws.terminate(); } catch {} // Should not be needed in browser context
        }
        ws = null;
        clientId = null;
    }
    updateStatus('Disconnected', 'disconnected');
}

function sendWebSocketMessage(type, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addMessageToLog('System', "无法发送消息，WebSocket 未连接。", formatTime(), 'system');
        return false;
    }
    const message = {
        type: type,
        echo: `client-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`,
        payload: payload
    };
    try {
        ws.send(JSON.stringify(message));
        return true;
    } catch (error) {
        addMessageToLog('System', `发送消息失败: ${error}`, formatTime(), 'system');
        return false;
    }

}

// --- Heartbeat ---
function startHeartbeat() {
    stopHeartbeat();
    addMessageToLog('System', "正在启动心跳 (每30秒)...", formatTime(), 'system');
    heartbeatInterval = setInterval(() => {
        sendWebSocketMessage('heartbeat', {});
    }, 30000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        addMessageToLog('System', "正在停止心跳。", formatTime(), 'system');
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// --- UI Interaction ---

// 发送聊天消息
function sendChatMessage() {
    const messageText = messageInput.value.trim();
    if (messageText && ws && ws.readyState === WebSocket.OPEN) {
        const success = sendWebSocketMessage('message', {
            message_type: 'private', // Assuming private chat for now
            message: messageText
        });
        if (success) {
             // Add message to log immediately as 'self'
             addMessageToLog(userNickname, [{type: 'text', text: messageText}], formatTime(), 'self');
             messageInput.value = ""; // Clear input
             messageInput.focus();
             messageInput.style.height = 'auto'; // Reset height after sending
        }
    } else if (!ws || ws.readyState !== WebSocket.OPEN) {
         addMessageToLog('System', "请先连接服务器再发送消息。", formatTime(), 'system');
    }
}

// --- Contact List (Mock) ---
function renderContacts() {
    contactListContainer.innerHTML = ""; // Clear existing
     // Mock contact data (replace with dynamic data later)
     const contacts = [
        { id: 1, name: "Yunzai Bot", avatar: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23ddd'/%3E%3Ctext x='50' y='55' font-size='40' text-anchor='middle' dy='.1em' fill='%23777'%3EB%3C/text%3E%3C/svg%3E", lastTime: formatTime(), status: "online" },
        // Add more mock contacts if needed
     ];

    contacts.forEach(contact => {
        const contactItem = document.createElement("div");
        // Assuming the first contact is the active chat
        contactItem.className = `contact-item ${contact.id === 1 ? 'active' : ''}`;

        const contactImg = document.createElement("img");
        contactImg.src = contact.avatar;
        contactImg.alt = "头像";

        const contactInfo = document.createElement("div");
        contactInfo.className = "contact-info";

        const contactName = document.createElement("h3");
        contactName.className = "contact-name";
        contactName.textContent = contact.name;

        const contactTime = document.createElement("p");
        contactTime.className = "contact-time";
        contactTime.textContent = contact.lastTime;

        const contactStatus = document.createElement("div");
        contactStatus.className = "contact-status";
        if (contact.status === 'online') {
            const online = document.createElement("span");
            online.className = "online";
            contactStatus.appendChild(online);
        }

        contactInfo.appendChild(contactName);
        contactInfo.appendChild(contactTime);
        contactItem.appendChild(contactImg);
        contactItem.appendChild(contactInfo);
        contactItem.appendChild(contactStatus);

        contactListContainer.appendChild(contactItem);
    });
}

// Auto-adjust textarea height
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto'; // Reset height
    messageInput.style.height = (messageInput.scrollHeight) + 'px'; // Set to scroll height
});


// --- Event Listeners ---
connectBtn.addEventListener('click', connectWebSocket);
disconnectBtn.addEventListener('click', () => disconnectWebSocket(true));
sendBtn.addEventListener('click', sendChatMessage);

messageInput.addEventListener('keypress', (event) => {
    // Send on Enter, allow Shift+Enter for newline
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Prevent default newline behavior
        sendChatMessage();
    }
});

toggleDetailsBtn.addEventListener('click', () => {
    const isHidden = connectionDetailsDiv.style.display === 'none';
    connectionDetailsDiv.style.display = isHidden ? 'block' : 'none';
    toggleDetailsBtn.textContent = isHidden ? '隐藏连接设置' : '显示连接设置';
});

// --- Initial Setup ---
renderContacts(); // Render mock contacts initially
updateStatus('Disconnected', 'disconnected'); // Set initial UI state

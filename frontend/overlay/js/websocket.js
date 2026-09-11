let socket;
let messageListeners = [];
const WS_URL = 'ws://127.0.0.1:8989';

export function connect() {
    console.log('[WebSocket] Conectando ao servidor em ' + WS_URL + '...');
    socket = new WebSocket(WS_URL);
    
    socket.onopen = () => {
        console.log('[WebSocket] Conectado com sucesso!');
        const waitingOverlay = document.getElementById('waiting-server-overlay');
        if (waitingOverlay) waitingOverlay.classList.add('hidden');
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            messageListeners.forEach(listener => {
                try {
                    listener(data);
                } catch (err) {
                    console.error('[WebSocket] Erro no listener:', err);
                }
            });
        } catch (e) {
            console.error('[WebSocket] Erro ao processar mensagem JSON:', e);
        }
    };

    socket.onclose = () => {
        console.log('[WebSocket] Desconectado. Reconectando em 2s...');
        const waitingOverlay = document.getElementById('waiting-server-overlay');
        if (waitingOverlay) waitingOverlay.classList.remove('hidden');
        setTimeout(connect, 2000);
    };

    socket.onerror = (err) => {
        console.error('[WebSocket] Erro de conexao:', err);
        socket.close();
    };
}

export function onMessage(callback) {
    messageListeners.push(callback);
}

export function send(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

import * as websocket from './websocket.js';
import { handleMessage } from './overlay_renderer.js';

async function init() {
    console.log('[Overlay] Inicializando transmissao OBS...');
    websocket.onMessage(handleMessage);
    websocket.connect();
}

init();

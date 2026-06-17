import { Soundboard } from '../types';
import { soundGlowColors } from '../constants';

export const generateYoutubeProductionHTML = (board: Soundboard, audioData: { [key: string]: string }, masterVolume: number) => {
    const isNum = (val: any): val is number => typeof val === 'number' && isFinite(val);

    const boardForExport = {
        ...board,
        sounds: board.sounds.map(sound => ({
            ...sound,
            volume: isNum(sound.volume) ? sound.volume : 0.75,
            pitch: isNum(sound.pitch) ? sound.pitch : 1.0,
            pan: isNum(sound.pan) ? sound.pan : 0,
            loop: sound.loop ?? false,
            retriggerable: sound.retriggerable ?? false,
            crossfade: isNum(sound.crossfade) ? sound.crossfade : 0.5,
            fadeIn: isNum(sound.fadeIn) ? sound.fadeIn : 0.1,
            fadeOut: isNum(sound.fadeOut) ? sound.fadeOut : 0.1,
            pauseFade: isNum(sound.pauseFade) ? sound.pauseFade : 0.2,
            startTime: isNum(sound.startTime) ? sound.startTime : 0,
            endTime: sound.endTime === null || isNum(sound.endTime) ? sound.endTime : null,
            reverb: isNum(sound.reverb) ? sound.reverb : 0,
            delayTime: isNum(sound.delayTime) ? sound.delayTime : 0,
            delayFeedback: isNum(sound.delayFeedback) ? sound.delayFeedback : 0,
            eqEnabled: sound.eqEnabled ?? false,
            eqPreamp: isNum(sound.eqPreamp) ? sound.eqPreamp : 0,
            eqBands: sound.eqBands && sound.eqBands.length === 10 ? sound.eqBands : Array(10).fill(0),
            stopActions: Array.isArray(sound.stopActions) ? sound.stopActions : (
                Array.isArray((sound as any).stopIds) ? (sound as any).stopIds.map((id: string) => ({ soundId: id, type: 'stop' })) : []
            ),
            playCount: isNum(sound.playCount) ? sound.playCount : 0,
            hidden: sound.hidden ?? false,
            instructions: sound.instructions ?? ''
        }))
    };
    
    const audioDataBase64: { [key: string]: string } = {};
    const requiredSourceIds = new Set(boardForExport.sounds.map(s => s.audioSourceId));
    for (const id of requiredSourceIds) {
        const dataUrl = audioData[id];
        if (dataUrl) {
            const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
            if (base64Part) {
                audioDataBase64[id] = base64Part;
            }
        }
    }

    const clientSafeAtob = `function safeAtob(str) { return decodeURIComponent(atob(str).split('').map(function(c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')); }`;

    const encodeForTemplate = (obj: any) => {
        const str = JSON.stringify(obj);
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode(parseInt(p1, 16))));
    };

    const encodedBoard = encodeForTemplate(boardForExport);

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
    <title>SoundTube: ${board.name}</title>
    <style>
        :root {
            --yt-black: #0f0f0f;
            --yt-dark-gray: #212121;
            --yt-light-gray: #3d3d3d;
            --yt-red: #ff0000;
            --yt-white: #f1f1f1;
            --yt-gray-text: #aaaaaa;
            --yt-chip-bg: #272727;
            --yt-chip-bg-hover: #3f3f3f;
            --font-sans: "Roboto", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            user-select: none;
            -webkit-user-select: none;
        }

        html, body {
            height: 100%;
            overflow: hidden;
            background-color: var(--yt-black);
            color: var(--yt-white);
            font-family: var(--font-sans);
        }

        body {
            display: flex;
            flex-direction: column;
            -webkit-tap-highlight-color: transparent;
        }

        /* --- YOUTUBE HEADER --- */
        header {
            background-color: var(--yt-black);
            padding: 0 1rem;
            height: 56px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            position: relative;
            z-index: 100;
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .yt-logo-container {
            display: flex;
            align-items: center;
            gap: 4px;
            font-weight: 700;
            font-size: 1.15rem;
            letter-spacing: -0.5px;
            color: var(--yt-white);
        }

        .yt-logo-icon {
            color: var(--yt-red);
            width: 30px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, var(--yt-red) 0%, #cc0000 100%);
            border-radius: 6px;
            position: relative;
        }

        .yt-logo-icon::after {
            content: '';
            width: 0;
            height: 0;
            border-top: 5px solid transparent;
            border-bottom: 5px solid transparent;
            border-left: 8px solid white;
            position: absolute;
            left: 12px;
            top: 6px;
        }

        .header-center {
            display: flex;
            align-items: center;
            flex-grow: 1;
            max-width: 500px;
            margin: 0 1rem;
            position: relative;
        }

        .yt-search-bar {
            width: 100%;
            background-color: #121212;
            border: 1px solid #303030;
            border-radius: 40px 0 0 40px;
            padding: 8px 16px;
            font-size: 0.95rem;
            color: var(--yt-white);
            outline: none;
            height: 36px;
        }

        .yt-search-bar:focus {
            border-color: #1c62b9;
        }

        .yt-search-btn {
            background-color: rgba(255, 255, 255, 0.08);
            border: 1px solid #303030;
            border-left: none;
            border-radius: 0 40px 40px 0;
            width: 56px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: var(--yt-white);
        }

        .yt-search-btn svg {
            width: 18px;
            height: 18px;
        }

        .header-right {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        /* --- MAIN FEED (SOUND FEED) --- */
        main {
            flex-grow: 1;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            padding: 12px;
        }

        /* Grid layout for landscape, Single list for portrait mobile */
        #sound-feed {
            display: grid;
            grid-template-columns: 1fr;
            gap: 24px;
            padding-bottom: 120px; /* Space for sticky global controls */
            max-width: 1280px;
            margin: 0 auto;
        }

        @media (min-width: 600px) {
            #sound-feed {
                grid-template-columns: repeat(2, 1fr);
            }
        }

        @media (min-width: 960px) {
            #sound-feed {
                grid-template-columns: repeat(3, 1fr);
            }
        }

        @media (min-width: 1280px) {
            #sound-feed {
                grid-template-columns: repeat(4, 1fr);
            }
        }

        /* --- VIDEO CARD (SOUND PAD) --- */
        .sound-card {
            display: flex;
            flex-direction: column;
            background-color: transparent;
            position: relative;
            border-radius: 12px;
            overflow: hidden;
            transition: transform 0.2s;
        }

        /* Thumbnail Aspect Ratio 16:9 */
        .thumbnail-container {
            width: 100%;
            padding-top: 56.25%; /* 16:9 Aspect Ratio */
            position: relative;
            background-color: var(--yt-dark-gray);
            border-radius: 12px;
            overflow: hidden;
            border: 2px solid transparent;
            transition: border-color 0.2s;
            cursor: pointer;
        }

        .sound-card.is-playing .thumbnail-container {
            border-color: var(--theme-color, var(--yt-red));
        }

        .thumbnail-img {
            position: absolute;
            inset: 0;
            background-size: cover;
            background-position: center;
            z-index: 1;
        }

        /* Ambient colored background if no image */
        .thumbnail-bg-gradient {
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, var(--theme-color, #1f2937) 0%, #000 100%);
            z-index: 1;
            opacity: 0.85;
        }

        /* Play / Pause Overlays */
        .play-overlay {
            position: absolute;
            inset: 0;
            background-color: rgba(0, 0, 0, 0.4);
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.2s;
        }

        .sound-card:hover .play-overlay,
        .sound-card.is-playing .play-overlay,
        .sound-card.is-paused .play-overlay {
            opacity: 1;
        }

        .play-btn-circle {
            width: 52px;
            height: 52px;
            border-radius: 50%;
            background-color: var(--yt-red);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            transition: transform 0.2s;
        }

        .thumbnail-container:hover .play-btn-circle {
            transform: scale(1.1);
        }

        .play-btn-circle svg {
            width: 24px;
            height: 24px;
            fill: currentColor;
        }

        /* Duration Badge */
        .duration-badge {
            position: absolute;
            bottom: 8px;
            right: 8px;
            background-color: rgba(0, 0, 0, 0.8);
            color: white;
            font-size: 0.75rem;
            font-weight: 500;
            padding: 2px 4px;
            border-radius: 4px;
            z-index: 5;
            font-family: var(--font-mono);
        }

        /* Progress Line */
        .card-progress-bar {
            position: absolute;
            bottom: 0;
            left: 0;
            height: 4px;
            background-color: var(--theme-color, var(--yt-red));
            z-index: 6;
            width: 0%;
            transition: width 0.1s linear;
        }

        /* Card Metadata / Description (Below thumbnail) */
        .card-details {
            display: flex;
            margin-top: 12px;
            gap: 12px;
            padding: 0 4px;
            position: relative;
            z-index: 10;
        }

        .channel-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background-color: var(--theme-color, var(--yt-red));
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 0.9rem;
            text-transform: uppercase;
            color: white;
            box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
        }

        .card-text-container {
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            min-width: 0;
        }

        .card-title {
            font-size: 0.95rem;
            font-weight: 600;
            line-height: 1.25;
            color: var(--yt-white);
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            overflow: hidden;
            margin-bottom: 4px;
            word-break: break-word;
        }

        .card-metadata {
            font-size: 0.8rem;
            color: var(--yt-gray-text);
            line-height: 1.4;
            margin-bottom: 6px;
        }

        /* --- COLLAPSIBLE OPERATOR DESCRIPTION (Show More) --- */
        .card-description-box {
            background-color: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            padding: 8px;
            font-size: 0.8rem;
            line-height: 1.35;
            color: #d1d5db;
            margin-bottom: 10px;
            position: relative;
        }

        .description-text {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 3;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: normal;
        }

        .card-description-box.is-expanded .description-text {
            display: block;
            max-height: 120px;
            overflow-y: auto;
        }

        .show-more-toggle {
            display: inline-block;
            font-weight: 700;
            color: var(--yt-white);
            cursor: pointer;
            font-size: 0.75rem;
            margin-top: 4px;
        }

        /* --- BUTTON BAR & FADER (ACTION PANEL) --- */
        .card-actions-bar {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 4px;
        }

        .yt-pill-button-group {
            display: flex;
            background-color: var(--yt-chip-bg);
            border-radius: 18px;
            overflow: hidden;
            height: 32px;
            align-items: center;
        }

        .yt-action-btn {
            background: transparent;
            border: none;
            color: var(--yt-white);
            font-size: 0.75rem;
            font-weight: 600;
            padding: 0 10px;
            height: 100%;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: background-color 0.2s;
        }

        .yt-action-btn:hover {
            background-color: var(--yt-chip-bg-hover);
        }

        .yt-action-btn svg {
            width: 14px;
            height: 14px;
        }

        .yt-action-btn.is-active {
            color: var(--theme-color, var(--yt-red));
        }

        /* Separator inside button group */
        .pill-divider {
            width: 1px;
            height: 20px;
            background-color: rgba(255, 255, 255, 0.15);
        }

        .yt-volume-slider-group {
            display: flex;
            align-items: center;
            gap: 6px;
            background-color: var(--yt-chip-bg);
            border-radius: 18px;
            height: 32px;
            padding: 0 10px;
            flex-grow: 1;
            min-width: 100px;
        }

        .yt-volume-slider-group svg {
            width: 14px;
            height: 14px;
            color: var(--yt-gray-text);
            flex-shrink: 0;
        }

        .yt-slider {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 3px;
            background-color: rgba(255, 255, 255, 0.2);
            border-radius: 2px;
            outline: none;
            cursor: pointer;
        }

        .yt-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background-color: var(--yt-white);
            cursor: pointer;
            transition: transform 0.1s;
        }

        .yt-slider::-webkit-slider-thumb:hover {
            transform: scale(1.25);
            background-color: var(--theme-color, var(--yt-red));
        }

        /* --- GLOBAL CONTROL PANEL (Sticky Footer like YouTube mobile navigation bar) --- */
        footer.yt-footer {
            background-color: var(--yt-black);
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 100;
            padding: 10px 16px;
            padding-bottom: max(10px, env(safe-area-inset-bottom));
            display: flex;
            flex-direction: column;
            gap: 8px;
            box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.6);
        }

        @media (min-width: 768px) {
            footer.yt-footer {
                flex-direction: row;
                align-items: center;
                justify-content: space-between;
                height: 72px;
                padding: 12px 24px;
            }
        }

        .yt-global-volume-container {
            display: flex;
            align-items: center;
            gap: 12px;
            background-color: var(--yt-dark-gray);
            border-radius: 20px;
            padding: 8px 16px;
            flex-grow: 1;
            max-width: 600px;
        }

        .yt-global-volume-container svg {
            width: 18px;
            height: 18px;
            color: var(--yt-gray-text);
        }

        .yt-global-actions {
            display: flex;
            gap: 8px;
            justify-content: center;
        }

        .yt-footer-btn {
            background-color: var(--yt-chip-bg);
            border: none;
            color: white;
            border-radius: 20px;
            padding: 0 16px;
            height: 38px;
            font-size: 0.85rem;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: background-color 0.2s;
        }

        .yt-footer-btn:hover {
            background-color: var(--yt-chip-bg-hover);
        }

        .yt-footer-btn-red {
            background-color: var(--yt-red);
        }

        .yt-footer-btn-red:hover {
            background-color: #cc0000;
        }

        .yt-footer-btn svg {
            width: 16px;
            height: 16px;
        }

        /* --- SPINNER --- */
        .spinner {
            width: 24px;
            height: 24px;
            border: 3px solid rgba(255, 255, 255, 0.2);
            border-top: 3px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* Overlay for inactive cards */
        .sound-card.is-dimmed {
            opacity: 0.45;
        }
    </style>
</head>
<body>

    <!-- Header -->
    <header>
        <div class="header-left">
            <div class="yt-logo-container">
                <div class="yt-logo-icon"></div>
                <span>SoundTube</span>
            </div>
        </div>
        
        <div class="header-center">
            <input type="text" id="search-input" class="yt-search-bar" placeholder="Buscar sonidos..." aria-label="Buscar sonidos">
            <button class="yt-search-btn" title="Buscar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </button>
        </div>

        <div class="header-right">
            <div style="font-size: 0.8rem; font-weight: 600; color: var(--yt-gray-text); display: none;" id="status-label">Offline Ready</div>
        </div>
    </header>

    <!-- Sound feed -->
    <main>
        <div id="sound-feed"></div>
    </main>

    <!-- Global sticky controls -->
    <footer class="yt-footer">
        <div class="yt-global-volume-container">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            <input type="range" id="master-volume" class="yt-slider" min="0" max="1" step="0.01" value="${masterVolume}" aria-label="Volumen Máster">
            <span id="master-vol-percent" style="font-family: var(--font-mono); font-size: 0.85rem; font-weight: 700; width: 35px; text-align: right;">${Math.round(masterVolume * 100)}%</span>
        </div>

        <div class="yt-global-actions">
            <button id="fade-all-btn" class="yt-footer-btn" title="Desvanecimiento global">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-4V6a2 2 0 0 0-4 0v4H6a2 2 0 0 0 0 4h4v4a2 2 0 0 0 4 0v-4h4a2 2 0 0 0 0-4z"></path></svg>
                <span>FADE OUT (5s)</span>
            </button>
            <button id="stop-all-btn" class="yt-footer-btn yt-footer-btn-red" title="Detener todo inmediatamente">
                <svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>
                <span>DETENER TODO</span>
            </button>
        </div>
    </footer>

    <!-- Templates and Client JS -->
    <script>
        ${clientSafeAtob}
        
        // Load soundboard config
        const BOARD_DATA = JSON.parse(safeAtob("${encodedBoard}"));
        const AUDIO_DATA_MAP = {
            ${Object.entries(audioDataBase64).map(([id, base64]) => `"${id}": "${base64}"`).join(',\n            ')}
        };

        const soundColorsGlow = {
            chakraRed: '#ff0000',
            transitionRedOrange: '#ff4500',
            chakraOrange: '#ff8c00',
            transitionOrangeYellow: '#ffd700',
            chakraYellow: '#ffff00',
            transitionYellowGreen: '#9acd32',
            chakraGreen: '#008000',
            transitionGreenBlue: '#008080',
            chakraBlue: '#0000ff',
            transitionBlueIndigo: '#4b0082',
            chakraIndigo: '#3f51b5',
            transitionIndigoViolet: '#8a2be2',
            chakraViolet: '#ee82ee',
            black: '#111111',
            gray: '#888888',
            white: '#ffffff',
            splitRedBlue: '#a855f7',
            splitGreenYellow: '#a3e635',
            splitPurpleOrange: '#d946ef',
            disabled: '#ff0000'
        };

        // Initialize audio engine
        let audioContext = null;
        let masterGainNode = null;
        const activeSources = {};

        function getAudioContext() {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                masterGainNode = audioContext.createGain();
                masterGainNode.connect(audioContext.destination);
                masterGainNode.gain.setValueAtTime(parseFloat(document.getElementById('master-volume').value), audioContext.currentTime);
            }
            return audioContext;
        }

        // Decode Base64 audio to array buffer
        function base64ToArrayBuffer(base64) {
            const binaryString = window.atob(base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        }

        const decodedBuffers = {};
        const loadingPromises = {};

        async function getDecodedBuffer(sourceId) {
            if (decodedBuffers[sourceId]) return decodedBuffers[sourceId];
            if (loadingPromises[sourceId]) return loadingPromises[sourceId];

            loadingPromises[sourceId] = (async () => {
                const base64 = AUDIO_DATA_MAP[sourceId];
                if (!base64) throw new Error("No base64 data for source: " + sourceId);
                const arrayBuffer = base64ToArrayBuffer(base64);
                const context = getAudioContext();
                const buffer = await context.decodeAudioData(arrayBuffer);
                decodedBuffers[sourceId] = buffer;
                delete loadingPromises[sourceId];
                return buffer;
            })();

            return loadingPromises[sourceId];
        }

        // Render soundboard cards
        const soundFeedEl = document.getElementById('sound-feed');
        const searchInput = document.getElementById('search-input');
        
        function formatTime(seconds) {
            if (isNaN(seconds) || seconds < 0) return '00:00.0';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            const ms = Math.floor((seconds - Math.floor(seconds)) * 10);
            return mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0') + '.' + ms;
        }

        // Helper to check if a sound is soloed
        let activeSoloSoundId = null;

        function renderSounds(filter = '') {
            soundFeedEl.innerHTML = '';
            const query = filter.toLowerCase().trim();
            
            BOARD_DATA.sounds.forEach(sound => {
                if (sound.hidden) return;
                if (query && !sound.name.toLowerCase().includes(query) && !sound.instructions.toLowerCase().includes(query)) return;

                const soundCard = document.createElement('div');
                soundCard.className = 'sound-card';
                soundCard.id = 'card-' + sound.id;
                
                const themeColor = soundColorsGlow[sound.color] || '#ff0000';
                soundCard.style.setProperty('--theme-color', themeColor);

                // Thumbnail area (16:9)
                const thumbnailContainer = document.createElement('div');
                thumbnailContainer.className = 'thumbnail-container';
                
                const gradientBg = document.createElement('div');
                gradientBg.className = 'thumbnail-bg-gradient';
                thumbnailContainer.appendChild(gradientBg);

                const playOverlay = document.createElement('div');
                playOverlay.className = 'play-overlay';
                
                const playBtn = document.createElement('div');
                playBtn.className = 'play-btn-circle';
                playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    togglePlay(sound);
                });
                playOverlay.appendChild(playBtn);
                thumbnailContainer.appendChild(playOverlay);

                const durationBadge = document.createElement('div');
                durationBadge.className = 'duration-badge';
                durationBadge.id = 'duration-' + sound.id;
                durationBadge.innerText = 'Cargando...';
                thumbnailContainer.appendChild(durationBadge);

                const progressBar = document.createElement('div');
                progressBar.className = 'card-progress-bar';
                progressBar.id = 'progress-' + sound.id;
                thumbnailContainer.appendChild(progressBar);

                // Double tap / click gesture on thumbnail to seek 5s (like YouTube mobile)
                let lastTap = 0;
                thumbnailContainer.addEventListener('click', (e) => {
                    // Ignore if clicked directly on the play button
                    if (e.target.closest('.play-btn-circle')) return;

                    const now = Date.now();
                    const DOUBLE_PRESS_DELAY = 300;
                    if (now - lastTap < DOUBLE_PRESS_DELAY) {
                        const rect = thumbnailContainer.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const isRight = clickX > rect.width / 2;
                        
                        showDoubleTapRipple(sound.id, isRight);
                        seekRelative(sound.id, isRight ? 5 : -5);
                    }
                    lastTap = now;
                });

                soundCard.appendChild(thumbnailContainer);

                // Meta area
                const cardDetails = document.createElement('div');
                cardDetails.className = 'card-details';

                // Channel Avatar representing category/color
                const avatar = document.createElement('div');
                avatar.className = 'channel-avatar';
                avatar.innerText = sound.name.charAt(0);
                cardDetails.appendChild(avatar);

                const textContainer = document.createElement('div');
                textContainer.className = 'card-text-container';

                const title = document.createElement('h3');
                title.className = 'card-title';
                title.innerText = sound.name;
                textContainer.appendChild(title);

                const meta = document.createElement('div');
                meta.className = 'card-metadata';
                meta.id = 'meta-' + sound.id;
                meta.innerText = 'Reproducido ' + (sound.playCount || 0) + ' veces' + (sound.retriggerable ? ' • Poly' : '');
                textContainer.appendChild(meta);

                // Description Box (Collapsible Operator instructions)
                if (sound.instructions && sound.instructions.trim().length > 0) {
                    const descBox = document.createElement('div');
                    descBox.className = 'card-description-box';
                    descBox.id = 'desc-box-' + sound.id;
                    
                    const descText = document.createElement('div');
                    descText.className = 'description-text';
                    descText.innerText = sound.instructions;
                    descBox.appendChild(descText);

                    const toggleBtn = document.createElement('div');
                    toggleBtn.className = 'show-more-toggle';
                    toggleBtn.innerText = 'Mostrar más';
                    toggleBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        descBox.classList.toggle('is-expanded');
                        toggleBtn.innerText = descBox.classList.contains('is-expanded') ? 'Mostrar menos' : 'Mostrar más';
                    });
                    
                    descBox.appendChild(toggleBtn);
                    textContainer.appendChild(descBox);
                }

                // Controls row (Loop, Solo, Fade Out, Stop)
                const actionsBar = document.createElement('div');
                actionsBar.className = 'card-actions-bar';

                const pillGroup = document.createElement('div');
                pillGroup.className = 'yt-pill-button-group';

                const loopBtn = document.createElement('button');
                loopBtn.className = 'yt-action-btn' + (sound.loop ? ' is-active' : '');
                loopBtn.id = 'loop-btn-' + sound.id;
                loopBtn.title = 'Bucle (Loop)';
                loopBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg><span>Bucle</span>';
                loopBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    sound.loop = !sound.loop;
                    loopBtn.classList.toggle('is-active', sound.loop);
                    const activeSource = activeSources[sound.id];
                    if (activeSource && activeSource.source && sound.crossfade <= 0) {
                        activeSource.source.loop = sound.loop;
                    }
                });
                pillGroup.appendChild(loopBtn);

                const divider = document.createElement('div');
                divider.className = 'pill-divider';
                pillGroup.appendChild(divider);

                const soloBtn = document.createElement('button');
                soloBtn.className = 'yt-action-btn' + (activeSoloSoundId === sound.id ? ' is-active' : '');
                soloBtn.id = 'solo-btn-' + sound.id;
                soloBtn.title = 'Modo Solo';
                soloBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg><span>Solo</span>';
                soloBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleSolo(sound.id);
                });
                pillGroup.appendChild(soloBtn);

                actionsBar.appendChild(pillGroup);

                // Time Navigation Group (Go to start, Go to end)
                const navGroup = document.createElement('div');
                navGroup.className = 'yt-pill-button-group';
                
                const startBtn = document.createElement('button');
                startBtn.className = 'yt-action-btn';
                startBtn.title = 'Ir al Inicio';
                startBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:12px; height:12px;"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>';
                startBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    seekTo(sound.id, sound.startTime || 0);
                });
                navGroup.appendChild(startBtn);

                const dividerNav = document.createElement('div');
                dividerNav.className = 'pill-divider';
                navGroup.appendChild(dividerNav);

                const endBtn = document.createElement('button');
                endBtn.className = 'yt-action-btn';
                endBtn.title = 'Ir al Final';
                endBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:12px; height:12px;"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>';
                endBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    getDecodedBuffer(sound.audioSourceId).then(buffer => {
                        seekTo(sound.id, sound.endTime || buffer.duration);
                    });
                });
                navGroup.appendChild(endBtn);
                
                actionsBar.appendChild(navGroup);

                // Stop & Fade Group
                const killGroup = document.createElement('div');
                killGroup.className = 'yt-pill-button-group';

                const fadeBtn = document.createElement('button');
                fadeBtn.className = 'yt-action-btn';
                fadeBtn.id = 'fade-btn-' + sound.id;
                fadeBtn.title = 'Fade Out';
                fadeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg><span>Desvanecer</span>';
                fadeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    fadeOutSound(sound.id);
                });
                killGroup.appendChild(fadeBtn);

                const divider2 = document.createElement('div');
                divider2.className = 'pill-divider';
                killGroup.appendChild(divider2);

                const stopBtn = document.createElement('button');
                stopBtn.className = 'yt-action-btn';
                stopBtn.id = 'stop-btn-' + sound.id;
                stopBtn.title = 'Detener inmediato';
                stopBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"></rect></svg><span>Detener</span>';
                stopBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    stopSound(sound.id);
                });
                killGroup.appendChild(stopBtn);

                actionsBar.appendChild(killGroup);

                // Volume slider group
                const volumeGroup = document.createElement('div');
                volumeGroup.className = 'yt-volume-slider-group';
                volumeGroup.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon></svg>';
                
                const volSlider = document.createElement('input');
                volSlider.type = 'range';
                volSlider.className = 'yt-slider';
                volSlider.min = '0';
                volSlider.max = '1';
                volSlider.step = '0.01';
                volSlider.value = sound.volume;
                volSlider.ariaLabel = 'Volumen';
                volSlider.addEventListener('input', (e) => {
                    sound.volume = parseFloat(e.target.value);
                    updateSoundVolume(sound.id, sound.volume);
                });
                volSlider.addEventListener('click', e => e.stopPropagation());
                volumeGroup.appendChild(volSlider);
                actionsBar.appendChild(volumeGroup);

                // Pitch slider group
                const pitchGroup = document.createElement('div');
                pitchGroup.className = 'yt-volume-slider-group';
                pitchGroup.title = 'Tono (Pitch)';
                pitchGroup.innerHTML = '<span style="font-size: 0.65rem; font-weight: bold; color: var(--yt-gray-text); flex-shrink:0;">PITCH</span>';
                
                const pitchSlider = document.createElement('input');
                pitchSlider.type = 'range';
                pitchSlider.className = 'yt-slider';
                pitchSlider.min = '0.5';
                pitchSlider.max = '2.0';
                pitchSlider.step = '0.05';
                pitchSlider.value = sound.pitch || 1.0;
                pitchSlider.addEventListener('input', (e) => {
                    sound.pitch = parseFloat(e.target.value);
                    const activeSource = activeSources[sound.id];
                    if (activeSource && activeSource.source) {
                        activeSource.source.playbackRate.value = sound.pitch;
                    }
                });
                pitchSlider.addEventListener('click', e => e.stopPropagation());
                pitchGroup.appendChild(pitchSlider);
                actionsBar.appendChild(pitchGroup);

                // Pan slider group
                const panGroup = document.createElement('div');
                panGroup.className = 'yt-volume-slider-group';
                panGroup.title = 'Balance (Pan)';
                panGroup.innerHTML = '<span style="font-size: 0.65rem; font-weight: bold; color: var(--yt-gray-text); flex-shrink:0;">PAN</span>';
                
                const panSlider = document.createElement('input');
                panSlider.type = 'range';
                panSlider.className = 'yt-slider';
                panSlider.min = '-1';
                panSlider.max = '1';
                panSlider.step = '0.1';
                panSlider.value = sound.pan || 0;
                panSlider.addEventListener('input', (e) => {
                    sound.pan = parseFloat(e.target.value);
                    const activeSource = activeSources[sound.id];
                    if (activeSource && activeSource.panner) {
                        const context = getAudioContext();
                        activeSource.panner.pan.setTargetAtTime(sound.pan, context.currentTime, 0.015);
                    }
                });
                panSlider.addEventListener('click', e => e.stopPropagation());
                panGroup.appendChild(panSlider);
                actionsBar.appendChild(panGroup);

                textContainer.appendChild(actionsBar);
                cardDetails.appendChild(textContainer);
                soundCard.appendChild(cardDetails);

                soundFeedEl.appendChild(soundCard);

                // Trigger async decoding and update duration
                getDecodedBuffer(sound.audioSourceId).then(buffer => {
                    const dur = (sound.endTime || buffer.duration) - sound.startTime;
                    durationBadge.innerText = formatTime(dur);
                }).catch(err => {
                    console.error("Error cargando sonido", err);
                    durationBadge.innerText = 'ERROR';
                    soundCard.classList.add('is-error');
                });
            });
        }

        // Playback logic
        async function togglePlay(sound) {
            const context = getAudioContext();
            if (context.state === 'suspended') {
                await context.resume();
            }

            const activeSource = activeSources[sound.id];
            if (activeSource) {
                if (activeSource.isPlaying) {
                    pauseSound(sound.id);
                } else {
                    resumeSound(sound);
                }
            } else {
                playSound(sound);
            }
        }

        function toggleSolo(soundId) {
            if (activeSoloSoundId === soundId) {
                activeSoloSoundId = null;
            } else {
                activeSoloSoundId = soundId;
            }
            
            // Re-render buttons active states
            BOARD_DATA.sounds.forEach(sound => {
                const btn = document.getElementById('solo-btn-' + sound.id);
                if (btn) btn.classList.toggle('is-active', activeSoloSoundId === sound.id);
            });

            // Set volumes
            BOARD_DATA.sounds.forEach(sound => {
                updateSoundVolume(sound.id, sound.volume);
            });
        }

        function updateSoundVolume(soundId, baseVolume) {
            const isDimmed = activeSoloSoundId && activeSoloSoundId !== soundId;
            const targetVolume = isDimmed ? 0 : baseVolume;
            const activeSource = activeSources[soundId];
            if (activeSource && activeSource.gainNode) {
                const context = getAudioContext();
                activeSource.gainNode.gain.setTargetAtTime(targetVolume, context.currentTime, 0.015);
            }
        }

        async function playSound(sound) {
            stopSound(sound.id); // Stop previous if any
            
            const card = document.getElementById('card-' + sound.id);
            if (card) {
                card.classList.add('is-playing');
                card.classList.remove('is-paused');
            }

            const playBtn = card?.querySelector('.play-btn-circle');
            if (playBtn) playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

            sound.playCount = (sound.playCount || 0) + 1;
            const meta = document.getElementById('meta-' + sound.id);
            if (meta) meta.innerText = 'Reproducido ' + sound.playCount + ' veces' + (sound.retriggerable ? ' • Poly' : '');

            try {
                const buffer = await getDecodedBuffer(sound.audioSourceId);
                const context = getAudioContext();
                
                const source = context.createBufferSource();
                source.buffer = buffer;
                source.playbackRate.value = sound.pitch;
                source.loop = sound.loop && sound.crossfade <= 0;
                
                if (source.loop) {
                    source.loopStart = sound.startTime || 0;
                    source.loopEnd = sound.endTime || buffer.duration;
                }

                const gainNode = context.createGain();
                
                // Volume routing with solo check
                const isDimmed = activeSoloSoundId && activeSoloSoundId !== sound.id;
                const initialVol = isDimmed ? 0 : sound.volume;

                gainNode.gain.setValueAtTime(0, context.currentTime);
                gainNode.gain.linearRampToValueAtTime(initialVol, context.currentTime + sound.fadeIn);

                const panner = context.createStereoPanner();
                panner.pan.value = sound.pan;

                source.connect(gainNode).connect(panner).connect(masterGainNode);

                const soundStartTime = sound.startTime || 0;
                const soundEndTime = sound.endTime || buffer.duration;
                const durationToPlay = soundEndTime - soundStartTime;

                source.start(0, soundStartTime, sound.loop && sound.crossfade <= 0 ? undefined : durationToPlay);

                const playObj = {
                    source,
                    gainNode,
                    panner,
                    isPlaying: true,
                    startTime: context.currentTime,
                    offset: soundStartTime,
                    duration: durationToPlay,
                    timerId: null,
                    animationFrameId: null
                };

                activeSources[sound.id] = playObj;

                // End callback
                source.onended = () => {
                    if (activeSources[sound.id]?.source === source) {
                        if (sound.loop && sound.crossfade > 0) {
                            // Loop handles separately
                        } else {
                            cleanupPlayback(sound.id);
                        }
                    }
                };

                // Track Progress
                function updateProgress() {
                    const obj = activeSources[sound.id];
                    if (!obj || !obj.isPlaying) return;

                    const elapsed = (context.currentTime - obj.startTime) * sound.pitch;
                    const curTime = obj.offset + elapsed;
                    const pct = (curTime / (soundEndTime || buffer.duration)) * 100;
                    
                    const progressEl = document.getElementById('progress-' + sound.id);
                    if (progressEl) progressEl.style.width = Math.min(pct, 100) + '%';
                    
                    const durationBadge = document.getElementById('duration-' + sound.id);
                    if (durationBadge) durationBadge.innerText = formatTime(Math.min(curTime, soundEndTime)) + ' / ' + formatTime(durationToPlay);

                    obj.animationFrameId = requestAnimationFrame(updateProgress);
                }
                updateProgress();

            } catch (err) {
                console.error(err);
                cleanupPlayback(sound.id);
            }
        }

        function pauseSound(soundId) {
            const obj = activeSources[soundId];
            if (obj && obj.isPlaying) {
                const context = getAudioContext();
                obj.isPlaying = false;
                
                const elapsed = (context.currentTime - obj.startTime) * BOARD_DATA.sounds.find(s => s.id === soundId).pitch;
                obj.offset += elapsed;
                
                try {
                    obj.source.stop();
                } catch(e) {}
                
                if (obj.animationFrameId) cancelAnimationFrame(obj.animationFrameId);

                const card = document.getElementById('card-' + soundId);
                if (card) {
                    card.classList.remove('is-playing');
                    card.classList.add('is-paused');
                }
                const playBtn = card?.querySelector('.play-btn-circle');
                if (playBtn) playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
            }
        }

        function resumeSound(sound) {
            const obj = activeSources[sound.id];
            if (obj && !obj.isPlaying) {
                playSound({
                    ...sound,
                    startTime: obj.offset
                });
            }
        }

        function stopSound(soundId) {
            cleanupPlayback(soundId);
        }

        function fadeOutSound(soundId) {
            const obj = activeSources[soundId];
            const sound = BOARD_DATA.sounds.find(s => s.id === soundId);
            if (obj && obj.isPlaying && sound) {
                const context = getAudioContext();
                obj.gainNode.gain.cancelScheduledValues(context.currentTime);
                obj.gainNode.gain.setValueAtTime(obj.gainNode.gain.value, context.currentTime);
                obj.gainNode.gain.linearRampToValueAtTime(0, context.currentTime + sound.fadeOut);
                
                setTimeout(() => {
                    stopSound(soundId);
                }, sound.fadeOut * 1000);
            }
        }

        function seekTo(soundId, newTime) {
            const sound = BOARD_DATA.sounds.find(s => s.id === soundId);
            if (!sound) return;
            
            getDecodedBuffer(sound.audioSourceId).then(buffer => {
                const soundStartTime = sound.startTime || 0;
                const soundEndTime = sound.endTime || buffer.duration;
                const clamped = Math.max(soundStartTime, Math.min(newTime, soundEndTime));
                
                const activeSource = activeSources[soundId];
                const wasPlaying = activeSource && activeSource.isPlaying;
                
                stopSound(soundId);
                
                if (wasPlaying) {
                    playSound({
                        ...sound,
                        startTime: clamped
                    });
                } else {
                    // Update progress UI
                    const pct = (clamped / soundEndTime) * 100;
                    const progressEl = document.getElementById('progress-' + soundId);
                    if (progressEl) progressEl.style.width = pct + '%';
                    
                    const durationBadge = document.getElementById('duration-' + soundId);
                    if (durationBadge) {
                        const dur = soundEndTime - soundStartTime;
                        durationBadge.innerText = formatTime(clamped) + ' / ' + formatTime(dur);
                    }
                    
                    activeSources[soundId] = {
                        isPlaying: false,
                        offset: clamped,
                        startTime: 0,
                        duration: soundEndTime - soundStartTime
                    };
                    
                    const card = document.getElementById('card-' + soundId);
                    if (card) {
                        card.classList.add('is-paused');
                    }
                }
            });
        }

        function seekRelative(soundId, seconds) {
            const activeSource = activeSources[soundId];
            const sound = BOARD_DATA.sounds.find(s => s.id === soundId);
            if (!sound) return;

            getDecodedBuffer(sound.audioSourceId).then(buffer => {
                const soundStartTime = sound.startTime || 0;
                const soundEndTime = sound.endTime || buffer.duration;
                
                let currentOffset = soundStartTime;
                if (activeSource) {
                    currentOffset = activeSource.offset;
                    if (activeSource.isPlaying) {
                        currentOffset += (getAudioContext().currentTime - activeSource.startTime) * sound.pitch;
                    }
                }
                
                seekTo(soundId, currentOffset + seconds);
            });
        }

        function showDoubleTapRipple(soundId, isRight) {
            const card = document.getElementById('card-' + soundId);
            if (!card) return;
            const container = card.querySelector('.thumbnail-container');
            if (!container) return;

            const ripple = document.createElement('div');
            ripple.className = 'double-tap-ripple';
            ripple.style.position = 'absolute';
            ripple.style.top = '0';
            ripple.style.bottom = '0';
            ripple.style.width = '50%';
            ripple.style.background = 'rgba(255, 255, 255, 0.15)';
            ripple.style.zIndex = '4';
            ripple.style.display = 'flex';
            ripple.style.flexDirection = 'column';
            ripple.style.alignItems = 'center';
            ripple.style.justifyContent = 'center';
            ripple.style.pointerEvents = 'none';
            ripple.style.opacity = '1';
            ripple.style.transition = 'opacity 0.4s ease-out';
            
            if (isRight) {
                ripple.style.right = '0';
                ripple.style.borderRadius = '0 12px 12px 0';
                ripple.innerHTML = '<span style="font-size: 1.5rem; font-weight: bold;">▶▶</span><span style="font-size: 0.75rem; font-weight: bold;">5s</span>';
            } else {
                ripple.style.left = '0';
                ripple.style.borderRadius = '12px 0 0 12px';
                ripple.innerHTML = '<span style="font-size: 1.5rem; font-weight: bold;">◀◀</span><span style="font-size: 0.75rem; font-weight: bold;">5s</span>';
            }

            container.appendChild(ripple);
            
            setTimeout(() => {
                ripple.style.opacity = '0';
            }, 50);
            
            setTimeout(() => {
                ripple.remove();
            }, 400);
        }

        function cleanupPlayback(soundId) {
            const obj = activeSources[soundId];
            if (obj) {
                try {
                    obj.source.onended = null;
                    obj.source.stop();
                } catch (e) {}
                try {
                    obj.source.disconnect();
                    obj.gainNode.disconnect();
                    obj.panner.disconnect();
                } catch(e) {}
                if (obj.animationFrameId) cancelAnimationFrame(obj.animationFrameId);
                delete activeSources[soundId];
            }

            const card = document.getElementById('card-' + soundId);
            if (card) {
                card.classList.remove('is-playing');
                card.classList.remove('is-paused');
            }
            const playBtn = card?.querySelector('.play-btn-circle');
            if (playBtn) playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

            const progressEl = document.getElementById('progress-' + soundId);
            if (progressEl) progressEl.style.width = '0%';
        }

        // Global Action handlers
        document.getElementById('master-volume').addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            document.getElementById('master-vol-percent').innerText = Math.round(vol * 100) + '%';
            if (masterGainNode) {
                const context = getAudioContext();
                masterGainNode.gain.setTargetAtTime(vol, context.currentTime, 0.015);
            }
        });

        document.getElementById('stop-all-btn').addEventListener('click', () => {
            Object.keys(activeSources).forEach(id => stopSound(id));
        });

        document.getElementById('fade-all-btn').addEventListener('click', () => {
            const context = getAudioContext();
            Object.keys(activeSources).forEach(id => {
                const obj = activeSources[id];
                if (obj && obj.isPlaying) {
                    obj.gainNode.gain.cancelScheduledValues(context.currentTime);
                    obj.gainNode.gain.setValueAtTime(obj.gainNode.gain.value, context.currentTime);
                    obj.gainNode.gain.linearRampToValueAtTime(0, context.currentTime + 5);
                }
            });
            setTimeout(() => {
                Object.keys(activeSources).forEach(id => stopSound(id));
            }, 5000);
        });

        // Search filter
        searchInput.addEventListener('input', (e) => {
            renderSounds(e.target.value);
        });

        // Initial render
        renderSounds();
    </script>
</body>
</html>`;
};

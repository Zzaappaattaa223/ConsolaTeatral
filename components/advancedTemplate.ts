import { Soundboard } from '../types';
import { soundGlowColors, EQ_BANDS } from '../constants';

export const generateProductionHTML = (board: Soundboard, audioData: { [key: string]: string }, masterVolume: number) => {
    
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

    //  Helper to safely encode UTF-8 strings to Base64
    const safeBtoa = `function safeBtoa(str) { return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) { return String.fromCharCode('0x' + p1); })); }`;
    // Helper to safely decode Base64 to UTF-8 strings (client-side)
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
    <title>Show Player: ${board.name}</title>
    <style>
        :root {
            --bg-color: #111827; 
            --surface-color: #1f2937; 
            --border-color: #374151;
            --text-primary: #f9fafb; 
            --text-secondary: #d1d5db; 
            --text-muted: #9ca3af;
            
            --accent-color: #6366f1; 
            --accent-hover: #4f46e5;
            --red-color: #ef4444; 
            --blue-color: #3b82f6;
            --green-color: #22c55e; 
            --orange-color: #f97316;
            
            --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            --col-width: 220px; /* CSS Variable for resizing */
        }
        * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
        html, body { height: 100%; overflow: hidden; }
        body {
            font-family: var(--font-sans); background-color: var(--bg-color); color: var(--text-primary);
            display: flex; flex-direction: column;
            -webkit-tap-highlight-color: transparent;
        }
        
        /* --- HEADER --- */
        header { 
            background-color: var(--surface-color); padding: 0 1rem; border-bottom: 1px solid var(--border-color);
            flex-shrink: 0; z-index: 10; text-align: center; height: 60px; display: flex; align-items: center; justify-content: space-between;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        #board-name { font-size: 1.25rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary); margin: 0; }

        .header-controls { display: flex; align-items: center; gap: 0.5rem; }

        /* --- MAIN CONTENT (PADS) --- */
        main { 
            flex-grow: 1; padding: 1.5rem; overflow-y: auto; -webkit-overflow-scrolling: touch; 
            position: relative;
        }

        /* --- SOUND GRID --- */
        #sound-grid { 
            display: grid; gap: 1rem; 
            grid-template-columns: repeat(auto-fill, minmax(var(--col-width), 1fr)); 
            padding-bottom: 2rem; 
        }
        
        /* PAD DESIGN */
        .sound-pad {
            position: relative; z-index: 1; border-radius: 0.75rem; display: flex; flex-direction: row; height: 220px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); 
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s, border-color 0.25s; 
            border: 2px solid transparent; overflow: hidden;
            touch-action: pan-y; /* Allow vertical scroll but prevent other gestures */
            -webkit-touch-callout: none;
        }
        .sound-pad.is-dragging { opacity: 0.5; border: 2px dashed var(--accent-color); }

        .sound-pad:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 20px -8px rgba(0, 0, 0, 0.5);
        }

        .sound-pad.is-playing { 
            border-color: var(--pad-border-color, var(--accent-color)); 
            box-shadow: 0 10px 25px rgba(0,0,0,0.4), 0 0 15px var(--pad-border-color, var(--accent-color));
            transform: scale(1.02);
            z-index: 10;
        }
        .sound-pad.is-error { border-color: var(--red-color); background: #450a0a; }
        
        .sound-pad-glow { position: absolute; inset: 0; pointer-events: none; transition: box-shadow 0.15s ease-out; z-index: 2; }
        .progress-overlay { position: absolute; inset: 0; background-color: rgba(255,255,255,0.08); z-index: 1; width: 0%; pointer-events:none; transition: width 0.1s linear; }
        
        /* Play indicator arrows inside playing card */
        .play-indicator {
            display: none;
            position: absolute;
            bottom: 30%;
            left: 12px;
            right: 72px; /* Avoid overlay with volume slider */
            height: 16px;
            box-sizing: border-box;
            align-items: center;
            gap: 4px;
            z-index: 4;
            pointer-events: none;
        }
        .sound-pad.is-playing .play-indicator,
        .sound-pad.is-paused .play-indicator {
            display: flex;
        }
        .play-arrow {
            width: 0; 
            height: 0; 
            border-top: 5px solid transparent;
            border-bottom: 5px solid transparent;
            border-left: 8px solid currentColor;
            opacity: 0.2;
        }
        .sound-pad.is-playing .play-arrow {
            animation: arrow-flow 1s infinite;
        }
        .sound-pad.is-playing .play-arrow:nth-child(1) { animation-delay: 0s; }
        .sound-pad.is-playing .play-arrow:nth-child(2) { animation-delay: 0.15s; }
        .sound-pad.is-playing .play-arrow:nth-child(3) { animation-delay: 0.3s; }
        .sound-pad.is-paused .play-arrow {
            opacity: 0.6;
        }
        @keyframes arrow-flow {
            0%, 100% { opacity: 0.1; }
            30% { opacity: 1; }
        }
        
        /* LEFT SIDE: CONTENT */
        .pad-content { 
            display: flex; flex-direction: column; justify-content: space-between; flex-grow: 1; 
            padding: 0.75rem; z-index: 5; min-width: 0;
        }
        
        /* TITLE BOX */
        .pad-title-box {
            background-color: #111827; /* Dark Gray/Black */
            border-radius: 0.5rem;
            padding: 0.5rem;
            border: 1px solid rgba(255,255,255,0.1);
            display: flex; align-items: center; justify-content: center;
            min-height: 3.5rem;
            width: 100%;
            z-index: 50; /* Ensure title is on top */
            position: relative;
        }
        
        .pad-name { 
            font-size: 1rem; font-weight: 700; line-height: 1.2; 
            display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
            text-shadow: 0 1px 3px rgba(0,0,0,0.9); color: white;
            word-break: break-word; text-align: center;
        }
        
        /* PLAY BUTTON AREA */
        .pad-body { flex-grow: 1; display: flex; align-items: center; justify-content: center; }
        .play-icon { 
            width: 4.5rem; height: 4.5rem; 
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.6)); 
            color: rgba(255,255,255,0.9); 
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
            cursor: pointer; 
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .sound-pad:hover .play-icon { 
            transform: scale(1.12); 
            color: #ffffff;
            filter: drop-shadow(0 0 12px var(--pad-border-color, var(--accent-color))); 
        }
        .sound-pad.is-playing .play-icon {
            transform: scale(1.05);
            animation: bounce-slow 1.5s infinite alternate ease-in-out;
        }
        @keyframes bounce-slow {
            0% { transform: scale(1.02); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4)); }
            100% { transform: scale(1.1); filter: drop-shadow(0 0 15px var(--pad-border-color, var(--accent-color))); }
        }
        
        /* FOOTER SECTION */
        .pad-footer { display: flex; flex-direction: column; gap: 0.5rem; position: relative; }
        
        /* Controls Row */
        .pad-actions-row { 
            display: flex; justify-content: center; gap: 6px;
        }
        
        .pad-mini-btn {
            width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.6); border-radius: 8px; color: #d1d5db; border: 1px solid rgba(255,255,255,0.15); cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative; overflow: hidden;
            font-size: 0.85rem;
        }
        .pad-mini-btn::after {
            content: ''; position: absolute; inset: 0; background-color: rgba(255,255,255,0.1); opacity: 0; transition: opacity 0.2s;
        }
        .pad-mini-btn:hover { background: rgba(255,255,255,0.15); color: white; transform: scale(1.1); border-color: rgba(255,255,255,0.4); }
        .pad-mini-btn:hover::after { opacity: 1; }
        .pad-mini-btn:active { background: rgba(0,0,0,0.8); transform: scale(0.9); }
        
        .pad-mini-btn.active { 
            background: var(--accent-color) !important; 
            color: white !important; 
            border-color: white !important; 
            box-shadow: 0 0 10px var(--accent-color); 
            font-weight: bold;
            transform: scale(1.08);
        }
        .pad-mini-btn.active:hover {
            background: var(--accent-color) !important;
            opacity: 0.9;
        }
        .pad-mini-btn.fading { 
            animation: pulse-blue 1s infinite alternate; 
            background: var(--blue-color) !important; 
            color: white !important; 
            border-color: #60a5fa !important;
            box-shadow: 0 0 12px var(--blue-color);
        }
        
        @keyframes pulse-blue {
            0% { transform: scale(1); box-shadow: 0 0 4px var(--blue-color); }
            100% { transform: scale(1.1); box-shadow: 0 0 12px var(--blue-color); opacity: 0.9; }
        }
        .pad-mini-btn svg { width: 18px; height: 18px; pointer-events: none; }

        /* Loop Button (Pill Style High Contrast) */
        .loop-btn { 
            display: flex; align-items: center; justify-content: center;
            height: 34px; padding: 0 14px;
            background-color: rgba(0,0,0,0.6); 
            border-radius: 9999px;
            color: rgba(255,255,255,0.65);
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); 
            border: 1px solid rgba(255,255,255,0.15);
            cursor: pointer;
            font-size: 0.85rem;
        }
        .loop-btn:hover { 
            background-color: rgba(255,255,255,0.1); 
            color: white; 
            transform: scale(1.08); 
            border-color: rgba(255,255,255,0.3);
        }
        .loop-btn.is-active { 
            background-color: #22c55e !important; 
            color: #ffffff !important;
            border-color: #4ade80;
            box-shadow: 0 0 12px rgba(34, 197, 94, 0.6);
            font-weight: 800;
            transform: scale(1.08) rotate(360deg);
        }
        .loop-btn.is-active:hover {
            background-color: #16a34a !important;
        }
        .loop-btn svg { width: 16px; height: 16px; pointer-events: none; margin-right: 0; }

        /* Time Display */
        .time-display { 
            display: flex; justify-content: space-between; align-items: center;
            font-size: 0.8rem; font-family: var(--font-mono); color: rgba(255,255,255,0.9);
            background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 4px;
        }
        
        .play-counter {
            position: absolute; bottom: -22px; right: 0; font-size: 0.65rem; 
            color: rgba(255,255,255,0.4); font-family: var(--font-mono); pointer-events: none;
        }

        /* RIGHT SIDE: VERTICAL VOLUME SLIDER - ROTATED METHOD FOR EXACT MATCH */
        .volume-slider-container {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: 0.75rem 0.25rem; background-color: rgba(0,0,0,0.3); width: 60px; flex-shrink: 0;
            border-left: 1px solid rgba(255,255,255,0.1);
            position: relative;
        }
        
        /* The slider itself - Rotated -90deg to become vertical */
        input[type=range].vertical-slider {
            -webkit-appearance: none; appearance: none;
            width: 160px; /* Length becomes height when rotated */
            height: 8px;  /* Track thickness */
            background: #4b5563; /* Gray 600 - Exact match */
            border-radius: 4px; 
            outline: none; 
            cursor: pointer;
            margin: 0;
            
            /* Rotation Logic */
            transform: rotate(-90deg);
            /* No need for margin adjustments usually if flex container centers it */
        }

        input[type=range].vertical-slider::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none; 
            
            /* FADER HANDLE DESIGN */
            width: 16px;  /* Visual Height of Handle */
            height: 40px; /* Visual Width of Handle (T-Bar style) */
            
            background: #818cf8; /* Indigo */
            border-radius: 4px; /* Slightly rounded corners */
            border: 2px solid #111827; /* Dark contrast border */
            box-shadow: 0 2px 5px rgba(0,0,0,0.5); 
            
            /* Centering Logic: (TrackHeight 8px - ThumbHeight 40px) / 2 = -16px */
            margin-top: -16px; 
            cursor: grab;
        }
        
        /* Firefox support */
        input[type=range].vertical-slider::-moz-range-thumb {
            width: 16px; height: 40px;
            background: #818cf8; border: 2px solid #111827; border-radius: 4px; cursor: grab;
        }

        /* Header Resize Slider */
        input[type=range].resize-slider {
            -webkit-appearance: none; width: 100px; height: 4px; background: #4b5563; border-radius: 2px; outline: none;
        }
        input[type=range].resize-slider::-webkit-slider-thumb {
            -webkit-appearance: none; width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%; cursor: pointer;
        }


        /* --- FOOTER (GLOBAL CONTROLS) --- */
        footer.global-controls {
            background-color: var(--surface-color);
            border-top: 1px solid var(--border-color);
            flex-shrink: 0;
            z-index: 50;
            display: grid;
            grid-template-columns: 1fr auto; 
            align-items: center;
            padding: 0.75rem 1.5rem;
            gap: 1.5rem;
            padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
            height: auto;
            min-height: 80px;
            box-shadow: 0 -4px 12px rgba(0,0,0,0.4);
        }

        /* Volume Section */
        .fader-container {
            display: flex;
            align-items: center;
            gap: 1rem;
            background: #111827; 
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            border: 1px solid var(--border-color);
            flex-grow: 1;
            height: 50px;
        }
        
        .fader-icon { color: var(--text-secondary); display: flex; align-items: center; flex-shrink: 0; }
        
        input[type=range].master-fader { 
            -webkit-appearance: none; appearance: none; 
            flex-grow: 1; 
            height: 8px; 
            background: #374151; border-radius: 4px; outline: none; cursor: pointer;
        }
        input[type=range].master-fader::-webkit-slider-thumb { 
            -webkit-appearance: none; appearance: none; 
            width: 24px; height: 24px; 
            background: var(--accent-color); 
            border-radius: 50%; 
            border: 2px solid white; 
            box-shadow: 0 1px 3px rgba(0,0,0,0.5);
            transition: transform 0.1s;
        }
        input[type=range].master-fader::-webkit-slider-thumb:hover { transform: scale(1.1); }
        
        #master-volume-percentage { 
            font-family: var(--font-mono); font-size: 0.9rem; font-weight: bold; 
            color: var(--text-primary); width: 3ch; text-align: right; flex-shrink: 0;
        }

        /* Hardware Buttons */
        .controls-row {
            display: flex; justify-content: flex-end; align-items: center; gap: 0.75rem;
        }

        .hw-btn {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            background: linear-gradient(180deg, #374151 0%, #1f2937 100%);
            border: 1px solid #4b5563;
            border-bottom-width: 3px;
            border-radius: 6px;
            color: #e5e7eb;
            transition: all 0.1s;
            cursor: pointer;
            height: 50px; min-width: 60px;
            padding: 0 12px;
        }
        .hw-btn:active {
            transform: translateY(2px);
            border-bottom-width: 1px;
            background: #1f2937;
        }
        .hw-btn svg { width: 24px; height: 24px; margin-bottom: 2px; }
        .hw-btn span { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .hw-btn.active-state {
            background: #1f2937;
            border-color: var(--accent-color);
            color: var(--accent-color);
            box-shadow: inset 0 0 10px rgba(99, 102, 241, 0.2);
            border-bottom-width: 1px;
            transform: translateY(2px);
        }
        
        .hw-btn-red { color: #fca5a5; border-color: #7f1d1d; }
        .hw-btn-red:hover { background: linear-gradient(180deg, #7f1d1d 0%, #450a0a 100%); }
        .hw-btn-red:active { background: #450a0a; border-color: #ef4444; color: #ef4444; }

        /* Split Button for Fade */
        .fade-wrapper {
            display: flex;
            background: linear-gradient(180deg, #374151 0%, #1f2937 100%);
            border: 1px solid #4b5563;
            border-bottom-width: 3px;
            border-radius: 6px;
            height: 50px;
            overflow: hidden;
        }
        .fade-trigger {
            background: transparent; border: none; border-right: 1px solid #111827;
            color: var(--blue-color); cursor: pointer; padding: 0 12px;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            min-width: 50px;
            transition: background 0.1s;
        }
        .fade-trigger:hover { background: rgba(255,255,255,0.05); }
        .fade-trigger:active { background: rgba(0,0,0,0.2); transform: translateY(1px); }
        .fade-trigger span { font-size: 10px; font-weight: 700; text-transform: uppercase; margin-top: 2px; letter-spacing: 1px; }
        .fade-trigger svg { width: 20px; height: 20px; }

        .fade-select-container {
            position: relative; width: 30px; background: rgba(0,0,0,0.2);
            display: flex; align-items: center; justify-content: center;
            border-left: 1px solid rgba(255,255,255,0.05);
        }
        .fade-select-container:hover { background: rgba(255,255,255,0.05); }
        .fade-select-container select {
            position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
        }
        .fade-val { font-size: 10px; font-weight: bold; color: #9ca3af; pointer-events: none; }

        /* --- RESPONSIVE --- */
        @media (max-width: 640px) {
            header { height: auto; flex-direction: row; justify-content: space-between; padding: 0.5rem 1rem; }
            #sound-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.5rem; }
            .sound-pad { height: 180px; }
            .pad-content { padding: 0.5rem; }
            .play-icon { width: 3rem; height: 3rem; }
            footer.global-controls { grid-template-columns: 1fr; height: auto; gap: 1rem; padding: 0.75rem; }
            .controls-row { justify-content: space-between; width: 100%; }
            .hw-btn { flex-grow: 1; }
            .fade-wrapper { flex-grow: 1; }
            .fade-trigger { flex-grow: 1; }
        }

        /* --- MODALS --- */
        .modal-backdrop { position: fixed; inset: 0; background-color: rgba(0, 0, 0, 0.85); display: flex; align-items: center; justify-content: center; z-index: 100; opacity: 0; pointer-events: none; transition: opacity 0.2s; backdrop-filter: blur(4px); }
        .modal-backdrop.visible { opacity: 1; pointer-events: auto; }
        .modal-content { background-color: var(--surface-color); border-radius: 0.75rem; padding: 1.5rem; width: 95%; max-width: 500px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); border: 1px solid var(--border-color); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; }
        .modal-header h2 { font-size: 1.25rem; font-weight: bold; margin: 0; color: white; }
        
        .eq-toggle { position: relative; display: inline-flex; height: 1.5rem; width: 2.75rem; align-items: center; border-radius: 9999px; background-color: var(--border-color); border: none; cursor: pointer; }
        .eq-toggle[aria-checked="true"] { background-color: var(--orange-color); }
        .eq-toggle-thumb { display: inline-block; width: 1.25rem; height: 1.25rem; transform: translateX(0.125rem); background-color: white; border-radius: 50%; transition: transform 0.2s; }
        .eq-toggle[aria-checked="true"] .eq-toggle-thumb { transform: translateX(1.375rem); }
        
        .eq-bands-container { display: flex; justify-content: space-between; height: 180px; gap: 4px; margin-top: 1rem; }
        .eq-band { display: flex; flex-direction: column; align-items: center; flex: 1; }
        .eq-band-val { font-size: 8px; font-weight: bold; color: #9ca3af; margin-bottom: 2px; }
        .eq-track-custom {
            position: relative;
            width: 32px;
            height: 130px;
            background: #030712;
            border: 1px solid #374151;
            border-radius: 4px;
            overflow: hidden;
            display: flex;
            justify-content: center;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.8);
        }
        .eq-zero-line {
            position: absolute;
            top: 50%;
            left: 0;
            right: 0;
            height: 1px;
            background: rgba(255, 255, 255, 0.15);
            z-index: 1;
        }
        .eq-fill-bar {
            position: absolute;
            left: 0;
            right: 0;
            z-index: 1;
        }
        .eq-slider-input {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            opacity: 0;
            cursor: ns-resize;
            z-index: 3;
            -webkit-appearance: slider-vertical;
            writing-mode: bt-lr;
        }
        .eq-slider-cap {
            position: absolute;
            left: 2px;
            right: 2px;
            height: 16px;
            background: linear-gradient(to right, #e5e7eb, #9ca3af, #4b5563);
            border: 1px solid #f3f4f6;
            border-radius: 3px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2;
            pointer-events: none;
        }
        .eq-cap-line {
            width: 100%;
            height: 2px;
            background: rgba(0, 0, 0, 0.4);
        }
        .eq-freq { font-size: 0.6rem; color: var(--text-secondary); margin-top: 4px; text-align: center; font-weight: bold; }
        
        /* Rearrange Mode */
        .rearrange-btn {
            background: transparent; border: 1px solid var(--border-color); color: var(--text-secondary);
            padding: 0.25rem; border-radius: 0.25rem; cursor: pointer; display: flex; align-items: center;
        }
        .rearrange-btn.active { background: var(--green-color); color: white; border-color: transparent; }
        .rearrange-overlay {
            position: absolute; inset: 0; background-color: rgba(0,0,0,0.5); z-index: 40;
            display: none; align-items: center; justify-content: center; backdrop-filter: blur(2px);
            cursor: move;
        }
        .rearrange-overlay svg { width: 3rem; height: 3rem; color: rgba(255,255,255,0.8); }
        .rearrange-mode .rearrange-overlay { display: flex; }
        /* Disable interactions inside pad but keep name readable */
        .rearrange-mode .sound-pad > *:not(.rearrange-overlay):not(.pad-content) { pointer-events: none; }
        .rearrange-mode .pad-content > *:not(.pad-title-box) { pointer-events: none; opacity: 0.5; }
        .rearrange-mode .pad-title-box { pointer-events: auto; z-index: 50; }
        .rearrange-mode .volume-slider-container { pointer-events: none; opacity: 0.5; }

        /* Hidden/Archived Sound Pads */
        .sound-pad.is-hidden {
            opacity: 0.55;
            border: 2px dashed rgba(245, 158, 11, 0.5);
            background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0, 0, 0, 0.15) 10px, rgba(0, 0, 0, 0.15) 20px);
        }
        .archived-badge {
            position: absolute;
            inset: 0;
            background-color: rgba(3, 7, 18, 0.65);
            backdrop-filter: blur(1px);
            -webkit-backdrop-filter: blur(1px);
            pointer-events: none;
            z-index: 25;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .archived-badge span {
            font-size: 10px;
            text-transform: uppercase;
            font-weight: 900;
            letter-spacing: 0.1em;
            background-color: #d97706;
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.5);
            border: 1px solid rgba(251, 191, 36, 0.4);
        }

        /* Compact & Ultra-Compact Adjustments */
        .sound-pad.is-compact .volume-slider-container {
            display: none !important;
        }
        .sound-pad.is-compact .play-indicator {
            right: 12px;
        }
        .sound-pad.is-compact .pad-content {
            padding: 0.5rem;
        }
        .sound-pad.is-compact .pad-title-box {
            min-height: 2.75rem;
            padding: 0.25rem;
        }
        .sound-pad.is-compact .pad-name {
            font-size: 0.85rem;
        }
        .sound-pad.is-compact .play-icon {
            width: 3rem; height: 3rem;
        }
        .sound-pad.is-compact .pad-actions-row {
            scale: 0.9;
            transform-origin: bottom center;
            gap: 4px;
        }
        .sound-pad.is-compact .time-display {
            font-size: 0.7rem;
            padding: 2px 4px;
        }
        
        .sound-pad.is-ultra-compact .volume-slider-container {
            display: none !important;
        }
        .sound-pad.is-ultra-compact .pad-content {
            padding: 0.25rem;
        }
        .sound-pad.is-ultra-compact .pad-title-box {
            min-height: 2.2rem;
            padding: 0.15rem;
        }
        .sound-pad.is-ultra-compact .pad-name {
            font-size: 0.75rem;
        }
        .sound-pad.is-ultra-compact .play-icon {
            width: 2.5rem; height: 2.5rem;
        }
        .sound-pad.is-ultra-compact .pad-actions-row {
            display: none !important;
        }
        .sound-pad.is-ultra-compact .time-display {
            font-size: 0.65rem;
            padding: 1px 3px;
        }
        .sound-pad.is-ultra-compact .play-indicator {
            display: none !important;
        }

        /* Instructions Popover/Tooltip in exports */
        .instruction-btn {
            background: rgba(245, 158, 11, 0.2);
            border: 1px solid rgba(245, 158, 11, 0.4);
            color: #f59e0b;
            padding: 2px;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            position: relative;
        }
        .instruction-btn:hover {
            background: rgba(245, 158, 11, 0.35);
            color: #fbbf24;
        }
        .instruction-tooltip {
            position: absolute;
            bottom: 120%;
            right: 0;
            width: 220px;
            background-color: rgba(3, 7, 18, 0.98);
            border: 1px solid rgba(245, 158, 11, 0.5);
            border-radius: 8px;
            padding: 10px;
            box-shadow: 0 10px 25px -5px rgba(0,0,0,0.6);
            z-index: 100;
            font-family: var(--font-sans);
            font-size: 11px;
            color: #fef3c7;
            text-align: left;
            line-height: 1.4;
            white-space: pre-wrap;
            pointer-events: auto;
            display: none;
        }
        .instruction-tooltip.visible {
            display: block;
            animation: tooltip-fade 0.15s ease-out;
        }
        @keyframes tooltip-fade {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        /* Quick Controls Float Menu (Glassmorphism modal) */
        .quick-modal-backdrop {
            position: fixed; inset: 0; background-color: rgba(0, 0, 0, 0.82);
            display: flex; align-items: center; justify-content: center; z-index: 500;
            opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        .quick-modal-backdrop.visible { opacity: 1; pointer-events: auto; }
        .quick-modal-content {
            border-radius: 1rem; padding: 1.5rem; width: 92%; max-width: 420px;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.15);
            backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px);
            position: relative;
            color: white;
        }
        .quick-modal-close {
            position: absolute; top: 1rem; right: 1rem;
            background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
            color: #d1d5db; border-radius: 50%; width: 30px; height: 30px;
            display: flex; align-items: center; justify-content: center; cursor: pointer;
            transition: all 0.2s;
        }
        .quick-modal-close:hover { background: rgba(255,255,255,0.1); color: white; transform: scale(1.08); }
        
        .quick-modal-title-box { margin-bottom: 1.25rem; text-align: left; }
        .quick-modal-subtitle { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.6; }
        .quick-modal-title { font-size: 1.2rem; font-weight: 900; truncate: true; margin-top: 2px; text-shadow: 0 2px 4px rgba(0,0,0,0.5); }
        
        .quick-modal-transport {
            display: flex; justify-content: center; align-items: center; gap: 1rem;
            background: rgba(0,0,0,0.35); padding: 1rem; border-radius: 0.75rem;
            border: 1px solid rgba(255,255,255,0.05); margin-bottom: 1.25rem;
        }
        .quick-transport-btn {
            border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; border: none;
        }
        .quick-transport-btn.btn-play {
            width: 52px; height: 52px; background: var(--accent-color); color: white; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }
        .quick-transport-btn.btn-play:hover { transform: scale(1.06); background: var(--accent-hover); }
        .quick-transport-btn.btn-play:active { transform: scale(0.96); }
        .quick-transport-btn.btn-action {
            width: 42px; height: 42px; background: #374151; color: #e5e7eb; border: 1px solid #4b5563;
        }
        .quick-transport-btn.btn-action:hover { background: #4b5563; color: white; transform: scale(1.05); }
        .quick-transport-btn.btn-action.fading {
            background: var(--blue-color); border-color: #60a5fa; color: white; animation: pulse-blue 1s infinite alternate;
        }
        .quick-transport-btn.btn-action:active { transform: scale(0.95); }
        .quick-transport-btn svg { width: 22px; height: 22px; }
        
        .quick-modal-sliders {
            background: rgba(0,0,0,0.25); padding: 1rem; border-radius: 0.75rem;
            border: 1px solid rgba(255,255,255,0.05); margin-bottom: 1.25rem;
            display: flex; flex-direction: column; gap: 1rem; text-align: left;
        }
        .quick-slider-row { display: flex; flex-direction: column; gap: 4px; }
        .quick-slider-header { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; color: #d1d5db; }
        .quick-slider-val { font-family: var(--font-mono); color: #818cf8; }
        input[type=range].quick-slider-input {
            -webkit-appearance: none; appearance: none; width: 100%; height: 6px; background: #4b5563; border-radius: 3px; outline: none;
        }
        input[type=range].quick-slider-input::-webkit-slider-thumb {
            -webkit-appearance: none; width: 20px; height: 20px; background: white; border-radius: 50%; border: 2px solid var(--accent-color); cursor: pointer;
        }

        .quick-modal-instructions {
            background: rgba(245, 158, 11, 0.08); border: 1px dashed rgba(245, 158, 11, 0.25);
            border-radius: 0.75rem; padding: 1rem; text-align: left; max-height: 110px; overflow-y: auto;
        }
        .quick-instructions-hdr { font-size: 10px; font-weight: 800; text-transform: uppercase; tracking-spacing: 0.1em; color: #f59e0b; margin-bottom: 4px; display: block; }
        .quick-instructions-body { font-size: 12px; color: #fef3c7; line-height: 1.4; whitespace: pre-wrap; font-family: var(--font-sans); }
        
    </style>
</head>
<body>
    <div id="loading-overlay" style="position: fixed; inset: 0; background-color: #030712; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 2000; gap: 1rem;">
        <div class="spinner" style="width: 30px; height: 30px; border: 3px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <p style="font-family: monospace;">Cargando...</p>
    </div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>

    <!-- EQ MODAL -->
    <div id="eq-modal" class="modal-backdrop">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Ecualizador</h2>
                <button id="eq-enabled-toggle" role="switch" aria-checked="true" class="eq-toggle"><span class="eq-toggle-thumb"></span></button>
            </div>
            <div id="eq-controls-container">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.8rem; color: var(--text-secondary);">Preamp</span>
                    <span id="preamp-value" style="font-size: 0.8rem; font-weight: bold; color:white;">0.0dB</span>
                </div>
                <input id="eq-preamp" type="range" min="-20" max="20" step="0.5" value="0" style="width: 100%; height: 6px; border-radius: 3px; -webkit-appearance: none; background: var(--border-color); margin-bottom: 1rem;">
                
                <div id="eq-bands-container" class="eq-bands-container">
                    <!-- Bands injected by JS -->
                </div>
            </div>
            <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
                <button id="eq-close-btn" style="background: var(--border-color); padding: 0.5rem 1rem; border-radius: 0.25rem; font-weight: bold; color: white; border: none; cursor: pointer;">Cerrar</button>
            </div>
        </div>
    </div>
    
    <!-- QUICK CONTROLS MODAL -->
    <div id="quick-controls-modal" class="quick-modal-backdrop">
        <div class="quick-modal-content" id="quick-modal-content-div">
            <button class="quick-modal-close" id="quick-close-btn">&times;</button>
            <div class="quick-modal-title-box">
                <span class="quick-modal-subtitle">Consola de Ficha</span>
                <h3 class="quick-modal-title" id="quick-title">Nombre del Sonido</h3>
            </div>
            
            <div class="quick-modal-transport">
                <button class="quick-transport-btn btn-play" id="quick-play-btn"></button>
                <button class="quick-transport-btn btn-action" id="quick-fade-btn"></button>
                <button class="quick-transport-btn btn-action" id="quick-stop-btn"></button>
            </div>
            
            <div class="quick-modal-sliders">
                <div class="quick-slider-row">
                    <div class="quick-slider-header">
                        <span>Volumen</span>
                        <span class="quick-slider-val" id="quick-vol-val">100%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01" class="quick-slider-input" id="quick-vol-slider">
                </div>
                
                <div class="quick-slider-row">
                    <div class="quick-slider-header">
                        <span>Tono (Pitch)</span>
                        <span class="quick-slider-val" id="quick-pitch-val">1.00x</span>
                    </div>
                    <input type="range" min="0.5" max="2.0" step="0.01" class="quick-slider-input" id="quick-pitch-slider">
                </div>

                <div class="quick-slider-row">
                    <div class="quick-slider-header">
                        <span>Balance (Pan)</span>
                        <span class="quick-slider-val" id="quick-pan-val">0.00</span>
                    </div>
                    <input type="range" min="-1" max="1" step="0.01" class="quick-slider-input" id="quick-pan-slider">
                </div>
            </div>
            
            <div class="quick-modal-instructions" id="quick-instructions-box">
                <span class="quick-instructions-hdr">Instrucciones de Operación</span>
                <p class="quick-instructions-body" id="quick-instructions">Sin indicaciones cargadas.</p>
            </div>
        </div>
    </div>

    <header>
        <h1 id="board-name"></h1>
        <div class="header-controls">
            <button id="show-archived-btn" class="rearrange-btn" title="Mostrar Archivados">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
            </button>
            <button id="rearrange-btn" class="rearrange-btn" title="Modo Organización">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M15.97 2.47a.75.75 0 011.06 0l2.25 2.25a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 11-1.06-1.06l.97-.97H12.75a.75.75 0 010-1.5h4.19l-.97-.97a.75.75 0 010-1.06zm-7.94 0a.75.75 0 010 1.06l-.97.97h4.19a.75.75 0 010 1.5H7.06l.97.97a.75.75 0 01-1.06 1.06l-2.25-2.25a.75.75 0 010-1.06l2.25-2.25a.75.75 0 011.06 0zm13.5 13.5a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 111.06-1.06l.97-.97v-4.19a.75.75 0 011.5 0v4.19l.97-.97a.75.75 0 011.06 0zm-13.5 0a.75.75 0 011.06 0l.97.97v-4.19a.75.75 0 011.5 0v4.19l.97-.97a.75.75 0 111.06 1.06l-2.25 2.25a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 010-1.06z" clip-rule="evenodd" /></svg>
            </button>
            <div style="width: 1px; height: 24px; background: var(--border-color); margin: 0 8px;"></div>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M3 3a1 1 0 00-1 1v8a1 1 0 001 1h10a1 1 0 001-1V4a1 1 0 00-1-1H3zm12 11H1V2h14v12z"/></svg>
            <input type="range" class="resize-slider" min="120" max="480" value="220" title="Tamaño de los pads">
        </div>
    </header>
    
    <main id="main-scroll-area"><div id="sound-grid"></div></main>
    
    <footer class="global-controls">
        <div class="fader-container">
            <div class="fader-icon" title="Volumen Maestro">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="24" height="24"><path fill-rule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 01.09-.083zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
            </div>
            <input type="range" id="master-volume" class="master-fader" min="0" max="1" step="0.01">
            <span id="master-volume-percentage">100</span>
        </div>
        
        <div class="controls-row">
            <button id="eq-btn" class="hw-btn" title="Ecualizador Global">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 19V5h4v14H4zm6 0V5h4v14h-4zm6 0V5h4v14h-4z"/></svg>
                <span>EQ</span>
            </button>
            
            <div class="fade-wrapper">
                <button id="fade-trigger-btn" class="fade-trigger" title="Desvanecer Todos">
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M3 17a1 1 0 01-1-1V4a1 1 0 011-1h2a1 1 0 01-1 1H3zm6-1a1 1 0 001-1v-8a1 1 0 00-1-1H8a1 1 0 00-1 1v8a1 1 0 001 1h2zm6-1a1 1 0 001-1v-4a1 1 0 00-1-1h-2a1 1 0 00-1 1v4a1 1 0 001 1h2z"/></svg>
                     <span>Fade</span>
                </button>
                <div class="fade-select-container">
                    <div class="fade-val" id="fade-time-display">5s</div>
                    <select id="fade-time-select">
                        <option value="1">1s</option>
                        <option value="3">3s</option>
                        <option value="5" selected>5s</option>
                        <option value="10">10s</option>
                    </select>
                </div>
            </div>

            <button id="stop-all-btn" class="hw-btn hw-btn-red" title="Detener Todos">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>
                <span>Stop</span>
            </button>
        </div>
    </footer>

    <script>
        ${clientSafeAtob}
        const app = {
            config: {
                board: JSON.parse(safeAtob("${encodedBoard}")),
                audioData: ${JSON.stringify(audioDataBase64)},
                initialMasterVolume: ${masterVolume},
                colors: ${JSON.stringify(soundGlowColors)},
                colorStyles: {
                    chakraRed: { background: '#dc2626' }, transitionRedOrange: { background: '#f97316' },
                    chakraOrange: { background: '#f59e0b' }, transitionOrangeYellow: { background: '#facc15' },
                    chakraYellow: { background: '#a3e635' }, transitionYellowGreen: { background: '#22c55e' },
                    chakraGreen: { background: '#10b981' }, transitionGreenBlue: { background: '#14b8a6' },
                    chakraBlue: { background: '#06b6d4' }, transitionBlueIndigo: { background: '#0ea5e9' },
                    chakraIndigo: { background: '#4f46e5' }, transitionIndigoViolet: { background: '#9333ea' },
                    chakraViolet: { background: '#d946ef' }, black: { background: '#1f2937' },
                    gray: { background: '#6b7280' }, white: { background: '#e5e7eb' },
                    splitRedBlue: { background: 'linear-gradient(to bottom right, #dc2626, #0ea5e9)' },
                    splitGreenYellow: { background: 'linear-gradient(to bottom right, #10b981, #facc15)' },
                    splitPurpleOrange: { background: 'linear-gradient(to bottom right, #9333ea, #f97316)' },
                    disabled: { background: '#4b5563' },
                },
                eqBands: [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
                icons: {
                    play: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z"/></svg>',
                    pause: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
                    stop: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>',
                    fadeOut: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M3 17a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3z" /> <path d="M9 17a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9z" /> <path d="M15 17a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2z" />',
                    loop: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
                    move: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M15.97 2.47a.75.75 0 011.06 0l2.25 2.25a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 11-1.06-1.06l.97-.97H12.75a.75.75 0 010-1.5h4.19l-.97-.97a.75.75 0 010-1.06zm-7.94 0a.75.75 0 010 1.06l-.97.97h4.19a.75.75 0 010 1.5H7.06l.97.97a.75.75 0 01-1.06 1.06l-2.25-2.25a.75.75 0 010-1.06l2.25-2.25a.75.75 0 011.06 0zm13.5 13.5a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 111.06-1.06l.97-.97v-4.19a.75.75 0 011.5 0v4.19l.97-.97a.75.75 0 011.06 0zm-13.5 0a.75.75 0 011.06 0l.97.97v-4.19a.75.75 0 011.5 0v4.19l.97-.97a.75.75 0 111.06 1.06l-2.25 2.25a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 010-1.06z" clip-rule="evenodd" /></svg>',
                    eye: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>',
                    eyeOff: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>',
                    sliders: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>',
                    bulb: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.46 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"/></svg>'
                }
            },
            state: {
                audioContext: null, masterGainNode: null, globalPreampNode: null, globalEqNodes: [],
                audioBuffers: {}, playingNodes: {}, domCache: {}, impulseBuffer: null,
                animationFrameId: null, eqIsEnabled: true, isRearrangeMode: false,
                showHiddenSounds: false
            },
            getOrCreateAudioContext() {
                if (!this.state.audioContext || this.state.audioContext.state === 'closed') {
                    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                    if (AudioContextClass) {
                        try {
                           this.state.audioContext = new AudioContextClass();
                        } catch(e) {
                           console.warn("Failed to create AudioContext format", e);
                        }
                    }
                }
                return this.state.audioContext;
            },
            init() {
                document.body.addEventListener("click", () => this.initAudioContext(), { once: true });
                document.getElementById("board-name").textContent = this.config.board.name;
                this.initMasterVolume();
                this.initGlobalActions();
                this.eq.init();
                
                // Immediately render UI in its initial state so the page appears instantly responsive
                try {
                    this.render();
                    this.initDragAndDrop();
                    this.initUI();
                } catch(e) {
                    console.error("Initial render error:", e);
                }

                // Hide loading overlay transitionally as soon as we finish loading, or up to a maximum timeout
                let completed = false;
                const hideLoading = () => {
                    if (completed) return;
                    completed = true;
                    const overlay = document.getElementById("loading-overlay");
                    if (overlay) {
                        overlay.style.transition = 'opacity 0.3s ease';
                        overlay.style.opacity = '0';
                        setTimeout(() => { if(overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
                    }
                };

                // Triggers async preload of audio in background, which handles decoding gracefully
                this.preloadAudio().then(() => {
                    try {
                        this.render(); // Re-render once audios decode to show correct durations
                    } catch(e) {}
                    hideLoading();
                }).catch(err => {
                    console.error("Audio preloading error:", err);
                    hideLoading();
                });

                // Fail-safe path: force hide overlay after 1.5s if browser background decode stalls
                setTimeout(hideLoading, 1500);
            },
            initUI() {
                const slider = document.querySelector('.resize-slider');
                const root = document.documentElement;
                if(slider) {
                    slider.addEventListener('input', (e) => {
                        root.style.setProperty('--col-width', e.target.value + 'px');
                        this.render(); // Re-render to update compact/ultra-compact layout states in real time
                    });
                }
                
                const rearrangeBtn = document.getElementById('rearrange-btn');
                rearrangeBtn.addEventListener('click', () => {
                    this.state.isRearrangeMode = !this.state.isRearrangeMode;
                    rearrangeBtn.classList.toggle('active', this.state.isRearrangeMode);
                    document.getElementById('sound-grid').classList.toggle('rearrange-mode', this.state.isRearrangeMode);
                });

                const showArchivedBtn = document.getElementById('show-archived-btn');
                if (showArchivedBtn) {
                    showArchivedBtn.addEventListener('click', () => {
                        this.state.showHiddenSounds = !this.state.showHiddenSounds;
                        showArchivedBtn.classList.toggle('active', this.state.showHiddenSounds);
                        this.render();
                    });
                }

                // Close button and backdrop click for quick controls modal
                const quickModal = document.getElementById('quick-controls-modal');
                document.getElementById('quick-close-btn').addEventListener('click', () => {
                    quickModal.classList.remove('visible');
                    this.state.activeQuickSoundId = null;
                });
                quickModal.addEventListener('click', (e) => {
                    if (e.target === quickModal) {
                        quickModal.classList.remove('visible');
                        this.state.activeQuickSoundId = null;
                    }
                });

                // Slider input listeners in the quick controls modal
                const quickVolSlider = document.getElementById('quick-vol-slider');
                const quickVolVal = document.getElementById('quick-vol-val');
                quickVolSlider.addEventListener('input', (e) => {
                    const soundId = this.state.activeQuickSoundId;
                    if (!soundId) return;
                    const val = parseFloat(e.target.value);
                    quickVolVal.textContent = Math.round(val * 100) + '%';
                    
                    const sound = this.config.board.sounds.find(s => s.id === soundId);
                    if (sound) sound.volume = val;
                    
                    const node = this.state.playingNodes[soundId];
                    if (node && node.fadeState !== 'out') node.gainNode.gain.setTargetAtTime(val, this.state.audioContext.currentTime, 0.01);
                    
                    // Update main fader visually if it exists in DOM
                    const cache = this.state.domCache[soundId];
                    if (cache && cache.volumeSlider) cache.volumeSlider.value = val;
                });

                const quickPitchSlider = document.getElementById('quick-pitch-slider');
                const quickPitchVal = document.getElementById('quick-pitch-val');
                quickPitchSlider.addEventListener('input', (e) => {
                    const soundId = this.state.activeQuickSoundId;
                    if (!soundId) return;
                    const val = parseFloat(e.target.value);
                    quickPitchVal.textContent = val.toFixed(2) + 'x';
                    
                    const sound = this.config.board.sounds.find(s => s.id === soundId);
                    if (sound) sound.pitch = val;
                    
                    const node = this.state.playingNodes[soundId];
                    if (node && node.source) node.source.playbackRate.setTargetAtTime(val, this.state.audioContext.currentTime, 0.015);
                });

                const quickPanSlider = document.getElementById('quick-pan-slider');
                const quickPanVal = document.getElementById('quick-pan-val');
                quickPanSlider.addEventListener('input', (e) => {
                    const soundId = this.state.activeQuickSoundId;
                    if (!soundId) return;
                    const val = parseFloat(e.target.value);
                    quickPanVal.textContent = val.toFixed(2);
                    
                    const sound = this.config.board.sounds.find(s => s.id === soundId);
                    if (sound) sound.pan = val;
                    
                    const node = this.state.playingNodes[soundId];
                    if (node && node.panner) node.panner.pan.setTargetAtTime(val, this.state.audioContext.currentTime, 0.015);
                });

                // Quick modal transport controls
                document.getElementById('quick-play-btn').addEventListener('click', () => {
                    const soundId = this.state.activeQuickSoundId;
                    if (!soundId) return;
                    const sound = this.config.board.sounds.find(s => s.id === soundId);
                    if (sound) this.audio.togglePlay(sound);
                });
                document.getElementById('quick-fade-btn').addEventListener('click', () => {
                    const soundId = this.state.activeQuickSoundId;
                    if (!soundId) return;
                    this.audio.toggleFade(soundId);
                });
                document.getElementById('quick-stop-btn').addEventListener('click', () => {
                    const soundId = this.state.activeQuickSoundId;
                    if (!soundId) return;
                    this.audio.stop(soundId, 0.05);
                });

                // Close tooltips when clicking outside
                document.addEventListener('click', (e) => {
                    if (!e.target.closest('.instruction-btn') && !e.target.closest('.instruction-tooltip')) {
                        document.querySelectorAll('.instruction-tooltip').forEach(el => el.classList.remove('visible'));
                    }
                });
            },
            openQuickControls(sound) {
                this.state.activeQuickSoundId = sound.id;
                const modal = document.getElementById('quick-controls-modal');
                const title = document.getElementById('quick-title');
                const volSlider = document.getElementById('quick-vol-slider');
                const volVal = document.getElementById('quick-vol-val');
                const pitchSlider = document.getElementById('quick-pitch-slider');
                const pitchVal = document.getElementById('quick-pitch-val');
                const panSlider = document.getElementById('quick-pan-slider');
                const panVal = document.getElementById('quick-pan-val');
                const instructions = document.getElementById('quick-instructions');
                const contentDiv = document.getElementById('quick-modal-content-div');

                title.textContent = sound.name;
                
                // Volume
                const playingNode = this.state.playingNodes[sound.id];
                const currentVol = (playingNode && playingNode.gainNode) ? playingNode.gainNode.gain.value : sound.volume;
                volSlider.value = currentVol;
                volVal.textContent = Math.round(currentVol * 100) + '%';
                
                // Pitch
                pitchSlider.value = sound.pitch ?? 1.0;
                pitchVal.textContent = (sound.pitch ?? 1.0).toFixed(2) + 'x';
                
                // Pan
                panSlider.value = sound.pan ?? 0;
                panVal.textContent = (sound.pan ?? 0).toFixed(2);
                
                // Instructions
                instructions.textContent = sound.instructions || 'Sin indicaciones cargadas para esta ficha.';

                // Color themes matching pad
                const colorStyle = this.config.colorStyles[sound.color];
                if (contentDiv) {
                    contentDiv.style.background = colorStyle ? colorStyle.background : 'rgba(31, 41, 55, 0.75)';
                    contentDiv.style.borderColor = this.config.colors[sound.color] || '#6366f1';
                }

                // Update transport buttons states in modal
                this.updateQuickTransportUI(sound.id);

                modal.classList.add('visible');
            },
            updateQuickTransportUI(soundId) {
                const playBtn = document.getElementById('quick-play-btn');
                const fadeBtn = document.getElementById('quick-fade-btn');
                const stopBtn = document.getElementById('quick-stop-btn');
                
                const sound = this.config.board.sounds.find(s => s.id === soundId);
                const playingNode = this.state.playingNodes[soundId];
                
                if (playingNode && playingNode.status === 'playing') {
                    playBtn.innerHTML = this.config.icons.pause;
                    fadeBtn.disabled = false;
                    stopBtn.disabled = false;
                } else if (playingNode && playingNode.status === 'paused') {
                    playBtn.innerHTML = this.config.icons.play;
                    fadeBtn.disabled = false;
                    stopBtn.disabled = false;
                } else {
                    playBtn.innerHTML = this.config.icons.play;
                    fadeBtn.disabled = true;
                    stopBtn.disabled = true;
                }

                if (playingNode && playingNode.fadeState === 'out') {
                    fadeBtn.classList.add('fading');
                } else {
                    fadeBtn.classList.remove('fading');
                }
                
                fadeBtn.innerHTML = this.config.icons.fadeOut;
                stopBtn.innerHTML = this.config.icons.stop;
            },
            initResize() {
                const slider = document.querySelector('.resize-slider');
                const root = document.documentElement;
                if(slider) {
                    slider.addEventListener('input', (e) => {
                        root.style.setProperty('--col-width', e.target.value + 'px');
                    });
                }
            },
            initDragAndDrop() {
                const grid = document.getElementById("sound-grid");
                let draggedItem = null;

                // --- MOUSE EVENTS ---
                grid.addEventListener('dragstart', (e) => {
                    if (!this.state.isRearrangeMode) { e.preventDefault(); return; }
                    draggedItem = e.target.closest('.sound-pad');
                    if(draggedItem) {
                        e.dataTransfer.effectAllowed = 'move';
                        setTimeout(() => draggedItem.classList.add('is-dragging'), 0);
                    }
                });

                grid.addEventListener('dragend', () => {
                    if(draggedItem) draggedItem.classList.remove('is-dragging');
                    draggedItem = null;
                });

                grid.addEventListener('dragover', (e) => {
                    e.preventDefault(); 
                    const target = e.target.closest('.sound-pad');
                    if (target && target !== draggedItem && draggedItem && this.state.isRearrangeMode) {
                        const children = Array.from(grid.children);
                        const draggedIndex = children.indexOf(draggedItem);
                        const targetIndex = children.indexOf(target);
                        
                        if (draggedIndex < targetIndex) {
                            grid.insertBefore(draggedItem, target.nextSibling);
                        } else {
                            grid.insertBefore(draggedItem, target);
                        }
                    }
                });

                // --- TOUCH EVENTS ---
                const handleTouchStart = (e) => {
                    if (!this.state.isRearrangeMode) return;
                    
                    const pad = e.target.closest('.sound-pad');
                    if(!pad) return;

                    draggedItem = pad;
                    pad.classList.add('is-dragging');
                    if(navigator.vibrate) navigator.vibrate(50);
                };

                const handleTouchMove = (e) => {
                    if (!draggedItem || !this.state.isRearrangeMode) return;
                    e.preventDefault(); 
                    
                    const touch = e.touches[0];
                    const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.sound-pad');
                    
                    if (target && target !== draggedItem && target.parentElement === grid) {
                        const children = Array.from(grid.children);
                        const draggedIndex = children.indexOf(draggedItem);
                        const targetIndex = children.indexOf(target);
                        
                        if (draggedIndex < targetIndex) {
                            grid.insertBefore(draggedItem, target.nextSibling);
                        } else {
                            grid.insertBefore(draggedItem, target);
                        }
                    }
                };

                const handleTouchEnd = () => {
                    if(draggedItem) {
                        draggedItem.classList.remove('is-dragging');
                        draggedItem = null;
                    }
                };

                grid.addEventListener('touchstart', handleTouchStart, { passive: false });
                grid.addEventListener('touchmove', handleTouchMove, { passive: false });
                grid.addEventListener('touchend', handleTouchEnd);
            },
            initAudioContext() {
                const ac = this.getOrCreateAudioContext();
                if (ac && ac.state === 'suspended') {
                    ac.resume();
                }
                if (ac && !this.state.masterGainNode) {
                    this.generateImpulseBuffer(ac);
                    this.state.masterGainNode = ac.createGain();
                    this.state.masterGainNode.connect(ac.destination);
                    this.state.masterGainNode.gain.value = this.config.initialMasterVolume;

                    this.state.globalPreampNode = ac.createGain();
                    this.state.globalEqNodes = this.config.eqBands.map(freq => {
                        const f = ac.createBiquadFilter();
                        f.type = 'peaking'; f.frequency.value = freq; f.Q.value = 1.41; f.gain.value = 0;
                        return f;
                    });
                    this.state.globalPreampNode.connect(this.state.globalEqNodes[0]);
                    for(let i=0; i < this.state.globalEqNodes.length - 1; i++) this.state.globalEqNodes[i].connect(this.state.globalEqNodes[i+1]);
                    this.state.globalEqNodes[this.state.globalEqNodes.length - 1].connect(this.state.masterGainNode);
                }
            },
            async generateImpulseBuffer(ctx) {
                 const rate = ctx.sampleRate;
                 const length = rate * 2; // 2 seconds
                 const decay = 2.0;
                 const buffer = ctx.createBuffer(2, length, rate);
                 for (let c = 0; c < 2; c++) {
                     const data = buffer.getChannelData(c);
                     for (let i = 0; i < length; i++) {
                         data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
                     }
                 }
                 this.state.impulseBuffer = buffer;
            },
            initMasterVolume() {
                const slider = document.getElementById("master-volume");
                const percentage = document.getElementById("master-volume-percentage");
                slider.value = this.config.initialMasterVolume;
                percentage.textContent = Math.round(this.config.initialMasterVolume * 100);
                slider.addEventListener("input", e => {
                    const vol = parseFloat(e.target.value);
                    if (this.state.masterGainNode) this.state.masterGainNode.gain.setTargetAtTime(vol, this.state.audioContext.currentTime, 0.01);
                    percentage.textContent = Math.round(vol * 100);
                });
            },
            initGlobalActions() {
                document.getElementById("stop-all-btn").addEventListener("click", () => Object.keys(this.state.playingNodes).forEach(id => this.audio.stop(id, 0.05)));
                
                const fadeSelect = document.getElementById("fade-time-select");
                const fadeDisplay = document.getElementById("fade-time-display");
                const fadeTrigger = document.getElementById("fade-trigger-btn");
                
                fadeSelect.addEventListener("change", (e) => {
                    fadeDisplay.textContent = e.target.value + 's';
                });

                fadeTrigger.addEventListener("click", () => {
                    const fadeTime = parseFloat(fadeSelect.value);
                    Object.keys(this.state.playingNodes).forEach(id => this.audio.stop(id, fadeTime));
                });
            },
            async preloadAudio() {
                let decodeCtx;
                try {
                    const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
                    decodeCtx = new OfflineContextClass(1, 44100, 44100);
                } catch(e) {
                    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                    if (AudioContextClass) decodeCtx = new AudioContextClass();
                }

                const promises = Object.entries(this.config.audioData).map(async ([id, base64]) => {
                    if (this.state.audioBuffers[id] === "error" || this.state.audioBuffers[id] === "loading" || this.state.audioBuffers[id] instanceof AudioBuffer) return;
                    this.state.audioBuffers[id] = "loading";
                    try {
                        const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
                        let buffer;
                        if (base64.startsWith('./')) {
                            const response = await fetch(base64);
                            if (!response.ok) throw new Error("No se pudo cargar el archivo: " + base64);
                            const arrayBuffer = await response.arrayBuffer();
                            buffer = await new Promise((resolve, reject) => {
                                if (!decodeCtx) return reject(new Error("No audio context"));
                                try {
                                    const p = decodeCtx.decodeAudioData(arrayBuffer, resolve, reject);
                                    if (p && typeof p.catch === 'function') p.catch(reject);
                                } catch(e) { reject(e); }
                            });
                        } else {
                            // Decode base64 using safe atob (works reliably for large files without URL length limits)
                            const sanitizedBase64 = cleanBase64.replace(/[^A-Za-z0-9+/=]/g, '');
                            const bin = atob(sanitizedBase64);
                            const bytes = new Uint8Array(bin.length);
                            for (let i = 0; i < bin.length; i++) {
                                bytes[i] = bin.charCodeAt(i);
                            }
                            buffer = await new Promise((resolve, reject) => {
                                if (!decodeCtx) return reject(new Error("No audio context"));
                                try {
                                    const p = decodeCtx.decodeAudioData(bytes.buffer, resolve, reject);
                                    if (p && typeof p.catch === 'function') p.catch(reject);
                                } catch(e) { reject(e); }
                            });
                        }
                        
                        this.state.audioBuffers[id] = buffer;
                    } catch (e) { 
                        this.state.audioBuffers[id] = "error"; 
                        console.error('Error decoding audio ' + id, e); 
                    }
                });
                
                try {
                    await Promise.all(promises);
                } catch(e) {
                    console.error('Error in preload promises', e);
                }
            },
            render() {
                const grid = document.getElementById("sound-grid");
                grid.innerHTML = "";
                
                const padSize = parseFloat(document.querySelector('.resize-slider')?.value || 220);
                const isCompact = padSize < 175;
                const isUltraCompact = padSize < 145;

                this.config.board.sounds.forEach(sound => {
                    if (sound.hidden && !this.state.showHiddenSounds) {
                        return; // Skip hidden sounds
                    }

                    const isError = this.state.audioBuffers[sound.audioSourceId] === "error";
                    const buffer = this.state.audioBuffers[sound.audioSourceId];
                    const isLoaded = buffer instanceof AudioBuffer;
                    const duration = isLoaded ? (sound.endTime ?? buffer.duration) - (sound.startTime ?? 0) : 0;
                    
                    const pad = document.createElement("div");
                    pad.className = "sound-pad";
                    if (sound.hidden) pad.className += " is-hidden";
                    if (isCompact) pad.className += " is-compact";
                    if (isUltraCompact) pad.className += " is-ultra-compact";
                    
                    // Restore playing state class if active
                    const playingNode = this.state.playingNodes[sound.id];
                    if (playingNode) {
                        pad.classList.add(playingNode.status === 'playing' ? 'is-playing' : 'is-paused');
                    }

                    // Enable standard HTML5 drag
                    pad.setAttribute('draggable', 'true'); 

                    const colorStyle = this.config.colorStyles[sound.color];
                    pad.style.background = colorStyle ? colorStyle.background : '#374151';
                    pad.style.setProperty("--pad-border-color", this.config.colors[sound.color] || '#6366f1');
                    
                    const isWhitePad = sound.color === 'white';
                    const textColor = isWhitePad ? '#1f2937' : 'white';
                    pad.style.color = textColor;

                    if (isError) pad.classList.add("is-error");

                    // Archived badge overlay
                    const archivedOverlay = sound.hidden ? `<div class="archived-badge"><span>Archivado</span></div>` : '';

                    // Operator instructions trigger (bulb icon)
                    const instructionsButton = (sound.instructions && sound.instructions.trim().length > 0) ? `
                        <div style="position: absolute; top: 6px; right: 6px; z-index: 35;">
                            <button class="instruction-btn" title="Ver guía del operador">
                                \${this.config.icons.bulb}
                            </button>
                            <div class="instruction-tooltip">\${sound.instructions}</div>
                        </div>
                    ` : '';

                    // Define what to render in actions row depending on size
                    let actionsRowContent = '';
                    if (!isUltraCompact) {
                        actionsRowContent = `
                            <button class="loop-btn \${sound.loop ? 'is-active' : ''}" title="\${sound.loop ? 'Loop On' : 'Loop Off'}">
                                \${this.config.icons.loop}
                            </button>
                            <button class="pad-mini-btn solo-btn" title="Solo">S</button>
                            <button class="pad-mini-btn fade-btn" title="Fade">\${this.config.icons.fadeOut}</button>
                            <button class="pad-mini-btn stop-btn" title="Stop">\${this.config.icons.stop}</button>
                        `;
                    } else {
                        actionsRowContent = `
                            <button class="pad-mini-btn stop-btn" style="background: rgba(0,0,0,0.6); padding: 4px; border-radius: 4px;" title="Stop">
                                \${this.config.icons.stop}
                            </button>
                        `;
                    }

                    // If compact, add quick controls faders button in the actions row (or next to it)
                    if (isCompact) {
                        actionsRowContent += `
                            <button class="pad-mini-btn quick-controls-btn" style="background: rgba(99, 102, 241, 0.6); color: white; border-color: transparent;" title="Controles Rápidos">
                                \${this.config.icons.sliders}
                            </button>
                        `;
                    }

                    pad.innerHTML = \`\${archivedOverlay}\${instructionsButton}
                        <div class="rearrange-overlay">\${this.config.icons.move}</div><div class="progress-overlay"></div><div class="sound-pad-glow"></div>
                        <div class="play-indicator">
                            <div class="play-arrow"></div>
                            <div class="play-arrow"></div>
                            <div class="play-arrow"></div>
                        </div>
                        <div class="pad-content">
                            <div class="pad-title-box">
                                <div class="pad-name" title="\${sound.name}">\${sound.name}</div>
                                \${sound.stopActions && sound.stopActions.find(a => a.type === 'play') ? (function() {
                                    const playNextAction = sound.stopActions.find(a => a.type === 'play');
                                    const nextSound = app.config.board.sounds.find(s => s.id === playNextAction.soundId);
                                    return nextSound ? '<div style="display: flex; align-items: center; gap: 4px; font-size: 10px; font-weight: bold; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 9999px; width: fit-content; color: #a5b4fc; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;" title="Al finalizar, reproduce automáticamente: ' + nextSound.name + '"><span>🔗 Siguiente:</span><span style="overflow: hidden; text-overflow: ellipsis; max-width: 80px;">' + nextSound.name + '</span><span>➡️</span></div>' : '';
                                })() : ''}
                            </div>
                            <div class="pad-body"><div class="play-icon">\${playingNode && playingNode.status === 'playing' ? this.config.icons.pause : this.config.icons.play}</div></div>
                            <div class="pad-footer">
                                <div class="pad-actions-row">
                                    \${actionsRowContent}
                                </div>
                                <div class="time-display">
                                    <span>00:00.0</span>
                                    <span>\${isError ? 'ERROR' : this.util.formatTime(duration)}</span>
                                </div>
                                <div class="play-counter">#\${sound.playCount || 0}</div>
                            </div>
                        </div>
                        <div class="volume-slider-container">
                            <input type="range" class="vertical-slider" min="0" max="1" step="0.01" value="\${sound.volume}" title="Volumen">
                        </div>\`;
                    grid.appendChild(pad);

                    const playIcon = pad.querySelector('.play-icon');
                    const fadeBtn = pad.querySelector('.fade-btn');
                    const stopBtn = pad.querySelector('.stop-btn');
                    const soloBtn = pad.querySelector('.solo-btn');
                    const volumeSlider = pad.querySelector('.vertical-slider');
                    const loopBtn = pad.querySelector('.loop-btn');
                    const quickControlsBtn = pad.querySelector('.quick-controls-btn');
                    const instructionBtn = pad.querySelector('.instruction-btn');
                    const tooltip = pad.querySelector('.instruction-tooltip');

                    pad.addEventListener("click", e => {
                        if(e.target.closest('button') || e.target.closest('input')) return;
                        this.audio.togglePlay(sound);
                    });
                    
                    if (fadeBtn) fadeBtn.addEventListener("click", e => { e.stopPropagation(); this.audio.toggleFade(sound.id); });
                    if (stopBtn) stopBtn.addEventListener("click", e => { e.stopPropagation(); this.audio.stop(sound.id, 0.05); });
                    if (soloBtn) soloBtn.addEventListener("click", e => { e.stopPropagation(); soloBtn.classList.toggle('active'); });
                    
                    if (loopBtn) {
                        loopBtn.addEventListener("click", e => {
                            e.stopPropagation();
                            sound.loop = !sound.loop;
                            if(sound.loop) loopBtn.classList.add('is-active');
                            else loopBtn.classList.remove('is-active');
                            const node = this.state.playingNodes[sound.id];
                            if(node && node.source) node.source.loop = sound.loop;
                        });
                    }

                    if (volumeSlider) {
                        volumeSlider.addEventListener("input", e => {
                            e.stopPropagation();
                            const newVol = parseFloat(e.target.value);
                            sound.volume = newVol;
                            const node = this.state.playingNodes[sound.id];
                            if (node && node.fadeState !== 'out') node.gainNode.gain.setTargetAtTime(newVol, this.state.audioContext.currentTime, 0.01);
                        });
                        volumeSlider.addEventListener("click", e => e.stopPropagation());
                    }

                    if (quickControlsBtn) {
                        quickControlsBtn.addEventListener("click", e => {
                            e.stopPropagation();
                            this.openQuickControls(sound);
                        });
                    }

                    if (instructionBtn && tooltip) {
                        instructionBtn.addEventListener("click", e => {
                            e.stopPropagation();
                            document.querySelectorAll('.instruction-tooltip').forEach(el => {
                                if (el !== tooltip) el.classList.remove('visible');
                            });
                            tooltip.classList.toggle('visible');
                        });
                        tooltip.addEventListener("click", e => e.stopPropagation());
                    }

                    this.state.domCache[sound.id] = { pad, playIcon, fadeBtn, volumeSlider,
                        progress: pad.querySelector('.progress-overlay'), 
                        glow: pad.querySelector('.sound-pad-glow'),
                        currentTime: pad.querySelector('.time-display span:first-child'),
                        playCounter: pad.querySelector('.play-counter')
                    };
                });
            },
            updateUI() {
                const playingIds = Object.keys(this.state.playingNodes);
                if (playingIds.length === 0) { this.state.animationFrameId = null; return; }

                playingIds.forEach(id => {
                    const node = this.state.playingNodes[id];
                    const sound = this.config.board.sounds.find(s => s.id === id);
                    if (!node || !sound) return;
                    
                    const cache = this.state.domCache[id];
                    if (!cache) return;
                    const {currentTime, progress, glow, volumeSlider} = cache;
                    
                    if (node.status === "playing") {
                        const buffer = this.state.audioBuffers[sound.audioSourceId];
                        const soundEndTime = sound.endTime ?? (buffer instanceof AudioBuffer ? buffer.duration : 0);
                        const duration = soundEndTime - sound.startTime;
                        const elapsed = (this.state.audioContext.currentTime - node.contextStartTime) * (sound.pitch ?? 1.0);
                        let current = node.progress + elapsed;
                        
                        if(sound.loop && duration > 0) current %= soundEndTime;
                        const relativeCurrentTime = current - sound.startTime;
                        
                        if (currentTime) currentTime.textContent = this.util.formatTime(relativeCurrentTime);
                        if (progress) progress.style.width = duration > 0 ? `\${Math.min(100, (relativeCurrentTime / duration) * 100)}%` : "0%";
                        
                        if (node.analyser && glow) {
                            const data = new Uint8Array(node.analyser.frequencyBinCount);
                            node.analyser.getByteTimeDomainData(data);
                            let sumSq = 0; data.forEach(v => { const val = v / 128 - 1; sumSq += val * val });
                            const rms = Math.sqrt(sumSq / data.length);
                            const glowAmount = Math.min(8 + (rms * 70), 35);
                            glow.style.boxShadow = `0 0 \${glowAmount}px \${glowAmount/3}px \${this.config.colors[sound.color] || "#ffffff"}`;
                        }
                    }
                    
                    // Also update quick controls modal values in real-time (e.g. during fade outs)
                    if (this.state.activeQuickSoundId === id) {
                        const quickVolSlider = document.getElementById('quick-vol-slider');
                        const quickVolVal = document.getElementById('quick-vol-val');
                        if (quickVolSlider && quickVolVal && document.activeElement !== quickVolSlider && node.gainNode) {
                            const currentVal = node.gainNode.gain.value;
                            quickVolSlider.value = currentVal;
                            quickVolVal.textContent = Math.round(currentVal * 100) + '%';
                        }
                    }
                });
                this.state.animationFrameId = requestAnimationFrame(() => this.updateUI());
            },
            ui: {
                setPadState(soundId, state) {
                    const cache = app.state.domCache[soundId];
                    if (!cache) return;
                    const {pad, playIcon, progress, glow, currentTime} = cache;
                    if (pad) {
                        if (state === 'playing') {
                            pad.classList.remove('is-paused');
                            pad.classList.add('is-playing');
                            if (playIcon) playIcon.innerHTML = app.config.icons.pause;
                        } else if (state === 'paused') {
                            pad.classList.remove('is-playing');
                            pad.classList.add('is-paused');
                            if (playIcon) playIcon.innerHTML = app.config.icons.play;
                        } else { // stopped
                            pad.classList.remove('is-playing', 'is-paused');
                            if (playIcon) playIcon.innerHTML = app.config.icons.play;
                            if (progress) progress.style.width = "0%";
                            if (glow) glow.style.boxShadow = "none";
                            if (currentTime) currentTime.textContent = app.util.formatTime(0);
                        }
                    }
                    if (app.state.activeQuickSoundId === soundId) {
                        app.updateQuickTransportUI(soundId);
                    }
                },
                incrementCounter(soundId, count) {
                    const {playCounter} = app.state.domCache[soundId];
                    if(playCounter) playCounter.textContent = '#' + count;
                }
            },
            audio: {
                stop(soundId, fadeDuration = 0) {
                    const node = app.state.playingNodes[soundId];
                    if (!node) return;
                    const {audioContext} = app.state;
                    if(node.fadeTimeoutId) clearTimeout(node.fadeTimeoutId);
                    if (fadeDuration > 0 && node.status !== 'stopped') {
                        node.gainNode.gain.cancelScheduledValues(audioContext.currentTime);
                        node.gainNode.gain.setValueAtTime(node.gainNode.gain.value, audioContext.currentTime);
                        node.gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + fadeDuration);
                        node.fadeTimeoutId = setTimeout(() => app.audio._hardStop(soundId), fadeDuration * 1000);
                        // Visual feedback for fade out
                        const {fadeBtn} = app.state.domCache[soundId];
                        if (fadeBtn) fadeBtn.classList.add('fading');
                    } else {
                        app.audio._hardStop(soundId);
                    }
                },
                _hardStop(soundId) {
                    const node = app.state.playingNodes[soundId];
                    if (!node) return;
                    if(node.fadeTimeoutId) clearTimeout(node.fadeTimeoutId);
                    if (node.source) { node.source.onended = null; try { node.source.stop(); } catch(e){} }
                    try { node.fxNodes.forEach(n => n.disconnect()); } catch(e) {}
                    delete app.state.playingNodes[soundId];
                    app.ui.setPadState(soundId, 'stopped');
                    const {fadeBtn} = app.state.domCache[soundId];
                    if (fadeBtn) fadeBtn.classList.remove('fading');
                },
                togglePlay(sound) {
                    if (!app.state.audioContext) app.initAudioContext();
                    const node = app.state.playingNodes[sound.id];
                    if (node) {
                        if (node.status === "playing") app.audio.pause(sound.id);
                        else if (node.status === "paused") app.audio.play(sound, node.progress);
                    } else {
                        app.audio.play(sound, sound.startTime ?? 0);
                    }
                },
                pause(soundId) {
                    const node = app.state.playingNodes[soundId];
                    const sound = app.config.board.sounds.find(s => s.id === soundId);
                    if (!node || !sound || node.status !== "playing") return;
                    
                    const context = app.state.audioContext;
                    const pauseFadeTime = sound.pauseFade ?? 0.2;
                    
                    // Start fading out volume
                    node.gainNode.gain.cancelScheduledValues(context.currentTime);
                    node.gainNode.gain.setValueAtTime(node.gainNode.gain.value, context.currentTime);
                    node.gainNode.gain.linearRampToValueAtTime(0, context.currentTime + pauseFadeTime);

                    // Wait for fade to finish before stopping
                    setTimeout(() => {
                        const elapsed = (context.currentTime - node.contextStartTime) * (sound.pitch ?? 1.0);
                        node.progress += elapsed;
                        node.status = "paused";
                        if (node.source) { node.source.onended = null; try { node.source.stop(); } catch(e){} }
                        app.ui.setPadState(soundId, 'paused');
                    }, pauseFadeTime * 1000);
                },
                play(sound, offset) {
                    // AUTOMATION
                    if (sound.stopActions && sound.stopActions.length > 0) {
                        sound.stopActions.forEach(action => {
                            const idToStop = action.soundId;
                            if (app.state.playingNodes[idToStop]) {
                                if (action.type === 'pause') {
                                    app.audio.pause(idToStop);
                                } else {
                                    app.audio.stop(idToStop, 0.05);
                                }
                            }
                        });
                    }

                    const buffer = app.state.audioBuffers[sound.audioSourceId];
                    if (!(buffer instanceof AudioBuffer)) return;
                    if (app.state.playingNodes[sound.id]) app.audio._hardStop(sound.id);
                    
                    sound.playCount = (sound.playCount || 0) + 1;
                    app.ui.incrementCounter(sound.id, sound.playCount);

                    const ac = app.state.audioContext;
                    
                    const source = ac.createBufferSource();
                    const gainNode = ac.createGain();
                    const analyser = ac.createAnalyser();
                    const panner = ac.createStereoPanner();
                    
                    const preampNode = ac.createGain();
                    preampNode.gain.value = Math.pow(10, (sound.eqPreamp || 0) / 20);
                    const eqNodes = app.config.eqBands.map((freq, i) => {
                        const f = ac.createBiquadFilter();
                        f.type = 'peaking'; f.frequency.value = freq; f.Q.value = 1.41;
                        f.gain.value = sound.eqBands ? (sound.eqBands[i] || 0) : 0;
                        return f;
                    });
                    preampNode.connect(eqNodes[0]);
                    for(let i=0; i<eqNodes.length-1; i++) eqNodes[i].connect(eqNodes[i+1]);
                    const lastEqNode = eqNodes[eqNodes.length - 1];

                    const delay = ac.createDelay(5.0);
                    const delayFeedback = ac.createGain();
                    const dryGain = ac.createGain();
                    
                    delay.delayTime.value = sound.delayTime || 0;
                    delayFeedback.gain.value = sound.delayFeedback || 0;
                    const reverbAmt = sound.reverb || 0;
                    
                    let convolver = null;
                    let wetGain = null;
                    if (reverbAmt > 0 && app.state.impulseBuffer) {
                        convolver = ac.createConvolver();
                        convolver.buffer = app.state.impulseBuffer;
                        wetGain = ac.createGain();
                        wetGain.gain.value = reverbAmt;
                        dryGain.gain.value = 1 - reverbAmt;
                    } else {
                        dryGain.gain.value = 1.0;
                    }

                    source.connect(gainNode);
                    gainNode.connect(panner);
                    
                    if (sound.eqEnabled) {
                         panner.connect(preampNode);
                         lastEqNode.connect(delay);
                    } else {
                         panner.connect(delay);
                    }
                    
                    delay.connect(delayFeedback).connect(delay);
                    delay.connect(dryGain).connect(analyser);
                    if (convolver && wetGain) {
                        delay.connect(wetGain).connect(convolver).connect(analyser);
                    }
                    
                    analyser.connect(app.state.eqIsEnabled ? app.state.globalPreampNode : app.state.masterGainNode);

                    source.buffer = buffer;
                    source.loop = sound.loop;
                    if (sound.loop) {
                        source.loopStart = sound.startTime ?? 0;
                        source.loopEnd = sound.endTime ?? buffer.duration;
                    }
                    source.playbackRate.value = sound.pitch ?? 1.0;
                    panner.pan.value = sound.pan || 0;
                    
                    const now = ac.currentTime;
                    gainNode.gain.cancelScheduledValues(now);
                    gainNode.gain.setValueAtTime(0, now);
                    
                    const soundEndTime = sound.endTime ?? buffer.duration;
                    const durationToPlay = soundEndTime - offset;
                    const pitch = sound.pitch ?? 1.0;

                    const pitchedFadeInDuration = Math.min((sound.fadeIn ?? 0.1) / pitch, durationToPlay / pitch);
                    if (pitchedFadeInDuration > 0.001) {
                         gainNode.gain.linearRampToValueAtTime(sound.volume ?? 0.75, now + pitchedFadeInDuration);
                    } else {
                         gainNode.gain.setValueAtTime(sound.volume ?? 0.75, now);
                    }
                    
                    if (!sound.loop && durationToPlay > 0) {
                        const pitchedDurationToPlay = durationToPlay / pitch;
                        const pitchedFadeOutDuration = Math.min((sound.fadeOut ?? 0.1) / pitch, pitchedDurationToPlay);

                        if (pitchedFadeOutDuration > 0.001) {
                             const fadeOutStartTime = now + pitchedDurationToPlay - pitchedFadeOutDuration;
                             if(fadeOutStartTime > now + pitchedFadeInDuration) {
                                gainNode.gain.setValueAtTime(sound.volume ?? 0.75, fadeOutStartTime);
                             }
                             gainNode.gain.linearRampToValueAtTime(0, fadeOutStartTime + pitchedFadeOutDuration);
                        }
                    }
                    source.start(now, offset, sound.loop ? undefined : durationToPlay);
                    
                    const fxNodes = [panner, preampNode, ...eqNodes, delay, delayFeedback, dryGain, wetGain, convolver].filter(Boolean);
                    app.state.playingNodes[sound.id] = { source, gainNode, analyser, status: "playing", contextStartTime: now, progress: offset, fxNodes };
                    source.onended = () => { 
                        if (app.state.playingNodes[sound.id]?.source === source && !sound.loop) {
                            app.audio._hardStop(sound.id); 
                            
                            // Trigger play on finish automation
                            if (sound.stopActions && sound.stopActions.length > 0) {
                                sound.stopActions.forEach(action => {
                                    if (action.type === 'play') {
                                        const nextSound = app.config.board.sounds.find(s => s.id === action.soundId);
                                        if (nextSound) app.audio.play(nextSound, nextSound.startTime ?? 0);
                                    }
                                });
                            }
                        } 
                    };
                    app.ui.setPadState(sound.id, 'playing');
                    if (!app.state.animationFrameId) app.state.animationFrameId = requestAnimationFrame(() => app.updateUI());
                },
                toggleFade(soundId) {
                    const node = app.state.playingNodes[soundId];
                    const sound = app.config.board.sounds.find(s => s.id === soundId);
                    if (!node || !sound) return;
                    const {fadeBtn} = app.state.domCache[soundId];
                    const ac = app.state.audioContext;
                    if(node.fadeTimeoutId) clearTimeout(node.fadeTimeoutId);
                    node.gainNode.gain.cancelScheduledValues(ac.currentTime);
                    node.gainNode.gain.setValueAtTime(node.gainNode.gain.value, ac.currentTime);
                    if (node.fadeState === 'out') {
                        node.fadeState = 'in';
                        node.gainNode.gain.linearRampToValueAtTime(sound.volume, ac.currentTime + (sound.fadeIn ?? 0.2));
                        if (fadeBtn) fadeBtn.classList.remove('fading');
                    } else {
                        node.fadeState = 'out';
                        let fadeDuration = sound.fadeOut ?? 1.0;
                        if (sound.fadeOut === 0.1) {
                            const globalSelect = document.getElementById('fade-time-select');
                            if (globalSelect) {
                                fadeDuration = parseFloat(globalSelect.value) || 5.0;
                            }
                        }
                        node.gainNode.gain.linearRampToValueAtTime(0, ac.currentTime + fadeDuration);
                        node.fadeTimeoutId = setTimeout(() => app.audio._hardStop(soundId), fadeDuration * 1000);
                        if (fadeBtn) fadeBtn.classList.add('fading');
                    }
                    if (app.state.activeQuickSoundId === soundId) {
                        app.updateQuickTransportUI(soundId);
                    }
                }
            },
            eq: {
                init() {
                    const modal = document.getElementById('eq-modal');
                    const bandsContainer = document.getElementById('eq-bands-container');
                    
                    app.config.eqBands.forEach((freq, i) => {
                        const label = freq >= 1000 ? \`\${freq/1000}k\` : freq;
                        const band = document.createElement('div');
                        band.className = 'eq-band';
                        band.innerHTML = \`<div class="eq-band-val font-mono text-[9px] text-gray-400 mb-1">0dB</div><div class="eq-track-custom"><div class="eq-zero-line"></div><div class="eq-fill-bar"></div><input type="range" min="-20" max="20" step="0.5" value="0" class="eq-slider-input"><div class="eq-slider-cap"><div class="eq-cap-line"></div></div></div><div class="eq-freq">\${label}</div>\`;
                        bandsContainer.appendChild(band);
                        const slider = band.querySelector('input');
                        slider.addEventListener('input', (e) => this.update(i, parseFloat(e.target.value)));
                        this.update(i, 0); // Position fader visuals at startup
                    });

                    document.getElementById('eq-btn').addEventListener('click', () => {
                        modal.classList.add('visible');
                        document.getElementById('eq-btn').classList.add('active-state');
                    });
                    document.getElementById('eq-close-btn').addEventListener('click', () => {
                        modal.classList.remove('visible');
                        document.getElementById('eq-btn').classList.remove('active-state');
                    });
                    const preampSlider = document.getElementById('eq-preamp');
                    preampSlider.addEventListener('input', () => this.updatePreamp(parseFloat(preampSlider.value)));
                    const toggle = document.getElementById('eq-enabled-toggle');
                    toggle.addEventListener('click', () => {
                        app.state.eqIsEnabled = !app.state.eqIsEnabled;
                        toggle.setAttribute('aria-checked', app.state.eqIsEnabled);
                        document.getElementById('eq-controls-container').style.opacity = app.state.eqIsEnabled ? '1' : '0.5';
                        document.getElementById('eq-controls-container').style.pointerEvents = app.state.eqIsEnabled ? 'auto' : 'none';
                        this.applyToMix();
                    });
                },
                updatePreamp(val) {
                    if (app.state.globalPreampNode) app.state.globalPreampNode.gain.setTargetAtTime(Math.pow(10, val / 20), app.state.audioContext.currentTime, 0.015);
                    document.getElementById('preamp-value').textContent = (val > 0 ? '+' : '') + val.toFixed(1) + 'dB';
                },
                update(index, val) {
                    if(app.state.globalEqNodes[index]) app.state.globalEqNodes[index].gain.setTargetAtTime(val, app.state.audioContext.currentTime, 0.015);
                    const bandEl = document.querySelectorAll('.eq-band')[index];
                    if(bandEl) {
                        const fillBar = bandEl.querySelector('.eq-fill-bar');
                        const sliderCap = bandEl.querySelector('.eq-slider-cap');
                        const valDisplay = bandEl.querySelector('.eq-band-val');
                        
                        if(valDisplay) valDisplay.textContent = (val > 0 ? '+' : '') + Math.round(val) + 'dB';
                        
                        const topPercent = 50 - (val / 20) * 50;
                        if(fillBar) {
                            if(val >= 0) {
                                fillBar.style.top = topPercent + '%';
                                fillBar.style.bottom = '50%';
                                fillBar.style.backgroundColor = 'rgba(249, 115, 22, 0.2)'; // orange
                            } else {
                                fillBar.style.top = '50%';
                                fillBar.style.bottom = (50 - (Math.abs(val) / 20) * 50) + '%';
                                fillBar.style.backgroundColor = 'rgba(99, 102, 241, 0.2)'; // indigo
                            }
                        }
                        if(sliderCap) {
                            // Parent track height is 130px, cap is 16px. Center is topPercent/100 * 130 - 8
                            const topPx = (topPercent / 100) * 130 - 8;
                            sliderCap.style.top = Math.max(0, Math.min(114, topPx)) + 'px';
                        }
                    }
                },
                applyToMix() {
                    Object.values(app.state.playingNodes).forEach(node => {
                        if (!node || !node.source) return;
                        try {
                            node.analyser.disconnect();
                            node.analyser.connect(app.state.eqIsEnabled ? app.state.globalPreampNode : app.state.masterGainNode);
                        } catch(e) {}
                    });
                },
            },
            util: {
                formatTime(s) {
                    if (isNaN(s) || s < 0) return "00:00.0";
                    const m = Math.floor(s / 60); const sc = Math.floor(s % 60); const ms = Math.floor((s - Math.floor(s)) * 10);
                    return String(m).padStart(2, "0") + ":" + String(sc).padStart(2, "0") + "." + ms;
                }
            }
        };
        document.addEventListener("DOMContentLoaded", () => {
            try {
                app.init();
            } catch (error) {
                console.error("Error al inicializar la app:", error);
                const overlay = document.getElementById('loading-overlay');
                if (overlay) {
                    overlay.style.display = 'none';
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }
            }
        });
    </script>
</body>
</html>`;
};
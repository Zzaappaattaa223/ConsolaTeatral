import { Soundboard } from '../types';
import { soundGlowColors } from '../constants';

export const generateBasicProductionHTML = (board: Soundboard, audioData: { [key: string]: string }, masterVolume: number) => {
    const isNum = (val: any): val is number => typeof val === 'number' && isFinite(val);

    const boardForExport = {
        ...board,
        sounds: board.sounds.map(sound => ({
            ...sound,
            volume: isNum(sound.volume) ? sound.volume : 0.75,
            pitch: isNum(sound.pitch) ? sound.pitch : 1.0,
            startTime: isNum(sound.startTime) ? sound.startTime : 0,
            endTime: sound.endTime === null || isNum(sound.endTime) ? sound.endTime : null,
            loop: sound.loop ?? false,
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
    
    // Helper to safely encode UTF-8 strings to Base64
    const safeBtoa = `function safeBtoa(str) { return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) { return String.fromCharCode('0x' + p1); })); }`;
    // Helper to safely decode Base64 to UTF-8 strings (client-side)
    const clientSafeAtob = `function safeAtob(str) { return decodeURIComponent(atob(str).split('').map(function(c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')); }`;

    // Server-side encoding for the template injection
    const encodeForTemplate = (obj: any) => {
        const str = JSON.stringify(obj);
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode(parseInt(p1, 16))));
    };

    const encodedBoard = encodeForTemplate(boardForExport);

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Show Player (Básico): ${board.name}</title>
    <style>
        :root {
            --bg-color: #111827; --surface-color: #1f2937; --border-color: #374151;
            --text-primary: #f9fafb; --text-secondary: #d1d5db;
            --accent-color: #6366f1; --red-color: #ef4444; --green-color: #22c55e;
            --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            --font-mono: "Courier New", Courier, monospace;
            --col-width: 200px; /* CSS Variable for resizing */
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { font-size: 16px; }
        body {
            font-family: var(--font-sans); background-color: var(--bg-color); color: var(--text-primary);
            margin: 0; display: flex; flex-direction: column; min-height: 100svh;
            -webkit-tap-highlight-color: transparent; touch-action: manipulation;
        }
        header {
            background-color: var(--surface-color); padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color);
            flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
        }
        @media (min-width: 640px) {
            header { flex-direction: row; justify-content: space-between; }
        }
        
        .header-controls { display: flex; align-items: center; gap: 1rem; }
        
        main { flex-grow: 1; padding: 1.5rem; overflow-y: auto; }
        .spinner { width: 2rem; height: 2rem; border: 4px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        #sound-grid { 
            display: grid; gap: 1rem; 
            grid-template-columns: repeat(auto-fill, minmax(var(--col-width), 1fr)); 
        }
        
        .sound-pad {
            position: relative; z-index: 1; user-select: none; border-radius: 0.75rem; display: flex; height: 200px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05);
            border: 2px solid transparent; overflow: hidden;
            transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s, box-shadow 0.2s;
            /* Touch handling */
            -webkit-touch-callout: none;
            touch-action: pan-y; /* Allow vertical scroll, but we intercept drag */
        }
        .sound-pad.is-dragging { opacity: 0.5; border: 2px dashed var(--accent-color); }
        
        .sound-pad.is-playing { 
            border-color: var(--pad-border-color, var(--accent-color)); 
            box-shadow: 0 10px 25px rgba(0,0,0,0.4), 0 0 15px var(--pad-border-color, var(--accent-color));
            transform: scale(1.02);
            z-index: 10;
        }
        .sound-pad.is-error { border-color: var(--red-color); background: #372a2a; }
        .progress-overlay { position: absolute; inset: 0; background-color: rgba(255,255,255,0.12); z-index: 1; width: 0%; pointer-events:none; }
        .sound-pad.is-error .progress-overlay { background-color: rgba(239, 68, 68, 0.2); width: 100%; }
        
        /* Play indicator arrows inside playing card */
        .play-indicator {
            display: none;
            position: absolute;
            bottom: 6px;
            left: 12px;
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

        .pad-content { display: flex; flex-direction: column; justify-content: space-between; flex-grow: 1; padding: 0.75rem; z-index: 5; }
        .pad-name { font-weight: 600; line-height: 1.2; word-break: break-word; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; text-shadow: 0 1px 2px rgba(0,0,0,0.6); z-index: 50; position: relative; }
        
        .play-pause-btn { 
            background-color: rgba(0,0,0,0.4); 
            border-radius: 50%; 
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); 
            border: 2px solid rgba(255,255,255,0.15); 
            color: white; 
            cursor: pointer;
            backdrop-filter: blur(4px);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        }
        .play-pause-btn:hover:not(:disabled) { 
            transform: scale(1.15); 
            background-color: var(--pad-border-color, var(--accent-color));
            border-color: white;
            box-shadow: 0 0 15px var(--pad-border-color, var(--accent-color));
        }
        .play-pause-btn:active:not(:disabled) {
            transform: scale(0.9);
        }
        .play-pause-btn:disabled { opacity: 0.5; cursor: wait; }
        .play-pause-btn svg { width: 3.5rem; height: 3.5rem; }
        .pad-footer { font-size: 0.75rem; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
        .time-display { display: flex; justify-content: space-between; align-items: center; }
        .time-display span { background-color: rgba(0,0,0,0.4); border-radius: 0.25rem; padding: 2px 6px; font-family: var(--font-mono); font-size: 0.8rem; }
        
        /* High Contrast Loop Button */
        .loop-btn { 
            display: inline-flex; align-items: center; justify-content: center;
            background-color: rgba(0,0,0,0.5); 
            border-radius: 9999px; padding: 0.35rem; 
            color: rgba(255,255,255,0.65);
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); 
            border: 1px solid rgba(255,255,255,0.15);
            cursor: pointer;
        }
        .loop-btn:hover {
            background-color: rgba(255,255,255,0.15);
            color: #ffffff;
            transform: scale(1.08);
            border-color: rgba(255,255,255,0.3);
        }
        .loop-btn.is-active { 
            opacity: 1; color: #ffffff !important; 
            background-color: #22c55e !important; 
            box-shadow: 0 0 10px rgba(34, 197, 94, 0.8), inset 0 1px 0 rgba(255,255,255,0.3);
            border-color: #4ade80;
            transform: scale(1.1) rotate(360deg);
        }
        .loop-btn.is-active:hover {
            background-color: #16a34a !important;
        }
        .loop-btn svg { width: 1rem; height: 1rem; vertical-align: middle; }
        
        .volume-slider-container { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.75rem 0.5rem; background-color: rgba(0,0,0,0.2); width: 44px; overflow: hidden; }
        input[type=range].vertical-slider { -webkit-appearance: none; width: 100px; height: 10px; background: var(--border-color); border-radius: 5px; border: 1px solid var(--bg-color); transform: rotate(-90deg); margin: 0; cursor: pointer; }
        input[type=range].vertical-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; background: #818cf8; border-radius: 50%; border: 4px solid var(--surface-color); box-shadow: 0 0 5px rgba(0,0,0,0.5); cursor: pointer; }
        
        /* Header Resize Slider */
        input[type=range].resize-slider {
            -webkit-appearance: none; width: 100px; height: 4px; background: #4b5563; border-radius: 2px; outline: none;
        }
        input[type=range].resize-slider::-webkit-slider-thumb {
            -webkit-appearance: none; width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%; cursor: pointer;
        }
        
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
        .rearrange-mode .sound-pad * { pointer-events: none; } /* Disable interactions inside pad */
        .rearrange-mode .pad-name { pointer-events: auto; } /* Keep name readable/selectable if needed */

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
            display: flex; align-items: center; gap: 1rem;
            background: #111827; padding: 0.5rem 1rem; border-radius: 0.5rem;
            border: 1px solid var(--border-color); flex-grow: 1; height: 50px;
        }
        .fader-icon { color: var(--text-secondary); display: flex; align-items: center; flex-shrink: 0; }
        input[type=range].master-fader { 
            -webkit-appearance: none; appearance: none; flex-grow: 1; height: 8px; 
            background: #374151; border-radius: 4px; outline: none; cursor: pointer;
        }
        input[type=range].master-fader::-webkit-slider-thumb { 
            -webkit-appearance: none; appearance: none; width: 24px; height: 24px; 
            background: var(--accent-color); border-radius: 50%; border: 2px solid white; 
            box-shadow: 0 1px 3px rgba(0,0,0,0.5); transition: transform 0.1s;
        }
        input[type=range].master-fader::-webkit-slider-thumb:hover { transform: scale(1.1); }
        #master-volume-percentage { font-family: monospace; font-size: 0.9rem; font-weight: bold; color: var(--text-primary); width: 3ch; text-align: right; flex-shrink: 0; }

        /* Hardware Buttons */
        .controls-row { display: flex; justify-content: flex-end; align-items: center; gap: 0.75rem; }
        .hw-btn {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            background: linear-gradient(180deg, #374151 0%, #1f2937 100%);
            border: 1px solid #4b5563; border-bottom-width: 3px; border-radius: 6px;
            color: #e5e7eb; transition: all 0.1s; cursor: pointer; height: 50px; min-width: 60px; padding: 0 12px;
        }
        .hw-btn:active { transform: translateY(2px); border-bottom-width: 1px; background: #1f2937; }
        .hw-btn svg { width: 24px; height: 24px; margin-bottom: 2px; }
        .hw-btn span { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .hw-btn-red { color: #fca5a5; border-color: #7f1d1d; }
        .hw-btn-red:hover { background: linear-gradient(180deg, #7f1d1d 0%, #450a0a 100%); }
        .hw-btn-red:active { background: #450a0a; border-color: #ef4444; color: #ef4444; }

        .fade-wrapper {
            display: flex; background: linear-gradient(180deg, #374151 0%, #1f2937 100%);
            border: 1px solid #4b5563; border-bottom-width: 3px; border-radius: 6px; height: 50px; overflow: hidden;
        }
        .fade-trigger {
            background: transparent; border: none; border-right: 1px solid #111827;
            color: #60a5fa; cursor: pointer; padding: 0 12px;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            min-width: 50px; transition: background 0.1s;
        }
        .fade-trigger:hover { background: rgba(255,255,255,0.05); }
        .fade-trigger:active { background: rgba(0,0,0,0.2); transform: translateY(1px); }
        .fade-trigger span { font-size: 10px; font-weight: 700; text-transform: uppercase; margin-top: 2px; }
        .fade-trigger svg { width: 20px; height: 20px; }

        .fade-select-container {
            position: relative; width: 30px; background: rgba(0,0,0,0.2);
            display: flex; align-items: center; justify-content: center; border-left: 1px solid rgba(255,255,255,0.05);
        }
        .fade-select-container:hover { background: rgba(255,255,255,0.05); }
        .fade-select-container select { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
        .fade-val { font-size: 10px; font-weight: bold; color: #9ca3af; pointer-events: none; }

        @media (max-width: 640px) {
            footer.global-controls { grid-template-columns: 1fr; height: auto; gap: 1rem; padding: 0.75rem; }
            .controls-row { justify-content: space-between; width: 100%; }
            .hw-btn { flex-grow: 1; }
            .fade-wrapper { flex-grow: 1; }
            .fade-trigger { flex-grow: 1; }
        }

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
        .sound-pad.is-compact .play-pause-btn {
            transform: scale(0.8);
        }
        .sound-pad.is-compact .play-pause-btn:hover:not(:disabled) {
            transform: scale(0.9);
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
        .sound-pad.is-ultra-compact .pad-name {
            font-size: 0.75rem;
        }
        .sound-pad.is-ultra-compact .play-pause-btn {
            transform: scale(0.7);
        }
        .sound-pad.is-ultra-compact .play-pause-btn:hover:not(:disabled) {
            transform: scale(0.8);
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
    <div id="loading-overlay" style="position: fixed; inset: 0; background-color: rgba(17, 24, 39, 0.9); color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 1000; gap: 1rem;">
        <div class="spinner"></div><p>Cargando Sonidos...</p>
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
            </div>
            
            <div class="quick-modal-instructions" id="quick-instructions-box">
                <span class="quick-instructions-hdr">Instrucciones de Operación</span>
                <p class="quick-instructions-body" id="quick-instructions">Sin indicaciones cargadas.</p>
            </div>
        </div>
    </div>

    <header>
        <h1>${board.name}</h1>
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
            <input type="range" class="resize-slider" min="120" max="480" value="200" title="Tamaño de los pads">
        </div>
    </header>
    <main><div id="sound-grid"></div></main>
    <footer class="global-controls">
        <div class="fader-container">
            <div class="fader-icon" title="Volumen Maestro">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="24" height="24"><path fill-rule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 01.09-.083zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
            </div>
            <input type="range" id="master-volume" class="master-fader" min="0" max="1" step="0.01">
            <span id="master-volume-percentage">100</span>
        </div>
        
        <div class="controls-row">
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
                icons: {
                    play: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z"/></svg>',
                    pause: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
                    loop: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
                    error: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>',
                    move: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M15.97 2.47a.75.75 0 011.06 0l2.25 2.25a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 11-1.06-1.06l.97-.97H12.75a.75.75 0 010-1.5h4.19l-.97-.97a.75.75 0 010-1.06zm-7.94 0a.75.75 0 010 1.06l-.97.97h4.19a.75.75 0 010 1.5H7.06l.97.97a.75.75 0 01-1.06 1.06l-2.25-2.25a.75.75 0 010-1.06l2.25-2.25a.75.75 0 011.06 0zm13.5 13.5a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 111.06-1.06l.97-.97v-4.19a.75.75 0 011.5 0v4.19l.97-.97a.75.75 0 011.06 0zm-13.5 0a.75.75 0 011.06 0l.97.97v-4.19a.75.75 0 011.5 0v4.19l.97-.97a.75.75 0 111.06 1.06l-2.25 2.25a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 010-1.06z" clip-rule="evenodd" /></svg>',
                    eye: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>',
                    eyeOff: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>',
                    sliders: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>',
                    bulb: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.46 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"/></svg>',
                    stop: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>',
                    fadeOut: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M3 17a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3z" /> <path d="M9 17a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9z" /> <path d="M15 17a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2z" />'
                }
            },
            state: {
                audioContext: null, masterGainNode: null, audioBuffers: {}, playingNodes: {}, domCache: {}, animationFrameId: null, isRearrangeMode: false,
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
                this.initMasterVolume();
                this.initGlobalActions();
                
                /* Immediately render UI in its initial state so the page appears instantly responsive */
                try {
                    this.render();
                    this.initDragAndDrop();
                    this.initUI();
                } catch(e) {
                    console.error("Initial render error:", e);
                }

                /* Hide loading overlay transitionally as soon as we finish loading, or up to a maximum timeout */
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

                /* Triggers async preload of audio in background, which handles decoding gracefully */
                this.preloadAudio().then(() => {
                    try {
                        this.render(); /* Re-render once audios decode to show correct durations */
                    } catch(e) {}
                    hideLoading();
                }).catch(err => {
                    console.error("Audio preloading error:", err);
                    hideLoading();
                });

                /* Fail-safe path: force hide overlay after 1.5s if browser background decode stalls */
                setTimeout(hideLoading, 1500);
            },
            initUI() {
                const slider = document.querySelector('.resize-slider');
                const root = document.documentElement;
                if(slider) {
                    slider.addEventListener('input', (e) => {
                        root.style.setProperty('--col-width', e.target.value + 'px');
                    });
                }
                
                const rearrangeBtn = document.getElementById('rearrange-btn');
                rearrangeBtn.addEventListener('click', () => {
                    this.state.isRearrangeMode = !this.state.isRearrangeMode;
                    rearrangeBtn.classList.toggle('active', this.state.isRearrangeMode);
                    document.getElementById('sound-grid').classList.toggle('rearrange-mode', this.state.isRearrangeMode);
                });
            },
            initDragAndDrop() {
                const grid = document.getElementById("sound-grid");
                let draggedItem = null;

                /* --- MOUSE EVENTS --- */
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
                    e.preventDefault(); /* Necessary to allow dropping */
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

                /* --- TOUCH EVENTS --- */
                const handleTouchStart = (e) => {
                    if (!this.state.isRearrangeMode) return;
                    
                    const pad = e.target.closest('.sound-pad');
                    if(!pad) return;
                    
                    /* No delay for rearrange mode touch drag */
                    draggedItem = pad;
                    pad.classList.add('is-dragging');
                    if(navigator.vibrate) navigator.vibrate(50);
                };

                const handleTouchMove = (e) => {
                    if (!draggedItem || !this.state.isRearrangeMode) return;
                    e.preventDefault(); /* Prevent scroll while dragging */
                    
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
                    this.state.masterGainNode = ac.createGain();
                    this.state.masterGainNode.gain.value = this.config.initialMasterVolume;
                    this.state.masterGainNode.connect(ac.destination);
                }
            },
            initMasterVolume() {
                const slider = document.getElementById("master-volume");
                const percentage = document.getElementById("master-volume-percentage");
                if (!slider || !percentage) return;
                slider.value = this.config.initialMasterVolume;
                percentage.textContent = Math.round(this.config.initialMasterVolume * 100);
                slider.addEventListener("input", e => {
                    const vol = parseFloat(e.target.value);
                    if (this.state.masterGainNode) this.state.masterGainNode.gain.setTargetAtTime(vol, this.state.audioContext.currentTime, 0.01);
                    percentage.textContent = Math.round(vol * 100);
                });
            },
            initGlobalActions() {
                const stopBtn = document.getElementById("stop-all-btn");
                if (stopBtn) stopBtn.addEventListener("click", () => Object.keys(this.state.playingNodes).forEach(id => this.audio.stop(id, 0.05)));
                
                const fadeSelect = document.getElementById("fade-time-select");
                const fadeDisplay = document.getElementById("fade-time-display");
                const fadeTrigger = document.getElementById("fade-trigger-btn");
                
                if (fadeSelect && fadeDisplay) {
                    fadeSelect.addEventListener("change", (e) => {
                        fadeDisplay.textContent = e.target.value + 's';
                    });
                }

                if (fadeTrigger && fadeSelect) {
                    fadeTrigger.addEventListener("click", () => {
                        const fadeTime = parseFloat(fadeSelect.value);
                        Object.keys(this.state.playingNodes).forEach(id => this.audio.stop(id, fadeTime));
                    });
                }
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
                            /* Fetch from file path */
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
                            /* Decode base64 using safe atob (works reliably for large files without URL length limits) */
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
                       render() {
                const grid = document.getElementById("sound-grid");
                grid.innerHTML = "";
                
                const padSize = parseFloat(document.querySelector('.resize-slider')?.value || 200);
                const isCompact = padSize < 175;
                const isUltraCompact = padSize < 145;

                this.config.board.sounds.forEach(sound => {
                    if (sound.hidden && !this.state.showHiddenSounds) {
                        return; /* Skip hidden sounds */
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
                    
                    /* Restore playing class if active */
                    const playingNode = this.state.playingNodes[sound.id];
                    if (playingNode) {
                        pad.classList.add(playingNode.status === 'playing' ? 'is-playing' : 'is-paused');
                    }

                    pad.setAttribute('draggable', 'true'); 
                    
                    const colorStyle = this.config.colorStyles[sound.color];
                    pad.style.background = colorStyle ? colorStyle.background : '#374151';
                    pad.style.setProperty("--pad-border-color", this.config.colors[sound.color] || '#6366f1');

                    const isWhitePad = sound.color === 'white';
                    const textColor = isWhitePad ? '#1f2937' : 'white';
                    const secondaryTextColor = isWhitePad ? '#4b5563' : '#d1d5db';
                    pad.style.color = textColor;

                    if (isError) pad.classList.add("is-error");

                    /* Archived badge overlay */
                    const archivedOverlay = sound.hidden ? '<div class="archived-badge"><span>Archivado</span></div>' : '';

                    /* Operator instructions trigger (bulb icon) */
                    const instructionsButton = (sound.instructions && sound.instructions.trim().length > 0) ? 
                        '<div style="position: absolute; top: 6px; right: 6px; z-index: 35;">' +
                            '<button class="instruction-btn" title="Ver guía del operador">' +
                                this.config.icons.bulb +
                            '</button>' +
                            '<div class="instruction-tooltip">' + sound.instructions + '</div>' +
                        '</div>' : '';

                    /* Define what to render in time display / buttons row depending on size */
                    let loopButtonHtml = '<button class="loop-btn ' + (sound.loop ? 'is-active' : '') + '" title="Toggle Loop">' + this.config.icons.loop + '</button>';
                    let quickBtnHtml = '';
                    if (isCompact) {
                        quickBtnHtml = 
                            '<button class="loop-btn quick-controls-btn" style="background: rgba(99, 102, 241, 0.6); color: white; border-color: transparent; margin-left: 4px;" title="Controles">' +
                                this.config.icons.sliders +
                            '</button>';
                    }

                    let footerContent = '';
                    if (!isUltraCompact) {
                        footerContent = 
                            '<div class="time-display" style="color: ' + secondaryTextColor + '">' +
                                '<span>00:00.0</span>' +
                                loopButtonHtml +
                                quickBtnHtml +
                                '<span>' + (isError ? 'ERROR' : this.util.formatTime(duration)) + '</span>' +
                            '</div>';
                    } else {
                        /* Ultra compact just shows play/pause and tiny controls/loop or time */
                        footerContent = 
                            '<div class="time-display" style="color: ' + secondaryTextColor + '; justify-content: center; gap: 6px;">' +
                                loopButtonHtml +
                                quickBtnHtml +
                            '</div>';
                    }

                    pad.innerHTML = archivedOverlay + instructionsButton +
                        '<div class="rearrange-overlay">' + this.config.icons.move + '</div><div class="progress-overlay"></div>' +
                        '<div class="play-indicator">' +
                            '<div class="play-arrow"></div>' +
                            '<div class="play-arrow"></div>' +
                            '<div class="play-arrow"></div>' +
                        '</div>' +
                        '<div class="pad-content">' +
                            '<h3 class="pad-name" title="' + sound.name + '">' + sound.name + '</h3>' +
                            (sound.stopActions && sound.stopActions.find(a => a.type === 'play') ? (function() {
                                    const playNextAction = sound.stopActions.find(a => a.type === 'play');
                                    const nextSound = app.config.board.sounds.find(s => s.id === playNextAction.soundId);
                                    return nextSound ? '<div style="display: flex; align-items: center; gap: 4px; font-size: 10px; font-weight: bold; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 9999px; width: fit-content; color: #a5b4fc; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;" title="Al finalizar, reproduce automáticamente: ' + nextSound.name + '">' +
                                        '<span>🔗 Siguiente:</span>' +
                                        '<span style="overflow: hidden; text-overflow: ellipsis; max-width: 80px;">' + nextSound.name + '</span>' +
                                        '<span>➡️</span>' +
                                    '</div>' : '';
                                })() : '') +
                            '<div style="flex-grow: 1; display: flex; align-items: center; justify-content: center;"><button class="play-pause-btn" ' + (isError ? 'disabled' : '') + '>' + (isError ? this.config.icons.error : (playingNode && playingNode.status === 'playing' ? this.config.icons.pause : this.config.icons.play)) + '</button></div>' +
                            '<div class="pad-footer">' +
                                footerContent +
                            '</div>' +
                        '</div>' +
                        '<div class="volume-slider-container"><input type="range" class="vertical-slider" min="0" max="1" step="0.01" value="' + sound.volume + '"></div>';
                    grid.appendChild(pad);

                    const playBtn = pad.querySelector('.play-pause-btn');
                    const volumeSlider = pad.querySelector('.vertical-slider');
                    const loopBtn = pad.querySelector('.loop-btn:not(.quick-controls-btn)');
                    const quickControlsBtn = pad.querySelector('.quick-controls-btn');
                    const instructionBtn = pad.querySelector('.instruction-btn');
                    const tooltip = pad.querySelector('.instruction-tooltip');
                    
                    pad.addEventListener("click", e => {
                        if(e.target.closest('button') || e.target.closest('input')) return;
                        this.audio.togglePlay(sound);
                    });
                    
                    if (playBtn) playBtn.addEventListener("click", e => { e.stopPropagation(); this.audio.togglePlay(sound); });
                    
                    if (volumeSlider) {
                        volumeSlider.addEventListener("input", e => {
                            const newVol = parseFloat(e.target.value);
                            sound.volume = newVol;
                            const node = this.state.playingNodes[sound.id];
                            if (node) node.gainNode.gain.setTargetAtTime(newVol, this.state.audioContext.currentTime, 0.01);
                        });
                        volumeSlider.addEventListener("click", e => e.stopPropagation());
                    }
                    
                    if (loopBtn) {
                         loopBtn.addEventListener('click', e => {
                            e.stopPropagation();
                            sound.loop = !sound.loop;
                            const node = this.state.playingNodes[sound.id];
                            if (node) node.source.loop = sound.loop;
                            loopBtn.classList.toggle('is-active', sound.loop);
                        });
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

                    this.state.domCache[sound.id] = { pad, playBtn, loopBtn, volumeSlider,
                        progress: pad.querySelector('.progress-overlay'),
                        currentTime: pad.querySelector('.time-display span:first-child')
                    };
                });
            },          },
            updateUI() {
                const playingIds = Object.keys(this.state.playingNodes);
                if (playingIds.length === 0) { this.state.animationFrameId = null; return; }

                playingIds.forEach(id => {
                    const node = this.state.playingNodes[id];
                    const sound = this.config.board.sounds.find(s => s.id === id);
                    if (!node || !sound) return;
                    
                    const {currentTime, progress} = this.state.domCache[id];
                    if (node.status === "playing") {
                        const buffer = this.state.audioBuffers[sound.audioSourceId];
                        const duration = (buffer instanceof AudioBuffer) ? (sound.endTime ?? buffer.duration) - sound.startTime : 0;
                        const elapsed = (this.state.audioContext.currentTime - node.contextStartTime) * (sound.pitch ?? 1.0);
                        let current = node.progress + elapsed;
                        const soundEndTime = sound.endTime ?? (buffer instanceof AudioBuffer ? buffer.duration : 0);
                        
                        if(sound.loop && duration > 0) current %= soundEndTime;
                        const relativeCurrentTime = current - sound.startTime;
                        
                        currentTime.textContent = this.util.formatTime(relativeCurrentTime);
                        progress.style.width = duration > 0 ? \`\\\${Math.min(100, (relativeCurrentTime / duration) * 100)}%\` : "0%";
                    }
                });
                this.state.animationFrameId = requestAnimationFrame(() => this.updateUI());
            },
            audio: {
                stop(soundId, fadeDuration = 0) {
                    const node = app.state.playingNodes[soundId];
                    if (!node) return;
                    if(node.fadeTimeoutId) clearTimeout(node.fadeTimeoutId);
                    
                    const ac = app.state.audioContext;
                    if (fadeDuration > 0 && node.gainNode && ac) {
                        node.gainNode.gain.cancelScheduledValues(ac.currentTime);
                        node.gainNode.gain.setValueAtTime(node.gainNode.gain.value, ac.currentTime);
                        node.gainNode.gain.linearRampToValueAtTime(0, ac.currentTime + fadeDuration);
                        node.fadeTimeoutId = setTimeout(() => app.audio._hardStop(soundId), fadeDuration * 1000);
                    } else {
                        app.audio._hardStop(soundId);
                    }
                },
                _hardStop(soundId) {
                    const node = app.state.playingNodes[soundId];
                    if (!node) return;
                    if(node.fadeTimeoutId) clearTimeout(node.fadeTimeoutId);
                    if (node.source) { node.source.onended = null; try { node.source.stop(); } catch(e){} }
                    delete app.state.playingNodes[soundId];
                    const {pad, playBtn, progress, currentTime} = app.state.domCache[soundId];
                    pad.classList.remove('is-playing', 'is-paused');
                    playBtn.innerHTML = app.config.icons.play;
                    progress.style.width = "0%";
                    currentTime.textContent = app.util.formatTime(0);
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
                    const elapsed = (app.state.audioContext.currentTime - node.contextStartTime) * (sound.pitch ?? 1.0);
                    node.progress += elapsed;
                    node.status = "paused";
                    if (node.source) { node.source.onended = null; try { node.source.stop(); } catch(e){} }
                    const {pad, playBtn} = app.state.domCache[soundId];
                    pad.classList.remove('is-playing');
                    pad.classList.add('is-paused');
                    playBtn.innerHTML = app.config.icons.play;
                },
                play(sound, offset) {
                    const buffer = app.state.audioBuffers[sound.audioSourceId];
                    if (!(buffer instanceof AudioBuffer)) return;
                    if (app.state.playingNodes[sound.id]) app.audio._hardStop(sound.id);
                    
                    const ac = app.state.audioContext;
                    const source = ac.createBufferSource();
                    const gainNode = ac.createGain();
                    source.buffer = buffer;
                    source.loop = sound.loop;
                    if (sound.loop) {
                        source.loopStart = sound.startTime ?? 0;
                        source.loopEnd = sound.endTime ?? buffer.duration;
                    }
                    source.playbackRate.value = sound.pitch ?? 1.0;
                    source.connect(gainNode).connect(app.state.masterGainNode);
                    
                    const now = ac.currentTime;
                    gainNode.gain.setValueAtTime(sound.volume ?? 0.75, now);
                    
                    const soundEndTime = sound.endTime ?? buffer.duration;
                    const durationToPlay = soundEndTime - offset;

                    source.start(now, offset, sound.loop ? undefined : durationToPlay);
                    app.state.playingNodes[sound.id] = { source, gainNode, status: "playing", contextStartTime: now, progress: offset };
                    source.onended = () => { 
                        if (app.state.playingNodes[sound.id]?.source === source && !sound.loop) {
                            app.audio.stop(sound.id); 
                            
                            /* Trigger play on finish automation */
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

                    const {pad, playBtn} = app.state.domCache[sound.id];
                    pad.classList.remove('is-paused');
                    pad.classList.add('is-playing');
                    playBtn.innerHTML = app.config.icons.pause;

                    if (!app.state.animationFrameId) app.state.animationFrameId = requestAnimationFrame(() => app.updateUI());
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


import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { PlaybackStatus } from '../types';
import { FadeOutIcon, StopIcon, SpeakerWaveIcon, SpeakerXMarkIcon, PlayIcon, PauseIcon } from './icons';

interface GlobalControlsProps {
    onPauseAll: () => void;
    onResumeAll: () => void;
}

const GlobalControls: React.FC<GlobalControlsProps> = ({ onPauseAll, onResumeAll }) => {
    const { state, dispatch, handleFadeAll, handleStopAll } = useAppContext();
    const { isMuted, masterVolume, playbackStates, globalFadeDuration } = state;

    // FIX: Add explicit type to the parameter of `some` to avoid 'unknown' type error.
    const isAnyPlaying = Object.values(playbackStates).some((s: PlaybackStatus) => s.status === 'playing');
    // FIX: Add explicit type to the parameter of `some` to avoid 'unknown' type error.
    const isAnyPaused = Object.values(playbackStates).some((s: PlaybackStatus) => s.status === 'paused');
    const isAnySoundActive = isAnyPlaying || isAnyPaused;

    return (
        <div className="global-transport-bar" role="toolbar" aria-label="Controles Globales">
            {/* Transport Controls */}
            <div className="transport-group">
                <button onClick={handleStopAll} disabled={!isAnySoundActive} className="transport-btn" title="Detener Todo (Inmediato)">
                    <StopIcon className="w-6 h-6" />
                </button>
                <button onClick={onResumeAll} disabled={!isAnyPaused} className="transport-btn" title="Reanudar Todo">
                    <PlayIcon className="w-6 h-6" />
                </button>
                <button onClick={onPauseAll} disabled={!isAnyPlaying} className="transport-btn" title="Pausar Todo">
                    <PauseIcon className="w-6 h-6" />
                </button>
            </div>

            {/* Master Volume */}
            <div className="master-volume-container mx-4">
                <button onClick={() => dispatch({ type: 'TOGGLE_MUTE' })} className="p-2 rounded-full hover:bg-gray-600" title={isMuted ? 'Quitar Silencio' : 'Silencio Global'}>
                    {isMuted ? <SpeakerXMarkIcon className="h-6 w-6 text-yellow-400" /> : <SpeakerWaveIcon className="h-6 w-6" />}
                </button>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={masterVolume}
                    onChange={(e) => dispatch({ type: 'SET_MASTER_VOLUME', payload: parseFloat(e.target.value) })}
                    disabled={isMuted}
                    className="master-fader-horizontal"
                    aria-label="Volumen Maestro"
                />
                <span className="font-semibold font-mono text-sm text-white w-12 text-center tabular-nums">{Math.round(masterVolume * 100)}%</span>
            </div>

            {/* Fade All Control */}
            <div className="transport-group">
                <button onClick={() => handleFadeAll(globalFadeDuration)} disabled={!isAnySoundActive} className="transport-btn" title="Desvanecer Todos los Sonidos">
                    <FadeOutIcon className="w-6 h-6" />
                </button>
                <select 
                    value={globalFadeDuration} 
                    onChange={e => dispatch({ type: 'SET_GLOBAL_FADE_DURATION', payload: Number(e.target.value) })}
                    className="fade-select"
                    aria-label="Duración del desvanecimiento"
                >
                    <option value="1">1s</option>
                    <option value="3">3s</option>
                    <option value="5">5s</option>
                    <option value="10">10s</option>
                </select>
            </div>
        </div>
    );
};

export default GlobalControls;
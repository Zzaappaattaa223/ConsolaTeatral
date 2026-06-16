import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { getAudioContext, renderAudioWithEffects } from '../lib/audio';
import { fadeAudio } from '../lib/audio';
import { soundColors, soundGlowColors, soundBorderColors } from '../constants';
import { Sound, PlaybackStatus } from '../types';
import { PlayIcon, PauseIcon, ErrorIcon, SpeakerWaveIcon, LoopIcon, SoloIcon, FadeOutIcon, StopIcon, EditIcon, TrashIcon, DownloadIcon, MoveIcon } from './icons';
import { bufferToWaveBlob } from '../lib/utils';

const SoundPad = React.memo(({ sound, playbackState, isSolo, isDimmed, onPlay, onPause, onStop, onFadeOut, onEdit, editMode, isRearrangeMode, padSize = 224 }: {
    sound: Sound;
    playbackState?: PlaybackStatus;
    isSolo: boolean;
    isDimmed: boolean;
    onPlay: (sound: Sound) => void;
    onPause: (soundId: string) => void;
    onStop: (soundId: string) => void;
    onFadeOut: (soundId: string) => void;
    onEdit: (sound: Sound) => void;
    editMode: boolean;
    isRearrangeMode?: boolean;
    padSize?: number;
}) => {
    const { state, dispatch, playingAudioNodesRef, updateSoundVolume } = useAppContext();
    
    const buffer = state.audioSources[sound.audioSourceId];
    const imageUrl = sound.imageId ? state.imageSources[sound.imageId] : null;

    const duration = buffer instanceof AudioBuffer ? (sound.endTime ?? buffer.duration) - (sound.startTime ?? 0) : 0;
    const isLoaded = buffer instanceof AudioBuffer;
    const isLoading = buffer === 'loading';
    const isError = buffer === 'error';
    const isRetriggerable = sound.retriggerable;
    const isPlaying = !isRetriggerable && playbackState?.status === 'playing';

    const playNextAction = sound.stopActions?.find(action => action.type === 'play');
    const nextSoundName = playNextAction ? state.soundboards.flatMap(b => b.sounds).find(s => s.id === playNextAction.soundId)?.name : null;

    const [currentTime, setCurrentTime] = useState(0);
    const [visualVolume, setVisualVolume] = useState(sound.volume);
    const [isFadingOut, setIsFadingOut] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [showControlsModal, setShowControlsModal] = useState(false);
    const [showInstructionsTooltip, setShowInstructionsTooltip] = useState(false);
    const animationFrameRef = useRef<number | null>(null);
    const glowRef = useRef<HTMLDivElement>(null);

    const isCompact = padSize < 175;
    const isUltraCompact = padSize < 145;

    useEffect(() => {
        const audioSetup = playingAudioNodesRef.current[sound.id];
        if (audioSetup && audioSetup.panner) {
            audioSetup.panner.pan.setTargetAtTime(sound.pan ?? 0, getAudioContext().currentTime, 0.015);
        }
    }, [sound.pan, playingAudioNodesRef]);

    const updateGlowAndTimer = useCallback(() => {
        const soundPlaybackState = state.playbackStates[sound.id];
        const audioSetup = playingAudioNodesRef.current[sound.id];

        if (!audioSetup) {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            if (glowRef.current) glowRef.current.style.boxShadow = `0 0 0px 0px rgba(0, 0, 0, 0)`;
            setVisualVolume(sound.volume);
            setIsFadingOut(false);
            return;
        }

        const mainGainNode = audioSetup.gainNode || (audioSetup.crossfadeNodes && audioSetup.crossfadeNodes[0]?.gainNode);
        if (mainGainNode) {
            setVisualVolume(mainGainNode.gain.value);
        }
        setIsFadingOut(audioSetup.fadeState === 'out');

        if (soundPlaybackState?.status === 'playing') {
            const context = getAudioContext();
            const pitch = sound.pitch ?? 1.0;
            const elapsedTime = (context.currentTime - soundPlaybackState.contextStartTime) * pitch;
            const absoluteCurrentTime = soundPlaybackState.progress + elapsedTime;
            const relativeCurrentTime = absoluteCurrentTime - (sound.startTime ?? 0);
            setCurrentTime(sound.loop ? relativeCurrentTime % duration : Math.min(relativeCurrentTime, duration));
            
            if (audioSetup.analyser) {
                const { analyser } = audioSetup;
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteTimeDomainData(dataArray);

                let sumSquares = 0.0;
                for (const amplitude of dataArray) {
                    const val = (amplitude / 128.0) - 1.0;
                    sumSquares += val * val;
                }
                const rms = Math.sqrt(sumSquares / dataArray.length);
                
                const baseGlow = 8;
                const dynamicGlow = rms * 60;
                const maxGlow = 30;
                const finalGlowAmount = Math.min(baseGlow + dynamicGlow, maxGlow);
                const glowColor = soundGlowColors[sound.color] || '#ffffff';
                if (glowRef.current) {
                     glowRef.current.style.boxShadow = `0 0 ${finalGlowAmount}px ${finalGlowAmount / 3}px ${glowColor}`;
                }
            }
        } else {
             if (glowRef.current) glowRef.current.style.boxShadow = '0 0 0px 0px rgba(0, 0, 0, 0)';
        }
        
        animationFrameRef.current = requestAnimationFrame(updateGlowAndTimer);

    }, [sound.id, sound.color, sound.loop, duration, playingAudioNodesRef, state.playbackStates, sound.startTime, sound.volume, sound.pitch]);

    useEffect(() => {
        if (playbackState && !isRetriggerable) {
            const relativeProgress = playbackState.progress - (sound.startTime ?? 0);
            setCurrentTime(relativeProgress >= 0 ? relativeProgress : 0);
            updateGlowAndTimer();
        } else {
            setCurrentTime(0);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            if (glowRef.current) glowRef.current.style.boxShadow = '0 0 0px 0px rgba(0, 0, 0, 0)';
            setVisualVolume(sound.volume);
            setIsFadingOut(false);
        }

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [playbackState, updateGlowAndTimer, sound.startTime, sound.volume, isRetriggerable]);
    
    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        updateSoundVolume(sound.id, newVolume);
        setVisualVolume(newVolume);
    };

    const handlePlayPause = (e: React.MouseEvent) => {
        e.stopPropagation();
        
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume();
        }

        if (isError) {
            alert(`Fallo de decodificación: El sonido "${sound.name}" no se pudo reproducir.\n\nEsto suele suceder si el archivo está corrupto o si su navegador no soporta este formato de audio en particular (por ejemplo, Safari tiene limitaciones para decodificar ciertos archivos de tipo OGG o AAC no estándar).\n\nRecomendación: Intente convertir el archivo a un formato MP3 o WAV estéreo estándar (44.1 kHz / 16-bit) e impórtelo de nuevo.`);
            return;
        }

        if(!isLoaded) return;
        if (isRetriggerable) {
            onPlay(sound);
            const glowEl = glowRef.current;
            if (glowEl) {
                glowEl.style.setProperty('--glow-color', soundGlowColors[sound.color] || '#facc15');
                glowEl.classList.remove('flash');
                void glowEl.offsetWidth;
                glowEl.classList.add('flash');
            }
        } else {
            if (isPlaying) {
                onPause(sound.id);
            } else {
                onPlay(sound);
            }
        }
    };
    
    const handleLoopToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newLoopState = !sound.loop;
        dispatch({ type: 'UPDATE_SOUND', payload: { soundId: sound.id, updates: { loop: newLoopState } } });
        
        const audioNodes = playingAudioNodesRef.current[sound.id];
        // Crossfade loops are handled by setTimeout and need a full restart to change loop mode,
        // so we only toggle the property on the source node for simple loops.
        if (audioNodes?.source && (sound.crossfade ?? 0) <= 0) {
            audioNodes.source.loop = newLoopState;
        }
    };

    useEffect(() => {
        const audioSetup = playingAudioNodesRef.current[sound.id];
        if (audioSetup && !audioSetup.fadeState) {
            const context = getAudioContext();
            const newVolume = isDimmed ? 0 : (sound.volume ?? 0.75);

            const allGains: GainNode[] = [];
            if (audioSetup.gainNode) allGains.push(audioSetup.gainNode);
            if (audioSetup.crossfadeNodes) allGains.push(...audioSetup.crossfadeNodes.map(n => n.gainNode));

            allGains.forEach(gainNode => {
                if(gainNode) {
                    fadeAudio(gainNode, gainNode.gain.value, newVolume, 0.05, 'linear', context);
                }
            });
        }
    }, [isDimmed, sound.id, sound.volume, playingAudioNodesRef]);


    function formatTime(seconds: number): string {
        if (isNaN(seconds) || seconds < 0) return '00:00.0';
        const totalSeconds = seconds;
        const mins = Math.floor(totalSeconds / 60);
        const secs = Math.floor(totalSeconds % 60);
        const ms = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 10);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${ms}`;
    }

    const progress = (isRetriggerable || duration <= 0) ? 0 : (currentTime / duration) * 100;
    const padColorClass = soundColors[sound.color] || 'bg-gray-700';
    const borderColorClass = soundBorderColors[sound.color] || 'border-gray-500';
    
    const isWhitePad = sound.color === 'white';
    const textColor = isWhitePad ? 'text-gray-900' : 'text-white';
    const secondaryTextColor = isWhitePad ? 'text-gray-700' : 'text-gray-200';

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        
        // 1. Stop playback if it's currently running
        try {
            onStop(sound.id);
        } catch (err) {
            console.error("Error stopping sound on delete:", err);
        }

        // 2. Clean up associated information from IndexedDB if not used elsewhere
        if (state && state.soundboards) {
            const sourceUseCount = state.soundboards.reduce((count, board) => {
                return count + board.sounds.filter(s => s.audioSourceId === sound.audioSourceId).length;
            }, 0);
            
            if (sourceUseCount <= 1) {
                import('../lib/db').then(({ audioDB }) => {
                    audioDB.delete(sound.audioSourceId).catch(err => {
                        console.error("Error purging audio from IndexedDB:", err);
                    });
                });
            }

            if (sound.imageId) {
                const imageUseCount = state.soundboards.reduce((count, board) => {
                    return count + board.sounds.filter(s => s.imageId === sound.imageId).length;
                }, 0);
                
                if (imageUseCount <= 1) {
                    import('../lib/db').then(({ audioDB }) => {
                        audioDB.delete(sound.imageId!).catch(err => {
                            console.error("Error purging image from IndexedDB:", err);
                        });
                    });
                }
            }
        }

        // 3. Dispatch deletion event so card immediately disappears
        dispatch({ type: 'DELETE_SOUND', payload: { soundId: sound.id } });
    };

    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!(buffer instanceof AudioBuffer)) {
            alert("El audio original no está cargado. No se puede descargar.");
            return;
        }
        setIsDownloading(true);
        try {
            const renderedBuffer = await renderAudioWithEffects(sound, buffer);
            const blob = bufferToWaveBlob(renderedBuffer);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${sound.name.replace(/[^a-z0-9]/gi, '_')}.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Fallo al renderizar y descargar el audio:", err);
            alert("Error al descargar el audio.");
        } finally {
            setIsDownloading(false);
        }
    };


    if (editMode) {
        return (
            <div
                className={`relative z-10 touch-manipulation select-none rounded-lg flex flex-col h-full shadow-lg overflow-hidden ${padColorClass} border-2 border-transparent group transition-all ${sound.hidden ? 'opacity-60 bg-opacity-75' : ''}`}
            >
                {sound.hidden && (
                    <div className="absolute top-2 right-2 z-35 flex items-center justify-center">
                        <span className="text-[9px] uppercase font-black tracking-widest bg-amber-600 border border-amber-500/30 text-white px-2 py-0.5 rounded shadow">Archivado</span>
                    </div>
                )}
                {imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('blob:') && (
                    <>
                        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${imageUrl})` }}></div>
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm group-hover:bg-black/50 transition-colors"></div>
                    </>
                )}
                 <div className="absolute inset-0 bg-black/40 group-hover:bg-black/30 transition-colors"></div>

                <div className="relative z-10 p-2 flex flex-col justify-between h-full">
                    <h3 className={`font-bold text-sm break-words truncate-multiline text-left text-shadow-strong ${textColor}`} title={sound.name}>{sound.name}</h3>
                    
                    <div className="flex items-center justify-center gap-2 my-2 w-full px-1">
                         {isDownloading ? <div className="spinner w-10 h-10"></div> : (isConfirmingDelete ? (
                            <div className="bg-red-950/90 border border-red-500/40 rounded-lg p-1.5 flex flex-col items-center gap-1.5 w-full animate-fade-in">
                                <span className="text-[10px] font-extrabold text-red-300">¿Borrar sonido?</span>
                                <div className="flex gap-2 w-full justify-center">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDelete(e); }} 
                                        className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white font-extrabold text-[9px] rounded shadow transition-colors cursor-pointer"
                                    >
                                        Sí
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setIsConfirmingDelete(false); }} 
                                        className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-extrabold text-[9px] rounded shadow transition-colors cursor-pointer"
                                    >
                                        No
                                    </button>
                                </div>
                            </div>
                         ) : (
                            <>
                                <button onClick={handleDownload} title="Descargar Sonido (Renderizado)" className="pad-action-btn h-14 w-14 hover:bg-blue-500/50">
                                    <DownloadIcon className="h-7 w-7"/>
                                </button>
                                <button onClick={() => onEdit(sound)} title="Editar Sonido" className="pad-action-btn h-16 w-16 bg-black/40 hover:bg-indigo-500/50 block-drag">
                                    <EditIcon className="h-8 w-8"/>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setIsConfirmingDelete(true); }} title="Borrar Sonido" className="pad-action-btn h-14 w-14 hover:bg-red-500/50 text-red-400">
                                    <TrashIcon className="h-7 w-7" />
                                </button>
                            </>
                         ))}
                    </div>
                     {/* Play count in edit mode too */}
                    <div className="absolute bottom-2 right-2 text-xs font-mono opacity-70" style={{ color: secondaryTextColor }}>
                        #{sound.playCount || 0}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`relative z-10 touch-manipulation select-none rounded-lg flex flex-col h-full shadow-lg transition-all duration-200 ease-in-out overflow-hidden ${padColorClass} border-2 ${isPlaying ? borderColorClass : 'border-transparent'} ${isError ? 'border-red-500' : ''} ${!isLoaded && !isLoading ? 'opacity-50' : ''} ${sound.hidden ? 'bg-opacity-75' : ''}`} onMouseDown={() => !isRearrangeMode && getAudioContext()?.resume()}>
            {sound.hidden && (
                <div className="absolute inset-0 bg-gray-950/65 backdrop-blur-[1px] pointer-events-none z-25 flex items-center justify-center">
                    <span className="text-[10px] uppercase font-black tracking-widest bg-amber-600/90 text-white px-2 py-0.5 rounded shadow border border-amber-500/40">Archivado</span>
                </div>
            )}
            {/* Rearrange Overlay */}
            {isRearrangeMode && (
                <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center cursor-move transition-opacity duration-200">
                    <div className="bg-white/20 p-4 rounded-full text-white drop-shadow-lg">
                        <MoveIcon className="w-12 h-12 opacity-90" />
                    </div>
                </div>
            )}

            {imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('blob:') && (
                <>
                    <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${imageUrl})` }}></div>
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
                </>
            )}

            <div 
                className="absolute top-0 left-0 bottom-0 bg-white bg-opacity-20 z-0 pointer-events-none"
                style={{ width: `${isError ? 100 : progress}%`, transition: 'width 0.05s linear', background: isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.2)' }}
                aria-hidden="true"
            ></div>
            <div ref={glowRef} id={`glow-${sound.id}`} className="sound-pad-glow" onAnimationEnd={(e) => e.currentTarget.classList.remove('flash')}></div>
            
            {sound.color === 'disabled' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                    <div className="w-[110%] h-2 bg-red-500 transform -rotate-6 opacity-70 shadow-lg border-y-2 border-red-600"></div>
                </div>
            )}

            <div className={`sound-pad-content flex flex-col justify-between h-full flex-grow min-h-0 ${isCompact ? 'p-1' : 'p-2'}`}>
                <div className={`pad-action-group flex items-center justify-between gap-1 w-full z-30 ${isCompact ? 'scale-90 origin-top' : ''}`}>
                    {!isUltraCompact ? (
                        <>
                            <button onClick={handleLoopToggle} disabled={isRearrangeMode} className={`pad-action-btn ${sound.loop ? 'active-loop' : ''}`} title="Loop">
                                <LoopIcon className={isCompact ? "w-4 h-4" : "w-5 h-5"} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); dispatch({ type: 'TOGGLE_SOLO', payload: sound.id }); }} disabled={isRearrangeMode} className={`pad-action-btn ${isSolo ? 'active-solo' : ''}`} title="Solo">
                                <SoloIcon className={isCompact ? "w-4 h-4" : "w-5 h-5"} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onFadeOut(sound.id); }} disabled={!playbackState || isRearrangeMode} className={`pad-action-btn ${isFadingOut ? 'active-fade' : ''}`} title={isFadingOut ? "Restaurar Volumen" : "Desvanecer"}>
                                <FadeOutIcon className={isCompact ? "w-4 h-4" : "w-5 h-5"} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onStop(sound.id); }} disabled={!playbackState || isRearrangeMode} className="pad-action-btn" title="Detener">
                                <StopIcon className={isCompact ? "w-4 h-4" : "w-5 h-5"} />
                            </button>
                        </>
                    ) : (
                        <button onClick={(e) => { e.stopPropagation(); onStop(sound.id); }} disabled={!playbackState || isRearrangeMode} className="pad-action-btn bg-black/20 hover:bg-red-900/30 p-1 rounded" title="Detener">
                            <StopIcon className="w-4 h-4" />
                        </button>
                    )}
                    
                    {/* Controls modal trigger button */}
                    {isCompact && (
                        <button onClick={(e) => { e.stopPropagation(); setShowControlsModal(true); }} className="pad-action-btn bg-indigo-600/60 hover:bg-indigo-500 p-1 rounded text-white flex items-center justify-center cursor-pointer ml-auto" title="Controles de Ficha">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                            </svg>
                        </button>
                    )}

                    {/* Archive toggle button */}
                    <button 
                        onClick={(e) => { e.stopPropagation(); dispatch({ type: 'UPDATE_SOUND', payload: { soundId: sound.id, updates: { hidden: !sound.hidden } } }); }} 
                        className={`pad-action-btn p-1 rounded transition-colors ${sound.hidden ? 'text-amber-400 bg-amber-950/20' : 'text-gray-400 hover:text-white bg-black/15'}`} 
                        title={sound.hidden ? "Desarchivar Ficha" : "Archivar Ficha"}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className={isCompact ? "w-4 h-4" : "w-5 h-5"} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            {sound.hidden ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                            )}
                        </svg>
                    </button>
                </div>

                <div className="flex flex-col z-10 gap-0.5 text-left w-full mt-1">
                    <div className="flex justify-between items-start gap-1 w-full relative">
                        <h3 className={`font-bold break-words truncate-multiline flex-grow text-shadow-strong leading-tight ${isCompact ? 'text-[11px]' : 'text-sm'} ${textColor}`} title={sound.name}>{sound.name}</h3>
                        
                        {/* Operator guidance indicator */}
                        {sound.instructions && sound.instructions.trim().length > 0 && (
                            <div className="relative flex-shrink-0">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setShowInstructionsTooltip(!showInstructionsTooltip); }}
                                    className="p-0.5 bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 rounded text-amber-300 hover:text-amber-200 transition-all focus:outline-none cursor-pointer flex items-center justify-center"
                                    title="Ver guía del operador"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.46 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />
                                    </svg>
                                </button>
                                
                                {showInstructionsTooltip && (
                                    <>
                                        <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setShowInstructionsTooltip(false); }} />
                                        <div className="absolute right-0 bottom-6 w-56 p-2.5 bg-gray-950/95 border border-amber-500/40 rounded-lg shadow-xl text-[10px] text-amber-200 font-sans z-50 leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap animate-fade-in" onClick={e => e.stopPropagation()}>
                                            <div className="font-extrabold text-amber-400 mb-1 border-b border-amber-500/20 pb-0.5 text-[9px] tracking-wide">ℹ️ INSTRUCCIONES DEL OPERADOR:</div>
                                            {sound.instructions}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    {nextSoundName && !isCompact && (
                        <div className="flex items-center gap-1.5 text-[9px] font-bold bg-black/40 border border-white/10 px-2 py-0.5 rounded-full w-fit text-indigo-200 shadow-sm animate-fade-in" title={`Al finalizar: ${nextSoundName}`}>
                            <span>🔗 Siguiente:</span>
                            <span className="truncate max-w-[80px]">{nextSoundName}</span>
                        </div>
                    )}
                </div>
                
                <div className="flex-grow flex items-center justify-center my-0.5 z-10">
                     <button 
                         onClick={handlePlayPause} 
                         disabled={(!isLoaded && !isError) || isRearrangeMode} 
                         className={`bg-black bg-opacity-25 rounded-full focus:outline-none focus:ring-2 focus:ring-white transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-wait ${
                             isUltraCompact ? 'p-2' : isCompact ? 'p-2.5' : 'p-4'
                         }`}
                         title={isError ? "Ver detalles de error de decodificación" : "Reproducir/Pausar"}
                     >
                        {isLoading ? <div className={`spinner ${isCompact ? 'w-5 h-5' : 'w-8 h-8'}`}></div> : (isError ? <ErrorIcon className={isCompact ? "w-5 h-5 text-red-400" : "w-8 h-8 text-red-400"}/> : (isPlaying ? <PauseIcon className={`${isCompact ? 'w-5 h-5' : 'w-8 h-8'} ${textColor}`} /> : <PlayIcon className={`${isCompact ? 'w-5 h-5' : 'w-8 h-8'} ${textColor}`} />))}
                    </button>
                </div>
                
                {!isUltraCompact && (
                    <div className="z-10 text-[11px] flex-shrink-0 relative mt-0.5">
                         <div className={`flex items-center justify-between mb-1 ${secondaryTextColor}`}>
                            <span className="time-display-bg text-shadow-strong flex-shrink-0">{isRetriggerable ? '--:--.-' : formatTime(currentTime)}</span>
                            <span className="time-display-bg text-shadow-strong flex-shrink-0">{isLoaded ? formatTime(duration) : (isError ? 'ERROR' : '--:--.-')}</span>
                        </div>
                        {!isCompact ? (
                            <div className="flex items-center gap-1.5 pr-5">
                                <SpeakerWaveIcon className={`w-4 h-4 flex-shrink-0 ${secondaryTextColor}`} />
                                <input
                                    type="range"
                                    min="0" max="1" step="0.01"
                                    value={visualVolume}
                                    onChange={handleVolumeChange}
                                    className="pad-volume-fader w-full"
                                    onClick={e => e.stopPropagation()}
                                    aria-label="Volumen del sonido"
                                    disabled={isRearrangeMode}
                                />
                                <span className={`font-mono font-semibold text-xs w-7 text-center ${textColor}`}>
                                    {Math.round(visualVolume * 100)}
                                </span>
                            </div>
                        ) : (
                            <div className="flex justify-center text-[9px] font-mono opacity-50 select-none pb-0.5 text-center w-full">
                                Vol: {Math.round(visualVolume * 100)}%
                            </div>
                        )}
                        {/* Play Counter Badge */}
                        <div className="absolute bottom-0 right-0 opacity-60" title="Contador de reproducciones">
                            <span className="font-mono text-[9px]" style={{ color: secondaryTextColor }}>#{sound.playCount || 0}</span>
                        </div>
                    </div>
                )}
                
                {isUltraCompact && (
                    <div className="z-10 flex-shrink-0 text-center font-mono text-[9px] opacity-65 flex justify-between w-full px-0.5" style={{ color: secondaryTextColor }}>
                        <span>{isRetriggerable ? 'POLY' : formatTime(currentTime)}</span>
                        <span>#{sound.playCount || 0}</span>
                    </div>
                )}
            </div>
            
            {/* Pop-up Controls Modal for Compact/Ultra-compact sizes */}
            {showControlsModal && (
                <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowControlsModal(false)}>
                    <div 
                        className={`w-full max-w-md ${padColorClass} rounded-2xl border ${borderColorClass} shadow-2xl p-6 text-white space-y-5 relative`} 
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Close button */}
                        <button 
                            onClick={() => setShowControlsModal(false)} 
                            className="absolute top-4 right-4 text-gray-400 hover:text-white bg-black/20 hover:bg-black/40 p-1.5 rounded-full transition-colors cursor-pointer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        {/* Title */}
                        <div>
                            <span className="text-[10px] uppercase font-extrabold tracking-widest opacity-60">Consola de Ficha</span>
                            <h3 className="text-lg font-black truncate">{sound.name}</h3>
                        </div>

                        {/* Transport */}
                        <div className="flex justify-center items-center gap-4 bg-black/30 p-4 rounded-xl border border-white/5">
                            <button 
                                onClick={handlePlayPause} 
                                disabled={(!isLoaded && !isError)} 
                                className="p-4 bg-indigo-600 hover:bg-indigo-500 rounded-full shadow-lg shadow-indigo-600/30 active:scale-95 transition-all cursor-pointer"
                            >
                                {isLoading ? <div className="spinner w-8 h-8"></div> : (isError ? <ErrorIcon className="w-8 h-8 text-red-400" /> : (isPlaying ? <PauseIcon className="w-8 h-8 text-white" /> : <PlayIcon className="w-8 h-8 text-white" />))}
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onFadeOut(sound.id); }} 
                                disabled={!playbackState} 
                                className={`p-3 bg-gray-800 hover:bg-gray-700 rounded-full border border-gray-700 transition-all cursor-pointer ${isFadingOut ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'text-gray-300'}`} 
                                title="Desvanecer"
                            >
                                <FadeOutIcon className="w-6 h-6" />
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onStop(sound.id); }} 
                                disabled={!playbackState} 
                                className="p-3 bg-gray-800 hover:bg-red-900/40 hover:text-red-300 rounded-full border border-gray-700 transition-all cursor-pointer" 
                                title="Detener"
                            >
                                <StopIcon className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Faders */}
                        <div className="space-y-4 bg-black/20 p-4 rounded-xl border border-white/5 text-left">
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold text-gray-300">
                                    <span>Volumen</span>
                                    <span className="font-mono text-indigo-300">{Math.round(visualVolume * 100)}%</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0" max="1" step="0.01" 
                                    value={visualVolume} 
                                    onChange={handleVolumeChange} 
                                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-indigo-500 bg-gray-800" 
                                />
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold text-gray-300">
                                    <span>Tono (Pitch)</span>
                                    <span className="font-mono text-indigo-300">{(sound.pitch ?? 1.0).toFixed(2)}x</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0.5" max="2.0" step="0.01" 
                                    value={sound.pitch ?? 1.0} 
                                    onChange={e => dispatch({ type: 'UPDATE_SOUND', payload: { soundId: sound.id, updates: { pitch: parseFloat(e.target.value) } } })} 
                                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-indigo-500 bg-gray-800" 
                                />
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold text-gray-300">
                                    <span>Balance (Pan)</span>
                                    <span className="font-mono text-indigo-300">{(sound.pan ?? 0).toFixed(2)}</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="-1" max="1" step="0.01" 
                                    value={sound.pan ?? 0} 
                                    onChange={e => dispatch({ type: 'UPDATE_SOUND', payload: { soundId: sound.id, updates: { pan: parseFloat(e.target.value) } } })} 
                                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-indigo-500 bg-gray-800" 
                                />
                            </div>
                        </div>

                        {/* Instructions */}
                        <div className="bg-black/25 p-4 rounded-xl border border-white/5 text-left space-y-1 max-h-36 overflow-y-auto">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">Instrucciones de Operación</span>
                            <p className="text-xs text-gray-300 font-sans leading-relaxed whitespace-pre-wrap">
                                {sound.instructions || 'Sin indicaciones cargadas para esta ficha.'}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default SoundPad;
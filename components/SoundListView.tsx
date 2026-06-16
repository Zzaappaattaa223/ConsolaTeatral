import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { Sound, Soundboard } from '../types';
import { PlayIcon, PauseIcon, ErrorIcon, FadeOutIcon, StopIcon, SoloIcon, LoopIcon, DoubleCheckIcon, EditIcon, TrashIcon, DownloadIcon } from './icons';
import { getAudioContext, renderAudioWithEffects } from '../lib/audio';
import { fadeAudio } from '../lib/audio';
import { bufferToWaveBlob } from '../lib/utils';

const SoundRow = ({ sound, onPlay, onPause, onStop, onFadeOut, onEdit, isDimmed, soloSoundId, isMuted, editMode }: {
    sound: Sound;
    onPlay: (sound: Sound) => void;
    onPause: (soundId: string) => void;
    onStop: (soundId: string) => void;
    onFadeOut: (soundId: string) => void;
    onEdit: (sound: Sound) => void;
    isDimmed: boolean;
    soloSoundId: string | null;
    isMuted: boolean;
    editMode: boolean;
}) => {
    const { state, dispatch, updateSoundVolume, playingAudioNodesRef } = useAppContext();
    const { playbackStates, audioSources } = state;
    const currentPlaybackState = playbackStates[sound.id];
    const isRetriggerable = sound.retriggerable;
    const isPlaying = !isRetriggerable && currentPlaybackState?.status === 'playing';

    const [visualVolume, setVisualVolume] = useState(sound.volume);
    const [isFadingOut, setIsFadingOut] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const animationFrameRef = useRef<number | null>(null);

    const buffer = audioSources[sound.audioSourceId];
    const isLoaded = (sourceId: string) => audioSources[sourceId] instanceof AudioBuffer;
    const isLoading = (sourceId: string) => audioSources[sourceId] === 'loading';
    const isError = (sourceId: string) => audioSources[sourceId] === 'error';

    const updateVisuals = useCallback(() => {
        const audioSetup = playingAudioNodesRef.current[sound.id];

        if (!audioSetup) {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            setVisualVolume(sound.volume);
            setIsFadingOut(false);
            return;
        }
        
        const mainGainNode = audioSetup.gainNode || (audioSetup.crossfadeNodes && audioSetup.crossfadeNodes[0]?.gainNode);
        if (mainGainNode) {
            setVisualVolume(mainGainNode.gain.value);
        }
        setIsFadingOut(audioSetup.fadeState === 'out');
        
        animationFrameRef.current = requestAnimationFrame(updateVisuals);

    }, [playingAudioNodesRef, sound.id, sound.volume]);

    useEffect(() => {
        if (currentPlaybackState && !isRetriggerable) {
            updateVisuals();
        } else {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            setVisualVolume(sound.volume);
            setIsFadingOut(false);
        }
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [currentPlaybackState, sound.volume, updateVisuals, isRetriggerable]);
    
    useEffect(() => {
        const audioSetup = playingAudioNodesRef.current[sound.id];
        if (audioSetup && !audioSetup.fadeState) {
            const context = getAudioContext();
            const newVolume = isDimmed ? 0 : (sound.volume ?? 0.75);

            const allGains: GainNode[] = [];
            if (audioSetup.gainNode) allGains.push(audioSetup.gainNode);
            if (audioSetup.crossfadeNodes) allGains.push(...audioSetup.crossfadeNodes.map(n => n.gainNode));
            
            allGains.forEach(gainNode => {
                if (gainNode) {
                    fadeAudio(gainNode, gainNode.gain.value, newVolume, 0.05, 'linear', context);
                }
            });
        }
    }, [isDimmed, sound.id, sound.volume, playingAudioNodesRef]);

    const handleVolumeChange = (volume: number) => {
        updateSoundVolume(sound.id, volume);
        setVisualVolume(volume);
    };

    const handlePlayClick = () => {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume();
        }

        if (isError(sound.audioSourceId)) {
            alert(`Fallo de decodificación: El sonido "${sound.name}" no se pudo reproducir.\n\nEsto suele suceder si el archivo está corrupto o si su navegador no soporta este formato de audio en particular (por ejemplo, Safari tiene limitaciones para decodificar ciertos archivos de tipo OGG o AAC no estándar).\n\nRecomendación: Intente convertir el archivo a un formato MP3 o WAV estéreo estándar (44.1 kHz / 16-bit) e impórtelo de nuevo.`);
            return;
        }

        if (isRetriggerable) {
            onPlay(sound);
        } else {
            isPlaying ? onPause(sound.id) : onPlay(sound);
        }
    };
    
    const handleLoopToggle = () => {
        const newLoopState = !sound.loop;
        dispatch({ type: 'UPDATE_SOUND', payload: { soundId: sound.id, updates: { loop: newLoopState } } });

        const audioNodes = playingAudioNodesRef.current[sound.id];
        if (audioNodes?.source && (sound.crossfade ?? 0) <= 0) {
            audioNodes.source.loop = newLoopState;
        }
    };

    const handleDelete = () => {
        // 1. Stop playback if it's currently running
        try {
            onStop(sound.id);
        } catch (err) {
            console.error("Error stopping sound on list delete:", err);
        }

        // 2. Clean up associated database info if unused elsewhere
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

        // 3. Dispatch deletion event
        dispatch({ type: 'DELETE_SOUND', payload: { soundId: sound.id } });
    };

    const handleDownload = async () => {
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


    return (
        <>
            <td className="p-2">
                <div className="flex items-center space-x-2">
                    <button onClick={handlePlayClick}
                        disabled={(!isLoaded(sound.audioSourceId) && !isError(sound.audioSourceId)) || editMode}
                        className={`p-2 rounded-full transition-colors bg-gray-700 hover:bg-opacity-80 disabled:bg-gray-600 disabled:cursor-not-allowed`}
                        title={isError(sound.audioSourceId) ? "Ver detalles de error de decodificación" : "Reproducir/Pausar"}
                    >
                        {isLoading(sound.audioSourceId) ? <div className="spinner w-6 h-6"></div> : (isError(sound.audioSourceId) ? <ErrorIcon className="w-6 h-6 text-red-400" /> : (isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6"/>)) }
                    </button>
                     <button onClick={() => onFadeOut(sound.id)}
                        disabled={!currentPlaybackState || isRetriggerable || editMode}
                        className={`p-2 rounded-full bg-gray-700 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isFadingOut ? 'text-green-400' : 'text-white'}`} title={isFadingOut ? 'Restaurar Volumen' : 'Desvanecer'}>
                         <FadeOutIcon className={`w-5 h-5 transition-transform duration-300 ${isFadingOut ? 'rotate-180' : ''}`}/>
                     </button>
                     <button onClick={() => onStop(sound.id)}
                        disabled={isRetriggerable || editMode}
                        className="p-2 rounded-full bg-gray-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed" title="Detener (Inmediato)">
                         <StopIcon className="w-5 h-5"/>
                     </button>
                 </div>
            </td>
            <td className="p-3">
                <div className="truncate" title={sound.name}>{sound.name}</div>
            </td>
            <td className="p-3">
                <div className="flex items-center space-x-2">
                    <input
                        type="range"
                        min="0" max="1" step="0.01"
                        value={visualVolume}
                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        disabled={isMuted || editMode}
                    />
                    <span className="text-xs w-9 text-right">{Math.round((visualVolume) * 100)}%</span>
                </div>
            </td>
            <td className="p-3">
                <div className="flex items-center space-x-2">
                    <input
                        type="range"
                        min="-1" max="1" step="0.01"
                        value={sound.pan ?? 0}
                        onChange={(e) => dispatch({ type: 'UPDATE_SOUND', payload: { soundId: sound.id, updates: { pan: parseFloat(e.target.value) } } })}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        disabled={editMode}
                    />
                    <span className="text-xs w-9 text-right">{(sound.pan ?? 0).toFixed(2)}</span>
                </div>
            </td>
            <td className="p-3 text-center">
                 <button onClick={() => dispatch({ type: 'UPDATE_SOUND', payload: { soundId: sound.id, updates: { retriggerable: !sound.retriggerable } } })}
                    className={`p-2 rounded-full transition-colors ${isRetriggerable ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`} title="Permitir Redisparo" disabled={editMode}>
                    <DoubleCheckIcon className="w-5 h-5" />
                </button>
            </td>
            <td className="p-3 text-center">
                <button onClick={handleLoopToggle}
                    className={`p-2 rounded-full transition-colors ${sound.loop ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`} title="Loop" disabled={editMode}>
                    <LoopIcon className="w-5 h-5" />
                </button>
            </td>
            <td className="p-3 text-center">
                <button onClick={() => dispatch({ type: 'TOGGLE_SOLO', payload: sound.id })}
                    className={`p-2 rounded-full transition-colors ${soloSoundId === sound.id ? 'solo-active' : 'bg-gray-700'} hover:bg-yellow-500`} disabled={editMode}>
                    <SoloIcon />
                </button>
            </td>
            <td className="p-3 text-center">
                {editMode ? (
                     <div className="flex items-center justify-center gap-2">
                        <button onClick={handleDownload} disabled={isDownloading} className="text-blue-400 hover:text-blue-300 p-2 rounded-full hover:bg-gray-700" title="Descargar Sonido (Renderizado)">
                            {isDownloading ? <div className="spinner w-5 h-5"></div> : <DownloadIcon className="h-5 w-5" />}
                        </button>
                        <button onClick={() => onEdit(sound)} className="text-gray-400 hover:text-indigo-400 p-2 rounded-full hover:bg-gray-700" title="Editar Sonido">
                            <EditIcon className="h-5 w-5" />
                        </button>
                         {isConfirmingDelete ? (
                            <div className="flex items-center gap-1.5 p-1 bg-red-950/80 border border-red-500/30 rounded-lg animate-fade-in whitespace-nowrap">
                                <span className="text-[10px] font-bold text-red-300">¿Borrar?</span>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDelete(); }} 
                                    className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white font-extrabold text-[10px] rounded cursor-pointer transition-colors"
                                >
                                    Sí
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setIsConfirmingDelete(false); }} 
                                    className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-[10px] rounded cursor-pointer transition-colors"
                                >
                                    No
                                </button>
                            </div>
                         ) : (
                            <button onClick={(e) => { e.stopPropagation(); setIsConfirmingDelete(true); }} className="text-red-500 hover:text-red-400 p-2 rounded-full hover:bg-gray-700" title="Borrar Sonido">
                               <TrashIcon className="h-5 w-5" />
                           </button>
                         )}
                    </div>
                ) : (
                    <button onClick={() => onEdit(sound)} className="text-gray-400 hover:text-indigo-400 p-2 rounded-full hover:bg-gray-700">
                        <EditIcon className="h-5 w-5" />
                    </button>
                )}
            </td>
        </>
    );
};


const SoundListView = ({ board, onPlay, onPause, onStop, onFadeOut, onEdit, onAddSound, onReorderSounds, setDraggedSound, editMode }: {
    board: Soundboard,
    onPlay: (sound: Sound) => void,
    onPause: (soundId: string) => void,
    onStop: (soundId: string) => void,
    onFadeOut: (soundId: string) => void;
    onEdit: (sound: Sound) => void,
    onAddSound: () => void,
    onReorderSounds: (sourceIndex: number, destIndex: number) => void,
    setDraggedSound: (sound: Sound | null) => void,
    editMode: boolean
}) => {
    const { state } = useAppContext();
    const { soloSoundId, isMuted } = state;
    
    const dragItem = useRef<number | null>(null);

    const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, sound: Sound, position: number) => {
        dragItem.current = position;
        setDraggedSound(sound);
        e.dataTransfer.setData('application/json', JSON.stringify({ sound, sourceBoardId: board.id }));
        e.dataTransfer.effectAllowed = 'move';
    };
    
    const handleDragOver = (e: React.DragEvent<HTMLTableRowElement>, position: number) => {
        e.preventDefault();
        if (dragItem.current === null || dragItem.current === position) {
            return;
        }
        onReorderSounds(dragItem.current, position);
        dragItem.current = position;
    };
    
    const handleDragEnd = () => {
        setDraggedSound(null);
        dragItem.current = null;
    };

    return (
        <div className="p-4 flex-grow overflow-y-auto h-full">
            <table className="w-full text-left table-fixed">
                <thead className="border-b border-gray-700 text-sm text-gray-400 uppercase">
                    <tr>
                        <th className="p-3 w-48">Control</th>
                        <th className="p-3">Nombre</th>
                        <th className="p-3 w-48">Volumen</th>
                        <th className="p-3 w-48">Balance</th>
                        <th className="p-3 w-20 text-center">Redisparo</th>
                        <th className="p-3 w-16 text-center">Loop</th>
                        <th className="p-3 w-16 text-center">Solo</th>
                        <th className="p-3 w-24 text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                    {board.sounds
                        .map((sound, originalIndex) => ({ sound, originalIndex }))
                        .filter(({ sound }) => !sound.hidden || state.showHiddenSounds || editMode)
                        .map(({ sound, originalIndex }) => {
                             const draggedSoundId = state.soundboards.find(b => b.id === board.id)?.sounds[dragItem.current ?? -1]?.id;
                             const isDragging = draggedSoundId === sound.id;
                             return (
                                <tr key={sound.id} 
                                    draggable={!editMode}
                                    onDragStart={(e) => !editMode && handleDragStart(e, sound, originalIndex)}
                                    onDragOver={(e) => !editMode && handleDragOver(e, originalIndex)}
                                    onDragEnd={() => !editMode && handleDragEnd()}
                                    className={`hover:bg-gray-800 ${!editMode ? 'cursor-grab' : ''} ${isError(sound.audioSourceId) ? 'bg-red-900 bg-opacity-30' : ''} ${(soloSoundId !== null && soloSoundId !== sound.id) ? 'grayscale-muted' : ''} ${isDragging ? 'opacity-40' : ''}`}
                                >
                                    <SoundRow
                                        sound={sound}
                                        onPlay={onPlay}
                                        onPause={onPause}
                                        onStop={onStop}
                                        onFadeOut={onFadeOut}
                                        onEdit={onEdit}
                                        isDimmed={soloSoundId !== null && soloSoundId !== sound.id}
                                        soloSoundId={soloSoundId}
                                        isMuted={isMuted}
                                        editMode={editMode}
                                    />
                                </tr>
                            );
                        })}
                </tbody>
            </table>
            <button onClick={onAddSound} className="mt-4 w-full border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-800 hover:border-indigo-500 hover:text-white transition-colors h-16">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Añadir Sonido
            </button>
        </div>
    );
};

function isError(sourceId: string): boolean {
    const { state } = useAppContext();
    return state.audioSources[sourceId] === 'error';
}


export default SoundListView;
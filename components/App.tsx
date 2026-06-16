import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { getSoundById } from '../lib/utils';
import { fadeAudio, getAudioContext, getMasterGainNode, getImpulseBuffer, createEqChain, updateEqChain } from '../lib/audio';
import { audioDB } from '../lib/db';
import Header from './Header';
import SoundboardList from './SoundboardList';
import SoundboardView from './SoundboardView';
import SoundListView from './SoundListView';
import GlobalControls from './GlobalControls';
import AddSoundModal from './AddSoundModal';
import EditSoundModal from './EditSoundModal';
import CommandBar from './CommandBar';
import SettingsModal from './SettingsModal';
// FIX: Import PlaybackStatus type to be used for type annotations.
import { Sound, Soundboard, PlaybackStatus } from '../types';

const useAudioLoader = (activeBoard: Soundboard | undefined) => {
    const { state, dispatch } = useAppContext();
    const { audioSources } = state;
    const loadingRef = useRef(new Set<string>());

    useEffect(() => {
        if (!activeBoard) return;

        const context = getAudioContext();

        const soundsToLoad = activeBoard.sounds.filter(
            sound => audioSources[sound.audioSourceId] === undefined && !loadingRef.current.has(sound.audioSourceId)
        );

        if (soundsToLoad.length === 0) return;

        // Mark all as loading and add to ref immediately so subsequent renders don't re-queue them.
        soundsToLoad.forEach(sound => {
            loadingRef.current.add(sound.audioSourceId);
            dispatch({ type: 'SET_AUDIO_SOURCE', payload: { sourceId: sound.audioSourceId, buffer: 'loading' } });
        });

        const processQueue = async () => {
            for (const sound of soundsToLoad) {
                try {
                    const blob = await audioDB.get(sound.audioSourceId);
                    if (blob) {
                        const arrayBuffer = await blob.arrayBuffer();
                        // Timeout for decoding to prevent infinite spinner on corrupt files
                        const buffer = await Promise.race([
                            new Promise<AudioBuffer>((resolve, reject) => {
                                context.decodeAudioData(arrayBuffer, resolve, reject);
                            }),
                            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout decoding audio")), 60000))
                        ]);

                        dispatch({ type: 'SET_AUDIO_SOURCE', payload: { sourceId: sound.audioSourceId, buffer } });
                    } else {
                       throw new Error(`Blob no encontrado en DB para ID ${sound.audioSourceId}`);
                    }
                } catch (error) {
                    console.error(`Fallo al cargar o decodificar el sonido ${sound.name} (ID: ${sound.audioSourceId}):`, error);
                    dispatch({ type: 'SET_AUDIO_SOURCE', payload: { sourceId: sound.audioSourceId, buffer: 'error' } });
                } finally {
                    // Once processing is complete (success or failure), remove it from the loading set.
                    loadingRef.current.delete(sound.audioSourceId);
                }
            }
        };

        processQueue();
        
    }, [activeBoard, audioSources, dispatch]);
};

const useImageLoader = (activeBoard: Soundboard | undefined) => {
    const { state, dispatch } = useAppContext();
    const { imageSources } = state;
    const loadingRef = useRef(new Set<string>());

    useEffect(() => {
        if (!activeBoard) return;
        
        const imageIdsToLoad = [...new Set(activeBoard.sounds.map(s => s.imageId).filter(Boolean))] as string[];

        const missingImageIds = imageIdsToLoad.filter(
            id => imageSources[id] === undefined && !loadingRef.current.has(id)
        );

        if (missingImageIds.length === 0) return;

        missingImageIds.forEach(id => {
            loadingRef.current.add(id);
            dispatch({ type: 'SET_IMAGE_SOURCE', payload: { imageId: id, url: 'loading' } });
        });

        const processQueue = async () => {
            for (const imageId of missingImageIds) {
                try {
                    const blob = await audioDB.get(imageId);
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        dispatch({ type: 'SET_IMAGE_SOURCE', payload: { imageId, url } });
                    } else {
                        throw new Error(`Blob de imagen no encontrado para ID ${imageId}`);
                    }
                } catch (error) {
                    console.error(`Fallo al cargar la imagen ${imageId}:`, error);
                    dispatch({ type: 'SET_IMAGE_SOURCE', payload: { imageId, url: 'error' } });
                } finally {
                    loadingRef.current.delete(imageId);
                }
            }
        };
        processQueue();
    }, [activeBoard, imageSources, dispatch]);
};


const TrashCan = ({ isVisible, onDrop }: { isVisible: boolean; onDrop: (e: React.DragEvent<HTMLDivElement>) => void }) => {
    const [isOver, setIsOver] = React.useState(false);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setIsOver(true);
    };

    const handleDragLeave = () => {
        setIsOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsOver(false);
        onDrop(e);
    };

    if (!isVisible) return null;

    return (
        <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`fixed bottom-8 right-8 z-30 p-6 rounded-full transition-all duration-300 ${isOver ? 'bg-red-500 scale-125 shadow-2xl' : 'bg-gray-700 bg-opacity-80 scale-100 shadow-lg'}`}
            style={{ backdropFilter: 'blur(5px)'}}
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
        </div>
    );
};


const App = () => {
    const { state, dispatch, playingAudioNodesRef } = useAppContext();
    const { soundboards, activeBoardId, viewMode, isLoading, audioSources, imageSources, soloSoundId, editMode, playbackStates } = state;
    const [isAddModalOpen, setAddModalOpen] = useState(false);
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [isCommandBarOpen, setCommandBarOpen] = useState(false);
    const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
    const [soundToEdit, setSoundToEdit] = useState<Sound | null>(null);
    const [draggedSound, setDraggedSound] = useState<Sound | null>(null);
    const impulseBufferRef = useRef<AudioBuffer|null>(null);

    const dispatchRef = useRef(dispatch);
    useEffect(() => { dispatchRef.current = dispatch; }, [dispatch]);

    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);
    
    const activeBoard = soundboards.find(b => b.id === activeBoardId);
    
    useAudioLoader(activeBoard);
    useImageLoader(activeBoard);

    // Effect to clean up Object URLs to prevent memory leaks
    useEffect(() => {
        const currentImageUrls = Object.values(imageSources)
            .filter(url => typeof url === 'string' && url.startsWith('blob:')) as string[];
        
        return () => {
            currentImageUrls.forEach(url => URL.revokeObjectURL(url));
        };
    }, [imageSources]);


    useEffect(() => {
        const loadImpulse = async () => {
            const context = getAudioContext();
            impulseBufferRef.current = await getImpulseBuffer(context);
        }
        loadImpulse();
    }, []);
    
    const stopSound = useCallback((soundId: string) => {
        const audioNodes = playingAudioNodesRef.current[soundId];
        if (!audioNodes) return;
    
        if (audioNodes.loopTimer) clearTimeout(audioNodes.loopTimer);
        if (audioNodes.fadeTimeoutId) clearTimeout(audioNodes.fadeTimeoutId);
    
        const stopSourceNode = (node: { source: AudioBufferSourceNode }) => {
            try {
                node.source.onended = null;
                node.source.stop();
                node.source.disconnect();
            } catch (e) {
                // Ignore errors if the source is already stopped
            }
        };
    
        if (audioNodes.source) {
            stopSourceNode({ source: audioNodes.source });
        }
        if (audioNodes.crossfadeNodes) {
            audioNodes.crossfadeNodes.forEach(stopSourceNode);
        }
    
        // Disconnect the rest of the audio graph
        audioNodes.gainNode?.disconnect();
        audioNodes.panner?.disconnect();
        audioNodes.preampNode?.disconnect();
        audioNodes.eqNodes?.forEach(n => n.disconnect());
        audioNodes.delay?.disconnect();
        audioNodes.delayFeedback?.disconnect();
        audioNodes.dryGain?.disconnect();
        audioNodes.wetGain?.disconnect();
        audioNodes.convolver?.disconnect();
        audioNodes.analyser?.disconnect();
    
        dispatchRef.current({ type: 'STOP_SOUND', payload: { soundId } });
        delete playingAudioNodesRef.current[soundId];
    }, [playingAudioNodesRef]);

    useEffect(() => {
        // This effect handles real-time updates for playing sounds when their properties change.
        Object.keys(playingAudioNodesRef.current).forEach(soundId => {
            const nodes = playingAudioNodesRef.current[soundId];
            const sound = getSoundById(state.soundboards, soundId);
            if (nodes && sound) {
                const context = getAudioContext();
                // Update Pitch
                if (nodes.source && nodes.source.playbackRate.value !== sound.pitch) {
                    nodes.source.playbackRate.value = sound.pitch;
                }
                // Update Pan
                if (nodes.panner && nodes.panner.pan.value !== sound.pan) {
                    nodes.panner.pan.setTargetAtTime(sound.pan, context.currentTime, 0.015);
                }
                // Update EQ
                if(nodes.preampNode && nodes.eqNodes) {
                    updateEqChain(nodes, sound, context);
                }
            }
        });
    }, [state.soundboards, playingAudioNodesRef, state.playbackStates]);
    
    // Effect to stop and clean up audio nodes for sounds that have been deleted from the state
    useEffect(() => {
        const allSoundIds = new Set(state.soundboards.flatMap(b => b.sounds.map(s => s.id)));
        Object.keys(playingAudioNodesRef.current).forEach(playingSoundId => {
            if (!allSoundIds.has(playingSoundId)) {
                stopSound(playingSoundId);
            }
        });
    }, [state.soundboards, playingAudioNodesRef, stopSound]);


    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setCommandBarOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleFadeToggle = useCallback((soundId: string) => {
        const audioNode = playingAudioNodesRef.current[soundId];
        if (!audioNode) return;

        const sound = getSoundById(stateRef.current.soundboards, soundId);
        if (!sound) return;

        const context = getAudioContext();
        
        if (audioNode.fadeTimeoutId) {
            clearTimeout(audioNode.fadeTimeoutId);
            audioNode.fadeTimeoutId = undefined;
        }
        
        const allGains: GainNode[] = [];
        if (audioNode.gainNode) allGains.push(audioNode.gainNode);
        if (audioNode.crossfadeNodes) allGains.push(...audioNode.crossfadeNodes.map(n => n.gainNode));

        if (allGains.length === 0) return;

        // Cancel any ramps and set the gain to its current value to prevent jumps
        allGains.forEach(g => {
            g.gain.cancelScheduledValues(context.currentTime);
            g.gain.setValueAtTime(g.gain.value, context.currentTime);
        });

        if (audioNode.fadeState === 'out') {
            // FADE IN
            audioNode.fadeState = 'in';
            allGains.forEach(g => fadeAudio(g, g.gain.value, sound.volume, sound.fadeIn, sound.fadeInType, context));
        } else {
            // FADE OUT
            audioNode.fadeState = 'out';
            const playbackState = stateRef.current.playbackStates[soundId];
            
            // A sound must be either playing or paused to be faded out.
            if (!playbackState) return; 

            const buffer = stateRef.current.audioSources[sound.audioSourceId];
            // If the sound uses the default fade out duration (0.1s), respect the global fade duration.
            let effectiveFadeDuration = sound.fadeOut === 0.1 ? stateRef.current.globalFadeDuration : sound.fadeOut;

            if (playbackState.status === 'playing' && buffer instanceof AudioBuffer) {
                const pitch = sound.pitch ?? 1.0;
                const elapsedTime = (context.currentTime - playbackState.contextStartTime) * pitch;
                const currentTime = playbackState.progress + elapsedTime;
                const soundEndTime = sound.endTime ?? buffer.duration;
                const remainingTime = (soundEndTime - currentTime) / pitch;
                
                // Ensure fade is not longer than the remaining time of the clip.
                effectiveFadeDuration = Math.max(0.01, Math.min(sound.fadeOut, remainingTime));
            }
            // If paused, we just use the full `sound.fadeOut` duration, which is correct.
            
            allGains.forEach(g => fadeAudio(g, g.gain.value, 0, effectiveFadeDuration, sound.fadeOutType, context));

            audioNode.fadeTimeoutId = setTimeout(() => {
                stopSound(soundId);
            }, effectiveFadeDuration * 1000);
        }
    }, [stopSound, playingAudioNodesRef]);

    const handleImmediateStop = useCallback((soundId: string) => {
        const audioNodes = playingAudioNodesRef.current[soundId];
        if (!audioNodes) return;

        const context = getAudioContext();
        const fadeDuration = 0.05; // Short fade to prevent clicks

        if (audioNodes.fadeTimeoutId) clearTimeout(audioNodes.fadeTimeoutId);

        const allGains: GainNode[] = [];
        if (audioNodes.gainNode) allGains.push(audioNodes.gainNode);
        if (audioNodes.crossfadeNodes) allGains.push(...audioNodes.crossfadeNodes.map(n => n.gainNode));

        allGains.forEach(gainNode => {
            if (gainNode) {
                gainNode.gain.cancelScheduledValues(context.currentTime);
                fadeAudio(gainNode, gainNode.gain.value, 0, fadeDuration, 'linear', context);
            }
        });
        
        audioNodes.fadeTimeoutId = setTimeout(() => {
            stopSound(soundId);
        }, fadeDuration * 1000);
    }, [stopSound, playingAudioNodesRef]);
    
    const handlePause = useCallback((soundId: string) => {
        const audioNodes = playingAudioNodesRef.current[soundId];
        if (audioNodes && audioNodes.loopTimer) { // It's a crossfade loop
            stopSound(soundId);
            return;
        }
    
        const currentPlaybackState = stateRef.current.playbackStates[soundId];
        const sound = getSoundById(stateRef.current.soundboards, soundId);
    
        if (audioNodes && audioNodes.source && currentPlaybackState?.status === 'playing' && sound) {
            const context = getAudioContext();
            const pitch = sound.pitch ?? 1.0;
            const elapsedTime = (context.currentTime - currentPlaybackState.contextStartTime) * pitch;
            const newProgress = currentPlaybackState.progress + elapsedTime;
            
            if (audioNodes.fadeTimeoutId) clearTimeout(audioNodes.fadeTimeoutId);
            audioNodes.fadeState = undefined;
    
            try { 
                audioNodes.source.onended = null;
                audioNodes.source.stop();
            } catch(e) {}
            dispatchRef.current({ type: 'PAUSE_SOUND', payload: { soundId, progress: newProgress } });
        }
    }, [playingAudioNodesRef, stopSound]);

    const playCrossfadeLoop = useCallback(async (sound: Sound, buffer: AudioBuffer) => {
        if (playingAudioNodesRef.current[sound.id]) stopSound(sound.id);
    
        const context = getAudioContext();
        const masterGainNode = getMasterGainNode();
    
        const cropDuration = (sound.endTime ?? buffer.duration) - sound.startTime;
        if (cropDuration <= 0) return;
    
        const crossfadeDuration = Math.min(sound.crossfade, cropDuration / 2);
    
        const panner = context.createStereoPanner();
        panner.pan.value = sound.pan;
        
        const { preampNode, eqNodes, lastNode: lastEqNode } = createEqChain(context, sound);
        updateEqChain({ preampNode, eqNodes }, sound, context);
        
        const delay = context.createDelay(5.0);
        delay.delayTime.value = sound.delayTime ?? 0;
        const delayFeedback = context.createGain();
        delayFeedback.gain.value = sound.delayFeedback ?? 0;
        const dryGain = context.createGain();
        
        let convolver: ConvolverNode | null = null;
        let wetGain: GainNode | null = null;
        const reverbAmount = sound.reverb ?? 0;
        
        if (reverbAmount > 0 && impulseBufferRef.current) {
            convolver = context.createConvolver();
            convolver.buffer = impulseBufferRef.current;
            wetGain = context.createGain();
            wetGain.gain.value = reverbAmount;
            dryGain.gain.value = 1 - reverbAmount;
        } else {
            dryGain.gain.value = 1.0;
        }
        
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        
        panner.connect(preampNode);
        lastEqNode.connect(delay);
        delay.connect(delayFeedback).connect(delay);
        delay.connect(dryGain).connect(analyser);
        if (convolver && wetGain) {
            delay.connect(wetGain).connect(convolver).connect(analyser);
        }
        analyser.connect(masterGainNode);

        const loopState = { timerId: null as any, nextStartTime: context.currentTime };
        const nodes: { source: AudioBufferSourceNode, gainNode: GainNode }[] = [];
        playingAudioNodesRef.current[sound.id] = { 
            panner, 
            analyser, 
            preampNode, 
            eqNodes, 
            delay, 
            delayFeedback, 
            dryGain, 
            wetGain: wetGain || undefined, 
            convolver: convolver || undefined, 
            crossfadeNodes: nodes, 
            loopTimer: loopState.timerId 
        };

        const scheduleNext = () => {
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.playbackRate.value = sound.pitch;
            const gainNode = context.createGain();
            source.connect(gainNode).connect(panner);
    
            const effectiveVolume = (stateRef.current.soloSoundId && stateRef.current.soloSoundId !== sound.id) ? 0 : sound.volume;
            const now = loopState.nextStartTime;
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(effectiveVolume, now + crossfadeDuration);
            gainNode.gain.setValueAtTime(effectiveVolume, now + cropDuration - crossfadeDuration);
            gainNode.gain.linearRampToValueAtTime(0, now + cropDuration);
    
            source.start(now, sound.startTime, cropDuration);
    
            const nodePair = { source, gainNode };
            nodes.push(nodePair);
            source.onended = () => {
                const index = nodes.indexOf(nodePair);
                if (index > -1) nodes.splice(index, 1);
                source.disconnect();
                gainNode.disconnect();
            };

            const interval = (cropDuration - crossfadeDuration) / sound.pitch;
            loopState.nextStartTime += interval;
            const delay = (loopState.nextStartTime - context.currentTime) * 1000;
    
            loopState.timerId = setTimeout(scheduleNext, delay > 0 ? delay : 0);
            if(playingAudioNodesRef.current[sound.id]) {
               playingAudioNodesRef.current[sound.id]!.loopTimer = loopState.timerId;
            }
        };
    
        dispatchRef.current({ type: 'PLAY_SOUND', payload: { soundId: sound.id, contextStartTime: context.currentTime, progress: sound.startTime } });
        scheduleNext();

    }, [playingAudioNodesRef, stopSound]);

    const playRetriggerableSound = useCallback(async (sound: Sound) => {
        const buffer = audioSources[sound.audioSourceId];
        if (!(buffer instanceof AudioBuffer)) return;
    
        const context = getAudioContext();
        context.resume();
    
        // Create a self-contained set of nodes for this one-shot play
        const source = context.createBufferSource();
        const gainNode = context.createGain();
        const panner = context.createStereoPanner();
        const { preampNode, eqNodes, lastNode: lastEqNode } = createEqChain(context, sound);
        updateEqChain({ preampNode, eqNodes }, sound, context);
        const delay = context.createDelay(5.0);
        const delayFeedback = context.createGain();
        const dryGain = context.createGain();
        const masterGainNode = getMasterGainNode();
    
        // Configure nodes
        source.buffer = buffer;
        source.playbackRate.value = sound.pitch ?? 1.0;
        panner.pan.value = sound.pan ?? 0;
        delay.delayTime.value = sound.delayTime ?? 0;
        delayFeedback.gain.value = sound.delayFeedback ?? 0;
        
        let convolver: ConvolverNode | null = null;
        let wetGain: GainNode | null = null;
        const reverbAmount = sound.reverb ?? 0;
        
        if (reverbAmount > 0 && impulseBufferRef.current) {
            convolver = context.createConvolver();
            convolver.buffer = impulseBufferRef.current;
            wetGain = context.createGain();
            wetGain.gain.value = reverbAmount;
            dryGain.gain.value = 1 - reverbAmount;
        } else {
            dryGain.gain.value = 1.0;
        }
    
        // Connect graph
        source.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(preampNode);
        lastEqNode.connect(delay);
        delay.connect(delayFeedback).connect(delay);
        delay.connect(dryGain).connect(masterGainNode);
        if (convolver && wetGain) {
            delay.connect(wetGain).connect(convolver).connect(masterGainNode);
        }
    
        // --- ACCURATE FADE SCHEDULING ---
        const now = context.currentTime;
        const gain = gainNode.gain;
        const effectiveVolume = (soloSoundId && soloSoundId !== sound.id) ? 0 : sound.volume;
        
        const soundStartTime = sound.startTime ?? 0;
        const soundEndTime = sound.endTime ?? buffer.duration;
        const durationToPlay = soundEndTime - soundStartTime;
        if (durationToPlay <= 0.001) return;
    
        const pitch = sound.pitch ?? 1.0;
    
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(0, now);
    
        const pitchedFadeInDuration = Math.min(sound.fadeIn / pitch, durationToPlay / pitch);
        if (pitchedFadeInDuration > 0.001) {
            gain.linearRampToValueAtTime(effectiveVolume, now + pitchedFadeInDuration);
        } else {
            gain.setValueAtTime(effectiveVolume, now);
        }
    
        const pitchedDurationToPlay = durationToPlay / pitch;
        const pitchedFadeOutDuration = Math.min(sound.fadeOut / pitch, pitchedDurationToPlay);
    
        if (pitchedFadeOutDuration > 0.001) {
            const fadeOutStartTime = now + pitchedDurationToPlay - pitchedFadeOutDuration;
            if (fadeOutStartTime > now + pitchedFadeInDuration) {
                 gain.setValueAtTime(effectiveVolume, fadeOutStartTime);
            }
            if (sound.fadeOutType === 'exponential') {
                gain.exponentialRampToValueAtTime(0.0001, fadeOutStartTime + pitchedFadeOutDuration);
            } else {
                gain.linearRampToValueAtTime(0, fadeOutStartTime + pitchedFadeOutDuration);
            }
        }
    
        source.start(now, soundStartTime, durationToPlay);
    
        // Self-cleanup on end
        source.onended = () => {
            source.disconnect();
            gainNode.disconnect();
            panner.disconnect();
            preampNode.disconnect();
            eqNodes.forEach(n => n.disconnect());
            delay.disconnect();
            delayFeedback.disconnect();
            convolver.disconnect();
            dryGain.disconnect();
            wetGain.disconnect();
        };
    }, [audioSources, soloSoundId]);

    const handlePlay = useCallback(async (sound: Sound) => {
        // AUTOMATION: Stop or Pause linked sounds
        if (sound.stopActions && sound.stopActions.length > 0) {
            sound.stopActions.forEach(action => {
                const idToStop = action.soundId;
                const currentState = stateRef.current.playbackStates[idToStop];
                if (currentState?.status === 'playing') {
                    if (action.type === 'pause') {
                        handlePause(idToStop);
                    } else {
                        handleImmediateStop(idToStop);
                    }
                }
            });
        } 
        // Compatibility for older stopIds if exists (migration fallback)
        else if (Array.isArray((sound as any).stopIds) && (sound as any).stopIds.length > 0) {
            (sound as any).stopIds.forEach((idToStop: string) => {
                if (stateRef.current.playbackStates[idToStop]?.status === 'playing') {
                    handleImmediateStop(idToStop);
                }
            });
        }

        // Increment play count
        dispatchRef.current({ type: 'UPDATE_SOUND', payload: { soundId: sound.id, updates: { playCount: (sound.playCount || 0) + 1 } } });

        if (sound.retriggerable) {
            playRetriggerableSound(sound);
            return;
        }

        const buffer = audioSources[sound.audioSourceId];
        if (!(buffer instanceof AudioBuffer)) return;
        
        if (sound.loop && sound.crossfade > 0) {
            playCrossfadeLoop(sound, buffer);
            return;
        }
    
        const context = getAudioContext();
        context.resume();
        if (playingAudioNodesRef.current[sound.id]) stopSound(sound.id);
    
        const currentPlaybackState = stateRef.current.playbackStates[sound.id];
        const soundStartTime = sound.startTime ?? 0;
        const soundEndTime = sound.endTime ?? buffer.duration;
        
        const offset = currentPlaybackState?.status === 'paused' ? currentPlaybackState.progress : soundStartTime;
        const clampedOffset = Math.max(soundStartTime, Math.min(offset, soundEndTime));
        
        const durationToPlay = soundEndTime - clampedOffset;
        if (durationToPlay <= 0.001) {
            dispatchRef.current({ type: 'PAUSE_SOUND', payload: { soundId: sound.id, progress: soundStartTime } });
            stopSound(sound.id);
            return;
        }
    
        // Create nodes
        const source = context.createBufferSource();
        const gainNode = context.createGain();
        const panner = context.createStereoPanner();
        const { preampNode, eqNodes, lastNode: lastEqNode } = createEqChain(context, sound);
        updateEqChain({ preampNode, eqNodes }, sound, context);
        const delay = context.createDelay(5.0);
        const delayFeedback = context.createGain();
        const dryGain = context.createGain();
        const analyser = context.createAnalyser();
        const masterGainNode = getMasterGainNode();
    
        // Configure nodes
        source.buffer = buffer;
        source.loop = sound.loop;
        if (sound.loop) {
            source.loopStart = sound.startTime ?? 0;
            source.loopEnd = sound.endTime ?? buffer.duration;
        }
        const pitch = sound.pitch ?? 1.0;
        source.playbackRate.value = pitch;
        panner.pan.value = sound.pan;
        delay.delayTime.value = sound.delayTime ?? 0;
        delayFeedback.gain.value = sound.delayFeedback ?? 0;
        
        let convolver: ConvolverNode | null = null;
        let wetGain: GainNode | null = null;
        const reverbAmount = sound.reverb ?? 0;
        
        if (reverbAmount > 0 && impulseBufferRef.current) {
            convolver = context.createConvolver();
            convolver.buffer = impulseBufferRef.current;
            wetGain = context.createGain();
            wetGain.gain.value = reverbAmount;
            dryGain.gain.value = 1 - reverbAmount;
        } else {
            dryGain.gain.value = 1.0;
        }
        analyser.fftSize = 256;
        
        // Connect graph
        source.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(preampNode);
        lastEqNode.connect(delay);
        delay.connect(delayFeedback).connect(delay);
        delay.connect(dryGain).connect(analyser);
        if (convolver && wetGain) {
            delay.connect(wetGain).connect(convolver).connect(analyser);
        }
        analyser.connect(masterGainNode);
    
        // --- ACCURATE FADE SCHEDULING ---
        const now = context.currentTime;
        const gain = gainNode.gain;
        const effectiveVolume = (soloSoundId && soloSoundId !== sound.id) ? 0 : sound.volume;
        
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(0, now);
    
        // 1. Fade In
        const pitchedFadeInDuration = Math.min(sound.fadeIn / pitch, durationToPlay / pitch);
        if (pitchedFadeInDuration > 0.001) {
            gain.linearRampToValueAtTime(effectiveVolume, now + pitchedFadeInDuration);
        } else {
            gain.setValueAtTime(effectiveVolume, now);
        }
    
        // 2. Fade Out (if not looping)
        if (!sound.loop) {
            const pitchedDurationToPlay = durationToPlay / pitch;
            const pitchedFadeOutDuration = Math.min(sound.fadeOut / pitch, pitchedDurationToPlay);
    
            if (pitchedFadeOutDuration > 0.001) {
                const fadeOutStartTime = now + pitchedDurationToPlay - pitchedFadeOutDuration;
                
                if (fadeOutStartTime > now + pitchedFadeInDuration) {
                     gain.setValueAtTime(effectiveVolume, fadeOutStartTime);
                }
               
                if (sound.fadeOutType === 'exponential') {
                    gain.exponentialRampToValueAtTime(0.0001, fadeOutStartTime + pitchedFadeOutDuration);
                } else {
                    gain.linearRampToValueAtTime(0, fadeOutStartTime + pitchedFadeOutDuration);
                }
            }
        }
    
        source.start(now, clampedOffset, sound.loop ? undefined : durationToPlay);
    
        playingAudioNodesRef.current[sound.id] = { 
            source, 
            gainNode, 
            panner, 
            preampNode, 
            eqNodes, 
            delay, 
            delayFeedback, 
            convolver: convolver || undefined, 
            dryGain, 
            wetGain: wetGain || undefined, 
            analyser 
        };
        
        dispatchRef.current({ type: 'PLAY_SOUND', payload: { soundId: sound.id, contextStartTime: context.currentTime, progress: clampedOffset } });
    
        source.onended = () => {
            if (playingAudioNodesRef.current[sound.id]?.source === source) {
                 const latestSound = getSoundById(stateRef.current.soundboards, sound.id);
                 if (latestSound && !latestSound.loop) {
                    stopSound(sound.id);
                    
                    // Trigger "reproducir al finalizar" automations
                    if (latestSound.stopActions && latestSound.stopActions.length > 0) {
                        latestSound.stopActions.forEach(action => {
                            if (action.type === 'play') {
                                const nextSound = getSoundById(stateRef.current.soundboards, action.soundId);
                                if (nextSound) {
                                    handlePlay(nextSound);
                                }
                            }
                        });
                    }
                 }
            }
        };
    }, [audioSources, soloSoundId, playingAudioNodesRef, playCrossfadeLoop, stopSound, playRetriggerableSound, handleImmediateStop, handlePause]);
        
    const handleGlobalClick = useCallback((event: MouseEvent) => {
        // Only trigger for left-clicks
        if (event.button !== 0) return;

        const currentBoard = stateRef.current.soundboards.find(b => b.id === stateRef.current.activeBoardId);
        if (!currentBoard) return;

        const retriggerableSounds = currentBoard.sounds.filter(s => s.retriggerable);
        if (retriggerableSounds.length === 0) return;

        // Check if the click was on an interactive UI element
        const target = event.target as HTMLElement;
        const interactiveSelector = 'button, input, a, select, [role="button"], [role="slider"], [role="switch"]';
        if (target.closest(interactiveSelector)) {
            return;
        }

        retriggerableSounds.forEach(sound => handlePlay(sound));
    }, [handlePlay]);

    useEffect(() => {
        document.addEventListener('mousedown', handleGlobalClick);
        return () => {
            document.removeEventListener('mousedown', handleGlobalClick);
        };
    }, [handleGlobalClick]);

    const handlePauseAll = useCallback(() => {
        // FIX: Refactor to use Object.entries for type-safe access to playback status.
        // FIX: Add explicit type to the destructured parameter to resolve TypeScript error.
        Object.entries(stateRef.current.playbackStates).forEach(([soundId, playbackState]: [string, PlaybackStatus]) => {
            if (playbackState.status === 'playing') {
                handlePause(soundId);
            }
        });
    }, [handlePause]);

    const handleResumeAll = useCallback(() => {
        const pausedSounds = Object.entries(stateRef.current.playbackStates)
            // FIX: Add explicit type to the destructured parameter to resolve TypeScript error.
            .filter(([, state]: [string, PlaybackStatus]) => state.status === 'paused')
            .map(([soundId]) => getSoundById(stateRef.current.soundboards, soundId))
            .filter((s): s is Sound => s !== undefined);
        
        pausedSounds.forEach(sound => {
            handlePlay(sound);
        });
    }, [handlePlay]);
    
    const handleEdit = (sound: Sound) => {
        setSoundToEdit(sound);
        setEditModalOpen(true);
    };
    
    const handleReorderSounds = (sourceIndex: number, destIndex: number) => {
        if (activeBoardId) {
            dispatch({ type: 'REORDER_SOUNDS', payload: { boardId: activeBoardId, sourceIndex, destIndex } });
        }
    };

    const handleReorderBoards = (sourceIndex: number, destIndex: number) => {
        dispatch({ type: 'REORDER_BOARDS', payload: { sourceIndex, destIndex } });
    };

    const handleDropOnTrash = (e: React.DragEvent<HTMLDivElement>) => {
        try {
            const dataString = e.dataTransfer.getData("application/json");
            if (!dataString) {
                console.warn("Intento de drop en la papelera con datos vacíos.");
                return;
            }
            const data = JSON.parse(dataString);
            if (data && data.sound && data.sound.id) {
                dispatch({ type: 'DELETE_SOUND', payload: { soundId: data.sound.id } });
            }
        } catch (err) {
            console.error("Error al procesar el drop en la papelera:", err);
        }
        setDraggedSound(null);
    };

    const isIdle = Object.keys(playbackStates).length === 0;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-900 text-center">
                <div>
                  <div className="spinner-lg border-t-indigo-500 border-4 rounded-full w-16 h-16 animate-spin mx-auto"></div>
                  <p className="mt-4 text-lg text-gray-400">Iniciando Aplicación...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white font-sans">
            <Header onOpenCommandBar={() => setCommandBarOpen(true)} onOpenSettings={() => setSettingsModalOpen(true)} isIdle={isIdle} />
            
            {activeBoard && <GlobalControls onPauseAll={handlePauseAll} onResumeAll={handleResumeAll} />}
            
            <div className="flex flex-1 overflow-hidden">
                <SoundboardList onReorderBoards={handleReorderBoards} />
                <main className="flex-1 flex flex-col overflow-hidden bg-gray-900">
                    {activeBoard ? (
                         <>
                             {viewMode === 'grid' ? (
                                <SoundboardView 
                                    board={activeBoard} 
                                    onPlay={handlePlay} 
                                    onPause={handlePause}
                                    onStop={handleImmediateStop}
                                    onFadeOut={handleFadeToggle}
                                    onEdit={handleEdit}
                                    onAddSound={() => setAddModalOpen(true)}
                                    onReorderSounds={handleReorderSounds}
                                    setDraggedSound={setDraggedSound}
                                    editMode={editMode}
                                 />
                             ) : (
                                <SoundListView 
                                    board={activeBoard}
                                    onPlay={handlePlay} 
                                    onPause={handlePause}
                                    onStop={handleImmediateStop}
                                    onFadeOut={handleFadeToggle}
                                    onEdit={handleEdit}
                                    onAddSound={() => setAddModalOpen(true)}
                                    onReorderSounds={handleReorderSounds}
                                    setDraggedSound={setDraggedSound}
                                    editMode={editMode}
                                 />
                             )}
                         </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-center p-4">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-5m-6 0a1 1 0 001 1h8a1 1 0 001-1M5 17a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5z" />
                           </svg>
                            <p className="text-xl">Ninguna Pista Seleccionada</p>
                            <p>Crea una pista o selecciona una de la lista para empezar.</p>
                        </div>
                    )}
                </main>
            </div>
            {isAddModalOpen && activeBoardId && (
                <AddSoundModal boardId={activeBoardId} onClose={() => setAddModalOpen(false)} />
            )}
            {isEditModalOpen && soundToEdit && (
                <EditSoundModal sound={soundToEdit} onClose={() => setEditModalOpen(false)} />
            )}
            {isCommandBarOpen && activeBoard && (
                <CommandBar board={activeBoard} onClose={() => setCommandBarOpen(false)} />
            )}
            {isSettingsModalOpen && (
                <SettingsModal onClose={() => setSettingsModalOpen(false)} />
            )}
             {state.isLoading && !isLoading && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="spinner-lg border-t-indigo-500 border-4 rounded-full w-16 h-16 animate-spin"></div>
                 </div>
            )}
            <TrashCan isVisible={!editMode && !!draggedSound} onDrop={handleDropOnTrash} />
        </div>
    );
};

export default App;
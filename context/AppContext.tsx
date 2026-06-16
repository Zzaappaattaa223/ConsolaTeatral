import React, { createContext, useReducer, useContext, useRef, useEffect, useCallback, useState } from 'react';
import { AppState, Action, Soundboard, Sound, PlayingAudioNodes, TrashItem } from '../types';
import { audioDB } from '../lib/db';
import { getSoundById, isNumber, dataUrlToBlob, calculateHash } from '../lib/utils';
import { fadeAudio, getAudioContext, getMasterGainNode } from '../lib/audio';
import { DEFAULT_CROSSFADE, DEFAULT_PITCH, DEFAULT_VOLUME, DEFAULT_PAN, colors, EQ_BAND_DEFAULTS, PREAMP_DEFAULT } from '../constants';

const appReducer = (state: AppState, action: Action): AppState => {
    switch (action.type) {
        case 'SET_STATE':
            return action.payload;
        case 'ADD_SOUNDBOARD': {
            const newBoard: Soundboard = { id: `board_${Date.now()}`, name: action.payload, sounds: [] };
            return { ...state, soundboards: [...state.soundboards, newBoard], activeBoardId: newBoard.id };
        }
        case 'ADD_SOUNDBOARDS': {
            const newBoards = action.payload;
            if (!newBoards || newBoards.length === 0) {
                return state;
            }

            const existingIds = new Set(state.soundboards.map(b => b.id));
            const uniqueNewBoards = newBoards.filter(b => !existingIds.has(b.id));

            if (uniqueNewBoards.length === 0) {
                return state; 
            }

            return {
                ...state,
                soundboards: [...state.soundboards, ...uniqueNewBoards],
                activeBoardId: uniqueNewBoards[0].id,
            };
        }
        case 'RENAME_SOUNDBOARD': {
             return { ...state, soundboards: state.soundboards.map(b => b.id === action.payload.id ? { ...b, name: action.payload.name } : b) };
        }
        case 'DELETE_SOUNDBOARD': {
            const boardToDelete = state.soundboards.find(b => b.id === action.payload);
            if (!boardToDelete) return state;

            const newTrashItem: TrashItem = {
                type: 'soundboard',
                item: boardToDelete,
                deletedAt: Date.now(),
            };

            const newBoards = state.soundboards.filter(b => b.id !== action.payload);
            let newActiveBoardId = state.activeBoardId;
            if (state.activeBoardId === action.payload) {
                newActiveBoardId = newBoards.length > 0 ? newBoards[0].id : null;
            }
            const newPlaybackStates = { ...state.playbackStates };
            boardToDelete.sounds.forEach(sound => {
                delete newPlaybackStates[sound.id];
            });

            return {
                ...state,
                soundboards: newBoards,
                activeBoardId: newActiveBoardId,
                playbackStates: newPlaybackStates,
                trash: [...state.trash, newTrashItem]
            };
        }
        case 'SET_ACTIVE_BOARD':
            return { ...state, activeBoardId: action.payload };
        case 'REORDER_BOARDS': {
            const { sourceIndex, destIndex } = action.payload;
            const newBoards = Array.from(state.soundboards);
            const [removed] = newBoards.splice(sourceIndex, 1);
            newBoards.splice(destIndex, 0, removed);
            return { ...state, soundboards: newBoards };
        }
        case 'SET_SOUNDBOARDS_ORDER':
            return { ...state, soundboards: action.payload };
        case 'ADD_SOUND': {
            const { boardId, sound } = action.payload;
            const soundWithDefaults: Sound = {
                ...sound,
                volume: isNumber(sound.volume) ? sound.volume : DEFAULT_VOLUME,
                pitch: isNumber(sound.pitch) ? sound.pitch : DEFAULT_PITCH,
                pan: isNumber(sound.pan) ? sound.pan : DEFAULT_PAN,
                loop: sound.loop ?? false,
                retriggerable: sound.retriggerable ?? false,
                crossfade: isNumber(sound.crossfade) ? sound.crossfade : DEFAULT_CROSSFADE,
                fadeIn: isNumber(sound.fadeIn) ? sound.fadeIn : 0.1,
                fadeOut: isNumber(sound.fadeOut) ? sound.fadeOut : 0.1,
                fadeInType: sound.fadeInType ?? 'linear',
                fadeOutType: sound.fadeOutType ?? 'linear',
                startTime: isNumber(sound.startTime) ? sound.startTime : 0,
                endTime: sound.endTime === null || isNumber(sound.endTime) ? sound.endTime : null,
                color: sound.color || colors[Math.floor(Math.random() * colors.length)],
                imageId: sound.imageId ?? null,
                reverb: isNumber(sound.reverb) ? sound.reverb : 0,
                delayTime: isNumber(sound.delayTime) ? sound.delayTime : 0,
                delayFeedback: isNumber(sound.delayFeedback) ? sound.delayFeedback : 0,
                eqEnabled: sound.eqEnabled ?? false,
                eqPreamp: isNumber(sound.eqPreamp) ? sound.eqPreamp : PREAMP_DEFAULT,
                eqBands: Array.isArray(sound.eqBands) && sound.eqBands.length === 10 ? sound.eqBands : [...EQ_BAND_DEFAULTS],
                stopActions: Array.isArray(sound.stopActions) ? sound.stopActions : [],
                playCount: isNumber(sound.playCount) ? sound.playCount : 0,
                hidden: sound.hidden ?? false,
                instructions: sound.instructions ?? '',
            };
            
            return {
                ...state,
                soundboards: state.soundboards.map(b =>
                    b.id === boardId ? { ...b, sounds: [...b.sounds, soundWithDefaults] } : b
                ),
                audioSources: { ...state.audioSources, [sound.audioSourceId]: state.audioSources[sound.audioSourceId] || 'loading' }
            };
        }
        case 'UPDATE_SOUND': {
            const { soundId, updates } = action.payload;
            return {
                ...state,
                soundboards: state.soundboards.map(board => ({
                    ...board,
                    sounds: board.sounds.map(sound => {
                        if (sound.id !== soundId) {
                            return sound;
                        }
                        
                        // CRITICAL FIX: Ensure we don't overwrite valid numbers with undefined or defaults during partial updates.
                        // Use the 'updates' value if it exists and is valid, otherwise keep 'sound' value.
                        
                        const updatedSound = { ...sound, ...updates };
                        
                        // Helper to ensure stability
                        const safeNum = (newVal: number | undefined | null, oldVal: number, fallback: number) => {
                            if (newVal === undefined || newVal === null) return oldVal;
                            return isNumber(newVal) ? newVal : oldVal; 
                        };

                        return {
                            ...updatedSound,
                            // Validate critical numeric fields to prevent resetting to 0 or default unexpectedly
                            volume: safeNum(updates.volume, sound.volume, DEFAULT_VOLUME),
                            pitch: safeNum(updates.pitch, sound.pitch, DEFAULT_PITCH),
                            pan: safeNum(updates.pan, sound.pan, DEFAULT_PAN),
                            crossfade: safeNum(updates.crossfade, sound.crossfade, DEFAULT_CROSSFADE),
                            fadeIn: safeNum(updates.fadeIn, sound.fadeIn, 0.1),
                            fadeOut: safeNum(updates.fadeOut, sound.fadeOut, 0.1),
                            startTime: safeNum(updates.startTime, sound.startTime, 0),
                            // endTime can be null
                            endTime: updates.endTime !== undefined ? updates.endTime : sound.endTime, 
                            
                            reverb: safeNum(updates.reverb, sound.reverb, 0),
                            delayTime: safeNum(updates.delayTime, sound.delayTime, 0),
                            delayFeedback: safeNum(updates.delayFeedback, sound.delayFeedback, 0),
                            eqPreamp: safeNum(updates.eqPreamp, sound.eqPreamp, PREAMP_DEFAULT),
                            eqBands: updates.eqBands && Array.isArray(updates.eqBands) && updates.eqBands.length === 10 ? updates.eqBands : sound.eqBands,
                            
                            stopActions: Array.isArray(updates.stopActions) ? updates.stopActions : sound.stopActions,
                            playCount: safeNum(updates.playCount, sound.playCount, 0),
                        };
                    })
                }))
            };
        }
       case 'DELETE_SOUND': {
            const { soundId } = action.payload;
            let soundToDelete: Sound | null = null;
            let originalBoardId: string | null = null;

            for (const board of state.soundboards) {
                const sound = board.sounds.find(s => s.id === soundId);
                if (sound) {
                    soundToDelete = sound;
                    originalBoardId = board.id;
                    break;
                }
            }
            if (!soundToDelete || !originalBoardId) return state;

            const newTrashItem: TrashItem = {
                type: 'sound',
                item: soundToDelete,
                deletedAt: Date.now(),
                originalBoardId,
            };

            const newPlaybackStates = { ...state.playbackStates };
            delete newPlaybackStates[soundId];
            
            return {
                ...state,
                playbackStates: newPlaybackStates,
                soundboards: state.soundboards.map(board => ({
                    ...board,
                    sounds: board.sounds.filter(sound => sound.id !== soundId)
                })),
                trash: [...state.trash, newTrashItem]
            };
        }
        case 'REORDER_SOUNDS': {
            const { boardId, sourceIndex, destIndex } = action.payload;
            const newBoards = [...state.soundboards];
            const boardIndex = newBoards.findIndex(b => b.id === boardId);
            if (boardIndex === -1) return state;

            const newSounds = Array.from(newBoards[boardIndex].sounds);
            const [removed] = newSounds.splice(sourceIndex, 1);
            newSounds.splice(destIndex, 0, removed);
            newBoards[boardIndex] = { ...newBoards[boardIndex], sounds: newSounds };
            return { ...state, soundboards: newBoards };
        }
        case 'MOVE_SOUND': {
            const { sound, sourceBoardId, destBoardId } = action.payload;
            if (sourceBoardId === destBoardId) return state;

            return {
                ...state,
                soundboards: state.soundboards.map(board => {
                    if (board.id === sourceBoardId) {
                        // Remove from source
                        return { ...board, sounds: board.sounds.filter(s => s.id !== sound.id) };
                    }
                    if (board.id === destBoardId) {
                        // Add to destination
                        return { ...board, sounds: [...board.sounds, sound] };
                    }
                    return board;
                })
            };
        }
        case 'PLAY_SOUND': {
            const newPlaybackStates = { ...state.playbackStates };
            newPlaybackStates[action.payload.soundId] = { status: 'playing', progress: action.payload.progress, contextStartTime: action.payload.contextStartTime };
            return { ...state, playbackStates: newPlaybackStates };
        }
        case 'PAUSE_SOUND': {
            const newPlaybackStates = { ...state.playbackStates };
            newPlaybackStates[action.payload.soundId] = { status: 'paused', progress: action.payload.progress, contextStartTime: 0 };
            return { ...state, playbackStates: newPlaybackStates };
        }
        case 'STOP_SOUND': {
            const newPlaybackStates = { ...state.playbackStates };
            delete newPlaybackStates[action.payload.soundId];
            return { ...state, playbackStates: newPlaybackStates };
        }
        case 'UPDATE_PLAYBACK_PROGRESS': {
             const currentPlaybackState = state.playbackStates[action.payload.soundId];
             if (currentPlaybackState && currentPlaybackState.status === 'playing') {
                const newPlaybackStates = { ...state.playbackStates };
                newPlaybackStates[action.payload.soundId] = { ...currentPlaybackState, progress: action.payload.progress };
                return { ...state, playbackStates: newPlaybackStates };
             }
             return state;
        }
        case 'STOP_ALL': {
            return { ...state, playbackStates: {}, soloSoundId: null };
        }
        case 'TOGGLE_SOLO': {
            const newSoloId = state.soloSoundId === action.payload ? null : action.payload;
            return { ...state, soloSoundId: newSoloId };
        }
        case 'TOGGLE_MUTE':
            return { ...state, isMuted: !state.isMuted };
        case 'TOGGLE_SIDEBAR':
            return { ...state, isSidebarCollapsed: !state.isSidebarCollapsed };
        case 'TOGGLE_EDIT_MODE':
            return { ...state, editMode: !state.editMode, isRearrangeMode: false }; // Disable rearrange if editing toggles
        case 'TOGGLE_REARRANGE_MODE':
            return { ...state, isRearrangeMode: !state.isRearrangeMode, editMode: false }; // Disable edit if rearrange toggles
        case 'SET_MASTER_VOLUME':
            return { ...state, masterVolume: action.payload };
        case 'SET_VIEW_MODE':
            return { ...state, viewMode: action.payload };
        case 'SET_PAD_SIZE':
            return { ...state, padSize: action.payload };
        case 'SET_LOADING':
            return { ...state, isLoading: action.payload };
        case 'SET_AUDIO_SOURCE':
            return { ...state, audioSources: {...state.audioSources, [action.payload.sourceId]: action.payload.buffer } };
        case 'SET_IMAGE_SOURCE':
            return { ...state, imageSources: {...state.imageSources, [action.payload.imageId]: action.payload.url } };
        case 'RESTORE_ITEM': {
            const { itemId } = action.payload;
            const itemToRestore = state.trash.find(t => t.item.id === itemId);
            if (!itemToRestore) return state;
    
            const newTrash = state.trash.filter(t => t.item.id !== itemId);
            let newSoundboards = [...state.soundboards];
    
            if (itemToRestore.type === 'soundboard') {
                newSoundboards.push(itemToRestore.item as Soundboard);
            } else if (itemToRestore.type === 'sound') {
                const sound = itemToRestore.item as Sound;
                const boardId = itemToRestore.originalBoardId;
                const boardExists = newSoundboards.some(b => b.id === boardId);

                const targetBoardId = (boardId && boardExists) ? boardId : (newSoundboards[0]?.id);

                if (targetBoardId) {
                    newSoundboards = newSoundboards.map(b => 
                        b.id === targetBoardId ? { ...b, sounds: [...b.sounds, sound] } : b
                    );
                } else {
                    // No boards exist, create one for the sound
                    const newBoard: Soundboard = { id: `board_${Date.now()}`, name: "Pista Restaurada", sounds: [sound] };
                    newSoundboards.push(newBoard);
                }
            }
            
            return { ...state, soundboards: newSoundboards, trash: newTrash };
        }
        case 'SET_GLOBAL_FADE_DURATION':
            return { ...state, globalFadeDuration: action.payload };
        case 'TOGGLE_SHOW_HIDDEN_SOUNDS':
            return { ...state, showHiddenSounds: !state.showHiddenSounds };
        default:
            return state;
    }
};

const AppStateContext = createContext<AppState | null>(null);
const AppDispatchContext = createContext<React.Dispatch<Action> | null>(null);
const AudioControlContext = createContext<{
    playingAudioNodesRef: React.RefObject<PlayingAudioNodes>,
    updateSoundVolume: (soundId: string, volume: number) => void,
    handleFadeAll: (duration: number) => void,
    handleStopAll: () => void,
    undo: () => void,
    redo: () => void,
    canUndo: boolean,
    canRedo: boolean,
} | null>(null);

export const useAppContext = () => {
    const state = useContext(AppStateContext);
    const dispatch = useContext(AppDispatchContext);
    const audioControls = useContext(AudioControlContext);
    if (!state || !dispatch || !audioControls) {
        throw new Error('useAppContext debe usarse dentro de un AppProvider');
    }
    return { state, dispatch, ...audioControls };
};

export const AppProvider = ({ children }: { children?: React.ReactNode }) => {
    const initialState: AppState = {
        soundboards: [{ id: 'default', name: 'Mi Primera Pista', sounds: [] }],
        activeBoardId: 'default',
        playbackStates: {},
        soloSoundId: null,
        isMuted: false,
        masterVolume: 1,
        viewMode: 'grid',
        isLoading: true,
        isSidebarCollapsed: false,
        padSize: 224,
        isRearrangeMode: false,
        audioSources: {},
        imageSources: {},
        editMode: false,
        trash: [],
        globalFadeDuration: 5,
        showHiddenSounds: false,
    };
    
    const [state, dispatch] = useReducer(appReducer, initialState);
    const playingAudioNodesRef = useRef<PlayingAudioNodes>({});

    const dispatchRef = useRef(dispatch);
    useEffect(() => { dispatchRef.current = dispatch; }, [dispatch]);

    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    const [past, setPast] = useState<{ soundboards: Soundboard[], activeBoardId: string | null }[]>([]);
    const [future, setFuture] = useState<{ soundboards: Soundboard[], activeBoardId: string | null }[]>([]);
    
    const isUndoRedoAction = useRef(false);
    const isFirstRenderAfterLoadingRef = useRef(true);
    const prevStructureRef = useRef<{ soundboards: Soundboard[], activeBoardId: string | null }>({
        soundboards: initialState.soundboards,
        activeBoardId: initialState.activeBoardId,
    });

    useEffect(() => {
        if (state.isLoading) return;
        
        const currentStr = JSON.stringify(state.soundboards);
        
        if (isFirstRenderAfterLoadingRef.current) {
            isFirstRenderAfterLoadingRef.current = false;
            prevStructureRef.current = {
                soundboards: JSON.parse(currentStr) as Soundboard[],
                activeBoardId: state.activeBoardId
            };
            return;
        }

        const prev = prevStructureRef.current;
        const prevStr = JSON.stringify(prev.soundboards);
        
        const boardsChanged = prevStr !== currentStr;
        const activeBoardChanged = state.activeBoardId !== prev.activeBoardId;
        
        if (boardsChanged || activeBoardChanged) {
            if (!isUndoRedoAction.current) {
                setPast(prevPast => {
                    const nextPast = [...prevPast, { 
                        soundboards: JSON.parse(prevStr) as Soundboard[], 
                        activeBoardId: prev.activeBoardId 
                    }];
                    if (nextPast.length > 50) {
                        nextPast.shift();
                    }
                    return nextPast;
                });
                setFuture([]); // Clear redo stack on new operation
            }
        }
        
        prevStructureRef.current = {
            soundboards: JSON.parse(currentStr) as Soundboard[],
            activeBoardId: state.activeBoardId
        };
        
        isUndoRedoAction.current = false;
    }, [state.soundboards, state.activeBoardId, state.isLoading]);

    const stateRefForHistory = useRef(state);
    useEffect(() => { stateRefForHistory.current = state; }, [state]);
    
    const pastRef = useRef(past);
    useEffect(() => { pastRef.current = past; }, [past]);
    
    const futureRef = useRef(future);
    useEffect(() => { futureRef.current = future; }, [future]);

    const undo = useCallback(() => {
        const currentPast = pastRef.current;
        if (currentPast.length === 0) return;
        
        const previous = currentPast[currentPast.length - 1];
        const currentState = stateRefForHistory.current;
        const currentRefStructure = { 
            soundboards: currentState.soundboards, 
            activeBoardId: currentState.activeBoardId 
        };
        
        isUndoRedoAction.current = true;
        
        setFuture(prevFuture => [...prevFuture, currentRefStructure]);
        setPast(prevPast => prevPast.slice(0, -1));
        
        dispatch({
            type: 'SET_STATE',
            payload: {
                ...currentState,
                soundboards: previous.soundboards,
                activeBoardId: previous.activeBoardId
            }
        });
    }, [dispatch]);

    const redo = useCallback(() => {
        const currentFuture = futureRef.current;
        if (currentFuture.length === 0) return;
        
        const next = currentFuture[currentFuture.length - 1];
        const currentState = stateRefForHistory.current;
        const currentRefStructure = { 
            soundboards: currentState.soundboards, 
            activeBoardId: currentState.activeBoardId 
        };
        
        isUndoRedoAction.current = true;
        
        setPast(prevPast => [...prevPast, currentRefStructure]);
        setFuture(prevFuture => prevFuture.slice(0, -1));
        
        dispatch({
            type: 'SET_STATE',
            payload: {
                ...currentState,
                soundboards: next.soundboards,
                activeBoardId: next.activeBoardId
            }
        });
    }, [dispatch]);

    const canUndo = past.length > 0;
    const canRedo = future.length > 0;

    // Keyboard shortcut listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }

            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const modifierKey = isMac ? e.metaKey : e.ctrlKey;

            if (modifierKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            } else if (modifierKey && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);
    
    const handleStopAll = useCallback(() => {
        Object.values(playingAudioNodesRef.current).forEach((node: PlayingAudioNodes[string]) => {
            if(node) {
              if (node.loopTimer) clearTimeout(node.loopTimer);
              if (node.source) { try { node.source.stop(); } catch(e){} }
              if (node.crossfadeNodes) {
                node.crossfadeNodes.forEach(n => { try { n.source.stop(); } catch(e){} });
              }
            }
        });
        playingAudioNodesRef.current = {};
        dispatchRef.current({ type: 'STOP_ALL' });
    }, []);

    const handleFadeAll = useCallback((duration: number) => {
         const context = getAudioContext();
         Object.entries(playingAudioNodesRef.current).forEach(([soundId, nodes]: [string, PlayingAudioNodes[string]]) => {
            const sound = getSoundById(stateRef.current.soundboards, soundId);
            if (!sound || !nodes) return;

            const fadeOutTime = duration;

            if (nodes.loopTimer) clearTimeout(nodes.loopTimer);

            const fadeAndStop = (node: { source: AudioBufferSourceNode, gainNode: GainNode }) => {
                fadeAudio(node.gainNode, node.gainNode.gain.value, 0, fadeOutTime, sound.fadeOutType, context);
                setTimeout(() => {
                   try { node.source.stop(); } catch(e) {}
                }, fadeOutTime * 1000);
            };

            if (nodes.source && nodes.gainNode) {
                fadeAndStop({ source: nodes.source, gainNode: nodes.gainNode });
            }
            if (nodes.crossfadeNodes) {
                nodes.crossfadeNodes.forEach(fadeAndStop);
            }
        });
         setTimeout(() => dispatchRef.current({ type: 'STOP_ALL'}), duration * 1000 + 500); 
    }, []);

    useEffect(() => {
        const loadState = async () => {
             try {
                const serializedState = localStorage.getItem('soundboardState');
                if (serializedState) {
                    const savedState = JSON.parse(serializedState) as Partial<AppState>;
                    
                    if (savedState && savedState.soundboards && !Array.isArray(savedState.soundboards)) {
                        console.warn('Corrupted `soundboards` in localStorage. Resetting to default.');
                        delete savedState.soundboards;
                    }
                    
                    if (savedState && Array.isArray(savedState.soundboards)) {
                         await Promise.all(savedState.soundboards.map(async (board: Soundboard) => {
                                if (!board.sounds) board.sounds = [];
                                await Promise.all(board.sounds.map(async (sound: Sound | any) => {
                                    // Migration for images
                                    if (sound.image && typeof sound.image === 'string' && sound.image.startsWith('data:')) {
                                        try {
                                            const blob = dataUrlToBlob(sound.image);
                                            const arrayBuffer = await blob.arrayBuffer();
                                            const imageId = await calculateHash(arrayBuffer);
                                            await audioDB.set(imageId, blob);
                                            sound.imageId = imageId;
                                        } catch (e) {}
                                        delete sound.image;
                                    }

                                    // Migration for stopIds -> stopActions
                                    if (Array.isArray(sound.stopIds) && sound.stopIds.length > 0 && (!sound.stopActions || sound.stopActions.length === 0)) {
                                        sound.stopActions = sound.stopIds.map((id: string) => ({ soundId: id, type: 'stop' }));
                                        delete sound.stopIds;
                                    }

                                    // Defaults
                                    sound.volume = isNumber(sound.volume) ? sound.volume : DEFAULT_VOLUME;
                                    sound.pitch = isNumber(sound.pitch) ? sound.pitch : DEFAULT_PITCH;
                                    sound.pan = isNumber(sound.pan) ? sound.pan : DEFAULT_PAN;
                                    sound.crossfade = isNumber(sound.crossfade) ? sound.crossfade : DEFAULT_CROSSFADE;
                                    sound.stopActions = Array.isArray(sound.stopActions) ? sound.stopActions : [];
                                    sound.playCount = isNumber(sound.playCount) ? sound.playCount : 0;
                                    
                                    // Ensure other fields are sanitized...
                                    sound.eqBands = Array.isArray(sound.eqBands) && sound.eqBands.length === 10 ? sound.eqBands : [...EQ_BAND_DEFAULTS];
                                }));
                                return board;
                            }));
                    }

                    const restoredState: AppState = {
                        ...initialState,
                        ...savedState,
                        isLoading: false,
                        audioSources: {},
                        imageSources: {},
                        playbackStates: {},
                        trash: [], 
                        isRearrangeMode: false,
                    };
                    
                    if (restoredState.activeBoardId && !restoredState.soundboards.find(b => b.id === restoredState.activeBoardId)) {
                         restoredState.activeBoardId = restoredState.soundboards.length > 0 ? restoredState.soundboards[0].id : null;
                    }
                    dispatch({ type: 'SET_STATE', payload: restoredState });
                } else {
                   dispatch({ type: 'SET_LOADING', payload: false });
                }
             } catch (e) {
                 console.error("Fallo al cargar estado desde localStorage.", e);
                 localStorage.removeItem('soundboardState');
                 dispatch({ type: 'SET_STATE', payload: { ...initialState, isLoading: false } });
             }
        };
        loadState();
    }, []);

    useEffect(() => {
        const { playbackStates, isLoading, audioSources, imageSources, trash, isRearrangeMode, ...stateToSave } = state;
        if (!isLoading) { 
            try {
                localStorage.setItem('soundboardState', JSON.stringify(stateToSave));
            } catch (e) {
                 console.error("Error al guardar el estado en localStorage.", e);
            }
        }
    }, [state]);
    
    useEffect(() => {
        const context = getAudioContext();
        const masterGainNode = getMasterGainNode();
        if (masterGainNode) {
            const newVolume = state.isMuted ? 0 : state.masterVolume;
            masterGainNode.gain.setTargetAtTime(newVolume, context.currentTime, 0.015);
        }
    }, [state.isMuted, state.masterVolume]);

    const updateSoundVolume = (soundId: string, volume: number) => {
        dispatch({ type: 'UPDATE_SOUND', payload: { soundId, updates: { volume } } });
        const audioSetup = playingAudioNodesRef.current[soundId];
        if (audioSetup && !audioSetup.fadeState) {
            const context = getAudioContext();
            const allGains: GainNode[] = [];
            if (audioSetup.gainNode) allGains.push(audioSetup.gainNode);
            if (audioSetup.crossfadeNodes) allGains.push(...audioSetup.crossfadeNodes.map(n => n.gainNode));
            
            allGains.forEach(gainNode => {
                if (gainNode) {
                    gainNode.gain.setTargetAtTime(volume, context.currentTime, 0.015);
                }
            });
        }
    };

    return (
        <AppStateContext.Provider value={state}>
            <AppDispatchContext.Provider value={dispatch}>
                 <AudioControlContext.Provider value={{ playingAudioNodesRef, updateSoundVolume, handleFadeAll, handleStopAll, undo, redo, canUndo, canRedo }}>
                    {children}
                </AudioControlContext.Provider>
            </AppDispatchContext.Provider>
        </AppStateContext.Provider>
    );
};
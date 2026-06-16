import { soundColors } from './constants';

export type FadeType = 'linear' | 'exponential';

export interface Sound {
    id: string; 
    audioSourceId: string; 
    name: string;
    color: keyof typeof soundColors;
    imageId?: string | null;
    volume: number;
    pitch: number;
    pan: number;
    loop: boolean;
    retriggerable: boolean;
    crossfade: number;
    fadeIn: number;
    fadeOut: number;
    fadeInType: FadeType;
    fadeOutType: FadeType;
    startTime: number;
    endTime: number | null;
    reverb: number;
    delayTime: number;
    delayFeedback: number;
    // New EQ properties
    eqEnabled: boolean;
    eqPreamp: number; // In dB, e.g., -20 to 20
    eqBands: number[]; // Array of 10 gains in dB
    
    // Advanced Automation
    stopActions: { soundId: string, type: 'stop' | 'pause' | 'play' }[]; // Replaces stopIds
    
    // Usage stats
    playCount: number;
    pauseFade?: number;
    
    // Live Guidance & Visibility Control
    hidden?: boolean;
    instructions?: string;
}

export interface Soundboard {
    id: string;
    name: string;
    sounds: Sound[];
}

export type TrashItem = {
    type: 'sound' | 'soundboard';
    item: Sound | Soundboard;
    deletedAt: number;
    originalBoardId?: string; // For sounds
};

export type PlaybackStatus = {
    status: 'playing' | 'paused';
    progress: number;
    contextStartTime: number;
};

export type PlayingAudioNodes = { [key: string]: {
    // FIX: Made source and gainNode optional to support crossfade loop implementation.
    source?: AudioBufferSourceNode,
    gainNode?: GainNode,
    panner: StereoPannerNode,
    analyser: AnalyserNode,
    // Effects
    delay?: DelayNode,
    delayFeedback?: GainNode,
    convolver?: ConvolverNode,
    dryGain?: GainNode,
    wetGain?: GainNode,
    // New EQ nodes
    preampNode?: GainNode,
    eqNodes?: BiquadFilterNode[],

    fadeState?: 'out' | 'in';
    fadeTimeoutId?: any;
    // For crossfade loops
    loopTimer?: any;
    crossfadeNodes?: { source: AudioBufferSourceNode, gainNode: GainNode }[];
}};

export type AppState = {
    soundboards: Soundboard[];
    activeBoardId: string | null;
    playbackStates: { [soundId: string]: PlaybackStatus };
    soloSoundId: string | null;
    isMuted: boolean;
    masterVolume: number;
    viewMode: 'grid' | 'list';
    isLoading: boolean;
    isSidebarCollapsed: boolean;
    padSize: number;
    isRearrangeMode: boolean; // New state for organization mode
    audioSources: { [sourceId: string]: AudioBuffer | 'loading' | 'error' };
    imageSources: { [imageId: string]: string | 'loading' | 'error' };
    editMode: boolean;
    trash: TrashItem[];
    globalFadeDuration: number; // Global fade out duration setting
    showHiddenSounds: boolean; // Control whether hidden/archived sounds are shown
};

export type Action =
    | { type: 'SET_STATE'; payload: AppState }
    | { type: 'ADD_SOUNDBOARD'; payload: string }
    | { type: 'ADD_SOUNDBOARDS', payload: Soundboard[] }
    | { type: 'RENAME_SOUNDBOARD'; payload: { id: string; name: string } }
    | { type: 'DELETE_SOUNDBOARD'; payload: string }
    | { type: 'SET_ACTIVE_BOARD'; payload: string | null }
    | { type: 'REORDER_BOARDS'; payload: { sourceIndex: number, destIndex: number } }
    | { type: 'SET_SOUNDBOARDS_ORDER'; payload: Soundboard[] }
    | { type: 'ADD_SOUND'; payload: { boardId: string; sound: Sound } }
    | { type: 'UPDATE_SOUND'; payload: { soundId: string; updates: Partial<Sound> } }
    | { type: 'DELETE_SOUND'; payload: { soundId: string } }
    | { type: 'REORDER_SOUNDS'; payload: { boardId: string; sourceIndex: number; destIndex: number } }
    | { type: 'MOVE_SOUND'; payload: { sound: Sound, sourceBoardId: string, destBoardId: string } }
    | { type: 'PLAY_SOUND'; payload: { soundId: string, contextStartTime: number, progress: number } }
    | { type: 'PAUSE_SOUND'; payload: { soundId: string, progress: number } }
    | { type: 'STOP_SOUND'; payload: { soundId: string } }
    | { type: 'STOP_ALL' }
    | { type: 'TOGGLE_SOLO'; payload: string }
    | { type: 'TOGGLE_MUTE' }
    | { type: 'TOGGLE_SIDEBAR' }
    | { type: 'TOGGLE_EDIT_MODE' }
    | { type: 'TOGGLE_REARRANGE_MODE' }
    | { type: 'SET_MASTER_VOLUME'; payload: number }
    | { type: 'SET_VIEW_MODE'; payload: 'grid' | 'list' }
    | { type: 'SET_PAD_SIZE'; payload: number }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_AUDIO_SOURCE'; payload: { sourceId: string, buffer: AudioBuffer | 'loading' | 'error' } }
    | { type: 'SET_IMAGE_SOURCE'; payload: { imageId: string, url: string | 'loading' | 'error' } }
    | { type: 'RESTORE_ITEM'; payload: { itemId: string } }
    | { type: 'UPDATE_PLAYBACK_PROGRESS'; payload: { soundId: string, progress: number } }
    | { type: 'SET_GLOBAL_FADE_DURATION'; payload: number }
    | { type: 'TOGGLE_SHOW_HIDDEN_SOUNDS' };
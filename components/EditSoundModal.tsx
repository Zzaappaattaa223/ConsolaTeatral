import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { getAudioContext, getMasterGainNode, getImpulseBuffer, createEqChain, updateEqChain, renderAudioWithEffects, spliceAudioBuffers } from '../lib/audio';
import { soundColors, DEFAULT_VOLUME, DEFAULT_PITCH, DEFAULT_PAN, DEFAULT_CROSSFADE, EQ_BANDS, PREAMP_DEFAULT, EQ_BAND_DEFAULTS } from '../constants';
import { Sound } from '../types';
import Modal from './Modal';
import WaveformEditor from './WaveformEditor';
import { PlayIcon, PauseIcon, StopIcon, SetMarkerIcon, GoToStartIcon, RewindIcon, FastForwardIcon, GoToEndIcon, LockClosedIcon, LockOpenIcon, ResetIcon } from './icons';
import ScrubbableInput from './ScrubbableInput';
import DuplicateChoiceModal from './DuplicateChoiceModal';
import { audioDB } from '../lib/db';
// FIX: Import `dataUrlToBlob` to handle image data processing.
import { calculateHash, bufferToWaveBlob, dataUrlToBlob } from '../lib/utils';


// const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

const EqualizerControls = ({ settings, onUpdate }: { settings: Sound, onUpdate: (updates: Partial<Sound>) => void}) => {
    const [isLinked, setIsLinked] = useState(false);
    const preampTooltipRef = useRef<HTMLDivElement>(null);
    const preampSliderRef = useRef<HTMLInputElement>(null);
    
    const bands = Array.isArray(settings.eqBands) && settings.eqBands.length === EQ_BANDS.length 
        ? settings.eqBands 
        : [...EQ_BAND_DEFAULTS];

    const handleBandChange = (index: number, value: number) => {
        const newBands = [...bands];
        const originalValue = bands[index];
        newBands[index] = value;

        if (isLinked) {
            const delta = value - originalValue;
            const influence = [0.6, 0.3]; // Influencia proporcional para hasta 2 vecinos

            for (let i = 1; i <= influence.length; i++) {
                // Vecino derecho
                const rightIndex = index + i;
                if (rightIndex < newBands.length) {
                    const neighborOriginal = bands[rightIndex];
                    const affectedValue = neighborOriginal + delta * influence[i - 1];
                    newBands[rightIndex] = Math.max(-20, Math.min(20, affectedValue));
                }
                // Vecino izquierdo
                const leftIndex = index - i;
                if (leftIndex >= 0) {
                    const neighborOriginal = bands[leftIndex];
                    const affectedValue = neighborOriginal + delta * influence[i - 1];
                    newBands[leftIndex] = Math.max(-20, Math.min(20, affectedValue));
                }
            }
        }
        onUpdate({ eqBands: newBands });
    };

    const handleReset = () => {
        onUpdate({
            eqPreamp: PREAMP_DEFAULT,
            eqBands: [...EQ_BAND_DEFAULTS],
        });
    };

    useEffect(() => {
        const slider = preampSliderRef.current;
        const tooltip = preampTooltipRef.current;
        if (slider && tooltip) {
            const min = parseFloat(slider.min);
            const max = parseFloat(slider.max);
            const val = settings.eqPreamp;
            const percent = (val - min) / (max - min);
            const thumbWidth = 24;
            const tooltipWidth = tooltip.offsetWidth;
            const newPosition = percent * (slider.offsetWidth - thumbWidth) + (thumbWidth / 2) - (tooltipWidth / 2);
            tooltip.style.left = `${newPosition}px`;
        }
    }, [settings.eqPreamp]);


    return (
        <div className="animate-fade-in space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-base font-semibold text-gray-300">ECUALIZADOR</h3>
                <div className="flex items-center">
                    <label htmlFor="eq-enabled" className="text-sm font-medium text-gray-400 mr-3">Habilitar</label>
                    <button role="switch" aria-checked={settings.eqEnabled} onClick={() => onUpdate({ eqEnabled: !settings.eqEnabled })} className={`${settings.eqEnabled ? 'bg-orange-500' : 'bg-gray-600'} relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-orange-500`}>
                        <span className={`${settings.eqEnabled ? 'translate-x-6' : 'translate-x-1'} inline-block w-4 h-4 transform bg-white rounded-full transition-transform`} />
                    </button>
                </div>
            </div>

            <div className={`space-y-4 transition-opacity ${settings.eqEnabled ? 'opacity-100' : 'opacity-50'}`}>
                <div className="relative pt-2 text-left">
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Preamplificador</label>
                        <span className="text-xs font-bold text-orange-400 font-mono">
                            {(settings.eqPreamp > 0 ? '+' : '') + settings.eqPreamp.toFixed(1)} dB
                        </span>
                    </div>
                    <div className="relative w-full h-8 bg-gray-950/85 rounded-md border border-gray-800 flex items-center overflow-hidden shadow-inner mt-1">
                        {/* Zero dB indicator line */}
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-800 z-0"></div>
                        
                        {/* Fill bar from 0dB */}
                        <div 
                            className={`absolute top-0 bottom-0 z-0 ${settings.eqPreamp >= 0 ? 'bg-orange-500/15' : 'bg-indigo-500/15'}`}
                            style={{
                                left: settings.eqPreamp >= 0 ? '50%' : `${50 - (Math.abs(settings.eqPreamp) / 20) * 50}%`,
                                right: settings.eqPreamp >= 0 ? `${50 - (settings.eqPreamp) / 20 * 50}%` : '50%'
                            }}
                        ></div>
                        
                        {/* Hidden input range */}
                        <input
                            ref={preampSliderRef}
                            type="range"
                            min="-20" max="20" step="0.5"
                            value={settings.eqPreamp}
                            onChange={e => onUpdate({ eqPreamp: parseFloat(e.target.value) })}
                            className="w-full h-full absolute inset-0 z-20 opacity-0 cursor-ew-resize"
                            disabled={!settings.eqEnabled}
                        />
                        
                        {/* Visual fader cap */}
                        <div 
                            className={`absolute w-6 top-0.5 bottom-0.5 rounded border shadow-[0_1px_3px_rgba(0,0,0,0.4)] flex justify-center items-center transition-all z-10 pointer-events-none ${
                                settings.eqEnabled 
                                    ? 'bg-gradient-to-b from-gray-300 via-gray-400 to-gray-500 border-gray-200' 
                                    : 'bg-gray-700 border-gray-600'
                            }`}
                            style={{
                                left: `calc(${50 + (settings.eqPreamp / 20) * 50}% - 12px)`
                            }}
                        >
                            <div className="w-full h-0.5 bg-gray-900/40"></div>
                        </div>
                    </div>
                </div>
                
                 {/* Desktop View */}
                <div className="hidden lg:flex justify-between items-end gap-1.5 h-44 bg-gray-900/25 p-3 rounded-lg border border-gray-800/40">
                    {EQ_BANDS.map((freq, i) => (
                        <div key={freq} className="flex flex-col items-center flex-1 h-full">
                            <span className="text-[10px] font-bold text-gray-400 font-mono mb-2 tabular-nums">
                                {(bands[i] >= 0 ? '+' : '') + bands[i].toFixed(0)}
                            </span>
                             <div className="relative h-28 w-9 bg-gray-950/80 rounded-md border border-gray-800 flex justify-center items-center overflow-hidden shadow-inner">
                                {/* Zero dB line indicator */}
                                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-800/80 z-0"></div>
                                
                                {/* Fill bar from 0dB */}
                                <div 
                                    className={`absolute left-0 right-0 z-0 ${bands[i] >= 0 ? 'bg-orange-500/15' : 'bg-indigo-500/15'}`}
                                    style={{
                                        top: bands[i] >= 0 ? `${50 - (bands[i] / 20) * 50}%` : '50%',
                                        bottom: bands[i] >= 0 ? '50%' : `${50 - (Math.abs(bands[i]) / 20) * 50}%`
                                    }}
                                ></div>
                                
                                {/* Scale Ticks */}
                                <div className="absolute inset-y-1.5 left-1 flex flex-col justify-between text-[6px] text-gray-600 font-mono pointer-events-none select-none">
                                    <span>+20</span>
                                    <span>0</span>
                                    <span>-20</span>
                                </div>
                                
                                {/* Hidden vertical range input on top */}
                                <input
                                    type="range"
                                    min="-20" max="20" step="0.5"
                                    value={bands[i]}
                                    onChange={e => handleBandChange(i, parseFloat(e.target.value))}
                                    className="h-full w-full absolute inset-0 z-20 cursor-ns-resize opacity-0"
                                    style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' }}
                                    disabled={!settings.eqEnabled}
                                />
                                
                                {/* Visual Slider Cap (Metal Fader Look) */}
                                <div 
                                    className={`absolute left-0.5 right-0.5 h-4.5 rounded border shadow-[0_2px_4px_rgba(0,0,0,0.5)] flex items-center justify-center transition-all z-10 pointer-events-none ${
                                        settings.eqEnabled 
                                            ? 'bg-gradient-to-r from-gray-300 via-gray-400 to-gray-500 border-gray-200' 
                                            : 'bg-gray-750 border-gray-700'
                                    }`}
                                    style={{
                                        top: `calc(${50 - (bands[i] / 20) * 50}% - 9px)`
                                    }}
                                >
                                    {/* Metal Fader center strip */}
                                    <div className="h-full w-0.5 bg-gray-900/40"></div>
                                </div>
                            </div>
                            <span className="mt-2 text-[10px] font-bold text-gray-550 uppercase font-mono">{freq >= 1000 ? `${freq/1000}k` : freq}</span>
                        </div>
                    ))}
                </div>

                {/* Mobile View */}
                <div className="flex flex-col lg:hidden gap-2 bg-gray-900/25 p-3 rounded-lg border border-gray-800/40">
                    {EQ_BANDS.map((freq, i) => (
                        <div key={freq} className="grid grid-cols-[38px_1fr_42px] items-center gap-3">
                            <span className="text-[10px] font-bold text-gray-450 text-right uppercase font-mono">{freq >= 1000 ? `${freq / 1000}k` : freq}</span>
                             <div className="relative flex-grow h-6 bg-gray-950/80 rounded-md border border-gray-800 flex items-center overflow-hidden shadow-inner">
                                {/* Zero dB indicator line */}
                                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-800/80 z-0"></div>
                                
                                {/* Fill bar from 0dB */}
                                <div 
                                    className={`absolute top-0 bottom-0 z-0 ${bands[i] >= 0 ? 'bg-orange-500/15' : 'bg-indigo-500/15'}`}
                                    style={{
                                        left: bands[i] >= 0 ? '50%' : `${50 - (Math.abs(bands[i]) / 20) * 50}%`,
                                        right: bands[i] >= 0 ? `${50 - (bands[i] / 20) * 50}%` : '50%'
                                    }}
                                ></div>
                                
                                {/* Hidden horizontal range input */}
                                <input
                                    type="range"
                                    min="-20" max="20" step="0.5"
                                    value={bands[i]}
                                    onChange={e => handleBandChange(i, parseFloat(e.target.value))}
                                    className="w-full h-full absolute inset-0 z-20 opacity-0 cursor-ew-resize"
                                    disabled={!settings.eqEnabled}
                                />
                                
                                {/* Visual Slider Cap (Metal Fader Look) */}
                                <div 
                                    className={`absolute w-5 top-0.5 bottom-0.5 rounded border shadow-[0_1px_3px_rgba(0,0,0,0.4)] flex justify-center items-center transition-all z-10 pointer-events-none ${
                                        settings.eqEnabled 
                                            ? 'bg-gradient-to-b from-gray-300 via-gray-400 to-gray-500 border-gray-200' 
                                            : 'bg-gray-700 border-gray-600'
                                    }`}
                                    style={{
                                        left: `calc(${50 + (bands[i] / 20) * 50}% - 10px)`
                                    }}
                                >
                                    {/* Metal Fader center strip */}
                                    <div className="w-full h-0.5 bg-gray-900/40"></div>
                                </div>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 font-mono tabular-nums text-right">
                                {(bands[i] >= 0 ? '+' : '') + bands[i].toFixed(0)}dB
                            </span>
                        </div>
                    ))}
                </div>

                 <div className="flex justify-between items-center pt-2">
                    <button onClick={() => setIsLinked(!isLinked)} className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-md transition-colors cursor-pointer ${isLinked ? 'bg-indigo-600 text-white' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'}`} title="Anclar bandas adyacentes">
                        {isLinked ? <LockClosedIcon /> : <LockOpenIcon />}
                        <span>Anclaje Adyacente</span>
                    </button>
                    <button onClick={handleReset} className="text-xs text-orange-400 hover:text-orange-300 font-bold px-4 py-2 rounded-md hover:bg-gray-700/50 transition-colors cursor-pointer">
                        Restablecer
                    </button>
                </div>
            </div>
        </div>
    );
};


const EditSoundModal = ({ sound, onClose }: { sound: Sound; onClose: () => void }) => {
    // FIX: Retrieve `imageSources` from context to display images correctly.
    const { state, dispatch } = useAppContext();
    const { soundboards, activeBoardId, audioSources, imageSources } = state;
    const [copyTargetBoard, setCopyTargetBoard] = useState<string>(activeBoardId || '');
    const [activeTab, setActiveTab] = useState<'waveform' | 'properties' | 'effects' | 'empalmar' | 'extras'>('waveform');
    const [imageGenPrompt, setImageGenPrompt] = useState('');
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [imageError, setImageError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDuplicateChoiceModalOpen, setDuplicateChoiceModalOpen] = useState(false);
    const [isRendering, setIsRendering] = useState(false);

    // List of alternative sounds in the soundboard
    const allBoardSounds = soundboards.flatMap(b => b.sounds);
    const otherSounds = allBoardSounds.filter(s => s.id !== sound.id);

    // States for Smart Splicing tab
    const [spliceSourceSoundId, setSpliceSourceSoundId] = useState<string>('');
    const [spliceSourceStart, setSpliceSourceStart] = useState<number>(0);
    const [spliceSourceEnd, setSpliceSourceEnd] = useState<number>(1);
    const [spliceTargetStart, setSpliceTargetStart] = useState<number>(0);
    const [spliceTargetEnd, setSpliceTargetEnd] = useState<number>(1);
    const [spliceCrossfade, setSpliceCrossfade] = useState<number>(0.10);
    const [spliceSourceVolume, setSpliceSourceVolume] = useState<number>(1.00);
    const [draftSplicedBuffer, setDraftSplicedBuffer] = useState<AudioBuffer | null>(null);
    const [draftPlaying, setDraftPlaying] = useState<boolean>(false);
    const [originalPlaying, setOriginalPlaying] = useState<boolean>(false);
    const [spliceSuccessMessage, setSpliceSuccessMessage] = useState<string>('');
    const [spliceErrorMessage, setSpliceErrorMessage] = useState<string>('');
    const [spliceAiPrompt, setSpliceAiPrompt] = useState<string>('');
    const [isAnalyzingAi, setIsAnalyzingAi] = useState<boolean>(false);
    const [splicePlanExplanation, setSplicePlanExplanation] = useState<string>('');
    
    // Refs for managing Web Audio API nodes
    const draftSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const previewSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const previewGainNodeRef = useRef<GainNode | null>(null);
    const previewPannerNodeRef = useRef<StereoPannerNode | null>(null);
    const previewPreampNodeRef = useRef<GainNode | null>(null);
    const previewEqNodesRef = useRef<BiquadFilterNode[] | null>(null);
    const previewDelayNodeRef = useRef<DelayNode | null>(null);
    const previewDelayFeedbackRef = useRef<GainNode | null>(null);
    const previewConvolverNodeRef = useRef<ConvolverNode | null>(null);
    const previewDryGainRef = useRef<GainNode | null>(null);
    const previewWetGainRef = useRef<GainNode | null>(null);

    const [impulseBuffer, setImpulseBuffer] = useState<AudioBuffer|null>(null);

    // State for preview playback
    const [previewStatus, setPreviewStatus] = useState<'stopped' | 'playing' | 'paused'>('stopped');
    const [previewTime, setPreviewTime] = useState(sound.startTime ?? 0);
    
    // Refs for managing animation and timing
    const previewAnimFrame = useRef<number | null>(null);
    const previewStartTimestamp = useRef<number>(0);
    const previewStartOffset = useRef<number>(0);
    const ffRewIntervalRef = useRef<any>(null);

    // Local state for the sound being edited
    const [localSound, setLocalSound] = useState({ ...sound });
    // FIX: Add separate state for the image preview URL to avoid adding temporary properties to the Sound object.
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    const soundRef = useRef(localSound);
    soundRef.current = localSound;

    const buffer = audioSources[localSound.audioSourceId];
    const audioDuration = buffer instanceof AudioBuffer ? buffer.duration : 0;
    
    // FIX: Set up an effect to resolve the imageId to a displayable blob URL.
    useEffect(() => {
        let objectUrl: string | null = null;
        if (localSound.imageId && imageSources[localSound.imageId] && typeof imageSources[localSound.imageId] === 'string') {
            objectUrl = imageSources[localSound.imageId] as string;
            setImagePreviewUrl(objectUrl);
        } else {
            setImagePreviewUrl(null);
        }

        return () => {
            // Clean up previous blob URL if it exists to prevent memory leaks
            if (objectUrl && imagePreviewUrl && objectUrl !== imagePreviewUrl) {
                URL.revokeObjectURL(imagePreviewUrl);
            }
        };
    }, [localSound.imageId, imageSources]);


    useEffect(() => {
        const loadImpulse = async () => {
            const context = getAudioContext();
            const buffer = await getImpulseBuffer(context);
            setImpulseBuffer(buffer);
        }
        loadImpulse();
    }, []);

    useEffect(() => {
        if (!spliceSourceSoundId && otherSounds.length > 0) {
            setSpliceSourceSoundId(otherSounds[0].id);
        }
    }, [otherSounds, spliceSourceSoundId]);

    useEffect(() => {
        if (spliceSourceSoundId) {
            const srcSound = otherSounds.find(s => s.id === spliceSourceSoundId);
            if (srcSound) {
                const srcBuf = audioSources[srcSound.audioSourceId];
                if (srcBuf instanceof AudioBuffer) {
                    setSpliceSourceStart(0);
                    setSpliceSourceEnd(srcBuf.duration);
                }
            }
        }
    }, [spliceSourceSoundId, audioSources]);

    useEffect(() => {
        setSpliceTargetStart(localSound.startTime ?? 0);
        setSpliceTargetEnd(localSound.endTime ?? audioDuration);
    }, [localSound.id, localSound.startTime, localSound.endTime, audioDuration]);

    // Live pre-rendering of splice draft as parameters change
    useEffect(() => {
        if (!(buffer instanceof AudioBuffer)) return;
        const sourceSound = otherSounds.find(s => s.id === spliceSourceSoundId);
        if (!sourceSound) return;
        const sourceBuf = audioSources[sourceSound.audioSourceId];
        if (!(sourceBuf instanceof AudioBuffer)) return;
        
        try {
            const preBuf = spliceAudioBuffers(
                buffer,
                spliceTargetStart,
                spliceTargetEnd,
                sourceBuf,
                spliceSourceStart,
                spliceSourceEnd,
                spliceCrossfade,
                spliceSourceVolume
            );
            setDraftSplicedBuffer(preBuf);
        } catch (e) {
            console.error("Draft pre-render error:", e);
        }
    }, [buffer, spliceSourceSoundId, spliceSourceStart, spliceSourceEnd, spliceTargetStart, spliceTargetEnd, spliceCrossfade, spliceSourceVolume, audioSources]);

    const stopAndClearPreview = useCallback(() => {
        if (ffRewIntervalRef.current) {
            cancelAnimationFrame(ffRewIntervalRef.current);
            ffRewIntervalRef.current = null;
        }
        if (previewAnimFrame.current) {
            cancelAnimationFrame(previewAnimFrame.current);
            previewAnimFrame.current = null;
        }
        
        // Disconnect nodes in reverse order to be safe
        previewSourceNodeRef.current?.stop(0);
        previewSourceNodeRef.current?.disconnect();
        previewGainNodeRef.current?.disconnect();
        previewPannerNodeRef.current?.disconnect();
        previewPreampNodeRef.current?.disconnect();
        previewEqNodesRef.current?.forEach(n => n.disconnect());
        previewDelayNodeRef.current?.disconnect();
        previewDelayFeedbackRef.current?.disconnect();
        previewConvolverNodeRef.current?.disconnect();
        previewDryGainRef.current?.disconnect();
        previewWetGainRef.current?.disconnect();
        
        // Clear refs
        previewSourceNodeRef.current = null;
        previewGainNodeRef.current = null;
        previewPannerNodeRef.current = null;
        previewPreampNodeRef.current = null;
        previewEqNodesRef.current = null;
        previewDelayNodeRef.current = null;
        previewDelayFeedbackRef.current = null;
        previewConvolverNodeRef.current = null;
        previewDryGainRef.current = null;
        previewWetGainRef.current = null;
    }, []);

    const stopDraftPlayback = useCallback(() => {
        if (draftSourceRef.current) {
            try {
                draftSourceRef.current.stop();
            } catch (e) {}
            try {
                draftSourceRef.current.disconnect();
            } catch (e) {}
            draftSourceRef.current = null;
        }
        setDraftPlaying(false);
        setOriginalPlaying(false);
    }, []);

    const playDraftOrOriginal = useCallback((bufToPlay: AudioBuffer, type: 'draft' | 'original') => {
        stopAndClearPreview(); // Detener el reproductor de efectos principal
        stopDraftPlayback();   // Detener cualquier playback de borrador activo
        
        const context = getAudioContext();
        const source = context.createBufferSource();
        source.buffer = bufToPlay;
        
        // Conectar al nodo de salida máster global para conservar el control de volumen general
        const masterGain = getMasterGainNode();
        if (masterGain) {
            source.connect(masterGain);
        } else {
            source.connect(context.destination);
        }
        
        draftSourceRef.current = source;
        if (type === 'draft') {
            setDraftPlaying(true);
        } else {
            setOriginalPlaying(true);
        }
        
        source.start(0);
        source.onended = () => {
            if (draftSourceRef.current === source) {
                setDraftPlaying(false);
                setOriginalPlaying(false);
                draftSourceRef.current = null;
            }
        };
    }, [stopAndClearPreview, stopDraftPlayback]);

    // Detectar de forma automática los límites del fragmento de voz/sonido evitando el silencio
    const handleAutoDetectLimits = () => {
        const srcSound = otherSounds.find(s => s.id === spliceSourceSoundId);
        if (!srcSound) {
            setSpliceErrorMessage("Selecciona una pista origen para poder analizar sus límites.");
            return;
        }
        const srcBuf = audioSources[srcSound.audioSourceId];
        if (!(srcBuf instanceof AudioBuffer)) {
            setSpliceErrorMessage("No se pudo cargar el audio de la pista origen seleccionada.");
            return;
        }
        
        const threshold = 0.015; // Límite de amplitud para voz activa (aprox. -36dB)
        const sr = srcBuf.sampleRate;
        const len = srcBuf.length;
        
        let firstActiveIdx = -1;
        let lastActiveIdx = -1;
        
        // Buscamos sobre el canal 0 principal para máxima velocidad del análisis
        const data = srcBuf.getChannelData(0);
        for (let i = 0; i < len; i++) {
            if (Math.abs(data[i]) > threshold) {
                if (firstActiveIdx === -1) firstActiveIdx = i;
                lastActiveIdx = i;
            }
        }
        
        if (firstActiveIdx !== -1 && lastActiveIdx !== -1) {
            // Añadir un pequeño margen de seguridad de 50ms (0.05s) a cada lado para no truncar abruptamente
            const startS = Math.max(0, (firstActiveIdx / sr) - 0.05);
            const endS = Math.min(srcBuf.duration, (lastActiveIdx / sr) + 0.05);
            
            setSpliceSourceStart(Number(startS.toFixed(2)));
            setSpliceSourceEnd(Number(endS.toFixed(2)));
            setSpliceSuccessMessage(`🔍 ¡Límites del suspiro/voz detectados con éxito! Rango identificado de señal activa: ${startS.toFixed(2)}s a ${endS.toFixed(2)}s.`);
        } else {
            // Si todo está muy bajo, probar con un umbral más sensible
            let sensitiveFound = -1;
            for (let i = 0; i < len; i++) {
                if (Math.abs(data[i]) > 0.005) { sensitiveFound = i; break; }
            }
            if (sensitiveFound !== -1) {
                setSpliceSuccessMessage("⚠️ Audio demasiado silencioso. Se ha configurado toda la pista por defecto.");
            } else {
                setSpliceErrorMessage("No se detectó audio activo superior al umbral de silencio en la pista seleccionada.");
            }
        }
    };

    // Effect to stop everything when closing or unmounting the modal component
    useEffect(() => {
        return () => {
            stopAndClearPreview();
            stopDraftPlayback();
        };
    }, [stopAndClearPreview, stopDraftPlayback]);

    // Effect for real-time parameter changes
    useEffect(() => {
        if (previewStatus !== 'stopped') {
            const context = getAudioContext();
            const { pitch, pan, delayTime, delayFeedback, reverb } = localSound;

            if (previewSourceNodeRef.current) previewSourceNodeRef.current.playbackRate.value = pitch ?? DEFAULT_PITCH;
            if (previewPannerNodeRef.current) previewPannerNodeRef.current.pan.setTargetAtTime(pan ?? DEFAULT_PAN, context.currentTime, 0.015);
            if (previewDelayNodeRef.current) previewDelayNodeRef.current.delayTime.setTargetAtTime(delayTime ?? 0, context.currentTime, 0.015);
            if (previewDelayFeedbackRef.current) previewDelayFeedbackRef.current.gain.setTargetAtTime(delayFeedback ?? 0, context.currentTime, 0.015);
            
            if(previewDryGainRef.current && previewWetGainRef.current) {
                const reverbAmount = reverb ?? 0;
                previewWetGainRef.current.gain.setTargetAtTime(reverbAmount, context.currentTime, 0.015);
                previewDryGainRef.current.gain.setTargetAtTime(1 - reverbAmount, context.currentTime, 0.015);
            }
            
            updateEqChain({ preampNode: previewPreampNodeRef.current ?? undefined, eqNodes: previewEqNodesRef.current ?? undefined }, localSound, context);
        }
    }, [localSound, previewStatus]);

    const handleStop = useCallback(() => {
        stopAndClearPreview();
        setPreviewStatus('stopped');
        setPreviewTime(soundRef.current.startTime ?? 0);
    }, [stopAndClearPreview]);

    const handleAnalyzeSpliceAi = async () => {
        if (!spliceAiPrompt.trim()) {
            setSpliceErrorMessage("Por favor, escribe una instrucción para la IA.");
            return;
        }
        setIsAnalyzingAi(true);
        setSpliceErrorMessage('');
        setSpliceSuccessMessage('');

        const availableSoundsList = otherSounds.map(s => {
            const sBuf = audioSources[s.audioSourceId];
            const d = sBuf instanceof AudioBuffer ? sBuf.duration : 0;
            return { id: s.id, name: s.name, durationSeconds: d };
        });

        const currentSoundInfo = {
            name: localSound.name,
            durationSeconds: audioDuration
        };

        const aiPromptText = `Analiza la siguiente orden del usuario para empalmar audios.
El usuario quiere reemplazar una porción de sonido de la pista actual ("${currentSoundInfo.name}", duración: ${currentSoundInfo.durationSeconds.toFixed(2)}s) por otra porción de sonido proveniente de una pista origen.

Pistas origen disponibles:
${JSON.stringify(availableSoundsList)}

Orden del usuario: "${spliceAiPrompt}"

Instrucciones de formato del JSON resultante:
Debes responder estrictamente en formato JSON válido que siga este esquema JSON:
{
  "sourceSoundNameMatched": "Nombre de la pista origen que mejor encaja con la petición, o cadena vacía si no se detecta ninguna",
  "sourceStart": <número o null, segundos de inicio en la pista origen>,
  "sourceEnd": <número o null, segundos de fin en la pista origen>,
  "targetStart": <número o null, segundos de inicio del reemplazo en la pista actual>,
  "targetEnd": <número o null, segundos de fin del reemplazo en la pista actual>,
  "crossfade": <número o null, segundos de suavizado a aplicar>,
  "sourceVolume": <número o null, multiplicador de volumen del segmento origen, ej: 1.5 para hacerlo sonar un 50% más fuerte, 1.0 para normal, 0.7 para más suave>,
  "explanation": "Una explicación redactada en tono cordial e inteligible explicando el plan de acción previsto del empalme detallado y pidiendo confirmación (ej: 'Plan: Reemplazar el segmento de 0.5s a 1.5s de la pista actual con los segundos 1.2s a 2.4s de Tarjeta 3, aplicando un suave fundido cruzado de 0.10s. ¿Deseas aplicar estos parámetros para generar el empalme?')"
}

Ejemplo de respuesta esperada:
{
  "sourceSoundNameMatched": "Tarjeta 3",
  "sourceStart": 1.2,
  "sourceEnd": 2.4,
  "targetStart": 0.5,
  "targetEnd": 1.5,
  "crossfade": 0.1,
  "sourceVolume": 1.5,
  "explanation": "He analizado tu petición. El plan es tomar el segmento del suspiro de la Tarjeta 3 (del segundo 1.20 al 2.40), aumentar su volumen a 150% (x1.5) e insertarlo en esta pista (reemplazando desde el segundo 0.50 al 1.50) usando un suavizado de 0.1s. ¿Es correcto este plan de acción antes de procesar el empalme?"
}`;

        try {
            const response = await fetch('/api/generate-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gemini-3.5-flash',
                    contents: { parts: [{ text: aiPromptText }] },
                    config: {
                        responseMimeType: 'application/json'
                    }
                })
            });

            if (!response.ok) throw new Error("Fallo al consultar a Gemini.");
            const data = await response.json();
            
            if (data.text) {
                const parsed = JSON.parse(data.text);
                
                // Tratar de buscar la pista origen coincidente
                if (parsed.sourceSoundNameMatched) {
                    const term = parsed.sourceSoundNameMatched.toLowerCase();
                    const matched = otherSounds.find(s => 
                        s.name.toLowerCase().includes(term) || term.includes(s.name.toLowerCase())
                    );
                    if (matched) {
                        setSpliceSourceSoundId(matched.id);
                        
                        // Una vez seteada, cargar parámetros
                        const matchedBuf = audioSources[matched.audioSourceId];
                        const matchedDur = matchedBuf instanceof AudioBuffer ? matchedBuf.duration : 0;
                        
                        if (typeof parsed.sourceStart === 'number') {
                            setSpliceSourceStart(Math.max(0, Math.min(parsed.sourceStart, matchedDur)));
                        } else {
                            setSpliceSourceStart(0);
                        }
                        
                        if (typeof parsed.sourceEnd === 'number') {
                            setSpliceSourceEnd(Math.max(0, Math.min(parsed.sourceEnd, matchedDur)));
                        } else {
                            setSpliceSourceEnd(matchedDur);
                        }
                    } else {
                        setSpliceErrorMessage(`La IA sugirió usar "${parsed.sourceSoundNameMatched}" pero no se encontró ninguna pista con ese nombre coincidente en tu soundboard.`);
                    }
                }
                
                if (typeof parsed.targetStart === 'number') setSpliceTargetStart(Math.max(0, Math.min(parsed.targetStart, audioDuration)));
                if (typeof parsed.targetEnd === 'number') setSpliceTargetEnd(Math.max(0, Math.min(parsed.targetEnd, audioDuration)));
                if (typeof parsed.crossfade === 'number') setSpliceCrossfade(Math.max(0, Math.min(parsed.crossfade, 0.5)));
                if (typeof parsed.sourceVolume === 'number') setSpliceSourceVolume(Math.max(0.1, Math.min(parsed.sourceVolume, 3.5)));
                
                if (parsed.explanation) {
                    setSplicePlanExplanation(parsed.explanation);
                } else {
                    setSplicePlanExplanation("He interpretado tu orden y configurado los controles deslizantes de abajo. Puedes revisarlos y pulsar 'Procesar y Aplicar Empalme' si estás conforme.");
                }
                
                setSpliceSuccessMessage("¡La IA interpretó tu orden correctamente! Revisa el plan de acción previsto detallado a continuación.");
            } else {
                throw new Error("No se recibió respuesta prestigiosa.");
            }
        } catch (err) {
            console.error("Splice AI Error:", err);
            setSpliceErrorMessage(`Error al interpretar con IA: ${err instanceof Error ? err.message : String(err)}. Puedes configurar los campos manualmente.`);
        } finally {
            setIsAnalyzingAi(false);
        }
    };

    const handleApplySplice = async () => {
        setSpliceErrorMessage('');
        setSpliceSuccessMessage('');

        if (!(buffer instanceof AudioBuffer)) {
            setSpliceErrorMessage("El audio objetivo original no está cargado.");
            return;
        }

        const sourceSound = otherSounds.find(s => s.id === spliceSourceSoundId);
        if (!sourceSound) {
            setSpliceErrorMessage("Por favor, selecciona una de las pistas origen de la lista.");
            return;
        }

        const sourceBuf = audioSources[sourceSound.audioSourceId];
        if (!(sourceBuf instanceof AudioBuffer)) {
            setSpliceErrorMessage("La pista de origen seleccionada no tiene el buffer cargado.");
            return;
        }

        setIsRendering(true);
        try {
            // Detener previsualización por seguridad
            stopAndClearPreview();
            stopDraftPlayback();
            setPreviewStatus('stopped');

            // Ejecutar el empalme DSP de potencia constante
            const splicedBuffer = spliceAudioBuffers(
                buffer,
                spliceTargetStart,
                spliceTargetEnd,
                sourceBuf,
                spliceSourceStart,
                spliceSourceEnd,
                spliceCrossfade,
                spliceSourceVolume
            );

            // Guardar en la base de datos de audio DB y despachar al contexto
            const wavBlob = bufferToWaveBlob(splicedBuffer);
            const arrayBuffer = await wavBlob.arrayBuffer();
            const newSourceId = await calculateHash(arrayBuffer);
            
            await audioDB.set(newSourceId, wavBlob);
            
            // Registrar el nuevo buffer en memoria en el contexto global
            dispatch({ type: 'SET_AUDIO_SOURCE', payload: { sourceId: newSourceId, buffer: splicedBuffer } });

            // Actualizar localSound para apuntar al nuevo buffer y reajustar los límites
            const updatedSound = {
                ...localSound,
                audioSourceId: newSourceId,
                startTime: 0,
                endTime: splicedBuffer.duration
            };

            setLocalSound(updatedSound);
            setPreviewTime(0);

            setSpliceSuccessMessage("¡Empalme de audio generado con éxito! El nuevo audio resultante combinando ambas porciones se ha cargado en el editor. Reprodúcelo para verificar que suena impecable y haz clic en 'Guardar Cambios' para guardarlo.");
        } catch (e) {
            console.error("Splice processing error:", e);
            setSpliceErrorMessage(`Error al procesar el empalme: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsRendering(false);
        }
    };

    const handleUpdate = (updates: Partial<Sound>) => {
        const structuralChanges: (keyof Sound)[] = ['startTime', 'endTime', 'crossfade', 'fadeIn', 'fadeOut', 'fadeInType', 'fadeOutType'];
        const hasStructuralChange = Object.keys(updates).some(key => structuralChanges.includes(key as keyof Sound));

        if (hasStructuralChange && previewStatus !== 'stopped') {
            handleStop();
        }

        const newSound = { ...localSound, ...updates };
        
        if (previewStatus === 'stopped' && updates.startTime !== undefined) {
            setPreviewTime(updates.startTime);
        }

        setLocalSound(newSound);
    };

    useEffect(() => {
        if (previewStatus !== 'playing') return;
        const animate = () => {
            if (previewStatus !== 'playing') return;
            const context = getAudioContext();
            const elapsed = (context.currentTime - previewStartTimestamp.current) * (soundRef.current.pitch ?? DEFAULT_PITCH);
            const newTime = previewStartOffset.current + elapsed;
            const endTime = soundRef.current.endTime ?? audioDuration;
            
            if (newTime >= endTime) {
                // onended will handle stopping
            } else {
                setPreviewTime(newTime);
                previewAnimFrame.current = requestAnimationFrame(animate);
            }
        };
        previewAnimFrame.current = requestAnimationFrame(animate);
        return () => {
            if (previewAnimFrame.current) cancelAnimationFrame(previewAnimFrame.current);
        };
    }, [previewStatus, audioDuration]);


    const playPreview = useCallback(async (playFrom: number) => {
        if (!(buffer instanceof AudioBuffer)) return;
        const context = getAudioContext();
        context.resume();
        stopAndClearPreview();

        const s = soundRef.current;
        const soundStartTime = s.startTime ?? 0;
        const soundEndTime = s.endTime ?? audioDuration;
        const effectivePlayFrom = Math.max(soundStartTime, Math.min(playFrom, soundEndTime));
        const durationToPlay = soundEndTime - effectivePlayFrom;
        const pitch = s.pitch ?? DEFAULT_PITCH;

        if (durationToPlay <= 0.001) {
            setPreviewStatus('stopped');
            setPreviewTime(soundStartTime);
            return;
        }

        const source = context.createBufferSource();
        const gainNode = context.createGain();
        const pannerNode = context.createStereoPanner();
        const { preampNode, eqNodes, lastNode: lastEqNode } = createEqChain(context, s);
        updateEqChain({ preampNode, eqNodes }, s, context);
        const delayNode = context.createDelay(5.0);
        const delayFeedbackNode = context.createGain();
        const dryGainNode = context.createGain();
        const masterGain = getMasterGainNode();

        source.buffer = buffer;
        source.playbackRate.value = pitch;
        pannerNode.pan.value = s.pan ?? DEFAULT_PAN;
        delayNode.delayTime.value = s.delayTime ?? 0;
        delayFeedbackNode.gain.value = s.delayFeedback ?? 0;
        
        let convolverNode: ConvolverNode | null = null;
        let wetGainNode: GainNode | null = null;
        const reverbAmount = s.reverb ?? 0;
        
        if (reverbAmount > 0 && impulseBuffer) {
            convolverNode = context.createConvolver();
            convolverNode.buffer = impulseBuffer;
            wetGainNode = context.createGain();
            wetGainNode.gain.value = reverbAmount;
            dryGainNode.gain.value = 1 - reverbAmount;
        } else {
            dryGainNode.gain.value = 1.0;
        }

        source.connect(gainNode);
        gainNode.connect(pannerNode);
        pannerNode.connect(preampNode);
        lastEqNode.connect(delayNode);
        delayNode.connect(delayFeedbackNode).connect(delayNode);
        delayNode.connect(dryGainNode);
        if (wetGainNode && convolverNode) {
            delayNode.connect(wetGainNode).connect(convolverNode);
        }
        dryGainNode.connect(masterGain);
        if (convolverNode) {
            convolverNode.connect(masterGain);
        }

        // --- FADE SCHEDULING ---
        const now = context.currentTime;
        const gain = gainNode.gain;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(0, now);

        // Fade In
        const pitchedFadeInDuration = Math.min((s.fadeIn ?? 0.1) / pitch, durationToPlay / pitch);
        if (pitchedFadeInDuration > 0.001) {
            gain.linearRampToValueAtTime(s.volume, now + pitchedFadeInDuration);
        } else {
            gain.setValueAtTime(s.volume, now);
        }

        // Fade Out
        const pitchedDurationToPlay = durationToPlay / pitch;
        const pitchedFadeOutDuration = Math.min((s.fadeOut ?? 0.1) / pitch, pitchedDurationToPlay);
        if (pitchedFadeOutDuration > 0.001) {
            const fadeOutStartTime = now + pitchedDurationToPlay - pitchedFadeOutDuration;
            if (fadeOutStartTime > now + pitchedFadeInDuration) {
                 gain.setValueAtTime(s.volume, fadeOutStartTime);
            }
            if (s.fadeOutType === 'exponential') {
                gain.exponentialRampToValueAtTime(0.0001, fadeOutStartTime + pitchedFadeOutDuration);
            } else {
                gain.linearRampToValueAtTime(0, fadeOutStartTime + pitchedFadeOutDuration);
            }
        }
        
        previewSourceNodeRef.current = source;
        previewGainNodeRef.current = gainNode;
        previewPannerNodeRef.current = pannerNode;
        previewPreampNodeRef.current = preampNode;
        previewEqNodesRef.current = eqNodes;
        previewDelayNodeRef.current = delayNode;
        previewDelayFeedbackRef.current = delayFeedbackNode;
        previewConvolverNodeRef.current = convolverNode;
        previewDryGainRef.current = dryGainNode;
        previewWetGainRef.current = wetGainNode;

        source.start(now, effectivePlayFrom, pitchedDurationToPlay);

        setPreviewStatus('playing');
        previewStartTimestamp.current = context.currentTime;
        previewStartOffset.current = effectivePlayFrom;
        setPreviewTime(effectivePlayFrom);

        source.onended = () => {
            if (previewSourceNodeRef.current === source && previewStatus === 'playing') {
                handleStop();
            }
        };
    }, [buffer, audioDuration, stopAndClearPreview, handleStop, impulseBuffer]);


    const handlePlayPause = () => {
        if (previewStatus === 'playing') {
            const context = getAudioContext();
            const elapsed = (context.currentTime - previewStartTimestamp.current) * (localSound.pitch ?? DEFAULT_PITCH);
            const newTime = previewStartOffset.current + elapsed;
            stopAndClearPreview();
            setPreviewTime(newTime);
            setPreviewStatus('paused');
        } else {
            playPreview(previewTime);
        }
    };
    
    const handleSeek = (newTime: number) => {
        if (previewStatus !== 'stopped') {
            stopAndClearPreview();
            setPreviewStatus('stopped');
        }
        setPreviewTime(newTime);
    };

    const handleSeekButton = (direction: 'start' | 'end') => {
        stopAndClearPreview();
        setPreviewStatus('stopped');
        if (direction === 'start') {
            setPreviewTime(localSound.startTime ?? 0);
        } else {
            setPreviewTime(localSound.endTime ?? audioDuration);
        }
    };

    const handleSeekScrub = useCallback((direction: 'rew' | 'ff') => {
        const speed = 2.0; // seconds per second
        let lastTime = performance.now();
        const scrub = (now: number) => {
            const delta = (now - lastTime) / 1000;
            lastTime = now;
            setPreviewTime(prev => {
                const newTime = prev + (direction === 'ff' ? delta*speed : -delta*speed);
                return Math.max(soundRef.current.startTime ?? 0, Math.min(soundRef.current.endTime ?? audioDuration, newTime));
            });
            ffRewIntervalRef.current = requestAnimationFrame(scrub);
        };
        ffRewIntervalRef.current = requestAnimationFrame(scrub);
    }, [audioDuration]);
    
    const handleMouseUpScrub = () => {
        if (ffRewIntervalRef.current) {
            cancelAnimationFrame(ffRewIntervalRef.current);
            ffRewIntervalRef.current = null;
        }
    };


    const getBufferStatus = () => {
        if (!buffer) return 'initial';
        if (buffer === 'loading') return 'loading';
        if (buffer === 'error') return 'error';
        if (buffer instanceof AudioBuffer) return 'loaded';
        return 'initial';
    };
    const bufferStatus = getBufferStatus();

    const handleSave = () => {
        stopAndClearPreview();
        // We send the whole localSound to update, but the reducer will sanitize it.
        dispatch({ type: 'UPDATE_SOUND', payload: { soundId: sound.id, updates: localSound } });
        onClose();
    };
    
    const openDuplicateChoiceModal = () => {
        if (!copyTargetBoard) return;
        stopAndClearPreview();
        setDuplicateChoiceModalOpen(true);
    };

    const handleDuplicateChoice = async (choice: 'virtual' | 'rendered') => {
        setDuplicateChoiceModalOpen(false);
        const isDuplicatingOnSameBoard = copyTargetBoard === activeBoardId;

        if (choice === 'virtual') {
            const newSound: Sound = {
                ...localSound,
                id: `sound_${Date.now()}`,
                name: isDuplicatingOnSameBoard ? `${localSound.name} (Copia)` : localSound.name,
                stopActions: [], // Reset automation on duplicate
                playCount: 0, // Reset play count
            };
            dispatch({ type: 'ADD_SOUND', payload: { boardId: copyTargetBoard, sound: newSound }});
            onClose();
        } else { // 'rendered'
            if (!(buffer instanceof AudioBuffer)) {
                alert("El audio original no está cargado. No se puede renderizar.");
                return;
            }
            setIsRendering(true);
            try {
                const renderedBuffer = await renderAudioWithEffects(localSound, buffer);
                const blob = bufferToWaveBlob(renderedBuffer);
                const newAudioSourceId = await calculateHash(await blob.arrayBuffer());
                
                await audioDB.set(newAudioSourceId, blob);

                const newSound: Sound = {
                    ...localSound, // copy color etc.
                    id: `sound_${Date.now()}`,
                    audioSourceId: newAudioSourceId,
                    name: `${localSound.name} (Renderizado)`,
                    volume: DEFAULT_VOLUME,
                    pitch: DEFAULT_PITCH,
                    pan: DEFAULT_PAN,
                    loop: false,
                    retriggerable: false,
                    crossfade: DEFAULT_CROSSFADE,
                    fadeIn: 0.01,
                    fadeOut: 0.01,
                    startTime: 0,
                    endTime: renderedBuffer.duration,
                    reverb: 0,
                    delayTime: 0,
                    delayFeedback: 0,
                    eqEnabled: false,
                    eqPreamp: PREAMP_DEFAULT,
                    eqBands: [...EQ_BAND_DEFAULTS],
                    stopActions: [],
                    playCount: 0,
                };
                dispatch({ type: 'ADD_SOUND', payload: { boardId: copyTargetBoard, sound: newSound }});
                onClose();

            } catch(e) {
                console.error("Fallo al renderizar el audio:", e);
                alert(`Error al renderizar el audio: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
                setIsRendering(false);
            }
        }
    };
    
    const selectionDuration = (localSound.endTime ?? audioDuration) - (localSound.startTime ?? 0);
    
    // FIX: Replaced `handleUpdate({ image: ... })` with a proper implementation that processes the file,
    // stores it in the database, and updates the sound's `imageId`.
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsGeneratingImage(true); // Re-use loading state
            setImageError('');
            try {
                const blob = file;
                const arrayBuffer = await blob.arrayBuffer();
                const newImageId = await calculateHash(arrayBuffer);
                await audioDB.set(newImageId, blob);

                const url = URL.createObjectURL(blob);
                dispatch({ type: 'SET_IMAGE_SOURCE', payload: { imageId: newImageId, url } });

                handleUpdate({ imageId: newImageId });
            } catch (err) {
                console.error("Error handling image upload:", err);
                setImageError("Fallo al subir la imagen.");
            } finally {
                setIsGeneratingImage(false);
            }
        }
    };
    
    // FIX: Replaced `handleUpdate({ image: ... })` with a proper implementation that processes the generated
    // image data, stores it, and updates the sound's `imageId`.
    const handleGenerateImage = async () => {
        if (!imageGenPrompt.trim()) {
            setImageError("El prompt no puede estar vacío.");
            return;
        }
        setIsGeneratingImage(true);
        setImageError('');
        try {
            const response = await fetch('/api/generate-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts: [{ text: imageGenPrompt }] },
                    config: { responseModalities: ["IMAGE" as any] },
                })
            });
            if (!response.ok) throw new Error('AI API Error');
            const data = await response.json();
            
            if (data.inlineData && data.inlineData.data) {
                const base64ImageBytes: string = data.inlineData.data;
                const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
                
                const blob = dataUrlToBlob(imageUrl);
                const arrayBuffer = await blob.arrayBuffer();
                const newImageId = await calculateHash(arrayBuffer);
                await audioDB.set(newImageId, blob);
                
                const url = URL.createObjectURL(blob);
                dispatch({ type: 'SET_IMAGE_SOURCE', payload: { imageId: newImageId, url } });

                handleUpdate({ imageId: newImageId });
            } else {
                throw new Error("La API no devolvió una imagen válida.");
            }
        } catch (err) {
            console.error("Error al generar la imagen:", err);
            setImageError("No se pudo generar la imagen. Inténtalo de nuevo.");
        } finally {
            setIsGeneratingImage(false);
        }
    };
    
    const updateAutomation = (targetId: string, action: 'stop' | 'pause' | 'play' | 'ignore') => {
        let currentActions = localSound.stopActions || [];
        // Remove existing action for this target
        currentActions = currentActions.filter(a => a.soundId !== targetId);
        
        if (action !== 'ignore') {
            currentActions.push({ soundId: targetId, type: action });
        }
        
        handleUpdate({ stopActions: currentActions });
    };
    
    const getAutomationAction = (targetId: string): 'stop' | 'pause' | 'play' | 'ignore' => {
        const action = localSound.stopActions?.find(a => a.soundId === targetId);
        return action ? action.type : 'ignore';
    };

    const currentBoard = soundboards.find(b => b.sounds.some(s => s.id === sound.id)) || soundboards.find(b => b.id === activeBoardId);
    const potentialStopTargets = currentBoard ? currentBoard.sounds.filter(s => s.id !== sound.id) : [];

    const renderTabContent = () => {
        switch (activeTab) {
            case 'waveform':
                return (
                    <div className="animate-fade-in space-y-4">
                        {bufferStatus === 'loaded' ? (
                            <WaveformEditor 
                                sound={localSound} 
                                buffer={buffer as AudioBuffer} 
                                onUpdate={handleUpdate} 
                                status={previewStatus} 
                                playbackTime={previewTime}
                                onSeek={handleSeek}
                             />
                        ) : (
                            <div className="text-center text-gray-400 p-8 bg-gray-800 rounded-md h-40 flex items-center justify-center border border-gray-700 font-sans">
                                {bufferStatus === 'loading' && 'Cargando forma de onda...'}
                                {bufferStatus === 'error' && <span className="text-red-400">Error: No se pudo cargar el audio.</span>}
                                {bufferStatus === 'initial' && 'Iniciando carga...'}
                            </div>
                        )}
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-800/60 p-4 rounded-md border border-gray-700/60">
                             <ScrubbableInput 
                                 label="Posición Inicial" 
                                 value={localSound.startTime ?? 0} 
                                 onChange={v => handleUpdate({ startTime: v, endTime: Math.max(v, localSound.endTime ?? audioDuration) })} 
                                 min={0} max={audioDuration} 
                                 step={0.01} unit="s" fixedDecimals={3}
                                 onExtraAction={() => handleUpdate({startTime: previewTime})}
                                 extraActionIcon={<SetMarkerIcon className="w-4 h-4" />}
                                 extraActionTitle="Fijar Inicio en el Cursor"
                                 extraActionDisabled={previewStatus === 'playing'}
                              />
                              <ScrubbableInput 
                                 label="Posición Final" 
                                 value={localSound.endTime ?? audioDuration} 
                                 onChange={v => handleUpdate({ endTime: v, startTime: Math.min(v, localSound.startTime ?? 0) })} 
                                 min={0} max={audioDuration} 
                                 step={0.01} unit="s" fixedDecimals={3} 
                                 onExtraAction={() => handleUpdate({endTime: previewTime})}
                                 extraActionIcon={<SetMarkerIcon className="w-4 h-4" />}
                                 extraActionTitle="Fijar Fin en el Cursor"
                                 extraActionDisabled={previewStatus === 'playing'}
                              />
                        </div>

                         <div className="flex flex-col sm:flex-row items-center gap-4 bg-gray-800/60 p-3 rounded-md border border-gray-700/60">
                            <div className="flex items-center justify-center gap-1">
                                <button onClick={() => handleSeekButton('start')} disabled={bufferStatus !== 'loaded'} className="p-2 rounded-md hover:bg-gray-700 disabled:opacity-50 text-gray-300" title="Ir al inicio"><GoToStartIcon /></button>
                                <button onMouseDown={() => handleSeekScrub('rew')} onMouseUp={handleMouseUpScrub} onMouseLeave={handleMouseUpScrub} disabled={bufferStatus !== 'loaded'} className="p-2 rounded-md hover:bg-gray-700 disabled:opacity-50 text-gray-300" title="Retroceder"><RewindIcon /></button>
                                <button onClick={handlePlayPause} disabled={bufferStatus !== 'loaded'} className="p-3 mx-2 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-md shadow-indigo-600/20" title={previewStatus === 'playing' ? 'Pausar' : 'Reproducir'}>
                                    {previewStatus === 'playing' ? <PauseIcon className="w-7 h-7"/> : <PlayIcon className="w-7 h-7"/>}
                                </button>
                                <button onClick={handleStop} disabled={previewStatus === 'stopped'} className="p-3 mx-2 rounded-full bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-colors shadow-md shadow-red-600/20" title="Detener"><StopIcon className="w-7 h-7"/></button>
                                <button onMouseDown={() => handleSeekScrub('ff')} onMouseUp={handleMouseUpScrub} onMouseLeave={handleMouseUpScrub} disabled={bufferStatus !== 'loaded'} className="p-2 rounded-md hover:bg-gray-700 disabled:opacity-50 text-gray-300" title="Avanzar"><FastForwardIcon /></button>
                                <button onClick={() => handleSeekButton('end')} disabled={bufferStatus !== 'loaded'} className="p-2 rounded-md hover:bg-gray-700 disabled:opacity-50 text-gray-300" title="Ir al final"><GoToEndIcon /></button>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-center p-2 bg-gray-900/60 rounded-md w-full border border-gray-700/50">
                                <div>
                                    <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Duración</div>
                                    <div className="font-mono text-white text-sm font-bold">{selectionDuration > 0 ? selectionDuration.toFixed(3) : '0.000'}s</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-yellow-400 font-semibold uppercase tracking-wider">Cursor</div>
                                    <div className="font-mono text-yellow-300 text-sm font-bold">{previewTime.toFixed(3)}s</div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'properties':
                return (
                    <div className="animate-fade-in grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                        <div className="space-y-4 bg-gray-800/40 p-4 rounded-md border border-gray-700/60">
                            <h3 className="text-sm font-extrabold text-indigo-400 uppercase tracking-wider border-b border-gray-700 pb-1.5 flex items-center gap-1.5">
                                <span>🎚️</span> Controles Físicos Principales
                            </h3>
                            <ScrubbableInput label="Volumen" value={localSound.volume ?? DEFAULT_VOLUME} onChange={v => handleUpdate({ volume: v })} min={0} max={1} step={0.01} displayMultiplier={100} unit="%" fixedDecimals={0} />
                            <ScrubbableInput label="Tono (Pitch)" value={localSound.pitch ?? DEFAULT_PITCH} onChange={p => handleUpdate({ pitch: p })} min={0.5} max={2} step={0.01} unit="x" fixedDecimals={2} />
                            <ScrubbableInput label="Balance (Pan)" value={localSound.pan ?? DEFAULT_PAN} onChange={p => handleUpdate({ pan: p })} min={-1} max={1} step={0.01} unit="" fixedDecimals={2} />
                            
                            <div className="pt-2 space-y-3">
                                <div className="flex items-center">
                                   <input type="checkbox" id="loop" checked={localSound.loop} onChange={e => handleUpdate({ loop: e.target.checked })} className="h-4 w-4 text-indigo-500 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500 focus:ring-offset-gray-900" />
                                   <label htmlFor="loop" className="ml-3 text-sm font-medium text-gray-300 select-none">Activar reproducción en bucle</label>
                                </div>
                               {localSound.loop && (
                                   <div className="animate-fade-in pl-7">
                                     <ScrubbableInput label="Crossfade de Bucle" value={localSound.crossfade ?? DEFAULT_CROSSFADE} onChange={c => handleUpdate({ crossfade: c })} min={0} max={Math.min(5, selectionDuration/2)} step={0.01} unit="s" fixedDecimals={2} />
                                   </div>
                               )}
                                <div className="flex items-center">
                                   <input type="checkbox" id="retriggerable" checked={localSound.retriggerable} onChange={e => handleUpdate({ retriggerable: e.target.checked })} className="h-4 w-4 text-indigo-500 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500 focus:ring-offset-gray-900" />
                                   <label htmlFor="retriggerable" className="ml-3 text-sm font-medium text-gray-300 select-none">Permitir redisparo (polifónico)</label>
                                </div>
                                <div className="flex items-center">
                                   <input type="checkbox" id="hidden" checked={localSound.hidden || false} onChange={e => handleUpdate({ hidden: e.target.checked })} className="h-4 w-4 text-indigo-500 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500 focus:ring-offset-gray-900" />
                                   <label htmlFor="hidden" className="ml-3 text-sm font-medium text-gray-300 select-none">Archivado / Oculto (ocultar de la rejilla principal)</label>
                                </div>
                                <div className="space-y-1 pt-1">
                                    <label htmlFor="instructions" className="block text-xs font-bold text-gray-400 uppercase tracking-wide">Instrucciones para el Operador (Guía en Vivo)</label>
                                    <textarea
                                        id="instructions"
                                        value={localSound.instructions || ''}
                                        onChange={e => handleUpdate({ instructions: e.target.value })}
                                        placeholder='Escribe indicaciones sobre el qué, cómo y cuándo activar/desactivar este sonido (ej: "Disparar cuando el actor apague la linterna y hacer fade-out de 3s").'
                                        className="w-full bg-gray-900 text-xs text-white p-2 rounded border border-gray-750 focus:ring-1 focus:ring-indigo-500 font-sans h-20 resize-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 bg-gray-800/40 p-4 rounded-md border border-gray-700/60">
                            <h3 className="text-sm font-extrabold text-indigo-400 uppercase tracking-wider border-b border-gray-700 pb-1.5 flex items-center gap-1.5">
                                <span>📈</span> Envolvente de Fades
                            </h3>
                            <ScrubbableInput 
                                label="Fade In (Entrada)" 
                                value={localSound.fadeIn ?? 0.1} 
                                onChange={f => handleUpdate({ fadeIn: f })} 
                                min={0} 
                                max={Math.min(10, selectionDuration)} 
                                step={0.01} 
                                unit="s" 
                                fixedDecimals={2} 
                                onExtraAction={() => {
                                    const newFadeIn = previewTime - (localSound.startTime ?? 0);
                                    handleUpdate({ fadeIn: Math.max(0, Math.min(newFadeIn, selectionDuration)) });
                                }}
                                extraActionIcon={<SetMarkerIcon className="w-4 h-4" />}
                                extraActionTitle="Fijar final de Fade In en el Cursor"
                                extraActionDisabled={previewStatus === 'playing' || previewTime <= (localSound.startTime ?? 0)}
                            />
                            <div className="flex gap-4 items-center bg-gray-900/40 px-3 py-2 rounded border border-gray-800">
                                <span className="text-xs text-gray-400 font-semibold font-sans">Curva Fade In:</span>
                                <label className="inline-flex items-center text-xs text-gray-300 cursor-pointer select-none">
                                    <input type="radio" name="fadeInType" checked={localSound.fadeInType !== 'exponential'} onChange={() => handleUpdate({ fadeInType: 'linear' })} className="mr-1.5 h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 bg-gray-800 border-gray-700" /> Lineal
                                </label>
                                <label className="inline-flex items-center text-xs text-gray-300 cursor-pointer select-none">
                                    <input type="radio" name="fadeInType" checked={localSound.fadeInType === 'exponential'} onChange={() => handleUpdate({ fadeInType: 'exponential' })} className="mr-1.5 h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 bg-gray-800 border-gray-700" /> Exponencial
                                </label>
                            </div>
                            <hr className="border-gray-700" />
                            <ScrubbableInput 
                                label="Fade Out (Salida)" 
                                value={localSound.fadeOut ?? 0.1} 
                                onChange={f => handleUpdate({ fadeOut: f })} 
                                min={0} 
                                max={Math.min(10, selectionDuration)} 
                                step={0.01} 
                                unit="s" 
                                fixedDecimals={2} 
                                onExtraAction={() => {
                                    const soundEndTime = localSound.endTime ?? audioDuration;
                                    const newFadeOut = soundEndTime - previewTime;
                                    handleUpdate({ fadeOut: Math.max(0, Math.min(newFadeOut, selectionDuration)) });
                                }}
                                extraActionIcon={<SetMarkerIcon className="w-4 h-4" />}
                                extraActionTitle="Fijar inicio de Fade Out en el Cursor"
                                extraActionDisabled={previewStatus === 'playing' || previewTime >= (localSound.endTime ?? audioDuration)}
                            />
                            <div className="flex gap-4 items-center bg-gray-900/40 px-3 py-2 rounded border border-gray-800">
                                <span className="text-xs text-gray-400 font-semibold font-sans">Curva Fade Out:</span>
                                <label className="inline-flex items-center text-xs text-gray-300 cursor-pointer select-none">
                                    <input type="radio" name="fadeOutType" checked={localSound.fadeOutType !== 'exponential'} onChange={() => handleUpdate({ fadeOutType: 'linear' })} className="mr-1.5 h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 bg-gray-800 border-gray-700" /> Lineal
                                </label>
                                <label className="inline-flex items-center text-xs text-gray-300 cursor-pointer select-none">
                                    <input type="radio" name="fadeOutType" checked={localSound.fadeOutType === 'exponential'} onChange={() => handleUpdate({ fadeOutType: 'exponential' })} className="mr-1.5 h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 bg-gray-800 border-gray-700" /> Exponencial
                                </label>
                            </div>
                        </div>
                    </div>
                );
            case 'effects':
                return (
                    <div className="animate-fade-in grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 text-left">
                        <div className="space-y-4 bg-gray-800/40 p-4 rounded-md border border-gray-700/60">
                            <h3 className="text-sm font-extrabold text-indigo-400 uppercase tracking-wider border-b border-gray-700 pb-1.5 flex items-center gap-1.5">
                                <span>🎛️</span> Efectos Espaciales
                            </h3>
                            <div className="flex items-center gap-2">
                                <div className="flex-grow">
                                    <ScrubbableInput label="Reverberación" value={localSound.reverb ?? 0} onChange={v => handleUpdate({ reverb: v })} min={0} max={1} step={0.01} displayMultiplier={100} unit="%" fixedDecimals={0} />
                                </div>
                                <button onClick={() => handleUpdate({ reverb: 0 })} title="Restablecer Reverberación" className="p-2 text-gray-400 rounded-full hover:bg-gray-800 hover:text-white transition-colors"><ResetIcon /></button>
                            </div>
                             <div className="flex items-center gap-2">
                                <div className="flex-grow">
                                    <ScrubbableInput label="Tiempo de Eco" value={localSound.delayTime ?? 0} onChange={v => handleUpdate({ delayTime: v })} min={0} max={5} step={0.01} unit="s" fixedDecimals={2} />
                                </div>
                                 <button onClick={() => handleUpdate({ delayTime: 0 })} title="Restablecer Tiempo de Eco" className="p-2 text-gray-400 rounded-full hover:bg-gray-800 hover:text-white transition-colors"><ResetIcon /></button>
                            </div>
                             <div className="flex items-center gap-2">
                                <div className="flex-grow">
                                    <ScrubbableInput label="Feedback de Eco" value={localSound.delayFeedback ?? 0} onChange={v => handleUpdate({ delayFeedback: v })} min={0} max={0.9} step={0.01} displayMultiplier={100} unit="%" fixedDecimals={0} />
                                </div>
                                <button onClick={() => handleUpdate({ delayFeedback: 0 })} title="Restablecer Feedback de Eco" className="p-2 text-gray-400 rounded-full hover:bg-gray-800 hover:text-white transition-colors"><ResetIcon /></button>
                            </div>
                        </div>
                        <div className="bg-gray-800/40 p-4 rounded-md border border-gray-700/60">
                            <EqualizerControls settings={localSound} onUpdate={handleUpdate} />
                        </div>
                    </div>
                );
            case 'empalmar':
                return (
                    <div className="animate-fade-in space-y-4 text-xs font-sans text-gray-300">
                        <div className="p-4 bg-gray-800/40 rounded-md border border-gray-700/60">
                            <h3 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                                <span>✂️ Editor de Empalme Inteligente</span>
                            </h3>
                            <p className="text-sm text-gray-400 mb-4 font-sans leading-relaxed">
                                Reemplaza una porción de este sonido (<strong>"{localSound.name}"</strong>) utilizando un fragmento de otra pista de tu soundboard de manera imperceptible y totalmente natural.
                            </p>

                            {/* AUDIO PREVIEW AND COMPARATIVE LISTENING ENGINE */}
                            <div className="p-4 bg-gray-950/60 border border-gray-800 rounded-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-5 shadow-inner">
                                <div className="flex-1 text-left space-y-1">
                                    <span className="text-xs uppercase font-extrabold text-indigo-400 font-mono tracking-widest">🎛️ Consola de Comparación y Escucha</span>
                                    <p className="text-[11px] text-gray-400 font-sans">
                                        Alterna entre la versión original y la simulación del empalme generado con tus cambios de volumen y tiempos en tiempo real.
                                    </p>
                                    {draftSplicedBuffer && (
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 border border-green-500/20 rounded-full text-[10px] text-green-400 font-mono">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                            </span>
                                            Avance Listo ({draftSplicedBuffer.duration.toFixed(2)}s)
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2 items-center justify-start md:justify-end min-w-max">
                                    <button
                                        type="button"
                                        onClick={() => (draftPlaying || originalPlaying) ? stopDraftPlayback() : (draftSplicedBuffer && playDraftOrOriginal(draftSplicedBuffer, 'draft'))}
                                        disabled={!draftSplicedBuffer}
                                        className={`px-4 py-2.5 rounded-md font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                                            draftPlaying
                                                ? 'bg-green-600 hover:bg-green-500 text-white animate-pulse shadow-[0_0_12px_rgba(34,197,94,0.3)] border border-transparent'
                                                : 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white border border-transparent'
                                        }`}
                                    >
                                        {draftPlaying ? '⏸️ Pausar Avance' : '🔊 Oír Avance Empalme'}
                                    </button>
                                    
                                    <button
                                        type="button"
                                        onClick={() => (draftPlaying || originalPlaying) ? stopDraftPlayback() : playDraftOrOriginal(buffer, 'original')}
                                        disabled={!(buffer instanceof AudioBuffer)}
                                        className={`px-3 py-2.5 rounded-md font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                                            originalPlaying
                                                ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse shadow-[0_0_12px_rgba(245,158,11,0.3)] border border-transparent'
                                                : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                                        }`}
                                    >
                                        {originalPlaying ? '⏸️ Pausar Original' : '➡️ Oír Audio Original'}
                                    </button>
                                </div>
                            </div>

                            {/* AI command generator section with onboarding card and quick prompts */}
                            <div className="bg-gray-950/45 p-4 rounded-lg border border-indigo-900/50 mb-5 text-left">
                                <div className="flex items-start gap-2.5 mb-3 bg-indigo-950/20 p-2.5 rounded border border-indigo-950/60">
                                    <span className="text-base">💡</span>
                                    <div className="space-y-1">
                                        <h4 className="text-xs font-bold text-indigo-300 font-sans uppercase tracking-wider">¿Qué hace esta herramienta?</h4>
                                        <p className="text-[11px] text-gray-400 font-sans leading-relaxed">
                                            Combina dos sonidos sin esfuerzo usando IA. Puedes "parchear" ruidos, insertar efectos o empalmar partes de otros audios de tu soundboard. La IA analizará tu frase, identificará el sonido de origen en tus tarjetas y auto-configurará los deslizadores de recorte y volumen abajo para que solo tengas que hacer clic en "Procesar".
                                        </p>
                                    </div>
                                </div>

                                <label className="block text-xs font-bold text-indigo-300 mb-1.5 uppercase tracking-wide">
                                    🔮 Petición en Lenguaje Natural
                                </label>
                                <div className="flex gap-2">
                                    <textarea
                                        value={spliceAiPrompt}
                                        onChange={(e) => setSpliceAiPrompt(e.target.value)}
                                        placeholder={`Escribe qué quieres hacer... Ej: "Pon la risa de Tarjeta 2 al inicio"`}
                                        className="flex-grow bg-gray-900 text-xs text-white p-2.5 rounded border border-gray-750 focus:ring-1 focus:ring-indigo-500 font-sans resize-none h-14"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAnalyzeSpliceAi}
                                        disabled={isAnalyzingAi}
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-md text-xs disabled:opacity-50 disabled:cursor-wait flex items-center justify-center w-24 whitespace-nowrap cursor-pointer transition-all shadow-md shadow-indigo-600/10"
                                    >
                                        {isAnalyzingAi ? <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span> : 'Interpretar'}
                                    </button>
                                </div>

                                {/* Clickable quick-start chips */}
                                <div className="mt-3.5">
                                    <span className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Sugerencias rápidas (Haz clic para probar):</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {[
                                            { label: "📥 Insertar audio al inicio", text: "Inserta los primeros 2 segundos de la otra pista al principio de este audio" },
                                            { label: "✂️ Reemplazar tramo medio", text: "Reemplaza del segundo 1.0 al 3.0 de esta pista con los segundos 0.0 al 2.0 de la otra pista con suavizado de 0.15" },
                                            { label: "🔊 Insertar y subir volumen", text: "Inserta la otra pista en el segundo 2.0 y ponle el doble de volumen" },
                                            { label: "🧹 Parchear final", text: "Reemplaza los últimos 3 segundos de este audio con los segundos 1.5 a 4.5 de la otra tarjeta" }
                                        ].map((chip, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => {
                                                    // Find if there is any other sound to name in the prompt template
                                                    const otherName = otherSounds[0]?.name || "Tarjeta 2";
                                                    const cleanText = chip.text.replace("la otra pista", `"${otherName}"`).replace("la otra tarjeta", `"${otherName}"`);
                                                    setSpliceAiPrompt(cleanText);
                                                }}
                                                className="text-[10px] bg-gray-900/60 hover:bg-gray-800 text-gray-400 hover:text-indigo-300 px-2 py-1 rounded border border-gray-800 hover:border-indigo-950 transition-all cursor-pointer font-sans"
                                            >
                                                {chip.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Proposed action plan explanation box */}
                            {splicePlanExplanation && (
                                <div className="p-3.5 bg-amber-950/45 text-amber-200 border border-amber-800/60 rounded text-xs text-left font-sans mb-5 space-y-2 leading-relaxed">
                                    <div className="font-bold flex items-center gap-1.5 text-amber-300">
                                        <span>📋 Plan de Acción Propuesto por la IA:</span>
                                    </div>
                                    <p>{splicePlanExplanation}</p>
                                    <p className="text-gray-400 pt-1 text-[11px]">
                                        * Los controles de tiempo y controles deslizantes de abajo han sido ajustados de forma automática según la propuesta. Si la instrucción no fue exacta, puedes corregir tu petición o modificar directamente los valores manuales a continuación.
                                    </p>
                                </div>
                            )}

                            {/* Manual controls */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
                                {/* Pista de Origen (Source) */}
                                <div className="space-y-3 bg-gray-900/60 p-3 rounded border border-gray-700/60">
                                    <div className="flex items-center justify-between border-b border-gray-800 pb-1.5">
                                        <h4 className="text-xs font-bold text-gray-200 flex items-center gap-1.5 uppercase tracking-wider">
                                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                            Pista Origen
                                        </h4>
                                        
                                        {spliceSourceSoundId && (
                                            <button
                                                type="button"
                                                onClick={handleAutoDetectLimits}
                                                className="px-2 py-1 bg-indigo-900/40 hover:bg-indigo-900/70 border border-indigo-700 text-[10px] rounded text-indigo-200 transition-colors cursor-pointer"
                                                title="Analiza la señal de audio origen para delimitar la voz o suspiro descartando el silencio"
                                            >
                                                🔍 Auto-Detectar Voz
                                            </button>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-gray-400 mb-1 font-sans">
                                            Seleccionar pista origen:
                                        </label>
                                        {otherSounds.length > 0 ? (
                                            <select
                                                value={spliceSourceSoundId}
                                                onChange={(e) => setSpliceSourceSoundId(e.target.value)}
                                                className="w-full bg-gray-800 text-white text-xs p-2 rounded border border-gray-700 focus:ring-1 focus:ring-blue-500 font-sans cursor-pointer"
                                            >
                                                <option value="" disabled>-- Selecciona un sonido --</option>
                                                {otherSounds.map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <p className="text-[11px] text-red-400 italic font-sans">No tienes otras tarjetas cargadas en tus pistas para seleccionar.</p>
                                        )}
                                    </div>

                                    {/* Source sliders & Fine-tuning */}
                                    {spliceSourceSoundId && (() => {
                                        const srcSound = otherSounds.find(s => s.id === spliceSourceSoundId);
                                        const srcBuf = srcSound ? audioSources[srcSound.audioSourceId] : null;
                                        const srcDur = srcBuf instanceof AudioBuffer ? srcBuf.duration : 0;
                                        
                                        const renderFineTune = (currentVal: number, setVal: (n: number) => void, maxVal: number) => {
                                            const increments = [-1.0, -0.1, 0.1, 1.0];
                                            return (
                                                <div className="flex gap-1 mt-1 justify-start">
                                                    {increments.map(inc => {
                                                        const target = Number((currentVal + inc).toFixed(2));
                                                        const isDisabled = target < 0 || target > maxVal;
                                                        return (
                                                            <button
                                                                key={inc}
                                                                type="button"
                                                                disabled={isDisabled}
                                                                onClick={() => !isDisabled && setVal(target)}
                                                                className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-gray-800 text-[9px] rounded font-mono text-gray-300 hover:text-white transition-all cursor-pointer border border-transparent hover:border-gray-600"
                                                            >
                                                                {inc > 0 ? `+${inc}` : inc}s
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        };

                                        return (
                                            <div className="space-y-3 pt-1 font-sans text-left">
                                                <div className="flex gap-2">
                                                    <div className="flex-grow">
                                                        <ScrubbableInput
                                                            label="Inicio Origen"
                                                            value={spliceSourceStart}
                                                            onChange={val => setSpliceSourceStart(Math.max(0, Math.min(val, spliceSourceEnd)))}
                                                            min={0}
                                                            max={srcDur}
                                                            step={0.01}
                                                            unit="s"
                                                            fixedDecimals={2}
                                                        />
                                                        {renderFineTune(spliceSourceStart, setSpliceSourceStart, srcDur)}
                                                    </div>
                                                    <div className="flex-grow">
                                                        <ScrubbableInput
                                                            label="Fin Origen"
                                                            value={spliceSourceEnd}
                                                            onChange={val => setSpliceSourceEnd(Math.max(spliceSourceStart, Math.min(val, srcDur)))}
                                                            min={0}
                                                            max={srcDur}
                                                            step={0.01}
                                                            unit="s"
                                                            fixedDecimals={2}
                                                        />
                                                        {renderFineTune(spliceSourceEnd, setSpliceSourceEnd, srcDur)}
                                                    </div>
                                                </div>

                                                <div className="space-y-1 pt-1.5 border-t border-gray-800">
                                                    <div className="flex justify-between items-center text-[10px] font-semibold text-gray-300">
                                                        <span>🔊 Volumen del Fragmento Origen</span>
                                                        <span className="font-mono text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-900/40">
                                                            x{spliceSourceVolume.toFixed(2)} ({spliceSourceVolume > 0 ? `+${(20 * Math.log10(spliceSourceVolume)).toFixed(1)} dB` : '-inf dB'})
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0.0"
                                                        max="3.0"
                                                        step="0.05"
                                                        value={spliceSourceVolume}
                                                        onChange={e => setSpliceSourceVolume(parseFloat(e.target.value))}
                                                        className="w-full accent-indigo-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                                    />
                                                    <div className="flex justify-between text-[9px] text-gray-500 font-mono">
                                                        <span>Silencio</span>
                                                        <span className="text-gray-400 font-semibold cursor-pointer" onClick={() => setSpliceSourceVolume(1.00)}>Normal (1.0x)</span>
                                                        <span>Fuerte (3.0x)</span>
                                                    </div>
                                                </div>

                                                <p className="text-[10px] text-gray-500 italic mt-0.5">
                                                    Duración fragmento: {(spliceSourceEnd - spliceSourceStart).toFixed(2)}s (Pista: ~ {srcDur.toFixed(2)}s)
                                                </p>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Pista Destino (Target) */}
                                <div className="space-y-3 bg-gray-900/60 p-3 rounded border border-gray-700/60">
                                    <h4 className="text-xs font-bold text-gray-200 border-b border-gray-800 pb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
                                        <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                                        Intervalo que Reemplazar
                                    </h4>
                                    
                                    {(() => {
                                        const renderFineTuneTarget = (currentVal: number, setVal: (n: number) => void, maxVal: number) => {
                                            const increments = [-1.0, -0.1, 0.1, 1.0];
                                            return (
                                                <div className="flex gap-1 mt-1 justify-start">
                                                    {increments.map(inc => {
                                                        const target = Number((currentVal + inc).toFixed(2));
                                                        const isDisabled = target < 0 || target > maxVal;
                                                        return (
                                                            <button
                                                                key={inc}
                                                                type="button"
                                                                disabled={isDisabled}
                                                                onClick={() => !isDisabled && setVal(target)}
                                                                className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-gray-800 text-[9px] rounded font-mono text-gray-300 hover:text-white transition-all cursor-pointer border border-transparent hover:border-gray-600"
                                                            >
                                                                {inc > 0 ? `+${inc}` : inc}s
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        };

                                        return (
                                            <div className="space-y-3">
                                                <div className="flex gap-2 font-sans text-left">
                                                    <div className="flex-grow">
                                                        <ScrubbableInput
                                                            label="Reemplazar desde"
                                                            value={spliceTargetStart}
                                                            onChange={val => setSpliceTargetStart(Math.max(0, Math.min(val, spliceTargetEnd)))}
                                                            min={0}
                                                            max={audioDuration}
                                                            step={0.01}
                                                            unit="s"
                                                            fixedDecimals={2}
                                                        />
                                                        {renderFineTuneTarget(spliceTargetStart, setSpliceTargetStart, audioDuration)}
                                                    </div>
                                                    <div className="flex-grow">
                                                        <ScrubbableInput
                                                            label="Reemplazar hasta"
                                                            value={spliceTargetEnd}
                                                            onChange={val => setSpliceTargetEnd(Math.max(spliceTargetStart, Math.min(val, audioDuration)))}
                                                            min={0}
                                                            max={audioDuration}
                                                            step={0.01}
                                                            unit="s"
                                                            fixedDecimals={2}
                                                        />
                                                        {renderFineTuneTarget(spliceTargetEnd, setSpliceTargetEnd, audioDuration)}
                                                    </div>
                                                </div>
                                                
                                                <div className="pt-1.5 border-t border-gray-800 space-y-1 font-sans text-left">
                                                    <div className="flex-grow">
                                                        <ScrubbableInput
                                                            label="Fundido Cruzado (Transition)"
                                                            value={spliceCrossfade}
                                                            onChange={val => setSpliceCrossfade(Math.max(0, Math.min(val, 0.5)))}
                                                            min={0}
                                                            max={0.5}
                                                            step={0.01}
                                                            unit="s"
                                                            fixedDecimals={2}
                                                        />
                                                    </div>
                                                    <p className="text-[10px] text-gray-500 font-sans leading-normal">
                                                        Evita clics de audio mediante una transición cruzada gradual de potencia constante.
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Notifications / status */}
                            {spliceSuccessMessage && (
                                <div className="mt-4 p-3 bg-green-950/60 text-green-300 border border-green-900/60 text-xs rounded text-left font-sans animate-fade-in">
                                    {spliceSuccessMessage}
                                </div>
                            )}

                            {spliceErrorMessage && (
                                <div className="mt-4 p-3 bg-red-950/60 text-red-300 border border-red-900/60 text-xs rounded text-left font-sans animate-fade-in">
                                    {spliceErrorMessage}
                                </div>
                            )}

                            {/* Run action button */}
                            <div className="mt-4 flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleApplySplice}
                                    disabled={!spliceSourceSoundId || isRendering}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 text-xs shadow-md cursor-pointer font-sans"
                                >
                                    <span>✂️ Procesar y Aplicar Empalme</span>
                                </button>
                            </div>
                        </div>
                    </div>
                );
            case 'extras':
                return (
                    <div className="animate-fade-in grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                        {/* Paleta de Color y Duplicación */}
                        <div className="space-y-4 bg-gray-800/40 p-4 rounded-md border border-gray-700/60">
                            <div>
                                <h3 className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider border-b border-gray-700 pb-1 flex items-center gap-1.5">
                                    <span>🎨</span> Color del Pad
                                </h3>
                                <div className="flex flex-wrap gap-2 justify-start mt-2.5" aria-label="Selector de Color del Pad">
                                    {Object.entries(soundColors).map(([colorName, className]) => (
                                        <button 
                                            key={colorName} 
                                            onClick={() => handleUpdate({ color: colorName as keyof typeof soundColors })} 
                                            className={`w-7 h-7 rounded-full ${className} transition-transform transform hover:scale-110 focus:outline-none ${localSound.color === colorName ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-white' : ''} relative flex items-center justify-center overflow-hidden`}
                                            title={colorName}
                                        >
                                            {colorName === 'disabled' && <div className="w-full h-1 bg-red-500 transform -rotate-12 absolute"></div>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <hr className="border-gray-700" />
                            <div>
                                <h3 className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider border-b border-gray-700 pb-1 flex items-center gap-1.5">
                                    <span>📂</span> Copiar o Duplicar Tarjeta
                                </h3>
                                <div className="flex flex-col gap-2 mt-2">
                                    <select value={copyTargetBoard} onChange={(e) => setCopyTargetBoard(e.target.value)} className="w-full bg-gray-750 text-white p-2 rounded-md text-xs border border-gray-700 focus:ring-1 focus:ring-indigo-500" aria-label="Pista de destino para duplicar o copiar">
                                        {soundboards.map(b => ( <option key={b.id} value={b.id}> Pista: {b.name} {b.id === activeBoardId && "(actual)"} </option>))}
                                    </select>
                                    <button onClick={openDuplicateChoiceModal} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md text-xs transition-colors w-full text-center cursor-pointer">
                                        {copyTargetBoard === activeBoardId ? 'Duplicar en esta pista' : 'Copiar a pista de destino'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Imagen de Sonido */}
                        <div className="space-y-4 bg-gray-800/40 p-4 rounded-md border border-gray-700/60">
                            <h3 className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider border-b border-gray-700 pb-1 flex items-center gap-1.5">
                                <span>🖼️</span> Imagen del Sonido
                            </h3>
                            <div className="flex flex-row gap-4">
                                <div className="w-20 h-20 flex-shrink-0 bg-gray-900 rounded-md flex items-center justify-center border border-gray-750 overflow-hidden">
                                    {imagePreviewUrl ? (
                                        <img src={imagePreviewUrl} alt="Previsualización del sonido" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-gray-500 text-[10px]">Sin imagen</span>
                                    )}
                                </div>
                                <div className="flex-grow space-y-1.5 justify-center flex flex-col">
                                    <button onClick={() => fileInputRef.current?.click()} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded transition-colors text-[11px] text-center cursor-pointer">
                                        Subir Imagen
                                    </button>
                                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                                    {localSound.imageId && (
                                         <button onClick={() => handleUpdate({ imageId: null })} className="w-full bg-red-700 hover:bg-red-800 text-white font-semibold py-1.5 px-3 rounded transition-colors text-[11px] text-center cursor-pointer">
                                            Eliminar Imagen
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="pt-1">
                                <label className="block text-[11px] font-semibold text-gray-300 mb-1">Generar con IA (Gemini):</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={imageGenPrompt}
                                        onChange={(e) => setImageGenPrompt(e.target.value)}
                                        placeholder="ej: Un bosque oscuro y misterioso..."
                                        className="flex-grow bg-gray-700 text-xs text-white p-2 rounded border border-gray-600 focus:ring-2 focus:ring-indigo-500 font-sans"
                                    />
                                    <button onClick={handleGenerateImage} disabled={isGeneratingImage} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1 px-3 rounded text-xs disabled:opacity-50 disabled:cursor-wait flex items-center justify-center w-20 cursor-pointer">
                                        {isGeneratingImage ? <div className="spinner w-4 h-4"></div> : 'Generar'}
                                    </button>
                                </div>
                                {imageError && <p className="text-red-400 text-[9px] mt-1">{imageError}</p>}
                            </div>
                        </div>

                        {/* Automatizaciones (Stop) */}
                        <div className="col-span-1 md:col-span-2 space-y-2 bg-gray-800/40 p-4 rounded-md border border-gray-700/60">
                            <h3 className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider border-b border-gray-700 pb-1 flex items-center gap-1.5">
                                <span>🤖</span> Automatización de Reproducción
                            </h3>
                            <p className="text-[11px] text-gray-400 mb-2 font-sans">Configura qué sucede con otros sonidos cuando se inicia "{localSound.name}".</p>
                            {potentialStopTargets.length > 0 ? (
                                <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto p-1.5 bg-gray-900/60 rounded border border-gray-800">
                                    {potentialStopTargets.map(target => {
                                        const currentAction = getAutomationAction(target.id);
                                        return (
                                            <div key={target.id} className="grid grid-cols-[1fr_auto] items-center gap-4 p-1.5 rounded hover:bg-gray-800 transition-colors">
                                                <span className="text-[11px] text-gray-200 truncate" title={target.name}>{target.name}</span>
                                                <div className="flex items-center bg-gray-700 rounded p-0.5">
                                                    <button onClick={() => updateAutomation(target.id, 'ignore')} className={`px-2 py-0.5 text-[9px] rounded transition-colors cursor-pointer ${currentAction === 'ignore' ? 'bg-gray-500 text-white font-bold' : 'text-gray-400 hover:text-white'}`}>Ignorar</button>
                                                    <button onClick={() => updateAutomation(target.id, 'stop')} className={`px-2 py-0.5 text-[9px] rounded transition-colors cursor-pointer ${currentAction === 'stop' ? 'bg-red-600 text-white font-bold' : 'text-gray-450'}`}>Stop</button>
                                                    <button onClick={() => updateAutomation(target.id, 'pause')} className={`px-2 py-0.5 text-[9px] rounded transition-colors cursor-pointer ${currentAction === 'pause' ? 'bg-yellow-500 text-black font-bold' : 'text-gray-450'}`}>Pausa</button>
                                                    <button onClick={() => updateAutomation(target.id, 'play')} className={`px-2 py-0.5 text-[9px] rounded transition-colors cursor-pointer ${currentAction === 'play' ? 'bg-indigo-600 text-white font-bold' : 'text-gray-450'}`}>Siguiente</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-[11px] text-gray-500 italic">No hay otros sonidos en esta pista.</p>
                            )}
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    const footer = (
        <div className="flex justify-end items-center w-full">
            <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-5 rounded mr-2 transition-colors cursor-pointer text-sm">Cancelar</button>
            <button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded transition-colors cursor-pointer text-sm">Guardar Cambios</button>
        </div>
    );

    return (
        <Modal title={`Editar Sonido`} onClose={onClose} size="5xl" footer={footer}>
            <div className="relative text-gray-200 flex flex-col h-[75vh] max-h-[75vh]">
                {isRendering && (
                    <div className="absolute inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-50 rounded-lg">
                        <div className="spinner w-12 h-12"></div>
                        <p className="mt-4 text-lg text-white">Renderizando audio...</p>
                    </div>
                )}
                
                {/* Cabecera compacta: Nombre del sonido */}
                <div className="mb-4 flex-shrink-0">
                    <input type="text" value={localSound.name} onChange={e => handleUpdate({ name: e.target.value })} className="w-full bg-gray-900 text-white p-2.5 rounded-md text-base font-semibold border border-gray-750 focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Nombre del Sonido" />
                </div>

                {/* Barra de pestañas horizontales */}
                <div className="flex border-b border-gray-700 overflow-x-auto mb-4 scrollbar-none flex-shrink-0">
                    <button onClick={() => setActiveTab('waveform')} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'waveform' ? 'border-b-2 border-indigo-400 text-indigo-400' : 'text-gray-400 hover:text-white border-b-2 border-transparent'}`}>
                        <span>🌊</span> Onda & Tiempos
                    </button>
                    <button onClick={() => setActiveTab('properties')} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'properties' ? 'border-b-2 border-indigo-400 text-indigo-400' : 'text-gray-400 hover:text-white border-b-2 border-transparent'}`}>
                        <span>🎚️</span> Ajustes de Audio
                    </button>
                    <button onClick={() => setActiveTab('effects')} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'effects' ? 'border-b-2 border-indigo-400 text-indigo-400' : 'text-gray-400 hover:text-white border-b-2 border-transparent'}`}>
                        <span>🎛️</span> Efectos & EQ
                    </button>
                    <button onClick={() => setActiveTab('empalmar')} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'empalmar' ? 'border-b-2 border-indigo-400 text-indigo-400' : 'text-gray-400 hover:text-white border-b-2 border-transparent'}`}>
                        <span>✂️</span> Empalme IA
                    </button>
                    <button onClick={() => setActiveTab('extras')} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'extras' ? 'border-b-2 border-indigo-400 text-indigo-400' : 'text-gray-400 hover:text-white border-b-2 border-transparent'}`}>
                        <span>🎨</span> Extras
                    </button>
                </div>

                {/* Contenido de la pestaña activa con scroll interno de resguardo y altura flexible adaptada */}
                <div className="flex-grow overflow-y-auto pr-1 select-none pb-4 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                    {renderTabContent()}
                </div>
            </div>
            {isDuplicateChoiceModalOpen && (
                <DuplicateChoiceModal
                    onClose={() => setDuplicateChoiceModalOpen(false)}
                    onChoose={handleDuplicateChoice}
                />
            )}
        </Modal>
    );
};

export default EditSoundModal;
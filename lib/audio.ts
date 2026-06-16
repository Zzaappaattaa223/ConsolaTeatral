import { FadeType, Sound, PlayingAudioNodes } from '../types';
import { EQ_BANDS, EQ_BAND_DEFAULTS } from '../constants';

let audioContext: AudioContext;
let masterGainNode: GainNode;
let impulseBuffer: AudioBuffer | null = null;

export const getAudioContext = () => {
    if (!audioContext || audioContext.state === 'closed') {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        masterGainNode = audioContext.createGain();
        masterGainNode.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
};

export const getMasterGainNode = () => {
    if (!masterGainNode) {
        getAudioContext();
    }
    return masterGainNode;
}

export const getImpulseBuffer = async (context: AudioContext): Promise<AudioBuffer> => {
    if (impulseBuffer) {
        return impulseBuffer;
    }
    const duration = 2;
    const decay = 2;
    const sampleRate = context.sampleRate;
    const length = sampleRate * duration;
    const buffer = context.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
    }
    impulseBuffer = buffer;
    return impulseBuffer;
};

export const fadeAudio = (gainNode: GainNode, from: number, to: number, duration: number, curveType: FadeType, context: AudioContext) => {
    gainNode.gain.cancelScheduledValues(context.currentTime);
    gainNode.gain.setValueAtTime(from, context.currentTime);

    if (curveType === 'exponential') {
        // exponentialRampToValueAtTime requires a non-zero target value.
        const targetValue = Math.max(0.0001, to);
        gainNode.gain.exponentialRampToValueAtTime(targetValue, context.currentTime + duration);
    } else { // 'linear'
        gainNode.gain.linearRampToValueAtTime(to, context.currentTime + duration);
    }
};

const dbToGain = (db: number) => Math.pow(10, db / 20);

export const createEqChain = (context: AudioContext, sound: Sound) => {
    const preampNode = context.createGain();
    const bands = Array.isArray(sound.eqBands) && sound.eqBands.length === EQ_BANDS.length 
        ? sound.eqBands 
        : EQ_BAND_DEFAULTS;
        
    const eqNodes = EQ_BANDS.map((freq, i) => {
        const filter = context.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.41;
        filter.gain.value = bands[i] ?? 0;
        return filter;
    });

    preampNode.gain.value = dbToGain(sound.eqPreamp ?? 0);

    // Connect them in a chain
    preampNode.connect(eqNodes[0]);
    for (let i = 0; i < eqNodes.length - 1; i++) {
        eqNodes[i].connect(eqNodes[i + 1]);
    }
    
    return {
        preampNode,
        eqNodes,
        firstNode: preampNode,
        lastNode: eqNodes[eqNodes.length - 1],
    };
};

export const updateEqChain = (nodes: { preampNode?: GainNode, eqNodes?: BiquadFilterNode[] }, sound: Sound, context: AudioContext) => {
    if (!nodes.preampNode || !nodes.eqNodes) return;
    
    const bands = Array.isArray(sound.eqBands) && sound.eqBands.length === EQ_BANDS.length 
        ? sound.eqBands 
        : EQ_BAND_DEFAULTS;

    const preampGainValue = sound.eqEnabled ? dbToGain(sound.eqPreamp) : 1;
    nodes.preampNode.gain.setTargetAtTime(preampGainValue, context.currentTime, 0.015);

    nodes.eqNodes.forEach((node, i) => {
        const bandGainValue = sound.eqEnabled ? bands[i] : 0;
        node.gain.setTargetAtTime(bandGainValue, context.currentTime, 0.015);
    });
};

export const renderAudioWithEffects = async (sound: Sound, sourceBuffer: AudioBuffer): Promise<AudioBuffer> => {
    const context = getAudioContext(); // to get impulse buffer
    const impulseBufferForRender = await getImpulseBuffer(context);

    const soundStartTime = sound.startTime ?? 0;
    const soundEndTime = sound.endTime ?? sourceBuffer.duration;
    const pitch = sound.pitch ?? 1.0;
    
    const durationToRender = soundEndTime - soundStartTime;
    if (durationToRender <= 0) {
        throw new Error("Cannot render a sound with zero or negative duration.");
    }
    
    const renderedDuration = durationToRender / pitch;
    const offlineContext = new OfflineAudioContext(
        sourceBuffer.numberOfChannels,
        Math.ceil(renderedDuration * sourceBuffer.sampleRate),
        sourceBuffer.sampleRate
    );

    const source = offlineContext.createBufferSource();
    const gainNode = offlineContext.createGain();
    const pannerNode = offlineContext.createStereoPanner();
    const preampNode = offlineContext.createGain();
    const eqNodes = EQ_BANDS.map(freq => {
        const filter = offlineContext.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.41;
        return filter;
    });
    preampNode.connect(eqNodes[0]);
    for (let i = 0; i < eqNodes.length - 1; i++) eqNodes[i].connect(eqNodes[i + 1]);
    const lastEqNode = eqNodes[eqNodes.length - 1];
    
    const delayNode = offlineContext.createDelay(5.0);
    const delayFeedbackNode = offlineContext.createGain();
    const convolverNode = offlineContext.createConvolver();
    const dryGainNode = offlineContext.createGain();
    const wetGainNode = offlineContext.createGain();

    source.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(preampNode);
    lastEqNode.connect(delayNode);
    delayNode.connect(delayFeedbackNode).connect(delayNode);
    delayNode.connect(dryGainNode);
    delayNode.connect(wetGainNode).connect(convolverNode);
    dryGainNode.connect(offlineContext.destination);
    convolverNode.connect(offlineContext.destination);

    source.buffer = sourceBuffer;
    source.playbackRate.value = pitch;
    pannerNode.pan.value = sound.pan ?? 0;

    const bands = Array.isArray(sound.eqBands) && sound.eqBands.length === EQ_BANDS.length ? sound.eqBands : EQ_BAND_DEFAULTS;
    const preampGainValue = sound.eqEnabled ? dbToGain(sound.eqPreamp) : 1;
    preampNode.gain.value = preampGainValue;
    eqNodes.forEach((node, i) => {
        const bandGainValue = sound.eqEnabled ? (bands[i] ?? 0) : 0;
        node.gain.value = bandGainValue;
    });

    delayNode.delayTime.value = sound.delayTime ?? 0;
    delayFeedbackNode.gain.value = sound.delayFeedback ?? 0;
    convolverNode.buffer = impulseBufferForRender;
    const reverbAmount = sound.reverb ?? 0;
    wetGainNode.gain.value = reverbAmount;
    dryGainNode.gain.value = 1 - reverbAmount;

    const now = 0;
    const gain = gainNode.gain;
    gain.setValueAtTime(0, now);

    const pitchedFadeInDuration = Math.min(sound.fadeIn / pitch, renderedDuration);
    if (pitchedFadeInDuration > 0.001) {
        gain.linearRampToValueAtTime(sound.volume, now + pitchedFadeInDuration);
    } else {
        gain.setValueAtTime(sound.volume, now);
    }
    
    const pitchedFadeOutDuration = Math.min(sound.fadeOut / pitch, renderedDuration);
    if (pitchedFadeOutDuration > 0.001) {
        const fadeOutStartTime = now + renderedDuration - pitchedFadeOutDuration;
        if (fadeOutStartTime > now + pitchedFadeInDuration) {
            gain.setValueAtTime(sound.volume, fadeOutStartTime);
        }
        if (sound.fadeOutType === 'exponential') {
            gain.exponentialRampToValueAtTime(0.0001, fadeOutStartTime + pitchedFadeOutDuration);
        } else {
            gain.linearRampToValueAtTime(0, fadeOutStartTime + pitchedFadeOutDuration);
        }
    }

    source.start(now, soundStartTime, durationToRender);
    
    return offlineContext.startRendering();
}

/**
 * Empalma dos AudioBuffers reemplazando una porción del buffer objetivo con una porción del buffer origen.
 * Ofrece un fundido cruzado (crossfade) de potencia constante para un empalme suave y totalmente natural.
 */
export function spliceAudioBuffers(
    targetBuffer: AudioBuffer,
    targetStart: number,
    targetEnd: number,
    sourceBuffer: AudioBuffer,
    sourceStart: number,
    sourceEnd: number,
    crossfadeDur: number,
    sourceGain: number = 1.0
): AudioBuffer {
    const sr = targetBuffer.sampleRate;
    const channels = Math.max(targetBuffer.numberOfChannels, sourceBuffer.numberOfChannels);
    
    // Normalizar y sanear límites del intervalo origen
    let sStart = Math.max(0, Math.min(sourceStart, sourceBuffer.duration));
    let sEnd = Math.max(sStart, Math.min(sourceEnd, sourceBuffer.duration));
    const sourceLen = sEnd - sStart;

    // Normalizar y sanear límites del intervalo destino
    let tStart = Math.max(0, Math.min(targetStart, targetBuffer.duration));
    let tEnd = Math.max(tStart, Math.min(targetEnd, targetBuffer.duration));
    const targetDuration = targetBuffer.duration;
    const targetLen = tEnd - tStart;
    
    // Nueva duración calculada para el buffer resultante
    const newDuration = targetDuration - targetLen + sourceLen;
    const totalSamples = Math.ceil(newDuration * sr);
    
    // Crear el nuevo buffer utilizando un OfflineAudioContext o directamente mediante el AudioContext activo
    const context = getAudioContext();
    const newBuffer = context.createBuffer(channels, totalSamples, sr);
    
    // Limitar el fundido para que quepa perfectamente dentro de los bloques
    const actualCrossfade = Math.min(
        crossfadeDur,
        tStart,
        targetDuration - tEnd,
        sourceLen,
        0.5 // Máximo medio segundo de crossfade para evitar ralentizaciones o vacíos anormales
    );
    const xSamples = Math.floor(actualCrossfade * sr);
    
    for (let c = 0; c < channels; c++) {
        const targetData = targetBuffer.getChannelData(Math.min(c, targetBuffer.numberOfChannels - 1));
        const sourceData = sourceBuffer.getChannelData(Math.min(c, sourceBuffer.numberOfChannels - 1));
        const newData = newBuffer.getChannelData(c);
        
        // 1. Copiar Parte A (inicio del destino que no cambia): 0 a targetStart - actualCrossfade
        const partAStrictEndSample = Math.floor((tStart - actualCrossfade) * sr);
        for (let i = 0; i < partAStrictEndSample; i++) {
            newData[i] = targetData[i] ?? 0;
        }
        
        // 2. Fundido cruzado de la primera frontera (Parte A -> Inicio del segmento de origen insertado)
        // Se mezcla la porción targetData entre [partAStrictEndSample, targetStart] con sourceData entre [sourceStart, sourceStart + actualCrossfade]
        const tStartSample = Math.floor(tStart * sr);
        const sStartSample = Math.floor(sStart * sr);
        
        for (let i = 0; i < xSamples; i++) {
            const outIndex = partAStrictEndSample + i;
            const targetIndex = partAStrictEndSample + i;
            const sourceIndex = sStartSample + i;
            
            const ratio = i / xSamples; 
            const targetVal = targetData[targetIndex] ?? 0;
            const sourceVal = (sourceData[sourceIndex] ?? 0) * sourceGain;
            
            // Equal-power crossfade para conservar balance de intensidad volumétrica natural
            const targetAmp = Math.cos(ratio * Math.PI * 0.5);
            const sourceAmp = Math.sin(ratio * Math.PI * 0.5);
            newData[outIndex] = targetVal * targetAmp + sourceVal * sourceAmp;
        }
        
        // 3. Copiar bloque central del origen directamente (sin transición estricta)
        const sourceLenSamples = Math.floor(sourceLen * sr);
        const middleBlockEndSample = tStartSample + sourceLenSamples - xSamples;
        
        for (let i = tStartSample; i < middleBlockEndSample; i++) {
            const sourceOffset = (i - tStartSample) + sStartSample;
            newData[i] = (sourceData[sourceOffset] ?? 0) * sourceGain;
        }
        
        // 4. Fundido cruzado de la segunda frontera (Final del segmento de origen -> Parte B del destino)
        // Se mezcla el final de la porción origen con el reinicio de targetData en targetEnd
        const sEndSample = Math.floor(sEnd * sr);
        const tEndSample = Math.floor(tEnd * sr);
        
        for (let i = 0; i < xSamples; i++) {
            const outIndex = middleBlockEndSample + i;
            const sourceIndex = (sEndSample - xSamples) + i;
            const targetIndex = tEndSample + i;
            
            const ratio = i / xSamples;
            const sourceVal = (sourceData[sourceIndex] ?? 0) * sourceGain;
            const targetVal = targetData[targetIndex] ?? 0;
            
            const sourceAmp = Math.cos(ratio * Math.PI * 0.5);
            const targetAmp = Math.sin(ratio * Math.PI * 0.5);
            newData[outIndex] = sourceVal * sourceAmp + targetVal * targetAmp;
        }
        
        // 5. Copiar Parte B restante del destino hasta el final
        const finalStartSample = tStartSample + sourceLenSamples;
        for (let i = finalStartSample; i < totalSamples; i++) {
            const targetOffset = (i - finalStartSample) + tEndSample;
            newData[i] = targetData[targetOffset] ?? 0;
        }
    }
    
    return newBuffer;
}
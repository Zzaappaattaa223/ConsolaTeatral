import { Soundboard, Sound } from '../types';

export const getSoundById = (boards: Soundboard[], soundId: string): Sound | undefined => {
    for (const board of boards) {
        const found = board.sounds.find(s => s.id === soundId);
        if (found) return found;
    }
    return undefined;
};

export const calculateHash = async (buffer: ArrayBuffer): Promise<string> => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const dataUrlToBlob = (dataUrl: string): Blob => {
    const parts = dataUrl.split(',');
    const contentTypeMatch = parts[0].match(/:(.*?);/);
    if (!contentTypeMatch) {
        throw new Error("Formato de data URL inválido");
    }
    const contentType = contentTypeMatch[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
};

export const isNumber = (val: any): val is number => typeof val === 'number' && isFinite(val);

export const bufferToWaveBlob = (buffer: AudioBuffer): Blob => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;
    const length = numFrames * numChannels * 2 + 44;
    
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    
    let pos = 0;

    const writeString = (s: string) => {
        for (let i = 0; i < s.length; i++) {
            view.setUint8(pos++, s.charCodeAt(i));
        }
    };

    const writeUint16 = (d: number) => {
        view.setUint16(pos, d, true);
        pos += 2;
    };

    const writeUint32 = (d: number) => {
        view.setUint32(pos, d, true);
        pos += 4;
    };

    // RIFF header
    writeString('RIFF');
    writeUint32(length - 8);
    writeString('WAVE');

    // fmt chunk
    writeString('fmt ');
    writeUint32(16);
    writeUint16(1); // PCM
    writeUint16(numChannels);
    writeUint32(sampleRate);
    writeUint32(sampleRate * numChannels * 2); // byte rate
    writeUint16(numChannels * 2); // block align
    writeUint16(16); // bits per sample

    // data chunk
    writeString('data');
    writeUint32(numFrames * numChannels * 2);

    // Write PCM data
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    for (let i = 0; i < numFrames; i++) {
        for (let j = 0; j < numChannels; j++) {
            const sample = Math.max(-1, Math.min(1, channels[j][i]));
            view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            pos += 2;
        }
    }

    return new Blob([view], { type: 'audio/wav' });
};
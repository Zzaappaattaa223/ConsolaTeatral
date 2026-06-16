import { Sound, Soundboard } from '../types';
import { colors, DEFAULT_VOLUME, DEFAULT_PITCH, DEFAULT_PAN, DEFAULT_CROSSFADE, PREAMP_DEFAULT, EQ_BAND_DEFAULTS, soundColors } from '../constants';
import { calculateHash, isNumber } from './utils';
import { audioDB } from './db';

const JSZip = (window as any).JSZip;

// --- types ---
export type ImportSourceType = 'project_zip' | 'single_html' | 'raw_audio_zip' | 'unknown';

export interface ImportAnalysis {
    type: ImportSourceType;
    description: string;
    boards: Soundboard[];
    totalSounds: number;
    filesMap: Map<string, Blob>; // Stores blobs temporarily in memory
}

// --- Helper: Sanitize imported sound ---
function sanitizeSound(sound: any, index: number = 0, defaultName: string = 'Untitled'): Sound {
    return {
        id: sound.id || `sound_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        audioSourceId: sound.audioSourceId || '',
        name: sound.name || defaultName,
        color: typeof sound.color === 'string' && (colors as string[]).includes(sound.color) ? sound.color as keyof typeof soundColors : colors[Math.floor(Math.random() * colors.length)],
        imageId: sound.imageId ?? null,
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
        reverb: isNumber(sound.reverb) ? sound.reverb : 0,
        delayTime: isNumber(sound.delayTime) ? sound.delayTime : 0,
        delayFeedback: isNumber(sound.delayFeedback) ? sound.delayFeedback : 0,
        eqEnabled: sound.eqEnabled ?? false,
        eqPreamp: isNumber(sound.eqPreamp) ? sound.eqPreamp : PREAMP_DEFAULT,
        eqBands: Array.isArray(sound.eqBands) && sound.eqBands.length === 10 ? sound.eqBands : [...EQ_BAND_DEFAULTS],
        stopActions: Array.isArray(sound.stopActions) ? sound.stopActions : (Array.isArray(sound.stopIds) ? sound.stopIds.map((id: any) => ({ soundId: id, type: 'stop' })) : []),
        playCount: isNumber(sound.playCount) ? sound.playCount : 0,
    };
}

// --- Helper: Decode Safe Base64 (Reverses safeBtoa from templates) ---
function safeAtob(str: string): string {
    try {
        // Replicates: decodeURIComponent(atob(str).split('').map(function(c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join(''));
        const binaryString = atob(str);
        const hexBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            hexBytes[i] = binaryString.charCodeAt(i);
        }
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(hexBytes);
    } catch (e) {
        console.warn("Fallo al decodificar safeAtob, intentando atob estándar", e);
        return decodeURIComponent(escape(atob(str)));
    }
}

// --- Core Parser: Logic to extract data from HTML string ---
async function parseHtmlContent(htmlContent: string, sourceName: string): Promise<ImportAnalysis> {
    let data: any;
    const filesMap = new Map<string, Blob>();
    let audioDataMap: Record<string, string> = {};

    // 1. Try to parse specific variable injections from NEW templates (basicTemplate & advancedTemplate)
    // Look for: board: JSON.parse(safeAtob("..."))
    // We accept both 'safeAtob' and just 'atob' to cover versions.
    const boardMatch = htmlContent.match(/board:\s*JSON\.parse\(\s*(?:safeAtob|atob)\s*\(\s*"([^"]+)"\s*\)\s*\)/);
    
    // Look for audioData object. It usually ends before "initialMasterVolume" or "colors".
    // We use a regex that captures the content between "audioData:" and the next known key.
    const audioDataMatch = htmlContent.match(/audioData:\s*(\{[\s\S]*?\})\s*,\s*(?:initialMasterVolume|colors)/);

    if (boardMatch && boardMatch[1]) {
        try {
            const decodedBoardJson = safeAtob(boardMatch[1]);
            const boardData = JSON.parse(decodedBoardJson);
            
            if (audioDataMatch && audioDataMatch[1]) {
                // Clean up the JS object string to make it valid JSON if necessary
                audioDataMap = JSON.parse(audioDataMatch[1]);
            }
            
            data = { board: boardData };
        } catch (e) {
            console.warn("Error parsing template format (Show Player)", e);
        }
    }

    // 2. Fallback: Try legacy Base64 blob pattern (Old exports)
    if (!data) {
        const base64Regex = /const APP_DATA = JSON\.parse\(atob\("([^"]+)"\)\);/;
        let match = htmlContent.match(base64Regex);
        if (match && match[1]) {
            try {
                const decodedJson = atob(match[1]);
                data = JSON.parse(decodedJson);
                if (data.audioSources) {
                    Object.entries(data.audioSources as Record<string, string>).forEach(([k, v]) => {
                        if (v.startsWith('data:')) audioDataMap[k] = v.split(',')[1];
                    });
                }
            } catch(e) { console.warn("Error parsing legacy base64 blob", e); }
        }
    }

    // 3. Fallback: Try legacy plain JSON pattern
    if (!data) {
        const directJsonRegex = /const APP_DATA = (\{.+?\});/s;
        let match = htmlContent.match(directJsonRegex);
        if (match && match[1]) {
            try {
                data = JSON.parse(match[1]);
                if (data.audioSources) {
                    Object.entries(data.audioSources as Record<string, string>).forEach(([k, v]) => {
                         if (v.startsWith('data:')) audioDataMap[k] = v.split(',')[1];
                    });
                }
            } catch(e) { console.warn("Error parsing legacy direct JSON", e); }
        }
    }

    if (!data || !data.board) {
        throw new Error("No se encontraron datos válidos de Soundboard en el HTML.");
    }

    // Process Audio Blobs
    const processedSounds: Sound[] = [];
    const idMapping = new Map<string, string>(); // Maps old ID (from HTML) to new Hash ID

    if (Array.isArray(data.board.sounds)) {
        for (let i = 0; i < data.board.sounds.length; i++) {
            const rawSound = data.board.sounds[i];
            const s = sanitizeSound(rawSound, i, rawSound.name);
            
            // Handle Audio reconstruction
            const oldId = rawSound.audioSourceId;
            
            if (oldId) {
                if (idMapping.has(oldId)) {
                    // We already processed this audio source
                    s.audioSourceId = idMapping.get(oldId)!;
                } else if (audioDataMap[oldId]) {
                    // New audio source to process
                    const base64 = audioDataMap[oldId];
                    try {
                        const binaryString = window.atob(base64);
                        const len = binaryString.length;
                        const bytes = new Uint8Array(len);
                        for (let j = 0; j < len; j++) {
                            bytes[j] = binaryString.charCodeAt(j);
                        }
                        
                        let type = 'audio/mpeg';
                        if (base64.startsWith('SUQz')) type = 'audio/mpeg'; 
                        else if (base64.startsWith('UklGR')) type = 'audio/wav'; 

                        const blob = new Blob([bytes], { type }); 
                        const hash = await calculateHash(await blob.arrayBuffer());
                        
                        filesMap.set(hash, blob);
                        idMapping.set(oldId, hash);
                        s.audioSourceId = hash;
                        
                    } catch (e) {
                        console.error(`Failed to decode audio for sound ${s.name}`, e);
                    }
                }
            }

            processedSounds.push(s);
        }
    }

    const board: Soundboard = {
        id: data.board.id || `board_${Date.now()}`,
        name: data.board.name || sourceName.replace('.html', ''),
        sounds: processedSounds
    };

    return {
        type: 'single_html',
        description: `Show Player recuperado: "${board.name}"`,
        boards: [board],
        totalSounds: processedSounds.length,
        filesMap
    };
}


// --- Main Analysis Function ---
export const analyzeImportFile = async (file: File): Promise<ImportAnalysis> => {
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.html')) {
        const content = await file.text();
        return parseHtmlContent(content, file.name);
    } else if (fileName.endsWith('.zip')) {
        return analyzeZipFile(file);
    } else {
        throw new Error("Formato de archivo no soportado. Use .zip o .html");
    }
};

const analyzeZipFile = async (file: File): Promise<ImportAnalysis> => {
    const zip = await JSZip.loadAsync(file);
    const manifestFile = zip.file("manifest.json");
    const filesMap = new Map<string, Blob>();

    // --- 1. STRUCTURED PROJECT IMPORT (Standard Backup) ---
    if (manifestFile) {
        const manifestContent = await manifestFile.async("string");
        const manifest = JSON.parse(manifestContent);
        const rawBoards = Array.isArray(manifest.soundboards) ? manifest.soundboards : [];
        
        const processedBoards: Soundboard[] = [];
        let totalSounds = 0;

        for (const rawBoard of rawBoards) {
            const sounds: Sound[] = [];
            if (Array.isArray(rawBoard.sounds)) {
                for (const rawSound of rawBoard.sounds) {
                    const s = sanitizeSound(rawSound, sounds.length, rawSound.name);
                    
                    // Audio search
                    const audioFileRegex = new RegExp(`(^|/)${rawSound.audioSourceId}\\.[a-zA-Z0-9]+$`);
                    const rootFileRegex = new RegExp(`(^|/)${rawSound.audioSourceId}\\.[a-zA-Z0-9]+$`);
                    
                    let targetFile = zip.file(audioFileRegex)?.[0] || zip.file(rootFileRegex)?.[0];
                    
                    if (targetFile) {
                         const audioBlob = await targetFile.async("blob");
                         filesMap.set(rawSound.audioSourceId, audioBlob);
                    }

                    // Image search
                    if (s.imageId) {
                        const imageFileRegex = new RegExp(`(^|/)${s.imageId}\\.[a-zA-Z0-9]+$`);
                        const targetImg = zip.file(imageFileRegex)?.[0];
                        if (targetImg) {
                            const blob = await targetImg.async("blob");
                            filesMap.set(s.imageId, blob);
                        }
                    }
                    
                    sounds.push(s);
                }
            }
            totalSounds += sounds.length;
            processedBoards.push({
                id: rawBoard.id || `board_${Date.now()}_${Math.random()}`,
                name: rawBoard.name || 'Sin nombre',
                sounds
            });
        }

        return {
            type: 'project_zip',
            description: `Proyecto completo con ${processedBoards.length} pista(s).`,
            boards: processedBoards,
            totalSounds,
            filesMap
        };
    } 
    
    // --- 2. HTML PLAYER DISCOVERY (HTML inside ZIP) ---
    const htmlFiles: any[] = [];
    zip.forEach((relativePath: string, zipEntry: any) => {
        if (!zipEntry.dir && relativePath.toLowerCase().endsWith('.html') && !relativePath.includes('__MACOSX')) {
            htmlFiles.push(zipEntry);
        }
    });

    if (htmlFiles.length > 0) {
        // Sort by size descending to find the main player
        htmlFiles.sort((a, b) => (b._data ? b._data.uncompressedSize : 0) - (a._data ? a._data.uncompressedSize : 0));
        
        for (const htmlEntry of htmlFiles) {
             try {
                 const htmlContent = await htmlEntry.async("string");
                 if (htmlContent.includes('safeAtob') || htmlContent.includes('audioData') || htmlContent.includes('APP_DATA')) {
                     return parseHtmlContent(htmlContent, htmlEntry.name.split('/').pop());
                 }
             } catch (e) {
                 console.warn("Found HTML but failed to parse as Soundboard:", htmlEntry.name);
             }
        }
    }

    // --- 3. RAW AUDIO BAG IMPORT (Fallback) ---
    const newSounds: Sound[] = [];
    const audioExtensions = /\.(mp3|wav|ogg|flac|aac|m4a|weba)$/i;
    
    const validFiles: any[] = [];
    
    zip.forEach((relativePath: string, zipEntry: any) => {
        if (!zipEntry.dir && !relativePath.includes('__MACOSX') && !relativePath.startsWith('.') && audioExtensions.test(zipEntry.name)) {
            validFiles.push(zipEntry);
        }
    });

    if (validFiles.length === 0) {
         throw new Error("El archivo ZIP no contiene ni un manifiesto de proyecto, ni un Player HTML válido, ni archivos de audio sueltos.");
    }

    for (let i = 0; i < validFiles.length; i++) {
        const entry = validFiles[i];
        const blob = await entry.async('blob');
        const buffer = await blob.arrayBuffer();
        const hash = await calculateHash(buffer); 
        
        filesMap.set(hash, blob);

        const parts = entry.name.split('/');
        const fileName = parts[parts.length - 1];
        const cleanName = fileName.replace(/\.[^/.]+$/, "");
        
        newSounds.push({
            id: `imported_sound_${Date.now()}_${i}`,
            audioSourceId: hash,
            name: cleanName,
            color: colors[i % colors.length],
            imageId: null,
            volume: DEFAULT_VOLUME,
            pitch: DEFAULT_PITCH,
            pan: DEFAULT_PAN,
            loop: false,
            retriggerable: false,
            crossfade: DEFAULT_CROSSFADE,
            fadeIn: 0.1,
            fadeOut: 0.1,
            fadeInType: 'linear',
            fadeOutType: 'linear',
            startTime: 0,
            endTime: null,
            reverb: 0,
            delayTime: 0,
            delayFeedback: 0,
            eqEnabled: false,
            eqPreamp: PREAMP_DEFAULT,
            eqBands: [...EQ_BAND_DEFAULTS],
            stopActions: [],
            playCount: 0,
        });
    }

    const board: Soundboard = {
        id: `board_${Date.now()}`,
        name: file.name.replace('.zip', ''),
        sounds: newSounds
    };

    return {
        type: 'raw_audio_zip',
        description: `Paquete de recursos con ${newSounds.length} archivo(s) de audio detectados.`,
        boards: [board],
        totalSounds: newSounds.length,
        filesMap
    };
};

// --- Committer ---
export const commitImport = async (
    analysis: ImportAnalysis, 
    selectedSoundIds: Set<string>, 
    targetBoardId: string | null
): Promise<{ newBoards: Soundboard[], soundsAddedToTarget: number }> => {
    
    const neededSourceIds = new Set<string>();
    const neededImageIds = new Set<string>();
    const finalBoards: Soundboard[] = [];
    let soundsAddedCount = 0;

    for (const board of analysis.boards) {
        const selectedSounds = board.sounds.filter(s => selectedSoundIds.has(s.id));
        
        if (selectedSounds.length === 0) continue;

        selectedSounds.forEach(s => {
            neededSourceIds.add(s.audioSourceId);
            if(s.imageId) neededImageIds.add(s.imageId);
        });
        
        // Generate a NEW ID for the board if we are importing as a new track (targetBoardId is null)
        // This ensures that if the board already exists (same ID), it is imported as a copy.
        const newBoardId = targetBoardId ? board.id : `board_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        finalBoards.push({ ...board, id: newBoardId, sounds: selectedSounds });
        
        if (targetBoardId) {
            soundsAddedCount += selectedSounds.length;
        }
    }

    // Write to DB
    const itemsToSave: { key: string, value: Blob }[] = [];
    
    for (const id of Array.from(neededSourceIds)) {
        const blob = analysis.filesMap.get(id);
        if (blob) itemsToSave.push({ key: id, value: blob });
    }
    for (const id of Array.from(neededImageIds)) {
        const blob = analysis.filesMap.get(id);
        if (blob) itemsToSave.push({ key: id, value: blob });
    }

    if (itemsToSave.length > 0) {
        await audioDB.setMultiple(itemsToSave);
    }
    
    if (targetBoardId) {
        const allSelectedSounds = finalBoards.flatMap(b => b.sounds);
        return { 
            newBoards: [{ id: targetBoardId, name: 'MergeTarget', sounds: allSelectedSounds }], 
            soundsAddedToTarget: soundsAddedCount 
        };
    }

    return { newBoards: finalBoards, soundsAddedToTarget: 0 };
};
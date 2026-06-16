import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

// Removed @google/genai imports to comply with client-side API key constraints and server-side model guidelines.
const Type = {
    OBJECT: "OBJECT",
    ARRAY: "ARRAY",
    STRING: "STRING",
    NUMBER: "NUMBER",
    INTEGER: "INTEGER",
    BOOLEAN: "BOOLEAN",
    NULL: "NULL"
} as const;
import { Soundboard, Sound } from '../types';
import { colors } from '../constants';
import { AiIcon, MicrophoneIcon } from './icons';

interface CommandBarProps {
    board: Soundboard;
    onClose: () => void;
}

const CommandBar: React.FC<CommandBarProps> = ({ board, onClose }) => {
    const { state, dispatch } = useAppContext();
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [isListening, setIsListening] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);
    
    // Check for browser support for Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const isSpeechSupported = !!SpeechRecognition;

    useEffect(() => {
        inputRef.current?.focus();
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
             window.removeEventListener('keydown', handleKeyDown);
             // Clean up speech recognition
             if (recognitionRef.current) {
                recognitionRef.current.stop();
             }
        }
    }, [onClose]);

    const executeCommands = (operations: any[]) => {
        const { playbackStates, soundboards, trash } = state;
        const counts = { updated: 0, deleted: 0, duplicated: 0, created: 0, restored: 0, copied: 0, moved: 0 };

        const applySoundFilters = (sounds: Sound[], filters: any): Sound[] => {
            if (!filters) return [...sounds];
            let soundsToModify = [...sounds];
            if (filters.nameContains) soundsToModify = soundsToModify.filter(s => s.name.toLowerCase().includes(filters.nameContains.toLowerCase()));
            if (filters.colors?.length > 0) soundsToModify = soundsToModify.filter(s => filters.colors.includes(s.color));
            if (filters.status) soundsToModify = soundsToModify.filter(s => (playbackStates[s.id]?.status || 'stopped') === filters.status);
            if (filters.isLooping !== undefined) soundsToModify = soundsToModify.filter(s => s.loop === filters.isLooping);
            if (filters.volume?.gt !== undefined) soundsToModify = soundsToModify.filter(s => s.volume > filters.volume.gt);
            if (filters.volume?.lt !== undefined) soundsToModify = soundsToModify.filter(s => s.volume < filters.volume.lt);
            if (filters.pitch?.gt !== undefined) soundsToModify = soundsToModify.filter(s => s.pitch > filters.pitch.gt);
            if (filters.pitch?.lt !== undefined) soundsToModify = soundsToModify.filter(s => s.pitch < filters.pitch.lt);
            if (filters.pan?.gt !== undefined) soundsToModify = soundsToModify.filter(s => s.pan > filters.pan.gt);
            if (filters.pan?.lt !== undefined) soundsToModify = soundsToModify.filter(s => s.pan < filters.pan.lt);
            
            if (filters.ranking) {
                const { property, order, limit = 1 } = filters.ranking;
                if (['volume', 'pitch', 'pan'].includes(property)) {
                    soundsToModify.sort((a, b) => {
                        const valA = a[property as 'volume' | 'pitch' | 'pan'] as number;
                        const valB = b[property as 'volume' | 'pitch' | 'pan'] as number;
                        if (order === 'asc') return valA - valB;
                        return valB - valA;
                    });
                    soundsToModify = soundsToModify.slice(0, limit);
                }
            }
            return soundsToModify;
        };

        operations.forEach(op => {
            if (op.type === 'UPDATE_SOUNDS' && op.updates) {
                const soundsToModify = applySoundFilters(board.sounds, op.soundFilters);
                 // Handle sequential renaming first
                if (op.updates.names && Array.isArray(op.updates.names) && op.updates.names.length > 0) {
                    soundsToModify.forEach((sound, index) => {
                        const newName = op.updates.names[index];
                        if (newName) {
                            dispatch({ type: 'UPDATE_SOUND', payload: { soundId: sound.id, updates: { name: newName } } });
                            counts.updated++;
                        }
                    });
                } else {
                    soundsToModify.forEach(sound => {
                        const newUpdates: Partial<Sound> = {};
                        if (op.updates.volume?.set !== undefined) newUpdates.volume = op.updates.volume.set;
                        else if (op.updates.volume?.increment !== undefined) newUpdates.volume = sound.volume + op.updates.volume.increment;
                        if (op.updates.pitch?.set !== undefined) newUpdates.pitch = op.updates.pitch.set;
                        else if (op.updates.pitch?.increment !== undefined) newUpdates.pitch = sound.pitch + op.updates.pitch.increment;
                        else if (op.updates.pitch?.semitones !== undefined) newUpdates.pitch = sound.pitch * Math.pow(Math.pow(2, 1 / 12), op.updates.pitch.semitones);
                        if (op.updates.pan?.set !== undefined) newUpdates.pan = op.updates.pan.set;
                        else if (op.updates.pan?.increment !== undefined) newUpdates.pan = sound.pan + op.updates.pan.increment;
                        if (op.updates.loop !== undefined) newUpdates.loop = op.updates.loop;
                        if (op.updates.color) newUpdates.color = op.updates.color;
                        if (op.updates.name) newUpdates.name = op.updates.name;

                        if (newUpdates.volume !== undefined) newUpdates.volume = Math.max(0, Math.min(1, newUpdates.volume));
                        if (newUpdates.pitch !== undefined) newUpdates.pitch = Math.max(0.5, Math.min(2, newUpdates.pitch));
                        if (newUpdates.pan !== undefined) newUpdates.pan = Math.max(-1, Math.min(1, newUpdates.pan));

                        if (Object.keys(newUpdates).length > 0) {
                            dispatch({ type: 'UPDATE_SOUND', payload: { soundId: sound.id, updates: newUpdates } });
                            counts.updated++;
                        }
                    });
                }
            } else if (op.type === 'DELETE_SOUNDS') {
                const soundsToDelete = applySoundFilters(board.sounds, op.soundFilters);
                soundsToDelete.forEach(sound => dispatch({ type: 'DELETE_SOUND', payload: { soundId: sound.id } }));
                counts.deleted += soundsToDelete.length;
            } else if (op.type === 'DUPLICATE_SOUNDS') {
                 const soundsToDuplicate = applySoundFilters(board.sounds, op.soundFilters);
                soundsToDuplicate.forEach(sound => {
                    const newSound: Sound = { ...sound, id: `sound_${Date.now()}_${Math.random()}`, name: `${sound.name} (Copia)` };
                    dispatch({ type: 'ADD_SOUND', payload: { boardId: board.id, sound: newSound } });
                });
                counts.duplicated += soundsToDuplicate.length;
            } else if (op.type === 'COPY_SOUNDS' || op.type === 'MOVE_SOUNDS') {
                if (!op.destinationSoundboardName) return;
                const destBoard = soundboards.find(b => b.name.toLowerCase() === op.destinationSoundboardName.toLowerCase());
                if (!destBoard) {
                    throw new Error(`La pista de destino '${op.destinationSoundboardName}' no existe. Por favor, créala primero.`);
                }
                const soundsToProcess = applySoundFilters(board.sounds, op.soundFilters);
                if (op.type === 'COPY_SOUNDS') {
                    soundsToProcess.forEach(sound => {
                        const newSound: Sound = { ...sound, id: `sound_${Date.now()}_${Math.random()}` };
                        dispatch({ type: 'ADD_SOUND', payload: { boardId: destBoard.id, sound: newSound } });
                    });
                    counts.copied += soundsToProcess.length;
                } else { // MOVE_SOUNDS
                    if (board.id === destBoard.id) return;
                    soundsToProcess.forEach(sound => {
                        dispatch({ type: 'MOVE_SOUND', payload: { sound, sourceBoardId: board.id, destBoardId: destBoard.id } });
                    });
                    counts.moved += soundsToProcess.length;
                }
            } else if (op.type === 'CREATE_SOUNDBOARD' && op.name) {
                dispatch({ type: 'ADD_SOUNDBOARD', payload: op.name });
                counts.created++;
            } else if (op.type === 'DELETE_SOUNDBOARD' && op.soundboardFilters) {
                const nameFilter = op.soundboardFilters.nameContains?.toLowerCase();
                const matchAll = op.soundboardFilters.matchAll;

                const boardsToDelete = soundboards.filter(b => {
                    if (matchAll) return true;
                    if (op.soundboardFilters.isActive) {
                        return b.id === board.id;
                    }
                    if (nameFilter) {
                        return b.name.toLowerCase().includes(nameFilter);
                    }
                    return false;
                });
            
                if (boardsToDelete.length === 0 && (nameFilter || op.soundboardFilters.isActive || matchAll)) {
                    throw new Error(`No se encontró ninguna pista que coincida con los criterios para eliminar.`);
                }
            
                boardsToDelete.forEach(b => dispatch({ type: 'DELETE_SOUNDBOARD', payload: b.id }));
                counts.deleted += boardsToDelete.length;
            } else if (op.type === 'RENAME_SOUNDBOARD' && op.newName) {
                const nameFilter = op.soundboardFilters?.nameContains?.toLowerCase();
                const boardsToRename = soundboards.filter(b => {
                    if (op.soundboardFilters?.isActive) return b.id === board.id;
                    if (nameFilter) return b.name.toLowerCase().includes(nameFilter);
                    return false;
                });
                if (boardsToRename.length === 0) {
                    throw new Error(`No se encontró ninguna pista que coincida con los criterios para renombrar.`);
                }
                const boardToRename = boardsToRename[0];
                dispatch({ type: 'RENAME_SOUNDBOARD', payload: { id: boardToRename.id, name: op.newName } });
                counts.updated++;
            } else if (op.type === 'REORDER_SOUNDBOARDS' && op.sortBy) {
                const sortedBoards = [...soundboards];
                switch (op.sortBy) {
                    case 'name_asc': sortedBoards.sort((a, b) => a.name.localeCompare(b.name)); break;
                    case 'name_desc': sortedBoards.sort((a, b) => b.name.localeCompare(a.name)); break;
                    case 'sound_count_asc': sortedBoards.sort((a, b) => a.sounds.length - b.sounds.length); break;
                    case 'sound_count_desc': sortedBoards.sort((a, b) => b.sounds.length - a.sounds.length); break;
                }
                dispatch({ type: 'SET_SOUNDBOARDS_ORDER', payload: sortedBoards });
                counts.updated++;
            } else if (op.type === 'RESTORE_ITEM' && op.restoreFilters?.nameContains) {
                const nameFilter = op.restoreFilters.nameContains.toLowerCase();
                const itemsToRestore = trash.filter(t => t.item.name.toLowerCase().includes(nameFilter));
                if (itemsToRestore.length === 0) throw new Error(`No se encontró "${op.restoreFilters.nameContains}" en los elementos borrados.`);
                
                const itemToRestore = itemsToRestore.sort((a, b) => b.deletedAt - a.deletedAt)[0];
                
                if (itemToRestore.type === 'sound' && !soundboards.some(b => b.id === itemToRestore.originalBoardId) && soundboards.length === 0) {
                    throw new Error(`No se puede restaurar el sonido "${itemToRestore.item.name}" porque no existen pistas.`);
                }
                
                dispatch({ type: 'RESTORE_ITEM', payload: { itemId: itemToRestore.item.id } });
                counts.restored++;
            }
        });
        
        return counts;
    };

    const runCommand = async (command: string) => {
        if (!command.trim()) return;

        setStatus('loading');
        setMessage('');

        const soundContext = board.sounds.map(s => ({ name: s.name, color: s.color, isPlaying: !!state.playbackStates[s.id] }));
        const soundboardContext = state.soundboards.map(b => ({ name: b.name, soundCount: b.sounds.length }));
        const trashContext = state.trash.map(t => ({ name: t.item.name, type: t.type }));

        const schema = {
            type: Type.OBJECT,
            properties: {
                 explanation: { 
                    type: Type.STRING, 
                    description: "Si no se pueden generar operaciones porque el comando es ambiguo, vago o imposible, explica por qué de forma útil. De lo contrario, esto debe ser nulo u omitido."
                },
                operations: {
                    type: Type.ARRAY,
                    description: "Lista de operaciones a realizar.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            type: { type: Type.STRING, enum: [
                                'UPDATE_SOUNDS', 'DELETE_SOUNDS', 'DUPLICATE_SOUNDS', 'COPY_SOUNDS', 'MOVE_SOUNDS',
                                'CREATE_SOUNDBOARD', 'DELETE_SOUNDBOARD', 'RENAME_SOUNDBOARD', 'REORDER_SOUNDBOARDS',
                                'RESTORE_ITEM'
                            ], description: "El tipo de operación." },
                            
                            soundFilters: {
                                type: Type.OBJECT,
                                description: "Criterios para seleccionar los sonidos. Si está vacío, se aplica a TODOS los sonidos de la pista activa.",
                                properties: {
                                    nameContains: { type: Type.STRING, description: "Coincide con sonidos cuyo nombre contiene este texto (insensible a mayúsculas)." },
                                    colors: { type: Type.ARRAY, description: "Una lista de colores a filtrar.", items: { type: Type.STRING, enum: colors } },
                                    status: { type: Type.STRING, enum: ['playing', 'paused', 'stopped'], description: "Estado de reproducción del sonido." },
                                    isLooping: { type: Type.BOOLEAN, description: "Si el sonido está en modo bucle." },
                                    volume: { type: Type.OBJECT, properties: { gt: { type: Type.NUMBER }, lt: { type: Type.NUMBER } } },
                                    pitch: { type: Type.OBJECT, properties: { gt: { type: Type.NUMBER }, lt: { type: Type.NUMBER } } },
                                    pan: { type: Type.OBJECT, properties: { gt: { type: Type.NUMBER }, lt: { type: Type.NUMBER } } },
                                    ranking: {
                                        type: Type.OBJECT,
                                        description: "Selecciona sonidos basados en un ranking de sus propiedades. Ej: el de menor volumen.",
                                        properties: {
                                            property: { type: Type.STRING, enum: ['volume', 'pitch', 'pan'], description: "La propiedad por la cual ordenar." },
                                            order: { type: Type.STRING, enum: ['asc', 'desc'], description: "'asc' para el más bajo/menor, 'desc' para el más alto/mayor." },
                                            limit: { type: Type.NUMBER, description: "Cuántos sonidos seleccionar del ranking (ej: 1 para 'el más bajo')." }
                                        }
                                    }
                                }
                            },
                            destinationSoundboardName: { type: Type.STRING, description: "El nombre de la pista de destino para una operación COPY o MOVE." },
                            updates: {
                                type: Type.OBJECT,
                                description: "Propiedades a cambiar. Solo para tipo UPDATE_SOUNDS.",
                                properties: {
                                   volume: { type: Type.OBJECT, properties: { set: {type: Type.NUMBER}, increment: {type: Type.NUMBER} } },
                                   pitch: { type: Type.OBJECT, properties: { set: {type: Type.NUMBER}, increment: {type: Type.NUMBER}, semitones: {type: Type.NUMBER} } },
                                   pan: { type: Type.OBJECT, properties: { set: {type: Type.NUMBER}, increment: {type: Type.NUMBER} } },
                                   color: { type: Type.STRING, enum: colors },
                                   loop: { type: Type.BOOLEAN },
                                   name: { type: Type.STRING, description: "El nuevo nombre para un único sonido." },
                                   names: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Una lista de nuevos nombres para aplicar secuencialmente a los sonidos filtrados." }
                                }
                            },
                            name: { type: Type.STRING, description: "El nombre para la nueva pista. Usado con CREATE_SOUNDBOARD." },
                            newName: { type: Type.STRING, description: "El nuevo nombre para una pista. Usado con RENAME_SOUNDBOARD." },
                            soundboardFilters: { 
                                type: Type.OBJECT, 
                                description: "Filtros para pistas. Usado con DELETE_SOUNDBOARD o RENAME_SOUNDBOARD.", 
                                properties: { 
                                    nameContains: { type: Type.STRING },
                                    isActive: { type: Type.BOOLEAN, description: "Apunta a la pista de sonido actualmente activa." },
                                    matchAll: { type: Type.BOOLEAN, description: "Si es true, selecciona TODAS las pistas existentes." }
                                } 
                            },
                            sortBy: { type: Type.STRING, enum: ['name_asc', 'name_desc', 'sound_count_asc', 'sound_count_desc'], description: "Criterio de ordenación para pistas. Usado con REORDER_SOUNDBOARDS." },
                            restoreFilters: { type: Type.OBJECT, description: "Filtros para buscar en la papelera. Usado con RESTORE_ITEM.", properties: { nameContains: { type: Type.STRING } } },
                        },
                        required: ['type']
                    }
                }
            },
            required: ['operations']
        };

        try {
            const response = await fetch('/api/generate-content', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gemini-3.5-flash',
                    contents: `El usuario ha emitido el siguiente comando: "${command}".`,
                    config: {
                        systemInstruction: `Eres un intérprete de comandos para una app de soundboard. Traduce el comando del usuario a un objeto JSON que cumpla el schema. Sé preciso y literal.
Contexto Actual:
- Pista Activa: "${board.name}". Contiene estos sonidos: ${JSON.stringify(soundContext)}.
- Todas las Pistas: ${JSON.stringify(soundboardContext)}.
- Elementos Borrados (Papelera): ${JSON.stringify(trashContext)}.

Reglas CLAVE:
1.  **Precisión y Alcance del Filtro (IMPORTANTE)**: Si el usuario menciona un nombre de sonido específico (ej. "borra 'explosión'"), DEBES usar un \`soundFilters\` con \`nameContains\` para apuntar *solo* a ese sonido. Si no se especifica un filtro para una operación de sonido, la operación se aplica a **TODOS** los sonidos de la pista activa. Si el usuario dice "mueve a la pista 'Efectos'", asume que se refiere a todos los sonidos de la pista activa y omite \`soundFilters\`. No falles por falta de filtro.
2.  **Nuevas Capacidades de Renombrado**:
    - **Renombrar Pistas**: Ahora puedes renombrar pistas. Usa \`{ "type": "RENAME_SOUNDBOARD", "newName": "Nuevo Nombre", "soundboardFilters": { ... } }\`. Filtra por la pista activa o por nombre.
    - **Renombrar Sonidos**: Para renombrar un sonido, usa \`UPDATE_SOUNDS\` con la propiedad \`name\` en \`updates\`.
    - **Renombrado Secuencial (IMPORTANTE)**: Si el usuario pide renombrar varios sonidos que tienen el mismo nombre (ej. "renombra las copias a 'reloj 1' y 'reloj 2'"), usa la propiedad \`names\` en \`updates\` con un array de los nuevos nombres. El sistema los aplicará en orden. \`{ "updates": { "names": ["reloj 1", "reloj 2"] } }\`.
3.  **Nueva Capacidad de Filtro por Ranking**: Para seleccionar sonidos por propiedades relativas (ej. "el de menor volumen", "el más agudo"), usa el filtro \`soundFilters.ranking\`.
    - Ejemplo: "el sonido con el menor volumen" -> \`"ranking": { "property": "volume", "order": "asc", "limit": 1 }\`
    - Ejemplo: "los 2 sonidos más agudos" -> \`"ranking": { "property": "pitch", "order": "desc", "limit": 2 }\`
4.  **Manejo de Errores Guiado (Usa 'explanation')**:
    - **Pista de Destino Inexistente**: Si el usuario pide mover/copiar a una pista que NO existe, NO generes una operación. Devuelve un \`explanation\` claro, ej: "No puedo mover sonidos a la pista 'Efectos' porque no existe. Primero, crea la pista con 'crea una pista llamada Efectos'".
    - **Comandos Incompletos o Vagos**: Si el usuario identifica sonidos sin una acción (ej. "las copias de 'aplauso'") o el comando es muy vago (ej. "asígnalos como quieras"), NO generes una operación. Usa \`explanation\` para preguntar qué acción realizar, sugiriendo posibilidades claras. Ej: "He identificado 'las copias de aplauso'. ¿Qué acción quieres realizar? Puedes 'borrarlas', 'subirles el volumen', etc.".
5.  **Contexto de la Pista Activa**: A menos que se especifique otra pista, asume que todas las operaciones de sonidos (\`UPDATE\`, \`DELETE\`, \`DUPLICATE\`, \`COPY\`, \`MOVE\`) se originan desde la PISTA ACTIVA.
6.  **Pista Actual**: Para comandos sobre la pista 'actual', 'activa' o 'esta' (ej. "borra esta pista"), usa el filtro \`{ "isActive": true }\`.
7.  **Restauración**: 'Deshacer borrado', 'restaurar' o 'recuperar' usan \`RESTORE_ITEM\` y buscan en la papelera. Si varios coinciden, restaura el más reciente.
8.  **Tono**: Para cambios de tono, 'semitones' es preferible para ajustes musicales.
9.  **Suposición Razonable**: Si un comando es ligeramente ambiguo pero la intención es clara, genera la operación correspondiente. Si es imposible, usa \`explanation\`.
10. **Borrar Todo**: Si el usuario pide borrar "todas las pistas", "todo" o limpiar el proyecto, usa \`DELETE_SOUNDBOARD\` con \`soundboardFilters: { "matchAll": true }\`.`,
                        responseMimeType: "application/json",
                        responseSchema: schema
                    }
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            let jsonStr = data.text ? data.text.trim() : '';
            const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
            const match = jsonStr.match(fenceRegex);
            if (match && match[1]) {
              jsonStr = match[1].trim();
            }

            // FIX: Add type assertion to prevent 'unknown' type issues from JSON.parse.
            const responseJson = JSON.parse(jsonStr) as { explanation?: string; operations: any[] };

            if (!responseJson.operations || responseJson.operations.length === 0) {
                if (responseJson.explanation) {
                    throw new Error(responseJson.explanation);
                }
                throw new Error("El comando no generó ninguna operación válida.");
            }

            const { updated, deleted, duplicated, created, restored, copied, moved } = executeCommands(responseJson.operations);
            
            setStatus('success');
            
            const messageParts = [];
            if (created > 0) messageParts.push(`${created} pista(s) creada(s)`);
            if (updated > 0) messageParts.push(`${updated} actualizado(s)`);
            if (deleted > 0) messageParts.push(`${deleted} borrado(s)`);
            if (duplicated > 0) messageParts.push(`${duplicated} duplicado(s)`);
            if (copied > 0) messageParts.push(`${copied} copiado(s)`);
            if (moved > 0) messageParts.push(`${moved} movido(s)`);
            if (restored > 0) messageParts.push(`${restored} restaurado(s)`);

            const summary = messageParts.length > 0 ? messageParts.join(', ') : 'Ningún elemento afectado.';
            
            setMessage(`Comando ejecutado: ${summary}.`);
            setTimeout(() => onClose(), 1500);

        } catch (err: any) {
            console.error("Error de comando IA:", err);
            setStatus('error');
            let errorMessage = "No se pudo interpretar el comando.";
            if (err.message) {
                 errorMessage = err.message.includes("JSON") ? "La IA devolvió una respuesta inválida." : err.message;
            }
            setMessage(`Error: ${errorMessage}`);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        runCommand(query);
    };

    const toggleListen = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
        } else {
            if (!isSpeechSupported) {
                setMessage("El reconocimiento de voz no es compatible con este navegador.");
                setStatus('error');
                return;
            }
            const recognition = new SpeechRecognition();
            recognition.lang = 'es-ES';
            recognition.continuous = false;
            recognition.interimResults = false;

            recognition.onstart = () => setIsListening(true);
            recognition.onend = () => setIsListening(false);
            recognition.onerror = (event) => {
                console.error("Error en reconocimiento de voz:", event.error);
                setMessage(`Error de voz: ${event.error}`);
                setStatus('error');
                setIsListening(false);
            };

            recognition.onresult = (event) => {
                if (event.results && event.results.length > 0 && event.results[0].length > 0) {
                    const transcript = event.results[0][0].transcript;
                    setQuery(transcript);
                    runCommand(transcript); // Auto-submit
                }
            };
            
            recognitionRef.current = recognition;
            recognition.start();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-center pt-20 md:pt-32 px-4 animate-fade-in" onClick={onClose}>
            <div 
                className="relative w-full max-w-2xl mx-auto h-fit" 
                onClick={e => e.stopPropagation()}
            >
                <form onSubmit={handleSubmit} className="relative">
                    <AiIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-indigo-400 pointer-events-none" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder={isListening ? "Escuchando..." : "Ej: Renombra las copias a 'reloj 1' y 'reloj 2'..."}
                        className="w-full pl-12 pr-20 py-4 bg-gray-800 text-lg text-white rounded-lg shadow-2xl border border-gray-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                        disabled={status === 'loading'}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center space-x-3">
                        {status === 'loading' && <div className="spinner"></div>}
                        {isSpeechSupported && (
                            <button type="button" onClick={toggleListen} title="Dictar comando por voz" className={`p-2 rounded-full transition-colors ${isListening ? 'bg-red-500 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'}`}>
                                <MicrophoneIcon className="w-6 h-6 text-white"/>
                            </button>
                        )}
                    </div>
                </form>
                {message && (
                     <div className={`mt-3 text-center text-sm p-2 rounded-md ${status === 'error' ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}`}>
                        {message}
                     </div>
                )}
                <div className="text-center text-xs text-gray-500 mt-2">
                    Presiona <kbd className="font-sans text-xs font-semibold text-gray-400 border border-gray-600 rounded-md px-1.5 py-0.5">Esc</kbd> para cerrar
                </div>
            </div>
        </div>
    );
};

export default CommandBar;
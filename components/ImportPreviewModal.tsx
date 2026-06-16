import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { analyzeImportFile, ImportAnalysis, commitImport } from '../lib/importer';
import Modal from './Modal';
import { DoubleCheckIcon } from './icons';
import { Soundboard } from '../types';
import { audioDB } from '../lib/db';

const ImportPreviewModal = ({ file, onClose }: { file: File; onClose: () => void }) => {
    const { state, dispatch } = useAppContext();
    const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedSoundIds, setSelectedSoundIds] = useState<Set<string>>(new Set());
    const [importing, setImporting] = useState(false);
    const [isConfirmingOverwrite, setIsConfirmingOverwrite] = useState(false);

    useEffect(() => {
        const analyze = async () => {
            try {
                const result = await analyzeImportFile(file);
                setAnalysis(result);
                // Auto-select all by default
                const allIds = new Set<string>();
                result.boards.forEach(b => b.sounds.forEach(s => allIds.add(s.id)));
                setSelectedSoundIds(allIds);
            } catch (e: any) {
                console.error(e);
                setError(e.message || "Error al analizar el archivo.");
            } finally {
                setLoading(false);
            }
        };
        analyze();
    }, [file]);

    const toggleSound = (id: string) => {
        const newSet = new Set(selectedSoundIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedSoundIds(newSet);
    };

    const toggleBoard = (board: Soundboard) => {
        const newSet = new Set(selectedSoundIds);
        const allSelected = board.sounds.every(s => newSet.has(s.id));
        
        board.sounds.forEach(s => {
            if (allSelected) newSet.delete(s.id);
            else newSet.add(s.id);
        });
        setSelectedSoundIds(newSet);
    };

    const handleImport = async (mode: 'new_boards' | 'merge_active' | 'overwrite') => {
        if (!analysis) return;
        setImporting(true);
        
        try {
            const targetBoardId = mode === 'merge_active' ? state.activeBoardId : null;
            
            if (mode === 'overwrite') {
                 dispatch({ type: 'SET_STATE', payload: { 
                     ...state, 
                     soundboards: [], 
                     activeBoardId: null, 
                     audioSources: {}, 
                     playbackStates: {} 
                 }});
            }

            const { newBoards, soundsAddedToTarget } = await commitImport(analysis, selectedSoundIds, targetBoardId);

            if (mode === 'merge_active' && targetBoardId) {
                // Add sounds to active board
                const soundsToAdd = newBoards[0].sounds;
                soundsToAdd.forEach(sound => {
                     dispatch({ type: 'ADD_SOUND', payload: { boardId: targetBoardId, sound } });
                });
                alert(`${soundsToAdd.length} sonidos añadidos a la pista activa.`);
            } else if (mode === 'new_boards' || mode === 'overwrite') {
                dispatch({ type: 'ADD_SOUNDBOARDS', payload: newBoards });
                if (mode === 'overwrite') {
                    alert(`Proyecto restaurado con éxito.`);
                } else {
                    alert(`${newBoards.length} pista(s) importada(s).`);
                }
            }
            
            onClose();
        } catch (e: any) {
            console.error(e);
            alert("Error durante la importación: " + e.message);
        } finally {
            setImporting(false);
        }
    };

    const getSelectionCount = () => selectedSoundIds.size;

    const renderContent = () => {
        if (loading) return <div className="flex flex-col items-center justify-center h-64 gap-4"><div className="spinner w-12 h-12"></div><p>Analizando archivo...</p></div>;
        if (error) return <div className="text-red-400 text-center p-8"><p className="text-xl mb-2">⚠️ Error</p>{error}</div>;
        if (!analysis) return null;

        return (
            <div className="flex flex-col h-full overflow-hidden">
                <div className="bg-gray-900 p-4 rounded-md mb-4 border border-gray-700 shrink-0">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-indigo-900/50 rounded-full text-indigo-300">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">{file.name}</h3>
                            <p className="text-indigo-300 font-medium">{analysis.description}</p>
                            <p className="text-gray-400 text-sm mt-1">Detectado: {analysis.type === 'project_zip' ? 'Proyecto Completo' : analysis.type === 'raw_audio_zip' ? 'Paquete de Audio' : 'Archivo Individual'}</p>
                        </div>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto border border-gray-700 rounded-md bg-gray-800 p-2 space-y-2">
                    {analysis.boards.map(board => (
                        <div key={board.id} className="bg-gray-900 rounded overflow-hidden border border-gray-700">
                            <div 
                                className="p-3 bg-gray-800 flex items-center cursor-pointer hover:bg-gray-750 transition-colors border-b border-gray-700"
                                onClick={() => toggleBoard(board)}
                            >
                                <input 
                                    type="checkbox" 
                                    checked={board.sounds.length > 0 && board.sounds.every(s => selectedSoundIds.has(s.id))}
                                    ref={input => {
                                        if (input) {
                                            const some = board.sounds.some(s => selectedSoundIds.has(s.id));
                                            const all = board.sounds.every(s => selectedSoundIds.has(s.id));
                                            input.indeterminate = some && !all;
                                        }
                                    }}
                                    readOnly
                                    className="mr-3 h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500 bg-gray-700 border-gray-600"
                                />
                                <span className="font-bold text-gray-200 flex-grow">{board.name}</span>
                                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-full border border-gray-700">{board.sounds.length} sonidos</span>
                            </div>
                            <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {board.sounds.map(sound => (
                                    <div 
                                        key={sound.id} 
                                        onClick={(e) => { e.stopPropagation(); toggleSound(sound.id); }}
                                        className={`flex items-center p-2 rounded cursor-pointer border transition-all ${selectedSoundIds.has(sound.id) ? 'bg-indigo-900/30 border-indigo-500/50' : 'bg-transparent border-transparent hover:bg-gray-800'}`}
                                    >
                                        <input 
                                            type="checkbox" 
                                            checked={selectedSoundIds.has(sound.id)}
                                            readOnly
                                            className="mr-3 h-4 w-4 text-indigo-500 rounded focus:ring-0 bg-gray-700 border-gray-600"
                                        />
                                        <span className={`text-sm truncate ${selectedSoundIds.has(sound.id) ? 'text-white' : 'text-gray-400'}`}>{sound.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                
                <div className="mt-4 text-center text-sm text-gray-400">
                    {getSelectionCount()} sonidos seleccionados de {analysis.totalSounds}
                </div>
            </div>
        );
    };

    const footer = (
        <div className="flex justify-between w-full items-center gap-4">
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors px-4">Cancelar</button>
            
            <div className="flex gap-2">
                {analysis && state.activeBoardId && (
                    <button 
                        onClick={() => handleImport('merge_active')} 
                        disabled={importing || getSelectionCount() === 0}
                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded disabled:opacity-50 transition-colors text-sm"
                        title="Añade los sonidos seleccionados a la pista que estás viendo ahora"
                    >
                        Añadir a Pista Activa
                    </button>
                )}
                
                <button 
                    onClick={() => handleImport('new_boards')} 
                    disabled={importing || getSelectionCount() === 0}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 flex items-center gap-2 transition-colors text-sm"
                >
                    {importing ? <div className="spinner w-4 h-4"></div> : <DoubleCheckIcon className="w-5 h-5" />}
                    Importar como Nueva(s) Pista(s)
                </button>
                 {analysis && analysis.type === 'project_zip' && (
                    <button 
                        onClick={() => setIsConfirmingOverwrite(true)} 
                        disabled={importing || getSelectionCount() === 0}
                        className="bg-red-900/50 hover:bg-red-800 text-red-200 font-bold py-2 px-4 rounded disabled:opacity-50 flex items-center gap-2 transition-colors text-sm border border-red-800"
                        title="Borra todo y restaura este proyecto"
                    >
                        Sobrescribir Todo
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <>
            <Modal title="Vista Previa de Importación" onClose={onClose} size="4xl" footer={!loading && !error ? footer : undefined}>
                {renderContent()}
            </Modal>

            {isConfirmingOverwrite && (
                <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4">
                    <div className="bg-gray-800 border border-red-500/30 rounded-lg p-6 max-w-sm w-full shadow-2xl animate-fade-in text-center space-y-4">
                        <div className="text-red-500 text-4xl mb-2">⚠️</div>
                        <h3 className="text-xl font-bold text-white">¿Sobrescribir Todo?</h3>
                        <p className="text-sm text-gray-400">
                            ¡CUIDADO! Esto borrará <strong className="text-red-400">TODAS</strong> tus pistas actuales y las reemplazará por las de este archivo.
                        </p>
                        <div className="flex gap-3 justify-center pt-2">
                            <button
                                onClick={() => {
                                    handleImport('overwrite');
                                    setIsConfirmingOverwrite(false);
                                }}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow transition-colors cursor-pointer text-sm"
                            >
                                Sí, Sobrescribir
                            </button>
                            <button
                                onClick={() => setIsConfirmingOverwrite(false)}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold rounded shadow transition-colors cursor-pointer text-sm"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ImportPreviewModal;
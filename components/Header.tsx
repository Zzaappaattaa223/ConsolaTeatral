import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { ProductionExportIcon, AiIcon, SettingsIcon, EditIcon, SpeakerWaveIcon, PowerIcon, MoveIcon } from './icons';
import { audioDB } from '../lib/db';
import { AppState, Soundboard, Sound } from '../types';
import { colors, DEFAULT_VOLUME, DEFAULT_PITCH, DEFAULT_PAN, DEFAULT_CROSSFADE, PREAMP_DEFAULT, EQ_BAND_DEFAULTS, soundColors } from '../constants';
import { isNumber, dataUrlToBlob, calculateHash } from '../lib/utils';
import ExportChoiceModal from './ExportChoiceModal';
import ImportPreviewModal from './ImportPreviewModal';
import { generateBasicProductionHTML } from './basicTemplate';
import { generateProductionHTML } from './advancedTemplate';

const JSZip = (window as any).JSZip;

const getNextExportNumber = (boardId: string, type: 'html' | 'zip' = 'html'): number => {
    const key = `export_counter_${type}_${boardId}`;
    let currentNumber = parseInt(localStorage.getItem(key) || '0', 10);
    currentNumber++;
    localStorage.setItem(key, currentNumber.toString());
    return currentNumber;
};

const Header = ({ onOpenCommandBar, onOpenSettings, isIdle }: { onOpenCommandBar: () => void; onOpenSettings: () => void; isIdle: boolean; }) => {
    const { state, dispatch, undo, redo, canUndo, canRedo } = useAppContext();
    const { viewMode, padSize, editMode, isRearrangeMode } = state;
    const importInputRef = useRef<HTMLInputElement>(null);
    const [isExportChoiceModalOpen, setExportChoiceModalOpen] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const menuRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const startX = useRef(0);
    const scrollLeft = useRef(0);
    const dragDistance = useRef(0);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!menuRef.current) return;
        if (e.button !== 0) return; // Only drag with left click
        
        setIsDragging(true);
        startX.current = e.pageX - menuRef.current.offsetLeft;
        scrollLeft.current = menuRef.current.scrollLeft;
        dragDistance.current = 0;
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging || !menuRef.current) return;
        const x = e.pageX - menuRef.current.offsetLeft;
        const walk = (x - startX.current) * 1.5; // Drag speed modifier
        dragDistance.current = Math.abs(x - startX.current);
        menuRef.current.scrollLeft = scrollLeft.current - walk;
    };

    const handleMouseUpOrLeave = () => {
        setIsDragging(false);
    };

    const handleCaptureClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (dragDistance.current > 8) {
            e.stopPropagation();
            e.preventDefault();
        }
    }, []);

    // Scroll wheel: map vertical wheel scroll to horizontal scroll
    useEffect(() => {
        const el = menuRef.current;
        if (!el) return;
        
        const handleWheel = (e: WheelEvent) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                el.scrollLeft += e.deltaY;
            }
        };
        
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            el.removeEventListener('wheel', handleWheel);
        };
    }, []);

    const exportData = async () => {
        const zip = new JSZip();
        const audioFolder = zip.folder("audio");
        const imageFolder = zip.folder("images");

        dispatch({ type: 'SET_LOADING', payload: true });
        
        try {
            const soundboardsToExport = JSON.parse(JSON.stringify(state.soundboards));
            
            const allAudioSourceIds = new Set<string>();
            const allImageIds = new Set<string>();
            soundboardsToExport.forEach((board: Soundboard) => {
                board.sounds.forEach(sound => {
                    allAudioSourceIds.add(sound.audioSourceId);
                    if (sound.imageId) allImageIds.add(sound.imageId);
                });
            });

            for (const sourceId of Array.from(allAudioSourceIds)) {
                const blob = await audioDB.get(sourceId);
                if (blob && audioFolder) {
                    const fileExtension = blob.type.split('/')[1] || 'mp3';
                    audioFolder.file(`${sourceId}.${fileExtension}`, blob);
                }
            }
            
            for (const imageId of Array.from(allImageIds)) {
                const blob = await audioDB.get(imageId);
                if (blob && imageFolder) {
                    const fileExtension = blob.type.split('/')[1] || 'png';
                    imageFolder.file(`${imageId}.${fileExtension}`, blob);
                }
            }
            
            const manifest = {
                version: 4, // Version with advanced automation support
                soundboards: soundboardsToExport
            };
    
            zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    
            const content = await zip.generateAsync({type:"blob"});
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            
            const dateStr = new Date().toISOString().slice(0,10);
            const exportNum = getNextExportNumber('global', 'zip');
            a.download = `soundboard-backup-${dateStr}_v${exportNum}.zip`;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch(e) {
            console.error("Exportación fallida", e);
            alert("La exportación falló. Revisa la consola para más detalles.");
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    };
    
    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setImportFile(file);
        }
        // Reset input so same file can be selected again if cancelled
        if (event.target) event.target.value = '';
    };

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                const commaIndex = result.indexOf(',');
                if (commaIndex !== -1) {
                    resolve(result.slice(commaIndex + 1));
                } else {
                    resolve(result);
                }
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const startProductionExport = async (choice: 'basic' | 'advanced', format: 'html' | 'zip') => {
        setExportChoiceModalOpen(false);
        const { soundboards, activeBoardId, masterVolume } = state;
        const activeBoard = soundboards.find(b => b.id === activeBoardId);

        if (!activeBoard || activeBoard.sounds.length === 0) {
            alert("La pista activa no tiene sonidos para exportar.");
            return;
        }

        dispatch({ type: 'SET_LOADING', payload: true });

        try {
            const audioDataMap: { [key: string]: string } = {};
            const sourceIds = [...new Set(activeBoard.sounds.map(s => s.audioSourceId))];

            // Setup for ZIP if needed
            let zip;
            let audioFolder;
            if (format === 'zip') {
                // @ts-ignore
                zip = new JSZip();
                audioFolder = zip.folder("audio");
            }

            await Promise.all(sourceIds.map(async (id: string, index: number) => {
                const blob = await audioDB.get(id);
                if (blob) {
                    if (format === 'zip') {
                        const extension = blob.type.includes('wav') ? 'wav' : (blob.type.includes('mpeg') || blob.type.includes('mp3') ? 'mp3' : 'ogg');
                        const fileName = `sound_${index + 1}.${extension}`;
                        audioFolder.file(fileName, blob);
                        audioDataMap[id] = `./audio/${fileName}`;
                    } else {
                        audioDataMap[id] = await blobToBase64(blob);
                    }
                } else {
                    console.warn(`No se encontró el blob para el sourceId ${id} en IndexedDB.`);
                }
            }));
            
            const isAdvanced = choice === 'advanced';
            const productionHTML = isAdvanced 
                ? generateProductionHTML(activeBoard, audioDataMap, masterVolume) 
                : generateBasicProductionHTML(activeBoard, audioDataMap, masterVolume);

            const exportNumber = getNextExportNumber(activeBoard.id, 'html');
            const baseFileName = `Player_${activeBoard.name.replace(/[^a-z0-9]/gi, '_')}_v${exportNumber}`;

            if (format === 'zip') {
                zip.file("index.html", productionHTML);
                const content = await zip.generateAsync({ type: "blob" });
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${baseFileName}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                const blob = new Blob([productionHTML], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${baseFileName}.html`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }

        } catch(e) {
            console.error("Exportación para producción fallida", e);
            alert("La exportación para producción falló. Revisa la consola para más detalles.");
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    };

    return (
        <header className={`bg-gray-800 text-white shadow-md z-20 flex-shrink-0 transition-all duration-300 ease-in-out ${isExpanded ? 'p-3' : 'py-1 px-3'}`}>
            <div className="flex justify-between items-center">
                <div className={`min-w-0 flex-1 md:flex-initial transition-all duration-500 ease-in-out mr-2 ${!isExpanded ? 'flex-1' : ''}`}>
                    <h1 className={`text-[15px] sm:text-lg md:text-xl font-bold truncate ${!isExpanded ? 'text-center' : 'text-left'} ${!isExpanded && isIdle ? 'animate-pastel-text' : ''}`}>
                        Consola de Sonido - Teatro de la Abadía 2025
                    </h1>
                </div>
                <div className="flex-shrink-0 flex items-center">
                    <div 
                        ref={menuRef}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUpOrLeave}
                        onMouseLeave={handleMouseUpOrLeave}
                        onClickCapture={handleCaptureClick}
                        className={`hidden lg:flex items-center space-x-2 sm:space-x-4 overflow-x-auto header-scrollable transition-all duration-300 ease-in-out flex-nowrap ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'} ${isExpanded ? 'max-w-4xl opacity-100 ml-2' : 'max-w-0 opacity-0'}`}
                        style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
                    >
                        {viewMode === 'grid' && (
                            <>
                                <div className="flex items-center space-x-2 bg-gray-700/50 p-1 rounded-lg flex-shrink-0" title="Ajustar tamaño de pads y Organización">
                                    <button 
                                        onClick={() => dispatch({ type: 'TOGGLE_REARRANGE_MODE' })}
                                        className={`p-1.5 rounded transition-colors flex-shrink-0 ${isRearrangeMode ? 'bg-green-600 text-white animate-pulse' : 'hover:bg-gray-600 text-gray-400'}`}
                                        title={isRearrangeMode ? "Terminar Organización" : "Organizar Pads (Arrastrar)"}
                                    >
                                        <MoveIcon className="h-5 w-5" />
                                    </button>
                                    <div className="h-4 w-px bg-gray-600 mx-1 flex-shrink-0"></div>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h14a1 1 0 001-1V4a1 1 0 00-1-1H3zm12 11H5V6h10v8z" clipRule="evenodd" />
                                    </svg>
                                    <input
                                        type="range"
                                        min="120"
                                        max="480"
                                        step="8"
                                        value={padSize || 224}
                                        onChange={(e) => dispatch({ type: 'SET_PAD_SIZE', payload: parseInt(e.target.value, 10) })}
                                        className="w-24 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 flex-shrink-0"
                                    />
                                </div>
                                <div className="h-6 w-px bg-gray-600 flex-shrink-0"></div>
                            </>
                        )}

                         <div className="flex items-center space-x-1 bg-gray-700 rounded-md p-1 flex-shrink-0">
                            <button onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'grid' })} className={`p-1.5 rounded flex-shrink-0 ${viewMode === 'grid' ? 'bg-indigo-600' : 'hover:bg-gray-600'}`} title="Vista de Rejilla">
                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                            </button>
                            <button onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'list' })} className={`p-1.5 rounded flex-shrink-0 ${viewMode === 'list' ? 'bg-indigo-600' : 'hover:bg-gray-600'}`} title="Vista de Lista">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                            </button>
                            <div className="h-4 w-px bg-gray-600 mx-1 flex-shrink-0"></div>
                            <button 
                                onClick={() => dispatch({ type: 'TOGGLE_SHOW_HIDDEN_SOUNDS' })} 
                                className={`p-1.5 rounded flex-shrink-0 ${state.showHiddenSounds ? 'bg-indigo-600 text-white' : 'hover:bg-gray-600 text-gray-450'}`} 
                                title={state.showHiddenSounds ? "Ocultar Archivados" : "Ver Archivados"}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    {state.showHiddenSounds ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                    )}
                                </svg>
                            </button>
                        </div>
                        
                        <div className="h-6 w-px bg-gray-600 flex-shrink-0"></div>

                        <div className="flex items-center space-x-1 bg-gray-700 rounded-md p-1 flex-shrink-0">
                            <button 
                                onClick={undo} 
                                disabled={!canUndo} 
                                className={`p-1.5 rounded transition-colors flex-shrink-0 ${canUndo ? 'text-gray-200 hover:bg-gray-600 hover:text-white cursor-pointer' : 'text-gray-500 opacity-45 cursor-not-allowed'}`} 
                                title="Deshacer última acción (Ctrl+Z)"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                            </button>
                            <button 
                                onClick={redo} 
                                disabled={!canRedo} 
                                className={`p-1.5 rounded transition-colors flex-shrink-0 ${canRedo ? 'text-gray-200 hover:bg-gray-600 hover:text-white cursor-pointer' : 'text-gray-500 opacity-45 cursor-not-allowed'}`} 
                                title="Rehacer acción (Ctrl+Y)"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m-6-6l-6-6" />
                                </svg>
                            </button>
                        </div>
                        
                        <div className="h-6 w-px bg-gray-600 flex-shrink-0"></div>

                        <button
                            onClick={() => dispatch({ type: 'TOGGLE_EDIT_MODE' })}
                            className={`p-1.5 rounded flex items-center gap-2 px-3 transition-colors flex-shrink-0 ${editMode ? 'bg-amber-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                            title={editMode ? 'Cambiar a Modo Performance' : 'Cambiar a Modo Edición'}
                        >
                            {editMode ? <EditIcon className="h-5 w-5 flex-shrink-0" /> : <SpeakerWaveIcon className="h-5 w-5 flex-shrink-0" />}
                            <span className="text-sm font-semibold flex-shrink-0">{editMode ? 'Edición' : 'Performance'}</span>
                        </button>

                        <div className="h-6 w-px bg-gray-600 flex-shrink-0"></div>
                        
                        <button onClick={onOpenCommandBar} className="p-2 rounded hover:bg-gray-700 flex-shrink-0" title="Comandos de IA (Ctrl+K)">
                            <AiIcon className="h-7 w-7 flex-shrink-0" />
                        </button>

                        <button onClick={() => setExportChoiceModalOpen(true)} className="p-2 rounded hover:bg-gray-700 flex-shrink-0" title="Exportar para Producción (Show Player)">
                            <ProductionExportIcon />
                        </button>
                        
                        <button onClick={() => importInputRef.current?.click()} className="p-2 rounded hover:bg-gray-700 flex-shrink-0" title="Importar Proyecto o Audio (.zip, .html)">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        </button>
                        <input type="file" ref={importInputRef} onChange={handleFileSelect} accept=".zip,.html" className="hidden" />
                        <button onClick={exportData} className="p-2 rounded hover:bg-gray-700 flex-shrink-0" title="Exportar Proyecto Completo (.zip)">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </button>
                        
                        <div className="h-6 w-px bg-gray-600 flex-shrink-0"></div>

                        <button onClick={onOpenSettings} className="p-2 rounded hover:bg-gray-700 flex-shrink-0" title="Ajustes">
                            <SettingsIcon />
                        </button>

                        <button onClick={() => window.close()} className="p-2 rounded hover:bg-gray-700 text-red-400 hover:text-red-300 flex-shrink-0" title="Cerrar Aplicación">
                            <PowerIcon />
                        </button>
                    </div>

                    {/* Responsive hamburger menu dropdown for small/medium vertical devices */}
                    {isExpanded && (
                        <div className="flex lg:hidden items-center ml-2 relative">
                            <button
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                className="p-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white rounded-lg transition-colors flex items-center gap-2 font-semibold text-sm cursor-pointer border border-gray-600"
                                title="Abrir Menú de Opciones"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                                <span>Menú</span>
                            </button>

                            {/* Transparent overlay backdrop to close dropdown on click outside */}
                            {isMobileMenuOpen && (
                                <div 
                                    className="fixed inset-0 z-30" 
                                    onClick={() => setIsMobileMenuOpen(false)}
                                />
                            )}

                            {/* Mobile menu panel */}
                            {isMobileMenuOpen && (
                                <div className="absolute right-0 top-11 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-40 p-3 max-h-[85vh] overflow-y-auto space-y-3.5 text-sm text-gray-200">
                                    {/* Operation Mode */}
                                    <div className="space-y-1">
                                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">Modo de Operación</div>
                                        <button
                                            onClick={() => { dispatch({ type: 'TOGGLE_EDIT_MODE' }); setIsMobileMenuOpen(false); }}
                                            className={`w-full flex items-center gap-3 p-2 rounded-md transition-all text-left ${editMode ? 'bg-amber-600 text-white font-bold' : 'bg-gray-800 hover:bg-gray-700 font-semibold'}`}
                                        >
                                            {editMode ? <EditIcon className="h-5 w-5 flex-shrink-0" /> : <SpeakerWaveIcon className="h-5 w-5 flex-shrink-0" />}
                                            <span>{editMode ? 'Cambiar a Performance' : 'Cambiar a Edición'}</span>
                                        </button>
                                    </div>

                                    {/* Layout & Views */}
                                    <div className="space-y-1.5">
                                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">Diseño y Distribución</div>
                                        
                                        {viewMode === 'grid' && (
                                            <>
                                                <button 
                                                    onClick={() => { dispatch({ type: 'TOGGLE_REARRANGE_MODE' }); setIsMobileMenuOpen(false); }}
                                                    className={`w-full flex items-center gap-3 p-2 rounded-md transition-all text-left ${isRearrangeMode ? 'bg-green-600 text-white animate-pulse font-bold' : 'bg-gray-800 hover:bg-gray-700'}`}
                                                >
                                                    <MoveIcon className="h-5 w-5 flex-shrink-0" />
                                                    <span>{isRearrangeMode ? "Terminar Organización" : "Organizar Pads (Arrastrar)"}</span>
                                                </button>

                                                {/* Pad Size slider */}
                                                <div className="bg-gray-800 p-2 rounded-md space-y-1">
                                                    <div className="flex justify-between items-center text-[11px] text-gray-400">
                                                        <span>Tamaño de pads</span>
                                                        <span className="font-mono text-indigo-400 font-extrabold">{padSize || 224}px</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h14a1 1 0 001-1V4a1 1 0 00-1-1H3zm12 11H5V6h10v8z" clipRule="evenodd" />
                                                        </svg>
                                                        <input
                                                            type="range"
                                                            min="120"
                                                            max="480"
                                                            step="8"
                                                            value={padSize || 224}
                                                            onChange={(e) => dispatch({ type: 'SET_PAD_SIZE', payload: parseInt(e.target.value, 10) })}
                                                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        <div className="bg-gray-800/80 p-1.5 rounded-md flex items-center justify-between text-xs">
                                            <span className="text-gray-400 pl-1">Vista actual:</span>
                                            <div className="flex bg-gray-900 rounded p-0.5">
                                                <button 
                                                    onClick={() => { dispatch({ type: 'SET_VIEW_MODE', payload: 'grid' }); setIsMobileMenuOpen(false); }} 
                                                    className={`p-1 rounded transition ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
                                                    title="Vista de Rejilla"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                                                </button>
                                                <button 
                                                    onClick={() => { dispatch({ type: 'SET_VIEW_MODE', payload: 'list' }); setIsMobileMenuOpen(false); }} 
                                                    className={`p-1 rounded transition ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
                                                    title="Vista de Lista"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => { dispatch({ type: 'TOGGLE_SHOW_HIDDEN_SOUNDS' }); setIsMobileMenuOpen(false); }}
                                            className={`w-full flex items-center gap-3 p-2 rounded-md transition-all text-left ${state.showHiddenSounds ? 'bg-indigo-600 text-white font-bold' : 'bg-gray-800 hover:bg-gray-700'}`}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                            <span>{state.showHiddenSounds ? 'Ocultar Fichas Archivadas' : 'Ver Fichas Archivadas'}</span>
                                        </button>
                                    </div>

                                    {/* Action History */}
                                    <div className="space-y-1">
                                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">Historial (Ctrl+Z / Ctrl+Y)</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button 
                                                onClick={() => { undo(); setIsMobileMenuOpen(false); }} 
                                                disabled={!canUndo} 
                                                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-gray-800 text-xs transition ${canUndo ? 'text-gray-200 hover:bg-gray-700 cursor-pointer' : 'text-gray-600 cursor-not-allowed opacity-50'}`}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                </svg>
                                                <span>Deshacer</span>
                                            </button>
                                            <button 
                                                onClick={() => { redo(); setIsMobileMenuOpen(false); }} 
                                                disabled={!canRedo} 
                                                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-gray-800 text-xs transition ${canRedo ? 'text-gray-200 hover:bg-gray-700 cursor-pointer' : 'text-gray-600 cursor-not-allowed opacity-50'}`}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m-6-6l-6-6" />
                                                </svg>
                                                <span>Rehacer</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* AI and Export options */}
                                    <div className="space-y-1">
                                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">Herramientas e Importación</div>
                                        
                                        <button 
                                            onClick={() => { onOpenCommandBar(); setIsMobileMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 p-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-indigo-300 hover:text-indigo-200 transition-colors text-left"
                                        >
                                            <AiIcon className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                                            <span>Asistente de IA (Ctrl+K)</span>
                                        </button>

                                        <button 
                                            onClick={() => { setExportChoiceModalOpen(true); setIsMobileMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 p-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-green-400 hover:text-green-300 transition-colors text-left"
                                        >
                                            <ProductionExportIcon className="h-4 w-4 text-green-500 flex-shrink-0" />
                                            <span>Exportar para Show</span>
                                        </button>

                                        <button 
                                            onClick={() => { importInputRef.current?.click(); setIsMobileMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 p-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-blue-400 hover:text-blue-300 transition-colors text-left"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                            <span>Importar Proyecto (.zip/.html)</span>
                                        </button>

                                        <button 
                                            onClick={() => { exportData(); setIsMobileMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 p-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-sky-400 hover:text-sky-300 transition-colors text-left"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-sky-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                            <span>Exportar Copia de Respaldo (.zip)</span>
                                        </button>
                                    </div>

                                    {/* Settings and Close */}
                                    <div className="space-y-1 pt-1.5 border-t border-gray-800">
                                        <button 
                                            onClick={() => { onOpenSettings(); setIsMobileMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 p-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors text-left"
                                        >
                                            <SettingsIcon className="h-4 w-4 flex-shrink-0" />
                                            <span>Ajustes de Consola</span>
                                        </button>

                                        <button 
                                            onClick={() => { window.close(); setIsMobileMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 p-1.5 rounded-md bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-900/20 transition-colors text-left"
                                        >
                                            <PowerIcon className="h-4 w-4 text-red-500 flex-shrink-0" />
                                            <span>Cerrar Aplicación</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <button 
                        onClick={() => setIsExpanded(!isExpanded)} 
                        className="p-2 rounded-full hover:bg-gray-700 ml-2" 
                        title={isExpanded ? 'Colapsar' : 'Expandir'}
                    >
                        {isExpanded ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        )}
                    </button>
                </div>
            </div>
            {isExportChoiceModalOpen && (
                <ExportChoiceModal 
                    onClose={() => setExportChoiceModalOpen(false)}
                    onChoose={startProductionExport}
                />
            )}
            {importFile && (
                <ImportPreviewModal
                    file={importFile}
                    onClose={() => setImportFile(null)}
                />
            )}
        </header>
    );
};

export default Header;
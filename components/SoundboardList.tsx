import React, { useState, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Soundboard, Sound } from '../types';

const SoundboardList = ({ onReorderBoards }: { onReorderBoards: (sourceIndex: number, destIndex: number) => void }) => {
    const { state, dispatch } = useAppContext();
    const { soundboards, activeBoardId, isSidebarCollapsed } = state;
    const [isAdding, setIsAdding] = useState(false);
    const [newBoardName, setNewBoardName] = useState("");
    const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [dragOverBoardId, setDragOverBoardId] = useState<string | null>(null);
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
    const activeBoard = soundboards.find(b => b.id === activeBoardId);

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const handleAddBoard = () => {
        if (newBoardName.trim()) {
            dispatch({ type: 'ADD_SOUNDBOARD', payload: newBoardName.trim() });
            setNewBoardName("");
            setIsAdding(false);
        }
    };

    const handleEditBoard = (board: Soundboard) => {
        setEditingBoardId(board.id);
        setEditingName(board.name);
    };

    const handleSaveRename = () => {
        if (editingBoardId && editingName.trim()) {
            dispatch({ type: 'RENAME_SOUNDBOARD', payload: { id: editingBoardId, name: editingName.trim() } });
            setEditingBoardId(null);
            setEditingName("");
        }
    };
    
    const handleDeleteBoard = (boardId: string) => {
        setConfirmingDeleteId(boardId);
    };

    const handleDragStart = (e: React.DragEvent<HTMLLIElement>, position: number) => {
        dragItem.current = position;
        e.dataTransfer.setData('text/plain', 'soundboard-drag'); // Indicate a soundboard is being dragged
    };
    const handleDragEnter = (e: React.DragEvent<HTMLLIElement>, position: number) => {
        dragOverItem.current = position;
    };
    const handleDragEnd = () => {
        if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
            onReorderBoards(dragItem.current, dragOverItem.current);
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };

    const handleSoundDrop = (e: React.DragEvent<HTMLLIElement>, destBoardId: string) => {
        e.preventDefault();
        setDragOverBoardId(null);
        try {
            const data = JSON.parse(e.dataTransfer.getData("application/json"));
            if (data && data.sound && data.sourceBoardId) {
                const { sound, sourceBoardId } = data;
                if (sourceBoardId !== destBoardId) {
                    dispatch({ type: 'MOVE_SOUND', payload: { sound, sourceBoardId, destBoardId } });
                }
            }
        } catch (err) {
            // This is likely not a sound drop, maybe board reorder, do nothing
        }
    };
    
    const handleDragOverSound = (e: React.DragEvent<HTMLLIElement>, boardId: string) => {
        const isDraggingSound = e.dataTransfer.types.includes('application/json');
        if (isDraggingSound) {
            e.preventDefault();
            setDragOverBoardId(boardId);
        }
    };
    
    const ChevronLeftIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
        </svg>
    );
      
    const ChevronRightIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
    );

    return (
        <>
            <aside className={`bg-gray-800 flex flex-col h-full flex-shrink-0 relative transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-14' : 'w-64 p-4'}`}>
             <button
                onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
                className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-600 text-gray-300 z-10"
                title={isSidebarCollapsed ? "Expandir Panel" : "Colapsar Panel"}
            >
                {isSidebarCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </button>
            
            {isSidebarCollapsed ? (
                <div className="flex-grow flex items-center justify-center w-full overflow-hidden cursor-pointer" onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}>
                     <div className="rotated-text-container">
                        <h2 className="text-gray-300 font-bold whitespace-nowrap text-lg" title={activeBoard?.name}>
                            {activeBoard?.name || "Pistas"}
                        </h2>
                    </div>
                </div>
            ) : (
                <>
                    <h2 className="text-lg font-bold mb-4 text-gray-200">Pistas de Sonido</h2>
                    <ul className="flex-grow space-y-1" onDragLeave={() => setDragOverBoardId(null)}>
                        {soundboards.map((board, index) => (
                            <li key={board.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragEnter={(e) => handleDragEnter(e, index)}
                                onDragEnd={handleDragEnd}
                                onDrop={(e) => handleSoundDrop(e, board.id)}
                                onDragOver={(e) => handleDragOverSound(e, board.id)}
                                className={`p-2 rounded cursor-pointer group flex items-center justify-between text-gray-300 transition-all duration-200 ${activeBoardId === board.id ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-gray-700'} ${dragOverBoardId === board.id ? 'bg-indigo-500 ring-2 ring-offset-2 ring-offset-gray-800 ring-indigo-300' : ''}`}
                                onClick={() => dispatch({ type: 'SET_ACTIVE_BOARD', payload: board.id })}
                            >
                                {editingBoardId === board.id ? (
                                    <input
                                        type="text"
                                        value={editingName}
                                        onChange={(e) => setEditingName(e.target.value)}
                                        onBlur={handleSaveRename}
                                        onKeyDown={(e) => {if (e.key === 'Enter') handleSaveRename(); if(e.key === 'Escape') setEditingBoardId(null);}}
                                        className="bg-gray-600 text-white p-1 rounded w-full -my-1"
                                        autoFocus
                                    />
                                ) : (
                                <>
                                    <span className="truncate flex-1 mr-2">{board.name}</span>
                                    <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center">
                                        <button onClick={(e) => { e.stopPropagation(); handleEditBoard(board); }} className="p-1 hover:bg-gray-600 rounded" title="Renombrar Pista">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteBoard(board.id); }} className="p-1 hover:bg-red-500 rounded text-white" title="Eliminar Pista">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                </>
                                )}
                            </li>
                        ))}
                    </ul>
                    {isAdding ? (
                        <form
                            className="mt-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleAddBoard();
                            }}
                            onBlur={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                    setIsAdding(false);
                                    setNewBoardName("");
                                }
                            }}
                        >
                            <input
                                type="text"
                                value={newBoardName}
                                onChange={(e) => setNewBoardName(e.target.value)}
                                className="w-full bg-gray-700 text-white p-2 rounded"
                                placeholder="Nombre de la Pista"
                                autoFocus
                            />
                            <button type="submit" className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">Añadir Pista</button>
                        </form>
                    ) : (
                        <button onClick={() => setIsAdding(true)} className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">
                            + Añadir Pista
                        </button>
                    )}
                </>
            )}
        </aside>

        {confirmingDeleteId && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                <div className="bg-gray-800 border border-red-500/30 rounded-lg p-6 max-w-sm w-full shadow-2xl animate-fade-in text-center space-y-4">
                    <div className="text-red-500 text-4xl mb-2">⚠️</div>
                    <h3 className="text-xl font-bold text-white">¿Eliminar Pista?</h3>
                    <p className="text-sm text-gray-400">
                        ¿Seguro que quieres eliminar la pista <strong className="text-white">"{soundboards.find(b => b.id === confirmingDeleteId)?.name}"</strong> y todos sus sonidos?
                    </p>
                    <div className="flex gap-3 justify-center pt-2">
                        <button
                            onClick={() => {
                                dispatch({ type: 'DELETE_SOUNDBOARD', payload: confirmingDeleteId });
                                setConfirmingDeleteId(null);
                            }}
                            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow transition-colors cursor-pointer"
                        >
                            Sí, Eliminar
                        </button>
                        <button
                            onClick={() => setConfirmingDeleteId(null)}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold rounded shadow transition-colors cursor-pointer"
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

export default SoundboardList;
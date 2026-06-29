import React, { useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Sound, Soundboard } from '../types';
import SoundPad from './SoundPad';

const SoundboardView = ({ board, onPlay, onPause, onStop, onFadeOut, onEdit, onAddSound, onReorderSounds, setDraggedSound, editMode }: {
    board: Soundboard,
    onPlay: (sound: Sound) => void,
    onPause: (soundId: string) => void,
    onStop: (soundId: string) => void,
    onFadeOut: (soundId: string) => void,
    onEdit: (sound: Sound) => void,
    onAddSound: () => void,
    onReorderSounds: (sourceIndex: number, destIndex: number) => void,
    setDraggedSound: (sound: Sound | null) => void,
    editMode: boolean,
}) => {
    const { state } = useAppContext();
    const { playbackStates, soloSoundId, padSize, isRearrangeMode } = state;
    
    const [isMobile, setIsMobile] = React.useState(false);
    React.useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 640);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const actualPadSize = isMobile ? 140 : (padSize || 224);
    const minColWidth = isMobile ? 130 : Math.max(160, actualPadSize * 0.8);
    
    const dragItem = useRef<number | null>(null);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, sound: Sound, position: number) => {
        dragItem.current = position;
        setDraggedSound(sound);
        e.dataTransfer.setData('application/json', JSON.stringify({ sound, sourceBoardId: board.id }));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, position: number) => {
        e.preventDefault();
        const draggedSoundItem = dragItem.current;
        if (draggedSoundItem === null || draggedSoundItem === position) {
            return;
        }
        onReorderSounds(draggedSoundItem, position);
        dragItem.current = position;
    };
    
    const handleDragEnd = () => {
        setDraggedSound(null);
        dragItem.current = null;
    };

    return (
        <div className="p-4 flex-grow overflow-y-auto h-full">
            <div
                className="grid gap-4"
                style={{
                    gridTemplateColumns: `repeat(auto-fill, minmax(${minColWidth}px, 1fr))`,
                    gridAutoRows: `${actualPadSize}px`
                }}
            >
                {board.sounds
                    .map((sound, originalIndex) => ({ sound, originalIndex }))
                    .filter(({ sound }) => !sound.hidden || state.showHiddenSounds || editMode || isRearrangeMode)
                    .map(({ sound, originalIndex }) => {
                        const isDimmed = soloSoundId !== null && soloSoundId !== sound.id;
                        const draggedSoundId = state.soundboards.find(b => b.id === board.id)?.sounds[dragItem.current ?? -1]?.id;
                        const isDragging = draggedSoundId === sound.id;
                        return (
                            <div
                                key={sound.id}
                                draggable={isRearrangeMode} // Only allow drag in rearrange mode
                                onDragStart={(e) => isRearrangeMode && handleDragStart(e, sound, originalIndex)}
                                onDragOver={(e) => isRearrangeMode && handleDragOver(e, originalIndex)}
                                onDragEnd={() => isRearrangeMode && handleDragEnd()}
                                className={`${isDimmed ? 'grayscale-muted' : ''} ${isDragging ? 'opacity-40' : ''}`}
                            >
                                <SoundPad
                                    sound={sound}
                                    playbackState={playbackStates[sound.id]}
                                    isSolo={soloSoundId === sound.id}
                                    isDimmed={isDimmed}
                                    onPlay={onPlay}
                                    onPause={onPause}
                                    onStop={onStop}
                                    onFadeOut={onFadeOut}
                                    onEdit={onEdit}
                                    editMode={editMode}
                                    isRearrangeMode={isRearrangeMode}
                                    padSize={actualPadSize}
                                />
                            </div>
                        );
                    })}
                <button onClick={onAddSound} className="border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:bg-gray-800 hover:border-indigo-500 hover:text-white transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="mt-2 font-semibold">Añadir Sonido</span>
                </button>
            </div>
        </div>
    );
};

export default SoundboardView;
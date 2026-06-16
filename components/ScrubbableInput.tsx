import React, { useState, useRef, useEffect } from 'react';

interface ScrubbableInputProps {
    label: string;
    value: number;
    onChange: (newValue: number) => void;
    min: number;
    max: number;
    step?: number;
    sensitivity?: number;
    unit?: string;
    displayMultiplier?: number;
    fixedDecimals?: number;
    onExtraAction?: () => void;
    extraActionIcon?: React.ReactNode;
    extraActionTitle?: string;
    extraActionDisabled?: boolean;
}

const ScrubbableInput: React.FC<ScrubbableInputProps> = ({
    label,
    value,
    onChange,
    min,
    max,
    step = 0.01,
    sensitivity = 0.5,
    unit = '',
    displayMultiplier = 1,
    fixedDecimals = 2,
    onExtraAction,
    extraActionIcon,
    extraActionTitle = '',
    extraActionDisabled = false
}) => {
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const shiftPressed = useRef(false);
    const initialX = useRef(0);
    const initialValue = useRef(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftPressed.current = true; };
        const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftPressed.current = false; };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);
    
    useEffect(() => {
        if (!isEditing) {
            setInputValue((value * displayMultiplier).toFixed(fixedDecimals));
        }
    }, [value, isEditing, displayMultiplier, fixedDecimals]);

    const handleStep = (direction: number) => {
        const effectiveStep = shiftPressed.current ? step * 10 : step;
        let newValue = value + direction * effectiveStep;
        newValue = parseFloat(newValue.toFixed(10));
        newValue = Math.max(min, Math.min(max, newValue));
        onChange(newValue);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isEditing) return;
        e.preventDefault();
        setIsScrubbing(true);
        initialX.current = e.clientX;
        initialValue.current = value;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ew-resize';
    };

    const handleMouseUp = () => {
        setIsScrubbing(false);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isScrubbing) return;
        const dx = e.clientX - initialX.current;
        const effectiveSensitivity = sensitivity * (shiftPressed.current ? 5 : 1);
        const range = max - min;
        const change = dx * (range / 1000) * effectiveSensitivity;
        let newValue = initialValue.current + change;
        newValue = Math.max(min, Math.min(max, newValue));
        onChange(newValue);
    };

    useEffect(() => {
        if (isScrubbing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isScrubbing, handleMouseMove, handleMouseUp]);

    const handleDoubleClick = () => {
        setInputValue((value * displayMultiplier).toFixed(fixedDecimals));
        setIsEditing(true);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    };

    const commitChange = () => {
        let numericValue = parseFloat(inputValue) / displayMultiplier;
        if (!isNaN(numericValue)) {
            numericValue = Math.max(min, Math.min(max, numericValue));
            onChange(numericValue);
        }
        setIsEditing(false);
    };

    const handleInputBlur = () => { commitChange(); };

    const handleInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') commitChange();
        else if (e.key === 'Escape') setIsEditing(false);
    };
    
    const displayValue = (value * displayMultiplier).toFixed(fixedDecimals);

    return (
        <div className="flex justify-between items-center text-sm group">
            <span className="text-gray-400 font-medium group-hover:text-white truncate pr-4" title={label}>
                {label}
            </span>
            <div className="flex items-center justify-end bg-gray-800 rounded-md border border-gray-700/50 focus-within:border-indigo-500 group-hover:border-gray-600 transition-colors">
                 {onExtraAction && (
                    <button 
                        onClick={onExtraAction}
                        className="px-2 py-1.5 text-indigo-400 hover:text-white hover:bg-indigo-600/50 focus:outline-none h-full disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                        aria-label={extraActionTitle}
                        title={extraActionTitle}
                        disabled={extraActionDisabled}
                    >
                        {extraActionIcon}
                    </button>
                 )}
                 <button 
                    onClick={() => handleStep(-1)} 
                    className="px-2 py-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-l-md focus:outline-none h-full"
                    aria-label={`Disminuir ${label}`}
                 >
                    &ndash;
                 </button>
                {isEditing ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onBlur={handleInputBlur}
                        onKeyDown={handleInputKeyDown}
                        className="w-[70px] font-mono text-white bg-gray-900 p-1.5 text-center border-y-0 border-x border-gray-600 focus:ring-0 focus:border-indigo-500 outline-none"
                    />
                ) : (
                    <span 
                        className="font-mono text-white px-1 py-1.5 w-[70px] text-center cursor-ew-resize truncate"
                        onMouseDown={handleMouseDown}
                        onDoubleClick={handleDoubleClick}
                        title={`Valor: ${value.toFixed(4)}. Arrastrar para ajustar (Shift para más rápido), doble clic para editar.`}
                    >
                        {displayValue}{unit}
                    </span>
                )}
                 <button 
                    onClick={() => handleStep(1)} 
                    className="px-2 py-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-r-md focus:outline-none h-full"
                    aria-label={`Aumentar ${label}`}
                 >
                    +
                </button>
            </div>
        </div>
    );
};

export default ScrubbableInput;
import React, { useState, useRef, useEffect } from 'react';
import { MicrophoneIcon } from './icons';

const KeyboardIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M18 5a3 3 0 00-3-3H5a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V5zm-2 2a.75.75 0 01.75.75v.5a.75.75 0 01-1.5 0v-.5A.75.75 0 0116 7zM9.5 9a.75.75 0 000 1.5h1a.75.75 0 000-1.5h-1zM5 10.75A.75.75 0 015.75 10h8.5a.75.75 0 010 1.5H5.75A.75.75 0 015 10.75zM7.5 13a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5z" clipRule="evenodd" />
    </svg>
);

interface InputControlProps {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    label: string;
    onSubmit?: () => void;
    disabled?: boolean;
}

const InputControl: React.FC<InputControlProps> = ({ value, onChange, placeholder, label, onSubmit, disabled = false }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);
    const stopTimeoutRef = useRef<any>(null);

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const isSpeechSupported = !!SpeechRecognition;

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);
    
    useEffect(() => {
        return () => {
            recognitionRef.current?.stop();
            if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
        };
    }, []);

    const handleEditCommit = () => setIsEditing(false);

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleEditCommit();
            onSubmit?.();
        }
        if (e.key === 'Escape') setIsEditing(false);
    };
    
    const startListening = () => {
        if (!isSpeechSupported) { setError("Reconocimiento de voz no soportado."); return; }
        if (isListening || disabled) return;

        setError('');
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = 'es-ES';
        recognition.continuous = true;
        recognition.interimResults = false;

        let lastValue = value;

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => { setIsListening(false); recognitionRef.current = null; };
        recognition.onerror = (event: any) => {
            console.error("Speech recognition error", event.error);
            setError(`Error de voz: ${event.error}`);
            setIsListening(false);
        };
        recognition.onresult = (event: any) => {
            if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);

            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal && event.results[i].length > 0) {
                    transcript += event.results[i][0].transcript;
                }
            }
            
            if (transcript) {
                const newValue = (lastValue ? lastValue + ' ' : '') + transcript.trim();
                onChange(newValue);
                lastValue = newValue;
            }
            if (isListening) stopListening();
        };
        recognition.start();
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            stopTimeoutRef.current = setTimeout(() => {
                recognitionRef.current?.stop();
            }, 2500);
        }
    };
    
    const handleMicButtonPress = () => {
        if(isListening) {
             if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
        } else {
            startListening();
        }
    }
    const handleMicButtonRelease = () => { if(isListening) stopListening(); }

    if (isEditing) {
        return (
            <div className="relative w-full">
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={handleEditCommit}
                    onKeyDown={handleInputKeyDown}
                    placeholder={placeholder}
                    className="w-full bg-gray-700 text-white p-2 h-10 rounded border border-indigo-500 ring-2 ring-indigo-500/50"
                    aria-label={label}
                    disabled={disabled}
                />
            </div>
        );
    }

    return (
        <div className={`relative flex items-center w-full bg-gray-900 border border-gray-600 rounded h-10 transition-opacity ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <div className="flex-grow px-3 flex items-center h-full overflow-hidden whitespace-nowrap" aria-label={label}>
                {value ? (
                    <span className="text-white">{value}</span>
                ) : (
                    <span className="text-gray-400">{placeholder}</span>
                )}
            </div>
            <div className="flex-shrink-0 flex items-center pr-1">
                <button
                    type="button"
                    onClick={() => !disabled && setIsEditing(true)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full disabled:cursor-not-allowed disabled:text-gray-600"
                    title="Editar con teclado"
                    disabled={disabled}
                >
                    <KeyboardIcon />
                </button>
                 {isSpeechSupported && (
                    <button
                        type="button"
                        onMouseDown={handleMicButtonPress}
                        onMouseUp={handleMicButtonRelease}
                        onTouchStart={handleMicButtonPress}
                        onTouchEnd={handleMicButtonRelease}
                        className={`p-2 rounded-full transition-colors ${isListening ? 'text-red-500 bg-red-500/20 animate-pulse' : 'text-gray-400 hover:text-white hover:bg-gray-700'} disabled:cursor-not-allowed disabled:text-gray-600`}
                        title="Dictar por voz (mantener para hablar)"
                        disabled={disabled}
                    >
                        <MicrophoneIcon className="w-5 h-5" />
                    </button>
                 )}
            </div>
            {error && <p className="text-xs text-red-400 absolute -bottom-5 left-1">{error}</p>}
        </div>
    );
};
export default InputControl;

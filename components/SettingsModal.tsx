import React, { useState, useEffect } from 'react';
import Modal from './Modal';

const SettingsModal = ({ onClose }: { onClose: () => void }) => {
    const [freesoundKey, setFreesoundKey] = useState('');
    const [pixabayKey, setPixabayKey] = useState('');
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        const savedFreesound = localStorage.getItem('soundboard_freesound_key') || '';
        const savedPixabay = localStorage.getItem('soundboard_pixabay_key') || '';
        setFreesoundKey(savedFreesound);
        setPixabayKey(savedPixabay);
    }, []);

    const handleSave = () => {
        localStorage.setItem('soundboard_freesound_key', freesoundKey.trim());
        localStorage.setItem('soundboard_pixabay_key', pixabayKey.trim());
        setIsSaved(true);
        setTimeout(() => {
            setIsSaved(false);
            onClose();
        }, 1200);
    };

    const footer = (
        <div className="flex justify-between items-center w-full">
            <div>
                {isSaved && <span className="text-green-400 text-sm font-semibold">✓ ¡Ajustes guardados!</span>}
            </div>
            <div className="flex gap-2">
                 <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded transition-colors text-sm">Cancelar</button>
                 <button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded transition-colors text-sm">Guardar</button>
            </div>
        </div>
    );

    return (
        <Modal title="Configuración de Proveedores de Sonido" onClose={onClose} size="2xl" footer={footer}>
            <div className="space-y-6 text-gray-300">
                <p className="text-sm text-gray-400 leading-relaxed">
                    Personaliza los tokens de acceso y las claves API de los repositorios externos de sonidos. Esto te permite evitar bloqueos, límites de cuota compartidos y usar tus propias cuentas integradas en el buscador. All key data se guarda de forma segura únicamente de manera local en tu navegador.
                </p>

                {/* Freesound Config Section */}
                <div className="bg-gray-900/60 p-4 rounded-lg border border-gray-800 space-y-3">
                    <div className="flex justify-between items-center">
                        <h3 className="text-base font-semibold text-indigo-400 flex items-center gap-2">
                            <span>🌐 Freesound API Token</span>
                        </h3>
                        <a 
                            href="https://freesound.org/apiv2/apply" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-xs text-indigo-400 hover:underline hover:text-indigo-300"
                        >
                            Obtener token gratis ↗
                        </a>
                    </div>
                    <p className="text-xs text-gray-400">
                        Se utiliza para realizar búsquedas en Freesound.org. Si lo dejas vacío, el servidor usará un token público por defecto que puede compartir quota con otros usuarios.
                    </p>
                    <input 
                        type="password" 
                        placeholder="Token de Freesound (ej. 0rXaeUju5Q1wEJOviVPogf3bqo4...)" 
                        value={freesoundKey}
                        onChange={(e) => setFreesoundKey(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-750 rounded p-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </div>

                {/* Pixabay Config Section */}
                <div className="bg-gray-900/60 p-4 rounded-lg border border-gray-800 space-y-3">
                    <div className="flex justify-between items-center">
                        <h3 className="text-base font-semibold text-indigo-400 flex items-center gap-2">
                            <span>🎭 Pixabay API Key</span>
                        </h3>
                        <a 
                            href="https://pixabay.com/api/docs/" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-xs text-indigo-400 hover:underline hover:text-indigo-300"
                        >
                            Obtener API Key gratis ↗
                        </a>
                    </div>
                    <p className="text-xs text-gray-400">
                        Pixabay ofrece una excelente biblioteca de música de ambiente y efectos de sonido cortos de alta calidad. Introduce tu API Key de tu cuenta de Pixabay para habilitar las búsquedas directamente desde tus sonidos de teatro.
                    </p>
                    <input 
                        type="password" 
                        placeholder="Clave API de Pixabay (ej. 4536782-abcdef...)" 
                        value={pixabayKey}
                        onChange={(e) => setPixabayKey(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-750 rounded p-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </div>

                {/* Openverse Section */}
                <div className="bg-gray-900/40 p-4 rounded-lg border border-transparent space-y-1">
                    <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2">
                        <span>🔓 Openverse (Creative Commons)</span>
                    </h3>
                    <p className="text-xs text-gray-400">
                        Este repositorio no requiere configuración ni claves con cuotas de uso limitado. Está completamente habilitado de forma predeterminada y ofrece millones de pistas de dominio público y licencias Creative Commons.
                    </p>
                </div>
            </div>
        </Modal>
    );
};

export default SettingsModal;
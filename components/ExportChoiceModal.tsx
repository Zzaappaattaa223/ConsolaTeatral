import React, { useState } from 'react';
import Modal from './Modal';

interface ExportChoiceModalProps {
    onClose: () => void;
    onChoose: (choice: 'basic' | 'advanced' | 'youtube', format: 'html' | 'zip') => void;
}

const ExportChoiceModal: React.FC<ExportChoiceModalProps> = ({ onClose, onChoose }) => {
    const [format, setFormat] = useState<'html' | 'zip'>('zip');

    return (
        <Modal title="Elegir Tipo de Exportación" onClose={onClose} size="3xl">
            <div className="space-y-6 text-gray-300">
                <p>Selecciona el tipo de "Show Player" y el formato.</p>
                
                <div className="flex flex-col space-y-2 p-4 bg-gray-900 rounded-lg">
                    <h3 className="font-bold text-white">Formato de Archivo</h3>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" checked={format === 'zip'} onChange={() => setFormat('zip')} className="text-indigo-500" />
                            <span>Carpeta ZIP (Archivos ligeros enlazados, ideal para servidores o compartir)</span>
                        </label>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" checked={format === 'html'} onChange={() => setFormat('html')} className="text-indigo-500" />
                            <span>HTML Único (Archivo pesado todo-incluido, para uso local rápido)</span>
                        </label>
                    </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                    {/* Basic Option */}
                    <div 
                        onClick={() => onChoose('basic', format)}
                        className="p-4 bg-gray-900 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-700 hover:border-indigo-500 transition-all transform hover:scale-105"
                    >
                        <h3 className="text-lg font-bold text-white mb-2">Básico</h3>
                        <p className="text-xs text-gray-400 mb-4">
                            Un reproductor simple y ligero, ideal para máxima compatibilidad y rapidez.
                        </p>
                        <ul className="text-[10px] list-disc list-inside space-y-1 text-gray-400">
                            <li>Controles de Play/Pausa</li>
                            <li>Slider de volumen por sonido</li>
                            <li>Soporte para Loop</li>
                            <li>Carga rápida</li>
                        </ul>
                    </div>

                    {/* Advanced Option */}
                    <div 
                         onClick={() => onChoose('advanced', format)}
                        className="p-4 bg-gray-900 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-700 hover:border-indigo-500 transition-all transform hover:scale-105"
                    >
                        <h3 className="text-lg font-bold text-indigo-400 mb-2">Avanzado</h3>
                        <p className="text-xs text-gray-400 mb-4">
                            Una mini-aplicación de show completa con controles globales y más funciones por sonido.
                        </p>
                        <ul className="text-[10px] list-disc list-inside space-y-1 text-gray-400">
                            <li>Todo lo del Básico, y además:</li>
                            <li><strong>EQ Global</strong></li>
                            <li><strong>Fade Out y Stop Globales</strong></li>
                            <li>Controles de Fade y Stop por sonido</li>
                            <li>Feedback visual (Glow)</li>
                        </ul>
                    </div>

                    {/* YouTube Option */}
                    <div 
                         onClick={() => onChoose('youtube', format)}
                        className="p-4 bg-gray-900 border border-red-900/35 rounded-lg cursor-pointer hover:bg-gray-700 hover:border-red-500 transition-all transform hover:scale-105"
                    >
                        <h3 className="text-lg font-bold text-red-500 mb-2">Estilo YouTube</h3>
                        <p className="text-xs text-gray-400 mb-4">
                            Diseño responsivo móvil/escritorio idéntico a la interfaz actual de YouTube.
                        </p>
                        <ul className="text-[10px] list-disc list-inside space-y-1 text-gray-400">
                            <li><strong>Ajustado para Celulares</strong> (Vertical/Horizontal)</li>
                            <li>Miniaturas 16:9 con Play y Duración</li>
                            <li><strong>Instrucciones Colapsables</strong> ("Mostrar más")</li>
                            <li>Barra de búsqueda en tiempo real integrada</li>
                            <li>Botonera de acciones rápidas (Pills)</li>
                        </ul>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default ExportChoiceModal;
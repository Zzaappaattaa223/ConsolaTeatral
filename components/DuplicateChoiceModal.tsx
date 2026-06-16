import React from 'react';
import Modal from './Modal';

interface DuplicateChoiceModalProps {
    onClose: () => void;
    onChoose: (choice: 'virtual' | 'rendered') => void;
}

const DuplicateChoiceModal: React.FC<DuplicateChoiceModalProps> = ({ onClose, onChoose }) => {
    return (
        <Modal title="Duplicar Sonido" onClose={onClose} size="2xl">
            <div className="space-y-6 text-gray-300">
                <p>Elige cómo quieres duplicar este sonido. Cada opción tiene un propósito diferente.</p>
                
                <div className="grid md:grid-cols-2 gap-6">
                    <div 
                        onClick={() => onChoose('virtual')}
                        className="p-6 bg-gray-900 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-700 hover:border-indigo-500 transition-all transform hover:scale-105"
                    >
                        <h3 className="text-xl font-bold text-white mb-2">Copia Virtual (Enlazada)</h3>
                        <p className="text-sm text-gray-400 mb-4">
                            Crea una copia con los mismos ajustes que apunta al archivo de audio original. Es rápido y ahorra espacio en disco.
                        </p>
                        <ul className="text-xs list-disc list-inside space-y-1 text-gray-400">
                            <li>Instantáneo.</li>
                            <li>No usa espacio extra.</li>
                            <li>Ideal para variaciones del mismo sonido.</li>
                        </ul>
                    </div>

                    <div 
                        onClick={() => onChoose('rendered')}
                        className="p-6 bg-gray-900 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-700 hover:border-indigo-500 transition-all transform hover:scale-105"
                    >
                        <h3 className="text-xl font-bold text-indigo-400 mb-2">Copia Real (Renderizada)</h3>
                        <p className="text-sm text-gray-400 mb-4">
                            Crea un archivo de audio completamente nuevo con todos los recortes, fades y efectos aplicados de forma permanente.
                        </p>
                        <ul className="text-xs list-disc list-inside space-y-1 text-gray-400">
                            <li>Independiente del original.</li>
                            <li>Reinicia todos los ajustes a sus valores por defecto.</li>
                            <li>Útil para exportar sonidos procesados.</li>
                            <li>Puede tardar unos segundos.</li>
                        </ul>
                    </div>
                </div>

                <div className="text-center text-xs text-gray-500 pt-4">
                    Haz clic en una opción para continuar.
                </div>
            </div>
        </Modal>
    );
};

export default DuplicateChoiceModal;

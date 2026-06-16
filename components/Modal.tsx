import React from 'react';

const Modal = ({ onClose, title, children, footer, size = 'lg' }: { 
    onClose: () => void, 
    title: string, 
    // FIX: Made children optional to fix TS error where it's not detected.
    children?: React.ReactNode,
    footer?: React.ReactNode,
    size?: 'md'|'lg'|'xl'|'2xl'|'3xl'|'4xl'|'5xl' 
}) => {
    const sizeClasses = {
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        '3xl': 'max-w-3xl',
        '4xl': 'max-w-4xl',
        '5xl': 'max-w-5xl',
    }
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-40 flex justify-center items-center p-4" onClick={onClose}>
            <div 
                className={`bg-gray-800 rounded-lg shadow-xl w-full ${sizeClasses[size]} animate-fade-in my-auto max-h-[95vh] flex flex-col`} 
                onClick={e => e.stopPropagation()}
            >
                <div className="flex-shrink-0 flex justify-between items-center p-6 pb-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">{title}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>
                
                <div className="flex-grow p-6 overflow-y-auto min-h-0">
                    {children}
                </div>

                {footer && (
                     <div className="flex-shrink-0 p-6 pt-4 border-t border-gray-700">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Modal;
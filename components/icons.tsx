import React from 'react';

export const PlayIcon = ({className = "w-8 h-8"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
);
export const StopIcon = ({className = "w-6 h-6"}) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M6 6h12v12H6z" />
  </svg>
);
export const PauseIcon = ({className = "w-8 h-8"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

export const LoopIcon = ({className = "w-4 h-4"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"></path>
    </svg>
);

export const SoloIcon = ({className = ''}) => (
     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 ${className}`}>
        <text
            x="50%"
            y="50%"
            dominantBaseline="central"
            textAnchor="middle"
            fontSize="9"
            fontWeight="900"
            letterSpacing="-0.5"
        >
            SOLO
        </text>
     </svg>
);

export const FadeOutIcon = ({className = "w-5 h-5"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M3 17a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3z" />
      <path d="M9 17a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9z" />
      <path d="M15 17a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2z" />
    </svg>
);

export const ErrorIcon = ({className = "w-8 h-8"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
);

export const ProductionExportIcon = ({className = "h-6 w-6"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
);

export const AiIcon = ({ className = "h-6 w-6" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 5.5L13.13 8.87L16.5 10L13.13 11.13L12 14.5L10.87 11.13L7.5 10L10.87 8.87L12 5.5Z" />
        <path d="M5.5 12L6.25 14.25L8.5 15L6.25 15.75L5.5 18L4.75 15.75L2.5 15L4.75 14.25L5.5 12Z" />
        <path d="M18.5 14L19.25 16.25L21.5 17L19.25 17.75L18.5 20L17.75 17.75L15.5 17L17.75 16.25L18.5 14Z" />
    </svg>
);


export const SettingsIcon = ({className = "h-6 w-6"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 5.852a.75.75 0 01-1.06.377l-2.28-1.14a1.875 1.875 0 00-2.312.424l-1.5 2.598a1.875 1.875 0 00.424 2.312l1.14 2.28a.75.75 0 01-.377 1.06l-2.036 1.018a1.875 1.875 0 00-1.567 1.85v1.5c0 .917.663 1.699 1.567 1.85l2.036 1.018a.75.75 0 01.377 1.06l-1.14 2.28a1.875 1.875 0 00-.424 2.312l1.5 2.598a1.875 1.875 0 002.312.424l2.28-1.14a.75.75 0 011.06.377l1.172 2.03a1.875 1.875 0 001.85 1.567h1.5c.917 0 1.699-.663 1.85-1.567l1.172-2.03a.75.75 0 011.06-.377l2.28 1.14a1.875 1.875 0 002.312-.424l1.5-2.598a1.875 1.875 0 00-.424-2.312l-1.14-2.28a.75.75 0 01.377-1.06l2.036-1.018a1.875 1.875 0 001.567-1.85v-1.5c0-.917-.663-1.699-1.567-1.85l-2.036-1.018a.75.75 0 01-.377-1.06l1.14-2.28a1.875 1.875 0 00.424-2.312l-1.5-2.598a1.875 1.875 0 00-2.312-.424l-2.28 1.14a.75.75 0 01-1.06-.377l-1.172-2.03A1.875 1.875 0 0013.428 2.25h-1.5zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
    </svg>
);

export const MicrophoneIcon = ({className = "w-6 h-6"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 2a3 3 0 00-3 3v8a3 3 0 006 0V5a3 3 0 00-3-3z"/>
        <path d="M19 11a7 7 0 01-14 0h-2a9 9 0 008 8.94V22h-3v2h8v-2h-3v-2.06A9 9 0 0021 11h-2z"/>
    </svg>
);

export const SetMarkerIcon = ({className = "w-5 h-5"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path d="M10 3a.75.75 0 01.75.75v10.638l3.47-3.47a.75.75 0 111.06 1.06l-4.75 4.75a.75.75 0 01-1.06 0l-4.75-4.75a.75.75 0 111.06-1.06L9.25 14.388V3.75A.75.75 0 0110 3z" />
    </svg>
);

export const GoToStartIcon = ({className = "w-6 h-6"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path d="M13 10a.75.75 0 01-.75.75H4.56l3.22 3.22a.75.75 0 11-1.06 1.06l-4.5-4.5a.75.75 0 010-1.06l4.5-4.5a.75.75 0 011.06 1.06L4.56 9.25H12.25A.75.75 0 0113 10zM17 5a.75.75 0 01.75.75v8.5a.75.75 0 01-1.5 0V5.75A.75.75 0 0117 5z" />
    </svg>
);

export const RewindIcon = ({className = "w-6 h-6"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path d="M7.02 5.03a.75.75 0 011.058.002l4.5 4.75a.75.75 0 010 .936l-4.5 4.75a.75.75 0 11-1.06-1.06L10.72 10 7.022 6.09a.75.75 0 01-.002-1.06zM2.52 5.03a.75.75 0 011.058.002l4.5 4.75a.75.75 0 010 .936l-4.5 4.75a.75.75 0 11-1.06-1.06L6.22 10 2.522 6.09a.75.75 0 01-.002-1.06z" />
    </svg>
);

export const FastForwardIcon = ({className = "w-6 h-6"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path d="M12.98 5.03a.75.75 0 00-1.06-1.06L7.22 7.88a.75.75 0 000 1.06l4.7 3.91a.75.75 0 101.06-1.06L9.28 10l3.7-3.91a.75.75 0 00-.002-1.06zM8.48 5.03a.75.75 0 00-1.06-1.06L2.72 7.88a.75.75 0 000 1.06l4.7 3.91a.75.75 0 101.06-1.06L4.78 10l3.7-3.91a.75.75 0 00-.002-1.06z" />
    </svg>
);

export const GoToEndIcon = ({className = "w-6 h-6"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path d="M7 10a.75.75 0 01.75-.75h8.69l-3.22-3.22a.75.75 0 011.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06l3.22-3.22H7.75A.75.75 0 017 10zM3 5a.75.75 0 00-.75.75v8.5a.75.75 0 001.5 0V5.75A.75.75 0 003 5z" />
    </svg>
);

export const SpeakerWaveIcon = ({className = "w-6 h-6"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.66 1.905H6.44l4.5 4.5c.945.945 2.56.276 2.56-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06a8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
      <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
    </svg>
);

export const SpeakerXMarkIcon = ({className = "w-6 h-6"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.66 1.905H6.44l4.5 4.5c.945.945 2.56.276 2.56-1.06V4.06zM17.78 9.22a.75.75 0 10-1.06 1.06L18.94 12l-2.22 2.22a.75.75 0 101.06 1.06L20 13.06l2.22 2.22a.75.75 0 101.06-1.06L21.06 12l2.22-2.22a.75.75 0 10-1.06-1.06L20 10.94l-2.22-2.22z" />
    </svg>
);

export const LockClosedIcon = ({ className = "w-5 h-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
    </svg>
);

export const LockOpenIcon = ({ className = "w-5 h-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zM8.5 5.5a1.5 1.5 0 103 0V9h-3V5.5z" />
    </svg>
);

export const ResetIcon = ({ className = "w-4 h-4" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M15.312 11.342a.75.75 0 0 1-1.06 0l-2.08-2.08a.75.75 0 0 1 0-1.06l2.08-2.08a.75.75 0 1 1 1.06 1.06L14.56 8.5h-5.063a4.5 4.5 0 0 0-4.5 4.5v.25a.75.75 0 0 1-1.5 0v-.25a6 6 0 0 1 6-6H14.56l-.78.78a.75.75 0 0 1 0 1.06z" clipRule="evenodd" />
    </svg>
);

export const EditIcon = ({className = "h-6 w-6"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
        <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
        <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
    </svg>
);

export const DoubleCheckIcon = ({className = "w-6 h-6"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M16.28 6.22a.75.75 0 00-1.06-1.06l-6.5 6.5-2.72-2.72a.75.75 0 00-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l7-7zm3.72 7a.75.75 0 00-1.06-1.06l-6.5 6.5-2.72-2.72a.75.75 0 00-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l7-7z" clipRule="evenodd" />
    </svg>
);

export const TrashIcon = ({ className = "h-6 w-6" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

export const DownloadIcon = ({ className = "h-6 w-6" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

export const PowerIcon = ({ className = "h-6 w-6" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
    </svg>
);

export const MoveIcon = ({ className = "h-6 w-6" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M15.97 2.47a.75.75 0 011.06 0l2.25 2.25a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 11-1.06-1.06l.97-.97H12.75a.75.75 0 010-1.5h4.19l-.97-.97a.75.75 0 010-1.06zm-7.94 0a.75.75 0 010 1.06l-.97.97h4.19a.75.75 0 010 1.5H7.06l.97.97a.75.75 0 01-1.06 1.06l-2.25-2.25a.75.75 0 010-1.06l2.25-2.25a.75.75 0 011.06 0zm13.5 13.5a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 111.06-1.06l.97-.97v-4.19a.75.75 0 011.5 0v4.19l.97-.97a.75.75 0 011.06 0zm-13.5 0a.75.75 0 011.06 0l.97.97v-4.19a.75.75 0 011.5 0v4.19l.97-.97a.75.75 0 111.06 1.06l-2.25 2.25a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
);
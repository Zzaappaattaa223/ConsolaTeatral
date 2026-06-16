import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { getAudioContext } from '../lib/audio';
import { audioDB } from '../lib/db';
import { calculateHash } from '../lib/utils';
import { Sound } from '../types';
import { colors, DEFAULT_VOLUME, DEFAULT_PITCH, DEFAULT_PAN, DEFAULT_CROSSFADE, PREAMP_DEFAULT, EQ_BAND_DEFAULTS } from '../constants';
import Modal from './Modal';
import InputControl from './InputControl';

interface FreesoundResult {
    id: number;
    name: string;
    duration: number;
    username: string;
    tags: string[];
    previews: {
        'preview-hq-mp3': string;
    };
}

interface SoundItemSearchResult {
    id: string;
    name: string;
    duration: number;
    username: string;
    previewUrl: string;
    source: 'freesound' | 'pixabay' | 'openverse' | 'internet_pages';
}

const FREESOUND_API_KEY = '0rXaeUju5Q1wEJOviVPogf3bqo4gkNlsjgZG0CwR';

const callAi = async (model: string, contents: any, config: any) => {
    const response = await fetch('/api/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, contents, config })
    });
    if (!response.ok) throw new Error('AI API Error');
    return await response.json();
};

const AddSoundModal = ({ boardId, onClose }: { boardId: string, onClose: () => void }) => {
    const { dispatch } = useAppContext();
    const [name, setName] = useState('');
    const [files, setFiles] = useState<FileList | null>(null);
    const [fileUrl, setFileUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Añadiendo Sonido...');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'search' | 'upload' | 'drive' | 'url'>('search');
    const originalSpanishQuery = useRef('');

    // Multi-repository State
    const [repository, setRepository] = useState<'freesound' | 'pixabay' | 'openverse' | 'internet_pages'>('freesound');
    const [freesoundQuery, setFreesoundQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SoundItemSearchResult[]>([]);
    const [isFreesoundSearching, setIsFreesoundSearching] = useState(false);
    const [isNameGenerating, setIsNameGenerating] = useState(false);

    // Google Drive Integration States
    const [googleClientId, setGoogleClientId] = useState(() => localStorage.getItem('soundboard_google_client_id') || '');
    const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem('soundboard_google_api_key') || '');
    const [showDriveConfig, setShowDriveConfig] = useState(false);
    const [gToken, setGToken] = useState('');
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);

    // Continuous load & Drag and drop states
    const [addedSoundsList, setAddedSoundsList] = useState<{ id: string, name: string }[]>([]);
    const [successBanner, setSuccessBanner] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    
    // Load GIS and GAPI scripts on mount
    useEffect(() => {
        const loadScript = (src: string, id: string) => {
            if (document.getElementById(id)) return;
            const script = document.createElement('script');
            script.src = src;
            script.id = id;
            script.async = true;
            script.defer = true;
            document.body.appendChild(script);
        };
        loadScript('https://apis.google.com/js/api.js', 'gapi-client');
        loadScript('https://accounts.google.com/gsi/client', 'gis-client');
    }, []);
    
    useEffect(() => {
        const savedRepo = localStorage.getItem('soundboard_active_repository') as 'freesound' | 'pixabay' | 'openverse' | 'internet_pages';
        if (savedRepo && ['freesound', 'pixabay', 'openverse', 'internet_pages'].includes(savedRepo)) {
            setRepository(savedRepo);
        }
    }, []);

    const changeRepository = (repo: 'freesound' | 'pixabay' | 'openverse' | 'internet_pages') => {
        setRepository(repo);
        localStorage.setItem('soundboard_active_repository', repo);
        setSearchResults([]);
    };

    const resetInputs = (newTab: 'search' | 'upload' | 'drive' | 'url') => {
        setName('');
        setFiles(null);
        setFileUrl('');
        setError('');
        setFreesoundQuery('');
        setSearchResults([]);
        originalSpanishQuery.current = '';
        setSuccessBanner('');
        setActiveTab(newTab);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selectedFiles = e.target.files;
            setFiles(selectedFiles);
            if (selectedFiles.length === 1) {
                setName(selectedFiles[0].name.replace(/\.[^/.]+$/, ""));
            } else {
                setName(`(${selectedFiles.length} archivos)`); 
            }
        }
    };

    const handleSaveDriveConfig = (e: React.FormEvent) => {
        e.preventDefault();
        localStorage.setItem('soundboard_google_client_id', googleClientId.trim());
        localStorage.setItem('soundboard_google_api_key', googleApiKey.trim());
        setShowDriveConfig(false);
        setSuccessBanner("¡Credenciales de Google Drive guardadas localmente!");
    };

    const initGoogleAuthAndPicker = () => {
        if (!googleClientId || !googleApiKey) {
            setError("Por favor, configura tu Client ID y API Key de Google.");
            return;
        }

        setIsGoogleLoading(true);
        setError('');
        setSuccessBanner('');

        try {
            const gapi = (window as any).gapi;
            const google = (window as any).google;

            if (!gapi || !google) {
                throw new Error("Las librerías de Google no se han cargado todavía. Reintente en un momento.");
            }

            gapi.load('picker', {
                callback: () => {
                    const client = google.accounts.oauth2.initTokenClient({
                        client_id: googleClientId,
                        scope: 'https://www.googleapis.com/auth/drive.readonly',
                        callback: async (tokenResponse: any) => {
                            if (tokenResponse.error) {
                                setError(`Error de autenticación: ${tokenResponse.error}`);
                                setIsGoogleLoading(false);
                                return;
                            }
                            setGToken(tokenResponse.access_token);
                            createPicker(tokenResponse.access_token);
                        },
                    });
                    client.requestAccessToken({ prompt: 'consent' });
                }
            });
        } catch (e: any) {
            console.error("Error al iniciar Google Drive:", e);
            setError(e.message || "Fallo al iniciar el cliente de Google.");
            setIsGoogleLoading(false);
        }
    };

    const createPicker = (accessToken: string) => {
        const gapi = (window as any).gapi;
        const google = (window as any).google;

        try {
            const view = new google.picker.DocsView()
                .setMimeTypes('audio/*')
                .setMode(google.picker.DocsViewMode.GRID);

            const picker = new google.picker.PickerBuilder()
                .enableFeature(google.picker.Feature.NAV_HIDDEN)
                .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
                .setDeveloperKey(googleApiKey)
                .setAppId(googleClientId)
                .setOAuthToken(accessToken)
                .addView(view)
                .addView(new google.picker.DocsView(google.picker.ViewId.FOLDERS).setSelectFolderEnabled(true))
                .setCallback(async (data: any) => {
                    if (data.action === google.picker.Action.PICKED) {
                        const docs = data.docs;
                        setIsLoading(true);
                        setLoadingMessage("Descargando archivo(s) de Google Drive...");
                        setError('');

                        try {
                            let count = 0;
                            for (const doc of docs) {
                                count++;
                                const fileId = doc.id;
                                const fileName = doc.name.replace(/\.[^/.]+$/, "");
                                
                                setLoadingMessage(`Descargando ${count} de ${docs.length}: ${doc.name}`);

                                const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
                                const response = await fetch(downloadUrl, {
                                    headers: {
                                        'Authorization': `Bearer ${accessToken}`
                                    }
                                });

                                if (!response.ok) {
                                    throw new Error(`Fallo al descargar ${doc.name} de Drive: ${response.statusText}`);
                                }

                                const blob = await response.blob();
                                await processAndAddSound(blob, fileName, count - 1);
                                setAddedSoundsList(prev => [...prev, { id: `sound_drive_${Date.now()}_${count}`, name: fileName }]);
                            }
                            setSuccessBanner(`¡Importados con éxito ${docs.length} sonido(s) desde Google Drive!`);
                        } catch (err: any) {
                            console.error("Error al importar de Drive:", err);
                            setError(`Error al importar de Google Drive: ${err.message}`);
                        } finally {
                            setIsLoading(false);
                            setIsGoogleLoading(false);
                        }
                    } else if (data.action === google.picker.Action.CANCEL) {
                        setIsGoogleLoading(false);
                    }
                })
                .build();
            picker.setVisible(true);
        } catch (e: any) {
            console.error("Error al construir Google Picker:", e);
            setError(`Fallo al abrir el selector: ${e.message}`);
            setIsGoogleLoading(false);
        }
    };
    
    const performFreesoundSearch = async (query: string): Promise<SoundItemSearchResult[]> => {
        const customToken = localStorage.getItem('soundboard_freesound_key') || '';
        try {
            const response = await fetch(`/api/freesound-search?query=${encodeURIComponent(query)}&customToken=${encodeURIComponent(customToken)}`);
            const responseText = await response.text();

            if (!response.ok) {
                let errorDetail = response.statusText;
                try { 
                    const parsedError = JSON.parse(responseText) as { detail?: string };
                    if (parsedError && typeof parsedError.detail === 'string') {
                        errorDetail = parsedError.detail;
                    }
                } catch (e) {}
                throw new Error(errorDetail);
            }
            
            const data = JSON.parse(responseText) as { results?: FreesoundResult[] };
            if (!data || !Array.isArray(data.results)) {
                throw new Error('La respuesta de Freesound no tiene el formato esperado.');
            }

            const cleanResults = (data.results as FreesoundResult[]).filter(r => r.previews && r.previews['preview-hq-mp3']);
            return cleanResults.map(r => ({
                id: `fs_${r.id}`,
                name: r.name,
                duration: r.duration,
                username: r.username,
                previewUrl: r.previews['preview-hq-mp3'],
                source: 'freesound'
            }));
        } catch (serverError: any) {
            console.warn("Fallo con el proxy del servidor, intentando proxies CORS externos:", serverError);
            
            const actualToken = customToken || FREESOUND_API_KEY;
            const fields = 'id,name,previews,duration,username,tags';
            const baseUrl = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}&token=${actualToken}&fields=${fields}&format=json&_=${Date.now()}`;
            
            const proxies = [
                `https://corsproxy.io/?${encodeURIComponent(baseUrl)}`,
                `https://api.allorigins.win/raw?url=${encodeURIComponent(baseUrl)}`
            ];

            let lastError = serverError;
            for (const url of proxies) {
                try {
                    const response = await fetch(url);
                    const responseText = await response.text();

                    if (!response.ok) {
                        let errorDetail = response.statusText;
                        try { 
                            const parsedError = JSON.parse(responseText) as { detail?: string };
                            if (parsedError && typeof parsedError.detail === 'string') {
                                errorDetail = parsedError.detail;
                            }
                        } catch (e) {}
                        throw new Error(errorDetail);
                    }
                    
                    const data = JSON.parse(responseText) as { results?: FreesoundResult[] };
                    if (!data || !Array.isArray(data.results)) {
                        throw new Error('La respuesta de Freesound no tiene el formato esperado.');
                    }

                    const cleanResults = (data.results as FreesoundResult[]).filter(r => r.previews && r.previews['preview-hq-mp3']);
                    return cleanResults.map(r => ({
                        id: `fs_${r.id}`,
                        name: r.name,
                        duration: r.duration,
                        username: r.username,
                        previewUrl: r.previews['preview-hq-mp3'],
                        source: 'freesound'
                    }));
                } catch (e) {
                    lastError = e;
                    console.warn(`Fallo con el proxy ${url}:`, e);
                    continue; // Try next proxy
                }
            }
            
            throw lastError || new Error('Fallo al conectar con Freesound a través de todos los proxies.');
        }
    };

    const performPixabaySearch = async (query: string): Promise<SoundItemSearchResult[]> => {
        const userKey = localStorage.getItem('soundboard_pixabay_key') || '';
        const response = await fetch(`/api/pixabay-search?query=${encodeURIComponent(query)}&userKey=${encodeURIComponent(userKey)}`);
        const responseText = await response.text();

        if (!response.ok) {
            let errorDetail = response.statusText;
            try { 
                const parsedError = JSON.parse(responseText) as { error?: string, detail?: string };
                if (parsedError && typeof parsedError.error === 'string') {
                    errorDetail = parsedError.error;
                } else if (parsedError && typeof parsedError.detail === 'string') {
                    errorDetail = parsedError.detail;
                }
            } catch (e) {}
            throw new Error(errorDetail || 'Error de búsqueda en Pixabay. Verifica que tu API key esté configurada correctamente.');
        }

        const data = JSON.parse(responseText);
        if (!data || !Array.isArray(data.hits)) {
            return [];
        }

        return data.hits.map((hit: any) => ({
            id: `pb_${hit.id}`,
            name: hit.tags ? hit.tags.split(',')[0].trim() : `Sonido Pixabay ${hit.id}`,
            duration: hit.duration || 0,
            username: hit.user || 'Pixabay',
            previewUrl: hit.audio,
            source: 'pixabay'
        }));
    };

    const performOpenverseSearch = async (query: string): Promise<SoundItemSearchResult[]> => {
        const response = await fetch(`/api/openverse-search?query=${encodeURIComponent(query)}`);
        const responseText = await response.text();

        if (!response.ok) {
            let errorDetail = response.statusText;
            try { 
                const parsedError = JSON.parse(responseText) as { error?: string };
                if (parsedError && typeof parsedError.error === 'string') {
                    errorDetail = parsedError.error;
                }
            } catch (e) {}
            throw new Error(errorDetail || 'Error al conectar con el servidor de Openverse.');
        }

        const data = JSON.parse(responseText);
        if (!data || !Array.isArray(data.results)) {
            return [];
        }

        return data.results.map((r: any) => ({
            id: `ov_${r.id}`,
            name: r.title || 'Sonido Creative Commons',
            duration: r.duration ? (r.duration > 15000 ? Math.round(r.duration / 1000) : Math.round(r.duration)) : 0,
            username: r.creator || 'Openverse',
            previewUrl: r.preview_url,
            source: 'openverse'
        })).filter((item: any) => item.previewUrl);
    };

    const performInternetPagesSearch = async (query: string): Promise<SoundItemSearchResult[]> => {
        const response = await fetch(`/api/internet-pages-search?query=${encodeURIComponent(query)}`);
        const responseText = await response.text();

        if (!response.ok) {
            let errorDetail = response.statusText;
            try { 
                const parsedError = JSON.parse(responseText) as { error?: string };
                if (parsedError && typeof parsedError.error === 'string') {
                    errorDetail = parsedError.error;
                }
            } catch (e) {}
            throw new Error(errorDetail || 'Error al conectar con la búsqueda de sonidos de internet.');
        }

        const data = JSON.parse(responseText) as { results?: any[] };
        if (!data || !Array.isArray(data.results)) {
            return [];
        }

        return data.results.map((r: any, idx: number) => ({
            id: `ip_${Date.now()}_${idx}`,
            name: r.name || 'Sonido de Internet',
            duration: typeof r.duration === 'number' ? r.duration : 0,
            username: r.username || 'Página Web',
            previewUrl: r.previewUrl,
            source: 'internet_pages' as const
        })).filter((item: any) => item.previewUrl);
    };

    const handleFreesoundSearch = async () => {
        if (!freesoundQuery) return;
        
        originalSpanishQuery.current = freesoundQuery;
        setIsFreesoundSearching(true);
        setError('');
        setSearchResults([]);
        setLoadingMessage('Traduciendo...');

        let englishQuery = freesoundQuery;
        try {
            // Only translate if not searching general internet pages (since internet search handles Spanish perfectly)
            if (repository !== 'internet_pages') {
                const { text: translationText } = await callAi('gemini-3.5-flash', 
                    `Translate the following sound effect search query to a concise, effective English query for a sound library. Spanish query: '${freesoundQuery}'`,
                    {
                        responseMimeType: "application/json",
                        responseSchema: { type: "OBJECT" as any, properties: { englishQuery: { type: "STRING" as any } } }
                    }
                );
                const translationData = JSON.parse(translationText.trim()) as { englishQuery?: string };
                if (translationData && typeof translationData.englishQuery === 'string') {
                    englishQuery = translationData.englishQuery;
                }
            }
        } catch (translationError) {
            console.warn("Fallo en la traducción con IA, usando consulta original:", translationError);
            // Fallback to original query
        }

        const fetchByRepo = async (q: string) => {
            if (repository === 'freesound') return await performFreesoundSearch(q);
            if (repository === 'pixabay') return await performPixabaySearch(q);
            if (repository === 'openverse') return await performOpenverseSearch(q);
            return await performInternetPagesSearch(q);
        };

        try {
            // 2. Initial Search
            const repoDisplay = repository === 'freesound' ? 'Freesound' : repository === 'pixabay' ? 'Pixabay' : repository === 'openverse' ? 'Openverse' : 'Páginas de Internet';
            setLoadingMessage(`Buscando en ${repoDisplay} "${englishQuery}"...`);
            let results = await fetchByRepo(englishQuery);

            // 3. Retry if no results
            if (results.length === 0) {
                setLoadingMessage("Ajustando búsqueda...");
                const { text: relaxedQueryText } = await callAi('gemini-3.5-flash', 
                    `The search for '${englishQuery}' on a sound library returned no results. Provide a simpler, broader English query based on the original Spanish intent: '${freesoundQuery}'`,
                    {
                          responseMimeType: "application/json",
                          responseSchema: { type: "OBJECT" as any, properties: { englishQuery: { type: "STRING" as any } } }
                    }
                );
                const relaxedQueryData = JSON.parse(relaxedQueryText.trim()) as { englishQuery?: string };
                const relaxedQuery = (relaxedQueryData && typeof relaxedQueryData.englishQuery === 'string') ? relaxedQueryData.englishQuery : englishQuery;

                setLoadingMessage(`Buscando "${relaxedQuery}"...`);
                results = await fetchByRepo(relaxedQuery);
            }
            
            if (results.length === 0) {
                setError('No se encontraron resultados en el repositorio actual.');
            }
            setSearchResults(results);

        } catch (e: any) {
            console.error("Búsqueda fallida:", e);
            setError(`La búsqueda falló: ${e.message}`);
            setSearchResults([]);
        } finally {
            setIsFreesoundSearching(false);
        }
    };

    const handleSelectFreesoundResult = async (result: SoundItemSearchResult) => {
        setIsNameGenerating(true);
        setFileUrl(result.previewUrl);
        setFiles(null);
        setName(`Generando nombre...`);

        try {
             const { text: nameText } = await callAi('gemini-3.5-flash', 
                `Original Spanish search query was: '${originalSpanishQuery.current}'. The found sound file is named: '${result.name}'. Generate a concise, descriptive name in Spanish that captures the essence of the sound.`,
                {
                    responseMimeType: "application/json",
                    responseSchema: { type: "OBJECT" as any, properties: { newName: { type: "STRING" as any, description: "The new descriptive name in Spanish."} } }
                }
            );
            const nameResultData = JSON.parse(nameText.trim()) as { newName?: string };
            const newName = (nameResultData && typeof nameResultData.newName === 'string') ? nameResultData.newName : null;

            if (newName) {
                setName(newName);
            } else {
                throw new Error("Respuesta de IA inválida para generar nombre.");
            }
        } catch (e) {
            console.error("Fallo al generar el nombre, usando el original.", e);
            setName(result.name); // Fallback to original name
        } finally {
            setIsNameGenerating(false);
        }
    };

    const processAndAddSound = async (soundBlob: Blob, soundName: string, index: number = 0) => {
        const arrayBuffer = await soundBlob.arrayBuffer();
        const audioSourceId = await calculateHash(arrayBuffer);
        
        await audioDB.set(audioSourceId, soundBlob);
        
        const context = getAudioContext();
        const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0)); // Use slice to create a copy
        const duration = audioBuffer.duration;

        const newSound: Sound = {
            id: `sound_${Date.now()}_${index}`,
            name: soundName.trim(),
            audioSourceId: audioSourceId,
            color: colors[Math.floor(Math.random() * colors.length)],
            imageId: null,
            volume: DEFAULT_VOLUME,
            pitch: DEFAULT_PITCH,
            pan: DEFAULT_PAN,
            loop: false,
            retriggerable: false,
            crossfade: DEFAULT_CROSSFADE,
            fadeIn: 0.1,
            fadeOut: 0.1,
            fadeInType: 'linear',
            fadeOutType: 'linear',
            startTime: 0,
            endTime: duration,
            reverb: 0,
            delayTime: 0,
            delayFeedback: 0,
            eqEnabled: false,
            eqPreamp: PREAMP_DEFAULT,
            eqBands: [...EQ_BAND_DEFAULTS],
            stopActions: [],
            playCount: 0,
        };

        dispatch({ type: 'ADD_SOUND', payload: { boardId, sound: newSound } });
        dispatch({ type: 'SET_AUDIO_SOURCE', payload: { sourceId: audioSourceId, buffer: audioBuffer } }); // Pre-cache the buffer
    };

    const handleAddSound = async () => {
        const isFileMode = files && files.length > 0;
        const isUrlMode = fileUrl.trim() !== '';

        if (!isFileMode && !isUrlMode) {
            setError("Se requiere un archivo o una URL.");
            return;
        }
        if (!name.trim()) {
            setError("Se requiere un nombre para el sonido.");
            return;
        }

        setIsLoading(true);
        setError('');
        
        try {
            if (isFileMode) {
                // Handle a single ZIP file
                if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
                    setLoadingMessage('Descomprimiendo archivo...');
                    const zipFile = files[0];
                    const JSZip = (window as any).JSZip;
                    const zip = await JSZip.loadAsync(zipFile);

                    const audioFiles: any[] = [];
                    zip.forEach((relativePath: string, zipEntry: any) => {
                        if (!zipEntry.dir && /\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(zipEntry.name)) {
                            audioFiles.push(zipEntry);
                        }
                    });

                    if (audioFiles.length === 0) {
                        throw new Error("No se encontraron archivos de audio válidos en el archivo ZIP.");
                    }

                    let count = 0;
                    for (const audioEntry of audioFiles) {
                        count++;
                        const fileName = (audioEntry as { name: string }).name.split('/').pop();
                        setLoadingMessage(`Procesando ${count} de ${audioFiles.length} (${fileName})...`);
                        const soundBlob = await audioEntry.async('blob');
                        const soundName = (fileName || '').replace(/\.[^/.]+$/, "");
                        await processAndAddSound(soundBlob, soundName, count - 1);
                        setAddedSoundsList(prev => [...prev, { id: `sound_zip_${Date.now()}_${count}`, name: soundName }]);
                    }
                    setSuccessBanner(`¡Importados con éxito ${audioFiles.length} sonidos desde ZIP!`);
                } else { // Handle one or more audio files
                    let count = 0;
                    const audioFilesOnly = Array.from(files!).filter((file: File) => !file.name.toLowerCase().endsWith('.zip'));
                    
                    if (audioFilesOnly.length < files!.length) {
                        console.warn("Se omitieron los archivos ZIP al subir varios archivos. Sube los ZIPs de uno en uno.");
                    }

                    for (const file of audioFilesOnly as File[]) {
                        count++;
                        setLoadingMessage(`Procesando ${count} de ${audioFilesOnly.length}: ${file.name}`);
                        const soundName = files.length > 1 ? file.name.replace(/\.[^/.]+$/, "") : name.trim();
                        await processAndAddSound(file, soundName, count - 1);
                        setAddedSoundsList(prev => [...prev, { id: `sound_local_${Date.now()}_${count}`, name: soundName }]);
                    }
                    setSuccessBanner(`¡Añadido(s) con éxito ${audioFilesOnly.length} sonido(s) local(es)!`);
                }
            } else if (isUrlMode) {
                setLoadingMessage('Descargando audio...');
                
                const sanitizeAudioUrl = (urlStr: string): string => {
                    let cleanUrl = urlStr.trim();
                    const gdMatch = cleanUrl.match(/(?:https?:\/\/)?(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=|uc\?export=download&id=)([a-zA-Z0-9_-]{25,50})/);
                    if (gdMatch && gdMatch[1]) {
                        return `https://docs.google.com/uc?export=download&id=${gdMatch[1]}`;
                    }
                    if (cleanUrl.includes('dropbox.com')) {
                        return cleanUrl.replace('?dl=0', '?dl=1').replace('&dl=0', '&dl=1');
                    }
                    return cleanUrl;
                };

                const directUrl = sanitizeAudioUrl(fileUrl);
                let response;
                try {
                    response = await fetch(`/api/proxy?url=${encodeURIComponent(directUrl)}`);
                    if (!response.ok) throw new Error("Server proxy failed");
                } catch (proxyError) {
                    console.warn("Fallo con el proxy del servidor, intentando proxy CORS externo:", proxyError);
                    response = await fetch(`https://corsproxy.io/?${encodeURIComponent(directUrl)}`);
                    if (!response.ok) throw new Error(`Fallo al obtener de la URL: ${response.statusText}`);
                }
                
                const soundBlob = await response.blob();
                
                if (soundBlob.type && (soundBlob.type.includes('html') || soundBlob.type.includes('text/plain') || soundBlob.type.includes('xml'))) {
                    throw new Error("El enlace proporcionado apunta a una página web o visor, no a un archivo de audio real.");
                }
                
                await processAndAddSound(soundBlob, name.trim());
                setAddedSoundsList(prev => [...prev, { id: `sound_url_${Date.now()}`, name: name.trim() }]);
                setSuccessBanner(`¡Sonido "${name}" añadido con éxito desde URL!`);
            }

            // Limpiar inputs
            setName('');
            setFiles(null);
            setFileUrl('');
            
            const fileInput = document.getElementById('local-file-input') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
        } catch (err: any) {
            console.error("Error añadiendo sonido(s):", err);
            let friendlyError = err.message;
            if (String(err).toLowerCase().includes('decode')) {
                friendlyError = "No se pudo decodificar el archivo de audio. Verifique que sea un formato de audio soportado y no esté dañado.";
            }
            setError(`Fallo al añadir sonido. ${friendlyError}`);
        } finally {
            setIsLoading(false);
        }
    };

    const footer = (
        <div className="flex justify-between items-center w-full">
            <div className="text-xs text-gray-400 font-sans font-semibold">
                {addedSoundsList.length > 0 && `Sesión: ${addedSoundsList.length} sonido(s) añadido(s)`}
            </div>
            <div className="flex">
                <button onClick={onClose} className="bg-gray-650 hover:bg-gray-700 text-white font-bold py-2 px-5 rounded mr-2 transition-colors cursor-pointer text-sm font-sans">
                    {addedSoundsList.length > 0 ? 'Listo / Cerrar' : 'Cancelar'}
                </button>
                {activeTab !== 'drive' && (
                    <button onClick={handleAddSound} disabled={isLoading || isNameGenerating} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-5 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center w-40 transition-colors cursor-pointer text-sm font-sans shadow-md shadow-indigo-600/10">
                        {isLoading ? <><div className="spinner mr-2"></div><span>Añadiendo...</span></> : 'Añadir Sonido'}
                    </button>
                )}
            </div>
        </div>
    );
    
    return (
        <Modal title="Añadir Nuevo Sonido" onClose={onClose} footer={footer} size="5xl">
            <div className="flex flex-col md:flex-row gap-6 text-gray-200">
                {/* Columna de Carga / Búsqueda */}
                <div className="flex-grow min-w-0 space-y-5">
                    {successBanner && (
                        <div className="bg-green-950/40 text-green-300 border border-green-900/50 p-3 rounded-md text-xs font-semibold animate-fade-in font-sans flex items-center justify-between">
                            <span>✅ {successBanner}</span>
                            <button onClick={() => setSuccessBanner('')} className="text-green-400 hover:text-green-200 ml-2 font-bold font-sans">✕</button>
                        </div>
                    )}

                    {activeTab !== 'drive' && (
                         <InputControl
                            label="Nombre del Sonido"
                            placeholder="Nombre del Sonido (se autocompletará)"
                            value={name}
                            onChange={setName}
                            disabled={isNameGenerating}
                         />
                    )}

                    <div className="flex border-b border-gray-700 overflow-x-auto scrollbar-none">
                        <button onClick={() => resetInputs('search')} className={`py-2 px-4 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${activeTab === 'search' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white border-b-2 border-transparent'}`}>Buscar en Biblioteca</button>
                        <button onClick={() => resetInputs('upload')} className={`py-2 px-4 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${activeTab === 'upload' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white border-b-2 border-transparent'}`}>Subir Archivo</button>
                        <button onClick={() => resetInputs('drive')} className={`py-2 px-4 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${activeTab === 'drive' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white border-b-2 border-transparent'}`}>Google Drive 🌐</button>
                        <button onClick={() => resetInputs('url')} className={`py-2 px-4 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${activeTab === 'url' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white border-b-2 border-transparent'}`}>Desde URL</button>
                    </div>
                    
                    <div className="pt-2">
                        {activeTab === 'search' && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                    <div className="w-full sm:w-1/3 text-left">
                                        <label className="block text-xs font-semibold text-gray-450 uppercase tracking-wider mb-2">Repositorio</label>
                                        <select 
                                            value={repository} 
                                            onChange={(e) => changeRepository(e.target.value as 'freesound' | 'pixabay' | 'openverse' | 'internet_pages')} 
                                            className="w-full h-10 bg-gray-800 border border-gray-700 text-white rounded px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm cursor-pointer font-sans"
                                        >
                                            <option value="freesound">🌐 Freesound.org</option>
                                            <option value="pixabay">🎭 Pixabay (Efectos y Música)</option>
                                            <option value="openverse">🔓 Openverse (Creative Commons)</option>
                                            <option value="internet_pages">🔍 Páginas de Internet (Buscar Webs)</option>
                                        </select>
                                    </div>
                                    <div className="flex-grow text-left">
                                        <InputControl
                                            label="Búsqueda de Sonidos"
                                            placeholder={
                                                repository === 'freesound' 
                                                    ? "ej: 'viento de tormenta', 'vidrio roto'..." 
                                                    : repository === 'pixabay' 
                                                        ? "ej: 'música incidental', 'campanada de reloj'..." 
                                                        : repository === 'openverse'
                                                            ? "ej: 'oleaje de mar', 'gaviota CC'..."
                                                            : "ej: 'descargar sonido de trueno mp3', 'ambiente de lluvia wav'..."
                                            }
                                            value={freesoundQuery}
                                            onChange={setFreesoundQuery}
                                            onSubmit={handleFreesoundSearch}
                                            disabled={isFreesoundSearching}
                                        />
                                    </div>
                                    <button onClick={handleFreesoundSearch} disabled={isFreesoundSearching || !freesoundQuery} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center h-10 w-44 transition-colors cursor-pointer text-sm shadow-md shadow-indigo-600/10">
                                        {isFreesoundSearching ? <><div className="spinner mr-2"></div><span>Buscando...</span></> : 'Buscar con IA'}
                                    </button>
                                </div>
                                
                                {searchResults.length > 0 && (
                                    <div className="bg-gray-900/80 border border-gray-750 p-2 rounded max-h-64 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                                        {searchResults.map(result => (
                                            <div key={result.id} className="p-3 hover:bg-gray-800 rounded text-sm transition-colors border border-gray-800/80 bg-gray-900/40 animate-fade-in">
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex-grow text-left">
                                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                            <strong className="text-indigo-400 truncate max-w-xs block font-sans" title={result.name}>{result.name}</strong>
                                                            <span className={`text-[9px] uppercase font-extrabold tracking-wider px-1.5 py-0.5 rounded ${
                                                                result.source === 'freesound' 
                                                                    ? 'bg-blue-900/40 text-blue-300 border border-blue-800/50' 
                                                                    : result.source === 'pixabay' 
                                                                        ? 'bg-pink-900/40 text-pink-300 border border-pink-800/50' 
                                                                        : result.source === 'openverse'
                                                                            ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/50'
                                                                            : 'bg-purple-900/40 text-purple-300 border border-purple-800/50'
                                                            }`}>
                                                                {result.source === 'internet_pages' ? 'web' : result.source}
                                                            </span>
                                                        </div>
                                                        <span className="text-xs text-gray-500 font-sans">por {result.username} / {result.duration ? `${Math.round(result.duration)}s` : 'Desconocido'}</span>
                                                    </div>
                                                    <button onClick={() => handleSelectFreesoundResult(result)} className="text-xs font-semibold text-white bg-green-600 hover:bg-green-700 px-3 py-1 rounded-md transition-colors flex-shrink-0 cursor-pointer">
                                                        Seleccionar
                                                    </button>
                                                </div>
                                                <audio controls src={result.previewUrl} className="w-full mt-2 h-7" preload="none"></audio>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'upload' && (
                            <div 
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setIsDragging(false);
                                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                        setFiles(e.dataTransfer.files);
                                        if (e.dataTransfer.files.length === 1) {
                                            setName(e.dataTransfer.files[0].name.replace(/\.[^/.]+$/, ""));
                                        } else {
                                            setName(`(${e.dataTransfer.files.length} archivos)`);
                                        }
                                    }
                                }}
                                className={`text-center p-8 border-2 border-dashed rounded-lg animate-fade-in transition-all flex flex-col items-center justify-center min-h-[180px] cursor-pointer ${
                                    isDragging 
                                        ? 'border-indigo-400 bg-indigo-950/20 scale-[1.01] shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                                        : 'border-gray-700 hover:border-gray-500 bg-gray-900/30'
                                }`}
                                onClick={() => document.getElementById('local-file-input')?.click()}
                            >
                                <span className="text-4xl mb-3">📥</span>
                                <span className="text-sm font-semibold text-gray-200 mb-1 font-sans">
                                    Arrastra tus archivos de audio o ZIP aquí
                                </span>
                                <span className="text-xs text-gray-500 font-sans mb-3">
                                    o haz clic para explorar los archivos de tu dispositivo
                                </span>
                                <input id="local-file-input" type="file" accept="audio/*,.zip" onChange={handleFileChange} className="hidden" multiple />
                                {files && (
                                    <p className="text-green-400 text-xs font-semibold mt-2 bg-green-950/40 px-3 py-1.5 rounded border border-green-900/50 animate-fade-in font-sans">
                                        {files.length === 1 
                                            ? `📂 Listo para subir: ${files[0].name}`
                                            : `📂 Listos para subir: ${files.length} archivos`
                                        }
                                    </p>
                                )}
                            </div>
                        )}
                        
                        {activeTab === 'drive' && (
                            <div className="space-y-4 animate-fade-in text-left">
                                {showDriveConfig ? (
                                    <form onSubmit={handleSaveDriveConfig} className="bg-gray-800/40 p-4 rounded border border-gray-700 space-y-4 font-sans text-xs">
                                        <h4 className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider">Configurar Credenciales de Google API</h4>
                                        <p className="text-[11px] text-gray-405 leading-relaxed">
                                            Para usar la integración real de Google Drive, necesitas ingresar tu Client ID y API Key (Developer Key). 
                                            Se guardan exclusivamente en el almacenamiento local de tu navegador (`localStorage`).
                                        </p>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Google Client ID</label>
                                                <input 
                                                    type="text" 
                                                    value={googleClientId} 
                                                    onChange={e => setGoogleClientId(e.target.value)} 
                                                    className="w-full bg-gray-900 text-white p-2.5 rounded border border-gray-700 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" 
                                                    required 
                                                    placeholder="12345678-abcdef.apps.googleusercontent.com"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Google API Key</label>
                                                <input 
                                                    type="password" 
                                                    value={googleApiKey} 
                                                    onChange={e => setGoogleApiKey(e.target.value)} 
                                                    className="w-full bg-gray-900 text-white p-2.5 rounded border border-gray-700 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono" 
                                                    required
                                                    placeholder="AIzaSy..."
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2 pt-2">
                                            <button type="button" onClick={() => setShowDriveConfig(false)} className="bg-gray-750 hover:bg-gray-700 text-white text-xs px-3 py-1.5 rounded cursor-pointer transition-colors border border-gray-700">Cancelar</button>
                                            <button type="submit" className="bg-indigo-650 hover:bg-indigo-600 text-white text-xs px-4 py-1.5 rounded font-bold cursor-pointer transition-colors">Guardar Claves</button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="bg-gray-900/40 p-6 rounded border border-gray-800 text-center flex flex-col items-center justify-center min-h-[200px]">
                                        <span className="text-4xl mb-3">📂</span>
                                        <h4 className="text-sm font-semibold text-gray-200 mb-1 font-sans">Importación Real desde Google Drive</h4>
                                        <p className="text-xs text-gray-450 mb-5 font-sans max-w-md leading-relaxed">
                                            Autentícate con OAuth2 de Google para navegar en tus carpetas personales de Drive y seleccionar fíltrando archivos de audio.
                                        </p>
                                        
                                        {googleClientId && googleApiKey ? (
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={initGoogleAuthAndPicker} 
                                                    disabled={isGoogleLoading}
                                                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-5 rounded transition-colors text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/10"
                                                >
                                                    {isGoogleLoading ? <div className="spinner w-4 h-4"></div> : '🔍 Seleccionar Archivos en Google Drive'}
                                                </button>
                                                <button 
                                                    onClick={() => setShowDriveConfig(true)}
                                                    className="bg-gray-800 hover:bg-gray-750 text-gray-300 font-medium py-2 px-4 rounded text-xs border border-gray-750 cursor-pointer transition-colors"
                                                >
                                                    Ajustar Claves
                                                </button>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => setShowDriveConfig(true)}
                                                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-6 rounded transition-colors text-xs cursor-pointer shadow-md shadow-indigo-600/10"
                                            >
                                                ⚙️ Configurar Credenciales de Google API
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {activeTab === 'url' && (
                             <div className="animate-fade-in text-left space-y-2">
                                <label className="block text-xs font-semibold text-gray-450 uppercase tracking-wider">Enlace Directo</label>
                                <input type="text" placeholder="Pegar URL de Audio (ej: https://ejemplo.com/sonido.mp3)" value={fileUrl} onChange={e => setFileUrl(e.target.value)} className="w-full bg-gray-800 text-white p-2.5 rounded border border-gray-700 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono" />
                                <p className="text-[11px] text-gray-500 font-sans">Asegúrate de que sea un enlace directo al archivo de audio (ej: .mp3, .wav), no a una página web o visor de Drive.</p>
                             </div>
                        )}
                    </div>
                    
                    {error && <p className="text-red-400 text-xs font-semibold mt-4 text-center bg-red-950/40 p-2 rounded border border-red-900/50 animate-fade-in font-sans">{error}</p>}
                    {isLoading && <p className="text-blue-300 text-xs font-medium mt-4 text-center bg-blue-950/40 p-2.5 rounded border border-blue-900/50 animate-pulse font-sans flex items-center justify-center gap-2"><span>🔄</span> {loadingMessage}</p>}
                </div>

                {/* Columna Derecha: Historial de la Sesión (Carga Continua) */}
                {addedSoundsList.length > 0 && (
                    <div className="w-full md:w-64 bg-gray-900/50 border border-gray-750 rounded-lg p-4 flex flex-col max-h-[350px] md:max-h-none animate-fade-in flex-shrink-0 text-left">
                        <h3 className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider border-b border-gray-700 pb-2 mb-3 flex items-center gap-1.5">
                            <span>📋</span> Añadidos en esta sesión
                        </h3>
                        <div className="flex-grow overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                            {addedSoundsList.map((sound, i) => (
                                <div key={sound.id} className="p-2 rounded bg-gray-800/40 border border-gray-850 text-xs flex items-center justify-between gap-2 animate-fade-in hover:bg-gray-800/80 transition-colors">
                                    <span className="text-gray-300 font-semibold font-sans truncate" title={sound.name}>
                                        {i + 1}. {sound.name}
                                    </span>
                                    <span className="text-[9px] font-bold text-green-400 uppercase bg-green-950/50 px-1.5 py-0.5 rounded border border-green-900/30">OK</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default AddSoundModal;
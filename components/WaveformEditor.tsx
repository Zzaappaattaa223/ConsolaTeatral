import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Sound } from '../types';

type PreviewStatus = 'stopped' | 'playing' | 'paused';

const WaveformEditor = ({ sound, buffer, onUpdate, status, playbackTime, onSeek }: { 
    sound: Sound, 
    buffer: AudioBuffer, 
    onUpdate: (updates: Partial<Pick<Sound, 'startTime' | 'endTime' | 'fadeIn' | 'fadeOut'>>) => void,
    status: PreviewStatus,
    playbackTime: number,
    onSeek: (newTime: number) => void,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [dragInfo, setDragInfo] = useState<{
        target: 'startTime' | 'endTime' | 'fadeIn' | 'fadeOut';
        initialClientX: number;
        initialStart: number;
        initialEnd: number;
        initialFadeIn: number;
        initialFadeOut: number;
    } | null>(null);
    const [tooltip, setTooltip] = useState<{ x: number; time: string } | null>(null);
    const [zoomRange, setZoomRange] = useState<{ start: number, end: number } | null>(null);
    const zoomTimeoutRef = useRef<number | null>(null);
    const duration = buffer.duration;

    const timeToX = useCallback((time: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return 0;
        const currentRange = zoomRange || { start: 0, end: duration };
        const rangeDuration = currentRange.end - currentRange.start;
        if (rangeDuration <= 0) return 0;
        const relativeTime = Math.max(0, Math.min(rangeDuration, time - currentRange.start));
        return (relativeTime / rangeDuration) * canvas.width;
    }, [zoomRange, duration]);

    const xToTime = useCallback((x: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return 0;
        const currentRange = zoomRange || { start: 0, end: duration };
        const rangeDuration = currentRange.end - currentRange.start;
        return (x / canvas.width) * rangeDuration + currentRange.start;
    }, [zoomRange, duration]);

    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !offscreenCanvasRef.current || duration <= 0) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        
        // 1. Clear and draw the appropriate (zoomed or full) waveform background
        ctx.clearRect(0, 0, width, height);
        const sourceCanvas = offscreenCanvasRef.current;
        const sourceWidth = sourceCanvas.width;
        const currentRange = zoomRange || { start: 0, end: duration };
        
        const sx = (currentRange.start / duration) * sourceWidth;
        const sWidth = ((currentRange.end - currentRange.start) / duration) * sourceWidth;
        
        if (sWidth > 0) {
            ctx.drawImage(sourceCanvas, sx, 0, sWidth, sourceCanvas.height, 0, 0, width, height);
        }

        // 2. Draw dynamic elements over the new background
        const soundEndTime = sound.endTime ?? duration;
        const startX = timeToX(sound.startTime);
        const endX = timeToX(soundEndTime);

        ctx.fillStyle = 'rgba(74, 222, 128, 0.15)'; // emerald-400 transparent
        ctx.fillRect(startX, 0, endX - startX, height);
        
        if (sound.fadeIn > 0) {
            const fadeInX = timeToX(sound.startTime + sound.fadeIn);
            const fadeInGradient = ctx.createLinearGradient(startX, 0, Math.min(fadeInX, endX), 0);
            fadeInGradient.addColorStop(0, 'rgba(167, 139, 250, 0.6)');
            fadeInGradient.addColorStop(1, 'rgba(167, 139, 250, 0)');
            ctx.fillStyle = fadeInGradient;
            ctx.fillRect(startX, 0, Math.min(fadeInX, endX) - startX, height);
        }
        if (sound.fadeOut > 0) {
            const fadeOutX = timeToX(soundEndTime - sound.fadeOut);
            const fadeOutGradient = ctx.createLinearGradient(Math.max(fadeOutX, startX), 0, endX, 0);
            fadeOutGradient.addColorStop(0, 'rgba(167, 139, 250, 0)');
            fadeOutGradient.addColorStop(1, 'rgba(167, 139, 250, 0.6)');
            ctx.fillStyle = fadeOutGradient;
            ctx.fillRect(Math.max(fadeOutX, startX), 0, endX - Math.max(fadeOutX, startX), height);
        }
        
        const drawHandle = (x: number, color: string) => {
            ctx.fillStyle = color;
            ctx.fillRect(x - 1.5, 0, 3, height);
            ctx.beginPath();
            ctx.moveTo(x, 0); ctx.lineTo(x-6, 10); ctx.lineTo(x+6, 10); ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x, height); ctx.lineTo(x-6, height-10); ctx.lineTo(x+6, height-10); ctx.closePath();
            ctx.fill();
        };
        drawHandle(startX, '#34d399'); // emerald-400
        drawHandle(endX, '#f87171');   // red-400

        const drawFadeHandle = (x: number, color: string) => {
            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([6, 6]);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.8;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = color;
            const handleSize = 10; const handleWidth = handleSize / 1.4;
            ctx.beginPath();
            ctx.moveTo(x, 0); ctx.lineTo(x - handleWidth, handleSize); ctx.lineTo(x + handleWidth, handleSize);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x, height); ctx.lineTo(x - handleWidth, height - handleSize); ctx.lineTo(x + handleWidth, height - handleSize);
            ctx.closePath();
            ctx.fill();
        };

        const fadeInHandleX = timeToX(sound.startTime + sound.fadeIn);
        const fadeOutHandleX = timeToX(soundEndTime - sound.fadeOut);
        const fadeHandleColor = '#6366f1'; // Indigo-500

        if (fadeInHandleX < endX && sound.fadeIn > 0) drawFadeHandle(fadeInHandleX, fadeHandleColor);
        if (fadeOutHandleX > startX && sound.fadeOut > 0) drawFadeHandle(fadeOutHandleX, fadeHandleColor);
        
        const playheadX = timeToX(playbackTime);
        if (playheadX >= 0 && playheadX <= width) {
            ctx.strokeStyle = '#facc15'; // yellow-400
            ctx.globalAlpha = status === 'playing' ? 1.0 : 0.85;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(playheadX, 0); ctx.lineTo(playheadX, height); ctx.stroke();
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.moveTo(playheadX, 0); ctx.lineTo(playheadX - 6, 12); ctx.lineTo(playheadX + 6, 12);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }

        if (tooltip) {
            ctx.font = '12px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const text = tooltip.time;
            const textMetrics = ctx.measureText(text);
            const boxWidth = textMetrics.width + 16;
            const boxHeight = 24;
            let boxX = tooltip.x - boxWidth / 2;
            if (boxX < 0) boxX = 0;
            if (boxX + boxWidth > width) boxX = width - boxWidth;
            ctx.fillStyle = 'rgba(17, 24, 39, 0.9)';
            ctx.strokeStyle = '#a5b4fc';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(boxX, 12, boxWidth, boxHeight, [4]); ctx.fill(); ctx.stroke();
            ctx.fillStyle = 'white';
            ctx.fillText(text, boxX + boxWidth / 2, 12 + boxHeight / 2);
        }
    }, [sound, duration, tooltip, status, playbackTime, zoomRange, timeToX]);

    const renderFullWaveform = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !buffer) return;
        const width = canvas.width;
        const height = canvas.height;
        if (!offscreenCanvasRef.current || offscreenCanvasRef.current.width !== width) {
            offscreenCanvasRef.current = document.createElement('canvas');
            offscreenCanvasRef.current.width = width;
            offscreenCanvasRef.current.height = height;
        }
        const ctx = offscreenCanvasRef.current.getContext('2d');
        if (!ctx) return;
        const channelData = buffer.getChannelData(0);
        const step = Math.ceil(channelData.length / width);
        const amp = height / 2;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 0.5;
        if (duration > 0) {
            const timeStep = duration > 10 ? Math.floor(duration/10) : 1;
            for (let t = 0; t < duration; t += timeStep) {
                const x = (t / duration) * width;
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
            }
        }
        ctx.beginPath(); ctx.moveTo(0, height * 0.5); ctx.lineTo(width, height * 0.5); ctx.stroke();
        ctx.strokeStyle = '#6ee7b7';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < width; i++) {
            let min = 1.0, max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = channelData[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            ctx.moveTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
        }
        ctx.stroke();
        drawCanvas();
    }, [buffer, duration, drawCanvas]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const resizeObserver = new ResizeObserver(() => {
            window.requestAnimationFrame(() => {
                if (canvasRef.current) {
                    const rect = canvasRef.current.getBoundingClientRect();
                    canvasRef.current.width = rect.width * window.devicePixelRatio;
                    canvasRef.current.height = 160 * window.devicePixelRatio;
                    canvasRef.current.style.width = `${rect.width}px`;
                    canvasRef.current.style.height = `160px`;
                    renderFullWaveform();
                }
            });
        });
        resizeObserver.observe(canvas);
        return () => resizeObserver.disconnect();
    }, [renderFullWaveform]);
    
    useEffect(() => {
        drawCanvas();
    }, [drawCanvas]);
    
    const getTarget = useCallback((x: number, y:number): 'startTime' | 'endTime' | 'fadeIn' | 'fadeOut' | null => {
        const canvas = canvasRef.current;
        if (duration <= 0 || !canvas) return null;
        const soundEndTime = sound.endTime ?? duration;
        const startX = timeToX(sound.startTime);
        const endX = timeToX(soundEndTime);
        const fadeInHandleX = timeToX(sound.startTime + sound.fadeIn);
        const fadeOutHandleX = timeToX(soundEndTime - sound.fadeOut);
        const handleGripWidth = 18;
        const handleHeight = canvas.height;
        const fadeGripHeight = 24;
        const isFadeGrabRegion = y < fadeGripHeight || y > handleHeight - fadeGripHeight;
        if (isFadeGrabRegion) {
            if (Math.abs(x - fadeInHandleX) < handleGripWidth) return 'fadeIn';
            if (Math.abs(x - fadeOutHandleX) < handleGripWidth) return 'fadeOut';
        }
        if (Math.abs(x - startX) < handleGripWidth) return 'startTime';
        if (Math.abs(x - endX) < handleGripWidth) return 'endTime';
        return null;
    }, [duration, sound, timeToX]);

    const handleDragMove = useCallback((clientX: number) => {
        if (!dragInfo) return;
        const canvas = canvasRef.current;
        if (!canvas || duration <= 0) return;
        const rect = canvas.getBoundingClientRect();
        const dx = (clientX - dragInfo.initialClientX) * window.devicePixelRatio;
        
        const currentRange = zoomRange || { start: 0, end: duration };
        const rangeDuration = currentRange.end - currentRange.start;
        const timeDelta = (dx / canvas.width) * rangeDuration;

        let updates: Partial<Pick<Sound, 'startTime' | 'endTime' | 'fadeIn' | 'fadeOut'>> = {};
        const soundEndTime = dragInfo.initialEnd;
        const selectionDuration = soundEndTime - dragInfo.initialStart;

        if (dragInfo.target === 'startTime') {
            updates.startTime = Math.max(0, Math.min(dragInfo.initialStart + timeDelta, soundEndTime - 0.05));
        } else if (dragInfo.target === 'endTime') {
            updates.endTime = Math.min(duration, Math.max(dragInfo.initialEnd + timeDelta, dragInfo.initialStart + 0.05));
        } else if (dragInfo.target === 'fadeIn') {
            const newFadeIn = dragInfo.initialFadeIn + timeDelta;
            updates.fadeIn = Math.max(0, Math.min(newFadeIn, selectionDuration));
        } else if (dragInfo.target === 'fadeOut') {
            const newFadeOut = dragInfo.initialFadeOut - timeDelta;
            updates.fadeOut = Math.max(0, Math.min(newFadeOut, selectionDuration));
        }
        
        if (Object.keys(updates).length > 0) onUpdate(updates);
        
        const xPosInCanvas = (clientX - rect.left) * window.devicePixelRatio;
        setTooltip({ x: xPosInCanvas, time: xToTime(xPosInCanvas).toFixed(3) + 's' });
    }, [dragInfo, duration, onUpdate, zoomRange, xToTime]);

    useEffect(() => {
        const handleEnd = () => {
            if (!dragInfo) return;
            document.body.style.userSelect = '';
            document.body.style.cursor = 'default';
            if(canvasRef.current) canvasRef.current.style.cursor = 'default';
            setDragInfo(null);
            setTooltip(null);
            
            if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
            zoomTimeoutRef.current = window.setTimeout(() => {
                setZoomRange(null);
                zoomTimeoutRef.current = null;
            }, 2000);
        };
        const handleMouseMove = (e: MouseEvent) => handleDragMove(e.clientX);
        const handleTouchMove = (e: TouchEvent) => { e.preventDefault(); handleDragMove(e.touches[0].clientX); };
        if (dragInfo) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleEnd, { once: true });
            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('touchend', handleEnd, { once: true });
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleEnd);
        };
    }, [dragInfo, handleDragMove]);

    const handleInteractionStart = (clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas || duration <= 0 || status === 'playing') return;
        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) * window.devicePixelRatio;
        const y = (clientY - rect.top) * window.devicePixelRatio;
        const target = getTarget(x, y);

        if (target) {
            if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
            zoomTimeoutRef.current = null;
            
            const ZOOM_WINDOW_SECONDS = Math.min(duration, 5);
            const soundEndTime = sound.endTime ?? duration;
            let handleTime: number;
            switch(target) {
                case 'startTime': handleTime = sound.startTime; break;
                case 'endTime': handleTime = soundEndTime; break;
                case 'fadeIn': handleTime = sound.startTime + sound.fadeIn; break;
                case 'fadeOut': handleTime = soundEndTime - sound.fadeOut; break;
            }
            
            let zoomStart = Math.max(0, handleTime - ZOOM_WINDOW_SECONDS / 2);
            let zoomEnd = Math.min(duration, handleTime + ZOOM_WINDOW_SECONDS / 2);
            if (zoomEnd - zoomStart < ZOOM_WINDOW_SECONDS && duration >= ZOOM_WINDOW_SECONDS) {
                if (zoomStart === 0) zoomEnd = Math.min(duration, zoomStart + ZOOM_WINDOW_SECONDS);
                else if (zoomEnd === duration) zoomStart = Math.max(0, zoomEnd - ZOOM_WINDOW_SECONDS);
            }
            setZoomRange({ start: zoomStart, end: zoomEnd });

            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'ew-resize';
            setDragInfo({
                target, initialClientX: clientX, initialStart: sound.startTime,
                initialEnd: sound.endTime ?? duration, initialFadeIn: sound.fadeIn, initialFadeOut: sound.fadeOut,
            });
        } else {
            if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
            setZoomRange(null);
            onSeek(xToTime(x));
        }
    };

    return (
        <div className="touch-manipulation">
          <canvas 
              ref={canvasRef} 
              className="w-full h-40 bg-gray-900 rounded-md border border-gray-700"
              style={{height: 160}}
              onMouseDown={(e) => handleInteractionStart(e.clientX, e.clientY)}
              onMouseMove={(e) => {
                  if (dragInfo || status === 'playing') return;
                  const canvas = canvasRef.current;
                  if (!canvas || duration <= 0) return;
                  const rect = canvas.getBoundingClientRect();
                  const x = (e.clientX - rect.left) * window.devicePixelRatio;
                  const y = (e.clientY - rect.top) * window.devicePixelRatio;
                  const target = getTarget(x, y);
                  canvas.style.cursor = target ? 'ew-resize' : 'crosshair';
                  setTooltip({ x, time: xToTime(x).toFixed(3) + 's' });
              }}
              onMouseLeave={() => { if (!dragInfo && canvasRef.current) canvasRef.current.style.cursor = 'default'; setTooltip(null); }}
              onTouchStart={(e) => {
                  const touch = e.touches[0];
                  handleInteractionStart(touch.clientX, touch.clientY);
              }}
          ></canvas>
        </div>
    );
};

export default WaveformEditor;
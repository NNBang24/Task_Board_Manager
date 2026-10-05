import { useState, useRef, useCallback, useEffect } from 'react';
import { audioChimes } from '../utils/audioChimes';

export interface UseAudioRecorderReturn {
  isRecording: boolean;
  audioVolume: number;
  recordingDuration: number;
  audioBlob: Blob | null;
  error: string | null;
  isSupported: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
  resetAudio: () => void;
}

/**
 * Hook quan ly thu am am thanh da nen tang qua W3C MediaRecorder.
 */
export const useAudioRecorder = (
  onRecordingComplete?: (blob: Blob) => void
): UseAudioRecorderReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const onRecordingCompleteRef = useRef(onRecordingComplete);
  onRecordingCompleteRef.current = onRecordingComplete;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStartingRef = useRef(false);
  const lastVolumeUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.mediaDevices || !window.MediaRecorder) {
      setIsSupported(false);
    }
  }, []);

  /**
   * Xac dinh MIME type phu hop nhat voi trinh duyet hien tai.
   */
  const getSupportedMimeType = (): string => {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidateTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/ogg;codecs=opus',
      'audio/wav',
    ];
    for (const type of candidateTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  };

  /**
   * Dung bo phan tich am thanh va giai phong tai nguyen AudioContext.
   */
  const stopAudioAnalyzer = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (microphoneRef.current) {
      try {
        microphoneRef.current.disconnect();
      } catch {
        // Ignore
      }
      microphoneRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // Ignore
      }
      analyserRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch {
        // Ignore
      }
      audioContextRef.current = null;
    }
    setAudioVolume(0);
  }, []);

  /**
   * Khoi dong bo phan tich am thanh cho visualizer song am voi co che throttle.
   */
  const startAudioAnalyzer = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const micSource = audioCtx.createMediaStreamSource(stream);
      micSource.connect(analyser);
      microphoneRef.current = micSource;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      lastVolumeUpdateRef.current = 0;

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        const now = performance.now();
        // Throttle React state updates to ~15 FPS (every 66ms) to prevent render flooding
        if (now - lastVolumeUpdateRef.current > 66) {
          lastVolumeUpdateRef.current = now;
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          const normalized = Math.min(100, Math.round((average / 128) * 100));
          setAudioVolume(normalized);
        }

        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (e: unknown) {
      console.warn('AudioContext analyzer initialization error:', e);
    }
  }, []);

  /**
   * Bat dau thu am tu microphone.
   */
  const startRecording = useCallback(async () => {
    if (isStartingRef.current || mediaRecorderRef.current?.state === 'recording') {
      return;
    }

    isStartingRef.current = true;
    setError(null);
    setAudioBlob(null);
    setRecordingDuration(0);
    audioChunksRef.current = [];

    // Clean up any previous active sessions
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    stopAudioAnalyzer();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      mediaStreamRef.current = stream;
      startAudioAnalyzer(stream);

      const mimeType = getSupportedMimeType();
      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      audioChimes.playStartListen();

      const startTime = Date.now();
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingDuration(elapsed);

        if (elapsed >= 35) {
          stopRecording();
        }
      }, 500);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Không thể truy cập Microphone. Vui lòng cấp quyền thu âm trong trình duyệt.';
      setError(
        msg.includes('Permission') || msg.includes('denied')
          ? 'Quyền truy cập Microphone bị từ chối. Vui lòng cho phép trình duyệt sử dụng Micro.'
          : 'Không tìm thấy thiết bị thu âm Microphone. Vui lòng kiểm tra lại thiết bị.'
      );
      setIsRecording(false);
    } finally {
      isStartingRef.current = false;
    }
  }, [getSupportedMimeType, startAudioAnalyzer, stopAudioAnalyzer]);

  /**
   * Dung thu am va tra ve ket qua audio blob.
   */
  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      stopAudioAnalyzer();
      audioChimes.playStopListen();

      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        setIsRecording(false);
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const finalBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(finalBlob);
        setIsRecording(false);

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }

        if (onRecordingCompleteRef.current && finalBlob.size > 0) {
          onRecordingCompleteRef.current(finalBlob);
        }

        resolve(finalBlob);
      };

      try {
        recorder.stop();
      } catch {
        setIsRecording(false);
        resolve(null);
      }
    });
  }, [stopAudioAnalyzer]);

  /**
   * Huy thu am va lam sach bo nho dem.
   */
  const cancelRecording = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    stopAudioAnalyzer();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // Ignore
      }
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    audioChunksRef.current = [];
    setAudioBlob(null);
    setIsRecording(false);
    setRecordingDuration(0);
  }, [stopAudioAnalyzer]);

  /**
   * Dat lai trang thai audio ban dau.
   */
  const resetAudio = useCallback(() => {
    setAudioBlob(null);
    setRecordingDuration(0);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      stopAudioAnalyzer();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stopAudioAnalyzer]);

  return {
    isRecording,
    audioVolume,
    recordingDuration,
    audioBlob,
    error,
    isSupported,
    startRecording,
    stopRecording,
    cancelRecording,
    resetAudio,
  };
};

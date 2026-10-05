import { useState, useEffect, useRef, useCallback } from 'react';
import { normalizeVietglishVoiceTranscript } from '../utils/vietglishNormalizer';
import { audioChimes } from '../utils/audioChimes';
import { api } from '../services/api';

// SpeechRecognition type declarations for fallback browser support
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface ISpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface ISpeechRecognitionConstructor {
  new (): ISpeechRecognitionInstance;
}

interface IWindow extends Window {
  SpeechRecognition?: ISpeechRecognitionConstructor;
  webkitSpeechRecognition?: ISpeechRecognitionConstructor;
}

export type VoiceLanguageMode = 'bilingual' | 'vi-VN' | 'en-US';
export type VoiceEngineMode = 'whisper' | 'webspeech';

export interface UseVoiceRecognitionReturn {
  isListening: boolean;
  isTranscribing: boolean;
  transcript: string;
  interimTranscript: string;
  audioVolume: number;
  isSupported: boolean;
  engine: VoiceEngineMode;
  languageMode: VoiceLanguageMode;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  resetTranscript: () => void;
  setManualTranscript: (text: string) => void;
  setLanguageMode: (mode: VoiceLanguageMode) => void;
  setEngine: (engine: VoiceEngineMode) => void;
}

export const useVoiceRecognition = (onFinalResult?: (result: string) => void): UseVoiceRecognitionReturn => {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioVolume, setAudioVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [languageMode, setLanguageModeState] = useState<VoiceLanguageMode>('bilingual');
  const [engine, setEngineState] = useState<VoiceEngineMode>('whisper'); // Mặc định là Groq Whisper Large V3

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<ISpeechRecognitionInstance | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const shouldListenRef = useRef<boolean>(false);
  const engineRef = useRef<VoiceEngineMode>('whisper');
  const languageModeRef = useRef<VoiceLanguageMode>('bilingual');

  engineRef.current = engine;
  languageModeRef.current = languageMode;

  // Kiểm tra hỗ trợ trình duyệt
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      const win = window as unknown as IWindow;
      const hasWebSpeech = !!(win.SpeechRecognition || win.webkitSpeechRecognition);

      if (!hasMediaDevices && !hasWebSpeech) {
        setIsSupported(false);
      }
    }
  }, []);

  // Khởi tạo Web Speech API (Dùng làm Fallback khi Groq Whisper không khả dụng)
  const initWebSpeechRecognition = useCallback(() => {
    const win = window as unknown as IWindow;
    const SpeechRecognitionAPI = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setError('Trình duyệt chưa hỗ trợ Web Speech API.');
      return null;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;

    const currentMode = languageModeRef.current;
    if (currentMode === 'en-US') {
      recognition.lang = 'en-US';
    } else {
      recognition.lang = 'vi-VN';
    }

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let currentInterim = '';
      let currentFinal = '';

      for (let i = 0; i < event.results.length; i++) {
        const item = event.results[i];
        const text = item[0]?.transcript || '';
        if (item.isFinal) {
          currentFinal += text + ' ';
        } else {
          currentInterim += text;
        }
      }

      if (currentFinal) {
        let updated = currentFinal.trim();
        if (languageModeRef.current !== 'en-US') {
          updated = normalizeVietglishVoiceTranscript(updated);
        }
        setTranscript(updated);
        if (onFinalResult) onFinalResult(updated);
      }

      if (currentInterim) {
        setInterimTranscript(
          languageModeRef.current !== 'en-US'
            ? normalizeVietglishVoiceTranscript(currentInterim)
            : currentInterim
        );
      } else {
        setInterimTranscript('');
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') return;
      if (event.error === 'not-allowed') {
        setError('Quyền Microphone bị từ chối.');
      } else {
        setError(`Lỗi nhận diện âm thanh (${event.error}).`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      if (shouldListenRef.current && engineRef.current === 'webspeech') {
        try {
          recognition.start();
        } catch {
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    return recognition;
  }, [onFinalResult]);

  // Khởi động Audio Analyzer để vẽ sóng âm Visualizer
  const startAudioAnalyzer = (stream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const normalized = Math.min(100, Math.round((average / 128) * 100));
        setAudioVolume(normalized);

        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch {
      // Bỏ qua lỗi context nếu mic bị từ chối
    }
  };

  // Dừng Audio Analyzer
  const stopAudioAnalyzer = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (microphoneRef.current) {
      microphoneRef.current.disconnect();
      microphoneRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setAudioVolume(0);
  };

  // Bắt đầu lắng nghe (Mặc định: Groq Whisper HD Record)
  const startListening = async () => {
    setError(null);
    shouldListenRef.current = true;
    audioChimes.playStartListen();

    // 1. Nếu đang ở chế độ Groq Whisper (Mặc định & Khuyên dùng)
    if (engineRef.current === 'whisper') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,    // Khử tiếng vang
            noiseSuppression: true,    // Lọc tạp âm môi trường
            autoGainControl: true,     // Cân bằng âm lượng tự động
            sampleRate: 44100,
          },
          video: false,
        });

        mediaStreamRef.current = stream;
        startAudioAnalyzer(stream);

        audioChunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.start(100);
        setIsListening(true);
      } catch (err: unknown) {
        console.warn('Không thể mở Microphone HD cho Groq Whisper, chuyển sang Web Speech API fallback:', err);
        // Tự động chuyển sang Web Speech API làm fallback
        setEngineState('webspeech');
        engineRef.current = 'webspeech';
        startWebSpeechFallback();
      }
      return;
    }

    // 2. Chế độ Web Speech API Fallback
    startWebSpeechFallback();
  };

  const startWebSpeechFallback = () => {
    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
      }
      recognitionRef.current = initWebSpeechRecognition();
      recognitionRef.current?.start();

      navigator.mediaDevices
        .getUserMedia({ audio: true, video: false })
        .then((stream) => {
          mediaStreamRef.current = stream;
          startAudioAnalyzer(stream);
        })
        .catch(() => {});
    } catch (e: unknown) {
      console.warn('Web Speech API exception:', e);
    }
  };

  // Dừng lắng nghe & Gửi âm thanh lên Groq Whisper
  const stopListening = () => {
    shouldListenRef.current = false;
    audioChimes.playStopListen();

    // 1. Xử lý dừng Groq Whisper
    if (engineRef.current === 'whisper' && mediaRecorderRef.current) {
      const recorder = mediaRecorderRef.current;
      if (recorder.state !== 'inactive') {
        recorder.onstop = async () => {
          stopAudioAnalyzer();
          setIsListening(false);

          const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          if (audioBlob.size < 1000) {
            // Âm thanh quá ngắn (< 0.1s)
            return;
          }

          setIsTranscribing(true);
          try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'voice-command.webm');

            const langParam = languageModeRef.current === 'en-US' ? 'en' : 'vi';
            const response = await api.post<{ text: string }>(`/tasks/voice/transcribe?language=${langParam}`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });

            const transcribedText = response.data?.text?.trim() || '';
            if (transcribedText) {
              const normalized =
                languageModeRef.current !== 'en-US'
                  ? normalizeVietglishVoiceTranscript(transcribedText)
                  : transcribedText;

              setTranscript(normalized);
              setInterimTranscript('');
              if (onFinalResult) onFinalResult(normalized);
            }
          } catch (err: unknown) {
            console.error('Lỗi khi gửi âm thanh lên Groq Whisper:', err);
            setError('Không thể kết nối Groq Whisper. Đã tự động chuyển sang bộ nhận diện Web Speech API.');
            setEngineState('webspeech');
            engineRef.current = 'webspeech';
          } finally {
            setIsTranscribing(false);
          }
        };

        recorder.stop();
      } else {
        stopAudioAnalyzer();
        setIsListening(false);
      }
      return;
    }

    // 2. Xử lý dừng Web Speech API
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore
    }
    stopAudioAnalyzer();
    setIsListening(false);
  };

  const resetTranscript = () => {
    setTranscript('');
    setInterimTranscript('');
    audioChunksRef.current = [];
  };

  const setManualTranscript = (text: string) => {
    setTranscript(text);
    setInterimTranscript('');
  };

  const setLanguageMode = (mode: VoiceLanguageMode) => {
    setLanguageModeState(mode);
    languageModeRef.current = mode;
  };

  const setEngine = (newEngine: VoiceEngineMode) => {
    setEngineState(newEngine);
    engineRef.current = newEngine;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      stopAudioAnalyzer();
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        recognitionRef.current?.abort();
      } catch {
        // Ignore
      }
    };
  }, []);

  return {
    isListening,
    isTranscribing,
    transcript,
    interimTranscript,
    audioVolume,
    isSupported,
    engine,
    languageMode,
    error,
    startListening,
    stopListening,
    resetTranscript,
    setManualTranscript,
    setLanguageMode,
    setEngine,
  };
};

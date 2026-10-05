import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  X,
  Sparkles,
  Volume2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Calendar,
  User,
  FolderKanban,
  RotateCcw,
  Flag,
  PenLine,
  Keyboard,
  Radio,
  FileText,
  SendHorizontal,
} from 'lucide-react';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { AudioWaveVisualizer } from './AudioWaveVisualizer';
import { audioChimes } from '../../utils/audioChimes';
import { api } from '../../services/api';
import axios, { AxiosError } from 'axios';

interface SolarisVoiceAssistantWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  onExecuteCommand?: (commandText: string) => void;
  currentProjectId?: string;
}

interface ParsedTaskData {
  title: string;
  description: string | null;
  priority: string;
  projectId: string;
  projectName: string;
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
  dueDate: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  fullName: string;
  email: string;
  avatar: string | null;
  profession: string;
}

interface VoiceParseResponse {
  rawAudioText: string;
  parsedData: ParsedTaskData;
  projects: ProjectOption[];
  users: UserOption[];
}

interface CreatedTaskModel {
  id: string;
  title: string;
  description?: string | null;
  priority?: string;
  dueDate?: string | null;
  project?: {
    id: string;
    name: string;
  };
  assignee?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}

interface CreatedVoiceTaskResponse {
  success: boolean;
  message: string;
  task: CreatedTaskModel;
  parsedData: ParsedTaskData;
}

/**
 * Component tro ly giong noi Solaris Voice Assistant ho tro quy trinh xac nhan truoc khi tao task.
 */
export const SolarisVoiceAssistantWidget: React.FC<SolarisVoiceAssistantWidgetProps> = ({
  isOpen,
  onClose,
  onExecuteCommand,
  currentProjectId,
}) => {
  const [manualText, setManualText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState<string>('');
  const [previewData, setPreviewData] = useState<VoiceParseResponse | null>(null);
  const [createdResult, setCreatedResult] = useState<CreatedVoiceTaskResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState<string>('NORMAL');
  const [formProjectId, setFormProjectId] = useState<string>('');
  const [formAssigneeId, setFormAssigneeId] = useState<string>('');
  const [formDueDate, setFormDueDate] = useState<string>('');
  const [isConfirming, setIsConfirming] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /**
   * Xu ly file am thanh thu duoc va gui len backend de boc bang va tra ve du lieu xem truoc.
   */
  const handleAudioReady = useCallback(
    async (blob: Blob) => {
      if (!blob || blob.size === 0 || isSubmitting) return;

      setIsSubmitting(true);
      setSubmittingStatus('Groq Whisper dang boc bang & AI dang phan tich khau lenh...');
      setApiError(null);
      setPreviewData(null);
      setCreatedResult(null);

      try {
        const formData = new FormData();
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        formData.append('audio', blob, `voice-command.${ext}`);

        const queryParam = currentProjectId ? `?projectId=${encodeURIComponent(currentProjectId)}` : '';
        const response = await api.post<VoiceParseResponse>(`/tasks/voice/parse-audio${queryParam}`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        const responseData = response.data as unknown as { data?: VoiceParseResponse } | VoiceParseResponse;
        const payload: VoiceParseResponse =
          responseData && typeof responseData === 'object' && 'data' in responseData && responseData.data
            ? responseData.data
            : (responseData as VoiceParseResponse);

        setPreviewData(payload);
        setFormTitle(payload?.parsedData?.title || '');
        setFormDescription(payload?.parsedData?.description || '');
        setFormPriority(payload?.parsedData?.priority || 'NORMAL');
        setFormProjectId(payload?.parsedData?.projectId || payload?.projects?.[0]?.id || currentProjectId || '');
        setFormAssigneeId(payload?.parsedData?.assigneeId || '');
        setFormDueDate(payload?.parsedData?.dueDate || '');

        audioChimes.playSuccessChime();
      } catch (error: unknown) {
        audioChimes.playErrorChime();
        console.error('Loi khi gui file am thanh len Groq Whisper backend:', error);
        let serverMessage =
          'Da xay ra loi khi ket noi Groq Whisper AI. Vui long kiem tra lai cau hinh GROQ_API_KEY o Backend.';

        if (axios.isAxiosError(error)) {
          const axiosErr = error as AxiosError<{ message?: string | string[]; error?: string }>;
          const msg = axiosErr.response?.data?.message || axiosErr.response?.data?.error;
          if (msg) {
            serverMessage = Array.isArray(msg) ? msg.join(', ') : msg;
          } else if (axiosErr.message) {
            serverMessage = axiosErr.message;
          }
        } else if (error instanceof Error) {
          serverMessage = error.message;
        }

        setApiError(serverMessage);
      } finally {
        setIsSubmitting(false);
        setSubmittingStatus('');
      }
    },
    [currentProjectId, isSubmitting]
  );

  const {
    isRecording,
    audioVolume,
    recordingDuration,
    error: micError,
    isSupported,
    startRecording,
    stopRecording,
    cancelRecording,
    resetAudio,
  } = useAudioRecorder(handleAudioReady);

  /**
   * Gui khau lenh van ban thu cong len backend de phan tich va hien thi buoc xac nhan.
   */
  const handleSendManualText = useCallback(
    async (textToSend: string) => {
      const fullText = textToSend.trim();
      if (!fullText || isSubmitting) return;

      cancelRecording();
      setIsSubmitting(true);
      setSubmittingStatus('Groq AI dang phan tich cu phap cau lenh...');
      setApiError(null);
      setPreviewData(null);
      setCreatedResult(null);

      try {
        const response = await api.post<VoiceParseResponse>('/tasks/voice/parse-text', {
          rawAudioText: fullText,
          projectId: currentProjectId,
        });

        const responseData = response.data as unknown as { data?: VoiceParseResponse } | VoiceParseResponse;
        const payload: VoiceParseResponse =
          responseData && typeof responseData === 'object' && 'data' in responseData && responseData.data
            ? responseData.data
            : (responseData as VoiceParseResponse);

        setPreviewData(payload);
        setFormTitle(payload?.parsedData?.title || '');
        setFormDescription(payload?.parsedData?.description || '');
        setFormPriority(payload?.parsedData?.priority || 'NORMAL');
        setFormProjectId(payload?.parsedData?.projectId || payload?.projects?.[0]?.id || currentProjectId || '');
        setFormAssigneeId(payload?.parsedData?.assigneeId || '');
        setFormDueDate(payload?.parsedData?.dueDate || '');

        audioChimes.playSuccessChime();
      } catch (error: unknown) {
        audioChimes.playErrorChime();
        console.error('Loi khi phan tich khau lenh van ban:', error);
        let serverMessage = 'Da xay ra loi khi phan tich cau lenh qua Groq AI.';

        if (axios.isAxiosError(error)) {
          const axiosErr = error as AxiosError<{ message?: string | string[]; error?: string }>;
          const msg = axiosErr.response?.data?.message || axiosErr.response?.data?.error;
          if (msg) {
            serverMessage = Array.isArray(msg) ? msg.join(', ') : msg;
          } else if (axiosErr.message) {
            serverMessage = axiosErr.message;
          }
        } else if (error instanceof Error) {
          serverMessage = error.message;
        }

        setApiError(serverMessage);
      } finally {
        setIsSubmitting(false);
        setSubmittingStatus('');
      }
    },
    [cancelRecording, currentProjectId, isSubmitting]
  );

  /**
   * Xac nhan tao task sau khi nguoi dung kiem tra va chinh sua thong tin.
   */
  const handleConfirmCreateTask = useCallback(async () => {
    if (!formTitle.trim()) {
      setApiError('Vui lòng nhập tiêu đề cho công việc.');
      return;
    }
    if (!formProjectId) {
      setApiError('Vui lòng chọn dự án mục tiêu.');
      return;
    }

    setIsConfirming(true);
    setApiError(null);

    try {
      const response = await api.post<CreatedVoiceTaskResponse>('/tasks/voice/confirm', {
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        priority: formPriority,
        projectId: formProjectId,
        assigneeId: formAssigneeId || null,
        dueDate: formDueDate || null,
        rawVoice: previewData?.rawAudioText || manualText || formTitle,
      });

      const responseData = response.data as unknown as { data?: CreatedVoiceTaskResponse } | CreatedVoiceTaskResponse;
      const payload: CreatedVoiceTaskResponse =
        responseData && typeof responseData === 'object' && 'data' in responseData && responseData.data
          ? responseData.data
          : (responseData as CreatedVoiceTaskResponse);

      setCreatedResult(payload);
      setPreviewData(null);
      audioChimes.playSuccessChime();

      if (onExecuteCommand && payload?.task?.title) {
        onExecuteCommand(payload.task.title);
      }
    } catch (error: unknown) {
      audioChimes.playErrorChime();
      console.error('Loi khi xac nhan tao task:', error);
      let serverMessage = 'Không thể tạo task. Vui lòng thử lại.';

      if (axios.isAxiosError(error)) {
        const axiosErr = error as AxiosError<{ message?: string | string[]; error?: string }>;
        const msg = axiosErr.response?.data?.message || axiosErr.response?.data?.error;
        if (msg) {
          serverMessage = Array.isArray(msg) ? msg.join(', ') : msg;
        } else if (axiosErr.message) {
          serverMessage = axiosErr.message;
        }
      } else if (error instanceof Error) {
        serverMessage = error.message;
      }

      setApiError(serverMessage);
    } finally {
      setIsConfirming(false);
    }
  }, [formTitle, formProjectId, formDescription, formPriority, formAssigneeId, formDueDate, previewData?.rawAudioText, manualText, onExecuteCommand]);

  const startRecordingRef = useRef(startRecording);
  startRecordingRef.current = startRecording;
  const cancelRecordingRef = useRef(cancelRecording);
  cancelRecordingRef.current = cancelRecording;
  const resetAudioRef = useRef(resetAudio);
  resetAudioRef.current = resetAudio;

  useEffect(() => {
    if (isOpen) {
      setCreatedResult(null);
      setPreviewData(null);
      setApiError(null);
      setManualText('');
      resetAudioRef.current();
      startRecordingRef.current();
    } else {
      cancelRecordingRef.current();
      setIsSubmitting(false);
      setIsConfirming(false);
      setPreviewData(null);
      setCreatedResult(null);
      setApiError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || document.activeElement === textareaRef.current)) {
        if (!previewData && manualText.trim()) {
          e.preventDefault();
          handleSendManualText(manualText);
          return;
        }
      }

      if (e.code === 'Space' && document.activeElement !== textareaRef.current && !isSubmitting && !previewData && !createdResult) {
        e.preventDefault();
        if (isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isRecording, isSubmitting, previewData, createdResult, manualText, startRecording, stopRecording, onClose, handleSendManualText]);

  /**
   * Dat lai trang thai va bat dau thu am lai.
   */
  const handleResetAndRecordAgain = () => {
    setCreatedResult(null);
    setPreviewData(null);
    setApiError(null);
    setManualText('');
    resetAudio();
    startRecording();
  };

  /**
   * Xu ly khi nhan vao mau cau lenh co san.
   */
  const handleSampleClick = (sampleText: string) => {
    const cleanSample = sampleText.replace(/^🎙️\s*"?|"?$/g, '').trim();
    setManualText(cleanSample);
    handleSendManualText(cleanSample);
  };

  if (!isOpen) return null;

  const getPriorityBadgeColor = (priority?: string) => {
    switch (priority?.toUpperCase()) {
      case 'URGENT':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
      case 'IMPORTANT':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'LOW':
        return 'bg-slate-700/50 text-slate-300 border-slate-600';
      default:
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col solar-glass-card rounded-3xl bg-[#0F172A]/95 border-2 border-amber-500/50 shadow-[0_0_60px_rgba(245,158,11,0.3)] relative overflow-hidden animate-solar-warp-in">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between border-b border-slate-800 p-4 sm:p-5 pb-3 relative z-10 shrink-0 bg-[#0F172A]/90 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight flex items-center gap-2">
                Trợ Lý Giọng Nói Solaris AI
              </h2>
              <p className="text-[11px] text-slate-400">
                {isSubmitting ? (
                  <span className="text-purple-400 font-bold animate-pulse flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> {submittingStatus || 'Groq AI đang xử lý dữ liệu...'}
                  </span>
                ) : isConfirming ? (
                  <span className="text-amber-400 font-bold animate-pulse flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Đang tạo nhiệm vụ vào hệ thống...
                  </span>
                ) : createdResult ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Đã tạo công việc thành công!
                  </span>
                ) : previewData ? (
                  <span className="text-amber-300 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Hãy kiểm tra & xác nhận thông tin trước khi tạo
                  </span>
                ) : isRecording ? (
                  <span className="text-rose-400 font-bold animate-pulse flex items-center gap-1">
                    <Radio className="w-3 h-3 text-rose-500 animate-ping" /> Đang thu âm ({recordingDuration}s)... Bấm Dừng để xem trước
                  </span>
                ) : (
                  <span>Sẵn sàng tiếp nhận khẩu lệnh qua Micro hoặc gõ phím</span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 relative z-10 custom-scrollbar">
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-[11px]">
            <div className="flex items-center gap-2 font-mono">
              <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1">
                ⚡ Whisper STT
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold flex items-center gap-1">
                🧠 Groq LPU NLP
              </span>
            </div>
            <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 font-semibold">
              <CheckCircle2 className="w-3 h-3" /> Bước Xác Nhận Thông Minh
            </div>
          </div>

          {!isSupported && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-xs text-rose-300">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>Trình duyệt hiện tại chưa hỗ trợ MediaRecorder thu âm. Vui lòng sử dụng trình duyệt hiện đại hơn.</span>
            </div>
          )}

          {micError && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Thông Báo Thiết Bị Thu Âm</span>
              </div>
              <p className="text-amber-200/90 leading-relaxed text-[11px]">{micError}</p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={startRecording}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer transition-all shadow-md"
                >
                  <RotateCcw className="w-3 h-3" /> Thử Kết Nối Lại Micro
                </button>
                <span className="text-[10px] text-slate-400">hoặc gõ trực tiếp bên dưới</span>
              </div>
            </div>
          )}

          {apiError && (
            <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Thông báo lỗi</span>
              </div>
              <p className="text-rose-200/90 leading-relaxed">{apiError}</p>
            </div>
          )}

          {createdResult ? (
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#132338] to-[#0d1829] border border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.15)] space-y-4 animate-scale-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                    Nhiệm Vụ Đã Được Tạo Thành Công
                  </span>
                </div>
                {createdResult.task?.priority && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 ${getPriorityBadgeColor(
                      createdResult.task.priority
                    )}`}
                  >
                    <Flag className="w-3 h-3" />
                    {createdResult.task.priority}
                  </span>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                <div className="text-xs font-semibold text-slate-400">Tiêu đề:</div>
                <div className="text-sm font-bold text-white leading-snug">
                  {createdResult.task?.title || createdResult.parsedData?.title}
                </div>
                {createdResult.task?.description && (
                  <p className="text-xs text-slate-300 mt-1">{createdResult.task.description}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-2">
                  <FolderKanban className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400">Dự án</div>
                    <div className="text-white font-semibold truncate">
                      {createdResult.task?.project?.name || createdResult.parsedData?.projectName || 'Dự án mặc định'}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400">Giao cho</div>
                    <div className="text-white font-semibold truncate">
                      {createdResult.task?.assignee?.fullName ||
                        createdResult.task?.assignee?.email ||
                        createdResult.parsedData?.assigneeName ||
                        'Chính bạn'}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400">Hạn chót</div>
                    <div className="text-white font-semibold truncate">
                      {createdResult.task?.dueDate
                        ? new Date(createdResult.task.dueDate).toLocaleDateString('vi-VN')
                        : createdResult.parsedData?.dueDate || 'Không thời hạn'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : previewData ? (
            <div className="p-4 sm:p-5 rounded-2xl bg-[#111C33]/90 border border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.15)] space-y-4 animate-scale-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                      Xác Nhận & Tinh Chỉnh Thông Tin Task
                    </span>
                    <p className="text-[10px] text-slate-400">Kiểm tra thông tin do AI bóc tách trước khi lưu vào bảng Kanban</p>
                  </div>
                </div>
              </div>

              {previewData.rawAudioText && (
                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
                  <span className="text-[10px] font-mono text-slate-400 block mb-0.5">Khẩu lệnh giọng nói gốc:</span>
                  <p className="text-amber-200/90 font-mono italic text-[11px]">"{previewData.rawAudioText}"</p>
                </div>
              )}

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                    <PenLine className="w-3.5 h-3.5 text-amber-400" /> Tiêu đề nhiệm vụ:
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Nhập tiêu đề task..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500/60 focus:outline-none text-xs sm:text-sm text-white font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" /> Mô tả chi tiết (Tùy chọn):
                  </label>
                  <textarea
                    rows={2}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Thêm mô tả chi tiết nếu cần..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500/60 focus:outline-none text-xs text-white resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                      <FolderKanban className="w-3.5 h-3.5 text-amber-400" /> Dự án:
                    </label>
                    <select
                      value={formProjectId}
                      onChange={(e) => setFormProjectId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500/60 focus:outline-none text-xs text-white cursor-pointer font-medium"
                    >
                      {(previewData?.projects || []).map((p) => (
                        <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-purple-400" /> Giao cho thành viên:
                    </label>
                    <select
                      value={formAssigneeId}
                      onChange={(e) => setFormAssigneeId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500/60 focus:outline-none text-xs text-white cursor-pointer font-medium"
                    >
                      <option value="" className="bg-slate-900 text-slate-400">
                        -- Chưa phân công / Tự gán --
                      </option>
                      {(previewData?.users || []).map((u) => (
                        <option key={u.id} value={u.id} className="bg-slate-900 text-white">
                          {u.fullName} ({u.profession || u.email})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                      <Flag className="w-3.5 h-3.5 text-rose-400" /> Mức độ ưu tiên:
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { key: 'LOW', label: 'Thấp', color: 'border-slate-600 text-slate-300' },
                        { key: 'NORMAL', label: 'Vừa', color: 'border-emerald-500 text-emerald-400' },
                        { key: 'IMPORTANT', label: 'Quan trọng', color: 'border-amber-500 text-amber-400' },
                        { key: 'URGENT', label: 'Khẩn cấp', color: 'border-rose-500 text-rose-400' },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setFormPriority(item.key)}
                          className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                            formPriority === item.key
                              ? `bg-slate-800 shadow-md ${item.color} ring-1 ring-amber-400`
                              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-cyan-400" /> Hạn chót (Deadline):
                    </label>
                    <input
                      type="date"
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500/60 focus:outline-none text-xs text-white cursor-pointer font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <AudioWaveVisualizer isListening={isRecording && !isSubmitting} volume={audioVolume} />
                {isRecording && (
                  <div className="absolute top-2 right-2 px-2.5 py-1 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-[10px] font-bold flex items-center gap-1.5 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    00:{recordingDuration < 10 ? `0${recordingDuration}` : recordingDuration}s
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 focus-within:border-amber-500/50 space-y-1.5 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <PenLine className="w-3 h-3 text-amber-400" />
                    Khẩu lệnh / Văn bản công việc:
                  </span>
                  {isRecording && (
                    <span className="text-[10px] text-rose-400 font-bold animate-pulse">● Đang thu âm</span>
                  )}
                </div>

                <textarea
                  ref={textareaRef}
                  rows={3}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="Hãy nói hoặc gõ: 'Tạo task Fix bug API Authentication cho Nam mức độ khẩn cấp deadline ngày mai'..."
                  className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-slate-600 focus:outline-none resize-none leading-relaxed font-medium"
                />

                <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500 font-mono border-t border-slate-900">
                  <span className="flex items-center gap-1">
                    <Keyboard className="w-3 h-3 text-slate-400" /> [Space] Bật/Tắt Mic | [Enter] Phân tích lệnh | [Esc] Thoát
                  </span>
                  <span>{manualText.length} ký tự</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3 text-amber-400" /> Mẫu câu lệnh gợi ý (Click để thử):
                </span>
                <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono">
                  {[
                    'Tạo task Fix bug API Authentication cho Nam mức độ khẩn cấp deadline ngày mai',
                    'Tạo task Thiết kế Banner Marketing cho Khang',
                    'Tạo task Viết Unit Test Backend cho Tùng deadline hôm nay',
                    'Tạo task Tối ưu hiệu năng Database mức độ quan trọng',
                  ].map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSampleClick(sample)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 text-slate-300 hover:text-amber-300 text-left cursor-pointer transition-all disabled:opacity-50"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 p-4 sm:p-5 pt-3 relative z-10 shrink-0 bg-[#0F172A]/90 backdrop-blur-sm">
          {createdResult ? (
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={handleResetAndRecordAgain}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Tạo Nhiệm Vụ Khác
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg transition-all"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Hoàn Tất
              </button>
            </div>
          ) : previewData ? (
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => {
                  setPreviewData(null);
                  startRecording();
                }}
                disabled={isConfirming}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Thu Âm Lại / Hủy
              </button>

              <button
                type="button"
                onClick={handleConfirmCreateTask}
                disabled={isConfirming || !formTitle.trim()}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang Tạo Task...
                  </>
                ) : (
                  <>
                    <SendHorizontal className="w-3.5 h-3.5" /> Xác Nhận & Tạo Nhiệm Vụ
                  </>
                )}
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setManualText('');
                  resetAudio();
                }}
                disabled={isSubmitting || (!manualText && !isRecording)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Xóa Trắng
              </button>

              <div className="flex items-center gap-2.5">
                {isRecording ? (
                  <button
                    type="button"
                    onClick={stopRecording}
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-rose-900/30 animate-pulse disabled:opacity-50"
                  >
                    <MicOff className="w-3.5 h-3.5" /> Dừng & Phân Tích (Whisper)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={isSubmitting}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md disabled:opacity-50"
                  >
                    <Mic className="w-3.5 h-3.5" /> Thu Âm Mới
                  </button>
                )}

                {manualText && !isRecording && (
                  <button
                    type="button"
                    onClick={() => handleSendManualText(manualText)}
                    disabled={isSubmitting}
                    className="px-4 sm:px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Groq AI Đang Xử Lý...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 fill-current" />
                        Phân Tích Khẩu Lệnh
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

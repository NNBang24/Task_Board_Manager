import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  Clock,
  AlertCircle,
  PauseCircle,
  CheckCircle2,
  MoreVertical,
  MessageSquare,
  Send,
  Trash2,
  Copy,
  ExternalLink,
  Check,
  ChevronDown,
  ChevronUp,
  ListTodo,
  CheckSquare,
  Square,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useUserStore } from '../../store/useUserStore';
import { api } from '../../services/api';
import { UserProfileModal, type UserProfileData } from '../common/UserProfileModal';
import { getAvatarUrl } from '../../utils/avatar';

export interface SubtaskItem {
  id: string;
  title: string;
  isDone: boolean;
  isUrgent?: boolean;
  estimatedDays?: number;
  approvalStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  order?: number;
  assigneeId?: string;
  assignee?: {
    id: string;
    fullName: string;
    avatar?: string;
  };
  startDate?: string;
  dueDate?: string;
  createdAt?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'PAUSED' | 'BLOCKED' | 'IN_REVIEW' | 'DONE';
  priority: 'LOW' | 'NORMAL' | 'IMPORTANT' | 'URGENT';
  progress: number;
  startDate?: string;
  dueDate?: string;
  createdAt?: string;
  projectName?: string;
  projectId?: string;
  assigneeId?: string;
  createdById?: string;
  assignee?: {
    id: string;
    fullName: string;
    email?: string;
    avatar?: string;
    profession?: string;
  };
  assignees?: Array<{
    id: string;
    fullName: string;
    email?: string;
    avatar?: string;
    profession?: string;
  }>;
  createdBy?: {
    id: string;
    fullName: string;
    avatar?: string;
    email?: string;
  };
  transferInfo?: {
    senderName: string;
    senderAvatar?: string;
    receiverName: string;
    receiverAvatar?: string;
    note?: string;
  };
  tags?: Array<{ id: string; name: string; color?: string }>;
  commentsCount?: number;
  stageId?: string;
  subtasks?: SubtaskItem[];
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    type: 'file' | 'link';
    size?: string;
    createdAt: string;
  }>;
}

interface KanbanCardProps {
  task: TaskItem;
  onStatusChange?: (taskId: string, newStatus: TaskItem['status']) => void;
  onRequestTransfer?: (task: TaskItem) => void;
  onCardClick?: (task: TaskItem) => void;
  onDeleteTask?: (task: TaskItem) => void;
  onToggleSubtask?: (taskId: string, subtaskId: string, isDone: boolean) => void;
}

export const KanbanCard: React.FC<KanbanCardProps> = React.memo(({
  task,
  onRequestTransfer,
  onCardClick,
  onDeleteTask,
  onToggleSubtask,
}) => {
  const currentUser = useAuthStore((state) => state.user);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSubtasksOpen, setIsSubtasksOpen] = useState(false);
  const [profileUser, setProfileUser] = useState<UserProfileData | null>(null);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 👥 Tổng hợp tất cả những người đang cùng thực hiện Task (Chính + Phối hợp + Task con)
  const allAssignees = useMemo(() => {
    const map = new Map<string, any>();
    if (task.assignee && (task.assignee.id || task.assignee.fullName)) {
      map.set(task.assignee.id || task.assignee.fullName, {
        ...task.assignee,
        roleInTask: 'Chịu Trách Nhiệm Chính (Assignee)',
      });
    }
    if (Array.isArray(task.assignees)) {
      task.assignees.forEach((a) => {
        if (a && (a.id || a.fullName) && !map.has(a.id || a.fullName)) {
          map.set(a.id || a.fullName, {
            ...a,
            roleInTask: 'Thành Viên Phối Hợp',
          });
        }
      });
    }
    if (Array.isArray(task.subtasks)) {
      task.subtasks.forEach((st) => {
        if (st.assignee && (st.assignee.id || st.assignee.fullName)) {
          const key = st.assignee.id || st.assignee.fullName;
          if (!map.has(key)) {
            map.set(key, {
              ...st.assignee,
              roleInTask: `Phụ Trách Việc Con: "${st.title}"`,
            });
          }
        }
      });
    }
    return Array.from(map.values());
  }, [task.assignee, task.assignees, task.subtasks]);

  const handleOpenAssigneeProfile = (e: React.MouseEvent, targetUser?: any) => {
    e.stopPropagation();
    const u = targetUser || (allAssignees.length === 1 ? allAssignees[0] : null) || task.assignee;
    if (!u) {
      if (allAssignees.length > 1) {
        setIsMembersModalOpen(true);
      }
      return;
    }

    // Tìm trong user store để lấy đầy đủ thông tin chuẩn nhất
    const allUsers = useUserStore.getState().users;
    const matchedUser = allUsers.find(
      (storeUser) => (u.id && storeUser.id === u.id) || (u.email && storeUser.email?.toLowerCase() === u.email?.toLowerCase())
    );

    if (matchedUser) {
      setProfileUser({
        id: matchedUser.id,
        fullName: matchedUser.fullName,
        email: matchedUser.email,
        phone: matchedUser.phone,
        avatarUrl: getAvatarUrl(matchedUser),
        avatar: getAvatarUrl(matchedUser),
        globalRole: matchedUser.globalRole,
        profession: matchedUser.profession,
        jobTitle: matchedUser.jobTitle,
        department: matchedUser.department,
        statusSignal: matchedUser.statusSignal,
        joinedDate: matchedUser.joinedDate,
        projectsCount: matchedUser.projectsCount,
        tasksCount: matchedUser.tasksCount,
        bio: matchedUser.bio,
        workMode: matchedUser.workMode || 'OFFICE',
      });
      return;
    }

    setProfileUser({
      id: u.id || 'u-assignee',
      fullName: u.fullName || 'Thành viên Solaris',
      email: u.email || `${u.fullName?.toLowerCase().replace(/\s+/g, '.')}@solaris.io`,
      avatarUrl: getAvatarUrl(u),
      avatar: getAvatarUrl(u),
      jobTitle: u.profession ? `${u.profession} Specialist` : 'Software Engineer',
      department: 'Engineering',
      globalRole: 'EMPLOYEE',
      statusSignal: 'ONLINE',
      workMode: 'OFFICE',
    });
  };

  const isMyTask = Boolean(
    currentUser &&
      (task.assigneeId === currentUser.id ||
        task.assignee?.id === currentUser.id ||
        task.assignee?.email === currentUser.email ||
        (task.assignees && task.assignees.some((a) => a.id === currentUser.id || a.email === currentUser.email)) ||
        (task.subtasks && task.subtasks.some((st) => st.assigneeId === currentUser.id || st.assignee?.id === currentUser.id)) ||
        (!task.assigneeId && task.createdById === currentUser.id))
  );

  const isAdminOrManager = currentUser?.globalRole === 'ADMIN' || currentUser?.globalRole === 'MANAGER';
  const canTransferOrRequest = isMyTask || isAdminOrManager;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  const handleCopyTaskId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(task.id);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
      setIsMenuOpen(false);
    }, 1500);
  };

  const handleReviewSubtask = async (e: React.MouseEvent, subtaskId: string, action: 'APPROVE' | 'REJECT') => {
    e.stopPropagation();
    let reason: string | undefined = undefined;
    if (action === 'REJECT') {
      const inputReason = window.prompt('Nhập lý do từ chối xác thực Task con này:');
      if (inputReason === null) return;
      reason = inputReason.trim() || 'Chưa đạt yêu cầu, vui lòng hoàn thiện lại';
    }

    try {
      await api.patch(`/tasks/subtasks/${subtaskId}/review`, { action, reason });
      onToggleSubtask?.(task.id, subtaskId, action === 'APPROVE');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Không thể thực hiện đánh giá Task con');
    }
  };

  const getStatusBadge = (status: TaskItem['status']) => {
    switch (status) {
      case 'PAUSED':
        return { label: 'Tạm Dừng', color: 'bg-slate-800 text-slate-300 border-slate-700', icon: PauseCircle };
      case 'BLOCKED':
        return { label: 'Tắc Nghẽn', color: 'bg-rose-500/15 text-rose-300 border-rose-500/30', icon: AlertCircle };
      case 'IN_REVIEW':
        return { label: 'Chờ Duyệt', color: 'bg-purple-500/15 text-purple-300 border-purple-500/30', icon: Clock };
      case 'DONE':
        return { label: 'Hoàn Thành', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: CheckCircle2 };
      default:
        return null;
    }
  };

  const statusBadge = getStatusBadge(task.status);
  const StatusIcon = statusBadge?.icon;

  return (
    <div
      onClick={() => onCardClick?.(task)}
      className="p-4 rounded-2xl bg-[#0f172a]/80 border border-slate-800/80 hover:border-slate-700 hover:bg-[#0f172a] shadow-sm hover:shadow-md space-y-3 transition-all duration-150 group relative overflow-visible cursor-pointer"
    >
      {/* Header Badges & 3-Dot Quick Actions Menu */}
      <div className="flex items-center justify-between gap-2 relative">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Urgent Subtasks Warning Badge */}
          {(() => {
            const urgentSubtasksCount = task.subtasks?.filter((st) => st.isUrgent && !st.isDone).length || 0;
            if (urgentSubtasksCount > 0) {
              return (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-rose-500/15 text-rose-300 border-rose-500/30 flex items-center gap-1">
                  🚨 {urgentSubtasksCount} Task con gấp
                </span>
              );
            }
            if (task.priority === 'URGENT') {
              return (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-rose-500/15 text-rose-300 border-rose-500/30">
                  URGENT
                </span>
              );
            }
            return null;
          })()}
          {statusBadge && StatusIcon && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1 ${statusBadge.color}`}>
              <StatusIcon className="w-3 h-3" />
              {statusBadge.label}
            </span>
          )}
        </div>

        {/* 🌟 3-DOT QUICK ACTION BUTTON & CONTEXT MENU */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
            title="Tác vụ nhanh"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white bg-slate-900/60 hover:bg-amber-500/20 border border-slate-800 hover:border-amber-500/40 transition-all cursor-pointer shadow-sm"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {/* 🌌 Glassmorphism Dropdown Menu */}
          {isMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-full mt-1.5 w-52 rounded-2xl bg-[#0F172A]/95 border border-amber-500/40 shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-xl p-1.5 z-50 animate-solar-warp-in space-y-1 text-xs"
            >
              {/* Chi tiết Task */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onCardClick?.(task);
                }}
                className="w-full px-3 py-2 rounded-xl text-left font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                <span>Xem Chi Tiết Task</span>
              </button>

              {/* Yêu Cầu Bàn Giao & Gửi Duyệt */}
              {canTransferOrRequest && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onRequestTransfer?.(task);
                  }}
                  className="w-full px-3 py-2 rounded-xl text-left font-semibold text-amber-300 hover:text-amber-200 hover:bg-amber-500/20 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-amber-400" />
                  <span>Gửi Duyệt / Chuyển Giao</span>
                </button>
              )}

              {/* Sao chép Mã Task */}
              <button
                onClick={handleCopyTaskId}
                className="w-full px-3 py-2 rounded-xl text-left font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 flex items-center gap-2 transition-colors cursor-pointer"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Đã Sao Chép ID!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Sao Chép Mã ID</span>
                  </>
                )}
              </button>

              {/* Xóa Task (Dành Cho Admin / Manager) */}
              {isAdminOrManager && onDeleteTask && (
                <div className="pt-1 border-t border-slate-800">
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onDeleteTask(task);
                    }}
                    className="w-full px-3 py-2 rounded-xl text-left font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Xóa Task</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      <h3 className="font-bold text-white text-sm line-clamp-2 leading-snug group-hover:text-amber-300 transition-colors">
        {task.title}
      </h3>

      {/* 📊 Task Progress & Subtasks Breakdown */}
      {task.subtasks && task.subtasks.length > 0 ? (
        <div className="space-y-1.5 pt-0.5">
          {/* Subtask Accordion Trigger Header */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              setIsSubtasksOpen(!isSubtasksOpen);
            }}
            className="flex items-center justify-between text-[11px] font-mono text-slate-300 hover:text-amber-300 transition-colors cursor-pointer select-none bg-slate-900/60 hover:bg-slate-900/90 px-2 py-1 rounded-lg border border-slate-800/80"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <ListTodo className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-semibold text-slate-300 truncate">
                Task con: <strong className="text-white">{task.subtasks.filter((st) => st.isDone).length}/{task.subtasks.length}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className={`font-bold text-[10px] px-1.5 py-0.2 rounded ${
                task.progress === 100 ? 'text-emerald-300 bg-emerald-500/20' : 'text-amber-300 bg-amber-500/20'
              }`}>
                {task.progress}%
              </span>
              {isSubtasksOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </div>
          </div>

          {/* Neon Mini Progress Bar */}
          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                task.progress === 100
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  : 'bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
              }`}
              style={{ width: `${task.progress}%` }}
            />
          </div>

          {/* 📋 Expanded Subtasks Quick Checklist */}
          {isSubtasksOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-2 space-y-1 p-2 rounded-xl bg-slate-950/80 border border-amber-500/20 shadow-inner animate-solar-warp-in text-xs"
            >
              {task.subtasks.map((st, idx) => {
                const isFirstPending = !st.isDone && task.subtasks?.findIndex((s) => !s.isDone) === idx;
                // 🔒 Ưu tiên phân quyền: Nếu subtask có assignee riêng thì CHỈ người đó, nếu không thì Task Assignee
                const effectiveAssigneeId = st.assigneeId || task.assigneeId || task.assignee?.id;
                const isWorkerDoingTask = Boolean(
                  currentUser &&
                    (effectiveAssigneeId === currentUser.id ||
                      (task.assignee?.email && !st.assigneeId && currentUser.email === task.assignee.email))
                );
                const isTaskPausedOrBlocked = task.status === 'PAUSED' || task.status === 'BLOCKED';
                const canToggleSubtask = isWorkerDoingTask && !st.isDone && st.approvalStatus !== 'PENDING' && !isTaskPausedOrBlocked;

                const sched = (() => {
                  const currentDays = Number(st.estimatedDays || 1);
                  let sDate: Date;

                  if (st.startDate) {
                    sDate = new Date(st.startDate);
                    sDate.setHours(0, 0, 0, 0);
                  } else {
                    const base = task.startDate ? new Date(task.startDate) : new Date(task.createdAt || Date.now());
                    base.setHours(0, 0, 0, 0);
                    let startOffset = 0;
                    const list = task.subtasks || [];
                    for (let i = 0; i < idx; i++) {
                      startOffset += Number(list[i]?.estimatedDays || 1);
                    }
                    sDate = new Date(base);
                    sDate.setDate(sDate.getDate() + startOffset);
                  }

                  const eDate = new Date(sDate);
                  eDate.setDate(eDate.getDate() + currentDays);
                  const fmt = (d: Date) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                  return currentDays === 1 ? fmt(sDate) : `${fmt(sDate)}-${fmt(eDate)}`;
                })();

                return (
                  <div
                    key={st.id || idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canToggleSubtask) {
                        onToggleSubtask?.(task.id, st.id, true);
                      }
                    }}
                    title={
                      st.isDone
                        ? '🔒 Task con này đã hoàn thành và được xác nhận'
                        : canToggleSubtask
                        ? 'Nhấn để gửi yêu cầu xác thực hoàn thành'
                        : '🔒 Chỉ người trực tiếp làm task mới có quyền tick hoàn thành (Người tạo và Quản trị viên không được tick thay)'
                    }
                    className={`flex items-start gap-2 p-1.5 rounded-lg transition-all group/st ${
                      st.isDone
                        ? 'opacity-40 grayscale select-none pointer-events-none cursor-not-allowed bg-slate-950/20 text-slate-500'
                        : canToggleSubtask
                        ? 'cursor-pointer hover:bg-slate-900/90'
                        : 'cursor-not-allowed opacity-75'
                    } ${
                      st.isDone
                        ? ''
                        : st.isUrgent
                        ? 'bg-red-500/15 text-slate-100 border border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                        : isFirstPending
                        ? 'bg-amber-500/10 text-slate-200 border border-amber-500/30'
                        : 'hover:bg-slate-900 text-slate-300'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={!canToggleSubtask}
                      className={`mt-0.5 shrink-0 text-slate-400 transition-colors ${
                        canToggleSubtask ? 'group-hover/st:text-amber-400 cursor-pointer' : 'cursor-default opacity-60'
                      }`}
                    >
                      {st.isDone ? (
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-400 fill-emerald-500/20" />
                      ) : (
                        <Square className={`w-3.5 h-3.5 ${canToggleSubtask ? 'text-slate-500 group-hover/st:text-amber-400' : 'text-slate-600'}`} />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-mono text-amber-300/80 bg-slate-950 px-1 rounded border border-slate-800">
                          📅 {sched}
                        </span>
                        <span
                          className={`text-[11px] leading-tight ${
                            st.isDone ? 'line-through text-slate-500' : 'text-slate-200'
                          }`}
                        >
                          {st.title}
                        </span>
                        {st.assignee && (
                          <span
                            className="text-[9px] font-mono text-cyan-300 bg-cyan-950/60 px-1 py-0.2 rounded border border-cyan-500/40"
                            title={`Phụ trách: ${st.assignee.fullName}`}
                          >
                            👤 {st.assignee.fullName.replace(/\s*\([^)]*\)/g, '')}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* ⏳ Trạng thái Chờ Quản Lý Duyệt (Pending) */}
                    {st.approvalStatus === 'PENDING' ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold animate-pulse">
                           Chờ Duyệt
                        </span>
                        {isAdminOrManager && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => handleReviewSubtask(e, st.id, 'APPROVE')}
                              className="px-1.5 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[9px] font-mono font-bold transition-all cursor-pointer shadow-sm"
                              title="Duyệt hoàn thành Task con này"
                            >
                              ✓ Duyệt
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleReviewSubtask(e, st.id, 'REJECT')}
                              className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/40 text-[9px] font-mono font-bold transition-all cursor-pointer"
                              title="Từ chối và gửi lý do"
                            >
                              ❌ Từ chối
                            </button>
                          </>
                        )}
                      </div>
                    ) : st.approvalStatus === 'REJECTED' ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono font-bold max-w-[120px] truncate"
                          title={`Lý do từ chối: ${st.rejectionReason || 'Cần kiểm tra lại'}`}
                        >
                          ❌ Chưa đạt: {st.rejectionReason || 'Cần sửa'}
                        </span>
                        {isWorkerDoingTask && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleSubtask?.(task.id, st.id, false);
                            }}
                            className="px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-[9px] font-mono font-black transition-all cursor-pointer shadow-sm"
                            title="Gửi lại yêu cầu duyệt sau khi đã sửa xong"
                          >
                            🔄 Gửi Lại
                          </button>
                        )}
                      </div>
                    ) : st.isUrgent && !st.isDone ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500 text-white font-mono font-black shrink-0 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]">
                         GẤP
                      </span>
                    ) : st.isDone ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono shrink-0">
                        ✓ Xong
                      </span>
                    ) : isFirstPending ? (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-black shrink-0 ${
                        idx === 0
                          ? 'bg-amber-500 text-slate-950 animate-pulse'
                          : 'bg-slate-800 text-amber-300 border border-amber-500/30'
                      }`}>
                        {idx === 0 ? ` HÔM NAY (${sched})` : `📅 LỊCH: ${sched}`}
                      </span>
                    ) : (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-900 text-slate-500 font-mono shrink-0">
                        📅 {sched}
                      </span>
                    )}
                  </div>
                );
              })}
              {task.progress === 100 && (
                <div className="pt-1 text-center">
                  <span className="text-[10px] font-bold text-emerald-300 flex items-center justify-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" /> Đã hoàn thành tất cả Task con!
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Standard Single Progress Bar */
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-400 font-medium">Tiến độ</span>
            <span className="font-bold text-amber-400">{task.progress}%</span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                task.progress === 100
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  : task.progress > 50
                  ? 'bg-gradient-to-r from-amber-500 to-purple-500'
                  : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
              }`}
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 min-w-0">
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (allAssignees.length > 1) {
              setIsMembersModalOpen(true);
            } else {
              handleOpenAssigneeProfile(e, allAssignees[0] || task.assignee);
            }
          }}
          className="flex items-center gap-1.5 min-w-0 flex-1 hover:text-amber-300 transition-colors cursor-pointer group/assignee"
          title={allAssignees.length > 1 ? 'Nhấn để xem danh sách tất cả người làm task này' : 'Nhấn để xem hồ sơ nhân sự'}
        >
          {/* Avatar Stack Group */}
          {allAssignees.length > 1 ? (
            <div className="flex items-center -space-x-1.5 overflow-hidden shrink-0">
              {allAssignees.slice(0, 3).map((u, i) => (
                <div
                  key={u.id || i}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenAssigneeProfile(e, u);
                  }}
                  className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-[8px] text-cyan-300 overflow-hidden shadow-sm hover:border-amber-400 transition-colors cursor-pointer"
                  title={`Xem hồ sơ: ${u.fullName}`}
                >
                  {u.avatar ? (
                    <img src={getAvatarUrl(u)} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span>{u.fullName ? u.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : 'UA'}</span>
                  )}
                </div>
              ))}
              {allAssignees.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-cyan-950 border border-slate-700 flex items-center justify-center font-bold text-[8px] text-cyan-300">
                  +{allAssignees.length - 3}
                </div>
              )}
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-[9px] text-amber-300 overflow-hidden shrink-0 group-hover/assignee:border-amber-400 transition-colors">
              {(allAssignees[0] || task.assignee)?.avatar ? (
                <img src={getAvatarUrl(allAssignees[0] || task.assignee)} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{(allAssignees[0] || task.assignee)?.fullName ? (allAssignees[0] || task.assignee).fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : 'UA'}</span>
              )}
            </div>
          )}
          <span
            className="truncate font-medium text-slate-300 max-w-[105px] group-hover/assignee:text-amber-300 transition-colors"
            title={
              allAssignees.length > 1
                ? allAssignees.map((u) => u.fullName).join(', ')
                : (allAssignees[0] || task.assignee)?.fullName || 'Chưa phân công'
            }
          >
            {allAssignees.length > 1
              ? `${allAssignees.length} người làm`
              : (allAssignees[0] || task.assignee)?.fullName?.replace(/\s*\([^)]*\)/g, '') || 'Chưa phân công'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {task.dueDate && (() => {
            try {
              const due = new Date(task.dueDate);
              const formatted = !isNaN(due.getTime())
                ? `${String(due.getDate()).padStart(2, '0')}/${String(due.getMonth() + 1).padStart(2, '0')}`
                : task.dueDate.slice(5);

              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const target = new Date(due);
              target.setHours(0, 0, 0, 0);
              const isOverdue = target.getTime() < today.getTime() && task.status !== 'DONE';

              return (
                <div
                  className={`flex items-center gap-1 font-mono text-[10px] ${
                    isOverdue ? 'text-rose-400 font-bold' : 'text-slate-400'
                  }`}
                  title={isOverdue ? 'Đã quá hạn deadline!' : `Hạn chót: ${task.dueDate}`}
                >
                  <Clock className={`w-3 h-3 shrink-0 ${isOverdue ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`} />
                  <span>{formatted}</span>
                </div>
              );
            } catch {
              return (
                <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
                  <Clock className="w-3 h-3 shrink-0 text-amber-400" />
                  <span>{task.dueDate.slice(5)}</span>
                </div>
              );
            }
          })()}
          {task.commentsCount !== undefined && (
            <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
              <MessageSquare className="w-3 h-3 shrink-0 text-purple-400" />
              <span>{task.commentsCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* 👥 Modal Danh Sách Tất Cả Thành Viên Cùng Làm Task Này */}
      {isMembersModalOpen && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          onClick={(e) => {
            e.stopPropagation();
            setIsMembersModalOpen(false);
          }}
          className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-[#0F172A] border border-amber-500/40 shadow-2xl p-6 space-y-5 animate-solar-warp-in text-left"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Thành Viên Thực Hiện ({allAssignees.length} người)</h3>
                  <p className="text-[11px] text-slate-400 truncate max-w-[260px]">{task.title}</p>
                </div>
              </div>
              <button
                onClick={() => setIsMembersModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-900 border border-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {allAssignees.map((u, idx) => (
                <div
                  key={u.id || idx}
                  className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-3 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={getAvatarUrl(u)}
                      alt={u.fullName}
                      className="w-10 h-10 rounded-xl object-cover border border-slate-700 bg-slate-950 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="font-bold text-white text-xs block truncate group-hover:text-amber-300">
                        {u.fullName}
                      </span>
                      <span className="text-[10px] text-amber-400/90 font-mono block truncate">
                        {u.roleInTask}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      setIsMembersModalOpen(false);
                      handleOpenAssigneeProfile(e, u);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] shrink-0 transition-all cursor-pointer shadow-sm"
                  >
                    Xem Hồ Sơ
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setIsMembersModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 🌟 UNIVERSAL USER PROFILE MODAL */}
      <UserProfileModal
        user={profileUser}
        isOpen={!!profileUser}
        onClose={() => setProfileUser(null)}
      />
    </div>
  );
});

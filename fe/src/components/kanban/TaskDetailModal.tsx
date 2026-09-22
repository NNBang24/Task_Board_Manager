import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  FolderKanban,
  MessageSquare,
  Send,
  Sparkles,
  Paperclip,
  Link as LinkIcon,
  FileText,
  Upload,
  Plus,
  ExternalLink,
  CheckCircle2,
  Lock,
  Download,
  Edit3,
  Check,
  Trash2,
  ListTodo,
  CheckSquare,
  Square,
} from 'lucide-react';
import type { TaskItem, SubtaskItem } from './KanbanCard';
import { useAuthStore } from '../../store/useAuthStore';
import { api } from '../../services/api';
import { UserProfileModal, type UserProfileData } from '../common/UserProfileModal';
import { getAvatarUrl } from '../../utils/avatar';
import { TaskActivityTimeline } from '../activity/TaskActivityTimeline';
interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: TaskItem | null;
  onStatusChange?: (taskId: string, newStatus: TaskItem['status']) => void;
  onDeleteTask?: (task: TaskItem) => void;
  onUpdateTask?: (updatedTask: TaskItem) => void;
}

interface CommentItem {
  id: string;
  author: string;
  avatar: string;
  text: string;
  createdAt: string;
}

interface AttachmentItem {
  id: string;
  name: string;
  url: string;
  type: 'file' | 'link';
  size?: string;
  createdAt: string;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  isOpen,
  onClose,
  task,
  onDeleteTask,
  onUpdateTask,
}) => {
  const currentUser = useAuthStore((state) => state.user);
  const [profileUser, setProfileUser] = useState<UserProfileData | null>(null);

  const handleOpenProfile = (userObj?: any, roleFallback: string = 'EMPLOYEE') => {
    if (!userObj) return;
    setProfileUser({
      id: userObj.id || 'u-member',
      fullName: userObj.fullName || userObj.name || 'Thành viên Solaris',
      email:
        userObj.email ||
        `${(userObj.fullName || userObj.name || 'member').toLowerCase().replace(/[^a-z0-9]/g, '.')}@solaris.io`,
      avatarUrl: getAvatarUrl(userObj),
      avatar: getAvatarUrl(userObj),
      jobTitle: userObj.profession ? `${userObj.profession} Specialist` : 'Software Specialist',
      department: 'Engineering',
      globalRole: roleFallback,
      statusSignal: 'ONLINE',
      workMode: 'OFFICE',
    });
  };

  //  PRECISE OWNERSHIP CHECK: Khi đã giao việc, Task thuộc hoàn toàn về Assignee (người tạo không còn sở hữu, trừ Admin/Manager)
  const hasAssignee = Boolean(task?.assigneeId || task?.assignee?.id || task?.assignee?.email);
  const isAssignee = Boolean(
    currentUser &&
    task &&
    (task.assigneeId === currentUser.id ||
      task.assignee?.id === currentUser.id ||
      (task.assignee?.email && currentUser.email === task.assignee.email))
  );

  const isCreator = Boolean(
    currentUser &&
    task &&
    (task.createdById === currentUser.id ||
      task.createdBy?.id === currentUser.id ||
      ((task.createdBy as any)?.email && currentUser.email === (task.createdBy as any).email))
  );

  const isAdminOrManager = Boolean(
    currentUser &&
    (currentUser.globalRole === 'ADMIN' ||
      currentUser.globalRole === 'MANAGER' ||
      (currentUser as any).role === 'ADMIN' ||
      (currentUser as any).role === 'MANAGER')
  );

  const isMyTask = Boolean(currentUser && (isAdminOrManager || (hasAssignee ? isAssignee : isCreator)));

  // Quyền thêm việc con: CHỈ người trực tiếp đảm nhiệm Task (Assignee) hoặc Admin/Manager mới được tạo
  const canManageSubtasks = Boolean(
    currentUser &&
    (currentUser.globalRole === 'ADMIN' ||
      currentUser.globalRole === 'MANAGER' ||
      (currentUser as any).role === 'ADMIN' ||
      (currentUser as any).role === 'MANAGER' ||
      isAssignee ||
      (!hasAssignee && isCreator))
  );

  // 🔒 Quyền TICK việc con [✓]: CHỈ người TRỰC TIẾP LÀM TASK (Assignee) mới được tick (Không phải Admin hay Creator)
  const isWorkerDoingTask = Boolean(
    currentUser &&
    (task?.assigneeId === currentUser.id ||
      task?.assignee?.id === currentUser.id ||
      (task?.assignee?.email && currentUser.email === task.assignee.email))
  );

  // 📝 Edit Description States
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionText, setDescriptionText] = useState(task?.description || '');
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  // 🔘 Subtasks / Checklist States
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskIsUrgent, setNewSubtaskIsUrgent] = useState(false);
  const [newSubtaskAssigneeId, setNewSubtaskAssigneeId] = useState('');
  const [newSubtaskDays, setNewSubtaskDays] = useState(1);
  const [newSubtaskStartDate, setNewSubtaskStartDate] = useState('');
  const [dbUsers, setDbUsers] = useState<any[]>([]);
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);

  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Attachments State
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

  const [urlInput, setUrlInput] = useState('');
  const [urlTitleInput, setUrlTitleInput] = useState('');
  const [showAddUrlForm, setShowAddUrlForm] = useState(false);

  useEffect(() => {
    if (isOpen && task) {
      setDescriptionText(task.description || '');
      setIsEditingDescription(false);
      fetchComments();
      setAttachments(task.attachments || []);
      setSubtasks(task.subtasks || []);
      setNewSubtaskAssigneeId(task.assigneeId || (task.assignee as any)?.id || '');
      setNewSubtaskStartDate(task.startDate || new Date().toISOString().slice(0, 10));

      api
        .get('/profile/users')
        .then((res) => {
          const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
          setDbUsers(list);
          if (list.length > 0 && !task.assigneeId && !newSubtaskAssigneeId) {
            setNewSubtaskAssigneeId(list[0].id);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, task?.id, task?.description, task?.attachments, task?.subtasks, task?.assigneeId, task?.startDate]);

  // ➕ Thêm Task con mới
  const handleAddSubtask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!task) return;
    const title = newSubtaskTitle.trim();
    if (!title || isAddingSubtask) return;

    setIsAddingSubtask(true);
    try {
      const res = await api.post(`/tasks/${task.id}/subtasks`, {
        title,
        isUrgent: newSubtaskIsUrgent,
        assigneeId: newSubtaskAssigneeId || undefined,
        startDate: newSubtaskStartDate || undefined,
        estimatedDays: newSubtaskDays,
      });
      const updatedTask = res.data?.data || res.data;
      if (updatedTask && updatedTask.id) {
        setSubtasks(updatedTask.subtasks || []);
        if (onUpdateTask) {
          onUpdateTask(updatedTask);
        }
      }
      setNewSubtaskTitle('');
      setNewSubtaskIsUrgent(false);
      setNewSubtaskDays(1);
    } catch (err: any) {
      console.error('Lỗi thêm Task con:', err);
      const serverMsg = err.response?.data?.message || err.message || 'Không thể thêm Task con';
      alert(`⚠️ ${serverMsg}`);
    } finally {
      setIsAddingSubtask(false);
    }
  };

  // 🚨 Đổi mức khẩn cấp (Urgent) của Task con
  const handleToggleUrgentSubtask = async (subtaskId: string, currentUrgent?: boolean) => {
    if (!task) return;
    const previousSubtasks = [...subtasks];
    const updated = subtasks.map((st) => (st.id === subtaskId ? { ...st, isUrgent: !currentUrgent } : st));
    setSubtasks(updated);

    try {
      const res = await api.patch(`/tasks/subtasks/${subtaskId}`, {
        isUrgent: !currentUrgent,
      });
      const updatedTask = res.data?.data || res.data;
      if (updatedTask && updatedTask.id) {
        setSubtasks(updatedTask.subtasks || []);
        if (onUpdateTask) {
          onUpdateTask(updatedTask);
        }
      }
    } catch (err: any) {
      console.error('Lỗi cập nhật mức khẩn cấp Task con:', err);
      setSubtasks(previousSubtasks);
    }
  };

  // 🔄 Đổi trạng thái Task con (Toggle isDone)
  const handleToggleSubtask = async (subtaskId: string, currentDone: boolean) => {
    if (!task || currentDone) return;
    const previousSubtasks = [...subtasks];

    // Optimistic update:
    const updated: SubtaskItem[] = subtasks.map((st) => {
      if (st.id !== subtaskId) return st;
      if (isAdminOrManager && isWorkerDoingTask) {
        return { ...st, isDone: true, approvalStatus: 'APPROVED' as const };
      }
      return { ...st, isDone: false, approvalStatus: 'PENDING' as const };
    });
    setSubtasks(updated);

    try {
      const res = await api.patch(`/tasks/subtasks/${subtaskId}`, {
        isDone: true,
      });
      const updatedTask = res.data?.data || res.data;
      if (updatedTask && updatedTask.id) {
        setSubtasks(updatedTask.subtasks || []);
        if (onUpdateTask) {
          onUpdateTask(updatedTask);
        }
      }
    } catch (err: any) {
      console.error('Lỗi cập nhật Task con:', err);
      setSubtasks(previousSubtasks);
      const serverMsg = err.response?.data?.message || err.message || 'Không thể cập nhật tiến độ Task con';
      alert(`⚠️ ${serverMsg}`);
    }
  };

  // 🔍 Quản lý Duyệt / Từ chối / Mở lại Task con
  const handleReviewSubtask = async (subtaskId: string, action: 'APPROVE' | 'REJECT' | 'REOPEN') => {
    if (!task) return;
    let reason: string | undefined = undefined;
    if (action === 'REJECT') {
      const inputReason = window.prompt('Nhập lý do từ chối xác thực Task con này:');
      if (inputReason === null) return;
      reason = inputReason.trim() || 'Chưa đạt yêu cầu, vui lòng hoàn thiện lại';
    } else if (action === 'REOPEN') {
      const inputReason = window.prompt('Nhập lý do mở lại Task con này để nhân sự sửa lại:');
      if (inputReason === null) return;
      reason = inputReason.trim() || 'Quản lý mở lại để kiểm tra và chỉnh sửa';
    }

    try {
      const res = await api.patch(`/tasks/subtasks/${subtaskId}/review`, { action, reason });
      const updatedTask = res.data?.data || res.data;
      if (updatedTask && updatedTask.id) {
        setSubtasks(updatedTask.subtasks || []);
        if (onUpdateTask) {
          onUpdateTask(updatedTask);
        }
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Không thể thực hiện đánh giá Task con');
    }
  };

  // 🗑️ Xóa Task con
  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!task) return;
    const previousSubtasks = [...subtasks];
    const updated = subtasks.filter((st) => st.id !== subtaskId);
    setSubtasks(updated);

    try {
      const res = await api.delete(`/tasks/subtasks/${subtaskId}`);
      const updatedTask = res.data?.data || res.data;
      if (updatedTask && updatedTask.id) {
        setSubtasks(updatedTask.subtasks || []);
        if (onUpdateTask) {
          onUpdateTask(updatedTask);
        }
      }
    } catch (err: any) {
      console.error('Lỗi xóa Task con:', err);
      setSubtasks(previousSubtasks);
      const serverMsg = err.response?.data?.message || err.message || 'Không thể xóa Task con';
      alert(`⚠️ ${serverMsg}`);
    }
  };

  const handleSaveDescription = async () => {
    if (!task || isSavingDescription) return;
    setIsSavingDescription(true);

    // 🛡️ Safe fallback for mock/demo task IDs or offline tasks
    const isMockTask =
      !task.id || task.id.startsWith('task_') || task.id.startsWith('demo_') || task.id.includes('temp');

    if (isMockTask) {
      if (onUpdateTask) {
        onUpdateTask({ ...task, description: descriptionText.trim() });
      }
      setIsEditingDescription(false);
      setIsSavingDescription(false);
      return;
    }

    try {
      let res;
      try {
        res = await api.patch(`/tasks/${task.id}/description`, {
          description: descriptionText.trim(),
        });
      } catch (firstErr: any) {
        if (firstErr.response?.status === 404) {
          // Fallback to generic task update route
          res = await api.patch(`/tasks/${task.id}`, {
            description: descriptionText.trim(),
          });
        } else {
          throw firstErr;
        }
      }

      const updated = res.data?.data || res.data;
      if (onUpdateTask) {
        onUpdateTask({ ...task, ...updated, description: descriptionText.trim() });
      }
      setIsEditingDescription(false);
    } catch (err: any) {
      console.error('Lỗi khi cập nhật mô tả task:', err);
      // If server returns 404 because task was created on client or test session, update local state
      if (err.response?.status === 404) {
        if (onUpdateTask) {
          onUpdateTask({ ...task, description: descriptionText.trim() });
        }
        setIsEditingDescription(false);
      } else {
        const serverMsg = err.response?.data?.message || err.message || 'Không thể cập nhật mô tả Task';
        alert(`⚠️ Lỗi: ${serverMsg}`);
      }
    } finally {
      setIsSavingDescription(false);
    }
  };

  const fetchComments = async () => {
    if (!task) return;
    try {
      const res = await api.get(`/tasks/${task.id}/comments`);
      const commentList = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.data) ? res.data.data : [];
      setComments(commentList);
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    if (isOpen && task) {
      fetchComments();
      setAttachments(task.attachments || []);
    }
  }, [isOpen, task?.id, task?.attachments]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !newComment.trim() || isSubmittingComment) return;

    setIsSubmittingComment(true);
    try {
      await api.post(`/tasks/${task.id}/comments`, { content: newComment });
      setNewComment('');
      fetchComments();
    } catch {
      // Fallback
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // 📎 Handle Local File Selection (Upload)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!task) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post(`/tasks/${task.id}/attachments`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      const newAtt = res.data?.data || res.data;
      if (newAtt && newAtt.id) {
        const nextAtts = [newAtt, ...attachments];
        setAttachments(nextAtts);
        if (onUpdateTask) {
          onUpdateTask({ ...task, attachments: nextAtts });
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải file lên:', err);
    }
    e.target.value = '';
  };

  // 🔗 Handle Add Custom URL Attachment
  const handleAddUrlAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !urlInput.trim()) return;

    const formattedUrl = urlInput.startsWith('http') ? urlInput : `https://${urlInput}`;
    const name = urlTitleInput.trim() || formattedUrl;

    try {
      const res = await api.post(`/tasks/${task.id}/attachments`, {
        name,
        url: formattedUrl,
        type: 'link',
      });
      const newAtt = res.data?.data || res.data;
      if (newAtt && newAtt.id) {
        const nextAtts = [newAtt, ...attachments];
        setAttachments(nextAtts);
        if (onUpdateTask) {
          onUpdateTask({ ...task, attachments: nextAtts });
        }
      }
      setUrlInput('');
      setUrlTitleInput('');
      setShowAddUrlForm(false);
    } catch (err) {
      console.error('Lỗi khi liên kết URL:', err);
    }
  };

  // 📥 Handle Download File / Attachment Data
  const handleDownloadAttachment = (att: AttachmentItem) => {
    let downloadUrl = att.url;
    if (att.url.startsWith('/uploads/')) {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
      const backendUrl = apiBase.replace('/api', '');
      downloadUrl = `${backendUrl}${att.url}`;
    }

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = att.name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 🗑️ Remove Attachment
  const handleRemoveAttachment = async (id: string) => {
    try {
      await api.delete(`/tasks/attachments/${id}`);
      const nextAtts = attachments.filter((a) => a.id !== id);
      setAttachments(nextAtts);
      if (onUpdateTask && task) {
        onUpdateTask({ ...task, attachments: nextAtts });
      }
    } catch (err) {
      console.error('Lỗi khi xóa đính kèm:', err);
    }
  };

  const getStatusBadge = (status: TaskItem['status']) => {
    switch (status) {
      case 'TODO':
        return { text: 'CẦN LÀM (TODO)', color: 'bg-slate-500/20 text-slate-300 border-slate-500/40' };
      case 'IN_PROGRESS':
        return { text: 'ĐANG LÀM (IN PROGRESS)', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
      case 'PAUSED':
        return { text: 'TẠM DỪNG (PAUSED)', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
      case 'BLOCKED':
        return { text: 'TẮC NGHỄN (BLOCKED)', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
      case 'IN_REVIEW':
        return { text: 'CHỜ DUYỆT (IN REVIEW) 🔒', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
      case 'DONE':
        return { text: 'HOÀN THÀNH (DONE)', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
    }
  };

  const getDeadlineInfo = (dueDateStr?: string) => {
    if (!dueDateStr) {
      return {
        formattedDate: 'Chưa đặt deadline',
        statusText: 'Không giới hạn thời gian',
        statusColor: 'text-slate-400',
      };
    }

    try {
      const due = new Date(dueDateStr);
      if (isNaN(due.getTime())) {
        return {
          formattedDate: dueDateStr,
          statusText: 'Định dạng ngày',
          statusColor: 'text-slate-400',
        };
      }

      // Format Vietnamese date: DD/MM/YYYY
      const formattedDate = `${String(due.getDate()).padStart(2, '0')}/${String(due.getMonth() + 1).padStart(2, '0')}/${due.getFullYear()}`;

      // Calculate difference in days from today (normalized to midnight)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const targetDate = new Date(due);
      targetDate.setHours(0, 0, 0, 0);

      const diffTime = targetDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        return {
          formattedDate,
          statusText: ` Đã quá hạn ${Math.abs(diffDays)} ngày`,
          statusColor: 'text-rose-400 font-bold',
        };
      } else if (diffDays === 0) {
        return {
          formattedDate,
          statusText: ' Hạn chót: Hôm nay',
          statusColor: 'text-amber-400 font-bold',
        };
      } else if (diffDays === 1) {
        return {
          formattedDate,
          statusText: ' Còn lại 1 ngày (Ngày mai)',
          statusColor: 'text-amber-300',
        };
      } else {
        return {
          formattedDate,
          statusText: `Còn lại ${diffDays} ngày làm việc`,
          statusColor: 'text-slate-400',
        };
      }
    } catch {
      return {
        formattedDate: dueDateStr,
        statusText: 'Ngày chỉ định',
        statusColor: 'text-slate-400',
      };
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'Vừa tạo gần đây';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      return `${time} • ${date}`;
    } catch {
      return dateStr;
    }
  };

  if (!isOpen || !task) return null;

  const statusStyle = getStatusBadge(task.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      {/* Minisite Bento Card Container */}
      <div className="w-full max-w-4xl max-h-[90vh] solar-glass-card rounded-3xl bg-[#0F172A]/95 border border-amber-500/40 shadow-[0_0_60px_rgba(245,158,11,0.25)] relative overflow-hidden flex flex-col animate-solar-warp-in">
        {/* Background Cosmic Glows */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* 🌠 Minisite Header */}
        <div className="p-6 md:p-8 border-b border-slate-800/80 flex items-start justify-between gap-4 relative z-10">
          <div className="space-y-3 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-3 py-1 rounded-xl text-xs font-extrabold border ${statusStyle.color}`}>
                {statusStyle.text}
              </span>

              {task.priority === 'URGENT' && (
                <span className="px-3 py-1 rounded-xl text-xs font-bold border bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-[0_0_12px_rgba(239,68,68,0.3)] animate-pulse">
                   KHẨN CẤP (URGENT)
                </span>
              )}

              <span className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-mono text-xs flex items-center gap-1.5 truncate max-w-full">
                <FolderKanban className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">{task.projectName || 'Solaris Task Board Core'}</span>
              </span>

              {isMyTask ? (
                <span className="px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-xs flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> TASK CHÍNH CHỦ
                </span>
              ) : isCreator ? (
                <span className="px-3 py-1 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold text-xs flex items-center gap-1 shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" /> NGƯỜI GIAO VIỆC
                </span>
              ) : (
                <span className="px-3 py-1 rounded-xl bg-slate-800 text-slate-400 font-bold text-xs flex items-center gap-1 shrink-0">
                  <Lock className="w-3.5 h-3.5 text-slate-500" /> LOCK
                </span>
              )}
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-snug break-words max-w-full">
              {task.title}
            </h1>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer shrink-0"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 🚀 Minisite Body Content */}
        <div className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1 relative z-10 text-xs min-w-0 max-w-full">
          {/* 🔄 IN_REVIEW & TRANSFER ROUTE BENTO CARD */}
          {(task.status === 'IN_REVIEW' || task.transferInfo) && (
            <div className="solar-glass-card p-5 rounded-2xl bg-gradient-to-r from-purple-950/80 via-slate-950 to-amber-950/60 border border-purple-500/60 space-y-4 animate-fade-in shadow-2xl">
              <div className="flex items-center justify-between border-b border-purple-500/30 pb-2.5">
                <span className="text-xs font-black text-purple-300 uppercase tracking-wider flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-purple-400" />
                  THÔNG TIN CHUYỂN GIAO TASK (TASK TRANSFER DETAIL)
                </span>
                {task.status === 'IN_REVIEW' ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-mono font-bold animate-pulse">
                     TRẠNG THÁI: IN_REVIEW (CHỜ DUYỆT BÀI)
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold">
                    BÀN GIAO THÀNH CÔNG
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 📤 NGƯỜI CHUYỂN GIAO */}
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-amber-500/40 space-y-2">
                  <span className="text-[11px] font-extrabold text-amber-400 uppercase tracking-wider block">
                     NGƯỜI CHUYỂN GIAO (SENDER):
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl overflow-hidden border border-amber-400 bg-slate-950 flex items-center justify-center font-extrabold text-amber-400 text-sm shrink-0">
                      {task.transferInfo?.senderAvatar ? (
                        <img src={task.transferInfo.senderAvatar} alt="Sender" className="w-full h-full object-cover" />
                      ) : task.createdBy?.avatar ? (
                        <img src={task.createdBy.avatar} alt="Sender" className="w-full h-full object-cover" />
                      ) : (
                        <span>
                          {task.transferInfo?.senderName
                            ? task.transferInfo.senderName.slice(0, 2).toUpperCase()
                            : task.createdBy?.fullName
                              ? task.createdBy.fullName.slice(0, 2).toUpperCase()
                              : 'SD'}
                        </span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-extrabold text-white text-sm">
                        {task.transferInfo?.senderName || task.createdBy?.fullName || 'Người khởi tạo'}
                      </h4>
                      <span className="text-[10px] text-amber-300 font-mono">Người khởi tạo / Gửi bàn giao</span>
                    </div>
                  </div>
                </div>

                {/* 📥 NGƯỜI TIẾP NHẬN */}
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-blue-500/40 space-y-2">
                  <span className="text-[11px] font-extrabold text-blue-400 uppercase tracking-wider block">
                     NGƯỜI TIẾP NHẬN (RECEIVER):
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl overflow-hidden border border-blue-400 bg-slate-950 flex items-center justify-center font-extrabold text-blue-400 text-sm shrink-0">
                      {task.transferInfo?.receiverAvatar ? (
                        <img
                          src={task.transferInfo.receiverAvatar}
                          alt="Receiver"
                          className="w-full h-full object-cover"
                        />
                      ) : task.assignee?.avatar ? (
                        <img src={task.assignee.avatar} alt="Receiver" className="w-full h-full object-cover" />
                      ) : (
                        <span>
                          {task.transferInfo?.receiverName
                            ? task.transferInfo.receiverName.slice(0, 2).toUpperCase()
                            : task.assignee?.fullName
                              ? task.assignee.fullName.slice(0, 2).toUpperCase()
                              : 'RC'}
                        </span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-extrabold text-white text-sm">
                        {task.transferInfo?.receiverName || task.assignee?.fullName || 'Người tiếp nhận'}
                      </h4>
                      <span className="text-[10px] text-blue-300 font-mono">Người được chỉ định tiếp nhận</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 📝 GHI CHÚ NỘI DUNG CHUYỂN GIAO */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 space-y-1">
                <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider block">
                  Lý do / Ghi chú chuyển giao:
                </span>
                <p className="italic text-xs text-white">
                  "{task.transferInfo?.note || 'Yêu cầu chuyển giao và bàn giao Task tác nghiệp.'}"
                </p>
              </div>
            </div>
          )}

          {/* 🌟 3-CARD METADATA BENTO GRID: NGƯỜI GIAO VIỆC • NGƯỜI THỰC HIỆN • HẠN DEADLINE */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/*  Người Giao Việc (Created / Assigned By) */}
            <div
              onClick={() => handleOpenProfile(task.createdBy, 'MANAGER')}
              className="solar-glass-card p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-purple-500/50 space-y-2 cursor-pointer transition-all group/creator"
              title="Nhấn để xem hồ sơ người giao việc"
            >
              <span className="text-[11px] font-mono text-purple-400 uppercase tracking-wider block font-bold flex items-center justify-between">
                <span>👑 Người Giao Việc</span>
                <span className="text-[10px] text-purple-400/80 opacity-0 group-hover/creator:opacity-100 transition-opacity">
                  Xem hồ sơ ↗
                </span>

              </span>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden border border-purple-400/80 bg-slate-900 flex items-center justify-center font-bold text-purple-300 shrink-0 group-hover/creator:scale-105 transition-transform">
                  {task.createdBy?.avatar ? (
                    <img src={task.createdBy.avatar} alt="Creator" className="w-full h-full object-cover" />
                  ) : (
                    <span>
                      {task.createdBy?.fullName
                        ? task.createdBy.fullName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()
                        : 'CR'}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4
                    className="font-extrabold text-white text-sm truncate group-hover/creator:text-purple-300 transition-colors"
                    title={task.createdBy?.fullName || 'Người khởi tạo'}
                  >
                    {task.createdBy?.fullName || 'Người khởi tạo'}
                  </h4>
                  <span
                    className="text-[10px] text-purple-300 font-mono flex items-center gap-1 truncate"
                    title={`Thời gian giao việc: ${task.createdAt || 'N/A'}`}
                  >
                    <Clock className="w-3 h-3 text-purple-400 shrink-0" />
                    {formatDateTime(task.createdAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* 🎯 Người Thực Hiện (Assignee) */}
            <div
              onClick={() => handleOpenProfile(task.assignee, 'EMPLOYEE')}
              className="solar-glass-card p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-amber-500/50 space-y-2 cursor-pointer transition-all group/assignee"
              title="Nhấn để xem hồ sơ người thực hiện"
            >
              <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider block font-bold flex items-center justify-between">
                <span>🎯 Người Thực Hiện</span>
                <span className="text-[10px] text-amber-400/80 opacity-0 group-hover/assignee:opacity-100 transition-opacity">
                  Xem hồ sơ ↗
                </span>

              </span>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden border border-amber-400 bg-slate-900 flex items-center justify-center font-bold text-amber-400 shrink-0 group-hover/assignee:scale-105 transition-transform">
                  {task.assignee?.avatar ? (
                    <img src={task.assignee.avatar} alt="Assignee" className="w-full h-full object-cover" />
                  ) : (
                    <span>
                      {task.assignee?.fullName
                        ? task.assignee.fullName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()
                        : 'UA'}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4
                    className="font-extrabold text-white text-sm truncate group-hover/assignee:text-amber-300 transition-colors"
                    title={task.assignee?.fullName || 'Chưa phân công'}
                  >
                    {task.assignee?.fullName || 'Chưa phân công (Unassigned)'}
                  </h4>
                  <span className="text-[11px] text-blue-300 font-mono truncate block">
                    {task.assignee?.profession || 'MEMBER'} • Chuyên Môn
                  </span>
                </div>
              </div>
            </div>

            {/* ⏳ Lịch Trình (Bắt Đầu & Deadline) */}
            {(() => {
              const deadlineInfo = getDeadlineInfo(task.dueDate);
              return (
                <div className="solar-glass-card p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider block font-bold">
                    📅 Lộ Trình Thực Hiện
                  </span>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">Bắt đầu:</span>
                      <span className="text-amber-300 font-bold">{task.startDate || 'Ngay bây giờ'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">Hạn chót:</span>
                      <span className="text-emerald-300 font-extrabold">{deadlineInfo.formattedDate}</span>
                    </div>
                    <span className={`text-[10px] font-mono ${deadlineInfo.statusColor} block pt-0.5`}>
                      {deadlineInfo.statusText}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Description Section */}
          <div className="solar-glass-card p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-amber-300 text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Mô Tả Chi Tiết Task (Task Description)
              </h3>
              {isMyTask && !isEditingDescription && (
                <button
                  onClick={() => setIsEditingDescription(true)}
                  className="px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Sửa Mô Tả</span>
                </button>
              )}
            </div>

            {isEditingDescription ? (
              <div className="space-y-3 animate-fade-in">
                <textarea
                  value={descriptionText}
                  onChange={(e) => setDescriptionText(e.target.value)}
                  placeholder="Nhập nội dung mô tả chi tiết Task..."
                  rows={4}
                  className="w-full p-3.5 rounded-xl bg-slate-900 border border-amber-500/60 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs leading-relaxed resize-y font-normal"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDescriptionText(task.description || '');
                      setIsEditingDescription(false);
                    }}
                    disabled={isSavingDescription}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white font-semibold text-xs cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDescription}
                    disabled={isSavingDescription}
                    className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {isSavingDescription ? 'Đang Lưu...' : 'Lưu Thay Đổi'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-slate-300 leading-relaxed font-normal whitespace-pre-wrap break-words max-w-full overflow-hidden">
                {task.description || 'Chưa có mô tả chi tiết cho Task này.'}
              </p>
            )}
          </div>

          {/* 🔘 SUBTASKS & CHECKLIST BREAKDOWN BENTO SECTION */}
          <div className="solar-glass-card p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-white text-sm">
                  Danh Sách Task Con (Subtasks) ({subtasks.filter((st) => st.isDone).length}/{subtasks.length})
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
                    task.progress === 100
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {task.progress}% Hoàn thành
                </span>
              </div>
            </div>

            {/* Neon Progress Bar */}
            <div className="space-y-1">
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    task.progress === 100
                      ? 'bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                      : 'bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                  }`}
                  style={{ width: `${task.progress}%` }}
                />
              </div>
            </div>

            {/* Subtasks List */}
            <div className="space-y-2">
              {subtasks.map((st, idx) => {
                const firstPendingIdx = subtasks.findIndex((s) => !s.isDone);
                const isToday = idx === firstPendingIdx;
                const effectiveAssigneeId = st.assigneeId || task.assigneeId || task.assignee?.id;
                const isWorkerForThisSubtask = Boolean(
                  currentUser &&
                  (effectiveAssigneeId === currentUser.id ||
                    (task.assignee?.email && !st.assigneeId && currentUser.email === task.assignee.email))
                );
                const isTaskPausedOrBlocked = task.status === 'PAUSED' || task.status === 'BLOCKED';
                const canToggleSubtask =
                  isWorkerForThisSubtask && !st.isDone && st.approvalStatus !== 'PENDING' && !isTaskPausedOrBlocked;

                return (
                  <div
                    key={st.id || idx}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 group/sub ${
                      st.isDone
                        ? 'opacity-40 grayscale select-none pointer-events-none cursor-not-allowed bg-slate-950/40 border-slate-800/40 text-slate-500'
                        : st.isUrgent
                          ? 'bg-red-950/20 border-red-500/60 text-slate-100 shadow-[0_0_15px_rgba(239,68,68,0.25)]'
                          : isToday
                            ? 'bg-gradient-to-r from-amber-500/15 via-purple-600/10 to-slate-900/90 border-amber-500/50 shadow-md'
                            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-200 shadow-sm'
                    }`}
                  >
                    {(() => {
                      const schedStr = (() => {
                        const currentDays = Number(st.estimatedDays || 1);
                        let sDate: Date;

                        if (st.startDate) {
                          sDate = new Date(st.startDate);
                          sDate.setHours(0, 0, 0, 0);
                        } else {
                          const base = task.startDate
                            ? new Date(task.startDate)
                            : new Date(task.createdAt || Date.now());
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
                        const fmt = (d: Date) =>
                          `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                        return currentDays === 1 ? fmt(sDate) : `${fmt(sDate)} - ${fmt(eDate)}`;
                      })();

                      return (
                        <>
                          <div
                            onClick={() => canToggleSubtask && handleToggleSubtask(st.id, st.isDone)}
                            title={
                              st.isDone
                                ? '🔒 Task con này đã hoàn thành'
                                : canToggleSubtask
                                  ? 'Nhấn để gửi xác thực hoàn thành'
                                  : '🔒 Chỉ người trực tiếp làm task mới có quyền tick hoàn thành'
                            }
                            className={`flex items-center gap-3 flex-1 min-w-0 ${canToggleSubtask ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}
                          >
                            <button
                              type="button"
                              disabled={!canToggleSubtask}
                              className={`shrink-0 text-slate-400 group-hover/sub:text-amber-400 transition-colors ${canToggleSubtask ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                            >
                              {st.isDone ? (
                                <CheckSquare className="w-4 h-4 text-emerald-400 fill-emerald-500/20" />
                              ) : (
                                <Square
                                  className={`w-4 h-4 ${canToggleSubtask ? 'text-slate-500 group-hover/sub:text-amber-400' : 'text-slate-600'}`}
                                />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-mono text-amber-300/80 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 font-bold">
                                  📅 {schedStr}
                                </span>
                                <span className="text-[10px] font-mono text-purple-300/80 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-500/30">
                                  ⏳ {st.estimatedDays || 1} ngày
                                </span>
                                <span
                                  className={`text-xs font-medium leading-relaxed ${
                                    st.isDone ? 'line-through text-slate-500' : 'text-slate-200'
                                  }`}
                                >
                                  {st.title}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Actions & Assignee Badge */}
                          <div className="flex items-center gap-2 shrink-0">
                            {st.assignee && (
                              <span
                                className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/40 flex items-center gap-1"
                                title={`Phụ trách: ${st.assignee.fullName}`}
                              >
                                👤 {st.assignee.fullName.replace(/\s*\([^)]*\)/g, '')}
                              </span>
                            )}

                            {/* 🚨 Nút Bật/Tắt Khẩn Cấp (Urgent) Cho Task Con */}
                            {canManageSubtasks && !st.isDone && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleUrgentSubtask(st.id, st.isUrgent);
                                }}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-all cursor-pointer border ${
                                  st.isUrgent
                                    ? 'bg-red-500 text-white border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.6)] animate-pulse'
                                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-red-300 hover:border-red-500/40'
                                }`}
                                title="Đặt/Hủy mức độ khẩn cấp (URGENT) cho Task con này"
                              >
                                {st.isUrgent ? '🚨 GẤP' : '⚪ Bình thường'}
                              </button>
                            )}

                            {/* ⏳ Trạng thái Chờ Quản Lý Duyệt (Pending Approval) */}
                            {st.approvalStatus === 'PENDING' && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold animate-pulse">
                                  ⏳ Chờ Duyệt
                                </span>
                                {isAdminOrManager && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleReviewSubtask(st.id, 'APPROVE');
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[10px] font-mono font-bold transition-all cursor-pointer shadow-sm"
                                      title="Duyệt hoàn thành Task con này"
                                    >
                                      ✓ Duyệt
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleReviewSubtask(st.id, 'REJECT');
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/40 text-[10px] font-mono font-bold transition-all cursor-pointer"
                                      title="Từ chối và gửi lý do"
                                    >
                                      ❌ Từ Chối
                                    </button>
                                  </>
                                )}
                              </div>
                            )}

                            {/* ❌ Bị Từ Chối (Rejected) & Nút Gửi Duyệt Lại */}
                            {st.approvalStatus === 'REJECTED' && (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="text-[10px] px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono font-bold max-w-[180px] truncate"
                                  title={`Lý do từ chối: ${st.rejectionReason || 'Cần kiểm tra lại'}`}
                                >
                                  ❌ Chưa đạt: {st.rejectionReason || 'Cần sửa'}
                                </span>
                                {isWorkerDoingTask && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleSubtask(st.id, false);
                                    }}
                                    className="px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-[10px] font-mono font-black transition-all cursor-pointer shadow-sm flex items-center gap-1"
                                    title="Gửi lại yêu cầu xác thực sau khi đã chỉnh sửa xong"
                                  >
                                    🔄 Gửi Duyệt Lại
                                  </button>
                                )}
                              </div>
                            )}

                            {isToday &&
                              !st.isDone &&
                              !st.isUrgent &&
                              st.approvalStatus !== 'PENDING' &&
                              st.approvalStatus !== 'REJECTED' && (
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-black ${
                                    firstPendingIdx === 0
                                      ? 'bg-amber-500 text-slate-950 animate-pulse'
                                      : 'bg-slate-800 text-amber-300 border border-amber-500/30'
                                  }`}
                                >
                                  {firstPendingIdx === 0 ? `🔥 HÔM NAY (${schedStr})` : `📅 LỊCH: ${schedStr}`}
                                </span>
                              )}

                            {st.isDone && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold">
                                  ✓ Xong
                                </span>
                                {isAdminOrManager && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleReviewSubtask(st.id, 'REOPEN');
                                    }}
                                    className="px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold transition-all cursor-pointer shadow-sm"
                                    title="Quản lý mở lại Task con này để nhân sự sửa lại"
                                  >
                                    ↩️ Mở Lại
                                  </button>
                                )}
                              </div>
                            )}

                            {canManageSubtasks && (
                              <button
                                onClick={() => handleDeleteSubtask(st.id)}
                                className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors opacity-0 group-hover/sub:opacity-100 cursor-pointer"
                                title="Xóa Task con này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                );
              })}

              {subtasks.length === 0 && (
                <p className="text-slate-500 italic py-2 text-xs text-center">
                  Task này chưa có Task con. Hãy nhập bên dưới để chia nhỏ quy trình làm việc!
                </p>
              )}
            </div>

            {/* Quick Add Subtask Input Form */}
            {canManageSubtasks && (
              <form onSubmit={handleAddSubtask} className="flex items-center gap-2 pt-1 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="+ Thêm Task con mới... (Nhấn Enter để tạo)"
                    className="w-full p-2.5 pl-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 focus:border-amber-500 text-white placeholder-slate-500 focus:outline-none text-xs font-medium transition-all"
                  />
                </div>
                <select
                  value={newSubtaskAssigneeId}
                  onChange={(e) => setNewSubtaskAssigneeId(e.target.value)}
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-cyan-300 font-mono text-xs focus:outline-none focus:border-amber-500 cursor-pointer max-w-[140px] truncate"
                  title="Chỉ định nhân sự thực hiện Task con này"
                >
                  {dbUsers.map((u) => (
                    <option key={u.id} value={u.id} className="bg-[#0F172A] text-slate-200">
                      👤 {u.fullName}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={newSubtaskStartDate}
                  onChange={(e) => setNewSubtaskStartDate(e.target.value)}
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-amber-300 font-mono text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
                  title="Ngày bắt đầu Task con"
                />
                <select
                  value={newSubtaskDays}
                  onChange={(e) => setNewSubtaskDays(Number(e.target.value))}
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
                  title="Thời gian làm việc ước lượng (ngày)"
                >
                  <option value={1}>1 ngày</option>
                  <option value={2}>2 ngày</option>
                  <option value={3}>3 ngày</option>
                  <option value={4}>4 ngày</option>
                  <option value={5}>5 ngày</option>
                </select>
                <button
                  type="button"
                  onClick={() => setNewSubtaskIsUrgent(!newSubtaskIsUrgent)}
                  className={`px-3 py-2.5 rounded-xl font-mono text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                    newSubtaskIsUrgent
                      ? 'bg-red-500 text-white border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-red-300'
                  }`}
                >
                  🚨 {newSubtaskIsUrgent ? 'Việc Gấp' : 'Đặt Gấp?'}
                </button>
                <button
                  type="submit"
                  disabled={!newSubtaskTitle.trim() || isAddingSubtask}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-40 transition-all shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm Task Con
                </button>
              </form>
            )}

            {!isWorkerDoingTask && (
              <div className="pt-2 border-t border-slate-800/80 text-slate-500 italic text-[11px] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Chỉ người trực tiếp thực hiện Task mới có quyền đánh dấu hoàn thành Task con.</span>
              </div>
            )}
          </div>

          {/* 📎 ATTACHMENTS & LINK EMBED BENTO SECTION */}
          <div className="solar-glass-card p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-white text-sm">Tài Liệu Đính Kèm & Links ({attachments.length})</h3>
              </div>

              {/* 👑 PERMISSION CONTROLLED ACTION BUTTONS */}
              {isMyTask ? (
                <div className="flex items-center gap-2">
                  <label className="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all">
                    <Upload className="w-3.5 h-3.5 text-purple-400" />
                    <span>Upload Tệp</span>
                    <input type="file" onChange={handleFileUpload} className="hidden" />
                  </label>

                  <button
                    onClick={() => setShowAddUrlForm(!showAddUrlForm)}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <LinkIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span>Chèn URL</span>
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-slate-500 italic flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Chỉ chính chủ Task mới có quyền đính kèm tệp/URL
                </span>
              )}
            </div>

            {/* Form Chèn URL */}
            {isMyTask && showAddUrlForm && (
              <form
                onSubmit={handleAddUrlAttachment}
                className="p-4 rounded-xl bg-slate-900/90 border border-amber-500/40 space-y-3 animate-fade-in"
              >
                <h4 className="font-bold text-amber-300 text-xs">Chèn Đường Dẫn URL Hoặc Tài Liệu Mẫu</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={urlTitleInput}
                    onChange={(e) => setUrlTitleInput(e.target.value)}
                    placeholder="Tiêu đề gợi nhớ (VD: Figma Design System)"
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="Đường dẫn URL (VD: https://figma.com/file/...)"
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddUrlForm(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white font-semibold"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm Liên Kết
                  </button>
                </div>
              </form>
            )}

            {/* Attachments List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 hover:border-amber-500/40 flex items-center justify-between gap-3 transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        att.type === 'file'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {att.type === 'file' ? <FileText className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <a
                        href={
                          att.url.startsWith('/uploads/')
                            ? `${(import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace('/api', '')}${att.url}`
                            : att.url
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-slate-200 hover:text-amber-400 truncate block transition-colors flex items-center gap-1"
                      >
                        <span className="truncate">{att.name}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {att.size ? `${att.size} • ` : ''}
                        {att.createdAt}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleDownloadAttachment(att)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                      title="Tải tệp/dữ liệu này về máy"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                      <span>Tải Về</span>
                    </button>

                    {isMyTask && (
                      <button
                        onClick={() => handleRemoveAttachment(att.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Xóa tệp/URL này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 💬 Comments Section */}
          <div className="solar-glass-card p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-400" />
              Bình Luận & Lịch Sử Tác Nghiệp ({comments.length})
            </h3>

            {/* Comments List với thanh cuộn */}
            <div className="max-h-60 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-slate-700">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5 min-w-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-amber-300 truncate">{c.author}</span>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">{c.createdAt}</span>
                  </div>
                  <p className="text-slate-200 break-words whitespace-pre-wrap">{c.text}</p>
                </div>
              ))}

              {comments.length === 0 && (
                <p className="text-slate-500 italic py-2">Chưa có bình luận nào. Hãy trao đổi tiến độ đầu tiên!</p>
              )}
            </div>

            {/* New Comment Input */}
            <form onSubmit={handleAddComment} className="flex items-center gap-2 pt-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Nhập bình luận hoặc trao đổi tiến độ..."
                className="flex-1 p-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-semibold"
              />
              <button
                type="submit"
                disabled={isSubmittingComment}
                className="px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
              >
                <Send className="w-4 h-4" /> {isSubmittingComment ? 'Đang gửi...' : 'Gửi'}
              </button>
            </form>
          </div>
          <div className="solar-glass-card p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
            <TaskActivityTimeline taskId={task.id} />
          </div>
        </div>

        {/* 🎬 Minisite Footer Action Bar */}
        <div className="p-4 md:px-8 border-t border-slate-800/80 bg-slate-950/90 flex items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>
              Mã Task ID: <strong className="font-mono text-amber-300">{task.id}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {(currentUser?.globalRole === 'ADMIN' || currentUser?.globalRole === 'MANAGER') && (
              <button
                onClick={() => {
                  onDeleteTask?.(task);
                }}
                className="px-4 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md hover:border-rose-400"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>Xóa Task</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="solar-corona-btn px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs tracking-wider shadow-md transition-all cursor-pointer"
            >
              Đóng Minisite
            </button>
          </div>
        </div>
      </div>

      {/* 🌟 UNIVERSAL USER PROFILE MODAL */}
      <UserProfileModal user={profileUser} isOpen={!!profileUser} onClose={() => setProfileUser(null)} />
    </div>
  );
};

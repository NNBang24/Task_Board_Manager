import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useAuthStore } from '../store/useAuthStore';

// 🚀 Dedicated Fixed DND Portal Container (Zero Clipping + Zero Screen Shift + No Scrollbar Flash)
const getPortalRoot = () => {
  let element = document.getElementById('solar-dnd-portal');
  if (!element) {
    element = document.createElement('div');
    element.id = 'solar-dnd-portal';
    element.style.position = 'fixed';
    element.style.top = '0';
    element.style.left = '0';
    element.style.right = '0';
    element.style.bottom = '0';
    element.style.overflow = 'hidden';
    element.style.pointerEvents = 'none';
    element.style.zIndex = '999999';
    document.body.appendChild(element);
  }
  return element;
};
import { KanbanCard, type TaskItem } from '../components/kanban/KanbanCard';
import { api } from '../services/api';
import { socketService } from '../services/socket';
import { SolarNotificationModal } from '../components/common/SolarNotificationModal';
import { TaskRequestModal } from '../components/kanban/TaskRequestModal';
import { TaskDetailModal } from '../components/kanban/TaskDetailModal';
import { CreateProjectModal } from '../components/kanban/CreateProjectModal';
import { CreateTaskModal } from '../components/kanban/CreateTaskModal';
import { ProjectMembersModal } from '../components/kanban/ProjectMembersModal';
import { NotificationCenter } from '../components/navigation/NotificationCenter';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import {
  Inbox,
  Search,
  Kanban,
  GitMerge,
  Target,
  CheckCircle2,
  Filter,
  UserCheck,
  Users,
  Pause,
  RefreshCw,
  PlusCircle,
  FolderPlus,
  Play,
  Sliders,
  Sparkles,
  Zap,
  Folder,
  Lock,
  Unlock,
  Paperclip,
  ExternalLink,
  Trash2,
  Bell,
  RotateCcw,
} from 'lucide-react';

import { TaskTransferInboxModal } from '../components/kanban/TaskTransferInboxModal';
import { DeleteTaskConfirmModal } from '../components/kanban/DeleteTaskConfirmModal';
import {TaskActivityTimeline} from '../components/activity/TaskActivityTimeline'
export const BoardPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const [activeView, setActiveView] = useState<'kanban' | 'pipeline' | 'focus'>('kanban');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isTransferInboxOpen, setIsTransferInboxOpen] = useState(false);
  const [pendingNotificationCount, setPendingNotificationCount] = useState<number>(0);
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [selectedPipelineProject, setSelectedPipelineProject] = useState<string>('ALL');
  const [focusFilterMode, setFocusFilterMode] = useState<'ALL' | 'URGENT' | 'IN_PROGRESS'>('ALL');
  const [isEditingPipelineStages, setIsEditingPipelineStages] = useState(false);
  const [isStageLockingEnabled, setIsStageLockingEnabled] = useState(true);
  const [activePipelineStages, setActivePipelineStages] = useState([
    { id: 'stage_1', name: '1. Yêu Cầu & Phân Tích', status: 'IN_PROGRESS', color: 'border-blue-500/40 text-blue-300' },
    { id: 'stage_2', name: '2. Thiết Kế UI/UX', status: 'IN_PROGRESS', color: 'border-purple-500/40 text-purple-300' },
    { id: 'stage_3', name: '3. Lập Trình Backend/Frontend', status: 'IN_PROGRESS', color: 'border-amber-500/40 text-amber-300' },
    { id: 'stage_4', name: '4. Kiểm Thử QA/QC', status: 'TODO', color: 'border-rose-500/40 text-rose-300' },
    { id: 'stage_5', name: '5. Chạy Thử Staging', status: 'TODO', color: 'border-cyan-500/40 text-cyan-300' },
    { id: 'stage_6', name: '6. Bàn Giao & Nghiệm Thu', status: 'DONE', color: 'border-emerald-500/40 text-emerald-300' },
  ]);
  const [newStageNameInput, setNewStageNameInput] = useState('');

  const [selectedTaskForRequest, setSelectedTaskForRequest] = useState<TaskItem | null>(null);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<TaskItem | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<TaskItem | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [recentlyMovedTaskId, setRecentlyMovedTaskId] = useState<string | null>(null);
  const [isProjectMembersModalOpen, setIsProjectMembersModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  // Dynamic Metadata States (Read from PostgreSQL DB)
  const [dbProjects, setDbProjects] = useState<Array<any>>([]);
  const [dbUsers, setDbUsers] = useState<Array<{ id: string; fullName: string }>>([]);

  // Multi-Criteria Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState<string>('ALL');
  const [filterAssignee, setFilterAssignee] = useState<string>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [filterProfession, setFilterProfession] = useState<string>('ALL');

  const fetchMetadata = async () => {
    try {
      const [projRes, userRes] = await Promise.all([
        api.get('/projects'),
        api.get('/profile/users'),
      ]);

      setDbProjects(Array.isArray(projRes.data) ? projRes.data : projRes.data?.data || []);
      setDbUsers(Array.isArray(userRes.data) ? userRes.data : userRes.data?.data || []);
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    fetchMetadata();
  }, [token]);

  // State xác nhận khi kéo Task vào cột DONE
  const [confirmDoneTask, setConfirmDoneTask] = useState<{
    taskId: string;
    taskTitle: string;
  } | null>(null);

  // 🌟 State Prompt Hỏi Tiến Hành Việc Ngày Mai (Tôn trọng thời gian nhân viên)
  const [workAheadModal, setWorkAheadModal] = useState<{
    taskId: string;
    taskTitle: string;
    nextSubtaskTitle: string;
    nextDayIndex: number;
    dueDate?: string;
  } | null>(null);

  // ☕ / ⚡ Trạng thái Nghỉ Ngơi vs Làm Trước Việc Ngày Mai cho Task
  const [, setRestingTodayTasks] = useState<Record<string, boolean>>({});
  const [, setWorkingAheadTasks] = useState<Record<string, boolean>>({});

  // Custom Solar Notification Modal State
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  });

  const showNotification = (message: string, type: 'success' | 'warning' | 'info' = 'info', title = 'Thông Báo Hệ Thống') => {
    setModalState({
      isOpen: true,
      title,
      message,
      type,
    });
  };

  // 🗄️ Task dataset fetched straight from PostgreSQL Database
  const [tasks, setTasks] = useState<Array<TaskItem & { assigneeId?: string }>>([]);

  // Fetch real task dataset from Backend API
  const fetchTasksFromBackend = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/tasks?limit=300');
      const responseData = res.data;
      const taskArray = Array.isArray(responseData)
        ? responseData
        : Array.isArray(responseData?.data)
        ? responseData.data
        : [];
      setTasks(taskArray);
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNotificationCount = async () => {
    try {
      const res = await api.get('/tasks/requests/incoming');
      const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setPendingNotificationCount(list.length);
    } catch {
      // Fallback
    }
  };

  const fetchProjectsFromBackend = async () => {
    try {
      const res = await api.get('/projects');
      const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setDbProjects(list);
    } catch {
      // Fallback
    }
  };

  const handleToggleProjectCompletion = async (projectId: string, isCompleted: boolean) => {
    try {
      await api.patch(`/projects/${projectId}`, { isCompleted });
      showNotification(
        isCompleted
          ? '🎉 Đã xác nhận nghiệm thu và hoàn thành dự án thành công!'
          : '🔄 Đã mở lại dự án thành công!',
        'success',
        isCompleted ? 'Nghiệm Thu Thành Công' : 'Đã Mở Lại Dự Án'
      );
      fetchProjectsFromBackend();
      fetchTasksFromBackend();
    } catch (err: any) {
      showNotification(
        err?.response?.data?.message || 'Không thể cập nhật trạng thái dự án.',
        'warning',
        'Lỗi Cập Nhật'
      );
    }
  };

  useEffect(() => {
    fetchTasksFromBackend();
    fetchProjectsFromBackend();
    fetchNotificationCount();
  }, [token]);

  // ⚡ Socket.IO Real-time Connection & Rooms Integration
  useEffect(() => {
    if (!token) return;

    // Connect to WebSocket server
    socketService.connect();

    // Listen for updates
    const handleSocketUpdate = () => {
      console.log('⚡ Real-time update received via Socket.IO');
      fetchTasksFromBackend();
      fetchNotificationCount();
    };

    const handleApprovalRequested = (data: any) => {
      fetchTasksFromBackend();
      fetchNotificationCount();
      showNotification(
        `🔔 Có yêu cầu xác thực Task con: "${data?.subtaskTitle || 'Task con'}" từ ${data?.senderName || 'Đồng nghiệp'}`,
        'info',
        'Yêu Cầu Xác Thực'
      );
    };

    const handleSubtaskReviewed = (data: any) => {
      fetchTasksFromBackend();
      fetchNotificationCount();
      if (data?.action === 'APPROVE') {
        showNotification(
          `🎉 Quản lý đã duyệt hoàn thành Task con: "${data?.subtaskTitle || 'Task con'}"!`,
          'success',
          'Đã Phê Duyệt'
        );
      } else {
        showNotification(
          `⚠️ Quản lý từ chối Task con: "${data?.subtaskTitle || 'Task con'}". Lý do: ${data?.reason || 'Cần kiểm tra lại'}`,
          'warning',
          'Chưa Đạt Yêu Cầu'
        );
      }
    };

    socketService.on('task:created', handleSocketUpdate);
    socketService.on('task:updated', handleSocketUpdate);
    socketService.on('task:deleted', handleSocketUpdate);
    socketService.on('comment:created', handleSocketUpdate);
    socketService.on('task:approval-requested', handleApprovalRequested);
    socketService.on('task:subtask-reviewed', handleSubtaskReviewed);

    // Auto-fetch latest task dataset on connection restored
    const unsubscribeReconnect = socketService.onReconnect(() => {
      console.log('🔄 Syncing full task state after connection restored');
      fetchTasksFromBackend();
      fetchNotificationCount();
    });

    return () => {
      socketService.off('task:created', handleSocketUpdate);
      socketService.off('task:updated', handleSocketUpdate);
      socketService.off('task:deleted', handleSocketUpdate);
      socketService.off('comment:created', handleSocketUpdate);
      socketService.off('task:approval-requested', handleApprovalRequested);
      socketService.off('task:subtask-reviewed', handleSubtaskReviewed);
      unsubscribeReconnect();
    };
  }, [token]);

  // Join/leave project rooms dynamically when project filter changes
  useEffect(() => {
    if (!token) return;

    if (filterProject && filterProject !== 'ALL') {
      socketService.joinProject(filterProject);
      return () => {
        socketService.leaveProject(filterProject);
      };
    } else if (filterProject === 'ALL' && dbProjects.length > 0) {
      dbProjects.forEach((proj) => {
        socketService.joinProject(proj.id);
      });
      return () => {
        dbProjects.forEach((proj) => {
          socketService.leaveProject(proj.id);
        });
      };
    }
  }, [filterProject, token, dbProjects]);

  // 🔘 Handler toggle completion of a subtask directly from Card or Modal
  const handleToggleSubtask = async (taskId: string, subtaskId: string, _isDone?: boolean) => {
    const targetTask = tasks.find((t) => t.id === taskId);
    const targetSubtask = targetTask?.subtasks?.find((st) => st.id === subtaskId);
    if (targetSubtask?.isDone) {
      showNotification('🔒 Task con này đã hoàn thành và được xác nhận, không thể thay đổi.', 'warning', 'Đã Khóa');
      return;
    }

    const isAdminOrManager = Boolean(
      user &&
        (user.globalRole === 'ADMIN' ||
          user.globalRole === 'MANAGER' ||
          (user as any).role === 'ADMIN' ||
          (user as any).role === 'MANAGER')
    );

    // Optimistic UI update across all task lists (Không giật % nếu là nhân viên nộp duyệt)
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const subtasks = (t.subtasks || []).map((st: any) => {
          if (st.id !== subtaskId) return st;
          if (isAdminOrManager) {
            return { ...st, isDone: true, approvalStatus: 'APPROVED' };
          }
          return { ...st, isDone: false, approvalStatus: 'PENDING' };
        });
        const completedCount = subtasks.filter((st) => st.isDone).length;
        const progress = subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : t.progress;
        return { ...t, subtasks, progress };
      })
    );

    try {
      const res = await api.patch(`/tasks/subtasks/${subtaskId}`, { isDone: true });
      const updatedTask = res.data?.data || res.data;
      if (updatedTask && updatedTask.id) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...updatedTask } : t))
        );
        if (selectedTaskForDetail?.id === taskId) {
          setSelectedTaskForDetail((prev) => (prev ? { ...prev, ...updatedTask } : updatedTask));
        }
      }
    } catch (err: any) {
      console.error('Lỗi khi cập nhật Task con:', err);
      const serverMsg = err.response?.data?.message || err.message || 'Không thể cập nhật Task con';
      showNotification(serverMsg, 'warning', 'Lỗi Cập Nhật Task Con');
      fetchTasksFromBackend();
    }
  };

  // 🎯 Handler hoàn thành mục tiêu ngày hôm nay kèm cơ chế Prompt Tôn Trọng Nhân Viên
  const handleCompleteTodaySubtask = async (task: TaskItem, todaySubtask: any, currentPendingIdx: number) => {
    if (task.status === 'PAUSED' || task.status === 'BLOCKED') {
      showNotification(
        `Task "${task.title}" đang ở trạng thái ${task.status === 'PAUSED' ? 'Tạm Dừng' : 'Bị Khóa/Nghẽn'}, không thể nộp Task con.`,
        'warning',
        'Task Đang Tạm Dừng'
      );
      return;
    }

    await handleToggleSubtask(task.id, todaySubtask.id, true);

    const subtasks = task.subtasks || [];
    const nextIdx = currentPendingIdx + 1;
    const nextSubtask = nextIdx < subtasks.length ? subtasks[nextIdx] : null;

    if (nextSubtask) {
      setWorkAheadModal({
        taskId: task.id,
        taskTitle: task.title,
        nextSubtaskTitle: nextSubtask.title,
        nextDayIndex: nextIdx + 1,
        dueDate: task.dueDate,
      });
    } else {
      showNotification(`🎉 Bạn đã hoàn thành xuất sắc toàn bộ các Task con của "${task.title}"!`, 'success', 'Hoàn Thành Task');
    }
  };

  // 🚀 FIXED DRAG-AND-DROP HANDLER WITH OPTIMISTIC UPDATES & ATOMIC BACKEND SYNC
  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // Drop outside any container
    if (!destination) return;

    // Drop in the exact same spot
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const targetStatus = destination.droppableId as TaskItem['status'];
    const taskToMove = tasks.find((t) => t.id === draggableId);
    if (!taskToMove) return;

    // 🔒 1. BỊ CẤM: Drag Ownership Rule
    const isManagerOrAdmin = Boolean(
      user?.globalRole === 'ADMIN' ||
      user?.globalRole === 'MANAGER' ||
      (user as any)?.role === 'ADMIN' ||
      (user as any)?.role === 'MANAGER'
    );
    const hasAssignee = Boolean(taskToMove.assigneeId || taskToMove.assignee?.id || taskToMove.assignee?.email);
    const isSubtaskAssignee = Boolean(
      taskToMove.subtasks &&
      taskToMove.subtasks.some((st) => st.assigneeId === user?.id || st.assignee?.id === user?.id)
    );
    const isTaskOwner = hasAssignee
      ? (taskToMove.assigneeId === user?.id ||
         taskToMove.assignee?.id === user?.id ||
         taskToMove.assignee?.email === user?.email ||
         isSubtaskAssignee)
      : (taskToMove as any).createdById === user?.id || isSubtaskAssignee;

    if (!isManagerOrAdmin && !isTaskOwner) {
      showNotification(
        `Task này đã được giao cho ${taskToMove.assignee?.fullName || 'thành viên khác'}! Bạn không có quyền kéo thả Task của người khác.`,
        'warning',
        'Quyền Hạn Bị Từ Chối (Drag Ownership)'
      );
      return;
    }

    // 🔒 2. BỊ CẤM: Cột IN_REVIEW bị khóa
    if (taskToMove.status === 'IN_REVIEW' || targetStatus === 'IN_REVIEW') {
      showNotification(
        'Cột CHỜ DUYỆT BÀI (IN_REVIEW) là tự động! Không thể kéo thả thủ công vào hoặc ra khỏi cột này.',
        'warning',
        'Khóa Cột Chờ Duyệt (IN_REVIEW Lock)'
      );
      return;
    }

    // 🎯 3. KÉO VÀO CỘT DONE -> KIỂM TRA SUBTASK CHƯA DUYỆT
    if (targetStatus === 'DONE') {
      const subtasks = taskToMove.subtasks || [];
      const hasUnfinishedSubtasks = subtasks.length > 0 && subtasks.some((st) => !st.isDone);
      if (hasUnfinishedSubtasks) {
        showNotification(
          `Không thể chuyển sang Hoàn Thành khi còn ${subtasks.filter((st) => !st.isDone).length} Task con chưa được Quản lý phê duyệt (Tiến độ: ${taskToMove.progress || 0}%).`,
          'warning',
          'Chưa Hoàn Tất Task Con'
        );
        return;
      }

      setConfirmDoneTask({
        taskId: draggableId,
        taskTitle: taskToMove.title,
      });
      return;
    }

    // ⚡ 4. CẬP NHẬT TỨC THÌ TRÊN GIAO DIỆN & BẬT ANIMATION DROP SNAP (0ms Delay)
    setRecentlyMovedTaskId(draggableId);
    setTimeout(() => {
      setRecentlyMovedTaskId(null);
    }, 800);

    const safeProgress = Math.round(targetStatus === 'TODO' ? 0 : (taskToMove.progress || 0));

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === draggableId) {
          return { ...t, status: targetStatus, progress: safeProgress };
        }
        return t;
      })
    );

    // 🚀 Cập nhật CSDL ngầm
    api.patch(`/tasks/${draggableId}/status`, {
      status: targetStatus,
      progress: safeProgress,
    }).catch((err: any) => {
      const respMsg = err.response?.data?.message;
      const errMsg = Array.isArray(respMsg)
        ? respMsg.join(', ')
        : (respMsg || err.message || 'Không thể cập nhật trạng thái Task');
      showNotification(errMsg, 'warning', 'Lỗi Cập Nhật Trạng Thái');
      fetchTasksFromBackend();
    });
  };

  // 📈 Handle Drag and Drop for Pipeline Stages View (Cập nhật Giai đoạn Dự Án)
  const handlePipelineDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const targetStageId = destination.droppableId;
    const taskToMove = tasks.find((t) => t.id === draggableId);
    if (!taskToMove) return;

    // 🔒 1. Drag Ownership Rule: Cho phép Assignee, Admin hoặc Manager có quyền kéo
    const isManagerOrAdmin = Boolean(
      user?.globalRole === 'ADMIN' ||
      user?.globalRole === 'MANAGER' ||
      (user as any)?.role === 'ADMIN' ||
      (user as any)?.role === 'MANAGER'
    );
    const hasAssignee = Boolean(taskToMove.assigneeId || taskToMove.assignee?.id || taskToMove.assignee?.email);
    const isSubtaskAssignee = Boolean(
      taskToMove.subtasks &&
      taskToMove.subtasks.some((st) => st.assigneeId === user?.id || st.assignee?.id === user?.id)
    );
    const isTaskOwner = hasAssignee
      ? (taskToMove.assigneeId === user?.id ||
         taskToMove.assignee?.id === user?.id ||
         taskToMove.assignee?.email === user?.email ||
         isSubtaskAssignee)
      : (taskToMove as any).createdById === user?.id || isSubtaskAssignee;

    if (!isManagerOrAdmin && !isTaskOwner) {
      showNotification(
        `Task này đã được giao cho ${taskToMove.assignee?.fullName || 'thành viên khác'}! Bạn không có quyền chuyển giai đoạn Pipeline của người khác.`,
        'warning',
        'Quyền Hạn Bị Từ Chối (Pipeline Ownership)'
      );
      return;
    }

    // ⚡ 2. Cập nhật tức thì trên giao diện & Animation Snap
    setRecentlyMovedTaskId(draggableId);
    setTimeout(() => {
      setRecentlyMovedTaskId(null);
    }, 800);

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === draggableId) {
          return { ...t, stageId: targetStageId };
        }
        return t;
      })
    );

    const targetStageObj = activePipelineStages.find((s) => s.id === targetStageId);
    showNotification(
      `Đã chuyển Task "${taskToMove.title}" sang giai đoạn "${targetStageObj?.name || targetStageId}" thành công!`,
      'success',
      'Cập Nhật Giai Đoạn Pipeline'
    );

    // 🚀 Gửi API cập nhật stageId vào CSDL Postgres
    api.patch(`/tasks/${draggableId}/status`, {
      stageId: targetStageId,
    }).catch(() => {
      fetchTasksFromBackend();
    });
  };

  // Hàm thực thi Chuyển sang DONE sau khi User bấm Xác Nhận trên Modal (Áp dụng Retry)
  const executeMoveToDone = async () => {
    if (!confirmDoneTask) return;

    const taskId = confirmDoneTask.taskId;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          return { ...t, status: 'DONE', progress: 100 };
        }
        return t;
      })
    );

    setConfirmDoneTask(null);

    try {
      await api.patch(`/tasks/${taskId}/status`, {
        status: 'DONE',
        progress: 100,
      });
    } catch {
      fetchTasksFromBackend();
    }
  };

  // 🗑️ Hàm thực thi Xóa Task khỏi CSDL PostgreSQL khi User bấm Xác Nhận trên Modal (Áp dụng Retry)
  const handleConfirmDeleteTask = async () => {
    if (!taskToDelete) return;
    const deletedId = taskToDelete.id;
    const taskTitle = taskToDelete.title;
    setIsDeleting(true);

    // Optimistic UI update: Remove task immediately
    setTasks((prev) => prev.filter((t) => t.id !== deletedId));
    setIsDeleteModalOpen(false);
    setSelectedTaskForDetail(null);
    setTaskToDelete(null);

    try {
      await api.delete(`/tasks/${deletedId}`);
      showNotification(`🟢 Solaris: Đã xóa Task "${taskTitle}" (Chuyển vào Thùng Rác 14 ngày)!`, 'success', 'Xóa Task Thành Công');
      fetchTasksFromBackend();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Không thể xóa Task';
      showNotification(`❌ Lỗi: ${errMsg}`, 'warning', 'Xóa Task Thất Bại');
      fetchTasksFromBackend();
    } finally {
      setIsDeleting(false);
    }
  };

  // 🗑️ Hàm thực thi Xóa Dự Án (Chuyển vào Thùng Rác 14 ngày) dành cho Admin
  const handleConfirmDeleteProject = async () => {
    if (!projectToDelete) return;
    const deletedProjId = projectToDelete.id;
    const deletedProjName = projectToDelete.name;
    setIsDeleting(true);

    // Optimistic UI update: Remove project and its tasks immediately
    setDbProjects((prev) => prev.filter((p) => p.id !== deletedProjId));
    setTasks((prev) => prev.filter((t) => t.projectId !== deletedProjId));
    setProjectToDelete(null);
    setSelectedPipelineProject('ALL');

    try {
      await api.delete(`/projects/${deletedProjId}`);
      showNotification(`🟢 Đã chuyển dự án "${deletedProjName}" vào Thùng Rác (Lưu giữ 14 ngày)!`, 'success', 'Xóa Dự Án');
      fetchMetadata();
      fetchTasksFromBackend();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Không thể xóa dự án';
      showNotification(`❌ Lỗi: ${errMsg}`, 'warning', 'Xóa Dự Án Thất Bại');
      fetchMetadata();
      fetchTasksFromBackend();
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: Array<{ id: TaskItem['status']; label: string; color: string; border: string }> = [
    { id: 'TODO', label: 'CẦN LÀM (TODO)', color: 'text-slate-400', border: 'border-slate-800' },
    { id: 'IN_PROGRESS', label: 'ĐANG LÀM (IN PROGRESS)', color: 'text-amber-400', border: 'border-slate-800' },
    { id: 'PAUSED', label: 'TẠM DỪNG (PAUSED)', color: 'text-slate-400', border: 'border-slate-800' },
    { id: 'BLOCKED', label: 'TẮC NGHỄN (BLOCKED)', color: 'text-rose-400', border: 'border-slate-800' },
    { id: 'IN_REVIEW', label: 'CHỜ DUYỆT BÀI (IN REVIEW) 🔒', color: 'text-purple-400', border: 'border-slate-800' },
    { id: 'DONE', label: 'HOÀN THÀNH (DONE)', color: 'text-emerald-400', border: 'border-slate-800' },
  ];

  // Apply Multi-Criteria Filters
  const filteredTasks = tasks.filter((task) => {
    // 1. Search Query Filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(query);
      const matchDesc = task.description?.toLowerCase().includes(query) || false;
      if (!matchTitle && !matchDesc) return false;
    }

    // 2. Project Filter
    if (filterProject !== 'ALL' && task.projectName !== filterProject) {
      return false;
    }

    // 3. Assignee Filter
    if (filterAssignee !== 'ALL' && task.assigneeId !== filterAssignee) {
      return false;
    }

    // 4. Priority Filter
    if (filterPriority !== 'ALL' && task.priority !== filterPriority) {
      return false;
    }

    // 5. Profession Filter
    if (filterProfession !== 'ALL' && task.assignee?.profession !== filterProfession) {
      return false;
    }

    return true;
  });

  const handleQuickRequest = (task: TaskItem) => {
    setSelectedTaskForRequest(task);
    setIsRequestModalOpen(true);
  };

  const isRoleAdminOrManager = user?.globalRole === 'ADMIN' || user?.globalRole === 'MANAGER';

  return (
    <div className="space-y-5 pb-12">
      {/* 🚀 Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-semibold text-slate-300">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>SOLARIS WORKSPACE</span>
          </div>

          <button
            onClick={fetchTasksFromBackend}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
            title="Đồng Bộ Dữ Liệu"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {user?.globalRole === 'ADMIN' && (
            <button
              onClick={() => setIsCreateProjectModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5 text-slate-400" />
              <span>+ Tạo Dự Án</span>
            </button>
          )}

          {isRoleAdminOrManager && (
            <button
              onClick={() => setIsProjectMembersModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Quản lý thành viên dự án"
            >
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>Thành Viên</span>
            </button>
          )}

          {isRoleAdminOrManager && (
            <button
              onClick={() => setIsCreateTaskModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs tracking-wide transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ Tạo Task Mới</span>
            </button>
          )}

          <div className="relative hidden lg:block">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm task..."
              className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-700 w-48"
            />
          </div>

          {/* 🔔 Notification Center */}
          <NotificationCenter
            onSelectTaskId={async (id) => {
              const target = tasks.find((t) => t.id === id);
              if (target) {
                setSelectedTaskForDetail(target);
              } else {
                try {
                  const res = await api.get(`/tasks/${id}`);
                  if (res.data) {
                    setSelectedTaskForDetail(res.data);
                  }
                } catch {
                  showNotification(
                    'Công việc này đã bị chuyển vào Thùng Rác hoặc bạn không còn quyền truy cập!',
                    'warning',
                    'Không Thể Mở Task'
                  );
                }
              }
            }}
          />

          {/* 🔔 Task Transfer & Approval Inbox */}
          <button
            onClick={() => {
              setIsTransferInboxOpen(true);
              fetchNotificationCount();
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium flex items-center gap-2 transition-all cursor-pointer"
            title="Trung Tâm Phê Duyệt Task"
          >
            <div className="relative">
              <Bell className="w-3.5 h-3.5 text-slate-400" />
              {pendingNotificationCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white font-mono text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                  {pendingNotificationCount}
                </span>
              )}
            </div>
            <span>Duyệt & Bàn Giao</span>
          </button>
        </div>
      </div>

      {/* 🔍 Advanced Filter Toolbar */}
      <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* View Switcher Tabs */}
        {(() => {
          const tabs = [
            {
              id: 'focus',
              label: "Today's Focus",
              icon: Target,
            },
            {
              id: 'pipeline',
              label: 'Roadmap & Pipeline',
              icon: GitMerge,
            },
            {
              id: 'kanban',
              label: 'Kanban Matrix',
              icon: Kanban,
            },
          ];

          return (
            <div className="p-1 bg-slate-950/80 rounded-xl border border-slate-800/80 flex items-center gap-1">
              {tabs.map((tab) => {
                const IconComponent = tab.icon;
                const isActive = activeView === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveView(tab.id as any)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                      isActive
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <IconComponent className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-slate-500'}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Filters Row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Project Select */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <Filter className="w-3.5 h-3.5 text-amber-400" />
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#0F172A] text-slate-200 font-semibold py-1">Tất Cả Dự Án</option>
              {dbProjects.map((p) => (
                <option key={p.id} value={p.name} className="bg-[#0F172A] text-slate-200 font-semibold py-1">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Assignee Select */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <UserCheck className="w-3.5 h-3.5 text-blue-400" />
            <select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#0F172A] text-slate-200 font-semibold py-1">Tất Cả Nhân Sự</option>
              {dbUsers.map((u) => (
                <option key={u.id} value={u.id} className="bg-[#0F172A] text-slate-200 font-semibold py-1">
                  {u.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Select */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-amber-400 font-bold">★</span>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#0F172A] text-slate-200 font-semibold py-1">Mọi Độ Ưu Tiên</option>
              <option value="URGENT" className="bg-[#0F172A] text-slate-200 font-semibold py-1">URGENT (Khẩn cấp)</option>
              <option value="IMPORTANT" className="bg-[#0F172A] text-slate-200 font-semibold py-1">IMPORTANT (Quan trọng)</option>
              <option value="NORMAL" className="bg-[#0F172A] text-slate-200 font-semibold py-1">NORMAL (Thường)</option>
              <option value="LOW" className="bg-[#0F172A] text-slate-200 font-semibold py-1">LOW (Thấp)</option>
            </select>
          </div>

          {/* Profession Select */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-purple-400 font-bold">🛠️</span>
            <select
              value={filterProfession}
              onChange={(e) => setFilterProfession(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#0F172A] text-slate-200 font-semibold py-1">Mọi Chuyên Môn</option>
              <option value="DEV" className="bg-[#0F172A] text-slate-200 font-semibold py-1">DEV (Lập trình viên)</option>
              <option value="PRODUCT_OWNER" className="bg-[#0F172A] text-slate-200 font-semibold py-1">PRODUCT_OWNER (Quản lý)</option>
              <option value="TESTER" className="bg-[#0F172A] text-slate-200 font-semibold py-1">TESTER (Kiểm thử)</option>
              <option value="DESIGNER" className="bg-[#0F172A] text-slate-200 font-semibold py-1">DESIGNER (Thiết kế)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 📊 VIEW 1: KANBAN 6 COLUMN GRID WITH ULTRA SMOOTH 60FPS PHYSICS SPRING DROP */}
      {activeView === 'kanban' && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 relative z-0">
            {columns.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.id);

              return (
                <Droppable key={col.id} droppableId={col.id} isDropDisabled={col.id === 'IN_REVIEW'}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`solar-glass-card p-4 rounded-2xl bg-[#0F172A]/60 border transition-colors duration-200 min-h-[500px] flex flex-col space-y-3 ${
                        snapshot.isDraggingOver
                          ? 'border-2 border-dashed border-amber-400 bg-amber-500/15 shadow-[0_0_30px_rgba(245,158,11,0.3)]'
                          : col.border
                      }`}
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                        <span className={`text-xs font-extrabold tracking-wider ${col.color}`}>
                          {col.label} {col.id === 'IN_REVIEW' && '🔒'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
                          {colTasks.length}
                        </span>
                      </div>

                      <div className="flex-1 space-y-3">
                        {colTasks.map((t, index) => {
                          const isManagerOrAdmin = Boolean(
                            user?.globalRole === 'ADMIN' ||
                            user?.globalRole === 'MANAGER' ||
                            (user as any)?.role === 'ADMIN' ||
                            (user as any)?.role === 'MANAGER'
                          );
                          const hasAssignee = Boolean(t.assigneeId || t.assignee?.id || t.assignee?.email);
                          const isSubtaskAssignee = Boolean(
                            t.subtasks &&
                            t.subtasks.some((st) => st.assigneeId === user?.id || st.assignee?.id === user?.id)
                          );
                          const isMyOwnTask = hasAssignee
                            ? (t.assigneeId === user?.id ||
                               t.assignee?.id === user?.id ||
                               t.assignee?.email === user?.email ||
                               isSubtaskAssignee)
                            : (t as any).createdById === user?.id || isSubtaskAssignee;
                          const isDragDisabled = t.status === 'IN_REVIEW' || (!isManagerOrAdmin && !isMyOwnTask);

                          return (
                            <Draggable key={t.id} draggableId={t.id} index={index} isDragDisabled={isDragDisabled}>
                              {(providedDraggable, snapshotDraggable) => {
                                const cardElement = (
                                  <div
                                    ref={providedDraggable.innerRef}
                                    {...providedDraggable.draggableProps}
                                    {...providedDraggable.dragHandleProps}
                                    style={{
                                      ...providedDraggable.draggableProps.style,
                                      pointerEvents: 'auto',
                                    }}
                                    className={`transform-gpu ${
                                      snapshotDraggable.isDragging
                                        ? '!z-[999999] rotate-2 scale-105 shadow-[0_0_60px_rgba(245,158,11,0.8)] border-2 border-amber-400 rounded-2xl bg-[#0F172A] cursor-grabbing'
                                        : snapshotDraggable.isDropAnimating || recentlyMovedTaskId === t.id
                                        ? 'animate-solar-drop-snap border-2 border-amber-400/90 rounded-2xl shadow-[0_0_35px_rgba(245,158,11,0.6)]'
                                        : 'hover:-translate-y-0.5 transition-transform duration-150'
                                    }`}
                                  >
                                    <KanbanCard
                                      task={t}
                                      onRequestTransfer={handleQuickRequest}
                                      onCardClick={(taskItem) => setSelectedTaskForDetail(taskItem)}
                                      onToggleSubtask={handleToggleSubtask}
                                      onDeleteTask={(taskItem) => {
                                        setTaskToDelete(taskItem);
                                        setIsDeleteModalOpen(true);
                                      }}
                                    />
                                  </div>
                                );

                                if (snapshotDraggable.isDragging) {
                                  return ReactDOM.createPortal(cardElement, getPortalRoot());
                                }

                                return cardElement;
                              }}
                            </Draggable>
                        );
                      })}
                        {provided.placeholder}

                        {colTasks.length === 0 && (
                          <div className={`h-32 border-2 border-dashed rounded-xl flex items-center justify-center text-xs font-mono transition-colors ${
                            snapshot.isDraggingOver ? 'border-amber-400 text-amber-300 bg-amber-500/10' : 'border-slate-800/60 text-slate-600'
                          }`}>
                            Kéo thả Task vào đây
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Droppable>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* 📈 VIEW 2: MASTER PLAN & PROJECT ROADMAP (VÒNG ĐỜI DỰ ÁN & TIẾN TRÌNH GIAI ĐOẠN) */}
      {activeView === 'pipeline' && (() => {
        // Dynamic list of unique projects filtered by Role: Admin sees all, Manager sees managed projects, Member sees assigned projects
        const isManager = user?.globalRole === 'MANAGER';
        const isMember = user?.globalRole !== 'ADMIN' && user?.globalRole !== 'MANAGER';

        let rawProjectList = tasks.map((t) => t.projectName).filter(Boolean) as string[];

        if (isManager || isMember) {
          const myProjects = tasks
            .filter(
              (t) =>
                t.assigneeId === user?.id ||
                t.assignee?.id === user?.id ||
                (t as any).createdById === user?.id
            )
            .map((t) => t.projectName)
            .filter(Boolean) as string[];

          rawProjectList = rawProjectList.filter((pName) => myProjects.includes(pName));
        }

        const availableProjects = Array.from(new Set(rawProjectList));
        const activeProjectName = selectedPipelineProject;

        // Filter tasks for pipeline by project selection
        const pipelineTasks =
          activeProjectName === 'ALL'
            ? filteredTasks
            : filteredTasks.filter((t) => t.projectName === activeProjectName);

        const totalProjectTasks = pipelineTasks.length;
        const doneProjectTasks = pipelineTasks.filter((t) => t.status === 'DONE').length;
        const projectCompletionPercent =
          totalProjectTasks > 0 ? Math.round((doneProjectTasks / totalProjectTasks) * 100) : 0;

        return (
          <div className="space-y-6 pb-12">
            {/* Header Banner */}
            <div className="solar-glass-card p-6 rounded-3xl bg-[#0F172A]/80 border border-purple-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-purple-300 flex items-center gap-2 mb-1">
                  <GitMerge className="w-6 h-6 text-purple-400" />
                  🌌 Kế Hoạch Tổng Thể & Lộ Trình Dự Án (Master Plan & Roadmap)
                </h2>
                <p className="text-xs text-slate-300">
                  Trực quan hóa vòng đời dự án theo từng giai đoạn (Pipeline Stages) từ Khảo Sát, Thiết Kế đến Bàn Giao & Nghiệm Thu.
                </p>
              </div>

              {/* Project Stats Summary & Edit Toggle */}
              <div className="flex items-center gap-3 flex-wrap shrink-0">
                {(user?.globalRole === 'ADMIN' || user?.globalRole === 'MANAGER') && (
                  <button
                    onClick={() => setIsEditingPipelineStages(!isEditingPipelineStages)}
                    className="px-4 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-md"
                  >
                    <Sliders className="w-4 h-4 text-purple-400" />
                    {isEditingPipelineStages ? '✓ Đóng Quản Lý Giai Đoạn' : '⚙️ Quản Lý Giai Đoạn Pipeline'}
                  </button>
                )}

                <div className="flex items-center gap-3 bg-purple-950/40 p-3 rounded-2xl border border-purple-500/30 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] text-purple-300 font-mono block">TIẾN ĐỘ ROADMAP</span>
                    <span className="text-lg font-black text-amber-400 font-mono">{projectCompletionPercent}%</span>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center font-mono font-bold text-xs text-purple-300">
                    {doneProjectTasks}/{totalProjectTasks}
                  </div>
                </div>
              </div>
            </div>

            {/* ℹ️ THÔNG TIN CƠ BẢN DỰ ÁN (BASIC PROJECT INFO CARD) */}
            {selectedPipelineProject !== 'ALL' && (() => {
              const currentProj = dbProjects.find((p) => p.name === selectedPipelineProject);
              return (
                <div className="solar-glass-card p-5 rounded-2xl bg-gradient-to-r from-purple-950/30 via-[#0F172A] to-slate-900 border border-purple-500/40 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                      <Folder className="w-5 h-5 text-purple-400" />
                      Dự Án: {selectedPipelineProject}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {Boolean(currentProj?.isCompleted) ? (
                        <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          🟢 Đã Nghiệm Thu Hoàn Thành
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                          🔒 Dự Án Đang Hoạt Động (Active Roadmap)
                        </span>
                      )}

                      {/* 🏆 NÚT XÁC NHẬN HOÀN THÀNH DỰ ÁN (CHỈ DÀNH CHO ADMIN KHI ROADMAP ĐẠT 100%) */}
                      {user?.globalRole === 'ADMIN' && currentProj && !currentProj.isCompleted && projectCompletionPercent === 100 && totalProjectTasks > 0 && (
                        <button
                          onClick={() => handleToggleProjectCompletion(currentProj.id, true)}
                          className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400/50 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-950/50 animate-pulse hover:animate-none"
                          title="Xác nhận nghiệm thu & đóng dự án khi đạt 100% tiến độ"
                        >
                          <CheckCircle2 className="w-4 h-4 text-white" />
                          <span>🏆 Xác Nhận Hoàn Thành Dự Án (100% Roadmap)</span>
                        </button>
                      )}

                      {/* 🔄 NÚT MỞ LẠI DỰ ÁN DÀNH CHO ADMIN */}
                      {user?.globalRole === 'ADMIN' && currentProj && Boolean(currentProj.isCompleted) && (
                        <button
                          onClick={() => handleToggleProjectCompletion(currentProj.id, false)}
                          className="px-3 py-1 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                          title="Mở lại dự án để tiếp tục tác nghiệp"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                          <span>Mở Lại Dự Án</span>
                        </button>
                      )}

                      {user?.globalRole === 'ADMIN' && currentProj && (
                        <button
                          onClick={() =>
                            setProjectToDelete({
                              id: currentProj.id,
                              name: currentProj.name,
                            })
                          }
                          className="px-3 py-1 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                          title="Xóa Dự Án (Lưu vào Thùng Rác 14 ngày)"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          <span>Xóa Dự Án</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {currentProj?.description || 'Dự án trọng điểm phát triển hệ thống quản trị công việc và quy trình tác nghiệp.'}
                  </p>
                  <div className="flex items-center gap-6 pt-2 text-xs font-mono border-t border-slate-800 flex-wrap text-slate-400">
                    <div>
                      <span className="text-slate-500 block text-[10px]">PROJECT MANAGER</span>
                      <span className="text-amber-400 font-bold">👤 {user?.fullName || 'Project Lead'}</span>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => setIsProjectMembersModalOpen(true)}
                        className="text-left group/mem cursor-pointer hover:opacity-90 transition-all block"
                        title="Nhấn để mở bảng quản lý, thêm mới hoặc xóa nhân sự dự án"
                      >
                        <span className="text-slate-500 block text-[10px] group-hover/mem:text-amber-400 font-mono transition-colors">
                          TỔNG THÀNH VIÊN (QUẢN LÝ)
                        </span>
                        <span className="text-amber-300 font-bold flex items-center gap-1.5 group-hover/mem:text-amber-200">
                          👥 {(currentProj as any)?._count?.members || 8} Nhân sự
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                            ⚙️ Quản lý
                          </span>
                        </span>
                      </button>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">TỔNG SỐ TASK</span>
                      <span className="text-slate-200 font-bold">📋 {totalProjectTasks} Task</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">HOÀN THÀNH</span>
                      <span className="text-emerald-400 font-bold">✅ {doneProjectTasks} Task ({projectCompletionPercent}%)</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 🎛️ BỘ CHỈNH SỬA GIAI ĐOẠN PIPELINE (IN-PLACE PIPELINE STAGE EDITOR) */}
            {isEditingPipelineStages && (user?.globalRole === 'ADMIN' || user?.globalRole === 'MANAGER') && (
              <div className="solar-glass-card p-5 rounded-2xl bg-purple-950/20 border border-purple-500/40 space-y-4 animate-fade-in">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <h3 className="text-sm font-extrabold text-purple-300 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-purple-400" />
                    Chỉnh Sửa & Thêm Giai Đoạn Pipeline Trực Tiếp ({activePipelineStages.length} giai đoạn)
                  </h3>

                  {/* Lock Toggle */}
                  <button
                    onClick={() => setIsStageLockingEnabled(!isStageLockingEnabled)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isStageLockingEnabled
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {isStageLockingEnabled ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
                    Khóa Nghiêm Ngặt Thứ Tự Chuyển Stage: {isStageLockingEnabled ? 'BẬT (Khóa tuần tự)' : 'TẮT (Tự do)'}
                  </button>
                </div>

                {/* Quick Add Stage Form */}
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={newStageNameInput}
                    onChange={(e) => setNewStageNameInput(e.target.value)}
                    placeholder="Nhập tên giai đoạn mới (VD: 7. Bảo Trì & Hậu Mãi)..."
                    className="flex-1 min-w-[260px] bg-slate-900 border border-purple-500/30 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-purple-400 font-medium"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newStageNameInput.trim()) {
                        const newStage = {
                          id: `stage_${Date.now()}`,
                          name: newStageNameInput.trim(),
                          status: 'TODO',
                          color: 'border-purple-500/40 text-purple-300',
                        };
                        setActivePipelineStages((prev) => [...prev, newStage]);
                        setNewStageNameInput('');
                        showNotification(`🟢 Đã thêm giai đoạn "${newStage.name}" vào quy trình!`, 'success', 'Thêm Giai Đoạn');
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!newStageNameInput.trim()) return;
                      const newStage = {
                        id: `stage_${Date.now()}`,
                        name: newStageNameInput.trim(),
                        status: 'TODO',
                        color: 'border-purple-500/40 text-purple-300',
                      };
                      setActivePipelineStages((prev) => [...prev, newStage]);
                      setNewStageNameInput('');
                      showNotification(`🟢 Đã thêm giai đoạn "${newStage.name}" vào quy trình!`, 'success', 'Thêm Giai Đoạn');
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-md"
                  >
                    <PlusCircle className="w-4 h-4" /> Thêm Giai Đoạn
                  </button>
                </div>

                {/* Stage chips list */}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  {activePipelineStages.map((st, idx) => (
                    <div
                      key={st.id}
                      className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono flex items-center gap-2 group"
                    >
                      <span className="text-purple-400 font-bold">#{idx + 1}</span>
                      <span className="text-slate-200">{st.name}</span>
                      <button
                        onClick={() => {
                          if (activePipelineStages.length <= 2) {
                            showNotification('Pipeline cần tối thiểu 2 giai đoạn quy trình!', 'warning', 'Không Thể Xóa');
                            return;
                          }
                          setActivePipelineStages((prev) => prev.filter((s) => s.id !== st.id));
                          showNotification(`Đã xóa giai đoạn "${st.name}"`, 'info', 'Xóa Giai Đoạn');
                        }}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer ml-1 text-xs"
                        title="Xóa giai đoạn"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 📁 PROJECT PICKER TABS (CHỌN DỰ ÁN XEM ROADMAP) */}
            <div className="solar-glass-card p-3 rounded-2xl bg-[#0F172A]/90 border border-slate-800 flex items-center gap-2 overflow-x-auto">
              <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1.5 px-2">
                <Folder className="w-4 h-4 text-purple-400" /> Chọn Dự Án:
              </span>
              <button
                onClick={() => setSelectedPipelineProject('ALL')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono transition-all shrink-0 cursor-pointer ${
                  selectedPipelineProject === 'ALL'
                    ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.5)]'
                    : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                🌐 Tất Cả Dự Án ({tasks.length})
              </button>
              {availableProjects.map((pName) => {
                const count = tasks.filter((t) => t.projectName === pName).length;
                const isSelected = selectedPipelineProject === pName;
                return (
                  <button
                    key={pName}
                    onClick={() => setSelectedPipelineProject(pName)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.5)]'
                        : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    📁 {pName} ({count})
                  </button>
                );
              })}
            </div>

            {/* 🚀 PIPELINE STAGES DRAG-AND-DROP WORKFLOW BOARD */}
            <DragDropContext onDragEnd={handlePipelineDragEnd}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                {activePipelineStages.map((stage, sIdx) => {
                  const stageTasks = pipelineTasks.filter((t) => {
                    if (t.stageId) return t.stageId === stage.id;
                    return sIdx === 0;
                  });

                  return (
                    <Droppable key={stage.id} droppableId={stage.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`solar-glass-card p-4 rounded-2xl bg-[#0F172A]/70 border transition-all duration-200 min-h-[520px] flex flex-col space-y-3 ${
                            snapshot.isDraggingOver
                              ? 'border-2 border-dashed border-purple-400 bg-purple-500/15 shadow-[0_0_30px_rgba(168,85,247,0.3)]'
                              : stage.color
                          }`}
                        >
                          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                            <div>
                              <span className="text-[10px] font-mono text-purple-400 font-bold block">GIAI ĐOẠN #{sIdx + 1}</span>
                              <span className="text-xs font-black text-slate-100 tracking-tight">{stage.name}</span>
                            </div>
                            <span className="px-2 py-0.5 rounded-md bg-purple-950/60 border border-purple-500/30 text-[10px] font-mono text-purple-300 font-bold">
                              {stageTasks.length}
                            </span>
                          </div>

                          <div className="flex-1 space-y-3">
                            {stageTasks.map((t, index) => (
                              <Draggable key={t.id} draggableId={t.id} index={index}>
                                {(providedDraggable, snapshotDraggable) => {
                                  const cardElement = (
                                    <div
                                      ref={providedDraggable.innerRef}
                                      {...providedDraggable.draggableProps}
                                      {...providedDraggable.dragHandleProps}
                                      style={{
                                        ...providedDraggable.draggableProps.style,
                                        pointerEvents: 'auto',
                                      }}
                                      className={`transform-gpu ${
                                        snapshotDraggable.isDragging
                                          ? '!z-[999999] rotate-2 scale-105 shadow-[0_0_60px_rgba(168,85,247,0.8)] border-2 border-purple-400 rounded-2xl bg-[#0F172A] cursor-grabbing'
                                          : snapshotDraggable.isDropAnimating || recentlyMovedTaskId === t.id
                                          ? 'animate-solar-drop-snap border-2 border-purple-400/90 rounded-2xl shadow-[0_0_35px_rgba(168,85,247,0.6)]'
                                          : 'hover:-translate-y-0.5 transition-transform duration-150'
                                      }`}
                                    >
                                      <KanbanCard
                                        task={t}
                                        onRequestTransfer={handleQuickRequest}
                                        onCardClick={(taskItem) => setSelectedTaskForDetail(taskItem)}
                                        onToggleSubtask={handleToggleSubtask}
                                        onDeleteTask={(taskItem) => {
                                          setTaskToDelete(taskItem);
                                          setIsDeleteModalOpen(true);
                                        }}
                                      />
                                    </div>
                                  );

                                  if (snapshotDraggable.isDragging) {
                                    return ReactDOM.createPortal(cardElement, getPortalRoot());
                                  }

                                  return cardElement;
                                }}
                              </Draggable>
                            ))}
                            {provided.placeholder}

                            {stageTasks.length === 0 && (
                              <div
                                className={`h-36 border-2 border-dashed rounded-xl flex items-center justify-center text-xs font-mono transition-colors text-center p-3 ${
                                  snapshot.isDraggingOver
                                    ? 'border-purple-400 text-purple-300 bg-purple-500/10'
                                    : 'border-slate-800/60 text-slate-600'
                                }`}
                              >
                                Kéo Task vào Giai đoạn {sIdx + 1}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </Droppable>
                  );
                })}
              </div>
            </DragDropContext>
          </div>
        );
      })()}

      {/* ☀️ VIEW 3: TODAY'S FOCUS COCKPIT (TRUNG TÂM TẬP TRUNG TÁC NGHIỆP) */}
      {activeView === 'focus' && (() => {
        // Priority weight dictionary
        const priorityWeight = { URGENT: 1, IMPORTANT: 2, NORMAL: 3, LOW: 4 };

        // 1. Task thuộc về người dùng hiện tại
        let myFocusTasks = filteredTasks.filter((t) => {
          if (t.progress >= 100 || t.status === 'DONE') return false;
          if (!user) return true;
          return (
            t.assigneeId === user.id ||
            t.assignee?.id === user.id ||
            t.assignee?.email === user.email ||
            t.subtasks?.some((st) => st.assigneeId === user.id || (st.assignee as any)?.id === user.id)
          );
        });

        // 2. Thống kê toàn cục dành cho Admin/Manager
        const isManagement = user?.globalRole === 'ADMIN' || user?.globalRole === 'MANAGER';
        const allPendingTasks = filteredTasks.filter((t) => t.status !== 'DONE');
        const allUrgentTasks = allPendingTasks.filter(
          (t) => t.priority === 'URGENT' || t.subtasks?.some((st) => st.isUrgent && !st.isDone)
        );
        const allInReviewTasks = filteredTasks.filter((t) => t.status === 'IN_REVIEW');
        const allBlockedTasks = filteredTasks.filter((t) => t.status === 'BLOCKED');

        // Apply Priority Filter Mode
        if (focusFilterMode === 'URGENT') {
          myFocusTasks = myFocusTasks.filter(
            (t) =>
              t.subtasks?.some((st) => st.isUrgent && !st.isDone) ||
              t.priority === 'URGENT' ||
              t.priority === 'IMPORTANT'
          );
        } else if (focusFilterMode === 'IN_PROGRESS') {
          myFocusTasks = myFocusTasks.filter((t) => t.status === 'IN_PROGRESS');
        }

        // Auto-sort Focus Queue
        myFocusTasks.sort((a, b) => {
          const aHasUrgent = a.subtasks?.some((st) => st.isUrgent && !st.isDone) ? 0 : 1;
          const bHasUrgent = b.subtasks?.some((st) => st.isUrgent && !st.isDone) ? 0 : 1;
          if (aHasUrgent !== bHasUrgent) return aHasUrgent - bHasUrgent;
          return priorityWeight[a.priority] - priorityWeight[b.priority];
        });

        const heroTask = myFocusTasks.find((t) => t.status === 'IN_PROGRESS');
        const queueTasks = myFocusTasks.filter((t) => t.id !== heroTask?.id);

        return (
          <div className="space-y-6 pb-12">
            {/* Header & Mode Filters (Tinh Gọn) */}
            <div className="solar-glass-card p-4 md:p-5 rounded-2xl bg-[#0F172A]/90 border border-amber-500/20 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                    🎯 Focus Cockpit
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Tập Trung Cao Độ
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Không gian tập trung xử lý dứt điểm công việc trọng tâm hôm nay mà không bị xao nhãng.
                  </p>
                </div>
              </div>

              {/* Focus Filters */}
              <div className="flex items-center gap-2 overflow-x-auto shrink-0">
                <button
                  onClick={() => setFocusFilterMode('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    focusFilterMode === 'ALL'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  Tất Cả ({myFocusTasks.length})
                </button>
                <button
                  onClick={() => setFocusFilterMode('URGENT')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    focusFilterMode === 'URGENT'
                      ? 'bg-rose-500 text-white shadow-md'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  🚨 Khẩn Cấp
                </button>
                <button
                  onClick={() => setFocusFilterMode('IN_PROGRESS')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    focusFilterMode === 'IN_PROGRESS'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  ⚡ Đang Làm
                </button>
              </div>
            </div>

            {/* 👑 MANAGEMENT QUICK BAR (TINH GỌN 1 HÀNG DÀNH CHO ADMIN & MANAGER) */}
            {isManagement && (
              <div className="solar-glass-card px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <span className="text-red-400 font-bold">🚨 {allUrgentTasks.length}</span> Khẩn Cấp
                  </span>
                  <span className="text-slate-600">•</span>
                  <button
                    onClick={() => setIsTransferInboxOpen(true)}
                    className="text-amber-300 hover:text-amber-200 font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>📬 {allInReviewTasks.length}</span> Chờ Duyệt Bàn Giao
                  </button>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <span className="text-rose-400 font-bold">⚠️ {allBlockedTasks.length}</span> Tắc Nghẽn
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <span className="text-emerald-400 font-bold">🚀 {allPendingTasks.length}</span> Tổng Đang Chạy
                  </span>
                </div>
              </div>
            )}

            {/* 🚀 HERO FOCUS CARD (TINH GỌN & MẠNH MẼ) */}
            {heroTask ? (
              <div className="solar-glass-card p-6 rounded-3xl bg-gradient-to-br from-amber-500/10 via-[#0F172A] to-purple-600/10 border-2 border-amber-400/60 shadow-xl relative space-y-5 animate-fade-in">
                {/* Top Meta Bar */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-lg text-xs font-mono font-black bg-amber-500 text-slate-950 flex items-center gap-1.5 shadow-sm">
                      <Zap className="w-3.5 h-3.5 fill-current" /> HERO FOCUS #1
                    </span>
                    <span className="text-xs text-amber-300/90 font-mono font-bold bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                      📁 {heroTask.projectName || 'Solaris Core'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-black uppercase ${
                        heroTask.priority === 'URGENT'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                          : heroTask.priority === 'IMPORTANT'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {heroTask.priority === 'URGENT' ? '🚨 URGENT' : heroTask.priority === 'IMPORTANT' ? '⭐ IMPORTANT' : 'NORMAL'}
                    </span>
                    <span className="text-xs font-mono text-slate-300 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800">
                      📅 Hạn: <strong className="text-emerald-300">{heroTask.dueDate || 'Chưa đặt'}</strong>
                    </span>
                  </div>
                </div>

                {/* Title & Description */}
                <div className="space-y-1.5">
                  <h2
                    onClick={() => setSelectedTaskForDetail(heroTask)}
                    className="text-xl md:text-2xl font-black text-white hover:text-amber-300 transition-colors cursor-pointer flex items-center gap-2 group"
                  >
                    <span>{heroTask.title}</span>
                    <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-amber-300 transition-colors" />
                  </h2>
                  {heroTask.description && (
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {heroTask.description}
                    </p>
                  )}
                </div>

                {/* Progress Bar (Tinh Gọn) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Tiến độ công việc:</span>
                    <span className="text-amber-300 font-bold">
                      {heroTask.progress}% ({heroTask.subtasks?.filter((s) => s.isDone).length || 0}/{heroTask.subtasks?.length || 0} việc con hoàn tất)
                    </span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-purple-500 h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                      style={{ width: `${heroTask.progress}%` }}
                    />
                  </div>
                </div>

                {/* 🎯 MỤC TIÊU VIỆC CON TIẾP THEO (NEXT ACTION ITEM) */}
                {heroTask.subtasks && heroTask.subtasks.length > 0 && (() => {
                  const subtaskList = heroTask.subtasks;
                  let firstPendingIdx = subtaskList.findIndex((s) => {
                    if (s.isDone) return false;
                    const effId = s.assigneeId || heroTask.assigneeId || (heroTask.assignee as any)?.id;
                    return Boolean(user && effId === user.id);
                  });
                  if (firstPendingIdx === -1) {
                    firstPendingIdx = subtaskList.findIndex((s) => !s.isDone);
                  }
                  const isAllDone = subtaskList.every((s) => s.isDone);
                  const activeSubtask = firstPendingIdx !== -1 ? subtaskList[firstPendingIdx] : null;
                  const effActiveAssigneeId = activeSubtask?.assigneeId || heroTask.assigneeId || (heroTask.assignee as any)?.id;
                  const isWorkerDoingHeroTask = Boolean(
                    user &&
                      (effActiveAssigneeId === user.id ||
                        (!activeSubtask?.assigneeId && (heroTask.assignee as any)?.id === user.id) ||
                        (!activeSubtask?.assigneeId && (heroTask.assignee as any)?.email && user.email === (heroTask.assignee as any).email))
                  );

                  return (
                    <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                      {isAllDone ? (
                        <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/50 flex items-center justify-center gap-2 text-emerald-300 text-xs font-bold">
                          <span>🏆</span> Hoàn tất 100% tất cả việc con! Hãy đánh dấu hoàn thành Task.
                        </div>
                      ) : activeSubtask ? (
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <span className="text-[10px] font-mono text-amber-400 uppercase font-black block">
                              🎯 VIỆC CON TIẾP THEO CẦN LÀM:
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-white truncate">
                                {activeSubtask.title}
                              </h4>
                              {activeSubtask.assignee && (
                                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30">
                                  👤 {activeSubtask.assignee.fullName}
                                </span>
                              )}
                              {activeSubtask.isUrgent && (
                                <span className="text-[9px] font-mono font-black text-rose-300 bg-rose-500/20 px-1.5 py-0.5 rounded border border-rose-500/30 animate-pulse">
                                  🚨 GẤP
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0">
                            {!isWorkerDoingHeroTask ? (
                              <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs font-mono font-bold flex items-center gap-1.5">
                                🔒 Chỉ người nhận mới tick được
                              </span>
                            ) : activeSubtask.approvalStatus === 'PENDING' ? (
                              <span className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold flex items-center gap-1.5 animate-pulse">
                                ⏳ Đang chờ quản lý duyệt
                              </span>
                            ) : activeSubtask.approvalStatus === 'REJECTED' ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-rose-300 font-bold bg-rose-950/60 px-2 py-1 rounded-lg border border-rose-500/40">
                                  ❌ Chưa đạt
                                </span>
                                <button
                                  onClick={() => handleCompleteTodaySubtask(heroTask, activeSubtask, firstPendingIdx)}
                                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer transition-all"
                                >
                                  🔄 Gửi Duyệt Lại
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleCompleteTodaySubtask(heroTask, activeSubtask, firstPendingIdx)}
                                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> ✓ Xong Việc Con Này
                              </button>
                            )}
                          </div>
                        </div>
                      ) : null}

                      {/* Danh sách checklist việc con tinh gọn */}
                      <div className="space-y-1 pt-1 border-t border-slate-800/60">
                        {subtaskList.map((st) => {
                          const itemEffAssigneeId = st.assigneeId || heroTask.assigneeId || (heroTask.assignee as any)?.id;
                          const isWorkerForThisItem = Boolean(
                            user &&
                              (itemEffAssigneeId === user.id ||
                                (!st.assigneeId && (heroTask.assignee as any)?.id === user.id) ||
                                (!st.assigneeId && (heroTask.assignee as any)?.email && user.email === (heroTask.assignee as any).email))
                          );
                          const canToggleThis = isWorkerForThisItem && !st.isDone && st.approvalStatus !== 'PENDING';

                          return (
                            <div
                              key={st.id}
                              onClick={() => canToggleThis && handleToggleSubtask(heroTask.id, st.id, true)}
                              className={`p-2 rounded-lg flex items-center justify-between gap-2 text-xs transition-all ${
                                st.isDone
                                  ? 'opacity-40 text-slate-500 line-through bg-slate-950/20'
                                  : canToggleThis
                                  ? 'hover:bg-slate-900 cursor-pointer text-slate-200'
                                  : 'text-slate-400'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={st.isDone}
                                  disabled={!canToggleThis}
                                  onChange={() => {}}
                                  className={`w-3.5 h-3.5 rounded text-amber-500 accent-amber-500 ${canToggleThis ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                                />
                                <span className="truncate">{st.title}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono">
                                {st.assignee && (
                                  <span className="text-slate-400">@{st.assignee.fullName.replace(/\s*\([^)]*\)/g, '')}</span>
                                )}
                                {st.isDone ? (
                                  <span className="text-emerald-400 font-bold">✓ Xong</span>
                                ) : st.approvalStatus === 'PENDING' ? (
                                  <span className="text-amber-400">⏳ Chờ duyệt</span>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* 🎮 ACTION BUTTONS (TINH GỌN) */}
                <div className="flex items-center gap-2.5 pt-1 flex-wrap">
                  <button
                    onClick={() => setConfirmDoneTask({ taskId: heroTask.id, taskTitle: heroTask.title })}
                    className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Đánh Dấu Hoàn Thành
                  </button>

                  <button
                    onClick={() => {
                      setTasks((prev) =>
                        prev.map((t) => (t.id === heroTask.id ? { ...t, status: 'TODO' } : t))
                      );
                      api.patch(`/tasks/${heroTask.id}/status`, { status: 'TODO' });
                      showNotification(`⏸️ Đã tạm dừng Task "${heroTask.title}"!`, 'info', 'Today Focus');
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Pause className="w-3.5 h-3.5" /> Tạm Dừng
                  </button>

                  <button
                    onClick={() => setSelectedTaskForDetail(heroTask)}
                    className="px-4 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Paperclip className="w-3.5 h-3.5" /> Tệp & Chi Tiết
                  </button>

                  <button
                    onClick={() => handleQuickRequest(heroTask)}
                    className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all ml-auto"
                  >
                    <Inbox className="w-3.5 h-3.5" /> Bàn Giao / Trợ Giúp
                  </button>
                </div>
              </div>
            ) : (
              <div className="solar-glass-card p-8 rounded-3xl bg-[#0F172A]/80 border border-amber-500/20 text-center space-y-2">
                <Target className="w-10 h-10 text-amber-400 mx-auto opacity-70" />
                <h3 className="text-base font-bold text-white">Chưa Có Task Nào Đang Thực Hiện (IN_PROGRESS)</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Hãy chọn một việc từ Hàng chờ hôm nay bên dưới và nhấn <strong className="text-amber-300 font-mono">"▶️ Bắt Đầu Làm"</strong> để đưa lên Hero Focus!
                </p>
              </div>
            )}

            {/* 📋 TODAY'S PRIORITY QUEUE LIST (DANH SÁCH HÀNG CHỜ TINH GỌN) */}
            {queueTasks.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Hàng Chờ Công Việc Hôm Nay ({queueTasks.length})
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {queueTasks.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTaskForDetail(t)}
                      className="solar-glass-card p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 transition-all cursor-pointer space-y-2.5 group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              t.priority === 'URGENT'
                                ? 'bg-rose-500 animate-pulse'
                                : t.priority === 'IMPORTANT'
                                ? 'bg-amber-400'
                                : 'bg-slate-500'
                            }`}
                          />
                          <span className="text-[11px] font-mono text-amber-300/80 truncate">
                            📁 {t.projectName || 'Dự án'}
                          </span>
                        </div>

                        <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 shrink-0">
                          📅 {t.dueDate || 'Chưa đặt'}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors line-clamp-1">
                        {t.title}
                      </h4>

                      <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-800/80">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="flex-1 bg-slate-950 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-amber-500 h-full rounded-full"
                              style={{ width: `${t.progress}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">{t.progress}%</span>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTasks((prev) =>
                              prev.map((item) => {
                                if (item.id === t.id) return { ...item, status: 'IN_PROGRESS' };
                                if (heroTask && item.id === heroTask.id) return { ...item, status: 'TODO' };
                                return item;
                              })
                            );
                            if (heroTask) {
                              api.patch(`/tasks/${heroTask.id}/status`, { status: 'TODO' }).catch((err) => {
                                console.error('Lỗi khi hạ status hero task cũ:', err);
                                fetchTasksFromBackend();
                              });
                            }
                            api.patch(`/tasks/${t.id}/status`, { status: 'IN_PROGRESS' })
                              .then(() => {
                                showNotification(
                                  `🟢 Đã đưa Task "${t.title}" lên HERO FOCUS!`,
                                  'success',
                                  'Today Focus'
                                );
                              })
                              .catch((err) => {
                                console.error('Lỗi khi kích hoạt Hero Task:', err);
                                showNotification(
                                  `❌ Không thể cập nhật trạng thái Task: ${err.response?.data?.message || err.message}`,
                                  'warning',
                                  'Today Focus'
                                );
                                fetchTasksFromBackend();
                              });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-all shadow-sm shrink-0"
                        >
                          <Play className="w-3 h-3 fill-current" /> Bắt Đầu Làm
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 🌌 TASK DETAIL MINISITE MODAL */}
      <TaskDetailModal
        isOpen={!!selectedTaskForDetail}
        onClose={() => setSelectedTaskForDetail(null)}
        task={selectedTaskForDetail}
        onUpdateTask={(updatedTask) => {
          setSelectedTaskForDetail(updatedTask);
          setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? { ...t, ...updatedTask } : t)));
          showNotification('🟢 Đã cập nhật mô tả Task thành công!', 'success', 'Cập Nhật Task');
        }}
        onDeleteTask={(t) => {
          setTaskToDelete(t);
          setIsDeleteModalOpen(true);
        }}
        
      />

      {/* 🗑️ DELETE TASK CONFIRMATION MODAL */}
      <DeleteTaskConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setTaskToDelete(null);
        }}
        onConfirm={handleConfirmDeleteTask}
        taskTitle={taskToDelete?.title || ''}
        isSubmitting={isDeleting}
      />

      {/* 🗑️ DELETE PROJECT CONFIRMATION MODAL */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md p-6 rounded-3xl bg-[#0F172A] border border-rose-500/40 shadow-[0_0_50px_rgba(244,63,94,0.3)] space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Xác Nhận Xóa Dự Án</h3>
                <span className="text-[10px] text-rose-400/90 font-mono font-bold uppercase tracking-wider">
                  CHUYỂN VÀO THÙNG RÁC (LƯU GIỮ 14 NGÀY)
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
              Bạn có chắc chắn muốn xóa dự án <span className="text-white font-bold">"{projectToDelete.name}"</span>? Dự án và toàn bộ các task thuộc dự án sẽ được chuyển vào <span className="text-amber-400 font-bold">Thùng Rác Hệ Thống</span> và lưu giữ an toàn trong 14 ngày.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                disabled={isDeleting}
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                disabled={isDeleting}
                onClick={handleConfirmDeleteProject}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Đang Xử Lý...' : 'Xác Nhận Xóa'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📬 TASK REQUEST MODAL */}
      <TaskRequestModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        tasks={tasks}
        initialTask={selectedTaskForRequest}
        onSubmitSuccess={(msg) => {
          showNotification(msg, 'success', 'Yêu Cầu Task Đã Gửi');
          fetchTasksFromBackend();
          fetchNotificationCount();
        }}
      />

      {/* 📥 INCOMING TASK TRANSFER INBOX MODAL */}
      <TaskTransferInboxModal
        isOpen={isTransferInboxOpen}
        onClose={() => setIsTransferInboxOpen(false)}
        onSuccess={() => {
          showNotification('🟢 Đã tiếp nhận và cập nhật phân công Task thành công!', 'success', 'Yêu Cầu Chuyển Giao');
          fetchTasksFromBackend();
          fetchNotificationCount();
        }}
      />

      {/* 📁 CREATE PROJECT MODAL */}
      <CreateProjectModal
        isOpen={isCreateProjectModalOpen}
        onClose={() => setIsCreateProjectModalOpen(false)}
        existingProjects={dbProjects.map((p) => p.name)}
        onSuccess={(newProj) => {
          showNotification('🟢 Khởi tạo Dự Án Mới thành công!', 'success', 'Tạo Dự Án');
          if (newProj && newProj.id) {
            setDbProjects((prev) => [newProj, ...prev]);
          }
          fetchMetadata();
          fetchTasksFromBackend();
        }}
      />

      {/* ➕ CREATE TASK MODAL */}
      <CreateTaskModal
        isOpen={isCreateTaskModalOpen}
        onClose={() => setIsCreateTaskModalOpen(false)}
        onSuccess={(newTask) => {
          showNotification('🟢 Khởi tạo Task Mới thành công!', 'success', 'Tạo Task');
          if (newTask && newTask.id) {
            setTasks((prev) => [newTask, ...prev]);
          }
          fetchTasksFromBackend();
        }}
      />

      {/* 🟢 MODAL XÁC NHẬN KHI KÉO TASK SANG CỘT DONE */}
      <SolarNotificationModal
        isOpen={!!confirmDoneTask}
        onClose={() => setConfirmDoneTask(null)}
        type="success"
        title="Xác Nhận Hoàn Thành Task"
        message={`Bạn có chắc chắn muốn đánh dấu Task "${confirmDoneTask?.taskTitle}" là HOÀN THÀNH (DONE - 100% Tiến Độ) không?`}
        confirmText="🚀 Xác Nhận Hoàn Thành"
        onConfirm={executeMoveToDone}
      />

      {/* 🌟 MODAL PROMPT HỎI TIẾN HÀNH VIỆC NGÀY MAI (TÔN TRỌNG THỜI GIAN NHÂN VIÊN) */}
      {workAheadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg solar-glass-card p-6 md:p-8 rounded-3xl bg-[#0F172A]/95 border-2 border-amber-400 shadow-[0_0_50px_rgba(245,158,11,0.3)] relative overflow-hidden space-y-6 animate-solar-warp-in">
            {/* Ambient glow */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center text-2xl shadow-md">
                🎉
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-white">
                  Chúc Mừng Hoàn Thành Mục Tiêu Hôm Nay!
                </h3>
                <span className="text-xs text-amber-300 font-mono font-bold">
                  Task: {workAheadModal.taskTitle}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-300">
              <p>
                Bạn đã hoàn thành xuất sắc Task con của ngày hôm nay!
              </p>
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                <span className="text-[11px] font-mono text-slate-400 block">
                  Task con kế tiếp theo kế hoạch:
                </span>
                <span className="text-sm font-extrabold text-amber-400 block">
                  📅 Ngày #{workAheadModal.nextDayIndex}: {workAheadModal.nextSubtaskTitle}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 text-[11px] flex items-center gap-2">
                <span>🛡️</span>
                <span>
                  <strong>Đảm bảo quyền lợi:</strong> Thời hạn Deadline tổng của Task ({workAheadModal.dueDate || 'Hạn chót gốc'}) vẫn được <strong>bảo lưu giữ nguyên 100%</strong>.
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Bạn có muốn bắt đầu luôn Task con của ngày mai để vượt tiến độ, hay nghỉ ngơi để hoàn thành đúng kế hoạch?
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setRestingTodayTasks((prev) => ({ ...prev, [workAheadModal.taskId]: true }));
                  setWorkingAheadTasks((prev) => ({ ...prev, [workAheadModal.taskId]: false }));
                  setWorkAheadModal(null);
                  showNotification(
                    '☕ Chúc bạn nghỉ ngơi vui vẻ! Bạn đã hoàn thành đúng mục tiêu ngày hôm nay. Hạn chót gốc của bạn vẫn được bảo lưu trọn vẹn.',
                    'info',
                    'Hoàn Thành Hôm Nay'
                  );
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5"
              >
                ☕ Nghỉ Ngơi (Xong Hôm Nay)
              </button>
              <button
                type="button"
                onClick={() => {
                  setRestingTodayTasks((prev) => ({ ...prev, [workAheadModal.taskId]: false }));
                  setWorkingAheadTasks((prev) => ({ ...prev, [workAheadModal.taskId]: true }));
                  setWorkAheadModal(null);
                  showNotification(
                    `🚀 Tuyệt vời! Bạn đang vượt tiến độ. Task con '${workAheadModal.nextSubtaskTitle}' (Ngày #${workAheadModal.nextDayIndex}) đã sẵn sàng trên bàn làm việc!`,
                    'success',
                    'Tiến Hành Task Con Ngày Mai'
                  );
                }}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer shadow-md transition-all flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" /> ✨ Tiến Hành Luôn Task Con Ngày Mai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 👥 BẢNG QUẢN LÝ THÀNH VIÊN DỰ ÁN (XÓA/THÊM NHÂN SỰ & CHUYỂN TASK VỀ MANAGER) */}
      {(() => {
        const selectedProj =
          dbProjects.find((p) => p.name === filterProject || p.id === filterProject) ||
          dbProjects[0];
        return (
          <ProjectMembersModal
            isOpen={isProjectMembersModalOpen}
            onClose={() => setIsProjectMembersModalOpen(false)}
            projectId={selectedProj?.id || ''}
            projectName={selectedProj?.name || 'Dự án chính'}
            onMemberChanged={() => {
              fetchMetadata();
              fetchTasksFromBackend();
            }}
          />
        );
      })()}

      {/* 🔔 SOLAR NOTIFICATION MODAL BÌNH THƯỜNG */}
      <SolarNotificationModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
      />
      
    </div>
    
  );
};

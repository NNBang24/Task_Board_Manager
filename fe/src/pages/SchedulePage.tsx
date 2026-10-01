import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { socketService } from '../services/socket';
import { CalendarHeader, type CalendarViewMode } from '../components/calendar/CalendarHeader';
import { MonthCalendarView } from '../components/calendar/MonthCalendarView';
import { WeekTimelineView } from '../components/calendar/WeekTimelineView';
import { DayScheduleView } from '../components/calendar/DayScheduleView';
import { TaskDetailModal } from '../components/kanban/TaskDetailModal';
import { NotificationCenter } from '../components/navigation/NotificationCenter';
import { CreateLeaveRequestModal } from '../components/schedule/CreateLeaveRequestModal';
import { ReviewLeaveRequestsModal } from '../components/schedule/ReviewLeaveRequestsModal';
import { AssignScheduleModal } from '../components/schedule/AssignScheduleModal';
import { useAuthStore } from '../store/useAuthStore';
import { useScheduleStore } from '../store/useScheduleStore';
import { Plus, CalendarPlus, FileCheck2 } from 'lucide-react';
import type { TaskItem } from '../components/kanban/KanbanCard';

interface MemberUser {
  id: string;
  fullName: string;
  avatar?: string;
  profession?: string;
  role?: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

export const SchedulePage: React.FC = () => {
  const authUser = useAuthStore((state) => state.user);
  const { leaveRequests, fetchSchedulesAndLeaves } = useScheduleStore();
  const isAdmin = authUser?.globalRole === 'ADMIN';
  const isManager = authUser?.globalRole === 'MANAGER' || isAdmin;
  const pendingRequestsCount = leaveRequests.filter((r) => r.status === 'PENDING').length;

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [members, setMembers] = useState<MemberUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 🗓️ Lịch Trình State
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('MONTH');

  // 🔍 Bộ Lọc State
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');

  // 🎯 Modal State
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<TaskItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCreateLeaveModalOpen, setIsCreateLeaveModalOpen] = useState(false);
  const [isReviewLeaveModalOpen, setIsReviewLeaveModalOpen] = useState(false);
  const [isAssignScheduleModalOpen, setIsAssignScheduleModalOpen] = useState(false);

  // 🔄 Tải Dữ Liệu Ban Đầu
  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [tasksRes, projectsRes, usersRes] = await Promise.all([
        api.get('/tasks'),
        api.get('/projects'),
        api.get('/profile/users').catch(() => ({ data: [] })),
      ]);

      const taskList = Array.isArray(tasksRes.data)
        ? tasksRes.data
        : Array.isArray(tasksRes.data?.data)
        ? tasksRes.data.data
        : [];
      setTasks(taskList);

      const projectList = Array.isArray(projectsRes.data)
        ? projectsRes.data
        : Array.isArray(projectsRes.data?.data)
        ? projectsRes.data.data
        : [];
      setProjects(projectList);

      const userList = Array.isArray(usersRes.data)
        ? usersRes.data
        : Array.isArray(usersRes.data?.data)
        ? usersRes.data.data
        : [];
      setMembers(userList);
    } catch (err) {
      console.error('Lỗi tải dữ liệu lịch:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchSchedulesAndLeaves();
  }, [fetchSchedulesAndLeaves]);

  // ⚡ Lắng Nghe Sự Kiện WebSockets Realtime
  useEffect(() => {
    const handleTaskUpdated = (updatedTask: TaskItem) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === updatedTask.id ? { ...t, ...updatedTask } : t))
      );
      if (selectedTaskForDetail?.id === updatedTask.id) {
        setSelectedTaskForDetail((prev) => (prev ? { ...prev, ...updatedTask } : null));
      }
    };

    const handleTaskCreated = (newTask: TaskItem) => {
      setTasks((prev) => {
        if (prev.some((t) => t.id === newTask.id)) return prev;
        return [newTask, ...prev];
      });
    };

    const handleTaskDeleted = (data: { id: string }) => {
      setTasks((prev) => prev.filter((t) => t.id !== data.id));
      if (selectedTaskForDetail?.id === data.id) {
        setIsDetailModalOpen(false);
      }
    };

    const handleScheduleSync = () => {
      fetchSchedulesAndLeaves();
    };

    socketService.on('task:updated', handleTaskUpdated);
    socketService.on('task:created', handleTaskCreated);
    socketService.on('task:deleted', handleTaskDeleted);
    socketService.on('schedule:updated', handleScheduleSync);
    socketService.on('leave:created', handleScheduleSync);
    socketService.on('leave:reviewed', handleScheduleSync);
    socketService.on('leave:cancelled', handleScheduleSync);

    return () => {
      socketService.off('task:updated', handleTaskUpdated);
      socketService.off('task:created', handleTaskCreated);
      socketService.off('task:deleted', handleTaskDeleted);
      socketService.off('schedule:updated', handleScheduleSync);
      socketService.off('leave:created', handleScheduleSync);
      socketService.off('leave:reviewed', handleScheduleSync);
      socketService.off('leave:cancelled', handleScheduleSync);
    };
  }, [selectedTaskForDetail?.id, fetchSchedulesAndLeaves]);

  // 🔍 Áp Dụng Bộ Lọc Đa Tiêu Chí
  const filteredTasks = tasks.filter((task) => {
    if (selectedProjectId !== 'ALL') {
      const p = projects.find((proj) => proj.id === selectedProjectId);
      const matchId = task.projectId === selectedProjectId;
      const matchName = p && task.projectName === p.name;
      if (!matchId && !matchName) return false;
    }

    if (selectedAssigneeId !== 'ALL') {
      const isDirectAssignee = task.assigneeId === selectedAssigneeId;
      const isSubtaskAssignee = task.subtasks?.some(
        (st) => st.assignee?.id === selectedAssigneeId || st.assigneeId === selectedAssigneeId
      );
      if (!isDirectAssignee && !isSubtaskAssignee) return false;
    }

    if (selectedPriority !== 'ALL' && task.priority !== selectedPriority) {
      return false;
    }

    return true;
  });

  const handleOpenDetailModal = (task: TaskItem) => {
    setSelectedTaskForDetail(task);
    setIsDetailModalOpen(true);
  };

  const handleDateSelect = (date: Date) => {
    setCurrentDate(date);
    setViewMode('DAY');
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in pb-16">
      {/* 🚀 Top Action Bar & Notification Center */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 shadow-sm">
            ⚡ SOLARIS WORK SCHEDULE
          </span>

          {/* Nộp đơn xin phép / WFH */}
          <button
            onClick={() => setIsCreateLeaveModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nộp Đơn Phép / WFH</span>
          </button>

          {/* Duyệt Đơn (Chỉ Manager / Admin) */}
          {isManager && (
            <button
              onClick={() => setIsReviewLeaveModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm relative"
            >
              <FileCheck2 className="w-3.5 h-3.5 text-purple-400" />
              <span>Duyệt Đơn Phép</span>
              {pendingRequestsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-mono font-extrabold animate-pulse">
                  {pendingRequestsCount}
                </span>
              )}
            </button>
          )}

          {/* Xếp lịch (Chỉ Admin / Manager) */}
          {isManager && (
            <button
              onClick={() => setIsAssignScheduleModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <CalendarPlus className="w-3.5 h-3.5 text-amber-400" />
              <span>Xếp Lịch Trực Tiếp 👑</span>
            </button>
          )}
        </div>

        <NotificationCenter
          onSelectTaskId={(id) => {
            const target = tasks.find((t) => t.id === id);
            if (target) {
              setSelectedTaskForDetail(target);
              setIsDetailModalOpen(true);
            }
          }}
        />
      </div>

      {/* 🚀 Header Lịch Làm Việc */}
      <CalendarHeader
        currentDate={currentDate}
        onDateChange={setCurrentDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onProjectChange={setSelectedProjectId}
        members={members}
        selectedAssigneeId={selectedAssigneeId}
        onAssigneeChange={setSelectedAssigneeId}
        selectedPriority={selectedPriority}
        onPriorityChange={setSelectedPriority}
        tasks={filteredTasks}
      />

      {/* 📅 Nội Dung Chế Độ Xem (Month / Week / Day) */}
      {isLoading ? (
        <div className="solar-glass-card p-16 rounded-3xl bg-[#0F172A]/80 border border-slate-800 text-center space-y-4">
          <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-400 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-amber-300 font-mono tracking-widest uppercase animate-pulse">
            Đang Đồng Bộ Lịch Tác Nghiệp Solaris...
          </p>
        </div>
      ) : (
        <div className="transition-all duration-300">
          {viewMode === 'MONTH' && (
            <MonthCalendarView
              currentDate={currentDate}
              tasks={filteredTasks}
              selectedAssigneeId={selectedAssigneeId}
              onSelectTask={handleOpenDetailModal}
              onSelectDate={handleDateSelect}
            />
          )}

          {viewMode === 'WEEK' && (
            <WeekTimelineView
              currentDate={currentDate}
              tasks={filteredTasks}
              members={
                selectedAssigneeId === 'ALL'
                  ? members
                  : members.filter((m) => m.id === selectedAssigneeId)
              }
              onSelectTask={handleOpenDetailModal}
              onSelectDate={handleDateSelect}
            />
          )}

          {viewMode === 'DAY' && (
            <DayScheduleView
              currentDate={currentDate}
              tasks={filteredTasks}
              onSelectTask={handleOpenDetailModal}
            />
          )}
        </div>
      )}

      {/* 📋 Modal Chi Tiết Task Khi Nhấp Vào Bất Kỳ Task Nào */}
      {selectedTaskForDetail && (
        <TaskDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          task={selectedTaskForDetail}
          onStatusChange={async (taskId: string, newStatus: TaskItem['status']) => {
            await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
            fetchData();
          }}
          onDeleteTask={async (task: TaskItem) => {
            await api.delete(`/tasks/${task.id}`);
            setIsDetailModalOpen(false);
            fetchData();
          }}
          onUpdateTask={(updatedTask: TaskItem) => {
            setSelectedTaskForDetail(updatedTask);
            setTasks((prev) =>
              prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
            );
          }}
        />
      )}

      {/* 📝 Modal Tạo Đơn Nghỉ / WFH */}
      <CreateLeaveRequestModal
        isOpen={isCreateLeaveModalOpen}
        onClose={() => setIsCreateLeaveModalOpen(false)}
      />

      {/* 📋 Modal Phê Duyệt Đơn (Manager / Admin) */}
      <ReviewLeaveRequestsModal
        isOpen={isReviewLeaveModalOpen}
        onClose={() => setIsReviewLeaveModalOpen(false)}
      />

      {/* 👑 Modal Xếp Lịch Trực Tiếp (Admin / Manager) */}
      <AssignScheduleModal
        isOpen={isAssignScheduleModalOpen}
        onClose={() => setIsAssignScheduleModalOpen(false)}
        members={members}
        defaultUserId={selectedAssigneeId !== 'ALL' ? selectedAssigneeId : undefined}
      />
    </div>
  );
};

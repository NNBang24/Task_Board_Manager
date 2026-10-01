import React from 'react';
import {
  CheckCircle2,
  Clock,
  Flame,
  Home,
  Plane,
  Palmtree,
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useScheduleStore } from '../../store/useScheduleStore';
import type { TaskItem } from '../kanban/KanbanCard';

interface MonthCalendarViewProps {
  currentDate: Date;
  tasks: TaskItem[];
  selectedAssigneeId?: string;
  onSelectTask: (task: TaskItem) => void;
  onSelectDate: (date: Date) => void;
}

export const MonthCalendarView: React.FC<MonthCalendarViewProps> = ({
  currentDate,
  tasks,
  selectedAssigneeId,
  onSelectTask,
  onSelectDate,
}) => {
  const authUser = useAuthStore((state) => state.user);
  const { getWorkLocationForDate } = useScheduleStore();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // 🗓️ Ngày đầu tiên của tháng và số ngày trong tháng
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();

  // Thứ của ngày 1 (Chuyển sang chuẩn Thứ 2 = 0, ..., Chủ Nhật = 6)
  const startingDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

  // Số ngày của tháng trước để bù lưới
  const lastDayOfPrevMonth = new Date(year, month, 0).getDate();

  const daysArray: Array<{
    date: Date;
    dayNumber: number;
    isCurrentMonth: boolean;
    isToday: boolean;
  }> = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Bù các ngày cuối tháng trước
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const prevDate = new Date(year, month - 1, lastDayOfPrevMonth - i);
    prevDate.setHours(0, 0, 0, 0);
    daysArray.push({
      date: prevDate,
      dayNumber: lastDayOfPrevMonth - i,
      isCurrentMonth: false,
      isToday: prevDate.getTime() === today.getTime(),
    });
  }

  // 2. Các ngày trong tháng hiện tại
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(year, month, i);
    date.setHours(0, 0, 0, 0);
    daysArray.push({
      date,
      dayNumber: i,
      isCurrentMonth: true,
      isToday: date.getTime() === today.getTime(),
    });
  }

  // 3. Bù các ngày đầu tháng sau (để đủ bội số 7)
  const remainingCells = (7 - (daysArray.length % 7)) % 7;
  for (let i = 1; i <= remainingCells; i++) {
    const nextDate = new Date(year, month + 1, i);
    nextDate.setHours(0, 0, 0, 0);
    daysArray.push({
      date: nextDate,
      dayNumber: i,
      isCurrentMonth: false,
      isToday: nextDate.getTime() === today.getTime(),
    });
  }

  // 🏷️ Lọc danh sách Task thuộc về từng ngày
  const getTasksForDate = (cellDate: Date) => {
    const time = cellDate.getTime();

    return tasks.filter((task) => {
      const start = task.startDate ? new Date(task.startDate) : null;
      if (start) start.setHours(0, 0, 0, 0);

      const due = task.dueDate ? new Date(task.dueDate) : null;
      if (due) due.setHours(0, 0, 0, 0);

      if (start && due) {
        return time >= start.getTime() && time <= due.getTime();
      }
      if (due) {
        return time === due.getTime();
      }
      if (start) {
        return time === start.getTime();
      }

      return false;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DONE':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30';
      case 'IN_PROGRESS':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30';
      case 'PAUSED':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40 hover:bg-blue-500/30';
      case 'BLOCKED':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30';
      case 'IN_REVIEW':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40 hover:bg-purple-500/30';
      default:
        return 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800';
    }
  };

  const weekDayNames = [
    'Thứ Hai (Mon)',
    'Thứ Ba (Tue)',
    'Thứ Tư (Wed)',
    'Thứ Năm (Thu)',
    'Thứ Sáu (Fri)',
    'Thứ Bảy (Sat)',
    'Chủ Nhật (Sun)',
  ];

  return (
    <div className="solar-glass-card rounded-3xl bg-[#0F172A]/90 border border-slate-800 shadow-2xl overflow-hidden animate-fade-in">
      {/* 📅 Hàng Tiêu Đề 7 Ngày Trong Tuần */}
      <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950/90 text-center">
        {weekDayNames.map((w, idx) => (
          <div
            key={w}
            className={`py-3.5 px-2 text-xs font-black tracking-wider uppercase ${
              idx >= 5 ? 'text-amber-400/90 bg-amber-500/5' : 'text-slate-300'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 📅 Lưới Ô Ngày 7x5 hoặc 7x6 */}
      <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-800/80 bg-[#0B0F19]">
        {daysArray.map((item, idx) => {
          const dayTasks = getTasksForDate(item.date);
          const hasOverdue = dayTasks.some(
            (t) => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate) < today
          );

          // Lấy vị trí làm việc của user cho ngày này (Nguồn sự thật)
          const targetUserId = selectedAssigneeId && selectedAssigneeId !== 'ALL' ? selectedAssigneeId : (authUser?.id || 'u-self');
          const dateKey = `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}-${String(item.date.getDate()).padStart(2, '0')}`;
          const locInfo = getWorkLocationForDate(targetUserId, dateKey);

          return (
            <div
              key={idx}
              onClick={() => onSelectDate(item.date)}
              className={`min-h-[140px] p-2.5 transition-all flex flex-col justify-between group cursor-pointer ${
                item.isCurrentMonth
                  ? 'bg-slate-900/40 hover:bg-slate-800/50'
                  : 'bg-slate-950/60 opacity-40 hover:opacity-75'
              } ${item.isToday ? 'ring-2 ring-amber-500/80 bg-amber-500/10 shadow-[inset_0_0_25px_rgba(245,158,11,0.15)]' : ''}`}
            >
              {/* Header của ngày */}
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-7 h-7 flex items-center justify-center rounded-xl text-xs font-black transition-all ${
                      item.isToday
                        ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 shadow-md shadow-amber-500/30 scale-110'
                        : item.isCurrentMonth
                        ? 'text-slate-200 group-hover:text-amber-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {item.dayNumber}
                  </span>

                  {/* Work location chip for active user (including shift info) */}
                  {locInfo.workType !== 'OFFICE' && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold border flex items-center gap-1 ${
                        locInfo.workType === 'WFH'
                          ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                          : locInfo.workType === 'LEAVE'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      }`}
                      title={`${locInfo.sourceTitle}${locInfo.note ? `: ${locInfo.note}` : ''}`}
                    >
                      {locInfo.workType === 'WFH' ? (
                        <>
                          <Home className="w-2.5 h-2.5" />
                          <span>WFH{locInfo.shift && locInfo.shift !== 'FULL_DAY' ? ` (${locInfo.shift === 'MORNING' ? 'Sáng' : 'Chiều'})` : ''}</span>
                        </>
                      ) : locInfo.workType === 'LEAVE' ? (
                        <>
                          <Palmtree className="w-2.5 h-2.5" />
                          <span>Nghỉ{locInfo.shift && locInfo.shift !== 'FULL_DAY' ? ` (${locInfo.shift === 'MORNING' ? 'Sáng' : 'Chiều'})` : ''}</span>
                        </>
                      ) : (
                        <>
                          <Plane className="w-2.5 h-2.5" />
                          <span>OnSite{locInfo.shift && locInfo.shift !== 'FULL_DAY' ? ` (${locInfo.shift === 'MORNING' ? 'Sáng' : 'Chiều'})` : ''}</span>
                        </>
                      )}
                    </span>
                  )}
                </div>

                {dayTasks.length > 0 && (
                  <div className="flex items-center gap-1">
                    {hasOverdue && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" title="Có task trễ hạn" />
                    )}
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                      {dayTasks.length} task
                    </span>
                  </div>
                )}
              </div>

              {/* Danh sách Task Badges trong ngày (Tối đa 3 items, còn lại +X) */}
              <div className="space-y-1.5 my-2 flex-1 overflow-hidden">
                {dayTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTask(task);
                    }}
                    className={`p-1.5 rounded-lg border text-[11px] font-semibold transition-all truncate flex items-center gap-1.5 cursor-pointer shadow-sm ${getStatusColor(
                      task.status
                    )}`}
                    title={`${task.title} (${task.status}) - Phụ trách: ${task.assignee?.fullName || 'Chưa gán'}`}
                  >
                    {task.status === 'DONE' ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : task.priority === 'URGENT' ? (
                      <Flame className="w-3 h-3 text-rose-400 shrink-0 animate-pulse" />
                    ) : (
                      <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                    )}
                    <span className="truncate flex-1">{task.title}</span>
                  </div>
                ))}

                {dayTasks.length > 3 && (
                  <div className="text-[10px] font-bold text-amber-400/90 text-center py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                    +{dayTasks.length - 3} công việc khác...
                  </div>
                )}
              </div>

              {/* Footer thanh tiến độ mini của ngày */}
              {dayTasks.length > 0 && (
                <div className="w-full bg-slate-950/80 rounded-full h-1 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round(
                        (dayTasks.filter((t) => t.status === 'DONE').length / dayTasks.length) * 100
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

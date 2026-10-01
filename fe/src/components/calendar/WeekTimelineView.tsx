import React from 'react';
import {
  Clock,
  CheckCircle2,
  Flame,
  User as UserIcon,
  Home,
  Palmtree,
  Plane,
} from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore';
import type { TaskItem } from '../kanban/KanbanCard';

interface MemberUser {
  id: string;
  fullName: string;
  avatar?: string;
  profession?: string;
  role?: string;
}

interface WeekTimelineViewProps {
  currentDate: Date;
  tasks: TaskItem[];
  members: MemberUser[];
  onSelectTask: (task: TaskItem) => void;
  onSelectDate: (date: Date) => void;
}

export const WeekTimelineView: React.FC<WeekTimelineViewProps> = ({
  currentDate,
  tasks,
  members,
  onSelectTask,
  onSelectDate,
}) => {
  const { getWorkLocationForDate } = useScheduleStore();

  // 🗓️ Tính toán 7 ngày trong tuần hiện tại (Bắt đầu từ Thứ 2)
  const startOfWeek = new Date(currentDate);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);

  const weekDays: Array<{ date: Date; dayName: string; isToday: boolean }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    d.setHours(0, 0, 0, 0);
    weekDays.push({
      date: d,
      dayName: dayNames[i],
      isToday: d.getTime() === today.getTime(),
    });
  }

  // 👥 Gom nhóm danh sách nhân sự tham gia
  const assigneesList = [
    ...members,
    { id: 'UNASSIGNED', fullName: 'Chưa Gán Phụ Trách', profession: 'CORE' },
  ];

  // 🔍 Lọc danh sách Task thuộc về nhân sự và kiểm tra có nằm trong tuần không
  const getTasksForMember = (memberId: string) => {
    return tasks.filter((t) => {
      const isMember =
        memberId === 'UNASSIGNED'
          ? !t.assigneeId
          : t.assigneeId === memberId ||
            t.subtasks?.some((st) => st.assignee?.id === memberId);
      return isMember;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DONE':
        return 'from-emerald-500/30 to-emerald-600/40 border-emerald-500/50 text-emerald-200';
      case 'IN_PROGRESS':
        return 'from-amber-500/30 to-amber-600/40 border-amber-500/50 text-amber-200';
      case 'PAUSED':
        return 'from-blue-500/30 to-blue-600/40 border-blue-500/50 text-blue-200';
      case 'BLOCKED':
        return 'from-rose-500/30 to-rose-600/40 border-rose-500/50 text-rose-200';
      case 'IN_REVIEW':
        return 'from-purple-500/30 to-purple-600/40 border-purple-500/50 text-purple-200';
      default:
        return 'from-slate-800/60 to-slate-900/60 border-slate-700 text-slate-300';
    }
  };

  return (
    <div className="solar-glass-card rounded-3xl bg-[#0F172A]/95 border border-amber-500/30 shadow-[0_0_50px_rgba(245,158,11,0.15)] overflow-hidden space-y-4 p-5 backdrop-blur-2xl animate-solar-warp-in">
      {/* 🚀 Header Thanh Dòng Thời Gian 7 Ngày */}
      <div className="grid grid-cols-12 gap-2 border-b border-slate-800 pb-4 items-center">
        <div className="col-span-3 font-extrabold text-xs text-amber-400 uppercase tracking-wider flex items-center gap-2 pl-2">
          <UserIcon className="w-4 h-4 text-amber-400" />
          <span>Nhân Sự & Dòng Thời Gian</span>
        </div>

        <div className="col-span-9 grid grid-cols-7 gap-2 text-center">
          {weekDays.map((wd, idx) => (
            <div
              key={idx}
              onClick={() => onSelectDate(wd.date)}
              className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
                wd.isToday
                  ? 'bg-gradient-to-br from-amber-500/30 to-amber-600/20 border-amber-400/80 shadow-[0_0_20px_rgba(245,158,11,0.25)] scale-102'
                  : 'bg-slate-900/80 border-slate-800 hover:border-amber-500/40 hover:bg-slate-800/80'
              }`}
            >
              <span
                className={`text-[11px] font-black uppercase block ${
                  wd.isToday ? 'text-amber-300' : 'text-slate-400'
                }`}
              >
                {wd.dayName}
              </span>
              <span
                className={`text-sm font-black mt-0.5 block ${
                  wd.isToday ? 'text-white font-mono' : 'text-slate-200'
                }`}
              >
                {wd.date.getDate()}/{wd.date.getMonth() + 1}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 📊 Dòng Thời Gian Theo Từng Thành Viên */}
      <div className="space-y-3 divide-y divide-slate-800/60 max-h-[620px] overflow-y-auto custom-scrollbar pr-1">
        {assigneesList.map((member) => {
          const memberTasks = getTasksForMember(member.id);
          if (memberTasks.length === 0 && member.id === 'UNASSIGNED') return null;

          return (
            <div key={member.id} className="pt-3 grid grid-cols-12 gap-2 items-start group">
              {/* Cột 1: Thông tin nhân sự (3 cột) */}
              <div className="col-span-3 flex items-center gap-3 p-2.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 group-hover:border-amber-500/30 transition-all">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-purple-600/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0 font-bold text-xs relative overflow-hidden shadow-inner">
                  {member.avatar ? (
                    <img
                      src={member.avatar}
                      alt={member.fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{member.fullName.charAt(0).toUpperCase()}</span>
                  )}
                </div>

                <div className="overflow-hidden truncate flex-1">
                  <h4 className="text-xs font-black text-white truncate group-hover:text-amber-300 transition-colors">
                    {member.fullName}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                      {member.profession || 'DEV'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {memberTasks.length} task
                    </span>
                  </div>
                </div>
              </div>

              {/* Cột 2: Lưới 7 Ngày & Task Chips (9 cột) */}
              <div className="col-span-9 grid grid-cols-7 gap-2 min-h-[60px] p-2 rounded-2xl bg-slate-950/60 border border-slate-900">
                {weekDays.map((wd, dayIdx) => {
                  const dayTime = wd.date.getTime();
                  const dateKey = `${wd.date.getFullYear()}-${String(wd.date.getMonth() + 1).padStart(2, '0')}-${String(wd.date.getDate()).padStart(2, '0')}`;
                  const locInfo = member.id !== 'UNASSIGNED' ? getWorkLocationForDate(member.id, dateKey) : null;

                  const tasksForDay = memberTasks.filter((t) => {
                    const start = t.startDate ? new Date(t.startDate) : null;
                    if (start) start.setHours(0, 0, 0, 0);

                    const due = t.dueDate ? new Date(t.dueDate) : null;
                    if (due) due.setHours(0, 0, 0, 0);

                    if (start && due) {
                      return dayTime >= start.getTime() && dayTime <= due.getTime();
                    }
                    if (due) return dayTime === due.getTime();
                    if (start) return dayTime === start.getTime();
                    return false;
                  });

                  return (
                    <div
                      key={dayIdx}
                      className={`min-h-[50px] rounded-xl p-1 flex flex-col gap-1 transition-all ${
                        wd.isToday ? 'bg-amber-500/5' : 'bg-transparent'
                      }`}
                    >
                      {/* Work Location Badge */}
                      {locInfo && locInfo.workType !== 'OFFICE' && (
                        <div
                          className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold border flex items-center gap-1 mb-0.5 truncate ${
                            locInfo.workType === 'WFH'
                              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                              : locInfo.workType === 'LEAVE'
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          }`}
                          title={`${locInfo.sourceTitle}${locInfo.note ? `: ${locInfo.note}` : ''}`}
                        >
                          {locInfo.workType === 'WFH' && <Home className="w-2.5 h-2.5 shrink-0" />}
                          {locInfo.workType === 'LEAVE' && <Palmtree className="w-2.5 h-2.5 shrink-0" />}
                          {locInfo.workType === 'ON_SITE' && <Plane className="w-2.5 h-2.5 shrink-0" />}
                          <span className="truncate">
                            {locInfo.workType === 'WFH' ? 'WFH' : locInfo.workType === 'LEAVE' ? 'Nghỉ' : 'OnSite'}
                            {locInfo.shift && locInfo.shift !== 'FULL_DAY' ? ` (${locInfo.shift === 'MORNING' ? 'S' : 'C'})` : ''}
                          </span>
                        </div>
                      )}
                      {tasksForDay.map((task) => (
                        <div
                          key={task.id}
                          onClick={() => onSelectTask(task)}
                          className={`p-1.5 rounded-xl border bg-gradient-to-r text-[10px] font-bold shadow-md transition-all hover:scale-105 cursor-pointer truncate ${getStatusColor(
                            task.status
                          )}`}
                          title={`${task.title} [${task.status}] - Tiến độ: ${task.progress}%`}
                        >
                          <div className="flex items-center gap-1 truncate">
                            {task.status === 'DONE' ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                            ) : task.priority === 'URGENT' ? (
                              <Flame className="w-3 h-3 text-rose-400 shrink-0 animate-pulse" />
                            ) : (
                              <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                            )}
                            <span className="truncate">{task.title}</span>
                          </div>

                          {/* Mini progress line */}
                          <div className="w-full bg-black/40 h-1 rounded-full mt-1 overflow-hidden">
                            <div
                              className="bg-amber-400 h-full rounded-full"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

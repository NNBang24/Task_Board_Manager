import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  X,
  Mail,
  Phone,
  Building2,
  CheckCircle2,
  Clock,
  Calendar,
  MessageSquare,
  FolderKanban,
  CheckSquare,
  ExternalLink,
  AlertTriangle,
  Home,
  Plane,
  Palmtree,
  ChevronDown,
  Check,
} from 'lucide-react';
import type { GlobalRole, Profession, UserStatusSignal } from '../../types/auth';
import { useUserStore } from '../../store/useUserStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useScheduleStore, type WorkLocationType } from '../../store/useScheduleStore';
import { DEFAULT_COVER, getAvatarUrl } from '../../utils/avatar';

const WORK_LOCATIONS: Array<{
  id: WorkLocationType;
  label: string;
  subLabel: string;
  icon: React.ElementType;
  badgeBg: string;
  textColor: string;
  dotColor: string;
}> = [
  {
    id: 'OFFICE',
    label: 'Tại Văn Phòng',
    subLabel: 'Office HQ',
    icon: Building2,
    badgeBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    textColor: 'text-emerald-300',
    dotColor: 'bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.8)]',
  },
  {
    id: 'WFH',
    label: 'Làm Từ Xa (WFH)',
    subLabel: 'Remote Working',
    icon: Home,
    badgeBg: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
    textColor: 'text-amber-300',
    dotColor: 'bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.8)]',
  },
  {
    id: 'ON_SITE',
    label: 'Đi Công Tác',
    subLabel: 'On-Site / Business Trip',
    icon: Plane,
    badgeBg: 'bg-blue-500/15 border-blue-500/30 text-blue-300',
    textColor: 'text-blue-300',
    dotColor: 'bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.8)]',
  },
  {
    id: 'LEAVE',
    label: 'Nghỉ Phép',
    subLabel: 'On Leave',
    icon: Palmtree,
    badgeBg: 'bg-rose-500/15 border-rose-500/30 text-rose-300',
    textColor: 'text-rose-300',
    dotColor: 'bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.8)]',
  },
];

export interface UserProfileData {
  id: string;
  fullName: string;
  email: string;
  avatar?: string;
  avatarUrl?: string;
  coverImage?: string;
  phone?: string;
  bio?: string;
  globalRole?: GlobalRole | string;
  profession?: Profession | string;
  jobTitle?: string;
  department?: string;
  statusSignal?: UserStatusSignal | string;
  customStatus?: string;
  workMode?: 'OFFICE' | 'REMOTE' | string;
  joinedDate?: string;
  projectsCount?: number;
  tasksCount?: {
    total: number;
    completed: number;
    inProgress: number;
    overdue?: number;
  };
  assignedProjects?: string[];
  recentTasks?: Array<{
    id: string;
    title: string;
    status: string;
    dueDate?: string;
  }>;
}

interface UserProfileModalProps {
  user: UserProfileData | null;
  isOpen: boolean;
  onClose: () => void;
  onSendMessage?: (user: UserProfileData) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  isOpen,
  onClose,
  onSendMessage,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'projects'>('overview');
  const setViewingUserId = useUserStore((state) => state.setViewingUserId);
  const authUser = useAuthStore((state) => state.user);
  const { getWorkLocationForDate, setUserDailyWorkLocation } = useScheduleStore();

  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const locationDropdownRef = useRef<HTMLDivElement>(null);

  const isSelf = !!user && !!authUser && user.id === authUser.id;
  const isAdmin = authUser?.globalRole === 'ADMIN';
  const canEditLocation = isAdmin;

  const todayDateStr = new Date().toISOString().split('T')[0];
  const userLocation = user
    ? getWorkLocationForDate(user.id, todayDateStr).workType
    : 'OFFICE';
  const [currentWorkLocation, setCurrentWorkLocation] = useState<WorkLocationType>(userLocation);

  useEffect(() => {
    if (user) {
      setCurrentWorkLocation(getWorkLocationForDate(user.id, todayDateStr).workType);
    }
  }, [user, todayDateStr, getWorkLocationForDate]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(event.target as Node)) {
        setIsLocationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen || !user) return null;

  const handleOpenFullProfile = () => {
    setViewingUserId(user.id);
    localStorage.setItem('solaris_active_route', '/profile');
    try {
      if (window.location.pathname !== '/profile') {
        window.history.pushState(null, '', '/profile');
      }
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
      window.location.href = '/profile';
    }
    onClose();
  };

  const handleSelectWorkLocation = (loc: WorkLocationType) => {
    if (!isAdmin) return;
    setCurrentWorkLocation(loc);
    setIsLocationDropdownOpen(false);
    setUserDailyWorkLocation(user.id, loc, undefined, {
      adminId: authUser?.id || 'admin',
      adminName: authUser?.fullName || 'Admin',
    });
  };

  // Status Signal Dot & Label
  const getStatusInfo = (signal?: string) => {
    switch (signal) {
      case 'ONLINE':
        return { label: 'Trực Tuyến (Online)', color: 'bg-emerald-400 text-emerald-300 border-emerald-500/40' };
      case 'BUSY':
        return { label: 'Bận Rộn (Busy)', color: 'bg-rose-500 text-rose-300 border-rose-500/40' };
      case 'IN_MEETING':
        return { label: 'Đang Họp (In Meeting)', color: 'bg-purple-500 text-purple-300 border-purple-500/40' };
      case 'AWAY':
        return { label: 'Vắng Mặt (Away)', color: 'bg-amber-400 text-amber-300 border-amber-500/40' };
      default:
        return { label: 'Ngoại Tuyến (Offline)', color: 'bg-slate-500 text-slate-400 border-slate-600' };
    }
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      case 'MANAGER':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      default:
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    }
  };

  const statusInfo = getStatusInfo(user.statusSignal);
  const tasksTotal = user.tasksCount?.total ?? 0;
  const tasksCompleted = user.tasksCount?.completed ?? 0;
  const tasksInProgress = user.tasksCount?.inProgress ?? 0;
  const tasksOverdue = user.tasksCount?.overdue ?? 0;
  const tasksOnTime = Math.max(0, tasksCompleted - tasksOverdue);

  const defaultCover = user.coverImage || DEFAULT_COVER;
  const defaultAvatar = getAvatarUrl(user);

  const defaultProjects = user.assignedProjects || [];
  const defaultTasks = user.recentTasks || [];

  const modalContent = (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl max-h-[92vh] rounded-3xl bg-[#0f172a] border border-slate-800 shadow-2xl relative overflow-hidden flex flex-col animate-solar-warp-in">
        {/* 🌠 Cover Photo Header */}
        <div className="relative h-36 sm:h-44 w-full overflow-hidden shrink-0">
          <img
            src={defaultCover}
            alt="Cover"
            className="w-full h-full object-cover brightness-75"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0f172a]/40 to-[#0f172a]" />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 p-2 rounded-xl bg-black/50 hover:bg-black/80 text-slate-300 hover:text-white backdrop-blur-md border border-white/10 transition-all cursor-pointer z-20"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 👤 Avatar & Identity Block */}
        <div className="px-6 md:px-8 -mt-16 sm:-mt-20 relative z-10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              {/* Avatar with Status Ring */}
              <div className="relative">
                <img
                  src={defaultAvatar}
                  alt={user.fullName}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-4 border-[#0f172a] shadow-xl bg-slate-900"
                />
                <span
                  className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-[#0f172a] ${statusInfo.color}`}
                  title={statusInfo.label}
                />
              </div>

              {/* Name & Job Title */}
              <div className="space-y-0.5 pb-1 min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate flex items-center gap-2">
                  {user.fullName}
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 font-medium truncate">
                  {user.jobTitle || 'Chuyên viên Phát triển Hệ thống'}
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>{user.department || 'Engineering'}</span>
                </div>
              </div>
            </div>

            {/* Role & Work Mode Badges */}
            <div className="flex items-center gap-2 self-start sm:self-end pb-1">
              <span
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getRoleBadge(
                  user.globalRole
                )}`}
              >
                {user.globalRole || 'EMPLOYEE'}
              </span>

              {/* 📍 Work Location Badge */}
              <div className="relative" ref={locationDropdownRef}>
                <button
                  type="button"
                  onClick={() => canEditLocation && setIsLocationDropdownOpen(!isLocationDropdownOpen)}
                  className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                    WORK_LOCATIONS.find((l) => l.id === currentWorkLocation)?.badgeBg || 'bg-slate-800 text-slate-300 border-slate-700'
                  } ${canEditLocation ? 'cursor-pointer hover:brightness-110 active:scale-95' : 'cursor-default'}`}
                  title={
                    isSelf
                      ? 'Nhấp để đổi vị trí làm việc hôm nay'
                      : isAdmin
                      ? 'Admin: Nhấp để chỉ định vị trí làm việc cho nhân sự này'
                      : 'Vị trí làm việc hôm nay'
                  }
                >
                  <span className={`w-2 h-2 rounded-full ${WORK_LOCATIONS.find((l) => l.id === currentWorkLocation)?.dotColor || 'bg-slate-400'}`} />
                  {(() => {
                    const loc = WORK_LOCATIONS.find((l) => l.id === currentWorkLocation);
                    const LocIcon = loc?.icon || Building2;
                    return (
                      <span className="flex items-center gap-1 font-bold">
                        <LocIcon className="w-3 h-3" />
                        {loc?.label || 'Văn Phòng'}
                      </span>
                    );
                  })()}
                  {canEditLocation && <ChevronDown className="w-3 h-3 text-amber-400 shrink-0" />}
                </button>

                {/* Location Dropdown */}
                {canEditLocation && isLocationDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 p-1.5 rounded-2xl bg-[#0F172A] border border-amber-500/50 shadow-[0_20px_50px_rgba(0,0,0,0.95)] backdrop-blur-2xl z-50 animate-solar-drop-snap space-y-1">
                    <div className="px-2.5 py-1 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Vị trí làm việc</span>
                      <span className="text-amber-400 font-mono text-[9px]">{isAdmin && !isSelf ? 'Admin Role' : 'Solaris'}</span>
                    </div>
                    {WORK_LOCATIONS.map((loc) => {
                      const Icon = loc.icon;
                      const isSelected = currentWorkLocation === loc.id;
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => handleSelectWorkLocation(loc.id)}
                          className={`w-full p-2 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                            isSelected ? 'bg-amber-500/20 border border-amber-500/40 text-white' : 'hover:bg-slate-800/80 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`p-1 rounded-lg ${loc.badgeBg}`}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs font-bold text-white">{loc.label}</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bio / Quote */}
          {user.bio && (
            <p className="text-xs text-slate-300 italic bg-slate-900/60 p-3 rounded-2xl border border-slate-800/80 leading-relaxed">
              "{user.bio}"
            </p>
          )}

          {/* Tab Navigation */}
          <div className="flex items-center gap-2 border-b border-slate-800 pt-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                activeTab === 'overview'
                  ? 'border-amber-400 text-amber-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Tổng Quan Hồ Sơ
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'tasks'
                  ? 'border-amber-400 text-amber-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Công Việc Đang Làm
              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-amber-400 font-mono">
                {tasksInProgress}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('projects')}
              className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                activeTab === 'projects'
                  ? 'border-amber-400 text-amber-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Dự Án Tham Gia ({defaultProjects.length})
            </button>
          </div>
        </div>

        {/* 📜 Scrollable Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 pt-4 space-y-5 custom-scrollbar text-xs">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-5 animate-fade-in">
              {/* 🎯 4-Card Precise Metric Grid: TỔNG TASK • ĐANG LÀM • ĐÚNG HẠN • TRỄ HẠN */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800 space-y-1 text-center">
                  <span className="text-slate-400 text-[10px] uppercase font-bold block flex items-center justify-center gap-1">
                    <CheckSquare className="w-3 h-3 text-blue-400" /> Tổng Task
                  </span>
                  <span className="text-xl font-black text-white font-mono">{tasksTotal}</span>
                </div>

                <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800 space-y-1 text-center">
                  <span className="text-amber-400 text-[10px] uppercase font-bold block flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3 text-amber-400" /> Đang Làm
                  </span>
                  <span className="text-xl font-black text-amber-300 font-mono">{tasksInProgress}</span>
                </div>

                <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800 space-y-1 text-center">
                  <span className="text-emerald-400 text-[10px] uppercase font-bold block flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Đúng Hạn
                  </span>
                  <span className="text-xl font-black text-emerald-300 font-mono">{tasksOnTime}</span>
                </div>

                <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800 space-y-1 text-center">
                  <span className="text-rose-400 text-[10px] uppercase font-bold block flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-rose-400" /> Trễ Hạn
                  </span>
                  <span className="text-xl font-black text-rose-400 font-mono">{tasksOverdue}</span>
                </div>
              </div>

              {/* Contact Information */}
              <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-2.5">
                <h3 className="font-bold text-white uppercase text-[11px] tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-amber-400" /> Thông Tin Liên Lạc Doanh Nghiệp
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-slate-300">
                  <div className="flex items-center gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 truncate">
                    <Mail className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 truncate">
                    <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="truncate">{user.phone || 'Chưa cập nhật'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

              {/* TAB 2: TASKS */}
          {activeTab === 'tasks' && (
            <div className="space-y-3 animate-fade-in">
              <h3 className="font-bold text-slate-300 uppercase text-[11px] tracking-wider flex items-center justify-between">
                <span>Danh Sách Công Việc Phụ Trách</span>
                <span className="text-amber-400 font-mono">{defaultTasks.length} Task</span>
              </h3>

              {defaultTasks.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 text-center space-y-2">
                  <Clock className="w-6 h-6 text-slate-500 mx-auto" />
                  <p className="text-xs text-slate-400">Chưa có công việc nào được giao.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {defaultTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 hover:border-amber-500/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {t.status === 'DONE' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">{t.title}</span>
                          {t.dueDate && (
                            <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> Hạn chót: {t.dueDate}
                            </span>
                          )}
                        </div>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${
                          t.status === 'DONE'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PROJECTS */}
          {activeTab === 'projects' && (
            <div className="space-y-3 animate-fade-in">
              <h3 className="font-bold text-slate-300 uppercase text-[11px] tracking-wider">
                Các Dự Án Đang Tham Gia
              </h3>
              {defaultProjects.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 text-center space-y-2">
                  <FolderKanban className="w-6 h-6 text-slate-500 mx-auto" />
                  <p className="text-xs text-slate-400">Chưa tham gia dự án nào.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {defaultProjects.map((p: any, idx: number) => {
                    const isObj = typeof p === 'object' && p !== null;
                    const pName = isObj ? p.name : p;
                    const pRole = isObj ? p.roleInProject || 'Thành Viên' : 'Thành Viên';

                    return (
                      <div
                        key={isObj ? p.id || idx : idx}
                        className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <FolderKanban className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="font-bold text-white truncate">{pName}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold shrink-0">
                          {pRole}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 🚪 Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-[#0A0F1D]/80 flex items-center justify-between gap-3 relative z-10">
          <div className="text-[11px] text-slate-400 font-mono truncate">
            Mã ID: <span className="text-slate-200">{user.id}</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleOpenFullProfile}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-md"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Mở Trang Profile Toàn Diện
            </button>

            {onSendMessage && (
              <button
                onClick={() => {
                  onSendMessage(user);
                  onClose();
                }}
                className="px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-md"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Gửi Tin Nhắn
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer transition-all"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return ReactDOM.createPortal(modalContent, document.body);
  }
  return modalContent;
};

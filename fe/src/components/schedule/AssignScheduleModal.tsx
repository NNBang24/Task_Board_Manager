import React, { useState } from 'react';
import {
  X,
  Calendar,
  Building2,
  Home,
  Plane,
  Palmtree,
  Sparkles,
  AlertCircle,
  Users,
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import {
  useScheduleStore,
  type WorkLocationType,
  type WorkShift,
} from '../../store/useScheduleStore';

interface AssignScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Array<{ id: string; fullName: string; profession?: string; avatar?: string }>;
  defaultUserId?: string;
  defaultDate?: string;
}

const WORK_TYPES: Array<{
  id: WorkLocationType;
  label: string;
  sub: string;
  icon: any;
  color: string;
  activeBg: string;
}> = [
  {
    id: 'OFFICE',
    label: 'Tại Văn Phòng (HQ)',
    sub: 'Làm việc trực tiếp tại trụ sở công ty',
    icon: Building2,
    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    activeBg: 'from-emerald-500/30 to-emerald-600/30 border-emerald-400 text-emerald-200',
  },
  {
    id: 'WFH',
    label: 'Làm Từ Xa (WFH)',
    sub: 'Làm việc tại nhà / Remote',
    icon: Home,
    color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    activeBg: 'from-indigo-500/30 to-indigo-600/30 border-indigo-400 text-indigo-200',
  },
  {
    id: 'ON_SITE',
    label: 'Đi Công Tác (On-Site)',
    sub: 'Gặp đối tác hoặc dự án ngoài công ty',
    icon: Plane,
    color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    activeBg: 'from-cyan-500/30 to-cyan-600/30 border-cyan-400 text-cyan-200',
  },
  {
    id: 'LEAVE',
    label: 'Nghỉ Phép (Leave)',
    sub: 'Phép năm, nghỉ ốm, nghỉ chế độ',
    icon: Palmtree,
    color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    activeBg: 'from-rose-500/30 to-rose-600/30 border-rose-400 text-rose-200',
  },
];

export const AssignScheduleModal: React.FC<AssignScheduleModalProps> = ({
  isOpen,
  onClose,
  members,
  defaultUserId,
  defaultDate,
}) => {
  const authUser = useAuthStore((state) => state.user);
  const { setUserBatchWorkLocations } = useScheduleStore();

  const todayStr = defaultDate || new Date().toISOString().split('T')[0];
  const [selectedUserId, setSelectedUserId] = useState(defaultUserId || (members[0]?.id || ''));
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [workType, setWorkType] = useState<WorkLocationType>('OFFICE');
  const [shift, setShift] = useState<WorkShift>('FULL_DAY');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedUserId) {
      setErrorMsg('Vui lòng chọn nhân sự để xếp lịch!');
      return;
    }

    if (startDate > endDate) {
      setErrorMsg('Ngày bắt đầu không được lớn hơn ngày kết thúc!');
      return;
    }

    const dates: string[] = [];
    const cur = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    while (cur <= end) {
      dates.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }

    try {
      setIsSubmitting(true);
      await setUserBatchWorkLocations(
        selectedUserId,
        workType,
        dates,
        {
          adminId: authUser?.id || 'admin',
          adminName: authUser?.fullName || 'Quản trị viên',
        },
        shift,
        note.trim() || undefined
      );
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi xếp lịch');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-xl solar-glass-card rounded-3xl bg-[#0F172A]/95 border border-amber-500/40 shadow-[0_0_60px_rgba(245,158,11,0.25)] p-6 sm:p-8 space-y-6 relative overflow-hidden animate-solar-warp-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                Xếp / Điều Chỉnh Lịch Làm Việc 👑
              </h2>
              <p className="text-xs text-slate-400">
                Chỉ định vị trí làm việc &amp; ca trực cho nhân sự trong hệ thống.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          {/* Nhân sự */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-amber-400" /> Chọn Nhân Sự <span className="text-rose-400">*</span>
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-amber-500 focus:outline-none"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} ({m.profession || 'DEV'})
                </option>
              ))}
            </select>
          </div>

          {/* Vị trí làm việc */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 block uppercase tracking-wider">
              Vị Trí Làm Việc <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {WORK_TYPES.map((wt) => {
                const Icon = wt.icon;
                const isSelected = workType === wt.id;
                return (
                  <button
                    key={wt.id}
                    type="button"
                    onClick={() => setWorkType(wt.id)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                      isSelected
                        ? `${wt.color} bg-gradient-to-r ${wt.activeBg} shadow-lg ring-1 ring-amber-400/40 font-bold`
                        : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-xs">{wt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Khoảng ngày & Ca */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 block">Từ Ngày</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 block">Đến Ngày</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 block">Ca Làm</label>
              <select
                value={shift}
                onChange={(e) => setShift(e.target.value as WorkShift)}
                className="w-full px-2 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-amber-500 focus:outline-none"
              >
                <option value="FULL_DAY">🌕 Cả ngày</option>
                <option value="MORNING">🌅 Sáng (0.5d)</option>
                <option value="AFTERNOON">🌆 Chiều (0.5d)</option>
              </select>
            </div>
          </div>

          {/* Ghi chú */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300 block">Ghi Chú Xếp Lịch</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Chỉ định trực văn phòng để đón đối tác..."
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-amber-500 focus:outline-none placeholder:text-slate-600"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center gap-1.5 transition-all shadow-lg cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Đang lưu...' : 'Xác Nhận Xếp Lịch'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

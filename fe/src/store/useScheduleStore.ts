import { create } from 'zustand';
import { api } from '../services/api';

export type WorkLocationType = 'OFFICE' | 'WFH' | 'ON_SITE' | 'LEAVE';
export type WorkShift = 'FULL_DAY' | 'MORNING' | 'AFTERNOON';
export type LeaveType = 'WFH' | 'ANNUAL_LEAVE' | 'SICK_LEAVE' | 'UNPAID_LEAVE' | 'MATERNITY_LEAVE' | 'OTHER';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'APPROVED_MODIFIED' | 'REJECTED' | 'CANCELLED';

export interface WorkScheduleRecord {
  id: string;
  userId: string;
  userName?: string;
  userAvatar?: string;
  date: string; // Format: YYYY-MM-DD
  workType: WorkLocationType;
  shift: WorkShift;
  note?: string;
  createdById?: string;
  createdByName?: string;
  updatedAt?: string;
}

export interface LeaveRequestRecord {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  departmentName?: string;
  type: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  shift: WorkShift;
  reason: string;
  status: LeaveStatus;
  handoverPlan?: string;
  approverId?: string;
  approverName?: string;
  responseNote?: string;
  approvedStartDate?: string;
  approvedEndDate?: string;
  createdAt: string;
}

export interface WorkLocationInfo {
  workType: WorkLocationType;
  shift?: WorkShift;
  shiftLabel?: string;
  source: 'LEAVE_REQUEST' | 'SCHEDULE' | 'MANUAL_OVERRIDE' | 'DEFAULT';
  sourceTitle: string;
  approverName?: string;
  note?: string;
}

export const getShiftLabel = (shift?: WorkShift): string => {
  switch (shift) {
    case 'MORNING':
      return 'Buổi Sáng (0.5 ngày)';
    case 'AFTERNOON':
      return 'Buổi Chiều (0.5 ngày)';
    case 'FULL_DAY':
    default:
      return 'Cả Ngày';
  }
};

export const getShiftShortLabel = (shift?: WorkShift): string => {
  switch (shift) {
    case 'MORNING':
      return 'Sáng';
    case 'AFTERNOON':
      return 'Chiều';
    case 'FULL_DAY':
    default:
      return 'Cả ngày';
  }
};

interface ScheduleStoreState {
  workSchedules: WorkScheduleRecord[];
  leaveRequests: LeaveRequestRecord[];
  isLoading: boolean;

  // 🔄 Đồng bộ từ Server API CSDL
  fetchSchedulesAndLeaves: (startDate?: string, endDate?: string, userId?: string) => Promise<void>;

  // 📍 Lấy vị trí làm việc của một User tại một ngày bất kỳ (Lịch là nguồn sự thật)
  getWorkLocationForDate: (userId: string, dateStr: string) => WorkLocationInfo;

  // 👑 Cập nhật vị trí làm việc 1 ngày
  setUserDailyWorkLocation: (
    userId: string,
    workType: WorkLocationType,
    dateStr?: string,
    adminInfo?: { adminId: string; adminName: string },
    shift?: WorkShift,
    customNote?: string
  ) => Promise<void>;

  // 🚀 Cập nhật vị trí làm việc hàng loạt theo dải ngày (Batch Update)
  setUserBatchWorkLocations: (
    userId: string,
    workType: WorkLocationType,
    dates: string[],
    adminInfo?: { adminId: string; adminName: string },
    shift?: WorkShift,
    customNote?: string
  ) => Promise<void>;

  // 📝 Quản lý Đơn xin nghỉ / WFH
  addLeaveRequest: (request: Omit<LeaveRequestRecord, 'id' | 'createdAt' | 'status'>) => Promise<void>;
  cancelLeaveRequest: (requestId: string, userId: string) => Promise<void>;
  reviewLeaveRequest: (
    requestId: string,
    status: 'APPROVED' | 'APPROVED_MODIFIED' | 'REJECTED',
    approverId: string,
    approverName: string,
    responseNote?: string,
    modifiedDates?: { startDate: string; endDate: string },
    modifiedShift?: WorkShift
  ) => Promise<void>;

  // 📅 Lấy thống kê quân số trong ngày
  getDailyAttendanceStats: (dateStr: string) => {
    office: number;
    wfh: number;
    onSite: number;
    leave: number;
    total: number;
  };
}

const formatDateToKey = (date?: Date | string): string => {
  if (!date) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getInitialSchedules = (): WorkScheduleRecord[] => {
  try {
    const raw = localStorage.getItem('solaris_work_schedules');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const getInitialLeaveRequests = (): LeaveRequestRecord[] => {
  try {
    const raw = localStorage.getItem('solaris_leave_requests');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const useScheduleStore = create<ScheduleStoreState>((set, get) => ({
  workSchedules: getInitialSchedules(),
  leaveRequests: getInitialLeaveRequests(),
  isLoading: false,

  fetchSchedulesAndLeaves: async (startDate, endDate, userId) => {
    try {
      set({ isLoading: true });
      const params: Record<string, string> = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (userId && userId !== 'ALL') params.userId = userId;

      const [schedRes, leaveRes] = await Promise.all([
        api.get('/schedule/work-schedules', { params }).catch(() => ({ data: [] })),
        api.get('/schedule/leave-requests', { params: userId ? { userId } : {} }).catch(() => ({ data: [] })),
      ]);

      const fetchedSchedules = Array.isArray(schedRes.data)
        ? schedRes.data
        : Array.isArray(schedRes.data?.data)
        ? schedRes.data.data
        : [];

      const fetchedLeaves = Array.isArray(leaveRes.data)
        ? leaveRes.data
        : Array.isArray(leaveRes.data?.data)
        ? leaveRes.data.data
        : [];

      try {
        localStorage.setItem('solaris_work_schedules', JSON.stringify(fetchedSchedules));
        localStorage.setItem('solaris_leave_requests', JSON.stringify(fetchedLeaves));
      } catch (err) {
        console.error('LocalStorage sync error:', err);
      }

      set({
        workSchedules: fetchedSchedules,
        leaveRequests: fetchedLeaves,
        isLoading: false,
      });
    } catch (err) {
      console.error('Lỗi tải dữ liệu lịch từ Server:', err);
      set({ isLoading: false });
    }
  },

  getWorkLocationForDate: (userId: string, dateStr: string): WorkLocationInfo => {
    const state = get();
    const targetDateKey = dateStr.split('T')[0];

    // 1. 🌟 NGUỒN ƯU TIÊN 1: Đơn xin WFH / Nghỉ phép đã được Duyệt
    const matchingApprovedLeave = state.leaveRequests.find((req) => {
      if (req.userId !== userId) return false;
      if (req.status !== 'APPROVED' && req.status !== 'APPROVED_MODIFIED') return false;

      const effectiveStart = req.approvedStartDate || req.startDate;
      const effectiveEnd = req.approvedEndDate || req.endDate;

      return targetDateKey >= effectiveStart && targetDateKey <= effectiveEnd;
    });

    if (matchingApprovedLeave) {
      const shiftShort =
        matchingApprovedLeave.shift && matchingApprovedLeave.shift !== 'FULL_DAY'
          ? ` (${getShiftShortLabel(matchingApprovedLeave.shift)})`
          : '';
      return {
        workType: matchingApprovedLeave.type === 'WFH' ? 'WFH' : 'LEAVE',
        shift: matchingApprovedLeave.shift,
        shiftLabel: getShiftLabel(matchingApprovedLeave.shift),
        source: 'LEAVE_REQUEST',
        sourceTitle: `${matchingApprovedLeave.type === 'WFH' ? 'Đã Duyệt WFH' : 'Đã Duyệt Phép'}${shiftShort}`,
        approverName: matchingApprovedLeave.approverName || 'Quản lý',
        note: matchingApprovedLeave.reason,
      };
    }

    // 2. 🌟 NGUỒN ƯU TIÊN 2: Bản ghi Lịch Làm Việc chính thức (Admin Xếp Lịch)
    const matchingSchedule = state.workSchedules.find(
      (s) => s.userId === userId && s.date === targetDateKey
    );

    if (matchingSchedule) {
      const shiftShort =
        matchingSchedule.shift && matchingSchedule.shift !== 'FULL_DAY'
          ? ` (${getShiftShortLabel(matchingSchedule.shift)})`
          : '';
      return {
        workType: matchingSchedule.workType,
        shift: matchingSchedule.shift,
        shiftLabel: getShiftLabel(matchingSchedule.shift),
        source: 'SCHEDULE',
        sourceTitle: matchingSchedule.createdByName
          ? `Lịch do ${matchingSchedule.createdByName} xếp${shiftShort}`
          : `Lịch Làm Việc${shiftShort}`,
        approverName: matchingSchedule.createdByName,
        note: matchingSchedule.note,
      };
    }

    // 3. 🌟 NGUỒN MẶC ĐỊNH: Làm việc tại Văn Phòng
    return {
      workType: 'OFFICE',
      shift: 'FULL_DAY',
      shiftLabel: 'Cả Ngày',
      source: 'DEFAULT',
      sourceTitle: 'Tại Văn Phòng',
    };
  },

  setUserDailyWorkLocation: async (userId, workType, dateStr, adminInfo, shift, customNote) => {
    const targetDateKey = dateStr ? dateStr.split('T')[0] : formatDateToKey();
    await get().setUserBatchWorkLocations(userId, workType, [targetDateKey], adminInfo, shift, customNote);
  },

  setUserBatchWorkLocations: async (userId, workType, dates, adminInfo, shift, customNote) => {
    if (!dates || dates.length === 0) return;
    const effectiveShift = shift || 'FULL_DAY';
    const effectiveNote = customNote || (adminInfo ? `Được chỉ định bởi Admin ${adminInfo.adminName}` : 'Cập nhật trực tiếp');

    // Optimistic Update
    set((state) => {
      const scheduleMap = new Map<string, WorkScheduleRecord>();
      state.workSchedules.forEach((s) => {
        scheduleMap.set(`${s.userId}_${s.date}_${s.shift || 'FULL_DAY'}`, s);
      });

      dates.forEach((dateKey) => {
        const key = `${userId}_${dateKey}_${effectiveShift}`;
        const existing = scheduleMap.get(key);
        if (existing) {
          scheduleMap.set(key, {
            ...existing,
            workType,
            shift: effectiveShift,
            note: effectiveNote,
            createdById: adminInfo?.adminId || existing.createdById,
            createdByName: adminInfo?.adminName || existing.createdByName,
            updatedAt: new Date().toISOString(),
          });
        } else {
          scheduleMap.set(key, {
            id: `ws-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            userId,
            date: dateKey,
            workType,
            shift: effectiveShift,
            note: effectiveNote,
            createdById: adminInfo?.adminId,
            createdByName: adminInfo?.adminName,
            updatedAt: new Date().toISOString(),
          });
        }
      });

      const updatedSchedules = Array.from(scheduleMap.values());
      try {
        localStorage.setItem('solaris_work_schedules', JSON.stringify(updatedSchedules));
      } catch (err) {
        console.error('LocalStorage error:', err);
      }
      return { workSchedules: updatedSchedules };
    });

    // Gọi API Backend
    try {
      await api.post('/schedule/assign', {
        userId,
        workType,
        dates,
        shift: effectiveShift,
        note: effectiveNote,
      });
      // Tải lại để đồng bộ chính xác ID CSDL
      await get().fetchSchedulesAndLeaves();
    } catch (err) {
      console.error('Lỗi gọi API assign schedule:', err);
    }
  },

  addLeaveRequest: async (reqData) => {
    const state = get();
    // 🔒 [LC-114] CHẶN TRÙNG LẶP ĐƠN
    const hasOverlap = state.leaveRequests.some((existing) => {
      if (existing.userId !== reqData.userId) return false;
      if (existing.status === 'REJECTED' || existing.status === 'CANCELLED') return false;

      const existingStart = existing.approvedStartDate || existing.startDate;
      const existingEnd = existing.approvedEndDate || existing.endDate;

      return reqData.startDate <= existingEnd && reqData.endDate >= existingStart;
    });

    if (hasOverlap) {
      throw new Error('Bạn đã có đơn xin nghỉ / WFH (đang chờ duyệt hoặc đã duyệt) trong khoảng thời gian này!');
    }

    // Gọi API Backend
    try {
      const res = await api.post('/schedule/leave-requests', {
        type: reqData.type,
        startDate: reqData.startDate,
        endDate: reqData.endDate,
        shift: reqData.shift,
        reason: reqData.reason,
        handoverPlan: reqData.handoverPlan,
      });

      const newRecord: LeaveRequestRecord = res.data?.data || res.data || {
        ...reqData,
        id: `lr-${Date.now()}`,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      set((curr) => {
        const updated = [newRecord, ...curr.leaveRequests.filter((r) => r.id !== newRecord.id)];
        try {
          localStorage.setItem('solaris_leave_requests', JSON.stringify(updated));
        } catch (err) {
          console.error('LocalStorage error:', err);
        }
        return { leaveRequests: updated };
      });
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Lỗi gửi đơn nghỉ phép';
      throw new Error(errorMsg);
    }
  },

  cancelLeaveRequest: async (requestId: string, _userId: string) => {
    try {
      await api.patch(`/schedule/leave-requests/${requestId}/cancel`);

      set((state) => {
        const targetReq = state.leaveRequests.find((r) => r.id === requestId);
        if (!targetReq) return state;

        const updatedRequests = state.leaveRequests.map((r) =>
          r.id === requestId ? { ...r, status: 'CANCELLED' as const } : r
        );

        let updatedSchedules = [...state.workSchedules];
        if (targetReq.status === 'APPROVED' || targetReq.status === 'APPROVED_MODIFIED') {
          const start = targetReq.approvedStartDate || targetReq.startDate;
          const end = targetReq.approvedEndDate || targetReq.endDate;

          updatedSchedules = updatedSchedules.filter((s) => {
            if (s.userId !== targetReq.userId) return true;
            return !(s.date >= start && s.date <= end && s.note?.includes(targetReq.reason));
          });
        }

        try {
          localStorage.setItem('solaris_leave_requests', JSON.stringify(updatedRequests));
          localStorage.setItem('solaris_work_schedules', JSON.stringify(updatedSchedules));
        } catch (err) {
          console.error('LocalStorage error:', err);
        }

        return {
          leaveRequests: updatedRequests,
          workSchedules: updatedSchedules,
        };
      });
    } catch (err: any) {
      console.error('Lỗi hủy đơn nghỉ phép:', err);
      const errorMsg = err.response?.data?.message || err.message || 'Lỗi khi hủy đơn';
      throw new Error(errorMsg);
    }
  },

  reviewLeaveRequest: async (
    requestId,
    status,
    _approverId,
    _approverName,
    responseNote,
    modifiedDates,
    modifiedShift
  ) => {
    try {
      await api.patch(`/schedule/leave-requests/${requestId}/review`, {
        status,
        responseNote,
        approvedStartDate: modifiedDates?.startDate,
        approvedEndDate: modifiedDates?.endDate,
        modifiedShift,
      });

      // Tải lại dữ liệu mới nhất từ CSDL
      await get().fetchSchedulesAndLeaves();
    } catch (err: any) {
      console.error('Lỗi duyệt đơn:', err);
      const errorMsg = err.response?.data?.message || err.message || 'Lỗi khi duyệt đơn';
      throw new Error(errorMsg);
    }
  },

  getDailyAttendanceStats: (dateStr) => {
    const state = get();
    const targetDateKey = dateStr.split('T')[0];

    const records = state.workSchedules.filter((s) => s.date === targetDateKey);
    let office = 0;
    let wfh = 0;
    let onSite = 0;
    let leave = 0;

    records.forEach((r) => {
      if (r.workType === 'WFH') wfh++;
      else if (r.workType === 'ON_SITE') onSite++;
      else if (r.workType === 'LEAVE') leave++;
      else office++;
    });

    return {
      office,
      wfh,
      onSite,
      leave,
      total: records.length,
    };
  },
}));

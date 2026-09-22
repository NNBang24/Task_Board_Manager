import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { ArrowRight } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

interface UserProfile {
  id?: string;
  fullName: string;
  avatar?: string;
  email?: string;
}

interface ActivityItem {
  id: string;
  action: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
  type?: string;
  user?: UserProfile;
  content?: string;
}

interface TaskActivityTimelineProps {
  taskId: string;
}

export const TaskActivityTimeline: React.FC<TaskActivityTimelineProps> = ({ taskId }) => {
  const currentUser = useAuthStore((state) => state.user);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'all' | 'history' | 'worklog'>('all');

  useEffect(() => {
    if (!taskId) return;
    let isMounted = true;

    const fetchActivities = async () => {
      queueMicrotask(() => {
        if (isMounted) setIsLoading(true);
      });

      try {
        const res = await api.get(`/tasks/${taskId}/activities`);
        const responsePayload = res.data as { data?: { data?: ActivityItem[] } | ActivityItem[] };
        const rawData = 
          (typeof responsePayload?.data === 'object' && responsePayload?.data !== null && 'data' in responsePayload.data 
            ? (responsePayload.data as { data: ActivityItem[] }).data 
            : responsePayload?.data) || [];
            
        const items: ActivityItem[] = Array.isArray(rawData) ? rawData : [];

        if (isMounted) {
          const historyList: ActivityItem[] = items.filter(
            (item) => !item.content && item.type !== 'COMMENT'
          );
          setActivities(historyList);
        }
      } catch (err) {
        console.error('Không thể tải dữ liệu activity:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchActivities();

    return () => {
      isMounted = false;
    };
  }, [taskId]);

  return (
    <div className="space-y-4 font-sans">
      <div className="space-y-3">
        <h3 className="text-sm font-extrabold text-slate-200 tracking-wide">Activity</h3>

        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === 'history' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              History
            </button>
            <button
              onClick={() => setActiveTab('worklog')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === 'worklog' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Work log
            </button>
          </div>

          <span className="text-[11px] font-mono text-slate-500">
            Sort by: <strong className="text-slate-300">Newest first</strong>
          </span>
        </div>
      </div>

      <div className="space-y-3 pt-2 max-h-[380px] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="text-center py-6 text-xs font-mono text-slate-500 animate-pulse">Đang tải dữ liệu...</div>
        ) : activeTab === 'worklog' ? (
          <div className="text-center py-6 text-xs font-mono text-slate-500 border border-dashed border-slate-800 rounded-xl">
            Tính năng Work log đang cập nhật.
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-6 text-xs font-mono text-slate-500 border border-dashed border-slate-800 rounded-xl">
            Chưa có lịch sử hoạt động nào.
          </div>
        ) : (
          activities.map((item: ActivityItem) => {
            const initials = item.user?.fullName
              ? item.user.fullName
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()
              : 'US';

            return (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-3 text-xs"
              >
                <div className="w-8 h-8 rounded-full bg-amber-500 text-slate-950 font-extrabold flex items-center justify-center shrink-0 text-xs shadow-sm overflow-hidden">
                  {item.user?.avatar ? (
                    <img src={item.user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>

                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-100 text-xs">
                      {item.user?.fullName || 'Thành viên'}{' '}
                      <span className="font-normal text-slate-400">changed the</span>{' '}
                      <strong className="text-slate-200">Status</strong>
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                      {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                    </span>
                  </div>

                  {(item.oldValue || item.newValue || item.action) && (
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700/80 shadow-xs">
                        {item.oldValue || 'To Do'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="px-2.5 py-1 rounded-lg bg-blue-600/30 text-blue-300 font-mono text-[11px] border border-blue-500/40 shadow-xs">
                        {item.newValue || item.action}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
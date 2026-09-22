import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  LayoutGrid,
  Table as TableIcon,
  Shield,
  Building2,
  Mail,
  Phone,
  Code2,
  KeyRound,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  X,
  Sparkles,
  UserCheck,
  RotateCcw,
  Loader2,
  Edit2,
  ArrowRightLeft,
  CheckSquare,
  Square,
  Lock,
  Unlock,
} from 'lucide-react';
import type { GlobalRole, Profession } from '../types/auth';
import { UserProfileModal, type UserProfileData } from '../components/common/UserProfileModal';
import { useUserStore, type DirectoryUser, type DepartmentItem } from '../store/useUserStore';
import { getAvatarUrl } from '../utils/avatar';
import { api } from '../services/api';

export const AdminUsersPage: React.FC = () => {
  // Store States
  const users = useUserStore((state) => state.users);
  const isLoading = useUserStore((state) => state.isLoading);
  const fetchUsers = useUserStore((state) => state.fetchUsers);
  const deleteUser = useUserStore((state) => state.deleteUser);

  const departments = useUserStore((state) => state.departments);
  const isLoadingDepartments = useUserStore((state) => state.isLoadingDepartments);
  const fetchDepartments = useUserStore((state) => state.fetchDepartments);
  const createDepartment = useUserStore((state) => state.createDepartment);
  const updateDepartment = useUserStore((state) => state.updateDepartment);
  const deleteDepartment = useUserStore((state) => state.deleteDepartment);
  const transferUsersDepartment = useUserStore((state) => state.transferUsersDepartment);

  // High-Level Tab Switcher: 'users' | 'departments'
  const [activeMainTab, setActiveMainTab] = useState<'users' | 'departments'>('users');

  // Multi-Selection State for Users
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Transfer Personnel Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTargetDeptId, setTransferTargetDeptId] = useState<string>('');
  const [transferUserList, setTransferUserList] = useState<DirectoryUser[]>([]);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);

  // User Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('Tất Cả');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Department Search State
  const [deptSearchQuery, setDeptSearchQuery] = useState('');

  // Action Loading
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [isSubmittingDept, setIsSubmittingDept] = useState(false);

  // User Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedProfileUser, setSelectedProfileUser] = useState<UserProfileData | null>(null);
  const [selectedUserForRole, setSelectedUserForRole] = useState<DirectoryUser | null>(null);
  const [selectedUserForDelete, setSelectedUserForDelete] = useState<DirectoryUser | null>(null);
  const [selectedUserForLock, setSelectedUserForLock] = useState<DirectoryUser | null>(null);

  // Edit User Modal
  const [editingUser, setEditingUser] = useState<DirectoryUser | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editProfession, setEditProfession] = useState<Profession>('DEV');
  const [editDepartmentId, setEditDepartmentId] = useState('');
  const [editBio, setEditBio] = useState('');
  const [isSubmittingUpdate, setIsSubmittingUpdate] = useState(false);

  // Department Modals
  const [isCreateDeptModalOpen, setIsCreateDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentItem | null>(null);
  const [deletingDept, setDeletingDept] = useState<DepartmentItem | null>(null);

  // Form State for Department (Create / Edit)
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptDescription, setDeptDescription] = useState('');

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Form State for New User
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('Solaris@2026');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newJobTitle, setNewJobTitle] = useState('');

  // ✅ Để rỗng, không hard-code Engineering
  const [newDepartment, setNewDepartment] = useState('');

  const [newProfession, setNewProfession] = useState<Profession>('DEV');
  const [newRole, setNewRole] = useState<GlobalRole>('EMPLOYEE');

  // Fetch Users & Departments on Mount
  useEffect(() => {
    fetchUsers();
    fetchDepartments();
  }, [fetchUsers, fetchDepartments]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 🏢 Dynamic Department Dropdown Options
  const departmentOptions = useMemo(() => {
    const dbDeptNames = departments.map((d) => d.name);

    const userDeptNames = users.map((u) => u.department).filter(Boolean);

    const combined = Array.from(new Set([...dbDeptNames, ...userDeptNames]));

    return [
      'Tất Cả',
      ...(combined.length > 0
        ? combined
        : ['Engineering', 'Product & Planning', 'Design & UX', 'QA & Testing', 'Operations & SRE']),
    ];
  }, [departments, users]);
  // const defaultNewDepartment = newDepartment || departments[0]?.name || '';

  const handleGenerateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';

    let pass = 'Sol@';

    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    setNewPassword(pass);

    showToast(`🔑 Đã tạo mật khẩu ngẫu nhiên: ${pass}`);
  };

  // 🔍 User Filter Logic
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchQuery =
        u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.jobTitle.toLowerCase().includes(searchQuery.toLowerCase());

      const matchRole = selectedRole === 'ALL' || u.globalRole === selectedRole;
      const matchDept = selectedDepartment === 'Tất Cả' || u.department === selectedDepartment;

      return matchQuery && matchRole && matchDept;
    });
  }, [users, searchQuery, selectedRole, selectedDepartment]);

  // 🔍 Department Filter Logic
  const filteredDepartments = useMemo(() => {
    return departments.filter((d) => {
      const q = deptSearchQuery.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        (d.description && d.description.toLowerCase().includes(q))
      );
    });
  }, [departments, deptSearchQuery]);

  // 📊 KPI Metrics for Users
  const metrics = useMemo(() => {
    const total = users.length;
    const managers = users.filter((u) => u.globalRole === 'MANAGER').length;
    const devs = users.filter((u) => u.profession === 'DEV').length;
    const allocated = users.filter((u) => u.department && u.department !== 'Chưa phân bổ').length;
    return { total, managers, devs, allocated };
  }, [users]);

  // 📊 KPI Metrics for Departments
  const deptMetrics = useMemo(() => {
    const totalDepts = departments.length;
    const allocatedUsers = users.filter((u) => u.department && u.department !== 'Chưa phân bổ').length;
    const unallocatedUsers = users.filter((u) => !u.department || u.department === 'Chưa phân bổ').length;
    return { totalDepts, allocatedUsers, unallocatedUsers };
  }, [departments, users]);

  // 🛠️ User Action Handlers
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim() || !newEmail.trim() || !newPassword.trim()) {
      showToast('⚠️ Vui lòng nhập đầy đủ Họ tên, Email và Mật khẩu khởi tạo!');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      await api.post('/users', {
        fullName: newFullName.trim(),
        email: newEmail.trim(),
        password: newPassword.trim(),
        phone: newPhone.trim() || undefined,
        jobTitle: newJobTitle.trim() || 'Software Engineer',
        department: newDepartment,
        profession: newProfession,
        role: newRole,
      });

      await fetchUsers();
      setIsCreateModalOpen(false);
      showToast(`✅ Đã khởi tạo nhân sự mới: ${newFullName.trim()} (Mật khẩu: ${newPassword})`);

      // Reset Form
      setNewFullName('');
      setNewEmail('');
      setNewPassword('Solaris@2026');
      setNewPhone('');
      setNewJobTitle('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể khởi tạo nhân sự mới';
      showToast(`❌ Lỗi: ${msg}`);
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleOpenProfile = (u: DirectoryUser) => {
    setSelectedProfileUser({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      avatarUrl: getAvatarUrl(u),
      avatar: getAvatarUrl(u),
      globalRole: u.globalRole,
      profession: u.profession,
      jobTitle: u.jobTitle,
      department: u.department,
      statusSignal: u.statusSignal,
      joinedDate: u.joinedDate,
      projectsCount: u.projectsCount,
      tasksCount: u.tasksCount,
      bio: u.bio || `Chuyên gia ${u.jobTitle} phụ trách các giải pháp phân hệ ${u.department} tại Solaris Platform.`,
      workMode: u.workMode || 'OFFICE',
    });
  };

  const handleOpenEditUser = (user: DirectoryUser) => {
    const resolvedDepartmentId = user.departmentId || departments.find((d) => d.name === user.department)?.id || '';

    setEditingUser(user);
    setEditFullName(user.fullName || '');
    setEditPhone(user.phone || '');
    setEditJobTitle(user.jobTitle || '');
    setEditProfession(user.profession || 'DEV');
    setEditDepartmentId(resolvedDepartmentId);
    setEditBio(user.bio || '');
  };

  const handleCloseEditUser = () => {
    if (isSubmittingUpdate) return;
    setEditingUser(null);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (!editFullName.trim()) {
      showToast('⚠️ Họ và tên không được để trống!');
      return;
    }

    setIsSubmittingUpdate(true);
    try {
      await api.patch(`/users/${editingUser.id}`, {
        fullName: editFullName.trim(),
        phone: editPhone.trim(),
        jobTitle: editJobTitle.trim(),
        profession: editProfession,
        departmentId: editDepartmentId || undefined,
        bio: editBio.trim(),
      });

      await fetchUsers();
      setEditingUser(null);

      if (selectedProfileUser?.id === editingUser.id) {
        setSelectedProfileUser(null);
      }

      showToast(`✅ Đã cập nhật thông tin nhân sự: ${editFullName.trim()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cập nhật thông tin nhân sự thất bại';
      showToast(`❌ Lỗi: ${msg}`);
    } finally {
      setIsSubmittingUpdate(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRoleValue: GlobalRole) => {
    setActionLoadingId(userId);
    try {
      await api.patch(`/users/${userId}/role`, { role: newRoleValue });
      await fetchUsers();
      setSelectedUserForRole(null);
      showToast(`✅ Đã cập nhật vai trò phân quyền thành công!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cập nhật vai trò thất bại';
      showToast(`❌ Lỗi: ${msg}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteUser = async (user: DirectoryUser) => {
    setActionLoadingId(user.id);
    try {
      await deleteUser(user.id);
      setSelectedUserForDelete(null);
      showToast(`🗑️ Đã xóa vĩnh viễn tài khoản: ${user.fullName}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xóa tài khoản thất bại';
      showToast(`❌ Lỗi: ${msg}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResetPassword = async (u: DirectoryUser) => {
    setActionLoadingId(u.id);
    try {
      await api.post(`/users/${u.id}/reset-password`);
      showToast(`🔑 Đã cấp lại mật khẩu mặc định cho ${u.fullName}!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể cấp lại mật khẩu';
      showToast(`❌ Lỗi: ${msg}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleLockUser = async (user: DirectoryUser) => {
    const nextActiveState = !user.isActive;
    setActionLoadingId(user.id);
    try {
      await api.patch(`/users/${user.id}/lock`, { isActive: nextActiveState });
      await fetchUsers();
      setSelectedUserForLock(null);
      showToast(`🔒 Đã ${nextActiveState ? 'mở khóa' : 'khóa'} tài khoản của ${user.fullName}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Thao tác thất bại';
      showToast(`❌ Lỗi: ${msg}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 🏢 Department Action Handlers
  const handleOpenCreateDept = () => {
    setDeptName('');
    setDeptCode('');
    setDeptDescription('');
    setIsCreateDeptModalOpen(true);
  };

  const handleOpenEditDept = (d: DepartmentItem) => {
    setEditingDept(d);
    setDeptName(d.name);
    setDeptCode(d.code);
    setDeptDescription(d.description || '');
  };

  const handleSubmitCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName.trim() || !deptCode.trim()) {
      showToast('⚠️ Vui lòng nhập Tên và Mã phòng ban!');
      return;
    }
    setIsSubmittingDept(true);
    try {
      await createDepartment({
        name: deptName.trim(),
        code: deptCode.trim().toUpperCase(),
        description: deptDescription.trim() || undefined,
      });
      setIsCreateDeptModalOpen(false);
      showToast(`🏢 Đã khởi tạo phòng ban: ${deptName.trim()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tạo phòng ban';
      showToast(`❌ Lỗi: ${msg}`);
    } finally {
      setIsSubmittingDept(false);
    }
  };

  const handleSubmitEditDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDept || !deptName.trim() || !deptCode.trim()) return;
    setIsSubmittingDept(true);
    try {
      await updateDepartment(editingDept.id, {
        name: deptName.trim(),
        code: deptCode.trim().toUpperCase(),
        description: deptDescription.trim() || undefined,
      });
      setEditingDept(null);
      showToast(`✅ Đã cập nhật thông tin phòng ban: ${deptName.trim()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cập nhật phòng ban thất bại';
      showToast(`❌ Lỗi: ${msg}`);
    } finally {
      setIsSubmittingDept(false);
    }
  };

  const handleConfirmDeleteDept = async () => {
    if (!deletingDept) return;
    setIsSubmittingDept(true);
    try {
      await deleteDepartment(deletingDept.id);
      setDeletingDept(null);
      await fetchUsers();
      showToast(`🗑️ Đã xóa phòng ban: ${deletingDept.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xóa phòng ban thất bại';
      showToast(`❌ Lỗi: ${msg}`);
    } finally {
      setIsSubmittingDept(false);
    }
  };

  // 👥 Multi-Selection Handlers
  const handleToggleSelectUser = (userId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedUserIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const isAllFilteredSelected = useMemo(() => {
    if (filteredUsers.length === 0) return false;
    return filteredUsers.every((u) => selectedUserIds.includes(u.id));
  }, [filteredUsers, selectedUserIds]);

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      const filteredIds = new Set(filteredUsers.map((u) => u.id));
      setSelectedUserIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      const filteredIds = filteredUsers.map((u) => u.id);
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleClearSelection = () => {
    setSelectedUserIds([]);
  };

  // 🏢 Transfer Department Handlers
  const handleOpenTransferSingle = (user: DirectoryUser, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTransferUserList([user]);
    const currentDeptId = user.departmentId || departments.find((d) => d.name === user.department)?.id;
    const firstOtherDept = departments.find((d) => d.id !== currentDeptId);
    setTransferTargetDeptId(firstOtherDept?.id || departments[0]?.id || '');
    setIsTransferModalOpen(true);
  };

  const handleOpenTransferBulk = () => {
    const selected = users.filter((u) => selectedUserIds.includes(u.id));
    if (selected.length === 0) {
      showToast('⚠️ Vui lòng tích chọn ít nhất 1 nhân sự để điều chuyển!');
      return;
    }
    setTransferUserList(selected);
    setTransferTargetDeptId(departments[0]?.id || '');
    setIsTransferModalOpen(true);
  };

  const handleOpenTransferToDept = (targetDept: DepartmentItem) => {
    const selected = users.filter((u) => selectedUserIds.includes(u.id));
    if (selected.length > 0) {
      setTransferUserList(selected);
      setTransferTargetDeptId(targetDept.id);
      setIsTransferModalOpen(true);
    } else {
      setActiveMainTab('users');
      showToast(`👉 Hãy tích chọn các nhân sự cần chuyển rồi bấm [Chuyển Đến: ${targetDept.name}]!`);
    }
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTargetDeptId) {
      showToast('⚠️ Vui lòng chọn khối phòng ban tiếp nhận!');
      return;
    }
    const targetDept = departments.find((d) => d.id === transferTargetDeptId);
    if (!targetDept) {
      showToast('⚠️ Không tìm thấy phòng ban đích!');
      return;
    }

    setIsSubmittingTransfer(true);
    try {
      await transferUsersDepartment(
        transferUserList.map((u) => u.id),
        transferTargetDeptId
      );
      setIsTransferModalOpen(false);
      setSelectedUserIds([]);
      showToast(`✅ Đã điều chuyển ${transferUserList.length} nhân sự sang phòng ban "${targetDept.name}" thành công!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Điều chuyển nhân sự thất bại';
      showToast(`❌ Lỗi: ${msg}`);
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  // Helper Badge Colors
  const getRoleBadge = (role: GlobalRole) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-gradient-to-r from-rose-500/20 to-amber-500/20 text-rose-300 border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.2)]';
      case 'MANAGER':
        return 'bg-gradient-to-r from-purple-500/20 to-indigo-500/20 text-purple-300 border-purple-500/40';
      case 'EMPLOYEE':
        return 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/40';
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 animate-fade-in relative pb-16">
      {/* 🍞 Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl bg-slate-900/95 border border-amber-500/50 text-white text-xs font-bold shadow-[0_0_30px_rgba(245,158,11,0.3)] backdrop-blur-xl flex items-center gap-2 animate-solar-drop-snap">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 🌟 Header Banner */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              {activeMainTab === 'users' ? <Users className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                Quản Trị Tổ Chức &amp; Nhân Sự
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  ADMIN ONLY
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Quản trị tài khoản, phân quyền RBAC và điều phối cơ cấu phòng ban
              </p>
            </div>
          </div>
        </div>

        {/* Action Button Dynamically Adapts to Tab */}
        {activeMainTab === 'users' ? (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shrink-0 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Thêm Nhân Sự Mới
          </button>
        ) : (
          <button
            onClick={handleOpenCreateDept}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shrink-0 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Thêm Phòng Ban Mới
          </button>
        )}
      </div>

      {/* 🚀 HIGH-LEVEL TAB SWITCHER (Nhân Sự vs Khối Phòng Ban) */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/80 border border-slate-800 w-fit">
        <button
          onClick={() => setActiveMainTab('users')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeMainTab === 'users' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Danh Bạ Nhân Sự ({users.length})</span>
        </button>
        <button
          onClick={() => setActiveMainTab('departments')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeMainTab === 'departments' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Khối Phòng Ban ({departments.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 👥 TAB 1: QUẢN LÝ NHÂN SỰ                                                  */}
      {/* ========================================================================= */}
      {activeMainTab === 'users' && (
        <div className="space-y-5 animate-fade-in">
          {/* 📊 KPI Summary Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Tổng Nhân Sự</span>
                <span className="text-xl font-bold text-white font-mono">{metrics.total}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Cấp Quản Lý (PM)</span>
                <span className="text-xl font-bold text-purple-300 font-mono">{metrics.managers}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                <Code2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Lập Trình Viên (DEV)</span>
                <span className="text-xl font-bold text-cyan-300 font-mono">{metrics.devs}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Đã Phân Bổ Phòng Ban</span>
                <span className="text-xl font-bold text-amber-300 font-mono">{metrics.allocated}</span>
              </div>
            </div>
          </div>

          {/* 🔍 Smart Toolbar & Filter Cluster */}
          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên, email, chức danh..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-700 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Dropdown Filters & Selection Action */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                    isAllFilteredSelected
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                  title={isAllFilteredSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả nhân sự đang lọc'}
                >
                  {isAllFilteredSelected ? (
                    <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>{isAllFilteredSelected ? 'Bỏ Chọn Hết' : 'Chọn Tất Cả'}</span>
                </button>

                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-slate-700 cursor-pointer"
                >
                  <option value="ALL">Tất cả Vai trò</option>
                  <option value="ADMIN">ADMIN (Quản trị viên)</option>
                  <option value="MANAGER">MANAGER (Quản lý)</option>
                  <option value="EMPLOYEE">EMPLOYEE (Nhân viên)</option>
                </select>

                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-slate-700 cursor-pointer max-w-[180px] truncate"
                >
                  {departmentOptions.map((dept) => (
                    <option key={dept} value={dept}>
                      Phòng: {dept}
                    </option>
                  ))}
                </select>

                {/* View Mode Toggle */}
                <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0">
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                      viewMode === 'cards' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Chế độ Thẻ"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                      viewMode === 'table' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Chế độ Bảng"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* 🚀 BATCH ACTION FLOATING NOTIFICATION BAR */}
            {selectedUserIds.length > 0 && (
              <div className="p-3 px-4 rounded-xl bg-slate-900 border border-slate-700 shadow-xl flex flex-wrap items-center justify-between gap-3 animate-solar-drop-snap">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center font-mono font-bold text-xs">
                    {selectedUserIds.length}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">Đã chọn {selectedUserIds.length} nhân sự</span>
                    <span className="text-[11px] text-slate-400">
                      Sẵn sàng thực hiện điều chuyển khối phòng ban hàng loạt
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearSelection}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                  >
                    Bỏ Chọn
                  </button>
                  <button
                    onClick={handleOpenTransferBulk}
                    className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Chuyển Khối Phòng Ban ({selectedUserIds.length})</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ⏳ Loading State Spinner */}
          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              <p className="text-xs font-medium">Đang tải danh sách nhân sự từ máy chủ...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center solar-glass-card rounded-3xl bg-[#0F172A]/80 border border-slate-800">
              <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-300">Không tìm thấy nhân sự phù hợp</h3>
              <p className="text-xs text-slate-500 mt-1">Thử thay đổi từ khóa tìm kiếm hoặc bỏ các bộ lọc.</p>
            </div>
          ) : viewMode === 'cards' ? (
            /* 🎴 CARDS VIEW (Bento Grid) */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredUsers.map((user) => {
                const userAvatar = getAvatarUrl(user);
                const isSelected = selectedUserIds.includes(user.id);
                return (
                  <div
                    key={user.id}
                    onClick={() => handleOpenProfile(user)}
                    className={`solar-glass-card p-5 sm:p-6 rounded-3xl bg-[#0F172A]/90 border transition-all duration-300 space-y-4 relative group cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-amber-400 bg-[#0F172A] shadow-[0_0_35px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/40'
                        : 'border-slate-800 hover:border-amber-500/40 hover:shadow-[0_0_30px_rgba(245,158,11,0.15)]'
                    }`}
                  >
                    <div className="space-y-4">
                      {/* Card Header: Checkbox + Avatar & Info */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Selection Checkbox */}
                          <button
                            type="button"
                            onClick={(e) => handleToggleSelectUser(user.id, e)}
                            className={`p-1.5 rounded-xl border transition-all cursor-pointer shrink-0 ${
                              isSelected
                                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                                : 'bg-slate-900/90 text-slate-500 border-slate-700 hover:border-slate-500 hover:text-white'
                            }`}
                            title={isSelected ? 'Bỏ chọn' : 'Tích chọn nhân sự này'}
                          >
                            {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                          </button>

                          <div className="relative shrink-0">
                            <img
                              src={userAvatar}
                              alt={user.fullName}
                              className="w-12 h-12 rounded-2xl object-cover border-2 border-slate-800 group-hover:border-amber-500/50 transition-all bg-slate-900"
                            />
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <h3 className="text-sm font-extrabold text-white group-hover:text-amber-300 transition-colors truncate flex items-center gap-1.5">
                              {user.fullName}
                            </h3>
                            <p className="text-xs text-slate-400 truncate">{user.jobTitle}</p>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                              <Building2 className="w-3 h-3 text-amber-400 shrink-0" />
                              <span className="truncate">{user.department}</span>
                            </div>
                          </div>
                        </div>

                        {/* Role Badge */}
                        <span
                          className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border shrink-0 ${getRoleBadge(
                            user.globalRole
                          )}`}
                        >
                          {user.globalRole}
                        </span>
                      </div>

                      {/* Contact Info Snippet */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
                        <div className="flex items-center gap-2 truncate">
                          <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate">{user.email}</span>
                        </div>
                        {user.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>{user.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div
                      className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Trạng thái Hoạt động / Khóa */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border inline-block ${
                            user.isActive === true
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {user.isActive === true ? '● Hoạt động' : '■ Đã khóa'}
                        </span>
                      </td>

                      {/* Action Icon Buttons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditUser(user)}
                          className="p-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 transition-colors cursor-pointer"
                          title="Cập nhật thông tin nhân sự"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Nút Khóa / Mở khóa tài khoản */}
                        <button
                          onClick={() => setSelectedUserForLock(user)}
                          className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                            user.isActive === true
                              ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          }`}
                          title={user.isActive === true ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                        >
                          {user.isActive === true ? (
                            <Lock className="w-3.5 h-3.5" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          onClick={(e) => handleOpenTransferSingle(user, e)}
                          className="p-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition-colors cursor-pointer"
                          title="Điều chuyển phòng ban"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setSelectedUserForRole(user)}
                          className="p-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 transition-colors cursor-pointer"
                          title="Phân quyền (RBAC)"
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleResetPassword(user)}
                          className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer"
                          title="Cấp lại mật khẩu mặc định"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setSelectedUserForDelete(user)}
                          className="p-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 transition-colors cursor-pointer"
                          title="Xóa vĩnh viễn tài khoản"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* 📊 TABLE VIEW */
            <div className="solar-glass-card rounded-3xl bg-[#0F172A]/90 border border-slate-800 overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-mono border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-3 w-12 text-center">
                        <button
                          type="button"
                          onClick={handleToggleSelectAll}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                            isAllFilteredSelected
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                              : 'bg-slate-900 text-slate-500 border-slate-700 hover:text-white'
                          }`}
                          title={isAllFilteredSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                        >
                          {isAllFilteredSelected ? (
                            <CheckSquare className="w-3.5 h-3.5" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </th>
                      <th className="py-3.5 px-4">Nhân Sự</th>
                      <th className="py-3.5 px-4">Chức Danh / Khối</th>
                      <th className="py-3.5 px-4">Vai Trò (Role)</th>
                      <th className="py-3.5 px-4">Trạng Thái</th>
                      <th className="py-3.5 px-5 text-right">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
                    {filteredUsers.map((user) => {
                      const userAvatar = getAvatarUrl(user);
                      const isSelected = selectedUserIds.includes(user.id);
                      return (
                        <tr
                          key={user.id}
                          onClick={() => handleOpenProfile(user)}
                          className={`transition-colors cursor-pointer group ${
                            isSelected ? 'bg-amber-500/10 hover:bg-amber-500/15' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => handleToggleSelectUser(user.id, e)}
                              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                                  : 'bg-slate-900/90 text-slate-500 border-slate-700 hover:border-slate-500 hover:text-white'
                              }`}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-3.5 h-3.5" />
                              ) : (
                                <Square className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="relative shrink-0">
                                <img
                                  src={userAvatar}
                                  alt={user.fullName}
                                  className="w-10 h-10 rounded-xl object-cover border border-slate-800 bg-slate-900"
                                />
                              </div>
                              <div>
                                <span className="font-extrabold text-white group-hover:text-amber-300 block">
                                  {user.fullName}
                                </span>
                                <span className="text-[11px] text-slate-500 font-mono">{user.email}</span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="text-white block">{user.jobTitle}</span>
                            <span className="text-[11px] text-amber-400/90 font-mono flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {user.department}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${getRoleBadge(
                                user.globalRole
                              )}`}
                            >
                              {user.globalRole}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border inline-block ${
                                user.isActive !== false
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              }`}
                            >
                              {user.isActive !== false ? '● Hoạt động' : '■ Đã khóa'}
                            </span>
                          </td>

                          <td className="py-3.5 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenEditUser(user)}
                                className="p-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 transition-colors cursor-pointer"
                                title="Cập nhật thông tin nhân sự"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setSelectedUserForLock(user)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  user.isActive !== false
                                    ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300'
                                    : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300'
                                }`}
                                title={user.isActive !== false ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                              >
                                {user.isActive !== false ? (
                                  <Lock className="w-4 h-4" />
                                ) : (
                                  <Unlock className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={(e) => handleOpenTransferSingle(user, e)}
                                className="p-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 transition-colors cursor-pointer"
                                title="Điều chuyển phòng ban"
                              >
                                <ArrowRightLeft className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setSelectedUserForRole(user)}
                                className="p-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 transition-colors cursor-pointer"
                                title="Phân quyền"
                              >
                                <Shield className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleResetPassword(user)}
                                className="p-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 transition-colors cursor-pointer"
                                title="Cấp lại mật khẩu mặc định"
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setSelectedUserForDelete(user)}
                                className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 transition-colors cursor-pointer"
                                title="Xóa vĩnh viễn tài khoản"
                              >
                                <Trash2 className="w-4 h-4 text-rose-400" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🏢 TAB 2: QUẢN LÝ KHỐI PHÒNG BAN                                          */}
      {/* ========================================================================= */}
      {activeMainTab === 'departments' && (
        <div className="space-y-6 animate-fade-in">
          {/* 📊 Department KPI Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            <div className="solar-glass-card p-5 rounded-2xl bg-[#0F172A]/80 border border-slate-800 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Tổng Khối Phòng Ban</span>
                <span className="text-2xl font-black text-white font-mono">{deptMetrics.totalDepts}</span>
              </div>
            </div>

            <div className="solar-glass-card p-5 rounded-2xl bg-[#0F172A]/80 border border-slate-800 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Nhân Sự Đã Phân Bổ</span>
                <span className="text-2xl font-black text-emerald-300 font-mono">{deptMetrics.allocatedUsers}</span>
              </div>
            </div>

            <div className="solar-glass-card p-5 rounded-2xl bg-[#0F172A]/80 border border-slate-800 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Chưa Phân Bổ Phòng Ban</span>
                <span className="text-2xl font-black text-amber-300 font-mono">{deptMetrics.unallocatedUsers}</span>
              </div>
            </div>
          </div>

          {/* 🔍 Department Search Bar */}
          <div className="solar-glass-card p-4 rounded-2xl bg-[#0F172A]/80 border border-slate-800 flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={deptSearchQuery}
                onChange={(e) => setDeptSearchQuery(e.target.value)}
                placeholder="Tìm kiếm theo tên phòng ban, mã code (ENG, QA, DES)..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition-all"
              />
              {deptSearchQuery && (
                <button
                  onClick={() => setDeptSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 🏢 Department Cards Grid */}
          {isLoadingDepartments ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              <p className="text-xs font-medium">Đang tải danh sách phòng ban...</p>
            </div>
          ) : filteredDepartments.length === 0 ? (
            <div className="py-16 text-center solar-glass-card rounded-3xl bg-[#0F172A]/80 border border-slate-800 space-y-3">
              <Building2 className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-300">Chưa có phòng ban nào được tạo</h3>
              <p className="text-xs text-slate-500">
                Bấm nút &quot;Thêm Phòng Ban Mới&quot; ở góc trên để khởi tạo phòng ban đầu tiên.
              </p>
              <button
                onClick={handleOpenCreateDept}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer hover:bg-amber-400"
              >
                + Khởi Tạo Phòng Ban
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredDepartments.map((dept) => {
                const deptMembers = users.filter((u) => u.department === dept.name);
                const memberCount = dept.totalMembers !== undefined ? dept.totalMembers : deptMembers.length;
                const memberRatio = users.length > 0 ? Math.round((memberCount / users.length) * 100) : 0;

                return (
                  <div
                    key={dept.id}
                    className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all duration-200 space-y-4 flex flex-col justify-between group shadow-sm"
                  >
                    <div className="space-y-3.5">
                      {/* Card Header: Code Badge & Name */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 font-mono font-bold text-xs shrink-0">
                            {dept.code}
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                              {dept.name}
                            </h3>
                            <span className="text-[11px] text-slate-500 font-mono">Mã: {dept.code}</span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEditDept(dept)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                            title="Sửa phòng ban"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingDept(dept)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 transition-colors cursor-pointer"
                            title="Xóa phòng ban"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                        {dept.description || 'Chưa có mô tả chi tiết về chức năng của khối phòng ban này.'}
                      </p>

                      {/* Member Allocation Progress Bar */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-slate-400" /> Thành Viên Trực Thuộc:
                          </span>
                          <span className="text-slate-200 font-bold">
                            {memberCount} nhân sự ({memberRatio}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                          <div
                            className="h-full bg-amber-500 rounded-full transition-all duration-300"
                            style={{ width: `${Math.max(memberRatio, 4)}%` }}
                          />
                        </div>
                      </div>

                      {/* Member Avatars Snippet */}
                      {deptMembers.length > 0 && (
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-800/60">
                          <div className="flex items-center -space-x-1.5 overflow-hidden">
                            {deptMembers.slice(0, 5).map((member) => (
                              <img
                                key={member.id}
                                src={getAvatarUrl(member)}
                                alt={member.fullName}
                                title={`${member.fullName} (${member.jobTitle})`}
                                className="w-6 h-6 rounded-full object-cover border border-slate-800 bg-slate-900"
                              />
                            ))}
                          </div>
                          {deptMembers.length > 5 && (
                            <span className="text-[10px] text-slate-500 font-mono font-bold">
                              +{deptMembers.length - 5} nhân sự khác
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Transfer to Department Action Button */}
                    <div className="pt-2.5 border-t border-slate-800/60">
                      <button
                        onClick={() => handleOpenTransferToDept(dept)}
                        className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
                        <span>Điều Chuyển Nhân Sự Đến Khối Này</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 🌟 UNIVERSAL USER PROFILE MODAL */}
      <UserProfileModal
        user={selectedProfileUser}
        isOpen={!!selectedProfileUser}
        onClose={() => setSelectedProfileUser(null)}
        onSendMessage={(u) => showToast(`💬 Đang mở hộp thoại chat với ${u.fullName}...`)}
      />

      {/* 🔒 MODAL: CONFIRM LOCK / UNLOCK USER */}
      {selectedUserForLock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md solar-glass-card rounded-3xl bg-[#0F172A]/95 border border-amber-500/40 p-6 space-y-5 relative animate-solar-warp-in text-center shadow-xl">
            <div
              className={`w-14 h-14 rounded-2xl border flex items-center justify-center mx-auto ${
                selectedUserForLock.isActive !== false
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              }`}
            >
              {selectedUserForLock.isActive !== false ? <Lock className="w-7 h-7" /> : <Unlock className="w-7 h-7" />}
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">
                {selectedUserForLock.isActive !== false ? 'Xác Nhận Khóa Tài Khoản?' : 'Xác Nhận Mở Khóa Tài Khoản?'}
              </h3>
              <p className="text-xs text-slate-400">
                Nhân sự: <span className="text-white font-bold">{selectedUserForLock.fullName}</span>
              </p>
            </div>

            <p className="text-xs text-slate-300 bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
              {selectedUserForLock.isActive !== false
                ? '⚠️ Sau khi khóa, tài khoản này sẽ tạm thời không thể đăng nhập vào hệ thống Task Board.'
                : '✅ Sau khi mở khóa, tài khoản này có thể truy cập và làm việc bình thường trở lại.'}
            </p>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setSelectedUserForLock(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                disabled={actionLoadingId === selectedUserForLock.id}
                onClick={() => handleToggleLockUser(selectedUserForLock)}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 text-slate-950 ${
                  selectedUserForLock.isActive !== false
                    ? 'bg-amber-500 hover:bg-amber-400'
                    : 'bg-emerald-400 hover:bg-emerald-300'
                }`}
              >
                {actionLoadingId === selectedUserForLock.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {selectedUserForLock.isActive !== false ? 'Xác Nhận Khóa' : 'Xác Nhận Mở Khóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚀 MODAL 1: CREATE NEW USER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-xl solar-glass-card rounded-3xl bg-[#0F172A]/95 border border-amber-500/40 shadow-[0_0_60px_rgba(245,158,11,0.25)] p-6 sm:p-8 space-y-6 relative overflow-hidden animate-solar-warp-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-white">Khởi Tạo Tài Khoản Nhân Sự</h2>
                  <p className="text-xs text-slate-400">
                    Cấp tài khoản đăng nhập, mật khẩu ban đầu và phân bổ phòng ban
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-bold">Họ Và Tên *</label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="VD: Trần Văn Nam"
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-300 font-bold">Email Doanh Nghiệp *</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="nam.tran@solaris.io"
                    className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-bold">Số Điện Thoại</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="0912 345 678"
                    className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* 🔑 MẬT KHẨU KHỞI TẠO BAN ĐẦU */}
              <div className="space-y-1.5 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <div className="flex items-center justify-between">
                  <label className="text-amber-300 font-bold flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" /> Mật Khẩu Khởi Tạo Ban Đầu *
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomPassword}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-mono font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Tạo Ngẫu Nhiên
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mật khẩu đăng nhập lần đầu"
                    className="w-full p-2.5 pr-10 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 block">
                  Nhân sự sẽ được yêu cầu đổi mật khẩu và cập nhật hồ sơ tại lần đầu đăng nhập.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-300 font-bold">Chức Danh Công Việc</label>
                  <input
                    type="text"
                    value={newJobTitle}
                    onChange={(e) => setNewJobTitle(e.target.value)}
                    placeholder="VD: Senior Frontend Dev"
                    className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-bold">Phòng Ban</label>
                  <select
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    {departmentOptions
                      .filter((d) => d !== 'Tất Cả')
                      .map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-300 font-bold">Chuyên Môn (Profession)</label>
                  <select
                    value={newProfession}
                    onChange={(e) => setNewProfession(e.target.value as Profession)}
                    className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="DEV">DEV (Lập trình viên)</option>
                    <option value="TESTER">TESTER (Kiểm thử QA/QC)</option>
                    <option value="DESIGNER">DESIGNER (Thiết kế UI/UX)</option>
                    <option value="BA">BA (Phân tích nghiệp vụ)</option>
                    <option value="PRODUCT_OWNER">PRODUCT_OWNER (Quản trị sản phẩm)</option>
                    <option value="DEVOPS">DEVOPS (Vận hành hạ tầng)</option>
                    <option value="MARKETING">MARKETING (Truyền thông)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-bold">Phân Quyền (RBAC Role)</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as GlobalRole)}
                    className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="EMPLOYEE">EMPLOYEE (Nhân viên tác nghiệp)</option>
                    <option value="MANAGER">MANAGER (Quản lý dự án)</option>
                    <option value="ADMIN">ADMIN (Quản trị tối cao)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md cursor-pointer transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingCreate && <Loader2 className="w-4 h-4 animate-spin" />}
                  Xác Nhận Tạo Mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✏️ MODAL 2: UPDATE USER MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-xl solar-glass-card rounded-3xl bg-[#0F172A]/95 border border-blue-500/40 shadow-[0_0_60px_rgba(59,130,246,0.18)] p-6 sm:p-8 space-y-6 relative overflow-hidden animate-solar-warp-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/40">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-white">Cập Nhật Thông Tin Nhân Sự</h2>
                  <p className="text-xs text-slate-400">Chỉnh sửa hồ sơ của {editingUser.fullName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseEditUser}
                disabled={isSubmittingUpdate}
                className="text-slate-400 hover:text-white p-1 rounded-lg disabled:opacity-50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-bold">Họ Và Tên *</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-300 font-bold">Email</label>
                  <input
                    type="email"
                    value={editingUser.email}
                    disabled
                    className="w-full p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-slate-500 cursor-not-allowed"
                  />
                  <span className="text-[10px] text-slate-500">
                    Email không được cập nhật hiện tại.
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-bold">Số Điện Thoại</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="0912 345 678"
                    className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-300 font-bold">Chức Danh Công Việc</label>
                  <input
                    type="text"
                    value={editJobTitle}
                    onChange={(e) => setEditJobTitle(e.target.value)}
                    placeholder="VD: Senior Frontend Dev"
                    className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-bold">Chuyên Môn</label>
                  <select
                    value={editProfession}
                    onChange={(e) => setEditProfession(e.target.value as Profession)}
                    className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="DEV">DEV (Lập trình viên)</option>
                    <option value="TESTER">TESTER (Kiểm thử QA/QC)</option>
                    <option value="DESIGNER">DESIGNER (Thiết kế UI/UX)</option>
                    <option value="BA">BA (Phân tích nghiệp vụ)</option>
                    <option value="PRODUCT_OWNER">PRODUCT_OWNER (Quản trị sản phẩm)</option>
                    <option value="DEVOPS">DEVOPS (Vận hành hạ tầng)</option>
                    <option value="MARKETING">MARKETING (Truyền thông)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold">Phòng Ban</label>
                <select
                  value={editDepartmentId}
                  onChange={(e) => setEditDepartmentId(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="">-- Chưa phân bổ --</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} ({dept.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold">Giới Thiệu / Bio</label>
                <textarea
                  rows={4}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Mô tả ngắn về nhân sự..."
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseEditUser}
                  disabled={isSubmittingUpdate}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold cursor-pointer disabled:opacity-50"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUpdate}
                  className="px-6 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold shadow-md cursor-pointer transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingUpdate && <Loader2 className="w-4 h-4 animate-spin" />}
                  Lưu Thay Đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🛡️ MODAL 2: EDIT ROLE ELEVATION MODAL */}
      {selectedUserForRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md solar-glass-card rounded-3xl bg-[#0F172A]/95 border border-purple-500/40 p-6 space-y-5 relative animate-solar-warp-in">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/40">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Điều Chỉnh Vai Trò Phân Quyền</h3>
                <p className="text-xs text-slate-400">{selectedUserForRole.fullName}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Chọn cấp độ đặc quyền mới cho nhân sự. Lưu ý: Cấp quyền{' '}
              <span className="text-rose-400 font-bold">ADMIN</span> sẽ cho phép người dùng truy cập toàn bộ dữ liệu và
              Thùng rác hệ thống.
            </p>

            <div className="space-y-2 text-xs">
              {(['EMPLOYEE', 'MANAGER', 'ADMIN'] as GlobalRole[]).map((r) => (
                <button
                  key={r}
                  disabled={actionLoadingId === selectedUserForRole.id}
                  onClick={() => handleUpdateRole(selectedUserForRole.id, r)}
                  className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer disabled:opacity-50 ${
                    selectedUserForRole.globalRole === r
                      ? 'bg-purple-500/20 border-purple-400 text-white font-bold'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-purple-400" />
                    {r === 'ADMIN' && 'ADMIN — Toàn quyền Quản trị tối cao'}
                    {r === 'MANAGER' && 'MANAGER — Quản lý Dự án & Duyệt bài'}
                    {r === 'EMPLOYEE' && 'EMPLOYEE — Nhân viên tác nghiệp'}
                  </span>
                  {selectedUserForRole.globalRole === r && <CheckCircle2 className="w-4 h-4 text-purple-400" />}
                </button>
              ))}
            </div>

            <div className="pt-3 flex justify-end">
              <button
                onClick={() => setSelectedUserForRole(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 👤 MODAL 4: DELETE USER CONFIRM MODAL */}
      {selectedUserForDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md solar-glass-card rounded-3xl bg-[#0F172A]/95 border border-rose-500/50 p-6 space-y-5 relative animate-solar-warp-in text-center shadow-[0_0_60px_rgba(244,63,94,0.3)]">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto animate-pulse">
              <Trash2 className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">Xác Nhận Xóa Vĩnh Viễn?</h3>
              <p className="text-xs text-slate-400">
                Thành viên: <span className="text-white font-bold">{selectedUserForDelete.fullName}</span> (
                {selectedUserForDelete.email})
              </p>
            </div>

            <p className="text-xs text-rose-300/90 bg-rose-950/40 p-3 rounded-2xl border border-rose-500/30 leading-relaxed">
              ⚠️ Xóa tài khoản
            </p>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setSelectedUserForDelete(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                disabled={actionLoadingId === selectedUserForDelete.id}
                onClick={() => handleDeleteUser(selectedUserForDelete)}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {actionLoadingId === selectedUserForDelete.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🏢 MODAL 5: CREATE DEPARTMENT MODAL */}
      {isCreateDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg solar-glass-card rounded-3xl bg-[#0F172A]/95 border border-slate-700 shadow-2xl p-6 sm:p-8 space-y-6 relative overflow-hidden animate-solar-warp-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-white">Thêm Khối Phòng Ban Mới</h2>
                  <p className="text-xs text-slate-400">Khởi tạo phòng ban để phân nhóm và quản lý cơ cấu nhân sự</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateDeptModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitCreateDept} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-bold">Tên Khối / Phòng Ban *</label>
                <input
                  type="text"
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="VD: Engineering & Architecture"
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold">Mã Phòng Ban (Code) *</label>
                <input
                  type="text"
                  required
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value.toUpperCase())}
                  placeholder="VD: ENG, QA, UX, OPS..."
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono uppercase placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-slate-500">Mã định danh viết tắt, duy nhất trong hệ thống.</span>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold">Mô Tả Chức Năng</label>
                <textarea
                  rows={3}
                  value={deptDescription}
                  onChange={(e) => setDeptDescription(e.target.value)}
                  placeholder="Mô tả chức năng, nhiệm vụ chính của phòng ban..."
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateDeptModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDept}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md cursor-pointer transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingDept && <Loader2 className="w-4 h-4 animate-spin" />}
                  Khởi Tạo Phòng Ban
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🏢 MODAL 6: EDIT DEPARTMENT MODAL */}
      {editingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg solar-glass-card rounded-3xl bg-[#0F172A]/95 border border-slate-700 shadow-2xl p-6 sm:p-8 space-y-6 relative overflow-hidden animate-solar-warp-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-white">Chỉnh Sửa Phòng Ban</h2>
                  <p className="text-xs text-slate-400">Cập nhật thông tin chi tiết của khối phòng ban</p>
                </div>
              </div>
              <button
                onClick={() => setEditingDept(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitEditDept} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-bold">Tên Khối / Phòng Ban *</label>
                <input
                  type="text"
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="VD: Engineering & Architecture"
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold">Mã Phòng Ban *</label>
                <input
                  type="text"
                  required
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value.toUpperCase())}
                  placeholder="VD: ENG, QA, UX, OPS..."
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono uppercase placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold">Mô Tả Chức Năng</label>
                <textarea
                  rows={3}
                  value={deptDescription}
                  onChange={(e) => setDeptDescription(e.target.value)}
                  placeholder="Mô tả chức năng, nhiệm vụ chính của phòng ban..."
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingDept(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDept}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md cursor-pointer transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingDept && <Loader2 className="w-4 h-4 animate-spin" />}
                  Lưu Thay Đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md solar-glass-card rounded-3xl bg-[#0F172A]/95 border border-rose-500/50 p-6 space-y-5 relative animate-solar-warp-in text-center shadow-[0_0_60px_rgba(244,63,94,0.3)]">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto animate-pulse">
              <Building2 className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">Xác Nhận Giải Thể / Xóa Phòng Ban?</h3>
              <p className="text-xs text-slate-400">
                Phòng ban: <span className="text-white font-bold">{deletingDept.name}</span> ({deletingDept.code})
              </p>
            </div>

            <p className="text-xs text-rose-300/90 bg-rose-950/40 p-3 rounded-2xl border border-rose-500/30 leading-relaxed">
              ⚠️ Khi xóa phòng ban, các nhân sự thuộc phòng ban này sẽ được tự động chuyển về trạng thái &quot;Chưa phân
              bổ&quot;. Dữ liệu nhân sự và các task liên quan vẫn được bảo toàn nguyên vẹn.
            </p>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setDeletingDept(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                disabled={isSubmittingDept}
                onClick={handleConfirmDeleteDept}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmittingDept ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🏢 MODAL 8: TRANSFER PERSONNEL MODAL */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-xl solar-glass-card rounded-3xl bg-[#0F172A]/95 border border-slate-700 shadow-2xl p-6 sm:p-8 space-y-6 relative overflow-hidden animate-solar-warp-in">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                    Điều Chuyển Khối Phòng Ban
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-mono font-bold border border-amber-500/30">
                      {transferUserList.length} Nhân Sự
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Chuyển nhân sự sang khối phòng ban mới để tái cấu trúc đội ngũ
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmTransfer} className="space-y-5 text-xs">
              {/* Selected Personnel Preview */}
              <div className="space-y-2">
                <label className="text-slate-300 font-bold flex items-center justify-between">
                  <span>Danh Sách Nhân Sự Được Điều Chuyển ({transferUserList.length}):</span>
                </label>
                <div className="max-h-40 overflow-y-auto p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2 divide-y divide-slate-800/60">
                  {transferUserList.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-3 pt-2 first:pt-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={getAvatarUrl(u)}
                          alt={u.fullName}
                          className="w-8 h-8 rounded-xl object-cover bg-slate-800 shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="font-extrabold text-white block truncate">{u.fullName}</span>
                          <span className="text-[10px] text-slate-400 truncate block">{u.email}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-400 text-[10px] font-mono border border-slate-700">
                          Hiện tại: {u.department || 'Chưa phân bổ'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Target Department Selection */}
              <div className="space-y-2">
                <label className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-amber-400" /> Chọn Khối Phòng Ban Tiếp Nhận *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pr-1">
                  {departments.map((dept) => {
                    const isTarget = transferTargetDeptId === dept.id;
                    const membersCount = users.filter((u) => u.department === dept.name).length;
                    return (
                      <div
                        key={dept.id}
                        onClick={() => setTransferTargetDeptId(dept.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isTarget
                            ? 'bg-amber-500/10 border-amber-400 shadow-md ring-1 ring-amber-400/50'
                            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono font-black text-xs shrink-0 border ${
                              isTarget
                                ? 'bg-amber-500/20 text-amber-300 border-amber-400/60'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {dept.code}
                          </div>
                          <div className="min-w-0">
                            <span
                              className={`font-bold block truncate text-xs ${
                                isTarget ? 'text-amber-300' : 'text-white'
                              }`}
                            >
                              {dept.name}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              {dept.totalMembers !== undefined ? dept.totalMembers : membersCount} nhân sự
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0">
                          <span
                            className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              isTarget
                                ? 'border-amber-400 bg-amber-400 text-slate-950'
                                : 'border-slate-600 bg-transparent'
                            }`}
                          >
                            {isTarget && <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTransfer || !transferTargetDeptId}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md cursor-pointer transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingTransfer && <Loader2 className="w-4 h-4 animate-spin" />}
                  <ArrowRightLeft className="w-4 h-4" />
                  Xác Nhận Điều Chuyển
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

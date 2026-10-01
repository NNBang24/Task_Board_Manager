import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SocketGateway } from '../socket/socket.gateway';
import {
  CreateLeaveRequestDto,
  ReviewLeaveRequestDto,
  AssignScheduleDto,
} from './dto/schedule.dto';
import { AuthUserPayload } from '../../common/interfaces/auth-user.interface';
import { WorkShift, WorkType, LeaveStatus, LeaveType } from '@prisma/client';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly socketGateway: SocketGateway
  ) {}

  // 1. 📅 Lấy danh sách lịch làm việc
  async getWorkSchedules(startDate?: string, endDate?: string, userId?: string) {
    const where: any = {};

    if (userId && userId !== 'ALL') {
      where.userId = userId;
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(`${startDate}T00:00:00.000Z`),
        lte: new Date(`${endDate}T23:59:59.999Z`),
      };
    } else if (startDate) {
      where.date = {
        gte: new Date(`${startDate}T00:00:00.000Z`),
      };
    }

    const schedules = await this.prisma.workSchedule.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatar: true,
            profession: true,
            role: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    });

    return schedules.map((s) => ({
      id: s.id,
      userId: s.userId,
      userName: s.user?.fullName,
      userAvatar: s.user?.avatar,
      date: s.date.toISOString().split('T')[0],
      workType: s.workType,
      shift: s.shift,
      note: s.note,
      createdById: s.createdById,
      createdByName: s.createdBy?.fullName,
      updatedAt: s.updatedAt.toISOString(),
    }));
  }

  // 2. 👑 Xếp lịch làm việc trực tiếp (Admin / Manager)
  async assignSchedule(dto: AssignScheduleDto, adminUser: AuthUserPayload) {
    if (adminUser.role !== 'ADMIN' && adminUser.role !== 'MANAGER') {
      throw new ForbiddenException('Chỉ Quản lý hoặc Quản trị viên mới có quyền xếp lịch!');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!targetUser) {
      throw new NotFoundException('Không tìm thấy người dùng được xếp lịch!');
    }

    const shift = dto.shift || WorkShift.FULL_DAY;
    const note = dto.note || (adminUser.fullName ? `Được chỉ định bởi ${adminUser.fullName}` : 'Chỉ định trực tiếp');

    const createdRecords = await this.prisma.$transaction(
      dto.dates.map((dateStr) => {
        const dateObj = new Date(`${dateStr}T00:00:00.000Z`);
        return this.prisma.workSchedule.upsert({
          where: {
            userId_date_shift: {
              userId: dto.userId,
              date: dateObj,
              shift,
            },
          },
          update: {
            workType: dto.workType,
            note,
            createdById: adminUser.id,
            updatedAt: new Date(),
          },
          create: {
            userId: dto.userId,
            date: dateObj,
            workType: dto.workType,
            shift,
            note,
            createdById: adminUser.id,
          },
        });
      })
    );

    // Phát tín hiệu Realtime
    try {
      this.socketGateway.server.emit('schedule:updated', {
        userId: dto.userId,
        dates: dto.dates,
        workType: dto.workType,
        shift,
      });
    } catch (err) {
      this.logger.error('Lỗi emit socket schedule:updated', err);
    }

    return {
      success: true,
      message: `Đã xếp lịch thành công cho ${createdRecords.length} ngày!`,
      count: createdRecords.length,
    };
  }

  // 3. 📝 Lấy danh sách đơn nghỉ phép / WFH
  async getLeaveRequests(userId?: string, status?: string) {
    const where: any = {};

    if (userId && userId !== 'ALL') {
      where.userId = userId;
    }

    if (status && status !== 'ALL') {
      where.status = status as LeaveStatus;
    }

    const requests = await this.prisma.leaveRequest.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatar: true,
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        approver: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user?.fullName || 'Người dùng',
      userAvatar: r.user?.avatar,
      departmentName: r.user?.department?.name || 'Toàn công ty',
      type: r.type,
      startDate: r.startDate.toISOString().split('T')[0],
      endDate: r.endDate.toISOString().split('T')[0],
      shift: r.shift,
      reason: r.reason,
      status: r.status,
      handoverPlan: r.handoverPlan,
      approverId: r.approverId,
      approverName: r.approver?.fullName,
      responseNote: r.responseNote,
      approvedStartDate: r.approvedStartDate ? r.approvedStartDate.toISOString().split('T')[0] : undefined,
      approvedEndDate: r.approvedEndDate ? r.approvedEndDate.toISOString().split('T')[0] : undefined,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // 4. 📝 Nộp đơn xin nghỉ phép / WFH
  async createLeaveRequest(dto: CreateLeaveRequestDto, user: AuthUserPayload) {
    const startObj = new Date(`${dto.startDate}T00:00:00.000Z`);
    const endObj = new Date(`${dto.endDate}T00:00:00.000Z`);

    if (startObj > endObj) {
      throw new BadRequestException('Ngày bắt đầu không được lớn hơn ngày kết thúc!');
    }

    // 🔒 [LC-114] Kiểm tra trùng lặp khoảng thời gian
    const existingRequests = await this.prisma.leaveRequest.findMany({
      where: {
        userId: user.id,
        status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED, LeaveStatus.APPROVED_MODIFIED] },
      },
    });

    const hasOverlap = existingRequests.some((existing) => {
      const existingStart = (existing.approvedStartDate || existing.startDate).toISOString().split('T')[0];
      const existingEnd = (existing.approvedEndDate || existing.endDate).toISOString().split('T')[0];
      return dto.startDate <= existingEnd && dto.endDate >= existingStart;
    });

    if (hasOverlap) {
      throw new BadRequestException('Bạn đã có đơn xin nghỉ / WFH (chờ duyệt hoặc đã duyệt) trong khoảng thời gian này!');
    }

    const newRequest = await this.prisma.leaveRequest.create({
      data: {
        userId: user.id,
        type: dto.type,
        startDate: startObj,
        endDate: endObj,
        shift: dto.shift || WorkShift.FULL_DAY,
        reason: dto.reason,
        handoverPlan: dto.handoverPlan,
        status: LeaveStatus.PENDING,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatar: true,
            department: true,
          },
        },
      },
    });

    // Thông báo realtime
    try {
      this.socketGateway.server.emit('leave:created', {
        id: newRequest.id,
        userId: user.id,
        userName: newRequest.user?.fullName,
        type: newRequest.type,
      });
    } catch (err) {
      this.logger.error('Lỗi emit socket leave:created', err);
    }

    return {
      id: newRequest.id,
      userId: newRequest.userId,
      userName: newRequest.user?.fullName,
      userAvatar: newRequest.user?.avatar,
      type: newRequest.type,
      startDate: dto.startDate,
      endDate: dto.endDate,
      shift: newRequest.shift,
      reason: newRequest.reason,
      status: newRequest.status,
      handoverPlan: newRequest.handoverPlan,
      createdAt: newRequest.createdAt.toISOString(),
    };
  }

  // 5. ⚖️ Phê duyệt hoặc từ chối đơn (Admin / Manager)
  async reviewLeaveRequest(id: string, dto: ReviewLeaveRequestDto, approver: AuthUserPayload) {
    if (approver.role !== 'ADMIN' && approver.role !== 'MANAGER') {
      throw new ForbiddenException('Chỉ Quản lý hoặc Quản trị viên mới có quyền duyệt đơn!');
    }

    const targetReq = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!targetReq) {
      throw new NotFoundException('Không tìm thấy đơn xin nghỉ phép!');
    }

    // 🔒 [LC-170] Khóa tự duyệt đơn của chính mình
    if (targetReq.userId === approver.id) {
      throw new ForbiddenException('Bạn không thể tự phê duyệt đơn xin nghỉ/WFH của chính mình!');
    }

    if (targetReq.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Đơn này đã được xử lý trước đó.');
    }

    const effectiveShift = dto.modifiedShift || targetReq.shift;
    const effectiveStartStr = dto.approvedStartDate || targetReq.startDate.toISOString().split('T')[0];
    const effectiveEndStr = dto.approvedEndDate || targetReq.endDate.toISOString().split('T')[0];
    const approvedStartObj = new Date(`${effectiveStartStr}T00:00:00.000Z`);
    const approvedEndObj = new Date(`${effectiveEndStr}T00:00:00.000Z`);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Cập nhật LeaveRequest
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: dto.status,
          approverId: approver.id,
          responseNote: dto.responseNote,
          shift: effectiveShift,
          approvedStartDate: dto.status === LeaveStatus.APPROVED_MODIFIED || dto.status === LeaveStatus.APPROVED ? approvedStartObj : null,
          approvedEndDate: dto.status === LeaveStatus.APPROVED_MODIFIED || dto.status === LeaveStatus.APPROVED ? approvedEndObj : null,
          updatedAt: new Date(),
        },
      });

      // 2. Nếu duyệt -> Tự động sinh bản ghi WorkSchedule
      if (dto.status === LeaveStatus.APPROVED || dto.status === LeaveStatus.APPROVED_MODIFIED) {
        const workType: WorkType = targetReq.type === LeaveType.WFH ? WorkType.WFH : WorkType.LEAVE;

        const dateList: string[] = [];
        const cur = new Date(approvedStartObj);
        while (cur <= approvedEndObj) {
          dateList.push(cur.toISOString().split('T')[0]);
          cur.setDate(cur.getDate() + 1);
        }

        for (const dStr of dateList) {
          const dObj = new Date(`${dStr}T00:00:00.000Z`);
          await tx.workSchedule.upsert({
            where: {
              userId_date_shift: {
                userId: targetReq.userId,
                date: dObj,
                shift: effectiveShift,
              },
            },
            update: {
              workType,
              note: `Đơn đã duyệt: ${targetReq.reason}`,
              leaveRequestId: targetReq.id,
              createdById: approver.id,
              updatedAt: new Date(),
            },
            create: {
              userId: targetReq.userId,
              date: dObj,
              workType,
              shift: effectiveShift,
              note: `Đơn đã duyệt: ${targetReq.reason}`,
              leaveRequestId: targetReq.id,
              createdById: approver.id,
            },
          });
        }
      }

      return updated;
    });

    // Thông báo Realtime
    try {
      this.socketGateway.server.emit('leave:reviewed', {
        id: targetReq.id,
        userId: targetReq.userId,
        status: dto.status,
        approverName: approver.fullName,
      });
      this.socketGateway.server.emit('schedule:updated', {
        userId: targetReq.userId,
      });
    } catch (err) {
      this.logger.error('Lỗi emit socket leave:reviewed', err);
    }

    return {
      success: true,
      message: dto.status === LeaveStatus.REJECTED ? 'Đã từ chối đơn' : 'Đã phê duyệt đơn thành công',
      status: result.status,
    };
  }

  // 6. ❌ Hủy đơn xin nghỉ phép
  async cancelLeaveRequest(id: string, user: AuthUserPayload) {
    const targetReq = await this.prisma.leaveRequest.findUnique({
      where: { id },
    });

    if (!targetReq) {
      throw new NotFoundException('Không tìm thấy đơn xin nghỉ phép!');
    }

    if (targetReq.userId !== user.id && user.role !== 'ADMIN' && user.role !== 'MANAGER') {
      throw new ForbiddenException('Bạn không có quyền hủy đơn này!');
    }

    await this.prisma.$transaction(async (tx) => {
      // Cập nhật trạng thái đơn thành CANCELLED
      await tx.leaveRequest.update({
        where: { id },
        data: {
          status: LeaveStatus.CANCELLED,
          updatedAt: new Date(),
        },
      });

      // Xóa các bản ghi lịch làm việc đã tự động sinh từ đơn này (nếu có)
      await tx.workSchedule.deleteMany({
        where: { leaveRequestId: id },
      });
    });

    try {
      this.socketGateway.server.emit('leave:cancelled', { id, userId: targetReq.userId });
      this.socketGateway.server.emit('schedule:updated', { userId: targetReq.userId });
    } catch (err) {
      this.logger.error('Lỗi emit socket leave:cancelled', err);
    }

    return {
      success: true,
      message: 'Đã hủy đơn xin nghỉ phép thành công!',
    };
  }
}

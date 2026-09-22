import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { QueryTaskFilterDto } from './dto/query-task-filter.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { SocketGateway } from '../socket/socket.gateway';
import { NotificationService } from '../notification/notification.service';
import { TaskActivityService } from './task-activity.service';
import { TaskStatus } from '@prisma/client';
import { AuthUserPayload } from '../../common/interfaces/auth-user.interface';

@Injectable()
export class TaskService {
  constructor(
    private prisma: PrismaService,
    private socketGateway: SocketGateway,
    private notificationService: NotificationService,
    private activityService: TaskActivityService
  ) {}

  async findAll(query?: QueryTaskFilterDto) {
    const where: any = {
      isArchived: false,
      isDeleted: false,
    };

    if (query?.search) {
      where.AND = [
        {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (query?.projectId && query.projectId !== 'ALL') {
      where.projectId = query.projectId;
    }

    if (query?.assigneeId && query.assigneeId !== 'ALL') {
      where.OR = [
        ...(where.OR || []),
        { assigneeId: query.assigneeId },
        { subtasks: { some: { assigneeId: query.assigneeId } } },
      ];
    }

    if (query?.status && (query.status as string) !== 'ALL') {
      where.status = query.status;
    }

    if (query?.priority && (query.priority as string) !== 'ALL') {
      where.priority = query.priority;
    }

    if (query?.profession && (query.profession as string) !== 'ALL') {
      where.assignee = { profession: query.profession };
    }

    const page = query?.page ? Math.max(1, Number(query.page)) : undefined;
    const limit = query?.limit ? Math.min(200, Math.max(1, Number(query.limit))) : undefined;
    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit || undefined;

    const tasks = await this.prisma.task.findMany({
      where,
      skip,
      take,
      include: {
        project: { select: { id: true, name: true } },
        assignee: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatar: true,
            profession: true,
          },
        },
        createdBy: {
          select: { id: true, fullName: true, email: true, avatar: true },
        },
        tags: { include: { tag: true } },
        subtasks: {
          include: {
            assignee: { select: { id: true, fullName: true, avatar: true } },
          },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        },
        attachments: true,
        taskRequests: {
          where: { status: 'PENDING' },
          include: {
            sender: {
              select: { id: true, fullName: true, avatar: true, email: true },
            },
            receiver: {
              select: { id: true, fullName: true, avatar: true, email: true },
            },
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { comments: true } },
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });

    return tasks.map((t) => this.mapTaskResponse(t));
  }

  async create(userId: string, createTaskDto: CreateTaskDto) {
    let parsedStartDate: Date | null = null;
    if (createTaskDto.startDate) {
      parsedStartDate = new Date(createTaskDto.startDate);
    }

    let parsedDueDate: Date | null = null;
    if (createTaskDto.dueDate) {
      parsedDueDate = new Date(createTaskDto.dueDate);
      const startOrToday = parsedStartDate ? new Date(parsedStartDate) : new Date();
      startOrToday.setHours(0, 0, 0, 0);

      const targetDueDate = new Date(parsedDueDate);
      targetDueDate.setHours(0, 0, 0, 0);

      if (targetDueDate.getTime() < startOrToday.getTime()) {
        throw new BadRequestException('Hạn Deadline (due date) phải lớn hơn hoặc bằng Ngày Bắt Đầu!');
      }
    }

    // 🔒 [LC-69] KIỂM TRA DỰ ÁN VÀ CHẶN TẠO TASK VÀO DỰ ÁN ĐÃ HOÀN THÀNH
    const project = await this.prisma.project.findUnique({
      where: { id: createTaskDto.projectId },
      include: { members: true },
    });
    if (!project) {
      throw new NotFoundException('Dự án không tồn tại!');
    }
    if (project.isCompleted) {
      throw new BadRequestException('Dự án này đã hoàn thành/nghiệm thu và đã được đóng. Không thể tạo thêm Task mới!');
    }

    const validMemberIds = new Set([
      ...(project.managerId ? [project.managerId] : []),
      ...(project.createdById ? [project.createdById] : []),
      ...project.members.map((m) => m.userId),
    ]);

    // 🔒 Kiểm tra người được giao Task cha có thuộc dự án không
    if (createTaskDto.assigneeId && !validMemberIds.has(createTaskDto.assigneeId)) {
      throw new BadRequestException('Người được phân công không thuộc thành viên của Dự án này!');
    }

    // 🔒 [LC-66] KIỂM TRA TẤT CẢ NGƯỜI ĐƯỢC GIAO TASK CON CÓ THUỘC THÀNH VIÊN DỰ ÁN KHÔNG
    if (createTaskDto.subtasks && Array.isArray(createTaskDto.subtasks)) {
      for (const st of createTaskDto.subtasks) {
        if (st.assigneeId && !validMemberIds.has(st.assigneeId)) {
          throw new BadRequestException(
            `Nhân sự được giao Task con "${st.title || ''}" không thuộc thành viên của Dự án này!`
          );
        }
      }
    }

    // 🚨 Tự động suy ra độ ưu tiên Task lớn từ các Việc Con
    let calculatedPriority = createTaskDto.priority || 'NORMAL';
    if (createTaskDto.subtasks && createTaskDto.subtasks.some((st) => st.isUrgent)) {
      calculatedPriority = 'URGENT';
    }

    const task = await this.prisma.task.create({
      data: {
        title: createTaskDto.title,
        description: createTaskDto.description,
        status: createTaskDto.status || 'TODO',
        priority: calculatedPriority,
        progress: createTaskDto.progress || 0,
        projectId: createTaskDto.projectId,
        assigneeId: createTaskDto.assigneeId || userId,
        createdById: userId,
        startDate: parsedStartDate,
        dueDate: parsedDueDate,
        stageId: createTaskDto.stageId || 'stage_1',
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatar: true,
            profession: true,
          },
        },
        createdBy: {
          select: { id: true, fullName: true, email: true, avatar: true },
        },
        tags: { include: { tag: true } },
        attachments: true,
      },
    });

    // 🔔 [LC-81] BẮN THÔNG BÁO GIAO VIỆC CHO NGƯỜI ĐƯỢC PHÂN CÔNG
    if (task.assigneeId && task.assigneeId !== userId) {
      await this.notificationService.sendNotification({
        userId: task.assigneeId,
        actorId: userId,
        title: '📋 Bạn được giao Task mới',
        content: `Bạn vừa được giao phụ trách Task "${task.title}".`,
        type: 'TASK_ASSIGNED',
        taskId: task.id,
        projectId: task.projectId,
      });
    }

    // 🏷️ [LC-76] TỰ ĐỘNG XỬ LÝ & KHỬ TRÙNG LẶP THẺ NHÃN (TAGS)
    if (createTaskDto.tagNames && Array.isArray(createTaskDto.tagNames) && createTaskDto.tagNames.length > 0) {
      for (const rawTagName of createTaskDto.tagNames) {
        const cleanName = rawTagName?.trim();
        if (cleanName) {
          let tag = await this.prisma.tag.findFirst({
            where: {
              projectId: createTaskDto.projectId,
              name: { equals: cleanName, mode: 'insensitive' },
            },
          });
          if (!tag) {
            tag = await this.prisma.tag.create({
              data: {
                name: cleanName,
                projectId: createTaskDto.projectId,
                color: 'amber',
              },
            });
          }
          await this.prisma.taskTag.upsert({
            where: {
              taskId_tagId: { taskId: task.id, tagId: tag.id },
            },
            create: { taskId: task.id, tagId: tag.id },
            update: {},
          });
        }
      }
    }
    if (createTaskDto.subtasks && Array.isArray(createTaskDto.subtasks) && createTaskDto.subtasks.length > 0) {
      for (let i = 0; i < createTaskDto.subtasks.length; i++) {
        const item = createTaskDto.subtasks[i];
        if (item.title && item.title.trim()) {
          await this.prisma.subtask.create({
            data: {
              taskId: task.id,
              title: item.title.trim(),
              isUrgent: Boolean(item.isUrgent),
              order: i,
              isDone: false,
              assigneeId: item.assigneeId || undefined,
              startDate: item.startDate ? new Date(item.startDate) : undefined,
              estimatedDays: item.estimatedDays ? Number(item.estimatedDays) : 1,
              dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
            },
          });
        }
      }
    } else if (
      createTaskDto.subtaskTitles &&
      Array.isArray(createTaskDto.subtaskTitles) &&
      createTaskDto.subtaskTitles.length > 0
    ) {
      for (let i = 0; i < createTaskDto.subtaskTitles.length; i++) {
        const titleStr = createTaskDto.subtaskTitles[i];
        if (titleStr && titleStr.trim()) {
          await this.prisma.subtask.create({
            data: {
              taskId: task.id,
              title: titleStr.trim(),
              isUrgent: false,
              order: i,
              isDone: false,
              estimatedDays: 1,
            },
          });
        }
      }
    }

    const taskWithSubtasks = await this.prisma.task.findUnique({
      where: { id: task.id },
      include: {
        project: { select: { id: true, name: true } },
        assignee: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatar: true,
            profession: true,
          },
        },
        createdBy: {
          select: { id: true, fullName: true, email: true, avatar: true },
        },
        tags: { include: { tag: true } },
        subtasks: {
          include: {
            assignee: { select: { id: true, fullName: true, avatar: true } },
          },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        },
        attachments: true,
      },
    });

    const createdTask = this.mapTaskResponse(taskWithSubtasks);

    if (task.projectId) {
      this.socketGateway.broadcastToProject(task.projectId, 'task:created', createdTask);
    }

    return createdTask;
  }

  async findByProject(projectId: string) {
    return this.findAll({ projectId });
  }

  async updateDescription(id: string, description: string, user?: AuthUserPayload) {
    const updatedTask = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id },
        include: {
          assignee: true,
          createdBy: true,
        },
      });
      if (!task || task.isDeleted) {
        throw new NotFoundException('Task không tồn tại hoặc đã bị xóa vào thùng rác');
      }

      // 🔒 [LC-32] ĐÓNG BĂNG CHỈNH SỬA NỘI DUNG KHI TASK ĐANG BỊ TẠM DỪNG HOẶC BỊ NGHẼN
      const isManagerOrAdmin =
        user &&
        (user.role === 'ADMIN' ||
          user.role === 'MANAGER' ||
          user.globalRole === 'ADMIN' ||
          user.globalRole === 'MANAGER');
      if ((task.status === 'PAUSED' || task.status === 'BLOCKED') && !isManagerOrAdmin) {
        throw new BadRequestException(
          'Task đang ở trạng thái Tạm Dừng hoặc Bị Nghẽn. Không thể chỉnh sửa mô tả cho đến khi Task được khôi phục trạng thái Đang Thực Hiện.'
        );
      }

      // Check ownership: ADMIN, MANAGER, or Assignee (nếu chưa giao việc thì Creator)
      let isAllowed = false;
      if (!user || isManagerOrAdmin) {
        isAllowed = true;
      } else {
        const userId = user.id;
        const userEmail = user.email;

        const isAssignee =
          task.assigneeId === userId ||
          (task.assignee && task.assignee.email === userEmail) ||
          (task.assignee && task.assignee.id === userId);

        const isCreatorUnassigned =
          !task.assigneeId &&
          (task.createdById === userId ||
            (task.createdBy && task.createdBy.email === userEmail) ||
            (task.createdBy && task.createdBy.id === userId));

        if (isAssignee || isCreatorUnassigned) {
          isAllowed = true;
        }
      }

      if (!isAllowed) {
        throw new ForbiddenException('Chỉ chủ sở hữu hoặc người được giao mới có quyền sửa mô tả Task');
      }

      return tx.task.update({
        where: { id },
        data: { description: description?.trim() || '' },
        include: {
          project: { select: { id: true, name: true } },
          assignee: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatar: true,
              profession: true,
            },
          },
          tags: { include: { tag: true } },
          attachments: true,
        },
      });
    });

    const result = {
      id: updatedTask.id,
      title: updatedTask.title,
      description: updatedTask.description || undefined,
      status: updatedTask.status,
      priority: updatedTask.priority,
      progress: updatedTask.progress,
      dueDate: updatedTask.dueDate ? updatedTask.dueDate.toISOString().slice(0, 10) : undefined,
      projectName: updatedTask.project?.name || 'Solaris Core',
      assigneeId: updatedTask.assigneeId || undefined,
      assignee: updatedTask.assignee
        ? {
            id: updatedTask.assignee.id,
            fullName: updatedTask.assignee.fullName,
            avatar: updatedTask.assignee.avatar || undefined,
            profession: updatedTask.assignee.profession,
          }
        : undefined,
      tags: updatedTask.tags.map((tt) => ({
        id: tt.tag.id,
        name: tt.tag.name,
        color: 'amber',
      })),
      commentsCount: 0,
      stageId: updatedTask.stageId || undefined,
      attachments: updatedTask.attachments
        ? updatedTask.attachments.map((att) => ({
            id: att.id,
            name: att.name,
            url: att.url,
            type: att.type,
            size: att.size || undefined,
            createdAt: att.createdAt ? att.createdAt.toISOString() : undefined,
          }))
        : [],
    };

    if (updatedTask.projectId) {
      this.socketGateway.broadcastToProject(updatedTask.projectId, 'task:updated', result);
    }

    return result;
  }

  // 💬 [LC-54] Lấy danh sách bình luận (Bảo vệ quyền thành viên dự án)
  async getComments(taskId: string, user?: AuthUserPayload) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { project: { include: { members: true } } },
    });
    if (!task) {
      throw new NotFoundException('Task không tồn tại');
    }

    if (user) {
      const isAdminOrManager =
        user.role === 'ADMIN' ||
        user.role === 'MANAGER' ||
        user.globalRole === 'ADMIN' ||
        user.globalRole === 'MANAGER' ||
        task.project?.managerId === user.id ||
        task.project?.createdById === user.id;

      const isMember = task.project?.members.some((m) => m.userId === user.id);
      if (!isAdminOrManager && !isMember) {
        throw new ForbiddenException('Bạn không thuộc dự án này để xem các bình luận của Task!');
      }
    }

    const comments = await this.prisma.comment.findMany({
      where: { taskId },
      include: {
        user: { select: { id: true, fullName: true, avatar: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return comments.map((c) => ({
      id: c.id,
      author: c.user?.fullName || 'Thành viên',
      avatar: c.user?.avatar || '',
      text: c.content,
      createdAt: c.createdAt.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));
  }

  async addComment(taskId: string, userId: string, dto: CreateTaskCommentDto) {
    const targetTask = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { project: { include: { members: true } } },
    });
    if (!targetTask || targetTask.isDeleted) {
      throw new NotFoundException('Task không tồn tại hoặc đã bị xóa vào thùng rác');
    }
    const cleanContent = (dto.content || dto.text || '').trim();
    if (!cleanContent) {
      throw new BadRequestException('Nội dung bình luận không được để trống!');
    }
    if (cleanContent.length > 5000) {
      throw new BadRequestException('Nội dung bình luận không được vượt quá 5.000 ký tự!');
    }

    // 🔒 [LC-161] KHÓA BÌNH LUẬN KHI TASK ĐÃ LƯU TRỮ HOẶC DỰ ÁN ĐÃ HOÀN THÀNH
    if (targetTask.isArchived) {
      throw new BadRequestException('Task này đã được lưu trữ (Archived). Không thể thêm bình luận mới!');
    }
    if (targetTask.project?.isCompleted) {
      throw new BadRequestException('Dự án này đã hoàn thành/nghiệm thu và đã đóng. Không thể thêm bình luận mới!');
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    const isAdmin = currentUser?.role === 'ADMIN' || (currentUser as any)?.globalRole === 'ADMIN';
    const isMember =
      targetTask.project?.members.some((m) => m.userId === userId) ||
      targetTask.project?.managerId === userId ||
      targetTask.project?.createdById === userId ||
      targetTask.assigneeId === userId ||
      targetTask.createdById === userId;

    if (!isAdmin && !isMember) {
      throw new ForbiddenException('Bạn không phải là thành viên của dự án này để bình luận vào Task');
    }

    const comment = await this.prisma.comment.create({
      data: {
        taskId,
        userId: userId,
        content: cleanContent,
      },
      include: {
        user: { select: { id: true, fullName: true, avatar: true } },
      },
    });

    const result = {
      id: comment.id,
      author: comment.user?.fullName || 'Thành viên',
      avatar: comment.user?.avatar || '',
      text: comment.content,
      createdAt: comment.createdAt.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    if (targetTask?.projectId) {
      this.socketGateway.broadcastToProject(targetTask.projectId, 'comment:created', { taskId, comment: result });
    }

    if (targetTask.assigneeId && targetTask.assigneeId !== userId) {
      await this.notificationService.sendNotification({
        userId: targetTask.assigneeId,
        actorId: userId,
        title: '💬 Bình luận mới trong Task',
        content: `${comment.user?.fullName || 'Đồng nghiệp'} đã bình luận vào Task "${targetTask.title}": "${cleanContent.slice(0, 80)}..."`,
        type: 'TASK_COMMENT',
        taskId: targetTask.id,
        projectId: targetTask.projectId,
      });
    }
    if (
      targetTask.createdById &&
      targetTask.createdById !== userId &&
      targetTask.createdById !== targetTask.assigneeId
    ) {
      await this.notificationService.sendNotification({
        userId: targetTask.createdById,
        actorId: userId,
        title: '💬 Bình luận mới trong Task',
        content: `${comment.user?.fullName || 'Đồng nghiệp'} đã bình luận vào Task "${targetTask.title}": "${cleanContent.slice(0, 80)}..."`,
        type: 'TASK_COMMENT',
        taskId: targetTask.id,
        projectId: targetTask.projectId,
      });
    }
    // 🔔 [LC-119] TỰ ĐỘNG PHÁT HIỆN @MENTION VÀ GỬI THÔNG BÁO NHẮC TÊN CHO THÀNH VIÊN DỰ ÁN
    if (targetTask.project?.members && cleanContent.includes('@')) {
      for (const m of targetTask.project.members) {
        if (m.userId !== userId && m.userId !== targetTask.assigneeId && m.userId !== targetTask.createdById) {
          const memberUser = await this.prisma.user.findUnique({
            where: { id: m.userId },
            select: { id: true, fullName: true },
          });
          if (memberUser && cleanContent.toLowerCase().includes(`@${memberUser.fullName.toLowerCase()}`)) {
            await this.notificationService.sendNotification({
              userId: memberUser.id,
              actorId: userId,
              title: '📢 Bạn được nhắc tên trong bình luận Task',
              content: `${comment.user?.fullName || 'Đồng nghiệp'} đã nhắc tên bạn trong Task "${targetTask.title}": "${cleanContent.slice(0, 80)}..."`,
              type: 'MENTION',
              taskId: targetTask.id,
              projectId: targetTask.projectId,
            });
          }
        }
      }
    }

    return result;
  }

  // ✉️ Create a new Task Transfer/Assist Request in PostgreSQL CSDL
  async createTaskRequest(senderId: string, dto: any) {
    // 🔒 [LC-71] KIỂM TRA TASK TỒN TẠI VÀ KHÔNG Ở TRONG THÙNG RÁC
    const targetTask = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
      include: {
        project: {
          select: { id: true, name: true, managerId: true, createdById: true },
        },
      },
    });
    if (!targetTask || targetTask.isDeleted) {
      throw new NotFoundException('Task không tồn tại hoặc đã bị xóa vào thùng rác');
    }

    const senderUser = await this.prisma.user.findUnique({
      where: { id: senderId },
    });
    const isManagerOrAdmin = Boolean(
      senderUser &&
      (senderUser.role === 'ADMIN' ||
        senderUser.role === 'MANAGER' ||
        (senderUser as any).globalRole === 'ADMIN' ||
        (senderUser as any).globalRole === 'MANAGER' ||
        targetTask.project?.managerId === senderId ||
        targetTask.project?.createdById === senderId)
    );

    // 🔒 [LC-45] CHẶN CHUYỂN GIAO TASK ĐÃ HOÀN THÀNH
    if (targetTask.status === 'DONE') {
      throw new BadRequestException('Không thể gửi yêu cầu chuyển giao cho Task đã hoàn thành!');
    }

    // 🔒 [LC-46] CHẶN CHUYỂN GIAO KHI TASK ĐANG TẠM DỪNG HOẶC BỊ NGHẼN
    if (targetTask.status === 'PAUSED' || targetTask.status === 'BLOCKED') {
      throw new BadRequestException(
        `Task đang ở trạng thái ${targetTask.status === 'PAUSED' ? 'Tạm Dừng' : 'Bị Nghẽn'}, không thể gửi yêu cầu chuyển giao. Vui lòng khôi phục trạng thái Đang Thực Hiện trước.`
      );
    }

    const effectiveSenderId = senderId;
    const effectiveReceiverId = dto.receiverId;

    // 🔒 [LC-28] 2. Chặn chuyển giao hoặc hỗ trợ cho chính bản thân mình
    if (effectiveSenderId === effectiveReceiverId) {
      throw new BadRequestException('Không thể gửi yêu cầu chuyển giao hoặc hỗ trợ cho chính bản thân mình!');
    }

    // 🔒 [LC-151] Chặn chuyển giao Task cho người đã và đang trực tiếp đảm nhiệm Task đó
    if (!dto.subtaskId && targetTask.assigneeId === effectiveReceiverId) {
      throw new BadRequestException('Nhân sự này đã đang trực tiếp đảm nhiệm Task này.');
    }

    // 🔒 3. Kiểm tra người nhận có thuộc Dự án không
    const isReceiverInProject = await this.prisma.projectMember.findFirst({
      where: { projectId: targetTask.projectId, userId: effectiveReceiverId },
    });
    const isReceiverManagerOrCreator =
      targetTask.project &&
      (targetTask.project.managerId === effectiveReceiverId || targetTask.project.createdById === effectiveReceiverId);
    if (!isReceiverInProject && !isReceiverManagerOrCreator) {
      throw new BadRequestException('Người nhận chuyển giao không thuộc thành viên của Dự án này!');
    }

    const receiverUser = await this.prisma.user.findUnique({
      where: { id: effectiveReceiverId },
    });

    // 🔀 CHUYỂN GIAO THEO CẤP ĐỘ MINITASK (SUBTASK TRANSFER)
    if (dto.subtaskId) {
      const targetSubtask = await this.prisma.subtask.findUnique({
        where: { id: dto.subtaskId },
      });
      if (!targetSubtask || targetSubtask.taskId !== targetTask.id) {
        throw new NotFoundException('Task con không tồn tại trong Task này');
      }
      if (targetSubtask.isDone) {
        throw new BadRequestException('Không thể chuyển giao Task con đã hoàn thành nghiệm thu!');
      }
      if (targetSubtask.assigneeId === effectiveReceiverId) {
        throw new BadRequestException('Nhân sự này đã đang trực tiếp phụ trách Task con này.');
      }

      const isSubtaskOwner =
        targetSubtask.assigneeId === effectiveSenderId ||
        targetTask.assigneeId === effectiveSenderId ||
        targetTask.createdById === effectiveSenderId;

      if (!isSubtaskOwner && !isManagerOrAdmin) {
        throw new ForbiddenException('Bạn chỉ có quyền chuyển giao Task con do chính mình phụ trách!');
      }

      // 👑 Quản lý phân công Minitask trực tiếp:
      if (isManagerOrAdmin) {
        return this.prisma.$transaction(async (tx) => {
          await tx.subtask.update({
            where: { id: dto.subtaskId },
            data: { assigneeId: effectiveReceiverId },
          });

          await tx.taskRequest.updateMany({
            where: {
              taskId: targetTask.id,
              note: { contains: dto.subtaskId },
              status: 'PENDING',
            },
            data: {
              status: 'CANCELLED',
              responseNote: 'Quản lý đã trực tiếp phân công nhân sự mới.',
            },
          });

          const reqItem = await tx.taskRequest.create({
            data: {
              taskId: dto.taskId,
              senderId: effectiveSenderId,
              receiverId: effectiveReceiverId,
              type: dto.type || 'TRANSFER',
              status: 'ACCEPTED',
              note: `[Chuyển giao Minitask] ${targetSubtask.title} (SubtaskId: ${dto.subtaskId}) - ${dto.note || 'Phân công trực tiếp từ Quản lý'}`,
              responseNote: 'Đã phân công trực tiếp bởi Quản lý',
            },
          });

          try {
            await tx.comment.create({
              data: {
                taskId: dto.taskId,
                userId: effectiveSenderId,
                content: `👑 [QUẢN LÝ PHÂN CÔNG MINITASK] Task con "${targetSubtask.title}" đã được phân công trực tiếp cho ${receiverUser?.fullName || 'Nhân sự mới'}.`,
              },
            });
          } catch {}

          this.socketGateway.broadcastToProject(targetTask.projectId, 'task:updated', { taskId: targetTask.id });

          return reqItem;
        });
      }

      // 🛡️ Nhân viên gửi yêu cầu chuyển giao Minitask:
      const existingPending = await this.prisma.taskRequest.findFirst({
        where: {
          taskId: dto.taskId,
          type: 'TRANSFER',
          status: 'PENDING',
          note: { contains: dto.subtaskId },
        },
      });
      if (existingPending) {
        throw new BadRequestException('Task con này đang có một yêu cầu chuyển giao chờ phản hồi!');
      }

      const reqItem = await this.prisma.taskRequest.create({
        data: {
          taskId: dto.taskId,
          senderId: effectiveSenderId,
          receiverId: effectiveReceiverId,
          type: dto.type || 'TRANSFER',
          status: 'PENDING',
          note: `[Chuyển giao Minitask] ${targetSubtask.title} (SubtaskId: ${dto.subtaskId}) - ${dto.note || 'Yêu cầu chuyển giao Task con'}`,
        },
      });

      await this.prisma.task.update({
        where: { id: dto.taskId },
        data: { status: 'IN_REVIEW' },
      });

      this.socketGateway.broadcastToProject(targetTask.projectId, 'task:request-created', {
        taskId: dto.taskId,
        taskTitle: targetTask.title,
        subtaskTitle: targetSubtask.title,
        senderName: senderUser?.fullName || 'Đồng nghiệp',
        receiverId: effectiveReceiverId,
        note: dto.note,
      });

      return reqItem;
    }

    // 👑 4. NẾU LÀ MANAGER / ADMIN PHÂN CÔNG: GÁN TRỰC TIẾP, KHÔNG BẮT ACCEPT/DENY, CHỈ GỬI THÔNG BÁO
    if (isManagerOrAdmin) {
      await this.prisma.task.update({
        where: { id: dto.taskId },
        data: {
          assigneeId: effectiveReceiverId,
          status: 'IN_PROGRESS',
        },
      });

      // Tự động dọn dẹp các yêu cầu duyệt subtask cũ đang treo
      await this.prisma.taskRequest.updateMany({
        where: {
          taskId: targetTask.id,
          type: 'SUBTASK_APPROVAL',
          status: 'PENDING',
        },
        data: {
          status: 'REJECTED',
          responseNote: 'Đã tự động hủy do Quản lý phân công task cho nhân sự mới.',
        },
      });

      await this.prisma.subtask.updateMany({
        where: { taskId: targetTask.id, approvalStatus: 'PENDING' },
        data: { approvalStatus: 'NONE' },
      });

      const reqItem = await this.prisma.taskRequest.create({
        data: {
          taskId: dto.taskId,
          senderId: effectiveSenderId,
          receiverId: effectiveReceiverId,
          type: dto.type || 'TRANSFER',
          status: 'ACCEPTED',
          note: dto.note || 'Phân công Task trực tiếp từ Quản lý',
          responseNote: 'Đã phân công trực tiếp bởi Quản lý',
        },
      });

      try {
        await this.prisma.comment.create({
          data: {
            taskId: dto.taskId,
            userId: effectiveSenderId,
            content: `👑 [PHÂN CÔNG TRỰC TIẾP TỪ QUẢN LÝ] Quản lý ${senderUser?.fullName || 'Quản lý'} đã phân công trực tiếp Task này cho ${receiverUser?.fullName || 'Nhân sự'}. Ghi chú: "${dto.note || 'Thực hiện Task'}"`,
          },
        });
      } catch {}

      // Bắn Socket thông báo Realtime
      this.socketGateway.broadcastToProject(targetTask.projectId, 'task:assigned-by-manager', {
        taskId: dto.taskId,
        taskTitle: targetTask.title,
        assigneeId: effectiveReceiverId,
        assigneeName: receiverUser?.fullName || 'Nhân sự',
        managerName: senderUser?.fullName || 'Quản lý',
        note: dto.note,
      });

      const updatedTaskObj = await this.prisma.task.findUnique({
        where: { id: dto.taskId },
        include: {
          project: { select: { id: true, name: true } },
          assignee: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatar: true,
              profession: true,
            },
          },
          createdBy: {
            select: { id: true, fullName: true, email: true, avatar: true },
          },
          tags: { include: { tag: true } },
          subtasks: {
            include: {
              assignee: { select: { id: true, fullName: true, avatar: true } },
            },
            orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          },
          attachments: true,
          _count: { select: { comments: true } },
        },
      });
      if (updatedTaskObj) {
        this.socketGateway.broadcastToProject(
          targetTask.projectId,
          'task:updated',
          this.mapTaskResponse(updatedTaskObj)
        );
      }

      return reqItem;
    }

    // 🛡️ 5. NẾU LÀ NHÂN VIÊN THƯỜNG: Kiểm tra chống spam request trùng lặp
    const existingPending = await this.prisma.taskRequest.findFirst({
      where: { taskId: dto.taskId, type: 'TRANSFER', status: 'PENDING' },
    });
    if (existingPending) {
      throw new BadRequestException(
        'Task này đang có một yêu cầu chuyển giao chờ phản hồi. Vui lòng chờ người nhận xử lý trước khi gửi yêu cầu mới.'
      );
    }

    // Save new request to task_requests table in PostgreSQL
    const reqItem = await this.prisma.taskRequest.create({
      data: {
        taskId: dto.taskId,
        senderId: effectiveSenderId,
        receiverId: effectiveReceiverId,
        type: dto.type || 'TRANSFER',
        status: 'PENDING',
        note: dto.note || 'Yêu cầu chuyển giao Task tác nghiệp',
      },
    });

    // Automatically set task status to IN_REVIEW in tasks table
    await this.prisma.task.update({
      where: { id: dto.taskId },
      data: { status: 'IN_REVIEW' },
    });

    this.socketGateway.broadcastToProject(targetTask.projectId, 'task:request-created', {
      taskId: dto.taskId,
      taskTitle: targetTask.title,
      senderName: senderUser?.fullName || 'Đồng nghiệp',
      receiverId: effectiveReceiverId,
      note: dto.note,
    });

    return reqItem;
  }

  // 📤 Get outgoing task transfer requests sent by the logged-in user
  async getOutgoingRequests(userId: string) {
    const requests = await this.prisma.taskRequest.findMany({
      where: {
        senderId: userId,
      },
      include: {
        task: { select: { id: true, title: true, priority: true } },
        receiver: {
          select: { id: true, fullName: true, avatar: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      taskTitle: r.task.title,
      priority: r.task.priority,
      type: r.type,
      receiverName: r.receiver.fullName,
      receiverAvatar: r.receiver.avatar || '',
      status: (r.status as string) === 'ACCEPTED' ? 'APPROVED' : r.status,
      note: r.note || 'Yêu cầu chuyển giao Task tác nghiệp',
      createdAt: r.createdAt.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      }),
    }));
  }

  // 🚫 [LC-38] Cancel a pending outgoing task transfer request (Allowed for Sender, Admin, Manager)
  async cancelTaskRequest(requestId: string, userId: string) {
    const reqItem = await this.prisma.taskRequest.findUnique({
      where: { id: requestId },
      include: {
        sender: { select: { id: true, fullName: true } },
        receiver: { select: { id: true, fullName: true } },
        task: {
          select: {
            id: true,
            projectId: true,
            project: { select: { managerId: true, createdById: true } },
          },
        },
      },
    });

    if (!reqItem) {
      throw new NotFoundException('Yêu cầu không tồn tại');
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    const isManagerOrAdmin = Boolean(
      currentUser &&
      (currentUser.role === 'ADMIN' ||
        currentUser.role === 'MANAGER' ||
        (currentUser as any).globalRole === 'ADMIN' ||
        (currentUser as any).globalRole === 'MANAGER' ||
        reqItem.task.project?.managerId === userId ||
        reqItem.task.project?.createdById === userId)
    );

    if (reqItem.senderId !== userId && !isManagerOrAdmin) {
      throw new ForbiddenException('Bạn chỉ có thể hủy yêu cầu do chính mình gửi đi (hoặc bởi Quản lý/Admin)!');
    }

    if (reqItem.status !== 'PENDING') {
      throw new BadRequestException('Yêu cầu đã được xử lý hoặc không ở trạng thái Chờ Duyệt (PENDING)');
    }

    // 🔒 Bọc tất cả thao tác CSDL trong 1 Prisma Transaction nguyên tố (Atomic Transaction)
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' as any },
      });

      if (reqItem.type === 'SUBTASK_APPROVAL') {
        const match = reqItem.note?.match(/SubtaskId:\s*([a-zA-Z0-9_-]+)/i);
        const subtaskId = match ? match[1] : null;
        if (subtaskId) {
          await tx.subtask.update({
            where: { id: subtaskId },
            data: { approvalStatus: 'NONE' },
          });
        }
      } else {
        await tx.task.update({
          where: { id: reqItem.taskId },
          data: { status: 'IN_PROGRESS' },
        });

        await tx.comment.create({
          data: {
            taskId: reqItem.taskId,
            userId: userId,
            content: `🚫 [HỦY YÊU CẦU CHUYỂN GIAO] ${reqItem.sender.fullName} đã hủy yêu cầu chuyển giao Task tới ${reqItem.receiver.fullName}. Task quay trở lại trạng thái Thực hiện.`,
          },
        });
      }

      return updated;
    });
  }

  // 📬 Get incoming task transfer requests targeted to user (Admin can view all system requests)
  async getIncomingRequests(userId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    const isAdmin = currentUser?.role === 'ADMIN';

    const whereCondition: any = {
      status: 'PENDING',
      task: { isDeleted: false },
    };

    if (!isAdmin) {
      whereCondition.receiverId = userId;
    }

    const requests = await this.prisma.taskRequest.findMany({
      where: whereCondition,
      include: {
        task: { select: { id: true, title: true, priority: true } },
        sender: {
          select: { id: true, fullName: true, avatar: true, email: true },
        },
        receiver: {
          select: { id: true, fullName: true, avatar: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      taskTitle: r.task.title,
      priority: r.task.priority,
      type: r.type,
      senderName: r.sender.fullName,
      senderAvatar: r.sender.avatar || '',
      note: r.note || 'Yêu cầu chuyển giao Task tác nghiệp',
      createdAt: r.createdAt.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      }),
    }));
  }

  // 🟢 [LC-37] Respond to incoming transfer request (APPROVED or REJECTED)
  async respondToRequest(requestId: string, userId: string, action: 'APPROVED' | 'REJECTED') {
    const reqItem = await this.prisma.taskRequest.findUnique({
      where: { id: requestId },
      include: {
        sender: { select: { id: true, fullName: true } },
        receiver: { select: { id: true, fullName: true } },
        task: {
          select: {
            id: true,
            title: true,
            projectId: true,
            project: { select: { managerId: true, createdById: true } },
          },
        },
      },
    });

    if (!reqItem) {
      throw new NotFoundException('Yêu cầu không tồn tại');
    }

    // 🔒 [LC-37] KIỂM TRA QUYỀN NGƯỜI NHẬN HOẶC ADMIN/MANAGER DỰ ÁN
    const responder = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    const isManagerOrAdmin = Boolean(
      responder &&
      (responder.role === 'ADMIN' ||
        responder.role === 'MANAGER' ||
        (responder as any).globalRole === 'ADMIN' ||
        (responder as any).globalRole === 'MANAGER' ||
        reqItem.task.project?.managerId === userId ||
        reqItem.task.project?.createdById === userId)
    );

    if (!isManagerOrAdmin && userId !== reqItem.receiverId) {
      throw new ForbiddenException('Bạn không phải là người nhận yêu cầu này để thực hiện phản hồi.');
    }

    const targetStatus = action === 'APPROVED' ? 'ACCEPTED' : 'REJECTED';

    // 🔒 Bọc tất cả thao tác CSDL trong 1 Prisma Transaction nguyên tố (Atomic Transaction)
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.taskRequest.update({
        where: { id: requestId },
        data: { status: targetStatus as any },
      });

      if (reqItem.type === 'SUBTASK_APPROVAL') {
        const match = reqItem.note?.match(/SubtaskId:\s*([a-zA-Z0-9_-]+)/i);
        const subtaskId = match ? match[1] : null;
        if (subtaskId) {
          if (action === 'APPROVED') {
            await tx.subtask.update({
              where: { id: subtaskId },
              data: {
                isDone: true,
                approvalStatus: 'APPROVED',
                rejectionReason: null,
              },
            });
          } else {
            await tx.subtask.update({
              where: { id: subtaskId },
              data: {
                isDone: false,
                approvalStatus: 'REJECTED',
                rejectionReason: 'Từ chối qua hộp thư phê duyệt',
              },
            });
          }
        }
      } else {
        const match = reqItem.note?.match(/SubtaskId:\s*([a-zA-Z0-9_-]+)/i);
        const subtaskId = match ? match[1] : null;

        if (subtaskId) {
          // 🔀 XỬ LÝ CHUYỂN GIAO MINITASK (SUBTASK TRANSFER)
          if (action === 'APPROVED') {
            await tx.subtask.update({
              where: { id: subtaskId },
              data: { assigneeId: reqItem.receiverId },
            });

            await tx.task.update({
              where: { id: reqItem.taskId },
              data: { status: 'IN_PROGRESS' },
            });

            try {
              await tx.comment.create({
                data: {
                  taskId: reqItem.taskId,
                  userId: userId || reqItem.receiverId,
                  content: `🔄 [CHUYỂN GIAO MINITASK THÀNH CÔNG] Task con đã được chuyển giao thành công từ ${reqItem.sender?.fullName || 'Đồng nghiệp'} sang ${reqItem.receiver?.fullName || 'Người nhận'}.`,
                },
              });
            } catch {}
          } else {
            // REJECTED
            await tx.task.update({
              where: { id: reqItem.taskId },
              data: { status: 'IN_PROGRESS' },
            });

            try {
              await tx.comment.create({
                data: {
                  taskId: reqItem.taskId,
                  userId: userId || reqItem.receiverId,
                  content: `❌ [TỪ CHỐI CHUYỂN GIAO MINITASK] ${reqItem.receiver?.fullName || 'Người nhận'} đã từ chối tiếp nhận Task con từ ${reqItem.sender?.fullName || 'Đồng nghiệp'}.`,
                },
              });
            } catch {}
          }
        } else {
          // Legacy Whole Task Transfer
          if (action === 'APPROVED') {
            // Khi chuyển giao task thành công: tự động hủy các yêu cầu duyệt subtask cũ đang treo
            await tx.taskRequest.updateMany({
              where: {
                taskId: reqItem.taskId,
                type: 'SUBTASK_APPROVAL',
                status: 'PENDING',
              },
              data: {
                status: 'REJECTED',
                responseNote: 'Đã tự động hủy do Task được chuyển giao sang nhân sự mới.',
              },
            });
            await tx.subtask.updateMany({
              where: {
                taskId: reqItem.taskId,
                approvalStatus: 'PENDING',
              },
              data: {
                approvalStatus: 'NONE',
              },
            });

            await tx.task.update({
              where: { id: reqItem.taskId },
              data: {
                assigneeId: reqItem.receiverId,
                status: 'IN_PROGRESS',
              },
            });

            try {
              await tx.comment.create({
                data: {
                  taskId: reqItem.taskId,
                  userId: userId || reqItem.receiverId,
                  content: `🔄 [LỊCH SỬ CHUYỂN GIAO BAN GIAO TASK] Task đã được chuyển giao thành công từ ${reqItem.sender?.fullName || 'Đồng nghiệp'} sang ${reqItem.receiver?.fullName || 'Người nhận'}. Chú thích: "${reqItem.note || 'Không có ghi chú'}"`,
                },
              });
            } catch {
              // Fallback silently if comment creation fails
            }
          } else if (action === 'REJECTED') {
            await tx.task.update({
              where: { id: reqItem.taskId },
              data: { status: 'IN_PROGRESS' },
            });

            try {
              await tx.comment.create({
                data: {
                  taskId: reqItem.taskId,
                  userId: userId || reqItem.receiverId,
                  content: `❌ [LỊCH SỬ TỪ CHỐI CHUYỂN GIAO] ${reqItem.receiver?.fullName || 'Người nhận'} đã từ chối yêu cầu bàn giao từ ${reqItem.sender?.fullName || 'Đồng nghiệp'}. Task giữ nguyên cho người thực hiện cũ.`,
                },
              });
            } catch {
              // Fallback silently if comment creation fails
            }
          }
        }
      }

      return res;
    });

    if (reqItem.type === 'SUBTASK_APPROVAL') {
      await this.recalculateTaskProgress(reqItem.taskId, reqItem.task.projectId);
    }

    return updated;
  }

  // 🗑️ [LC-55] Delete Task (Allowed for Admin, Global Manager & Project Manager)
  async deleteTask(id: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { project: { select: { managerId: true, createdById: true } } },
    });
    if (!task) {
      throw new NotFoundException('Task không tồn tại');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    const isManagerOrAdmin = Boolean(
      user &&
      (user.role === 'ADMIN' ||
        user.role === 'MANAGER' ||
        (user as any).globalRole === 'ADMIN' ||
        (user as any).globalRole === 'MANAGER' ||
        task.project?.managerId === userId ||
        task.project?.createdById === userId)
    );

    if (!isManagerOrAdmin) {
      throw new ForbiddenException('Chỉ có Cấp Quản Lý (Manager) hoặc Quản Trị Viên (Admin) mới có quyền xóa Task!');
    }

    // 🔒 [LC-24] HỦY TOÀN BỘ YÊU CẦU CHUYỂN GIAO / DUYỆT ĐANG TREO KHI XÓA TASK
    await this.prisma.taskRequest.updateMany({
      where: {
        taskId: id,
        status: 'PENDING',
      },
      data: {
        status: 'CANCELLED',
        responseNote: 'Task đã bị Quản lý xóa khỏi hệ thống.',
      },
    });

    await this.prisma.task.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    if (task.projectId) {
      this.socketGateway.broadcastToProject(task.projectId, 'task:deleted', {
        id,
      });
    }

    return {
      success: true,
      message: `Đã tự động di chuyển Task "${task.title}" vào CSDL Thùng Rác (Lưu vết CSDL thành công)`,
    };
  }

  // 📦 Lấy danh sách Task trong Lưu Trữ / Audit Log (CHỈ DÀNH CHO ADMIN)
  async getArchivedTasks(user?: AuthUserPayload) {
    if (user && user.role !== 'ADMIN' && user.globalRole !== 'ADMIN') {
      throw new ForbiddenException('Chỉ Quản Trị Viên (Admin) mới có quyền truy cập Audit Log & Lưu Trữ!');
    }

    const tasks = await this.prisma.task.findMany({
      where: {
        OR: [{ isDeleted: true }, { isArchived: true }],
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: {
          select: { id: true, fullName: true, email: true, avatar: true },
        },
        createdBy: {
          select: { id: true, fullName: true, email: true, avatar: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return tasks.map((t) => ({
      ...this.mapTaskResponse(t),
      isDeleted: t.isDeleted,
      isAutoArchivedDone: false,
    }));
  }

  // 🔄 [LC-35] [LC-53] [CC-01] Khôi phục Task từ CSDL Thùng Rác (Tự động mở lại Dự án cha nếu đang bị xóa)
  async restoreTask(id: string, user?: AuthUserPayload) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, name: true, managerId: true, createdById: true, isCompleted: true, isDeleted: true },
        },
      },
    });
    if (!task) {
      throw new NotFoundException('Task không tồn tại trong CSDL');
    }

    // 🛡️ [CC-05] Idempotent guard: nếu task đã ở trạng thái khôi phục thì trả về ngay
    if (!task.isDeleted) {
      return {
        success: true,
        message: `Task "${task.title}" đã ở trạng thái hoạt động!`,
        task: this.mapTaskResponse(task),
      };
    }

    // 🔒 [LC-78] CHẶN KHÔI PHỤC TASK VÀO DỰ ÁN ĐÃ HOÀN THÀNH / NGHIỆM THU
    if (task.project?.isCompleted) {
      throw new BadRequestException(
        'Dự án này đã hoàn thành/nghiệm thu và đã đóng. Không thể khôi phục Task vào dự án đã đóng!'
      );
    }

    if (user) {
      const isManagerOrAdmin =
        user.role === 'ADMIN' ||
        user.role === 'MANAGER' ||
        user.globalRole === 'ADMIN' ||
        user.globalRole === 'MANAGER' ||
        task.project?.managerId === user.id ||
        task.project?.createdById === user.id;

      if (!isManagerOrAdmin) {
        throw new ForbiddenException(
          'Chỉ Quản Trị Viên (Admin) hoặc Quản lý dự án mới có quyền khôi phục Task từ Thùng Rác!'
        );
      }
    }

    let autoRestoredProject = false;

    await this.prisma.$transaction(async (tx) => {
      // 🔄 [CC-01] Tự động khôi phục Dự án cha nếu đang bị xóa
      if (task.project?.isDeleted) {
        await tx.project.update({
          where: { id: task.projectId },
          data: {
            isDeleted: false,
            deletedAt: null,
            deletedById: null,
          },
        });
        autoRestoredProject = true;
      }

      await tx.task.update({
        where: { id },
        data: {
          isDeleted: false,
          deletedAt: null,
        },
      });
    });

    if (autoRestoredProject) {
      this.socketGateway.broadcastToProject(task.projectId, 'project:restored', {
        projectId: task.projectId,
      });
    }

    const updated = await this.recalculateTaskProgress(id, task.projectId);
    this.socketGateway.broadcastToProject(task.projectId, 'task:created', updated);

    const message = autoRestoredProject
      ? `Đã khôi phục Task "${task.title}" và tự động mở lại Dự án "${task.project?.name || ''}" từ Thùng Rác!`
      : `Đã khôi phục thành công Task "${task.title}" về Bảng công việc!`;

    return {
      success: true,
      message,
      task: updated,
    };
  }

  // 💥 [ADMIN ONLY] Xóa vĩnh viễn Task khỏi CSDL
  async permanentDeleteTask(id: string, user?: AuthUserPayload) {
    if (user && user.role !== 'ADMIN' && user.globalRole !== 'ADMIN') {
      throw new ForbiddenException('Chỉ Quản Trị Viên (Admin) mới có quyền xóa vĩnh viễn Task khỏi CSDL!');
    }

    const task = await this.prisma.task.findUnique({
      where: { id },
    });
    if (!task) {
      throw new NotFoundException('Task không tồn tại!');
    }

    await this.prisma.task.delete({ where: { id } });

    return {
      success: true,
      message: `Đã xóa vĩnh viễn Task "${task.title}" khỏi CSDL.`,
    };
  }

  private mapTaskResponse(t: any) {
    return {
      id: t.id,
      title: t.title,
      description: t.description || undefined,
      status: t.status,
      priority: t.priority,
      progress: t.progress,
      startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : undefined,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : undefined,
      projectName: t.project?.name || 'Solaris Core',
      assigneeId: t.assigneeId || undefined,
      assignee: t.assignee
        ? {
            id: t.assignee.id,
            fullName: t.assignee.fullName,
            avatar: t.assignee.avatar || undefined,
            profession: t.assignee.profession,
          }
        : undefined,
      assignees: (() => {
        const distinctMap = new Map<string, any>();
        if (t.assignee) {
          distinctMap.set(t.assignee.id, {
            id: t.assignee.id,
            fullName: t.assignee.fullName,
            avatar: t.assignee.avatar || undefined,
            profession: t.assignee.profession,
          });
        }
        if (t.subtasks && Array.isArray(t.subtasks)) {
          for (const st of t.subtasks) {
            if (st.assignee && !distinctMap.has(st.assignee.id)) {
              distinctMap.set(st.assignee.id, {
                id: st.assignee.id,
                fullName: st.assignee.fullName,
                avatar: st.assignee.avatar || undefined,
                profession: st.assignee.profession,
              });
            }
          }
        }
        return Array.from(distinctMap.values());
      })(),
      createdById: t.createdById,
      createdAt: t.createdAt ? t.createdAt.toISOString() : undefined,
      createdBy: t.createdBy
        ? {
            id: t.createdBy.id,
            fullName: t.createdBy.fullName,
            avatar: t.createdBy.avatar || undefined,
          }
        : undefined,
      transferInfo:
        t.taskRequests && t.taskRequests.length > 0
          ? {
              senderName: t.taskRequests[0].sender.fullName,
              senderAvatar: t.taskRequests[0].sender.avatar || '',
              receiverName: t.taskRequests[0].receiver.fullName,
              receiverAvatar: t.taskRequests[0].receiver.avatar || '',
              note: t.taskRequests[0].note || '',
            }
          : undefined,
      commentsCount: t._count?.comments || 0,
      stageId: t.stageId || undefined,
      subtasks: t.subtasks
        ? t.subtasks.map((st: any) => ({
            id: st.id,
            title: st.title,
            isDone: Boolean(st.isDone),
            isUrgent: Boolean(st.isUrgent),
            approvalStatus: st.approvalStatus || (st.isDone ? 'APPROVED' : 'NONE'),
            rejectionReason: st.rejectionReason || undefined,
            order: st.order || 0,
            assigneeId: st.assigneeId || undefined,
            startDate: st.startDate ? st.startDate.toISOString().slice(0, 10) : undefined,
            estimatedDays: st.estimatedDays ? Number(st.estimatedDays) : 1,
            assignee: st.assignee
              ? {
                  id: st.assignee.id,
                  fullName: st.assignee.fullName,
                  avatar: st.assignee.avatar || undefined,
                }
              : undefined,
            dueDate: st.dueDate ? st.dueDate.toISOString().slice(0, 10) : undefined,
            createdAt: st.createdAt ? st.createdAt.toISOString() : undefined,
          }))
        : [],
      attachments: t.attachments
        ? t.attachments.map((att) => ({
            id: att.id,
            name: att.name,
            url: att.url,
            type: att.type,
            size: att.size || undefined,
            createdAt: att.createdAt ? att.createdAt.toISOString() : undefined,
          }))
        : [],
    };
  }

  async addAttachment(
    taskId: string,
    file: { originalname?: string; filename?: string; mimetype?: string; size?: number; buffer?: Buffer } | any,
    body: { name?: string; url?: string; type?: string },
    user?: AuthUserPayload
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { project: { include: { members: true } } },
    });
    if (!task || task.isDeleted) {
      throw new NotFoundException('Task không tồn tại hoặc đã bị xóa vào thùng rác');
    }

    // 🔒 [LC-25] BẢO VỆ QUYỀN TẢI TỆP ĐÍNH KÈM (ATTACHMENT SECURITY)
    if (user) {
      const isAdminOrManager =
        user.role === 'ADMIN' ||
        user.role === 'MANAGER' ||
        user.globalRole === 'ADMIN' ||
        user.globalRole === 'MANAGER';
      const isMember =
        task.project?.members.some((m) => m.userId === user.id) ||
        task.project?.managerId === user.id ||
        task.project?.createdById === user.id ||
        task.assigneeId === user.id ||
        task.createdById === user.id;

      if (!isAdminOrManager && !isMember) {
        throw new ForbiddenException('Bạn không phải là thành viên của dự án này để tải tệp đính kèm');
      }
    }

    let attachmentData: any = {};

    if (file) {
      // 🔒 [LC-73] NÂNG GIỚI HẠN DUNG LƯỢNG LÊN 100MB & SANITIZE FILENAME
      const maxSizeBytes = 100 * 1024 * 1024; // 100MB
      if (file.size > maxSizeBytes) {
        throw new BadRequestException('Dung lượng tệp đính kèm vượt quá giới hạn tối đa cho phép (100MB)!');
      }

      // 🛡️ Sanitize filename chống path traversal và ký tự điều khiển nguy hiểm
      const safeFilename = (file.originalname || 'file')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, '_');
      const uniqueName = `${Date.now()}-${safeFilename}`;
      const fs = await import('fs');
      const path = await import('path');
      const uploadsDir = path.join(process.cwd(), 'uploads');

      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const uploadPath = path.join(uploadsDir, uniqueName);
      if (file.buffer) {
        fs.writeFileSync(uploadPath, file.buffer);
      }

      attachmentData = {
        name: safeFilename,
        url: `/uploads/${uniqueName}`,
        type: file.mimetype || 'file',
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      };
    } else if (body.url) {
      attachmentData = {
        name: body.name || 'Liên kết ngoài',
        url: body.url,
        type: body.type || 'link',
        size: 0,
      };
    } else {
      throw new BadRequestException('Vui lòng cung cấp file hoặc URL');
    }

    const attachment = await this.prisma.attachment.create({
      data: {
        ...attachmentData,
        taskId,
      },
    });

    // 📝 [LC-54] Ghi nhận Activity History khi đính kèm file/link
    await this.activityService.createTaskHistory(
      taskId,
      user?.id || 'SYSTEM',
      `Đã đính kèm tệp: "${attachmentData.name}"`,
      'attachment',
      null,
      attachmentData.name
    );

    // Gửi realtime cập nhật task kèm attachments
    if (task.projectId) {
      const updatedTaskObj = await this.prisma.task.findUnique({
        where: { id: taskId },
        include: {
          assignee: {
            select: { id: true, fullName: true, email: true, avatar: true },
          },
          subtasks: {
            include: {
              assignee: { select: { id: true, fullName: true, email: true } },
            },
          },
          tags: { include: { tag: true } },
          attachments: true,
        },
      });
      this.socketGateway.broadcastToProject(task.projectId, 'task:updated', this.mapTaskResponse(updatedTaskObj));
    }

    return attachment;
  }

  async deleteAttachment(attachmentId: string, user?: AuthUserPayload) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        task: {
          select: {
            id: true,
            status: true,
            projectId: true,
            assigneeId: true,
            createdById: true,
            project: { select: { managerId: true, createdById: true } },
          },
        },
      },
    });
    if (!attachment) {
      throw new NotFoundException('Đính kèm không tồn tại');
    }

    // 🔒 BẢO VỆ BẰNG CHỨNG KIỂM TOÁN: Khóa không cho xóa file đính kèm của Task đã hoàn thành
    if (attachment.task?.status === 'DONE') {
      throw new BadRequestException(
        'Không thể xóa tệp đính kèm của Task đã hoàn thành nhằm bảo vệ tính toàn vẹn dữ liệu nghiệm thu.'
      );
    }

    // 🔒 [LC-25] BẢO VỆ QUYỀN XÓA TỆP ĐÍNH KÈM
    if (user) {
      const isAdminOrManager =
        user.role === 'ADMIN' ||
        user.role === 'MANAGER' ||
        user.globalRole === 'ADMIN' ||
        user.globalRole === 'MANAGER' ||
        attachment.task?.project?.managerId === user.id ||
        attachment.task?.project?.createdById === user.id;
      const isOwner = attachment.task?.assigneeId === user.id || attachment.task?.createdById === user.id;

      if (!isAdminOrManager && !isOwner) {
        throw new ForbiddenException(
          'Chỉ người thực hiện Task, người tạo Task hoặc Quản lý dự án mới có quyền xóa tệp đính kèm'
        );
      }
    }

    if (attachment.type === 'file') {
      const fs = require('fs');
      const path = require('path');
      const filename = path.basename(attachment.url);
      const filePath = path.join(process.cwd(), 'uploads', filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          // ignore
        }
      }
    }

    await this.prisma.attachment.delete({ where: { id: attachmentId } });

    const task = await this.prisma.task.findUnique({
      where: { id: attachment.taskId },
    });
    if (task?.projectId) {
      const updatedTaskObj = await this.prisma.task.findUnique({
        where: { id: attachment.taskId },
        include: {
          project: { select: { id: true, name: true } },
          assignee: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatar: true,
              profession: true,
            },
          },
          tags: { include: { tag: true } },
          attachments: true,
        },
      });
      this.socketGateway.broadcastToProject(task.projectId, 'task:updated', this.mapTaskResponse(updatedTaskObj));
    }

    return { success: true };
  }

  async addSubtask(
    taskId: string,
    body: {
      title: string;
      assigneeId?: string;
      startDate?: string;
      estimatedDays?: number;
      dueDate?: string;
      isUrgent?: boolean;
    },
    user?: AuthUserPayload
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        subtasks: true,
        project: {
          select: {
            id: true,
            isCompleted: true,
            managerId: true,
            createdById: true,
          },
        },
      },
    });
    if (!task || task.isDeleted) {
      throw new NotFoundException('Task không tồn tại hoặc đã bị xóa vào thùng rác');
    }

    // 🔒 [LC-69] CHẶN THÊM TASK CON VÀO DỰ ÁN ĐÃ ĐÓNG / HOÀN THÀNH
    if (task.project?.isCompleted) {
      throw new BadRequestException('Dự án này đã hoàn thành/nghiệm thu và đã được đóng. Không thể thêm Task con mới!');
    }

    // 🔒 [LC-23] CHẶN THÊM TASK CON VÀO TASK ĐÃ LƯU TRỮ HOẶC ĐÃ HOÀN THÀNH KHI KHÔNG MỞ LẠI
    if (task.isArchived) {
      throw new BadRequestException('Task này đã được lưu trữ (Archived). Không thể thêm Task con mới!');
    }

    // 👑 [LC-85] NẾU TASK ĐÃ DONE VÀ ADMIN/MANAGER/ASSIGNEE THÊM TASK CON MỚI -> HỆ THỐNG CHO PHÉP VÀ TỰ ĐỘNG MỞ LẠI TASK SANG IN_PROGRESS
    const isAdminOrManagerUser = Boolean(
      user &&
      (user.role === 'ADMIN' ||
        user.role === 'MANAGER' ||
        user.globalRole === 'ADMIN' ||
        user.globalRole === 'MANAGER' ||
        task.project?.managerId === user.id ||
        task.project?.createdById === user.id)
    );
    const isTaskAssignee = user && task.assigneeId === user.id;

    if (task.status === 'DONE' && !isAdminOrManagerUser && !isTaskAssignee) {
      throw new BadRequestException(
        'Task đã hoàn thành (DONE). Chỉ Quản lý/Admin hoặc người đảm nhiệm mới có quyền thêm Task con để mở lại nhiệm vụ.'
      );
    }

    // 🔒 [LC-10] KHÓA THÊM TASK CON KHI TASK ĐANG TẠM DỪNG HOẶC BỊ NGHẼN
    if (task.status === 'PAUSED' || task.status === 'BLOCKED') {
      throw new BadRequestException(
        `Task đang ở trạng thái ${task.status === 'PAUSED' ? 'Tạm Dừng' : 'Bị Nghẽn'}. Vui lòng khôi phục trạng thái Đang Thực Hiện trước khi thêm Task con!`
      );
    }

    // 🔒 [LC-31] CHẶN THÊM TASK CON KHI TASK ĐANG TRONG QUÁ TRÌNH BÀN GIAO PENDING
    if (task.status === 'IN_REVIEW') {
      const pendingTransfer = await this.prisma.taskRequest.findFirst({
        where: { taskId, type: 'TRANSFER', status: 'PENDING' },
      });
      if (pendingTransfer) {
        throw new BadRequestException(
          'Task đang trong trạng thái Chờ Duyệt Bàn Giao (IN_REVIEW). Vui lòng hoàn tất hoặc hủy bàn giao trước khi thêm Task con mới.'
        );
      }
    }

    // 🔒 PHÂN QUYỀN CHẶT CHẼ: CHỈ người trực tiếp đảm nhiệm Task (Assignee) hoặc Quản lý/Admin mới được tạo Task con
    if (user) {
      const isAdminOrManager = Boolean(
        user.role === 'ADMIN' ||
        user.role === 'MANAGER' ||
        user.globalRole === 'ADMIN' ||
        user.globalRole === 'MANAGER' ||
        task.project?.managerId === user.id ||
        task.project?.createdById === user.id
      );
      const isAssignee = task.assigneeId === user.id;
      const isUnassignedAndCreator = !task.assigneeId && task.createdById === user.id;

      if (!isAdminOrManager && !isAssignee && !isUnassignedAndCreator) {
        throw new ForbiddenException(
          'Chỉ người trực tiếp đảm nhiệm Task (Assignee) hoặc Quản lý/Admin mới có quyền tạo Task con!'
        );
      }
    }

    // 🔒 [LC-26] KIỂM TRA RÀNG BUỘC THÀNH VIÊN DỰ ÁN KHI GÁN TASK CON
    const effectiveSubtaskAssigneeId = body.assigneeId || user?.id || task.assigneeId || undefined;
    if (effectiveSubtaskAssigneeId) {
      const isMember = await this.prisma.projectMember.findFirst({
        where: { projectId: task.projectId, userId: effectiveSubtaskAssigneeId },
      });
      const isProjectAdminOrManager =
        task.project?.managerId === effectiveSubtaskAssigneeId ||
        task.project?.createdById === effectiveSubtaskAssigneeId;
      if (!isMember && !isProjectAdminOrManager) {
        throw new BadRequestException('Nhân sự được giao Task con không thuộc thành viên của dự án này.');
      }
    }

    const estimatedDays =
      body.estimatedDays && Number(body.estimatedDays) > 0 ? Math.max(1, Math.floor(Number(body.estimatedDays))) : 1;
    let parsedSubtaskStartDate: Date | null = null;
    let parsedSubtaskDueDate: Date | null = null;

    if (body.startDate) {
      parsedSubtaskStartDate = new Date(body.startDate);
      // Tự động mở rộng ngày bắt đầu của Task cha nếu Subtask bắt đầu sớm hơn
      if (task.startDate && parsedSubtaskStartDate.getTime() < new Date(task.startDate).getTime()) {
        await this.prisma.task.update({
          where: { id: taskId },
          data: { startDate: parsedSubtaskStartDate },
        });
      }
    }

    if (body.dueDate) {
      parsedSubtaskDueDate = new Date(body.dueDate);
    } else if (parsedSubtaskStartDate) {
      const calcDue = new Date(parsedSubtaskStartDate);
      calcDue.setDate(calcDue.getDate() + estimatedDays);
      parsedSubtaskDueDate = calcDue;
    }

    const nextOrder = task.subtasks.length;
    await this.prisma.subtask.create({
      data: {
        taskId,
        title: body.title.trim(),
        assigneeId: effectiveSubtaskAssigneeId,
        startDate: parsedSubtaskStartDate || undefined,
        estimatedDays,
        dueDate: parsedSubtaskDueDate || undefined,
        isUrgent: Boolean(body.isUrgent),
        order: nextOrder,
        isDone: false,
      },
    });

    // 🔔 [LC-81] THÔNG BÁO TỰ ĐỘNG GỬI ĐẾN NGƯỜI NHẬN KHI BẬT VIỆC CON KHẨN CẤP (URGENT)
    if (body.isUrgent) {
      try {
        const assigneeUser = effectiveSubtaskAssigneeId
          ? await this.prisma.user.findUnique({ where: { id: effectiveSubtaskAssigneeId } })
          : null;
        await this.prisma.comment.create({
          data: {
            taskId,
            userId: user?.id || task.createdById,
            content: `🔥 [THÔNG BÁO KHẨN CẤP] Việc con "${body.title.trim()}" đã được gắn cờ KHẨN CẤP (URGENT). ${assigneeUser ? `Người phụ trách: @${assigneeUser.fullName}` : 'Task con chưa phân công'} cần ưu tiên xử lý ngay!`,
          },
        });
      } catch {
        // Fallback
      }
    }

    return this.recalculateTaskProgress(taskId, task.projectId);
  }

  async updateSubtask(
    subtaskId: string,
    body: {
      isDone?: boolean;
      title?: string;
      assigneeId?: string;
      startDate?: string;
      estimatedDays?: number;
      dueDate?: string;
      isUrgent?: boolean;
    },
    user?: AuthUserPayload
  ) {
    const subtask = await this.prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: {
        task: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                managerId: true,
                createdById: true,
                isCompleted: true,
              },
            },
            assignee: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    if (!subtask || subtask.task.isDeleted) {
      throw new NotFoundException('Task con không tồn tại hoặc Task cha đã bị xóa vào thùng rác');
    }

    // 🔒 [LC-159] KHÓA SỬA TASK CON KHI TASK ĐÃ LƯU TRỮ (ARCHIVED)
    if (subtask.task.isArchived) {
      throw new BadRequestException('Task này đã được lưu trữ (Archived). Không thể cập nhật Task con!');
    }

    // 🔒 [LC-79] KHÓA SỬA TASK CON KHI DỰ ÁN ĐÃ HOÀN THÀNH / NGHIỆM THU
    if (subtask.task.project?.isCompleted) {
      throw new BadRequestException('Dự án này đã hoàn thành/nghiệm thu và đã đóng. Không thể cập nhật Task con!');
    }

    // 🔒 [LC-44] KHÓA TOÀN DIỆN CHỈNH SỬA TASK CON ĐÃ HOÀN THÀNH
    if (subtask.isDone) {
      if (
        body.isDone !== undefined ||
        body.title !== undefined ||
        body.dueDate !== undefined ||
        body.startDate !== undefined ||
        body.estimatedDays !== undefined ||
        body.assigneeId !== undefined
      ) {
        throw new BadRequestException(
          'Task con này đã hoàn thành và được xác nhận. Chỉ Quản lý mới có quyền mở lại (REOPEN) trước khi chỉnh sửa nội dung.'
        );
      }
    }

    // 🔒 [LC-26] KIỂM TRA RÀNG BUỘC THÀNH VIÊN DỰ ÁN KHI SỬA NGƯỜI NHẬN TASK CON
    if (body.assigneeId) {
      const isMember = await this.prisma.projectMember.findFirst({
        where: { projectId: subtask.task.projectId, userId: body.assigneeId },
      });
      const isProjectAdminOrManager =
        subtask.task.project?.managerId === body.assigneeId || subtask.task.project?.createdById === body.assigneeId;
      if (!isMember && !isProjectAdminOrManager) {
        throw new BadRequestException('Nhân sự được giao Task con không thuộc thành viên của dự án này.');
      }
    }

    // 🔒 [LC-47] KIỂM TRA RÀNG BUỘC HẠN CHÓT TASK CON THEO TASK CHA KHI CẬP NHẬT
    if (body.dueDate) {
      const parsedSubtaskDueDate = new Date(body.dueDate);
      if (subtask.task.dueDate && parsedSubtaskDueDate.getTime() > new Date(subtask.task.dueDate).getTime()) {
        throw new BadRequestException('Hạn chót của Task con không thể vượt quá hạn chót tổng của Task cha!');
      }
      if (subtask.task.startDate && parsedSubtaskDueDate.getTime() < new Date(subtask.task.startDate).getTime()) {
        throw new BadRequestException('Hạn chót của Task con không thể trước ngày bắt đầu của Task cha!');
      }
    }

    const isAdminOrManager = Boolean(
      user &&
      (user.role === 'ADMIN' ||
        user.role === 'MANAGER' ||
        user.globalRole === 'ADMIN' ||
        user.globalRole === 'MANAGER' ||
        subtask.task.project.managerId === user.id ||
        subtask.task.project.createdById === user.id ||
        subtask.task.createdById === user.id)
    );

    // 🔒 KHÓA KHI TASK ĐANG TẠM DỪNG HOẶC BỊ NGHẼN (PAUSED / BLOCKED)
    if (body.isDone !== undefined && (subtask.task.status === 'PAUSED' || subtask.task.status === 'BLOCKED')) {
      throw new BadRequestException(
        `Task này đang ở trạng thái ${subtask.task.status === 'PAUSED' ? 'Tạm Dừng' : 'Bị Nghẽn'}, không thể nộp duyệt Task con.`
      );
    }

    // 🔒 QUY TẮC NGHIÊM NGẶT: Task phải có người nhận làm mới được thực hiện
    const effectiveAssigneeId = subtask.assigneeId || subtask.task.assigneeId;
    if (!effectiveAssigneeId && body.isDone !== undefined) {
      throw new BadRequestException(
        'Task này chưa được chỉ định người làm. Vui lòng phân công nhân sự trước khi thực hiện.'
      );
    }

    // 🔒 ƯU TIÊN PHÂN QUYỀN: Nếu subtask có assignee riêng thì CHỈ người đó được tick, nếu không thì Task Assignee được tick
    const isWorkerDoingTask = Boolean(user && effectiveAssigneeId === user.id);

    if (body.isDone !== undefined) {
      if (!isWorkerDoingTask && !isAdminOrManager) {
        throw new ForbiddenException('Chỉ người trực tiếp thực hiện Task mới có quyền đánh dấu hoàn thành Task con.');
      }
    }

    const isCreator = Boolean(user && subtask.task.createdById === user.id);
    if (user && !isAdminOrManager && !isWorkerDoingTask && !isCreator) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa Task con này');
    }

    const updateData: any = {};
    if (body.isUrgent !== undefined) {
      if (subtask.isDone) {
        throw new BadRequestException('Không thể thay đổi mức độ khẩn cấp của Task con đã hoàn thành.');
      }
      updateData.isUrgent = Boolean(body.isUrgent);

      // 🔔 [LC-81] THÔNG BÁO TỰ ĐỘNG GỬI ĐẾN NGƯỜI NHẬN KHI BẬT VIỆC CON KHẨN CẤP
      if (body.isUrgent === true && !subtask.isUrgent) {
        try {
          const targetAssigneeId = body.assigneeId || subtask.assigneeId;
          const assigneeUser = targetAssigneeId
            ? await this.prisma.user.findUnique({ where: { id: targetAssigneeId } })
            : null;
          await this.prisma.comment.create({
            data: {
              taskId: subtask.taskId,
              userId: user?.id || subtask.task.createdById,
              content: `🔥 [THÔNG BÁO KHẨN CẤP] Việc con "${subtask.title}" đã được chuyển sang chế độ KHẨN CẤP (URGENT). ${assigneeUser ? `Người phụ trách: @${assigneeUser.fullName}` : 'Task con'} cần ưu tiên xử lý ngay!`,
            },
          });
        } catch {
          // Fallback
        }
      }
    }
    if (body.title !== undefined) updateData.title = body.title.trim();
    if (body.assigneeId !== undefined) updateData.assigneeId = body.assigneeId || null;
    if (body.startDate !== undefined) updateData.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.dueDate !== undefined) updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;

    if (body.estimatedDays !== undefined) {
      if (!isAdminOrManager) {
        throw new ForbiddenException(
          'Chỉ Quản lý hoặc Người tạo Task mới có quyền thay đổi thời gian ước lượng của Task con.'
        );
      }
      updateData.estimatedDays = Math.max(1, Math.round(Number(body.estimatedDays)));
    }

    if (body.isDone !== undefined) {
      if (body.isDone === true) {
        if (isAdminOrManager) {
          // 👑 [LC-82] Admin / Manager có toàn quyền hoàn thành trực tiếp Task con của mình hoặc của bất kỳ ai
          updateData.isDone = true;
          updateData.approvalStatus = 'APPROVED';
          updateData.rejectionReason = null;

          await this.prisma.taskRequest.updateMany({
            where: {
              taskId: subtask.taskId,
              type: 'SUBTASK_APPROVAL',
              note: { contains: subtaskId },
              status: 'PENDING',
            },
            data: {
              status: 'ACCEPTED',
              responseNote: `Được Quản lý/Admin ${user?.fullName || ''} phê duyệt hoàn thành trực tiếp.`,
            },
          });
        } else {
          // 🛡️ Nhân viên làm task -> Chuyển sang PENDING để Quản lý duyệt
          updateData.isDone = false;
          updateData.approvalStatus = 'PENDING';
          updateData.rejectionReason = null;

          const receiverId =
            subtask.task.project.managerId || subtask.task.project.createdById || subtask.task.createdById;
          if (receiverId && user) {
            await this.prisma.taskRequest.create({
              data: {
                taskId: subtask.taskId,
                senderId: user.id,
                receiverId,
                type: 'SUBTASK_APPROVAL',
                status: 'PENDING',
                note: `[Xác thực hoàn thành] ${subtask.title} (SubtaskId: ${subtaskId})`,
              },
            });

            this.socketGateway.broadcastToProject(subtask.task.projectId, 'task:approval-requested', {
              subtaskId,
              taskId: subtask.taskId,
              subtaskTitle: subtask.title,
              senderName: user.fullName || 'Nhân viên',
              taskTitle: subtask.task.title,
            });
          }
        }
      } else {
        // Hủy đánh dấu hoàn thành
        updateData.isDone = false;
        updateData.approvalStatus = 'NONE';
      }
    }

    await this.prisma.subtask.update({
      where: { id: subtaskId },
      data: updateData,
    });

    return this.recalculateTaskProgress(subtask.taskId, subtask.task.projectId);
  }

  // 🔍 Quản Lý Phê Duyệt / Từ Chối / Mở Lại Xác Thực Hoàn Thành Việc Con
  async reviewSubtask(
    subtaskId: string,
    body: { action: 'APPROVE' | 'REJECT' | 'REOPEN'; reason?: string },
    user: AuthUserPayload
  ) {
    const subtask = await this.prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: {
        task: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                managerId: true,
                createdById: true,
              },
            },
            assignee: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });
    if (!subtask) {
      throw new NotFoundException('Công việc con không tồn tại');
    }

    const isAdminOrManager = Boolean(
      user &&
      (user.role === 'ADMIN' ||
        user.role === 'MANAGER' ||
        user.globalRole === 'ADMIN' ||
        user.globalRole === 'MANAGER' ||
        subtask.task.project.managerId === user.id ||
        subtask.task.project.createdById === user.id ||
        subtask.task.createdById === user.id)
    );

    if (!isAdminOrManager) {
      throw new ForbiddenException('Chỉ Quản lý hoặc Người tạo Task mới có quyền duyệt/mở lại Task con này');
    }

    const updateData: any = {};
    if (body.action === 'APPROVE') {
      updateData.isDone = true;
      updateData.approvalStatus = 'APPROVED';
      updateData.rejectionReason = null;
    } else if (body.action === 'REOPEN') {
      // ↩️ Quản lý mở lại Task con đã duyệt nhầm để nhân sự sửa lại
      updateData.isDone = false;
      updateData.approvalStatus = 'NONE';
      updateData.rejectionReason = body.reason?.trim() || 'Quản lý đã mở lại Task con để kiểm tra lại.';
    } else {
      updateData.isDone = false;
      updateData.approvalStatus = 'REJECTED';
      updateData.rejectionReason = body.reason?.trim() || 'Chưa đạt yêu cầu, vui lòng kiểm tra và làm lại.';
    }

    await this.prisma.subtask.update({
      where: { id: subtaskId },
      data: updateData,
    });

    // Cập nhật các TaskRequest liên quan
    await this.prisma.taskRequest.updateMany({
      where: {
        taskId: subtask.taskId,
        type: 'SUBTASK_APPROVAL',
        note: { contains: subtaskId },
        status: 'PENDING',
      },
      data: {
        status: body.action === 'APPROVE' ? 'ACCEPTED' : 'REJECTED',
        responseNote: body.action === 'APPROVE' ? 'Đã phê duyệt hoàn thành' : body.reason,
      },
    });

    // 🔒 [LC-52] NẾU QUẢN LÝ MỞ LẠI HOẶC TỪ CHỐI TASK CON TRÊN TASK ĐÃ DONE -> TỰ ĐỘNG CHUYỂN TASK VỀ IN_PROGRESS
    if ((body.action === 'REOPEN' || body.action === 'REJECT') && subtask.task.status === 'DONE') {
      await this.prisma.task.update({
        where: { id: subtask.taskId },
        data: {
          status: 'IN_PROGRESS',
          completedAt: null,
        },
      });
    }

    const mapped = await this.recalculateTaskProgress(subtask.taskId, subtask.task.projectId);

    // Gửi thông báo realtime qua Socket
    this.socketGateway.broadcastToProject(subtask.task.projectId, 'task:subtask-reviewed', {
      subtaskId,
      taskId: subtask.taskId,
      action: body.action,
      reason: body.reason,
      reviewerName: user.fullName || 'Quản lý',
      subtaskTitle: subtask.title,
    });

    return mapped;
  }

  // 🗑️ [LC-51] Xóa Task con (Khóa không cho nhân viên xóa việc con đã duyệt hoàn thành)
  async deleteSubtask(subtaskId: string, user?: AuthUserPayload) {
    const subtask = await this.prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: {
        task: {
          include: {
            project: { select: { managerId: true, createdById: true, isCompleted: true } },
          },
        },
      },
    });
    if (!subtask || subtask.task.isDeleted) {
      throw new NotFoundException('Task con không tồn tại hoặc Task cha đã bị xóa vào thùng rác');
    }

    // 🔒 [LC-159] KHÓA XÓA TASK CON KHI TASK ĐÃ LƯU TRỮ HOẶC DỰ ÁN ĐÃ ĐÓNG
    if (subtask.task.isArchived) {
      throw new BadRequestException('Task này đã được lưu trữ (Archived). Không thể xóa Task con!');
    }
    if (subtask.task.project?.isCompleted) {
      throw new BadRequestException('Dự án này đã hoàn thành/nghiệm thu và đã đóng. Không thể xóa Task con!');
    }

    const isAdminOrManager = Boolean(
      user &&
      (user.role === 'ADMIN' ||
        user.role === 'MANAGER' ||
        user.globalRole === 'ADMIN' ||
        user.globalRole === 'MANAGER' ||
        subtask.task.project?.managerId === user.id ||
        subtask.task.project?.createdById === user.id ||
        subtask.task.createdById === user.id)
    );

    // 🔒 [LC-51] KHÓA XÓA TASK CON ĐÃ HOÀN THÀNH NGHIỆM THU
    if (subtask.isDone && !isAdminOrManager) {
      throw new ForbiddenException('Task con này đã hoàn thành và được phê duyệt. Chỉ Quản lý mới có quyền xóa!');
    }

    // 🔒 PHÂN QUYỀN: Admin, Manager, Người tạo Task (Creator) hoặc Người được giao Task (Assignee) có quyền xóa việc con
    if (user) {
      const isAssignee = subtask.task.assigneeId === user.id;
      const isCreator = subtask.task.createdById === user.id;
      if (!isAdminOrManager && !isAssignee && !isCreator) {
        throw new ForbiddenException('Bạn không có quyền xóa Task con này');
      }
    }

    // 🔒 HỦY YÊU CẦU DUYỆT ĐANG TREO ĐỂ TRÁNH ORPHANED REQUESTS
    await this.prisma.taskRequest.updateMany({
      where: {
        taskId: subtask.taskId,
        type: 'SUBTASK_APPROVAL',
        note: { contains: subtaskId },
        status: 'PENDING',
      },
      data: {
        status: 'CANCELLED',
        responseNote: 'Task con đã bị xóa khỏi hệ thống.',
      },
    });

    await this.prisma.subtask.delete({
      where: { id: subtaskId },
    });

    return this.recalculateTaskProgress(subtask.taskId, subtask.task.projectId);
  }

  private async recalculateTaskProgress(taskId: string, projectId: string) {
    const subtasks = await this.prisma.subtask.findMany({
      where: { taskId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        assignee: { select: { id: true, fullName: true, avatar: true } },
      },
    });

    let newProgress = 0;
    let totalEstimatedDays = 0;
    let completedEstimatedDays = 0;
    if (subtasks.length > 0) {
      for (const st of subtasks) {
        const days = Number(st.estimatedDays || 1);
        totalEstimatedDays += days;
        if (st.isDone) {
          completedEstimatedDays += days;
        }
      }
      newProgress = totalEstimatedDays > 0 ? Math.round((completedEstimatedDays / totalEstimatedDays) * 100) : 0;
    }

    const currentTask = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        startDate: true,
        createdAt: true,
        status: true,
        completedAt: true,
      },
    });

    const updateTaskData: any = { progress: newProgress };

    // 🚨 [LC-81] TỰ ĐỘNG CHUYỂN URGENT KHI CÓ SUBTASK CHƯA XONG BẬT URGENT, TẮT URGENT KHI ĐÃ HOÀN THÀNH HẾT
    const hasUnfinishedUrgentSubtasks = subtasks.some((st) => st.isUrgent && !st.isDone);
    updateTaskData.priority = hasUnfinishedUrgentSubtasks ? 'URGENT' : 'NORMAL';

    // 🎯 TỰ ĐỘNG CHUYỂN SANG DONE KHI ĐẠT 100% VÀ TỰ ĐỘNG CHUYỂN VỀ IN_PROGRESS KHI MỞ LẠI
    if (newProgress === 100 && currentTask && currentTask.status !== 'DONE') {
      updateTaskData.status = 'DONE';
      updateTaskData.completedAt = currentTask.completedAt || new Date();
    } else if (newProgress < 100 && currentTask && currentTask.status === 'DONE') {
      updateTaskData.status = 'IN_PROGRESS';
      updateTaskData.completedAt = null;
    }

    if (currentTask && subtasks.length > 0) {
      let maxSubtaskDueDate: Date | null = null;
      let hasCustomSubtaskDate = false;

      for (const st of subtasks) {
        if (st.dueDate) {
          hasCustomSubtaskDate = true;
          const d = new Date(st.dueDate);
          if (!maxSubtaskDueDate || d.getTime() > maxSubtaskDueDate.getTime()) {
            maxSubtaskDueDate = d;
          }
        } else if (st.startDate) {
          hasCustomSubtaskDate = true;
          const d = new Date(st.startDate);
          d.setDate(d.getDate() + Number(st.estimatedDays || 1));
          if (!maxSubtaskDueDate || d.getTime() > maxSubtaskDueDate.getTime()) {
            maxSubtaskDueDate = d;
          }
        }
      }

      if (hasCustomSubtaskDate && maxSubtaskDueDate) {
        updateTaskData.dueDate = maxSubtaskDueDate;
      } else if (totalEstimatedDays > 0) {
        const baseDate = currentTask.startDate ? new Date(currentTask.startDate) : new Date(currentTask.createdAt);
        baseDate.setHours(0, 0, 0, 0);
        const calculatedDueDate = new Date(baseDate);
        calculatedDueDate.setDate(calculatedDueDate.getDate() + totalEstimatedDays);
        updateTaskData.dueDate = calculatedDueDate;
      }
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: updateTaskData,
      include: {
        project: { select: { id: true, name: true } },
        assignee: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatar: true,
            profession: true,
          },
        },
        createdBy: {
          select: { id: true, fullName: true, email: true, avatar: true },
        },
        tags: { include: { tag: true } },
        subtasks: {
          include: {
            assignee: { select: { id: true, fullName: true, avatar: true } },
          },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        },
        attachments: true,
        _count: { select: { comments: true } },
      },
    });

    const mapped = this.mapTaskResponse(updatedTask);
    this.socketGateway.broadcastToProject(projectId, 'task:updated', mapped);

    return mapped;
  }
  async updateStatus(id: string, updateTaskStatusDto: UpdateTaskStatusDto, user?: AuthUserPayload) {
    const updatedTask = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id },
        include: {
          subtasks: true,
          project: { select: { id: true, managerId: true, createdById: true } },
        },
      });
      if (!task || task.isDeleted) {
        throw new NotFoundException('Task không tồn tại hoặc đã bị xóa vào thùng rác');
      }

      if (task.isArchived) {
        throw new BadRequestException('Task đã được lưu trữ vào kho (Archived). Không thể thay đổi trạng thái!');
      }

      const activeUserId: string | null = user?.id || user?.sub || null;

      if (user) {
        const typedUser = user as Record<string, any>;
        const userRole = typedUser.role as string;
        const userGlobalRole = typedUser.globalRole as string;
        const userId = activeUserId;

        const isAdminOrManager = Boolean(
          userRole === 'ADMIN' ||
          userRole === 'MANAGER' ||
          userGlobalRole === 'ADMIN' ||
          userGlobalRole === 'MANAGER' ||
          (userId && task.project?.managerId === userId) ||
          (userId && task.project?.createdById === userId) ||
          (userId && task.createdById === userId)
        );
        const isSubtaskAssignee = Boolean(
          task.subtasks && task.subtasks.some((st) => st.assigneeId === userId)
        );
        const isAssignee = task.assigneeId
          ? task.assigneeId === userId || isSubtaskAssignee
          : task.createdById === userId || isSubtaskAssignee;

        if (!isAdminOrManager && !isAssignee) {
          throw new ForbiddenException(
            'Task này thuộc về người được giao, bạn không có quyền chỉnh sửa trạng thái của người khác'
          );
        }
      }

      if (task.status === 'IN_REVIEW' && updateTaskStatusDto.status !== 'IN_REVIEW') {
        const pendingTransfer = await tx.taskRequest.findFirst({
          where: { taskId: id, type: 'TRANSFER', status: 'PENDING' },
        });
        if (pendingTransfer) {
          throw new BadRequestException(
            'Task đang trong trạng thái Chờ Duyệt Bàn Giao (IN_REVIEW). Vui lòng duyệt hoặc hủy yêu cầu bàn giao trước khi chuyển đổi trạng thái.'
          );
        }
      }

      if (updateTaskStatusDto.status === 'DONE') {
        const hasUnfinishedSubtasks =
          task.subtasks && task.subtasks.length > 0 && task.subtasks.some((st) => !st.isDone);
        if (hasUnfinishedSubtasks) {
          throw new BadRequestException(
            'Không thể chuyển Task sang Hoàn Thành khi vẫn còn Task con chưa được Quản lý phê duyệt hoàn tất.'
          );
        }
      }

      const oldStatus: string = task.status;
      const newStatus: string = updateTaskStatusDto.status;
      const dtoDesc = (updateTaskStatusDto as unknown as { description?: string }).description;

      const result = await tx.task.update({
        where: { id },
        data: {
          status: newStatus as TaskStatus,
          stageId: updateTaskStatusDto.stageId !== undefined ? updateTaskStatusDto.stageId : undefined,
          description: dtoDesc !== undefined ? String(dtoDesc) : undefined,
          progress:
            updateTaskStatusDto.progress !== undefined
              ? updateTaskStatusDto.progress
              : newStatus === 'DONE'
                ? 100
                : task.progress,
          completedAt: newStatus === 'DONE' ? task.completedAt || new Date() : null,
        },
        include: {
          project: { select: { id: true, name: true } },
          assignee: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatar: true,
              profession: true,
            },
          },
          tags: { include: { tag: true } },
          attachments: true,
        },
      });

      if (oldStatus !== newStatus) {
        const loggerId = activeUserId || task.assigneeId || task.createdById;

        if (loggerId) {
          try {
            await tx.taskHistory.create({
              data: {
                taskId: String(id),
                userId: String(loggerId),
                action: 'MOVED_TASK',
                field: 'status',
                oldValue: String(oldStatus),
                newValue: String(newStatus),
              },
            });
          } catch {
            // Safe fallback to prevent task update transaction failure
          }
        }
      }

      return result;
    });

    const result = {
      id: updatedTask.id,
      title: updatedTask.title,
      description: updatedTask.description || undefined,
      status: updatedTask.status,
      priority: updatedTask.priority,
      progress: updatedTask.progress,
      dueDate: updatedTask.dueDate ? updatedTask.dueDate.toISOString().slice(0, 10) : undefined,
      projectName: updatedTask.project?.name || 'Solaris Core',
      assigneeId: updatedTask.assigneeId || undefined,
      assignee: updatedTask.assignee
        ? {
            id: updatedTask.assignee.id,
            fullName: updatedTask.assignee.fullName,
            avatar: updatedTask.assignee.avatar || undefined,
            profession: updatedTask.assignee.profession,
          }
        : undefined,
      tags: updatedTask.tags.map((tt) => ({
        id: tt.tag.id,
        name: tt.tag.name,
        color: 'amber',
      })),
      commentsCount: 0,
      stageId: updatedTask.stageId || undefined,
      attachments: updatedTask.attachments
        ? updatedTask.attachments.map((att) => ({
            id: att.id,
            name: att.name,
            url: att.url,
            type: att.type,
            size: att.size || undefined,
            createdAt: att.createdAt ? att.createdAt.toISOString() : undefined,
          }))
        : [],
    };

    if (updatedTask.projectId) {
      this.socketGateway.broadcastToProject(updatedTask.projectId, 'task:updated', result);
    }

    // 🔄 [LC-120] TỰ ĐỘNG SINH TASK LẶP LẠI (RECURRING TASK GENERATION) KHI TASK HOÀN THÀNH
    const rawRecurrence = (updatedTask as any).recurrenceRule;
    if (updatedTask.status === 'DONE' && rawRecurrence) {
      try {
        const rule = String(rawRecurrence).toUpperCase();
        let daysToAdd = 1;
        if (rule === 'WEEKLY') daysToAdd = 7;
        else if (rule === 'MONTHLY') daysToAdd = 30;

        const nextStartDate = new Date();
        const nextDueDate = updatedTask.dueDate ? new Date(updatedTask.dueDate) : new Date();
        nextDueDate.setDate(nextDueDate.getDate() + daysToAdd);

        const nextTask = await this.prisma.task.create({
          data: {
            title: updatedTask.title,
            description: updatedTask.description,
            status: 'TODO',
            priority: updatedTask.priority,
            progress: 0,
            startDate: nextStartDate,
            dueDate: nextDueDate,
            recurrenceRule: rawRecurrence,
            projectId: updatedTask.projectId,
            assigneeId: updatedTask.assigneeId,
            createdById: (updatedTask as any).createdById || updatedTask.assigneeId || 'SYSTEM',
          },
          include: {
            project: { select: { id: true, name: true } },
            assignee: { select: { id: true, fullName: true, email: true, avatar: true, profession: true } },
            tags: { include: { tag: true } },
            subtasks: true,
            attachments: true,
          },
        });

        const mappedNext = this.mapTaskResponse(nextTask);
        this.socketGateway.broadcastToProject(updatedTask.projectId, 'task:created', mappedNext);
      } catch {
        // Fallback guard
      }
    }

    return result;
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { QueryUserDto } from './dto/query-user.dto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { LockUserDto } from './dto/lock-user.dto';
import * as bcrypt from 'bcrypt';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
@Injectable()
export class UserService {
  // create(createUserDto: CreateUserDto) {
  //   return 'This action adds a new user';
  // }
  constructor(private readonly prisma: PrismaService) {}
  async findAll(query: QueryUserDto) {
    const { search, departmentId, role, profession, statusSignal, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      //     if (departmentId) {
      //   where.departmentId = departmentId;
      // }
      ...(departmentId && { departmentId }),
      ...(role && { role }),
      ...(profession && { profession }),
      ...(statusSignal && { statusSignal }),
      ...(search && {
        OR: [
          // contains : Tìm kiếm dạng chuỗi con (tương đương LIKE '%search%' trong SQL).
          // insensitive : Không phân biệt chữ HOA hay chữ thường
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { jobTitle: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          fullName: true,
          email: true,
          avatar: true,
          role: true,
          profession: true,
          jobTitle: true,
          phone: true,
          isActive: true,
          statusSignal: true,
          customStatus: true,
          department: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        avatar: true,
        coverImage: true,
        role: true,
        profession: true,
        jobTitle: true,
        phone: true,
        bio: true,
        isActive: true,
        statusSignal: true,
        customStatus: true,
        department: true,
        memberships: {
          select: {
            project: {
              select: {
                id: true,
                name: true,
                isCompleted: true,
              },
            },
            joinedAt: true,
          },
        },
        assignedTasks: {
          where: {
            isDeleted: false,
            isArchived: false,
          },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            progress: true,
          },
        },
        createdAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }
    return user;
  }

  async getUserWorkload(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        avatar: true,
        jobTitle: true,
        profession: true,
      },
    });
    if (!user) {
      throw new NotFoundException('không tìm thấy người dùng');
    }
    const now = new Date();
    const baseWhere = {
      assigneeId: userId,
      isDeleted: false,
      isArchived: false,
    };
    const [todoCount, inProgressCount, reviewCount, doneCount, overdueCount, urgentCount] = await Promise.all([
      this.prisma.task.count({
        where: { ...baseWhere, status: 'TODO' },
      }),
      this.prisma.task.count({
        where: { ...baseWhere, status: 'IN_PROGRESS' },
      }),
      this.prisma.task.count({
        where: { ...baseWhere, status: 'IN_REVIEW' },
      }),
      this.prisma.task.count({
        where: { ...baseWhere, status: 'DONE' },
      }),
      this.prisma.task.count({
        where: {
          ...baseWhere,
          dueDate: { lt: now },
          status: { not: 'DONE' },
        },
      }),
      this.prisma.task.count({
        where: {
          ...baseWhere,
          priority: 'URGENT',
          status: { not: 'DONE' },
        },
      }),
    ]);
    return {
      user,
      workload: {
        totalActiveTasks: todoCount + inProgressCount + reviewCount,
        todo: todoCount,
        inProgress: inProgressCount,
        review: reviewCount,
        done: doneCount,
        overdue: overdueCount,
        urgent: urgentCount,
      },
    };
  }

  async updateRoleAndDepartment(id: string, dto: UpdateUserRoleDto, currentAdminId?: string) {
    // 🔒 [LC-116] CHẶN QUẢN TRỊ VIÊN TỰ HẠ CẤP VAI TRÒ ADMIN CỦA CHÍNH MÌNH (SELF-DEMOTION LOCK)
    if (currentAdminId && id === currentAdminId && dto.role && dto.role !== 'ADMIN') {
      throw new BadRequestException('Bạn không thể tự hạ cấp vai trò Quản trị viên (Admin) của chính mình!');
    }

    await this.findOne(id);

    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: {
          id: dto.departmentId,
        },
      });

      if (!department) {
        throw new NotFoundException('Phòng ban không tồn tại');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.role && { role: dto.role }),
        ...(dto.profession && { profession: dto.profession }),
        ...(dto.jobTitle !== undefined && { jobTitle: dto.jobTitle }),
        ...(dto.departmentId !== undefined && {
          departmentId: dto.departmentId,
        }),
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        profession: true,
        jobTitle: true,
        department: true,
      },
    });
  }
  async lockOrUnlockUser(id: string, dto: LockUserDto, currentAdminId: string) {
    if (id === currentAdminId && !dto.isActive) {
      throw new BadRequestException('Bạn không thể tự khóa tài khoản của chính mình!');
    }
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: {
        isActive: dto.isActive,
        ...(!dto.isActive && { refreshToken: null }),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        isActive: true,
      },
    });
  }
  async resetPassword(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    const DEFAULT_PASSWORD = 'USER123456';
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, saltRounds);
    await this.prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
        isFirstLogin: true,
        refreshToken: null,
      },
    });
    return {
      success: true,
      message: `Đặt lại mật khẩu cho "${user.fullName}"`,
      defaultPassword: DEFAULT_PASSWORD,
    };
  }
  async remove(id: string, currentAdminId: string) {
    if (id === currentAdminId) {
      throw new BadRequestException('Bạn không thể xóa tài khoản của chính mình!');
    }
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
      include: {
        managedProjects: {
          where: {
            isDeleted: false,
          },
        },
        ownedProjects: {
          where: {
            isDeleted: false,
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    if (user.isActive) {
      throw new BadRequestException(
        'Tài khoản đang Hoạt Động (Active). Bạn phải khóa tài khoản trước khi thực hiện xóa vĩnh viễn!'
      );
    }
    if (user.managedProjects.length > 0 || user.ownedProjects.length > 0) {
      throw new BadRequestException(
        'Không thể xóa nhân sự này do đang là Chủ sở hữu/Quản lý của dự án đang chạy. Hãy chuyển giao quyền quản lý trước!'
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: {
          assigneeId: id,
        },
        data: { assigneeId: null },
      });
      await tx.subtask.updateMany({
        where: { assigneeId: id },
        data: { assigneeId: null },
      });
      await tx.user.delete({
        where: {
          id,
        },
      });
      return {
        success: true,
        message: `Đã xóa vĩnh viễn tài khoản "${user.fullName}" (${user.email}) khỏi hệ thống.`,
      };
    });
  }
  async updateUser(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.jobTitle !== undefined && { jobTitle: dto.jobTitle }),
        ...(dto.profession !== undefined && { profession: dto.profession }),
        ...(dto.avatar !== undefined && { avatar: dto.avatar }),
        ...(dto.coverImage !== undefined && { coverImage: dto.coverImage }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        bio: true,
        jobTitle: true,
        profession: true,
        avatar: true,
        isActive: true,
        coverImage: true,
        department: {
          select: { id: true, name: true },
        },
        updatedAt: true,
      },
    });
  }
  async createUser(dto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });
    if (existingUser) {
      throw new ConflictException('Email này đã được sử dụng trong hệ thống');
    }
    if (dto.departmentId) {
      const dept = await this.prisma.department.findUnique({
        where: {
          id: dto.departmentId,
        },
      });
      if (!dept) {
        throw new NotFoundException('Department không tồn tại ');
      }
    }
    const plainPassword = dto.password || 'NhanVien123';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const newUser = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        password: hashedPassword,
        role: dto.role || 'EMPLOYEE',
        profession: dto.profession || 'DEV',
        jobTitle: dto.jobTitle,
        phone: dto.phone,
        departmentId: dto.departmentId,
        isFirstLogin: true,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        profession: true,
        jobTitle: true,
        department: { select: { id: true, name: true } },
      },
    });
    return {
      success: true,
      message: `Đã tạo tài khoản cho nhân sự "${newUser.fullName}" thành công!`,
      data: newUser,
      defaultPassword: plainPassword,
    };
  }
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    if (!user.isFirstLogin) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Vui lòng nhập mật khẩu hiện tại');
      }
      const isPasswordVaild = await bcrypt.compare(dto.currentPassword, user.password || '');
      if (!isPasswordVaild) {
        throw new BadRequestException('Mật khẩu hiện tại không chính xác');
      }
    }
    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        password: hashedPassword,
        isFirstLogin: false,
        refreshToken: null,
      },
    });
    return {
      success: true,
      message: 'Đổi mật khẩu thành công!',
    };
  }
}

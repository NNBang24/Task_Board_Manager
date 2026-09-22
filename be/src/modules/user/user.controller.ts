import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { UserService } from './user.service';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { LockUserDto } from './dto/lock-user.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email?: string;
    role?: string;
  };
}
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll(@Query() query: QueryUserDto) {
    return this.userService.findAll(query);
  }

  @Get(':id/workload')
  getUserWorkload(@Param('id') id: string) {
    return this.userService.getUserWorkload(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @UseGuards(RolesGuard)
  @Patch(':id/role')
  @Roles('ADMIN')
  updateRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto, @Req() req: AuthenticatedRequest) {
    return this.userService.updateRoleAndDepartment(id, dto, req.user?.id);
  }

  @UseGuards(RolesGuard)
  @Patch(':id/lock')
  @Roles('ADMIN')
  lockUser(@Param('id') id: string, @Body() dto: LockUserDto, @Req() req: AuthenticatedRequest) {
    const adminId = req.user.id;
    return this.userService.lockOrUnlockUser(id, dto, adminId);
  }

  @UseGuards(RolesGuard)
  @Post(':id/reset-password')
  @Roles('ADMIN')
  resetPassword(@Param('id') id: string) {
    return this.userService.resetPassword(id);
  }

  @UseGuards(RolesGuard)
  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const adminId = req.user.id;
    return this.userService.remove(id, adminId);
  }

  @UseGuards(RolesGuard)
  @Post()
  @Roles('ADMIN')
  createUser(@Body() dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }

  @Patch('change-password')
  changePassword(@Req() req: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    const userId = req.user.id;
    return this.userService.changePassword(userId, dto);
  }
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: AuthenticatedRequest) {
    const currentUserId = req.user.id;
    const currentRole = req.user.role;
    if (currentRole !== 'ADMIN' && currentUserId !== id) {
      throw new ForbiddenException('Bạn chỉ có quyền cập nhật thông tin tài khoản của chính mình!');
    }
    return this.userService.updateUser(id, dto);
  }
}

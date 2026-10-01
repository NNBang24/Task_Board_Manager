import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ScheduleService } from './schedule.service';
import {
  CreateLeaveRequestDto,
  ReviewLeaveRequestDto,
  AssignScheduleDto,
} from './dto/schedule.dto';
import { AuthenticatedRequest } from '../../common/interfaces/auth-user.interface';

@Controller('schedule')
@UseGuards(JwtAuthGuard)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get('work-schedules')
  async getWorkSchedules(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userId') userId?: string,
  ) {
    return this.scheduleService.getWorkSchedules(startDate, endDate, userId);
  }

  @Post('assign')
  async assignSchedule(
    @Request() req: AuthenticatedRequest,
    @Body() dto: AssignScheduleDto,
  ) {
    return this.scheduleService.assignSchedule(dto, req.user);
  }

  @Get('leave-requests')
  async getLeaveRequests(
    @Query('userId') userId?: string,
    @Query('status') status?: string,
  ) {
    return this.scheduleService.getLeaveRequests(userId, status);
  }

  @Post('leave-requests')
  async createLeaveRequest(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.scheduleService.createLeaveRequest(dto, req.user);
  }

  @Patch('leave-requests/:id/review')
  async reviewLeaveRequest(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: ReviewLeaveRequestDto,
  ) {
    return this.scheduleService.reviewLeaveRequest(id, dto, req.user);
  }

  @Patch('leave-requests/:id/cancel')
  async cancelLeaveRequest(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scheduleService.cancelLeaveRequest(id, req.user);
  }
}

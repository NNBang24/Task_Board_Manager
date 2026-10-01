import { IsEnum, IsNotEmpty, IsOptional, IsString, IsArray, ArrayNotEmpty } from 'class-validator';
import { LeaveType, LeaveStatus, WorkType, WorkShift } from '@prisma/client';

export class CreateLeaveRequestDto {
  @IsEnum(LeaveType)
  @IsNotEmpty()
  type: LeaveType;

  @IsString()
  @IsNotEmpty()
  startDate: string;

  @IsString()
  @IsNotEmpty()
  endDate: string;

  @IsEnum(WorkShift)
  @IsOptional()
  shift?: WorkShift;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  handoverPlan?: string;
}

export class ReviewLeaveRequestDto {
  @IsEnum(LeaveStatus)
  @IsNotEmpty()
  status: LeaveStatus;

  @IsString()
  @IsOptional()
  responseNote?: string;

  @IsString()
  @IsOptional()
  approvedStartDate?: string;

  @IsString()
  @IsOptional()
  approvedEndDate?: string;

  @IsEnum(WorkShift)
  @IsOptional()
  modifiedShift?: WorkShift;
}

export class AssignScheduleDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsEnum(WorkType)
  @IsNotEmpty()
  workType: WorkType;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  dates: string[];

  @IsEnum(WorkShift)
  @IsOptional()
  shift?: WorkShift;

  @IsString()
  @IsOptional()
  note?: string;
}

import {
  Controller,
  Post,
  Body,
  Req,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AiVoiceService,
  VoiceTaskCreationResponse,
  VoiceParseResponse,
} from './ai-voice.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TaskPriority } from '@prisma/client';

export class CreateVoiceTaskDto {
  @IsString({ message: 'Khau lenh giong noi phai la chuoi ky tu' })
  @IsNotEmpty({ message: 'Vui long cung cap khau lenh giong noi' })
  rawAudioText!: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class ParseVoiceTextDto {
  @IsString({ message: 'Khau lenh giong noi phai la chuoi ky tu' })
  @IsNotEmpty({ message: 'Vui long cung cap khau lenh giong noi' })
  rawAudioText!: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}

export class ConfirmVoiceTaskDto {
  @IsString({ message: 'Tieu de cong viec phai la chuoi ky tu' })
  @IsNotEmpty({ message: 'Vui long nhap tieu de cong viec' })
  title!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsString({ message: 'Du an la bat buoc' })
  @IsNotEmpty({ message: 'Vui long chon du an' })
  projectId!: string;

  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @IsOptional()
  @IsString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  rawVoice?: string | null;
}

export interface AuthenticatedUserPayload {
  id: string;
  email?: string;
  role?: string;
}

export interface MulterUploadedFile {
  fieldname?: string;
  originalname?: string;
  encoding?: string;
  mimetype?: string;
  size?: number;
  buffer: Buffer;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUserPayload;
}

@Controller('tasks/voice')
@UseGuards(JwtAuthGuard)
export class AiVoiceController {
  constructor(private readonly aiVoiceService: AiVoiceService) {}

  /**
   * Phan tich file am thanh de hien thi form xac nhan truoc khi tao task.
   */
  @Post('parse-audio')
  @UseInterceptors(FileInterceptor('audio'))
  async parseVoiceAudio(
    @Req() req: RequestWithUser,
    @UploadedFile() file?: MulterUploadedFile,
    @Query('projectId') currentProjectId?: string
  ): Promise<VoiceParseResponse> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Vui lòng tải lên file âm thanh (audio).');
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }

    const filename = file.originalname || 'voice-command.webm';
    return await this.aiVoiceService.parseVoiceAudio(userId, file.buffer, filename, currentProjectId);
  }

  /**
   * Phan tich van ban khau lenh de hien thi form xac nhan truoc khi tao task.
   */
  @Post('parse-text')
  async parseVoiceText(
    @Req() req: RequestWithUser,
    @Body() body: ParseVoiceTextDto
  ): Promise<VoiceParseResponse> {
    const rawAudioText = body?.rawAudioText?.trim();
    if (!rawAudioText) {
      throw new BadRequestException('Vui lòng cung cấp khẩu lệnh giọng nói (rawAudioText).');
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }

    return await this.aiVoiceService.parseVoiceText(userId, rawAudioText, body.projectId);
  }

  /**
   * Nguoi dung xac nhan cac truong thong tin da duoc xem truoc de tao task chinh thuc.
   */
  @Post('confirm')
  async confirmVoiceTask(
    @Req() req: RequestWithUser,
    @Body() body: ConfirmVoiceTaskDto
  ): Promise<VoiceTaskCreationResponse> {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }

    return await this.aiVoiceService.confirmCreateTask(userId, body);
  }

  /**
   * Boc bang am thanh va tu dong tao task bang Groq Whisper va LLaMA 3.3.
   */
  @Post('audio')
  @UseInterceptors(FileInterceptor('audio'))
  async createFromVoiceAudio(
    @Req() req: RequestWithUser,
    @UploadedFile() file?: MulterUploadedFile
  ): Promise<VoiceTaskCreationResponse> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Vui lòng tải lên file âm thanh (audio).');
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }

    const filename = file.originalname || 'voice-command.webm';
    return await this.aiVoiceService.processVoiceAudioTaskCreation(userId, file.buffer, filename);
  }

  /**
   * Boc bang giong noi sang van ban thuan tuy.
   */
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  async transcribeAudio(
    @UploadedFile() file?: MulterUploadedFile
  ): Promise<{ text: string }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Vui lòng tải lên file âm thanh (audio).');
    }

    const filename = file.originalname || 'voice-command.webm';
    const text = await this.aiVoiceService.transcribeAudioFile(file.buffer, filename);
    return { text };
  }

  /**
   * Nhan dien va tao task tu van ban tho.
   */
  @Post('create')
  async createFromVoice(
    @Req() req: RequestWithUser,
    @Body() body: CreateVoiceTaskDto
  ): Promise<VoiceTaskCreationResponse> {
    const rawAudioText = body?.rawAudioText?.trim();
    if (!rawAudioText) {
      throw new BadRequestException('Vui lòng cung cấp khẩu lệnh giọng nói (rawAudioText).');
    }

    const userId = req.user?.id || body.userId;
    if (!userId) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }

    return await this.aiVoiceService.processVoiceTaskCreation(userId, rawAudioText);
  }
}

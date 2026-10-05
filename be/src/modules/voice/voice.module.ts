import { Module } from '@nestjs/common';
import { AiVoiceController } from './voice.controller';
import { AiVoiceService } from './ai-voice.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [AiVoiceController],
  providers: [AiVoiceService, PrismaService],
  exports: [AiVoiceService],
})
export class AiVoiceModule {}

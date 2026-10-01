import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProjectModule } from './modules/project/project.module';
import { TaskModule } from './modules/task/task.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SocketModule } from './modules/socket/socket.module';
import { NotificationModule } from './modules/notification/notification.module';
import { TrashModule } from './modules/trash/trash.module';

import { APP_INTERCEPTOR } from '@nestjs/core';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { UserModule } from './modules/user/user.module';
import { DepartmentModule } from './modules/department/department.module';
import { ChatModule } from './modules/chat/chat.module';
import { ScheduleModule } from './modules/schedule/schedule.module';

@Module({
  imports: [
    PrismaModule,
    UserModule,
    AuthModule,
    ProjectModule,
    TaskModule,
    ProfileModule,
    SocketModule,
    NotificationModule,
    TrashModule,
    DepartmentModule,
    ChatModule,
    ScheduleModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class AppModule {}

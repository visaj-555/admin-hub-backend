import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthModule } from 'src/modules/auth/auth.module';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [
    AuthModule,
    NotificationModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}

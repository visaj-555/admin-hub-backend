import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { FirebaseService } from './firebase.service';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, FirebaseService],
  exports: [NotificationService, FirebaseService],
})
export class NotificationModule {}

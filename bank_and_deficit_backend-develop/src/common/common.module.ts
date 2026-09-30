import { Global, Module } from '@nestjs/common';
import { MailService } from './mail/mail.service';
import { PrismaService } from './database/prisma.service';
import { S3Service } from './aws/s3.service';
import { SQSService } from './aws/sqs.service';
import { SqsService } from './aws/sqs-client.service';
import { EventBridgeSchedulerService } from './aws/eventbridge-scheduler.service';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { StreakAchieveService } from './cron/streak-achieve';
import { ReminderScheduleService } from './reminder/reminder-schedule.service';

@Global()
@Module({
  imports: [NotificationModule],
  providers: [
    MailService,
    PrismaService,
    S3Service,
    SQSService,
    SqsService,
    EventBridgeSchedulerService,
    ReminderScheduleService,
    StreakAchieveService,
  ],
  exports: [
    MailService,
    PrismaService,
    S3Service,
    SQSService,
    SqsService,
    EventBridgeSchedulerService,
    ReminderScheduleService,
    StreakAchieveService,
  ],
})
export class CommonModule {}

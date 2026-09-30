import { Module, forwardRef } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { CommonModule } from 'src/common/common.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [CommonModule, forwardRef(() => NotificationModule)],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}

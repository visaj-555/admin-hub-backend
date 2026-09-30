import { Module } from '@nestjs/common';
import { PostService } from './post.service';
import { PostController } from './post.controller';
import { CommonModule } from 'src/common/common.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [CommonModule, NotificationModule],
  controllers: [PostController],
  providers: [PostService],
})
export class PostModule {}

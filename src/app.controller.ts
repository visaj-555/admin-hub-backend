import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { ResponseMessage } from './common/decorators/response-message.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  @ResponseMessage('AdminHub API is running')
  getHello(): string {
    return this.appService.getHello();
  }
}

import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { I18nService, I18nLang } from 'nestjs-i18n';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly i18n: I18nService,
  ) {}

  @Get()
  getHello(@I18nLang() lang: string): string {
    // Currently we do not use the language in this simple example,
    // but keeping the parameter allows future i18n-aware responses.
    void lang;
    return this.appService.getHello();
  }
}

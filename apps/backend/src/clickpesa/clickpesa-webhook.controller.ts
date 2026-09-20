import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ClickPesaWebhookService } from './clickpesa-webhook.service.js';

// Preserve the previous URL as an alias, with exactly the same verification.
@Controller(['webhooks/clickpesa', 'clickpesa/webhook'])
export class ClickPesaWebhookController {
  constructor(private readonly webhooks: ClickPesaWebhookService) {}

  @Post()
  @HttpCode(200)
  handleWebhook(@Body() payload: unknown) {
    return this.webhooks.handle(payload);
  }
}

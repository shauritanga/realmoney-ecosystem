import { ClickPesaWebhookController } from './clickpesa-webhook.controller.js';
import { ClickPesaWebhookService } from './clickpesa-webhook.service.js';
import { Module } from '@nestjs/common';
import { ClickPesaClient } from './clickpesa.client.js';
import { ClickPesaService } from './clickpesa.service.js';
import { ClickPesaController } from './clickpesa.controller.js';

@Module({ providers: [ClickPesaClient, ClickPesaService, ClickPesaWebhookService], controllers: [ClickPesaController, ClickPesaWebhookController], exports: [ClickPesaService] })
export class ClickPesaModule {}

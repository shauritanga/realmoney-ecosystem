import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ClickPesaService, type PaymentActor } from './clickpesa.service.js';

@Controller('clickpesa')
export class ClickPesaController {
  constructor(private readonly payments: ClickPesaService) {}

  @Get('payments/:orderId')
  @UseGuards(JwtAuthGuard)
  status(@Param('orderId') orderId: string, @Request() req: { user: PaymentActor }) {
    return this.payments.reconcile(orderId, req.user);
  }

}

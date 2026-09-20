import { Controller, Post, Body, HttpCode, HttpStatus, Headers, Logger } from '@nestjs/common';
import { SelcomService } from './selcom.service.js';

@Controller('selcom')
export class SelcomController {
  private readonly logger = new Logger(SelcomController.name);

  constructor(private readonly selcomService: SelcomService) {}

  /**
   * Primary webhook receiver from Selcom
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() body: any,
    @Headers('digest') digest?: string,
    @Headers('timestamp') timestamp?: string,
  ) {
    this.logger.log(`Received Selcom webhook callback with digest: ${digest}`);
    const result = await this.selcomService.processWebhook(body);
    return {
      result: 'SUCCESS',
      status: '200',
      message: result.message,
    };
  }

  /**
   * Local Simulation Helper: Allows frontend/mobile developers to simulate
   * a borrower typing their PIN and completing the USSD push payment!
   */
  @Post('simulate-callback')
  @HttpCode(HttpStatus.OK)
  async simulateCallback(@Body() body: { orderId: string; amount: number; success?: boolean }) {
    return this.selcomService.processWebhook({
      order_id: body.orderId,
      transid: `SIM-SEL-${Date.now()}`,
      result: body.success !== false ? 'SUCCESS' : 'FAIL',
      amount: body.amount,
      message: body.success !== false ? 'Customer entered PIN' : 'Insufficient funds / Cancelled',
    });
  }
}

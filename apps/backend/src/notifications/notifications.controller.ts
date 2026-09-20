import { Controller, Post, Delete, Body, BadRequestException, UseGuards, Request } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { UserRole } from '../database/enums.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('token')
  @Roles(UserRole.BORROWER)
  registerToken(@Request() req: any, @Body() body: { token?: unknown; platform?: unknown }) {
    if (typeof body?.token !== 'string' || body.token.length === 0 || body.token.length > 512) {
      throw new BadRequestException('A valid device token is required');
    }
    const platform = body.platform === 'ios' ? 'ios' : 'android';
    return this.notifications.registerToken(req.user.id, body.token, platform);
  }

  @Delete('token')
  @Roles(UserRole.BORROWER)
  async removeToken(@Body() body: { token?: unknown }) {
    if (typeof body?.token !== 'string' || body.token.length === 0) {
      throw new BadRequestException('A valid device token is required');
    }
    await this.notifications.removeToken(body.token);
    return { removed: true };
  }
}

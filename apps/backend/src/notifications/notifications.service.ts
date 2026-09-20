import * as fs from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DeviceToken } from './device-token.entity.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private admin: any = null;
  private firebaseAttempted = false;

  constructor(
    @InjectRepository(DeviceToken)
    private readonly tokens: Repository<DeviceToken>,
  ) {}

  async registerToken(borrowerId: string, token: string, platform = 'android') {
    const existing = await this.tokens.findOne({ where: { token } });
    if (existing) {
      existing.borrowerId = borrowerId;
      existing.platform = platform;
      return this.tokens.save(existing);
    }
    return this.tokens.save(this.tokens.create({ borrowerId, token, platform }));
  }

  async removeToken(token: string) {
    await this.tokens.delete({ token });
  }

  private async messaging() {
    if (this.admin) return this.admin;
    if (this.firebaseAttempted) return null;
    this.firebaseAttempted = true;
    let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const filePath =
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!raw && filePath && fs.existsSync(filePath)) {
      try {
        raw = fs.readFileSync(filePath, 'utf8');
      } catch (err) {
        this.logger.warn(
          `Push notifications disabled: failed to read ${filePath} (${(err as Error).message})`,
        );
        return null;
      }
    }
    if (!raw) {
      this.logger.warn(
        'Neither FIREBASE_SERVICE_ACCOUNT_JSON nor FIREBASE_SERVICE_ACCOUNT_PATH is set; push notifications are disabled.',
      );
      return null;
    }
    try {
      const mod: any = await import('firebase-admin');
      const admin = mod?.default ?? mod;
      const serviceAccount = JSON.parse(raw);
      if ((admin.apps?.length ?? 0) === 0) {
        admin.initializeApp({ credential: admin.cert(serviceAccount) });
      }
      this.admin = admin;
      return admin;
    } catch (err) {
      this.logger.warn(`Push notifications disabled: ${(err as Error).message}`);
      return null;
    }
  }

  async sendToBorrower(
    borrowerId: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ) {
    const list = await this.tokens.find({ where: { borrowerId } });
    if (list.length === 0) return { sent: 0 };
    const fb = await this.messaging();
    if (!fb) return { sent: 0 };
    try {
      const res = await fb.messaging().sendEachForMulticast({
        tokens: list.map((t) => t.token),
        notification: { title, body },
        data,
        android: { priority: 'high' },
      });
      const dead = res.responses
        .map((r: any, i: number) => (r.success ? null : list[i].token))
        .filter((t: string | null): t is string => t !== null);
      if (dead.length > 0) {
        await this.tokens.delete({ token: In(dead) });
      }
      return { sent: res.successCount as number };
    } catch (err) {
      this.logger.warn(`Push send failed: ${(err as Error).message}`);
      return { sent: 0 };
    }
  }
}

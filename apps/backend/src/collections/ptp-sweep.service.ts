import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { PtpStatus } from '../database/enums.js';
import { PromiseToPay } from '../database/entities/promise-to-pay.entity.js';
import { PTP_GRACE_HOURS, ptpTrackingStart, resolveOverdue } from './ptp-status.js';

/**
 * Persists BROKEN promise-to-pay records.
 *
 * Deliberately not a cron. This repo has no scheduler, no queue, no worker process
 * and no Redis usage in code, and `@nestjs/schedule` would add a deployment concern
 * (plus duplicate work across replicas) for a state change that is a pure function of
 * a timestamp. Instead the sweep runs at the top of the endpoints that are about to
 * read promise state, is idempotent, and costs one indexed scan.
 *
 * Display paths still call `resolvePtpStatus`, so a promise that lapsed seconds ago
 * reads correctly even before the next sweep persists it. The sweep exists to produce
 * the durable `resolvedAt` that a trustworthy kept-rate needs.
 */
@Injectable()
export class PtpSweepService {
  private readonly logger = new Logger(PtpSweepService.name);
  private readonly trackingStart: Date;

  constructor(
    @InjectRepository(PromiseToPay)
    private readonly ptps: Repository<PromiseToPay>,
    config: ConfigService,
  ) {
    this.trackingStart = ptpTrackingStart(config.get<string>('PTP_TRACKING_START'));
  }

  /**
   * Marks every lapsed pending promise as BROKEN, dating the break at its deadline
   * rather than at this moment. Safe to call on every request and safe to run
   * concurrently: it only moves PENDING rows forward, so a second run finds nothing.
   */
  async sweep(now: Date = new Date()): Promise<number> {
    const deadlineCutoff = new Date(now.getTime() - PTP_GRACE_HOURS * 3_600_000);

    const lapsed = await this.ptps.find({
      where: { status: PtpStatus.PENDING, promisedDate: LessThan(deadlineCutoff) },
      select: { id: true, status: true, promisedDate: true },
    });
    if (!lapsed.length) return 0;

    let resolved = 0;
    for (const ptp of lapsed) {
      const resolution = resolveOverdue(ptp, now, this.trackingStart);
      if (!resolution) continue;
      // The status guard makes this a no-op if another request swept it first.
      const result = await this.ptps.update(
        { id: ptp.id, status: PtpStatus.PENDING },
        {
          status: resolution.status,
          resolvedAt: resolution.resolvedAt,
          resolvedReason: resolution.resolvedReason,
        },
      );
      resolved += result.affected ?? 0;
    }

    if (resolved) this.logger.log(`Marked ${resolved} promise(s) to pay as BROKEN.`);
    return resolved;
  }
}

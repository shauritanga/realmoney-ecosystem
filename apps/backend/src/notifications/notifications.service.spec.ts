import { describe, it, expect, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';

function setup(tokens: any[] = []) {
  const store = [...tokens];
  const repo = {
    findOne: vi.fn(({ where }: any) => Promise.resolve(store.find((t) => t.token === where.token) ?? null)),
    create: vi.fn((data: any) => ({ ...data })),
    save: vi.fn((data: any) => {
      const i = store.findIndex((t) => t.token === data.token);
      if (i >= 0) store[i] = data;
      else store.push(data);
      return Promise.resolve(data);
    }),
    find: vi.fn(() => Promise.resolve(store)),
    delete: vi.fn(() => Promise.resolve()),
  };
  return { service: new NotificationsService(repo as any), repo, store };
}

describe('push notification opt-outs', () => {
  it('registers a new device token', async () => {
    const { service, store } = setup();
    await service.registerToken('borrower', 'fcm-token-1');
    expect(store).toHaveLength(1);
    expect(store[0]).toMatchObject({ borrowerId: 'borrower', token: 'fcm-token-1' });
  });

  it('moves a token to the latest borrower instead of duplicating it', async () => {
    const { service, store } = setup([{ borrowerId: 'old', token: 'fcm-token-1', platform: 'android' }]);
    await service.registerToken('new', 'fcm-token-1');
    expect(store).toHaveLength(1);
    expect(store[0].borrowerId).toBe('new');
  });

  it('skips sending when the borrower has no tokens without touching Firebase', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const { service, repo } = setup();
    await expect(service.sendToBorrower('borrower', 'Hi', 'Hello')).resolves.toEqual({ sent: 0 });
    expect(repo.find).toHaveBeenCalled();
  });

  it('skips sending when Firebase is not configured', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const { service } = setup([{ borrowerId: 'borrower', token: 'fcm-token-1', platform: 'android' }]);
    await expect(service.sendToBorrower('borrower', 'Hi', 'Hello')).resolves.toEqual({ sent: 0 });
  });
});

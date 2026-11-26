import type { PushSummaryPayload } from '@inventaire/shared';
import type { AppConfig } from '../config/env.schema';

export const PUSH_SENDER = Symbol('PUSH_SENDER');

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** `gone`: the browser dropped the subscription (404 or 410), it must be deleted. */
export type PushResult = 'sent' | 'gone';

/** What the daily summary needs from Web Push; tests inject a fake. */
export interface PushSender {
  /** False without VAPID keys: nothing is sent and the option is hidden. */
  readonly enabled: boolean;
  readonly publicKey: string | null;
  send(target: PushTarget, payload: PushSummaryPayload): Promise<PushResult>;
}

/** Real sender, on the `web-push` library, signed with the VAPID keys of the configuration. */
export class WebPushSender implements PushSender {
  readonly enabled: boolean;
  readonly publicKey: string | null;

  constructor(private readonly config: AppConfig) {
    this.publicKey = config.VAPID_PUBLIC_KEY ?? null;
    this.enabled = Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);
    if (!this.enabled) this.publicKey = null;
  }

  async send(target: PushTarget, payload: PushSummaryPayload): Promise<PushResult> {
    const module = await import('web-push');
    // CommonJS package: its API sits on `default` under native ES modules, on the namespace else.
    const lib: typeof import('web-push') =
      (module as unknown as { default?: typeof import('web-push') }).default ?? module;
    try {
      await lib.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        {
          TTL: 12 * 60 * 60,
          vapidDetails: {
            subject: this.config.VAPID_SUBJECT,
            publicKey: this.config.VAPID_PUBLIC_KEY!,
            privateKey: this.config.VAPID_PRIVATE_KEY!,
          },
        },
      );
      return 'sent';
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone';
      throw error;
    }
  }
}

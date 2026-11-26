import type { PushPublicKeyDto, PushSubscriptionInput } from '@inventaire/shared';
import { apiFetch } from './api';
import { detectPlatform } from './platform';

export type PushSupport =
  /** The browser can receive pushes. */
  | { supported: true }
  /** iOS only delivers pushes to an installed web app (home screen). */
  | { supported: false; reason: 'ios-not-installed' }
  | { supported: false; reason: 'unsupported' };

const isStandalone = (): boolean =>
  (typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Whether this device can receive notifications, and why not when it cannot. */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, reason: 'unsupported' };
  }
  const capable =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (detectPlatform() === 'ios' && !isStandalone()) {
    return { supported: false, reason: 'ios-not-installed' };
  }
  return capable ? { supported: true } : { supported: false, reason: 'unsupported' };
}

export const fetchPushPublicKey = (): Promise<PushPublicKeyDto> =>
  apiFetch<PushPublicKeyDto>('/push/public-key');

/** The base64url key of the server as the bytes `subscribe` wants. */
export function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The push subscription of this device, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export type SubscribeResult = 'subscribed' | 'denied' | 'no-key';

/** Asks the permission, subscribes this device and tells the server. */
export async function subscribeThisDevice(): Promise<SubscribeResult> {
  const { publicKey } = await fetchPushPublicKey();
  if (!publicKey) return 'no-key';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(publicKey),
    }));
  const { endpoint, keys } = subscription.toJSON() as Partial<PushSubscriptionInput>;
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error('Abonnement incomplet');
  await apiFetch('/push/subscriptions', {
    method: 'POST',
    body: {
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
    } satisfies PushSubscriptionInput,
  });
  return 'subscribed';
}

/** Tells the server, then drops the subscription of this device. Nothing to do without one. */
export async function unsubscribeThisDevice(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  try {
    await apiFetch('/push/subscriptions', {
      method: 'DELETE',
      body: { endpoint: subscription.endpoint },
    });
  } finally {
    await subscription.unsubscribe().catch(() => false);
  }
}

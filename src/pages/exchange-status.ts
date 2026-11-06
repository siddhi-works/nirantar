import type { ExchangeConsent } from '@/domain/exchange';

export const STATUS: Record<ExchangeConsent['status'], { label: string; tone: string }> = {
  requested: { label: 'Waiting for the patient', tone: 'chip--cerulean' },
  granted: { label: 'Allowed', tone: 'chip--sage' },
  denied: { label: 'Declined', tone: 'chip--dashed' },
  revoked: { label: 'Withdrawn', tone: 'chip--dashed' },
  expired: { label: 'Expired', tone: 'chip--dashed' },
};

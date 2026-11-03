export interface ExchangeConsent {
  id: string;
  abha: string;
  hiuName: string;
  hiuHfr: string;
  purpose: string;
  validityDays: number;
  status: 'requested' | 'granted' | 'denied' | 'revoked' | 'expired';
  requestedAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
  fetched: boolean;
  receivedId: string | null;
}

export interface ReceivedRecordItem {
  id: string;
  fromName: string;
  receivedAt: string;
  patientName: string;
  observations: number;
  annotations: number;
}

export interface ReceivedRecordView {
  id: string;
  fromName: string;
  receivedAt: string;
  bundle: { resourceType: string; entry: { resource: Record<string, unknown> & { resourceType: string } }[] };
  consentStatus: ExchangeConsent['status'];
  annotations: { id: number; text: string; by: string; at: string }[];
}

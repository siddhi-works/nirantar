/**
 * Sarvam chat, written from Sarvam's published reference (POST /v1/chat/completions, model sarvam-105b-conversations).
 * Not yet run with a live key; everything specific to Sarvam is in CONTRACT. Whatever it returns is only a draft:
 * server/assistant/answer.ts checks it against the record before a patient sees any of it.
 */
import { ChatUnavailable, type ChatMessage, type ChatProvider } from './provider';

export const CONTRACT = {
  base: 'https://api.sarvam.ai',
  keyHeader: 'api-subscription-key',
  path: '/v1/chat/completions',
  body: (messages: ChatMessage[]) => ({ model: 'sarvam-105b-conversations', messages, temperature: 0.1, reasoning_effort: 'none', max_tokens: 400 }),
  text: (b: Record<string, unknown>) => {
    const c = (b.choices as { message?: { content?: unknown } }[] | undefined)?.[0]?.message?.content;
    return typeof c === 'string' ? c.replace(/<think>[\s\S]*?<\/think>/g, '').trim() : '';
  },
};

export class SarvamChat implements ChatProvider {
  readonly name = 'sarvam';
  constructor(private o: { key: string; fetchImpl?: typeof fetch; timeoutMs?: number }) {}
  async complete(messages: ChatMessage[]): Promise<string> {
    const f = this.o.fetchImpl ?? fetch;
    const res = await f(CONTRACT.base + CONTRACT.path, {
      method: 'POST', headers: { 'content-type': 'application/json', [CONTRACT.keyHeader]: this.o.key },
      body: JSON.stringify(CONTRACT.body(messages)), signal: AbortSignal.timeout(this.o.timeoutMs ?? 25_000),
    }).catch(() => { throw new ChatUnavailable('The assistant did not answer in time.'); });
    if (!res.ok) throw new ChatUnavailable(`The assistant service answered ${res.status}.`);
    const out = CONTRACT.text((await res.json()) as Record<string, unknown>);
    if (!out) throw new ChatUnavailable('The assistant returned no answer.');
    return out;
  }
}

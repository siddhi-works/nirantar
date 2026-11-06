export type ChatMessage = { role: 'system' | 'user'; content: string };
export interface ChatProvider { readonly name: string; complete(messages: ChatMessage[]): Promise<string> }
export class ChatUnavailable extends Error {}

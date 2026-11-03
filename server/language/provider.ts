export type Lang = 'hi-IN' | 'en-IN';
export const SUPPORTED: Lang[] = ['hi-IN'];

export interface Translator { readonly name: string; translate(texts: string[], target: Lang): Promise<string[]> }
export interface Speaker { readonly name: string; speak(text: string, lang: Lang): Promise<{ audio: string; mime: string }> }
export class LanguageUnavailable extends Error {}

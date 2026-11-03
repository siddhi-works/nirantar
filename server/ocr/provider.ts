/** Reads text out of a scanned page or a photo. Only used when a document has no text layer of its own. */
export interface OcrProvider {
  readonly name: string;
  recognise(bytes: Uint8Array, mime: string): Promise<string[]>; // one string per page
}

export class OcrUnavailable extends Error {}

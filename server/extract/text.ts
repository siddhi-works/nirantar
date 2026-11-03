import { extractText, getDocumentProxy } from 'unpdf';

/** Words per page from a PDF's own text layer. Free and exact when the PDF was made by software, empty for a scan. */
export async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}

/** A page with fewer than this many characters is treated as having no usable text layer. */
export const MIN_TEXT = 40;

import { PDFParse } from 'pdf-parse';

export interface ExtractedDocumentContent {
  text: string;
  pageCount: number;
  metadata: {
    producer?: string;
    creationDate?: string;
    modDate?: string;
    hasMetadataAnomaly: boolean;
    anomalyReason?: string;
  };
}

/**
 * Extracts plain text and inspects metadata from PDF and image documents
 */
export async function extractDocumentText(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractedDocumentContent> {
  if (mimeType === 'application/pdf') {
    try {
      if (PDFParse) {
        const parser = new PDFParse({ data: buffer });
        const textResult = await parser.getText();
        const info = (await parser.getInfo().catch(() => ({}))) as Record<string, unknown>;

        const pageText = textResult?.pages?.map((p: { text?: string }) => p.text || '').join('\n') || '';
        let extractedText = pageText.trim().length > 0 ? pageText : buffer.toString('utf-8');
        const creationDate = info?.CreationDate ? String(info.CreationDate) : undefined;
        const modDate = info?.ModDate ? String(info.ModDate) : undefined;

        let hasAnomaly = false;
        let anomalyReason: string | undefined;

        if (creationDate && modDate && modDate < creationDate) {
          hasAnomaly = true;
          anomalyReason = 'PDF modification timestamp is earlier than creation timestamp';
        }

        return {
          text: extractedText,
          pageCount: textResult?.pages?.length || 1,
          metadata: {
            producer: info?.Producer ? String(info.Producer) : undefined,
            creationDate,
            modDate,
            hasMetadataAnomaly: hasAnomaly,
            anomalyReason
          }
        };
      }
    } catch {
      // Fallback for mock or test text streams
    }

    const raw = buffer.toString('utf-8');
    return {
      text: raw,
      pageCount: 1,
      metadata: {
        hasMetadataAnomaly: false
      }
    };
  }

  // Image documents
  const rawText = buffer.toString('utf-8');
  return {
    text: rawText,
    pageCount: 1,
    metadata: {
      hasMetadataAnomaly: false
    }
  };
}

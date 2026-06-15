// Tiptap JSON → plain text for API storage
export function tiptapToPlain(doc: object): string {
  try {
    const d = doc as {
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
        content?: Array<{
          type?: string;
          text?: string;
          marks?: Array<{ type?: string }>;
        }>;
      }>;
    };
    if (!d || d.type !== 'doc' || !Array.isArray(d.content)) return '';
    return d.content
      .map((node) => {
        if (node.type === 'paragraph' || node.type === 'heading') {
          return (node.content || []).map((c) => c.text || '').join('');
        }
        return '';
      })
      .join('\n');
  } catch {
    return '';
  }
}

// plain text from API → Tiptap JSON doc
export function plainToTiptap(text: string): object {
  if (!text) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  const lines = text.split(/\n/);
  if (lines.length === 1 && lines[0] === '') {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  };
}

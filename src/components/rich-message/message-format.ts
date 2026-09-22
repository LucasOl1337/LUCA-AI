export type MessageBlock =
  | { kind: 'heading'; label: string; level: number }
  | { kind: 'bullet'; label?: string; body: string }
  | { kind: 'paragraph'; label?: string; body: string }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'code'; language?: string; body: string }
  | { kind: 'image'; alt: string; src: string };

export interface InlineTextPart {
  text: string;
  strong: boolean;
}

function stripOuterMarkdown(value: string): string {
  return value
    .replace(/^\s*\*\*(.+?)\*\*\s*$/g, '$1')
    .replace(/^\s*__(.+?)__\s*$/g, '$1')
    .trim();
}

function parseLabelledText(value: string): { label?: string; body: string } {
  const text = value.trim();
  const boldMatch = text.match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
  if (boldMatch) {
    return {
      label: stripOuterMarkdown(boldMatch[1]),
      body: boldMatch[2].trim(),
    };
  }

  const labelMatch = text.match(/^([^:]{2,48}):\s+(.+)$/);
  if (labelMatch) {
    return {
      label: stripOuterMarkdown(labelMatch[1]),
      body: labelMatch[2].trim(),
    };
  }

  return { body: text };
}

export function parseMessageBlocks(value: string): MessageBlock[] {
  const lines = String(value || '').replace(/\r/g, '').split('\n');
  const blocks: MessageBlock[] = [];
  const markdownCells = (line: string) => line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => stripOuterMarkdown(cell.trim()));
  const isTableDivider = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line || /^[-*_]{3,}$/.test(line)) {
      index += 1;
      continue;
    }

    const codeStart = line.match(/^```([\w-]+)?\s*$/);
    if (codeStart) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ kind: 'code', language: codeStart[1], body: code.join('\n') });
      index += 1;
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = markdownCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const row = lines[index].trim();
        if (!row || !row.includes('|')) break;
        rows.push(markdownCells(row));
        index += 1;
      }
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)$/i);
    if (image) {
      blocks.push({ kind: 'image', alt: image[1] || 'Imagem da entrega', src: image[2] });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({ kind: 'heading', label: stripOuterMarkdown(heading[2]), level: heading[1].length });
      index += 1;
      continue;
    }

    const bullet = line.match(/^(?:[-*]|•)\s+(.+)$/);
    const ordered = line.match(/^(\d+)[.)]\s+(.+)$/);
    const source = bullet ? bullet[1].trim() : ordered ? ordered[2].trim() : line;
    const labelled = parseLabelledText(source);
    const body = stripOuterMarkdown(labelled.body);

    if (bullet || ordered) {
      blocks.push({
        kind: 'bullet',
        label: ordered ? String(ordered[1]).padStart(2, '0') : labelled.label,
        body: body || labelled.label || source,
      });
      index += 1;
      continue;
    }

    if (labelled.label && !body) {
      blocks.push({ kind: 'heading', label: labelled.label, level: 3 });
    } else {
      blocks.push({ kind: 'paragraph', label: labelled.label, body: body || source });
    }
    index += 1;
  }

  return blocks.length ? blocks : [{ kind: 'paragraph', body: 'Sem conteúdo textual.' }];
}

export function inlineTextParts(value: string): InlineTextPart[] {
  const parts: InlineTextPart[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: value.slice(lastIndex, match.index), strong: false });
    }
    parts.push({ text: match[1], strong: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    parts.push({ text: value.slice(lastIndex), strong: false });
  }

  return parts.length ? parts : [{ text: value, strong: false }];
}

/**
 * Minimal RFC-4180 reader. Quoted fields are required, not optional: question
 * text and Arabic prose both contain commas. Shared with the admin importer so
 * the sample data and the client's real spreadsheets travel the same code path.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const cleaned = rows.filter((r) => r.some((c) => c.trim() !== ''));
  const header = cleaned.shift();
  if (!header) return [];
  return cleaned.map((r) =>
    Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

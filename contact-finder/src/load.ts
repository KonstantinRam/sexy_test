// Loads challenge/data/companies.csv into InputRow[].
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { InputRow } from './types.js';

const CSV_PATH = fileURLToPath(
  new URL('../../challenge/data/companies.csv', import.meta.url),
);

/** Minimal CSV line parser: handles quoted fields (commas inside) and "" escapes. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export function loadCompanies(path: string = CSV_PATH): InputRow[] {
  const lines = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  return lines.slice(1).map((line) => {
    const [company_name, mailing_address] = parseCsvLine(line);
    return { company_name, mailing_address };
  });
}

/**
 * Normalization for DEDUPE ONLY — never use this as a provider lookup key
 * (the mock fixtures are keyed by the raw CSV company_name).
 * Lowercase, trim, collapse whitespace, strip trailing legal suffixes.
 */
export function normalizeCompanyName(name: string): string {
  let n = name.toLowerCase().trim().replace(/\s+/g, ' ');
  n = n.replace(/[,.]?\s+(llc|inc|co|corp|ltd)\.?$/, '');
  return n;
}

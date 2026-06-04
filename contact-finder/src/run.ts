// Pipeline entry point: CSV -> providers -> score -> gate -> suppression ->
// output/results.csv + output/results.json + console summary.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCompanies } from './load.js';
import { getProviderResults, type ProviderResults } from './providers.js';
import { gate, score } from './score.js';
import { isSuppressed, type SuppressionEntry } from './suppress.js';
import type { OutputRow, ProviderName } from './types.js';

const SUPPRESSION_PATH = fileURLToPath(
  new URL('../suppression.json', import.meta.url),
);
const RESULTS_CSV = fileURLToPath(
  new URL('../output/results.csv', import.meta.url),
);
const RESULTS_JSON = fileURLToPath(
  new URL('../output/results.json', import.meta.url),
);

export function loadSuppressionList(
  path: string = SUPPRESSION_PATH,
): SuppressionEntry[] {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Provenance for a row: pipe-separated names and mock:// urls of every
 * provider that returned data. Empty ONLY when no provider had anything —
 * reviewed rows with partial evidence still list what was found.
 */
function provenance(results: ProviderResults): {
  source: string;
  source_urls: string;
} {
  const names: ProviderName[] = [];
  const urls: string[] = [];
  for (const name of ['registry', 'listing', 'enrichment'] as const) {
    const result = results[name];
    if (result.status === 'found') {
      names.push(name);
      urls.push(result.record.source_url);
    }
  }
  return { source: names.join('|'), source_urls: urls.join('|') };
}

/** Run the full pipeline over companies.csv; one OutputRow per input row. */
export function buildRows(
  suppressionList: SuppressionEntry[] = loadSuppressionList(),
): OutputRow[] {
  return loadCompanies().map((input) => {
    const results = getProviderResults(input.company_name);
    const scored = score(results);
    const draft: OutputRow = {
      company_name: input.company_name,
      ...gate(results, scored),
      confidence_score: scored.score,
      ...provenance(results),
    };
    // Suppression is the FINAL gate: it blanks the contact regardless of
    // score, but provenance is kept — the evidence existed, we chose not
    // to ship it.
    if (isSuppressed(draft, suppressionList)) {
      return {
        ...draft,
        contact_name: '',
        contact_role: '',
        contact_email_or_phone: '',
        needs_human_review: true,
        review_reason: 'suppressed',
      };
    }
    return draft;
  });
}

const CSV_COLUMNS = [
  'company_name',
  'contact_name',
  'contact_role',
  'contact_email_or_phone',
  'confidence_score',
  'source',
  'source_urls',
  'needs_human_review',
  'review_reason',
] as const;

function csvField(value: string | number | boolean): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: OutputRow[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((col) => csvField(row[col])).join(','));
  }
  return lines.join('\n') + '\n';
}

function main(): void {
  const rows = buildRows();

  mkdirSync(fileURLToPath(new URL('../output/', import.meta.url)), {
    recursive: true,
  });
  writeFileSync(RESULTS_CSV, toCsv(rows));
  writeFileSync(RESULTS_JSON, JSON.stringify(rows, null, 2) + '\n');

  const review = rows.filter((row) => row.needs_human_review);
  console.log(`shipped ${rows.length - review.length}, review ${review.length}`);
  const byReason = new Map<string, number>();
  for (const row of review) {
    byReason.set(row.review_reason, (byReason.get(row.review_reason) ?? 0) + 1);
  }
  for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason}: ${count}`);
  }
  console.log(`wrote ${RESULTS_CSV} and ${RESULTS_JSON}`);
}

// Only run when executed directly (npm run run) — not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

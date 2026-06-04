import { describe, expect, it } from 'vitest';
import { getProviderResults } from '../src/providers.js';
import { buildRows } from '../src/run.js';
import { score, SHIP_THRESHOLD } from '../src/score.js';

describe('suppression gate', () => {
  it('Ironclad scores at/above threshold yet exits suppressed with empty contact', () => {
    // Proves the gate outranks a passing score.
    const scored = score(getProviderResults('Ironclad Welding Shop'));
    expect(scored.score).toBeGreaterThanOrEqual(SHIP_THRESHOLD);

    const row = buildRows().find(
      (r) => r.company_name === 'Ironclad Welding Shop',
    )!;
    expect(row.needs_human_review).toBe(true);
    expect(row.review_reason).toBe('suppressed');
    expect(row.contact_name).toBe('');
    expect(row.contact_role).toBe('');
    expect(row.contact_email_or_phone).toBe('');
    // Suppression blanks the contact but keeps provenance — evidence existed.
    expect(row.source).not.toBe('');
    expect(row.source_urls).not.toBe('');
  });

  it('full run produces exactly 30 rows with 12 no_sources_found', () => {
    const rows = buildRows();
    expect(rows).toHaveLength(30);

    const noSources = rows.filter((r) => r.review_reason === 'no_sources_found');
    expect(noSources).toHaveLength(12);
    // Only rows with no sources at all have empty provenance.
    for (const row of rows) {
      expect(row.source === '').toBe(row.review_reason === 'no_sources_found');
    }
  });
});

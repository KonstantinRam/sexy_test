import { describe, expect, it } from 'vitest';
import { loadCompanies } from '../src/load.js';
import { getProviderResults } from '../src/providers.js';

describe('getProviderResults', () => {
  it('returns all three providers as found for Cedar Ridge Plumbing LLC', () => {
    const results = getProviderResults('Cedar Ridge Plumbing LLC');
    expect(results.registry.status).toBe('found');
    expect(results.listing.status).toBe('found');
    expect(results.enrichment.status).toBe('found');
  });

  it('returns listing found with null name preserved for Maple Leaf Bakery', () => {
    const results = getProviderResults('Maple Leaf Bakery');
    expect(results.listing).toEqual({
      status: 'found',
      record: {
        name: null,
        phone: '+1-802-555-0121',
        source_url: 'mock://listing/maple-leaf-bakery',
      },
    });
    expect(results.registry).toEqual({ status: 'absent' });
    expect(results.enrichment).toEqual({ status: 'absent' });
  });

  it('returns all three absent for Redwood Cabinetry', () => {
    const results = getProviderResults('Redwood Cabinetry');
    expect(results.registry).toEqual({ status: 'absent' });
    expect(results.listing).toEqual({ status: 'absent' });
    expect(results.enrichment).toEqual({ status: 'absent' });
  });
});

describe('loadCompanies', () => {
  it('returns exactly 30 rows with quoted addresses parsed intact', () => {
    const rows = loadCompanies();
    expect(rows).toHaveLength(30);
    expect(rows[0]).toEqual({
      company_name: 'Cedar Ridge Plumbing LLC',
      mailing_address: '4821 Maple Ave, Lincoln, NE 68504',
    });
  });
});

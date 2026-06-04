// Mock provider lookups backed by challenge/mocks/enrichment_responses.json.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  EnrichmentRecord,
  ListingRecord,
  ProviderResult,
  RegistryRecord,
} from './types.js';

interface MockEntry {
  registry?: RegistryRecord;
  listing?: ListingRecord;
  enrichment?: EnrichmentRecord;
}

const MOCK_PATH = fileURLToPath(
  new URL('../../challenge/mocks/enrichment_responses.json', import.meta.url),
);

// Loaded once at module init.
const responses: Record<string, MockEntry> = JSON.parse(
  readFileSync(MOCK_PATH, 'utf8'),
);

export interface ProviderResults {
  registry: ProviderResult<RegistryRecord>;
  listing: ProviderResult<ListingRecord>;
  enrichment: ProviderResult<EnrichmentRecord>;
}

/**
 * Look up all three providers for a company.
 *
 * IMPORTANT: the mock file is keyed by company_name EXACTLY as it appears in
 * the CSV — look up with the RAW name. Normalizing the key turns every fixture
 * into a miss.
 *
 * Missing top-level key or missing provider sub-key => 'absent'.
 * Present provider with null fields => 'found' with nulls preserved.
 */
export function getProviderResults(companyName: string): ProviderResults {
  const entry = responses[companyName];
  return {
    registry: entry?.registry
      ? { status: 'found', record: entry.registry }
      : { status: 'absent' },
    listing: entry?.listing
      ? { status: 'found', record: entry.listing }
      : { status: 'absent' },
    enrichment: entry?.enrichment
      ? { status: 'found', record: entry.enrichment }
      : { status: 'absent' },
  };
}

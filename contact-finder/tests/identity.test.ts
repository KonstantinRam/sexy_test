import { describe, expect, it } from 'vitest';
import {
  detectConflict,
  emailMatchesName,
  extractPeople,
  namesMatch,
} from '../src/identity.js';
import { getProviderResults } from '../src/providers.js';
import type { ProviderResult } from '../src/types.js';

function record<R>(result: ProviderResult<R>): R {
  if (result.status !== 'found') throw new Error('expected found');
  return result.record;
}

describe('extractPeople', () => {
  it('parses Lakeside listing "Jeff (manager)" into name + role', () => {
    const people = extractPeople(getProviderResults('Lakeside Auto Glass'));
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({
      name: 'Jeff',
      role: 'manager',
      provider: 'listing',
      source_url: 'mock://listing/lakeside-auto-glass',
    });
  });

  it('strips the honorific from Magnolia "Dr. Patel" but keeps a note', () => {
    const people = extractPeople(getProviderResults('Magnolia Family Dental'));
    expect(people).toHaveLength(1);
    expect(people[0].name).toBe('Patel');
    expect(people[0].honorific).toBe('Dr');
  });

  it('never produces a Person from enrichment-only results', () => {
    const people = extractPeople(getProviderResults('Riverside Print & Sign'));
    expect(people).toEqual([]);
  });
});

describe('namesMatch', () => {
  it('Ironclad: "Robert Kowalski" matches "Bob Kowalski"', () => {
    const results = getProviderResults('Ironclad Welding Shop');
    const registry = record(results.registry).name!;
    const listing = record(results.listing).name!;
    expect(namesMatch(registry, listing)).toBe(true);
  });

  it('Harbor Light: "Sean Murphy" matches "S. Murphy"', () => {
    const results = getProviderResults('Harbor Light Electric');
    const registry = record(results.registry).name!;
    const listing = record(results.listing).name!;
    expect(namesMatch(registry, listing)).toBe(true);
  });
});

describe('emailMatchesName', () => {
  it('Bayview: "karen@bayviewauto.com" matches "Karen Liu"', () => {
    const results = getProviderResults('Bayview Auto Repair');
    const email = record(results.enrichment).email!;
    const name = record(results.registry).name!;
    expect(emailMatchesName(email, name)).toBe(true);
  });

  it('Sunbelt: generic "office@" local-part never matches', () => {
    const results = getProviderResults('Sunbelt Roofing Co');
    const email = record(results.enrichment).email!;
    expect(emailMatchesName(email, 'Karen Liu')).toBe(false);
    expect(emailMatchesName(email, 'Office Sunbelt')).toBe(false);
  });
});

describe('detectConflict', () => {
  it('Coastal Breeze: "Tina Alvarez" vs "Marcus Webb" is a conflict', () => {
    const people = extractPeople(
      getProviderResults('Coastal Breeze Pool Service'),
    );
    expect(detectConflict(people)).toBe(true);
  });

  it('Ironclad: matching names across providers are not a conflict', () => {
    const people = extractPeople(getProviderResults('Ironclad Welding Shop'));
    expect(detectConflict(people)).toBe(false);
  });
});

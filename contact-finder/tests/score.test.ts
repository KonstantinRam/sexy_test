import { describe, expect, it } from 'vitest';
import { getProviderResults } from '../src/providers.js';
import { gate, score, SHIP_THRESHOLD } from '../src/score.js';

// Bands and reasons only — the weights are tunable, exact numbers are not API.

const SHIPPABLE = [
  'Cedar Ridge Plumbing LLC',
  'Pioneer Landscaping Inc',
  'Ironclad Welding Shop',
  'Brookside Veterinary Clinic',
  'Bayview Auto Repair',
  'Tidewater Plumbing & Heating',
  'Greenfield Catering Group',
];

const SINGLE_WEAK_SOURCE = [
  'Riverside Print & Sign',
  'Summit Pest Control',
  'Hometown Hardware Co',
  'Anchor Marine Supply',
];

describe('score bands', () => {
  it.each(SHIPPABLE)('%s scores at or above the threshold', (company) => {
    const scored = score(getProviderResults(company));
    expect(scored.score).toBeGreaterThanOrEqual(SHIP_THRESHOLD);
    expect(scored.reviewReason).toBeNull();
  });

  it.each(SINGLE_WEAK_SOURCE)(
    '%s is below threshold with single_weak_source',
    (company) => {
      const scored = score(getProviderResults(company));
      expect(scored.score).toBeLessThan(SHIP_THRESHOLD);
      expect(scored.reviewReason).toBe('single_weak_source');
    },
  );

  it('Coastal Breeze: conflicting identities cap the score at 40', () => {
    const scored = score(getProviderResults('Coastal Breeze Pool Service'));
    expect(scored.score).toBeLessThanOrEqual(40);
    expect(scored.reviewReason).toBe('conflicting_identities');
  });

  it('Northgate: a name but no email/phone => no_contact_channel', () => {
    const scored = score(getProviderResults('Northgate HVAC Services'));
    expect(scored.score).toBeLessThan(SHIP_THRESHOLD);
    expect(scored.reviewReason).toBe('no_contact_channel');
    // The registered agent earns no person points — explained, not silent.
    expect(scored.reasons.join('\n')).toContain('excluded');
  });

  it('Sunbelt: corroborated phone but no human => no_decision_maker_identified', () => {
    const scored = score(getProviderResults('Sunbelt Roofing Co'));
    expect(scored.score).toBeLessThan(SHIP_THRESHOLD);
    expect(scored.reviewReason).toBe('no_decision_maker_identified');
  });

  it('Redwood Cabinetry: absent from every provider => 0, no_sources_found', () => {
    const scored = score(getProviderResults('Redwood Cabinetry'));
    expect(scored.score).toBe(0);
    expect(scored.reviewReason).toBe('no_sources_found');
  });

  it.each(['Harbor Light Electric', 'Lakeside Auto Glass'])(
    '%s is a deliberate borderline row landing below threshold',
    (company) => {
      const scored = score(getProviderResults(company));
      expect(scored.score).toBeLessThan(SHIP_THRESHOLD);
    },
  );

  it('Lakeside: unanchored "Jeff" earns neither name-based bonus', () => {
    const scored = score(getProviderResults('Lakeside Auto Glass'));
    const text = scored.reasons.join('\n');
    expect(text).not.toContain('corroborated by enrichment email');
    expect(text).not.toContain('matches chosen person');
  });
});

describe('reasons explain the score', () => {
  it('Cedar Ridge: every contributing signal appears in reasons', () => {
    const scored = score(getProviderResults('Cedar Ridge Plumbing LLC'));
    const text = scored.reasons.join('\n');
    expect(text).toContain('person from registry');
    expect(text).toContain('person from listing');
    expect(text).toContain('corroborated');
    expect(text).toContain('enrichment channel');
    expect(text).toContain('phone');
  });

  it('Riverside: generic inbox penalty and single-source weakness are named', () => {
    const scored = score(getProviderResults('Riverside Print & Sign'));
    const text = scored.reasons.join('\n');
    expect(text).toContain('generic inbox');
  });

  it('Coastal Breeze: the cap is recorded in reasons', () => {
    const scored = score(getProviderResults('Coastal Breeze Pool Service'));
    expect(scored.reasons.join('\n')).toContain('capped at 40');
  });

  it('every reason line carries an explicit delta or a hard-rule/clamp note', () => {
    for (const company of [...SHIPPABLE, ...SINGLE_WEAK_SOURCE]) {
      const scored = score(getProviderResults(company));
      for (const reason of scored.reasons) {
        expect(reason).toMatch(/: [+-]\d+$|hard rule|clamped/);
      }
    }
  });
});

describe('gate', () => {
  it('ships the corroborated personal email for Cedar Ridge', () => {
    const results = getProviderResults('Cedar Ridge Plumbing LLC');
    const gated = gate(results, score(results));
    expect(gated).toEqual({
      contact_name: 'Daniel Ortega',
      contact_role: 'Owner',
      contact_email_or_phone: 'd.ortega@cedarridgeplumbing.com',
      needs_human_review: false,
      review_reason: '',
    });
  });

  it.each(SHIPPABLE)('%s ships a named contact with a channel', (company) => {
    const results = getProviderResults(company);
    const gated = gate(results, score(results));
    expect(gated.needs_human_review).toBe(false);
    expect(gated.review_reason).toBe('');
    expect(gated.contact_name).not.toBe('');
    expect(gated.contact_email_or_phone).not.toBe('');
  });

  it.each(['Harbor Light Electric', 'Lakeside Auto Glass'])(
    '%s goes to review with blanked fields and below_threshold',
    (company) => {
      const results = getProviderResults(company);
      const gated = gate(results, score(results));
      expect(gated).toEqual({
        contact_name: '',
        contact_role: '',
        contact_email_or_phone: '',
        needs_human_review: true,
        review_reason: 'below_threshold',
      });
    },
  );

  it('hard-rule reasons survive the gate', () => {
    const results = getProviderResults('Coastal Breeze Pool Service');
    const gated = gate(results, score(results));
    expect(gated.needs_human_review).toBe(true);
    expect(gated.review_reason).toBe('conflicting_identities');
    expect(gated.contact_email_or_phone).toBe('');
  });
});

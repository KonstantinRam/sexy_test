# contact-finder

## Pipeline

```
companies.csv
  => load         parse + normalize input rows.
  => providers    registry | listing | enrichment (mocked, independently fallible).
  => identity     extract people, match names/emails, detect conflicts.
  => persona      rank roles: AP (1) > owner/founder/president (2) > CFO/finance (3) > manager (4) > unknown (5); (exclude registered. T).
  => score        additive weights + hard rules => 0–100 with reasons[]
  => gate         score < 70 == blank contact fields, needs_human_review = true.
  => suppression  final mandatory gate: blanks contact regardless of score, keeps provenance.
  => output       results.csv + results.json + console summary.
```

## Confidence scoring
(K: Number are out thin air. Need adjustment)
| Signal | Weight |
| --- | --- |
| Person from registry | +25 |
| Person from listing | +15 |
| Person corroborated by ≥2 providers (name match or matching email) | +15 |
| Email local-part matches chosen person | +10 |
| Enrichment channel | +floor(provider_confidence × 0.4) |
| Phone from listing | +10 |
| Same phone in ≥2 providers | +15 |
| Generic inbox (info@, office@, sales@, contact@) | −20 |

Hard rules:

1. All providers absent => score 0, `no_sources_found`.
2. No email or phone from any provider => `no_contact_channel`.
3. No person with a non-excluded persona => `no_decision_maker_identified` (enrichment-only rows diagnose as `single_weak_source` instead).
4. Conflicting identities across providers => score capped at 40, `conflicting_identities`.
5. Single provider => score capped at 65 (can never clear the 70 ship threshold alone, arguable); enrichment-only => `single_weak_source`.

Ship threshold: **70** (per challenge clarifications). Every applied delta, cap, and clamp is recorded in `reasons[]` in results.json.

## Deliberate extensions beyond spec

- `review_reason`: a review flag without a reason isn't actionable; the reason tells the human what to do next.
- `source_urls`: per-row provenance so every shipped value is traceable to the providers that attested it.

## Production deltas

- `namesMatch` has a slot for an LLM judge for fuzzy name matching beyond the current deterministic rules.
- Provider-independence caveat: the mocks are treated as independent attestations; real providers often share upstream data, which weakens corroboration bonuses.
- Suppression would be a service (live opt-out list), not a checked-in JSON file.
- `retrieved_at` would come from live call timestamps instead of mock data.

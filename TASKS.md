# Contact Finder -- Claude Code Task Prompts
Idea beehind: One task = one commit. 
Each prompt in a fresh Claude Code session inside IDE.
Stack: TypeScript + vitest, self-contained in `contact-finder/`. 
No network, no LLM calls at runtime (K: it's about LLM question.).

---

## Task 0: Scaffold + Types (the contract)

```
Create a self-contained TypeScript project in contact-finder/ (do not touch any
files outside this directory).

1. package.json with: typescript, tsx, vitest as devDependencies. Scripts:
   "test": "vitest run", "run": "tsx src/run.ts".
2. tsconfig.json: strict mode, ES2022, moduleResolution bundler.
3. src/types.ts defining the full domain model:
   - InputRow { company_name, mailing_address }
   - RegistryRecord { name: string|null, role: string|null, source_url: string }
   - ListingRecord { name: string|null, phone: string|null, source_url: string }
   - EnrichmentRecord { email: string|null, phone: string|null,
     provider_confidence: number, source_url: string }
   - ProviderName = 'registry' | 'listing' | 'enrichment'
   - ProviderResult: discriminated union over { status: 'absent' } |
     { status: 'found', record: ... } -- absent (key missing) and found-with-nulls
     are DIFFERENT states. This distinction is load-bearing.
   - SourcedValue<T> { value: T, provider: ProviderName, source_url: string }
   - ReviewReason = 'suppressed' | 'no_sources_found' | 'no_contact_channel'
     | 'no_decision_maker_identified' | 'conflicting_identities'
     | 'single_weak_source' | 'below_threshold'
   - OutputRow { company_name, contact_name, contact_role,
     contact_email_or_phone, confidence_score: number, source: string,
     source_urls: string, needs_human_review: boolean,
     review_reason: ReviewReason | '' }

Do NOT implement any pipeline logic. Types and config only.
Verify: npx tsc --noEmit passes, npx vitest run executes (zero tests is fine).
```

**Context files:** `challenge/mocks/README.md` (response shape), `challenge/PROBLEM.md` (output fields)
**Test:** `npx tsc --noEmit` clean.

---

## Task 1: CSV Loader + Mock Provider Client

```
Implement in contact-finder/:

1. src/load.ts - parse challenge/data/companies.csv into InputRow[]. Handle the
   quoted addresses. Add normalizeCompanyName(name): lowercase, trim, collapse
   whitespace, strip trailing legal suffixes (llc, inc, co, corp, ltd) - used for
   DEDUPE ONLY.
2. src/providers.ts - load challenge/mocks/enrichment_responses.json once.
   getProviderResults(companyName) returns { registry, listing, enrichment } as
   ProviderResult. CRITICAL: the mock file is keyed by company_name EXACTLY as it
   appears in the CSV. Look up with the RAW name, never the normalized one -
   normalizing the lookup key silently turns all 18 fixtures into misses.
   A missing top-level key OR a missing provider sub-key => status 'absent'.
   A present provider with null fields => status 'found' with nulls preserved.

Do NOT modify src/types.ts. Do NOT add any dependency beyond what Task 0 installed
(write a minimal CSV parse by hand - the file is 30 simple rows).

Tests (tests/providers.test.ts):
- "Cedar Ridge Plumbing LLC" returns all three providers as found.
- "Maple Leaf Bakery" returns listing found (name null preserved), registry and
  enrichment absent.
- "Redwood Cabinetry" returns all three absent.
- Loader returns exactly 30 rows.
```

**Context files:** `src/types.ts`, `challenge/mocks/enrichment_responses.json`, `challenge/data/companies.csv`
**Test:** `npx vitest run` -- 4+ tests green.

---

## Task 2: Identity Reconciliation (deterministic, no LLM)

```
Implement src/identity.ts in contact-finder/:

1. extractPeople(providerResults) => Person[] where Person { name, role|null,
   provider, source_url }. Rules:
   - registry: name + role as given.
   - listing: parse embedded roles - "Jeff (manager)" => name "Jeff",
     role "manager". Strip honorifics ("Dr. Patel" => name "Patel",
     keep a note that honorific existed).
   - enrichment: no person; the email local-part is only a corroboration hint,
     never a Person.
2. namesMatch(a, b): case-insensitive; exact; first-initial match
   ("S. Murphy" ~ "Sean Murphy"); small nickname table (bob/robert, jeff/jeffrey,
   bill/william, mike/michael, tom/thomas, dan/daniel) - a dozen entries, no more.
3. emailMatchesName(email, name): local-part heuristics - "d.ortega" ~ "Daniel
   Ortega", "karen" ~ "Karen Liu", "g.whitfield" ~ "George Whitfield",
   "emily.hart" ~ "Emily Hart". Generic local-parts (info, office, contact,
   sales, admin, support, hello) ALWAYS return false.
4. detectConflict(people): two named people from different providers where
   namesMatch is false => conflict.

Do NOT call any LLM or network. Do NOT modify types.ts. Keep the nickname table
inline - no config files.

Tests (tests/identity.test.ts), use the real fixture values:
- Ironclad: "Robert Kowalski" matches "Bob Kowalski".
- Harbor Light: "Sean Murphy" matches "S. Murphy".
- Coastal Breeze: "Tina Alvarez" vs "Marcus Webb" => conflict.
- Bayview: emailMatchesName("karen@bayviewauto.com", "Karen Liu") true.
- Sunbelt: emailMatchesName("office@sunbeltroofingaz.com", anything) false.
- Lakeside: "Jeff (manager)" parses to name+role.
```

**Context files:** `src/types.ts`, `challenge/mocks/enrichment_responses.json`
**Test:** `npx vitest run` green.

---

## Task 3: Persona + Confidence Scorer + Review Gate

```
Implement in contact-finder/:

1. src/persona.ts - classifyPersona(role: string|null) => rank. Priority from
   challenge/CLARIFICATIONS.md: AP/accounts payable (1) > owner/founder/
   president (2) > CFO/finance (3) > office manager/manager (4) > unknown (5).
   "Registered Agent" is NOT a decision-maker - classify as 'excluded' (often a
   law firm or filing service, not the business).
2. src/score.ts - score(companyEvidence) => { score: number, reasons: string[],
   reviewReason: ReviewReason | null }. Additive, explainable; weights as named
   constants at the top of the file:
   - person from registry +25; person from listing +15
   - person corroborated across >=2 providers (namesMatch OR emailMatchesName
     against a named person) +15
   - email local-part matches the chosen person +10
   - enrichment channel: + floor(provider_confidence * 0.4)
   - phone present from listing +10; same phone in >=2 providers +15
   - generic inbox (info@/office@/sales@/contact@) -20
   - HARD RULES (applied after summing, in this priority order):
     a. all providers absent => score 0, reviewReason no_sources_found
     b. no email AND no phone anywhere => reviewReason no_contact_channel
     c. no person with a non-excluded persona => no_decision_maker_identified
     d. detectConflict true => cap score at 40, conflicting_identities
     e. only one provider returned data => cap score at 65; if that single
        source is enrichment => single_weak_source
   - clamp 0..100.
3. Gate per challenge/CLARIFICATIONS.md: score < 70 => contact_email_or_phone ""
   contact_name "", contact_role "", needs_human_review true, review_reason set
   (use the hard-rule reason if any, else below_threshold). The score itself is
   still reported.
   Channel preference when shipping: corroborated personal email > personal
   email > corroborated phone > phone.

Do NOT modify types.ts or identity.ts. The reasons[] array must make every score
reconstructable by a human reading the output.

Tests (tests/score.test.ts) - assert BANDS and reasons, not exact numbers
(weights are tunable):
- >=70: Cedar Ridge, Pioneer, Ironclad, Brookside, Bayview, Tidewater, Greenfield.
- <70 with reason single_weak_source: Riverside, Summit Pest, Hometown Hardware,
  Anchor Marine.
- Coastal Breeze: <=40, conflicting_identities.
- Northgate: no_contact_channel (a name exists but no email/phone - and the role
  is Registered Agent).
- Sunbelt: no_decision_maker_identified (corroborated phone but no human).
- Redwood Cabinetry: 0, no_sources_found.
- Harbor Light and Lakeside land below 70 => review. These are deliberate
  borderline rows; do not tune weights to force them over.
```

**Context files:** `src/types.ts`, `src/identity.ts`, `challenge/mocks/enrichment_responses.json`, `challenge/CLARIFICATIONS.md`
**Test:** `npx vitest run` green.

---

## Task 4: Suppression Gate + Output + Runner

```
Implement in contact-finder/:

1. suppression.json at contact-finder/ root:
   [{ "key_type": "company", "key_value": "ironclad welding shop",
      "reason": "demo: requested no contact", "added_at": "<today>" }]
2. src/suppress.ts - isSuppressed(outputRowDraft, list): key_types 'company',
   'email', 'phone'. Normalize before comparing (lowercase/trim; for company
   use normalizeCompanyName; for phone strip non-digits). Suppression is the
   FINAL gate, after scoring: a suppressed row ships empty contact,
   needs_human_review true, review_reason 'suppressed', regardless of score.
3. src/run.ts - CLI: read CSV -> providers -> identity -> persona/score ->
   gate -> suppression -> write output/results.csv AND output/results.json with
   every OutputRow field. source = pipe-separated provider names that
   contributed; source_urls = pipe-separated mock:// urls. A row with empty
   contact has empty source/source_urls ONLY if no sources existed at all -
   reviewed rows that had partial evidence still list what was found.
4. Console summary at end: shipped N, review M, breakdown by review_reason.

Do NOT modify earlier files except run.ts wiring. Do NOT add dependencies.

Tests (tests/suppress.test.ts):
- Ironclad scores >=70 but exits as suppressed with empty contact (proves the
  gate outranks a passing score).
- Full run produces exactly 30 rows; counts: 12 rows no_sources_found.
```

**Context files:** `src/types.ts`, `src/score.ts`, `src/providers.ts`
**Test:** `npx vitest run` green, then `npm run run` and read the actual console output - confirm the summary numbers match the tests' expectations.

---

## Task 5: Full Run Review + README (human-led)

```
1. Run npm run run. Open output/results.csv. Read all 30 rows like a reviewer
   would: does every shipped contact have source_urls? Does every review row
   have a reason a human could act on? Does anything look invented?
2. Draft contact-finder/README.md SKELETON ONLY with these sections; I will
   write meat and potatoes myself:
   - Pipeline (one diagram line per stage)
   - Confidence scoring (table of weights + the five hard rules)
   - Adaptation from PLAN.md (leave 4 empty bullets: wrong-contact default
     reversed; persona priority adapted to company size; provenance elevated
     to per-value records; suppression added as mandatory gate)
   - Deliberate extensions beyond spec (review_reason, source_urls) + 1-line why
   - Production deltas (LLM judge slot in namesMatch, provider-independence
     caveat, suppression service, retrieved_at from live calls)
3. Do NOT write the adaptation prose. Do NOT pad the README with marketing.
```

**Context files:** `output/results.csv`, `PLAN.md`, `challenge/CLARIFICATIONS.md`
**Test:** README skeleton exists; prose sections empty for the human. The adaptation section is the part the rubric reads - it gets written by hand.

---

## Commit cadence

```
Task 0  -> "scaffold: types + tooling for contact-finder slice"
Task 1  -> "feat: csv loader + mock provider client (absent vs null states)"
Task 2  -> "feat: deterministic identity reconciliation"
Task 3  -> "feat: persona ranking + explainable confidence scorer + review gate"
Task 4  -> "feat: suppression gate + runner + provenance-carrying output"
Task 5  -> "docs: results review + README"
```

Each task ends with: run tests, READ the output, fix before committing. Never
commit on a red run.

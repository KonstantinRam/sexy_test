## Architecture
Single pipeline.
1. CSV => normalize => unified DO.
2. dedupe => run new entire against exist DB => unify under general DO.
3. Gather person data.
4. LLM does personal matching. Create a list of people per company with assigned roles.
5. Present most relevant person.

## Sources & strategy
Legit business registries.
Amount of sources matter.

## Quality
Priority list.
{Accountant .. N.. janitor} Ranking.

## Privacy / compliance
No dark patterns.
US based. No international.
No private info.
 
## Clarifying questions
LLM usage.
        Why it matters:
Price, hallucinations.

        Default assumption:
minimize it.
Priority based on company.

Wrong Contact VS No contact.
        Why it matters:
Precision.
        Default assumption:
Use wrong one. 




## Why this role
Besides what I wrote in my introductory message (I really appreciate the approach to development and team dynamics) the collection is actually interesting topic to work with.
Why? 
It's generally big databases to process. And nothing is more interesting them working with databases, running data against each other and so on.
Second, I actually worked in collection adjacent filed  => regression litigation, so it's a field that still interests me. 

## How you work with AI tools
Well. I have developed a particular pipeline that I personally found productive.
It was based on personal experience, thinking about pay-per-token future and keeping CodeGen blast radius smaller.
In a nutshell:
a. My own CLAUDE.md defines what the agent may not do: no pushes, no PRs, no files outside named scope, no new dependencies unasked. Prio to blast radius. (why I do pushes manually is a topic for discussion).
b. Plan written solo => AI used as an adversarial reviewer of the plan, not its author. It can caught me doing silly stuff.
c. Work decomposed into task prompts with hard scope, context files, verification with expected outcomes. 
(Check TASKS.md in the root.)
d. One task == one session == one commit. Check diffs, tests, greenlight the commit (So I am personally responsible for it). Also, one session == fresh context, less tokens burned.
e. Underdetermined spec points. Agent prompted to flag those, but never silently resolve them. I review them, ratify, change something, adjust tasks etc. While "slower" at the moment saves a lot of time in the future.
 
## Your last project (structured — this is the pre-filter)
I roughly outlined what's happened with real estate project. 
In a great scheme of things, foundational mistake was business one, not technical. However, there was a big technical one too.
    One ambiguity you faced and how you resolved it:
    Real estate documentation and legislation is surprisingly chaotic comparing to other law related fields. That was unexpected.

    One mistake you made and what you changed:
Actual mistake: I designed the document store for flexibility no requirement asked for.
 Flexible schema + Liquibase migration tools for imagined future document types. Plain relational schema would covere everything we actually needed at a time. Over-engineered and designed for futures instead of requirements. 
Simplified everything considerably. Went for => normalized summary + original.
    One tradeoff you made and why:
   The flow was => ambiguity => wrong solution => tradeoff. 
    the tradeoff was having normalized and deconstructed doc with original attached. Still it has it's issues, but it was better solution then "super flexible" monstrosity that would never work.

    One review comment that made you change your mind:
Product did not go live, so no "reviews" per se, but one of the founder just called me out on this. 

## Anything you'd improve about THIS challenge or our CLAUDE.md
Regarding challenge itself. Well. It's rather a meta-question. Which improvements will increase understanding of applicants thinking process and pipelines?
For example, legacy stuff from old challenges are not something we want in production project, but looks  great in challenge one. It acts as a "trap" of a sort, but honestly announced.
Other then that I have no comments, the challenge itself is an instrument 

Regarding Claude.md
What particularly stand out for  me in scaffolding claude.md file: based on instructions claude has authority to do git actions. However, I don't see see  "Don't" part. 
My Claude.md maybe be extra paranoid in comparison. Maybe combining them and/or adding more security guardrails can be advised.


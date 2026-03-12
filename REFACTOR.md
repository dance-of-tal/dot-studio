# REFACTOR.md

Refactor for consistency, not novelty.

## Core Rule

Preserve behavior.
Standardize implementations that serve the same intent.
Prefer one clear pattern over multiple similar ones.

## What To Optimize For

- consistency
- readability
- maintainability
- explicitness
- small, safe diffs

## What To Avoid

- unnecessary abstraction
- large rewrites
- framework churn
- hidden behavior changes
- keeping multiple patterns for the same job

## Canonicalization Rules

When the same intent is implemented in different ways:

1. identify the duplicated responsibility
2. choose one canonical pattern
3. migrate the others to it
4. remove redundant code

Compare by intent, not syntax.

## Refactoring Rules

- preserve external behavior
- preserve public contracts
- prefer incremental change
- reduce duplication
- reduce branching complexity
- separate concerns
- make control flow easier to follow
- keep naming consistent
- remove dead code after migration

## Smells

Treat these as refactor targets:

- same behavior, different implementation
- duplicated logic
- mixed responsibilities
- deep nesting
- inconsistent naming
- ad-hoc validation / formatting / error handling
- special cases scattered across the codebase
- components or modules doing too many jobs

## Abstraction Rules

Only extract an abstraction if it removes real duplication or clarifies responsibility.

Do not create generic helpers prematurely.
Do not abstract one-off logic.
Prefer obvious code over reusable-looking code.

## Consistency Rules

If two modules solve the same problem, they should follow the same pattern.
If two names refer to the same concept, use one term.
If a rule exists in multiple places, centralize it.

## Safety Rules

Do not silently change behavior.
If two implementations differ slightly, surface the difference before merging them.
If unsure, prefer the safer and smaller refactor.

## Output Preference

For any substantial refactor, provide:

1. duplicated or inconsistent patterns found
2. chosen canonical pattern
3. proposed minimal migration
4. risks or behavior differences

---
name: studio-assistant-performer-guide
description: "Helps design or revise Studio Performers with strong role focus, Tal/Dance/model choices, and Act participant readiness. Use for Performer creation, Performer updates, role design, and participant-quality decisions. For exact payload fields, load studio-assistant-action-surface-guide."
compatibility: Designed for the DOT Studio built-in assistant projection.
---

# Studio Performer Guide

Use this skill when the user wants a Performer created, revised, inspected, or attached as a useful Act participant.

## Load With
- Load `studio-assistant-action-surface-guide` before emitting `apply_studio_actions` payloads.
- Load `studio-assistant-tal-design-guide` when writing or revising Tal.
- Load `studio-assistant-workflow-guide` when the request is really about a team, pipeline, or Act.

## Performer Design Rules
- A Performer should reflect the user's requested role and working style, not a generic placeholder.
- Use role names directly when the user names them.
- Put the performer's stable focus in `description`; this becomes participant focus inside Act runtime.
- If the request implies Tal, Dance, model, variant, or MCP choices, include them only when they are known from the snapshot or clearly requested.
- Do not invent Tal URNs, Dance URNs, MCP server names, provider ids, model ids, or model variants.
- If the user explicitly asks to omit Tal, Dance, or model setup, honor that omission.
- If multiple materially different Tal/Dance/model setups are plausible, ask one short clarifying question.

## Tal And Dance Decisions
- Missing Tal alone should not block a clear Performer or workflow creation request.
- If the role intent is clear, prefer a compact inline `talDraft` in the same `createPerformer` action.
- Ask first only when Tal identity, tone, authority, or policy choices are important and unclear.
- If a new Performer needs a local Dance, prefer inline `addDanceDrafts` or a same-call Dance draft ref.
- If the user asks to find or apply an existing skill instead of creating one, load `find-skills`.

## Mutation Shape
- Prefer one dependency-complete `createPerformer` over `createPerformer` followed by `updatePerformer` when the dependencies are already known.
- Use same-call refs for newly created Tal/Dance/Performer dependencies.
- Reuse existing Performers when they already match the requested role closely enough.
- For a direct team or workflow request, do not stop after creating loose Performers; create or update the Act too.

## Quality Bar
- `name` should identify the actual role.
- `description` should say what the performer owns, how it reasons, or what handoff it produces.
- Tal should be durable and compact; keep one-off task instructions out of Tal.
- Dance should hold optional procedures or reusable capability, not always-on identity.
- A Performer created for an Act should be distinct enough that nearby roles would behave differently.

## Good Performer Patterns
- Single expert: one clear role, compact Tal, model only when requested or already known.
- Researcher: gathers evidence, tracks uncertainty, hands off structured findings.
- Reviewer: checks risk, completeness, and actionability before approval.
- Operator: turns plans into executable steps, tracks status, and escalates blockers.

## Anti-Patterns
- Creating a role with only a generic name when the user gave real intent.
- Stuffing whole workflow choreography into Performer Tal instead of Act rules and relations.
- Adding broad MCP or Dance dependencies without snapshot evidence.
- Asking for Tal details when the requested role is already clear enough to draft.

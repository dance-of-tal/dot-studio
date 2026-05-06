---
name: studio-assistant-act-guide
description: "Explains the current DOT Studio Act contract: participants, relations, subscriptions, actRules, safety, and publish-safe field boundaries. Use for Act contract, relation, subscription, and runtime guardrail questions. For role split/topology decisions, load studio-assistant-workflow-guide."
compatibility: Designed for the DOT Studio built-in assistant projection.
---

# Act Contract Guide

Use this skill when the user asks about Act structure, relation fields, subscriptions, actRules, safety, or contract-correct Act mutations.

## Mental Model
- An Act is participant choreography.
- Workspace Acts, canonical Act assets, runtime definitions, and runtime thread state are different layers.
- Assistant mutations operate on the Studio workspace layer but should still aim for publishable structure.

## Contract Facts
- Participants are keyed records in Studio workspace state.
- Canonical Act assets use participant `key` plus Performer URNs, not workspace `performerRef`.
- Relations use `between: [sourceKey, targetKey]`, `direction`, `name`, and `description`.
- For `one-way`, relation order matters.
- Opposite one-way relations are valid as separate relations.
- Participant subscriptions use `messagesFrom`, `messageTags`, `callboardKeys`, and `eventTypes`.
- `eventTypes` currently supports only `runtime.idle`.
- Use `callboardKeys` as the canonical field name.

## Relation Rules
- A multi-participant workflow Act should have at least one relation unless the user explicitly asks for an unconnected group.
- Every new relation needs source, target, direction, non-empty `name`, and non-empty `description`.
- Use `source...` and `target...` locator fields in assistant payloads, not legacy `from...` or `to...`.
- Relation direction should follow real work, authority, approval, or escalation flow.
- Relation names should name the artifact or coordination moment, such as `research brief`, `review notes`, or `launch handoff`.
- Avoid generic relation names like `handoff`, `sync`, or `collaboration`.

## actRules, Safety, And Subscriptions
- Use `actRules` for durable whole-team behavior.
- Put participant-specific focus in the linked Performer `description`.
- Put runtime caps, loop limits, quiet windows, and thread deadline behavior in `safety`.
- `safety.threadTimeoutMs` is a runtime limit, not a participant wake.
- Participant subscriptions are wake filters, not permissions.
- Add subscriptions only for concrete wake behavior.
- Align `messageTags` and `callboardKeys` with concrete handoffs.

## Runtime Waiting Vocabulary
- Use `wait_until` condition names `message_received`, `board_key_exists`, `wake_at`, `all_of`, and `any_of`.
- `wake_at` is the scheduled self-wake condition name.
- Do not call scheduled waits `timeout`.

## Legacy Fields To Avoid
- participant `id`
- relation `permissions`
- relation `maxCalls`
- relation `timeout`
- relation `sessionPolicy`

## Self-Check
- Load `studio-assistant-action-surface-guide` before emitting payloads.
- If a new Act has multiple participants and represents a workflow/team, include at least one relation.
- Keep relation payloads contract-correct and publish-safe.

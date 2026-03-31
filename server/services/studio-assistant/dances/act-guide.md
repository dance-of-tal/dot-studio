# Act Contract Guide

Use this skill when the user is asking about Act structure, relation design, or contract-correct choreography.

## Mental Model
- An Act is participant choreography.
- Workspace Acts, canonical Act assets, runtime Act definitions, and thread runtime state are different layers.
- Assistant mutations operate on the Studio workspace layer, but should still aim for publishable Act structure.

## Current Contract Facts
- Participants are keyed records in Studio workspace state.
- Canonical Act assets use participant `key` plus performer URN, not workspace `performerRef`.
- Relations use `between: [sourceKey, targetKey]`, `direction`, `name`, and `description`.
- For `one-way`, relation order matters.
- Opposite one-way relations are valid as separate relations.

## Design Rules
- If an Act has multiple participants, it should also have at least one relation.
- Always give each new relation both a clear `name` and `description`.
- Prefer focused Acts over one giant workflow graph.
- Reuse existing performers when they already match the requested role.
- Avoid promising unsupported fields such as subscriptions, actRules, or legacy relation metadata unless the current assistant action surface can actually express them.

## Legacy Fields To Avoid
- participant `id`
- relation `permissions`
- relation `maxCalls`
- relation `timeout`
- relation `sessionPolicy`

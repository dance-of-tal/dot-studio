---
name: studio-assistant-skill-creator-guide
description: Helps the Studio Assistant create or extend Dance skill bundles in a Studio-safe way. Use when the user wants to author a new skill, add references or scripts, or prepare agents/openai.yaml inside a Dance draft bundle.
compatibility: Designed for the DOT Studio built-in assistant projection.
---

# Studio Skill Creator

Use this skill when the user wants to build a Dance skill bundle through Studio Assistant.

## Studio-safe authoring model
- Use `createDanceDraft` or `updateDanceDraft` only for `SKILL.md`.
- Use `upsertDanceBundleFile` for sibling files such as `references/*.md`, `scripts/*`, `assets/*`, and `agents/openai.yaml`.
- Use `deleteDanceBundleEntry` only for non-core bundle entries.
- Never target `SKILL.md` or `draft.json` with bundle file actions.
- Bundle file actions only work on saved Dance drafts.

## Recommended bundle shape
- Keep `SKILL.md` concise and procedural.
- Put detailed examples or schemas in `references/`.
- Put deterministic helpers in `scripts/` only when they meaningfully reduce ambiguity or repetition.
- Create `agents/openai.yaml` only when the user wants the Dance to expose polished UI metadata.

## Assistant behavior
- If the user wants a new Dance, prefer `createDanceDraft` first and give it a same-block `ref`.
- When you need extra bundle files in the same reply, reuse that `draftRef`.
- If the correct bundle path is unclear, ask a short clarifying question instead of guessing.
- Prefer a few high-signal files over a large scaffold.

## Example

```html
<assistant-actions>{"version":1,"actions":[{"type":"createDanceDraft","ref":"research-skill","name":"Research Skill","content":"---\nname: research-skill\ndescription: Research workflow helpers.\n---\n\n# Research Skill\n\nUse this skill for focused research tasks."},{"type":"upsertDanceBundleFile","draftRef":"research-skill","path":"references/sources.md","content":"# Sources\n\nList trusted source types here."},{"type":"upsertDanceBundleFile","draftRef":"research-skill","path":"agents/openai.yaml","content":"display_name: Research Skill\nshort_description: Research workflow helpers\ndefault_prompt: Use this skill when you need focused research support."}]}</assistant-actions>
```

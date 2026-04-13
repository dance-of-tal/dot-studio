---
name: find-skills
description: Finds, compares, and applies existing external skills or Dance bundles before creating a new one. Use when the user asks to find a skill, search skills.sh, recommend an existing skill, or install/apply a GitHub or skills.sh Dance.
compatibility: Designed for the DOT Studio built-in assistant projection.
---

# Find Skills

Use this skill when the user likely wants an existing external skill, not a brand-new local Dance from scratch.

## Intent Split
- If the user wants a new Dance draft, an updated `SKILL.md`, or a custom local bundle, use `studio-assistant-skill-creator-guide` instead.
- If the user wants to search, compare, recommend, install, or apply an existing skill, use this skill.
- If the message mixes create and find/apply intent, ask one short clarifying question before mutating.

## Search Order
- Prefer installed local matches first.
- Then consider DOT registry matches.
- Then consider `skills.sh` or GitHub Dance candidates.
- Treat `skills.sh` hints as candidates, not guarantees.

## Recommendation Bar
- Prefer official or well-known sources when functionality is similar.
- Prefer higher-install candidates over obscure ones when they solve the same problem.
- Tell the user why a candidate fits in one short sentence.
- If a candidate has very low installs or an unfamiliar source, say so plainly.

## Security Rule
- Before recommending installation or application of a `skills.sh` or GitHub skill, warn briefly that third-party skills should be reviewed before use.
- Tell the user to check the source repository, maintainer reputation, install count, and actual `SKILL.md` contents.
- Do not auto-install an external skill when the exact candidate is still ambiguous.
- If the user explicitly names the exact skill and wants to apply it, you may proceed after a short security notice.

## Apply In Studio
- Use `addDanceFromGitHub` for GitHub or `skills.sh` Dance installs with `owner/repo` or `owner/repo@skill`.
- If the target Performer is already known and the installed Dance URN is known from discovery hints, you may install first and then attach it in the same tool call with `addDanceUrns`.
- If the source is still ambiguous, ask the user to pick the exact skill before installing.

## Example

```json
{"version":1,"actions":[{"type":"addDanceFromGitHub","source":"vercel-labs/skills@find-skills","scope":"stage"},{"type":"updatePerformer","performerName":"Researcher","addDanceUrns":["dance/@vercel-labs/skills/find-skills"]}]}
```

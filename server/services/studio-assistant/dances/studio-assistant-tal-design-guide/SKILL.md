---
name: studio-assistant-tal-design-guide
description: Helps the Studio Assistant design strong Tal content for agents. Use when deciding what belongs in Tal, how concise it should be, how to express persona and mental model, or how to propose a role-appropriate Tal before creating a Performer.
compatibility: Designed for the DOT Studio built-in assistant projection.
---

# Studio Tal Design Guide

Use this skill when the task is not just "make a Tal draft exist", but "design a good Tal for this agent".

## What Tal Is For
- Tal is the always-on instruction layer for a Performer.
- Treat Tal like the core system prompt for the agent, not a dump of every possible instruction.
- Tal should define the agent's stable identity and operating posture.
- Tal should stay useful across many turns, not only one immediate task.

## What Belongs In Tal
- The role the agent plays.
- The agent's core responsibilities and ownership.
- The mental model or reasoning posture the agent should apply consistently.
- Durable collaboration rules, quality bar, and failure-avoidance rules.
- The agent's default tone or working style when that matters.

## What Does Not Belong In Tal
- One-off task instructions for the current turn.
- Large examples, long reference material, or bulky schemas.
- Highly specific workflow wiring that belongs to an Act.
- Reusable optional capability bundles that belong in Dance.
- Ephemeral environment details that may go stale quickly.

## Compression Rule
- Tal content goes into the agent's core prompt path, so keep only high-value enduring guidance.
- Prefer a small number of strong rules over a long checklist.
- If a sentence would not help on most future turns, it probably should not live in Tal.
- Avoid repeating the same instruction in several phrasings.

## Design Heuristics
- Start from the agent's role, then define what good output looks like.
- Make the mental model explicit: how the agent should think, prioritize, and trade off.
- Include constraints that should apply broadly, not just in one workflow.
- Write for behavioral steering, not for documentation completeness.
- Keep the Tal distinct enough that nearby roles would behave differently.

## Tal vs Dance vs Act
- Tal = always-on identity, posture, and durable rules.
- Dance = optional reusable skill or procedure the agent can bring in when relevant.
- Act = multi-agent choreography, handoffs, and participant structure.
- If a rule applies only in one workflow or relation, prefer Act.
- If a capability is optional or specialized, prefer Dance.
- If it should shape nearly every response from this agent, prefer Tal.

## Recommended Tal Shape
- One short role definition.
- One short mental-model section.
- A few durable operating rules.
- A few quality or safety rules.
- A short collaboration/output rule block when needed.

## Quality Bar
- A good Tal is specific, durable, and compact.
- A good Tal makes the agent feel intentionally designed, not generic.
- A good Tal includes persona only when it changes behavior in a useful way.
- A good Tal avoids fluffy backstory unless it materially improves decision-making.
- A good Tal should be short enough to scan quickly and strong enough to change outcomes.

## Assistant Behavior
- When proposing Tal for a new Performer, propose the smallest strong Tal that fits the requested role.
- If the user did not specify Tal, offer a role-appropriate Tal draft and ask whether to apply it as-is.
- If several different mental models are plausible, ask one short clarifying question instead of blending them into a vague Tal.
- When revising a Tal, tighten and compress before expanding.
- Prefer removing low-signal text over adding more text.

## Examples Of Good Tal Content
- Role definition with real ownership.
- A reasoning stance such as skeptical reviewer, careful planner, or decisive operator.
- Durable collaboration rules such as cite uncertainty, escalate blockers, or prefer actionability.
- A quality bar such as correctness first, concise output, or risk-aware recommendations.

## Examples Of Weak Tal Content
- Long autobiographical persona text with little behavioral effect.
- Detailed workflow steps that belong in Dance or Act.
- Giant prompt blocks mixing temporary task instructions with permanent identity.
- Repetitive style rules that do not materially change behavior.

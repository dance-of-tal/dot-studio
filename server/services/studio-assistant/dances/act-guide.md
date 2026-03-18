# Act & Relation Configuration Guide

## What is an Act?
An Act is a **performer interaction graph**. It defines which performers can communicate and how they collaborate.

## Creating an Act workflow
1. Create an Act with a descriptive name (e.g. "Code Review Pipeline")
2. Add the relevant performers into the Act
3. Connect performers with relations (edges) to define the interaction flow:
   - Source performer: the one who initiates the request (caller)
   - Target performer: the one who responds (callee)
   - Description: brief explanation of what the interaction is for

## Relation Types
Relations are directional. "A → B" means A can ask B for help. To make them both able to call each other, create two edges.

## Best Practices
- Keep Acts focused. One Act per workflow (e.g. "Research", "Code Review", "Writing")
- Name relations clearly (e.g. "request code review", "ask for research results")
- A performer can be in multiple Acts

# DOT Studio Workflow Guide

## Common Patterns

### Single Expert
User needs one specialized agent:
1. Create a performer with a descriptive name
2. Assign a Tal that defines the agent's expertise and personality
3. Add relevant Dances for domain knowledge
4. Set the appropriate model

### Team Collaboration
User needs multiple agents working together:
1. Create performers for each role
2. Create an Act for the workflow
3. Add all performers to the Act as participants
4. Connect participants with relations that describe interactions
5. Configure each performer's Tal, Dance, and Model

### Research + Writer
A common pattern is to pair a researcher with a writer:
- Researcher: gathers information, analyzes data
- Writer: takes research output and produces polished content
- Relation: Researcher → Writer ("provide research findings")

### Code Review Pipeline
- Developer: writes code
- Reviewer: reviews code for quality and best practices
- Relation: Developer → Reviewer ("submit code for review")
- Relation: Reviewer → Developer ("provide review feedback")

## Tips
- Explain to the user what you're creating step by step
- After creating the setup, summarize the final structure
- If the user's request is vague, ask clarifying questions first

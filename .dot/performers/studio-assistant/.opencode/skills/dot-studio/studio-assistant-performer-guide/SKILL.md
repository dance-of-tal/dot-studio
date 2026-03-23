---
name: "studio-assistant-performer-guide"
description: "Creating and Configuring Performers"
---

# Creating and Configuring Performers

## Tool Reference

| Tool | Parameters | Returns |
|------|-----------|---------|
| `createPerformer` | `name` | `performerId` |
| `createAct` | `name` | `actId` |
| `addPerformerToAct` | `actId`, `performerId` | `participantKey` |
| `connectPerformers` | `actId`, `sourcePerformerId`, `targetPerformerId` | `relationId` |
| `setPerformerModel` | `performerId`, `providerId`, `modelId` | — |
| `setPerformerTal` | `performerId`, `talUrn` | — |
| `addPerformerDance` | `performerId`, `danceUrn` | — |
| `addPerformerMcp` | `performerId`, `mcpServerName` | — |

## ID Flow

Tool calls return generated IDs. **You must use these IDs in follow-up calls.**

Example sequence:
1. `createPerformer({ name: "Code Reviewer" })` → `{ performerId: "performer-1" }`
2. `createPerformer({ name: "Developer" })` → `{ performerId: "performer-2" }`
3. `createAct({ name: "Code Review" })` → `{ actId: "abc123" }`
4. `addPerformerToAct({ actId: "abc123", performerId: "performer-1" })`
5. `addPerformerToAct({ actId: "abc123", performerId: "performer-2" })`
6. `connectPerformers({ actId: "abc123", sourcePerformerId: "performer-2", targetPerformerId: "performer-1" })`

## Parameter Notes
- `performerId`: Canvas node ID (e.g. `performer-1`), returned by `createPerformer`
- `actId`: Unique act ID (e.g. `abc123`), returned by `createAct`
- `providerId`: Provider slug — `anthropic`, `openai`, `google`, etc.
- `modelId`: Model slug — `claude-sonnet-4-20250514`, `gpt-4o`, etc.
- `talUrn`: Registry URN, e.g. `tal/@author/name`
- `danceUrn`: Registry URN, e.g. `dance/@author/name`
- `mcpServerName`: Project MCP server name (must be defined in project config)
- `sourcePerformerId`: The performer that **initiates** delegation
- `targetPerformerId`: The performer that **receives** the delegated task
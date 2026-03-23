# Dance of Tal (DOT) Studio

> 🌍 **Public Open Source Repository**
> **Visual workspace for composing and running Dance of Tal on OpenCode.**

DOT Studio is a local interface and server combo designed for interactively drag-and-dropping Performers and Acts, debugging their memory, and observing autonomous workflows dynamically.

## Architecture

- **Frontend**: React 19, Vite, `@xyflow/react`, `zustand`, `@dnd-kit`.
- **Backend / Engine**: Node.js running Hono (`hono/node-server`), interfacing directly with `@opencode-ai/sdk`.
- **Contracts**: Depends closely on `dance-of-tal` to serialize and validate canonical asset URNs in the form `kind/@owner/stage/name`.
- **Workspace Persistence**: Saved local working directories are treated as Studio workspaces and are persisted through the workspace API and Studio config.

## Development Setup

The workspace runs a vite frontend and a Node backend simultaneously, connecting to a locally spawned `opencode` server on port 4096.

```bash
# 1. Install dependencies
npm install

# 2. Start the integrated dev environment (Vite + Hono Server + OpenCode)
npm run dev:all
```

## Available Scripts

- `npm run dev:all` - Runs the client, the local backend orchestrator, and an OpenCode node.
- `npm run build` - Compiles the React client and the backend TS.
- `npm run pack:check` - Validates the bundle process.

## Developers & Agents
Are you working on extending or modifying this code? Please read the internal `.agent/README.md` strict contract rules.

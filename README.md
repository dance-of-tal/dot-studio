# DOT Studio

> Visual workspace for composing, testing, and running Dance of Tal agents on top of OpenCode.

[![npm version](https://img.shields.io/npm/v/dot-studio)](https://www.npmjs.com/package/dot-studio)
[![License: MIT](https://img.shields.io/badge/License-MIT-white.svg)](./LICENSE)

DOT Studio is the local visual interface for [Dance of Tal](https://github.com/dance-of-tal/dance-of-tal).
It gives you a canvas for building AI systems out of:

![DOT Studio screenshot](.github/screenshot.png)

- `Tal`: core identity and instruction layer
- `Dance`: reusable skill packages
- `Performer`: an agent composed from Tal, Dances, model, and MCP servers
- `Act`: a choreography that connects multiple performers into a workflow

The Studio runs entirely on your machine. It serves a local web app, talks to OpenCode, and persists local workspace state for repeatable agent development.

## Why DOT Studio

- Build multi-agent systems visually instead of wiring JSON by hand
- Attach Tal, Dance, model, and MCP runtime config directly to performers
- Inspect chats, tool usage, sessions, drafts, and Act runtime state in one place
- Move between local drafts and registry-installed assets without leaving the canvas
- Use DOT's package primitives while still keeping OpenCode as the execution engine

## Install

### Run once with `npx`

```bash
npx dot-studio .
```

### Install globally

```bash
npm install -g dot-studio
dot-studio .
```

### Starting from a fresh DOT workspace

If you also want the DOT CLI available locally:

```bash
npm install -g dance-of-tal dot-studio
dot init
dot login
dot-studio .
```

## Requirements

- Node.js `>=20.19.0`
- macOS, Linux, or another environment supported by Node + OpenCode

DOT Studio can start OpenCode in managed mode automatically.
If you already run OpenCode elsewhere, point Studio at it:

```bash
OPENCODE_URL=http://localhost:4096 dot-studio .
```

## Usage

```bash
dot-studio [projectDir] [--no-open] [--port 3001]
```

Examples:

```bash
# open the current directory
dot-studio .

# do not launch a browser automatically
dot-studio . --no-open

# bind Studio to a specific port
dot-studio . --port 3010
```

When launched in production mode, Studio serves the UI and API from a single local server.

## What You Can Do In Studio

- Create and edit Tal and Dance drafts
- Import installed Performers and Acts onto the canvas
- Attach registry assets, GitHub-backed Dances, models, and MCP servers
- Build Acts by attaching performers and defining participant relations
- Chat with performers and inspect their sessions
- Review runtime tool availability before sending prompts
- Save, reload, and manage local Studio workspaces

## Open Source Scope

This package is the Studio application only.

- `dot-studio`: visual editor and local runtime UI
- `dance-of-tal`: package manager / contracts / CLI for DOT assets

Studio depends on the published `dance-of-tal` package for DOT contracts, parsing, installation, publishing, and registry-facing logic.

## Architecture

- Frontend: React 19, Vite, Zustand, TanStack Query, XYFlow, DnD Kit
- Backend: Hono on Node.js
- Runtime integration: OpenCode via `@opencode-ai/sdk`
- Contracts and asset operations: `dance-of-tal`

High-level layout:

```text
src/       React UI, state, assistant actions, canvas interactions
server/    API routes, OpenCode integration, projection/runtime services
shared/    shared contracts and runtime-safe types
```

## Development

```bash
npm install
npm run dev:all
```

This starts:

- the Vite client
- the Studio server
- a local OpenCode sidecar on port `4096`

Useful scripts:

- `npm run dev:all` - full local development environment
- `npm run build` - production client + server build
- `npm run type-check` - TypeScript checks
- `npm run test` - Vitest
- `npm run lint` - ESLint
- `npm run pack:check` - build and inspect the npm tarball

## Packaging

To verify the published package locally:

```bash
npm run pack:check
npm pack
```

The npm package includes:

- `dist/` server and CLI output
- `client/` production frontend assets
- `README.md`
- `LICENSE`

## Contributing

Issues and pull requests are welcome.

If you are making code changes:

```bash
npm run build
npm run test
```

If your change affects packaging or installation:

```bash
npm run pack:check
```

## Related Packages

- [`dance-of-tal`](https://www.npmjs.com/package/dance-of-tal)
- [`dot-studio`](https://www.npmjs.com/package/dot-studio)

## License

MIT © monarchjuno

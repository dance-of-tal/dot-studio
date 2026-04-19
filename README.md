# DOT Studio

> Figma-style workspace for choreographing Dance of Tal performers and Acts on top of OpenCode.

[![npm version](https://img.shields.io/npm/v/dot-studio?style=flat-square)](https://www.npmjs.com/package/dot-studio)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.19.0-3c873a?style=flat-square)
[![License](https://img.shields.io/badge/License-MIT-0f172a?style=flat-square)](./LICENSE)

[Overview](#overview) • [Quick Start](#quick-start) • [Core Concepts](#core-concepts) • [How Acts Work](#how-acts-work) • [Workflow](#workflow) • [CLI](#cli)

![DOT Studio screenshot](.github/screenshot.png)

DOT Studio is the local visual editor for [Dance of Tal](https://github.com/dance-of-tal/dance-of-tal). Think of it as a Figma-style workspace for AI choreography: you arrange performers on a canvas, define how they relate, and turn those relationships into runnable Acts while [OpenCode](https://github.com/opencode-ai/opencode) handles execution behind the scenes.

You can work in two complementary ways:

- direct manipulation: drag, drop, connect, and edit performers and Acts yourself on the canvas
- assisted editing: ask the built-in Studio Assistant to create or update things when the manual path feels tedious or hard

You can author and connect:

- `Tal`: identity and instruction layers
- `Dance`: reusable skill packages
- `Performer`: runnable agents composed from Tal, Dances, models, and MCP config
- `Act`: multi-performer workflows with runtime collaboration rules

## Overview

DOT Studio is built for local, iterative work:

- choreograph performers and Acts visually on a shared canvas
- edit Tal and Dance drafts without leaving the workspace
- configure models, MCP servers, and runtime settings in one place
- chat with performers, Act participants, and the Studio Assistant from the same UI
- keep everything local while Studio saves workspace state and prepares runtime output for OpenCode

> [!IMPORTANT]
> `.opencode/` is generated output for OpenCode. You usually should not edit it directly.

## Quick Start

### Requirements

- Node.js `>=20.19.0`
- An environment supported by Node.js and OpenCode

```bash
npm install -g dot-studio
dot-studio /path/to/project
```

This installs the CLI globally and opens Studio for the target directory.
If the directory has not been initialized as a DOT workspace yet, Studio prepares it automatically.

### Connect to an existing OpenCode instance

DOT Studio can start OpenCode for you, or you can point it to an existing instance:

```bash
OPENCODE_URL=http://localhost:43102 dot-studio
```

Default local ports are grouped in the `43100` range to avoid collisions with more common development defaults:

- Studio dev client: `43100`
- Studio API: `43101`
- managed OpenCode sidecar: `43102`

## Core Concepts

Studio works with four main building blocks:

- `Tal`: the base identity, behavior, and instruction layer
- `Dance`: a reusable skill or capability package
- `Performer`: an agent made from Tal, Dances, model settings, and MCP configuration
- `Act`: the choreography layer that connects performers and defines how they collaborate

If you are new to DOT Studio, the easiest mental model is:

`Tal + Dance + model + tools = Performer`

`Multiple Performers + choreography = Act`

In other words, Studio is less like a form builder and more like a choreography board for agent systems.

## How Acts Work

An `Act` is the coordination layer for a group of performers. Its job is not just to list who participates, but to define how work moves between them at runtime.

The basic structure of an Act is:

- `participants`: the performers that take part in the Act
- `relations`: the links between participants that describe who can coordinate with whom
- `actRules`: shared choreography rules or constraints for the whole Act
- `subscriptions`: optional wake-up signals such as teammate messages, shared board keys, tags, or runtime events

The simplest mental model is:

`Performers + participant relationships + wake rules = Act runtime behavior`

In practice, an Act usually works like this:

1. you attach performers as participants
2. you define the participant relationships and shared rules
3. Studio projects that authoring state into a runtime Act definition
4. at runtime, participants coordinate by messaging teammates, updating the shared board, and waking when relevant signals arrive

This separation matters:

- the canvas version of an Act is for authoring and layout
- the runtime version is what drives execution and collaboration
- thread state is runtime history, not the canonical Act asset itself

So when you edit an Act in Studio, you are editing the choreography specification. Studio then turns that into the runtime shape OpenCode executes.

## Workflow

### 1. Open a workspace

Start Studio in a project folder:

```bash
dot-studio /path/to/project
```

Studio opens in your browser and restores the saved workspace for that directory when available.
If there is no saved workspace yet, Studio opens that directory as a fresh workspace instead of jumping to the last workspace from another path.

### 2. Create or import assets

Common ways to get started:

- create a new Tal draft
- create a new Dance draft
- import an installed Performer or Act
- drag performers and Acts onto the canvas and start sketching the choreography

### 3. Configure a performer

For each performer, you can typically set:

- a Tal
- one or more Dances
- a model and variant
- MCP servers and related runtime configuration

You can do this directly in the editor with drag-and-drop placement and detailed configuration panels, or let the Studio Assistant help set things up for you.

### 4. Build an Act

Acts are where the choreography comes together.

Typical Act work includes:

- attaching performers as participants
- defining participant relationships
- setting collaboration rules
- chatting with participants in runtime threads

### 5. Chat and iterate

Once a performer or Act is set up, you can use Studio to:

- send prompts
- inspect responses and session state
- review available runtime tools
- keep editing the workspace and run again

> [!NOTE]
> Runtime-affecting edits are picked up on the next execution path. Studio handles projection and runtime refresh for you.

### 6. Use the Studio Assistant

The Studio Assistant is the fastest way to make broad canvas changes.
Use direct editing when you want precise control, and use the Assistant when you want to scaffold or update Tal, Dance, Performers, or Acts without wiring every step manually.

## CLI

```bash
dot-studio [path] [options]
dot-studio open [path] [options]
dot-studio doctor [path] [options]
dot-studio --help
dot-studio --version
```

Examples:

```bash
dot-studio
dot-studio ~/projects/dance-of-tal
dot-studio ~/projects/dance-of-tal --performer performer/@acme/workflows/reviewer
dot-studio open . --no-open
dot-studio open . --act act/@acme/workflows/review-flow
dot-studio open . --port 43111
dot-studio doctor
dot-studio doctor ~/projects/dance-of-tal --opencode-url http://localhost:43102
```

Behavior:

- `dot-studio` opens the current directory as a workspace
- `dot-studio <path>` opens that directory as a workspace
- `--performer <urn>` opens the workspace and focuses that performer when it is already on the canvas, otherwise installs it from the registry when needed and imports it
- `--act <urn>` opens the workspace and focuses that act when it is already on the canvas, otherwise installs it from the registry when needed and imports it
- startup restore is scoped by working directory, so `dot-studio .` and `dot-studio <path>` reopen that directory's saved workspace when one exists
- if the target directory is not initialized yet, Studio initializes the workspace automatically
- `dot-studio doctor` checks Node.js, workspace path, Studio port, and OpenCode readiness
- `dot-studio --help` shows the built-in CLI help

## Package Scope

This package is the Studio application itself.

- `dot-studio` provides the local visual editor, server, and CLI
- `dance-of-tal` provides DOT contracts, parsing, installation, publishing, and registry-facing behavior

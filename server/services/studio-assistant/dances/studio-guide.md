# DOT Studio UI Guide

Use this skill to answer questions about how to navigate and use DOT Studio.

## Studio Layout

Studio has three main areas:

- **Left sidebar**: Performer list and Act list
- **Canvas**: The main workspace where performers and acts appear as nodes
- **Right panel (Inspector)**: Context-sensitive config for the selected performer or act

## Toolbar (top)

- **Stage name / Save**: Current stage name, click to save
- **Asset Library** button: Opens the asset browser on the right
- **Settings** button: Opens global settings (MCP, providers, models)
- **Assistant** button: Opens this assistant panel

## Asset Library

The Asset Library is the panel on the **right side** — opened by clicking the book icon in the toolbar.

It lets you browse and import:

- **Performers** from the registry (pre-built AI agents)
- **Tal** files (identity/instruction sets)
- **Dance** files (skill contexts)
- **Acts** (pre-made workflow templates)

To import a performer or act: click the item → click **Add to Stage** (or drag onto canvas).

## Registry

The **Registry** is DOT's shared asset store where performers, tals, dances, and acts are published and distributed.

When the user opens the Asset Library and sees performers or acts, those come from the Registry.

Users can also **publish their own performers/acts** to the registry via the Publish button in the inspector.

## Performer Inspector (right panel, when a performer is selected)

Shows and edits:

- **Name**: the performer's display name
- **Model**: AI model selection (provider + model id)
- **Tal**: identity instruction layer (link to a Tal asset from registry, or use inline)
- **Dance**: skill layers (add from registry)
- **MCP**: connected MCP tool servers

## Act Inspector (right panel, when an act is selected)

Shows and edits:

- **Name**: act display name
- **Participants**: list of performers in this act
- **Relations**: connections between participants (with direction and description)
- **Act Rules**: global rules for the act's choreography

## Settings Panel

Opened via the gear icon in the toolbar.

Contains:

- **Providers**: configure AI providers (Anthropic, OpenAI, etc.) and paste API keys
- **MCP Servers**: add and configure MCP tool servers (local commands or remote URLs)
- **Models**: view available models per provider

## Canvas Interaction

- **Drag**: move performers and acts on the canvas
- **Click**: select a performer or act (shows inspector)
- **Double-click on an act**: enter Act editor view (shows relation graph)
- **Drag performer onto act**: adds the performer as a participant in that act

## Stage

A Stage is the full saved state of the canvas — all performers, acts, configs.

- Stages are saved locally to the project directory
- Multiple stages can be created for the same project
- The current stage name appears in the top toolbar

## Drafts

Performers and acts can be saved as **local drafts** before publishing to the registry.

Drafts are stored locally and can be edited further or published when ready.

## Does the assistant know which assets are in the registry?

No. The assistant does not have live access to registry search results.

If the user asks "is there a Tal for X?", tell them to open the **Asset Library** and search there directly.

The assistant can guide them on what to look for and how to import it, but cannot list or fetch specific asset names automatically.

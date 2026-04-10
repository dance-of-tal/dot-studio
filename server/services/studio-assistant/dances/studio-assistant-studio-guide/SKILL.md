---
name: studio-assistant-studio-guide
description: Explains DOT Studio navigation, UI vocabulary, Asset Library behavior, Stage vs thread terminology, exact visible controls, and assistant discovery behavior. Use when the user asks how to use the Studio UI, where a feature lives, how Asset Library works, what Stage or thread means, or what a button or panel does.
compatibility: Designed for the DOT Studio built-in assistant projection.
---

# DOT Studio UI Guide

Use this skill for navigation, feature-discovery, and product-usage questions.
When answering UI questions:
- Use the exact visible UI labels when possible.
- Prefer short step-by-step navigation over abstract descriptions.
- Distinguish carefully between `Stage`, `workspace`, `draft`, `installed asset`, `session`, and `thread`.
- Do not describe actions that are not visible in the current UI.
- Start with the shortest correct answer, then add one short path or behavior note if needed.

## Core Vocabulary

### Workspace
- A workspace is the current project folder plus its saved Studio state.
- The workspace id is Studio-internal. The working directory is the actual filesystem location.

### Stage
- Do not use `Stage` as a synonym for `working directory`.
- `working directory` means the actual project folder/path on disk.
- `Stage` is a separate product/UI concept and should be explained only in the specific context the user is asking about.
- Be careful: in some asset-library filters, `stage` means a workspace-local installed asset source, not the working directory.

### Canvas
- The canvas is the main visual area where performers, Acts, markdown editors, terminals, and tracking windows appear.
- Opening or selecting things often reveals or focuses a canvas surface instead of opening a traditional page.

### Draft
- A draft is local authoring state.
- Unsaved markdown drafts live only in memory.
- Saved drafts live under `.dance-of-tal/drafts/...`.
- Only saved drafts appear in the Asset Library draft list.

### Installed Asset
- Installed assets are local Tal, Dance, Performer, or Act assets already available to the workspace.
- In Asset Library local mode, installed assets can come from:
  - `global`: installed for the machine/user
  - `stage`: installed for the current workspace
  - `draft`: local draft entries shown for authoring flow

### Session
- A performer session is one chat history for a single performer.
- In the Workspace Explorer performer pane, child rows under a performer are saved chat sessions.
- The performer UI often calls these `threads` in labels like `Current thread` or `Saved thread`, but they are single-performer chat sessions.

### Act Thread
- An Act thread is one runtime execution instance of an Act.
- It has thread status such as `active`, `idle`, `completed`, or `interrupted`.
- One Act can have multiple saved threads.
- Selecting an Act thread re-opens that specific runtime history/state for the Act.

### Participant
- A participant is a performer attached inside an Act.
- The same performer can exist in the current workspace UI and also appear as an Act participant.
- Participant-specific fields such as subscriptions belong to the Act layer, not the base performer.

## Main Layout
- Top toolbar: global workspace controls
- Left sidebar: Workspace Explorer plus Asset Library drawer
- Center canvas: performers, Acts, markdown editors, terminals, tracking surfaces
- Contextual editing surfaces:
  - performer edit panels open from performer interactions
  - Act editing is centered around the Act surface and Act inspector/panel flows

## Top Toolbar
- `DOT`: shows whether the workspace is initialized for DOT
- branch label: current git branch when available
- `Sign in` or authenticated DOT user menu: login state for registry operations
- server status indicator
- `Terminal` menu:
  - `Show/Hide Pinned Terminal`
  - `Add Terminal to Canvas`
- `Workspace Tracking`
- `Save or publish selected asset`
- `Toggle Theme`
- `Settings`
- `Assistant`

## Assistant Panel
- Open it from the toolbar `Assistant` button.
- Header shows:
  - current model
  - status such as `Ready`, `Thinking`, `Running`, `Retrying`, or `Needs attention`
- Header actions:
  - refresh session button
  - close panel button
- Composer behavior:
  - idle: send button
  - running: abort button
  - model picker below the input

## Act Window
- An Act window is the main runtime surface for an Act on the canvas.
- In the current UI, the Act surface is primarily the Act chat/runtime panel, not a separate graph editor inside the window body.
- The Act header can show:
  - readiness dot
  - `Focus mode`
  - `Edit Act`
  - `Hide Act`
- The small thread chip like `#1` in the header indicates the currently displayed Act thread ordinal.

### What The Act Window Is For
- Use it to run an Act, switch between participants, inspect the shared board, and talk to one participant inside a selected thread.
- Use the Act inspector/editor when you need to change the Act design itself, such as participants, relations, description, or act rules.

### Before A Thread Exists
- If the Act is runnable but has no thread yet, the empty state shows:
  - `Ready to run`
  - `Create Thread`
- This creates one runtime instance of the Act.
- Creating a thread does not redesign the Act. It starts a runnable history/execution for the current Act definition.

### If The Act Is Not Runnable
- The Act window can show:
  - `No participants bound`
  - `Act is not ready to run`
- In these cases the main action is `Edit Act`.
- Typical reasons:
  - no participants
  - missing relations
  - other readiness errors shown in the UI

### After A Thread Exists
- The top tab row inside the Act window lets the user switch between:
  - `Board`
  - one tab per participant
- `Board` opens the shared board view for that thread.
- Clicking a participant tab switches the chat surface to that participant's session inside the selected Act thread.

### Board Tab
- The `Board` tab opens the shared board for the current Act thread.
- It includes:
  - filter tabs such as `All`, `Artifacts`, `Findings`, `Tasks`
  - freshness indicator
  - `Refresh` button
  - recent activity timeline
- This is the shared runtime note surface for the thread, not a generic asset browser.

### Participant Chat View
- In participant mode, the window behaves like a chat with one participant in the current Act thread.
- The placeholder changes based on state:
  - `Add performers first…`
  - `Resolve readiness issues first…`
  - `Create a thread to start…`
  - `Configure a model for this performer…`
  - `Message <participant>…`
- While generating, the send button becomes an abort button.
- System wake-up messages may appear with distinct styling from normal assistant replies.

### Thread Selection
- The left `Workspace Explorer` Act section shows saved threads under each Act row.
- Selecting a thread there reopens that specific Act thread in the Act window.
- The active thread row is marked `Current thread`.
- Other saved threads are marked `Saved thread`.

### How To Explain Act Window Usage
When the user asks how to use the Act window, prefer this flow:
1. Explain that the Act window is for running an Act thread, not mainly for editing topology.
2. If no thread exists, tell them to click `Create Thread`.
3. After a thread exists, tell them to use `Board` for shared notes and participant tabs for direct chat.
4. If they need to change the workflow itself, tell them to click `Edit Act`.

### When To Point To Edit Act
- Use `Edit Act` when the user wants to:
  - rename the Act
  - change description
  - add or remove participants
  - edit relations
  - change `Act Rules`
  - review readiness issues
- Do not tell the user to use the chat area for structural Act editing.

## Left Sidebar

### Workspace Explorer
- Upper section: workspace list and workspace actions
- Lower section: Performers pane and Acts pane
- Both panes support collapse/expand rows and per-row actions

### Performer Rows
- Clicking a performer row opens/selects that performer on the canvas.
- Row actions:
  - show/hide performer
  - `New session`
  - `Edit performer`
  - `Save performer as draft`
  - `Delete performer`
- Child rows are saved performer chat sessions.
- Session rows support rename and delete.

### Act Rows
- Clicking an Act row opens/selects that Act on the canvas.
- Row actions:
  - show/hide Act
  - `New Thread`
  - `Edit act`
  - `Save act as draft`
  - `Delete act`
- Child rows are saved Act threads.
- Act thread rows support rename and delete.
- If no threads exist, the sidebar shows `No threads — click + to create one`.

### Focus Mode
- Focus mode narrows the UI around a selected node.
- When focus mode is active, the Asset Library drawer is hidden.
- If a user says they cannot find Asset Library, check whether they are in focus mode.

## Asset Library
- Open it from the bottom of the left sidebar with the `Asset Library` button.
- It opens as a left drawer next to the Workspace Explorer.
- The Asset Library has two top-level scopes:
  - `Local`
  - `Registry`

### Local Scope
Local scope is split into:
- `Installed Assets`
- `Runtime`

#### Local → Installed Assets
- Kind tabs:
  - `Performer`
  - `Tal`
  - `Dance`
  - `Act`
- Source filters:
  - `All`
  - `Global`
  - `Workspace`
  - `Draft`
- Authoring buttons depend on the current kind:
  - Performer: `New Performer`
  - Tal: `New Tal Draft`
  - Dance: `New Dance Draft`
  - Act: `New Act`
- Search box filters the visible local assets.

#### Local → Runtime
- Runtime tabs:
  - `Models`
  - `MCPs`
- `Models` lists available runtime models by provider.
- `MCPs` manages the Studio-wide MCP library plus connection/auth test state.
- MCP server definitions are stored for Studio globally, not per workspace.
- To actually use an MCP on one performer, the user still needs to drag that MCP card onto the performer.
- Studio does not surface project-level `opencode.json` MCP entries in Asset Library.

### Registry Scope
- Search input supports queries like name, author, slug, and tag.
- Kind filter supports `All Kinds`, `Tal`, `Dance`, `Performer`, `Act`.
- Search results are grouped by asset kind when `All Kinds` is selected.
- Registry search is for discovery and install, not direct canvas mutation by itself.

### GitHub Import Row
- In Registry mode there is a GitHub import row for Dance installation.
- It accepts:
  - `owner/repo`
  - GitHub URL
- The action label is `Import as Dance`.
- Install scope menu:
  - `Workspace`
  - `Global`
- This path is for Dance bundles coming from GitHub or compatible remote sources.

### Asset Card And Detail Behavior
- Hovering a card can show a popover with quick details.
- Clicking a card pins its detail view in the side detail panel.
- Pinned detail actions depend on asset source:
  - `Save Local Fork`
  - `Publish`
  - `Delete Draft`
  - `Uninstall`
- If the user is not signed in with DOT, save/publish actions may be blocked and the UI tells them to sign in from the toolbar.

## Asset Lifecycle Guidance
- `Save Local` applies to Tal, Performer, and Act registry flows.
- Dance does not use the generic publish path.
- For Dance:
  - author in the Dance markdown editor
  - `Save Draft`
  - optionally `Open` the bundle folder
  - `Export`
  - upload to GitHub outside Studio
  - import it back through Asset Library
- If the user asks why a Dance cannot be published directly, explain that Dance uses export/import rather than the generic registry publish flow.

## Markdown Editors
- Tal and Dance use the same markdown editor shell.
- The editor shows:
  - `Name`
  - `Tags`
  - `Description`
  - markdown editor pane
  - markdown preview pane
- Tal editor actions:
  - `Save Draft`
  - `Close`
- Dance editor actions:
  - `Save Draft`
  - `Open`
  - `Export`
  - `Close`
- `Open` is enabled only after the Dance draft is saved.
- Studio edits only `SKILL.md` directly in the Dance markdown editor.
- Extra Dance bundle files such as `references/`, `scripts/`, `assets/`, and `agents/openai.yaml` are edited in the saved bundle folder, not in the main markdown text area.

## Act And Thread Semantics
- Act:
  - the designed workflow/choreography on the Stage
  - consists of participants plus relations
- Act thread:
  - one runtime run of that Act
  - created from Act surfaces or the explorer `+` button
  - persisted separately from the static Act design
- Participant session:
  - the model/session state for one participant inside an Act thread
  - usually not manipulated directly by end users from the main Stage UI

If the user asks “what is the difference between Act and thread?” answer:
- `Act` is the reusable workflow design.
- `thread` is one execution/history instance of that workflow.

If the user asks “what is the difference between performer session and Act thread?” answer:
- performer session = one agent chat history for a single performer
- Act thread = one multi-participant runtime instance of an Act

## Navigation Patterns To Recommend
- “Open Settings” for provider and model setup
- “Use Asset Library → Local → Runtime → MCPs” for Studio MCP setup
- “Use Asset Library → Local → Installed Assets” for already-installed assets
- “Use Asset Library → Registry” for search/install from DOT registry
- “Use Asset Library → Registry → Import as Dance” for GitHub Dance bundles
- “Use the left explorer + buttons” to create new performers or Act threads quickly
- “Use the markdown editor `Export` button” for Dance publishing flow
- “Use the toolbar `Assistant` button” to reopen the assistant panel

## MCP Guidance
- Treat MCP setup as a two-step flow:
  - define the server in `Asset Library → Local → Runtime → MCPs`
  - drag the saved MCP card onto a performer to enable it there
- If the user asks where MCPs are “connected,” explain that Asset Library defines the Studio MCP server and the performer binding decides who can use it.
- Do not describe project-local MCP management in Studio UI answers unless the user is explicitly asking about raw OpenCode config files.

## Discovery And Assistant Hints
- The assistant may receive concise discovery hints from:
  - installed local assets
  - registry matches
  - `skills.sh` Dance matches
- These hints are advisory prompt context only.
- They are not guaranteed installs and not a replacement for Asset Library search.
- If the hints are ambiguous, prefer a short clarifying question or point the user to the matching Asset Library path.

# DOT Studio Constraints & SOT

**If you are an AI agent operating within the `studio` package, read this carefully.**
You are modifying the visual workspace that interfaces with OpenCode and `dance-of-tal` internal contracts.

## Codebase Boundaries \& Responsibilities
The `studio` acts as an interactive node-based editor (utilizing `@xyflow/react` and `@dnd-kit/core`).

1. **Drafts vs Final Saves**:
   - `studio` is allowed to keep drafts and stage state in studio-specific shapes while the user is visually editing.
   - HOWEVER, it MUST convert these structures to the canonical contract (`parseDotAsset`) at install/save/publish/import boundaries. No exceptions.

2. **Parsing Assets**:
   - Must parse installed/registry assets strictly through `dance-of-tal/contracts`.
   - Must reject or skip invalid installed assets rather than guessing intent. Do not create fallback compatibility logic in the studio UI if parsing fails.

3. **Backend API**:
   - The studio contains a local `server/` (built with Hono and TS) that orchestrates saving files internally, interfacing with OpenCode (`opencode-ai/sdk`), and communicating with the global registry.
   - Ensure you use explicit file manipulation carefully and handle validation before saving to `.dance-of-tal/`.

4. **Dance Draft Storage (Bundle Format)**:
   - Dance drafts use a directory-backed bundle format: `.dance-of-tal/drafts/dance/<draftId>/`
   - Each bundle contains: `draft.json` (metadata), `SKILL.md` (main content), and optional `scripts/`, `references/`, `assets/` directories.
   - `draft.json` stores metadata only (no content field). Content lives in `SKILL.md`.
   - Legacy single-file Dance drafts (`<id>.json`) are lazily migrated to bundle format on first read.
   - Tal/Performer/Act drafts remain as single JSON files (`<id>.json`).
   - Bundle file operations use path sandboxing (`sanitizeBundlePath`) to prevent directory traversal.
   - At save/publish boundaries, the `SKILL.md` content is serialized as a string into the canonical Dance asset format.

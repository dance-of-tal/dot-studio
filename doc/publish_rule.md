# Studio Publish Rules

## Asset Lifecycle
- `draft`
  - `unsaved`: memory only, not on disk, not publishable
  - `saved`: stage-local draft persisted under `.dance-of-tal/drafts/...`
- `local asset`
  - canonical asset saved under `.dance-of-tal/assets/...`
- `published asset`
  - available from the registry

## Draft Rules
- Tal and Dance drafts are authored in the markdown editor.
- Performer and Act drafts are Studio-only authoring state and may be promoted during `Publish`.
- Before the first save, markdown drafts stay in `unsaved` memory state only.
- After the first save, edits update the saved draft.
- Only saved drafts appear in the asset library draft list.

## Authoring Rules
- Tal and Dance use the same markdown editor shell.
- Studio edits only `SKILL.md` for Dance.
- Extra Dance files such as `scripts/`, `references/`, and `assets/` are edited outside the Studio markdown surface.
- Dance bundle folders are identified by draft id. Renaming the bundle folder is not supported.

## Canonical Boundary Rules
- All shared-boundary URNs are canonical 4-segment URNs: `kind/@owner/stage/name`.
- For Studio-authored Tal, Performer, and Act assets, `stage` is derived from the sanitized working-directory basename.
- Studio drafts may stay incomplete internally, but `Save Local`, `Publish`, `Export`, install, and registry boundaries use canonical contract shapes only.

## Dance Export Rules
- Dance does not use the generic registry publish flow.
- Dance export is started from the Dance editor with `Export`.
- The user chooses a destination parent directory, and Studio exports to `<parent>/<slug>/`.
- Exported bundles exclude `draft.json` and other Studio-only metadata.
- Studio does not auto-run git commands, validate GitHub repositories, or register exported Dances.
- After export, the user uploads the bundle to GitHub and installs it from Asset Library.

## Generic Publish Rules
- Generic publish is only for Tal, Performer, and Act.
- Dance is excluded from the generic publish picker.
- Generic publish uses the shared `dot` publish planner.
- `Save Local` remains explicit and never auto-cascades dependencies.
- `Publish` may auto-cascade JSON assets only: Tal, Performer, and Act.

## Cascade Rules
- Tal can publish directly or be auto-published as a dependency.
- Performer publish auto-cascades draft Tal dependencies by promoting them to canonical in-memory assets for publish only.
- Act publish auto-cascades draft Performer dependencies, and also cascades any nested draft Tal dependencies they reference.
- Installed or stage-local Tal, Performer, and Act dependencies may also be published through the same planner when needed.
- Dance never cascades from Performer or Act publish.
- Auto-cascade applies on `Publish` only, never on `Save Local`.

## Blocking Rules
- Performer publish is blocked when it references a draft Dance.
- Performer publish is blocked when it references a local-only Dance that has not been exported, uploaded to GitHub, and imported from Asset Library.
- Act publish is not blocked just because a participant performer is still a draft.
- Act publish is not blocked just because a nested Tal is still a draft.
- Act publish is blocked when any participant performer depends on a draft or local-only Dance.
- Publish is blocked when a required draft dependency is missing or malformed and cannot be promoted to a canonical asset.

## UX Rules
- Dance editor actions: `Save Draft`, `Open`, `Export`, `Close`
- `Open` is enabled only after the Dance draft is saved.
- Generic publish picker shows Tal, Performer, and Act only.
- Performer publish preflight may show draft Tal as `Will publish from draft`.
- Generic publish UI should explain Dance blockers with `Export -> GitHub upload -> Asset Library import -> re-apply`.
- When a publish succeeds through cascade, dependency assets are published before the root asset.

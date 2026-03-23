// dot Package Re-exports — Server Only
// Functions from dot that require Node.js runtime (file I/O, HTTP, etc.)
// For dot TYPES, import from 'shared/dot-types.ts' instead.

export {
    assetFilePath,
    danceAssetDir,
    ensureDotDir,
    getAssetPayload,
    getDotDir,
    getGlobalCwd,
    getGlobalDotDir,
    initRegistry,
    readAsset,
} from 'dance-of-tal/lib/registry'

export {
    getRegistryPackage,
    reportInstall,
    searchRegistry,
} from 'dance-of-tal/lib/registry-api'

export {
    installActWithDependencies,
    installPerformerWithDeps,
} from 'dance-of-tal/lib/dependency-resolver'

export {
    installAsset,
} from 'dance-of-tal/lib/installer'

export {
    readAuthUser,
    saveAuthToken,
    clearAuthUser,
    startLogin,
} from 'dance-of-tal/lib/auth'

export {
    getPayloadTags,
    loadLocalAssetByUrn,
    parseUrn,
    publishSingleAsset,
    resolveDependencies,
} from 'dance-of-tal/lib/publishing'

export {
    parseDotAsset,
    parsePerformerAsset,
    parseActAsset,
    slugFromUrn,
} from 'dance-of-tal/contracts'

// Server convenience re-exports of types from shared/dot-types.ts
// Server code can import types from either dot-source or shared/dot-types.
export type {
    PerformerAssetV1,
    ActAsset,
    ActAssetPayloadV1,
    ActRelationV1,
    ActParticipantV1,
    ActParticipantSubscriptionsV1,
} from '../../shared/dot-types.js'

export {
    assetFilePath,
    ensureDotDir,
    getAssetPayload,
    getDotDir,
    getGlobalCwd,
    getGlobalDotDir,
    getPerformer,
    initRegistry,
    listLockedPerformerNames,
    readAsset,
} from '../../../dot/src/lib/registry.js'

export {
    getRegistryPackage,
    installActWithDependencies,
    installAsset,
    installPerformerAndLock,
    searchRegistry,
} from '../../../dot/src/lib/installer.js'

export {
    getPayloadTags,
    loadLocalAssetByUrn,
    parseUrn,
    publishSingleAsset,
    resolveDependencies,
} from '../../../dot/src/lib/publishing.js'

export {
    readAgentManifest,
    writeAgentManifest,
} from '../../../dot/src/lib/agents.js'

export type {
    LockedPerformer,
    Performer,
} from '../../../dot/src/data/types.js'

// dot Contract Types — Single Source of Truth for all dot type imports
// This is the ONLY file that imports types directly from 'dance-of-tal'.
// Both shared/ and server/ code should import dot types from here.

export type {
    // ── Act ────────────────────────────────────────────
    ActRelationV1,
    ActParticipantV1,
    ActParticipantSubscriptionsV1,
    ActAssetPayloadV1,
    ActAsset,

    // ── Performer ──────────────────────────────────────
    PerformerAsset,
    PerformerAssetPayloadV1,

    // ── Tal / Dance ────────────────────────────────────
    TalAsset,
    TalAssetPayloadV1,
    DanceAsset,
    DanceAssetPayloadV1,

    // ── Base ───────────────────────────────────────────
    DotAssetBase,
    DotAssetKind,
    ModelConfigV1,
} from 'dance-of-tal/data/types'

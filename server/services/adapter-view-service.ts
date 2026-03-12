import type { AdapterViewActionRequest, AdapterViewProjection } from '../../shared/adapter-view.js'

export async function listAdapterViewProjections(_performerId?: string): Promise<AdapterViewProjection[]> {
    return []
}

export async function dispatchAdapterViewAction(_request: AdapterViewActionRequest) {
    throw new Error('Performer Adapter View is planned but not implemented yet.')
}

import type { AdapterViewActionRequest, AdapterViewProjection } from '../../shared/adapter-view.js'

export async function listAdapterViewProjections(performerId?: string): Promise<AdapterViewProjection[]> {
    void performerId
    return []
}

export async function dispatchAdapterViewAction(request: AdapterViewActionRequest) {
    void request
    throw new Error('Performer Adapter View is planned but not implemented yet.')
}

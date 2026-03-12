export type AdapterViewWidget =
    | {
        id: string
        type: 'stat'
        label: string
        value: string | number | null
    }
    | {
        id: string
        type: 'list'
        title: string
        items: string[]
    }
    | {
        id: string
        type: 'table'
        title: string
        columns: string[]
        rows: Array<Array<string | number | null>>
    }

export type AdapterViewSpec = {
    id: string
    title: string
    version: 1
    widgets: AdapterViewWidget[]
}

export type AdapterViewProjection = {
    performerId: string
    adapterId: string
    title: string
    updatedAt: number
    widgets: AdapterViewWidget[]
}

export type AdapterViewUpdateEvent = {
    type: 'adapter.updated'
    projection: AdapterViewProjection
}

export type AdapterViewClearEvent = {
    type: 'adapter.cleared'
    performerId: string
    adapterId: string
}

export type AdapterViewEvent = AdapterViewUpdateEvent | AdapterViewClearEvent

export type AdapterViewActionRequest = {
    performerId: string
    adapterId: string
    actionId: string
    input?: Record<string, unknown>
}

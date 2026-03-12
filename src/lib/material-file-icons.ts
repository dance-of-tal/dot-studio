const iconUrlCache = new Map<string, string>()
let materialFileIconsModule: Promise<typeof import('material-file-icons')> | null = null

function svgToDataUrl(svg: string) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export async function loadMaterialFileIconForPath(path: string) {
    if (!path) {
        return ''
    }

    const cached = iconUrlCache.get(path)
    if (cached) {
        return cached
    }

    materialFileIconsModule = materialFileIconsModule || import('material-file-icons')
    const { getIcon } = await materialFileIconsModule
    const icon = getIcon(path)
    const url = svgToDataUrl(icon.svg)
    iconUrlCache.set(path, url)
    return url
}

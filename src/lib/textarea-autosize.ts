export function resizeTextarea(
    textarea: HTMLTextAreaElement | null,
    maxHeight = 102,
) {
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

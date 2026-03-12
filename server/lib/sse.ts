/**
 * SSE (Server-Sent Events) response helpers.
 * Extracts duplicated boilerplate from chat, compile, and adapter routes.
 */

const SSE_HEADERS = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
} as const

const encoder = new TextEncoder()

/**
 * Wrap a ReadableStream in an SSE Response with correct headers.
 */
export function createSSEResponse(stream: ReadableStream): Response {
    return new Response(stream, { headers: SSE_HEADERS })
}

/**
 * Encode a data payload as an SSE frame (`data: ...\n\n`).
 */
export function sseEncode(data: string): Uint8Array {
    return encoder.encode(`data: ${data}\n\n`)
}

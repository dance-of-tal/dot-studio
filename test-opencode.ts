import { createOpencodeClient } from '@opencode-ai/sdk/v2'

async function run() {
    const oc = createOpencodeClient({
        baseURL: 'http://localhost:4096'
    })

    console.log('Creating session...')
    const sessionRes = await oc.session.create({
        directory: process.cwd(),
        title: 'Test Session',
    })
    const sessionId = sessionRes.data?.id ?? sessionRes.data?.sessionId

    if (!sessionId) {
        console.error('Failed to create session:', sessionRes)
        return
    }
    console.log('Session ID:', sessionId)

    console.log('Sending promptAsync...')
    const promptRes = await oc.session.promptAsync({
        sessionID: sessionId,
        directory: process.cwd(),
        agent: '', // Use default agent
        parts: [{ type: 'text', text: 'Hello, World!' }]
    })
    console.log('promptAsync response:', promptRes.response?.status, promptRes.response?.statusText)

    console.log('Fetching messages immediately...')
    let messagesRes = await oc.session.messages({
        sessionID: sessionId,
        directory: process.cwd(),
    })
    console.log('Messages count:', messagesRes.data?.length)
    if (messagesRes.data?.length > 0) {
        console.log('First message:', messagesRes.data[0])
    }

    await new Promise(r => setTimeout(r, 2000))

    console.log('Fetching messages after 2s...')
    messagesRes = await oc.session.messages({
        sessionID: sessionId,
        directory: process.cwd(),
    })
    console.log('Messages count:', messagesRes.data?.length)

    console.log('Checking status...')
    const statusRes = await oc.session.status({
        directory: process.cwd(),
    })
    console.log('Status for session:', statusRes.data?.[sessionId])
}

run().catch(console.error)

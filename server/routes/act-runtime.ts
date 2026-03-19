import { Hono } from 'hono'
import actRuntimeTools from './act-runtime-tools.js'
import actRuntimeThreads from './act-runtime-threads.js'

const actRuntime = new Hono()

actRuntime.route('/', actRuntimeTools)
actRuntime.route('/', actRuntimeThreads)

export default actRuntime

import { setTimeout } from 'node:timers/promises';
import { createRuntime } from './runtime.js';
import { Workflows } from './workflows.js';
const runtime = createRuntime();
const workflow = new Workflows(runtime.db, runtime.provider, runtime.billing, runtime.config);
let stopping = false;
process.once('SIGTERM', () => { stopping = true; });
process.once('SIGINT', () => { stopping = true; });
try {
  while (!stopping) {
    try { await workflow.expireSubscriptions(); if (!await workflow.runProvisioningOnce()) await setTimeout(1000); }
    catch { console.error(JSON.stringify({ code: 'WORKER_RETRY', message: 'Worker will retry.' })); await setTimeout(2000); }
  }
} finally { await runtime.db.$disconnect(); runtime.redis.disconnect(); }

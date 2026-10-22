import { defineConfig } from 'tsup';
export default defineConfig({ entry: ['src/server.ts', 'src/worker.ts', 'src/integration-server.ts'], format: ['esm'], target: 'node22', sourcemap: true, clean: true, noExternal: [/^@konekte\//] });

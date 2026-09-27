import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['services/api/test/**/*.test.ts'], fileParallelism: false, testTimeout: 20_000, hookTimeout: 30_000, reporters: ['default'] } });

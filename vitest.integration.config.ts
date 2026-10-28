import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
config({ path: '.env.test' });
export default defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }, test: { include: ['tests/**/*.integration.test.ts'], environment: 'node', fileParallelism: false, testTimeout: 20000, hookTimeout: 20000 } });

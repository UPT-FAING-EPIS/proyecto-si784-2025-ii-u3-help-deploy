import { defineConfig } from '@vscode/test-cli';

// Use a simple workspace without spaces to avoid path issues on Windows
export default defineConfig({
  files: 'out/test/**/*.test.js',
  workspace: 'test-workspace',
});

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, prettier, {
  // plain node fixtures that run inside Docker containers, not part of this project's TS toolchain
  ignores: ['dist', 'node_modules', 'src-test/car-marketplace/**/server.js'],
});

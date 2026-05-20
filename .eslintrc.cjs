module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', '.next', 'node_modules'],
  rules: {
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
  overrides: [
    {
      files: ['apps/web/**/*.{ts,tsx}'],
      extends: [
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'plugin:@next/next/recommended',
      ],
      settings: {
        next: {
          rootDir: ['apps/web/'],
        },
        react: {
          version: 'detect',
        },
      },
    },
    {
      files: ['apps/api/**/*.ts', 'packages/**/*.ts'],
      env: {
        node: true,
      },
    },
    {
      files: ['**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};

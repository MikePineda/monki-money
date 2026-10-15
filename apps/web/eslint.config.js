// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import angular from 'angular-eslint'

export default tseslint.config(
  { ignores: ['dist/', '.angular/', 'coverage/', 'public/'] },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      // Elements for composite components; attributes for components that
      // enhance a native element (`button[appButton]`) so semantics stay native.
      '@angular-eslint/component-selector': [
        'error',
        [
          { type: 'element', prefix: 'app', style: 'kebab-case' },
          { type: 'attribute', prefix: 'app', style: 'camelCase' },
        ],
      ],
      '@angular-eslint/prefer-standalone': 'error',
      '@angular-eslint/prefer-signals': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      // Static inline styles are banned (use tokens through classes); bindings
      // whose value is data-driven (a bar width, a progress value) are allowed.
      '@angular-eslint/template/no-inline-styles': ['error', { allowBindToStyle: 'dynamic' }],
      '@angular-eslint/template/prefer-control-flow': 'error',
    },
  }
)

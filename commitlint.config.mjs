/**
 * Conventional Commits, enforced locally (lefthook commit-msg) and in CI on
 * pull requests. release-please derives the version bump and CHANGELOG.md
 * from these messages, so the type matters:
 *   feat -> minor, fix -> patch, `!` or BREAKING CHANGE -> major (minor while 0.x).
 * `security` is an extra type for security fixes.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  // Dependabot writes sentence-case subjects ("Bump the tooling group") and
  // cannot be configured otherwise; its commits are signed off by the bot.
  ignores: [(message) => /^Signed-off-by: dependabot\[bot\]/m.test(message)],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'security',
        'style',
        'test',
      ],
    ],
    // Long URLs and trailers (Co-Authored-By, session links) must not fail the lint.
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
  },
}

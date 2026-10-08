/**
 * Accounts whose comments are not a question waiting on anyone.
 *
 * `gh pr list --json comments` exposes only `login` on the author, with no bot
 * flag, so this matches on the name: the `[bot]` suffix GitHub Apps carry, plus
 * the bare logins the common CI integrations post under. Left as a list rather
 * than a setting because a wrong entry here only costs one row's hint.
 */
const BOT_LOGINS = new Set([
  "github-actions",
  "dependabot",
  "codecov",
  "renovate",
  "vercel",
  "netlify",
  "sonarcloud",
]);

export function isBotLogin(login: string): boolean {
  return login.endsWith("[bot]") || BOT_LOGINS.has(login.toLowerCase());
}

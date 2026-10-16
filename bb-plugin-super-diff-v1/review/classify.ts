// Which files a reviewer reads past: lockfiles, snapshots, and generated
// output. They go in their own collapsed group, so the agent does not have to
// place them, though it may put one in a concern when it shows the change.

const MECHANICAL = [
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|Gemfile\.lock|poetry\.lock|composer\.lock|uv\.lock|go\.sum)$/,
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  /(^|\/)(dist|generated|__generated__)\//,
  /\.generated\.[a-z]+$/,
  /\.min\.(js|css)$/,
];

export function isMechanical(path: string): boolean {
  return MECHANICAL.some((pattern) => pattern.test(path));
}

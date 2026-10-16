// Which paths are tests and test output. Pure, with no imports, so the panel
// can use it as well as the server.

export const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(\/__tests__\/.+\.[cm]?[jt]sx?$)/;

export function isTestFile(path: string): boolean {
  return TEST_FILE.test(path);
}

/** Where Jest and Vitest write a test file's snapshots by default. */
export function snapshotPathFor(testPath: string): string {
  const at = testPath.lastIndexOf("/");
  return `${testPath.slice(0, at + 1)}__snapshots__/${testPath.slice(at + 1)}.snap`;
}

/**
 * A test file or recorded test output: anything under `__snapshots__/` or
 * ending in `.snap`, wherever the runner was configured to write it.
 */
export function isTestSide(path: string): boolean {
  return isTestFile(path) || /(^|\/)__snapshots__\//.test(path) || path.endsWith(".snap");
}

// Whose page it is: one person, by login, or a team, as the set of its
// members' logins. Every list on a person's page reads the same for a team,
// counting what any member did. Pure.

/** A login, or the logins of a team's members. */
export type Who = string | ReadonlySet<string>;

/** Whether `login` is the person, or one of the team's members. */
export function isWho(who: Who, login: string | null | undefined): login is string {
  if (login === null || login === undefined) return false;
  return typeof who === "string" ? who === login : who.has(login);
}

/** The logins, in a stable order. */
export function loginsOf(who: Who): string[] {
  return typeof who === "string" ? [who] : [...who].sort((a, b) => a.localeCompare(b));
}

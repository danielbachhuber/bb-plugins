# bb-plugin-thread-todos

A forwarding stub. [Thread Overview](../bb-plugin-thread-overview) replaced
this plugin; what is left keeps threads started before the switch working.

A thread keeps the instructions it started with until its session restarts,
and every thread started under Thread Todos was told to run `bb todo` and call
`todo_add`, `todo_complete`, and `todo_reopen`. So those still exist here, and
each one forwards to Thread Overview, which now owns the steps:

| Old call | Forwards to |
| --- | --- |
| `bb todo`, `bb todo list` | `overview_get` |
| `bb todo add`, `todo_add` | `overview_add` |
| `bb todo done`, `todo_complete` | `overview_set_status` with `done` |
| `bb todo reopen`, `todo_reopen` | `overview_set_status` with `todo` |

The answer comes back in the `[ ]` / `[x]` list those threads already read. A
current step shows as open. When Thread Overview is not installed, every call
fails with a message saying so, rather than answering with an empty list that
would read as "nothing left to do".

It contributes no instructions, so new threads hear only about `bb overview`,
and it draws no UI.

## When to uninstall it

```sh
bb todo last-used
```

says when a thread last called it, which thread, and through which command or
tool. Once no thread started before the switch is still running, nothing will
call it again and it can go:

```sh
bb plugin uninstall thread-todos
```

## The old list

The `todos` table stays, read-only, so Thread Overview can import it. Its
`todos_export` RPC returns every row; Thread Overview calls it once, the first
time both plugins are running, and records that it did.

## Layout

- `todos/forward.ts` — the calls to Thread Overview, and rendering its steps in
  the old list format.
- `todos/list.ts` — that list format, pure.
- `todos/cli.ts` — argv parsing for `bb todo`, pure.
- `todos/store.ts` — the old table and the record of the last forwarded call.
- `todos/contract.ts` — the `todos_export` RPC.
- `server.ts` — the tools, the CLI, and the export.

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload thread-todos
```

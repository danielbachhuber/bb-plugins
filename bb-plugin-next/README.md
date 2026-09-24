# bb-plugin-next

A [bb](https://getbb.app) plugin that puts what you have to do next on one
page, gathered from your sources. [Todoist](https://todoist.com) is the first
source.

## What it adds

A **Next** page in the left sidebar. It loads every configured source at once
and merges their items into one list, soonest due first, most urgent first
within a day, and undated items last. Each row has the item's title (linking
to it in its source), description, due date, tags, where it lives in its
source (a Todoist project, for example), and a P1–P3 tag. Overdue dates are
red and today's are green; a recurring item has a repeat icon. The refresh
button loads the list again.

Above the list, each source that loaded shows its name, what it was asked for,
and how many items it returned. A source that is not set up shows what to
configure, and a source that failed shows its error. Either way the other
sources' items still appear.

The page only reads. Completing or editing an item still happens in its
source.

## Sources

### Todoist

The open tasks matching one
[Todoist filter query](https://todoist.com/help/articles/introduction-to-filters-V98wIH).
Copy your API token from Todoist under Settings → Integrations → Developer,
then save it:

```sh
bb plugin config next set todoistApiToken <token>
```

The filter defaults to `today | overdue`. To change it:

```sh
bb plugin config next set todoistFilter "#Work & (today | overdue | p1)"
```

Settings are read on every refresh, so a change shows up the next time the
page loads or you press refresh. The token is a bb secret setting, stored
under `~/.bb` and never sent to the frontend.

One refresh makes two requests to the Todoist API v1, in parallel:
`GET /api/v1/tasks/filter` with the saved query, and `GET /api/v1/projects` to
name each task's project. Both follow `next_cursor` 200 items at a time.
Nothing runs in the background, and nothing is requested until a token is set.

## Adding a source

A source is a `Source` from `next/sources.ts`: an id, a name, the query it
reports, and a `load()` that returns its status and its items as `Item`s
(`next/types.ts`). Give it a directory of its own beside `todoist/`, add its
settings to `server.ts` with the source's name as a prefix, and add it to the
list `server.ts` passes to `loadSources`.

## Layout

| Path | What it holds |
| --- | --- |
| `next/types.ts` | The `Item` shape every source produces |
| `next/sources.ts` | The `Source` interface, and loading every source into one list |
| `next/items.ts` | The order the merged list is in |
| `next/due.ts` | How a due date reads ("Today 14:00", "Tuesday", "Jan 15, 2027") and its color |
| `next/contract.ts` | The `items_list` RPC contract |
| `next/item-list.tsx` | The page's display component, which loads nothing itself |
| `todoist/api.ts` | The only module that calls Todoist: auth, pagination, and error messages |
| `todoist/normalize.ts` | Turning Todoist task payloads into items |
| `todoist/source.ts` | Todoist as a `Source`, built from its settings |
| `item-list.stories.tsx` | The page in every state, for `npm run storybook` at the root |
| `server.ts` | The settings and the `items_list` handler |
| `app.tsx` | The sidebar page, which loads the list and passes it to the display component |

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload next
```

For visual changes, run `npm run storybook` at the repository root and open
**next / Item list**.

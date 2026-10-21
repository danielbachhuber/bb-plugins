# <Display name>

<bb.description, word for word.>

![<What the screenshot shows, in one sentence>](screenshots/<story>.png)

## Key features

### <What the user gets, and where: "A context meter above the composer">

![<What this screenshot shows, in one sentence>](screenshots/<story>.png)

<Two to five sentences: what the user sees here and what they do, with UI labels such as **Compact** in bold.>

### <The next feature>

![<What this screenshot shows>](screenshots/<story>.png)

<Two to five sentences.>

## For agents

The `<skill-name>` skill tells agents when and how to use it.

```sh
bb <id> <command> [options]   # <what it does>
bb <id> <command>             # <what it does>
```

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `<key>` | `<default>` | <One sentence.> |

## Requirements

<Each account, CLI, and plugin it needs. How many API calls it makes, and when.>

## Related plugins

_As of <Month D, YYYY>_

- **[<Display name>](https://getbb.app/marketplace/<entry-id>)** (`<entry-id>`), <"bundled with bb", when it is>: <What it does. How this plugin is similar or different.>

## Develop

```sh
npm install
npx tsc --noEmit
npm test
bb plugin build . && bb plugin reload <id>
```

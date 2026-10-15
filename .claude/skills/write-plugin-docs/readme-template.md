# <Display name>

<bb.description, word for word.>

![<What the screenshot shows, in one sentence>](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/<id>/<story>.png)

## Use

- <Where to find it: **Panel name** in the sidebar, the band above the composer, …>
- <The main thing you do there.>
- <A second thing you do, if there is one.>

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

- **<Display name>** (`<entry-id>`), <"bundled with bb", when it is>: <What it does. How this plugin is similar or different.>

## Develop

```sh
npm install
npx tsc --noEmit
npm test
bb plugin build . && bb plugin reload <id>
```

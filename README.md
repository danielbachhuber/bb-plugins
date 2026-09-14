# bb-plugins

Plugins for [bb](https://getbb.app), the agentic IDE.

## ⚠️ This repository is public

Nothing here may contain a credential, a real private repository or project
name, or any content copied out of a thread. Anything personal is a plugin
setting held in `~/.bb`, never a constant in the source. Test fixtures use
invented names (`acme/widgets`, `octocat`, `Acme Board`) for the same reason.

Nothing under `~/.bb` belongs in this repository either: plugin settings,
secrets, HTTP tokens, and `data.db` all live there and all stay there.

## The plugins

| Directory | bb id | What it does |
| --- | --- | --- |

## Installing

Each directory is an ordinary bb plugin package with its own `package.json` and
`bb` manifest. `.bb/plugins.json` indexes them so one checkout can serve them
all:

```sh
cd bb-plugin-<name> && npm install
bb plugin install path:"$PWD/../" --plugin <id>
```

bb loads them from this checkout as a `path:` source, so an edit here is live
after `bb plugin build` and `bb plugin reload <id>`.

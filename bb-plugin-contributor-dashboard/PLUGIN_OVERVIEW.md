## What you get

A **Contributor Dashboard** page in the sidebar about how people contribute to
one GitHub repository, over 6 weeks, 12 weeks, 6 months, or a year. Its first
section, **Review velocity**, charts for each person the reviews requested of
them and the reviews they gave, week by week.

## How it works

The plugin keeps a copy of the repository's pull requests and reviews in its
own database, synced through the `gh` CLI when the page opens and the copy is
more than 30 minutes old, or when you press Sync. The first sync reaches back
two years; later ones fetch only what changed. The page reads only the local
copy.

Set the repository with
`bb plugin config contributor-dashboard set repository owner/name`, then
reload the plugin. `gh` must be signed in to an account that can read it.

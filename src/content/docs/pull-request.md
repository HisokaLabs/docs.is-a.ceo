---
title: "Pull request checks"
description: "The shape rules a pull request must satisfy, the review template, the labels, and the stale policy."
---

That shape is not a style preference. A claim and a change to the validator are reviewed differently, revert differently, and are worth reading on different days.

`scripts/check-format.js` enforces it, in its own job, before and separately from
the validator.

## The shape rules

| Rule | Message when it fails |
| --- | --- |
| Only `domains/` and the documentation | `a pull request may only add a file under domains/, or update the documentation. Move this change to its own pull request.` |
| `domains/_meta.json`, `domains/SCHEMA.json`, `.github/` and `CODEOWNERS` are maintainer-only | `only a maintainer can change this file. A claim PR touches its own domains/<name>.<zone>.json and nothing else.` |
| `scripts/`, `test/`, `dnsconfig.js`, `package.json` and `package-lock.json` are maintainer-only | `only a maintainer can change the validator, the DNS config or the test suite. Open a separate issue or pull request for that, and keep this one to your claim.` |
| At most four files under `domains/` | `this pull request touches 6 files under domains/; a claim PR adds one entry (plus its _vercel.<name> sidecar if Vercel asked for one). Split the rest into their own pull requests.` |
| The filename matches `<subdomain>.<zone>.json` | `the filename must be <subdomain>.<zone>.json, for example jane.is-a.ceo.json, @.is-a.ceo.json or _vercel.jane.is-a.ceo.json` |
| The filename matches the `subdomain` and `domain` inside | `the file claims "jane" in "is-a.ceo", so it must be named "jane.is-a.ceo.json"` |
| Two spaces, not tabs | `use two spaces for indentation, not tabs` |
| A final newline | `end the file with a newline` |
| Deleting an entry is a maintainer action | `deleting a name is a maintainer action. If you want to release your own subdomain, ask a maintainer, or open the pull request from the account named in "owner".` |

The documentation paths are `README.md`, `CONTRIBUTING.md`, `LICENSE`,
`.gitignore`, `.gitattributes` and anything under `docs/`. A claim pull request may
also fix a typo in one of those; it may not restructure them.

Four files under `domains/` is the real maximum: one claim plus its Vercel sidecar, with room to spare. Key order inside the file is not enforced, because it is taste rather than a rule a reviewer can read off the diff, and every existing entry orders its keys differently.

## Two jobs on purpose

`check.yml` splits the shape check from the validation, and the split is
deliberate.

The `format` job runs on every pull request with no path filter, because the shape rules apply whether or not the change touches `domains/`. The `validate` job keeps a filter so a docs-only pull request does not spend time pushing a zone check through DNSControl.

One job could not do both. It would have to either run the zone check on every pull request, or skip the shape rules on documentation changes.

## The review template

`.github/pull_request_template.md` asks for four things, and leaves two of them as
marked sections.

The author ticks five boxes: agreement to the Terms, a reachable URL, `owner` as their own username, one subdomain per person, and a passing `npm run verify` locally.

Then two sections, each wrapped in an HTML comment pair:

```
<!-- WEBSITE_PREVIEW_START -->
<!-- WEBSITE_PREVIEW_END -->
```

The comments are invisible in the rendered pull request, so what a reviewer reads is just the URL and the one-line purpose between them. They also give a script a stable place to look later. Nothing fills them today; the author writes both by hand, and the template's own comment says the preview is a link to where the site lives now, not the `is-a.ceo` name being applied for.

## The comment bot

`.github/workflows/registry-comment.yml` explains a failure in a comment, in
language the claimant can act on, before a maintainer has to.

It runs on `pull_request_target`, which is the only event that can comment on a fork's pull request with a write token. The cost of that event is that the workflow runs with the base repository's privileges while the code comes from the fork, so the job is built around one rule: **a fork must not be able to rewrite the script that judges it.**

Three things follow from that rule.

It checks out the base commit, not the pull request's head. It copies only
`domains/*.json` files from the pull request, with `git show` into regular
files, so a symlinked entry cannot make the runner read a path outside the checkout. And it restores `_meta.json`, `SCHEMA.json` and `_example.json` from the base branch, so a fork cannot loosen the policy in the same run that judges it.

`scripts/pr-report.js` then runs the same three checks the `check` workflow runs,
collects their `--json` output, and hands it to `scripts/render-report.js`. The comment it produces is a verdict, the problems grouped by file, and a hint per problem: the filename rule, the one-name-per-person rule, the two-space indent. It does not print a DNSControl diff, because the job has no Cloudflare token and
`check` is the only DNSControl command that runs without one.

The comment itself carries a marker:

```
<!-- registry-validator -->
```

The job refuses to post a report without the marker, updates its previous comment instead of adding a new one, and stays quiet when the verdict is a pass and there is nothing to update.

Warnings get their own heading. A claim that passes with a warning shows
`## Registry check passed, one change needed before merge`, then names the warning
and states the consequence: the check stays green, the DNS push after the merge will fail, and the record will not be applied.

## Labels

`label.yml` adds labels by changed file, and creates the label if the repository
does not have it yet.

| Label | Files |
| --- | --- |
| `subdomain` | anything under `domains/` |
| `scripts` | `scripts/` or `package.json` |
| `ci` | `.github/` |
| `docs` | any `.md` file |

Labels are additive. A pull request that touches an entry and a workflow gets both
`subdomain` and `ci`, which is also a signal that it broke the one-file rule.

## Stale pull requests

`stale.yml` marks a pull request after 14 idle days and closes it 7 days later.
Pushing a commit or commenting resets the clock, and the `keep` label exempts a pull request from the policy entirely.

Issues are exempt (`days-before-issue-stale: -1`), because an issue is a report rather than a claim, and closing it does not free a name.

The close message says what actually happened: the name is free again, and a fresh pull request is the way to ask for it.

## Issue forms

Two forms live in `.github/ISSUE_TEMPLATE/`, and both are ways to start a claim or a report without opening a pull request first.

`subdomain.yml` asks for the label, the GitHub username, one line of purpose, an
optional repository, and three required acknowledgements: no squatting or impersonation, legal content in the Netherlands, and having read `CONTRIBUTING.md`.

`bug.yml` asks what happened, what was expected, and an optional link to a URL,
pull request or workflow run.

An issue does not create a record. The pull request is still the thing that changes the zone.
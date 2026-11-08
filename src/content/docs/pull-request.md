---
title: "Pull request checks"
description: "The shape rules a pull request must satisfy, the review template, the labels, and the stale policy."
---

That shape is not a style preference. A claim and a change to the validator are reviewed differently, revert differently, and are worth reading on different days.

`scripts/validate.js` enforces it. There is no separate shape script any more: the rules that ask "may this author touch this path" are in the same file as the rules that ask "is this entry valid", because a reviewer should not have to read two verdicts to know whether a pull request can land.

## The shape rules

| Rule | Message when it fails |
| --- | --- |
| Only `domains/` and the documentation | `a claim pull request adds one file under domains/, or fixes a typo in the documentation` |
| `registry/`, `.github/`, `scripts/`, `test/`, `dnsconfig.js` and `package.json` are trusted-author files | `only a trusted author can change this. A claim pull request touches its own domains/<name>.<zone>.json and nothing else` |
| At most four files under `domains/` | `one pull request changes 6 files under domains/; a claim is one entry, plus its _vercel sidecar` |
| The filename names a managed zone | `the name must be <subdomain>.<zone>.json, for example jane.is-a.ceo.json or @.is-a.ceo.json` |
| Deleting an entry is a trusted-author action | `this name belongs to "jane"; releasing it is their call or a trusted author's` |

Two things left this table. The filename no longer has to agree with a `subdomain` key, because there is no such key: the filename is the name. And the whitespace rules went with the shape script, since a JSON file reindented by an editor is not a risk anyone needs CI to catch.

The documentation paths are `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `LICENSE`, `.gitignore`, `.gitattributes` and any `.md` file. A claim pull request may also fix a typo in one of those; it may not restructure them.

Four files under `domains/` is the real maximum: one claim plus its Vercel sidecar, with room to spare. Key order inside the file is not enforced, because it is taste rather than a rule a reviewer can read off the diff, and every existing entry orders its keys differently.

## One job on purpose

`check.yml` used to split the shape check from the validation, so that a docs-only pull request would not spend a DNSControl zone check on itself. The split cost more than it saved. Two jobs meant two triggers, two verdicts, and a filter that had to decide which changes "counted", which is a rule that can disagree with the real one.

With the shape rules inside the validator, the filter has nothing left to guard. A pull request touching only documentation runs a validator that finds nothing to complain about, in about a second, and the same is true of the DNSControl parse. A green result that means the same thing every time is worth more than a skipped job.

## The review template

`.github/pull_request_template.md` asks for four things, and leaves two of them as
marked sections.

The author ticks five boxes: agreement to the Terms, a reachable URL, `owner.username` as their own handle, an `owner.id` or `owner.email` a maintainer can use, and a passing `npm run verify` locally.

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
files, so a symlinked entry cannot make the runner read a path outside the checkout. And it restores all of `registry/` from the base branch, so a fork cannot loosen the policy in the same run that judges it.

`scripts/report.js` runs the validator, reads its `--json` output, and renders the comment. The comment it produces is a verdict, the problems grouped by file, and a hint per problem drawn from the message itself. It does not print a DNSControl diff, because the job has no Cloudflare token and `check` is the only DNSControl command that runs without one.

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
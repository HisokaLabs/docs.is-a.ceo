---
title: "Pull request checks"
description: "The shape rules a pull request must satisfy, the body check, the review bot, and the stale policy."
---

That shape is not a style preference. A claim and a change to the validator are reviewed differently, revert differently, and are worth reading on different days.

`scripts/validate.js` enforces it. There is no separate shape script any more: the rules that ask "may this author touch this path" are in the same file as the rules that ask "is this entry valid", because a reviewer should not have to read two verdicts to know whether a pull request can land.

## The shape rules

| Rule | Message when it fails |
| --- | --- |
| Only `domains/` and the documentation | `a claim pull request adds one file under domains/, or fixes a typo in the documentation` |
| `registry/`, `.github/`, `scripts/`, `test/`, `dnsconfig.js` and `package.json` are trusted-author files | `only a trusted author can change this. A claim pull request touches its own domains/<name>.<zone>.json and nothing else` |
| More than four files under `domains/` | `this pull request changes 6 files under domains/; splitting them makes the review shorter, but it is allowed` |
| The filename names a managed zone | `the name must be <subdomain>.<zone>.json, for example jane.is-a.ceo.json or @.is-a.ceo.json` |
| Deleting an entry is a trusted-author action | `this name belongs to "jane"; releasing it is their call or a trusted author's` |

The documentation paths are `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `LICENSE`, `.gitignore`, `.gitattributes` and any `.md` file. A claim pull request may also fix a typo in one of those; it may not restructure them.

More than four files under `domains/` is a note rather than a refusal now. It prints in the check log and the pull request comment, and a reviewer reads it before merging. The split between a refusal and a note follows one line: anything that still produces a working record is allowed, so a crowd of claims slows the review but changes nothing about the zone.

## The body check

`.github/pull_request_template.md` asks for five ticked boxes and two filled sections, and `scripts/template.js` reads the answer in CI.

The boxes each carry an HTML comment marker, so the check looks for `- [x]` beside the marker rather than for prose that could be reworded:

```
- [ ] <!-- TOS --> I agree to the Terms of Service.
- [ ] <!-- OWNER --> owner names me.
- [ ] <!-- FINISHED --> My site is reachable and finished.
- [ ] <!-- NON_COMMERCIAL --> This is a personal or non-commercial site.
- [ ] <!-- VERIFY --> npm run verify passes locally.
```

The two sections, Website Preview and Purpose, are wrapped in comment pairs. The comments are invisible in the rendered pull request, so what a reviewer reads is just the URL and the one-line purpose between them. A preview is a link to where the site lives today, not the `is-a.ceo` name being applied for.

The check runs inside `check.yml`, right after the validator. Leaving a box unticked or a section empty fails the run with a line per missing item, and editing the pull request description re-runs it.

Three outs, in the order the script applies them:

1. A trusted author's body is not checked.
2. The labels `maintainer` or `ci: bypass-template-check` skip it, which is how the 2026-11-19 batch of older pull requests, written against an earlier template, were allowed to merge. A bypass prints its own warning in the report so the decision stays visible.
3. Without the template file there is nothing to check against, and the script refuses rather than pass silently.

The body arrives through the `PR_BODY` environment variable, or `PR_BODY_FILE` when a script hands it over as a path. A local run without either checks nothing, because an empty body is not evidence about a pull request that has not been opened yet.

## The review bot

`.github/workflows/review.yml` does two jobs that used to be two workflows: it labels the pull request by what it touches, and it comments the validator's verdict in words the claimant can act on. One workflow means one `pull_request_target` trigger, one checkout, and one place where the trust boundary is described.

It runs on `pull_request_target`, which is the only event that can comment on a fork's pull request with a write token. The cost of that event is that the workflow runs with the base repository's privileges while the code comes from the fork, so the job is built around one rule: **a fork must not be able to rewrite the script that judges it.**

Three things follow from that rule.

It checks out the base commit, not the pull request's head. It copies only the `domains/*.json` files the pull request changed, with `git show` into regular files, so a symlinked entry cannot make the runner read a path outside the checkout. A file the pull request deletes is removed the same way. And it restores all of `registry/` from the base branch, so a fork cannot loosen the policy in the same run that judges it.

`scripts/report.js` runs the validator, reads its `--json` output, and renders the comment. The comment it produces is a verdict, the problems grouped by file, and a hint per problem drawn from the message itself. It does not print a DNSControl diff, because the job has no Cloudflare token and `check` is the only DNSControl command that runs without one.

The comment itself carries a marker:

```
<!-- registry-validator -->
```

The job refuses to post a report without the marker, updates its previous comment instead of adding a new one, and stays quiet when the verdict is a pass and there is nothing to update.

Warnings get their own heading. A claim that passes with a warning shows `## Registry check passed, with warnings`, then names each one. A warning never fails the check; it tells a reviewer what to look at before merging.

## Labels

The same workflow adds labels by changed file, and creates the label if the repository does not have it yet.

| Label | Files |
| --- | --- |
| `subdomain` | anything under `domains/` |
| `policy` | anything under `registry/` |
| `scripts` | `scripts/` or `package.json` |
| `ci` | `.github/` |
| `docs` | any `.md` file |

Labels are additive. A pull request that touches an entry and a workflow gets both `subdomain` and `ci`, which is also a signal that it broke the one-file rule.

## Stale pull requests

`stale.yml` marks a pull request after 21 idle days and closes it 7 days later. Pushing a commit or commenting resets the clock, and the `keep` label exempts a pull request from the policy entirely.

Issues are exempt (`days-before-issue-stale: -1`), because an issue is a report rather than a claim, and closing it does not free a name.

The close message says what actually happened: the name is free again, and a fresh pull request is the way to ask for it.

## Issue forms

Three ways to reach the maintainers live in `.github/ISSUE_TEMPLATE/`.

`subdomain.yml` asks for the label, the GitHub username, one line of purpose, an optional repository, and three required acknowledgements: no squatting or impersonation, legal content in the Netherlands, and having read `CONTRIBUTING.md`.

`bug.yml` asks what happened, what was expected, and an optional link to a URL, pull request or workflow run.

`report-abuse.md` is a plain template, not a form: the subdomain, what is wrong with it, and proof.

Blank issues are turned off, and the template chooser points to Discussions for questions and to `contact@hisoka.net` for abuse. An issue does not create a record. The pull request is still the thing that changes the zone.

---
title: "Workflows"
description: "All six GitHub Actions workflows: what triggers each one, what it does, and why it is built that way."
---

All six workflows declare the permissions they need and nothing more. Every action is pinned by commit SHA with the version in a comment, so a moved tag cannot change what runs. Node is 24 wherever the workflow runs a script.

| Workflow | Trigger | Permissions | What it does |
| --- | --- | --- | --- |
| `check.yml` | pull request, push to `main`, manual | `contents: read`, `pull-requests: read` | Validator, body check, test suite, DNSControl check |
| `push.yml` | push to `main` touching `domains/**`, `registry/**` or `dnsconfig.js` | `contents: read` | Re-validates, then pushes the zone, then asks the site to rebuild |
| `review.yml` | pull request opened, reopened, updated or marked ready | `contents: read`, `issues: write`, `pull-requests: write` | Labels by changed file and comments the verdict |
| `health.yml` | every 30 minutes, manual | `contents: read`, `issues: write` | Probes each zone's SOA and every entry's page, files one issue per failure |
| `branches.yml` | daily at 04:41 UTC, manual | `contents: read`, `pull-requests: write`, `issues: write` | Updates open pull requests against `main`, labels the ones that conflict |
| `stale.yml` | daily at 03:17 UTC, manual | `issues: write`, `pull-requests: write` | Marks idle pull requests after 21 days, closes them after 7 more |

The push, the review bot, the probes and the housekeeping each have their own page: [DNS pipeline](./dns-pipeline/), [Pull request checks](./pull-request/), [Watchers and scripts](./operations/).

## `check.yml`, in detail

One job named `Validate registry`, and the name is load-bearing: the ruleset on `main` requires that exact context, so renaming the job without updating the ruleset leaves every branch permanently unmergeable.

The trigger list includes `edited`, so editing the pull request body alone re-runs the check. That matters because the body is checked now: a pull request whose author fills in the template after opening it gets a fresh verdict without pushing an empty commit.

The steps are:

1. `npm run check` validates `domains/` and the policy files, with `PR_AUTHOR`,
   `PR_AUTHOR_ID`, `PR_LABELS`, `CHANGED_FILES` and `DELETED_FILES` gathered into
   the environment first.
2. `node scripts/template.js` checks the pull request body against the template,
   unless the author is trusted or carries a bypass label.
3. `npm test` runs the suite.
4. `DNSControl check` runs through the shared action, but only when something it
   reads changed. A change under `domains/`, `registry/` or in `dnsconfig.js`
   always runs it; a docs-only pull request skips it.

The change-set rules read that metadata. `CHANGED_FILES` holds the changed paths and `DELETED_FILES` the removed ones, gathered separately because a shallow diff cannot tell a removed file from one that never existed. The claimant check and the body check both read `PR_LABELS`, which is how the bypass labels reach the scripts.

The validator compares the policy files against what `main` had before this change, which is why the job checks out with full history and fetches the base branch. `DNSControl check` needs no credentials at all, and that is deliberate: see [the secrets table](#secrets).

## `pull_request` against `pull_request_target`

Two workflows read pull request events, and which event they use is a security decision, not a preference.

`check.yml` uses `pull_request`. The workflow runs in the context of the pull request, with a read-only token and no secrets, which is what makes it safe to run a contributor's code through the validator. The validator is the only thing that reads the fork's files, and it reads them as data.

`review.yml` uses `pull_request_target`, because it needs to write to the pull request and a fork's token cannot. The write token is the reason the review bot never runs fork code: it checks out the base branch, copies in only the `domains/*.json` files the pull request changed, and restores all of `registry/` from the base, so a fork cannot loosen the policy in the run that judges it.

## Trigger types replace the default set

`check.yml` lists its pull request types explicitly:

```yaml title=".github/workflows/check.yml"
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review, edited]
```

Naming `types` replaces GitHub's default set rather than adding to it. That is why the list reads as it does: a draft pull request fires `opened`, the same pull request fires `ready_for_review` when it is marked ready, and `edited` covers a body fixed up after the fact. Without all three, one of those moments would never be checked.

## Concurrency

Every workflow guards itself against overlapping runs, and the setting differs by what a cancelled run would cost.

| Group | Cancels | Why |
| --- | --- | --- |
| `${{ github.workflow }}-${{ github.ref }}` | yes | A newer commit makes the older check pointless |
| `dns-push` | no | Two overlapping pushes would race on the Cloudflare API |
| `zone-health` | no | A cancelled probe would report nothing about a zone |
| `review-${{ number }}` | yes | The newest diff is the one to label and explain |
| `pr-branches` | no | Short and idempotent, but cancelling it mid-run serves nobody |
| `stale` | no | Same reason |

## Branch updates

`branches.yml` runs once a day and calls `updateBranch` on every open, non-draft pull request, the way is-a-dev does. A pull request that has drifted behind `main` gets caught up without its author having to know.

When the update cannot happen because the branch conflicts with `main`, the pull request gets a `merge conflict` label and one comment, guarded by a marker so the comment is never repeated. The check cannot judge a branch that does not merge, so the failure is named instead of left as a red cross nobody can act on.

## Secrets

| Secret | Used by | Scope |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | `push.yml` | `Zone.DNS` edit on every zone in `registry/zones.json` |
| `SITE_DISPATCH_TOKEN` | `push.yml` | `repository_dispatch` on the website repository |
| `GITHUB_TOKEN` | every workflow | The permissions block in each file |

`GITHUB_TOKEN` has no scope of its own here; the `permissions` block decides. A workflow that omits it gets the repository default, which is usually wider than the job needs, so each file states its own.

Only one workflow holds the Cloudflare token, and it only runs on `main`. That is why a pull request from a fork can be checked at all: `check.yml` runs `DNSControl check`, the one subcommand that parses the configuration without talking to a provider, and the action drops the credentials argument for it. The validator, the test suite and the body check need nothing privileged either.

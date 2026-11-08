---
title: "Workflows"
description: "All seven GitHub Actions workflows: what triggers each one, what it does, and why it is built that way."
---

All seven workflows declare the permissions they need and nothing more. Every action is pinned by commit SHA with the version in a comment, so a moved tag cannot change what runs. Node is 24 wherever the workflow runs a script.

| Workflow | Trigger | Permissions | What it does |
| --- | --- | --- | --- |
| `check.yml` | pull request, push to `main`, manual | `contents: read` | Validator, test suite, DNSControl check |
| `push.yml` | push to `main` touching `domains/**` or `dnsconfig.js` | `contents: read` | Re-validates, then pushes the zone, then asks the site to rebuild |
| `registry-comment.yml` | pull request from a fork touching `domains/**` | `contents: read`, `pull-requests: write` | Comments the failure in words the claimant can act on |
| `health.yml` | every 30 minutes, manual | `contents: read`, `issues: write` | Probes each zone's SOA and files one issue while a zone is down |
| `guard.yml` | every 6 hours at :17 UTC, manual | `contents: read`, `issues: write` | Probes every entry and files one issue when two names serve one page |
| `stale.yml` | daily at 03:17 UTC, manual | `issues: write`, `pull-requests: write` | Marks idle pull requests after 14 days, closes them after 7 more |
| `label.yml` | pull request opened, reopened or updated | `contents: read`, `issues: write`, `pull-requests: write` | Labels by changed file |

The push, the comment bot, the probes and the housekeeping each have their own page: [DNS pipeline](./dns-pipeline/), [Pull request checks](./pull-request/), [Watchers and scripts](./operations/).

## `check.yml`, in detail

One job, four steps, and no path filter.

The split between a `format` job and a `validate` job is gone along with the scripts behind it. The shape rules, the owner check and the registry validation are all inside `scripts/validate.js` now, so they share one trigger and one verdict. A pull request that touches only documentation is still weighed against the rule that a claim is one file, and that rule is cheap to answer.

`npm ci` rather than `npm install` because it installs exactly the lockfile. The
repository has no dependencies, so the practical effect is that a changed transitive dependency cannot slip into the checks.

`fetch-depth: 0` and the explicit `git fetch` give the job the base branch, which the policy comparison reads. `PR_AUTHOR` and `PR_AUTHOR_ID` are what let the claim rules answer "is this the account that opened the pull request".

The steps are:

1. `npm run check` validates `domains/` and the policy files, with `PR_AUTHOR`
   and `PR_AUTHOR_ID` set from the pull request.
2. `npm test` runs the 72 test cases.
3. `DNSControl check` runs through the shared action, which parses `dnsconfig.js`
   and every entry it loads, without contacting Cloudflare.

The validator compares the policy files against what `main` had before this change, which is why the job checks out with full history and fetches the base branch. `DNSControl check` needs no credentials at all, and that is deliberate: see [the secrets table](#secrets).

## `pull_request` against `pull_request_target`

Three workflows read pull request events, and which event they use is a security decision, not a preference.

`check.yml` uses `pull_request`. The workflow runs in the context of the pull
request, with a read-only token and no secrets, which is what makes it safe to run a contributor's code through the validator. The validator is the only thing that reads the fork's files, and it reads them as data.

`registry-comment.yml` and `label.yml` use `pull_request_target`, because they need
to write to the pull request and a fork's token cannot. The write token is the reason the comment bot never runs fork code: it checks out the base branch, copies in only `domains/*.json`, and restores all of `registry/` from the base, so a fork cannot loosen the policy in the run that judges it.

`label.yml` needs no checkout at all, because it only reads the changed file list
from the API.

## Trigger types replace the default set

`check.yml` lists its pull request types explicitly:

```yaml title=".github/workflows/check.yml"
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
```

Naming `types` replaces GitHub's default set rather than adding to it. That is why
`opened` and `ready_for_review` are both listed: a draft pull request fires
`opened`, and the same pull request fires `ready_for_review` when it is marked
ready. Without both, the first push to a draft would never be checked.

## Concurrency

Every workflow guards itself against overlapping runs, and the setting differs by what a cancelled run would cost.

| Group | Cancels | Why |
| --- | --- | --- |
| `${{ github.workflow }}-${{ github.ref }}` | yes | A newer commit makes the older check pointless |
| `dns-push` | no | Two overlapping pushes would race on the Cloudflare API |
| `zone-health` | no | A cancelled probe would report nothing about a zone |
| `subdomain-guard` | no | Same reason, and it edits an issue |
| `stale` | no | Short and idempotent, but cancelling it mid-run serves nobody |
| `label-${{ number }}` | yes | The newest file list is the right one |
| `registry-comment-${{ number }}` | yes | The newest diff is the one to explain |

## Secrets

| Secret | Used by | Scope |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | `push.yml` | `Zone.DNS` edit on every zone in `registry/zones.json` |
| `SITE_DISPATCH_TOKEN` | `push.yml` | `repository_dispatch` on the website repository |
| `GITHUB_TOKEN` | every workflow | The permissions block in each file |

`GITHUB_TOKEN` has no scope of its own here; the `permissions` block decides. A
workflow that omits it gets the repository default, which is usually wider than the job needs, so each file states its own.

Only one workflow holds the Cloudflare token, and it only runs on `main`. That is why a pull request from a fork can be checked at all: `check.yml` runs
`DNSControl check`, the one subcommand that parses the configuration without
talking to a provider, and the action drops the credentials argument for it. The validator, the test suite and the shape rules need nothing privileged either.
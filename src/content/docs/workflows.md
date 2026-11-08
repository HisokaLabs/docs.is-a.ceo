---
title: "Workflows"
description: "All seven GitHub Actions workflows: what triggers each one, what it does, and why it is built that way."
---

All seven workflows declare the permissions they need and nothing more. Every action is pinned by commit SHA with the version in a comment, so a moved tag cannot change what runs. Node is 24 wherever the workflow runs a script.

| Workflow | Trigger | Permissions | What it does |
| --- | --- | --- | --- |
| `check.yml` | pull request, push to `main`, manual | `contents: read`, `pull-requests: read` | Shape rules, validator, test suite, owner check, DNSControl check |
| `push.yml` | push to `main` touching `domains/**` or `dnsconfig.js` | `contents: read` | Re-validates, then pushes the zone, then asks the site to rebuild |
| `registry-comment.yml` | pull request from a fork touching `domains/**` | `contents: read`, `pull-requests: write` | Comments the failure in words the claimant can act on |
| `health.yml` | every 30 minutes, manual | `contents: read`, `issues: write` | Probes each zone's SOA and files one issue while a zone is down |
| `guard.yml` | every 6 hours at :17 UTC, manual | `contents: read`, `issues: write` | Probes every entry and files one issue when two names serve one page |
| `stale.yml` | daily at 03:17 UTC, manual | `issues: write`, `pull-requests: write` | Marks idle pull requests after 14 days, closes them after 7 more |
| `label.yml` | pull request opened, reopened or updated | `contents: read`, `issues: write`, `pull-requests: write` | Labels by changed file |

The push, the comment bot, the probes and the housekeeping each have their own page: [DNS pipeline](./dns-pipeline/), [Pull request checks](./pull-request/), [Watchers and scripts](./operations/).

## `check.yml`, in detail

Two jobs, and the reason they are separate is worth knowing before changing them.

### `format`

Runs on every pull request and has no path filter, because the shape rules apply whether or not the change touches the registry. It checks out with full history, installs with `npm ci`, fetches the base branch, and runs
`npm run check:format` with `PR_AUTHOR` set to the pull request author.

`npm ci` rather than `npm install` because it installs exactly the lockfile. The
repository has no dependencies, so the practical effect is that a changed transitive dependency cannot slip into the checks.

`fetch-depth: 0` and the explicit `git fetch` give the job the base branch, which
the shape rules diff against. `PR_AUTHOR` is what lets them answer "is this author allowed to touch this path".

### `validate`

This job keeps a filter, and the filter is the interesting part.

```bash
if [ "$EVENT" != 'pull_request' ]; then
  echo "registry=true" >> "$GITHUB_OUTPUT"
  exit 0
fi
if files=$(gh api "repos/$REPO/pulls/$PR/files" --paginate --jq '.[].filename' 2>/dev/null); then
  if echo "$files" | grep -qE '^(domains/|scripts/|test/|dnsconfig\.js|package\.json|.*\.json$)'; then
    touched=true
  fi
else
  touched=true
fi
```

A push to `main` and a manual run always validate. A pull request validates when it touches a path that could change what reaches DNS. When the API call itself fails, the answer is `true`: an unknown change set is treated as a change, not as nothing to check.

When the answer is `false`, the job still runs, skips its steps, and writes one line to the step summary: `No registry-relevant files changed, so nothing to validate.` A green check with a reason beats a skipped job with none.

Every step after the filter is guarded by `steps.filter.outputs.registry == 'true'`, so the job is not half-run: it either does all four checks or none.

The four checks are the shape of the registry, in the order a reviewer cares about:

1. `npm run check` validates `domains/`, with `PR_AUTHOR` and
   `REQUIRE_BASE_REF=1`.
2. `npm test` runs the 128 test cases from the test suite.
3. `npm run verify-owners` compares each entry's `owner` against the author. This
   one runs only on a pull request, since it needs an author.
4. `DNSControl check` runs through the shared action, which parses `dnsconfig.js`
   and every entry it loads, without contacting Cloudflare.

The first three compare against what `main` had before this change, which is why the job checks out with full history and fetches the base branch on a pull request. The fourth needs no credentials at all, and that is deliberate: see [the secrets table](#secrets).

## `pull_request` against `pull_request_target`

Three workflows read pull request events, and which event they use is a security decision, not a preference.

`check.yml` uses `pull_request`. The workflow runs in the context of the pull
request, with a read-only token and no secrets, which is what makes it safe to run a contributor's code through the validator.

`registry-comment.yml` and `label.yml` use `pull_request_target`, because they need
to write to the pull request and a fork's token cannot. The write token is the reason the comment bot never runs fork code: it checks out the base branch, copies in only `domains/*.json`, and restores the maintainer-owned files.

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
| `CLOUDFLARE_API_TOKEN` | `push.yml` | `Zone.DNS` edit on every zone in `_meta.json` |
| `SITE_DISPATCH_TOKEN` | `push.yml` | `repository_dispatch` on the website repository |
| `GITHUB_TOKEN` | every workflow | The permissions block in each file |

`GITHUB_TOKEN` has no scope of its own here; the `permissions` block decides. A
workflow that omits it gets the repository default, which is usually wider than the job needs, so each file states its own.

Only one workflow holds the Cloudflare token, and it only runs on `main`. That is why a pull request from a fork can be checked at all: `check.yml` runs
`DNSControl check`, the one subcommand that parses the configuration without
talking to a provider, and the action drops the credentials argument for it. The validator, the test suite and the shape rules need nothing privileged either.
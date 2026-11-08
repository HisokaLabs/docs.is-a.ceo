---
title: "Watchers and scripts"
description: "The scheduled probes that file issues, the local commands, and the maintenance scripts for Vercel proofs and token audits."
---

Two scheduled jobs watch the zone, one bot tidies idle pull requests, and a set of scripts does the work you can also run by hand.

## Local commands

| Command | Runs | What it answers |
| --- | --- | --- |
| `npm run check` | `scripts/validate.js` | Is every entry in `domains/` valid? |
| `npm test` | `node --test "test/**/*.test.js"` | Do the 72 cases still pass? |
| `npm run verify` | The two above, in order | The verdict CI will reach |
| `npm run status` | `scripts/status.js` | What does every entry actually serve? |
| `npm run zones` | `scripts/status.js --zones` | Does every zone answer with an SOA? |
| `npm run proof` | `scripts/proof.js` | Write, list or remove a Vercel ownership sidecar |
| `npm run audit` | `scripts/audit.js` | Does every declared proof token match live DNS? |

Six scripts and no dependencies, so `npm install` only writes the lockfile's own contents and the checks run on Node's test runner.

## Zone health

`health.yml` runs every 30 minutes. It resolves the SOA record of every zone listed
in `registry/zones.json`, with a 10 second timeout per query, and prints one line per zone:

```
ok    is-a.ceo  SOA ns3.cloudflare.com. (serial 2391205)
down  example.net  ETIMEOUT
```

An SOA is the cheapest proof that a zone is still served by a nameserver that considers itself authoritative for it. A zone can lose that without anyone editing the registry: an expired registration, a deleted zone in the account, or a nameserver change at the registrar all show up here and nowhere else.

When the probe fails, the workflow files one issue and keeps it updated:

```
<!-- zone-health -->
```

The marker is how the job finds its own issue again. It searches open issues for the marker and updates the body with the latest run link, or creates the issue (`Zone health: a managed zone is not resolving`, label `zone-health`) when there is none. On the next healthy run it comments `Zone probe is healthy again; closing.` and closes the issue.

A marker rather than a title match, because a title can be edited by anyone and a marker is invisible.

## Subdomain guard

`guard.yml` runs every six hours at :17, and it answers a different question: is one
page being served under two names?

`node scripts/status.js --json --strict` resolves every claim, fetches it over
HTTPS, and hashes the body. Two names with the same hash are a collision.

```
node scripts/status.js          # one line per entry, plus the collision groups
node scripts/status.js --json   # { zones, checked, collisions, rows }
node scripts/status.js --strict # exit 1 when there is a collision
```

Each row carries a verdict, and the useful ones are specific:

| Verdict | Meaning |
| --- | --- |
| `ok` | Resolves, answers, and serves its own bytes |
| `DNS does not resolve` | No A or CNAME for the name |
| `TLS or connection failed` | The address exists, nothing answers on 443 |
| `Vercel project has no production deployment` | Vercel replied `DEPLOYMENT_NOT_FOUND` |
| `HTTP 404` and friends | The host answered with an error status |
| `serves identical bytes as other.is-a.ceo` | Two names, one page |

That last verdict is the one the guard exists for, and the reason is worth stating plainly. A Vercel ownership proof is a `vc-domain-verify` TXT at `_vercel.<name>`. If someone pastes a proof minted for another person's name into their own entry, they finish that other account's ownership claim, and the second name starts serving the first account's page. Byte-identical output is what that looks like from outside, so the guard watches for it rather than trying to reason about intent.

The probe caps the body at 512 KiB and times out at 12 seconds, so a large page or a slow host produces a verdict rather than a hung job.

The issue it maintains carries `<!-- subdomain-guard -->`, label `zone-health`, and a line per collision:

```
- `a.is-a.ceo` and `b.is-a.ceo` serve byte-identical pages (9f2c...)
```

It closes itself with a comment once every entry serves its own page again.

## Vercel proofs

`scripts/proof.js` writes the sidecar entry a Vercel ownership proof needs,
so the record lands on a name of its own instead of on top of a CNAME.

| Flag | What it does |
| --- | --- |
| `--name holder` | Required. The label the proof is for. |
| `--token <token>` | The token from Vercel's row. |
| `--proof "vc-domain-verify=..."` | Takes the whole line instead of just the token. |
| `--list` | Prints every sidecar already in the registry. |
| `--remove` | Deletes the sidecar, and nothing else. |
| `--dry-run` | Prints the file without writing it. |
| `--help` | Prints the usage lines. |

Every write is followed by a validator run against the new file, so a sidecar that would fail the check fails the script instead. The script also refuses a proof minted for a different name than `--name`, which is the mistake that hands an account to someone else. The mechanics of the record itself are in [Records](./records/#pointing-at-vercel).

## Token audit

`scripts/audit.js` reads every `vc-domain-verify` value in the registry,
resolves the name it lives on, and reports what it finds:

```
vc-domain-verify tokens: 3

  _vercel.holder.is-a.ceo
    owner on file : holder
    token says    : holder.is-a.ceo
    published live: yes
    verdict       : consistent
```

Four things count against a token. It can be minted for a name the file does not claim. It can appear in more than one entry. It can be declared but missing from live DNS. And live DNS can hold extra tokens the registry no longer declares, which is what a half-removed sidecar leaves behind.

`--strict` exits 1 when any token is minted for a name its file does not claim. It
is not wired into a workflow: it reads public DNS, so it is a tool for reviewing a suspicious registry by hand.

## Why the probes file issues instead of failing

A red scheduled workflow is invisible. Nobody watches the Actions tab of a repository they do not push to, and a failed run from three weeks ago looks the same as a failed run from this morning.

An issue is visible, searchable, and closes itself with a comment that says why. Both probes follow the same three-part pattern: one marker, one open issue, and a body that names the latest run URL so the reader can go straight to the log.

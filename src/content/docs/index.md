---
title: "Overview"
description: "What the registry is, how a claim reaches the DNS zone, and which page answers which question."
---

Two things are worth knowing before the rest of these pages, because they decide most of the questions people ask first.

The zone is **DNS only**. There is no redirect record, no HTTP layer, and no way to rewrite a path. If you want `your-name.is-a.ceo` to send a visitor somewhere else, DNS can hand them your host's address and nothing more. Host the redirect yourself.

The default target is **GitHub Pages**. Leave `records` out of your entry entirely and the name serves `<you>.github.io` the moment the pull request merges.

## What the registry is

The DNS data behind [is-a.ceo](https://is-a.ceo), kept in one repository so that every change is reviewable and reversible. Each claimed name is one JSON file, and the filename is the name.

```
domains/jane.is-a.ceo.json     claims jane.is-a.ceo
```

That file, the pull request that added it, and the commit that merged it are the whole record of who asked for the name, what it points at, and when it went live. There is no dashboard and no account to create.

Policy lives beside the claims, not inside them:

| Path | Holds |
| --- | --- |
| `domains/` | One JSON file per claim, and nothing else |
| `registry/zones.json` | The zones this repository serves |
| `registry/reserved.json` | Names the registry already points somewhere |
| `registry/blocked.json` | Names refused under every zone |
| `registry/trusted.json` | Who may edit code, policy, and other people's entries |
| `registry/schema.json` | The shape of one entry |
| `registry/example.json` | The file a claimant copies |

Because `domains/` holds claims only, every file there is one by definition. There is no skip-list of filenames to keep in step.

## How a claim reaches the zone

```
pull request  ->  check.yml   validate the registry, run the suite, DNSControl check
merge to main ->  push.yml    DNSControl push
                                |
                                v
                            Cloudflare  ->  the record answers
```

`domains/` is the only directory a claimant edits. `dnsconfig.js` reads those files when DNSControl runs, so nothing is generated ahead of time and the push applies exactly what is committed.

Probes run on a schedule afterward and check that no two names ended up serving the same page.

## What is in the repository today

A snapshot, not a live figure. The counts move as entries are claimed, so each row names where it came from if you want to recount.

| Fact | Value | Where it comes from |
| --- | --- | --- |
| Entries in the registry | 19 | JSON files in `domains/` |
| Public subdomains | 16 | Entries minus the apex and the `_vercel` sidecars |
| Zones served | 1, and it is `is-a.ceo` | `registry/zones.json` |
| Reserved names | 380 | `registry/reserved.json`, managed by hand in Cloudflare instead of by an entry file |
| Blocked names | 11 | `registry/blocked.json` |
| Trusted authors | 3 | `registry/trusted.json` |
| Workflows | 7 | `.github/workflows/*.yml` |
| Scripts | 6 | `scripts/*.js` |
| Test cases | 75 | `npm test`: 72 pass, 3 skipped on Windows because a filename cannot contain `*` |
| npm dependencies | none | `package.json` declares none, and the checks use Node's own test runner |
| Node in CI | 24 | `actions/setup-node` in every workflow |

Snapshot taken 2026-11-08.

## Where to go next

| Question | Page |
| --- | --- |
| How do I claim a name? | [Claim a subdomain](./claim/) |
| What can I put in the file? | [Entry fields](./fields/), [Records](./records/) |
| Why did my pull request fail the check? | [Validation rules](./validation/), [Troubleshooting](./troubleshooting/) |
| What does CI do with my change? | [Pull request checks](./pull-request/) |
| How does the record reach Cloudflare? | [DNS pipeline](./dns-pipeline/) |
| Which workflows exist, and when do they run? | [Workflows](./workflows/) |
| Who probes the zone, and what do the scripts do? | [Watchers and scripts](./operations/) |
| I run the registry. How do I add a second zone? | [Adding a zone](./zones/) |
| Which names are refused, and why? | [Name policy and rules](./policy/) |

The registry README and `CONTRIBUTING.md` are the short version of this site, and the two are meant to be read together. Where they disagree, the scripts in the repository are what actually runs.

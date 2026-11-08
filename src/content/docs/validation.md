---
title: "Validation rules"
description: "What scripts/validate.js enforces, with the exact failure message for each rule."
---

One script decides whether a pull request is valid: `scripts/validate.js`. It absorbed the three that used to share the job (the shape check, the owner check and the registry validator), because they were all answering "may this change land", and keeping that answer in one place is what stops the three from drifting apart.

The validator reports every problem it can find rather than stopping at the first file, and it drops a failing entry's state before reading the next one, so one bad file does not produce a cascade of errors about the names it would have claimed.

## Running it

| Command | What it runs |
| --- | --- |
| `npm run check` | The validator against the real `domains/` |
| `node scripts/validate.js --json` | The same run, as `{ ok, verified, problems, warnings }` |
| `npm run verify` | `check` and the test suite in one command |

A clean run ends with `validate: 21 entries verified`. Problems go to stderr and exit with code 1, each one prefixed with the file that caused it.

The change-set rules read the environment. CI sets `PR_AUTHOR` and `PR_AUTHOR_ID` from the pull request, and `CHANGED_FILES` for the ones that judge the diff. A local run without them checks everything that does not need an author, and the claimant rule steps aside rather than guessing.

## Layout checks that run first

These are not attached to a single entry.

| Message | Cause |
| --- | --- |
| `domain files must be placed in the domains/ directory` | An entry-looking JSON file in the repository root |
| `every entry filename ends in .json` | A file under `domains/` that is not named `.json` |
| `domains/ holds subdirectories (...)` | Anything nested inside `domains/` |
| `registry/zones.json must list at least one zone` | An empty or malformed zone list |

The flat-directory rule matters more now than it did. `validate.js` and the `glob()` in `dnsconfig.js` both read `domains/` one level deep, so a file one level down would be invisible to the validator and still reach DNS if the glob were deeper. Refusing it closes that gap.

## The filename

There is no `subdomain` key to disagree with the filename, so these are the only ways the name can be wrong.

| Message | Cause |
| --- | --- |
| `the name must be <subdomain>.<zone>.json, for example jane.is-a.ceo.json` | The filename ends in no managed zone |
| `the subdomain must be lowercase` | `Jane.is-a.ceo.json` |
| `"MyName" is not a valid subdomain` | A character the label grammar refuses |
| `"<zone>" is not a managed zone (...)` | A zone typo, which changes the parsed prefix too |

## The name against the policy

| Message | Cause |
| --- | --- |
| `"paypal" is blocked by the registry and cannot be claimed under any zone` | A name in `blocked.json` |
| `"status" is reserved, so it already answers for the registry` | A name in `reserved.json` |
| `"m3" is reserved ... (it reads as "me")` | The folded spelling of a reserved word |
| `"@", "*" or "_dmarc" answers for every name in the zone, so a trusted author holds it` | A zone-wide name from an ordinary account |

Reserved and blocked apply to single-label claims. A dotted name skips both, because it is already specific.

## The owner

| Message | Cause |
| --- | --- |
| `"owner" must be an object, e.g. { "username": "jane", "id": 1234567 }` | `owner` given as a string |
| `"owner" is empty. Give at least one of "username", "id" or "email"` | `{}`, or a key that is blank after trimming |
| `owner.username "..." is not a GitHub handle` | Spaces, leading or trailing hyphens, or an `@` |
| `owner.username is empty; remove the key or write your GitHub handle` | The key is present but blank |
| `owner.id must be the numeric GitHub account id` | A string, a float, or zero |
| `unknown owner key "login"` | A fourth key |

## The claim against the author

These only run when a change set is readable, which is to say in CI and in any local run that sets `CHANGED_FILES`.

| Message | Cause |
| --- | --- |
| `owner.id 555 is not the account opening this pull request (777)` | The claim names someone else's account |
| `owner.username "jane" is not the account opening this pull request ("someone-else")` | No id to compare, and the names differ |
| `this entry has only an email, so it cannot be tied to the account opening this pull request` | Nothing to match an account against |
| `this name belongs to "jane"; releasing it is their call or a trusted author's` | A delete by someone else |
| `this entry belongs to "jane", so only they or a trusted author can change it` | An edit by someone else |
| `owner moves from "jane" to "someone-else"` | A transfer disguised as an edit |

When both the entry and the pull request carry an `id`, the numbers decide and the usernames are not compared. That is what lets a renamed account keep its claim.

## Records

| Message | Cause |
| --- | --- |
| `records.SOA is not a supported type (...)` | A type the registry does not manage |
| `records.A is empty; remove the key instead` | `"A": []` |
| `records.A has 21 values, the limit is 20` | Above the per-type cap |
| `"10.0.0.1" is not a public IPv4 address` | A private, loopback, link-local or documentation address |
| `records.CNAME takes one target` | Two CNAME targets |
| `CNAME target "jane.is-a.ceo" cannot point at the name it sits on` | A loop |
| `a CNAME cannot share its name with A, AAAA` | Two types DNS will not accept together |
| `records.A repeats a value` | The same value twice |
| `records is empty; remove the key to get the GitHub Pages default` | `records: {}` |
| `the apex cannot carry a CNAME; use A and AAAA` | A CNAME on `@` |
| `the apex cannot delegate with NS` | An NS delegation on `@` |

Per-type rules are in [Records](./records/): the public-address rules for `A` and `AAAA`, the 255-character limit and the Vercel proof pinning for `TXT`, the 0 to 65535 range for `MX` and `SRV`, and the tag and flag rules for `CAA`.

## Checks across entries

Two rules cannot be answered by looking at one file.

| Message | Cause |
| --- | --- |
| `"*.app" needs "app" in is-a.ceo claimed by the same owner first` | A wildcard or underscore name over a base you do not own |
| `records.CNAME "x.pages.dev" is also used by other.is-a.ceo under a different owner` | Two owners pointing at one target |

The base-claim rule covers wildcards and underscore names, because whoever holds `_acme-challenge.app` can issue a certificate for `app`, and whoever holds `_dmarc.app` can write its mail policy. A bare service record is exempt, so `_minecraft._tcp.mc` with only SRV data is open to anyone.

The shared-target rule looks at `CNAME`, `A` and `AAAA` within one zone. Two zones using the same address are two independent hosts, so only the same zone counts. A trailing dot is stripped before the comparison, so it cannot hide a match.

## The policy files

`registry/` decides what everyone else may claim, so a change there is judged against the base branch.

| Message | Cause |
| --- | --- |
| `this pull request adds "x" to "trusted"; only an admin can grant trust` | Self-promotion |
| `only an admin can change the trusted list` | A non-admin editing the list |
| `this pull request drops "api" from "reserved"; only trusted authors can loosen the name policy` | The same rule covers `blocked.json` |
| `only a trusted author can change which zones are served` | A zone added or removed |

Tightening is allowed for anyone, since it never grants a name the policy would otherwise refuse.

## The scope of a claim pull request

| Message | Cause |
| --- | --- |
| `only a trusted author can change this` | A claim touching `scripts/`, `registry/`, `.github/` or `dnsconfig.js` |
| `a claim pull request adds one file under domains/, or fixes a typo in the documentation` | A change outside `domains/` and outside the docs |
| `one pull request changes 6 files under domains/; a claim is one entry` | More than four entries in one pull request |

A claim is one file plus, when Vercel asked for one, its `_vercel.<name>` sidecar. The limit is four, which those two fit inside with room to spare.

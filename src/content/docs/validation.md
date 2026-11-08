---
title: "Validation rules"
description: "What scripts/validate.js enforces, with the exact failure message for each rule."
---

The validator reports every problem it can find rather than stopping at the first file, and it checks a failing entry against nothing else: the registry state for one bad file is rolled back before the next is read.

## Running it

| Command | What it runs |
| --- | --- |
| `npm run check` | The validator against the real `domains/` |
| `node scripts/validate.js --json` | The same run, as `{ ok, verified, problems, warnings }` |
| `npm run verify` | `check`, `check:format` and the test suite in one command |

A clean run prints one `validate: ok, <file>` line per entry and ends with
`validate: N entr(y/ies) verified`. Problems go to stderr and exit with code 1.
Warnings also go to stderr, marked `validate: warning:`, and do not change the exit code.

CI sets `REQUIRE_BASE_REF=1`. With it, a run that cannot read the base branch fails instead of passing blind, because the maintainer-only rules on
`_meta.json` compare against the base copy.

## Repository checks that run first

These are not attached to a single entry, so their messages name no file.

| Message | Cause |
| --- | --- |
| `domain files must be placed in the domains/ directory, not in the repository root` | A JSON object with `domain` or `subdomain` sitting in the repository root |
| `this is a registry entry without a .json extension, so the validator and the DNS config glob both skip it; rename it to "x.json"` | A file under `domains/` that looks like an entry but is not named `.json` |
| `domains/ contains a subdirectory ("x"); registry entries are kept flat in domains/ so every file is named <subdomain>.<zone>.json and checked before it reaches DNS` | Anything nested inside `domains/` |

The flat-directory rule exists because `validate.js` and the `glob()` in
`dnsconfig.js` both read `domains/` one level deep. A file one level down
would be invisible to the validator and still reach DNS, so it is refused instead.

## The one file whose policy is protected

`domains/_meta.json` decides what everyone else is allowed to claim. When
the pull request author is not in `maintainers`, four changes are refused.

| Message | Meaning |
| --- | --- |
| `this pull request adds "x" to "maintainers"; only an existing maintainer can grant that` | Self-promotion |
| `this pull request drops "x" from "reserved"; only a maintainer can loosen the name policy` | The same rule covers `blocked`, `reservedClasses` and `reserved` |
| `this pull request changes "zones"; only a maintainer can change which zones are served` | Adding or removing a zone |
| `this pull request raises "maxLength" from 63 to 99; only a maintainer can loosen the name policy` | Loosening the length cap |

Tightening is allowed for anyone, since it never grants a name the policy would otherwise refuse.

## File checks

| Message | Cause |
| --- | --- |
| `registry entries must be regular files; a symlink or device is not accepted, because it reads a path this repository does not control` | A symlinked entry |
| `file is larger than 65536 bytes` | An entry over 64 KiB |
| `invalid JSON at position 42; check for a missing comma, a trailing comma or a smart quote` | A parse failure, with the byte offset |
| `entry must be a single JSON object (one entry per file, not an array or a bare string)` | An array or a bare value at the top level |

A bad entry is rolled back before the next file is checked, so one broken file does not produce a cascade of unrelated errors about the names it would have claimed.

## Entry keys

| Message | Cause |
| --- | --- |
| `unknown key "descrition" (allowed: $schema, _about, domain, subdomain, owner, email, proxied, repo, description, records)` | A key outside the list |
| `missing "domain" (the zone this subdomain belongs to, e.g. "is-a.ceo")` | No `domain` |
| `missing "subdomain" (the label you are claiming, e.g. "mc")` | No `subdomain` |
| `missing "owner" (your GitHub username as a plain string, e.g. "octocat")` | No `owner` |
| `"owner" must be a plain username string, not an object; write "owner": "octocat" instead of "owner": { "username": "octocat" }` | `owner` written as an object |
| `"records" must be an object keyed by record type, e.g. { "CNAME": "you.vercel.app" }` | `records` is an array or a string |

Several of these can come back in one run, because the first pass collects everything it can before the strict pass starts.

## The name

| Message | Cause |
| --- | --- |
| `zone "is-a.co" is not a managed zone (is-a.ceo)` | A typo in `domain` |
| `"domain" must be lowercase` | Uppercase in the zone |
| `"MyName" is not a valid subdomain (use "@", "*", "*.<labels>", or dot-separated labels)` | A character the label grammar refuses |
| `file must be named "jane.is-a.ceo.json"` | Filename and `subdomain` disagree |
| `"jane" is already defined in is-a.ceo` | A second file for one name |
| `"admin" is reserved by the registry` | A name in `reserved` |
| `"paypal" is blocked by the registry` | A name in `blocked` |
| `"_dmarc" is a zone-wide name, so maintainers hold it; it covers every name in is-a.ceo, not just one. Put your own record one label deeper` | `@`, a bare `*`, or a single-label name starting with `_` |

## The owner

| Message | Cause |
| --- | --- |
| `owner "somebody-with-a-very-long-name" is longer than 39 characters` | Above the GitHub username cap |
| `owner "jane" contains a control character; write the plain GitHub username` | A zero-width or control character pasted in |

There is no per-owner limit, so holding a second name in the same zone is
accepted. What the validator still records is which owner holds each name, so a
wildcard such as `*.app` or an auxiliary entry such as `_vercel.jane` is only
accepted on a base its own owner holds.

`scripts/verify-owners.js` is a separate step, and it compares against the pull
request author instead of the registry alone:

| Message | Cause |
| --- | --- |
| `owner "jane" does not match the PR author "someone-else"` | The claim is filed on someone else's behalf |
| `this entry belongs to "jane"; only the owner or a maintainer can delete it` | A deletion by someone else |
| `owner changes from "jane" to "someone-else"; an existing claim cannot change hands through a pull request` | A transfer |

That script skips the check entirely when `PR_AUTHOR` is unset, when the author is a maintainer, or when the pull request changes no registry file. The skip is printed, so a run that did nothing says so.

## Records

| Message | Cause |
| --- | --- |
| `records.SOA is not a supported record type (A, AAAA, CNAME, TXT, MX, NS, SRV, CAA, PTR)` | A type the registry does not manage |
| `records.A is an empty array; remove the key instead` | `"A": []` |
| `records.A has 21 values, the limit is 20` | Above the per-type cap |
| `the zone apex cannot use CNAME records, use A/AAAA instead` | A CNAME on `@` |
| `the zone apex cannot delegate via NS records` | An NS delegation on `@` |
| `records.CNAME can only have a single target (DNS forbids multiple CNAMEs on the same name)` | Two CNAME targets |
| `CNAME target "jane.is-a.ceo" cannot point to itself or the zone apex` | A loop |
| `a CNAME cannot coexist with A, AAAA on the same name` | Two types on one name that DNS will not accept together |
| `records.A contains a duplicate value` | The same value twice |
| `must define at least one of records.A, AAAA, CNAME, MX, NS, SRV, PTR, or TXT alone` | `records: {}` |

Per-type checks are listed in [Records](./records/): the public-address rules for
`A` and `AAAA`, the 255-character limit and the Vercel proof pinning for `TXT`,
the 0 to 65535 range for `MX` and `SRV`, and the tag and flag rules for `CAA`.

## Checks across entries

Two rules cannot be answered by looking at one file.

| Message | Cause |
| --- | --- |
| `"*.app" needs "app" in is-a.ceo claimed by the same owner first` | A wildcard or underscore name over a base you do not own |
| `records.CNAME "x.pages.dev" is also used by other.is-a.ceo (@other) for a different owner; two names cannot serve one site, so point this at your own host` | Two owners pointing at one target |

The base-claim rule covers wildcards and underscore names, because whoever holds
`_acme-challenge.app` can issue a certificate for `app`, and whoever holds
`_dmarc.app` can write its mail policy. A bare service record is exempt, so
`_minecraft._tcp.mc` with only SRV data is open to anyone.

The shared-target rule looks at `CNAME`, `A` and `AAAA` within one zone. Two zones using the same address are two independent hosts, so only the same zone counts. A trailing dot is stripped before the comparison, so it cannot hide a match.

## Warnings that do not fail the build

Two advisory checks print and continue.

A generic word as a label, taken from the `advisoryClasses` list in
`_meta.json`, warns that a maintainer will probably ask for a personal handle
before merging. The name still passes the schema.

A `TXT` or `CAA` next to an unproxied `CNAME` warns that DNSControl will refuse the combination, so the push will fail after the merge even though the registry accepted the file. Move the record to its own dotted name.

Warnings are the difference between "this file is invalid" and "this file will cause trouble later". The build passes either way, which is why CI prints them without failing.
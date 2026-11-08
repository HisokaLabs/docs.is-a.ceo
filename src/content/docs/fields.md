---
title: "Entry fields"
description: "Every key an entry file accepts, which are required, and the limits the validator applies to each one."
---

The key list is closed. A key outside it fails the build with `unknown key "..."`, so a typo in `proxied` or `descrition` cannot reach review.

## The keys

| Key | Required | Limits | What it is for |
| --- | --- | --- | --- |
| `domain` | yes | lowercase, must be listed in `zones` | The zone this name belongs to. `is-a.ceo` today. |
| `subdomain` | yes | see the shapes below | The label being claimed. Must match the filename. |
| `owner` | yes | ≤ 39 characters, no control characters | Your GitHub username. Must match the pull request author. |
| `email` | no | ≤ 254 characters, format-checked | Contact address for maintainers. The fastest way to reach you, and how a maintainer gets in touch when your GitHub profile shows no contact detail. |
| `proxied` | no | `true` or `false`, defaults to `false` | Route A/AAAA/CNAME through the Cloudflare proxy. |
| `repo` | no | ≤ 200 characters | `owner/repo`, `github.com/owner/repo`, or a full `https://` URL. Shown on the site. |
| `description` | no | ≤ 200 characters | One line, shown on the site. |
| `records` | no | ≤ 20 values per type | The DNS records. Omit the key entirely for GitHub Pages. |
| `$schema` | no | none | Editor hint, usually `./SCHEMA.json`. Enables autocomplete in editors with a JSON Schema extension. |
| `_about` | no | none | Free-form note. Only `_example.json` uses it. |

The file itself is capped at 64 KiB, and it has to be a regular file. A symlink is refused, because it reads a path this repository does not control.

## Subdomain shapes

The `subdomain` value and the filename (minus the `.json`) must be identical. Four shapes are accepted.

| Shape | Filename | What it claims |
| --- | --- | --- |
| `jane` | `jane.is-a.ceo.json` | One label under the zone. The normal case. |
| `@` | `@.is-a.ceo.json` | The zone apex. Maintainers only. |
| `*.jane` | `*.jane.is-a.ceo.json` | A wildcard over a name you already own. |
| `_acme-challenge.jane` | `_acme-challenge.jane.is-a.ceo.json` | Underscore records: DNS-01 challenges, DMARC, provider proofs. |

A label is lowercase letters, digits and hyphens, up to 63 characters, and may start with one underscore. It cannot start or end with a hyphen. The whole name is capped at 253 characters.

Dots are allowed, so `docs.api.jane` is a valid claim, and every label in it has to follow the rules above.

## The filename rule

`scripts/check-format.js` reads the file, takes `subdomain` and `domain` out of
it, and compares the pair against the filename. A file named
`jane.is-a.ceo.json` that says `"subdomain": "jane2"` fails with:

```
domains/jane.is-a.ceo.json: the file claims "jane2" in "is-a.ceo", so it must be named "jane2.is-a.ceo.json"
```

The filename comes first because it is what a reviewer reads before opening anything.

## Leaving records out

Omit `records` entirely and DNSControl publishes GitHub Pages for you:

```
A     185.199.108.153   185.199.109.153   185.199.110.153   185.199.111.153
AAAA  2606:50c1:8000::153  2606:50c1:8001::153  2606:50c1:8002::153  2606:50c1:8003::153
```

So `jane.is-a.ceo` serves `jane.github.io` as soon as the merge lands, with no configuration on your side. This is the whole setup for most claims.

An empty `records: {}` is a different thing, and it is refused. Either leave the key out or put at least one record in it.

## How the keys are checked

Three passes, in this order.

1. `preflightEntry` collects everything it can find in one pass: unknown keys, a
   missing `domain`/`subdomain`/`owner`, an `owner` written as an object instead
   of a string, `records` that is not an object. Several problems come back at
   once.
2. `advisoryCheck` produces warnings, not failures. A generic word as a label, or
   a `TXT` sitting next to an unproxied `CNAME`, warns here and still passes.
3. `validateEntry` applies the strict rules and stops at the first one it hits in
   that file. The registry state for that file is rolled back, so one bad entry
   does not cascade into the next.

Every message is quoted in [Validation rules](./validation/). The machine-readable form of the same rules is [domains/SCHEMA.json](https://github.com/HisokaLabs/open-subdomains/blob/main/domains/SCHEMA.json), draft-07, served at https://is-a.ceo/domains.schema.json with that URL as its `$id`.

:::note
The schema and the validator are two files, and they do not cover exactly the same ground. Editor autocomplete follows `SCHEMA.json`, which is where the length limits above are written down; the merge decision follows `validate.js`, which checks some of them and ignores others. A file can pass the editor and still fail the pull request.
:::

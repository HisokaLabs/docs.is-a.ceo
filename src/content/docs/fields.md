---
title: "Entry fields"
description: "Every key an entry file accepts, which are required, and the limits the validator applies to each one."
---

The key list is closed. A key outside it fails the check with `unknown key "..."`, so a typo in `proxied` or `descrition` cannot reach review.

## The keys

| Key | Required | Limits | What it is for |
| --- | --- | --- | --- |
| `owner` | yes | object, see below | Who holds the name |
| `repo` | no | ≤ 200 characters | `owner/repo`, `github.com/owner/repo`, or a full `https://` URL. Shown on the site. |
| `description` | no | ≤ 200 characters | One line, shown on the site. |
| `proxied` | no | `true` or `false`, defaults to `false` | Route A/AAAA/CNAME through the Cloudflare proxy. |
| `records` | no | ≤ 20 values per type | The DNS records. Omit the key entirely for GitHub Pages. |
| `$schema` | no | none | Editor hint, usually `../registry/schema.json`. Enables autocomplete. |

The file itself is capped at 64 KiB, and it has to be a regular file. A symlink is refused, because it reads a path this repository does not control.

## `owner`

An object with at least one key. None of the three is required on its own.

| Key | Required | Limits | What it is for |
| --- | --- | --- | --- |
| `username` | any one of the three | ≤ 39 characters, a GitHub handle | Your account. Also ties the claim to the pull request author. |
| `id` | any one of the three | a positive whole number | The numeric account id from `https://api.github.com/users/<username>` |
| `email` | any one of the three | ≤ 254 characters, format-checked | An address a maintainer can reach you at |

```json title="domains/jane.is-a.ceo.json"
{
  "owner": {
    "username": "jane",
    "id": 1234567
  }
}
```

An empty object is refused, because a name with nobody attached to it is a name nobody answers for.

Two of the three carry more weight than the third when a pull request arrives.

`id` is the strongest identity available. A username is not stable: GitHub releases the name when an account is renamed, and someone else can register it later. The number is not released. When both the entry and the pull request carry an id, the validator compares those and ignores the usernames, so a renamed account keeps its claim and an impostor cannot take one over by grabbing the old handle.

`username` is what most entries use, and it is compared against the account that opened the pull request.

`email` alone cannot be matched to an account, so an entry identified only by email can only be filed by a trusted author. That is a real limitation, not a rounding error: without a username or an id there is nothing to compare, and waving the check through would let anyone file a name under any address they type. If you want to claim a name yourself, include `username` or `id`.

Which identity is used for the anti-takeover rules (a wildcard or an underscore record needing its base claimed by the same person) falls back in that order: `id`, then `username`, then `email`. So two entries belong to the same person when their strongest shared key matches, and two strangers who both left a different key out never match each other by accident.

## Subdomain shapes

The name comes from the filename: everything before `.<zone>.json`. Four shapes are accepted.

| Shape | Filename | What it claims |
| --- | --- | --- |
| `jane` | `jane.is-a.ceo.json` | One label under the zone. The normal case. |
| `@` | `@.is-a.ceo.json` | The zone apex. Trusted authors only. |
| `*.jane` | `*.jane.is-a.ceo.json` | A wildcard over a name you already own. |
| `_acme-challenge.jane` | `_acme-challenge.jane.is-a.ceo.json` | Underscore records: DNS-01 challenges, DMARC, provider proofs. |

A label is lowercase letters, digits and hyphens, up to 63 characters, and may start with one underscore. It cannot start or end with a hyphen. The whole name is capped at 253 characters.

Dots are allowed, so `docs.api.jane` is a valid claim, and every label in it has to follow the rules above.

## The filename rule

There is only one rule, and it has no counterpart inside the file. The validator splits the filename on `.<zone>.json` and takes what is left as the subdomain. A file named `jane.is-a.ceo.json` claims `jane`, full stop.

Two consequences are worth stating. A file whose name matches no managed zone is refused with `the name must be <subdomain>.<zone>.json` rather than silently ignored. And renaming a file is the only way to move a claim, which makes the change show up in the diff as a rename instead of an edit nobody notices.

## Leaving records out

Omit `records` entirely and DNSControl publishes GitHub Pages for you:

```
A     185.199.108.153   185.199.109.153   185.199.110.153   185.199.111.153
AAAA  2606:50c1:8000::153  2606:50c1:8001::153  2606:50c1:8002::153  2606:50c1:8003::153
```

So `jane.is-a.ceo` serves `jane.github.io` as soon as the merge lands, with no configuration on your side. This is the whole setup for most claims.

An empty `records: {}` is a different thing, and it is refused. Either leave the key out or put at least one record in it.

## How the keys are checked

One pass, in a fixed order.

1. Unknown keys at the top level, then the `owner` object.
2. The name: zone, casing, label grammar, blocked list, reserved list.
3. The records, each type against its own rules.
4. The rules that need other entries: a wildcard's base, and two names pointing at one host.

Every problem carries the filename, so a run over a large registry still says which file to open. The registry state for a bad file is dropped before the next one is read, so one broken entry does not cascade into unrelated errors about the names it would have claimed.

Every message is quoted in [Validation rules](./validation/). The machine-readable form of the same rules is [registry/schema.json](https://github.com/HisokaLabs/open-subdomains/blob/main/registry/schema.json), draft-07, served at https://is-a.ceo/entry.schema.json with that URL as its `$id`.

:::note
The schema and the validator are two files, and they do not cover exactly the same ground. Editor autocomplete follows `schema.json`; the merge decision follows `validate.js`. A file can pass the editor and still fail the pull request. Where they disagree, the script is what runs.
:::

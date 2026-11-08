---
title: "Name policy and rules"
description: "Reserved and blocked names, why the reserved list catches dressed-up spellings, the rules every claimant agrees to, and how abuse is handled."
---

Three files hold the policy, and none of them lives in `domains/`, so a claim and a policy change are never the same review.

| File | Holds |
| --- | --- |
| `registry/reserved.json` | Names the registry already points somewhere |
| `registry/blocked.json` | Names refused under every zone |
| `registry/trusted.json` | Who may edit policy and other people's entries |

Both name lists apply to single-label claims only. A dotted name, a wildcard and `@` skip them, because each one is already specific: `docs.jane` does not compete with `jane` for a shared word.

## Reserved: kept out of the repository on purpose

Reserved is not "refused for taste". It means the name is **managed by hand in the Cloudflare dashboard**, so its record does not live in `domains/` at all. `www` and `docs` are the standing examples: both answer, neither has an entry file.

That makes the list load-bearing in two places, and the second one is easy to miss.

**It refuses ordinary claimants.** A label on the list cannot be claimed by anyone outside the trusted list:

```
"status" is reserved, so it already answers for the registry. Pick a personal handle instead
```

**It stops the push from deleting the record.** DNSControl runs in purge mode: anything in the zone that `dnsconfig.js` does not declare gets removed. A reserved name with no entry file declares nothing, so without protection every push would wipe it. `dnsconfig.js` therefore emits an `IGNORE` for each reserved label that has no claim, and DNSControl reports it as a record deliberately left alone:

```
#1: 4 records not being deleted because of IGNORE*():
```

`IGNORE` was chosen over `NO_PURGE` on purpose. `NO_PURGE` turns deletions off for the whole zone, so removing an entry file would stop working and the record would outlive the claim. `IGNORE` names the labels, so deleting `caliph.is-a.ceo.json` still deletes `caliph`. Both directions were verified against a local BIND provider.

A trusted author may also write a real entry for a reserved name. When they do, the label stops being ignored and the file is what gets pushed, which is how the apex and the documentation site are managed.

The list holds `api`, `admin`, `mail`, `ns1`, `smtp`, `vpn`, `status`, `auth`, `login`, `billing`, `docs`, `www`, `dev`, the RFC 2142 role addresses (`abuse`, `postmaster`, `hostmaster`, `webmaster`, `security`, `noc`, `root`, `administrator`), the mail policy names (`_dmarc`, `_domainkey`, `_acme-challenge`), and the grammar words below.

## Blocked: never, anywhere

`blocked.json` holds names that must never sit under this registry at all: the brands an impersonator reaches for. `paypal`, `apple`, `appleid`, `google`, `microsoft`, `cloudflare`, `github`, `gmail`, `icloud`, `outlook`, and `admin`.

The message is `"paypal" is blocked by the registry`, and unlike reserved, no author overrides it, a trusted one included. There is no legitimate reason for this zone to answer as `paypal.is-a.ceo`, so the list is absolute by design.

The split between the two files is the distinction that matters: **reserved is about who operates the name, blocked is about what the name claims to be.**

## Dressed-up spellings

Moving the word lists into `reserved.json` did not drop the part that made them hard to dodge. Before a label is looked up it is folded:

1. Lowercased.
2. Separators removed, so `m-e` and `m_e` become `me`.
3. Leetspeak mapped out: `0`→`o`, `1`→`i`, `3`→`e`, `4`→`a`, `5`→`s`, `6`→`g`, `7`→`t`, `8`→`b`, `9`→`g`, `@`→`a`, `$`→`s`, `!`→`i`, `+`→`t`.
4. Runs of three or more of one letter collapsed into one.

So `m3`, `5tatus` and `meee` are all refused, and the message says why:

```
"m3" is reserved, so it already answers for the registry (it reads as "me"). Pick a personal handle instead
```

Both lists are consulted twice per label, once plain and once folded, so the plain word still matches exactly.

The fold is the same function in three places: `scripts/registry.js` for the validator, `site/assets/name-check.js` for the browser checker, and the same list of words behind both. When the checker says a name is reserved, the pull request says the same thing.

## Why a word list rather than word classes

An earlier version classified labels by grammar: pronoun, determiner, function word, generic noun. It was cleverer than it was useful. The classes needed a `namePolicy` block in `_meta.json` to say which ones applied, a lookup table keyed by class, and a second copy of the table inside the browser. Three places to change one decision, and the lists drifted.

A flat list is one file with one meaning. The words that used to come from the classes are in `reserved.json` now, so `me`, `my`, `the`, `and` and `blog` are refused because they are on the list, not because an algorithm recognised their part of speech.

## Structure rules the policy depends on

A wildcard must widen your own name, never someone else's, so `*.app` needs `app` already claimed by the same owner. The same rule covers underscore names such as `_acme-challenge.app` and `_dmarc.app`, because whoever holds those can issue a certificate for `app` or write its mail policy. Service records are the exception: `_minecraft._tcp.mc` carrying only SRV data is open to anyone.

`@`, a bare zone-wide `*`, and a bare underscore name at the zone root are trusted-author only. `_acme-challenge.is-a.ceo` can answer a DNS-01 challenge for `*.is-a.ceo`, `_dmarc.is-a.ceo` writes mail policy for the whole zone, and `_vercel.is-a.ceo` is the ownership proof Vercel asks for when the zone is already linked to another account. Put your own record one label deeper.

## The rules every claim agrees to

- There is no limit on how many subdomains one person holds in a zone. Each
  name is its own file, and a second, third or tenth entry with the same `owner`
  is accepted.
- `owner` needs at least one of `username`, `id` or `email`, and the pull request has
  to be opened by the account it names. When both sides carry an `id`, the numbers are
  what get compared. An entry with only an `email` cannot be matched to an account, so
  a trusted author has to file it.
- Whoever `owner` names has to be someone who answers, because that is who a maintainer
  contacts when a name is reported or breaks.
- Personal and non-commercial use only. No shop, no business site, no advertising,
  and no claiming a name to sell, rent or park it for resale.
- The site behind the name has to be reachable and finished when you open the pull
  request. A parked page, a placeholder or an empty repository is refused.
- No malware, phishing, or content that would get the whole zone delisted.
- Content has to be legal in the Netherlands, where the zones are hosted. One
  claimant's problem is every claimant's problem, because a delisting takes the
  whole zone with it.
- Do not edit `dnsconfig.js` to add a subdomain. It reads `domains/*.json`
  directly, so a claim never needs it.
- Do not touch another person's entry without asking them first.

Deleting an entry is a trusted author's action even when the entry is yours, so releasing a name means asking.

## Abuse

Report abuse to [abuse@hisoka.net](mailto:abuse@hisoka.net), or read the published policy at [https://is-a.ceo/abuse](https://is-a.ceo/abuse), which states what happens after a report.

Two registry mechanics exist because of abuse rather than tidiness. The shared-target rule stops two names from serving one site, and the guard workflow watches for the byte-identical pages that a misused Vercel proof produces.

## Licence

[ISC](https://github.com/HisokaLabs/open-subdomains/blob/main/LICENSE), the same licence as the website.

## Who decides

`registry/trusted.json`. Each person has a `username`, an `id`, and an `admin` flag.

```json title="registry/trusted.json"
[
  { "username": "DikaArdnt", "id": 88322331, "admin": true },
  { "username": "HisokaLabs", "id": 103969998, "admin": false }
]
```

`admin` decides whether the account may change the list itself. A trusted author without the flag can edit code, policy and other people's entries, but cannot add anyone to the list, which closes the self-promotion hole a plain list of names would leave open. Adding a trusted author is an admin action, and the validator refuses a pull request that grants the role to its own author.

This replaces `CODEOWNERS`. A file that maps paths to usernames is only as stable as the usernames: GitHub releases a handle when an account is renamed, and whoever registers it next inherits the access. Storing the numeric `id` beside the name means the grant follows the account, not the spelling.

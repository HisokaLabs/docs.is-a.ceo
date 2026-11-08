---
title: "Name policy and rules"
description: "Reserved and blocked names, the word classes the policy refuses by kind, the rules every claimant agrees to, and how abuse is handled."
---

Both lists live in `domains/_meta.json`, and the word classes in
`scripts/name-classes.js`, so the answer does not change with the reviewer.

Both lists apply to single-label claims only. A dotted name, a wildcard and `@` skip them, because each one is already specific: `docs.jane` does not compete with
`jane` for a shared word.

## Refused by list

`reserved` holds names the registry keeps for its own operation: `api`, `admin`,
`mail`, `ns1`, `smtp`, `vpn`, `status`, `auth`, `login`, `billing`, `test`,
`staging`, `prod`, `dev`, `cdn`, `assets`, `localhost`. Claiming one is refused with
`"admin" is reserved by the registry`, and a name in `reserved` cannot be pried loose
by asking: the point of the list is that the name means the same thing on every zone.

`blocked` holds names that must never sit under this registry at all: `abuse`,
`security`, `postmaster`, `root`, and the brands an impersonator reaches for,
`paypal`, `apple`, `google`, `microsoft`, `cloudflare`, `github`, `icloud`,
`outlook`, `gmail`. The message is `"paypal" is blocked by the registry`.

The two lists are in `_meta.json`, and they grow. The checker at [https://is-a.ceo/check](https://is-a.ceo/check) is the current answer, since it reads the same file the validator reads.

## Refused by kind of word

`scripts/name-classes.js` refuses a name by the class of word it is, so no list has
to grow to keep up with new vocabulary.

| Class | Refused or advisory | Why |
| --- | --- | --- |
| `pronoun` | refused | A pronoun points at whoever reads it, not at a person |
| `determiner` | refused | A determiner only makes sense in front of another word |
| `function-word` | refused | Grammar words carry no identity |
| `generic-noun` | advisory | Shared vocabulary rather than a personal handle |

The pronoun paradigm is the interesting one, because it is a set of sets rather than a word list: `i`/`me`/`my`/`mine`/`myself`, `we`/`us`/`our`, `you`/`your`,
`he`/`him`/`his`, `she`/`her`, `it`/`its`, `they`/`them`/`their`, `who`/`whom`,
`one`, plus the Indonesian set (`aku`, `saya`, `gue`, `kamu`, `lu`, `anda`, `dia`,
`kita`, `kami`, `mereka`, and their variants) and the indefinite pronouns (`anyone`,
`everyone`, `someone`, `nothing`, `everything`). One name in the set makes the whole
family unclaimable, which is why `me` and `my` fail together.

Dressing a word up does not get past it. Before classification the label is lowercased, stripped of `-`, `_`, `.` and spaces, mapped out of leetspeak (`0`→`o`, `1`→`i`, `3`→`e`, `4`→`a`, `5`→`s`, `7`→`t`, `@`→`a`, `$`→`s`), and collapsed where a letter repeats three or more times. So `M3`, `m3` and `meee` all resolve to `me`.

The classes that apply are chosen per zone in `_meta.json`:

```json title="domains/_meta.json"
{
  "namePolicy": {
    "reservedClasses": ["pronoun", "determiner", "function-word"],
    "advisoryClasses": ["generic-noun"]
  }
}
```

A new class is one entry in `scripts/name-classes.js` plus one name in that array. Turning a reserved class off is a policy change, and only a maintainer can do it: the validator compares the pull request's `_meta.json` against the base branch and refuses any drop from `reserved`, `blocked` or `reservedClasses` by a non-maintainer.

## Not refused, but warned

A generic word passes the schema and gets an advisory warning instead:

```
"blog" is a generic word (generic words are shared vocabulary, not a personal
handle). This passes the schema, but a maintainer is likely to ask for a personal
handle before merging, because a shared word is claimed once and then unavailable
to everyone else.
```

`home`, `blog`, `app`, `shop`, `docs` and the rest of that list are allowed because a
few of them read as a real handle. The warning exists because the name is claimed once: whoever takes `blog` takes it for every future claimant in the zone.

## Structure rules the policy depends on

A wildcard must widen your own name, never someone else's, so `*.app` needs `app` already claimed by the same owner. The same rule covers underscore names such as
`_acme-challenge.app` and `_dmarc.app`, because whoever holds those can issue a
certificate for `app` or write its mail policy. Service records are the exception:
`_minecraft._tcp.mc` carrying only SRV data is open to anyone.

`@`, a bare zone-wide `*`, and a bare underscore name at the zone root are
maintainer-only. `_acme-challenge.is-a.ceo` can answer a DNS-01 challenge for
`*.is-a.ceo`, `_dmarc.is-a.ceo` writes mail policy for the whole zone, and
`_vercel.is-a.ceo` is the ownership proof Vercel asks for when the zone is already
linked to another account. Put your own record one label deeper.

## The rules every claim agrees to

- One subdomain per person per zone, per purpose. CI enforces it: a second entry
  with the same `owner` in the same zone fails the build. `@` and auxiliary entries
  do not count.
- `owner` must be your own GitHub username, and the pull request has to be opened by
  that account.
- No malware, phishing, or content that would get the whole zone delisted.
- Content has to be legal in the Netherlands, where the zones are hosted. One
  claimant's problem is every claimant's problem, because a delisting takes the
  whole zone with it.
- Do not edit `dnsconfig.js` to add a subdomain. It reads `domains/*.json`
  directly, so a claim never needs it.
- Do not touch another person's entry without asking them first.

Deleting an entry is a maintainer action even when the entry is yours, so releasing a name means asking.

## Abuse

Report abuse to [abuse@hisoka.net](mailto:abuse@hisoka.net), or read the published policy at [https://is-a.ceo/abuse](https://is-a.ceo/abuse), which states what happens after a report.

Two registry mechanics exist because of abuse rather than tidiness. The shared-target rule stops two names from serving one site, and the guard workflow watches for the byte-identical pages that a misused Vercel proof produces.

## Licence

[ISC](https://github.com/HisokaLabs/open-subdomains/blob/main/LICENSE), the same licence as the website.

## Who decides

The `maintainers` list in `_meta.json`. It gates the `_meta.json` policy changes, the zone-wide wildcard, and any transfer of an existing claim. Adding a maintainer is itself a maintainer action: the validator refuses a pull request that grants the role to its own author.
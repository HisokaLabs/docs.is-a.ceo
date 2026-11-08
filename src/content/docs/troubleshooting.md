---
title: "Troubleshooting"
description: "The failures people actually hit, the exact message each one prints, and the fix."
---

## Before the pull request

`npm run verify` fails on your machine. Each message below is prefixed with the file
that caused it, and the ones worth learning by sight are the ones CI prints before a maintainer has to explain them.

| Message | Fix |
| --- | --- |
| `unknown key "descrition"` | A key outside the accepted list. Ten are allowed, and `description` is one of them. |
| `zone "is-a.co" is not a managed zone (is-a.ceo)` | A typo in `domain`. |
| `file must be named "jane.is-a.ceo.json"` | The filename and the `subdomain` inside disagree. Rename the file. |
| `"admin" is reserved by the registry` | Pick another label. The full policy is in [Name policy](./policy/). |
| `"blog" is a generic word` | Not a failure. A warning, and a maintainer will probably ask for your GitHub handle instead. |
| `must define at least one of records.A, AAAA, CNAME, MX, NS, SRV, PTR, or TXT alone` | `records: {}`. Delete the key for the GitHub Pages default, or put a record in it. |
| `invalid JSON at position 412` | A missing comma, a trailing comma, or a smart quote pasted from a document. |
| `"203.0.113.10" is not a public IPv4 address` | The documentation ranges are refused like any private address. Use the real one. |

One failure has no message worth reading, because it never gets that far: on Windows you cannot create a file named `*.app.is-a.ceo.json`. NTFS forbids `*` in a filename. Add the entry through the GitHub web interface instead. CI runs on Linux, where it is fine, and the two wildcard tests in the suite are skipped on Windows for the same reason.

## The check workflow fails

| Message | Fix |
| --- | --- |
| `a pull request may only add a file under domains/, or update the documentation` | Split the unrelated change into its own pull request. |
| `only a maintainer can change this file` | You touched `_meta.json`, `SCHEMA.json`, `.github/` or `CODEOWNERS`. Drop it from this pull request. |
| `only a maintainer can change the validator, the DNS config or the test suite` | You touched `scripts/`, `test/`, `dnsconfig.js` or `package.json`. Same fix. |
| `this pull request touches 6 files under domains/` | A claim is one file, plus its `_vercel` sidecar. |
| `deleting a name is a maintainer action` | Ask a maintainer to release it, even when the entry is yours. |

It passes locally and fails in CI. Three reasons, in order of likelihood.

`npm run verify` without a `PR_AUTHOR` skips the per-author scope rules, because
"may this author touch this path" has no answer without an author. CI sets it, so CI applies them. Run `PR_AUTHOR=your-name npm run verify` to see the same verdict.

The local run may not have the base branch. The shape rules and the `_meta.json` policy comparison diff against `origin/main`; when it is missing, the validator refuses to pass blind with `the base branch "main" could not be read`. Fetch it.

The change may be a symlink or a file in a subdirectory, both of which are refused with a message that names the reason. Neither is visible in a normal `git diff`.

## It passed, but a maintainer asked for a change

Two warnings produce a green check and a failed push. Neither is a validator bug.

A generic label warns but passes. The name is claimable, and the maintainer is allowed to ask for something more personal.

A `TXT` or `CAA` next to an unproxied `CNAME` warns but passes. DNSControl will refuse the combination after the merge, so the record never lands. Move the record to its own dotted name, which is what [Records](./records/) describes, or set
`"proxied": true` if you genuinely need both on one name.

That second case is the one to read twice, because the pull request looks fine and approves cleanly. The warning text says the push will fail; it means it.

## After the merge

### The record is not live

Check the `push` workflow run first, since it is the only job that writes to Cloudflare. If it is queued, the `dns-push` concurrency group is holding it behind an earlier run, which is deliberate: two overlapping pushes would race on the API.

If it failed, the log names the record. The two common causes are a CNAME sharing a name with another type, and a duplicate record that already exists in the zone.

Then check propagation. A fresh record can take minutes, and a resolver that cached the name before the merge keeps its old answer until the TTL expires.

### The site still shows the old list

The site rebuild is a `repository_dispatch` from `push.yml`, and it is skipped when
`SITE_DISPATCH_TOKEN` is not set. The step prints `SITE_DISPATCH_TOKEN is not set,
skipping the site rebuild` and still exits 0, because a DNS push that worked should not fail over a website. Trigger the site's own `pages` workflow by hand if you need it sooner.

### Two names serve the same page

The guard workflow files an issue with `Subdomain guard: one page is being served under two names`, naming both. The cause is almost always a `vc-domain-verify` TXT that was minted for one name and pasted into another entry: it finishes another account's ownership proof, and the second name starts serving the first account's page.

Delete the sidecar entry from the name that does not own the proof. `npm run status` shows the current verdict per entry, including which names share bytes.

### HTTPS broke on a GitHub Pages site

`"proxied": true` on a GitHub Pages target. The proxy breaks Pages certificate
issuance, which is why the default is `false` and why the no-records default forces it off. Set it back to `false`, or omit it.

### The apex entry fails

`@` cannot carry a CNAME or delegate with `NS`. Both are DNS rules about the apex,
not registry preferences; use `A` and `AAAA` there.

## Things that look like bugs but are rules

- A wildcard needs the base name you already own: `"*.app" needs "app" in is-a.ceo
  claimed by the same owner first`. A wildcard widens your own name, never someone
  else's.
- A bare `*`, `@`, or root-level underscore name is maintainer-only, because it
  covers names nobody has claimed yet.
- A CAA value is a bare domain, `letsencrypt.org`, never a URL.
- A verification record belongs one label deeper than the name it verifies.
- Two owners cannot point at the same host. Two zones using the same address do not
  count, since they are independent hosts.

## What to run before asking

```bash
npm run verify            # validator, shape rules, full test suite
npm run status            # what every entry actually serves
npm run health            # does every zone answer with an SOA
node scripts/status.js --json | head -60
```

`npm run status` is the one that answers "is this my problem or the registry's". It
resolves each entry, fetches it, and prints a verdict per name, so a broken claim and a broken zone look different in its output.

When the answer is still unclear, the workflow log is the record of what CI actually did, and the run URL is in every issue the probes file.
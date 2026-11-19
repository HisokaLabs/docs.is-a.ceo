---
title: "Troubleshooting"
description: "The failures people actually hit, the exact message each one prints, and the fix."
---

## Before the pull request

`npm run verify` fails on your machine. Each message below is prefixed with the file
that caused it, and the ones worth learning by sight are the ones CI prints before a maintainer has to explain them.

| Message | Fix |
| --- | --- |
| `unknown key "descrition"` | A key outside the accepted list. `owner`, `repo`, `description`, `proxied` and `records` are the ones an entry takes. |
| `"is-a.co" is not a managed zone (is-a.ceo)` | A typo in the filename. The zone is part of the filename, not a key inside the file. |
| `the name must be <subdomain>.<zone>.json` | The filename ends in no managed zone. Name it `jane.is-a.ceo.json`. |
| `"paypal" is blocked by the registry and cannot be claimed under any zone` | Pick another label. The full policy is in [Name policy](./policy/). |
| `"blog" is reserved` | The word is on `registry/reserved.json`. Pick a personal handle. |
| `"records" publishes nothing, so the name falls back to the GitHub Pages default. Remove the key to say that on purpose` | `records: {}`. Delete the key for the GitHub Pages default, or put a record in it. |
| `invalid JSON at position 412` | A missing comma, a trailing comma, or a smart quote pasted from a document. |
| `"203.0.113.10" is a documentation address, so nothing on the internet reaches it` | A note, not a refusal. The record still merges; use the real address so the name resolves. |

One failure has no message worth reading, because it never gets that far: on Windows you cannot create a file named `*.app.is-a.ceo.json`. NTFS forbids `*` in a filename. Add the entry through the GitHub web interface instead. CI runs on Linux, where it is fine, and the two wildcard tests in the suite are skipped on Windows for the same reason.

## The check workflow fails

| Message | Fix |
| --- | --- |
| `a claim pull request adds one file under domains/, or fixes a typo in the documentation` | Split the unrelated change into its own pull request. |
| `only a trusted author can change this` | You touched `registry/`, `.github/`, `scripts/` or `dnsconfig.js`. Drop it from this pull request. |
| `only an admin can change the trusted list` | `registry/trusted.json` is admin-only. |
| `this pull request changes 6 files under domains/; splitting them makes the review shorter, but it is allowed` | A note, not a refusal. A claim is one file plus its `_vercel` sidecar, but a crowd of them still merges. |
| `releasing it is their call or a trusted author's` | Ask the owner or a trusted author to remove the entry, even when it is yours. |

It passes locally and fails in CI. Three reasons, in order of likelihood.

`npm run verify` without a `PR_AUTHOR` skips the per-author scope rules, because
"may this author touch this path" has no answer without an author. CI sets it, so CI applies them. Run `PR_AUTHOR=your-name npm run verify` to see the same verdict.

The local run may not have the base branch. The policy comparison reads `registry/*.json` at `origin/main`; without it, the comparison is skipped, so a local pass does not prove the policy rules. Run `git fetch origin main` first.

The change may be a symlink or a file in a subdirectory, both of which are refused with a message that names the reason. Neither is visible in a normal `git diff`.

## It passed, but a maintainer asked for a change

One warning produces a green check and a failed push. It is not a validator bug.

A `TXT` or `CAA` next to an unproxied `CNAME` warns but passes. DNSControl will refuse the combination after the merge, so the record never lands. Move the record to its own dotted name, which is what [Records](./records/) describes, or set
`"proxied": true` if you need both on one name.

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

The guard job in `health.yml` files an issue with `Subdomain guard: one page is being served under two names`, naming both. The cause is almost always a `vc-domain-verify` TXT that was minted for one name and pasted into another entry: it finishes another account's ownership proof, and the second name starts serving the first account's page.

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
  else's. The same applies to a `_vercel.<name>` sidecar and to other `_label.<name>`
  verification files.
- A bare `*`, `@`, or root-level underscore name is trusted-author-only, because it
  covers names nobody has claimed yet.
- A CAA value is a bare domain, `letsencrypt.org`, never a URL.
- A verification record the host reads from your own name goes one label deeper
  than that name. One the host reads from the zone root goes in a `_label.<name>`
  sidecar, which [Verification TXT](./records/#verification-txt-at-the-zone-root) explains.
- A target another claimant already uses only draws a warning, not a refusal.
  Point at your own host and the warning disappears.

## What to run before asking

```bash
npm run verify            # validator, shape rules, full test suite
npm run status            # what every entry actually serves
npm run zones             # does every zone answer with an SOA
node scripts/status.js --json | head -60
```

`npm run status` is the one that answers "is this my problem or the registry's". It
resolves each entry, fetches it, and prints a verdict per name, so a broken claim and a broken zone look different in its output.

When the answer is still unclear, the workflow log is the record of what CI actually did, and the run URL is in every issue the probes file.
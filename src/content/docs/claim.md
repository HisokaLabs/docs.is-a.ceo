---
title: "Claim a subdomain"
description: "The end-to-end walkthrough: check the name, copy the template, open the pull request, and watch the record go live."
---

## Check the name first

The checker at [is-a.ceo/check](https://is-a.ceo/check) answers whether a label is free, reserved, or already claimed, without a fork and without opening a pull request. It reads the same policy the validator applies, so its verdict matches what CI will say.

A name that the checker refuses is refused by `scripts/validate.js` too. There is no separate appeal path for a reserved label.

## Copy the template

Fork the [registry repository](https://github.com/HisokaLabs/open-subdomains) and create a branch. Then copy the template to the filename the registry expects:

```
domains/_example.json  ->  domains/<your-subdomain>.is-a.ceo.json
```

The filename has to be exactly `<subdomain>.<zone>.json`. A claim for `jane` becomes `domains/jane.is-a.ceo.json`; the file says `"subdomain": "jane"` and `"domain": "is-a.ceo"`, and the three have to agree.

## Fill it in

```json title="domains/jane.is-a.ceo.json"
{
  "$schema": "./SCHEMA.json",
  "domain": "is-a.ceo",
  "subdomain": "jane",
  "owner": "jane",
  "email": "jane@example.com",
  "repo": "github.com/jane/jane.github.io",
  "proxied": true,
  "description": "Portfolio",
  "records": {
    "CNAME": "jane.github.io"
  }
}
```

Two fields do the work: `subdomain` and `owner`. The rest are optional, and leaving `records` out entirely gives you the GitHub Pages default. Every field is described in [Entry fields](./fields/), and each record type in [Records](./records/).

:::caution
`owner` has to be your own GitHub username, and the pull request has to be
opened by the account it names. CI compares the two and fails the build when they differ.
:::

## Run the checks locally

```bash
npm run verify
```

That is the same command CI runs, in the same order: `npm run check` validates
`domains/`, `npm run check:format` checks the shape of the change, and
`npm test` runs the 128 test cases. A local pass is the same verdict the
workflow will reach.

One difference, and it is deliberate. The per-author scope rules answer "may this author touch this path", which needs to know who the author is. Without a
`PR_AUTHOR` in the environment those rules are skipped rather than guessed, and
`npm run verify` says so. CI always passes `PR_AUTHOR`, so it applies both.

The two wildcard tests are skipped on Windows, because NTFS will not let a file be named `*.app.is-a.ceo.json`. They run on Linux, where CI runs.

## Open the pull request

Open it against `main` and fill in the template. The `check` workflow runs three things on it: the shape rules, the validator plus the test suite, and an owner check against your GitHub username. A bot then comments the verdict on the pull request, one line per problem with a hint on how to fix it, before anyone reviews it.

A claim pull request is one file. If your change also touches the scripts, the workflow config, or someone else's entry, split it into its own pull request; the [shape rules](./pull-request/) explain why the split is enforced rather than requested.

## Wait for the merge

After the merge, `push.yml` runs `DNSControl push` against Cloudflare. The record answers within a minute or two, plus whatever your DNS resolver caches.

Claiming is one file and one pull request. Releasing a name is not: deleting an entry is a maintainer action even when the entry is yours. Ask a maintainer, and they will remove it.

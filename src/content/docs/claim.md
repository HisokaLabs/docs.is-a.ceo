---
title: "Claim a subdomain"
description: "The end-to-end walkthrough: check the name, copy the template, open the pull request, and watch the record go live."
---

## Check the name first

The checker at [is-a.ceo/check](https://is-a.ceo/check) answers whether a label is free, reserved, or already claimed, without a fork and without opening a pull request. It reads the same `registry/reserved.json` the validator reads and applies the same folding, so its verdict matches what CI will say.

A name the checker refuses is refused by `scripts/validate.js` too. A reserved label is not an appeal away, because reserved means the registry is already using it.

## Copy the template

Fork the [registry repository](https://github.com/HisokaLabs/open-subdomains) and create a branch. Then copy the template to the filename the registry reads:

```
registry/example.json  ->  domains/<your-name>.is-a.ceo.json
```

For `jane`, that is `domains/jane.is-a.ceo.json`. The filename is the whole name: there is no `domain` or `subdomain` key inside the file to agree with, so a misnamed file is the only way to get the name wrong.

## Fill it in

```json title="domains/jane.is-a.ceo.json"
{
  "$schema": "../registry/schema.json",
  "owner": {
    "username": "jane",
    "id": 1234567
  },
  "repo": "github.com/jane/jane.github.io",
  "description": "Portfolio",
  "proxied": true,
  "records": {
    "CNAME": "jane.github.io"
  }
}
```

`owner` is required and `records` is optional. Inside `owner`, any one of `username`, `id` or `email` is enough; none of them is required on its own. Leaving `records` out gives you the GitHub Pages default. Every key is described in [Entry fields](./fields/), and each record type in [Records](./records/).

The `id` is the number at `https://api.github.com/users/jane`. It is the strongest identity you can give, because a username can be released and taken by someone else while the number cannot.

Include `username` or `id` when you are filing the claim yourself. An entry with only an `email` has nothing to compare against your account, so the check refuses it and only a trusted author can file it.

:::caution
`owner.username` has to be your own GitHub handle, and the pull request has to be opened by that account. When both sides carry a numeric id, CI compares the ids, so a claim cannot be filed on someone else's behalf.

The name also has to be for a personal or non-commercial site, and the site behind
it has to be reachable and finished. A parked page or a placeholder is refused. See
[the rules every claim agrees to](./policy/#the-rules-every-claim-agrees-to).
:::

## Run the checks locally

```bash
npm run verify
```

That is the same command CI runs: `npm run check` validates `domains/`, then `npm test` runs the 72 test cases.

One difference, and it is deliberate. The claimant check answers "did the account that opened this pull request write this entry", which needs to know who the author is. Without `PR_AUTHOR` and `PR_AUTHOR_ID` in the environment that rule is skipped rather than guessed. CI always passes both.

Three tests are skipped on Windows, because NTFS will not let a file be named `*.app.is-a.ceo.json`. They run on Linux, where CI runs.

## Open the pull request

Open it against `main` and fill in the template. The `check` workflow validates the registry, runs the suite, and pushes the config through `DNSControl check`, which parses everything without contacting Cloudflare. A bot then comments the verdict on the pull request, one line per problem with a hint on how to fix it, before anyone reviews it.

A claim pull request is one file. If your change also touches the scripts, the policy files, or someone else's entry, split it into its own pull request; the [shape rules](./pull-request/) explain why the split is enforced rather than requested.

## Wait for the merge

After the merge, `push.yml` runs `DNSControl push` against Cloudflare. The record answers within a minute or two, plus whatever your DNS resolver caches.

Claiming is one file and one pull request. Releasing a name is not: deleting an entry is a trusted author's action even when the entry is yours. Ask, and they will remove it.

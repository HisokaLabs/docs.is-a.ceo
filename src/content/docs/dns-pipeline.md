---
title: "From merge to live DNS"
description: "How domains/*.json becomes records in Cloudflare: dnsconfig.js, the zone gate, the credentials, and the push workflow."
---

```
domains/jane.is-a.ceo.json
        |
        v
  dnsconfig.js            reads every entry at run time, groups records by zone
        |
        v
  DNSControl push          compares against Cloudflare and applies the difference
        |
        v
    Cloudflare            the record answers
```

Nothing between those steps writes a file. There is no build artefact and no generated `zones/` directory, so the repository and the zone differ only by what the last push applied.

## What `dnsconfig.js` does

The script runs inside DNSControl, which supplies the globals it uses: `D`,
`A`, `AAAA`, `CNAME`, `TXT`, `MX`, `NS`, `SRV`, `CAA`, `PTR`, `DnsProvider`,
`NewDnsProvider`, `NewRegistrar`, and `glob`.

It reads the zone list first, because every later step needs it.

```js title="dnsconfig.js"
function managedZones() {
  var meta = require('./domains/_meta.json');
  var body = meta._meta || meta;
  var list = body.zones;
  if (!list || !list.length) {
    throw new Error('dnsconfig: domains/_meta.json lists no zones, refusing to push');
  }
  return list.map(function (zone) { return String(zone).toLowerCase(); });
}
```

Then it lists the entries. The glob is one level deep and skips the three files that are not claims:

```js title="dnsconfig.js"
var files = glob.apply(null, [filesPath, false, '.json']);
```

`_meta.json`, `_example.json` and `SCHEMA.json` are filtered out by name. Each
remaining file is loaded with `require()`, and an entry without `domain` or
`subdomain` is skipped with a message on stderr rather than crashing the run.

Two things decide what a record looks like.

`proxied` becomes Cloudflare's proxy flag, applied to `A`, `AAAA` and `CNAME`
only. `true` maps to `{ cloudflare_proxy: 'on' }`, anything else to `off`.

A missing `records` key is not the same as an empty one. When the key is absent the script publishes GitHub Pages, and it forces the proxy off because proxying breaks Pages certificate issuance:

```js title="dnsconfig.js"
if (!records) {
  GITHUB_PAGES_A.forEach(function (ip) { addRecord(zone, A(name, ip, PROXY.off)); });
  GITHUB_PAGES_AAAA.forEach(function (ip6) { addRecord(zone, AAAA(name, ip6, PROXY.off)); });
  return;
}
```

Every other type is copied straight through. Targets get a trailing dot when they lack one, because a fully qualified name in a zone file ends with a dot, and an
`MX` or `CNAME` target without it would be read relative to the zone.

Records are grouped per zone, and each zone is declared once at the end:

```js title="dnsconfig.js"
Object.keys(recordsByZone).forEach(function (zone) {
  D(zone, REG_NONE, DNS_PROVIDER, recordsByZone[zone]);
});
```

`REG_NONE` is a registrar that does nothing. The registry manages DNS, not domain
registration, so DNSControl never touches the registrar side.

## The zone gate

An entry names its zone, and a typo there would be a new zone name. The script refuses to continue instead:

```js title="dnsconfig.js"
if (ZONES.indexOf(zone) === -1) {
  refused.push(entry.file + ' claims zone "' + zone + '", which is not in _meta.json zones');
  return;
}
// ...
if (refused.length > 0) {
  throw new Error('dnsconfig: refusing to push, the registry names unmanaged zones:\n  ' + refused.join('\n  '));
}
```

The refusal happens before any `D()` call, so one bad entry cannot leave a half-applied zone behind. The alternative, a push that creates a stray zone in the Cloudflare account or fails after applying three good zones, is worse than a hard failure.

The validator applies the same list earlier with
`zone "is-a.co" is not a managed zone (is-a.ceo)`, so a typo usually fails in the
pull request rather than at push time.

## Credentials

`creds.json` is committed, and it contains no secret:

```json title="creds.json"
{
  "cloudflare": {
    "TYPE": "CLOUDFLAREAPI",
    "apitoken": "$CLOUDFLARE_API_TOKEN"
  }
}
```

DNSControl expands `$CLOUDFLARE_API_TOKEN` from the environment. The real token lives in the repository's Actions secrets, scoped to `Zone.DNS` edit on every zone listed in `_meta.json`. Nothing in the repository can push without that secret, and the secret cannot do anything except edit DNS.

## The push workflow

`push.yml` is the only workflow that writes to Cloudflare.

It triggers on a push to `main` that changes `domains/**` or
`dnsconfig.js`, and on nothing else. A documentation merge does not start a push.

Two guards come before the DNSControl step.

The concurrency group `dns-push` with `cancel-in-progress: false` means two pushes never overlap. Overlapping runs would race on the Cloudflare API and leave the zones in a state neither push intended.

The push job re-runs `npm run check` even though the pull request already passed. That is a backstop for the case where the merge commit differs from the reviewed head, which happens when a branch protection rule allows a merge commit built from something else.

Then `HisokaLabs/dnscontrol-actions@v4` runs with `args: push`. The action is pinned by commit SHA, not by tag, so a moved tag cannot change what runs:

```
uses: HisokaLabs/dnscontrol-actions@efc133a75954bd7bc4dc6b077a107b7244fccb02 # v4
```

## Rebuilding the site

After a successful push, the workflow tells the website repository to rebuild:

```
POST https://api.github.com/repos/HisokaLabs/is-a.ceo/dispatches
{"event_type": "registry-updated"}
```

That is a `repository_dispatch`, authenticated with `SITE_DISPATCH_TOKEN`. When the secret is not set, the step prints `SITE_DISPATCH_TOKEN is not set, skipping the site rebuild` and exits 0. A registry without a website still works, and a missing website token does not fail a DNS push that already succeeded.

The site itself is a separate repository. It reads the same `domains/` files and rebuilds its pages from them, which is why a new entry appears on is-a.ceo without anyone editing the site.

## Why the two stay in step

Both `validate.js` and `dnsconfig.js` read `domains/` **one level deep**. That is the rule behind the flat-directory check: a file in a subdirectory would be skipped by both, so it is refused instead of silently not existing.

Both also read the same zone list from `_meta.json`, one to validate and one to declare. A zone that is not on the list cannot be validated and cannot be declared, so a mistake in either place fails rather than half-succeeding.
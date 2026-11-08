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

The script runs inside DNSControl, which supplies the globals it uses: `D`, `A`, `AAAA`, `CNAME`, `TXT`, `MX`, `NS`, `SRV`, `CAA`, `PTR`, `DnsProvider`, `NewDnsProvider`, `NewRegistrar`, and `glob`.

It reads the zone list first, from the same file the validator reads.

```js title="dnsconfig.js"
function loadZones() {
  var list = require('./registry/zones.json');
  if (!list || !list.length) {
    throw new Error('dnsconfig: registry/zones.json lists no zones, refusing to push');
  }
  return list.map(function (zone) { return String(zone).toLowerCase(); });
}
```

Then it reads the entries. Every JSON file in `domains/` is a claim, and its filename is the record name, so there is no list of filenames to skip and no `subdomain` key to trust:

```js title="dnsconfig.js"
function readClaims(zones) {
  var claims = [];
  var files = glob.apply(null, ['./domains', false, '.json']);

  files.forEach(function (file) {
    var base = file.split('/').pop().split('\\').pop();

    for (var i = 0; i < zones.length; i += 1) {
      var suffix = '.' + zones[i] + '.json';
      if (base.slice(-suffix.length) !== suffix) continue;

      var subdomain = base.slice(0, -suffix.length);
      if (!subdomain) return;

      var path = file.indexOf('.') === 0 || file.indexOf('/') === 0 ? file : './' + file;
      claims.push({ file: file, subdomain: subdomain, zone: zones[i], data: require(path) });
      return;
    }

    console.error('dnsconfig: skipping ' + file + ', its filename names no managed zone');
  });

  return claims;
}
```

`jane.is-a.ceo.json` yields the name `jane` in the zone `is-a.ceo`, and nothing inside the file can contradict that. A file whose name matches no managed zone is reported on stderr and skipped, so it cannot declare a zone by accident.

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

The zone comes from the filename now, and only the zones in `registry/zones.json` are matched. A file for `example.net` is not silently accepted into a zone nobody manages; it matches no suffix and is reported:

```
dnsconfig: skipping ./domains/x.example.net.json, its filename names no managed zone
```

An empty zone list stops the run before anything is declared. The refusal happens before any `D()` call, so one bad file cannot leave a half-applied zone behind. The alternative, a push that creates a stray zone in the Cloudflare account or fails after applying three good zones, is worse than a hard failure.

## Purge mode, and the records it would eat

`D()` carries no `NO_PURGE`, which means DNSControl runs in its default purge mode: **whatever exists in the zone and is not declared by `dnsconfig.js` is deleted.** That is the behaviour that makes the repository the source of truth, and it is also the sharpest edge in the whole pipeline.

It has one consequence worth stating plainly. A name that the DNS administration manages by hand in the Cloudflare dashboard has no entry file, so it declares nothing, so a push would delete it. `www` and `docs` are exactly that: they are on `registry/reserved.json` and they have no file in `domains/`.

So `dnsconfig.js` emits an `IGNORE` for every reserved label that has no claim:

```js title="dnsconfig.js"
function reservedGuard(zone, records) {
  var reserved = require('./registry/reserved.json');
  var claimed = {};

  claims.forEach(function (claim) {
    if (claim.zone === zone) claimed[claim.subdomain] = true;
  });

  reserved.forEach(function (label) {
    if (!claimed[label]) records.push(IGNORE(label));
  });

  return records;
}
```

DNSControl then reports them as deliberately kept:

```
#1: 4 records not being deleted because of IGNORE*():
```

Two properties matter, and both were checked against a local BIND provider rather than assumed.

`IGNORE` is not `NO_PURGE`. `NO_PURGE` disables deletion for the entire zone, so deleting `caliph.is-a.ceo.json` would leave `caliph` answering forever. `IGNORE` names labels, so a claim that is removed is still removed, which is the whole point of holding the registry in git.

A reserved label that *does* have an entry file is not ignored. The file wins and gets pushed, which is how the apex is managed.

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

DNSControl expands `$CLOUDFLARE_API_TOKEN` from the environment. The real token lives in the repository's Actions secrets, scoped to `Zone.DNS` edit on every zone listed in `registry/zones.json`. Nothing in the repository can push without that secret, and the secret cannot do anything except edit DNS.

## The push workflow

`push.yml` is the only workflow that writes to Cloudflare.

It triggers on a push to `main` that changes `domains/**`, `registry/**` or
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

The site itself is a separate repository. It reads the same `domains/` files and the same `registry/zones.json`, and rebuilds its pages from them, which is why a new entry appears on is-a.ceo without anyone editing the site.

## Why the two stay in step

Both `validate.js` and `dnsconfig.js` derive the name from the filename and read `domains/` **one level deep**. That is the rule behind the flat-directory check: a file in a subdirectory would be skipped by both, so it is refused instead of silently not existing.

Both also read the same zone list from `registry/zones.json`, one to validate and one to declare. A zone that is not on the list cannot be validated and cannot be declared, so a mistake in either place fails rather than half-succeeding.

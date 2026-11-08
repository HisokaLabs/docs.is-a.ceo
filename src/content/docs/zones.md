---
title: "Adding a zone"
description: "The maintainer procedure for adding a second zone to the registry, and what has to exist before an entry naming it will pass."
---

Every entry names its own `domain`, and `dnsconfig.js` declares one zone per set of entries, so a second zone needs no new script and no new workflow.

## 1. Create the zone in Cloudflare

Add the zone to the same Cloudflare account and make sure the API token behind
`CLOUDFLARE_API_TOKEN` can edit its DNS. The token is scoped per zone, so a new zone
is invisible to it until someone grants `Zone.DNS` edit there.

Nothing in the registry can do this step. The token can edit records, not create zones, which is the point of the split.

## 2. Add the zone to `registry/zones.json`

```json title="registry/zones.json"
["is-a.ceo", "example.net"]
```

This single list is the gate, and both halves of the pipeline read it.

`scripts/validate.js` refuses any entry whose filename names a zone that is not on the list, with `the name must be <subdomain>.<zone>.json`. `dnsconfig.js` reports the same file on stderr and skips it, so it cannot declare a stray zone in the account by accident.

Changing this file is a trusted author's action, and the list also gates the zone-wide `*` wildcard and every change that loosens the name policy for a zone.

## 3. Commit the zone's own entries

A zone needs at least the apex, because that is what answers for `example.net` itself. The filename carries the zone, so these are two ordinary claims:

```
domains/@.example.net.json
domains/www.example.net.json
```

Apex records are ordinary entries, not a separate config file. When a zone has no apex entry, the zone exists in Cloudflare and in `registry/zones.json` and answers nothing, which the health probe will report as a zone with no SOA.

`@` cannot carry a CNAME and cannot delegate with `NS`; the reasons are DNS rules,
not registry preferences, and both are in [Records](./records/).

## 4. Give the zone its wording, optionally

The website reads zone copy from its own `site/config.json` under `zones`. A zone that is not there falls back to the default branding with the zone name substituted, so this step only changes wording. It never decides whether a zone works.

## Removing a zone

Order matters, and it is the reverse of adding one.

Delete the zone's entries first, then remove the zone from `registry/zones.json`. If the list changes first, the remaining filenames no longer parse to a managed zone, so each one fails validation and `dnsconfig.js` skips it. The entries would silently stop being pushed while still sitting in the repository, which is the state to avoid.

Records in Cloudflare are a separate matter. Nothing in this repository deletes them; the zone has to be removed from the account by hand.

## Checking a new zone

```bash
npm run check          # every entry validates against the new list
npm run health         # the zone answers with an SOA
npm run status         # every entry in the zone serves something
```

`npm run zones` is the one that catches the common mistake. A zone can be listed,
have valid entries and still be down, because the registration lapsed or the nameservers were changed at the registrar. That is exactly what the SOA probe asks, and it runs before any entry is worth looking at.
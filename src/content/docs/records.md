---
title: "Record types"
description: "The nine record types the registry accepts, their exact shapes, and the DNS rules that decide which ones can share a name."
---

Every value is an array, so a name can hold several records of one type. A single string is accepted only for `CNAME`, and only because a name may carry one CNAME target.

## The nine types

| Type | Shape | Accepted on |
| --- | --- | --- |
| `A` | array of IPv4 strings | any name except apex rules below |
| `AAAA` | array of IPv6 strings | any name |
| `CNAME` | one string, or a one-item array | any name except `@` |
| `TXT` | array of strings, ≤ 255 characters each | any name, including next to a proxied CNAME |
| `MX` | array of `{ priority, target }` | any name |
| `NS` | array of hostnames | any name except `@` |
| `SRV` | array of `{ priority, weight, port, target }` | any name |
| `CAA` | array of `{ flag, tag, value }` | any name, including next to a proxied CNAME |
| `PTR` | array of hostnames | any name |

Each type accepts at most 20 values. An empty array is refused: remove the key instead.

## A and AAAA

The address has to be publicly routable. A public name pointing into a private network is a DNS-rebinding setup, so every non-public range is refused, including the documentation ranges people reach for when testing.

| Refused | Why |
| --- | --- |
| `0.0.0.0/8`, `240.0.0.0/4` | This network and reserved space |
| `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` | RFC 1918 private networks |
| `127.0.0.0/8` | Loopback |
| `169.254.0.0/16` | Link-local, including cloud metadata endpoints |
| `100.64.0.0/10` | CGNAT and carrier space, which includes Tailscale |
| `192.0.0.0/24`, `198.18.0.0/15` | IETF assignments and benchmarking |
| `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` | TEST-NET-1, -2 and -3 |
| `224.0.0.0/4` | Multicast |

For IPv6 the same idea applies: `::`, `::1`, `fe80::/10` link-local, `fc00::/7` unique-local, `ff00::/8` multicast and `2001:db8::/32` documentation space are all refused. Addresses that carry an IPv4 address inside them, such as
`::ffff:192.168.1.1`, `64:ff9b::/96` and `2002::/16`, are judged by that inner
address.

:::danger
Do not test with `203.0.113.x` or `2001:db8::`. Both are rejected like any other non-public address, and the failure message names the address rather than the reason.
:::

## CNAME

```json title="domains/jane.is-a.ceo.json"
{
  "domain": "is-a.ceo",
  "subdomain": "jane",
  "owner": "jane",
  "records": {
    "CNAME": ["jane.github.io"]
  }
}
```

One target, written as a bare string or a one-item array. The string is the current form and the array is still accepted so older files keep working; the shipped
`_example.json` uses the array. A trailing dot is optional, and `dnsconfig.js` adds
one when it is missing.

Three rules come with it.

A CNAME cannot name the zone apex, because DNS forbids a CNAME next to the apex's own SOA and NS records. Use `A` and `AAAA` there.

A CNAME cannot point at its own name or at the apex, which would be a loop.

A CNAME cannot share its name with `A`, `AAAA`, `MX`, `NS`, `SRV` or `PTR`. That is a DNS rule, not a registry preference, and DNSControl will reject the pair after the merge even if the registry let it through. The registry refuses it first, because a push that fails after merge leaves the zone behind the repository until someone reverts.

`TXT` and `CAA` may sit next to a CNAME, with one caveat: on an unproxied CNAME,
DNSControl rejects the pair, so the push fails. Set `"proxied": true` if you genuinely need both on one name. Most people need the verification record on a dotted name instead, one level deeper, which is the next section.

## TXT

An array of non-empty strings, at most 255 characters each, no control characters. This is where SPF, DMARC and provider verifications go.

One value gets extra attention: `vc-domain-verify=<name>,<token>`. Vercel issues it when a domain is attached to a project, and the registry pins it to the name it verifies. A proof for `holder.is-a.ceo` counts on `_vercel.holder.is-a.ceo` and nowhere else, because a proof pasted onto a different name would finish someone else's ownership claim.

```
domains/_vercel.holder.is-a.ceo.json: this Vercel proof verifies "holder.is-a.ceo",
so it only counts on "_vercel.holder.is-a.ceo", not on holder.is-a.ceo
```

## MX

```json
"records": {
  "MX": [{ "priority": 10, "target": "mx.example.com" }]
}
```

`priority` is an integer from 0 to 65535. `target` has to be a public hostname.
An `MX`-only entry is accepted on its own, so a name can be a mail route and nothing else.

## NS

An array of public hostnames, which delegates the name to another set of nameservers. The apex cannot delegate through `NS`, because the zone's own delegation belongs to Cloudflare.

An `NS`-only entry is accepted on its own.

## SRV

```json
"records": {
  "SRV": [{ "priority": 0, "weight": 5, "port": 25565, "target": "mc.example.com" }]
}
```

All four fields are integers from 0 to 65535, except `target`, which is a public hostname. Point the target outside this zone. A service record that names the name it sits on becomes a loop the moment anyone adds a CNAME.

A bare `_minecraft._tcp.mc` carrying only SRV data is open to anyone. That is the one underscore name that does not require the base claim, because a service record cannot issue a certificate or forge a mail policy.

## CAA

```json
"records": {
  "CAA": [{ "flag": 0, "tag": "issue", "value": "letsencrypt.org" }]
}
```

`tag` is one of `issue`, `issuewild` or `iodef`, and `flag` is `0` or `128`, which
is the critical bit. `value` is a bare domain, not a URL: `letsencrypt.org`, never
`https://letsencrypt.org`.

## PTR

An array of public hostnames. A `PTR`-only entry is accepted, which makes the registry able to hold a reverse record without an address next to it.

## Pointing at Vercel

The CNAME goes in your own entry. The ownership proof, when Vercel asks for one, goes in a sidecar file one label deeper.

```bash
node scripts/vercel-proof.js --name holder --token <token>
```

The script writes `domains/_vercel.holder.is-a.ceo.json`, runs the validator against it, and prints the remaining steps. It also takes the whole line with `--proof "vc-domain-verify=holder.is-a.ceo,<token>"`, lists existing sidecars with `--list`, and deletes one with `--remove`. `--dry-run` prints the file without writing it.

The reason for a separate file is DNS, not tidiness. `holder.is-a.ceo` already carries a CNAME, and a CNAME cannot share a name with a TXT record, so the proof cannot live in the same entry. DNSControl would fail the push after the merge.

Commit both files in the same pull request if Vercel already shows the banner. After the merge, press Verify in Vercel, wait for **Valid Configuration**, then remove the sidecar in a second pull request. The TXT is only needed until the domain is attached; deleting it afterwards does not detach anything.

A dotted name whose first label starts with `_` is an **auxiliary** entry. It does not count against the one-name-per-person rule and it skips the base-claim rule, but its `owner` still has to be your own GitHub username.

## Combinations that are accepted alone

An entry does not have to resolve to an address. These are all valid on their own, and each is a real use:

- `NS` only: a delegation.
- `MX` only: a mail route.
- `SRV` only: a service record.
- `PTR` only: a reverse record.
- `TXT` only: a verification record.

The validator refuses an entry with no records at all unless the key is absent entirely, which is the GitHub Pages default described in [Entry fields](./fields/).
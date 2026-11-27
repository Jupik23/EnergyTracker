# EnergyTracker — published data

This branch is generated automatically every ~15 minutes by the
[`Update data`](../../actions/workflows/update-data.yml) workflow and is
force-pushed as a single commit. Do not edit it by hand.

| Path                                  | Content                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `v1/index.json`                       | Status and latest values for every zone              |
| `v1/<zone>/latest.json`               | Today's mix, prices (today + tomorrow), CO₂ forecast |
| `v1/<zone>/history/<YYYY-MM-DD>.json` | Daily mix + prices archive (last 90 days)            |

Schema: see `packages/core/src/types.ts` on `main`.

Data: Energy-Charts (Fraunhofer ISE, CC BY 4.0) and PSE S.A. (RCE).

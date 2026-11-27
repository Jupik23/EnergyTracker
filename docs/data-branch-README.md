# EnergyTracker — published data

This branch is generated automatically every ~15 minutes by the
[`Update data`](../../actions/workflows/update-data.yml) workflow and is
force-pushed as a single commit. Do not edit it by hand.

| Path                                | Content                                              |
| ----------------------------------- | ---------------------------------------------------- |
| `v1/index.json`                     | Status and latest values for every country           |
| `v1/<cc>/latest.json`               | Today's mix, prices (today + tomorrow), CO₂ forecast |
| `v1/<cc>/history/<YYYY-MM-DD>.json` | Daily generation mix archive (last 90 days)          |

Schema: see `packages/core/src/types.ts` on `main`.

Data: Energy-Charts (Fraunhofer ISE, CC BY 4.0) and PSE S.A. (RCE).

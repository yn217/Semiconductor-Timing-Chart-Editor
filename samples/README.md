# Golden Sample Plan

20 fixtures are defined by Issue #17.

## Protocol / use-case 01-10
1. APB register access
2. AHB-Lite pipelined transfer
3. AXI4 Full write burst
4. AXI4 Full read outstanding
5. SRAM 1-port
6. SRAM 2-port
7. AXI4 to DRAM read path
8. Async FIFO / CDC
9. Accelerator request/response
10. AXI4-Stream packet/backpressure

## Feature coverage 11-20
11. Signal types / roles / legend
12. Group Bands / vertical spacing / Spacer
13. Signal name layout
14. Annotation overlay all types
15. Transition arrows / anchor styles
16. Clock phase / gating / collapsed gap
17. Cycle insert/delete/ripple
18. Legend free placement / arbitrary group order
19. Header/footer/export
20. Transaction/Cycle linked views

Prepared ZIP identities:
- `TimingChartEditor_10_Samples.zip`: SHA-256 `9e9fde221c7847456b2a728195655b6d244f89aa76fcf9f0d4c73456d2e6429d`
- `TimingChartEditor_Feature_Coverage_10_Samples.zip`: SHA-256 `4123864f906e8d752dac0a6cc04830b7478db1df3c5e5a60871931588744c0be`

The GitHub connector used for bootstrap does not expose binary ZIP upload. See Issue #17 for acceptance requirements and package identity.

The prepared packages are also retained under `references/` and unpacked for local validation under:

- `samples/golden-protocol/` — 01-10
- `samples/golden-feature-coverage/` — 11-20

Run `node scripts/validate-samples.mjs` to validate the 20 semantic `.tcd.json` fixtures and the feature coverage matrix.

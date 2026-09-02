# dsh-coding-oauth-core

`dsh-coding-oauth-core` contains DSH-neutral ownership and compatibility contracts shared by the standalone coding-subscription OAuth plugin and Usage Center (Hub).

It intentionally has no `dsh.bundle` or `dsh.client` metadata. Integrations may bundle a physical copy; a versioned global registry coordinates those copies per Cordis root and keeps only one OAuth runtime active.

## Public surface

Root export (`.`):

- `acquireCodingOAuthRuntime()`
- `CodingOAuthRuntime` / `CodingOAuthParticipant`
- `OwnerRequestPolicy` / `DshHostCapabilities`
- Proxy lease helpers, route registration, ids, state contract
- Shared helpers also re-exported from the root: `http-json`, `grok-errors`, `kimi-errors`, `gateway-protocol`

Subpath exports:

| Export | Purpose |
| --- | --- |
| `dsh-coding-oauth-core/contracts` | Browser-safe ABI / capability contracts |
| `dsh-coding-oauth-core/http-json` | JSON request helpers |
| `dsh-coding-oauth-core/grok-errors` | xAI capacity remapping |
| `dsh-coding-oauth-core/kimi-errors` | Kimi context-overflow remapping |
| `dsh-coding-oauth-core/gateway-protocol` | Gateway request / stream types |

This is an npm dependency, not a DSH plugin. Operators install Hub and/or Subscription in the existing DSH `web` profile; they do **not** run `dsh plugin add dsh-coding-oauth-core`.

## Development (vendored in Hub)

Source lives at `vendor/dsh-coding-oauth-core` inside [`dsh-hub-oauth-gateway`](https://github.com/lninghaha/dsh-hub-oauth-gateway). Hub and Subscription consume the published npm package; `vendor/dsh-coding-oauth-core` remains the editable source for future core releases.

```bash
# from this directory (or via Hub root: pnpm exec tsc -p vendor/dsh-coding-oauth-core)
pnpm run build
pnpm run check
pnpm run release:inspect   # npm pack --dry-run
```

`src/` is the only editable source. Rebuild and commit `lib/` before packing or publishing.

## Publish next core version (operators only)

Agents must **not** run `npm login` or `npm publish`. After prep (build, check, dry-run review) is green on the release branch, the operator publishes with:

```bash
cd vendor/dsh-coding-oauth-core
npm login --registry https://registry.npmjs.org/
pnpm run release:publish
```

`release:publish` runs `check` then `npm publish --access public`. Enter the OTP in the terminal; do not paste tokens into chat.

After publish, verify:

```bash
npm view dsh-coding-oauth-core version
npm view dsh-coding-oauth-core exports
```

Hub / Subscription now depend on registry `dsh-coding-oauth-core@0.1.2`. Keep this vendor tree as the editable source for the next core release.

## License

Apache-2.0. Independent community package; no vendor endorsement is implied.

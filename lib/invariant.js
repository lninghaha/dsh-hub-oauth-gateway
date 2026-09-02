/** dsh-hub-oauth-gateway invariant entry */

// src/server/coding-oauth/invariant.ts
var PACKAGE_NAME = "dsh-hub-oauth-gateway";
var name = "grok-build-invariant";
var inject = ["invariants"];
var install = () => {
};
var apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
export {
  apply,
  inject,
  name
};

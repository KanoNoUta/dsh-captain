//#region lib/types/invariant.js
const PACKAGE_NAME = "@deepseek-ai/dsh-captain";
const name = "captain-invariant";
const inject = ["invariants"];
/** No runtime invariant: Captain's relation is covered by its host/client integration tests. */
const install = () => {};
/** Register the package ownership invariant. */
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };

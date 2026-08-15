/** Package-owned invariant companion for `@kanonouta/dsh-captain`. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@kanonouta/dsh-captain'
export const name = 'captain-invariant'
export const inject = ['invariants']
/** No runtime invariant: Captain's relation is covered by its host/client integration tests. */
const install: InvariantInstaller = () => {}

/** Register the package ownership invariant. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))

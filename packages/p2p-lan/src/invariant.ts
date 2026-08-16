/** Package-owned invariant companion for `@rellopn/dsh-p2p-lan`. @module @rellopn/dsh-p2p-lan/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@rellopn/dsh-p2p-lan'
/** Cordis companion plugin name. */
export const name = 'p2p-lan-invariant'
/** Service required before package ownership can be reserved. */
export const inject = ['invariants']
/** No runtime invariant: the transport validates envelopes and attachments before publishing. */
const install: InvariantInstaller = () => {}
/**
 * Register the package invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */

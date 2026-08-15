/** Package-owned invariant companion for `@kanonouta/dsh-captain`. */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "captain-invariant";
export declare const inject: string[];
/** Register the package ownership invariant. */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map

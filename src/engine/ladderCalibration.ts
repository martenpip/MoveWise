/**
 * How uncertain the bot ratings are, as the rating deviation Glicko-2 uses for an opponent. Set from the verification games listed
 * in docs/bots.md: levels placed by playing against each other (built-in) carry more uncertainty than levels that use Stockfish's own
 * strength limiter, but even those are the engine's scale, not a human one. These are deliberately wide.
 */
export const LADDER_RD = { builtin: 120, stockfish: 90 } as const;

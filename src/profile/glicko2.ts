/**
 * Glicko-2 rating update (Mark Glickman, 2013, http://www.glicko.net/glicko/glicko2.pdf).
 *
 * Pure functions, no I/O. One call to `glicko2Update` handles one rating period containing the given
 * results. MoveWise treats every finished game as its own rating period and applies no inactivity
 * decay, so a player's rating is a deterministic function of their saved games.
 */

const SCALE = 173.7178;
const EPS = 1e-6;

export interface GlickoState {
  /** Rating on the Glicko scale (default origin 1500; MoveWise defines its own origin in rating.ts). */
  rating: number;
  /** Rating deviation: one standard deviation of uncertainty, in rating points. */
  rd: number;
  /** Volatility: how erratic the player's results are. */
  vol: number;
}

export interface GlickoResult {
  opponentRating: number;
  opponentRd: number;
  /** 1 = win, 0.5 = draw, 0 = loss. */
  score: number;
}

export const GLICKO_DEFAULTS = { tau: 0.5, initialVol: 0.06, initialRd: 350, minRd: 30, maxRd: 350 } as const;

const g = (phi: number): number => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu: number, muJ: number, phiJ: number): number => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

export function glicko2Update(
  state: GlickoState,
  results: GlickoResult[],
  tau: number = GLICKO_DEFAULTS.tau,
): GlickoState {
  const mu = (state.rating - 1500) / SCALE;
  const phi = state.rd / SCALE;
  const sigma = state.vol;

  if (results.length === 0) {
    // No games in the period: only uncertainty grows (not used by MoveWise, kept for completeness).
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { ...state, rd: Math.min(GLICKO_DEFAULTS.maxRd, phiStar * SCALE) };
  }

  let vInv = 0;
  let deltaSum = 0;
  for (const r of results) {
    const muJ = (r.opponentRating - 1500) / SCALE;
    const phiJ = r.opponentRd / SCALE;
    const gj = g(phiJ);
    const ej = E(mu, muJ, phiJ);
    vInv += gj * gj * ej * (1 - ej);
    deltaSum += gj * (r.score - ej);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Step 5: new volatility by the Illinois-algorithm root find.
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * (phi * phi + v + ex) ** 2;
    return num / den - (x - a) / (tau * tau);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > EPS && guard++ < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else fA /= 2;
    B = C;
    fB = fC;
  }
  const sigmaNew = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * deltaSum;

  return {
    rating: muNew * SCALE + 1500,
    rd: Math.min(GLICKO_DEFAULTS.maxRd, Math.max(GLICKO_DEFAULTS.minRd, phiNew * SCALE)),
    vol: sigmaNew,
  };
}

/** Expected score of a player against an opponent (Glicko-2, includes the opponent's uncertainty). */
export function expectedScore(player: number, opponent: number, opponentRd: number): number {
  return E((player - 1500) / SCALE, (opponent - 1500) / SCALE, opponentRd / SCALE);
}

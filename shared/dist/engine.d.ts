import { MatchSimulationState, Team, Player, PlayerOnPitchState, Vector2D, PlayerPosition, SetPieceState } from './types.js';
/**
 * Selects the starting 11 players based on team formation and player positions,
 * and assigns them roles on the pitch.
 */
export declare function selectStartingLineup(team: Team): {
    player: Player;
    role: string;
    position: PlayerPosition;
}[];
/**
 * Initializes the simulation state for a match.
 */
export declare function initializeMatchState(matchId: number, homeTeam: Team, awayTeam: Team, round?: 'GROUP_STAGE' | 'R32' | 'R16' | 'QF' | 'SF' | 'FINAL'): MatchSimulationState;
/**
 * Main simulation tick execution.
 */
export declare function simulateTick(state: MatchSimulationState): MatchSimulationState;
/**
 * Calculates a realistic target coordinate for a player during set piece setups.
 */
export declare function getSetPieceTargetPosition(state: MatchSimulationState, p: PlayerOnPitchState, activeSetPiece: SetPieceState): Vector2D;
/**
 * Runs a high-fidelity statistical match simulation instantly.
 * Used for background/tournament stage simulation to return results immediately.
 */
export declare function simulateMatchInstant(state: MatchSimulationState): MatchSimulationState;

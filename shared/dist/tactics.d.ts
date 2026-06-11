import { FormationType, PlayerPosition, TeamTactics, Vector2D } from './types.js';
export declare const FORMATION_ROLES: Record<FormationType, {
    position: PlayerPosition;
    role: string;
}[]>;
export declare const FORMATION_COORDINATES: Record<FormationType, Record<string, Vector2D>>;
/**
 * Calculates a player's dynamic target position on the pitch based on:
 * 1. Base formation coordinates
 * 2. Play phase (attacking, defending, transition)
 * 3. Ball position (shifting team block horizontally and vertically)
 * 4. Tactics (defensive line height, pressing height, tempo)
 */
export declare function getTacticalTargetPosition(role: string, formation: FormationType, isHome: boolean, ballPos: Vector2D, tactics: TeamTactics, possessionTeamId: string | null, teamId: string, hasActiveSoloDribbler?: boolean): Vector2D;

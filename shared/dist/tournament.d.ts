import { TournamentState, Team, Group, KnockoutMatchNode, MatchSimulationState } from './types.js';
/**
 * Initializes a new World Cup 2026 tournament.
 * Uses static group drawings from groupstage.xlsx.
 */
export declare function initializeTournament(id: number, name: string, teams: Record<string, Team>): TournamentState;
/**
 * Recalculates standing table for a specific group based on simulated matches.
 */
export declare function recalculateGroupTable(group: Group, completedMatches: MatchSimulationState[]): void;
/**
 * Sorts and identifies the best 3rd place teams to advance.
 */
export declare function getBestThirdPlaceTeams(groups: Group[], teams: Record<string, Team>): string[];
/**
 * Generates Round of 32 brackets.
 * Combines 24 teams (1st & 2nd place in 12 groups) + 8 best third place teams = 32 teams.
 */
export declare function generateRoundOf32(tournament: TournamentState): Record<number, KnockoutMatchNode>;
/**
 * Propagates winners of a knockout round to the next round's nodes.
 */
export declare function propagateKnockoutWinners(tournament: TournamentState): void;
/**
 * Compiles and updates player stats (goals, assists, yellow/red cards) based on match events.
 */
export declare function updateTournamentPlayerStats(tournament: TournamentState, matches: MatchSimulationState[]): void;
/**
 * Applies fatigue, recovery, morale updates, suspensions, and injuries to
 * tournament team rosters after a round of simulated matches.
 */
export declare function applyPostMatchRosterUpdates(tournament: TournamentState, matches: MatchSimulationState[]): void;

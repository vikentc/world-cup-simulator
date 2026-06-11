import { Team, FormationType, TacticalStyle } from './types.js';
export declare const WC_NATIONS: {
    id: string;
    name: string;
    ranking: number;
    elo: number;
    primary: string;
    secondary: string;
    formation: FormationType;
    style: TacticalStyle;
}[];
/**
 * Returns the loaded real team.
 */
export declare function generateProceduralTeam(nationRaw: {
    id: string;
}): Team;
/**
 * Returns all 48 loaded World Cup teams with real players.
 */
export declare function generateAllWorldCupTeams(): Record<string, Team>;

import { TEAMS_DATA } from './data/teams_data.js';
export const WC_NATIONS = Object.values(TEAMS_DATA).map((t) => ({
    id: t.id,
    name: t.name,
    ranking: t.fifaRanking,
    elo: t.eloRating,
    primary: t.colorPrimary,
    secondary: t.colorSecondary,
    formation: t.tactics.formation,
    style: t.tactics.style,
}));
/**
 * Returns the loaded real team.
 */
export function generateProceduralTeam(nationRaw) {
    const team = TEAMS_DATA[nationRaw.id];
    if (!team) {
        throw new Error(`Team not found: ${nationRaw.id}`);
    }
    return JSON.parse(JSON.stringify(team));
}
/**
 * Returns all 48 loaded World Cup teams with real players.
 */
export function generateAllWorldCupTeams() {
    return JSON.parse(JSON.stringify(TEAMS_DATA));
}

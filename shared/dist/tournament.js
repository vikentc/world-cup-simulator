import { GROUPSTAGE_GROUPS } from './data/groupstage_data.js';
/**
 * Initializes a new World Cup 2026 tournament.
 * Uses static group drawings from groupstage.xlsx.
 */
export function initializeTournament(id, name, teams) {
    const groups = [];
    // Deep clone teams to avoid mutating original source objects
    const clonedTeams = JSON.parse(JSON.stringify(teams));
    // Initialize tournament-specific states for each player
    Object.values(clonedTeams).forEach((team) => {
        // Morale scale: higher ELO = better initial composure/morale (less nerves)
        const baseMorale = Math.max(55, Math.min(90, Math.round(70 + (team.eloRating - 1500) / 15)));
        team.players.forEach((player) => {
            player.fitness = 100;
            player.morale = baseMorale;
            player.suspendedMatches = 0;
            player.injuryDuration = 0;
            player.staminaState = 100;
            player.yellowCards = 0;
            player.redCarded = false;
            player.injured = false;
        });
    });
    Object.entries(GROUPSTAGE_GROUPS).forEach(([groupId, teamIds]) => {
        const table = teamIds.map((teamId) => ({
            teamId,
            teamName: clonedTeams[teamId] ? clonedTeams[teamId].name : teamId,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
        }));
        groups.push({
            id: groupId,
            teams: teamIds,
            matches: [],
            table,
        });
    });
    return {
        id,
        name,
        status: 'IN_PROGRESS',
        currentRound: 'GROUP_STAGE',
        groups,
        knockoutNodes: {},
        teams: clonedTeams,
        completedMatches: {},
        playerStats: {},
    };
}
/**
 * Recalculates standing table for a specific group based on simulated matches.
 */
export function recalculateGroupTable(group, completedMatches) {
    // Reset table entries
    group.table.forEach((entry) => {
        entry.played = 0;
        entry.won = 0;
        entry.drawn = 0;
        entry.lost = 0;
        entry.goalsFor = 0;
        entry.goalsAgainst = 0;
        entry.goalDifference = 0;
        entry.points = 0;
    });
    completedMatches.forEach((match) => {
        const homeEntry = group.table.find((e) => e.teamId === match.homeTeam.id);
        const awayEntry = group.table.find((e) => e.teamId === match.awayTeam.id);
        if (homeEntry && awayEntry && match.status === 'COMPLETED') {
            homeEntry.played++;
            awayEntry.played++;
            homeEntry.goalsFor += match.homeScore;
            homeEntry.goalsAgainst += match.awayScore;
            homeEntry.goalDifference = homeEntry.goalsFor - homeEntry.goalsAgainst;
            awayEntry.goalsFor += match.awayScore;
            awayEntry.goalsAgainst += match.homeScore;
            awayEntry.goalDifference = awayEntry.goalsFor - awayEntry.goalsAgainst;
            if (match.homeScore > match.awayScore) {
                homeEntry.won++;
                homeEntry.points += 3;
                awayEntry.lost++;
            }
            else if (match.awayScore > match.homeScore) {
                awayEntry.won++;
                awayEntry.points += 3;
                homeEntry.lost++;
            }
            else {
                homeEntry.drawn++;
                homeEntry.points += 1;
                awayEntry.drawn++;
                awayEntry.points += 1;
            }
        }
    });
    // Sort group standings: Points -> GD -> GoalsFor -> Random/Fifa ranking fallback
    group.table.sort((a, b) => {
        if (b.points !== a.points)
            return b.points - a.points;
        if (b.goalDifference !== a.goalDifference)
            return b.goalDifference - a.goalDifference;
        if (b.goalsFor !== a.goalsFor)
            return b.goalsFor - a.goalsFor;
        return 0; // Maintain order / FIFA ranking later
    });
}
/**
 * Sorts and identifies the best 3rd place teams to advance.
 */
export function getBestThirdPlaceTeams(groups, teams) {
    const thirdPlaceEntries = [];
    groups.forEach((group) => {
        if (group.table.length >= 3) {
            thirdPlaceEntries.push({ entry: group.table[2], groupId: group.id });
        }
    });
    // Sort: Points -> GD -> GF -> ELO Fallback
    thirdPlaceEntries.sort((a, b) => {
        if (b.entry.points !== a.entry.points)
            return b.entry.points - a.entry.points;
        if (b.entry.goalDifference !== a.entry.goalDifference)
            return b.entry.goalDifference - a.entry.goalDifference;
        if (b.entry.goalsFor !== a.entry.goalsFor)
            return b.entry.goalsFor - a.entry.goalsFor;
        // Elo fallback
        const eloA = teams[a.entry.teamId]?.eloRating || 1500;
        const eloB = teams[b.entry.teamId]?.eloRating || 1500;
        return eloB - eloA;
    });
    // Take top 8 team IDs
    return thirdPlaceEntries.slice(0, 8).map((item) => item.entry.teamId);
}
const assignments = [
    { nodeId: 102, winnerGroupId: 'E', allowedThirdPlaceGroups: ['A', 'B', 'C', 'D', 'F'] }, // Match 74
    { nodeId: 105, winnerGroupId: 'I', allowedThirdPlaceGroups: ['C', 'D', 'F', 'G', 'H'] }, // Match 77
    { nodeId: 107, winnerGroupId: 'A', allowedThirdPlaceGroups: ['C', 'E', 'F', 'H', 'I'] }, // Match 79
    { nodeId: 108, winnerGroupId: 'L', allowedThirdPlaceGroups: ['E', 'H', 'I', 'J', 'K'] }, // Match 80
    { nodeId: 109, winnerGroupId: 'D', allowedThirdPlaceGroups: ['B', 'E', 'F', 'I', 'J'] }, // Match 81
    { nodeId: 110, winnerGroupId: 'G', allowedThirdPlaceGroups: ['A', 'E', 'H', 'I', 'J'] }, // Match 82
    { nodeId: 113, winnerGroupId: 'B', allowedThirdPlaceGroups: ['E', 'F', 'G', 'I', 'J'] }, // Match 85
    { nodeId: 115, winnerGroupId: 'K', allowedThirdPlaceGroups: ['D', 'E', 'I', 'J', 'L'] }, // Match 87
];
function matchThirdPlaceTeams(qualifiedThirds, assignments) {
    const result = {};
    const used = new Set();
    function backtrack(index) {
        if (index === assignments.length) {
            return true;
        }
        const slot = assignments[index];
        for (const third of qualifiedThirds) {
            if (used.has(third.teamId))
                continue;
            if (slot.allowedThirdPlaceGroups.includes(third.groupId) && slot.winnerGroupId !== third.groupId) {
                result[slot.nodeId] = third.teamId;
                used.add(third.teamId);
                if (backtrack(index + 1)) {
                    return true;
                }
                // Undo
                delete result[slot.nodeId];
                used.delete(third.teamId);
            }
        }
        return false;
    }
    if (backtrack(0)) {
        return result;
    }
    // Fallback: relax allowed groups, just avoid same group
    used.clear();
    for (const slot of assignments) {
        const matched = qualifiedThirds.find((third) => !used.has(third.teamId) && third.groupId !== slot.winnerGroupId);
        if (matched) {
            result[slot.nodeId] = matched.teamId;
            used.add(matched.teamId);
        }
        else {
            // absolute fallback
            const absoluteMatched = qualifiedThirds.find((third) => !used.has(third.teamId));
            if (absoluteMatched) {
                result[slot.nodeId] = absoluteMatched.teamId;
                used.add(absoluteMatched.teamId);
            }
        }
    }
    return result;
}
/**
 * Generates Round of 32 brackets.
 * Combines 24 teams (1st & 2nd place in 12 groups) + 8 best third place teams = 32 teams.
 */
export function generateRoundOf32(tournament) {
    const groupWinners = {};
    const groupRunnersUp = {};
    tournament.groups.forEach((group) => {
        if (group.table && group.table.length >= 2) {
            groupWinners[group.id] = group.table[0].teamId;
            groupRunnersUp[group.id] = group.table[1].teamId;
        }
    });
    // 8 best third-place
    const bestThirds = getBestThirdPlaceTeams(tournament.groups, tournament.teams);
    const bestThirdsWithGroup = bestThirds.map((teamId) => {
        const group = tournament.groups.find((g) => g.teams.includes(teamId));
        return { teamId, groupId: group.id };
    });
    const matchedThirds = matchThirdPlaceTeams(bestThirdsWithGroup, assignments);
    const nodes = {};
    // Node 101: Runner-up A vs Runner-up B
    nodes[101] = {
        matchId: null,
        homeSource: { type: 'runner_up', id: 'A', rank: 2 },
        awaySource: { type: 'runner_up', id: 'B', rank: 2 },
        homeTeamId: groupRunnersUp['A'] || null,
        awayTeamId: groupRunnersUp['B'] || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 202,
    };
    // Node 102: Winner E vs 3rd Group A/B/C/D/F
    nodes[102] = {
        matchId: null,
        homeSource: { type: 'winner', id: 'E', rank: 1 },
        awaySource: { type: 'third_place', id: 'A/B/C/D/F', rank: 3 },
        homeTeamId: groupWinners['E'] || null,
        awayTeamId: (matchedThirds && matchedThirds[102]) || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 201,
    };
    // Node 103: Winner F vs Runner-up C
    nodes[103] = {
        matchId: null,
        homeSource: { type: 'winner', id: 'F', rank: 1 },
        awaySource: { type: 'runner_up', id: 'C', rank: 2 },
        homeTeamId: groupWinners['F'] || null,
        awayTeamId: groupRunnersUp['C'] || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 202,
    };
    // Node 104: Winner C vs Runner-up F
    nodes[104] = {
        matchId: null,
        homeSource: { type: 'winner', id: 'C', rank: 1 },
        awaySource: { type: 'runner_up', id: 'F', rank: 2 },
        homeTeamId: groupWinners['C'] || null,
        awayTeamId: groupRunnersUp['F'] || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 203,
    };
    // Node 105: Winner I vs 3rd Group C/D/F/G/H
    nodes[105] = {
        matchId: null,
        homeSource: { type: 'winner', id: 'I', rank: 1 },
        awaySource: { type: 'third_place', id: 'C/D/F/G/H', rank: 3 },
        homeTeamId: groupWinners['I'] || null,
        awayTeamId: (matchedThirds && matchedThirds[105]) || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 201,
    };
    // Node 106: Runner-up E vs Runner-up I
    nodes[106] = {
        matchId: null,
        homeSource: { type: 'runner_up', id: 'E', rank: 2 },
        awaySource: { type: 'runner_up', id: 'I', rank: 2 },
        homeTeamId: groupRunnersUp['E'] || null,
        awayTeamId: groupRunnersUp['I'] || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 203,
    };
    // Node 107: Winner A vs 3rd Group C/E/F/H/I
    nodes[107] = {
        matchId: null,
        homeSource: { type: 'winner', id: 'A', rank: 1 },
        awaySource: { type: 'third_place', id: 'C/E/F/H/I', rank: 3 },
        homeTeamId: groupWinners['A'] || null,
        awayTeamId: (matchedThirds && matchedThirds[107]) || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 204,
    };
    // Node 108: Winner L vs 3rd Group E/H/I/J/K
    nodes[108] = {
        matchId: null,
        homeSource: { type: 'winner', id: 'L', rank: 1 },
        awaySource: { type: 'third_place', id: 'E/H/I/J/K', rank: 3 },
        homeTeamId: groupWinners['L'] || null,
        awayTeamId: (matchedThirds && matchedThirds[108]) || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 204,
    };
    // Node 109: Winner D vs 3rd Group B/E/F/I/J
    nodes[109] = {
        matchId: null,
        homeSource: { type: 'winner', id: 'D', rank: 1 },
        awaySource: { type: 'third_place', id: 'B/E/F/I/J', rank: 3 },
        homeTeamId: groupWinners['D'] || null,
        awayTeamId: (matchedThirds && matchedThirds[109]) || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 206,
    };
    // Node 110: Winner G vs 3rd Group A/E/H/I/J
    nodes[110] = {
        matchId: null,
        homeSource: { type: 'winner', id: 'G', rank: 1 },
        awaySource: { type: 'third_place', id: 'A/E/H/I/J', rank: 3 },
        homeTeamId: groupWinners['G'] || null,
        awayTeamId: (matchedThirds && matchedThirds[110]) || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 206,
    };
    // Node 111: Runner-up K vs Runner-up L
    nodes[111] = {
        matchId: null,
        homeSource: { type: 'runner_up', id: 'K', rank: 2 },
        awaySource: { type: 'runner_up', id: 'L', rank: 2 },
        homeTeamId: groupRunnersUp['K'] || null,
        awayTeamId: groupRunnersUp['L'] || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 205,
    };
    // Node 112: Winner H vs Runner-up J
    nodes[112] = {
        matchId: null,
        homeSource: { type: 'winner', id: 'H', rank: 1 },
        awaySource: { type: 'runner_up', id: 'J', rank: 2 },
        homeTeamId: groupWinners['H'] || null,
        awayTeamId: groupRunnersUp['J'] || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 205,
    };
    // Node 113: Winner B vs 3rd Group E/F/G/I/J
    nodes[113] = {
        matchId: null,
        homeSource: { type: 'winner', id: 'B', rank: 1 },
        awaySource: { type: 'third_place', id: 'E/F/G/I/J', rank: 3 },
        homeTeamId: groupWinners['B'] || null,
        awayTeamId: (matchedThirds && matchedThirds[113]) || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 208,
    };
    // Node 114: Winner J vs Runner-up H
    nodes[114] = {
        matchId: null,
        homeSource: { type: 'winner', id: 'J', rank: 1 },
        awaySource: { type: 'runner_up', id: 'H', rank: 2 },
        homeTeamId: groupWinners['J'] || null,
        awayTeamId: groupRunnersUp['H'] || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 207,
    };
    // Node 115: Winner K vs 3rd Group D/E/I/J/L
    nodes[115] = {
        matchId: null,
        homeSource: { type: 'winner', id: 'K', rank: 1 },
        awaySource: { type: 'third_place', id: 'D/E/I/J/L', rank: 3 },
        homeTeamId: groupWinners['K'] || null,
        awayTeamId: (matchedThirds && matchedThirds[115]) || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 208,
    };
    // Node 116: Runner-up D vs Runner-up G
    nodes[116] = {
        matchId: null,
        homeSource: { type: 'runner_up', id: 'D', rank: 2 },
        awaySource: { type: 'runner_up', id: 'G', rank: 2 },
        homeTeamId: groupRunnersUp['D'] || null,
        awayTeamId: groupRunnersUp['G'] || null,
        winnerId: null,
        round: 'R32',
        nextMatchNodeId: 207,
    };
    // Round of 16
    const r16Pairings = [
        { homeId: 102, awayId: 105, nextMatchNodeId: 301 }, // Node 201 (Match 89) -> QF1 (Node 301)
        { homeId: 101, awayId: 103, nextMatchNodeId: 301 }, // Node 202 (Match 90) -> QF1 (Node 301)
        { homeId: 104, awayId: 106, nextMatchNodeId: 303 }, // Node 203 (Match 91) -> QF3 (Node 303)
        { homeId: 107, awayId: 108, nextMatchNodeId: 303 }, // Node 204 (Match 92) -> QF3 (Node 303)
        { homeId: 111, awayId: 112, nextMatchNodeId: 302 }, // Node 205 (Match 93) -> QF2 (Node 302)
        { homeId: 109, awayId: 110, nextMatchNodeId: 302 }, // Node 206 (Match 94) -> QF2 (Node 302)
        { homeId: 114, awayId: 116, nextMatchNodeId: 304 }, // Node 207 (Match 95) -> QF4 (Node 304)
        { homeId: 113, awayId: 115, nextMatchNodeId: 304 }, // Node 208 (Match 96) -> QF4 (Node 304)
    ];
    for (let i = 0; i < 8; i++) {
        const pairing = r16Pairings[i];
        nodes[201 + i] = {
            matchId: null,
            homeSource: { type: 'knockout', id: String(pairing.homeId), rank: 1 },
            awaySource: { type: 'knockout', id: String(pairing.awayId), rank: 1 },
            homeTeamId: null,
            awayTeamId: null,
            winnerId: null,
            round: 'R16',
            nextMatchNodeId: pairing.nextMatchNodeId,
        };
    }
    // Quarter-Finals
    const qfPairings = [
        { homeId: 201, awayId: 202, nextMatchNodeId: 401 }, // Node 301 (QF1) -> SF1 (Node 401)
        { homeId: 205, awayId: 206, nextMatchNodeId: 401 }, // Node 302 (QF2) -> SF1 (Node 401)
        { homeId: 203, awayId: 204, nextMatchNodeId: 402 }, // Node 303 (QF3) -> SF2 (Node 402)
        { homeId: 207, awayId: 208, nextMatchNodeId: 402 }, // Node 304 (QF4) -> SF2 (Node 402)
    ];
    for (let i = 0; i < 4; i++) {
        const pairing = qfPairings[i];
        nodes[301 + i] = {
            matchId: null,
            homeSource: { type: 'knockout', id: String(pairing.homeId), rank: 1 },
            awaySource: { type: 'knockout', id: String(pairing.awayId), rank: 1 },
            homeTeamId: null,
            awayTeamId: null,
            winnerId: null,
            round: 'QF',
            nextMatchNodeId: pairing.nextMatchNodeId,
        };
    }
    // Semi-Finals
    nodes[401] = {
        matchId: null,
        homeSource: { type: 'knockout', id: '301', rank: 1 },
        awaySource: { type: 'knockout', id: '302', rank: 1 },
        homeTeamId: null,
        awayTeamId: null,
        winnerId: null,
        round: 'SF',
        nextMatchNodeId: 501,
    };
    nodes[402] = {
        matchId: null,
        homeSource: { type: 'knockout', id: '303', rank: 1 },
        awaySource: { type: 'knockout', id: '304', rank: 1 },
        homeTeamId: null,
        awayTeamId: null,
        winnerId: null,
        round: 'SF',
        nextMatchNodeId: 501,
    };
    // Final
    nodes[501] = {
        matchId: null,
        homeSource: { type: 'knockout', id: '401', rank: 1 },
        awaySource: { type: 'knockout', id: '402', rank: 1 },
        homeTeamId: null,
        awayTeamId: null,
        winnerId: null,
        round: 'FINAL',
        nextMatchNodeId: null,
    };
    return nodes;
}
/**
 * Propagates winners of a knockout round to the next round's nodes.
 */
export function propagateKnockoutWinners(tournament) {
    const nodes = tournament.knockoutNodes;
    Object.entries(nodes).forEach(([idStr, node]) => {
        if (node.winnerId && node.nextMatchNodeId) {
            const nextNode = nodes[node.nextMatchNodeId];
            if (nextNode) {
                if (nextNode.homeSource && nextNode.homeSource.type === 'knockout' && nextNode.homeSource.id === idStr) {
                    nextNode.homeTeamId = node.winnerId;
                }
                else if (nextNode.awaySource && nextNode.awaySource.type === 'knockout' && nextNode.awaySource.id === idStr) {
                    nextNode.awayTeamId = node.winnerId;
                }
                else {
                    // Fallback just in case
                    const id = parseInt(idStr, 10);
                    if (id % 2 !== 0) {
                        nextNode.homeTeamId = node.winnerId;
                    }
                    else {
                        nextNode.awayTeamId = node.winnerId;
                    }
                }
            }
        }
    });
}
/**
 * Compiles and updates player stats (goals, assists, yellow/red cards) based on match events.
 */
export function updateTournamentPlayerStats(tournament, matches) {
    if (!tournament.playerStats) {
        tournament.playerStats = {};
    }
    matches.forEach((match) => {
        if (!match.events)
            return;
        match.events.forEach((event) => {
            const teamId = event.teamId;
            if (!teamId)
                return;
            const team = tournament.teams[teamId];
            if (!team)
                return;
            // Handle Goals
            if (event.type === 'GOAL') {
                const scorerId = event.playerId;
                if (scorerId) {
                    const player = team.players.find((p) => p.id === scorerId);
                    if (player) {
                        if (!tournament.playerStats[scorerId]) {
                            tournament.playerStats[scorerId] = {
                                playerId: scorerId,
                                playerName: player.name,
                                teamId: team.id,
                                teamName: team.name,
                                goals: 0,
                                assists: 0,
                                yellowCards: 0,
                                redCards: 0,
                            };
                        }
                        tournament.playerStats[scorerId].goals++;
                    }
                }
                const assisterId = event.targetPlayerId;
                if (assisterId) {
                    const player = team.players.find((p) => p.id === assisterId);
                    if (player) {
                        if (!tournament.playerStats[assisterId]) {
                            tournament.playerStats[assisterId] = {
                                playerId: assisterId,
                                playerName: player.name,
                                teamId: team.id,
                                teamName: team.name,
                                goals: 0,
                                assists: 0,
                                yellowCards: 0,
                                redCards: 0,
                            };
                        }
                        tournament.playerStats[assisterId].assists++;
                    }
                }
            }
            // Handle Yellow Cards
            if (event.type === 'YELLOW_CARD') {
                const cardedId = event.playerId;
                if (cardedId) {
                    const player = team.players.find((p) => p.id === cardedId);
                    if (player) {
                        if (!tournament.playerStats[cardedId]) {
                            tournament.playerStats[cardedId] = {
                                playerId: cardedId,
                                playerName: player.name,
                                teamId: team.id,
                                teamName: team.name,
                                goals: 0,
                                assists: 0,
                                yellowCards: 0,
                                redCards: 0,
                            };
                        }
                        tournament.playerStats[cardedId].yellowCards++;
                    }
                }
            }
            // Handle Red Cards
            if (event.type === 'RED_CARD') {
                const cardedId = event.playerId;
                if (cardedId) {
                    const player = team.players.find((p) => p.id === cardedId);
                    if (player) {
                        if (!tournament.playerStats[cardedId]) {
                            tournament.playerStats[cardedId] = {
                                playerId: cardedId,
                                playerName: player.name,
                                teamId: team.id,
                                teamName: team.name,
                                goals: 0,
                                assists: 0,
                                yellowCards: 0,
                                redCards: 0,
                            };
                        }
                        tournament.playerStats[cardedId].redCards++;
                    }
                }
            }
        });
    });
}
/**
 * Applies fatigue, recovery, morale updates, suspensions, and injuries to
 * tournament team rosters after a round of simulated matches.
 */
export function applyPostMatchRosterUpdates(tournament, matches) {
    matches.forEach((match) => {
        const homeTeam = tournament.teams[match.homeTeam.id];
        const awayTeam = tournament.teams[match.awayTeam.id];
        if (!homeTeam || !awayTeam)
            return;
        // Determine match result for morale
        const homeWon = match.homeScore > match.awayScore;
        const awayWon = match.awayScore > match.homeScore;
        const isDraw = match.homeScore === match.awayScore;
        // We need to know who played in the match for each team
        const homePlayedIds = new Set();
        const awayPlayedIds = new Set();
        // Final players on the pitch
        match.players.forEach((p) => {
            if (p.teamId === homeTeam.id)
                homePlayedIds.add(p.playerId);
            if (p.teamId === awayTeam.id)
                awayPlayedIds.add(p.playerId);
        });
        // Plus players who were substituted out
        match.events.forEach((ev) => {
            if (ev.type === 'SUBSTITUTION' && ev.playerId) {
                if (ev.teamId === homeTeam.id)
                    homePlayedIds.add(ev.playerId);
                if (ev.teamId === awayTeam.id)
                    awayPlayedIds.add(ev.playerId);
            }
        });
        // Keep track of cards and injuries in this match to apply suspensions/injuries
        const matchCards = {};
        const matchInjuries = new Set();
        match.events.forEach((ev) => {
            if (!ev.playerId)
                return;
            if (ev.type === 'YELLOW_CARD') {
                if (!matchCards[ev.playerId])
                    matchCards[ev.playerId] = { yellow: 0, red: false };
                matchCards[ev.playerId].yellow++;
            }
            else if (ev.type === 'RED_CARD') {
                if (!matchCards[ev.playerId])
                    matchCards[ev.playerId] = { yellow: 0, red: false };
                matchCards[ev.playerId].red = true;
            }
            else if (ev.type === 'INJURY') {
                matchInjuries.add(ev.playerId);
            }
        });
        // Helper to update team roster
        const updateTeamRoster = (team, opponentTeam, playedIds, won, lost, draw) => {
            const eloDiff = opponentTeam.eloRating - team.eloRating;
            team.players.forEach((player) => {
                // 1. Manage Suspensions and Injuries decrement
                // If they had suspended matches or injury duration, they didn't play in this match. Decrement it.
                const played = playedIds.has(player.id);
                const wasSuspended = player.suspendedMatches && player.suspendedMatches > 0;
                const wasInjured = player.injuryDuration && player.injuryDuration > 0;
                if (wasSuspended) {
                    player.suspendedMatches = (player.suspendedMatches || 0) - 1;
                }
                if (wasInjured) {
                    player.injuryDuration = (player.injuryDuration || 0) - 1;
                }
                // 2. Fatigue accumulation & recovery
                // Base recovery and quality-based bonuses
                const baseRecovery = played ? 10 : 25;
                const teamEloBonus = Math.max(0, (team.eloRating - 1400) / 100); // e.g. +5 for 1900 ELO (better resources/staff)
                const playerStaminaBonus = Math.max(0, (player.attributes.stamina - 50) / 10);
                const totalRecovery = Math.round(baseRecovery + teamEloBonus + playerStaminaBonus);
                let fitness = player.fitness ?? 100;
                if (played) {
                    // Accumulate fatigue during play (players with higher stamina fatigue less)
                    const fatigueAccumulated = Math.max(12, Math.round(30 - (player.attributes.stamina / 5)));
                    fitness = Math.max(30, fitness - fatigueAccumulated);
                }
                // Apply recovery
                player.fitness = Math.min(100, fitness + totalRecovery);
                // 3. Morale / mental state updates
                let morale = player.morale ?? 70;
                // Base result morale
                if (won) {
                    morale += 6;
                }
                else if (lost) {
                    morale -= 5;
                }
                else if (draw) {
                    // underdog gets morale boost, favorite gets decrease
                    if (eloDiff > 100)
                        morale += 3;
                    else if (eloDiff < -100)
                        morale -= 2;
                    else
                        morale += 1;
                }
                // Personal achievements/events in match
                if (played) {
                    // Check if scored goals or assists
                    const goalsScored = match.events.filter(e => e.type === 'GOAL' && e.playerId === player.id).length;
                    const assistsMade = match.events.filter(e => e.type === 'GOAL' && e.targetPlayerId === player.id).length;
                    morale += goalsScored * 5 + assistsMade * 3;
                    // Check if carded
                    const cards = matchCards[player.id];
                    if (cards) {
                        if (cards.red)
                            morale -= 8;
                        if (cards.yellow > 0)
                            morale -= cards.yellow * 2;
                    }
                }
                player.morale = Math.max(40, Math.min(100, morale));
                // 4. Apply cards & suspensions
                const cards = matchCards[player.id];
                if (cards) {
                    if (cards.red || cards.yellow >= 2) {
                        // Suspended for next match
                        player.suspendedMatches = (player.suspendedMatches || 0) + 1;
                    }
                    else if (cards.yellow === 1) {
                        // Get player's current tournament yellow cards (before this update)
                        const playerStats = tournament.playerStats?.[player.id];
                        const prevYellows = playerStats ? playerStats.yellowCards - 1 : 0;
                        // If they now reach an even number of cumulative yellows, suspend them
                        if ((prevYellows + 1) % 2 === 0) {
                            player.suspendedMatches = (player.suspendedMatches || 0) + 1;
                        }
                    }
                }
                // 5. Apply injuries
                if (played && matchInjuries.has(player.id)) {
                    // Injury lasts for 1 to 3 matches
                    player.injuryDuration = (player.injuryDuration || 0) + Math.floor(Math.random() * 3) + 1;
                }
            });
        };
        updateTeamRoster(homeTeam, awayTeam, homePlayedIds, homeWon, awayWon, isDraw);
        updateTeamRoster(awayTeam, homeTeam, awayPlayedIds, awayWon, homeWon, isDraw);
    });
}

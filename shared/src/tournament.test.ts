import { describe, it, expect } from 'vitest';
import { initializeTournament, generateRoundOf32, getBestThirdPlaceTeams, updateTournamentPlayerStats, applyPostMatchRosterUpdates } from './tournament.js';
import { GROUPSTAGE_GROUPS } from './data/groupstage_data.js';
import { Team, PlayerPosition } from './types.js';

function createMockTeam(id: string, elo = 1600): Team {
  return {
    id,
    name: `Team ${id}`,
    fifaRanking: 10,
    eloRating: elo,
    colorPrimary: '#ff0000',
    colorSecondary: '#0000ff',
    tactics: {
      formation: '4-3-3',
      style: 'Possession',
      pressingIntensity: 50,
      defensiveLine: 50,
      tempo: 50
    },
    players: [],
    form: [],
    xgAverage: 1.5,
    xgaAverage: 1.0
  };
}

describe('Tournament Rules & Matchups', () => {
  it('correctly initializes the tournament with 12 groups of 4 teams', () => {
    const mockTeams: Record<string, Team> = {};
    Object.values(GROUPSTAGE_GROUPS).flat().forEach(id => {
      mockTeams[id] = createMockTeam(id);
    });

    const state = initializeTournament(1, "World Cup 2026", mockTeams);

    expect(state.groups.length).toBe(12);
    state.groups.forEach(group => {
      expect(group.table).toBeDefined();
      expect(group.teams.length).toBe(4);
    });
  });

  it('correctly selects the 8 best third place teams and creates Round of 32 pairings according to FIFA 2026 rules', () => {
    const mockTeams: Record<string, Team> = {};
    Object.values(GROUPSTAGE_GROUPS).flat().forEach(id => {
      mockTeams[id] = createMockTeam(id);
    });

    const state = initializeTournament(1, "World Cup 2026", mockTeams);

    // Mock group stage standings
    state.groups.forEach(group => {
      // 1st place gets 9 points
      group.table[0].points = 9;
      group.table[0].goalDifference = 6;
      group.table[0].goalsFor = 8;
      
      // 2nd place gets 6 points
      group.table[1].points = 6;
      group.table[1].goalDifference = 2;
      group.table[1].goalsFor = 4;

      // 3rd place gets 3 points
      group.table[2].points = 3;
      group.table[2].goalDifference = -2;
      group.table[2].goalsFor = 2;

      // 4th place gets 0 points
      group.table[3].points = 0;
      group.table[3].goalDifference = -6;
      group.table[3].goalsFor = 0;
    });

    // Make 8 third-place teams have better records than the other 4
    // Set points for 3rd place in Groups A, B, C, D, E, F, G, H to 4 points
    const bestThirdGroups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    state.groups.forEach(group => {
      if (bestThirdGroups.includes(group.id)) {
        group.table[2].points = 4;
      } else {
        group.table[2].points = 1;
      }
    });

    const bestThirds = getBestThirdPlaceTeams(state.groups, state.teams);
    expect(bestThirds.length).toBe(8);
    
    // Verify that the 8 best third place teams are from the correct groups
    bestThirds.forEach(teamId => {
      const group = state.groups.find(g => g.teams.includes(teamId))!;
      expect(bestThirdGroups.includes(group.id)).toBe(true);
    });

    // Generate Round of 32 nodes
    const knockoutNodes = generateRoundOf32(state);
    
    // Verify that we have 16 Round of 32 matches (nodes 101 to 116)
    for (let i = 101; i <= 116; i++) {
      const node = knockoutNodes[i];
      expect(node).toBeDefined();
      expect(node.round).toBe('R32');
      expect(node.homeTeamId).not.toBeNull();
      expect(node.awayTeamId).not.toBeNull();
    }

    // Verify official bracket pairings
    // Node 101 (Match 73): Runner-up A vs Runner-up B
    const node101 = knockoutNodes[101];
    expect(node101.homeTeamId).toBe(state.groups.find(g => g.id === 'A')!.table[1].teamId);
    expect(node101.awayTeamId).toBe(state.groups.find(g => g.id === 'B')!.table[1].teamId);

    // Node 102 (Match 74): Winner E vs 3rd Group A/B/C/D/F
    const node102 = knockoutNodes[102];
    expect(node102.homeTeamId).toBe(state.groups.find(g => g.id === 'E')!.table[0].teamId);
    // 3rd place team must be one of the qualified third-place teams
    expect(bestThirds.includes(node102.awayTeamId!)).toBe(true);
    // 3rd place team should be from Group A, B, C, D, or F
    const opponentGroup102 = state.groups.find(g => g.teams.includes(node102.awayTeamId!))!;
    expect(['A', 'B', 'C', 'D', 'F'].includes(opponentGroup102.id)).toBe(true);

    // Node 103 (Match 75): Winner F vs Runner-up C
    const node103 = knockoutNodes[103];
    expect(node103.homeTeamId).toBe(state.groups.find(g => g.id === 'F')!.table[0].teamId);
    expect(node103.awayTeamId).toBe(state.groups.find(g => g.id === 'C')!.table[1].teamId);

    // Node 104 (Match 76): Winner C vs Runner-up F
    const node104 = knockoutNodes[104];
    expect(node104.homeTeamId).toBe(state.groups.find(g => g.id === 'C')!.table[0].teamId);
    expect(node104.awayTeamId).toBe(state.groups.find(g => g.id === 'F')!.table[1].teamId);

    // Node 106 (Match 78): Runner-up E vs Runner-up I
    const node106 = knockoutNodes[106];
    expect(node106.homeTeamId).toBe(state.groups.find(g => g.id === 'E')!.table[1].teamId);
    expect(node106.awayTeamId).toBe(state.groups.find(g => g.id === 'I')!.table[1].teamId);

    // Node 111 (Match 83): Runner-up K vs Runner-up L
    const node111 = knockoutNodes[111];
    expect(node111.homeTeamId).toBe(state.groups.find(g => g.id === 'K')!.table[1].teamId);
    expect(node111.awayTeamId).toBe(state.groups.find(g => g.id === 'L')!.table[1].teamId);

    // Node 112 (Match 84): Winner H vs Runner-up J
    const node112 = knockoutNodes[112];
    expect(node112.homeTeamId).toBe(state.groups.find(g => g.id === 'H')!.table[0].teamId);
    expect(node112.awayTeamId).toBe(state.groups.find(g => g.id === 'J')!.table[1].teamId);

    // Node 114 (Match 86): Winner J vs Runner-up H
    const node114 = knockoutNodes[114];
    expect(node114.homeTeamId).toBe(state.groups.find(g => g.id === 'J')!.table[0].teamId);
    expect(node114.awayTeamId).toBe(state.groups.find(g => g.id === 'H')!.table[1].teamId);

    // Node 116 (Match 88): Runner-up D vs Runner-up G
    const node116 = knockoutNodes[116];
    expect(node116.homeTeamId).toBe(state.groups.find(g => g.id === 'D')!.table[1].teamId);
    expect(node116.awayTeamId).toBe(state.groups.find(g => g.id === 'G')!.table[1].teamId);
  });

  it('correctly aggregates player tournament statistics from simulated matches', () => {
    const mockTeams: Record<string, Team> = {};
    Object.values(GROUPSTAGE_GROUPS).flat().forEach(id => {
      mockTeams[id] = createMockTeam(id);
      mockTeams[id].players = [
        { id: 1, name: 'Scorer Player', age: 25, position: 'FW', club: 'FC Mock', teamId: id, number: 9, staminaState: 100, yellowCards: 0, redCarded: false, injured: false, attributes: {} as any },
        { id: 2, name: 'Assister Player', age: 26, position: 'MF', club: 'FC Mock', teamId: id, number: 10, staminaState: 100, yellowCards: 0, redCarded: false, injured: false, attributes: {} as any },
        { id: 3, name: 'Carded Player', age: 27, position: 'DF', club: 'FC Mock', teamId: id, number: 4, staminaState: 100, yellowCards: 0, redCarded: false, injured: false, attributes: {} as any },
      ];
    });

    const state = initializeTournament(1, "World Cup 2026", mockTeams);
    expect(state.playerStats).toEqual({});

    // Create a mock simulated match with events
    const mockMatch: any = {
      matchId: 9001,
      homeTeam: mockTeams['FRA'],
      awayTeam: mockTeams['ENG'],
      homeScore: 1,
      awayScore: 0,
      events: [
        {
          type: 'GOAL',
          teamId: 'FRA',
          playerId: 1,
          targetPlayerId: 2,
        },
        {
          type: 'YELLOW_CARD',
          teamId: 'FRA',
          playerId: 3,
        },
        {
          type: 'RED_CARD',
          teamId: 'ENG',
          playerId: 3,
        }
      ]
    };

    updateTournamentPlayerStats(state, [mockMatch]);

    expect(state.playerStats![1]).toEqual({
      playerId: 1,
      playerName: 'Scorer Player',
      teamId: 'FRA',
      teamName: 'Team FRA',
      goals: 1,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
    });

    expect(state.playerStats![2]).toEqual({
      playerId: 2,
      playerName: 'Assister Player',
      teamId: 'FRA',
      teamName: 'Team FRA',
      goals: 0,
      assists: 1,
      yellowCards: 0,
      redCards: 0,
    });

    expect(state.playerStats![3]).toBeDefined();
    // Carded player 3 for FRA has a yellow card
    const fraCarded = state.playerStats![3];
    expect(fraCarded.yellowCards).toBe(1);
    expect(fraCarded.teamId).toBe('FRA');
  });

  it('correctly manages player fatigue, morale, suspensions, and injuries after a match', () => {
    const mockTeams: Record<string, Team> = {};
    const player1 = { id: 1, name: 'Player A', age: 25, position: 'FW' as PlayerPosition, club: 'FC Mock', teamId: 'FRA', number: 9, staminaState: 100, yellowCards: 0, redCarded: false, injured: false, attributes: { stamina: 70 } as any };
    const player2 = { id: 2, name: 'Player B', age: 26, position: 'MF' as PlayerPosition, club: 'FC Mock', teamId: 'FRA', number: 10, staminaState: 100, yellowCards: 0, redCarded: false, injured: false, attributes: { stamina: 80 } as any };
    const player3 = { id: 3, name: 'Player C', age: 27, position: 'DF' as PlayerPosition, club: 'FC Mock', teamId: 'FRA', number: 4, staminaState: 100, yellowCards: 0, redCarded: false, injured: false, attributes: { stamina: 90 } as any };

    const awayPlayer = { id: 4, name: 'Opponent Player', age: 25, position: 'FW' as PlayerPosition, club: 'FC Mock', teamId: 'ENG', number: 9, staminaState: 100, yellowCards: 0, redCarded: false, injured: false, attributes: { stamina: 75 } as any };

    mockTeams['FRA'] = createMockTeam('FRA', 1800);
    mockTeams['FRA'].players = [player1, player2, player3];

    mockTeams['ENG'] = createMockTeam('ENG', 1700);
    mockTeams['ENG'].players = [awayPlayer];

    const state = initializeTournament(1, "World Cup 2026", mockTeams);

    // Verify initial values initialized in initializeTournament
    const tPlayer1 = state.teams['FRA'].players.find(p => p.id === 1)!;
    expect(tPlayer1.fitness).toBe(100);
    expect(tPlayer1.morale).toBeGreaterThan(60);
    expect(tPlayer1.suspendedMatches).toBe(0);
    expect(tPlayer1.injuryDuration).toBe(0);

    // Create simulated match where Player 1 and Player 2 played, Player 3 stayed on bench
    // Player 1 got a goal and a yellow card. Player 2 got injured.
    const mockMatch: any = {
      matchId: 9500,
      homeTeam: state.teams['FRA'],
      awayTeam: state.teams['ENG'],
      homeScore: 1,
      awayScore: 0,
      // Players currently on pitch (at end or kickoff)
      players: [
        { playerId: 1, teamId: 'FRA', name: 'Player A', position: 'FW' },
        { playerId: 2, teamId: 'FRA', name: 'Player B', position: 'MF' },
        { playerId: 4, teamId: 'ENG', name: 'Opponent Player', position: 'FW' }
      ],
      events: [
        {
          type: 'GOAL',
          teamId: 'FRA',
          playerId: 1,
        },
        {
          type: 'YELLOW_CARD',
          teamId: 'FRA',
          playerId: 1,
        },
        {
          type: 'INJURY',
          teamId: 'FRA',
          playerId: 2,
        }
      ]
    };

    // First update the stats structure so yellow card tracking for suspensions works
    updateTournamentPlayerStats(state, [mockMatch]);
    
    // Now apply updates
    applyPostMatchRosterUpdates(state, [mockMatch]);

    const updatedP1 = state.teams['FRA'].players.find(p => p.id === 1)!;
    const updatedP2 = state.teams['FRA'].players.find(p => p.id === 2)!;
    const updatedP3 = state.teams['FRA'].players.find(p => p.id === 3)!;

    // Player 1 played, so fitness should decrease and recover (net change)
    // fatigueAccumulated = 30 - 14 = 16. netFitness = 100 - 16 + (10 + 4 + 2) = 100 - 16 + 16 = 100.
    expect(updatedP1.fitness).toBe(100);
    // Player 1 won and scored, so morale should increase
    expect(updatedP1.morale).toBeGreaterThan(70);

    // Player 2 got injured
    expect(updatedP2.injuryDuration).toBeGreaterThan(0);

    // Player 3 did not play, should recover or stay at 100 fitness
    expect(updatedP3.fitness).toBe(100);
  });
});

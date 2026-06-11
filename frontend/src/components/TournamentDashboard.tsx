import React, { useState, useEffect } from 'react';
import {
  TournamentState,
  Group,
  Team,
  initializeTournament,
  recalculateGroupTable,
  generateRoundOf32,
  propagateKnockoutWinners,
  updateTournamentPlayerStats,
  applyPostMatchRosterUpdates,
  initializeMatchState,
  simulateMatchInstant,
  MatchSimulationState,
  KnockoutMatchNode,
  GROUPSTAGE_SCHEDULE,
} from 'shared';
import { Trophy, Group as GroupIcon, GitFork, Activity } from 'lucide-react';
import { getCountryFlagUrl } from '../utils/flags';

interface TournamentDashboardProps {
  onBack: () => void;
}

export default function TournamentDashboard({ onBack }: TournamentDashboardProps) {
  const [tournament, setTournament] = useState<TournamentState | null>(null);
  const [activeTab, setActiveTab] = useState<'groups' | 'bracket' | 'stats'>('groups');
  const [isSimulating, setIsSimulating] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [sortKey, setSortKey] = useState<'goals' | 'assists' | 'yellowCards' | 'redCards' | 'playerName' | 'teamName'>('goals');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [statsSubTab, setStatsSubTab] = useState<'leaders' | 'rosters'>('leaders');
  const [selectedRosterTeamId, setSelectedRosterTeamId] = useState<string>('');

  const handleSort = (key: 'goals' | 'assists' | 'yellowCards' | 'redCards' | 'playerName' | 'teamName') => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection(key === 'playerName' || key === 'teamName' ? 'asc' : 'desc');
    }
  };

  useEffect(() => {
    async function createTournament() {
      try {
        const response = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'FIFA World Cup 2026' }),
        });
        if (response.ok) {
          const data = await response.json();
          setTournament(data);
        } else {
          throw new Error('API failed');
        }
      } catch (err) {
        console.warn('⚠️ Backend offline. Initializing browser-only tournament simulation...');
        setOfflineMode(true);
        // Fallback: load teams and initialize in-browser
        const { generateAllWorldCupTeams } = await import('shared');
        const teams = generateAllWorldCupTeams();
        const localTournament = initializeTournament(999, 'Offline World Cup 2026', teams);
        
        // Generate group stage matches from static schedule
        GROUPSTAGE_SCHEDULE.forEach((sched, idx) => {
          const group = localTournament.groups.find((g) => g.id === sched.group);
          if (group) {
            group.matches.push(sched.group.charCodeAt(0) * 1000 + idx);
          }
        });

        setTournament(localTournament);
      }
    }
    createTournament();
  }, []);

  const simulateRoundOffline = async (state: TournamentState): Promise<TournamentState> => {
    const nextState = JSON.parse(JSON.stringify(state)) as TournamentState;
    if (!nextState.completedMatches) {
      nextState.completedMatches = {};
    }

    if (nextState.currentRound === 'GROUP_STAGE') {
      // Group group stage matches by round
      const matchesByRound: Record<number, { matchId: number; group: string; home: string; away: string }[]> = {
        1: [],
        2: [],
        3: [],
      };

      GROUPSTAGE_SCHEDULE.forEach((sched, idx) => {
        matchesByRound[sched.round].push({
          matchId: sched.group.charCodeAt(0) * 1000 + idx,
          group: sched.group,
          home: sched.home,
          away: sched.away,
        });
      });

      const allSimulatedMatches: MatchSimulationState[] = [];

      for (const rNum of [1, 2, 3]) {
        const roundMatches = matchesByRound[rNum];
        const simulatedInRound: MatchSimulationState[] = [];

        roundMatches.forEach((mRef) => {
          const homeTeam = nextState.teams[mRef.home];
          const awayTeam = nextState.teams[mRef.away];

          if (homeTeam && awayTeam) {
            let mState = initializeMatchState(mRef.matchId, homeTeam, awayTeam, 'GROUP_STAGE');
            mState = simulateMatchInstant(mState);
            simulatedInRound.push(mState);
            allSimulatedMatches.push(mState);

            nextState.completedMatches![mState.matchId] = {
              homeScore: mState.homeScore,
              awayScore: mState.awayScore,
              homeTeamId: homeTeam.id,
              awayTeamId: awayTeam.id,
            };
          }
        });

        if (simulatedInRound.length > 0) {
          updateTournamentPlayerStats(nextState, simulatedInRound);
          applyPostMatchRosterUpdates(nextState, simulatedInRound);
        }
      }

      // Recalculate group tables
      nextState.groups.forEach((group) => {
        const groupMatches = allSimulatedMatches.filter((m) => {
          const homeInGroup = group.teams.includes(m.homeTeam.id);
          const awayInGroup = group.teams.includes(m.awayTeam.id);
          return homeInGroup && awayInGroup;
        });
        recalculateGroupTable(group, groupMatches);
      });

      // Generate R32 Brackets
      nextState.knockoutNodes = generateRoundOf32(nextState);
      nextState.currentRound = 'R32';
    } else {
      // Knockout rounds: R32, R16, QF, SF, FINAL
      const nodes = nextState.knockoutNodes;
      const currentRoundNodes = Object.entries(nodes).filter(([_, n]) => n.round === nextState.currentRound);
      const simulatedOfflineMatches: MatchSimulationState[] = [];

      currentRoundNodes.forEach(([nodeIdStr, node]) => {
        const homeId = node.homeTeamId;
        const awayId = node.awayTeamId;

        if (homeId && awayId) {
          const homeTeam = nextState.teams[homeId];
          const awayTeam = nextState.teams[awayId];

          let mState = initializeMatchState(parseInt(nodeIdStr), homeTeam, awayTeam, nextState.currentRound);
          mState = simulateMatchInstant(mState);

          // Force decider
          if (mState.homeScore === mState.awayScore) {
            if (Math.random() > 0.5) {
              mState.homeScore++;
            } else {
              mState.awayScore++;
            }
          }

          node.matchId = mState.matchId;
          node.winnerId = mState.homeScore > mState.awayScore ? homeId : awayId;
          nextState.completedMatches![mState.matchId] = {
            homeScore: mState.homeScore,
            awayScore: mState.awayScore,
            homeTeamId: homeId,
            awayTeamId: awayId,
          };
          simulatedOfflineMatches.push(mState);
        }
      });

      // Compile knockout round player stats & apply roster updates (fatigue, morale, cards, injuries)
      if (simulatedOfflineMatches.length > 0) {
        updateTournamentPlayerStats(nextState, simulatedOfflineMatches);
        applyPostMatchRosterUpdates(nextState, simulatedOfflineMatches);
      }

      if (nextState.currentRound === 'FINAL') {
        nextState.status = 'COMPLETED';
      } else {
        propagateKnockoutWinners(nextState);
        const nextRoundMap: Record<string, any> = {
          R32: 'R16', R16: 'QF', QF: 'SF', SF: 'FINAL'
        };
        nextState.currentRound = nextRoundMap[nextState.currentRound];
      }
    }

    return nextState;
  };

  const handleSimulateRound = async () => {
    if (!tournament) return;
    setIsSimulating(true);

    try {
      if (offlineMode) {
        // Run offline browser simulation
        // Instant response delay
        await new Promise((resolve) => setTimeout(resolve, 50));
        const next = await simulateRoundOffline(tournament);
        setTournament(next);
      } else {
        const response = await fetch(`/api/tournaments/${tournament.id}/simulate-round`, {
          method: 'POST',
        });
        if (response.ok) {
          const data = await response.json();
          setTournament(data);
        }
      }
    } catch (err) {
      console.error('Failed to simulate round:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  if (!tournament) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div style={{ border: '4px solid rgba(255,255,255,0.1)', borderTop: '4px solid #f59e0b', borderRadius: '50%', width: '50px', height: '50px', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '20px', color: '#94a3b8' }}>Drawing World Cup Bracket...</p>
      </div>
    );
  }

  // Get tournament winner
  let winnerTeam: Team | null = null;
  if (tournament.status === 'COMPLETED' && tournament.knockoutNodes[501]) {
    const winnerId = tournament.knockoutNodes[501].winnerId;
    if (winnerId) winnerTeam = tournament.teams[winnerId];
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Banner */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--glow-gold)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {offlineMode ? 'LOCAL WORKER ENGINE' : 'LIVE TOURNAMENT API'}
          </span>
          <h2 style={{ fontSize: '1.8rem', fontFamily: 'var(--font-display)' }}>🏆 {tournament.name}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
            Current Stage: <span style={{ color: 'white', fontWeight: '600' }}>{tournament.currentRound.replace('_', ' ')}</span>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-secondary" onClick={onBack} disabled={isSimulating}>
            Back to Select
          </button>
          
          {tournament.status !== 'COMPLETED' && (
            <button
              className="btn-primary"
              onClick={handleSimulateRound}
              disabled={isSimulating}
              style={{ background: 'linear-gradient(135deg, var(--glow-green), #047857)', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)', opacity: isSimulating ? 0.6 : 1 }}
            >
              {isSimulating ? '⌛ Simulating Ticks...' : `⚡ Simulate ${tournament.currentRound.replace('_', ' ')}`}
            </button>
          )}
        </div>
      </div>

      {/* Winner Banner */}
      {winnerTeam && (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', border: '2px solid var(--glow-gold)', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(0,0,0,0.4))', padding: '40px' }}>
          <Trophy size={48} color="var(--glow-gold)" style={{ filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.5))' }} />
          <img
            src={getCountryFlagUrl(winnerTeam.id)}
            alt={winnerTeam.name}
            style={{ width: '90px', height: '60px', objectFit: 'cover', borderRadius: '6px', border: '2px solid rgba(255,255,255,0.3)', boxShadow: '0 4px 15px rgba(0,0,0,0.5)', marginTop: '8px', marginBottom: '8px' }}
          />
          <h2 style={{ fontSize: '2rem', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{winnerTeam.name} Wins the World Cup!</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Congratulations to the world champions!</p>
        </div>
      )}

      {/* Tabs Selector */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          className={`btn-secondary ${activeTab === 'groups' ? 'active' : ''}`}
          onClick={() => { setActiveTab('groups'); }}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: activeTab === 'groups' ? '2px solid var(--glow-cyan)' : undefined, background: activeTab === 'groups' ? 'rgba(255,255,255,0.06)' : undefined }}
        >
          <GroupIcon size={16} /> Group Tables
        </button>
        <button
          className={`btn-secondary ${activeTab === 'bracket' ? 'active' : ''}`}
          onClick={() => { setActiveTab('bracket'); }}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: activeTab === 'bracket' ? '2px solid var(--glow-cyan)' : undefined, background: activeTab === 'bracket' ? 'rgba(255,255,255,0.06)' : undefined }}
        >
          <GitFork size={16} /> Knockout Brackets
        </button>
        <button
          className={`btn-secondary ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => { setActiveTab('stats'); }}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: activeTab === 'stats' ? '2px solid var(--glow-cyan)' : undefined, background: activeTab === 'stats' ? 'rgba(255,255,255,0.06)' : undefined }}
        >
          <Activity size={16} /> Player Stats
        </button>
      </div>

      {/* Main Tab Content */}
      {/* Main Tab Content */}
      {activeTab === 'groups' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px' }}>
          {tournament.groups.map((group) => (
            <div key={group.id} className="glass-panel" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '10px', color: 'var(--glow-cyan)' }}>Group {group.id}</h3>
              <table className="standings-table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th style={{ textAlign: 'center' }}>P</th>
                    <th style={{ textAlign: 'center' }}>GD</th>
                    <th style={{ textAlign: 'center' }}>PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {group.table.map((row) => (
                    <tr key={row.teamId}>
                      <td style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img
                          src={getCountryFlagUrl(row.teamId)}
                          alt={row.teamName}
                          style={{ width: '21px', height: '14px', borderRadius: '2px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }}
                        />
                        {row.teamName}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{row.played}</td>
                      <td style={{ textAlign: 'center', color: row.goalDifference > 0 ? '#10b981' : (row.goalDifference < 0 ? '#ef4444' : 'var(--text-secondary)') }}>
                        {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Group Matches & Scores */}
              {group.table[0].played > 0 && (
                <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
                  <h4 style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group Results</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
                    {group.matches.map((matchId) => {
                      const result = tournament.completedMatches?.[matchId];
                      if (!result) return null;
                      const homeName = tournament.teams[result.homeTeamId]?.name || result.homeTeamId;
                      const awayName = tournament.teams[result.awayTeamId]?.name || result.awayTeamId;
                      return (
                        <div key={matchId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px dashed rgba(255,255,255,0.04)' }}>
                          <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }} title={`${homeName} vs ${awayName}`}>
                            {homeName} vs {awayName}
                          </span>
                          <span style={{ color: 'var(--glow-cyan)', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                            {result.homeScore} - {result.awayScore}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'bracket' && (
        /* Knockout Bracket View */
        <div className="glass-panel" style={{ overflowX: 'auto', padding: '10px 0' }}>
          <div className="bracket-tree">
            
            {/* Round of 32 */}
            <div className="bracket-round">
              <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginBottom: '10px', textTransform: 'uppercase' }}>Round of 32</h4>
              {[102, 105, 101, 103, 111, 112, 109, 110, 104, 106, 107, 108, 114, 116, 113, 115].map((id) => {
                const node = tournament.knockoutNodes[id];
                return node ? renderBracketMatchNode(tournament, id, node) : null;
              })}
            </div>

            {/* Round of 16 */}
            <div className="bracket-round">
              <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginBottom: '10px', textTransform: 'uppercase' }}>Round of 16</h4>
              {[201, 202, 205, 206, 203, 204, 207, 208].map((id) => {
                const node = tournament.knockoutNodes[id];
                return node ? renderBracketMatchNode(tournament, id, node) : null;
              })}
            </div>

            {/* Quarter-Finals */}
            <div className="bracket-round">
              <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginBottom: '10px', textTransform: 'uppercase' }}>Quarter-Finals</h4>
              {[301, 302, 303, 304].map((id) => {
                const node = tournament.knockoutNodes[id];
                return node ? renderBracketMatchNode(tournament, id, node) : null;
              })}
            </div>

            {/* Semi-Finals */}
            <div className="bracket-round">
              <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginBottom: '10px', textTransform: 'uppercase' }}>Semi-Finals</h4>
              {[401, 402].map((id) => {
                const node = tournament.knockoutNodes[id];
                return node ? renderBracketMatchNode(tournament, id, node) : null;
              })}
            </div>

            {/* Final */}
            <div className="bracket-round" style={{ justifyContent: 'center' }}>
              <h4 style={{ color: 'var(--glow-gold)', fontSize: '0.8rem', textAlign: 'center', marginBottom: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}>Final</h4>
              {[501].map((id) => {
                const node = tournament.knockoutNodes[id];
                return node ? renderBracketMatchNode(tournament, id, node) : null;
              })}
            </div>

          </div>
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          {/* Sub-tabs Selector */}
          <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', marginBottom: '16px' }}>
            <button
              className="btn-secondary"
              onClick={() => setStatsSubTab('leaders')}
              style={{
                background: statsSubTab === 'leaders' ? 'rgba(255,255,255,0.08)' : 'transparent',
                borderColor: statsSubTab === 'leaders' ? 'var(--glow-cyan)' : 'transparent',
                color: statsSubTab === 'leaders' ? 'white' : 'var(--text-secondary)',
                padding: '6px 12px',
                fontSize: '0.85rem',
              }}
            >
              🏅 Tournament Leaders
            </button>
            <button
              className="btn-secondary"
              onClick={() => setStatsSubTab('rosters')}
              style={{
                background: statsSubTab === 'rosters' ? 'rgba(255,255,255,0.08)' : 'transparent',
                borderColor: statsSubTab === 'rosters' ? 'var(--glow-cyan)' : 'transparent',
                color: statsSubTab === 'rosters' ? 'white' : 'var(--text-secondary)',
                padding: '6px 12px',
                fontSize: '0.85rem',
              }}
            >
              📋 Team Squad Rosters & Fitness
            </button>
          </div>

          {statsSubTab === 'leaders' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--glow-cyan)', fontFamily: 'var(--font-display)' }}>Tournament Leaders</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Showing all players with goals, assists, or cards. Click headers to sort.
                </p>
              </div>
              {Object.keys(tournament.playerStats || {}).length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No player stats recorded yet. Simulate some matches to see statistics!
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="standings-table" style={{ fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ cursor: 'pointer' }}>
                        <th onClick={() => handleSort('playerName')}>
                          Player {sortKey === 'playerName' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th onClick={() => handleSort('teamName')}>
                          Team {sortKey === 'teamName' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th style={{ textAlign: 'center' }} onClick={() => handleSort('goals')}>
                          Goals ⚽ {sortKey === 'goals' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th style={{ textAlign: 'center' }} onClick={() => handleSort('assists')}>
                          Assists 🎯 {sortKey === 'assists' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th style={{ textAlign: 'center' }} onClick={() => handleSort('yellowCards')}>
                          Yellow Cards 🟨 {sortKey === 'yellowCards' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th style={{ textAlign: 'center' }} onClick={() => handleSort('redCards')}>
                          Red Cards 🟥 {sortKey === 'redCards' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...Object.values(tournament.playerStats || {})]
                        .sort((a, b) => {
                          let valA: any = a[sortKey];
                          let valB: any = b[sortKey];
                          if (typeof valA === 'string') {
                            valA = valA.toLowerCase();
                            valB = valB.toLowerCase();
                            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
                            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
                            return 0;
                          } else {
                            return sortDirection === 'asc' ? valA - valB : valB - valA;
                          }
                        })
                        .map((row) => (
                          <tr key={row.playerId}>
                            <td style={{ fontWeight: '600' }}>{row.playerName}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <img
                                  src={getCountryFlagUrl(row.teamId)}
                                  alt={row.teamName}
                                  style={{ width: '21px', height: '14px', borderRadius: '2px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }}
                                />
                                <span>{row.teamName}</span>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: row.goals > 0 ? 'var(--glow-gold)' : 'var(--text-secondary)' }}>
                              {row.goals}
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: row.assists > 0 ? 'var(--glow-cyan)' : 'var(--text-secondary)' }}>
                              {row.assists}
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: row.yellowCards > 0 ? '#fbbf24' : 'var(--text-secondary)' }}>
                              {row.yellowCards}
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: row.redCards > 0 ? '#ef4444' : 'var(--text-secondary)' }}>
                              {row.redCards}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Team Rosters view */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', color: 'var(--glow-cyan)', fontFamily: 'var(--font-display)' }}>Team Squad Rosters</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Select a team to inspect player fitness, morale, and suspensions.
                  </p>
                </div>
                <div>
                  <select
                    className="select-style"
                    value={selectedRosterTeamId || Object.keys(tournament.teams).sort((a,b) => tournament.teams[a].name.localeCompare(tournament.teams[b].name))[0] || ''}
                    onChange={(e) => setSelectedRosterTeamId(e.target.value)}
                    style={{
                      background: 'rgba(0,0,0,0.6)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '4px',
                      color: 'white',
                      padding: '8px 12px',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  >
                    {Object.values(tournament.teams)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name} (ELO: {team.eloRating})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {(() => {
                const teamId = selectedRosterTeamId || Object.keys(tournament.teams).sort((a,b) => tournament.teams[a].name.localeCompare(tournament.teams[b].name))[0];
                const team = tournament.teams[teamId];
                if (!team) return <div style={{ color: 'var(--text-muted)' }}>No team selected.</div>;

                return (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="standings-table" style={{ fontSize: '0.85rem' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                          <th>Player</th>
                          <th>Pos</th>
                          <th>Club</th>
                          <th style={{ width: '150px' }}>Fitness</th>
                          <th style={{ width: '120px' }}>Morale</th>
                          <th style={{ width: '120px' }}>Status</th>
                          <th style={{ textAlign: 'center' }}>Goals</th>
                          <th style={{ textAlign: 'center' }}>Assists</th>
                          <th style={{ textAlign: 'center' }}>Cards</th>
                        </tr>
                      </thead>
                      <tbody>
                        {team.players
                          .sort((a, b) => {
                            const posOrder = { GK: 1, DF: 2, MF: 3, FW: 4 };
                            if (posOrder[a.position] !== posOrder[b.position]) {
                              return posOrder[a.position] - posOrder[b.position];
                            }
                            return a.number - b.number;
                          })
                          .map((player) => {
                            const stats = tournament.playerStats?.[player.id];
                            const fitness = player.fitness ?? 100;
                            const morale = player.morale ?? 70;

                            // Fitness progress bar color
                            let fitnessColor = '#10b981'; // green
                            if (fitness < 60) fitnessColor = '#ef4444'; // red
                            else if (fitness < 85) fitnessColor = '#fbbf24'; // yellow

                            // Morale label
                            let moraleText = 'Okay 😐';
                            let moraleColor = 'var(--text-secondary)';
                            if (morale >= 85) {
                              moraleText = 'Excellent 😁';
                              moraleColor = 'var(--glow-green)';
                            } else if (morale >= 70) {
                              moraleText = 'Good 🙂';
                              moraleColor = 'var(--glow-cyan)';
                            } else if (morale < 55) {
                              moraleText = 'Poor 😟';
                              moraleColor = '#ef4444';
                            }

                            // Status label
                            let statusText = 'Healthy ✅';
                            let statusColor = '#10b981';
                            if (player.suspendedMatches && player.suspendedMatches > 0) {
                              statusText = `Suspended 🟨 (${player.suspendedMatches}m)`;
                              statusColor = '#ef4444';
                            } else if (player.injuryDuration && player.injuryDuration > 0) {
                              statusText = `Injured 🚑 (${player.injuryDuration}m)`;
                              statusColor = '#f59e0b';
                            }

                            return (
                              <tr key={player.id}>
                                <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                  {player.number}
                                </td>
                                <td style={{ fontWeight: '600' }}>{player.name}</td>
                                <td>
                                  <span style={{
                                    padding: '2px 6px',
                                    borderRadius: '3px',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    backgroundColor: player.position === 'GK' ? '#3b82f6' : player.position === 'DF' ? '#10b981' : player.position === 'MF' ? '#f59e0b' : '#ef4444',
                                    color: 'white',
                                  }}>
                                    {player.position}
                                  </span>
                                </td>
                                <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{player.club}</td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ flexGrow: 1, height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                      <div style={{ width: `${fitness}%`, height: '100%', backgroundColor: fitnessColor, borderRadius: '3px' }}></div>
                                    </div>
                                    <span style={{ fontWeight: 'bold', width: '32px', textAlign: 'right', color: fitnessColor }}>
                                      {fitness}%
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <span style={{ color: moraleColor, fontWeight: '500' }}>
                                    {moraleText}
                                  </span>
                                </td>
                                <td>
                                  <span style={{ color: statusColor, fontWeight: 'bold' }}>
                                    {statusText}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 'bold', color: stats && stats.goals > 0 ? 'var(--glow-gold)' : 'var(--text-secondary)' }}>
                                  {stats?.goals || 0}
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 'bold', color: stats && stats.assists > 0 ? 'var(--glow-cyan)' : 'var(--text-secondary)' }}>
                                  {stats?.assists || 0}
                                </td>
                                <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                                  {stats ? (
                                    <>
                                      {stats.yellowCards > 0 && Array(stats.yellowCards).fill('🟨').join('')}
                                      {stats.redCards > 0 && '🟥'}
                                      {stats.yellowCards === 0 && stats.redCards === 0 && '-'}
                                    </>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function renderBracketMatchNode(t: TournamentState, id: number, node: KnockoutMatchNode) {
  const home = node.homeTeamId ? t.teams[node.homeTeamId] : null;
  const away = node.awayTeamId ? t.teams[node.awayTeamId] : null;

  const homeWinner = node.winnerId && node.winnerId === node.homeTeamId;
  const awayWinner = node.winnerId && node.winnerId === node.awayTeamId;

  const matchResult = node.matchId ? t.completedMatches?.[node.matchId] : null;

  return (
    <div key={id} className="bracket-match-node">
      <div className={`bracket-node-team ${homeWinner ? 'winner' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {home && (
          <img
            src={getCountryFlagUrl(home.id)}
            alt={home.name}
            style={{ width: '18px', height: '12px', borderRadius: '1.5px', objectFit: 'cover' }}
          />
        )}
        <span style={{ fontWeight: homeWinner ? 'bold' : 'normal' }}>{home ? home.name : 'TBD'}</span>
        {matchResult && (
          <span style={{ fontSize: '0.9rem', fontWeight: 'bold', fontFamily: 'monospace', color: homeWinner ? 'var(--glow-cyan)' : 'var(--text-secondary)', marginLeft: 'auto' }}>
            {matchResult.homeScore}
          </span>
        )}
      </div>
      <div className={`bracket-node-team ${awayWinner ? 'winner' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {away && (
          <img
            src={getCountryFlagUrl(away.id)}
            alt={away.name}
            style={{ width: '18px', height: '12px', borderRadius: '1.5px', objectFit: 'cover' }}
          />
        )}
        <span style={{ fontWeight: awayWinner ? 'bold' : 'normal' }}>{away ? away.name : 'TBD'}</span>
        {matchResult && (
          <span style={{ fontSize: '0.9rem', fontWeight: 'bold', fontFamily: 'monospace', color: awayWinner ? 'var(--glow-cyan)' : 'var(--text-secondary)', marginLeft: 'auto' }}>
            {matchResult.awayScore}
          </span>
        )}
      </div>
    </div>
  );
}

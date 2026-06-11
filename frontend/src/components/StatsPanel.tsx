import React, { useState, useEffect } from 'react';
import { MatchSimulationState, Player } from 'shared';
import { Goal, Activity, ClipboardList, Flame } from 'lucide-react';
import { getCountryFlagUrl } from '../utils/flags.ts';

interface StatsPanelProps {
  state: MatchSimulationState | null;
}

export default function StatsPanel({ state }: StatsPanelProps) {
  const [activeTab, setActiveTab] = useState<'analytics' | 'boxscore' | 'timeline' | 'stamina'>('analytics');

  useEffect(() => {
    if (state?.status === 'COMPLETED') {
      setActiveTab('boxscore');
    }
  }, [state?.status]);

  if (!state) return null;

  const { stats, homeTeam, awayTeam, events, players } = state;

  const renderStatBar = (label: string, homeVal: number, awayVal: number, isFloat = false) => {
    const total = homeVal + awayVal;
    const homePercent = total === 0 ? 50 : (homeVal / total) * 100;
    const homeText = isFloat ? homeVal.toFixed(2) : String(homeVal);
    const awayText = isFloat ? awayVal.toFixed(2) : String(awayVal);

    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
          <span>{homeText}</span>
          <span style={{ fontWeight: '500', color: 'var(--text-primary)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>{label}</span>
          <span>{awayText}</span>
        </div>
        <div style={{ height: '6px', width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${homePercent}%`, background: `linear-gradient(to right, ${homeTeam.colorPrimary}, #06b6d4)`, height: '100%' }}></div>
          <div style={{ width: `${100 - homePercent}%`, background: `linear-gradient(to left, ${awayTeam.colorPrimary}, #f59e0b)`, height: '100%' }}></div>
        </div>
      </div>
    );
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'GOAL':
        return <Goal size={16} color="#10b981" />;
      case 'YELLOW_CARD':
        return <div style={{ width: '10px', height: '14px', backgroundColor: '#eab308', borderRadius: '1px', boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }} title="Yellow Card" />;
      case 'RED_CARD':
        return <div style={{ width: '10px', height: '14px', backgroundColor: '#ef4444', borderRadius: '1px', boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }} title="Red Card" />;
      case 'OFFSIDE':
      case 'FOUL':
        return <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#f87171' }}>⚠️</div>;
      case 'INJURY':
        return <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ef4444' }}>🚑</div>;
      case 'SUBSTITUTION':
        return <Activity size={16} color="#06b6d4" />;
      default:
        return <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#94a3b8' }}>ℹ️</div>;
    }
  };

  const getRosterStats = (team: any, activeOnPitch: any[]) => {
    const roster = team.players.map((p: any) => {
      const active = activeOnPitch.find((ap) => ap.playerId === p.id);
      
      const isSubbedOut = events.some(
        (e) => e.type === 'SUBSTITUTION' && e.playerId === p.id
      );

      const isSubbedIn = events.some(
        (e) => e.type === 'SUBSTITUTION' && e.targetPlayerId === p.id
      );

      const isInjured = p.injured || events.some(
        (e) => e.type === 'INJURY' && e.playerId === p.id
      );

      const isRedCarded = p.redCarded || events.some(
        (e) => e.type === 'RED_CARD' && e.playerId === p.id
      );

      let stamina = p.staminaState ?? 100;
      let yellowCards = p.yellowCards ?? 0;
      let statusLabel = 'Bench';

      if (active) {
        stamina = active.staminaState;
        yellowCards = active.yellowCards || 0;
        statusLabel = active.role;
      } else if (isRedCarded) {
        stamina = 0;
        statusLabel = 'Red Card';
      } else if (isInjured) {
        stamina = 5;
        statusLabel = 'Injured';
      } else if (isSubbedOut) {
        stamina = p.staminaState ?? 15;
        statusLabel = 'Subbed Out';
      } else if (isSubbedIn) {
        statusLabel = 'Subbed In';
      }

      return {
        id: p.id,
        name: p.name,
        number: p.number,
        position: p.position,
        stamina,
        fitness: p.attributes?.stamina ?? 80,
        yellowCards,
        isRedCarded,
        isInjured,
        isSubbedOut,
        statusLabel,
      };
    });

    return roster.sort((a: any, b: any) => {
      const isAActive = activeOnPitch.some(ap => ap.playerId === a.id);
      const isBActive = activeOnPitch.some(ap => ap.playerId === b.id);
      if (isAActive !== isBActive) return isAActive ? -1 : 1;

      const posOrder: Record<string, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };
      return posOrder[a.position] - posOrder[b.position];
    });
  };

  const homeRoster = getRosterStats(homeTeam, players.filter((p) => p.teamId === homeTeam.id));
  const awayRoster = getRosterStats(awayTeam, players.filter((p) => p.teamId === awayTeam.id));

  // Extract Box Score stats
  const goalEvents = events.filter(e => e.type === 'GOAL');
  const homeGoals = goalEvents.filter(e => e.teamId === homeTeam.id);
  const awayGoals = goalEvents.filter(e => e.teamId === awayTeam.id);

  const cardEvents = events.filter(e => e.type === 'YELLOW_CARD' || e.type === 'RED_CARD');
  const homeCards = cardEvents.filter(e => e.teamId === homeTeam.id);
  const awayCards = cardEvents.filter(e => e.teamId === awayTeam.id);

  const subEvents = events.filter(e => e.type === 'SUBSTITUTION');
  const homeSubs = subEvents.filter(e => e.teamId === homeTeam.id);
  const awaySubs = subEvents.filter(e => e.teamId === awayTeam.id);

  const homeFreeKicks = events.filter(e => e.type === 'FOUL' && e.teamId === awayTeam.id).length;
  const awayFreeKicks = events.filter(e => e.type === 'FOUL' && e.teamId === homeTeam.id).length;

  const getPlayerName = (team: any, playerId?: number) => {
    if (!playerId) return '';
    const player = team.players.find((p: any) => p.id === playerId);
    return player ? player.name : 'Unknown Player';
  };

  const tabBtnStyle = (tab: 'analytics' | 'boxscore' | 'timeline' | 'stamina') => ({
    padding: '12px 20px',
    backgroundColor: activeTab === tab ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
    border: 'none',
    borderBottom: activeTab === tab ? '3px solid #06b6d4' : '3px solid transparent',
    color: activeTab === tab ? '#06b6d4' : '#9ca3af',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '0.85rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    transition: 'all 0.2s ease',
    outline: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderRadius: '6px 6px 0 0',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', marginTop: '8px' }}>
      {/* Tab Navigation */}
      <div className="glass-panel" style={{ padding: '0px 12px', display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button style={tabBtnStyle('analytics')} onClick={() => setActiveTab('analytics')}>
          <ClipboardList size={16} /> Analytics
        </button>
        <button style={tabBtnStyle('boxscore')} onClick={() => setActiveTab('boxscore')}>
          <Goal size={16} /> Box Score {state.status === 'COMPLETED' ? '🏆' : '⏱️'}
        </button>
        <button style={tabBtnStyle('timeline')} onClick={() => setActiveTab('timeline')}>
          <Activity size={16} /> Timeline
        </button>
        <button style={tabBtnStyle('stamina')} onClick={() => setActiveTab('stamina')}>
          <Flame size={16} /> Stamina & Fitness
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'analytics' && (
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ fontSize: '1.1rem', fontFamily: 'var(--font-display)', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>Match Analytics</h3>
          {renderStatBar('Possession (%)', stats.possessionHome, stats.possessionAway)}
          {renderStatBar('Expected Goals (xG)', stats.xgHome, stats.xgAway, true)}
          {renderStatBar('Shots', stats.shotsHome, stats.shotsAway)}
          {renderStatBar('Shots On Target', stats.shotsOnTargetHome, stats.shotsOnTargetAway)}
          {renderStatBar('Passes', stats.passesHome, stats.passesAway)}
          {renderStatBar('Passes Completed', stats.passesCompletedHome, stats.passesCompletedAway)}
          {renderStatBar('Tackles', stats.tacklesHome, stats.tacklesAway)}
          {renderStatBar('Saves', stats.savesHome, stats.savesAway)}
          {renderStatBar('Corners', stats.cornersHome, stats.cornersAway)}
          {renderStatBar('Fouls', stats.foulsHome, stats.foulsAway)}
          {renderStatBar('Yellow Cards', stats.yellowCardsHome, stats.yellowCardsAway)}
          {renderStatBar('Red Cards', stats.redCardsHome, stats.redCardsAway)}
        </div>
      )}

      {activeTab === 'boxscore' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Home Team Column */}
            <div className="glass-panel" style={{ padding: '24px', borderTop: `4px solid ${homeTeam.colorPrimary || '#06b6d4'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <img
                  src={getCountryFlagUrl(homeTeam.id)}
                  alt={homeTeam.name}
                  style={{ width: '36px', height: '24px', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)' }}
                />
                <h4 style={{ fontSize: '1.25rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>{homeTeam.name}</h4>
              </div>

              {/* Goals */}
              <div style={{ marginBottom: '24px' }}>
                <h5 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px', marginBottom: '12px' }}>Goals</h5>
                {homeGoals.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No goals scored.</div>
                ) : (
                  homeGoals.map((g) => (
                    <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', marginBottom: '8px' }}>
                      <span style={{ fontWeight: '600' }}>⚽ {getPlayerName(homeTeam, g.playerId)} ({g.minute}')</span>
                      {g.targetPlayerId && (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          (assist by {getPlayerName(homeTeam, g.targetPlayerId)})
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Bookings */}
              <div style={{ marginBottom: '24px' }}>
                <h5 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px', marginBottom: '12px' }}>Bookings</h5>
                {homeCards.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No cards issued.</div>
                ) : (
                  homeCards.map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: '8px' }}>
                      {c.type === 'YELLOW_CARD' ? (
                        <div style={{ width: '8px', height: '12px', backgroundColor: '#eab308', borderRadius: '1px', boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }} title="Yellow Card" />
                      ) : (
                        <div style={{ width: '8px', height: '12px', backgroundColor: '#ef4444', borderRadius: '1px', boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }} title="Red Card" />
                      )}
                      <span>{getPlayerName(homeTeam, c.playerId)} ({c.minute}')</span>
                    </div>
                  ))
                )}
              </div>

              {/* Substitutions */}
              <div>
                <h5 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px', marginBottom: '12px' }}>Substitutions</h5>
                {homeSubs.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No substitutions made.</div>
                ) : (
                  homeSubs.map((s) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.9rem' }}>🔄</span>
                      <span>
                        <span style={{ color: '#10b981', fontWeight: '500' }}>{getPlayerName(homeTeam, s.targetPlayerId)}</span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>for</span>
                        <span style={{ color: '#ef4444', fontWeight: '500' }}>{getPlayerName(homeTeam, s.playerId)}</span>
                        <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>({s.minute}')</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Away Team Column */}
            <div className="glass-panel" style={{ padding: '24px', borderTop: `4px solid ${awayTeam.colorPrimary || '#f59e0b'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <img
                  src={getCountryFlagUrl(awayTeam.id)}
                  alt={awayTeam.name}
                  style={{ width: '36px', height: '24px', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)' }}
                />
                <h4 style={{ fontSize: '1.25rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>{awayTeam.name}</h4>
              </div>

              {/* Goals */}
              <div style={{ marginBottom: '24px' }}>
                <h5 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px', marginBottom: '12px' }}>Goals</h5>
                {awayGoals.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No goals scored.</div>
                ) : (
                  awayGoals.map((g) => (
                    <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', marginBottom: '8px' }}>
                      <span style={{ fontWeight: '600' }}>⚽ {getPlayerName(awayTeam, g.playerId)} ({g.minute}')</span>
                      {g.targetPlayerId && (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          (assist by {getPlayerName(awayTeam, g.targetPlayerId)})
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Bookings */}
              <div style={{ marginBottom: '24px' }}>
                <h5 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px', marginBottom: '12px' }}>Bookings</h5>
                {awayCards.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No cards issued.</div>
                ) : (
                  awayCards.map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: '8px' }}>
                      {c.type === 'YELLOW_CARD' ? (
                        <div style={{ width: '8px', height: '12px', backgroundColor: '#eab308', borderRadius: '1px', boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }} title="Yellow Card" />
                      ) : (
                        <div style={{ width: '8px', height: '12px', backgroundColor: '#ef4444', borderRadius: '1px', boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }} title="Red Card" />
                      )}
                      <span>{getPlayerName(awayTeam, c.playerId)} ({c.minute}')</span>
                    </div>
                  ))
                )}
              </div>

              {/* Substitutions */}
              <div>
                <h5 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px', marginBottom: '12px' }}>Substitutions</h5>
                {awaySubs.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No substitutions made.</div>
                ) : (
                  awaySubs.map((s) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.9rem' }}>🔄</span>
                      <span>
                        <span style={{ color: '#10b981', fontWeight: '500' }}>{getPlayerName(awayTeam, s.targetPlayerId)}</span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>for</span>
                        <span style={{ color: '#ef4444', fontWeight: '500' }}>{getPlayerName(awayTeam, s.playerId)}</span>
                        <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>({s.minute}')</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Set Pieces Summary Row */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', fontFamily: 'var(--font-display)', marginBottom: '16px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>Set Pieces & Fouls</h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', textAlign: 'center', marginTop: '10px' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em', marginBottom: '6px' }}>Corners</div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>
                  <span style={{ color: '#06b6d4' }}>{stats.cornersHome}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '1.25rem', margin: '0 10px' }}>-</span>
                  <span style={{ color: '#f59e0b' }}>{stats.cornersAway}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em', marginBottom: '6px' }}>Free Kicks</div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>
                  <span style={{ color: '#06b6d4' }}>{homeFreeKicks}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '1.25rem', margin: '0 10px' }}>-</span>
                  <span style={{ color: '#f59e0b' }}>{awayFreeKicks}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em', marginBottom: '6px' }}>Fouls Conceded</div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>
                  <span style={{ color: '#06b6d4' }}>{stats.foulsHome}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '1.25rem', margin: '0 10px' }}>-</span>
                  <span style={{ color: '#f59e0b' }}>{stats.foulsAway}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ fontSize: '1.1rem', fontFamily: 'var(--font-display)', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>Timeline</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', maxHeight: '500px', paddingRight: '4px' }}>
            {events.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px', fontSize: '0.85rem' }}>No key events recorded yet.</div>
            ) : (
              events.map((ev) => (
                <div key={ev.id} style={{ display: 'flex', gap: '12px', background: 'rgba(255,255,255,0.01)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                    {getEventIcon(ev.type)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: '600' }}>
                      <span style={{ color: ev.teamId === homeTeam.id ? '#06b6d4' : '#f59e0b' }}>
                        {ev.teamId ? (ev.teamId === homeTeam.id ? homeTeam.name : awayTeam.name) : 'Match'}
                      </span>
                      <span style={{ color: 'var(--glow-gold)' }}>{ev.minute}'</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{ev.details || ev.type.replace('_', ' ')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'stamina' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Home team list */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#06b6d4', marginBottom: '12px', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px' }}>{homeTeam.name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '500px' }}>
              {homeRoster.map((p: any) => {
                const staminaColor = p.stamina > 70 ? 'var(--glow-green)' : (p.stamina > 45 ? 'var(--glow-gold)' : 'var(--glow-red)');
                return (
                  <div key={p.id} style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '2px', opacity: p.isRedCarded || p.isSubbedOut ? 0.5 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: '16px', display: 'inline-block' }}>#{p.number}</span>
                        <span style={{ fontWeight: '500' }}>{p.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', backgroundColor: 'rgba(255,255,255,0.03)', padding: '1px 4px', borderRadius: '3px' }}>{p.statusLabel}</span>
                        {p.yellowCards === 1 && (
                          <div style={{ width: '6px', height: '9px', backgroundColor: '#eab308', borderRadius: '1px' }} title="Yellow Carded" />
                        )}
                        {p.isRedCarded && (
                          <div style={{ width: '6px', height: '9px', backgroundColor: '#ef4444', borderRadius: '1px' }} title="Sent Off (Red Card)" />
                        )}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                        Stam: <span style={{ color: staminaColor, fontWeight: '600' }}>{Math.round(p.stamina)}%</span> <span style={{ color: 'var(--text-muted)' }}>|</span> Fit: <span style={{ color: '#a7f3d0', fontWeight: '600' }}>{p.fitness}</span>
                      </span>
                    </div>
                    <div style={{ height: '3px', width: '100%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '1.5px', overflow: 'hidden', marginTop: '2px' }}>
                      <div style={{ width: `${p.stamina}%`, backgroundColor: staminaColor, height: '100%' }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Away team list */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#f59e0b', marginBottom: '12px', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px' }}>{awayTeam.name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '500px' }}>
              {awayRoster.map((p: any) => {
                const staminaColor = p.stamina > 70 ? 'var(--glow-green)' : (p.stamina > 45 ? 'var(--glow-gold)' : 'var(--glow-red)');
                return (
                  <div key={p.id} style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '2px', opacity: p.isRedCarded || p.isSubbedOut ? 0.5 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: '16px', display: 'inline-block' }}>#{p.number}</span>
                        <span style={{ fontWeight: '500' }}>{p.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', backgroundColor: 'rgba(255,255,255,0.03)', padding: '1px 4px', borderRadius: '3px' }}>{p.statusLabel}</span>
                        {p.yellowCards === 1 && (
                          <div style={{ width: '6px', height: '9px', backgroundColor: '#eab308', borderRadius: '1px' }} title="Yellow Carded" />
                        )}
                        {p.isRedCarded && (
                          <div style={{ width: '6px', height: '9px', backgroundColor: '#ef4444', borderRadius: '1px' }} title="Sent Off (Red Card)" />
                        )}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                        Stam: <span style={{ color: staminaColor, fontWeight: '600' }}>{Math.round(p.stamina)}%</span> <span style={{ color: 'var(--text-muted)' }}>|</span> Fit: <span style={{ color: '#a7f3d0', fontWeight: '600' }}>{p.fitness}</span>
                      </span>
                    </div>
                    <div style={{ height: '3px', width: '100%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '1.5px', overflow: 'hidden', marginTop: '2px' }}>
                      <div style={{ width: `${p.stamina}%`, backgroundColor: staminaColor, height: '100%' }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

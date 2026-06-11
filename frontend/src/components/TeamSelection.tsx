import React, { useEffect, useState, useRef } from 'react';
import { Team, FormationType, TacticalStyle } from 'shared';
import { generateAllWorldCupTeams } from 'shared';
import { Shield, Settings2, Users, Flame, Search, ChevronDown } from 'lucide-react';
import { getCountryFlagUrl } from '../utils/flags.ts';

interface TeamSelectionProps {
  onStartMatch: (homeTeam: Team, awayTeam: Team) => void;
  onStartTournament: () => void;
}

export default function TeamSelection({ onStartMatch, onStartTournament }: TeamSelectionProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [homeTeam, setHomeTeam] = useState<Team | null>(null);
  const [awayTeam, setAwayTeam] = useState<Team | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [homeSearch, setHomeSearch] = useState('');
  const [awaySearch, setAwaySearch] = useState('');
  const [isHomeOpen, setIsHomeOpen] = useState(false);
  const [isAwayOpen, setIsAwayOpen] = useState(false);

  const homeRef = useRef<HTMLDivElement>(null);
  const awayRef = useRef<HTMLDivElement>(null);

  const getPlayerOvr = (p: any) => {
    const attrs = p.attributes;
    if (p.position === 'GK') {
      return Math.round(attrs.gkReflexes * 0.4 + attrs.gkPositioning * 0.3 + attrs.gkHandling * 0.2 + attrs.gkOneOnOnes * 0.1);
    }
    const core = [
      attrs.pace, attrs.acceleration, attrs.stamina, attrs.strength, attrs.agility,
      attrs.passing, attrs.dribbling, attrs.firstTouch, attrs.composure, attrs.positioning, attrs.decisions
    ];
    if (p.position === 'FW') {
      core.push(attrs.finishing);
      core.push(attrs.finishing);
    }
    return Math.round(core.reduce((a: number, b: number) => a + b, 0) / core.length);
  };

  const getPosLabel = (pos: string) => {
    const labels: Record<string, string> = { GK: 'MV', DF: 'B', MF: 'MF', FW: 'A' };
    return labels[pos] || pos;
  };

  useEffect(() => {
    async function loadTeams() {
      try {
        const response = await fetch('/api/teams');
        if (response.ok) {
          const data = await response.json();
          setTeams(data);
          if (data.length >= 2) {
            setHomeTeam(data[0]);
            setAwayTeam(data[1]);
          }
        } else {
          throw new Error('API failed');
        }
      } catch (err) {
        console.warn('⚠️ Backend not running or database down. Generating teams in-browser fallback...');
        const localTeamsMap = generateAllWorldCupTeams();
        const localTeams = Object.values(localTeamsMap).sort((a, b) => a.name.localeCompare(b.name));
        setTeams(localTeams);
        if (localTeams.length >= 2) {
          setHomeTeam(localTeams.find(t => t.id === 'ARG') || localTeams[0]);
          setAwayTeam(localTeams.find(t => t.id === 'FRA') || localTeams[1]);
        }
      } finally {
        setIsLoading(false);
      }
    }
    loadTeams();
  }, []);

  // Synchronize inputs when teams are selected (via grid or initial load)
  useEffect(() => {
    if (homeTeam) {
      setHomeSearch(homeTeam.name);
    } else {
      setHomeSearch('');
    }
  }, [homeTeam]);

  useEffect(() => {
    if (awayTeam) {
      setAwaySearch(awayTeam.name);
    } else {
      setAwaySearch('');
    }
  }, [awayTeam]);

  // Click outside listener to close dropdowns and reset input texts to selected team
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (homeRef.current && !homeRef.current.contains(event.target as Node)) {
        setIsHomeOpen(false);
        setHomeSearch(homeTeam ? homeTeam.name : '');
      }
      if (awayRef.current && !awayRef.current.contains(event.target as Node)) {
        setIsAwayOpen(false);
        setAwaySearch(awayTeam ? awayTeam.name : '');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [homeTeam, awayTeam]);

  const filteredHomeTeams = teams.filter(t => {
    if (homeTeam && homeSearch === homeTeam.name) return true;
    return t.name.toLowerCase().includes(homeSearch.toLowerCase());
  });
  const filteredAwayTeams = teams.filter(t => {
    if (awayTeam && awaySearch === awayTeam.name) return true;
    return t.name.toLowerCase().includes(awaySearch.toLowerCase());
  });

  const handleSelectTeam = (team: Team) => {
    if (!homeTeam) {
      setHomeTeam(team);
    } else if (homeTeam.id === team.id) {
      setHomeTeam(null);
    } else if (!awayTeam) {
      setAwayTeam(team);
    } else if (awayTeam.id === team.id) {
      setAwayTeam(null);
    } else {
      // Toggle home
      setHomeTeam(team);
    }
  };

  const handleUpdateTactics = (isHome: boolean, field: string, value: any) => {
    const target = isHome ? homeTeam : awayTeam;
    if (!target) return;

    const updated = {
      ...target,
      tactics: {
        ...target.tactics,
        [field]: value,
      },
    };

    if (isHome) {
      setHomeTeam(updated);
    } else {
      setAwayTeam(updated);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div style={{ border: '4px solid rgba(255,255,255,0.1)', borderTop: '4px solid #06b6d4', borderRadius: '50%', width: '50px', height: '50px', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '20px', color: '#94a3b8' }}>Loading National Rosters...</p>
        <style>{`
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      
      {/* Header Panel */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontFamily: 'var(--font-display)', background: 'linear-gradient(to right, #06b6d4, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            FIFA World Cup 2026 Simulator
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>Select two teams for a friendly match, or simulate the full 48-team World Cup Tournament.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-primary" onClick={onStartTournament} style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)' }}>
            🏆 Simulate 2026 World Cup
          </button>
        </div>
      </div>

      <div className="team-selection-grid">
        
        {/* Matchup Dashboard (Primary Focus) */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '24px', minHeight: '520px', justifyContent: 'space-between', padding: '24px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '0 0 10px 0' }}>
            ⚽ Setup Matchup
          </h3>

          <div className="matchup-setup-grid">
            
            {/* Home Side Card */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              padding: '24px',
              borderRadius: '16px',
              background: 'rgba(255,255,255,0.02)',
              border: homeTeam ? `1px solid ${homeTeam.colorPrimary}33` : '1px solid rgba(255,255,255,0.05)',
              boxShadow: homeTeam ? `0 8px 32px -4px ${homeTeam.colorPrimary}1a` : 'none',
              transition: 'all 0.3s ease',
              position: 'relative'
            }}>
              {/* Flag Badge */}
              <div style={{
                width: '120px',
                height: '80px',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
                border: '2px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.2)'
              }}>
                {homeTeam ? (
                  <img src={getCountryFlagUrl(homeTeam.id)} alt={homeTeam.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Shield size={40} style={{ color: 'rgba(255,255,255,0.1)' }} />
                )}
              </div>

              {/* Title & Info */}
              <div style={{ textAlign: 'center' }}>
                <h4 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'white', margin: 0 }}>
                  {homeTeam ? homeTeam.name : 'Select Home Team'}
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
                  {homeTeam ? `FIFA Rank #${homeTeam.fifaRanking} | Elo ${homeTeam.eloRating}` : 'Choose a country'}
                </p>
              </div>

              {/* Home Selector Input */}
              <div ref={homeRef} style={{ position: 'relative', width: '100%' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={14} style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Search home country..."
                    value={homeSearch}
                    onChange={(e) => {
                      setHomeSearch(e.target.value);
                      setIsHomeOpen(true);
                    }}
                    onFocus={() => setIsHomeOpen(true)}
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.04)',
                      border: isHomeOpen ? '1px solid #06b6d4' : '1px solid rgba(255,255,255,0.08)',
                      boxShadow: isHomeOpen ? '0 0 0 2px rgba(6, 182, 212, 0.15)' : 'none',
                      color: 'white',
                      padding: '10px 32px 10px 32px',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                  />
                  <ChevronDown
                    size={14}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      color: 'var(--text-secondary)',
                      pointerEvents: 'none',
                      transform: isHomeOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  />
                </div>
                {isHomeOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    maxHeight: '180px',
                    overflowY: 'auto',
                    backgroundColor: 'rgba(21, 27, 43, 0.98)',
                    backdropFilter: 'var(--glass-blur)',
                    border: 'var(--panel-border)',
                    borderRadius: '8px',
                    zIndex: 100,
                    marginTop: '6px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  }}>
                    {filteredHomeTeams.map((team) => {
                      const isSelected = homeTeam?.id === team.id;
                      const isAwayOption = awayTeam?.id === team.id;
                      return (
                        <div
                          key={team.id}
                          onClick={() => {
                            if (isAwayOption) {
                              setAwayTeam(homeTeam);
                            }
                            setHomeTeam(team);
                            setHomeSearch(team.name);
                            setIsHomeOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            transition: 'background 0.2s',
                            borderBottom: '1px solid rgba(255,255,255,0.02)',
                            backgroundColor: isSelected ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <img src={getCountryFlagUrl(team.id)} alt={team.name} style={{ width: '21px', height: '14px', borderRadius: '2px', objectFit: 'cover' }} />
                            <span style={{ fontWeight: isSelected ? '600' : '500', color: isSelected ? '#06b6d4' : 'white' }}>{team.name}</span>
                          </div>
                          {isAwayOption && (
                            <span style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 'bold', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                              AWAY
                            </span>
                          )}
                          {isSelected && (
                            <span style={{ fontSize: '0.65rem', color: '#06b6d4', fontWeight: 'bold', backgroundColor: 'rgba(6, 182, 212, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                              SELECTED
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {filteredHomeTeams.length === 0 && (
                      <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>No countries found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* VS Divider */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              fontSize: '0.95rem',
              fontWeight: '800',
              color: 'var(--text-secondary)',
              letterSpacing: '0.5px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}>
              VS
            </div>

            {/* Away Side Card */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              padding: '24px',
              borderRadius: '16px',
              background: 'rgba(255,255,255,0.02)',
              border: awayTeam ? `1px solid ${awayTeam.colorSecondary}33` : '1px solid rgba(255,255,255,0.05)',
              boxShadow: awayTeam ? `0 8px 32px -4px ${awayTeam.colorSecondary}1a` : 'none',
              transition: 'all 0.3s ease',
              position: 'relative'
            }}>
              {/* Flag Badge */}
              <div style={{
                width: '120px',
                height: '80px',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
                border: '2px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.2)'
              }}>
                {awayTeam ? (
                  <img src={getCountryFlagUrl(awayTeam.id)} alt={awayTeam.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Shield size={40} style={{ color: 'rgba(255,255,255,0.1)' }} />
                )}
              </div>

              {/* Title & Info */}
              <div style={{ textAlign: 'center' }}>
                <h4 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'white', margin: 0 }}>
                  {awayTeam ? awayTeam.name : 'Select Away Team'}
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
                  {awayTeam ? `FIFA Rank #${awayTeam.fifaRanking} | Elo ${awayTeam.eloRating}` : 'Choose a country'}
                </p>
              </div>

              {/* Away Selector Input */}
              <div ref={awayRef} style={{ position: 'relative', width: '100%' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={14} style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Search away country..."
                    value={awaySearch}
                    onChange={(e) => {
                      setAwaySearch(e.target.value);
                      setIsAwayOpen(true);
                    }}
                    onFocus={() => setIsAwayOpen(true)}
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.04)',
                      border: isAwayOpen ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.08)',
                      boxShadow: isAwayOpen ? '0 0 0 2px rgba(245, 158, 11, 0.15)' : 'none',
                      color: 'white',
                      padding: '10px 32px 10px 32px',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                  />
                  <ChevronDown
                    size={14}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      color: 'var(--text-secondary)',
                      pointerEvents: 'none',
                      transform: isAwayOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  />
                </div>
                {isAwayOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    maxHeight: '180px',
                    overflowY: 'auto',
                    backgroundColor: 'rgba(21, 27, 43, 0.98)',
                    backdropFilter: 'var(--glass-blur)',
                    border: 'var(--panel-border)',
                    borderRadius: '8px',
                    zIndex: 100,
                    marginTop: '6px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  }}>
                    {filteredAwayTeams.map((team) => {
                      const isSelected = awayTeam?.id === team.id;
                      const isHomeOption = homeTeam?.id === team.id;
                      return (
                        <div
                          key={team.id}
                          onClick={() => {
                            if (isHomeOption) {
                              setHomeTeam(awayTeam);
                            }
                            setAwayTeam(team);
                            setAwaySearch(team.name);
                            setIsAwayOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            transition: 'background 0.2s',
                            borderBottom: '1px solid rgba(255,255,255,0.02)',
                            backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <img src={getCountryFlagUrl(team.id)} alt={team.name} style={{ width: '21px', height: '14px', borderRadius: '2px', objectFit: 'cover' }} />
                            <span style={{ fontWeight: isSelected ? '600' : '500', color: isSelected ? '#f59e0b' : 'white' }}>{team.name}</span>
                          </div>
                          {isHomeOption && (
                            <span style={{ fontSize: '0.65rem', color: '#06b6d4', fontWeight: 'bold', backgroundColor: 'rgba(6, 182, 212, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                              HOME
                            </span>
                          )}
                          {isSelected && (
                            <span style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 'bold', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                              SELECTED
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {filteredAwayTeams.length === 0 && (
                      <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>No countries found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>

          <button
            className="btn-primary"
            disabled={!homeTeam || !awayTeam}
            onClick={() => homeTeam && awayTeam && onStartMatch(homeTeam, awayTeam)}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '1.05rem',
              fontWeight: 'bold',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #06b6d4, #10b981)',
              boxShadow: '0 6px 20px rgba(6, 182, 212, 0.25)',
              opacity: (!homeTeam || !awayTeam) ? 0.5 : 1,
              cursor: (!homeTeam || !awayTeam) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '10px'
            }}
          >
            ⚽ Kick Off Match
          </button>
        </div>

        {/* Teams Grid Selection (Secondary Sidebar) */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '520px', overflowY: 'auto' }}>
          <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}><Shield size={18} color="#06b6d4" /> Qualified Teams</h3>
          <div className="teams-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))', gap: '10px' }}>
            {teams.map((team) => {
              const isHome = homeTeam?.id === team.id;
              const isAway = awayTeam?.id === team.id;
              return (
                <div
                  key={team.id}
                  className={`team-select-card ${isHome || isAway ? 'selected' : ''}`}
                  onClick={() => handleSelectTeam(team)}
                  style={{
                    padding: '12px 6px',
                    borderColor: isHome ? '#06b6d4' : (isAway ? '#f59e0b' : 'rgba(255,255,255,0.05)'),
                    boxShadow: isHome ? '0 0 8px rgba(6, 182, 212, 0.15)' : (isAway ? '0 0 8px rgba(245, 158, 11, 0.15)' : 'none')
                  }}
                >
                  <img
                    src={getCountryFlagUrl(team.id)}
                    alt={team.name}
                    style={{ width: '40px', height: '26px', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', marginBottom: '6px' }}
                  />
                  <span style={{ fontSize: '0.75rem', fontWeight: '500', textAlign: 'center', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%' }}>{team.name}</span>
                  {isHome && <span style={{ fontSize: '0.65rem', color: '#06b6d4', fontWeight: 'bold', marginTop: '2px' }}>HOME</span>}
                  {isAway && <span style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 'bold', marginTop: '2px' }}>AWAY</span>}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Tactics Customization Editor */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        
        {/* Home Team Tactics */}
        {homeTeam && (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderLeft: `4px solid ${homeTeam.colorPrimary}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.3rem', fontFamily: 'var(--font-display)' }}>🏠 {homeTeam.name} Tactics</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Fifa Rank #{homeTeam.fifaRanking} | Elo {homeTeam.eloRating}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              
              {/* Formation and style selectors */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Formation
                  <select
                    value={homeTeam.tactics.formation}
                    onChange={(e) => handleUpdateTactics(true, 'formation', e.target.value as FormationType)}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '8px', borderRadius: '6px', marginTop: '6px', fontSize: '0.9rem' }}
                  >
                    <option value="4-3-3">4-3-3</option>
                    <option value="4-2-3-1">4-2-3-1</option>
                    <option value="3-5-2">3-5-2</option>
                    <option value="4-4-2">4-4-2</option>
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Play Style
                  <select
                    value={homeTeam.tactics.style}
                    onChange={(e) => handleUpdateTactics(true, 'style', e.target.value as TacticalStyle)}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '8px', borderRadius: '6px', marginTop: '6px', fontSize: '0.9rem' }}
                  >
                    <option value="Possession">Possession</option>
                    <option value="Gegenpress">Gegenpress</option>
                    <option value="Low Block">Low Block</option>
                    <option value="Counter Attack">Counter Attack</option>
                    <option value="Direct Play">Direct Play</option>
                  </select>
                </label>
              </div>

              {/* Slider settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Pressing Intensity: {homeTeam.tactics.pressingIntensity}
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={homeTeam.tactics.pressingIntensity}
                    onChange={(e) => handleUpdateTactics(true, 'pressingIntensity', parseInt(e.target.value))}
                    style={{ marginTop: '6px' }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Defensive Line: {homeTeam.tactics.defensiveLine}
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={homeTeam.tactics.defensiveLine}
                    onChange={(e) => handleUpdateTactics(true, 'defensiveLine', parseInt(e.target.value))}
                    style={{ marginTop: '6px' }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Tempo: {homeTeam.tactics.tempo}
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={homeTeam.tactics.tempo}
                    onChange={(e) => handleUpdateTactics(true, 'tempo', parseInt(e.target.value))}
                    style={{ marginTop: '6px' }}
                  />
                </label>
              </div>
            </div>
            
            {/* Squad List */}
            <div style={{ marginTop: '10px' }}>
              <h4 style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Users size={16} /> Full Squad (26 Players)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingRight: '4px' }}>
                {[...homeTeam.players]
                  .sort((a, b) => {
                    const posOrder: Record<string, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };
                    if (posOrder[a.position] !== posOrder[b.position]) {
                      return posOrder[a.position] - posOrder[b.position];
                    }
                    return getPlayerOvr(b) - getPlayerOvr(a);
                  })
                  .map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: '4px', fontSize: '0.8rem', borderLeft: `3px solid ${p.position === 'GK' ? '#f59e0b' : (p.position === 'DF' ? '#3b82f6' : (p.position === 'MF' ? '#10b981' : '#ef4444'))}` }}>
                      <span>#{p.number} {p.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{getPosLabel(p.position)} ({getPlayerOvr(p)})</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Away Team Tactics */}
        {awayTeam && (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderLeft: `4px solid ${awayTeam.colorSecondary}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.3rem', fontFamily: 'var(--font-display)' }}>✈️ {awayTeam.name} Tactics</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Fifa Rank #{awayTeam.fifaRanking} | Elo {awayTeam.eloRating}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              
              {/* Formation and style selectors */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Formation
                  <select
                    value={awayTeam.tactics.formation}
                    onChange={(e) => handleUpdateTactics(false, 'formation', e.target.value as FormationType)}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '8px', borderRadius: '6px', marginTop: '6px', fontSize: '0.9rem' }}
                  >
                    <option value="4-3-3">4-3-3</option>
                    <option value="4-2-3-1">4-2-3-1</option>
                    <option value="3-5-2">3-5-2</option>
                    <option value="4-4-2">4-4-2</option>
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Play Style
                  <select
                    value={awayTeam.tactics.style}
                    onChange={(e) => handleUpdateTactics(false, 'style', e.target.value as TacticalStyle)}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '8px', borderRadius: '6px', marginTop: '6px', fontSize: '0.9rem' }}
                  >
                    <option value="Possession">Possession</option>
                    <option value="Gegenpress">Gegenpress</option>
                    <option value="Low Block">Low Block</option>
                    <option value="Counter Attack">Counter Attack</option>
                    <option value="Direct Play">Direct Play</option>
                  </select>
                </label>
              </div>

              {/* Slider settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Pressing Intensity: {awayTeam.tactics.pressingIntensity}
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={awayTeam.tactics.pressingIntensity}
                    onChange={(e) => handleUpdateTactics(false, 'pressingIntensity', parseInt(e.target.value))}
                    style={{ marginTop: '6px' }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Defensive Line: {awayTeam.tactics.defensiveLine}
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={awayTeam.tactics.defensiveLine}
                    onChange={(e) => handleUpdateTactics(false, 'defensiveLine', parseInt(e.target.value))}
                    style={{ marginTop: '6px' }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Tempo: {awayTeam.tactics.tempo}
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={awayTeam.tactics.tempo}
                    onChange={(e) => handleUpdateTactics(false, 'tempo', parseInt(e.target.value))}
                    style={{ marginTop: '6px' }}
                  />
                </label>
              </div>
            </div>

            {/* Squad List */}
            <div style={{ marginTop: '10px' }}>
              <h4 style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Users size={16} /> Full Squad (26 Players)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingRight: '4px' }}>
                {[...awayTeam.players]
                  .sort((a, b) => {
                    const posOrder: Record<string, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };
                    if (posOrder[a.position] !== posOrder[b.position]) {
                      return posOrder[a.position] - posOrder[b.position];
                    }
                    return getPlayerOvr(b) - getPlayerOvr(a);
                  })
                  .map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: '4px', fontSize: '0.8rem', borderLeft: `3px solid ${p.position === 'GK' ? '#f59e0b' : (p.position === 'DF' ? '#3b82f6' : (p.position === 'MF' ? '#10b981' : '#ef4444'))}` }}>
                      <span>#{p.number} {p.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{getPosLabel(p.position)} ({getPlayerOvr(p)})</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { Team, MatchSimulationState, simulateTick, initializeMatchState } from 'shared';
import TeamSelection from './components/TeamSelection.tsx';
import PitchRenderer from './components/PitchRenderer.tsx';
import StatsPanel from './components/StatsPanel.tsx';
import TournamentDashboard from './components/TournamentDashboard.tsx';
import { Play, Pause, FastForward, SkipForward, ArrowLeft, Zap } from 'lucide-react';
import { getCountryFlagUrl } from './utils/flags.ts';

type ViewMode = 'SELECTION' | 'MATCH' | 'TOURNAMENT';

export default function App() {
  const [view, setView] = useState<ViewMode>('SELECTION');
  const [activeMatchState, setActiveMatchState] = useState<MatchSimulationState | null>(null);
  const [simSpeed, setSimSpeed] = useState<number>(5); // 0 (pause), 1 (1x), 5 (5x), 10 (10x)
  
  const [offlineSimulation, setOfflineSimulation] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const offlineTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Client-side tracking for assist detection
  const lastTouchIdRef = useRef<number | null>(null);
  const secondLastTouchIdRef = useRef<number | null>(null);
  const lastMatchIdRef = useRef<number | null>(null);

  const setEnrichedMatchState = (state: MatchSimulationState | null) => {
    if (!state) {
      setActiveMatchState(null);
      lastTouchIdRef.current = null;
      secondLastTouchIdRef.current = null;
      lastMatchIdRef.current = null;
      return;
    }

    // Reset touch history if match ID changes
    if (lastMatchIdRef.current !== state.matchId) {
      lastMatchIdRef.current = state.matchId;
      lastTouchIdRef.current = null;
      secondLastTouchIdRef.current = null;
    }

    // Track the second-to-last player who touched the ball
    if (state.ball) {
      const currentTouchId = state.ball.lastTouchId;
      if (currentTouchId !== null && currentTouchId !== lastTouchIdRef.current) {
        secondLastTouchIdRef.current = lastTouchIdRef.current;
        lastTouchIdRef.current = currentTouchId;
      }
    }

    // Enrich GOAL events with the assister if not present
    if (state.events && state.events.length > 0) {
      const activeState = state;
      const enrichedEvents = state.events.map((ev) => {
        if (ev.type === 'GOAL' && !ev.targetPlayerId) {
          const scorer = activeState.players.find((p) => p.playerId === ev.playerId);
          const assister = activeState.players.find(
            (p) => p.playerId === secondLastTouchIdRef.current
          );
          if (scorer && assister && scorer.teamId === assister.teamId && scorer.playerId !== assister.playerId) {
            const currentDetails = ev.details || '';
            return {
              ...ev,
              targetPlayerId: assister.playerId,
              details: currentDetails.includes('assist')
                ? currentDetails
                : `${currentDetails.replace('!', '')}, assist by ${assister.name}.`,
            };
          }
        }
        return ev;
      });
      state = {
        ...state,
        events: enrichedEvents,
      };
    }

    setActiveMatchState(state);
  };

  // Clean up timers/sockets on unmount
  useEffect(() => {
    return () => {
      cleanupSimulation();
    };
  }, []);

  const cleanupSimulation = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    if (offlineTimerRef.current) {
      clearInterval(offlineTimerRef.current);
      offlineTimerRef.current = null;
    }
    setOfflineSimulation(false);
  };

  const handleStartMatch = async (homeTeam: Team, awayTeam: Team) => {
    cleanupSimulation();
    setView('MATCH');

    try {
      // 1. Try to start simulation on the backend API
      const response = await fetch('/api/matches/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeTeamId: homeTeam.id, awayTeamId: awayTeam.id }),
      });

      if (!response.ok) throw new Error('API kickoff failed');
      const data = await response.json();
      const matchId = data.matchId;

      // 2. Establish WebSocket connection
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/match/${matchId}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'SUBSCRIBE' }));
        console.log(`Connected to live simulation websocket for match: ${matchId}`);
      };

      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === 'INIT' || payload.type === 'TICK' || payload.type === 'COMPLETED') {
          setEnrichedMatchState(payload.state);
        }
      };

      ws.onerror = (err) => {
        console.warn('Websocket error. Switching to local engine...');
        startLocalSimulation(homeTeam, awayTeam);
      };

      ws.onclose = () => {
        console.log('Simulation socket closed.');
      };

    } catch (err) {
      console.warn('⚠️ Backend offline. Starting client-side simulation engine...');
      startLocalSimulation(homeTeam, awayTeam);
    }
  };

  // Run the simulation entirely in the browser using the shared engine
  const startLocalSimulation = (homeTeam: Team, awayTeam: Team) => {
    cleanupSimulation();
    setOfflineSimulation(true);

    const initialState = initializeMatchState(999, homeTeam, awayTeam);
    setEnrichedMatchState(initialState);
    
    // Default speed is 5x
    startOfflineTimer(initialState, 5);
  };

  const startOfflineTimer = (currentState: MatchSimulationState, speed: number) => {
    if (offlineTimerRef.current) clearInterval(offlineTimerRef.current);
    if (speed === 0) return;

    // Tick rate: 10 ticks per second of game time.
    // Run timer at 50Hz (20ms interval) for speed >= 5 to bypass browser timer throttling,
    // batching multiple ticks per interval instead.
    let intervalMs = Math.round(100 / speed);
    let ticksPerInterval = 1;

    if (speed >= 5) {
      intervalMs = 20;
      ticksPerInterval = Math.round(speed / 5);
    }

    let stateTracker = { ...currentState };

    offlineTimerRef.current = setInterval(() => {
      let tempState = stateTracker;
      for (let step = 0; step < ticksPerInterval; step++) {
        if (tempState.status === 'COMPLETED') {
          clearInterval(offlineTimerRef.current!);
          offlineTimerRef.current = null;
          break;
        }
        tempState = simulateTick(tempState);
      }
      stateTracker = tempState;
      setEnrichedMatchState(stateTracker);
    }, intervalMs);
  };

  const handleSetSpeed = (speed: number) => {
    setSimSpeed(speed);

    if (offlineSimulation && activeMatchState) {
      startOfflineTimer(activeMatchState, speed);
    } else if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'SET_SPEED',
        speed,
      }));
    }
  };

  const handleSkipMatch = () => {
    if (offlineSimulation) {
      if (offlineTimerRef.current) {
        clearInterval(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }
      setSimSpeed(1);
      if (activeMatchState) {
        let stateTracker = { ...activeMatchState };
        while (stateTracker.status !== 'COMPLETED') {
          stateTracker = simulateTick(stateTracker);
        }
        setEnrichedMatchState(stateTracker);
      }
    } else if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'SKIP',
      }));
    }
  };

  const handleBackToSelection = () => {
    cleanupSimulation();
    setEnrichedMatchState(null);
    setView('SELECTION');
  };

  // Convert elapsed match time to scoreboard string MM:SS
  const getMatchTime = () => {
    if (!activeMatchState) return '00:00';
    const elapsed = Math.floor(activeMatchState.elapsedSeconds);
    const min = Math.floor(elapsed / 60);
    const sec = elapsed % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '30px 20px 60px 20px' }}>
      
      {view === 'SELECTION' && (
        <TeamSelection
          onStartMatch={handleStartMatch}
          onStartTournament={() => setView('TOURNAMENT')}
        />
      )}

      {view === 'TOURNAMENT' && (
        <TournamentDashboard onBack={() => setView('SELECTION')} />
      )}

      {view === 'MATCH' && activeMatchState && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Match Scoreboard / Header */}
          <div className="glass-panel" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <button className="btn-secondary" onClick={handleBackToSelection} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}>
                <ArrowLeft size={16} /> Quit Match
              </button>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: '6px 12px', borderRadius: '20px' }}>
                {offlineSimulation ? (
                  <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 'bold' }}>⚡ LOCAL CLIENT SIMULATION</span>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: '#06b6d4', fontWeight: 'bold' }}>📡 WEB SOCKET HOST LINKED</span>
                )}
              </div>
            </div>

            {activeMatchState.venue && (
              <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', marginBottom: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.9rem' }}>📍</span>
                <span style={{ fontWeight: '500', letterSpacing: '0.03em' }}>
                  {activeMatchState.venue.name}, {activeMatchState.venue.city} ({activeMatchState.venue.country})
                </span>
              </div>
            )}

            {/* Core Scoreboard */}
            <div className="scoreboard-container">
              <div className="scoreboard-team home">
                <span style={{ fontSize: '1.45rem', fontWeight: '800', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' }}>
                  {activeMatchState.homeTeam.name}
                </span>
                <img
                  src={getCountryFlagUrl(activeMatchState.homeTeam.id)}
                  alt={activeMatchState.homeTeam.name}
                  style={{ width: '50px', height: '33px', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.25)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                />
              </div>

              <div className="scoreboard-score-box">
                {activeMatchState.homeScore} - {activeMatchState.awayScore}
              </div>

              <div className="scoreboard-team away">
                <img
                  src={getCountryFlagUrl(activeMatchState.awayTeam.id)}
                  alt={activeMatchState.awayTeam.name}
                  style={{ width: '50px', height: '33px', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.25)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                />
                <span style={{ fontSize: '1.45rem', fontWeight: '800', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' }}>
                  {activeMatchState.awayTeam.name}
                </span>
              </div>

              <div className="scoreboard-timer">
                <span className="scoreboard-clock">{getMatchTime()}</span>
                <span className="scoreboard-period">
                  {activeMatchState.status === 'COMPLETED' ? 'Full Time' : (activeMatchState.elapsedSeconds < 2700 ? '1st Half' : '2nd Half')}
                </span>
              </div>
            </div>

            {/* Speed Controller Panel */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className={`btn-secondary ${simSpeed === 0 ? 'active' : ''}`}
                onClick={() => handleSetSpeed(0)}
                style={{ padding: '8px 12px', background: simSpeed === 0 ? 'rgba(6, 182, 212, 0.15)' : undefined }}
                title="Pause Match"
              >
                <Pause size={14} />
              </button>
              
              <button
                className={`btn-secondary ${simSpeed === 1 ? 'active' : ''}`}
                onClick={() => handleSetSpeed(1)}
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', background: simSpeed === 1 ? 'rgba(6, 182, 212, 0.15)' : undefined }}
                title="Realtime Speed"
              >
                <Play size={14} /> 1x
              </button>

              <button
                className={`btn-secondary ${simSpeed === 5 ? 'active' : ''}`}
                onClick={() => handleSetSpeed(5)}
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', background: simSpeed === 5 ? 'rgba(6, 182, 212, 0.15)' : undefined }}
                title="Accelerated Speed"
              >
                <FastForward size={14} /> 5x
              </button>

              <button
                className={`btn-secondary ${simSpeed === 10 ? 'active' : ''}`}
                onClick={() => handleSetSpeed(10)}
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', background: simSpeed === 10 ? 'rgba(6, 182, 212, 0.15)' : undefined }}
                title="10x Speed"
              >
                <SkipForward size={14} /> 10x
              </button>

              <button
                className={`btn-secondary ${simSpeed === 15 ? 'active' : ''}`}
                onClick={() => handleSetSpeed(15)}
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', background: simSpeed === 15 ? 'rgba(6, 182, 212, 0.15)' : undefined }}
                title="15x Speed"
              >
                <SkipForward size={14} /> 15x
              </button>

              <button
                className={`btn-secondary ${simSpeed === 20 ? 'active' : ''}`}
                onClick={() => handleSetSpeed(20)}
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', background: simSpeed === 20 ? 'rgba(6, 182, 212, 0.15)' : undefined }}
                title="20x Speed"
              >
                <SkipForward size={14} /> 20x
              </button>

              <button
                className={`btn-secondary ${simSpeed === 50 ? 'active' : ''}`}
                onClick={() => handleSetSpeed(50)}
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', background: simSpeed === 50 ? 'rgba(6, 182, 212, 0.15)' : undefined }}
                title="50x Speed"
              >
                <SkipForward size={14} /> 50x
              </button>

              <button
                className="btn-secondary"
                onClick={handleSkipMatch}
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                title="Skip to Result"
              >
                <Zap size={14} color="#f87171" /> Skip
              </button>
            </div>

          </div>

          {/* Pixi Canvas Field */}
          <PitchRenderer state={activeMatchState} />

          {/* Commentary Feed Overlay */}
          <div className="glass-panel" style={{ padding: '16px' }}>
            <div className="commentary-ticker">
              {activeMatchState.commentary.slice(-4).reverse().map((c) => (
                <div
                  key={c.id}
                  className={`commentary-line ${c.type.toLowerCase().replace('_', '-')}`}
                >
                  <span style={{ color: 'var(--glow-gold)', fontWeight: 'bold', marginRight: '8px' }}>[{c.minute}'{c.second.toString().padStart(2, '0')}]</span>
                  {c.text}
                </div>
              ))}
            </div>
          </div>

          {/* Stats Analytics Dashboard */}
          <StatsPanel state={activeMatchState} />

        </div>
      )}

    </div>
  );
}

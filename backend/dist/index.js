import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { initializeMatchState, simulateTick, simulateMatchInstant, initializeTournament, recalculateGroupTable, generateRoundOf32, propagateKnockoutWinners, updateTournamentPlayerStats, applyPostMatchRosterUpdates, GROUPSTAGE_SCHEDULE, } from 'shared';
import { initDatabase, getTeams, getTeamById, saveMatch, getMatchById, saveTournament, getTournamentById, } from './db.js';
import { initCache, cacheSet, cacheGet } from './cache.js';
dotenv.config();
const app = express();
const port = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
// Simulation sessions repository
const activeSimulations = new Map();
// --- HTTP API Routes ---
// Get all teams
app.get('/api/teams', async (req, res) => {
    try {
        const teams = await getTeams();
        res.json(teams);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get single team details
app.get('/api/teams/:id', async (req, res) => {
    try {
        const team = await getTeamById(req.params.id);
        if (!team)
            return res.status(404).json({ error: 'Team not found' });
        res.json(team);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Create and start a match simulation
app.post('/api/matches/simulate', async (req, res) => {
    const { homeTeamId, awayTeamId } = req.body;
    if (!homeTeamId || !awayTeamId) {
        return res.status(400).json({ error: 'Missing homeTeamId or awayTeamId' });
    }
    try {
        const homeTeam = await getTeamById(homeTeamId);
        const awayTeam = await getTeamById(awayTeamId);
        if (!homeTeam || !awayTeam) {
            return res.status(404).json({ error: 'One or both teams not found' });
        }
        // Initialize simulation state
        let matchState = initializeMatchState(0, homeTeam, awayTeam);
        matchState = await saveMatch(matchState); // Saves and populates matchState.matchId
        res.json({ matchId: matchState.matchId, homeTeam: matchState.homeTeam.name, awayTeam: matchState.awayTeam.name });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get current match state
app.get('/api/matches/:id', async (req, res) => {
    const matchId = parseInt(req.params.id, 10);
    try {
        // Check active simulations cache first
        const active = activeSimulations.get(matchId);
        if (active) {
            return res.json(active.state);
        }
        // Check Redis/PostgreSQL
        const cached = await cacheGet(`match:${matchId}`);
        if (cached) {
            return res.json(JSON.parse(cached));
        }
        const match = await getMatchById(matchId);
        if (!match)
            return res.status(404).json({ error: 'Match not found' });
        res.json(match);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Initialize tournament
app.post('/api/tournaments', async (req, res) => {
    const { name } = req.body;
    try {
        const teamsList = await getTeams();
        const teamsMap = teamsList.reduce((acc, t) => {
            acc[t.id] = t;
            return acc;
        }, {});
        let tournament = initializeTournament(0, name || 'World Cup 2026', teamsMap);
        // Generate matches from the compiled schedule from groupstage.xlsx
        const matchesToSave = [];
        GROUPSTAGE_SCHEDULE.forEach((sched) => {
            const team1 = teamsMap[sched.home];
            const team2 = teamsMap[sched.away];
            if (team1 && team2) {
                const matchState = initializeMatchState(0, team1, team2);
                matchesToSave.push(saveMatch(matchState).then((saved) => {
                    const group = tournament.groups.find((g) => g.id === sched.group);
                    if (group) {
                        group.matches.push(saved.matchId);
                    }
                }));
            }
        });
        await Promise.all(matchesToSave);
        tournament = await saveTournament(tournament);
        res.json(tournament);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get tournament state
app.get('/api/tournaments/:id', async (req, res) => {
    const tId = parseInt(req.params.id, 10);
    try {
        const tournament = await getTournamentById(tId);
        if (!tournament)
            return res.status(404).json({ error: 'Tournament not found' });
        res.json(tournament);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Simulate all pending matches of the current round
app.post('/api/tournaments/:id/simulate-round', async (req, res) => {
    const tId = parseInt(req.params.id, 10);
    try {
        const tournament = await getTournamentById(tId);
        if (!tournament)
            return res.status(404).json({ error: 'Tournament not found' });
        if (tournament.status === 'COMPLETED') {
            return res.json({ message: 'Tournament already completed', tournament });
        }
        if (tournament.currentRound === 'GROUP_STAGE') {
            // Group all matches of the group stage by their scheduled round (1, 2, 3)
            const matchesByRound = {
                1: [],
                2: [],
                3: [],
            };
            for (const group of tournament.groups) {
                for (const mId of group.matches) {
                    const match = await getMatchById(mId);
                    if (match) {
                        // Find the scheduled round for this match
                        const sched = GROUPSTAGE_SCHEDULE.find((s) => s.group === group.id &&
                            ((s.home === match.homeTeam.id && s.away === match.awayTeam.id) ||
                                (s.home === match.awayTeam.id && s.away === match.homeTeam.id)));
                        const rNum = sched ? sched.round : 1;
                        matchesByRound[rNum].push({
                            matchId: mId,
                            homeTeamId: match.homeTeam.id,
                            awayTeamId: match.awayTeam.id,
                        });
                    }
                }
            }
            const allSimulatedMatches = [];
            if (!tournament.completedMatches) {
                tournament.completedMatches = {};
            }
            // Simulate chronologically from Round 1 to 3
            for (const rNum of [1, 2, 3]) {
                const roundMatches = matchesByRound[rNum];
                const simulatedInRound = [];
                for (const mRef of roundMatches) {
                    // Check if already completed in tournament state
                    const alreadyDone = tournament.completedMatches[mRef.matchId];
                    if (alreadyDone) {
                        const match = await getMatchById(mRef.matchId);
                        if (match) {
                            simulatedInRound.push(match);
                            allSimulatedMatches.push(match);
                        }
                        continue;
                    }
                    // Fetch fresh rosters from tournament
                    const homeTeam = tournament.teams[mRef.homeTeamId];
                    const awayTeam = tournament.teams[mRef.awayTeamId];
                    if (homeTeam && awayTeam) {
                        // Initialize fresh match state with current tournament rosters
                        let mState = initializeMatchState(mRef.matchId, homeTeam, awayTeam, 'GROUP_STAGE');
                        mState = simulateMatchInstant(mState);
                        await saveMatch(mState);
                        simulatedInRound.push(mState);
                        allSimulatedMatches.push(mState);
                        tournament.completedMatches[mRef.matchId] = {
                            homeScore: mState.homeScore,
                            awayScore: mState.awayScore,
                            homeTeamId: homeTeam.id,
                            awayTeamId: awayTeam.id,
                        };
                    }
                }
                // Apply roster updates and update player stats for this specific round
                if (simulatedInRound.length > 0) {
                    updateTournamentPlayerStats(tournament, simulatedInRound);
                    applyPostMatchRosterUpdates(tournament, simulatedInRound);
                }
            }
            // Recalculate tables for all groups
            for (const group of tournament.groups) {
                const groupMatches = [];
                for (const mId of group.matches) {
                    const m = allSimulatedMatches.find((x) => x.matchId === mId);
                    if (m)
                        groupMatches.push(m);
                }
                recalculateGroupTable(group, groupMatches);
            }
            // Generate Round of 32
            tournament.knockoutNodes = generateRoundOf32(tournament);
            tournament.currentRound = 'R32';
            await saveTournament(tournament);
            return res.json(tournament);
        }
        else {
            // Knockout rounds: R32, R16, QF, SF, FINAL
            const nodes = tournament.knockoutNodes;
            const currentRoundNodes = Object.values(nodes).filter((n) => n.round === tournament.currentRound);
            if (!tournament.completedMatches) {
                tournament.completedMatches = {};
            }
            const simulatedKnockoutMatches = [];
            for (const node of currentRoundNodes) {
                if (node.winnerId) {
                    // Already simulated
                    if (node.matchId) {
                        const match = await getMatchById(node.matchId);
                        if (match)
                            simulatedKnockoutMatches.push(match);
                    }
                    continue;
                }
                const homeId = node.homeTeamId;
                const awayId = node.awayTeamId;
                if (homeId && awayId) {
                    const homeTeam = tournament.teams[homeId];
                    const awayTeam = tournament.teams[awayId];
                    // Pass current round so round pressure is applied
                    let matchState = initializeMatchState(0, homeTeam, awayTeam, tournament.currentRound);
                    // Run instant simulation
                    matchState = simulateMatchInstant(matchState);
                    // In knockout rounds, enforce penalty shootout if drawn
                    if (matchState.homeScore === matchState.awayScore) {
                        const winner = Math.random() > 0.5 ? 'HOME' : 'AWAY';
                        if (winner === 'HOME') {
                            matchState.homeScore++;
                        }
                        else {
                            matchState.awayScore++;
                        }
                    }
                    const saved = await saveMatch(matchState);
                    node.matchId = saved.matchId;
                    node.winnerId = matchState.homeScore > matchState.awayScore ? homeId : awayId;
                    tournament.completedMatches[saved.matchId] = {
                        homeScore: matchState.homeScore,
                        awayScore: matchState.awayScore,
                        homeTeamId: homeId,
                        awayTeamId: awayId,
                    };
                    simulatedKnockoutMatches.push(matchState);
                }
            }
            // Aggregate player stats and apply fatigue/morale updates for this knockout round
            if (simulatedKnockoutMatches.length > 0) {
                updateTournamentPlayerStats(tournament, simulatedKnockoutMatches);
                applyPostMatchRosterUpdates(tournament, simulatedKnockoutMatches);
            }
            // Advance rounds
            if (tournament.currentRound === 'FINAL') {
                tournament.status = 'COMPLETED';
            }
            else {
                propagateKnockoutWinners(tournament);
                const nextRoundMap = {
                    R32: 'R16',
                    R16: 'QF',
                    QF: 'SF',
                    SF: 'FINAL',
                };
                tournament.currentRound = nextRoundMap[tournament.currentRound];
            }
            await saveTournament(tournament);
            res.json(tournament);
        }
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// --- WebSocket Streaming Loop Manager ---
function startMatchSimulationLoop(matchId) {
    const session = activeSimulations.get(matchId);
    if (!session)
        return;
    if (session.timer)
        clearInterval(session.timer);
    if (session.speed === 0) {
        session.timer = null;
        return;
    }
    // Calculate interval ms based on speed (1x = 100ms, 5x = 20ms, 10x = 10ms)
    const intervalMs = Math.round(100 / session.speed);
    session.timer = setInterval(async () => {
        // Perform tick
        session.state = simulateTick(session.state);
        // Broadcast update to all connected sockets
        const payload = JSON.stringify({
            type: 'TICK',
            state: session.state,
        });
        session.sockets.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(payload);
            }
        });
        // Handle completed state
        if (session.state.status === 'COMPLETED') {
            clearInterval(session.timer);
            session.timer = null;
            activeSimulations.delete(matchId);
            // Save final state
            await saveMatch(session.state);
            await cacheSet(`match:${matchId}`, JSON.stringify(session.state), 7200);
            // Broadcast completion event
            const completePayload = JSON.stringify({
                type: 'COMPLETED',
                state: session.state,
            });
            session.sockets.forEach((ws) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(completePayload);
                }
            });
        }
    }, intervalMs);
}
// WebSocket Connection Router
wss.on('connection', (ws, request) => {
    const urlParams = new URL(request.url || '', `http://${request.headers.host}`);
    const matchIdStr = urlParams.pathname.split('/').pop();
    const matchId = matchIdStr ? parseInt(matchIdStr, 10) : null;
    if (!matchId || isNaN(matchId)) {
        ws.close(4000, 'Invalid Match ID');
        return;
    }
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'SUBSCRIBE') {
                let session = activeSimulations.get(matchId);
                if (!session) {
                    // Fetch match from DB
                    const matchState = await getMatchById(matchId);
                    if (!matchState) {
                        ws.close(4004, 'Match not found');
                        return;
                    }
                    session = {
                        state: matchState,
                        speed: 5, // Default 5x
                        sockets: new Set(),
                        timer: null,
                    };
                    activeSimulations.set(matchId, session);
                }
                session.sockets.add(ws);
                // Send initial state immediately
                ws.send(JSON.stringify({
                    type: 'INIT',
                    state: session.state,
                    speed: session.speed,
                }));
                // Start engine loop if not already running
                if (!session.timer && session.state.status !== 'COMPLETED') {
                    startMatchSimulationLoop(matchId);
                }
            }
            if (data.type === 'SET_SPEED') {
                const session = activeSimulations.get(matchId);
                if (session) {
                    session.speed = data.speed; // 0, 1, 5, 10, 15, 20
                    ws.send(JSON.stringify({ type: 'SPEED_UPDATED', speed: session.speed }));
                    startMatchSimulationLoop(matchId);
                }
            }
            if (data.type === 'SKIP') {
                const session = activeSimulations.get(matchId);
                if (session && session.state.status !== 'COMPLETED') {
                    if (session.timer) {
                        clearInterval(session.timer);
                        session.timer = null;
                    }
                    // Compute all remaining ticks instantly
                    while (session.state.status !== 'COMPLETED') {
                        session.state = simulateTick(session.state);
                    }
                    activeSimulations.delete(matchId);
                    // Save final state
                    await saveMatch(session.state);
                    await cacheSet(`match:${matchId}`, JSON.stringify(session.state), 7200);
                    // Broadcast final result
                    const completePayload = JSON.stringify({
                        type: 'COMPLETED',
                        state: session.state,
                    });
                    session.sockets.forEach((s) => {
                        if (s.readyState === WebSocket.OPEN) {
                            s.send(completePayload);
                        }
                    });
                }
            }
        }
        catch (err) {
            console.error('WS error parsing message:', err);
        }
    });
    ws.on('close', () => {
        const session = activeSimulations.get(matchId);
        if (session) {
            session.sockets.delete(ws);
            if (session.sockets.size === 0) {
                // Stop timer and clean up if no subscribers left
                if (session.timer)
                    clearInterval(session.timer);
                activeSimulations.delete(matchId);
                console.log(`🧹 Cleaned up inactive simulation session for match: ${matchId}`);
            }
        }
    });
});
// Integrate WebSocket Server upgrade with HTTP Server
server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
    if (pathname.startsWith('/ws/match/')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    }
    else {
        socket.destroy();
    }
});
// Start listening
server.listen(port, async () => {
    console.log(`🚀 Server listening on port ${port}`);
    await initDatabase();
    await initCache();
});

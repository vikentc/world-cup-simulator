import { VENUES, } from './types.js';
import { Vector } from './vector.js';
import { getTacticalTargetPosition, FORMATION_ROLES } from './tactics.js';
import { updateBallPhysics, PITCH_WIDTH, PITCH_HEIGHT, GOAL_Y_TOP, GOAL_Y_BOTTOM, GOAL_HEIGHT, } from './physics.js';
// Match engine constants
const TICK_RATE = 10; // 10 ticks per second
const DT = 1 / TICK_RATE; // 0.1 seconds per tick
const KICK_RANGE = 1.2; // meters to touch/dribble/shoot/pass
const GOAL_CENTER_LEFT = { x: 0, y: 34 };
const GOAL_CENTER_RIGHT = { x: 105, y: 34 };
/**
 * Selects the starting 11 players based on team formation and player positions,
 * and assigns them roles on the pitch.
 */
export function selectStartingLineup(team) {
    const formation = team.tactics.formation;
    const roles = FORMATION_ROLES[formation];
    const squad = [...team.players];
    const selected = [];
    const isAvailable = (p) => !p.injured &&
        !p.redCarded &&
        !(p.suspendedMatches && p.suspendedMatches > 0) &&
        !(p.injuryDuration && p.injuryDuration > 0);
    // Group squad by position
    const gks = squad.filter((p) => p.position === 'GK' && isAvailable(p));
    const dfs = squad.filter((p) => p.position === 'DF' && isAvailable(p));
    const mfs = squad.filter((p) => p.position === 'MF' && isAvailable(p));
    const fws = squad.filter((p) => p.position === 'FW' && isAvailable(p));
    // Sort groups by overall stats
    const sumStats = (p) => p.attributes.pace +
        p.attributes.acceleration +
        p.attributes.stamina +
        p.attributes.passing +
        p.attributes.dribbling +
        p.attributes.positioning +
        p.attributes.decisions;
    gks.sort((a, b) => b.attributes.gkReflexes - a.attributes.gkReflexes);
    dfs.sort((a, b) => sumStats(b) - sumStats(a));
    mfs.sort((a, b) => sumStats(b) - sumStats(a));
    fws.sort((a, b) => sumStats(b) - sumStats(a));
    const gkUsed = 0;
    let dfUsed = 0;
    let mfUsed = 0;
    let fwUsed = 0;
    for (const roleEntry of roles) {
        let chosen;
        if (roleEntry.position === 'GK') {
            chosen = gks[gkUsed];
        }
        else if (roleEntry.position === 'DF') {
            chosen = dfs[dfUsed++];
        }
        else if (roleEntry.position === 'MF') {
            chosen = mfs[mfUsed++];
        }
        else if (roleEntry.position === 'FW') {
            chosen = fws[fwUsed++];
        }
        // Fallback if not enough position-specific players
        if (!chosen) {
            chosen = squad.find((p) => !selected.some((s) => s.player.id === p.id) && isAvailable(p));
        }
        if (chosen) {
            selected.push({ player: chosen, role: roleEntry.role, position: roleEntry.position });
        }
    }
    return selected;
}
/**
 * Initializes the simulation state for a match.
 */
export function initializeMatchState(matchId, homeTeam, awayTeam, round) {
    // Deep clone to avoid mutating parent tournament references directly during simulation
    const clonedHome = JSON.parse(JSON.stringify(homeTeam));
    const clonedAway = JSON.parse(JSON.stringify(awayTeam));
    // Reset all players in cloned rosters to ensure fresh match states
    clonedHome.players.forEach(p => {
        p.staminaState = 100;
        p.yellowCards = 0;
        p.redCarded = false;
        p.injured = false;
    });
    clonedAway.players.forEach(p => {
        p.staminaState = 100;
        p.yellowCards = 0;
        p.redCarded = false;
        p.injured = false;
    });
    const homeStarting = selectStartingLineup(clonedHome);
    const awayStarting = selectStartingLineup(clonedAway);
    // Compute nerves based on ELO difference and round pressure
    let pressureMult = 1.0;
    if (round === 'R32')
        pressureMult = 1.1;
    else if (round === 'R16')
        pressureMult = 1.2;
    else if (round === 'QF')
        pressureMult = 1.3;
    else if (round === 'SF')
        pressureMult = 1.4;
    else if (round === 'FINAL')
        pressureMult = 1.5;
    let nervesHome = Math.max(0, (2000 - clonedHome.eloRating) / 2000);
    let nervesAway = Math.max(0, (2000 - clonedAway.eloRating) / 2000);
    if (clonedAway.eloRating > clonedHome.eloRating) {
        nervesHome += (clonedAway.eloRating - clonedHome.eloRating) / 1000;
    }
    if (clonedHome.eloRating > clonedAway.eloRating) {
        nervesAway += (clonedHome.eloRating - clonedAway.eloRating) / 1000;
    }
    nervesHome = Math.max(0, Math.min(0.8, nervesHome * pressureMult));
    nervesAway = Math.max(0, Math.min(0.8, nervesAway * pressureMult));
    const players = [];
    // Map home team to pitch
    homeStarting.forEach(({ player, role, position }) => {
        const defaultCoords = getTacticalTargetPosition(role, clonedHome.tactics.formation, true, { x: 52.5, y: 34 }, clonedHome.tactics, null, clonedHome.id);
        const pFitness = player.fitness ?? 100;
        const pMorale = player.morale ?? 70;
        const fatigueFactor = (100 - pFitness) / 100;
        const moraleFactor = (pMorale - 70) / 100;
        const physicalScale = Math.max(0.6, 1 - fatigueFactor * 0.3);
        const mentalScale = Math.max(0.6, 1 - nervesHome * 0.25 + moraleFactor * 0.15);
        const technicalScale = Math.max(0.7, 1 - fatigueFactor * 0.15 - nervesHome * 0.1);
        const scaledAttributes = {
            pace: Math.round(player.attributes.pace * physicalScale),
            acceleration: Math.round(player.attributes.acceleration * physicalScale),
            stamina: Math.round(player.attributes.stamina * physicalScale),
            strength: Math.round(player.attributes.strength * physicalScale),
            agility: Math.round(player.attributes.agility * physicalScale),
            passing: Math.round(player.attributes.passing * technicalScale),
            dribbling: Math.round(player.attributes.dribbling * technicalScale),
            finishing: Math.round(player.attributes.finishing * technicalScale),
            firstTouch: Math.round(player.attributes.firstTouch * technicalScale),
            crossing: Math.round(player.attributes.crossing * technicalScale),
            positioning: Math.round(player.attributes.positioning * mentalScale),
            vision: Math.round(player.attributes.vision * mentalScale),
            decisions: Math.round(player.attributes.decisions * mentalScale),
            composure: Math.round(player.attributes.composure * mentalScale),
            workRate: Math.round(player.attributes.workRate * mentalScale),
            gkReflexes: Math.round(player.attributes.gkReflexes * (position === 'GK' ? physicalScale : 1)),
            gkHandling: Math.round(player.attributes.gkHandling * (position === 'GK' ? technicalScale : 1)),
            gkPositioning: Math.round(player.attributes.gkPositioning * (position === 'GK' ? mentalScale : 1)),
            gkOneOnOnes: Math.round(player.attributes.gkOneOnOnes * (position === 'GK' ? technicalScale : 1)),
        };
        players.push({
            playerId: player.id,
            teamId: clonedHome.id,
            name: player.name,
            position,
            role,
            pos: { ...defaultCoords },
            vel: { x: 0, y: 0 },
            targetPos: { ...defaultCoords },
            number: player.number,
            attributes: scaledAttributes,
            staminaState: player.staminaState,
            color: clonedHome.colorPrimary,
            roleCoordsDefault: { ...defaultCoords },
            roleCoordsAttacking: { ...defaultCoords }, // Dynamic
            yellowCards: 0,
            redCarded: false,
        });
    });
    // Map away team to pitch
    awayStarting.forEach(({ player, role, position }) => {
        const defaultCoords = getTacticalTargetPosition(role, clonedAway.tactics.formation, false, { x: 52.5, y: 34 }, clonedAway.tactics, null, clonedAway.id);
        const pFitness = player.fitness ?? 100;
        const pMorale = player.morale ?? 70;
        const fatigueFactor = (100 - pFitness) / 100;
        const moraleFactor = (pMorale - 70) / 100;
        const physicalScale = Math.max(0.6, 1 - fatigueFactor * 0.3);
        const mentalScale = Math.max(0.6, 1 - nervesAway * 0.25 + moraleFactor * 0.15);
        const technicalScale = Math.max(0.7, 1 - fatigueFactor * 0.15 - nervesAway * 0.1);
        const scaledAttributes = {
            pace: Math.round(player.attributes.pace * physicalScale),
            acceleration: Math.round(player.attributes.acceleration * physicalScale),
            stamina: Math.round(player.attributes.stamina * physicalScale),
            strength: Math.round(player.attributes.strength * physicalScale),
            agility: Math.round(player.attributes.agility * physicalScale),
            passing: Math.round(player.attributes.passing * technicalScale),
            dribbling: Math.round(player.attributes.dribbling * technicalScale),
            finishing: Math.round(player.attributes.finishing * technicalScale),
            firstTouch: Math.round(player.attributes.firstTouch * technicalScale),
            crossing: Math.round(player.attributes.crossing * technicalScale),
            positioning: Math.round(player.attributes.positioning * mentalScale),
            vision: Math.round(player.attributes.vision * mentalScale),
            decisions: Math.round(player.attributes.decisions * mentalScale),
            composure: Math.round(player.attributes.composure * mentalScale),
            workRate: Math.round(player.attributes.workRate * mentalScale),
            gkReflexes: Math.round(player.attributes.gkReflexes * (position === 'GK' ? physicalScale : 1)),
            gkHandling: Math.round(player.attributes.gkHandling * (position === 'GK' ? technicalScale : 1)),
            gkPositioning: Math.round(player.attributes.gkPositioning * (position === 'GK' ? mentalScale : 1)),
            gkOneOnOnes: Math.round(player.attributes.gkOneOnOnes * (position === 'GK' ? technicalScale : 1)),
        };
        players.push({
            playerId: player.id,
            teamId: clonedAway.id,
            name: player.name,
            position,
            role,
            pos: { ...defaultCoords },
            vel: { x: 0, y: 0 },
            targetPos: { ...defaultCoords },
            number: player.number,
            attributes: scaledAttributes,
            staminaState: player.staminaState,
            color: clonedAway.colorSecondary,
            roleCoordsDefault: { ...defaultCoords },
            roleCoordsAttacking: { ...defaultCoords }, // Dynamic
            yellowCards: 0,
            redCarded: false,
        });
    });
    const ball = {
        pos: { x: 52.5, y: 34 },
        vel: { x: 0, y: 0 },
        height: 0,
        zVel: 0,
        ownerId: null,
        lastTouchId: null,
        lastTouchTeamId: null,
        lastTouchAction: null,
    };
    const stats = {
        possessionHome: 50,
        possessionAway: 50,
        shotsHome: 0,
        shotsAway: 0,
        shotsOnTargetHome: 0,
        shotsOnTargetAway: 0,
        passesHome: 0,
        passesAway: 0,
        passesCompletedHome: 0,
        passesCompletedAway: 0,
        tacklesHome: 0,
        tacklesAway: 0,
        interceptionsHome: 0,
        interceptionsAway: 0,
        cornersHome: 0,
        cornersAway: 0,
        savesHome: 0,
        savesAway: 0,
        foulsHome: 0,
        foulsAway: 0,
        yellowCardsHome: 0,
        yellowCardsAway: 0,
        redCardsHome: 0,
        redCardsAway: 0,
        xgHome: 0,
        xgAway: 0,
    };
    const referees = ['Pierluigi Collina', 'Howard Webb', 'Mark Clattenburg', 'Nestor Pitana', 'Clement Turpin'];
    const refName = referees[Math.floor(Math.random() * referees.length)];
    const refStrictness = 1 + Math.floor(Math.random() * 5);
    const venue = VENUES[Math.floor(Math.random() * VENUES.length)];
    const state = {
        matchId,
        homeTeam,
        awayTeam,
        status: 'SCHEDULED',
        elapsedSeconds: 0,
        homeScore: 0,
        awayScore: 0,
        ball,
        players,
        events: [],
        commentary: [],
        stats,
        homePossessionTicks: 0,
        awayPossessionTicks: 0,
        totalTicks: 0,
        refereeName: `${refName} (Strictness: ${refStrictness}/5)`,
        refereeStrictness: refStrictness,
        venue,
        looseBallTicks: 0,
    };
    triggerSetPiece(state, 'KICK_OFF', homeTeam.id);
    return state;
}
// Internal set piece tracking
function triggerSetPiece(state, type, teamId) {
    // Find a suitable taker
    const takers = state.players.filter((p) => p.teamId === teamId);
    // Default to midfielder or defender
    let taker = takers.find((p) => p.position === 'MF') || takers[0];
    if (type === 'GOAL_KICK') {
        taker = takers.find((p) => p.position === 'GK') || taker;
    }
    else if (type === 'PENALTY') {
        taker = takers.filter(p => p.position === 'FW' || p.position === 'MF').sort((a, b) => b.attributes.finishing - a.attributes.finishing)[0] || taker;
    }
    // Position ball
    let ballPos = { x: 52.5, y: 34 };
    if (type === 'KICK_OFF') {
        ballPos = { x: 52.5, y: 34 };
    }
    else if (type === 'GOAL_KICK') {
        ballPos = teamId === state.homeTeam.id ? { x: 5, y: 34 } : { x: 100, y: 34 };
    }
    else if (type === 'CORNER') {
        // Determine which corner
        const attackingRight = teamId === state.homeTeam.id;
        const cornerX = attackingRight ? 105 : 0;
        const cornerY = state.ball.pos.y < 34 ? 0 : 68;
        ballPos = { x: cornerX, y: cornerY };
    }
    else if (type === 'THROW_IN') {
        ballPos = { ...state.ball.pos };
    }
    else if (type === 'FREE_KICK') {
        ballPos = { ...state.ball.pos };
    }
    else if (type === 'PENALTY') {
        ballPos = teamId === state.homeTeam.id ? { x: 94, y: 34 } : { x: 11, y: 34 };
    }
    state.ball.pos = { ...ballPos };
    state.ball.vel = { x: 0, y: 0 };
    state.ball.height = 0;
    state.ball.zVel = 0;
    state.ball.ownerId = taker.playerId;
    taker.decisionCooldown = 0;
    state.ball.lastTouchId = taker.playerId;
    state.ball.lastTouchTeamId = teamId;
    state.ball.lastTouchAction = type === 'KICK_OFF' ? 'PASS' : (type === 'GOAL_KICK' ? 'CLEARANCE' : (type === 'CORNER' || type === 'THROW_IN' || type === 'FREE_KICK' ? 'PASS' : (type === 'PENALTY' ? 'SHOT' : null)));
    // Reposition taker
    taker.pos = { ...ballPos };
    taker.noMoveTicks = (type === 'THROW_IN' || type === 'KICK_OFF') ? 15 : 25;
    // Set piece state
    state.activeSetPiece = {
        type,
        takingTeamId: teamId,
        takerId: taker.playerId,
        ticksRemaining: (type === 'THROW_IN' || type === 'KICK_OFF') ? 15 : 25, // 1.5s or 2.5s delay for players to reset positions
        kickTaken: false,
    };
    // Log key match events for goals/kick-offs
    if (type === 'KICK_OFF' || type === 'HALF_TIME' || type === 'FULL_TIME') {
        const minute = Math.floor(state.elapsedSeconds / 60);
        const second = Math.floor(state.elapsedSeconds % 60);
        const evId = `${state.matchId}_ev_${state.totalTicks}`;
        state.events.push({
            id: evId,
            type,
            minute,
            second,
            elapsedSeconds: state.elapsedSeconds,
            x: ballPos.x,
            y: ballPos.y,
            details: type === 'KICK_OFF' ? `Kick-off for ${teamId === state.homeTeam.id ? state.homeTeam.name : state.awayTeam.name}` : undefined,
        });
        addCommentary(state, type, `${type === 'KICK_OFF' ? 'The referee blows the whistle. We are underway!' : 'Break in play.'}`);
    }
}
function addCommentary(state, type, text) {
    const minute = Math.floor(state.elapsedSeconds / 60);
    const second = Math.floor(state.elapsedSeconds % 60);
    state.commentary.push({
        id: `${state.matchId}_comm_${state.totalTicks}`,
        minute,
        second,
        text,
        type,
    });
}
function getCoachName(teamId, teamName) {
    const coachMap = {
        ARG: 'Lionel Scaloni',
        FRA: 'Didier Deschamps',
        GER: 'Julian Nagelsmann',
        ESP: 'Luis de la Fuente',
        ENG: 'Thomas Tuchel',
        ITA: 'Luciano Spalletti',
        BRA: 'Dorival Júnior',
        POR: 'Roberto Martínez',
        USA: 'Mauricio Pochettino',
        MEX: 'Javier Aguirre',
        CAN: 'Jesse Marsch',
        NED: 'Ronald Koeman',
        BEL: 'Domenico Tedesco',
        CRO: 'Zlatko Dalić',
        MAR: 'Walid Regragui',
        JPN: 'Hajime Moriyasu',
        SEN: 'Aliou Cissé',
        URU: 'Marcelo Bielsa',
    };
    return coachMap[teamId] || `Coach ${teamName}`;
}
function addCoachShout(state, teamId, reactionType) {
    const team = teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
    const coach = getCoachName(team.id, team.name);
    let quotes = [];
    switch (reactionType) {
        case 'GOAL_SCORED':
            quotes = [
                "YES! That's it! I am a tactical genius!",
                "Get in! I won't have to pack my bags tomorrow!",
                "Goal! Oh thank goodness, my job is safe for another week!",
                "Splendid! Now run back and don't ruin this for me!",
                "Goaaaaal! I love this game! Dinner is on me tonight!"
            ];
            break;
        case 'GOAL_CONCEDED':
            quotes = [
                "Are you playing for them?! Who paid you?!",
                "My grandmother reacts faster than that! Wake up!",
                "Unbelievable! We practiced this for 4 hours and you do THAT?!",
                "Are you trying to get me fired?! Focus, you clowns!",
                "Conceding to them?! I'm going to have gray hair by halftime!"
            ];
            break;
        case 'SHOT_MISSED':
            quotes = [
                "The goal is 7 meters wide! How did you hit the corner flag?!",
                "Ah! My eyes! That shot was a crime against football!",
                "So close! If only the goal was 5 meters to the left!",
                "Close! But let's try to shoot towards the net next time!",
                "Nearly! Keep shooting, eventually physics will work in our favor!"
            ];
            break;
        case 'SHOT_CONCEDED':
            quotes = [
                "He had time to read a book before shooting! Close him down!",
                "Stop social distancing and get tight on the attacker!",
                "Don't just stand there and admire the flight of the ball!",
                "My heart can't take this! Close them down!",
                "Wake up! They are treating our box like a playground!"
            ];
            break;
        case 'MISTAKE_SELF':
            quotes = [
                "What in the world was that touch?! It bounced like a trampoline!",
                "Is the ball too round for you?! Keep it simple!",
                "Who did you pass to?! The ghost of the stadium?!",
                "Unbelievable blunder! Please tell me that was a lag spike!",
                "Did you forget which team you are playing for?!"
            ];
            break;
        case 'MISTAKE_OPPONENT':
            quotes = [
                "Yes! They are playing like they've had too much coffee! Press!",
                "They've gifted us the ball! Don't feel sorry for them, score!",
                "Good press! They are shaking like jelly!",
                "Capitalize on their blunders! They are doing our job for us!",
                "Take the ball! They don't want it anyway!"
            ];
            break;
        case 'TACTICAL':
            const style = team.tactics.style;
            if (style === 'Gegenpress') {
                quotes = [
                    "Press them! If they breathe, press them harder!",
                    "Suffocate them! Double up on the ball! No mercy!",
                    "No time on the ball! Run at them like wild wolves!"
                ];
            }
            else if (style === 'Possession') {
                quotes = [
                    "Keep the ball! I want 500 passes before anyone even thinks of shooting!",
                    "Patience! Circulate the ball, make them run until they pass out!",
                    "Keep possession! Treat the ball like it's made of solid gold!"
                ];
            }
            else if (style === 'Low Block') {
                quotes = [
                    "Park the bus! Park the airplane! Do not let them through!",
                    "Hold the defensive block! No gaps, pretend we are a brick wall!",
                    "Discipline! Force them wide, clog up the penalty box!"
                ];
            }
            else if (style === 'Counter Attack') {
                quotes = [
                    "Defend deep, and run like your lives depend on it on the break!",
                    "Quick transition! Hit them when they are not looking!",
                    "Use the pace! Sprint! Sprint!"
                ];
            }
            else {
                quotes = [
                    "Boot it long! Just kick it and run, we'll figure it out later!",
                    "Play direct! Move the ball quickly, stop overthinking!",
                    "Get players in the box, cross it and pray!"
                ];
            }
            break;
        case 'HAPPY':
            quotes = [
                "Magnificent! I might actually smile today!",
                "Beautiful! I'm almost proud of you guys!",
                "Keep this up and I'll buy everyone pizza!",
                "Outstanding! You guys actually listened to me!"
            ];
            break;
        case 'CURSE':
            quotes = [
                "Sweet mother of football, what are you doing?!",
                "Damn it! I should have stayed in bed today!",
                "What the absolute hell was that?!",
                "Why do I even coach?! My blood pressure is through the roof!"
            ];
            break;
    }
    const shout = quotes[Math.floor(Math.random() * quotes.length)];
    const minute = Math.floor(state.elapsedSeconds / 60);
    const second = Math.floor(state.elapsedSeconds % 60);
    state.commentary.push({
        id: `${state.matchId}_comm_coach_${state.totalTicks}`,
        minute,
        second,
        text: `📣 [COACH] ${coach} screams: "${shout}"`,
        type: 'COACH_REACTION',
    });
}
function getPossessionTeamId(state) {
    if (state.activeSetPiece && state.activeSetPiece.ticksRemaining > 0) {
        return null;
    }
    if (state.ball.ownerId !== null) {
        const owner = state.players.find((p) => p.playerId === state.ball.ownerId);
        return owner ? owner.teamId : null;
    }
    const action = state.ball.lastTouchAction;
    if (action === 'PASS' || action === 'THROUGH_BALL') {
        return state.ball.lastTouchTeamId;
    }
    return null;
}
/**
 * Main simulation tick execution.
 */
export function simulateTick(state) {
    if (state.status === 'COMPLETED')
        return state;
    state.status = 'LIVE';
    state.totalTicks++;
    state.elapsedSeconds += DT;
    // Periodic coach tactical shouts every 120 seconds of game time (1200 ticks at DT=0.1)
    if (state.totalTicks > 0 && state.totalTicks % 1200 === 0 && state.status === 'LIVE') {
        const shoutingTeamId = Math.random() < 0.5 ? state.homeTeam.id : state.awayTeam.id;
        addCoachShout(state, shoutingTeamId, 'TACTICAL');
    }
    const minute = Math.floor(state.elapsedSeconds / 60);
    const second = Math.floor(state.elapsedSeconds % 60);
    // Check halftime / fulltime transitions
    if (minute === 45 && second === 0 && state.elapsedSeconds < 2700) {
        state.status = 'HALF_TIME';
        addCommentary(state, 'HALF_TIME', `Halftime whistle blows! Score: ${state.homeTeam.name} ${state.homeScore} - ${state.awayScore} ${state.awayTeam.name}.`);
        triggerSetPiece(state, 'KICK_OFF', state.awayTeam.id); // Away kicks off 2nd half
        return state;
    }
    if (minute === 90 && second === 0) {
        state.status = 'COMPLETED';
        const evId = `${state.matchId}_ev_${state.totalTicks}`;
        state.events.push({
            id: evId,
            type: 'FULL_TIME',
            minute,
            second,
            elapsedSeconds: state.elapsedSeconds,
            x: 52.5,
            y: 34,
            details: `Full Time. Final score: ${state.homeTeam.name} ${state.homeScore} - ${state.awayScore} ${state.awayTeam.name}`,
        });
        addCommentary(state, 'FULL_TIME', `And there goes the final whistle! The match finishes ${state.homeTeam.name} ${state.homeScore}, ${state.awayTeam.name} ${state.awayScore}.`);
        return state;
    }
    const ballOwnerTeamId = getPossessionTeamId(state);
    if (ballOwnerTeamId === state.homeTeam.id) {
        state.homePossessionTicks++;
    }
    else if (ballOwnerTeamId === state.awayTeam.id) {
        state.awayPossessionTicks++;
    }
    const totalPossession = state.homePossessionTicks + state.awayPossessionTicks;
    if (totalPossession > 0) {
        state.stats.possessionHome = Math.round((state.homePossessionTicks / totalPossession) * 100);
        state.stats.possessionAway = 100 - state.stats.possessionHome;
    }
    // --- 0. Pending Set Piece Delay (Out of Bounds / Goal Flight) ---
    if (state.pendingSetPiece) {
        state.pendingSetPiece.ticksRemaining--;
        if (state.pendingSetPiece.ticksRemaining <= 0) {
            const psp = state.pendingSetPiece;
            state.pendingSetPiece = null;
            triggerSetPiece(state, psp.type, psp.takingTeamId);
            return state;
        }
        // Update ball physics and normal player movement so the ball finishes rolling/flying out
        const physicsResult = updateBallPhysics(state.ball, DT, state.homeTeam.id, state.awayTeam.id);
        state.ball = physicsResult.ballState;
        updatePlayerMovement(state, false);
        return state;
    }
    // --- 0.5. Active Shot Flight & Defer GK Save ---
    if (state.activeShot) {
        state.activeShot.ticksToTarget--;
        if (state.activeShot.ticksToTarget <= 0) {
            const activeShot = state.activeShot;
            state.activeShot = null;
            if (activeShot.isSaved && activeShot.gkId && state.ball.ownerId === null) {
                const gk = state.players.find(p => p.playerId === activeShot.gkId);
                if (gk) {
                    const ball = state.ball;
                    const oppTeamId = gk.teamId;
                    const isHome = oppTeamId === state.homeTeam.id;
                    if (isHome)
                        state.stats.savesHome++;
                    else
                        state.stats.savesAway++;
                    // Roll for goalkeeper spill / howler (higher chance for weaker GKs)
                    const gkBlunderChance = 0.005 + (100 - gk.attributes.gkHandling) * 0.00035;
                    const isHowler = Math.random() < gkBlunderChance;
                    let savedButNoGoal = true;
                    if (activeShot.holdsBall && !isHowler) {
                        ball.ownerId = gk.playerId;
                        gk.decisionCooldown = 0;
                        ball.lastTouchId = gk.playerId;
                        ball.lastTouchTeamId = oppTeamId;
                        ball.lastTouchAction = 'SAVE';
                        ball.pos = { ...gk.pos };
                        ball.vel = { x: 0, y: 0 };
                        ball.height = 0;
                        ball.zVel = 0;
                        addCommentary(state, 'SAVE', `Saved! Goalkeeper ${gk.name} handles the shot cleanly.`);
                    }
                    else {
                        // Spilled / fumbled or direct howler goal!
                        const isHowlerGoal = isHowler && Math.random() < 0.35; // 35% of GK fumbles slip in
                        if (isHowlerGoal) {
                            savedButNoGoal = false;
                            const goalX = gk.teamId === state.homeTeam.id ? 0 : 105;
                            const goalVec = Vector.normalize({ x: goalX - gk.pos.x, y: 34 - gk.pos.y });
                            ball.vel = Vector.mult(goalVec, 4); // slow roll past GK
                            ball.height = 0;
                            ball.zVel = 0;
                            ball.pos = { ...gk.pos };
                            addCommentary(state, 'GOAL', `🚨 HOWLER! Goalkeeper ${gk.name} misjudges the shot, and it slips right through their fingers and rolls into the net!`);
                        }
                        else if (isHowler) {
                            // Spills ball a random short distance in front of goal
                            ball.ownerId = null;
                            ball.noControlTicks = 3;
                            const spillDir = Vector.normalize({ x: gk.teamId === state.homeTeam.id ? 1 : -1, y: (Math.random() - 0.5) * 0.5 });
                            ball.vel = Vector.mult(spillDir, 3.5);
                            ball.height = 0;
                            ball.zVel = 0;
                            ball.pos = { ...gk.pos };
                            addCommentary(state, 'SAVE', `⚠️ Fumbled! Goalkeeper ${gk.name} spills the shot! The ball is loose in the penalty area!`);
                        }
                        else {
                            ball.pos = { ...gk.pos };
                            ball.lastTouchId = gk.playerId;
                            ball.lastTouchTeamId = oppTeamId;
                            ball.lastTouchAction = 'SAVE';
                            if (activeShot.tipOutOfBounds) {
                                ball.noControlTicks = 8;
                                const xDir = oppTeamId === 'AWAY' ? 1 : -1;
                                if (activeShot.overBar) {
                                    const yDir = (Math.random() - 0.5) * 0.3;
                                    const parryDir = Vector.normalize({ x: xDir * 0.8, y: yDir });
                                    ball.vel = Vector.mult(parryDir, 10);
                                    ball.height = 2.0;
                                    ball.zVel = 4;
                                    addCommentary(state, 'SAVE', `Spectacular fingertip save by ${gk.name}, tipping it over the bar for a corner!`);
                                }
                                else {
                                    const yDirSign = gk.pos.y < 34 ? -1 : 1;
                                    const yDir = yDirSign * (0.6 + Math.random() * 0.6);
                                    const parryDir = Vector.normalize({ x: xDir * 0.5, y: yDir });
                                    ball.vel = Vector.mult(parryDir, 12);
                                    ball.height = 0.8;
                                    ball.zVel = 1;
                                    addCommentary(state, 'SAVE', `Brilliant diving save by ${gk.name}, tipping the ball wide of the post! Corner kick.`);
                                }
                            }
                            else {
                                ball.noControlTicks = 3;
                                const targetDir = oppTeamId === state.homeTeam.id ? 1 : -1;
                                const parryDir = { x: (0.1 + Math.random() * 0.9) * targetDir, y: (Math.random() - 0.5) };
                                ball.vel = Vector.mult(Vector.normalize(parryDir), 8);
                                ball.zVel = 2;
                                ball.height = 0.5;
                                addCommentary(state, 'SAVE', `Fingertip save from ${gk.name}! The ball is parried back into play!`);
                            }
                        }
                    }
                    if (savedButNoGoal) {
                        const attackingTeamId = oppTeamId === state.homeTeam.id ? state.awayTeam.id : state.homeTeam.id;
                        addCoachShout(state, attackingTeamId, 'SHOT_MISSED');
                        addCoachShout(state, oppTeamId, 'SHOT_CONCEDED');
                    }
                }
            }
        }
    }
    // --- 1. Set Piece Logic ---
    if (state.activeSetPiece && state.activeSetPiece.ticksRemaining > 0) {
        state.activeSetPiece.ticksRemaining--;
        // Hold ball in place
        state.ball.pos = { ...state.ball.pos };
        state.ball.vel = { x: 0, y: 0 };
        state.ball.height = 0;
        state.ball.zVel = 0;
        // Force players to slide to their base tactical positions during reset
        updatePlayerMovement(state, true);
        return state;
    }
    if (state.activeSetPiece && !state.activeSetPiece.kickTaken) {
        // Taker takes the kick now
        executeSetPieceKick(state);
        state.activeSetPiece = null;
        return state;
    }
    // --- 2. Normal Play Logic ---
    // A. Ball physics update
    const physicsResult = updateBallPhysics(state.ball, DT, state.homeTeam.id, state.awayTeam.id);
    state.ball = physicsResult.ballState;
    if (state.ball.noControlTicks && state.ball.noControlTicks > 0) {
        state.ball.noControlTicks--;
    }
    // Track loose ball ticks to clear lastTouchAction after a short duration (e.g. 8 ticks / 0.8s)
    if (state.ball.ownerId === null) {
        state.looseBallTicks = (state.looseBallTicks || 0) + 1;
        if (state.looseBallTicks > 8) {
            state.ball.lastTouchAction = null;
        }
    }
    else {
        state.looseBallTicks = 0;
    }
    if (physicsResult.outOfBounds) {
        if (physicsResult.isGoal && physicsResult.scoringTeamId) {
            if (physicsResult.scoringTeamId === 'HOME') {
                state.homeScore++;
            }
            else {
                state.awayScore++;
            }
            const scoringTeam = physicsResult.scoringTeamId === 'HOME' ? state.homeTeam : state.awayTeam;
            const concedingTeam = physicsResult.scoringTeamId === 'HOME' ? state.awayTeam : state.homeTeam;
            const lastTouchPlayer = state.players.find((p) => p.playerId === state.ball.lastTouchId);
            const goalScorer = lastTouchPlayer?.teamId === scoringTeam.id ? lastTouchPlayer.name : 'Unknown Player';
            const evId = `${state.matchId}_ev_${state.totalTicks}`;
            state.events.push({
                id: evId,
                type: 'GOAL',
                minute,
                second,
                elapsedSeconds: state.elapsedSeconds,
                teamId: scoringTeam.id,
                playerId: state.ball.lastTouchId || undefined,
                x: state.ball.pos.x,
                y: state.ball.pos.y,
                details: `GOAL! ${goalScorer} scores for ${scoringTeam.name}!`,
            });
            addCommentary(state, 'GOAL', `GOAL!!! Beautiful finish by ${goalScorer}! The stadium erupts! ${state.homeTeam.name} ${state.homeScore} - ${state.awayScore} ${state.awayTeam.name}.`);
            addCoachShout(state, scoringTeam.id, 'GOAL_SCORED');
            addCoachShout(state, concedingTeam.id, 'GOAL_CONCEDED');
            // Queue kickoff with delay
            state.pendingSetPiece = {
                type: 'KICK_OFF',
                takingTeamId: concedingTeam.id,
                ticksRemaining: 15,
            };
            return state;
        }
        else if (physicsResult.reason) {
            // Out of bounds (throw-in, goal kick, corner)
            const oppositeTeamId = state.ball.lastTouchTeamId === state.homeTeam.id ? state.awayTeam.id : state.homeTeam.id;
            // For Corner or Goal Kick, the team choice is determined in updateBallPhysics
            let takingTeam = oppositeTeamId;
            if (physicsResult.reason === 'CORNER') {
                // Corner is taken by attacking team
                takingTeam = state.ball.lastTouchTeamId === state.homeTeam.id ? state.awayTeam.id : state.homeTeam.id;
                if (takingTeam === state.homeTeam.id)
                    state.stats.cornersHome++;
                else
                    state.stats.cornersAway++;
            }
            else if (physicsResult.reason === 'GOAL_KICK') {
                // Goal kick is taken by defending team
                takingTeam = state.ball.lastTouchTeamId === state.homeTeam.id ? state.awayTeam.id : state.homeTeam.id;
            }
            addCommentary(state, physicsResult.reason, `Ball goes out of play. It will be a ${physicsResult.reason.replace('_', ' ').toLowerCase()} for ${takingTeam === state.homeTeam.id ? state.homeTeam.name : state.awayTeam.name}.`);
            if (physicsResult.reason === 'GOAL_KICK') {
                const attackingTeamId = state.ball.lastTouchTeamId;
                if (attackingTeamId) {
                    const defendingTeamId = attackingTeamId === state.homeTeam.id ? state.awayTeam.id : state.homeTeam.id;
                    addCoachShout(state, attackingTeamId, 'SHOT_MISSED');
                    addCoachShout(state, defendingTeamId, 'SHOT_CONCEDED');
                }
            }
            // Queue set piece with delay
            state.pendingSetPiece = {
                type: physicsResult.reason,
                takingTeamId: takingTeam,
                ticksRemaining: 12,
            };
            return state;
        }
    }
    // B. Ball acquisition (if ball is loose)
    if (state.ball.ownerId === null && state.ball.height < 1.5 && (!state.ball.noControlTicks || state.ball.noControlTicks <= 0)) {
        // Find a player who can control the ball (dynamic reach based on defensive stats/context)
        let interceptingPlayer = null;
        let minInterceptDist = Infinity;
        state.players.forEach((p) => {
            const d = Vector.dist(p.pos, state.ball.pos);
            // Calculate dynamic control/interception reach
            let controlRange = KICK_RANGE; // default 1.2m
            const lastTouchTeamId = state.ball.lastTouchTeamId;
            if (lastTouchTeamId && lastTouchTeamId !== p.teamId) {
                // Defensive interception stretch! Good defensive positioning/agility boosts reach up to 1.9m
                const defAttr = p.attributes.positioning * 0.5 + p.attributes.strength * 0.3 + p.attributes.agility * 0.2;
                let controlBonus = 0;
                if (defAttr > 70) {
                    controlBonus = (defAttr - 70) * 0.024; // max +0.72m -> 1.92m reach for world-class defenders
                }
                // Passing specialist adjustment: reduce defender stretch control range
                const passingTeam = lastTouchTeamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
                if (passingTeam.passingSpecialist) {
                    controlBonus *= 0.6; // 40% reduction in stretch reach when cutting out specialist passes
                }
                controlRange += controlBonus;
            }
            if (d < controlRange && d < minInterceptDist) {
                minInterceptDist = d;
                interceptingPlayer = p;
            }
        });
        if (interceptingPlayer) {
            // Player controls/intercepts the ball
            const player = interceptingPlayer;
            // Check if this was a defensive interception
            const isInterception = state.ball.lastTouchTeamId && state.ball.lastTouchTeamId !== player.teamId;
            state.ball.ownerId = player.playerId;
            player.decisionCooldown = 0;
            state.ball.lastTouchId = player.playerId;
            state.ball.lastTouchTeamId = player.teamId;
            state.ball.lastTouchAction = isInterception ? 'INTERCEPTION' : 'CONTROL';
            state.ball.vel = { x: 0, y: 0 };
            if (isInterception) {
                const isHome = player.teamId === state.homeTeam.id;
                if (isHome)
                    state.stats.interceptionsHome++;
                else
                    state.stats.interceptionsAway++;
                // Occasional commentary for nice interceptions
                if (Math.random() < 0.25) {
                    addCommentary(state, 'INTERCEPTION', `Smart interception! ${player.name} reads the play perfectly and cuts out the ball.`);
                }
            }
        }
    }
    // C. Decisions & movement updates
    state.players.forEach((p) => {
        if (state.ball.ownerId !== p.playerId) {
            p.isSoloDribble = false;
            p.soloDribbleTicks = 0;
        }
    });
    handlePlayerDecisions(state);
    updatePlayerMovement(state, false);
    if (state.totalTicks % 100 === 0) {
        checkSubstitutions(state);
    }
    // Synchronize on-pitch player stats (stamina, cards) to the team rosters
    state.players.forEach((p) => {
        const team = p.teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
        const teamPlayer = team.players.find((tp) => tp.id === p.playerId);
        if (teamPlayer) {
            teamPlayer.staminaState = p.staminaState;
            teamPlayer.yellowCards = p.yellowCards ?? 0;
            teamPlayer.redCarded = p.redCarded ?? false;
        }
    });
    return state;
}
function executeSetPieceKick(state) {
    const activeSetPiece = state.activeSetPiece;
    if (!activeSetPiece)
        return;
    const taker = state.players.find((p) => p.playerId === activeSetPiece.takerId);
    if (!taker)
        return;
    // 0.5 seconds of follow-through pause (cannot move while ball is struck)
    taker.noMoveTicks = 5;
    const attackingRight = taker.teamId === state.homeTeam.id;
    const targetDir = attackingRight ? 1 : -1;
    state.ball.ownerId = null; // Loose ball
    let kickAction = 'PASS';
    if (activeSetPiece.type === 'KICK_OFF') {
        // Short pass to a midfielder
        const teammates = state.players.filter((p) => p.teamId === taker.teamId && p.playerId !== taker.playerId);
        const mfs = teammates.filter((p) => p.position === 'MF');
        const target = mfs[0] || teammates[0];
        if (target) {
            const passVec = Vector.sub(target.pos, taker.pos);
            const passDir = Vector.normalize(passVec);
            state.ball.vel = Vector.mult(passDir, 12); // Speed 12 m/s
            state.ball.height = 0;
            state.ball.zVel = 0;
            addCommentary(state, 'PASS', `${taker.name} rolls it short to start play.`);
        }
        else {
            // Fallback: kick forward
            state.ball.vel = { x: targetDir * 12, y: 0 };
            state.ball.height = 0;
            state.ball.zVel = 0;
        }
    }
    else if (activeSetPiece.type === 'GOAL_KICK') {
        // Long kick downfield
        kickAction = 'CLEARANCE';
        const targetX = taker.pos.x + targetDir * 45;
        const targetY = 34 + (Math.random() - 0.5) * 30;
        const passVec = Vector.sub({ x: targetX, y: targetY }, taker.pos);
        const passDir = Vector.normalize(passVec);
        state.ball.vel = Vector.mult(passDir, 25);
        state.ball.zVel = 12; // Aerial kick
        state.ball.height = 0.1;
        addCommentary(state, 'PASS', `${taker.name} sends a booming goal kick deep into the opponent half.`);
    }
    else if (activeSetPiece.type === 'CORNER') {
        // Cross into the box
        const penaltyBoxX = attackingRight ? 90 : 15;
        const penaltyBoxY = 34 + (Math.random() - 0.5) * 20;
        const passVec = Vector.sub({ x: penaltyBoxX, y: penaltyBoxY }, taker.pos);
        const passDir = Vector.normalize(passVec);
        state.ball.vel = Vector.mult(passDir, 20);
        state.ball.zVel = 10;
        state.ball.height = 0.1;
        addCommentary(state, 'CORNER', `${taker.name} whips a dangerous corner cross into the penalty box!`);
    }
    else if (activeSetPiece.type === 'THROW_IN') {
        // Throw in to nearest teammate
        const teammates = state.players.filter((p) => p.teamId === taker.teamId && p.playerId !== taker.playerId);
        teammates.sort((a, b) => Vector.distSq(a.pos, taker.pos) - Vector.distSq(b.pos, taker.pos));
        const target = teammates[0];
        if (target) {
            const throwVec = Vector.sub(target.pos, taker.pos);
            const throwDir = Vector.normalize(throwVec);
            state.ball.vel = Vector.mult(throwDir, 10);
            state.ball.height = 0.5;
            state.ball.zVel = 1;
            addCommentary(state, 'PASS', `${taker.name} throws it in to ${target.name}.`);
        }
        else {
            state.ball.vel = { x: targetDir * 10, y: 0 };
            state.ball.height = 0.5;
            state.ball.zVel = 1;
        }
    }
    else if (activeSetPiece.type === 'FREE_KICK') {
        const oppGoalCenter = taker.teamId === state.homeTeam.id ? GOAL_CENTER_RIGHT : GOAL_CENTER_LEFT;
        const dist = Vector.dist(taker.pos, oppGoalCenter);
        if (dist < 28) {
            // Direct shot on goal!
            kickAction = 'SHOT';
            executeShot(state, taker, oppGoalCenter, dist);
        }
        else {
            // Pass to teammate
            const teammates = state.players.filter((p) => p.teamId === taker.teamId && p.playerId !== taker.playerId);
            teammates.sort((a, b) => Vector.distSq(a.pos, taker.pos) - Vector.distSq(b.pos, taker.pos));
            const target = teammates.find((p) => p.position !== 'GK') || teammates[0];
            if (target) {
                const passVec = Vector.sub(target.pos, taker.pos);
                const passDir = Vector.normalize(passVec);
                state.ball.vel = Vector.mult(passDir, 14);
                state.ball.height = 0;
                state.ball.zVel = 0;
                addCommentary(state, 'PASS', `${taker.name} plays a short free kick to ${target.name}.`);
            }
            else {
                const passVec = Vector.sub(oppGoalCenter, taker.pos);
                const passDir = Vector.normalize(passVec);
                state.ball.vel = Vector.mult(passDir, 14);
                state.ball.height = 0;
                state.ball.zVel = 0;
                addCommentary(state, 'PASS', `${taker.name} kicks the free kick long downfield.`);
            }
        }
    }
    else if (activeSetPiece.type === 'PENALTY') {
        kickAction = 'SHOT';
        const oppGoalCenter = taker.teamId === state.homeTeam.id ? GOAL_CENTER_RIGHT : GOAL_CENTER_LEFT;
        executeShot(state, taker, oppGoalCenter, 11, true);
    }
    state.ball.lastTouchAction = kickAction;
    // Trigger statistic update
    if (kickAction === 'PASS' || kickAction === 'CLEARANCE') {
        if (taker.teamId === state.homeTeam.id) {
            state.stats.passesHome++;
        }
        else {
            state.stats.passesAway++;
        }
    }
}
function executeGKClearance(state, owner, attackingRight, isHome) {
    const ball = state.ball;
    ball.ownerId = null;
    const targetDir = attackingRight ? 1 : -1;
    const clearTargetX = owner.pos.x + targetDir * 55;
    const clearTargetY = 34 + (Math.random() - 0.5) * 35;
    const clearVec = Vector.sub({ x: clearTargetX, y: clearTargetY }, owner.pos);
    const clearDir = Vector.normalize(clearVec);
    ball.vel = Vector.mult(clearDir, 22);
    ball.zVel = 11;
    ball.height = 0.1;
    ball.lastTouchId = owner.playerId;
    ball.lastTouchTeamId = owner.teamId;
    ball.lastTouchAction = 'CLEARANCE';
    if (isHome) {
        state.stats.passesHome++;
    }
    else {
        state.stats.passesAway++;
    }
    addCommentary(state, 'PASS', `${owner.name} clears the ball long downfield.`);
}
/**
 * Handle Player Decisions (passing, shooting, dribbling, defending tackles/interceptions).
 */
function handlePlayerDecisions(state) {
    const ball = state.ball;
    if (ball.ownerId === null)
        return; // Loose ball, no decisions
    const owner = state.players.find((p) => p.playerId === ball.ownerId);
    if (!owner)
        return;
    const isHome = owner.teamId === state.homeTeam.id;
    const oppTeamId = isHome ? state.awayTeam.id : state.homeTeam.id;
    const oppGoalCenter = isHome ? GOAL_CENTER_RIGHT : GOAL_CENTER_LEFT;
    const attackingRight = isHome;
    if (owner.position !== 'GK') {
        if (owner.decisionCooldown === undefined) {
            owner.decisionCooldown = 0;
        }
        const distToGoal = Vector.dist(owner.pos, oppGoalCenter);
        const inRange = attackingRight ? owner.pos.x > (105 - 16.5) : owner.pos.x < 16.5;
        // Check if we should bypass the cooldown:
        // 1. Under pressure: opponent closer than 2.8m
        const opponents = state.players.filter((p) => p.teamId === oppTeamId);
        const nearbyOpponent = opponents.find((opp) => Vector.dist(opp.pos, owner.pos) < 2.8);
        const underPressure = !!nearbyOpponent;
        // 2. Open goal check (GK must be outside of the penalty box, i.e. > 16.5m)
        const gk = state.players.find((p) => p.teamId === oppTeamId && p.position === 'GK');
        const isOpenGoal = !gk || Vector.dist(gk.pos, oppGoalCenter) > 16.5;
        // We no longer bypass decision cooldowns just because a player is in the penalty box (inRange).
        // They will now continue their dribble constructively inside the box unless they are under immediate pressure.
        const mustDecide = underPressure || isOpenGoal;
        if (owner.decisionCooldown > 0 && !mustDecide) {
            owner.decisionCooldown--;
            // Move ball with player
            const toTarget = Vector.sub(owner.targetPos, owner.pos);
            const dir = Vector.mag(toTarget) > 0.1 ? Vector.normalize(toTarget) : { x: isHome ? 1 : -1, y: 0 };
            const offset = Vector.mult(dir, 0.4);
            ball.pos = Vector.add(owner.pos, offset);
            ball.vel = { x: 0, y: 0 };
            ball.height = 0;
            ball.zVel = 0;
            return;
        }
    }
    // GK special release logic
    if (owner.position === 'GK') {
        // Release delay: 10% chance per tick to take action (avg ~1 second delay), unless under immediate pressure
        const opponents = state.players.filter((p) => p.teamId === oppTeamId);
        const nearbyOpp = opponents.find((opp) => Vector.dist(opp.pos, owner.pos) < 3.5);
        if (!nearbyOpp && Math.random() > 0.10) {
            // GK holds ball, standing/moving back to goal mouth slightly
            const ownGoalCenter = isHome ? GOAL_CENTER_LEFT : GOAL_CENTER_RIGHT;
            owner.targetPos = { ...ownGoalCenter };
            ball.pos = { ...owner.pos };
            ball.vel = { x: 0, y: 0 };
            ball.height = 0;
            ball.zVel = 0;
            return;
        }
        // GK decision to pass vs clear long based on team quality and style
        const tactics = owner.teamId === state.homeTeam.id ? state.homeTeam.tactics : state.awayTeam.tactics;
        const style = tactics.style;
        const ownTeam = owner.teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
        const oppTeam = owner.teamId === state.homeTeam.id ? state.awayTeam : state.homeTeam;
        const eloProb = 1 / (1 + 10 ** ((oppTeam.eloRating - ownTeam.eloRating) / 400));
        let clearLongChance = 0.35; // base chance for strong/possession teams
        if (style !== 'Possession') {
            clearLongChance += 0.30;
        }
        clearLongChance += (1.0 - eloProb) * 0.30; // up to +30% for weaker teams
        clearLongChance = Math.min(0.92, Math.max(0.15, clearLongChance));
        const chooseClear = Math.random() < clearLongChance;
        if (chooseClear) {
            executeGKClearance(state, owner, attackingRight, isHome);
            return;
        }
        // Look for teammates within 35m
        const teammates = state.players.filter((p) => p.teamId === owner.teamId && p.playerId !== owner.playerId);
        const passingOptions = [];
        teammates.forEach((tm) => {
            const d = Vector.dist(tm.pos, owner.pos);
            if (d > 5 && d < 35) {
                // Passing line clearance check
                const passesOpponents = opponents.filter((opp) => {
                    const oppDistToLine = getDistanceToSegment(opp.pos, owner.pos, tm.pos);
                    return oppDistToLine < 3.0;
                });
                const safetyScore = 1.0 - (passesOpponents.length * 0.25);
                const progressScore = attackingRight ? (tm.pos.x - owner.pos.x) / 35 : (owner.pos.x - tm.pos.x) / 35;
                const score = (safetyScore + progressScore) * (tm.attributes.positioning / 100);
                if (score > 0.1) {
                    passingOptions.push({ player: tm, score });
                }
            }
        });
        if (passingOptions.length > 0) {
            passingOptions.sort((a, b) => b.score - a.score);
            const target = passingOptions[0].player;
            executePass(state, owner, target);
        }
        else {
            executeGKClearance(state, owner, attackingRight, isHome);
        }
        return;
    }
    // 1. Defending team tackles owner if they are close
    const opponents = state.players.filter((p) => p.teamId === oppTeamId);
    // Base tackle reach is 1.4m. Scale it by ELO difference so stronger defenders have better reach and timing!
    const defendingTeam = isHome ? state.awayTeam : state.homeTeam;
    const attackingTeam = isHome ? state.homeTeam : state.awayTeam;
    const defEloProb = 1 / (1 + 10 ** ((attackingTeam.eloRating - defendingTeam.eloRating) / 400));
    const tackleReach = 1.4 * (0.92 + defEloProb * 0.16); // Spain: ~1.5m; Cape Verde: ~1.3m (toned down ELO gap impact)
    const pressers = opponents.filter((p) => Vector.dist(p.pos, owner.pos) < tackleReach);
    if (pressers.length > 0) {
        const defender = pressers[0];
        // Check for a foul first
        const foulRoll = Math.random();
        const inAttackingHalf = attackingRight ? owner.pos.x > 52.5 : owner.pos.x < 52.5;
        const inAttackingThird = attackingRight ? owner.pos.x > 70.0 : owner.pos.x < 35.0;
        let foulThreshold = 0.0035 + (state.refereeStrictness * 0.0022) + (100 - defender.attributes.decisions) / 10000;
        if (inAttackingThird) {
            foulThreshold *= 1.8; // defenders take desperate risks near their own box
        }
        else if (inAttackingHalf) {
            foulThreshold *= 1.3;
        }
        if (foulRoll < foulThreshold) {
            // 95% chance defender fouls ball owner, 5% chance ball owner commits offensive foul
            if (Math.random() < 0.05) {
                executeFoul(state, owner, defender); // Attacking player commits offensive foul
            }
            else {
                executeFoul(state, defender, owner); // Defending player commits defensive foul
            }
            return;
        }
        // Deduct stamina for tackle challenge
        defender.staminaState = Math.max(5, defender.staminaState - 1.2);
        owner.staminaState = Math.max(5, owner.staminaState - 0.8);
        // Contact injury risk check on owner/dribbler during challenge
        const ownerInjuryChance = 0.0002 + (1.4 - (owner.attributes.strength / 100)) * 0.0002 + (100 - owner.staminaState) / 500000;
        if (Math.random() < ownerInjuryChance) {
            triggerInjury(state, owner, 'tackle');
            return;
        }
        // Probabilistic tackle event
        const tackleAttr = defender.attributes.strength * 0.4 + defender.attributes.workRate * 0.3 + defender.attributes.decisions * 0.3;
        const dribbleAttr = owner.attributes.dribbling * 0.5 + owner.attributes.composure * 0.3 + owner.attributes.agility * 0.2;
        // Scale by fatigue
        const defFatigue = 0.5 + 0.5 * (defender.staminaState / 100);
        const ownFatigue = 0.5 + 0.5 * (owner.staminaState / 100);
        // ELO relative strength difference factor for tackle/dribble challenges
        const attackingTeam = isHome ? state.homeTeam : state.awayTeam;
        const defendingTeam = isHome ? state.awayTeam : state.homeTeam;
        const eloProb = 1 / (1 + 10 ** ((defendingTeam.eloRating - attackingTeam.eloRating) / 400));
        // Toned down ELO scaling for tackle vs dribble challenges to make lower-ELO teams more competitive in duels
        const tackleScore = tackleAttr * defFatigue * Math.random() * (1.2 - eloProb * 0.3);
        const dribbleScore = dribbleAttr * ownFatigue * Math.random() * 1.2 * (0.85 + eloProb * 0.25);
        if (tackleScore > dribbleScore) {
            // Successful tackle!
            ball.ownerId = null; // ball is loose
            const isInterception = Math.random() > 0.4;
            if (isHome) {
                state.stats.tacklesAway++;
            }
            else {
                state.stats.tacklesHome++;
            }
            if (isInterception) {
                ball.ownerId = defender.playerId;
                defender.decisionCooldown = 0;
                ball.lastTouchId = defender.playerId;
                ball.lastTouchTeamId = defender.teamId;
                ball.lastTouchAction = 'INTERCEPTION';
                ball.vel = { x: 0, y: 0 };
                if (isHome)
                    state.stats.interceptionsAway++;
                else
                    state.stats.interceptionsHome++;
                addCommentary(state, 'INTERCEPTION', `Excellent interception by ${defender.name} to steal possession!`);
            }
            else {
                // Loose ball poked away
                let pokeDir;
                let pokeSpeed = 6;
                let pokeHeight = 0;
                let pokeZVel = 0;
                const isDefenderHome = defender.teamId === state.homeTeam.id;
                const isNearOwnGoalLine = isDefenderHome ? (defender.pos.x < 22) : (defender.pos.x > 83);
                const deflectToCorner = isNearOwnGoalLine && Math.random() < 0.25;
                if (deflectToCorner) {
                    ball.noControlTicks = 25;
                    const xDir = isDefenderHome ? -1 : 1;
                    const yDirSign = defender.pos.y < 34 ? -1 : 1;
                    const yDir = yDirSign * (0.6 + Math.random() * 0.6);
                    pokeDir = Vector.normalize({ x: xDir * 0.8, y: yDir });
                    pokeSpeed = 18; // fast so it's not easily intercepted
                    pokeHeight = 0.5;
                    pokeZVel = 2;
                    addCommentary(state, 'TACKLE', `Crucial block by ${defender.name}! The ball is deflected behind the goal line for a corner.`);
                }
                else {
                    ball.noControlTicks = 2;
                    pokeDir = Vector.normalize({ x: (Math.random() - 0.5), y: (Math.random() - 0.5) });
                    addCommentary(state, 'TACKLE', `Solid challenge from ${defender.name} dispossesses ${owner.name}.`);
                }
                ball.vel = Vector.mult(pokeDir, pokeSpeed);
                ball.height = pokeHeight;
                ball.zVel = pokeZVel;
                ball.lastTouchId = defender.playerId;
                ball.lastTouchTeamId = defender.teamId;
                ball.lastTouchAction = 'TACKLE';
            }
            return;
        }
    }
    // 2. Owner makes decisions (Shoot, Pass, Dribble)
    // Shot decision
    const distToGoal = Vector.dist(owner.pos, oppGoalCenter);
    const tactics = owner.teamId === state.homeTeam.id ? state.homeTeam.tactics : state.awayTeam.tactics;
    const style = tactics.style;
    const shooterTeamId = owner.teamId;
    const scoreDiff = shooterTeamId === state.homeTeam.id
        ? state.homeScore - state.awayScore
        : state.awayScore - state.homeScore;
    let maxShotDist = 29; // standard
    if (style === 'Direct Play' || style === 'Counter Attack') {
        maxShotDist = 31; // willing to shoot from further
    }
    else if (style === 'Possession') {
        maxShotDist = 26; // patient, wait until closer
    }
    // Apply mental ceiling/momentum shot distance limit
    if (scoreDiff >= 3) {
        if (scoreDiff === 3) {
            maxShotDist = 18; // only shoot inside the box
        }
        else if (scoreDiff === 4) {
            maxShotDist = 14; // only shoot close to goal
        }
        else {
            maxShotDist = 10; // walk the ball in only
        }
    }
    // Check for open goal situation
    const gk = state.players.find((p) => p.teamId === oppTeamId && p.position === 'GK');
    let isOpenGoal = false;
    if (!gk) {
        isOpenGoal = true;
    }
    else {
        const gkDistToGoal = Vector.dist(gk.pos, oppGoalCenter);
        // If the GK is out of position (e.g. rushed out for corners or clears > 16.5m away from goal center, i.e. out of the penalty box)
        if (gkDistToGoal > 16.5) {
            isOpenGoal = true;
        }
    }
    const inAttackingHalf = attackingRight ? owner.pos.x > 52.5 : owner.pos.x < 52.5;
    if (isOpenGoal && inAttackingHalf && distToGoal < 40) {
        addCommentary(state, 'SHOT', `OPEN GOAL! The goalkeeper is way out of position! ${owner.name} spots the empty net and shoots!`);
        executeShot(state, owner, oppGoalCenter, distToGoal);
        return;
    }
    // Check if the goal path is free (no defenders in a corridor between owner and goal center)
    const oppsInPath = opponents.filter((opp) => {
        if (opp.position === 'GK')
            return false;
        const oppDistToPath = getDistanceToSegment(opp.pos, owner.pos, oppGoalCenter);
        return oppDistToPath < 2.2; // corridor width of 2.2 meters
    });
    const isGoalPathFree = oppsInPath.length === 0;
    // If path is free, willing to shoot from slightly further out if needed
    if (isGoalPathFree && maxShotDist < 23) {
        maxShotDist = 23;
    }
    const inRange = attackingRight ? owner.pos.x > (105 - maxShotDist) : owner.pos.x < maxShotDist;
    if (inRange && distToGoal < maxShotDist) {
        // If the goal path is free and player is inside the box, shoot with high probability!
        if (isGoalPathFree && distToGoal < 18.0 && Math.random() < 0.28) {
            executeShot(state, owner, oppGoalCenter, distToGoal);
            return;
        }
        // If player is on a solo dribble run and enters the box, shoot immediately!
        if (owner.isSoloDribble && distToGoal < 16.5 && Math.random() < 0.90) {
            executeShot(state, owner, oppGoalCenter, distToGoal);
            return;
        }
        const angleToGoal = Math.abs(Math.atan2(oppGoalCenter.y - owner.pos.y, oppGoalCenter.x - owner.pos.x));
        const goodAngle = angleToGoal < Math.PI / 4.5; // within ~40 degrees of goal center
        const isGoodShooter = owner.attributes.finishing > 75 || owner.attributes.decisions > 75;
        const isHighPossibility = distToGoal < 13.0 && goodAngle && isGoodShooter;
        const shootingTeam = owner.teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
        const defendingTeam = owner.teamId === state.homeTeam.id ? state.awayTeam : state.homeTeam;
        const eloDiff = shootingTeam.eloRating - defendingTeam.eloRating;
        // ELO relative strength difference factor (ranges from ~0.2 to ~0.8)
        const eloProb = 1 / (1 + 10 ** ((defendingTeam.eloRating - shootingTeam.eloRating) / 400));
        // Base shot probability per tick: scaled down significantly for realistic match shot counts (~10-22 per team)
        const eloFactor = 0.6 + eloProb * 0.8;
        let shotChance = 0.0035 * eloFactor;
        // Adjust chance by play style
        if (style === 'Gegenpress') {
            shotChance *= 1.15; // high pressing/shooting volume
        }
        else if (style === 'Possession') {
            shotChance *= 0.95; // patient build-up, fewer shots
        }
        else if (style === 'Low Block') {
            shotChance *= 0.80; // defensive priority
        }
        // Scale by team tempo (higher tempo = quicker decisions to shoot)
        shotChance *= (0.7 + (tactics.tempo / 100) * 0.6);
        // Boost shot probability during active solo breakout runs OR high possibility chances OR when goal path is free
        if (owner.isSoloDribble) {
            shotChance *= 3.0;
        }
        else if (isHighPossibility) {
            shotChance *= 3.5; // massive shot chance boost for good players in prime position
        }
        else if (isGoalPathFree && distToGoal < 22.0) {
            shotChance *= 2.2; // boost when goal path is free
        }
        // Mental ceiling / momentum control: scale down shot chance if winning heavily
        if (scoreDiff >= 3) {
            if (scoreDiff === 3)
                shotChance *= 0.60; // 40% reduction
            else if (scoreDiff === 4)
                shotChance *= 0.30; // 70% reduction
            else
                shotChance *= 0.08; // 92% reduction (very patient, almost stops shooting unless golden chance)
        }
        if (Math.random() < shotChance) {
            const anglePenalty = Math.cos(angleToGoal); // better angle = higher multiplier
            const baseShotUtility = (maxShotDist + 2 - distToGoal) / (maxShotDist + 2) * anglePenalty;
            let decisionThreshold = 0.40;
            if (style === 'Possession') {
                decisionThreshold = 0.46; // higher composure required to shoot
            }
            else if (style === 'Direct Play') {
                decisionThreshold = 0.35; // shoot more readily
            }
            decisionThreshold -= (eloDiff / 1000) * 0.20;
            // Lower composure threshold during active solo breakout runs OR high possibility chances OR when goal path is free
            if (owner.isSoloDribble) {
                decisionThreshold *= 0.5;
            }
            else if (isHighPossibility) {
                decisionThreshold *= 0.45;
            }
            else if (isGoalPathFree && distToGoal < 22.0) {
                decisionThreshold *= 0.65;
            }
            if (Math.random() * (owner.attributes.decisions / 100) > (1 - baseShotUtility) * decisionThreshold) {
                // Shoot!
                executeShot(state, owner, oppGoalCenter, distToGoal);
                return;
            }
        }
    }
    // Pass vs Dribble decision
    const ownerTeam = owner.teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
    const isSpecialist = ownerTeam.passingSpecialist || style === 'Possession';
    // Find open teammates
    const teammates = state.players.filter((p) => p.teamId === owner.teamId && p.playerId !== owner.playerId);
    const passingOptions = [];
    let hasTriangleOption = false;
    teammates.forEach((tm) => {
        const d = Vector.dist(tm.pos, owner.pos);
        if (d > 5 && d < 35) {
            // Passing line clearance check
            const passesOpponents = opponents.filter((opp) => {
                // Distance from opponent to passing line
                const oppDistToLine = getDistanceToSegment(opp.pos, owner.pos, tm.pos);
                return oppDistToLine < 3.0; // Intercept threat zone
            });
            const safetyWeight = isSpecialist ? 1.4 : 1.0;
            const progressWeight = isSpecialist ? 0.35 : 1.0;
            const safetyScore = (1.0 - (passesOpponents.length * 0.25)) * safetyWeight;
            const progressScore = (attackingRight ? (tm.pos.x - owner.pos.x) / 35 : (owner.pos.x - tm.pos.x) / 35) * progressWeight; // forward progression
            let score = (safetyScore + progressScore) * (tm.attributes.positioning / 100);
            if (tm.position === 'GK') {
                score *= 0.20; // heavily penalize pass-backs to the GK
            }
            // Check if this pass option forms a triangle with another teammate (vertices roughly 5m to 22m apart)
            const formsTriangle = teammates.some((other) => {
                if (other.playerId === tm.playerId)
                    return false;
                if (other.position === 'GK')
                    return false; // GK doesn't count for passing triangles
                const distToOwner = Vector.dist(other.pos, owner.pos);
                const distToTarget = Vector.dist(other.pos, tm.pos);
                return distToOwner > 5 && distToOwner < 22 && distToTarget > 5 && distToTarget < 22;
            });
            if (formsTriangle && score > 0.2) {
                score *= 1.4; // 40% bonus for triangle passing options
                hasTriangleOption = true;
            }
            if (score > 0.2) {
                passingOptions.push({ player: tm, score });
            }
        }
    });
    // Roll decision based on pressure
    const opponentsList = state.players.filter((p) => p.teamId === oppTeamId);
    const nearbyOpponent = opponentsList.find((opp) => Vector.dist(opp.pos, owner.pos) < 3.5);
    const underPressure = !!nearbyOpponent;
    // Reduce pass chance for players with high dribbling attributes (making them more eager to dribble)
    let dribbleEagerness = 1.0;
    if (owner.attributes.dribbling > 75) {
        dribbleEagerness = 1.0 - (owner.attributes.dribbling - 75) / 50;
        dribbleEagerness = Math.max(0.25, dribbleEagerness);
    }
    // If player is on an active solo dribble, they almost never pass (only shoot or keep dribbling!)
    if (owner.isSoloDribble) {
        dribbleEagerness = 0.05;
    }
    let passChanceThreshold = (underPressure ? 0.45 : 0.08) * dribbleEagerness;
    if (isSpecialist) {
        passChanceThreshold = (underPressure ? 0.70 : 0.22) * (0.4 + dribbleEagerness * 0.6); // pass much more readily!
    }
    // If a triangle passing option is available, boost pass probability to encourage Tiki-Taka!
    if (hasTriangleOption) {
        passChanceThreshold *= 1.8;
    }
    if (passingOptions.length > 0 && Math.random() < passChanceThreshold) {
        // Pass
        owner.isSoloDribble = false;
        owner.soloDribbleTicks = 0;
        passingOptions.sort((a, b) => b.score - a.score);
        const target = passingOptions[0].player;
        executePass(state, owner, target);
    }
    else {
        // Dribble: player sets target position forward and runs
        owner.decisionCooldown = 6 + Math.floor(Math.random() * 5); // 0.6 to 1.0s of dribbling
        let isSolo = owner.isSoloDribble;
        // Roll for unforced dribbling heavy touch / mistake
        const heavyTouchChance = 0.0012 + (100 - owner.attributes.firstTouch) * 0.00004;
        if (Math.random() < heavyTouchChance && !isSolo) {
            // heavy touch mistake! Ball is poked forward and player loses control
            const goalDir = Vector.direction(owner.pos, oppGoalCenter);
            const errorDir = Vector.normalize({ x: goalDir.x + (Math.random() - 0.5) * 0.8, y: goalDir.y + (Math.random() - 0.5) * 0.8 });
            ball.ownerId = null;
            ball.noControlTicks = 3;
            ball.vel = Vector.mult(errorDir, 6);
            ball.height = 0;
            ball.zVel = 0;
            addCommentary(state, 'DRIBBLE', `Unforced error! ${owner.name} takes a heavy touch and spills possession!`);
            addCoachShout(state, owner.teamId, 'MISTAKE_SELF');
            return;
        }
        if (!isSolo && owner.attributes.dribbling > 75 && Math.random() < (owner.attributes.dribbling - 70) / 450) {
            owner.isSoloDribble = true;
            owner.soloDribbleTicks = 15 + Math.floor(Math.random() * 20); // 1.5 to 3.5s
            isSolo = true;
            const soloCommentaries = [
                `Spectacular solo run! ${owner.name} takes on the defense directly!`,
                `Sensational run! ${owner.name} breaks out of the formation and drives forward with the ball!`,
                `${owner.name} shows absolute class, weaving past challenges and ignoring passing lanes!`,
                `Creative spark! ${owner.name} goes on a solo dribbling drive deep into the opponent's territory!`
            ];
            addCommentary(state, 'DRIBBLE', soloCommentaries[Math.floor(Math.random() * soloCommentaries.length)]);
        }
        let runSpeed = 4;
        let wanderSpread = 0.7; // increased for more natural sideways sway
        if (isSolo) {
            runSpeed = 6.5; // faster drive
            wanderSpread = 0.35; // slightly wider solo runs too
            if (owner.soloDribbleTicks && owner.soloDribbleTicks > 0) {
                owner.soloDribbleTicks--;
                if (owner.soloDribbleTicks === 0) {
                    owner.isSoloDribble = false;
                    // Finish the breakout run with a final shot attempt if in range!
                    if (distToGoal < maxShotDist) {
                        addCommentary(state, 'SHOT', `${owner.name} finishes the solo breakout run with a powerful shot!`);
                        executeShot(state, owner, oppGoalCenter, distToGoal);
                        return;
                    }
                }
            }
        }
        const goalDir = Vector.direction(owner.pos, oppGoalCenter);
        let runDir = goalDir;
        // Check for nearby opponents directly in front of the runner (cone of ~50 degrees)
        const nearbyOpponents = opponents.filter((opp) => {
            const dist = Vector.dist(opp.pos, owner.pos);
            if (dist > 6.0)
                return false;
            const toOpp = Vector.direction(owner.pos, opp.pos);
            const dot = goalDir.x * toOpp.x + goalDir.y * toOpp.y;
            return dot > 0.6;
        });
        if (nearbyOpponents.length > 0) {
            // Opponent in front! Make a sideways cut to avoid them
            const nearestOpp = nearbyOpponents.sort((a, b) => Vector.distSq(a.pos, owner.pos) - Vector.distSq(b.pos, owner.pos))[0];
            const ortho1 = { x: -goalDir.y, y: goalDir.x };
            const ortho2 = { x: goalDir.y, y: -goalDir.x };
            const t1 = Vector.add(owner.pos, Vector.mult(ortho1, 3));
            const t2 = Vector.add(owner.pos, Vector.mult(ortho2, 3));
            const d1 = Vector.distSq(t1, nearestOpp.pos);
            const d2 = Vector.distSq(t2, nearestOpp.pos);
            const cutDir = d1 > d2 ? ortho1 : ortho2;
            // Blend 60% sideways cut with 40% forward progression
            runDir = Vector.normalize(Vector.add(Vector.mult(cutDir, 0.60), Vector.mult(goalDir, 0.40)));
            // Set a slightly smaller decision cooldown to react to the cut step sooner
            owner.decisionCooldown = 3 + Math.floor(Math.random() * 3);
        }
        else {
            // Normal wander: randomize slightly sideways with wider spread
            runDir = Vector.normalize({ x: goalDir.x, y: goalDir.y + (Math.random() - 0.5) * wanderSpread });
        }
        owner.targetPos = Vector.add(owner.pos, Vector.mult(runDir, runSpeed));
        // Move ball with player
        const offset = Vector.mult(runDir, 0.5);
        ball.pos = Vector.add(owner.pos, offset);
        ball.vel = { x: 0, y: 0 };
        ball.height = 0;
        ball.zVel = 0;
    }
}
function checkOffside(state, passer, receiver) {
    const isHome = passer.teamId === state.homeTeam.id;
    const oppTeamId = isHome ? state.awayTeam.id : state.homeTeam.id;
    // 1. Offside is only possible in the opponent's half
    if (isHome) {
        if (receiver.pos.x <= 52.5)
            return false;
    }
    else {
        if (receiver.pos.x >= 52.5)
            return false;
    }
    // 2. Receiver must be nearer to the goal line than the ball
    if (isHome) {
        if (receiver.pos.x <= state.ball.pos.x)
            return false;
    }
    else {
        if (receiver.pos.x >= state.ball.pos.x)
            return false;
    }
    // 3. Receiver must have fewer than 2 opponents closer to the goal line than themselves
    const opponents = state.players.filter((p) => p.teamId === oppTeamId);
    let opponentsCloser = 0;
    if (isHome) {
        opponentsCloser = opponents.filter((opp) => opp.pos.x >= receiver.pos.x).length;
    }
    else {
        opponentsCloser = opponents.filter((opp) => opp.pos.x <= receiver.pos.x).length;
    }
    if (opponentsCloser < 2) {
        return true;
    }
    return false;
}
function sendPlayerOff(state, player, reason) {
    const team = player.teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
    const teamPlayer = team.players.find(p => p.id === player.playerId);
    if (teamPlayer) {
        teamPlayer.redCarded = true;
    }
    const minute = Math.floor(state.elapsedSeconds / 60);
    const second = Math.floor(state.elapsedSeconds % 60);
    const evId = `${state.matchId}_ev_${state.totalTicks}`;
    state.events.push({
        id: evId,
        type: 'RED_CARD',
        minute,
        second,
        elapsedSeconds: state.elapsedSeconds,
        teamId: player.teamId,
        playerId: player.playerId,
        x: player.pos.x,
        y: player.pos.y,
        details: reason === 'double_yellow'
            ? `Red card (second yellow) shown to ${player.name}.`
            : `Direct red card shown to ${player.name} for a serious foul.`,
    });
    if (player.teamId === state.homeTeam.id) {
        state.stats.redCardsHome++;
    }
    else {
        state.stats.redCardsAway++;
    }
    addCommentary(state, 'RED_CARD', reason === 'double_yellow'
        ? `RED CARD! ${player.name} receives a second yellow card and is sent off!`
        : `RED CARD! A straight red card for ${player.name} after a dangerous challenge!`);
    // Remove from the active playing field
    state.players = state.players.filter(p => p.playerId !== player.playerId);
}
function showYellowCard(state, player) {
    const team = player.teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
    const teamPlayer = team.players.find(p => p.id === player.playerId);
    let yellowCount = 1;
    if (teamPlayer) {
        teamPlayer.yellowCards++;
        yellowCount = teamPlayer.yellowCards;
    }
    player.yellowCards = yellowCount;
    const minute = Math.floor(state.elapsedSeconds / 60);
    const second = Math.floor(state.elapsedSeconds % 60);
    const evId = `${state.matchId}_ev_${state.totalTicks}`;
    state.events.push({
        id: evId,
        type: 'YELLOW_CARD',
        minute,
        second,
        elapsedSeconds: state.elapsedSeconds,
        teamId: player.teamId,
        playerId: player.playerId,
        x: player.pos.x,
        y: player.pos.y,
        details: `Yellow card shown to ${player.name}.`,
    });
    if (player.teamId === state.homeTeam.id) {
        state.stats.yellowCardsHome++;
    }
    else {
        state.stats.yellowCardsAway++;
    }
    addCommentary(state, 'YELLOW_CARD', `Yellow card! The referee books ${player.name} for that challenge.`);
    if (yellowCount >= 2) {
        sendPlayerOff(state, player, 'double_yellow');
    }
}
function executeFoul(state, defender, victim) {
    defender.staminaState = Math.max(5, defender.staminaState - 1.5);
    victim.staminaState = Math.max(5, victim.staminaState - 1.2);
    // Injury risk check on foul victim
    const victimInjuryChance = 0.002 + (1.4 - (victim.attributes.strength / 100)) * 0.002 + (100 - victim.staminaState) / 100000;
    if (Math.random() < victimInjuryChance) {
        triggerInjury(state, victim, 'foul');
    }
    const minute = Math.floor(state.elapsedSeconds / 60);
    const second = Math.floor(state.elapsedSeconds % 60);
    const evId = `${state.matchId}_ev_${state.totalTicks}`;
    if (defender.teamId === state.homeTeam.id) {
        state.stats.foulsHome++;
    }
    else {
        state.stats.foulsAway++;
    }
    // Determine if it is an offensive foul (committed by the player holding or having last touched the ball)
    const isOffensive = state.ball.ownerId === defender.playerId || state.ball.lastTouchId === defender.playerId;
    state.events.push({
        id: evId,
        type: 'FOUL',
        minute,
        second,
        elapsedSeconds: state.elapsedSeconds,
        teamId: defender.teamId,
        playerId: defender.playerId,
        targetPlayerId: victim.playerId,
        x: victim.pos.x,
        y: victim.pos.y,
        details: isOffensive
            ? `Offensive foul by ${defender.name} on ${victim.name}.`
            : `Foul by ${defender.name} on ${victim.name}.`,
    });
    if (isOffensive) {
        addCommentary(state, 'FOUL', `Offensive foul! ${defender.name} pushes off ${victim.name} illegally.`);
    }
    else {
        addCommentary(state, 'FOUL', `Foul! ${defender.name} trips ${victim.name}.`);
    }
    // Card checks
    const yellowRoll = Math.random();
    const yellowThreshold = 0.08 + (state.refereeStrictness * 0.06) + (100 - defender.attributes.decisions) / 1000;
    const redRoll = Math.random();
    const redThreshold = 0.005 + (state.refereeStrictness * 0.006);
    if (redRoll < redThreshold) {
        sendPlayerOff(state, defender, 'direct');
    }
    else if (yellowRoll < yellowThreshold) {
        showYellowCard(state, defender);
    }
    // Check if foul is in the box (only if the defending team committed the foul in their own box)
    let inBox = false;
    if (!isOffensive) {
        inBox = defender.teamId === state.homeTeam.id
            ? (victim.pos.x <= 16.5 && victim.pos.y >= 13.85 && victim.pos.y <= 54.15)
            : (victim.pos.x >= 88.5 && victim.pos.y >= 13.85 && victim.pos.y <= 54.15);
    }
    state.ball.ownerId = null; // Ball is free
    state.ball.vel = { x: 0, y: 0 };
    state.ball.height = 0;
    state.ball.zVel = 0;
    if (inBox) {
        state.events.push({
            id: `${state.matchId}_ev_${state.totalTicks}_pen`,
            type: 'PENALTY',
            minute,
            second,
            elapsedSeconds: state.elapsedSeconds,
            teamId: victim.teamId,
            x: defender.teamId === state.homeTeam.id ? 11 : 94,
            y: 34,
            details: `Penalty kick awarded to ${victim.teamId === state.homeTeam.id ? state.homeTeam.name : state.awayTeam.name}!`,
        });
        addCommentary(state, 'PENALTY', `PENALTY KICK! The referee points to the spot! A massive opportunity here.`);
        state.pendingSetPiece = {
            type: 'PENALTY',
            takingTeamId: victim.teamId,
            ticksRemaining: 15,
        };
    }
    else {
        // Set ball position to foul spot
        state.ball.pos = { ...victim.pos };
        state.pendingSetPiece = {
            type: 'FREE_KICK',
            takingTeamId: victim.teamId,
            ticksRemaining: 12,
        };
    }
}
function triggerInjury(state, player, type) {
    const team = player.teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
    const teamPlayer = team.players.find(p => p.id === player.playerId);
    if (teamPlayer) {
        teamPlayer.injured = true;
        teamPlayer.staminaState = 5;
    }
    player.staminaState = 5; // force very low stamina / incapacitated
    const minute = Math.floor(state.elapsedSeconds / 60);
    const second = Math.floor(state.elapsedSeconds % 60);
    const evId = `${state.matchId}_ev_${state.totalTicks}_inj`;
    let details = `${player.name} is injured.`;
    let commText = `${player.name} goes down clutching his leg.`;
    if (type === 'fatigue') {
        details = `${player.name} pulls up holding his hamstring. Muscle injury!`;
        commText = `Oh, that looks like a hamstring pull! ${player.name} signals to the bench immediately.`;
    }
    else if (type === 'tackle') {
        details = `${player.name} is injured after a hard tackle.`;
        commText = `${player.name} is down on the turf after that heavy challenge. The physio is waving to the bench.`;
    }
    else if (type === 'foul') {
        details = `${player.name} is injured following a nasty foul.`;
        commText = `Nasty collision there. ${player.name} remains down and looks in considerable pain.`;
    }
    state.events.push({
        id: evId,
        type: 'INJURY',
        minute,
        second,
        elapsedSeconds: state.elapsedSeconds,
        teamId: player.teamId,
        playerId: player.playerId,
        x: player.pos.x,
        y: player.pos.y,
        details,
    });
    addCommentary(state, 'INJURY', commText);
    // Attempt immediate substitution
    performSubstitutionForPlayer(state, player, true);
}
function performSubstitutionForPlayer(state, oldPlayer, isInjury) {
    const team = oldPlayer.teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
    // Sync outgoing player's final state to roster
    const teamPlayer = team.players.find(p => p.id === oldPlayer.playerId);
    if (teamPlayer) {
        teamPlayer.staminaState = oldPlayer.staminaState;
        if (isInjury) {
            teamPlayer.injured = true;
        }
    }
    const subsMade = state.events.filter(e => e.type === 'SUBSTITUTION' && e.teamId === team.id).length;
    const minute = Math.floor(state.elapsedSeconds / 60);
    const second = Math.floor(state.elapsedSeconds % 60);
    if (subsMade >= 5) {
        if (isInjury) {
            state.players = state.players.filter(p => p.playerId !== oldPlayer.playerId);
            state.events.push({
                id: `${state.matchId}_ev_${state.totalTicks}_sub_fail`,
                type: 'INJURY',
                minute,
                second,
                elapsedSeconds: state.elapsedSeconds,
                teamId: oldPlayer.teamId,
                playerId: oldPlayer.playerId,
                x: oldPlayer.pos.x,
                y: oldPlayer.pos.y,
                details: `${oldPlayer.name} forced off. No substitutions remaining.`,
            });
            addCommentary(state, 'INJURY', `${oldPlayer.name} has to leave the pitch. With no substitutions left, ${team.name} will have to finish the match with 10 men!`);
        }
        return;
    }
    const activeIds = new Set(state.players.map(p => p.playerId));
    const bench = team.players.filter(p => !activeIds.has(p.id) && !p.injured && !p.redCarded);
    if (bench.length === 0) {
        if (isInjury) {
            state.players = state.players.filter(p => p.playerId !== oldPlayer.playerId);
            addCommentary(state, 'INJURY', `${oldPlayer.name} is forced off, but the bench is empty! ${team.name} down to 10 men.`);
        }
        return;
    }
    const scoreDiff = oldPlayer.teamId === state.homeTeam.id
        ? state.homeScore - state.awayScore
        : state.awayScore - state.homeScore;
    let chosenSub;
    if (isInjury) {
        const samePos = bench.filter(p => p.position === oldPlayer.position);
        if (samePos.length > 0) {
            samePos.sort((a, b) => {
                const rating = (p) => p.attributes.passing + p.attributes.composure + p.attributes.decisions;
                return rating(b) - rating(a);
            });
            chosenSub = samePos[0];
        }
        else {
            bench.sort((a, b) => {
                const rating = (p) => p.attributes.passing + p.attributes.composure;
                return rating(b) - rating(a);
            });
            chosenSub = bench[0];
        }
    }
    else {
        if (scoreDiff < 0 && oldPlayer.position !== 'FW') {
            const forwards = bench.filter(p => p.position === 'FW' || p.position === 'MF');
            if (forwards.length > 0) {
                forwards.sort((a, b) => b.attributes.finishing - a.attributes.finishing);
                chosenSub = forwards[0];
            }
        }
        else if (scoreDiff > 0 && oldPlayer.position === 'FW') {
            const defenders = bench.filter(p => p.position === 'DF' || p.position === 'MF');
            if (defenders.length > 0) {
                defenders.sort((a, b) => b.attributes.strength - a.attributes.strength);
                chosenSub = defenders[0];
            }
        }
        if (!chosenSub) {
            const samePos = bench.filter(p => p.position === oldPlayer.position);
            if (samePos.length > 0) {
                samePos.sort((a, b) => {
                    const rating = (p) => p.attributes.passing + p.attributes.composure;
                    return rating(b) - rating(a);
                });
                chosenSub = samePos[0];
            }
        }
        if (!chosenSub) {
            chosenSub = bench[0];
        }
    }
    if (chosenSub) {
        state.players = state.players.filter(p => p.playerId !== oldPlayer.playerId);
        state.players.push({
            playerId: chosenSub.id,
            teamId: oldPlayer.teamId,
            name: chosenSub.name,
            position: chosenSub.position,
            role: oldPlayer.role,
            pos: { ...oldPlayer.pos },
            vel: { x: 0, y: 0 },
            targetPos: { ...oldPlayer.targetPos },
            number: chosenSub.number,
            attributes: chosenSub.attributes,
            staminaState: 100,
            color: oldPlayer.color,
            roleCoordsDefault: { ...oldPlayer.roleCoordsDefault },
            roleCoordsAttacking: { ...oldPlayer.roleCoordsAttacking },
            yellowCards: 0,
            redCarded: false,
        });
        state.events.push({
            id: `${state.matchId}_ev_${state.totalTicks}_sub`,
            type: 'SUBSTITUTION',
            minute,
            second,
            elapsedSeconds: state.elapsedSeconds,
            teamId: oldPlayer.teamId,
            playerId: oldPlayer.playerId,
            targetPlayerId: chosenSub.id,
            x: oldPlayer.pos.x,
            y: oldPlayer.pos.y,
            details: isInjury
                ? `Substitution: ${chosenSub.name} replaces injured ${oldPlayer.name} (${oldPlayer.role}).`
                : `Substitution: ${chosenSub.name} replaces ${oldPlayer.name} (${oldPlayer.role}).`,
        });
        addCommentary(state, 'SUBSTITUTION', isInjury
            ? `${oldPlayer.name} is forced off with an injury. ${chosenSub.name} comes on to take his place.`
            : `Substitution for ${team.name}: ${chosenSub.name} replaces ${oldPlayer.name} to bring some fresh legs.`);
    }
}
function checkSubstitutions(state) {
    const minute = Math.floor(state.elapsedSeconds / 60);
    if (minute < 55)
        return;
    checkTeamSubs(state, state.homeTeam.id);
    checkTeamSubs(state, state.awayTeam.id);
}
function checkTeamSubs(state, teamId) {
    const team = teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
    const subsMade = state.events.filter(e => e.type === 'SUBSTITUTION' && e.teamId === team.id).length;
    if (subsMade >= 5)
        return;
    const activePlayers = state.players.filter(p => p.teamId === teamId);
    const tiredPlayers = [...activePlayers].sort((a, b) => a.staminaState - b.staminaState);
    const candidate = tiredPlayers[0];
    if (candidate && candidate.staminaState < 45 && candidate.position !== 'GK') {
        performSubstitutionForPlayer(state, candidate, false);
        return;
    }
    const minute = Math.floor(state.elapsedSeconds / 60);
    if (minute >= 65 && Math.random() < 0.08) {
        const scoreDiff = teamId === state.homeTeam.id
            ? state.homeScore - state.awayScore
            : state.awayScore - state.homeScore;
        if (scoreDiff < 0) {
            const defensivePlayer = activePlayers.find(p => p.position === 'DF' || p.position === 'MF');
            if (defensivePlayer) {
                performSubstitutionForPlayer(state, defensivePlayer, false);
            }
        }
        else if (scoreDiff > 0) {
            const forwardPlayer = activePlayers.find(p => p.position === 'FW');
            if (forwardPlayer) {
                performSubstitutionForPlayer(state, forwardPlayer, false);
            }
        }
    }
}
/**
 * Execute a pass to a teammate.
 */
function executePass(state, passer, receiver) {
    if (checkOffside(state, passer, receiver)) {
        const minute = Math.floor(state.elapsedSeconds / 60);
        const second = Math.floor(state.elapsedSeconds % 60);
        const evId = `${state.matchId}_ev_${state.totalTicks}`;
        state.events.push({
            id: evId,
            type: 'OFFSIDE',
            minute,
            second,
            elapsedSeconds: state.elapsedSeconds,
            teamId: passer.teamId,
            playerId: receiver.playerId,
            x: receiver.pos.x,
            y: receiver.pos.y,
            details: `Offside flag raised against ${receiver.name}.`,
        });
        addCommentary(state, 'OFFSIDE', `Whistle blows! The linesman raises the flag. ${receiver.name} was caught in an offside position.`);
        const oppTeamId = passer.teamId === state.homeTeam.id ? state.awayTeam.id : state.homeTeam.id;
        state.ball.pos = { ...receiver.pos };
        state.pendingSetPiece = {
            type: 'FREE_KICK',
            takingTeamId: oppTeamId,
            ticksRemaining: 12,
        };
        return;
    }
    const ball = state.ball;
    ball.ownerId = null; // ball is free in flight
    const passVec = Vector.sub(receiver.pos, passer.pos);
    const dist = Vector.mag(passVec);
    const dir = Vector.normalize(passVec);
    const passingAttr = passer.attributes.passing * 0.6 + passer.attributes.vision * 0.4;
    const isThroughBall = dist > 20 && receiver.pos.x * (passer.teamId === state.homeTeam.id ? 1 : -1) > passer.pos.x * (passer.teamId === state.homeTeam.id ? 1 : -1);
    const passingTeam = passer.teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
    const oppTeam = passer.teamId === state.homeTeam.id ? state.awayTeam : state.homeTeam;
    const eloProb = 1 / (1 + 10 ** ((oppTeam.eloRating - passingTeam.eloRating) / 400));
    // Roll for pass blunder/unforced mistake (higher chance for weaker players)
    let blunderChance = (0.008 + (100 - passingAttr) * 0.0003) * 0.6;
    if (passingTeam.tactics.style === 'Possession') {
        blunderChance *= 0.6;
    }
    if (passingTeam.passingSpecialist) {
        blunderChance *= 0.5; // additional blunder rate reduction for passing specialists
    }
    if (Math.random() < blunderChance) {
        // Blunder! Pass goes wildly astray or directly to a nearby opponent
        const opponents = state.players.filter((p) => p.teamId === oppTeam.id);
        const nearbyOpp = opponents.find((opp) => Vector.dist(opp.pos, passer.pos) < 18.0);
        if (nearbyOpp && Math.random() > 0.45) {
            // Pass it directly to the opponent!
            const errorVec = Vector.sub(nearbyOpp.pos, passer.pos);
            const errorDir = Vector.normalize(errorVec);
            ball.vel = Vector.mult(errorDir, 10);
            ball.height = 0;
            ball.zVel = 0;
            addCommentary(state, 'PASS', `Oh no! A terrible blunder by ${passer.name}, passing it straight to ${nearbyOpp.name}!`);
            addCoachShout(state, passer.teamId, 'MISTAKE_SELF');
            addCoachShout(state, nearbyOpp.teamId, 'MISTAKE_OPPONENT');
        }
        else {
            // Kick it wildly out of bounds
            const wildDir = Vector.normalize({ x: (Math.random() - 0.5), y: (Math.random() - 0.5) * 1.5 });
            ball.vel = Vector.mult(wildDir, 16);
            ball.height = 0.5;
            ball.zVel = 2;
            addCommentary(state, 'PASS', `Unforced error! ${passer.name} completely misplaces the pass, kicking it straight out of play.`);
            addCoachShout(state, passer.teamId, 'MISTAKE_SELF');
        }
        ball.lastTouchId = passer.playerId;
        ball.lastTouchTeamId = passer.teamId;
        ball.lastTouchAction = 'PASS';
        return;
    }
    // Base error scales up for weaker players
    const baseError = Math.max(0.05, (1.25 - passingAttr / 70));
    const eloErrorFactor = 1.5 - eloProb * 0.8; // Toned down ELO pass error gap
    // Pressure factor (opponents nearby)
    let pressureFactor = 1.0;
    const opponents = state.players.filter((p) => p.teamId === oppTeam.id);
    const pressers = opponents.filter((p) => Vector.dist(p.pos, passer.pos) < 5.0);
    if (pressers.length > 0) {
        pressureFactor = 1.0 + pressers.length * 0.25 * (1.2 - eloProb * 0.4); // Toned down ELO pressure penalty
    }
    // Roll pass error based on player skill, distance, ELO rating, and pressure
    let errorScale = baseError * (dist / 22) * eloErrorFactor * pressureFactor;
    if (passingTeam.tactics.style === 'Possession') {
        errorScale *= 0.75;
    }
    if (passingTeam.passingSpecialist) {
        errorScale *= 0.82; // additional error scale reduction for passing specialists
    }
    const randomOffset = {
        x: (Math.random() - 0.5) * errorScale * 6,
        y: (Math.random() - 0.5) * errorScale * 6,
    };
    const targetCoords = Vector.add(receiver.pos, randomOffset);
    const finalPassVec = Vector.sub(targetCoords, passer.pos);
    const finalDir = Vector.normalize(finalPassVec);
    // Speed and loft
    let passSpeed = 12 + (dist * 0.25);
    let zVel = 0;
    let height = 0;
    if (dist > 22 && Math.random() > 0.4) {
        // Lofted aerial pass/cross
        zVel = dist * 0.23;
        height = 0.1;
        passSpeed = 14 + (dist * 0.1);
    }
    ball.vel = Vector.mult(finalDir, passSpeed);
    ball.zVel = zVel;
    ball.height = height;
    ball.lastTouchId = passer.playerId;
    ball.lastTouchTeamId = passer.teamId;
    ball.lastTouchAction = isThroughBall ? 'THROUGH_BALL' : 'PASS';
    if (passer.teamId === state.homeTeam.id) {
        state.stats.passesHome++;
        if (Vector.dist(receiver.pos, targetCoords) < 3.0)
            state.stats.passesCompletedHome++;
    }
    else {
        state.stats.passesAway++;
        if (Vector.dist(receiver.pos, targetCoords) < 3.0)
            state.stats.passesCompletedAway++;
    }
    const passType = isThroughBall ? 'THROUGH_BALL' : 'PASS';
    const teammates = state.players.filter((p) => p.teamId === passer.teamId && p.playerId !== passer.playerId);
    const formsTriangle = teammates.some((other) => {
        if (other.playerId === receiver.playerId)
            return false;
        if (other.position === 'GK')
            return false;
        const distToOwner = Vector.dist(other.pos, passer.pos);
        const distToTarget = Vector.dist(other.pos, receiver.pos);
        return distToOwner > 5 && distToOwner < 22 && distToTarget > 5 && distToTarget < 22;
    });
    let commText = isThroughBall
        ? `${passer.name} slides a beautiful through ball looking for ${receiver.name}.`
        : `${passer.name} passes the ball wide to ${receiver.name}.`;
    if (!isThroughBall && formsTriangle && Math.random() < 0.22) {
        const teamName = passingTeam.name;
        const triangleComments = [
            `Quick triangle play! ${passer.name} and ${receiver.name} exchange sharp passes.`,
            `Beautiful Tiki-Taka sequence! ${teamName} works a neat passing triangle in midfield.`,
            `${passer.name} plays it quick, maintaining the triangle flow with ${receiver.name}.`
        ];
        commText = triangleComments[Math.floor(Math.random() * triangleComments.length)];
    }
    addCommentary(state, passType, commText);
    passer.staminaState = Math.max(5, passer.staminaState - 0.4);
}
/**
 * Execute a shot towards the goal.
 */
function executeShot(state, shooter, goalCenter, dist, isPenalty = false) {
    const ball = state.ball;
    ball.ownerId = null;
    const isHome = shooter.teamId === state.homeTeam.id;
    if (isHome)
        state.stats.shotsHome++;
    else
        state.stats.shotsAway++;
    const shootingTeam = isHome ? state.homeTeam : state.awayTeam;
    const defendingTeam = isHome ? state.awayTeam : state.homeTeam;
    // 1. Calculate xG (Expected Goals)
    let xG = 0.05;
    if (isPenalty) {
        xG = 0.76 * (0.8 + 0.2 * (shooter.attributes.finishing / 100));
    }
    else {
        const angleToGoal = Math.abs(Math.atan2(goalCenter.y - shooter.pos.y, goalCenter.x - shooter.pos.x));
        const angleFactor = Math.cos(angleToGoal);
        // Base xG formula based on distance and angle (slightly boosted base coefficient)
        const baseXG = Math.max(0.01, 0.85 * Math.exp(-0.08 * dist) * angleFactor);
        const finishingBonus = shooter.attributes.finishing / 100;
        xG = Math.min(0.99, baseXG * (0.4 + finishingBonus * 1.2)); // increase finishing weight
    }
    // Factor in country scoring averages, relative ELO strength, and luck
    const eloDiff = shootingTeam.eloRating - defendingTeam.eloRating;
    const eloFinishFactor = 1.0 + (eloDiff / 1000) * 0.30; // +/- 30% finishing quality based on ELO gap (toned down)
    const countryFactor = (shootingTeam.xgAverage / 1.5) * (defendingTeam.xgaAverage / 1.5);
    const luckFactor = 0.85 + Math.random() * 0.3; // +/- 15% luck
    xG = Math.min(0.99, Math.max(0.01, xG * countryFactor * eloFinishFactor * luckFactor));
    if (isHome)
        state.stats.xgHome += xG;
    else
        state.stats.xgAway += xG;
    // 2. Roll for shot target placement inside goalmouth
    const targetY = GOAL_Y_TOP + 0.5 + Math.random() * (GOAL_Y_BOTTOM - GOAL_Y_TOP - 1.0);
    const targetHeight = Math.random() * (GOAL_HEIGHT - 0.2);
    // Check if shot is off target
    let isOffTarget = false;
    if (isPenalty) {
        isOffTarget = Math.random() < 0.04; // 4% penalty misses
    }
    else {
        // More realistic probability model for off-target shots (increased baseOffTargetChance to bring on-target rates down to ~35-50%)
        const baseOffTargetChance = 0.62;
        const distancePenalty = (dist - 11) * 0.012;
        const skillBonus = (shooter.attributes.finishing / 100) * 0.24 +
            (shooter.attributes.composure / 100) * 0.14 +
            (shootingTeam.xgAverage / 1.5 - 1.0) * 0.10 +
            (eloDiff / 1000) * 0.15; // ELO difference affects accuracy (toned down)
        const offTargetChance = Math.min(0.80, Math.max(0.10, baseOffTargetChance + distancePenalty - skillBonus));
        isOffTarget = Math.random() < offTargetChance;
    }
    let finalTargetY = targetY;
    let finalTargetHeight = targetHeight;
    let detailsText = 'shot';
    if (isOffTarget) {
        // Guarantee that the shot is physically off target (outside goal boundaries)
        const missOver = Math.random() < 0.3; // 30% chance to shoot over the crossbar
        if (missOver) {
            finalTargetHeight = GOAL_HEIGHT + 0.2 + Math.random() * 2.0;
            finalTargetY = GOAL_Y_TOP - 1.0 + Math.random() * (GOAL_Y_BOTTOM - GOAL_Y_TOP + 2.0);
        }
        else {
            const missLeft = Math.random() < 0.5;
            if (missLeft) {
                finalTargetY = GOAL_Y_TOP - 0.5 - Math.random() * 4.0;
            }
            else {
                finalTargetY = GOAL_Y_BOTTOM + 0.5 + Math.random() * 4.0;
            }
            finalTargetHeight = Math.random() * GOAL_HEIGHT;
        }
        detailsText = 'Shot misses target.';
    }
    else {
        if (isHome)
            state.stats.shotsOnTargetHome++;
        else
            state.stats.shotsOnTargetAway++;
        detailsText = 'Shot is on target!';
    }
    // 3. Set ball velocities
    const targetPos = { x: goalCenter.x, y: finalTargetY };
    const shotVec = Vector.sub(targetPos, shooter.pos);
    const dir = Vector.normalize(shotVec);
    const shotSpeed = 22 + (shooter.attributes.strength * 0.1);
    ball.vel = Vector.mult(dir, shotSpeed);
    const flightTime = dist / shotSpeed;
    ball.zVel = (finalTargetHeight + 0.5 * 9.81 * flightTime * flightTime) / flightTime;
    ball.height = 0.1;
    ball.lastTouchId = shooter.playerId;
    ball.lastTouchTeamId = shooter.teamId;
    ball.lastTouchAction = 'SHOT';
    const evId = `${state.matchId}_ev_${state.totalTicks}`;
    state.events.push({
        id: evId,
        type: 'SHOT',
        minute: Math.floor(state.elapsedSeconds / 60),
        second: Math.floor(state.elapsedSeconds % 60),
        elapsedSeconds: state.elapsedSeconds,
        teamId: shooter.teamId,
        playerId: shooter.playerId,
        x: shooter.pos.x,
        y: shooter.pos.y,
        xg: parseFloat(xG.toFixed(3)),
        details: isPenalty
            ? `Penalty kick by ${shooter.name}!`
            : `${shooter.name} shoots from ${Math.round(dist)} meters! (xG: ${xG.toFixed(2)})`,
    });
    if (isPenalty) {
        addCommentary(state, 'SHOT', `${shooter.name} runs up and takes the penalty!`);
    }
    else {
        addCommentary(state, 'SHOT', `${shooter.name} takes a shot from distance! It flies towards the goal...`);
    }
    // 3.5 Defender Block Check (outfield players blocking the shot path)
    const oppTeamId = isHome ? state.awayTeam.id : state.homeTeam.id;
    const oppTeam = isHome ? state.awayTeam : state.homeTeam;
    const shooterTeam = isHome ? state.homeTeam : state.awayTeam;
    // Find outfield defenders close to the shooter (within 4.0 meters)
    const nearbyOpponents = state.players.filter((p) => p.teamId === oppTeamId && p.position !== 'GK' && Vector.dist(p.pos, shooter.pos) < 4.0);
    let isBlocked = false;
    let blockingDefender = null;
    for (const opp of nearbyOpponents) {
        const blockAttr = opp.attributes.positioning * 0.4 + opp.attributes.agility * 0.3 + opp.attributes.strength * 0.3;
        const eloProb = 1 / (1 + 10 ** ((shooterTeam.eloRating - oppTeam.eloRating) / 400));
        // Base block chance: up to 12% per nearby defender, scaled by relative ELO
        let blockChance = (blockAttr / 100) * 0.12 * (0.5 + eloProb * 1.0);
        if (Math.random() < blockChance) {
            isBlocked = true;
            blockingDefender = opp;
            break;
        }
    }
    if (isBlocked && blockingDefender) {
        // Shot is blocked by a defender!
        const defName = blockingDefender.name;
        const tipOutOfBounds = Math.random() < 0.35;
        // Set last touch
        ball.lastTouchId = blockingDefender.playerId;
        ball.lastTouchTeamId = oppTeamId;
        ball.lastTouchAction = 'TACKLE';
        ball.pos = { ...blockingDefender.pos };
        if (tipOutOfBounds) {
            ball.noControlTicks = 20;
            const xDir = oppTeamId === 'AWAY' ? 1 : -1;
            const yDirSign = blockingDefender.pos.y < 34 ? -1 : 1;
            const yDir = yDirSign * (0.5 + Math.random() * 0.7);
            const deflectDir = Vector.normalize({ x: xDir * 0.7, y: yDir });
            ball.vel = Vector.mult(deflectDir, 16);
            ball.height = 0.5;
            ball.zVel = 2;
            addCommentary(state, 'TACKLE', `Blocked! ${defName} throws their body in the way, deflecting the shot behind for a corner!`);
        }
        else {
            // Deflected back into the pitch
            ball.noControlTicks = 3;
            const deflectDir = Vector.normalize({ x: (Math.random() - 0.5), y: (Math.random() - 0.5) });
            ball.vel = Vector.mult(deflectDir, 7);
            ball.height = 0.3;
            ball.zVel = 1;
            addCommentary(state, 'TACKLE', `Crucial block! ${defName} blocks the shot, and the ball remains loose in the area!`);
        }
        shooter.staminaState = Math.max(5, shooter.staminaState - 0.8);
        return;
    }
    // 4. Goalkeeper Save check (if on target) - Deferred for physical flight
    if (!isOffTarget) {
        const oppTeamId = isHome ? state.awayTeam.id : state.homeTeam.id;
        const gk = state.players.find((p) => p.teamId === oppTeamId && p.position === 'GK');
        if (gk) {
            gk.staminaState = Math.max(5, gk.staminaState - 1.2);
            const gkDist = Vector.dist(gk.pos, targetPos);
            const gkSaveAttr = gk.attributes.gkReflexes * 0.5 + gk.attributes.gkPositioning * 0.3 + gk.attributes.gkHandling * 0.2;
            const gkSaveSkill = gkSaveAttr * (0.5 + 0.5 * (gk.staminaState / 100));
            let saveChance = 0.5;
            if (isPenalty) {
                saveChance = 0.18 + (gk.attributes.gkReflexes / 100) * 0.1 - (shooter.attributes.composure / 100) * 0.08;
            }
            else {
                // Base save chance is balanced to compensate for GK's improved positioning
                saveChance = (gkSaveSkill / 100) * (1.12 - xG * 0.75);
                // Positioning bonus: up to 12% boost if GK is close to the shot line
                const distToShotLine = getDistanceToSegment(gk.pos, shooter.pos, targetPos);
                let positioningBonus = 1.0;
                if (distToShotLine < 2.5) {
                    positioningBonus = 1.0 + (1.0 - distToShotLine / 2.5) * 0.12 * (gk.attributes.gkPositioning / 100);
                }
                saveChance *= positioningBonus;
            }
            // Scale save chance by ELO difference and luck
            const eloDiff = shootingTeam.eloRating - defendingTeam.eloRating;
            const eloSaveModifier = 1.0 - (eloDiff / 1000) * 0.15; // Spain shooting -> Cape Verde GK save chance reduced by ~6% (toned down)
            const gkLuck = 0.85 + Math.random() * 0.3; // GK luck factor (+/- 15%)
            saveChance = Math.min(0.95, Math.max(0.10, saveChance * eloSaveModifier * gkLuck));
            if (Math.random() < saveChance) {
                // Defer save execution until the ball physically arrives at the goal mouth
                const flightTicks = Math.max(1, Math.round(flightTime * 10));
                const holdsBall = Math.random() > 0.45;
                const tipOutOfBounds = Math.random() < 0.40;
                state.activeShot = {
                    shooterId: shooter.playerId,
                    gkId: gk.playerId,
                    isSaved: true,
                    holdsBall,
                    tipOutOfBounds,
                    overBar: Math.random() > 0.5,
                    ticksToTarget: flightTicks,
                };
            }
        }
    }
    shooter.staminaState = Math.max(5, shooter.staminaState - 0.8);
}
/**
 * Calculates a realistic target coordinate for a player during set piece setups.
 */
export function getSetPieceTargetPosition(state, p, activeSetPiece) {
    const ball = state.ball;
    const isHomeAttacking = activeSetPiece.takingTeamId === state.homeTeam.id;
    const attackingTeamId = activeSetPiece.takingTeamId;
    const isMyTeamAttacking = p.teamId === attackingTeamId;
    // 1. Taker is always at the ball
    if (p.playerId === activeSetPiece.takerId) {
        return { ...ball.pos };
    }
    // 2. GK of defending team stays in goalmouth
    if (p.position === 'GK') {
        if (!isMyTeamAttacking) {
            return p.teamId === state.homeTeam.id ? { x: 1.0, y: 34 } : { x: 104.0, y: 34 };
        }
        else {
            return p.teamId === state.homeTeam.id ? { x: 12.0, y: 34 } : { x: 93.0, y: 34 };
        }
    }
    const oppGoalX = isHomeAttacking ? 105 : 0;
    if (activeSetPiece.type === 'CORNER') {
        if (isMyTeamAttacking) {
            // Attacking team setup: crowd the box
            const attackers = state.players.filter(pl => pl.teamId === attackingTeamId && pl.playerId !== activeSetPiece.takerId && pl.position !== 'GK');
            const idx = attackers.findIndex(pl => pl.playerId === p.playerId);
            if (idx >= 0 && idx < 5) {
                // Core box presence (crowding near post/far post/center)
                const offsetPositions = [
                    { dx: 0, dy: -4 },
                    { dx: 2, dy: 4 },
                    { dx: -2, dy: 0 },
                    { dx: 4, dy: -2 },
                    { dx: 1, dy: 3 }
                ];
                const offset = offsetPositions[idx];
                const sign = isHomeAttacking ? -1 : 1;
                const targetY = ball.pos.y < 34
                    ? 34 - 6 + (idx * 2)
                    : 34 + 6 - (idx * 2);
                return {
                    x: oppGoalX + sign * (6 + offset.dx),
                    y: targetY + offset.dy
                };
            }
            else if (idx >= 5 && idx < 7) {
                // Outside box edge to intercept clearances
                const sign = isHomeAttacking ? -1 : 1;
                return {
                    x: oppGoalX + sign * 18,
                    y: 34 + (idx === 5 ? -12 : 12)
                };
            }
            else {
                // Stay back at half way line as counter prevention
                const sign = isHomeAttacking ? -1 : 1;
                return {
                    x: 52.5 + sign * (idx === 7 ? -5 : -10),
                    y: 34 + (idx === 7 ? -15 : 15)
                };
            }
        }
        else {
            // Defending team setup: mark tight in the box
            const defenders = state.players.filter(pl => pl.teamId !== attackingTeamId && pl.position !== 'GK');
            const idx = defenders.findIndex(pl => pl.playerId === p.playerId);
            if (idx >= 0 && idx < 7) {
                const offsetPositions = [
                    { dx: 1, dy: -3 },
                    { dx: -1, dy: 3 },
                    { dx: 0, dy: 1 },
                    { dx: 3, dy: -2 },
                    { dx: -2, dy: -1 },
                    { dx: 2, dy: 4 },
                    { dx: 0, dy: -5 }
                ];
                const offset = offsetPositions[idx];
                const sign = isHomeAttacking ? -1 : 1;
                const targetY = ball.pos.y < 34
                    ? 34 - 5 + (idx * 1.8)
                    : 34 + 5 - (idx * 1.8);
                return {
                    x: oppGoalX + sign * (4 + offset.dx),
                    y: targetY + offset.dy
                };
            }
            else if (idx === 7) {
                // Defending near post
                const sign = isHomeAttacking ? -1 : 1;
                const postY = ball.pos.y < 34 ? 30 : 38;
                return { x: oppGoalX + sign * 1.5, y: postY };
            }
            else {
                // Counter outlet near halfway line
                const sign = isHomeAttacking ? -1 : 1;
                return { x: 52.5 + sign * 5, y: 34 + (idx === 8 ? -10 : 10) };
            }
        }
    }
    if (activeSetPiece.type === 'FREE_KICK') {
        const isAttackingFreeKick = isHomeAttacking ? (ball.pos.x > 70) : (ball.pos.x < 35);
        if (isAttackingFreeKick) {
            const goalCenter = { x: oppGoalX, y: 34 };
            const toGoal = Vector.sub(goalCenter, ball.pos);
            const distToGoal = Vector.mag(toGoal);
            const wallDist = 9.15; // 9.15m from ball
            const dirNormalized = Vector.div(toGoal, distToGoal);
            const wallCenter = Vector.add(ball.pos, Vector.mult(dirNormalized, wallDist));
            const perp = { x: -dirNormalized.y, y: dirNormalized.x };
            const defenders = state.players.filter(pl => pl.teamId !== attackingTeamId && pl.position !== 'GK');
            const idxInDef = defenders.findIndex(pl => pl.playerId === p.playerId);
            const wallSize = distToGoal < 25 ? 4 : (distToGoal < 32 ? 3 : 2);
            // Defending wall setup
            if (!isMyTeamAttacking && idxInDef >= 0 && idxInDef < wallSize) {
                const offsetFactor = idxInDef - (wallSize - 1) / 2;
                const spacing = 1.0;
                return {
                    x: wallCenter.x + perp.x * offsetFactor * spacing,
                    y: wallCenter.y + perp.y * offsetFactor * spacing
                };
            }
            // Defending players not in wall mark box
            if (!isMyTeamAttacking) {
                const idxBoxDef = idxInDef - wallSize;
                const sign = isHomeAttacking ? -1 : 1;
                return {
                    x: oppGoalX + sign * (6 + (idxBoxDef % 3) * 4),
                    y: 34 + ((idxBoxDef % 5) - 2) * 6
                };
            }
            // Attackers setup
            if (isMyTeamAttacking) {
                const attackers = state.players.filter(pl => pl.teamId === attackingTeamId && pl.playerId !== activeSetPiece.takerId && pl.position !== 'GK');
                const idxInAtt = attackers.findIndex(pl => pl.playerId === p.playerId);
                if (idxInAtt === 0) {
                    // Decoy taker
                    return { x: ball.pos.x + 1.2, y: ball.pos.y + (ball.pos.y < 34 ? 1 : -1) };
                }
                else if (idxInAtt > 0 && idxInAtt < 6) {
                    // In box waiting for cross/pass
                    const sign = isHomeAttacking ? -1 : 1;
                    return {
                        x: oppGoalX + sign * (8 + (idxInAtt % 3) * 3),
                        y: 34 + ((idxInAtt % 4) - 1.5) * 7
                    };
                }
                else {
                    // Stay back cover
                    const sign = isHomeAttacking ? -1 : 1;
                    return {
                        x: ball.pos.x + sign * -15 + (idxInAtt * 1.5),
                        y: 34 + (idxInAtt % 2 === 0 ? -12 : 12)
                    };
                }
            }
        }
    }
    if (activeSetPiece.type === 'THROW_IN') {
        const attackers = state.players.filter(pl => pl.teamId === attackingTeamId && pl.playerId !== activeSetPiece.takerId && pl.position !== 'GK');
        const defenders = state.players.filter(pl => pl.teamId !== attackingTeamId && pl.position !== 'GK');
        if (isMyTeamAttacking) {
            const idx = attackers.findIndex(pl => pl.playerId === p.playerId);
            if (idx >= 0 && idx < 3) {
                // Triangular support
                const angles = [0, Math.PI / 3, -Math.PI / 3];
                const dist = 7 + idx * 3;
                const angle = angles[idx] + (ball.pos.y < 34 ? Math.PI / 2 : -Math.PI / 2);
                return {
                    x: Math.max(5, Math.min(100, ball.pos.x + Math.cos(angle) * dist)),
                    y: Math.max(5, Math.min(63, ball.pos.y + Math.sin(angle) * dist))
                };
            }
        }
        else {
            const idx = defenders.findIndex(pl => pl.playerId === p.playerId);
            if (idx >= 0 && idx < 3) {
                // Mark the support players
                const targetAttacker = attackers[idx];
                if (targetAttacker) {
                    const sign = isHomeAttacking ? 1 : -1;
                    return {
                        x: targetAttacker.pos.x + sign * 1.5,
                        y: targetAttacker.pos.y + (Math.random() - 0.5) * 2
                    };
                }
            }
        }
    }
    if (activeSetPiece.type === 'PENALTY') {
        const sideSign = isHomeAttacking ? 1 : -1;
        const penBoxX = isHomeAttacking ? 88 : 17;
        const playersOuter = state.players.filter(pl => pl.playerId !== activeSetPiece.takerId && pl.position !== 'GK');
        const idx = playersOuter.findIndex(pl => pl.playerId === p.playerId);
        return {
            x: penBoxX - sideSign * (3 + (idx % 3) * 2),
            y: 10 + idx * 4.5
        };
    }
    // Fallback to default tactical coordinates
    return getTacticalTargetPosition(p.role, p.teamId === state.homeTeam.id ? state.homeTeam.tactics.formation : state.awayTeam.tactics.formation, p.teamId === state.homeTeam.id, ball.pos, p.teamId === state.homeTeam.id ? state.homeTeam.tactics : state.awayTeam.tactics, null, p.teamId);
}
/**
 * Handle Player Movement on the pitch.
 */
function updatePlayerMovement(state, forceDefensiveReset) {
    const ball = state.ball;
    const possessionTeamId = getPossessionTeamId(state);
    state.players.forEach((p) => {
        const isOwner = p.playerId === ball.ownerId;
        let isChasingBall = false;
        // Check if player is dispossessed / red-carded / out of commission
        // Calculate speed based on attributes and stamina
        const staminaFactor = 0.5 + 0.5 * (p.staminaState / 100);
        const oppTeam = p.teamId === state.homeTeam.id ? state.awayTeam : state.homeTeam;
        const myTeam = p.teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
        const eloProb = 1 / (1 + 10 ** ((oppTeam.eloRating - myTeam.eloRating) / 400));
        // Scale speed modifier based on relative ELO difference: +/- 3% max (toned down ELO gap)
        const speedMod = 0.97 + eloProb * 0.06;
        let maxSpeed = ((p.attributes.pace * 0.4 + p.attributes.acceleration * 0.6) / 100) * 8.5 * staminaFactor * speedMod; // Max 8.5 m/s * speedMod
        if (isOwner) {
            // Dribbling speed penalty: scale speed down based on dribbling attribute
            const dribbleSpeedPenalty = 0.65 + 0.20 * (p.attributes.dribbling / 100); // 85% speed for max dribble, 65% for min
            maxSpeed *= dribbleSpeedPenalty;
        }
        let target;
        if (isOwner) {
            // Dribbler target is already set in handlePlayerDecisions
            target = p.targetPos;
        }
        else if (forceDefensiveReset) {
            const activeSetPiece = state.activeSetPiece;
            if (activeSetPiece) {
                target = getSetPieceTargetPosition(state, p, activeSetPiece);
            }
            else {
                target = getTacticalTargetPosition(p.role, p.teamId === state.homeTeam.id ? state.homeTeam.tactics.formation : state.awayTeam.tactics.formation, p.teamId === state.homeTeam.id, { x: 52.5, y: 34 }, p.teamId === state.homeTeam.id ? state.homeTeam.tactics : state.awayTeam.tactics, null, p.teamId);
            }
        }
        else {
            // Normal movement behavior
            const isDefending = possessionTeamId !== p.teamId && possessionTeamId !== null;
            const distToBall = Vector.dist(p.pos, ball.pos);
            // If ball is loose and player is nearest teammate, hunt the ball
            const teammates = state.players.filter((tm) => tm.teamId === p.teamId);
            const isNearest = teammates.every((tm) => Vector.distSq(tm.pos, ball.pos) >= Vector.distSq(p.pos, ball.pos));
            // Scale defending pressure distance by pressing intensity and ELO difference
            const tactics = p.teamId === state.homeTeam.id ? state.homeTeam.tactics : state.awayTeam.tactics;
            const myTeam = p.teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
            const oppTeam = p.teamId === state.homeTeam.id ? state.awayTeam : state.homeTeam;
            const eloProb = 1 / (1 + 10 ** ((oppTeam.eloRating - myTeam.eloRating) / 400));
            let pressRange = 10 + (tactics.pressingIntensity / 100) * 12 + (eloProb - 0.5) * 5; // Toned down ELO pressing range adjustment
            if (tactics.style === 'Gegenpress') {
                pressRange += 6;
            }
            else if (tactics.style === 'Low Block') {
                pressRange -= 4;
            }
            pressRange = Math.max(5, Math.min(32, pressRange));
            if (isNearest && distToBall < 20 && ball.ownerId === null && ball.height < 1.8) {
                // Run straight to ball
                target = { ...ball.pos };
                isChasingBall = true;
            }
            else if (isDefending && distToBall < pressRange && p.position !== 'GK') {
                // Pressure the ball carrier
                target = { ...ball.pos };
                isChasingBall = true;
            }
            else {
                // Follow formation guidelines
                const tactics = p.teamId === state.homeTeam.id ? state.homeTeam.tactics : state.awayTeam.tactics;
                const formation = tactics.formation;
                const hasActiveSoloDribbler = state.players.some(pl => pl.teamId === p.teamId && pl.isSoloDribble);
                target = getTacticalTargetPosition(p.role, formation, p.teamId === state.homeTeam.id, ball.pos, tactics, possessionTeamId, p.teamId, hasActiveSoloDribbler);
                // Adjust target position based on ELO quality difference ONLY when following formation guidelines!
                if (possessionTeamId !== null && p.position !== 'GK') {
                    const myTeam = p.teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
                    const oppTeam = p.teamId === state.homeTeam.id ? state.awayTeam : state.homeTeam;
                    const eloDiff = myTeam.eloRating - oppTeam.eloRating;
                    const dir = p.teamId === state.homeTeam.id ? 1 : -1;
                    if (possessionTeamId === p.teamId) {
                        // Attacking: push extra forward if stronger, up to +4m (toned down)
                        const pushAdjust = Math.max(-3, Math.min(4, (eloDiff / 1000) * 5));
                        target.x += pushAdjust * dir;
                    }
                    else {
                        // Defending: drop extra back if weaker, up to -4m (toned down)
                        const dropAdjust = Math.max(-3, Math.min(4, (-eloDiff / 1000) * 4));
                        target.x -= dropAdjust * dir;
                    }
                }
            }
        }
        // Steering movement
        let isMoving = false;
        if (p.noMoveTicks && p.noMoveTicks > 0) {
            p.noMoveTicks--;
            p.vel = { x: 0, y: 0 };
            if (isOwner) {
                ball.pos = { ...p.pos };
            }
        }
        else {
            const toTarget = Vector.sub(target, p.pos);
            const dist = Vector.mag(toTarget);
            if (dist > 0.5) {
                isMoving = true;
                const dir = Vector.normalize(toTarget);
                // Run slower if close to target (arrival behavior) only if NOT chasing ball
                const speed = (dist < 2.0 && !isChasingBall) ? maxSpeed * (dist / 2.0) : maxSpeed;
                p.vel = Vector.lerp(p.vel, Vector.mult(dir, speed), 0.15);
                p.pos = Vector.add(p.pos, Vector.mult(p.vel, DT));
                // Update ball position if this player is the owner
                if (isOwner) {
                    const velMag = Vector.mag(p.vel);
                    const ballOffsetDir = velMag > 0.1 ? Vector.normalize(p.vel) : dir;
                    ball.pos = Vector.add(p.pos, Vector.mult(ballOffsetDir, 0.4));
                }
            }
        }
        if (!isMoving) {
            p.vel = { x: 0, y: 0 };
            if (isOwner) {
                ball.pos = { ...p.pos };
            }
        }
        // Deplete stamina based on work rate, running speed, tactics and overall player fitness
        const playerTactics = p.teamId === state.homeTeam.id ? state.homeTeam.tactics : state.awayTeam.tactics;
        const pressingFactor = 1.0 + (playerTactics.pressingIntensity / 100) * 0.25;
        const fitnessFactor = 1.4 - (p.attributes.stamina / 100);
        const runningStrain = Vector.mag(p.vel) / 8.5; // fraction of top speed
        let decay = (0.005 + (p.attributes.workRate / 100) * 0.005) * runningStrain * fitnessFactor * pressingFactor;
        // baseline standing fatigue
        decay += 0.001 * fitnessFactor * pressingFactor;
        p.staminaState = Math.max(5, p.staminaState - decay * DT * 2.0);
        // Baseline fatigue injury risk (realistic frequency)
        if (p.staminaState < 35 && Math.random() < 0.000005) {
            triggerInjury(state, p, 'fatigue');
        }
        // Prevent running outside pitch
        p.pos.x = Math.max(1, Math.min(PITCH_WIDTH - 1, p.pos.x));
        p.pos.y = Math.max(1, Math.min(PITCH_HEIGHT - 1, p.pos.y));
    });
}
// Geometric helper: distance from a point to a line segment
function getDistanceToSegment(p, a, b) {
    const ab = Vector.sub(b, a);
    const ap = Vector.sub(p, a);
    const ab2 = Vector.dot(ab, ab);
    if (ab2 === 0)
        return Vector.dist(p, a);
    let t = Vector.dot(ap, ab) / ab2;
    t = Math.max(0, Math.min(1, t)); // cap to segment bounds
    const closest = Vector.add(a, Vector.mult(ab, t));
    return Vector.dist(p, closest);
}
/**
 * Runs a high-fidelity statistical match simulation instantly.
 * Used for background/tournament stage simulation to return results immediately.
 */
export function simulateMatchInstant(state) {
    const homeTeam = state.homeTeam;
    const awayTeam = state.awayTeam;
    // 1. Calculate relative ELO probability
    const eloProb = 1 / (1 + 10 ** ((awayTeam.eloRating - homeTeam.eloRating) / 400));
    // 2. Determine base xG for both teams (scaled to average ~1.35 per team)
    let homeXG = 1.35 * Math.pow(eloProb / 0.5, 1.2);
    let awayXG = 1.35 * Math.pow((1 - eloProb) / 0.5, 1.2);
    // 3. Apply country stats
    const homeCountryFactor = (homeTeam.xgAverage / 1.5) * (awayTeam.xgaAverage / 1.5);
    const awayCountryFactor = (awayTeam.xgAverage / 1.5) * (homeTeam.xgaAverage / 1.5);
    homeXG *= homeCountryFactor;
    awayXG *= awayCountryFactor;
    // 4. Apply tactical styles to xG
    const homeStyle = homeTeam.tactics.style;
    const awayStyle = awayTeam.tactics.style;
    if (homeStyle === 'Gegenpress')
        homeXG *= 1.1;
    else if (homeStyle === 'Possession')
        homeXG *= 0.95;
    else if (homeStyle === 'Low Block')
        homeXG *= 0.85;
    else if (homeStyle === 'Direct Play')
        homeXG *= 1.05;
    if (awayStyle === 'Gegenpress')
        awayXG *= 1.1;
    else if (awayStyle === 'Possession')
        awayXG *= 0.95;
    else if (awayStyle === 'Low Block')
        awayXG *= 0.85;
    else if (awayStyle === 'Direct Play')
        awayXG *= 1.05;
    // 5. Roll goals using Poisson distribution
    let homeScore = poissonRandom(homeXG);
    let awayScore = poissonRandom(awayXG);
    // Apply mental ceiling (cap at 6)
    homeScore = Math.min(6, homeScore);
    awayScore = Math.min(6, awayScore);
    // 6. Generate possession
    let possessionHome = 50 + Math.round((homeTeam.eloRating - awayTeam.eloRating) * 0.025);
    if (homeStyle === 'Possession' && awayStyle !== 'Possession')
        possessionHome += 4;
    if (awayStyle === 'Possession' && homeStyle !== 'Possession')
        possessionHome -= 4;
    if (homeStyle === 'Low Block')
        possessionHome -= 3;
    if (awayStyle === 'Low Block')
        possessionHome += 3;
    possessionHome = Math.max(30, Math.min(70, possessionHome));
    const possessionAway = 100 - possessionHome;
    // 7. Generate shots
    let homeShotsBase = 7 + homeXG * 4.5;
    let awayShotsBase = 7 + awayXG * 4.5;
    if (homeStyle === 'Gegenpress')
        homeShotsBase *= 1.15;
    if (homeStyle === 'Possession')
        homeShotsBase *= 0.85;
    if (awayStyle === 'Gegenpress')
        awayShotsBase *= 1.15;
    if (awayStyle === 'Possession')
        awayShotsBase *= 0.85;
    let shotsHome = Math.round(homeShotsBase + (Math.random() - 0.5) * 4);
    let shotsAway = Math.round(awayShotsBase + (Math.random() - 0.5) * 4);
    shotsHome = Math.max(homeScore, Math.max(1, shotsHome));
    shotsAway = Math.max(awayScore, Math.max(1, shotsAway));
    // 8. Generate shots on target
    const homeEloProb = eloProb;
    const awayEloProb = 1 - eloProb;
    let homeAccuracy = 0.45 + (homeEloProb - 0.5) * 0.3;
    let awayAccuracy = 0.45 + (awayEloProb - 0.5) * 0.3;
    if (homeStyle === 'Possession')
        homeAccuracy += 0.05;
    if (awayStyle === 'Possession')
        awayAccuracy += 0.05;
    homeAccuracy = Math.max(0.35, Math.min(0.80, homeAccuracy));
    awayAccuracy = Math.max(0.35, Math.min(0.80, awayAccuracy));
    let shotsOnTargetHome = Math.round(shotsHome * homeAccuracy);
    let shotsOnTargetAway = Math.round(shotsAway * awayAccuracy);
    shotsOnTargetHome = Math.max(homeScore, Math.min(shotsHome, shotsOnTargetHome));
    shotsOnTargetAway = Math.max(awayScore, Math.min(shotsAway, shotsOnTargetAway));
    // 9. Goalkeeper saves
    const savesHome = Math.max(0, shotsOnTargetAway - awayScore);
    const savesAway = Math.max(0, shotsOnTargetHome - homeScore);
    // 10. Passes completed / attempted
    const passesHome = Math.round(200 + possessionHome * 5 + Math.random() * 50);
    const passesAway = Math.round(200 + possessionAway * 5 + Math.random() * 50);
    const passAccuracyHome = 0.70 + (homeTeam.eloRating - 1500) * 0.0003;
    const passAccuracyAway = 0.70 + (awayTeam.eloRating - 1500) * 0.0003;
    const passesCompletedHome = Math.round(passesHome * Math.max(0.6, Math.min(0.92, passAccuracyHome)));
    const passesCompletedAway = Math.round(passesAway * Math.max(0.6, Math.min(0.92, passAccuracyAway)));
    // 11. Populate completed state fields
    // Helper functions for selecting players realistically
    function pickScorer(teamPlayers) {
        if (!teamPlayers || teamPlayers.length === 0)
            return undefined;
        const outfield = teamPlayers.filter(p => p.position !== 'GK' && !p.redCarded);
        if (outfield.length === 0)
            return teamPlayers[0];
        const weights = outfield.map(p => {
            if (p.position === 'FW')
                return 10;
            if (p.position === 'MF')
                return 5;
            return 1;
        });
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalWeight;
        for (let i = 0; i < outfield.length; i++) {
            r -= weights[i];
            if (r <= 0)
                return outfield[i];
        }
        return outfield[outfield.length - 1];
    }
    function pickAssister(teamPlayers, scorerId) {
        if (!teamPlayers || teamPlayers.length === 0)
            return undefined;
        const outfield = teamPlayers.filter(p => p.position !== 'GK' && p.id !== scorerId && !p.redCarded);
        if (outfield.length === 0)
            return undefined;
        const weights = outfield.map(p => {
            if (p.position === 'MF')
                return 10;
            if (p.position === 'FW')
                return 6;
            return 2;
        });
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalWeight;
        for (let i = 0; i < outfield.length; i++) {
            r -= weights[i];
            if (r <= 0)
                return outfield[i];
        }
        return outfield[outfield.length - 1];
    }
    function pickCardedPlayer(teamPlayers) {
        if (!teamPlayers || teamPlayers.length === 0)
            return undefined;
        const active = teamPlayers.filter(p => !p.redCarded);
        if (active.length === 0)
            return undefined;
        const weights = active.map(p => {
            if (p.position === 'DF')
                return 8;
            if (p.position === 'MF')
                return 6;
            if (p.position === 'FW')
                return 4;
            return 1;
        });
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalWeight;
        for (let i = 0; i < active.length; i++) {
            r -= weights[i];
            if (r <= 0)
                return active[i];
        }
        return active[active.length - 1];
    }
    const completedState = {
        ...state,
        status: 'COMPLETED',
        homeScore,
        awayScore,
        elapsedSeconds: 5400,
        totalTicks: 54000,
        stats: {
            possessionHome,
            possessionAway,
            shotsHome,
            shotsAway,
            shotsOnTargetHome,
            shotsOnTargetAway,
            passesHome,
            passesAway,
            passesCompletedHome,
            passesCompletedAway,
            savesHome,
            savesAway,
            tacklesHome: Math.round(10 + Math.random() * 10),
            tacklesAway: Math.round(10 + Math.random() * 10),
            interceptionsHome: Math.round(5 + Math.random() * 8),
            interceptionsAway: Math.round(5 + Math.random() * 8),
            cornersHome: Math.round(1 + Math.random() * 6),
            cornersAway: Math.round(1 + Math.random() * 6),
            foulsHome: Math.round(5 + Math.random() * 8),
            foulsAway: Math.round(5 + Math.random() * 8),
            yellowCardsHome: Math.random() < 0.3 ? 1 : (Math.random() < 0.1 ? 2 : 0),
            yellowCardsAway: Math.random() < 0.3 ? 1 : (Math.random() < 0.1 ? 2 : 0),
            redCardsHome: Math.random() < 0.02 ? 1 : 0,
            redCardsAway: Math.random() < 0.02 ? 1 : 0,
            xgHome: parseFloat(homeXG.toFixed(2)),
            xgAway: parseFloat(awayXG.toFixed(2)),
        },
        events: [],
        commentary: [],
    };
    // 12. Generate goal and assist events
    for (let m = 0; m < homeScore; m++) {
        const min = Math.floor(Math.random() * 88) + 1;
        const scorer = pickScorer(homeTeam.players);
        const assister = scorer ? (Math.random() < 0.75 ? pickAssister(homeTeam.players, scorer.id) : undefined) : undefined;
        completedState.events.push({
            id: `${completedState.matchId}_ev_g_h_${m}`,
            type: 'GOAL',
            minute: min,
            second: Math.floor(Math.random() * 60),
            elapsedSeconds: min * 60,
            teamId: homeTeam.id,
            playerId: scorer?.id,
            targetPlayerId: assister?.id,
            x: 85 + Math.random() * 15,
            y: 20 + Math.random() * 28,
            details: assister
                ? `GOAL! Scored by ${scorer?.name}, assist by ${assister.name}.`
                : `GOAL! Scored by ${scorer?.name || 'home team player'}.`,
        });
    }
    for (let m = 0; m < awayScore; m++) {
        const min = Math.floor(Math.random() * 88) + 1;
        const scorer = pickScorer(awayTeam.players);
        const assister = scorer ? (Math.random() < 0.75 ? pickAssister(awayTeam.players, scorer.id) : undefined) : undefined;
        completedState.events.push({
            id: `${completedState.matchId}_ev_g_a_${m}`,
            type: 'GOAL',
            minute: min,
            second: Math.floor(Math.random() * 60),
            elapsedSeconds: min * 60,
            teamId: awayTeam.id,
            playerId: scorer?.id,
            targetPlayerId: assister?.id,
            x: 5 + Math.random() * 15,
            y: 20 + Math.random() * 28,
            details: assister
                ? `GOAL! Scored by ${scorer?.name}, assist by ${assister.name}.`
                : `GOAL! Scored by ${scorer?.name || 'away team player'}.`,
        });
    }
    // 13. Generate card events
    const yellowHomeCount = completedState.stats.yellowCardsHome;
    for (let c = 0; c < yellowHomeCount; c++) {
        const player = pickCardedPlayer(homeTeam.players);
        if (player) {
            const min = Math.floor(Math.random() * 88) + 1;
            player.yellowCards = (player.yellowCards || 0) + 1;
            completedState.events.push({
                id: `${completedState.matchId}_ev_y_h_${c}`,
                type: 'YELLOW_CARD',
                minute: min,
                second: Math.floor(Math.random() * 60),
                elapsedSeconds: min * 60,
                teamId: homeTeam.id,
                playerId: player.id,
                x: Math.random() * 100,
                y: Math.random() * 100,
                details: `Yellow card shown to ${player.name}.`,
            });
        }
    }
    const yellowAwayCount = completedState.stats.yellowCardsAway;
    for (let c = 0; c < yellowAwayCount; c++) {
        const player = pickCardedPlayer(awayTeam.players);
        if (player) {
            const min = Math.floor(Math.random() * 88) + 1;
            player.yellowCards = (player.yellowCards || 0) + 1;
            completedState.events.push({
                id: `${completedState.matchId}_ev_y_a_${c}`,
                type: 'YELLOW_CARD',
                minute: min,
                second: Math.floor(Math.random() * 60),
                elapsedSeconds: min * 60,
                teamId: awayTeam.id,
                playerId: player.id,
                x: Math.random() * 100,
                y: Math.random() * 100,
                details: `Yellow card shown to ${player.name}.`,
            });
        }
    }
    const redHomeCount = completedState.stats.redCardsHome;
    for (let c = 0; c < redHomeCount; c++) {
        const player = pickCardedPlayer(homeTeam.players);
        if (player) {
            const min = Math.floor(Math.random() * 88) + 1;
            player.redCarded = true;
            completedState.events.push({
                id: `${completedState.matchId}_ev_r_h_${c}`,
                type: 'RED_CARD',
                minute: min,
                second: Math.floor(Math.random() * 60),
                elapsedSeconds: min * 60,
                teamId: homeTeam.id,
                playerId: player.id,
                x: Math.random() * 100,
                y: Math.random() * 100,
                details: `Red card shown to ${player.name}.`,
            });
        }
    }
    const redAwayCount = completedState.stats.redCardsAway;
    for (let c = 0; c < redAwayCount; c++) {
        const player = pickCardedPlayer(awayTeam.players);
        if (player) {
            const min = Math.floor(Math.random() * 88) + 1;
            player.redCarded = true;
            completedState.events.push({
                id: `${completedState.matchId}_ev_r_a_${c}`,
                type: 'RED_CARD',
                minute: min,
                second: Math.floor(Math.random() * 60),
                elapsedSeconds: min * 60,
                teamId: awayTeam.id,
                playerId: player.id,
                x: Math.random() * 100,
                y: Math.random() * 100,
                details: `Red card shown to ${player.name}.`,
            });
        }
    }
    // 14. Generate injury events
    const homeInjuryCount = Math.random() < 0.08 ? 1 : 0;
    for (let i = 0; i < homeInjuryCount; i++) {
        const player = pickCardedPlayer(homeTeam.players);
        if (player) {
            player.injured = true;
            const min = Math.floor(Math.random() * 88) + 1;
            completedState.events.push({
                id: `${completedState.matchId}_ev_inj_h_${i}`,
                type: 'INJURY',
                minute: min,
                second: Math.floor(Math.random() * 60),
                elapsedSeconds: min * 60,
                teamId: homeTeam.id,
                playerId: player.id,
                x: Math.random() * 100,
                y: Math.random() * 100,
                details: `${player.name} pulls up holding his hamstring. Muscle injury!`,
            });
        }
    }
    const awayInjuryCount = Math.random() < 0.08 ? 1 : 0;
    for (let i = 0; i < awayInjuryCount; i++) {
        const player = pickCardedPlayer(awayTeam.players);
        if (player) {
            player.injured = true;
            const min = Math.floor(Math.random() * 88) + 1;
            completedState.events.push({
                id: `${completedState.matchId}_ev_inj_a_${i}`,
                type: 'INJURY',
                minute: min,
                second: Math.floor(Math.random() * 60),
                elapsedSeconds: min * 60,
                teamId: awayTeam.id,
                playerId: player.id,
                x: Math.random() * 100,
                y: Math.random() * 100,
                details: `${player.name} pulls up holding his hamstring. Muscle injury!`,
            });
        }
    }
    completedState.events.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
    completedState.events.forEach((ev) => {
        if (ev.type === 'GOAL') {
            completedState.commentary.push({
                id: `com_${ev.id}`,
                type: 'GOAL',
                minute: ev.minute,
                second: ev.second,
                text: `GOAL!!! Magnificent strike! The net bulges! ${ev.teamId === homeTeam.id ? homeTeam.name : awayTeam.name} scores!`,
            });
        }
    });
    completedState.commentary.unshift({
        id: `com_start`,
        type: 'KICK_OFF',
        minute: 0,
        second: 0,
        text: `The referee blows the whistle to start the match!`,
    });
    completedState.commentary.push({
        id: `com_end`,
        type: 'FULL_TIME',
        minute: 90,
        second: 0,
        text: `And there goes the final whistle! Match ends: ${homeTeam.name} ${homeScore} - ${awayScore} ${awayTeam.name}.`,
    });
    return completedState;
}
function poissonRandom(lambda) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
        k++;
        p *= Math.random();
    } while (p > L);
    return k - 1;
}

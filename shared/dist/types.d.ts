export interface Vector2D {
    x: number;
    y: number;
}
export type PlayerPosition = 'GK' | 'DF' | 'MF' | 'FW';
export interface PlayerAttributes {
    pace: number;
    acceleration: number;
    stamina: number;
    strength: number;
    agility: number;
    passing: number;
    dribbling: number;
    finishing: number;
    firstTouch: number;
    crossing: number;
    positioning: number;
    vision: number;
    decisions: number;
    composure: number;
    workRate: number;
    gkReflexes: number;
    gkHandling: number;
    gkPositioning: number;
    gkOneOnOnes: number;
}
export interface Player {
    id: number;
    name: string;
    age: number;
    position: PlayerPosition;
    club: string;
    teamId: string;
    number: number;
    attributes: PlayerAttributes;
    staminaState: number;
    yellowCards: number;
    redCarded: boolean;
    injured: boolean;
    fitness?: number;
    morale?: number;
    suspendedMatches?: number;
    injuryDuration?: number;
}
export type FormationType = '4-3-3' | '4-2-3-1' | '3-5-2' | '4-4-2';
export type TacticalStyle = 'Gegenpress' | 'Possession' | 'Low Block' | 'Direct Play' | 'Counter Attack';
export interface TeamTactics {
    formation: FormationType;
    style: TacticalStyle;
    pressingIntensity: number;
    defensiveLine: number;
    tempo: number;
}
export interface Team {
    id: string;
    name: string;
    fifaRanking: number;
    eloRating: number;
    colorPrimary: string;
    colorSecondary: string;
    tactics: TeamTactics;
    players: Player[];
    form: number[];
    xgAverage: number;
    xgaAverage: number;
    passingSpecialist?: boolean;
}
export interface BallState {
    pos: Vector2D;
    vel: Vector2D;
    height: number;
    zVel: number;
    ownerId: number | null;
    lastTouchId: number | null;
    lastTouchTeamId: string | null;
    lastTouchAction?: string | null;
    noControlTicks?: number;
}
export type MatchEventType = 'KICK_OFF' | 'PASS' | 'THROUGH_BALL' | 'DRIBBLE' | 'TACKLE' | 'INTERCEPTION' | 'SHOT' | 'SAVE' | 'GOAL' | 'CORNER' | 'GOAL_KICK' | 'THROW_IN' | 'FREE_KICK' | 'PENALTY' | 'YELLOW_CARD' | 'RED_CARD' | 'INJURY' | 'SUBSTITUTION' | 'OFFSIDE' | 'FOUL' | 'OUT_OF_BOUNDS' | 'HALF_TIME' | 'FULL_TIME' | 'COACH_REACTION';
export interface MatchEvent {
    id: string;
    type: MatchEventType;
    minute: number;
    second: number;
    elapsedSeconds: number;
    teamId?: string;
    playerId?: number;
    targetPlayerId?: number;
    x: number;
    y: number;
    xg?: number;
    details?: string;
}
export interface CommentaryLine {
    id: string;
    minute: number;
    second: number;
    text: string;
    type: MatchEventType;
}
export interface PlayerPerformance {
    playerId: number;
    name: string;
    position: PlayerPosition;
    goals: number;
    assists: number;
    shots: number;
    shotsOnTarget: number;
    passesAttempted: number;
    passesCompleted: number;
    tackles: number;
    interceptions: number;
    saves: number;
    rating: number;
    staminaRemaining: number;
}
export interface MatchStats {
    possessionHome: number;
    possessionAway: number;
    shotsHome: number;
    shotsAway: number;
    shotsOnTargetHome: number;
    shotsOnTargetAway: number;
    passesHome: number;
    passesAway: number;
    passesCompletedHome: number;
    passesCompletedAway: number;
    tacklesHome: number;
    tacklesAway: number;
    interceptionsHome: number;
    interceptionsAway: number;
    cornersHome: number;
    cornersAway: number;
    savesHome: number;
    savesAway: number;
    foulsHome: number;
    foulsAway: number;
    yellowCardsHome: number;
    yellowCardsAway: number;
    redCardsHome: number;
    redCardsAway: number;
    xgHome: number;
    xgAway: number;
}
export interface PlayerOnPitchState {
    playerId: number;
    teamId: string;
    name: string;
    position: PlayerPosition;
    role: string;
    pos: Vector2D;
    vel: Vector2D;
    targetPos: Vector2D;
    number: number;
    attributes: PlayerAttributes;
    staminaState: number;
    color: string;
    roleCoordsDefault: Vector2D;
    roleCoordsAttacking: Vector2D;
    yellowCards?: number;
    redCarded?: boolean;
    isSoloDribble?: boolean;
    soloDribbleTicks?: number;
    noMoveTicks?: number;
    decisionCooldown?: number;
}
export interface Venue {
    name: string;
    city: string;
    country: 'USA' | 'Mexico' | 'Canada';
}
export declare const VENUES: Venue[];
export interface SetPieceState {
    type: MatchEventType;
    takingTeamId: string;
    takerId: number;
    ticksRemaining: number;
    kickTaken: boolean;
}
export interface ActiveShotState {
    shooterId: number;
    gkId?: number;
    isSaved: boolean;
    holdsBall: boolean;
    tipOutOfBounds: boolean;
    overBar: boolean;
    ticksToTarget: number;
}
export interface PendingSetPieceState {
    type: MatchEventType;
    takingTeamId: string;
    ticksRemaining: number;
}
export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'HALF_TIME' | 'COMPLETED';
export interface MatchSimulationState {
    matchId: number;
    homeTeam: Team;
    awayTeam: Team;
    status: MatchStatus;
    elapsedSeconds: number;
    homeScore: number;
    awayScore: number;
    ball: BallState;
    players: PlayerOnPitchState[];
    events: MatchEvent[];
    commentary: CommentaryLine[];
    stats: MatchStats;
    homePossessionTicks: number;
    awayPossessionTicks: number;
    totalTicks: number;
    refereeName: string;
    refereeStrictness: number;
    activeSetPiece?: SetPieceState | null;
    activeShot?: ActiveShotState | null;
    pendingSetPiece?: PendingSetPieceState | null;
    venue?: Venue;
    looseBallTicks?: number;
}
export interface GroupTableEntry {
    teamId: string;
    teamName: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
}
export interface Group {
    id: string;
    teams: string[];
    matches: number[];
    table: GroupTableEntry[];
}
export interface KnockoutMatchNode {
    matchId: number | null;
    homeSource: {
        type: 'group' | 'knockout' | 'winner' | 'runner_up' | 'third_place';
        id: string;
        rank: number;
    } | null;
    awaySource: {
        type: 'group' | 'knockout' | 'winner' | 'runner_up' | 'third_place';
        id: string;
        rank: number;
    } | null;
    homeTeamId: string | null;
    awayTeamId: string | null;
    winnerId: string | null;
    round: 'R32' | 'R16' | 'QF' | 'SF' | 'FINAL';
    nextMatchNodeId: number | null;
}
export interface PlayerTournamentStats {
    playerId: number;
    playerName: string;
    teamId: string;
    teamName: string;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
}
export interface TournamentState {
    id: number;
    name: string;
    status: 'IN_PROGRESS' | 'COMPLETED';
    currentRound: 'GROUP_STAGE' | 'R32' | 'R16' | 'QF' | 'SF' | 'FINAL';
    groups: Group[];
    knockoutNodes: Record<number, KnockoutMatchNode>;
    teams: Record<string, Team>;
    completedMatches?: Record<number, {
        homeScore: number;
        awayScore: number;
        homeTeamId: string;
        awayTeamId: string;
    }>;
    playerStats?: Record<number, PlayerTournamentStats>;
}

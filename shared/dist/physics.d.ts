import { BallState } from './types.js';
export declare const PITCH_WIDTH = 105;
export declare const PITCH_HEIGHT = 68;
export declare const GOAL_Y_TOP = 30.34;
export declare const GOAL_Y_BOTTOM = 37.66;
export declare const GOAL_HEIGHT = 2.44;
export declare function updateBallPhysics(ball: BallState, dt: number, homeTeamId?: string, awayTeamId?: string): {
    ballState: BallState;
    outOfBounds: boolean;
    isGoal: boolean;
    scoringTeamId: 'HOME' | 'AWAY' | null;
    reason: 'GOAL_KICK' | 'CORNER' | 'THROW_IN' | null;
};

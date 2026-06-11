import { Vector } from './vector.js';
export const PITCH_WIDTH = 105;
export const PITCH_HEIGHT = 68;
export const GOAL_Y_TOP = 30.34; // 34 - 3.66
export const GOAL_Y_BOTTOM = 37.66; // 34 + 3.66
export const GOAL_HEIGHT = 2.44;
const GRAVITY = 9.81; // m/s^2
const AIR_DRAG = 0.15; // drag coefficient in air
const GROUND_FRICTION = 0.4; // friction coefficient on grass
const BOUNCE_RESTITUTION = 0.6; // restitution for height bounce
const BOUNCE_FRICTION = 0.7; // grass friction during bounce
export function updateBallPhysics(ball, dt, homeTeamId, awayTeamId) {
    // If ball is owned, physics is bypassed (ball moves with player)
    if (ball.ownerId !== null) {
        return {
            ballState: { ...ball, vel: { x: 0, y: 0 }, height: 0, zVel: 0 },
            outOfBounds: false,
            isGoal: false,
            scoringTeamId: null,
            reason: null,
        };
    }
    // 1. Update Position
    let pos = Vector.add(ball.pos, Vector.mult(ball.vel, dt));
    let height = ball.height + ball.zVel * dt;
    let zVel = ball.zVel;
    let vel = { ...ball.vel };
    // 2. Gravity and Ground Bounce
    if (height > 0) {
        // Ball is in the air
        zVel -= GRAVITY * dt;
        // Apply air resistance (drag)
        const speed = Vector.mag(vel);
        if (speed > 0) {
            vel = Vector.sub(vel, Vector.mult(vel, AIR_DRAG * dt));
        }
    }
    else {
        // Ball is on the ground
        height = 0;
        if (Math.abs(zVel) > 0.5) {
            // Bounce
            zVel = -zVel * BOUNCE_RESTITUTION;
            vel = Vector.mult(vel, BOUNCE_FRICTION);
        }
        else {
            zVel = 0;
            // Rolling friction
            const speed = Vector.mag(vel);
            if (speed > 0) {
                const deceleration = GROUND_FRICTION * GRAVITY;
                const newSpeed = Math.max(0, speed - deceleration * dt);
                if (newSpeed === 0) {
                    vel = { x: 0, y: 0 };
                }
                else {
                    vel = Vector.mult(Vector.normalize(vel), newSpeed);
                }
            }
        }
    }
    // 3. Out of Bounds & Goal Collisions
    let outOfBounds = false;
    let isGoal = false;
    let scoringTeamId = null;
    let reason = null;
    // Touchline (y-axis bounds)
    if (pos.y < 0 || pos.y > PITCH_HEIGHT) {
        outOfBounds = true;
        reason = 'THROW_IN';
        pos.y = Math.max(0, Math.min(PITCH_HEIGHT, pos.y));
        vel = { x: 0, y: 0 };
    }
    // Goal line (x-axis bounds)
    if (pos.x < 0 || pos.x > PITCH_WIDTH) {
        const isYInGoalRange = pos.y >= GOAL_Y_TOP && pos.y <= GOAL_Y_BOTTOM;
        const isHeightInGoalRange = height <= GOAL_HEIGHT;
        if (isYInGoalRange && isHeightInGoalRange) {
            isGoal = true;
            outOfBounds = true;
            if (pos.x < 0) {
                // Goal for Away Team (scored in left goal)
                scoringTeamId = 'AWAY';
            }
            else {
                // Goal for Home Team (scored in right goal)
                scoringTeamId = 'HOME';
            }
            vel = { x: 0, y: 0 };
            zVel = 0;
        }
        else {
            outOfBounds = true;
            vel = { x: 0, y: 0 };
            zVel = 0;
            // Determine Corner vs Goal Kick
            // If last touch was defending team -> Corner. If attacking -> Goal Kick.
            const ballCrossedEndline = pos.x < 0 ? 'LEFT' : 'RIGHT';
            const lastTeamTouch = ball.lastTouchTeamId;
            if (ballCrossedEndline === 'LEFT') {
                // Left side endline (defended by HOME, attacked by AWAY)
                if (lastTeamTouch === 'HOME' || (homeTeamId && lastTeamTouch === homeTeamId)) {
                    // Home touched last (defending left) -> Corner for Away
                    reason = 'CORNER';
                }
                else {
                    // Away touched last (attacking left) -> Goal Kick for Home
                    reason = 'GOAL_KICK';
                }
            }
            else {
                // Right side endline (defended by AWAY, attacked by HOME)
                if (lastTeamTouch === 'AWAY' || (awayTeamId && lastTeamTouch === awayTeamId)) {
                    // Away touched last (defending right) -> Corner for Home
                    reason = 'CORNER';
                }
                else {
                    // Home touched last (attacking right) -> Goal Kick for Away
                    reason = 'GOAL_KICK';
                }
            }
            pos.x = pos.x < 0 ? 0 : PITCH_WIDTH;
        }
    }
    return {
        ballState: {
            pos,
            vel,
            height,
            zVel,
            ownerId: null,
            lastTouchId: ball.lastTouchId,
            lastTouchTeamId: ball.lastTouchTeamId,
            lastTouchAction: ball.lastTouchAction,
        },
        outOfBounds,
        isGoal,
        scoringTeamId,
        reason,
    };
}

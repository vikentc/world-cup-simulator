import { describe, it, expect } from 'vitest';
import { Vector } from '../src/vector.js';
import { updateBallPhysics, PITCH_WIDTH, PITCH_HEIGHT } from '../src/physics.js';
describe('Vector Mathematics', () => {
    it('should add vectors correctly', () => {
        const v1 = Vector.create(10, 5);
        const v2 = Vector.create(5, -2);
        const result = Vector.add(v1, v2);
        expect(result.x).toBe(15);
        expect(result.y).toBe(3);
    });
    it('should calculate distance correctly', () => {
        const v1 = Vector.create(0, 0);
        const v2 = Vector.create(3, 4);
        const d = Vector.dist(v1, v2);
        expect(d).toBe(5);
    });
    it('should normalize vectors correctly', () => {
        const v = Vector.create(10, 0);
        const norm = Vector.normalize(v);
        expect(norm.x).toBe(1);
        expect(norm.y).toBe(0);
    });
});
describe('Ball Physics Engine', () => {
    it('should apply drag/friction and update position', () => {
        const ball = {
            pos: { x: 50, y: 34 },
            vel: { x: 10, y: 0 },
            height: 0,
            zVel: 0,
            ownerId: null,
            lastTouchId: null,
            lastTouchTeamId: null,
        };
        const result = updateBallPhysics(ball, 0.1); // dt = 0.1s
        expect(result.ballState.pos.x).toBeGreaterThan(50);
        // Vel should decrease slightly due to grass friction
        expect(result.ballState.vel.x).toBeLessThan(10);
        expect(result.outOfBounds).toBe(false);
    });
    it('should detect throw-ins (y-axis boundary)', () => {
        const ball = {
            pos: { x: 50, y: PITCH_HEIGHT - 0.2 },
            vel: { x: 0, y: 5 }, // heading out
            height: 0,
            zVel: 0,
            ownerId: null,
            lastTouchId: null,
            lastTouchTeamId: 'USA',
        };
        const result = updateBallPhysics(ball, 0.1);
        expect(result.outOfBounds).toBe(true);
        expect(result.reason).toBe('THROW_IN');
    });
    it('should detect goals (inside goal mouth)', () => {
        const ball = {
            pos: { x: PITCH_WIDTH - 0.5, y: 34 }, // near right goal mouth
            vel: { x: 10, y: 0 }, // heading in
            height: 0.5,
            zVel: 0,
            ownerId: null,
            lastTouchId: 123,
            lastTouchTeamId: 'ARG',
        };
        const result = updateBallPhysics(ball, 0.1);
        expect(result.isGoal).toBe(true);
        expect(result.scoringTeamId).toBe('HOME'); // scored in right goal
    });
});

import { Vector2D } from './types.js';
export declare const Vector: {
    create(x?: number, y?: number): Vector2D;
    add(v1: Vector2D, v2: Vector2D): Vector2D;
    sub(v1: Vector2D, v2: Vector2D): Vector2D;
    mult(v: Vector2D, scalar: number): Vector2D;
    div(v: Vector2D, scalar: number): Vector2D;
    magSq(v: Vector2D): number;
    mag(v: Vector2D): number;
    distSq(v1: Vector2D, v2: Vector2D): number;
    dist(v1: Vector2D, v2: Vector2D): number;
    normalize(v: Vector2D): Vector2D;
    limit(v: Vector2D, max: number): Vector2D;
    dot(v1: Vector2D, v2: Vector2D): number;
    lerp(v1: Vector2D, v2: Vector2D, t: number): Vector2D;
    direction(from: Vector2D, to: Vector2D): Vector2D;
    equals(v1: Vector2D, v2: Vector2D, tolerance?: number): boolean;
};

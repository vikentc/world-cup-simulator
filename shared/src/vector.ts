import { Vector2D } from './types.js';

export const Vector = {
  create(x = 0, y = 0): Vector2D {
    return { x, y };
  },

  add(v1: Vector2D, v2: Vector2D): Vector2D {
    return { x: v1.x + v2.x, y: v1.y + v2.y };
  },

  sub(v1: Vector2D, v2: Vector2D): Vector2D {
    return { x: v1.x - v2.x, y: v1.y - v2.y };
  },

  mult(v: Vector2D, scalar: number): Vector2D {
    return { x: v.x * scalar, y: v.y * scalar };
  },

  div(v: Vector2D, scalar: number): Vector2D {
    if (scalar === 0) return { x: 0, y: 0 };
    return { x: v.x / scalar, y: v.y / scalar };
  },

  magSq(v: Vector2D): number {
    return v.x * v.x + v.y * v.y;
  },

  mag(v: Vector2D): number {
    return Math.sqrt(v.x * v.x + v.y * v.y);
  },

  distSq(v1: Vector2D, v2: Vector2D): number {
    const dx = v1.x - v2.x;
    const dy = v1.y - v2.y;
    return dx * dx + dy * dy;
  },

  dist(v1: Vector2D, v2: Vector2D): number {
    return Math.sqrt(this.distSq(v1, v2));
  },

  normalize(v: Vector2D): Vector2D {
    const m = this.mag(v);
    if (m === 0) return { x: 0, y: 0 };
    return { x: v.x / m, y: v.y / m };
  },

  limit(v: Vector2D, max: number): Vector2D {
    const mSq = this.magSq(v);
    if (mSq > max * max) {
      return this.mult(this.normalize(v), max);
    }
    return { ...v };
  },

  dot(v1: Vector2D, v2: Vector2D): number {
    return v1.x * v2.x + v1.y * v2.y;
  },

  lerp(v1: Vector2D, v2: Vector2D, t: number): Vector2D {
    return {
      x: v1.x + (v2.x - v1.x) * t,
      y: v1.y + (v2.y - v1.y) * t,
    };
  },

  direction(from: Vector2D, to: Vector2D): Vector2D {
    return this.normalize(this.sub(to, from));
  },

  equals(v1: Vector2D, v2: Vector2D, tolerance = 1e-5): boolean {
    return Math.abs(v1.x - v2.x) < tolerance && Math.abs(v1.y - v2.y) < tolerance;
  },
};

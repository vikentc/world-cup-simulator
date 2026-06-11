export const Vector = {
    create(x = 0, y = 0) {
        return { x, y };
    },
    add(v1, v2) {
        return { x: v1.x + v2.x, y: v1.y + v2.y };
    },
    sub(v1, v2) {
        return { x: v1.x - v2.x, y: v1.y - v2.y };
    },
    mult(v, scalar) {
        return { x: v.x * scalar, y: v.y * scalar };
    },
    div(v, scalar) {
        if (scalar === 0)
            return { x: 0, y: 0 };
        return { x: v.x / scalar, y: v.y / scalar };
    },
    magSq(v) {
        return v.x * v.x + v.y * v.y;
    },
    mag(v) {
        return Math.sqrt(v.x * v.x + v.y * v.y);
    },
    distSq(v1, v2) {
        const dx = v1.x - v2.x;
        const dy = v1.y - v2.y;
        return dx * dx + dy * dy;
    },
    dist(v1, v2) {
        return Math.sqrt(this.distSq(v1, v2));
    },
    normalize(v) {
        const m = this.mag(v);
        if (m === 0)
            return { x: 0, y: 0 };
        return { x: v.x / m, y: v.y / m };
    },
    limit(v, max) {
        const mSq = this.magSq(v);
        if (mSq > max * max) {
            return this.mult(this.normalize(v), max);
        }
        return { ...v };
    },
    dot(v1, v2) {
        return v1.x * v2.x + v1.y * v2.y;
    },
    lerp(v1, v2, t) {
        return {
            x: v1.x + (v2.x - v1.x) * t,
            y: v1.y + (v2.y - v1.y) * t,
        };
    },
    direction(from, to) {
        return this.normalize(this.sub(to, from));
    },
    equals(v1, v2, tolerance = 1e-5) {
        return Math.abs(v1.x - v2.x) < tolerance && Math.abs(v1.y - v2.y) < tolerance;
    },
};

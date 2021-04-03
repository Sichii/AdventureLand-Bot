import { CONSTANTS, Direction, IPosition, KindBase } from "../internal";

export class Point extends KindBase {
    readonly x: number;
    readonly y: number;
    static readonly none: Point = new Point(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);

    constructor(x: number, y: number) {
        super();
        this.Kind.add("Point");

        this.x = x;
        this.y = y;
    }

    static fromIPosition(iPos: IPosition) {
        return new Point(iPos.x, iPos.y);
    }

    static parse(str: string) {
        let matches = str.match(/\(?(\d+)(?:,| |, )(\d+)\)?/i);

        if (matches == null)
            throw new EvalError(`failed to parse string ${str} as point`);

        let x = Number.parseInt(matches[1]);
        let y = Number.parseInt(matches[2]);

        return new Point(x, y);
    }

    distance(other: Point | IPosition) {
        if (other == null)
            throw new ReferenceError("other point is null when getting distance");

        let a = (other.x - this.x);
        let b = (other.y - this.y);
        let distance = Math.hypot(a, b);

        return distance < CONSTANTS.EPSILON ? 0 : distance;
    }

    lerp(destination: Point, maxMove = 0, minDiff: number) {
        let dx = destination.x - this.x; 
        let dy = destination.y - this.y;

        if (maxMove > 0) {
            dx = Math.min(dx, maxMove);
            dy = Math.min(dy, maxMove);
            dx = Math.max(dx, -maxMove);
            dy = Math.max(dy, -maxMove);
        }
        if (Math.abs(dx) < minDiff && Math.abs(dy) < minDiff)
            return destination;

        return new Point(this.x + dx, this.y + dy);
    }

    fastDistance(other: IPosition) {
        let a = (other.x - this.x);
        let b = (other.y - this.y);

        return (a * a) + (b * b);
    }

    directionalRelationTo(other: Point) {
        if(other == null)
            throw new ReferenceError("other point is null when getting directional relation");

        let direction = Direction.Up;
        let degree = 0;

        if (this.y < other.y) {
            degree = other.y - this.y;
            direction = Direction.Up;
        }

        if (this.x > other.x && this.x - other.x > degree) {
            degree = this.x - other.x;
            direction = Direction.Right;
        }

        if (this.y > other.y && this.y - other.y > degree) {
            degree = this.y - other.y;
            direction = Direction.Down;
        }

        if (this.x < other.x && other.x - this.x > degree)
            direction = Direction.Left;

        return direction;
    }

    angularRelationTo(other: Point) {
        if(other == null)
            throw new ReferenceError("other point is null when getting angular relation");

        let delta_y = this.y - other.y;
        let delta_x = this.x - other.x;

        return Math.atan2(delta_y, delta_x) * (180 / Math.PI);
    }

    offsetByDirection(direction: Direction, distance: number) {
        switch (direction) {
            case Direction.Up:
                return new Point(this.x, this.y - distance);
            case Direction.Right:
                return new Point(this.x + distance, this.y);
            case Direction.Down:
                return new Point(this.x, this.y + distance);
            case Direction.Left:
                return new Point(this.x - distance, this.y);
        }
    }

    offsetByAngle(angle: number, distance: number) {
        let theta = (angle * Math.PI / 180);
        let x = distance * Math.cos(theta)
        let y = distance * Math.sin(theta);

        return new Point(x + this.x, y + this.y);
    }

    generateRandomNearbyPoint(maxDistance: number) {
        let angle = Math.random() * Math.PI * 2;
        let radius = Math.random() * maxDistance;

        return new Point((Math.cos(angle) * radius) + this.x, (Math.sin(angle) * radius) + this.y);
    }

    toString() {
        return `(${this.x.toFixed(0)}, ${this.y.toFixed(0)})`;
    }
}

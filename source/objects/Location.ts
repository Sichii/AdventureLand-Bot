import { Entity, IPosition, KindBase, MapName, Player, Point } from "../internal";

export class Location extends KindBase {
    readonly map?: MapName;
    readonly point: Point;
    static none: Location = new Location(Point.none);

    constructor(point: Point, map?: MapName) {
        super();
        this.Kind.add("Location");

        this.map = map;
        this.point = point;
    }

    static fromIPosition(iPos: IPosition) {
        return new Location(new Point(iPos.x, iPos.y), iPos.map);
    }

    distance(other: Point | IPosition) {
        if(other == null)
            throw new Error("Other is not defined.");

        if("map" in other && other.map != null && this.map !== other.map)
            return Number.MAX_SAFE_INTEGER;

        return this.point.distance(other);
    }

    get x() { return this.point.x; }
    get y() { return this.point.y; }

    toString() {
        return `${this.map}, ${this.point.toString()}`;
    }
}
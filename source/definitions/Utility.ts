import { Point, Location, IPosition, Player, Entity } from "../internal";

export class Utility {
    static msSince(date: Date) {
        return new Date().getTime() - date.getTime();
    }

    static getPoint(entity: IPosition) {
        return new Point(entity.x, entity.y);
    }

    static getLocation(entity: IPosition) {
        return new Location(this.getPoint(entity), entity.map);
    }

    static hasFlag(num: number, value: number) {
        return (num & value) === value;
    }
}
import { List } from "../collections/List";
import { Entity, Point } from "../internal";

export class Utility {
    static msSince(date: Date) {
        return new Date().getTime() - date.getTime();
    }

    static clamp(num: number, min: number, max: number) {
        return Math.min(Math.max(num, min), max);
    }

    static calculateDamageMultiplier(defMinusPierce: number) {
        return Math.min(1.32, Math.max(.05, 1 - (.001 * Math.max(0, Math.min(100, defMinusPierce)) + .001 * Math.max(0, Math.min(100, defMinusPierce - 100)) + .00095 * Math.max(0, Math.min(100, defMinusPierce - 200)) + .0009 * Math.max(0, Math.min(100, defMinusPierce - 300)) + .00082 * Math.max(0, Math.min(100, defMinusPierce - 400)) + .0007 * Math.max(0, Math.min(100, defMinusPierce - 500)) + .0006 * Math.max(0, Math.min(100, defMinusPierce - 600)) + .0005 * Math.max(0, Math.min(100, defMinusPierce - 700)) + .0004 * Math.max(0, defMinusPierce - 800)) + .001 * Math.max(0, Math.min(50, 0 - defMinusPierce)) + .00075 * Math.max(0, Math.min(50, -50 - defMinusPierce)) + .0005 * Math.max(0, Math.min(50, -100 - defMinusPierce)) + .00025 * Math.max(0, -150 - defMinusPierce)));
    }
    
    static midPoint(point1: Point, point2: Point) {
        let x = (point1.x + point2.x)/2;
        let y = (point1.y + point2.y)/2;

        return new Point(x, y);
    }
}
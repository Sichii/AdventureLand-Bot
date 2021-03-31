export class Enum {
    static hasFlag(left: number, right: number) {
        return (left & right) === right;
    }
}
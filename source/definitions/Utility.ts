export class Utility {
    static msSince(date: Date) {
        return new Date().getTime() - date.getTime();
    }

    static clamp(num: number, min: number, max: number) {
        return Math.min(Math.max(num, min), max);
    }
}
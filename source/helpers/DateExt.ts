export class DateExt extends Date {
    constructor(time: string | number | Date) {
        super(time);
    }

    subtractMs(ms: number) {
        return new DateExt(this.valueOf() - ms);
    }

    subtractSeconds(seconds: number) {
        return this.subtractMs(seconds * 1000);
    }

    subtractMinutes(minutes: number) {
        return this.subtractSeconds(minutes * 60);
    }

    subtractHours(hours: number) {
        return this.subtractMinutes(hours * 60);
    }

    subtract(other: Date) {
        return this.valueOf() - other.valueOf();
    }

    subtractX(other: Date) {
        return new DateExt(this.valueOf() - other.valueOf());
    }

    get totalMs() {
        return this.valueOf();
    }

    get totalSeconds() {
        return this.valueOf() / 1000;
    }

    get totalMinutes() {
        return this.valueOf() / (1000 * 60);
    }

    get totalHours() {
        return this.valueOf() / (1000 * 60 * 60);
    }

    static fromMs(ms: number) {
        return new DateExt(ms);
    }

    static fromSeconds(seconds: number) {
        return this.fromMs(seconds * 1000);
    }

    static fromMinutes(minutes: number) {
        return this.fromSeconds(minutes * 60);
    }

    static fromHours(hours: number) {
        return this.fromMinutes(hours * 60);
    }

    static get utcNow() {
        return new DateExt(Date.now());
    }
}
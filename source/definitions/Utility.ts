export class Utility {
    static msSince(date: Date) {
        return new Date().getTime() - date.getTime();
    }
}
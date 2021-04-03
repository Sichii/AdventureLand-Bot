import { IEqualityComparer } from "../internal";

export class CaseSensitiveStringComparer implements IEqualityComparer<string> {
    Equals(item1: string, item2: string): boolean {
        return item1 === item2;
    }

    GetHashCode(item: string): number {
        let hash = 0
        let cCode = 0;
        if (item.length === 0) return hash;
        for (let index = 0; index < item.length; index++) {
            cCode = item.charCodeAt(index);
            hash = ((hash << 5) - hash) + cCode;
            hash |= 0;
        }
        return hash;
    }

}
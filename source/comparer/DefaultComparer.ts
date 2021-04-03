import { IEqualityComparer, StringComparer } from "../internal";

export class DefaultComparer<T> implements IEqualityComparer<T> {
    Equals(item1: T, item2: T): boolean {
        return item1 === item2;
    }

    GetHashCode(item: T): number {
        let str = JSON.stringify(item);
        return StringComparer.Default.GetHashCode(str);
    }
    
}
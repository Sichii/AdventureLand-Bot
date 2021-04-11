import { IEqualityComparer, StringComparer } from "../internal";

export class DefaultEqualityComparer<T> implements IEqualityComparer<T> {
    Equals(item1: T, item2: T): boolean {
        return item1 != null && item2 != null && item1 === item2;
    }

    GetHashCode(item: T): number {
        let str = JSON.stringify(item);
        return StringComparer.Default.GetHashCode(str);
    }
    
}
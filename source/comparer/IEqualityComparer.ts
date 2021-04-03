export interface IEqualityComparer<T> {
    Equals(item1: T, item2: T): boolean;
    GetHashCode(item: T): number;
}
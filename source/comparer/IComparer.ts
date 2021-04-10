export interface IComparer<T> {
    Compare(item1: T, item2: T): number;
}
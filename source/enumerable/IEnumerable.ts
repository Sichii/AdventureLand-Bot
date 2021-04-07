import { Dictionary, IEqualityComparer, List } from "../internal";

export interface IEnumerable<T> extends Iterable<T> {
    first(predicate?: (item: T) => boolean): T;
    firstOrDefault(predicate?: (item: T) => boolean): T | undefined;
    all(predicate: (item: T) => boolean): boolean;
    any(predicate?: (item: T) => boolean): boolean;
    contains(item: T, comparer?: IEqualityComparer<T>): boolean;
    count(predicate: (item: T) => boolean): number;
    elementAt(index: number): T | undefined;
    sumBy(selector: (item: T) => number): number | undefined;
    maxBy(selector: (item: T) => number): T | undefined;
    minBy(selector: (item: T) => number): T | undefined;
    
    //iterators
    select<TResult>(selector: (item: T) => TResult): IEnumerable<TResult>;
    where(predicate: (item: T) => boolean): IEnumerable<T>;
    concat(items: Iterable<T>): IEnumerable<T>;
    except(items: Iterable<T>): IEnumerable<T>;
    intersect(items: Iterable<T>): IEnumerable<T>;
    take(count: number): IEnumerable<T>;
    skip(count: number): IEnumerable<T>;
    reverse(): IEnumerable<T>;

    groupBy<TKey>(keySelector: (item: T) => TKey) : IEnumerable<[key: TKey, group: IEnumerable<T>]>;
    orderBy(selector: (item: T) => number): IEnumerable<T>;
    orderByDesc(selector: (item: T) => number): IEnumerable<T>;

    toArray(): T[];
    toList(): List<T>;
    toDictionary<TKey, TValue>(keySelector: (item: T) => TKey, valueSelector: (item: T) => TValue): Dictionary<TKey, TValue>;

    getEnumerator(): Generator<T>;
}
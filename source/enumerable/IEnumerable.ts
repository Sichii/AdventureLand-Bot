import { Dictionary } from "../collections/Dictionary";
import { List } from "../internal";

export interface IEnumerable<T> extends Iterable<T> {
    first(): T;
    firstOrDefault(predicate: (item: T) => boolean): T | null;
    all(predicate: (item: T) => boolean): boolean;
    any(predicate: (item: T) => boolean): boolean;
    contains(item: T): boolean;
    count(predicate: (item: T) => boolean): number;
    elementAt(index: number): T | null;
    sumBy(selector: (item: T) => number): number;

    //iterators
    select<TResult>(selector: (item: T) => TResult): IEnumerable<TResult>;
    where(predicate: (item: T) => boolean): IEnumerable<T>;
    concat(items: Iterable<T>): IEnumerable<T>;

    //fuck this guy
    orderBy(value_selector: (item: T) => number): IEnumerable<T>;

    toArray(): T[];
    toList(): List<T>;
    toDictionary<TKey, TValue>(keySelector: (item: T) => TKey, valueSelector: (item: T) => TValue): Dictionary<TKey, TValue>;

    getEnumerator(): Generator<T>;
}
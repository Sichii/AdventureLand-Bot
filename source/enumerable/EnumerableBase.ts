import { Dictionary, DefaultEnumerableIterator, IEnumerable, List, DefaultEqualityComparer, IEqualityComparer } from "../internal";

export abstract class EnumerableBase<T> implements IEnumerable<T> {
    first(predicate?: (item: T) => boolean) {
        for(let item of this)
            if(predicate?.(item) ?? true)
                return item;

        throw new Error("This enumerable contains no elements.");
    }

    firstOrDefault(predicate?: (item: T) => boolean) {
        for (let item of this)
            if (predicate?.(item) ?? true)
                return item;

        return undefined;
    }

    all(predicate: (item: T) => boolean) {
        for(let item of this)
            if(!predicate(item))
                return false;

        return true;
    }

    any(predicate?: (item: T) => boolean) {
        for(let item of this)
            if(predicate?.(item) ?? true)
                return true;

        return false;
    }

    contains(item: T, comparer: IEqualityComparer<T> = new DefaultEqualityComparer<T>()) {
        for(let xItem of this)
            if(xItem != null && comparer.Equals(xItem, item))
                return true;

        return false;
    }

    count(predicate?: (item: T) => boolean) {
        let count = 0;
        for(let item of this)
            if(predicate?.(item) ?? true)
                count++;

        return count;
    }

    elementAt(index: number) {
        let ci = 0;

        for(let item of this)
            if(index === ci++)
                return item;

        return undefined;
    }

    sum(selector: (item: T) => number): number | undefined {
        let result: number | undefined;

        for(let item of this) {
            if(result == null)
                result = 0;
``
            result += selector(item);
        }

        return result;
    }

    max(selector: (item: T) => number) {
        let best: { item: T, val: number } | undefined;

        for(let item of this) {
            let newVal = selector(item);

            if(best == null || newVal > best.val)
                best = { item: item, val: newVal };
        }

        return best?.item;
    }

    min(selector: (item: T) => number) {
        let best: { item: T, val: number } | undefined;

        for(let item of this) {
            let newVal = selector(item);

            if(best == null || newVal < best.val)
                best = { item: item, val: newVal };
        }

        return best?.item;
    }

    toArray() {
        let arr = new Array<T>();

        for (let item of this)
            arr.push(item);

        return arr;
    }

    toList(): List<T> {
        return new List(this);
    }

    toDictionary<TKey, TValue>(keySelector: (item: T) => TKey, valueSelector: (item: T) => TValue) {
        let map = new Map<TKey, TValue>();

        for(let item of this)
            map.set(keySelector(item), valueSelector(item));

        return new Dictionary(map);
    }

    select<TResult>(selector: (item: T) => TResult): IEnumerable<TResult> {
        return new DefaultEnumerableIterator(this.selectIterator(selector));
    }

    private *selectIterator<TResult>(selector: (item: T) => TResult) {
        for(let item of this)
            yield selector(item);
    }

    selectMany<TResult>(selector: (item: T) => IEnumerable<TResult>): IEnumerable<TResult> {
        return new DefaultEnumerableIterator(this.selectManyIterator(selector));
    }

    private *selectManyIterator<TResult>(selector: (item: T) => IEnumerable<TResult>) {
        for(let item of this)
            for(let itemx of selector(item))
                yield itemx;
    }

    where(predicate: (item: T) => boolean): IEnumerable<T> {
        return new DefaultEnumerableIterator(this.whereIterator(predicate))
    }

    private *whereIterator(predicate: (item: T) => boolean) {
        for(let item of this)
            if(predicate(item))
                yield item;
    }

    concat(items: Iterable<T>): IEnumerable<T> {
        return new DefaultEnumerableIterator(this.concatIterator(items));
    }

    private *concatIterator(items: Iterable<T>) {
        for(let item of this)
            yield item;

        for(let item of items)
            yield item;
    }

    except(items: Iterable<T>) : IEnumerable<T> {
        return new DefaultEnumerableIterator(this.exceptIterator(items));
    }

    private *exceptIterator(items: Iterable<T>) {
        let set = new Set<T>(items);

        for(let item of this)
            if(!set.has(item))
                yield item;
    }

    intersect(items: Iterable<T>): IEnumerable<T> {
        return new DefaultEnumerableIterator(this.exceptIterator(items));
    }

    private *intersectIterator(items: Iterable<T>) {
        let set = new Set(this);

        for(let item of items)
            if(set.has(item))
                yield item;
    }

    take(count: number): IEnumerable<T> {
        return new DefaultEnumerableIterator(this.takeIterator(count));
    }

    private *takeIterator(count: number) {
        let index = 0;
        for(let item of this)
            if(index++ < count)
                yield item;
    }

    skip(count: number): IEnumerable<T> {
        return new DefaultEnumerableIterator(this.skipIterator(count));
    }

    private *skipIterator(count: number) {
        let index = 0;
        for(let item of this)
            if(index++ >= count)
                yield item;
    }

    reverse() {
        return new DefaultEnumerableIterator(this.reverseIterator());
    }

    private *reverseIterator() {
        let arr = this.toArray();

        for(let i = arr.length - 1; i >= 0; i--)
            yield arr[i];
    }

    groupBy<TKey>(keySelector: (item: T) => TKey) : IEnumerable<[key: TKey, group: IEnumerable<T>]>{
        return new DefaultEnumerableIterator(this.groupByIterator(keySelector));
    }

    private *groupByIterator<TKey>(keySelector: (item: T) => TKey) {
        let keys = new Dictionary<TKey, List<T>>();

        for(let item of this) {
            let key = keySelector(item);

            let existing = keys.getValue(key);
            if(existing == null)
                keys.addOrSet(key, new List([item]));
            else
                existing.add(item);
        }

        for(let kvp of keys)
            yield kvp;
    }

    orderBy(selector: (item: T) => number): IEnumerable<T> {
        return new DefaultEnumerableIterator(this.orderByIterator(selector));
    }

    private *orderByIterator(selector: (item: T) => number) {
        let arr = this.toArray();
        let values = new Array<number>();
        let keys = new Array<number>();

        for(let index in arr) {
            let item = arr[index];
            values.push(selector(item));
            keys.push(+index);
        }

        keys.sort((item1, item2) => values[item1] - values[item2]);

        for(let key of keys)
            yield arr[key];
    }

    orderByDesc(selector: (item: T) => number): IEnumerable<T> {
        return new DefaultEnumerableIterator(this.orderByDescIterator(selector));
    }

    private *orderByDescIterator(selector: (item: T) => number) {
        let arr = this.toArray();
        let values = new Array<number>();
        let keys = new Array<number>();

        for(let index in arr) {
            let item = arr[index];
            values.push(selector(item));
            keys.push(+index);
        }

        keys.sort((item1, item2) => values[item2] - values[item1]);

        for(let key of keys)
            yield arr[key];
    }

    abstract [Symbol.iterator](): Iterator<T>;
    abstract getEnumerator(): Generator<T>;
}
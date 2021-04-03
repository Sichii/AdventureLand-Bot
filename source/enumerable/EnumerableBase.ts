import { Dictionary, DefaultEnumerableIterator, IEnumerable, List, OrderByEnumerableIterator, DefaultComparer, IEqualityComparer } from "../internal";

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

    any(predicate: (item: T) => boolean) {
        for(let item of this)
            if(predicate(item))
                return true;

        return false;
    }

    contains(item: T, comparer: IEqualityComparer<T> = new DefaultComparer<T>()) {
        for(let xItem of this)
            if(xItem != null && comparer.Equals(xItem, item))
                return true;

        return false;
    }

    count(predicate: (item: T) => boolean) {
        let count = 0;
        for(let item of this)
            if(predicate(item))
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

    sumBy(selector: (item: T) => number): number | undefined {
        let result: number | undefined;

        for(let item of this) {
            if(result == null)
                result = 0;

            result += selector(item);
        }

        return result;
    }

    maxBy(selector: (item: T) => number) {
        let best: { item: T, val: number } | undefined;

        for(let item of this) {
            let newVal = selector(item);

            if(best == null || newVal > best.val)
                best = { item: item, val: newVal };
        }

        return best?.item;
    }

    minBy(selector: (item: T) => number) {
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

    reverse() {
        return new DefaultEnumerableIterator(this.reverseIterator());
    }

    private *reverseIterator() {
        let arr = this.toArray();

        for(let i = arr.length - 1; i >= 0; i--)
            yield arr[i];
    }

    orderBy(selector: (item: T) => number): IEnumerable<T> {
        return new OrderByEnumerableIterator(this, selector);
    }

    orderByDesc(selector: (item: T) => number): IEnumerable<T> {
        return this.orderBy(selector).reverse();
    }

    abstract [Symbol.iterator](): Iterator<T>;
    abstract getEnumerator(): Generator<T>;
}
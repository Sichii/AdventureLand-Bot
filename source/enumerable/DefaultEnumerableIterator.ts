import { EnumerableBase } from "../internal";

export class DefaultEnumerableIterator<T> extends EnumerableBase<T> {
    iterator: Iterator<T>;

    constructor(source: IterableIterator<T>) {
        super();
        this.iterator = source;
    }

    next(): IteratorResult<T> {
        return this.iterator.next();
    }
    
    return(item: T): IteratorResult<T> {
        return { done: true, value: item };
    }

    throw(e: any): IteratorResult<T> {
        let next = this.iterator.throw!(e);
        return { done: next.done, value: next.value };
    }

    [Symbol.iterator](): Iterator<T> {
        return this;
    }

    *getEnumerator(): Generator<T> {
        return this;
    }
}
import { EnumerableBase, EqualityComparer, IEnumerable } from "../internal";

export class List<T> extends EnumerableBase<T> {
    private items: T[];

    get length() {
        return this.items.length;
    }

    constructor(enumerable: Iterable<T>);
    constructor(items: Array<T>);
    constructor();
    constructor(...args: Array<any>) {
        super()

        if(args.length === 0)
            this.items = new Array<T>();
        else {
            let arg = args[0];

            if(Array.isArray(arg))
                this.items = arg;
            else { //iterable
                this.items = new Array<T>();
                for(let item of arg)
                    this.items.push(item);
            }
        }
    }

    find(index: number) {
        return this.items[index];
    }

    findIndex(predicate: (item: T) => boolean) {
        let index = 0;

        for (let item of this) {
            if (predicate(item))
                return index;

            index++;
        }

        return -1;
    }

    indexOf(item: T, comparer = EqualityComparer.Default<T>()) {
        let index = 0;

        for(let itemx of this) {
            if(comparer.Equals(item, itemx))
                return index;

            index++;
        }

        return -1;
    }

    add(item: T) {
        this.items.push(item);
    }

    addRange(items: Iterable<T>) {
        for(let item of items)
            this.items.push(item);
    }

    remove(item: T) {
        let index = this.items.indexOf(item);

        if(index === -1)
            return false;

        return this.items.splice(index, 1).length > 0;
    }

    toArray() {
        return this.items;
    }

    [Symbol.iterator](): Iterator<T, any, undefined> {
        return this.getEnumerator();
    }

    *getEnumerator(): Generator<T, any, unknown> {
        for(let item of this.items)
            yield item;
    }
}
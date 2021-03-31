import { EnumerableBase, IEnumerable, DefaultEnumerableIterator } from "../internal";

export class Dictionary<TKey, TValue> extends EnumerableBase<[TKey, TValue]> {
    private items: Map<TKey, TValue>;

    get keys(): IEnumerable<TKey> {
        return new DefaultEnumerableIterator(this.items.keys());  
    }

    get values(): IEnumerable<TValue> {
        return new DefaultEnumerableIterator(this.items.values());   
    }

    constructor(dictionary: Dictionary<TKey, TValue>);
    constructor(items: Map<TKey, TValue>);
    constructor();
    constructor(...args: Array<any>) {
        super();

        if(args.length === 0)
            this.items = new Map<TKey, TValue>();
        else {
            let arg = args[0];

            if(arg instanceof Map)
                this.items = arg;
            else 
                this.items = arg.items;
        }
    }

    addOrSet(key: TKey, value: TValue) {
        this.items.set(key, value);
    }

    remove(key: TKey) {
        return this.items.delete(key);
    }

    getValue(key: TKey) {
        return this.items.get(key) ?? null;
    }

    containsKey(key: TKey) {
        return this.items.has(key);
    }

    [Symbol.iterator](): Iterator<[TKey, TValue], any, undefined> {
        return this.getEnumerator();
    }

    *getEnumerator(): Generator<[TKey, TValue], any, unknown> {
        for(let kvp of this.items)
            yield kvp;
    }
}
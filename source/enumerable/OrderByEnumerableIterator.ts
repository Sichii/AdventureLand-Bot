import { EnumerableBase, IEnumerable } from "../internal";

export class OrderByEnumerableIterator<T> extends EnumerableBase<T> {
    source: IEnumerable<T>;
    iterator?: Iterator<T>;
    value_selector: (item: T) => number;
    index = 0;
    keys: number[] | undefined;

    constructor(source: IEnumerable<T>, value_selector: (item: T) => number, desc = false) {
        super();
        this.value_selector = value_selector;
        this.source = source;
    }

    // the swap function doesn't need to change
    swap(map: number[], firstIndex: number, secondIndex: number) {
        var temp = map[firstIndex];
        map[firstIndex] = map[secondIndex];
        map[secondIndex] = temp;
    }

    // you will need to pass the lookup function into partition
    partition(map: number[], left: number, right: number, lookup: number[]) {
        // here you need to use "lookup" to get the proper pivot value
        var pivot = lookup[map[Math.floor((right + left) / 2)]],
            i = left,
            j = right;

        while (i <= j) {
            // here is where you will do a lookup instead of just "items[i]"
            while (lookup[map[i]] < pivot) {
                i++;
            }
            // also use lookup here
            while (lookup[map[j]] > pivot) {
                j--;
            }

            if (i <= j) {
                this.swap(map, i, j);
                i++;
                j--;
            }
        }

        return i;
    }

    quickSort(map: number[], left: number, right: number, lookup: number[]) {
        var index;

        // performance - don't sort an array with zero or one items
        if (map.length > 1) {
            // fix left and right values - might not be provided
            left = typeof left != "number" ? 0 : left;
            right = typeof right != "number" ? map.length - 1 : right;

            index = this.partition(map, left, right, lookup);

            if (left < index - 1)
                this.quickSort(map, left, index - 1, lookup);

            if (index < right)
                this.quickSort(map, index, right, lookup);
        }
        return map;
    }

    next() {
        if(this.iterator == null)
            this.iterator = this.getEnumerator();

        return this.iterator.next();
    }

    return(item: T) {
        if(this.iterator == null)
            this.iterator = this.getEnumerator();

        return this.iterator.return!(item);
    }

    throw(e: any) {
        if(this.iterator == null)
            this.iterator = this.getEnumerator();

        return this.iterator.throw!(e);
    }

    [Symbol.iterator](): Iterator<T> {
        return this.getEnumerator();
    }

    *getEnumerator(): Generator<T> {
        let items = new Array<T>();

        for(let item of this.source)
            items.push(item);

        let keys = new Array<number>(items.length);
        let map = new Array<number>(items.length);

        for (let index in items) {
            let item = items[index];
            keys[index] = this.value_selector(item);
            map.push(+index);
        }

        this.quickSort(map, 0, map.length - 1, keys);

        for(let key of map) {
            yield items[key];
        }
    }
}
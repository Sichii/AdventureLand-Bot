import { DefaultEqualityComparer } from "../internal";

export class EqualityComparer<T>{
    static Default<T>() {
        return new DefaultEqualityComparer<T>();
    }

    static Create<T>(equalsFunc?: (item1: T, item2: T) => boolean, hashFunc?: (item: T) => number) {
        let def = new DefaultEqualityComparer<T>();

        if(equalsFunc)
            def.Equals = equalsFunc;

        if(hashFunc)
            def.GetHashCode = hashFunc;

        return def;
    }
}
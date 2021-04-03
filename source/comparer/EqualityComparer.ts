import { DefaultComparer } from "../internal";

export class EqualityComparer{
    static Default<T>() {
        return new DefaultComparer<T>();
    }
}
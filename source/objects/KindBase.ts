import { List, StringComparer } from "../internal";

export abstract class KindBase {
    Kind: List<string>;

    constructor() {
        this.Kind = new List<string>();
        this.Kind.add("Kind");
    }

    is(kind: string) {
        return this.Kind.contains(kind, StringComparer.IgnoreCase)
    }

    as<T extends KindBase>(kind: string) {
        if(this.is(kind)) 
            return <T><any>this;

        return null;
    }
}
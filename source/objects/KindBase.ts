export abstract class KindBase {
    Kind: string[];

    constructor() {
        this.Kind = new Array<string>();
        this.Kind.push("Kind");
    }

    is(kind: string) {
        return this.Kind.some(xKind => xKind.toLocaleLowerCase() === kind.toLocaleLowerCase());
    }

    as<T extends KindBase>(kind: string) {
        if(this.is(kind)) 
            return <T><any>this;

        return null;
    }
}
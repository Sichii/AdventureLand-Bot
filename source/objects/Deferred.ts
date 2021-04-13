import { DateExt, DeferredResult, DeferredState } from "../internal";

export class Deferred<T> {
    public promise: Promise<T>;
    public when: DateExt;
    private result: DeferredResult;
    private state: DeferredState;

    private _resolve: Function;
    private _reject: Function;

    constructor() {
        this.state = DeferredState.Pending;
        this.result = DeferredResult.Unresolved;
        this._resolve = (value: any) => { };
        this._reject = (value: any) => { };
        this.when = DateExt.utcNow;

        this.promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
        this.promise.then(
            () => this.state = DeferredState.Fulfilled,
            () => this.state = DeferredState.Rejected
        );
    }

    resolve(value?: any) {
        if (this.result === DeferredResult.Resolved) {
            throw "Deferred cannot be resolved twice";
        }
        this.result = DeferredResult.Resolved;
        this._resolve(value);
    }

    reject(reason?: any) {
        if (this.result === DeferredResult.Resolved) {
            throw "Deferred cannot be resolved twice";
        }
        this.result = DeferredResult.Resolved;
        this._reject(reason);
    }

    isResolved() {
        return this.result === DeferredResult.Resolved;
    }

    isPending() {
        return this.state === DeferredState.Pending;
    }

    isFulfilled() {
        return this.state === DeferredState.Fulfilled;
    }

    isRejected() {
        return this.state === DeferredState.Rejected;
    }
}
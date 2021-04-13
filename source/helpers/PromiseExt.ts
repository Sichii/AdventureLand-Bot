import { DateExt, List, Logger, Utility } from "../internal";

export class PromiseExt {
    static delay(timeoutMs: number) {
        return new Promise<void>(resolve => setTimeout(resolve, timeoutMs));
    }

    static setTimeoutAsync<T>(promise: Promise<T>, msTimeout: number) {
        return Promise.any<T | void>([promise, this.delay(msTimeout)]);
    }

    static async setIntervalAsync(func: () => Promise<any>, msDelay: number, delayedStart = false) {
        let loopFunc = async () => {
            try {
                await func();
            } catch (e) {
                Logger.Error(e);
            } finally {
                await PromiseExt.delay(msDelay);
            }

            loopFunc();
        };

        if (delayedStart === true)
            await PromiseExt.delay(msDelay);

        loopFunc();
    }

    static pollWithTimeoutAsync(func: () => Promise<boolean>, timeoutMs: number) {
        let start = DateExt.utcNow;

        let pollFunc = async () => {
            while (DateExt.utcNow.subtract(start) < timeoutMs) {
                if (await func())
                    return true;
                
                await PromiseExt.delay(25);
            }

            return false;
        }

        return pollFunc();
    }

    static async whenAll<T>(...promises: Promise<T>[]) {
        let results = new Array<T>();
        let errors = new Array<Error>();
        let wrappedPromises = new List(promises);

        await Promise.allSettled(wrappedPromises
            .select(promise => promise
                .then((resolved) => results.push(resolved))
                .catch(rejected => errors.push(new Error(rejected)))
            )
        );

        if(errors.length > 0)
            throw new AggregateError(errors);

        return results;
    }
}
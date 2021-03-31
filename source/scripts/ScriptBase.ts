import { HiveMind, PingCompensatedCharacter, PingCompensatedScript } from "../internal";

export abstract class ScriptBase<T extends PingCompensatedCharacter> extends PingCompensatedScript {
    character :T;

    constructor(character: T, hiveMind: HiveMind) {
        super(character, hiveMind);
        this.Kind.push("ScriptBase");

        this.character = character;
    }
}
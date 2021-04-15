import { Dictionary, ScriptBase, PromiseExt, SETTINGS, PingCompensatedCharacter, Entity, Logger, DateExt, Game } from "../internal";

export class HiveMind extends Dictionary<string, ScriptBase<PingCompensatedCharacter>> {
    boss?: Entity;

    constructor() {
        super();

        PromiseExt.setIntervalAsync(() => this.maintainConnectionAsync(), 5000);
    }

    //#region Reconnect 
    async maintainConnectionAsync() {
        for(let theirMind of this.values) {
            if(theirMind.character.socket.disconnected) {
                try {
                    Logger.Error("Disconnected, attempting to reconnect...");
                    await theirMind.character.disconnect()
                        .catch(() => {});

                    let msSinceLastConnect = DateExt.utcNow.subtract(theirMind.lastConnect);
                    let minimumMs = 1000 * 60;

                    if(msSinceLastConnect < minimumMs)
                        await PromiseExt.delay(minimumMs - msSinceLastConnect);

                    theirMind.lastConnect = DateExt.utcNow;
                    let name = theirMind.character.name;
                    let server = theirMind.character.server;
                    let ctype = theirMind.character.ctype;
                    theirMind.character = <any>await Game.startCharacter(name, server.region, server.name, ctype);
                    theirMind.character.name = name;

                    theirMind.character.socket.on("code_eval", (data: string) => theirMind.commandManager.handleCommand(data));
                 } catch {
                    Logger.Error(`Reconnect failed for ${theirMind.character.name}`);
                 }
            }
        }
    }
    //#endregion

    //#region MonsterHunt
    
    //#endregion
}
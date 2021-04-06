import { Dictionary, ScriptBase, PromiseExt, SETTINGS, PingCompensatedCharacter, Entity } from "../internal";

export class HiveMind extends Dictionary<string, ScriptBase<PingCompensatedCharacter>> {
    boss?: Entity;

    constructor() {
        super();

        PromiseExt.setIntervalAsync(() => this.managePartyAsync(), 5000);
    }

    async managePartyAsync() {
        let merchant = this.getValue(SETTINGS.MERCHANT_NAME);

        if (!merchant)
            return;

        let leader = merchant.character;
        let members = this.values
            .select(script => script.character)
            .where(character => character.id !== leader.id && character.party !== leader.name);

        for(let member of members) {
            leader.sendPartyInvite(member.id)
            await PromiseExt.delay(500);
            await member.acceptPartyInvite(leader.id);
        }
    }
}
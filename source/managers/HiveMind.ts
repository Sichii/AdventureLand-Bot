import { Entity } from "alclient/build/Entity";
import { Dictionary, PingCompensatedScript, PromiseExt, SETTINGS } from "../internal";

export class HiveMind extends Dictionary<string, PingCompensatedScript> {
    targetId?: string;
    lockTarget?: Entity;

    constructor() {
        super();

        PromiseExt.setIntervalAsync(() => this.managePartyAsync(), 5000);
    }

    get leader() {
        return this.getValue(SETTINGS.LEADER_NAME);
    }
    
    get readyToGo() {
        let leader = this.leader;

        if(leader == null || !leader.isConnected)
            return false;

        return SETTINGS.PARTY_INFO
            .keys
            .where(memberName => memberName !== SETTINGS.MERCHANT_NAME)
            .all(memberName => {
            let mind = this.getValue(memberName);

            if(mind == null)
                return false;

            if(leader != null && mind.distance(leader.character) > mind.character.range * 1.25)
                return false;

            return true;
        });
    }

    async managePartyAsync() {
        let leaderScript = this.leader;

        if (!leaderScript)
            return;

        let leader = leaderScript.character;
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
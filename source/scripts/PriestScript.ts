import { SETTINGS, Game, HiveMind, Pathfinder, Priest, PromiseExt, ScriptBase, ServerIdentifier, ServerRegion, Location } from "../internal";

export class PriestScript extends ScriptBase<Priest> {
    constructor(character: Priest, hiveMind: HiveMind) {
        super(character, hiveMind)
        this.Kind.push("PriestScript");
    }

    static async startAsync(name: string, region: ServerRegion, id: ServerIdentifier, hiveMind: HiveMind) {
        let character = await Game.startPriest(name, region, id)
        character.name = name;

        let script = new PriestScript(character, hiveMind);
        script.execute();
        return script;
    }

    execute() {
        this.loopAsync(() => this.mainAsync(), 30);
        this.loopAsync(() => this.handleMovementAsync(), 1000 / 10);
    }

    async mainAsync() {
        if (this.character.rip) {
            this.character.respawn();
            await PromiseExt.delay(2500);
        }else if (await this.defenseAsync())
            await this.offenseAsync();
    }

    async defenseAsync() {
        let healUsed = await this.tryHealPartyAsync();
        return !healUsed;
    }

    async offenseAsync() {
        let target = this.selectTarget(false);

        if (target == null || !this.hiveMind.readyToGo)
            return false;

        if(target.hp > this.character.attack * 4 && this.character.canUse("curse") && this.withinRange(target))
            await this.character.curse(target.id);

        if(this.character.canUse("attack") && this.withinRange(target)) {
            await this.character.basicAttack(target.id);
            return true;
        }

        return false;
    }

    async handleMovementAsync() {
		if(this.character.rip)
			return;

        let leader = this.hiveMind.leader;
        if(leader != null && !this.canSee(leader.character)) {
            await this.character.smartMove(leader.location, { getWithin: SETTINGS.FOLLOW_DISTANCE });
            return false;
        }

        let target = this.selectTarget(false);
        let hasTarget = target != null;

        if(!hasTarget) {
            let pollFunc = () => { 
                target = this.selectTarget(false);
                return target != null; 
            };
            await PromiseExt.pollWithTimeoutAsync(async () => pollFunc(), 1000);
        }

        if(target != null && Pathfinder.canWalkPath(this.location, Location.fromIPosition(target)))
            await this.weightedMoveToEntityAsync(target, this.character.range * 1.25);
        else if(target != null) {
            let smartMove = this.character.smartMove(target, { getWithin: this.character.range / 2 })
                .catch(() => {});

            await PromiseExt.setTimeoutAsync(smartMove, 5000);
        }
    }

    async tryHealPartyAsync() {
        let party = this.hiveMind
            .values
            .where(player => player != null)
            .toList();

        if (party.length > 0) {
            if (this.character.canUse("partyheal")) {
                let lowLimit = SETTINGS.PRIEST_HEAL_AT/2;
                let softLowLimit = SETTINGS.PRIEST_HEAL_AT * 0.75;
                let shouldHeal = party
                    .count(member => member.missingHp > 500 
                        && member.hpPct < softLowLimit) > 1;
    
                if(shouldHeal || party.any(member => member.hpPct < lowLimit))
                    await this.character.partyHeal();
            }

            if (this.character.canUse("heal")) {
                let memberToHeal = party
                    .where(member => member.missingHp > this.character.attack
                        && member.hpPct < SETTINGS.PRIEST_HEAL_AT
                        && this.withinRange(member.character))
                    .orderBy(member => member.hpPct)
                    .firstOrDefault();

                if(memberToHeal != null) {
                    await this.character.heal(memberToHeal.character.id);
                    return true;
                }  
            }
        }

        return false;
    }
}

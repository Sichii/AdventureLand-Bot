import { List } from "../collections/List";
import { SETTINGS, Utility, Game, HiveMind, Pathfinder, PromiseExt, Ranger, ScriptBase, ServerIdentifier, ServerRegion, Location, Dictionary } from "../internal";

export class RangerScript extends ScriptBase<Ranger> {
    constructor(character: Ranger, hiveMind: HiveMind) {
        super(character, hiveMind)
        this.Kind.add("RangerScript");
    }

    static async startAsync(name: string, region: ServerRegion, id: ServerIdentifier, hiveMind: HiveMind) {
        let character = await Game.startRanger(name, region, id)
        character.name = name;

        let script = new RangerScript(character, hiveMind);
        return script;
    }

    async mainAsync() {
        if (this.character.rip) {
            this.character.respawn();
            await PromiseExt.delay(2500);
        } else if (await this.defenseAsync())
            await this.offenseAsync();
    }

    async movementAsync() {
		if(this.settings.assist)
			await this.followTheLeaderAsync();
		else
			await this.leaderMove();
    }

    async defenseAsync() {

        if (this.character.canUse("4fingers")) {
            let lowestPartyMember = this.hiveMind
                .values
                .where(member => this.withinSkillRange(member.character, "4fingers"))
                .minBy(member => member.hpPct);

            if (lowestPartyMember != null && lowestPartyMember.hpPct < SETTINGS.PRIEST_HEAL_AT / 2.5)
                await this.character.fourFinger(lowestPartyMember.character.id);
        }

        return true;
    }

    async offenseAsync() {
        let target = this.target;
        let leader = this.leader;

        if (target == null)
            return false;

        if (this.character.canUse("3shot")) {
            let possibleTargets = this.entities
                .values
                .where(entity => entity != null 
                    && this.withinRange(entity) 
                    && !entity.willBurnToDeath())
                .orderBy(entity => this.distance(entity))
                .toList();

            if (leader != null) {
                let targetingLeader = possibleTargets
                    .where(entity => entity.target === leader?.character.id)
                    .toArray();

                //3shot stuff hitting the leader
                if (targetingLeader.length >= 3)
                    await this.character.threeShot(targetingLeader[0].id, targetingLeader[1].id, targetingLeader[2].id);
            } else if(possibleTargets.length >= 3) {
                let requireCheck = false;
                //stuff that's attacking us
                let targets = possibleTargets
                    .where(entity => entity.target === this.character.id)
                    .toList();

                //stuff that's attacking someone else
                if(targets.length < 3) 
                    targets.addRange(possibleTargets.where(entity => entity.target != null && entity.target !== this.character.id));

                //everything else
                if(targets.length < 3) {
                    targets.addRange(possibleTargets.except(targets));
                    requireCheck = true;
                }

                if(targets.length > 3)
                    targets = targets
                        .take(3)
                        .toList();
                
                //if we're hitting new targets, make sure we can handle it
                if(!requireCheck 
                    || (this.calculateIncomingDamage(targets) <= this.incomingHPS 
                        && (targets.find(0).max_hp < this.character.attack * 2 || targets.all(entity => entity.hp < this.attackVs(entity) * 0.7)))) {
                    await this.character.threeShot(targets.find(0).id, targets.find(1).id, targets.find(2).id);
                    return true;
                }
            }
        }

        if (target.hp > this.character.attack * 10 && this.character.canUse("huntersmark") && this.withinSkillRange(target, "huntersmark"))
            await this.character.huntersMark(target.id);

        if (target.hp > this.character.attack * 5)
            if (target.s.marked && target.s.cursed && this.character.canUse("supershot") && this.withinSkillRange(target, "supershot"))
                await this.character.superShot(target.id);

        if (this.character.canUse("attack") && this.withinRange(target)) {
            await this.character.basicAttack(target.id);
            return true;
        }

        return false;
    }
}
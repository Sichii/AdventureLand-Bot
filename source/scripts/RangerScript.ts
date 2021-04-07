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
            let used = false;

            if (leader != null) {
                let possibleTargets = this.entities
                    .values
                    .where(entity => this.withinRange(entity))
                    .where(entity => entity != null && entity.target == leader?.character.id)
                    .toArray();

                //3shot stuff hitting the leader
                if (possibleTargets.length >= 3)
                    used = (await this.character.threeShot(possibleTargets[0].id, possibleTargets[1].id, possibleTargets[2].id), true);
            }

            //if we didnt already 3shot, see if we can 3shot weak stuff
            if (!used) {
                let possibleTargets = this.entities
                    .values
                    .where(entity => entity != null && this.withinRange(entity))
                    .orderBy(entity => this.distance(entity))
                    .toList();
                let alreadyTargetingUs = possibleTargets
                    .where(entity => entity.target === this.character.id)
                    .toList();
                let targets = alreadyTargetingUs.concat(possibleTargets
                    .except(alreadyTargetingUs))
                    .take(3)
                    .toArray();
                
                let acceptableDamage = this.incomingHPS;
                if (targets.length >= 3 && this.calculatePotentialDamage(targets) <= acceptableDamage && (targets[0].hp < this.character.attack * 2))
                    //prioritize things already attacking us
                    await this.character.threeShot(targets[0].id, targets[1].id, targets[2].id);
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
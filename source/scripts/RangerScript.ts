import { List } from "../collections/List";
import { SETTINGS, Game, HiveMind, Pathfinder, PromiseExt, Ranger, ScriptBase, ServerIdentifier, ServerRegion, Location, Dictionary } from "../internal";

export class RangerScript extends ScriptBase<Ranger> {
    constructor(character: Ranger, hiveMind: HiveMind) {
        super(character, hiveMind)
        this.Kind.push("RangerScript");
    }

    static async startAsync(name: string, region: ServerRegion, id: ServerIdentifier, hiveMind: HiveMind) {
        let character = await Game.startRanger(name, region, id)
        character.name = name;

        let script = new RangerScript(character, hiveMind);
        script.execute();
        return script;
    }

    execute() {
        this.loopAsync(() => this.mainAsync(), 1000 / 30);
        this.loopAsync(() => this.handleMovementAsync(), 1000 / 10);
    }

    async mainAsync() {
        if (this.character.rip) {
            this.character.respawn();
            await PromiseExt.delay(2500);
        } else if (await this.defenseAsync())
            await this.offenseAsync();
    }

    async defenseAsync() {

        if(this.character.canUse("4fingers")) {
            let lowestPartyMember = this.hiveMind
                .values
                .where(member => this.withinSkillRange(member.character, "4fingers"))
                .maxBy(member => 1 - member.hpPct);

            if(lowestPartyMember != null && lowestPartyMember.hpPct < SETTINGS.PRIEST_HEAL_AT/2)
                await this.character.fourFinger(lowestPartyMember.character.id);
        }

		return true;
    }

	//poisonarrow mp:360
	//supershot   mp:400 
	//huntersmark mp:240 (debuff 10s +10% dmg)
	//3shot       mp:300

    async offenseAsync() {
        let target = this.selectTarget(false);
        let leader = this.hiveMind.leader;

        if (target == null || !this.hiveMind.readyToGo)
            return false;

		if(target.hp > this.character.attack * 10 && this.character.canUse("huntersmark") && this.withinSkillRange(target, "huntersmark"))
            await this.character.huntersMark(target.id);

		if(target.hp > this.character.attack * 5)
			if(target.s.marked && target.s.cursed && this.character.canUse("supershot") && this.withinSkillRange(target, "supershot"))
                await this.character.superShot(target.id);

        if(this.character.canUse("3shot")) {
            let used = false;

            if (leader != null) {
                let possibleTargets = this.entities
                    .values
                    .where(entity => entity.target == leader?.character.id)
                    .toArray();

                //3shot stuff hitting the leader
                if (possibleTargets.length >= 3)
                    used = (await this.character.threeShot(possibleTargets[0].id, possibleTargets[1].id, possibleTargets[2].id), true);
            }

            //if we didnt already 3shot, see if we can 3shot weak stuff
            if(!used) {
                let possibleTargets = this.entities
                    .values
                    .where(entity => entity.hp <= this.character.attack * 1.4)
                    .orderBy(entity => this.distance(entity))
                    .toArray();

                if(possibleTargets.length >= 3)
                    await this.character.threeShot(possibleTargets[0].id, possibleTargets[1].id, possibleTargets[2].id)
            }
        }

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
}
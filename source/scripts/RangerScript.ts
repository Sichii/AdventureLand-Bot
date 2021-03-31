import { SETTINGS, Deferred, Game, HiveMind, Pathfinder, PromiseExt, Ranger, ScriptBase, ServerIdentifier, ServerRegion, Utility } from "../internal";

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
		return true;
    }

	//poisonarrow mp:360
	//supershot   mp:400 
	//huntersmark mp:240 (debuff 10s +10% dmg)
	//3shot       mp:300

    async offenseAsync() {
        let target = this.selectTarget(false);

        if (target == null || !this.hiveMind.readyToGo)
            return false;

		if(target.hp > this.character.attack * 10 && this.character.canUse("huntersmark") && this.withinSkillRange(target, "huntersmark"))
            await this.character.huntersMark(target.id);

		if(target.hp > this.character.attack * 5)
			if(target.s.marked && target.s.cursed && this.character.canUse("supershot") && this.withinSkillRange(target, "supershot"))
                await this.character.superShot(target.id);

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

        if(target != null && Pathfinder.canWalkPath(this.location, Utility.getLocation(target)))
            await this.weightedMoveToEntityAsync(target, (this.character.range + this.character.xrange) * 1.25);
        else if(target != null) {
            let smartMove = this.character.smartMove(target, { getWithin: this.character.range / 2 })
                .catch(() => {});

            await PromiseExt.setTimeoutAsync(smartMove, 5000);
        }
    }
}
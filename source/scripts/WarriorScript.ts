import { SETTINGS, Game, HiveMind, PromiseExt, ScriptBase, ServerIdentifier, ServerRegion, Utility, Warrior, Pathfinder } from "../internal";

export class WarriorScript extends ScriptBase<Warrior> {
	constructor(character: Warrior, hiveMind: HiveMind) {
		super(character, hiveMind)
		this.Kind.push("WarriorScript");
	}

	static async startAsync(name: string, region: ServerRegion, id: ServerIdentifier, hiveMind: HiveMind) {
        let character = await Game.startWarrior(name, region, id)
        character.name = name;

        let script = new WarriorScript(character, hiveMind);
        script.execute();
        return script;
    }

	execute() {
		this.loopAsync(() => this.lootAsync(), 1000 * 2);
		this.loopAsync(() => this.mainAsync(), 1000 / 30);
		this.loopAsync(() => this.handleMovementAsync(), 1000 / 10);
	}

	//cleave	mp:720 (hits nearby enemies) -- need AXE

	async mainAsync() {
		if (this.character.rip) {
			this.character.respawn();
			await PromiseExt.delay(2500);

		} else if (await this.defenseAsync())
			await this.offenseAsync();

		return;
	}

	async lootAsync() {
		if(this.character.rip)
			return;

		let index = 0;
		for(let [id, chest] of this.character.chests) {
			if(this.distance(chest) < 100) {
				await this.character.openChest(id);
				index++;
			}

			if(index >= 10)
				break;
		}
	}

	async defenseAsync() {
		if (this.character.moving && this.character.canUse("charge"))
			await this.character.charge();

		if (this.character.canUse("taunt")) {
			for (let [id, entity] of this.character.entities) {
				//TODO: what is taunt's range? seems to only be using it point blank
				if(entity != null && entity.isAttackingPartyMember(this.character) && this.withinSkillRange(entity, "taunt")) {
					await this.character.taunt(id);
					return true;
				}
			}
		}

		return true;
	}

	async offenseAsync() {
		let target = this.selectTarget(true);

		if(target == null || !this.hiveMind.readyToGo)
			return false;

		if(this.character.canUse("attack") && this.withinRange(target)) {
			await this.character.basicAttack(target.id);
			return true;
		}

		return false;
	}

	async handleMovementAsync() {
		if(this.character.rip)
			return;
		
		let target = this.selectTarget(false);

		if(target != null) {
			let distance = this.location.distance(target);

			if(distance < this.character.range * 0.75)
				return;
			else {
				let entityLocation = Utility.getLocation(target);

				if(Pathfinder.canWalkPath(this.location, entityLocation)) {
					let walkTo = entityLocation.point.offsetByAngle(target.angle, this.character.range / 2);
					let lerped = this.point.lerp(walkTo, this.character.speed, this.character.range);

					await this.character.move(lerped.x, lerped.y, true);
				} else {
					await this.character.smartMove(entityLocation, { getWithin: this.character.range });
				}
			}
		} else {
			let hasTarget = await PromiseExt.pollWithTimeoutAsync(async () => this.selectTarget(true) != null, 2000);

			if(!hasTarget)
				await this.character.smartMove(SETTINGS.ATTACK_MTYPES.first(), { getWithin: 400 });
		}
	}
}

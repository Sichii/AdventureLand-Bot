import { SETTINGS, Game, HiveMind, PromiseExt, ScriptBase, ServerIdentifier, ServerRegion, Location, Warrior, Pathfinder, List, Dictionary, Utility, Point } from "../internal";

export class WarriorScript extends ScriptBase<Warrior> {
	constructor(character: Warrior, hiveMind: HiveMind) {
		super(character, hiveMind)
		this.Kind.add("WarriorScript");
	}

	static async startAsync(name: string, region: ServerRegion, id: ServerIdentifier, hiveMind: HiveMind) {
		let character = await Game.startWarrior(name, region, id)
		character.name = name;

		let script = new WarriorScript(character, hiveMind);
		return script;
	}

	async mainAsync() {
		if (this.character.rip) {
			this.character.respawn();
			await PromiseExt.delay(2500);

		} else if (await this.defenseAsync())
			await this.offenseAsync();

		return;
	}

	async movementAsync(){
		if(this.settings.assist)
			await this.followTheLeaderAsync();
		else
			await this.leaderMove();
	}

	async defenseAsync() {
		if (this.character.canUse("hardshell") && !this.character.s.fingered) {
			if (this.hpPct < (SETTINGS.PRIEST_HEAL_AT / 2)) {
				let target = this.target;

				if (target != null && target.damage_type === "physical")
					await this.character.hardshell();
			}
		}

		if (this.character.canUse("taunt")) {
			for (let [id, entity] of this.character.entities) {
				//TODO: what is taunt's range? seems to only be using it point blank
				if (entity != null && entity.target != this.character.id && entity.isAttackingPartyMember(this.character) && this.withinSkillRange(entity, "taunt")) {
					await this.character.taunt(id)
						.catch(() => {});
					return true;
				}
			}
		}

		if (this.character.moving && this.character.canUse("charge"))
			await this.character.charge();

		return true;
	}

	async offenseAsync() {
		let target = this.target;

		if (target == null)
			return false;

		//need to be careful about using this, can kill ourselves pretty easily
		if (this.character.canUse("cleave")) {
			let cleaveRange = Game.G.skills["cleave"].range!;
			let entitiesInRange = this.entities
				.values
				.where(entity => this.distance(entity) < cleaveRange)
				.toList();

			//only worth cleaving if we're going to hit more stuff
			if (entitiesInRange.length >= 3) {
				let expectedIncomingDps = this.calculateIncomingDamage(entitiesInRange.toArray());

				//if we expect more hps than incomming dps, we can cleave
				//or everything in range is already targeting me
				//safety margin of hppots, partyHeal, and hardShell
				if (expectedIncomingDps < this.incomingHPS || entitiesInRange.all(entity => entity.target === this.character.id))
					await this.character.cleave();
			}
		}

		if (this.character.canUse("attack") && this.withinRange(target)) {
			await this.character.basicAttack(target.id);
			return true;
		}

		return false;
	}
}

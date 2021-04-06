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
		script.execute();
		return script;
	}

	execute() {
		this.loopAsync(() => this.mainAsync(), 1000 / 30);
		this.loopAsync(() => this.handleMovementAsync(), 1000 / 10, false, true);
	}

	async mainAsync() {
		if (this.character.rip) {
			this.character.respawn();
			await PromiseExt.delay(2500);

		} else if (await this.defenseAsync())
			await this.offenseAsync();

		return;
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
				let expectedIncommingDps = entitiesInRange
					.sumBy(entity => entity.attack * entity.frequency)!;
				let sample = entitiesInRange.elementAt(0)!;
				let damageType = sample.damage_type;

				if (sample.type === "pppompom" || sample.type === "fireroamer")
					expectedIncommingDps += (entitiesInRange.length * 400);

				let armor = this.character.armor + (this.character.level * 2.5);
				let resistance = this.character.resistance;

				if (this.character.s.hardshell)
					armor -= Game.G.conditions.hardshell.armor!;
				if (this.character.s.fingered)
					resistance -= Game.G.conditions.fingered.resistance!;

				//calculate how much dps we expect to take if we cleave
				if (damageType === "physical") {
					//TODO: replace '11' with actual courage
					if (entitiesInRange.length > 11)
						expectedIncommingDps *= 2;

					let pierce = sample.apiercing ?? 0;
					expectedIncommingDps *= Utility.calculateDamageMultiplier(armor - pierce);
				} else {
					//TODO: replace '2' with actual mcourage
					if (entitiesInRange.length > 2)
						expectedIncommingDps *= 2;

					let pierce = sample.rpiercing ?? 0;
					expectedIncommingDps *= Utility.calculateDamageMultiplier(resistance - pierce);
				}

				//calculate the amount of hps we should expect to receive from the priest
				let priest = this.followers.firstOrDefault(script => script?.character.ctype === "priest");
				let possibleHps = 0;

				if (priest != null)
					possibleHps += (priest.character.level * 2.5) + (priest.character.attack * priest.character.frequency);
				else
					possibleHps = 300;

				//if we expect more hps than incomming dps, we can cleave
				//or everything in range is already targeting me
				//safety margin of hppots, partyHeal, and hardShell
				if (expectedIncommingDps < possibleHps || entitiesInRange.all(entity => entity.target === this.character.id))
					await this.character.cleave();
			}
		}

		if (this.character.canUse("attack") && this.withinRange(target)) {
			await this.character.basicAttack(target.id);
			return true;
		}

		return false;
	}

	async handleMovementAsync(){
		if(this.settings.assist)
			await this.followTheLeaderAsync();
		else
			await this.leaderMove();
	}
}

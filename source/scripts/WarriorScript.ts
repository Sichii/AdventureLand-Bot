import { Logger, SETTINGS, Game, HiveMind, PromiseExt, ScriptBase, ServerIdentifier, ServerRegion, Location, Warrior, Pathfinder, List, Dictionary, Utility, Point, ItemInfo } from "../internal";

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
			return await PromiseExt.delay(2500);
		}

		if (this.character.s.fingered)
			return await PromiseExt.delay(250);

		if (await this.defenseAsync() && this.destination == null && this.readyToGo)
			await this.offenseAsync();

		return;
	}

	async movementAsync() {
		if (this.settings.assist)
			await this.assistMove();
		else
			await this.leaderMove();
	}

	async defenseAsync() {
		let target = this.target;

		const shouldUseDefensive = () => {
			if (this.hpPct < SETTINGS.PRIEST_HEAL_AT) {

				if (target != null && (this.calculateIncomingDPS(false, true) * 2) > this.character.hp)
					return true;

				return false;
			}
		}

		if (shouldUseDefensive()) {
			if (target!.damage_type === "physical" && this.character.canUse("hardshell")) {
				await this.character.hardshell();
			} else if (this.character.s.hardshell == null && this.character.canUse("stomp", { ignoreEquipped: true }))
				await this.useSkill(() => this.character.stomp(), "basher");
		}

		if (this.character.canUse("taunt")) {
			for (let [id, entity] of this.character.entities) {
				//TODO: what is taunt's range? seems to only be using it point blank
				if (entity != null && entity.target != this.character.id && entity.isAttackingPartyMember(this.character) && this.withinSkillRange(entity, "taunt")) {
					await this.character.taunt(id);
					return true;
				}
			}
		}

		if (this.character.moving && this.character.canUse("charge"))
			await this.useSkill(() => this.character.charge());

		return true;
	}

	async offenseAsync() {
		let target = this.target;

		if (target == null)
			return false;

		//need to be careful about using this, can kill ourselves pretty easily
		if (this.character.canUse("cleave", { ignoreEquipped: true }) && this.okToUseMultiTargetSkills) {
			let entitiesWithinSafeRange = this.entities
				.values
				.where(entity => this.withinSkillRange(entity, "cleave", this.settings.safeRangeCheckEnabled))
				.toList();
			let entitiesWithinRange = entitiesWithinSafeRange
				.where(entity => this.withinSkillRange(entity, "cleave"))
				.toList();

			//if there are enemies sitting in the larger range that arent in the inner range, let's not cleave for safety reasons
			//only worth cleaving if we're going to hit more stuff
			if (entitiesWithinRange.length === entitiesWithinSafeRange.length && entitiesWithinSafeRange.length >= 3) {
				//if we expect more hps than incomming dps, we can cleave
				//or everything in range is already targeting me
				//safety margin of hppots, partyHeal, and hardShell
				let incDps = this.calculateIncomingDPS(true, false, entitiesWithinSafeRange);
				let incHps = this.calculateIncomingHPS();

				if (incDps < incHps || entitiesWithinSafeRange.all(entity => entity.target != null && entity.target === this.character.id)) {
					if(incDps > incHps)
						Logger.Warn(`Cleaved while incDps: ${incDps.toFixed(0)}, incHps: ${incHps.toFixed(0)}`);
					await this.useSkill(() => this.character.cleave(), "axe");
				}
			}
		}

		if (this.character.canUse("attack") && this.withinRange(target)) {
			await this.character.basicAttack(target.id);
			return true;
		}

		return false;
	}
}

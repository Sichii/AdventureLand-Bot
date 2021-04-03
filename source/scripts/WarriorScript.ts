import { Tools } from "alclient";
import { Utility } from "../definitions/Utility";
import { SETTINGS, Game, HiveMind, PromiseExt, ScriptBase, ServerIdentifier, ServerRegion, Location, Warrior, Pathfinder, List, Dictionary } from "../internal";

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

	//cleave	mp:720 (hits nearby enemies) -- need AXEa

	async mainAsync() {
		if (this.character.rip) {
			this.character.respawn();
			await PromiseExt.delay(2500);

		} else if (await this.defenseAsync())
			await this.offenseAsync();

		return;
	}

	async lootAsync() {
		if (this.character.rip || this.character.chests.size == 0)
			return;

		let midasSlot = this.character.locateItem("handofmidas");
		let merchant = this.hiveMind.getValue(SETTINGS.MERCHANT_NAME);
		let midasEquipped = false;
		//equip handofmidas only when merchant isnt nearby
		if(midasSlot != null && (merchant == null || !this.canSee(merchant.character))) {
			midasEquipped = true;
			await this.character.equip(midasSlot);
		}

		let index = 0;
		for (let [id, chest] of this.character.chests) {
			if (this.distance(chest) < 100) {
				await this.character.openChest(id);
				index++;
			}

			if (index >= 10)
				break;
		}

		//equip whatever gloves we had on before handofmidas
		if(midasEquipped)
			await this.character.equip(midasSlot);
	}

	async defenseAsync() {
		if (this.character.moving && this.character.canUse("charge"))
			await this.character.charge();

		if (this.character.canUse("taunt")) {
			for (let [id, entity] of this.character.entities) {
				//TODO: what is taunt's range? seems to only be using it point blank
				if (entity != null && entity.target != this.character.id && entity.isAttackingPartyMember(this.character) && this.withinSkillRange(entity, "taunt")) {
					await this.character.taunt(id);
					return true;
				}
			}
		}

		if (this.character.canUse("hardshell")) {
			if (this.hpPct < (SETTINGS.HP_POT_AT * 0.66)) {
				let target = this.selectTarget(false);

				if (target != null) {
					let gEntity = Game.G.monsters[target.type];

					if (gEntity.damage_type === "physical")
						await this.character.hardshell();
				}
			}
		}

		return true;
	}

	async offenseAsync() {
		let target = this.selectTarget(true);

		if (target == null || !this.hiveMind.readyToGo)
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

				//calculate how much dps we expect to take if we cleave
				if (damageType === "physical") {
					//TODO: replace '11' with actual courage
					if (entitiesInRange.length > 11)
						expectedIncommingDps *= 2;

					let pierce = sample.apiercing ?? 0;
					expectedIncommingDps *= Utility.calculateDamageMultiplier(this.character.armor - pierce);
				} else {
					//TODO: replace '2' with actual mcourage
					if (entitiesInRange.length > 2)
						expectedIncommingDps *= 2;

					let pierce = sample.rpiercing ?? 0;
					expectedIncommingDps *= Utility.calculateDamageMultiplier(this.character.resistance - pierce);
				}

				//calculate the amount of hps we should expect to receive from the priest
				let priest = this.hiveMind.values.firstOrDefault(mind => mind.character.ctype === "priest")
				let possibleHps = 250;

				if (priest != null)
					possibleHps += (priest.character.attack * priest.character.frequency);

				//if we expect more hps than incomming dps, we can cleave
				//safety margin of hppots, partyHeal, and hardShell
				if (expectedIncommingDps < possibleHps)
					await this.character.cleave();
			}
		}

		if (this.character.canUse("attack") && this.withinRange(target)) {
			await this.character.basicAttack(target.id);
			return true;
		}

		return false;
	}

	async handleMovementAsync() {
		if (this.character.rip)
			return;

		let target = this.selectTarget(false);

		if (target != null) {
			let distance = this.location.distance(target);

			if (distance < this.character.range * 0.75)
				return;
			else {
				let entityLocation = Location.fromIPosition(target);

				if (Pathfinder.canWalkPath(this.location, entityLocation)) {
					let walkTo = entityLocation.point.offsetByAngle(target.angle, this.character.range / 2);
					let lerped = this.point.lerp(walkTo, this.character.speed, this.character.range);

					await this.character.move(lerped.x, lerped.y, true)
						.catch(() => { });
				} else {
					await this.character.smartMove(entityLocation, { getWithin: this.character.range });
				}
			}
		} else {
			let hasTarget = await PromiseExt.pollWithTimeoutAsync(async () => this.selectTarget(true) != null, 2000);

			if (!hasTarget)
				await this.character.smartMove(SETTINGS.ATTACK_MTYPES.first(), { getWithin: 400 });
		}
	}
}

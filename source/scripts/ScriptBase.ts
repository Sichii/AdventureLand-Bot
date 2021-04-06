import { Entity, HiveMind, PingCompensatedCharacter, PingCompensatedScript, SETTINGS, Location, Dictionary, Game, List, Pathfinder, Point, PromiseExt, Utility, WeightedCircle, CommandManager, MonsterName, Logger, StringComparer, Player, Deferred } from "../internal";

export abstract class ScriptBase<T extends PingCompensatedCharacter> extends PingCompensatedScript {
    character: T;
    hiveMind: HiveMind;
    commandManager: CommandManager;
    target?: Entity;

    get settings() {
        return SETTINGS.PARTY_SETTINGS.getValue(this.character.name)!;
    }

    get leader() {
        let ourSettings = this.settings;
        if (ourSettings?.assist != null)
            return this.hiveMind.getValue(ourSettings.assist);

        return null;
    }

    get readyToGo() {
        for (let [name, settings] of SETTINGS.PARTY_SETTINGS) {
            if (settings.assist == null || settings.assist !== this.character.name)
                continue;

            let follower = this.hiveMind.getValue(name);

            if (follower == null || follower.distance(this.character) > Math.max(follower.character.range * 2, 200))
                return false;
        }

        return true;
    }

    get followers() {
        return SETTINGS.PARTY_SETTINGS
            .where(([, settings]) => settings.assist != null && settings.assist === this.character.name)
            .select(([name,]) => this.hiveMind.getValue(name))
            .toList();
    }

    constructor(character: T, hiveMind: HiveMind) {
        super(character);
        this.Kind.add("ScriptBase");
        this.character = character;
        this.commandManager = new CommandManager(this);
        this.hiveMind = hiveMind;
        this.hiveMind.addOrSet(character.name, this);

        if (this.character.ctype !== "merchant") {
            this.loopAsync(() => this.lootAsync(), 1000 * 2);
            this.loopAsync(async () => this.selectTarget(), 1000 / 30);
        }

        this.character.socket.on("code_eval", (data: string) => this.commandManager.handleCommand(data));
        this.character.socket.on("disconnect", () => this.reconnect());
    }

    async reconnect() {
        Logger.Error("Disconnected, attempting to reconnect...");
        await this.character.disconnect();

        let timeSinceLastConnect = Utility.msSince(this.lastConnect);
        if (timeSinceLastConnect < 1000 * 60)
            await PromiseExt.delay(timeSinceLastConnect);

        await this.character.connect()
            .catch(() => { });
        this.character.socket.on("code_eval", (data: string) => this.commandManager.handleCommand(data));
        this.character.socket.on("disconnect", () => this.reconnect());
    }

    async lootAsync() {
        if (this.character.rip || this.character.chests.size == 0 || this.settings.assist != null)
            return;

        let midasSlot = this.character.locateItem("handofmidas",);

        try {
            let merchant = this.hiveMind.getValue(SETTINGS.MERCHANT_NAME);
            let midasEquipped = false;
            //equip handofmidas only when merchant isnt nearby
            if (midasSlot != null && (merchant == null || !this.canSee(merchant.character))) {
                await this.character.equip(midasSlot)
                    .finally(() => midasEquipped = this.character.slots.gloves.name === "handofmidas");
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
        } finally {
            //equip whatever gloves we had on before handofmidas
            if (midasSlot != null && this.character.slots.gloves.name === "handofmidas")
                await this.character.equip(midasSlot);
        }
    }

    selectTarget() {
        const setTarget = (target?: Entity) => {
            this.target = target;

            if (target != null && SETTINGS.ATTACKABLE_BOSSES.contains(target.type, StringComparer.IgnoreCase))
                this.hiveMind.boss = target;

            return;
        }

        if (this.settings.assist != null) {
            let leader = this.leader;

            if (leader == null)
                return;

            this.target = leader.target;
        } else {
            if (!this.readyToGo)
                return;

            if (this.target != null) {
                let boss = this.hiveMind.boss;
                let currentTarget = this.entities
                    .values
                    .firstOrDefault(entity => entity.id === this.target!.id);

                //if we're targeting the boss and we either cant see where it's supposed to be, or it is in or entity list
                if (boss != null && (!this.canSee(boss) || currentTarget != null))
                    return setTarget(boss);
                else if (boss != null && this.canSee(boss) && currentTarget == null)
                    this.hiveMind.boss = undefined;

                if (currentTarget != null)
                    return setTarget(currentTarget);
            }

            let current: { target: Entity, location: Location, canPath: boolean } | undefined;
            let attackableTypes = SETTINGS.ATTACKABLE_BOSSES.concat(this.settings.attackMTypes!).toList();
            for (let [, entity] of this.entities) {
                if (entity == null || !attackableTypes.contains(entity.type, StringComparer.IgnoreCase) || entity.hp <= 0)
                    continue;

                //if it's targeting a party member, target it
                if (entity.isAttackingPartyMember(this.character) && this.canSee(entity))
                    return setTarget(entity);

                let entityLocation = Location.fromIPosition(entity);

                if (current == null) {
                    current = { target: entity, location: entityLocation, canPath: Pathfinder.canWalkPath(this.location, entityLocation) };
                    continue;
                }

                let canPath = Pathfinder.canWalkPath(this.location, entityLocation);

                if (canPath) {
                    if (entity.xp > current.target.xp * 3) {
                        current = { target: entity, location: entityLocation, canPath: canPath };
                        continue;
                    }

                    if (entity.xp === current.target.xp && this.point.distance(current.location) > this.point.distance(entityLocation)) {
                        current = { target: entity, location: entityLocation, canPath: canPath };
                        continue;
                    }

                    //this is to check the first assignment, since it could be anything
                    //if we cant path to the current target, and the current target doesnt fit the condition for attacking something we cant path to (BELOW)
                    //then we take this instead
                    if (!current.canPath && current.target.xp < entity.xp * 10) {
                        current = { target: entity, location: entityLocation, canPath: canPath };
                        continue;
                    }
                } else if (entity.xp > current.target.xp * 10) {
                    current = { target: entity, location: entityLocation, canPath: canPath };
                    continue;
                }
            }

            return setTarget(current?.target);
        }
    }

    async weightedMoveToEntityAsync(entity: Entity, maxDistance: number) {
        let location = Location.fromIPosition(entity);

        let circle = new WeightedCircle(location, maxDistance, maxDistance / 10);
        let entities = this.entities
            .values
            .where(xEntity => xEntity != null && xEntity.id !== entity.id)
            .toList();
        let players = new Dictionary(this.character.players)
            .values
            .where(xPlayer => xPlayer != null && !xPlayer.npc && xPlayer.id !== this.character.id)
            .toList();

        circle.applyWeight(entities, players, this.point);

        let bestPoint = circle.orderBy(entry => entry.weight).firstOrDefault(entry => Pathfinder.canWalkPath(entry.location, this.location))?.location;

        if (bestPoint != null)
            await this.character.move(bestPoint.x, bestPoint.y, true)
                .catch(() => { });
        else
            await this.smartMove(location, { getWithin: this.character.range });

        return Promise.resolve();
    }

    async followTheLeaderAsync() {
        if (this.character.rip)
            return;

        let leader = this.leader;
        if (leader == null)
            return;

        if (leader.destination != null) {
            //if we're already there, just wait
            if (this.distance(leader.destination) < this.character.range)
                return;

            await this.smartMove(leader.destination, { getWithin: this.character.range });
            return;
        }

        if (!this.withinRange(leader.character, this.character.range * 2)) {
            await this.pathToCharacter(leader, this.character.range);
            return;
        }

        let target = this.target;
        let hasTarget = target != null;
        if (!hasTarget) {
            const pollFunc = () => {
                target = this.target;
                return target != null;
            };
            await PromiseExt.pollWithTimeoutAsync(async () => pollFunc(), 1000);
        }

        if (target != null && Pathfinder.canWalkPath(this.location, target))
            await this.weightedMoveToEntityAsync(target, this.character.range);
        else if (target != null)
            await this.smartMove(target, { getWithin: this.character.range / 2 })
    }

    async leaderMove() {
        if (this.character.rip || !this.readyToGo)
            return;

        let target = this.target;

        if (target != null) {
            let distance = this.location.distance(target);

            //TODO: ADD KITING LOGIC IF RANGE IS HIGH ENOUGH
            if (distance < this.character.range * 0.75)
                return;
            else {
                let entityLocation = Location.fromIPosition(target);

                if (Pathfinder.canWalkPath(this.location, entityLocation)) {
                    let walkTo = entityLocation.point.offsetByAngle(target.angle, this.character.range / 2);
                    let lerped = this.point.lerp(walkTo, this.character.speed, this.character.range);

                    await this.character.move(lerped.x, lerped.y, true)
                        .catch(() => { });
                } else
                    await this.smartMove(entityLocation, { getWithin: this.character.range });
            }
        } else {
            //if we dont get a target within a reasonable amount of time
            let hasTarget = await PromiseExt.pollWithTimeoutAsync(async () => this.target != null, 1000);

            if (!hasTarget) {
                //pick a new random spawnpoint for the monster we're after
                let possibleSpawns = new List(Game.G.maps[this.character.map].monsters)
                    .where(monster => monster.type === this.settings.attackMTypes!.first())
                    .toList();

                if (possibleSpawns.length == 0) {
                    //no possible spawns on this map, so we're probably not on the right map
                    await this.smartMove(this.settings.attackMTypes!.first());
                    return;
                }

                let goTo = possibleSpawns
                    .where(spawn => spawn.boundary != null)
                    .select(spawn => {
                        let point1 = new Point(spawn.boundary![0], spawn.boundary![1]);
                        let point2 = new Point(spawn.boundary![2], spawn.boundary![3]);
                        let midPoint = Utility.midPoint(point1, point2);

                        return midPoint;
                    })
                    .orderBy(() => Math.random())
                    .firstOrDefault();

                if (goTo)
                    await this.smartMove(new Location(goTo, this.character.map), { getWithin: 300 });
            }
        }
    }

    async pathToCharacter(script: ScriptBase<PingCompensatedCharacter>, distance: number) {
        while (true) {
            let startingLocation = Location.fromIPosition(script.character);
            let deferred = new Deferred();
            this.smartMove(script.character, { getWithin: distance })
                .catch(() => { })
                .finally(() => deferred.resolve());

            while (!deferred.isResolved()) {
                if (startingLocation.distance(script.character) > distance * 2)
                    break;
                else
                    await PromiseExt.delay(100);
            }

            if (this.distance(script.character) < distance + 50)
                break;
        }
    }

    calculatePotentialDamage(possibleTargets: Entity[]) {
        let targets = new List(possibleTargets);

        if(!targets.any())
            return 0;

        let expectedIncommingDps = targets
            .sumBy(entity => entity.attack * entity.frequency)!;
        let sample = targets.find(0);
        let damageType = sample.damage_type;

        if (sample.type === "pppompom" || sample.type === "fireroamer")
            expectedIncommingDps += (targets.length * 600);

        let armor = this.character.armor + (this.character.level * 2.5);
        let resistance = this.character.resistance;

        if (this.character.s.hardshell)
            armor -= Game.G.conditions.hardshell.armor!;
        if (this.character.s.fingered)
            resistance -= Game.G.conditions.fingered.resistance!;

        //calculate how much dps we expect to take if we cleave
        if (damageType === "physical") {
            if (targets.length > this.character.courage)
                expectedIncommingDps *= 2;

            let pierce = sample.apiercing ?? 0;
            expectedIncommingDps *= Utility.calculateDamageMultiplier(armor - pierce);
        } else if(damageType === "magical") {
            if (targets.length > this.character.mcourage)
                expectedIncommingDps *= 2;

            let pierce = sample.rpiercing ?? 0;
            expectedIncommingDps *= Utility.calculateDamageMultiplier(resistance - pierce);
        } else {
            if (targets.length > this.character.pcourage)
            expectedIncommingDps *= 2;
        }

        return expectedIncommingDps;
    }
}
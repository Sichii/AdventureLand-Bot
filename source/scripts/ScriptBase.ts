import { Entity, HiveMind, PingCompensatedCharacter, PingCompensatedScript, SETTINGS, Location, Dictionary, Game, List, Pathfinder, Point, PromiseExt, Utility, WeightedCircle, CommandManager, MonsterName, Logger, StringComparer, Player, Deferred } from "../internal";

export abstract class ScriptBase<T extends PingCompensatedCharacter> extends PingCompensatedScript {
    character: T;
    hiveMind: HiveMind;
    commandManager: CommandManager;

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

            if (follower == null || follower.distance(this.character) > Math.max(follower.range * 2, 200))
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

    get nearbyPriest() {
        return this.players
        .values
        .firstOrDefault(player => player.ctype === "priest" && player.party === this.character.party); 
    }

    get incomingHPS() {
        let hps = 200;
        //rough calculation, doesnt take into account armor/resist/etc
        hps += (this.character.attack * this.character.frequency * (this.character.lifesteal/100));

        let nearbyPriest = this.nearbyPriest;
        if(nearbyPriest)
            hps += (nearbyPriest.attack * nearbyPriest.frequency);

        return hps;
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

        this.loopAsync(() => this.mainAsync(), this.settings.mainInterval);
        this.loopAsync(() => this.movementAsync(), this.settings.movementInterval, false, true);

        this.character.socket.on("code_eval", (data: string) => this.commandManager.handleCommand(data));
        this.character.socket.on("disconnect", () => this.reconnect());
    }

    abstract mainAsync(): Promise<void>;
    abstract movementAsync(): Promise<void>;

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
            if (midasSlot != null && (merchant == null || !this.shouldSee(merchant.character))) {
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

            let beingAttacked = this.isBeingAttacked;
            if (this.target != null) {
                let boss = this.hiveMind.boss;
                let currentTarget = this.entities
                    .values
                    .firstOrDefault(entity => entity.id === this.target!.id);

                //if we can see our target
                if(currentTarget != null) {
                    //if we're targeting the boss
                    if(boss != null && boss.id === currentTarget.id)
                        return setTarget(boss);

                    //if it wont burn to death, keep attacking it
                    if(!currentTarget.willBurnToDeath())
                        return setTarget(currentTarget);

                    return setTarget(undefined);
                } else { //we cant see our target
                    //we should be attacking the boss
                    if(boss != null) {
                        //we should see the boss but we dont
                        if(this.shouldSee(boss)) {
                            this.hiveMind.boss = undefined;
                            this.target = undefined;
                        } else 
                            return setTarget(boss);
                    }

                    //we cant see our target
                    return setTarget(undefined);
                }
            //if we dont have a target, we should be attacking a boss, and we arent being attacked by something else
            } else if(this.hiveMind.boss != null && !beingAttacked)
                return setTarget(this.hiveMind.boss);

            let current: { target: Entity, location: Location, canPath: boolean } | undefined;
            let attackableTypes = SETTINGS.ATTACKABLE_BOSSES.concat(this.settings.attackMTypes!).toList();
            for (let [, entity] of this.entities) {
                if (entity == null 
                    || !attackableTypes.contains(entity.type, StringComparer.IgnoreCase) 
                    || (entity.hp <= 0) 
                    || entity.willBurnToDeath())
                    continue;

                //if it's targeting a party member and we can see it, 
                //AND either we're not kiting, or it's in range
                if (entity.isAttackingPartyMember(this.character) && (!this.settings.kite || this.withinRange(entity)) && this.shouldSee(entity))
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

    async weightedMoveToEntityAsync(entity: Entity, maxDistance: number, ignoreMonsters = false) {
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

        circle.applyWeight(entities, players, this.point, ignoreMonsters);

        let bestPoint = circle.orderBy(entry => entry.weight).firstOrDefault(entry => Pathfinder.canWalkPath(entry.location, this.location))?.location;

        if (bestPoint != null)
            await this.character.move(bestPoint.x, bestPoint.y, true)
                .then(undefined, () => {})
                .catch(() => { });
        else
            await this.smartMove(location, { getWithin: this.range });
    }

    async followTheLeaderAsync() {
        if (this.character.rip)
            return;

        let leader = this.leader;
        if (leader == null)
            return;

        if (leader.destination != null) {
            await this.smartMove(leader.destination, { getWithin: this.range });
            return;
        }

        if (!this.withinRange(leader.character, this.range * 2)) {
            await this.pathToCharacter(leader, this.range);
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
            await this.weightedMoveToEntityAsync(target, this.range);
        else if (target != null)
            await this.smartMove(target, { getWithin: this.range / 2 })
    }

    async leaderMove() {
        if (this.character.rip || !this.readyToGo)
            return;

        let target = this.target;

        if (target != null) {
            if(Pathfinder.canWalkPath(this.location, target)) {
                let isBoss = SETTINGS.ATTACKABLE_BOSSES.contains(target.type);
                let attackingWarrior = target.target != null && this.players.getValue(target.target)?.ctype === "warrior" && target.target != this.character.id;

                if((!isBoss || !attackingWarrior) && this.settings.kite && this.character.speed > target.speed && this.range > 100 && this.range > target.range)
                    if(await this.circleKiteAsync())
                        return;
            }
            else
                return await this.smartMove(target, { getWithin: this.range });

            let distance = this.distance(target);

            if (distance < this.range * 0.75 && !this.settings.kite)
                return;
            else 
                await this.weightedMoveToEntityAsync(target, this.range, true);
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

    async circleKiteAsync() {
        let target = this.target;

        if(target == null)
            return false;

        //we want to generally be in range of whatever we target
        //we can do bigger circles if the monster is faster
        let maxRadius = (this.range/2) + (target.range/2);

        //get the closest spawn bounds of our target monster
        //get the center point, and smallest dimension of those bounds
        //we will use the center for circleCenter and the smallest dimension / 2 as the radius
        let circle = new List(Game.G.maps[this.character.map].monsters)
            .where(monster => monster.type === target?.type)
            .select(monster => {
                let allBoundaries: List<[number, number, number, number]>;
                if(monster.boundaries != null)
                    allBoundaries = new List(monster.boundaries)
                        .select(([_, tlX, tlY, brX, brY]) => <[number, number, number, number]>[tlX, tlY, brX, brY])
                        .toList();
                else if(monster.boundary != null)
                    allBoundaries = new List([monster.boundary]);
                else
                    return null;

                //get closest set of boundaries for the monster we're targeting
                return allBoundaries
                    .select(([tlX, tlY, brX, brY]) => { 
                        return { 
                            center: Utility.midPoint(new Point(tlX, tlY), new Point(brX, brY)),
                            radius: Math.min(Math.abs(tlX - brX), Math.abs(tlY - brY)) / 2.1
                        }
                    })
                    .where(set => set.radius > this.range/3)
                    .minBy(set => set.center.distance(target!));
            })
            .where(set => set != null)
            .where(set => set!.radius > this.range/3)
            .minBy(set => set!.center.distance(target!));

        if(circle == null)
            return false;
        
        //set a max radius so things stay in range longer
        circle.radius = Math.min(circle.radius, maxRadius);
        let currentAngle = this.point.angularRelationTo(circle.center);
        let walkToAngle = currentAngle;

        //walk to a point x degrees around the circumference of the circle from us
        let walkToPoint: Point | undefined;

        for(let degree = 0; degree < 360; degree += SETTINGS.CIRCULAR_KITE_DEGREE_INTERVAL) {
            walkToAngle += SETTINGS.CIRCULAR_KITE_DEGREE_INTERVAL;

            if(walkToAngle > 180)
                walkToAngle -= 360;

            let tryWalkToPoint = circle.center.offsetByAngle(walkToAngle, circle.radius);

            if(Pathfinder.canWalkPath(this.location, new Location(tryWalkToPoint, this.character.map))) {
                walkToPoint = tryWalkToPoint;
                break;
            }
        }

        if(walkToPoint != null) {
            //if we kite out of range, pick a new target
            //this is down here so that we continue circle kiting even if we change target
            if(this.distance(target) > this.range)
                this.target = undefined;

            let expectedTime = Math.max((this.distance(walkToPoint)/this.character.speed) - this.settings.movementInterval, 0);
            let moveTask = this.character.move(walkToPoint.x, walkToPoint.y, true)
                .then(undefined, () => {})
                .catch(() => {});

            await PromiseExt.delay(expectedTime * 900);
            return true;
        }

        return false;
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

    calculateIncomingDamage(possibleTargets: Iterable<Entity>) {
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
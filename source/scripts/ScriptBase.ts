import { IEnumerable } from "../enumerable/IEnumerable";
import { Entity, HiveMind, PingCompensatedCharacter, PingCompensatedScript, ItemName, SETTINGS, Location, Dictionary, Game, List, Pathfinder, Point, PromiseExt, Utility, WeightedCircle, CommandManager, MonsterName, Logger, StringComparer, Player, Deferred, ItemInfo, Data, DateExt } from "../internal";

export abstract class ScriptBase<T extends PingCompensatedCharacter> extends PingCompensatedScript {
    lastConnect: DateExt;
    character: T;
    hiveMind: HiveMind;
    commandManager: CommandManager;

    get leader() {
        let ourSettings = this.settings;
        if (ourSettings?.assist != null)
            return this.hiveMind.getValue(ourSettings.assist);

        return undefined;
    }

    get readyToGo(): boolean {
        if(this.settings.assist != null)
            return this.leader != null && this.leader.readyToGo;

        for(let [, theirMind] of this.hiveMind) {
            if(theirMind.settings.assist == null || theirMind.settings.assist !== this.character.name)
                continue;

            if(theirMind.distance(this.character) > Math.max(theirMind.range * SETTINGS.RANGE_OFFSET, 200))
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

    get okToUseMultiTargetSkills() {
        return this.hiveMind.boss == null 
            || this.character.target === this.hiveMind.boss.id 
            || this.entities
                .count(([, entity]) => entity.isAttackingPartyMember(this.character)) >= 3;
    }

    constructor(character: T, hiveMind: HiveMind) {
        super(character);
        this.Kind.add("ScriptBase");
        this.character = character;
        this.commandManager = new CommandManager(this);
        this.hiveMind = hiveMind;
        this.hiveMind.addOrSet(character.name, this);
        this.lastConnect = DateExt.utcNow;

        if (this.character.ctype !== "merchant") {
            this.loopAsync(() => this.lootAsync(), 1000 * 2);
            this.loopAsync(async () => this.selectTarget(), 1000 / 30);
        }

        if(this.settings.originalGear)
            this.loopAsync(() => this.equipOriginalGear(), 1000 * 5);

        this.loopAsync(() => this.mainAsync(), this.settings.mainInterval);
        this.loopAsync(() => this.movementAsync(), this.settings.movementInterval);
        this.loopAsync(() => this.setBossAsync(), 1000 / 5, false, true);

        this.character.socket.on("code_eval", (data: string) => this.commandManager.handleCommand(data));
        this.character.socket.on("disconnect", () => this.reconnect());
    }

    abstract mainAsync(): Promise<void>;
    abstract movementAsync(): Promise<void>;

    async reconnect() {
        Logger.Error("Disconnected, attempting to reconnect...");
        await this.character.disconnect();

        let msSinceLastConnect = DateExt.utcNow.subtract(this.lastConnect);
        let minimumMs = 1000 * 60;
        if (msSinceLastConnect < minimumMs)
            await PromiseExt.delay(minimumMs - msSinceLastConnect);

        try {
            this.lastConnect = DateExt.utcNow;
            let name = this.character.name;
            let server = this.character.server;
            let ctype = this.character.ctype;
            this.character = <T>await Game.startCharacter(name, server.region, server.name, ctype);
            this.character.name = name;
        } catch {
            await this.reconnect();
            return;
        }

        this.character.socket.on("code_eval", (data: string) => this.commandManager.handleCommand(data));
        this.character.socket.on("disconnect", () => this.reconnect());
    }

    async lootAsync() {
        if (this.character.rip || this.character.chests.size == 0 || this.settings.assist != null)
            return;

        let midas = this.locateReservedItem(item => item != null && item.name === "handofmidas");

        try {
            let merchant = this.hiveMind.getValue(SETTINGS.MERCHANT_NAME);

            //equip handofmidas only when merchant isnt nearby
            if (midas != null && (merchant == null || !this.shouldSee(merchant.character)))
                await this.character.equip(midas.slot);

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
            if (midas != null && this.character.slots.gloves.name === "handofmidas")
                await this.character.equip(midas.slot);
        }
    }

    async equipOriginalGear() {
        let originalGear = this.settings.originalGear!;

        for(let itemName of originalGear) {
            let item = this.locateReservedItem(item => item != null && item.name === itemName);

            if(item)
                await this.character.equip(item.slot);
        }
    }

    selectTarget() {
        const setTarget = (target?: Entity) => {
            this.target = target;

            if (target != null && SETTINGS.ATTACKABLE_BOSSES.contains(target.type))
                this.hiveMind.boss = target;

            return;
        }

        if (this.settings.assist != null) {
            let leader = this.leader;

            if (leader == null)
                return;

            this.target = leader.target;
        } else {
            if (this.target != null) {
                let boss = this.hiveMind.boss;
                let currentTarget = this.entities
                    .values
                    .firstOrDefault(entity => entity.id === this.target!.id);

                //if we can see our target
                if(currentTarget != null) {
                    //if we're targeting the boss
                    if(boss != null && boss.id === currentTarget.id)
                        return setTarget(currentTarget);

                    //if it wont burn to death, keep attacking it
                    if(!currentTarget.willBurnToDeath())
                        return setTarget(currentTarget);

                    return setTarget(undefined);
                //if the boss isnt null and we're targeting it
                } else { 
                    if(boss != null && this.target != null && boss.id === this.target.id && this.shouldSee(boss)) {
                        //we should be attacking the boss
                        //we should see the boss but we dont
                        //signal that we killed the boss
                        Data.bossHunt.addOrSet(this.hiveMind.boss?.type!, DateExt.utcNow);
                        this.hiveMind.boss = undefined;
                    }

                    //our target is probably dead
                    return setTarget(undefined);
                }
            //if we dont have a target, we should be attacking a boss, and we arent being attacked by something else
            } else if(this.hiveMind.boss != null && !this.isBeingAttacked)
                return setTarget(this.hiveMind.boss);

            let current: { target: Entity, location: Location, canPath: boolean } | undefined;
            let attackableTypes = SETTINGS.ATTACKABLE_BOSSES.concat(this.settings.attackMTypes!).toList();
            for (let [, entity] of this.entities) {
                if (entity == null 
                    || !attackableTypes.contains(entity.type) 
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

    async setBossAsync() {
        let boss = this.entities.values.firstOrDefault(entity => SETTINGS.ATTACKABLE_BOSSES.contains(entity.type, StringComparer.IgnoreCase));
        let bossIsNull = this.hiveMind.boss == null;

        if(boss && (bossIsNull || this.hiveMind.boss!.type === boss.type)) {
            this.hiveMind.boss = boss;

            if(bossIsNull) 
                for(let [, mind] of this.hiveMind)
                    await mind.character.stopSmartMove();
        }
    }

    async weightedMoveToEntityAsync(entity: Entity, maxDistance: number, ignoreMonsters = false, expand = true) {
        let location = Location.fromIPosition(entity);

        let circle = new WeightedCircle(location, maxDistance, maxDistance / 10, expand);
        let entities = this.entities
            .values
            .where(xEntity => xEntity != null && xEntity.id !== entity.id)
            .toList();
        let players = new Dictionary(this.character.players)
            .values
            .where(xPlayer => xPlayer != null && !xPlayer.npc && xPlayer.id !== this.character.id)
            .toList();

        circle.applyWeight(entities, players, this, ignoreMonsters);

        let bestPoint = circle.orderBy(entry => entry.weight).firstOrDefault(entry => Pathfinder.canWalkPath(entry.location, this.location))?.location;

        if (bestPoint != null)
            await this.character.move(bestPoint.x, bestPoint.y, true)
                .then(undefined, () => {})
                .catch(() => { });
        else
            await this.smartMove(location, { getWithin: this.range });
    }

    async assistMove() {
        if (this.character.rip)
            return;

        let leader = this.leader;
        if (leader == null)
            return;

        if (leader.destination != null) {
            await this.smartMoveWhile(leader.destination, () => leader?.destination != null, { getWithin: this.range });
            return;
        }

        if (!this.withinRange(leader.character, this.range * SETTINGS.RANGE_OFFSET)) {
            await this.pathToCharacter(leader, this.range * 0.75);
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
        if (this.character.rip) {
            this.destination = undefined;
            return;
        }

        let target = this.target;

        if (target != null) {
            if(!Pathfinder.canWalkPath(this.location, target))
                return await this.smartMove(target, { getWithin: this.range });

            let isBoss = SETTINGS.ATTACKABLE_BOSSES.contains(target.type);
            let attackingUs = target.target != null && target.target === this.character.id;

            //if it's not a boss, or it is a boss and it's attacking us
            //and we're set up to kite
            //and we're faster than our target
            //and we outrange our target
            //and we have a fairly significant range
            let takingBigDamage = this.calculateIncomingDPS(false, false, [target]) > this.calculateIncomingHPS();
            if((this.settings.kite || takingBigDamage) 
                && this.character.speed > target.speed 
                && (this.range > target.range || takingBigDamage)
                && (!isBoss || attackingUs))
                if(await this.circleKiteAsync())
                    return;
                
            let maxRange = this.range;
            let isAssisting = this.settings.assist != null;

            //if we arent kiting
            if(!this.settings.kite) {
                if(!isAssisting && this.distance(target) < this.range)
                    return;

                if(target.target === this.character.id)
                    maxRange = Math.min(maxRange, target.range);
            }

            await this.weightedMoveToEntityAsync(target, maxRange, !isAssisting, isAssisting);
        } else {
            //if we dont get a target within a reasonable amount of time
            let hasTarget = await PromiseExt.pollWithTimeoutAsync(async () => this.target != null, 1000);

            if(hasTarget)
                return;

            let mapMonsters = Game.G.maps[this.character.map]?.monsters;
            if(mapMonsters == null)
                return;

            //pick a new random spawnpoint for the monster we're after
            let possibleSpawns = new List(mapMonsters)
                .where(monster => monster.type === this.settings.attackMTypes!.find(0))
                .toList();

            //no possible spawns on this map, so we're probably not on the right map
            if (possibleSpawns.length == 0)
                return await this.smartMove(this.settings.attackMTypes!.first(), );

            let goTo = possibleSpawns
                .where(spawn => spawn.boundary != null)
                .select(spawn => {
                    let point1 = new Point(spawn.boundary![0], spawn.boundary![1]);
                    let point2 = new Point(spawn.boundary![2], spawn.boundary![3]);
                    return point1.midPoint(point2);
                })
                .orderBy(() => Math.random())
                .firstOrDefault();

            if (goTo)
                await this.smartMove(new Location(goTo, this.character.map), { getWithin: 300 });
        }
    }

    async circleKiteAsync() {
        let target = this.target;

        if(target == null)
            return false;

        //we want to generally be in range of whatever we target
        //we can do bigger circles if the monster is faster
        let maxRadius = (Math.max(this.range, 150) / 2) + (target.range/2);

        //get the closest spawn bounds of our target monster
        //get the center point, and smallest dimension of those bounds
        //we will use the center for circleCenter and the smallest dimension / 2 as the radius
        let mapMonsters = Game.G.maps[this.character.map]?.monsters;

        if(mapMonsters == null)
            return false;

        let circle = new List(mapMonsters)
            .where(monster => monster.type === target?.type)
            .select(monster => {
                let allBoundaries: IEnumerable<[number, number, number, number]>;

                if(monster.boundaries != null)
                    allBoundaries = new List(monster.boundaries)
                        .select(([_, tlX, tlY, brX, brY]) => <[number, number, number, number]>[tlX, tlY, brX, brY]);
                else if(monster.boundary != null)
                    allBoundaries = new List([monster.boundary]);
                else
                    return null;

                //get closest set of boundaries for the monster we're targeting
                return allBoundaries
                    .select(([tlX, tlY, brX, brY]) => { 
                        return { 
                            center: new Point(tlX, tlY).midPoint(new Point(brX, brY)),
                            radius: Math.min(Math.abs(tlX - brX), Math.abs(tlY - brY)) / 2.1
                        };
                    })
                    .where(set => set.radius > this.range/3)
                    .min(set => set.center.distance(target!));
            })
            .where(set => set != null)
            .min(set => set!.center.distance(target!));

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
        while (this.distance(script.character) > distance + 50) {
            let startingLocation = script.location;
            await this.smartMoveWhile(script.location, () => script.distance(startingLocation) < distance, { getWithin: distance })
        }
    }

    calculateIncomingHPS(nearbyPriest = this.nearbyPriest) {
        let hps = 200;
        //rough calculation, doesnt take into account armor/resist/etc
        hps += (this.character.attack * this.character.frequency * (this.character.lifesteal/150));

        if(nearbyPriest) {
            let priestHps = nearbyPriest.attack * nearbyPriest.frequency;
            if(nearbyPriest.s.poisoned)
                priestHps *= (1 - Game.G.conditions.poisoned.healm!);

            hps += priestHps;
        }

        return hps;
    }

    calculateIncomingDPS(ignoreDefensives = false, ignoreStunned = true, entities: Iterable<Entity> = this.entities.values
        .where(entity => entity.target != null && entity.target === this.character.id), ) {
        let dps = 0;

        if(this.character.s.burned) {
            let interval = Game.G.conditions.burned.interval!;
            let ticksPerSecond = 1000 / interval;
            let remainingTicks = Math.floor(this.character.s.burned.ms / 1000 / ticksPerSecond);
            let damagePerTick = this.character.s.burned.intensity / 5;

            if(remainingTicks > ticksPerSecond)
                remainingTicks = ticksPerSecond;

            dps += remainingTicks * damagePerTick;
        }

        let armor = this.character.armor;
        let resistance = this.character.resistance;

        if(ignoreDefensives) {
            if(this.character.s.hardshell)
                armor -= Game.G.conditions.hardshell.armor!;

            if(this.character.s.fingered)
                resistance -= Game.G.conditions.fingered.resistance!;
        }

        for(let entity of entities) {
            //ignore things that will be stunned for longer than a second
            if(ignoreStunned && entity.s.stunned != null && entity.s.stunned.ms > 1000)
                continue; 

            let entityDPS = entity.attack * entity.frequency;

            switch(entity.damage_type) {
                case "physical":
                    dps += (entityDPS * Utility.calculateDamageMultiplier(armor - (entity.apiercing ?? 0)));
                    break;
                case "magical":
                    dps += (entityDPS * Utility.calculateDamageMultiplier(resistance - (entity.rpiercing ?? 0)));
                    break;
                case "pure":
                    dps += entityDPS;
                    break;
            }
        }

        return dps;
    }
}
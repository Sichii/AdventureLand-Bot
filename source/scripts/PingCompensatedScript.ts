import { Dictionary, HiveMind, KindBase, MetricManager, PingCompensatedCharacter, Point, Location, PromiseExt, Logger, SETTINGS, Entity, IPosition, SkillName, Game, Utility, Pathfinder, WeightedCircle, CommandManager, ItemName } from "../internal";

export abstract class PingCompensatedScript extends KindBase {
    character: PingCompensatedCharacter;
    metricManager: MetricManager;
    hiveMind: HiveMind;
    commandManager: CommandManager;
    lastConnect: Date;

    get entities() {
        return new Dictionary(this.character.entities);
    }

    get players() {
        return new Dictionary(this.character.players);
    }

    get hpPct() {
        return this.character.hp / this.character.max_hp;
    }

    get missingHp() {
        return this.character.max_hp - this.character.hp;
    }

    get mpPct() {
        return this.character.mp / this.character.max_mp;
    }

    get missingMp() {
        return this.character.max_mp - this.character.mp;
    }

    get point() {
        return new Point(this.character.x, this.character.y);
    }

    get location() {
        return new Location(this.point, this.character.map);
    }

    get isConnected() {
        return this.character.socket?.connected ?? false;
    }

    get leader() {
        if (!this.character.party)
            return null;

        return this.character.players.get(this.character.party) ?? null;
    }

    constructor(character: PingCompensatedCharacter, hiveMind: HiveMind) {
        super();
        this.Kind.add("ScriptBase");

        this.character = character;
        this.metricManager = new MetricManager(this);
        this.hiveMind = hiveMind;
        this.lastConnect = new Date();
        this.hiveMind.addOrSet(character.name, this);
        this.commandManager = new CommandManager(this);

        this.loopAsync(() => this.usePotionRegenAsync(), 1000 / 10);
        this.loopAsync(async () => this.monitorCC(), 1000);
        //PromiseExt.loopAsync(() => this.monitorConnectionAsync(), 1000);
        this.character.socket.on("code_eval", (data: string) => this.commandManager.handleCommand(data));
        this.character.socket.on("disconnect", () => this.reconnect());
    }

    abstract execute(): void;
    abstract mainAsync(): Promise<void>

    async loopAsync(func: () => Promise<any>, msMinDelay: number, delayStart?: boolean) {
        let wrapperFunc = async () => {
            try {
                if (!this.isConnected)
                    await PromiseExt.delay(10000);
                else {
                    await func();
                    await PromiseExt.delay(msMinDelay);
                }
            } catch (e) {
                Logger.Error(e);
                await PromiseExt.delay(msMinDelay);
            }

            wrapperFunc();
        };

        if (delayStart === true)
            await PromiseExt.delay(msMinDelay);

        return await wrapperFunc();
    }

    async reconnect() {
        Logger.Error("Disconnected, attempting to reconnect...");
        await this.character.disconnect();

        let timeSinceLastConnect = Utility.msSince(this.lastConnect);
        if (timeSinceLastConnect < 1000 * 60)
            await PromiseExt.delay(timeSinceLastConnect);

        await this.character.connect();
        this.character.socket.on("code_eval", (data: string) => this.commandManager.handleCommand(data));
        this.character.socket.on("disconnect", () => this.reconnect());
    }

    monitorCC() {
        if (this.character.cc > 120)
            Logger.Error(`[${this.character.name}] cc: ${~~this.character.cc}`);
        else if (this.character.cc > 60)
            Logger.Error(`[${this.character.name}] cc: ${~~this.character.cc}`);
        else if (this.character.cc > 30)
            Logger.Warn(`[${this.character.name}] cc: ${~~this.character.cc}`);

        return true;
    }

    async usePotionRegenAsync() {
        if (this.character.rip)
            return await PromiseExt.delay(1000);

        let expectedElixir = SETTINGS.PARTY_INFO.getValue(this.character.name)?.elixir ?? <ItemName>"";
        let elixirSlot = this.character.locateItem(expectedElixir);

        if(elixirSlot != null && (this.character.slots.elixir?.expires == null || Math.abs(Utility.msSince(new Date(this.character.slots.elixir.expires))) < 1000))
            await this.character.equip(elixirSlot);

        if (this.mpPct < SETTINGS.MP_POT_AT && this.missingMp > 300 && this.character.canUse("use_mp")) {
            let potionToUse = SETTINGS.POTIONS
                .where(potion => potion.startsWith("mpot"))
                .select(potion => this.character.locateItem(potion))
                .firstOrDefault();

            if (potionToUse != null)
                return await this.character.useMPPot(potionToUse);
        }

        if (this.hpPct < SETTINGS.HP_POT_AT && this.missingHp > 300 && this.character.canUse("use_hp")) {
            let potionToUse = SETTINGS.POTIONS
                .where(potion => potion.startsWith("hpot"))
                .select(potion => this.character.locateItem(potion))
                .firstOrDefault();

            if (potionToUse != null)
                return await this.character.useHPPot(potionToUse);
        }

        if (this.missingMp > 100 && this.character.canUse("regen_mp"))
            return await this.character.regenMP();
        else if (this.missingHp > 50 && this.character.canUse("regen_hp"))
            return await this.character.regenHP();

        return Promise.resolve();
    }

    async followTheLeaderAsync() {
        if (this.character.rip)
            return;

        let leader = this.hiveMind.leader;
        if (leader != null && (!this.canSee(leader.character)))
            await this.character.smartMove(leader.location, { getWithin: SETTINGS.FOLLOW_DISTANCE });

        let target = this.selectTarget(false);
        let hasTarget = target != null;
        if (!hasTarget) {
            let pollFunc = () => {
                target = this.selectTarget(false);
                return target != null;
            };
            await PromiseExt.pollWithTimeoutAsync(async () => pollFunc(), 1000);
        }

        if (target != null && Pathfinder.canWalkPath(this.location, Location.fromIPosition(target)))
            await this.weightedMoveToEntityAsync(target, this.character.range);
        else if (target != null) {
            let smartMove = this.character.smartMove(target, { getWithin: this.character.range / 2 })
                .catch(() => { });

            await PromiseExt.setTimeoutAsync(smartMove, 5000);
        } else if (leader != null)
            await this.character.smartMove(leader.location, { getWithin: SETTINGS.FOLLOW_DISTANCE });
    }

    distance(entity: Point | IPosition) {
        return this.location.distance(entity);
    }

    canSee(entity: Point | IPosition) {
        return this.distance(entity) < 600;
    }

    withinRange(entity: Point | IPosition, range = this.character.range) {
        let distance = this.distance(entity);

        return distance < range;
    }

    withinSkillRange(entity: Point | IPosition, skill: SkillName) {
        let skillInfo = Game.G.skills[skill];

        if (skillInfo == null) {
            Logger.Error(`No such skill ${skill}`);
            return false;
        }

        let range = skillInfo.range;
        if (range == null) {
            range = skillInfo.range_multiplier;

            if (range)
                range *= this.character.range;
            else {
                range = skillInfo.range_bonus;

                if (range)
                    range += this.character.range;
            }
        }

        if (range == null)
            return true;

        return this.distance(entity) < range;
    }

    selectTarget(freeTarget: boolean) {
        let targetId = this.hiveMind.targetId;
        let myTarget = targetId ? this.character.entities.get(targetId) : null;

        if (myTarget && myTarget.hp > 0)
            return myTarget;

        if(this.hiveMind.lockTarget != null && this.distance(this.hiveMind.lockTarget) > this.character.range)
            return this.hiveMind.lockTarget;

        if (!freeTarget) {
            return null;
        } else {
            this.hiveMind.lockTarget = undefined;
            let current: { target: Entity, location: Location, canPath: boolean } | undefined;

            for (let [, entity] of this.character.entities) {

                if (entity == null || !SETTINGS.ATTACKABLE_BOSSES.concat(SETTINGS.ATTACK_MTYPES).contains(entity.type) || entity.hp <= 0)
                    continue;

                //if it's targeting a party member, target it
                if (entity.isAttackingPartyMember(this.character) && this.canSee(entity)) {
                    this.hiveMind.targetId = entity.id;
                    this.character.target = entity.id;
                    return entity;
                }

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

            let finalTarget = current?.target;
            this.hiveMind.targetId = finalTarget?.id;
            this.character.target = finalTarget?.id;

            if(finalTarget != null && this.distance(finalTarget) > 600)
                this.hiveMind.lockTarget = finalTarget;

            return current?.target ?? null;
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
            await this.character.smartMove(location, { getWithin: this.character.range });

        return Promise.resolve();
    }
}
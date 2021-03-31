import { EvalData } from "alclient";
import { Dictionary, Player, HiveMind, KindBase, MetricManager, PingCompensatedCharacter, Point, Location, PromiseExt, Logger, SETTINGS, Entity, IPosition, SkillName, Game, Utility, Pathfinder, WeightedCircle, CommandManager } from "../internal";

export abstract class PingCompensatedScript extends KindBase {
    character: PingCompensatedCharacter;
    metricManager: MetricManager;
    hiveMind: HiveMind;
    commandManager: CommandManager;
    lastConnect: Date;

    get hpPct() {
        return this.character.hp / this.character.max_hp;
    }

    get mp_pct() {
        return this.character.mp / this.character.max_mp;
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
        this.Kind.push("ScriptBase");

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
                if(!this.isConnected)
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
        if(timeSinceLastConnect < 1000 * 60)
            await PromiseExt.delay(timeSinceLastConnect);

        await this.character.connect();
        this.character.socket.on("code_eval", (data: string) => this.commandManager.handleCommand(data));
        this.character.socket.on("disconnect", () => this.reconnect());
    }

    monitorCC() {
        if (this.character.cc > 120)
            Logger.Error(`[${this.character.name}] cc: ${this.character.cc}`);
        else if (this.character.cc > 60)
            Logger.Error(`[${this.character.name}] cc: ${this.character.cc}`);
        else if (this.character.cc > 30)
            Logger.Warn(`[${this.character.name}] cc: ${this.character.cc}`);

        return true;
    }

    usePotionRegenAsync() {
        if (this.character.rip)
            return PromiseExt.delay(1000);

        if (this.mp_pct < SETTINGS.MP_POT_AT && this.character.canUse("use_mp"))
            return this.character.useMPPot(this.character.locateItem("mpot0"));

        if (this.mp_pct < SETTINGS.HP_POT_AT && this.character.canUse("use_hp"))
            return this.character.useHPPot(this.character.locateItem("hpot0"));

        if (this.hpPct < this.mp_pct && this.character.max_hp - this.character.hp > 50 && this.character.canUse("regen_hp"))
            return this.character.regenHP();

        if (this.character.max_mp - this.character.mp > 100 && this.character.canUse("regen_mp"))
            return this.character.regenMP();

        return Promise.resolve(false);
    }

    distance(entity: Point | IPosition) {
        return this.location.distance(entity);
    }

    canSee(entity: Point | IPosition) {
        return this.distance(entity) < 600;
    }

    withinRange(entity: Point | IPosition) {
        return this.distance(entity) < this.character.range;
    }

    withinSkillRange(entity: Point | IPosition, skill: SkillName) {
        let skillInfo = Game.G.skills[skill];

        if(skillInfo == null) {
            Logger.Error(`No such skill ${skill}`);
            return false;
        }

        let range = skillInfo.range;
        if(range == null) {
            range = skillInfo.range_multiplier;

            if(range)
                range *= this.character.range;
            else {
                range = skillInfo.range_bonus;

                if(range)
                    range += this.character.range;
            }
        }

        if(range == null)
            return true;
    
        return this.distance(entity) < range;
    }

    selectTarget(freeTarget: boolean) {
        let targetId = this.hiveMind.targetId;
        let myTarget = targetId ? this.character.entities.get(targetId) : null;

        if (myTarget && myTarget.hp > 0)
            return myTarget;

        if (!freeTarget) {
            return null;
        } else {
            let current: { target: Entity, location: Location, canPath: boolean } | undefined;

            for (let [, entity] of this.character.entities) {

                if (entity == null || !SETTINGS.ATTACKABLE_BOSSES.concat(SETTINGS.ATTACK_MTYPES).contains(entity.type) || !this.canSee(entity) || entity.hp <= 0)
                    continue;

                //if it's targeting a party member, target it
                if (entity.isAttackingPartyMember(this.character))
                    return entity;

                if (current == null) {
                    let entityLocation = Utility.getLocation(entity);
                    current = { target: entity, location: entityLocation, canPath: Pathfinder.canWalkPath(this.location, entityLocation) };
                    continue;
                }

                let entityLocation = Utility.getLocation(entity);
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

            this.hiveMind.targetId = current?.target?.id;
            this.character.target = current?.target?.id;
            return current?.target ?? null;
        }
    }

    async weightedMoveToEntityAsync(entity: Entity, max_distance: number) {
        let location = Utility.getLocation(entity);

        let circle = new WeightedCircle(location, max_distance, max_distance / 10);
        let entities = new Dictionary(this.character.entities)
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
            await this.character.move(bestPoint.x, bestPoint.y, true);
        else
            await this.character.smartMove(location, { getWithin: this.character.range });

        return Promise.resolve();
    }
}
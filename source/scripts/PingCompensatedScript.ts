import { NodeData, MapName, MonsterName, NPCType, Dictionary, HiveMind, KindBase, MetricManager, PingCompensatedCharacter, Point, Location, PromiseExt, Logger, SETTINGS, Entity, IPosition, SkillName, Game, Utility, Pathfinder, WeightedCircle, CommandManager, ItemName, List } from "../internal";

export abstract class PingCompensatedScript extends KindBase {
    character: PingCompensatedCharacter;
    metricManager: MetricManager;
    lastConnect: Date;
    destination?: IPosition;

    get items() {
        return new List(this.character.items);
    }

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

    constructor(character: PingCompensatedCharacter) {
        super();
        this.Kind.add("ScriptBase");

        this.character = character;
        this.metricManager = new MetricManager(this);
        this.lastConnect = new Date();

        this.loopAsync(() => this.usePotionRegenAsync(), 1000 / 10);
        this.loopAsync(async () => this.monitorCC(), 1000);
    }

    abstract execute(): void;
    abstract mainAsync(): Promise<void>

    async loopAsync(func: () => Promise<any>, msMinDelay: number, delayStart?: boolean, ignoreSmartMove = false) {
        let wrapperFunc = async () => {
            try {
                if (!this.isConnected)
                    await PromiseExt.delay(5000);
                else if(this.destination != null && !ignoreSmartMove) {
                    await PromiseExt.delay(250);
                }
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

        let expectedElixir = SETTINGS.PARTY_SETTINGS.getValue(this.character.name)?.elixir ?? <ItemName>"";
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

        return this.distance(entity) < (range * 0.95);
    }

    smartMove(to: MapName | MonsterName | NPCType | IPosition, options?: {
        getWithin?: number;
        useBlink?: boolean;
    }): Promise<NodeData | void> {
        if(typeof to !== "string")
            this.destination = to;
        return this.character.smartMove(to, options)
            .then(undefined, () => {})
            .catch(() => {})
            .finally(() => this.destination = undefined);
    }
}
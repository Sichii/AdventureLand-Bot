import { NodeData, MapName, MonsterName, NPCName, Dictionary, HiveMind, KindBase, MetricManager, PingCompensatedCharacter, Point, Location, PromiseExt, Logger, CONSTANTS, SETTINGS, Entity, IPosition, SkillName, Game, Utility, Pathfinder, WeightedCircle, CommandManager, ItemName, List, WeaponType, ItemInfo, Deferred, DateExt } from "../internal";

export abstract class PingCompensatedScript extends KindBase {
    character: PingCompensatedCharacter;
    metricManager: MetricManager;
    destination?: MapName | MonsterName | NPCName | IPosition;
    target?: Entity;

    get settings() {
        return SETTINGS.PARTY_SETTINGS.getValue(this.character.name)!;
    }

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

    get range() {
        return this.character.range;
    }

    get isBeingAttacked() {
        return this.entities.values.any(entity => entity.target === this.character.id);
    }

    get couldBeAttacked() {
        return this.entities.values.any(entity => (entity.target === this.character.id || entity.rage != null) 
            && this.distance(entity) <= entity.range + ((entity.charge ?? entity.speed) * 8));
    }

    constructor(character: PingCompensatedCharacter) {
        super();
        this.Kind.add("ScriptBase");

        this.character = character;
        this.metricManager = new MetricManager(this);

        this.loopAsync(() => this.usePotionRegenAsync(), 1000 / 10);
        this.loopAsync(async () => this.monitorCC(), 1000);
    }

    async loopAsync(func: () => Promise<any>, msMinDelay: number, delayStart = false, ignoreSmartMove = false) {
        let wrapperFunc = async () => {
            try {
                if (!this.isConnected)
                    await PromiseExt.delay(5000);
                else if (!ignoreSmartMove && this.character.c.town != null) 
                    await PromiseExt.delay(250);
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

        return true;
    }

    async usePotionRegenAsync() {
        if (this.character.rip)
            return await PromiseExt.delay(1000);

        let expectedElixir = SETTINGS.PARTY_SETTINGS.getValue(this.character.name)?.elixir ?? <ItemName>"";
        let elixirSlot = this.character.locateItem(expectedElixir);

        if (elixirSlot != null && (this.character.slots.elixir?.expires == null || Math.abs(DateExt.utcNow.subtract(new DateExt(this.character.slots.elixir.expires))) < 1000))
            await this.character.equip(elixirSlot);

        if (this.mpPct < SETTINGS.MP_POT_AT && this.character.canUse("use_mp")) {
            //for all mp potions in settings, get their info
            let mpPotionInfo = SETTINGS.POTIONS
                .where(potion => potion.startsWith("mpot"))
                .toDictionary(potion => potion, potion => new List(Game.G.items[potion].gives)
                    .first(([type,]) => type === "mp"))

            //for each possible potion, see if we're missing enough mp to warrant using it
            for (let [potion, [, amount]] of mpPotionInfo.orderByDesc(([, [, amount]]) => amount))
                if (this.missingMp > amount) {
                    let itemPos = this.character.locateItem(potion);

                    //use it if we have it
                    if (itemPos != null)
                        return await this.character.useMPPot(itemPos);
                }
        }

        if (this.hpPct < SETTINGS.HP_POT_AT && this.character.canUse("use_hp")) {
            //for all mp potions in settings, get their info
            let hpPotionInfo = SETTINGS.POTIONS
                .where(potion => potion.startsWith("hpot"))
                .toDictionary(potion => potion, potion => new List(Game.G.items[potion].gives)
                    .first(([type,]) => type === "hp"));

            //for each possible potion, see if we're missing enough mp to warrant using it
            for (let [potion, [, amount]] of hpPotionInfo)
                if (this.missingHp > amount) {
                    let itemPos = this.character.locateItem(potion);

                    //use it if we hav eit
                    if (itemPos != null)
                        return await this.character.useHPPot(itemPos);
                }
        }

        if (this.missingMp > CONSTANTS.REGEN_MP_AMOUNT && this.character.canUse("regen_mp"))
            return await this.character.regenMP();
        else if (this.missingHp > CONSTANTS.REGEN_HP_AMOUNT && this.character.canUse("regen_hp"))
            return await this.character.regenHP();

        return Promise.resolve();
    }

    distance(entity: Point | IPosition) {
        return this.location.distance(entity);
    }

    shouldSee(entity: Point | IPosition) {
        return this.distance(entity) < 600;
    }

    withinRange(entity: Point | IPosition, range = this.range) {
        let distance = this.distance(entity);

        return distance < range;
    }

    withinSkillRange(entity: Point | IPosition, skill: SkillName, safetyCheck = false) {
        let skillInfo = Game.G.skills[skill];

        if (skillInfo == null) {
            Logger.Error(`No such skill ${skill}`);
            return false;
        }

        let range = skillInfo.range;
        if (range == null) {
            range = skillInfo.range_multiplier;

            if (range)
                range *= this.range;
            else {
                range = skillInfo.range_bonus;

                if (range)
                    range += this.range;
            }
        }

        if (range == null)
            return true;

        return this.distance(entity) < ((safetyCheck && this.settings.safeRangeCheckEnabled) ? range * 1.05 : range);
    }

    attackVs(entity: Entity) {
        if (this.character.damage_type === "physical")
            return this.character.attack * Utility.calculateDamageMultiplier(entity.armor - this.character.apiercing);
        else
            return this.character.attack * Utility.calculateDamageMultiplier(entity.resistance - this.character.rpiercing);
    }

    async smartMove(to: MapName | MonsterName | NPCName | IPosition, options?: {
        getWithin?: number;
        useBlink?: boolean;
        avoidTownWarps?: boolean;
    }): Promise<NodeData | void> {
        this.destination = to;

        if (!options)
            options = {};

        //safety margin
        if (options?.getWithin != null)
            options.getWithin *= 0.95;

        try {
            if(this.couldBeAttacked) {
                options.avoidTownWarps = true;
                //path till we reach our destination, or we're not being attacked
                await Promise.any<any>([this.character.smartMove(to, options), PromiseExt.pollWithTimeoutAsync(async () => !this.couldBeAttacked || (this.character.s.town != null), 1000 * 60)]);    
            } else
                await this.character.smartMove(to, options);
        } finally {
            this.destination = undefined;
        }
    }

    async smartMoveWhile(to: MapName | MonsterName | NPCName | IPosition, condition: () => boolean, options?: {
        getWithin?: number;
        useBlink?: boolean;
        avoidTownWarps?: boolean;
    }): Promise<NodeData | void> {
        await Promise.any<any>([this.smartMove(to, options), PromiseExt.pollWithTimeoutAsync(async () => !condition(), 60000)]);
    }

    locateReservedItem(predicate: (item: ItemInfo) => boolean) {
        let item = this.items
            .skip(SETTINGS.MINIMUM_RESERVED_ITEM_INDEX)
            .firstOrDefault(item =>predicate(item));
        if(!item)
            return undefined;

        let slot = this.items.indexOf(item);

        if(slot === -1)
            return undefined;

        return { item: item, slot: slot };
    }

    async useSkill(skillFunc: () => Promise<any>, wType?: WeaponType) {
        if(!wType)
            return await skillFunc();

        let equippedMainhand = this.character.slots.mainhand;
        let equippedOffhand = this.character.slots.offhand;
        let gMainType: WeaponType | undefined;
        let gOffType: WeaponType | undefined;

        if(equippedMainhand)
            gMainType = Game.G.items[equippedMainhand.name].wtype;

        if(equippedOffhand)
            gOffType = Game.G.items[equippedOffhand.name].wtype;

        if(equippedMainhand == null || gMainType !== wType) {
            let itemToEquip = this.locateReservedItem(item => {
                if(item == null)
                    return false;

                return Game.G.items[item.name].wtype === wType;
            });

            if(itemToEquip == null)
                return;

            //TODO: need property "a" on GItem
            //need to unequip offhand for 2h types
            if(equippedOffhand != null && (wType === "axe" || wType === "basher"))
                await this.character.unequip("offhand");

            await this.character.equip(itemToEquip.slot);
        }

        await skillFunc();

        if(equippedMainhand != null && gMainType !== wType) {
            let mainHandSlot = this.character.locateItem(equippedMainhand.name, undefined, { level: equippedMainhand.level });
            await this.character.equip(mainHandSlot, "mainhand");
        }

        //if we had an offhand on, and we needed to equip a 2h
        if(equippedOffhand != null && (wType === "axe" || wType === "basher")) {
            let offHandSlot = this.character.locateItem(equippedOffhand.name, undefined, { level: equippedOffhand.level });
            await this.character.equip(offHandSlot, "offhand");
        }
    }
}
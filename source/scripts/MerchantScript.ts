import { IEnumerable } from "../enumerable/IEnumerable";
import { IBankedItem } from "../interfaces/IBankedItem";
import { HiveMind, Merchant, ScriptBase, Constants, PromiseExt, Deferred, SETTINGS, List, ItemInfo, Game, ItemName, ItemType, ServerIdentifier, ServerRegion, Dictionary, CONSTANTS, BankPackName, Data, Utility, StringComparer, MonsterName, IPosition, IIndexedItem, ICompoundableSet, DateExt } from "../internal";

export class MerchantScript extends ScriptBase<Merchant> {
    wasMoving: boolean;
    lastVisitParty: DateExt;
    lastBossHunt: DateExt;


    constructor(entity: Merchant, hiveMind: HiveMind) {
        super(entity, hiveMind);
        this.Kind.add("MerchantScript");

        this.wasMoving = true;
        this.lastVisitParty = DateExt.utcNow;
        this.lastBossHunt = DateExt.utcNow.subtractHours(1);

        //PromiseExt.loopAsync(() => this.buyFromPontyAsync(), 1000 * 60 * 1);
        this.loopAsync(() => this.luckBuffNearbyAsync(), 1000);
    }

    static async startAsync(name: string, region: ServerRegion, id: ServerIdentifier, hiveMind: HiveMind) {
        let character = await Game.startMerchant(name, region, id)
        character.name = name;

        let script = new MerchantScript(character, hiveMind);
        return script;
    }

    async mainAsync() {
        if (this.character.rip) {
            this.character.respawn();
            await PromiseExt.delay(2500);
            return;
        }

        if (DateExt.utcNow.subtract(this.lastVisitParty) > SETTINGS.MERCHANT_VISIT_PARTY_EVERY_MS) {
            let visitedMembers = this.hiveMind
                .values
                .where(mind => mind.character != null && this !== mind)
                .toList();

            while (visitedMembers.any()) {
                let targetScript = visitedMembers.elementAt(0)!;
                await this.pathToCharacter(targetScript, 150);
                await this.tradeWithPartyAsync()
                    .catch(() => { });
                visitedMembers.remove(targetScript);
            }

            this.lastVisitParty = DateExt.utcNow;
        } else if (false) {
            //TODO: add dismantle logic
        } else if (this.shouldGoCraft()) {
            await this.smartMove("craftsman", { getWithin: Constants.NPC_INTERACTION_DISTANCE * 0.75 });
            await this.craftItemsAsync();
        } else if (this.shouldGoDismantle()) {
            await this.smartMove("craftsman", { getWithin: Constants.NPC_INTERACTION_DISTANCE * 0.75 });
            await this.dismantleItemsAsync();
        } else if (this.shouldExchangeItems()) {
            await this.exchangeItemsAsync();
        } else {
            if (this.distance(SETTINGS.MERCHANT_STAND_LOCATION) > 10)
                await this.smartMove(SETTINGS.MERCHANT_STAND_LOCATION);

            await this.buyPotionsAsync();
            await this.buyScrollsAsync();
            await this.sellTrashAsync();
            await this.upgradeItemsAsync();
            await this.compoundItemsAsync();
            await this.buyFromMerchantAsync();
            await this.buyFromPontyAsync();

            if (this.shouldGoToBank()) {
                await this.smartMove("bank");
                await PromiseExt.pollWithTimeoutAsync(async () => this.character.bank != null, 2500);
                if (this.character.map === "bank" && this.character.bank != null) {
                    await this.depositGoldAsync();
                    await this.withdrawlGoldAsync();
                    await this.depositItemsAsync();
                    await this.withdrawlItemsAsync();
                }

                return;
            }

            if (DateExt.utcNow.subtract(this.lastBossHunt) > 1000 * 60 * 2.5) {
                await this.seekBosses();
                this.lastBossHunt = DateExt.utcNow;
            }
        }
    }

    async movementAsync() {
        if (this.character.stand && this.character.moving)
            await this.character.closeMerchantStand();
        else if (!this.character.stand && !this.character.moving)
            await this.character.openMerchantStand();
    }

    //#region Party stuff
    async luckBuffNearbyAsync() {
        for (let [name, player] of this.character.players) {
            if (this.character.canUse("mluck")
                && player != null
                && player.ctype != null
                && player.ctype !== "merchant"
                && !player.npc
                && this.withinSkillRange(player, "mluck")
                //player has no mluck
                && (player.s.mluck == null
                    //or they do.. AND its strong, AND its from me(my character), AND its over 15mins old
                    || (player.s.mluck.strong && player.s.mluck.f === this.character.name && player.s.mluck.ms < 1000 * 60 * 45)
                    //or they do.. AND its not strong, AND either it's not from me, or it is from me and is over 15mins old
                    || (!player.s.mluck.strong && (player.s.mluck.f !== this.character.name && player.s.mluck.ms < 1000 * 60 * 45))
                )
            ) {
                await this.character.mluck(name)
                    .catch(() => { });
                await PromiseExt.delay(200);
            }
        }
    }

    async tradeWithPartyAsync() {
        let minds = this.hiveMind
            .where(([key, value]) => value.isConnected && key !== this.character.name && this.withinRange(value.character, 300))
            .select(([, value]) => value);

        for (let theirMind of minds) {
            if (theirMind.character.gold > 0)
                await theirMind.character.sendGold(this.character.name, theirMind.character.gold)
                    .catch(() => { });

            for (let potion of SETTINGS.POTIONS) {
                let theirQuantity = theirMind.character.countItem(potion);

                if (theirQuantity < SETTINGS.POTION_THRESHOLD)
                    await this.character.sendItem(theirMind.character.name, this.character.locateItem(potion), SETTINGS.POTION_THRESHOLD - theirQuantity);
            }

            //give them the elixir theyre using
            let elixirName = theirMind.settings.elixir;
            if (elixirName) {
                let theirElixirs = theirMind.items.firstOrDefault(item => item != null && item.name === elixirName);

                if (!theirElixirs || theirElixirs.q! < SETTINGS.ELIXIR_THRESHOLD) {
                    let ourElixirIndex = this.character.locateItem(elixirName);

                    if (ourElixirIndex) {
                        let ourElixirs = this.items.find(ourElixirIndex);
                        await this.character.sendItem(theirMind.character.name, ourElixirIndex, Math.min(ourElixirs.q!, SETTINGS.ELIXIR_THRESHOLD - (theirElixirs?.q ?? 0)))
                    }
                }
            }

            for (let key in theirMind.character.items) {
                if (+key > SETTINGS.MINIMUM_RESERVED_ITEM_INDEX) //reserve bottom row 
                    continue;

                let item = theirMind.character.items[key];

                if (item != null) {
                    let gItem = Game.G.items[item.name];

                    if (gItem && SETTINGS.ITEM_TYPES_TO_KEEP.contains(gItem.type))
                        continue;

                    if (!this.character.isFull())
                        await theirMind.character.sendItem(this.character.name, +key, item.q);
                }
            }
        }
    }
    //#endregion

    //#region Dismantle
    shouldGoDismantle() {
        return this.items.any(item => item != null && this.shouldDismantle(item));
    }

    shouldDismantle(item: ItemInfo) {
        if(SETTINGS.ITEMS_TO_DISMANTLE.contains(item.name))
            return true;

        return false;
    }

    async dismantleItemsAsync() {
        for(let index in this.character.items) {
            let item = this.character.items[index];

            if(item == null)
                continue;

            if(SETTINGS.ITEMS_TO_DISMANTLE.contains(item.name)) {
                this.dismantle(+index);
                await PromiseExt.delay(500);
            }
        }
    }
    //#endregion

    //#region Bank
    shouldGoToBank() {
        if (this.character.gold > SETTINGS.MERCHANT_GOLD_TO_HOLD)
            return true;

        if (this.character.gold < SETTINGS.MERCHANT_MIN_GOLD)
            return true;

        return this.items.any(item => item != null && this.shouldDeposit(item));
    }

    async depositItemsAsync() {
        for (let index in this.character.items) {
            let item = this.character.items[+index];
            if (item == null)
                continue;

            if (this.shouldDeposit(item))
                await this.character.depositItem(+index);
        }
    }

    shouldDeposit(item: ItemInfo) {
        if (item?.name == null)
            return false;

        let gItem = Game.G.items[item.name];

        if(gItem && gItem.type != null && SETTINGS.ITEM_TYPES_TO_KEEP.contains(gItem.type))
            return false;

        if(gItem.type != null && gItem.type === <ItemType>"stand")
            return false;

        if(SETTINGS.ITEMS_TO_SELL.contains(item.name))
            return false;

        if (SETTINGS.ITEMS_TO_UPGRADE.contains(item.name) && item.level != null && item.level < SETTINGS.MAX_UPGRADE_LEVEL)
            return false;

        if(SETTINGS.ITEMS_TO_EXCHANGE.contains(item.name))
            return false;

        if(SETTINGS.POTIONS.contains(item.name))
            return false;

        if(SETTINGS.C_SCROLLS.contains(item.name))
            return false;

        if(SETTINGS.U_SCROLLS.contains(item.name))
            return false;

        if(SETTINGS.S_SCROLLS.contains(item.name))
            return false;

        if(SETTINGS.ITEMS_TO_BUY_FROM_MERCHANT.contains(item.name))
            return false;

        return true;
    }

    async depositGoldAsync() {
        let goldToDeposit = this.character.gold - SETTINGS.MERCHANT_GOLD_TO_HOLD * 0.75;

        if (goldToDeposit > 0) {
            let deferred = new Deferred();
            let gold = this.character.gold;

            PromiseExt.pollWithTimeoutAsync(async () => this.character.gold != gold, 1000)
                .finally(() => deferred.resolve());

            await this.character.depositGold(goldToDeposit);
            await deferred.promise;
        }
    }

    async withdrawlGoldAsync() {
        let goldToWithdrawl = (SETTINGS.MERCHANT_GOLD_TO_HOLD * 0.75) - this.character.gold;

        if (goldToWithdrawl > 0) {
            let deferred = new Deferred();
            let gold = this.character.gold;

            PromiseExt.pollWithTimeoutAsync(async () => this.character.gold != gold, 1000)
                .finally(() => deferred.resolve());

            await this.character.withdrawGold(goldToWithdrawl);
            await deferred.promise;
        }
    }

    async withdrawlItemsAsync() {
        let bankedItems = new List<IBankedItem>();

        for (let key in this.character.bank) {
            if (key === "gold")
                continue;

            let bank = this.character.bank[<BankPackName>key]

            if (bank == null || typeof (bank) == "number")
                continue;

            for (let index in bank) {
                let item = bank[index];
                if (item == null)
                    continue;

                bankedItems.add({ bank: <BankPackName>key, item: item, slot: +index });
            }
        }

        //check if we can craft anything with what's in the bank
        //if so, withdrawl items needs for the craft
        for (let recipeName of SETTINGS.ITEMS_TO_CRAFT) {
            let recipe = Game.G.craft[recipeName];

            if (!recipe)
                continue;

            let canCraft = true;
            let itemsToWithdrawl = new List<IBankedItem>();

            //for each recipe we are interested in crafting
            for (let [quantity, name, level] of recipe.items) {
                let currentQ = 0;

                //for each inventory item
                for(let index in this.character.items) {
                    if(currentQ < quantity)
                        break;

                    let item = this.character.items[index];

                    //if it's a required component, tally up what we have
                    if(item.name === name && (item.level ?? 0) === (level ?? 0))
                        currentQ += item.q ?? 1;
                }

                //for each bank item
                for (let bankedItem of bankedItems) {
                    if(currentQ < quantity)
                        break;

                    //if it's a required component, tally up what we have
                    if (bankedItem.item.name === name && (bankedItem.item.level ?? 0) === (level ?? 0)) {
                        currentQ += bankedItem.item.q ?? 1;
                        itemsToWithdrawl.add(bankedItem);
                    }
                }

                //if we dont have enough of any component, we cant craft this recipe
                if (currentQ < quantity) {
                    canCraft = false;
                    break;
                }
            }

            //if we have all the necessary stuff, withdrawl anything marked for withdrawl
            if (canCraft) {
                for (let bankedItem of itemsToWithdrawl)
                    await this.character.withdrawItem(bankedItem.bank, bankedItem.slot!);
            }
        }

        let compoundables = this.locateCompoundables(bankedItems
            .where(bankedItem => SETTINGS.ITEMS_TO_COMPOUND.contains(bankedItem.item.name))
            .where(bankedItem => (bankedItem.item.level ?? 0) < SETTINGS.MAX_COMPOUND_LEVEL))
            .toArray();

        //scour bank for things that can be compounded, withdrawl them
        for (let compoundableSet of compoundables) {
            if(this.items.count(item => item == null) < 3)
                return;

            for (let bankedItem of compoundableSet)
                await this.character.withdrawItem(bankedItem.bank, bankedItem.slot);
        }
    }
    //#endregion

    //#region Craft
    requiredForCrafting(itemName: ItemName) {
        for (let item of SETTINGS.ITEMS_TO_CRAFT) {
            let gItem = Game.G.craft[item];

            if (gItem == null)
                continue;

            if (new List(gItem.items).any(([, name,]) => itemName === name))
                return true;
        }

        return false;
    }

    shouldGoCraft() {
        if (this.character.isFull())
            return false;

        for (let item of SETTINGS.ITEMS_TO_CRAFT) {
            if (this.canCraft(item))
                return true;
        }

        return false;
    }

    async craftItemsAsync() {
        if (this.character.isFull())
            return;

        while (this.shouldGoCraft()) {
            for (let item of SETTINGS.ITEMS_TO_CRAFT) {
                if (this.canCraft(item)) {
                    this.autoCraft(item);
                    await PromiseExt.delay(100);
                }
            }
        }
    }

    autoCraft(itemName: ItemName) {
        let craftInfo = Game.G.craft[itemName];

        if (craftInfo == null)
            return false;

        let itemSlots = [];
        let craftSlot = 0;
        for (let [quantity, name, level] of craftInfo.items) {
            for (let index in this.character.items) {
                let item = this.character.items[index];

                //only care about items with the right name
                if (item == null || item.name !== name)
                    continue;

                //only care about items that match level requirement
                if ((level || 0) > (item.level || 0))
                    continue;

                //only use stacks with enough quantity to fulfil the need
                if ((quantity || 1) > (item.q || 1))
                    continue;

                //push the craft slot/index tuple
                itemSlots.push([craftSlot++, +index]);
                break;
            }
        }

        this.character.socket.emit("craft", { items: itemSlots });
    }

    canCraft(itemName: ItemName) {
        let info = Game.G.craft[itemName];
        let req_dic = new Dictionary<ItemName, { q: number, c: number }>();

        if (info == null)
            return false;

        for (let [quantity, name] of info.items) {
            if (name != null && quantity != null)
                req_dic.addOrSet(name, { q: quantity, c: 0 });
        }

        for (let [key, value] of req_dic) {
            for (let item of this.character.items) {
                if (item == null)
                    continue

                if (item.name === key && (item.level == null || item.level == 0))
                    value.c += item.q ?? 1;
            }

            if (value.c < value.q)
                return false;
        }

        return true;
    }
    //#endregion

    //#region Exchange
    shouldExchangeItems() {
        if (this.character.isFull())
            return false;

        for (let item of this.character.items) {
            if (item == null || !SETTINGS.ITEMS_TO_EXCHANGE.contains(item.name))
                continue;

            let gItem = Game.G.items[item.name];

            if (gItem.e != null && item.q != null && item.q >= gItem.e)
                return true;
        }

        return false;
    }

    async exchangeItemsAsync() {
        while (this.shouldExchangeItems()) {
            if (this.character.q.exchange) {
                await PromiseExt.delay(100);
                continue;
            }

            for (let index in this.character.items) {
                let itemInfo = this.character.items[index];

                if (itemInfo == null || !SETTINGS.ITEMS_TO_EXCHANGE.contains(itemInfo.name))
                    continue;

                let gItem = Game.G.items[itemInfo.name];
                if (gItem.e != null && itemInfo.q != null && itemInfo.q >= gItem.e) {
                    let destination = Data.quests.getValue(gItem.quest)?.id ?? "exchange";
                    await this.smartMove(destination, { getWithin: Constants.NPC_INTERACTION_DISTANCE * 0.75 })
                    await this.character.exchange(+index);
                }
            }
        }
    }
    //#endregion

    //#region Buy/Sell
    async buyPotionsAsync() {
        for (let potion of SETTINGS.POTIONS) {
            let currentQ = this.character.countItem(potion);

            if (currentQ < SETTINGS.POTION_THRESHOLD * 3)
                await this.character.buy(potion, SETTINGS.POTION_THRESHOLD * 3 - currentQ);
        }
    }

    async sellTrashAsync() {
        for (let index in this.character.items) {
            let item = this.character.items[index];

            if (item?.name == null)
                continue;

            if (SETTINGS.ITEMS_TO_SELL.contains(item.name))
                await this.character.sell(+index, item.q ?? 1);
        }
    }

    async buyScrollsAsync() {
        let index = 0;
        for (let scroll of SETTINGS.U_SCROLLS) {
            let currentQ = this.character.countItem(scroll);
            let threshold = Math.floor(SETTINGS.SCROLLS_THRESHOLD / ++index);

            if (currentQ < threshold)
                await this.character.buy(scroll, threshold - currentQ);
        }

        index = 0;
        for (let scroll of SETTINGS.C_SCROLLS) {
            let currentQ = this.character.countItem(scroll);
            let threshold = Math.floor(SETTINGS.SCROLLS_THRESHOLD / ++index);

            if (currentQ < threshold)
                await this.character.buy(scroll, threshold - currentQ);
        }

        index = 0;
        for (let scroll of SETTINGS.U_SCROLLS) {
            let currentQ = this.character.countItem(scroll);
            let threshold = Math.floor(SETTINGS.SCROLLS_THRESHOLD / ++index);

            if (currentQ < threshold)
                await this.character.buy(scroll, threshold - currentQ);
        }
    }

    async buyFromMerchantAsync() {
        for (let itemName of SETTINGS.ITEMS_TO_BUY_FROM_MERCHANT) {
            if (this.character.isFull())
                return;

            if (!this.items.any(item => item != null && item.name === itemName))
                await this.character.buy(itemName);
        }
    }

    async buyFromPontyAsync() {
        if (this.character.isFull())
            return;

        let pontyItems = await this.character.getPontyItems();

        for (let item of pontyItems) {
            if (this.character.isFull())
                return;

            if (SETTINGS.ITEMS_TO_BUY_FROM_PONTY.contains(item.name) && (item.level == null || item.level <= 3))
                await this.character.buyFromPonty(item);
        }
    }
    //#endregion

    //#region Upgrade/Compound
    async upgradeItemsAsync() {
        let upgrading = true;

        while (upgrading) {
            if (this.character.q.upgrade) {
                await PromiseExt.delay(100);
                continue;
            }
            upgrading = false;
            for (let index in this.character.items) {
                let item = this.character.items[index];

                if (item != null
                    && item.level != null
                    && SETTINGS.ITEMS_TO_UPGRADE.contains(item.name)
                    && item.level < SETTINGS.MAX_UPGRADE_LEVEL
                    && !this.requiredForCrafting(item.name)) {

                    let grade = this.character.calculateItemGrade(item);
                    let scrollName = SETTINGS.U_SCROLLS.elementAt(grade);

                    if (scrollName == null)
                        continue;

                    let scrollSlot = this.character.locateItem(scrollName);

                    if (scrollSlot == null)
                        continue;

                    upgrading = true;
                    await this.character.massProduction();
                    await this.character.upgrade(+index, scrollSlot);
                    break;
                }
            }
        }
    }

    async upgradeBuyableItemsAsync() {
        let upgrading = true;

        while (upgrading) {
            upgrading = false;

            for (let index in this.character.items) {
                let item = this.character.items[index];

                if (item == null)
                    continue;

                if (item.level != null && item.level < 9 && SETTINGS.ITEMS_TO_BUY_FROM_MERCHANT.contains(item.name)) {
                    let grade = this.character.calculateItemGrade(item);
                    let scrollName = SETTINGS.U_SCROLLS.elementAt(grade);

                    if (scrollName == null)
                        continue;

                    let scrollSlot = this.character.locateItem(scrollName);

                    if (scrollSlot == null)
                        continue;

                    upgrading = true;
                    await this.character.massProduction();
                    await this.character.upgrade(+index, scrollSlot);
                    break;
                }
            }
        }
    }

    locateCompoundables<T extends IIndexedItem>(items: IEnumerable<T>) {
        return items
            //group by item name
            .groupBy(indexedItem => indexedItem.item.name)
            //select subgroups based on level
            .select(([, group]) => group.groupBy(groupx => groupx.item.level ?? 0))
            //select all subgroups
            .selectMany(groups => groups)
            //where there are still 3 or more items
            .where(([, group]) => group.count() >= 3)
            .select<ICompoundableSet<T>>(([, group]) => {
                let arr = group.toArray();

                return [arr[0], arr[1], arr[2]];
            });
    }

    async compoundItemsAsync() {
        let compounding = true;

        while (compounding) {
            if (this.character.q.compound) {
                await PromiseExt.delay(100);
                continue;
            }
            compounding = false;

            for (let itemName of SETTINGS.ITEMS_TO_COMPOUND) {
                for (let level = 0; level < SETTINGS.MAX_COMPOUND_LEVEL; level++) {
                    let items = this.character.locateItems(itemName, this.character.items, { levelGreaterThan: level - 1, levelLessThan: level + 1 });
                    let required = this.requiredForCrafting(itemName);

                    if (required && (level > 0 || items.length < 4))
                        continue;
                    else if (items.length < 3)
                        continue;

                    let itemToCompound = this.character.items[items[0]];
                    let grade = this.character.calculateItemGrade(itemToCompound);
                    let scrollName = SETTINGS.C_SCROLLS.elementAt(grade);

                    if (scrollName == null)
                        continue;

                    let scrollSlot = this.character.locateItem(scrollName);

                    if (scrollSlot == null)
                        continue;

                    compounding = true;
                    await this.character.massProduction();
                    await this.character.compound(items[0], items[1], items[2], scrollSlot);
                    break;
                }
            }
        }
    }
    //#endregion

    //#region BossHunting
    async seekBosses() {
        //for each boss that is respawned and it's been at least 5 minutes since we last checked or killed it
        let bossLocations = SETTINGS.ATTACKABLE_BOSSES
            .where(bossName => {
                let lastSearched = Data.bossHunt.getValue(bossName);

                if (lastSearched == null)
                    return true;

                let gMonster = Game.G.monsters[bossName];
                //only check bosses that are past their respawn time
                //and it has been at least 5 mins since we last checked it
                return DateExt.utcNow.subtract(lastSearched) > Math.max(gMonster.respawn * 1000, 1000 * 60 * 5);
            })
            //order them descending by the time since we last checked (the longer its been, the higher up the list it will be)
            .orderByDesc(bossName => {
                let bossHuntInfo = Data.bossHunt.getValue(bossName);

                //if we recently started up and havent checked a boss
                //use it's respawn as our order var
                if (bossHuntInfo == null)
                    return Game.G.monsters[bossName].respawn;

                return DateExt.utcNow.subtract(Data.bossHunt.getValue(bossName)!);
            })
            //find all the locations for each of these bosses
            .selectMany(bossName => new List<IPosition>(this.character.locateMonster(bossName)))
            //group them by the map they spawn on
            .groupBy(location => location.map)
            //select the locations (they should now be grouped by map)
            .selectMany(([, locations]) => locations);

        for (let location of bossLocations) {
            if (this.hiveMind.boss)
                return;

            await this.smartMove(location, { getWithin: 450 });
        }
    }
    //#endregion
}
import { BankPackType } from "alclient";
import { Dictionary } from "../collections/Dictionary";
import { HiveMind, Merchant, ScriptBase, Location, PromiseExt, Point, Deferred, SETTINGS, List, ItemInfo, Game, ItemName, Logger, ServerIdentifier, ServerRegion } from "../internal";

export class MerchantScript extends ScriptBase<Merchant> {
    wasMoving: boolean;
    standLocation: Location;
    visitParty: boolean;

    constructor(entity: Merchant, hiveMind: HiveMind) {
        super(entity, hiveMind);
        this.Kind.push("MerchantScript");

        this.wasMoving = true;
        this.standLocation = new Location(new Point(-130, -100), "main");
        this.visitParty = false;
    }

    static async startAsync(name: string, region: ServerRegion, id: ServerIdentifier, hiveMind: HiveMind) {
        let character = await Game.startMerchant(name, region, id)
        character.name = name;

        let script = new MerchantScript(character, hiveMind);
        script.execute();
        return script;
    }

    async execute() {
        this.loopAsync(() => this.mainAsync(), 1000);
        this.loopAsync(() => this.handleStandAsync(), 1000 / 5);
        this.loopAsync(async () => this.visitParty = true, 1000 * 60 * 30, true);
        //PromiseExt.loopAsync(() => this.buyFromPontyAsync(), 1000 * 60 * 1);
        this.loopAsync(() => this.luckBuffNearbyAsync(), 1000);
    }

    async mainAsync() {
        if(this.character.rip) {
            this.character.respawn();
            await PromiseExt.delay(2500);
            return;
        }

        if (this.visitParty === true) {
            let leader = this.hiveMind.leader;

            if (leader == null)
                return;

            await this.character.smartMove(leader.character, { getWithin: 150 });

            if(this.distance(leader.character) < 200) {
                await this.tradeWithPartyAsync();
                this.visitParty = false;
            }
        } else if(false) {
            //TODO: add dismantle logic
        } else if (this.shouldGoToBank()) {
            await this.character.smartMove("bank");

            if (this.character.map === "bank" && this.character.bank != null) {
                await this.depositGoldAsync();
                await this.withdrawlGoldAsync();
                await this.depositItemsAsync();
                await this.withdrawlItems();
                //manage inventory?
            }
        } else if (this.shouldGoCraft()) {
            await this.character.smartMove("craftsman", { getWithin: 100 });
            await this.craftAllItemsAsync();
        } else if (this.shouldExchangeItems()) {
            await this.character.smartMove("exchange", { getWithin: 100 });
            await this.exchangeItemsAsync();
        } else if (this.distance(this.standLocation) > 10)
            await this.character.smartMove(this.standLocation);
        else {
            await this.buyPotionsAsync();
            await this.buyScrollsAsync();
            await this.sellTrashAsync();
            await this.upgradeItemsAsync();
            await this.compoundItemsAsync();
            await this.buyFromMerchantAsync();
        }
    }

    async handleStandAsync() {
        let moving = this.character.moving;

        if (moving != this.wasMoving) {
            if (moving)
                await this.character.closeMerchantStand();
            else
                await this.character.openMerchantStand();

            this.wasMoving = moving;
        }
    }

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
                    .catch(() => {});
                await PromiseExt.delay(100);
            }
        }
    }

    async tradeWithPartyAsync() {
        let minds = this.hiveMind
            .where(([key, value]) => value.isConnected && key !== this.character.name)
            .select(([, value]) => value);

        for (let theirMind of minds) {
            await theirMind.character.sendGold(this.character.name, theirMind.character.gold);

            for (let key in theirMind.character.items) {
                let item = theirMind.character.items[key];

                if (item != null && !SETTINGS.POTIONS.contains(item.name) && item.name !== "tracker")
                    await theirMind.character.sendItem(this.character.name, +key, item.q);
            }

            for (let potion of SETTINGS.POTIONS) {
                let theirQuantity = theirMind.character.countItem(potion);

                if (theirQuantity < SETTINGS.POTION_THRESHOLD)
                    await this.character.sendItem(theirMind.character.name, this.character.locateItem(potion), SETTINGS.POTION_THRESHOLD - theirQuantity);
            }
        }
    }

    //#region Dismantle
    shouldDismantle(item: ItemInfo, items: ItemInfo[]) {
        //only dismantle compoundable items that are level 1, and are required for crafting
        if(item == null || item.level == null || item.level !== 1 || !this.requiredForCrafting(item.name))
            return false;

        let gItem = Game.G.items[item.name];

        if(!gItem.compound)
            return false;

        //only dismantle if we have all other requirements
        for(let craftName of SETTINGS.ITEMS_TO_CRAFT) {
            let recipe = Game.G.craft[craftName];

            if(recipe == null)
                continue;

            for(let [quantity, name, level] of recipe.items) {
                if(name === item.name)
                    continue;

                let currentItems = this.character.locateItems(name, items, { level: 1 });
                if(currentItems.length * 3 < quantity)
                    return false;
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

        for (let item of this.character.items) {
            if (this.shouldDeposit(item))
                return true;
        }

        return false;
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

        if (SETTINGS.ITEMS_TO_DEPOSIT.contains(item.name))
            return true;

        let requiredForCrafting = this.requiredForCrafting(item.name);

        if (gItem.type === "material" && !requiredForCrafting)
            return true;

        if (SETTINGS.ITEMS_TO_DEPOSIT.contains(item.name))
            return true;

        if (SETTINGS.ITEMS_TO_UPGRADE.contains(item.name) && item.level != null) {
            if (item.level >= SETTINGS.MAX_UPGRADE_LEVEL)
                return true;

            //requiredforcrafting?
        }

        if (SETTINGS.ITEMS_TO_COMPOUND.contains(item.name) && item.level != null) {
            if (item.level >= SETTINGS.MAX_COMPOUND_LEVEL)
                return true;

            if (requiredForCrafting && item.level > 0)
                    return true;
        }

        //if this item is required for crafting
        if(requiredForCrafting) {
            let quantityRequired = 0;
            let stackable = Game.G.items[item.name].s;

            //check how much is required for whatever craft it's needed for
            for(let itemName of SETTINGS.ITEMS_TO_CRAFT) {
                let recipe = Game.G.craft[itemName];

                if(recipe != null)
                    for(let [quantity, name, level] of recipe?.items)
                        if(name === item.name && quantity > quantityRequired && level === item.level)
                            quantityRequired = quantity;
            }

            //check how many we have of this item
            if(quantityRequired > 0) {
                let currentSlotsUsed = this.character.locateItems(item.name, undefined, { level: item.level }).length;

                //if we have over double the crafting requirements, we should bank it for now to save inv space
                //we only really care about slots used, if something is stackable then it probably shouldnt be deposited
                if(currentSlotsUsed > quantityRequired * 2)
                    return true;
            }
        }

        if (SETTINGS.ITEMS_TO_BUY_FROM_MERCHANT.contains(item.name) && item.level != null) {
            if (item.level >= 9)
                return true;

            //requiredforcrafting?
        }

        return false;
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

    async withdrawlItems() {
        for(let key in this.character.bank) {
            if(key === "gold")
                continue;

            let bank = this.character.bank[<BankPackType>key];

            if(bank == null || typeof(bank) == "number")
                continue;

            for(let index in bank) {
                let item = bank[index];
                if(item == null)
                    continue;

                if(this.shouldWithdrawlItem(item))
                    await this.character.withdrawItem(<Exclude<BankPackType, "gold">>key, +index);
            }
        }
    }

    shouldWithdrawlItem(item: ItemInfo) {
        if (this.requiredForCrafting(item.name)) {
            let quantityRequired = 0;

            //check how much is required for whatever craft it's needed for
            for (let itemName of SETTINGS.ITEMS_TO_CRAFT) {
                let recipe = Game.G.craft[itemName];

                if (recipe != null)
                    for (let [quantity, name, level] of recipe?.items)
                        if (name === item.name && quantity > quantityRequired && level === item.level)
                            quantityRequired = quantity;
            }

            //check how many we have of this item
            if(quantityRequired > 0) {
                let currentItems = this.character.locateItems(item.name, undefined, { level: item.level });
                let currentQuantity = new List(currentItems)
                    .sumBy(item => this.character.items[item].q ?? 1);
                //if we have less than double the crafting requirements, we should withdrawl it
                if(currentQuantity < quantityRequired * 2)
                    return true;
            }
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

    async craftAllItemsAsync() {
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

        if(craftInfo == null)
            return false;

        let itemSlots = [];
        let craftSlot = 0;
        for(let [quantity, name, level] of craftInfo.items) {
            for(let index in this.character.items) {
                let item = this.character.items[index];

                //only care about items with the right name
                if(item == null || item.name !== name)
                    continue;

                //only care about items that match level requirement
                if((level || 0) > (item.level || 0))
                    continue;

                //only use stacks with enough quantity to fulfil the need
                if((quantity || 1) > (item.q || 1))
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
        let req_dic = new Dictionary<ItemName, {q: number, c: number}>();

        if(info == null)
            return false;

        for(let [quantity, name] of info.items) {
            if(name != null && quantity != null)
                req_dic.addOrSet(name, {q: quantity, c: 0});
        }

        for(let [key, value] of req_dic) {
            for(let item of this.character.items) {
                if(item == null)
                    continue

                if(item.name === key && (item.level == null || item.level == 0))
                    value.c += item.q ?? 1;
            }

            if(value.c < value.q)
                return false;
        }

        return true;
    }
    //#endregion
    
    //#region Exchange
    shouldExchangeItems() {
        if (this.character.isFull())
            return false;

        return SETTINGS.ITEMS_TO_EXCHANGE.any(item => this.character.hasItem(item));
    }

    async exchangeItemsAsync() {
        while (this.shouldExchangeItems()) {
            if(this.character.q.exchange) {
                await PromiseExt.delay(100);
                continue;
            }

            for (let index in this.character.items) {
                let item = this.character.items[index];

                if (item == null)
                    continue;

                if (SETTINGS.ITEMS_TO_EXCHANGE.contains(item.name)) {
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

            if (!(new List(this.character.items).any(item => item != null && item.name === itemName)))
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
            if(this.character.q.upgrade) {
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
                }
            }
        }
    }

    async compoundItemsAsync() {
        let compounding = true;

        while (compounding) {
            if(this.character.q.compound) {
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
                }
            }
        }
    }
    //#endregion
}

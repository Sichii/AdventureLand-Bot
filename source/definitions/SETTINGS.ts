import { List, MonsterName, ItemName, Location, Point } from "../internal";

export class SETTINGS {
    //#region Attack
    static ATTACK_MTYPES = new List<MonsterName>([
        "bbpompom"
    ]);
    static ATTACKABLE_BOSSES = new List<MonsterName>(["snowman", "wabbit", "greenjr"]);
    //#endregion

    //#region Party
    static PARTY_INFO = new List([
        {
            "name": "makiz",
            "code_slot": 100,
            "class": "warrior"
        },
        {
            "name": "ragnah",
            "code_slot": 99,
            "class": "priest"
        },
        {
            "name": "dreamweaver",
            "code_slot": 98,
            "class": "ranger"
        }
    ]);

    static LEADER_NAME = "makiz";
    static MERCHANT_NAME = "sichi";
    static MERCHANT_STAND_LOCATION = new Location(new Point(-130, -100), "main");
    //#endregion

    //#region Thresholds
    static FOLLOW_DISTANCE = 100;
    static MERCHANT_GOLD_TO_HOLD = 50000000;
    static MERCHANT_MIN_GOLD = 10000000;
    static MERCHANT_VISIT_PARTY_EVERY = 1000 * 60 * 15; //15mins
    static PRIEST_HEAL_AT = 0.75;
    static HP_POT_AT = 0.375;
    static MP_POT_AT = 0.5;
    static POTION_THRESHOLD = 1000;
    static SCROLLS_THRESHOLD = 50;
    static MAX_COMPOUND_LEVEL = 3;
    static MAX_UPGRADE_LEVEL = 7;
    //#endregion

    //#region Buy
    static POTIONS = new List<ItemName>([
        "hpot0", "mpot0"
    ]);

    static C_SCROLLS = new List<ItemName>([
        "cscroll0", "cscroll1"
    ]);

    static U_SCROLLS = new List<ItemName>([
        "scroll0", "scroll1", "scroll2"
    ]);

    static S_SCROLLS = new List<ItemName>([
        "intscroll", "dexscroll", "strscroll"
    ]);
    //#endregion

    //#region Items
    static ITEMS_TO_COMPOUND = new List<ItemName>([
        "ctristone"
    ]);

    static ITEMS_TO_UPGRADE = new List<ItemName>([
        "fireblade", "froststaff", "t2bow",
        "eslippers", "ecape", "oozingterror", "harbringer", "bataxe"
    ]);

    static ITEMS_TO_DEPOSIT = new List<ItemName>([
        "elixirdex0", "elixirint0", "elixirstr0", "elixirvit0", "elixirdex1", "elixirint1", "elixirstr1", "elixirvit1", "snakeoil",
        "bunnyelixir", 
        "seashell", 
        "intearring", "dexearring", "strearring", "mbelt", "rabbitsfoot"
    ]);

    static ITEMS_TO_BUY_FROM_MERCHANT = new List<ItemName>([
        "staff"
    ]);

    static ITEMS_TO_BUY_FROM_PONTY = new List<ItemName>([
        "dexring", 
        "intearring", "dexearring", "strearring",
        "mbelt",
        "fireblade", "froststaff", "t2bow",
    ]);

    static ITEMS_TO_SELL = new List<ItemName>([
        "epyjamas", "eears", "pinkie", "carrotsword", 
    ]);

    static ITEMS_TO_EXCHANGE = new List<ItemName>([
        "candy0", "candy1", "basketofeggs", "goldenegg", "gem0"
    ]);

    //not implemented yet
    static ITEMS_TO_CRAFT = new List<ItemName>([
        "froststaff", "ctristone", "basketofeggs"
    ]);
    //#endregion
}
import { List, Dictionary, MonsterName, ItemName, Location, Point, ItemType, PartyMemberSettings } from "../internal";

export class SETTINGS {
    //#region Attack
    static ATTACKABLE_BOSSES = new List<MonsterName>(["snowman", "wabbit", "greenjr", "jr", "mvampire", "goldenbat", "phoenix"]);
    //#endregion

    //#region Movement
    static CIRCULAR_KITE_DEGREE_INTERVAL = 30;
    //#endregion

    //#region Party
    static PARTY_SETTINGS = new Dictionary<string, PartyMemberSettings>(new Map<string, PartyMemberSettings>(
        [
            ["sichi",
                {
                    class: "merchant",
                    elixir: "bunnyelixir",
                    mainInterval: 1000,
                    movementInterval: 1000 / 10
                }
            ],
            ["makiz",
                {
                    class: "warrior",
                    elixir: "bunnyelixir",
                    mainInterval: 1000 / 30,
                    movementInterval: 1000 / 10,
                    kite: false,
                    attackMTypes: new List([
                        "bat"
                    ]),
                    map: "cave"
                }
            ],
            ["ragnah",
                {
                    class: "priest",
                    elixir: "bunnyelixir",
                    mainInterval: 1000 / 30,
                    movementInterval: 1000 / 10,
                    kite: true,
                    attackMTypes: new List([
                        "bat"
                    ]),
                    map: "cave"
                }
            ],
            ["dreamweaver",
                {
                    class: "ranger",
                    elixir: "bunnyelixir",
                    mainInterval: 1000 / 30,
                    movementInterval: 1000 / 10,
                    kite: true,
                    attackMTypes: new List([
                        "bat"
                    ]),
                    map: "cave"
                }
            ]
        ]));

    static get MERCHANT_NAME() {
        let merchantSettings = this.PARTY_SETTINGS
            .where(([name, settings]) => settings.class === "merchant")
            .firstOrDefault();

        return merchantSettings![0];
    }
    static MERCHANT_STAND_LOCATION = new Location(new Point(-130, -100), "main");
    //#endregion

    //#region Thresholds
    static MERCHANT_GOLD_TO_HOLD = 50000000;
    static MERCHANT_MIN_GOLD = 10000000;
    static MERCHANT_VISIT_PARTY_EVERY = 1000 * 60 * 5; //15mins
    static PRIEST_HEAL_AT = 0.75;
    static HP_POT_AT = 0.5;
    static MP_POT_AT = 0.75;
    static POTION_THRESHOLD = 3000;
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
        //"ctristone", "vitring"
        "wbook0", "ctristone"
    ]);

    static ITEMS_TO_UPGRADE = new List<ItemName>([
        "handofmidas", "firestaff", "mcape", "quiver",
        "fireblade", "froststaff", "t2bow",
        "eslippers", "ecape", "oozingterror", "harbringer", "bataxe",
        "throwingstars", "basher", "crossbow",
    ]);

    static ITEMS_TO_DEPOSIT = new List<ItemName>([
        "cxjar", "seashell", "cryptkey", "scroll3", "scroll4", "cscroll3",
        "elixirdex0", "elixirint0", "elixirstr0", "elixirvit0", "elixirdex1", "elixirint1", "elixirstr1", "elixirvit1", "snakeoil",
        "bunnyelixir", "mbelt", "rabbitsfoot", "goldenegg",
        "intearring", "dexearring", "strearring", "vitearring", "forscroll", "sanguine",
        "suckerpunch", "fury", "starkillers"
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
        "hpbelt", "hpamulet", "ringsj", "crabclaw",
        "wcap", "wattire", "wgloves", "wbreeches", "wshoes",
        "intamulet", "dexamulet", "stramulet",
        "spear", "pmace", "hammer", "rapier", "sword", "dagger",

        //rugged armor
        "coat1", "helmet1", "pants1", "gloves1", "shoes1",
        //heavy armor
        "harmor", "hhelmet", "hpants", "hgloves", "hboots",
        //darkforge armor
        "xarmor", "xhelmet", "xpants", "xgloves", "xboots"
    ]);

    static ITEMS_TO_EXCHANGE = new List<ItemName>([
        "candy0", "candy1", "basketofeggs", "gem0", "armorbox", "weaponbox",
    ]);

    static ITEMS_TO_CRAFT = new List<ItemName>([
        "froststaff", "ctristone", "basketofeggs"
    ]);

    static readonly ITEM_TYPES_TO_KEEP = new List<ItemType>([
        "pot", <ItemType>"elixir", <ItemType>"tracker"
    ]);
    //#endregion
}
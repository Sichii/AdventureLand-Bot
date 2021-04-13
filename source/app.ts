import { Game, HiveMind, Logger, MerchantScript, Data, Pathfinder, PriestScript, RangerScript, WarriorScript } from "./internal";

async function main() {
    try {
        let initialize_pathfinder = Pathfinder.prepare();
        let login = Game.loginJSONFile("credentials.json");
        await Promise.all([initialize_pathfinder, login]);
        Data.populate();

        const hiveMind = new HiveMind();
        const merchant = await MerchantScript.startAsync("sichi", "US", "II", hiveMind);
        const warrior = await WarriorScript.startAsync("makiz", "US", "II", hiveMind);
        const priest = await PriestScript.startAsync("ragnah", "US", "II", hiveMind);
        const ranger = await RangerScript.startAsync("dreamweaver", "US", "II", hiveMind);

        //merchant.visitParty = true;
    } catch (e) {
        Logger.Error(e);
    }
}

main();
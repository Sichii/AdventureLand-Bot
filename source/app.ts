import { Game, HiveMind, Logger, MerchantScript, Pathfinder, PriestScript, PromiseExt, RangerScript, WarriorScript } from "./internal";

async function main() {
    try {
        console
        let initialize_pathfinder = Pathfinder.prepare();
        let login = Game.loginJSONFile("credentials.json");
        await Promise.all([initialize_pathfinder, login]);

        const hiveMind = new HiveMind();
        const merchant = await MerchantScript.startAsync("sichi", "US", "III", hiveMind);
        const warrior = await WarriorScript.startAsync("makiz", "US", "III", hiveMind);
        const priest = await PriestScript.startAsync("ragnah", "US", "III", hiveMind);
        const ranger = await RangerScript.startAsync("dreamweaver", "US", "III", hiveMind);

        //merchant.visitParty = true;
    } catch (e) {
        Logger.Error(e);
    }
}

main();
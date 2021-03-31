import chalk from "chalk";
import { SETTINGS, Logger, LogLevel, MerchantScript, PingCompensatedScript } from "../internal";

export class CommandManager {
    script: PingCompensatedScript;

    constructor(script: PingCompensatedScript) {
        this.script = script;
    }

    handleCommand(data: string) {
        Logger.Log(LogLevel.Info, chalk.green(`CODE COMMAND: ${JSON.stringify(data)}`));

        try {
            eval(data);
        } catch (e) {
            Logger.Error(`CODE COMMAND ERROR: 
${data}`);
        }
    }

    visitParty() {
        let merchant = this.script.as<MerchantScript>("MerchantScript");

        if (merchant != null)
            merchant.visitParty = true;
    }

    showMetrics() {
        let metrics = this.script.hiveMind
            .where(([name,]) => name !== SETTINGS.MERCHANT_NAME)
            .select(([, mind]) => mind.metricManager.metrics)
            .toArray();
        
        Logger.Log(LogLevel.Info, chalk.greenBright(`METRICS: 
${JSON.stringify(metrics, null, 4)}`));
    }
}
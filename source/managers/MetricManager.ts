import { PingCompensatedScript, Utility, CONSTANTS, DateExt } from "../internal";

export class MetricManager {
    script: PingCompensatedScript;
    prevExp: number;
    prevGold: number;
    netExp: number;
    netGold: number;
    startTime: DateExt;

    constructor(script: PingCompensatedScript) {
        this.script = script;
        this.prevExp = script.character.xp;
        this.prevGold = script.character.gold;
        this.netExp = 0;
        this.netGold = 0;
        this.startTime = DateExt.utcNow;

        if(script.character.ctype !== "merchant")
            script.loopAsync(async () => this.update(), 5000, true);
    }

    update() {
        let newExp = this.script.character.xp;
        let newGold = this.script.character.gold;

        if(newExp > this.prevExp)
            this.netExp += newExp - this.prevExp;

        if(newGold > this.prevGold)
            this.netGold += newGold - this.prevGold;

        this.prevExp = newExp;
        this.prevGold = newGold;
    }

    get expHr() {
        let elapsedHrs = DateExt.utcNow.subtractX(this.startTime).totalHours;
        return Math.floor(this.netExp / elapsedHrs);
    }

    get goldHr() {
        let elapsedHrs = DateExt.utcNow.subtractX(this.startTime).totalHours;
        return Math.floor(this.netGold / elapsedHrs);
    }

    get hrsToLevel() {
        return Math.floor((this.script.character.max_xp - this.script.character.xp) / this.expHr);
    }

    get metrics() {
        return { name: this.script.character.name, expHr: this.expHr, goldHr: this.goldHr, hrsToLevel: this.hrsToLevel };
    }
}
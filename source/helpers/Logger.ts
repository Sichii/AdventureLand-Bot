import chalk from "chalk";
import { Enum } from "../internal";

export enum LogLevel {
    Error = 1,
    Warn = Error | 1 << 1,
    Info = Warn | 1 << 2,
    Trace = Info | 1 << 3
}

export class Logger {
    static Level: LogLevel = LogLevel.Info;

    static Error(message: string) {
        if(Enum.hasFlag(this.Level, LogLevel.Info))
            console.error(chalk.redBright(message));
    }

    static Warn(message: string) {
        if (Enum.hasFlag(this.Level, LogLevel.Warn))
            console.warn(chalk.rgb(255, 165, 0)(message));
    }

    static Info(message: string) {
        if (Enum.hasFlag(this.Level, LogLevel.Info))
            console.info(chalk.whiteBright(message));
    }

    static Trace(message: string) {
        if (Enum.hasFlag(this.Level, LogLevel.Trace))
            console.trace(chalk.gray(message));
    }

    static Log(level: LogLevel, message: string) {
        switch(level) {
            case LogLevel.Error:
                console.error(message);
                break;
            case LogLevel.Warn:
                console.warn(message);
                break;
            case LogLevel.Info:
                console.info(message);
                break;
            case LogLevel.Trace:
                console.trace(message);
                break;
        }
    }
}
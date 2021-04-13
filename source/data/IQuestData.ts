import { IPosition, MapName, NPCName } from "../internal";

export interface IQuestData extends IPosition {
    in: MapName,
    id: NPCName
}
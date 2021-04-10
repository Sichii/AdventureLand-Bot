import { CharacterType, ItemName, List, MapName, MonsterName } from "../internal";

export interface PartyMemberSettings {
    class: CharacterType;
    elixir: ItemName;
    mainInterval: number;
    movementInterval: number;
    safeRangeCheckEnabled: boolean;
    assist?: string;
    kite?: boolean;
    attackMTypes?: List<MonsterName>;
}
import { CharacterType, ItemName, List, MapName, MonsterName } from "../internal";

export interface PartyMemberSettings {
    class: CharacterType;
    elixir: ItemName;
    assist?: string;
    kite?: boolean;
    attackMTypes?: List<MonsterName>;
    map?: MapName;
    mainInterval: number;
    movementInterval: number;
}